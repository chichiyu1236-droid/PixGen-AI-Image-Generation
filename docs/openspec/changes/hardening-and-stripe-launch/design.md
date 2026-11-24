# Design: hardening-and-stripe-launch

## 1. 核心架构与技术决策

### D1. Stripe Checkout 单次人民币付款（`mode: "payment"`）+ 双路径幂等履约

1. **为什么用 `mode: "payment"` 而非 `mode: "subscription"`**：
   - Stripe 官方限制 `alipay` 与 `wechat_pay` 在 `cny` 币种下原生支持 `mode: "payment"` 单次收款；同时现有 `0006_membership.sql` 的 `fulfill_order` 已经是「每笔订单发放首期额度 + 顺延 `paid_until` + 年卡剩余 11 期写入 `pending_tranches` 队列」的单次订单模型，两者天然契合，无需改动任何计费 RPC。
2. **不引入 `stripe` NPM 包，沿用原生 `fetch` + `node:crypto`**：
   - 仓库内 `lantu.ts`、`xunhupay.ts` 均采用原生 `fetch` + `node:crypto` 实现。Stripe 仅需两个 REST 端点（`POST /v1/checkout/sessions` 创建会话、`GET /v1/checkout/sessions/{id}` 查询会话）及标准的 `Stripe-Signature`（`t=<timestamp>,v1=<hmac_sha256>`）验签。使用内置模块避免并行工作区改动 `package.json` / `package-lock.json` 产生锁文件冲突，也便于 `vitest` 直接拦截 `fetch` 做确定性单测。
3. **微信支付参数与会话有效期硬边界**：
   - 当 `STRIPE_PAYMENT_METHODS` 包含 `wechat_pay` 时，创建 Checkout Session 请求体必须附带 `payment_method_options[wechat_pay][client]=web`，否则 Stripe API 直接返回 400。
   - Stripe Checkout Session 要求 `expires_at` 至少距当前时间 **30 分钟**（而现有默认 `ORDER_TTL_MINUTES=15`）。因此当 `provider.id === "stripe"` 时，`POST /api/checkout` 与 `stripeProvider.createPayment` 统一采用 `effectiveTtlMinutes = Math.max(env.ORDER_TTL_MINUTES, 30)` 计算订单 `expires_at` 与 Stripe `expires_at`，避免 15 分钟默认值触发 Stripe 400 报错；`mock` / `lantu` / `xunhupay` 保持原 `ORDER_TTL_MINUTES` 不变。
4. **会话单号存储与双保险对账防串单**：
   - 创建 Checkout Session 时写入 `client_reference_id = orderId`、`metadata[order_id] = orderId`，并将返回的 `session.id`（`cs_...`）立即存入 `orders.provider_trade_no`，`session.url` 存入 `orders.pay_url` 并作为 `redirectUrl` 返回前端。
   - **路径 ① 异步回调（`POST /api/webhooks/stripe`）**：独立新建静态路由 `app/api/webhooks/stripe/route.ts`（在 Next.js App Router 中静态段优先于动态段 `[provider]`，互不干扰），读取原始文本请求体 `await request.text()` 与 `stripe-signature` 头，用 `crypto.timingSafeEqual` 校验 HMAC-SHA256 签名并校验 `t` 时间戳在 `±300s` 窗口内（支持多 `v1=` 签名滚动轮换）。仅在事件为 `checkout.session.completed` 或 `checkout.session.async_payment_succeeded` 且 `session.payment_status === "paid"` 时处理：核对 `session.amount_total === order.amount_fen` 且 `session.currency?.toLowerCase() === "cny"`，金额或币种不符则置 `status = "flagged"` 并返回 200 停止重试；核对通过则调用幂等 `fulfill_order(order.id, session.id)`。签名无效返回 400，数据库临时错误返回 500 触发 Stripe 重试，其余无关合法事件返回 200 `{ received: true }`。
   - **路径 ② 跳回即查与轮询兜底（`GET /api/orders/[id]`）**：Stripe `success_url` 设为 `${NEXT_PUBLIC_SITE_URL}/pay/${orderId}?stripe_session_id={CHECKOUT_SESSION_ID}`，`cancel_url` 设为 `${NEXT_PUBLIC_SITE_URL}/pay/${orderId}?canceled=1`。当用户跳回 `/pay/[orderId]` 携带 `stripe_session_id` 时，`PayClient` 挂载即刻请求 `GET /api/orders/${orderId}?stripe_session_id=...`；服务端对携带 `stripe_session_id` 的 `pending` Stripe 订单跳过 30 秒等待阈值（仍受轻量防抖或单次查询保护），立即调用 `stripeProvider.queryOrder`。
   - **防串单安全校验**：`stripeProvider.queryOrder` 请求 `GET /v1/checkout/sessions/${sessionId}`（优先取入参 `stripeSessionId`，未传时回退读订单已存的 `providerTradeNo` 即 `cs_...`，从而同时支持管理员后台「查询平台」按钮与无参轮询），**必须同时满足** `(session.client_reference_id === input.orderId || session.metadata?.order_id === input.orderId)`、`session.payment_status === "paid"`、`session.amount_total === input.amountFen`、`session.currency?.toLowerCase() === "cny"` 才返回 `paid: true`，杜绝拿低价单或他人已付 `cs_...` 撞库冒领。

### D2. 国内邮箱登录主入口、6 位 OTP 与密码重置闭环

1. **安全跳回路径归一化（`lib/auth/redirect.ts`）**：
   - 抽离纯函数 `getSafeNextPath(next: string | null | undefined, fallback = "/generate"): string`：仅允许以单个 `/` 开头且不含 `//` 与 `\` 的站内相对路径，其余一律回退 `fallback`。
   - 落地页未登录点击普通 CTA 跳 `/login`，点击标准/Pro 会员价格卡跳 `/login?next=/upgrade`；登录成功后（无论密码登录、OTP 验证、邮箱注册确认还是 Google OAuth）统一落到安全归一化后的 `next`。
2. **`/login` 双模式交互结构**：
   - 主入口顶部为双模式切换：「验证码登录」（默认推荐，新老邮箱免密直达）⇄「密码登录」（含登录/注册切换与「忘记密码？」内联切换）。
   - **验证码模式**：调用 `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` } })` 发送验证码并启动 60 秒重发倒计时；用户输入 6 位数字后调用 `supabase.auth.verifyOtp({ email, token, type: "email" })`，成功后跳转 `next` 并 `router.refresh()`。
   - **忘记密码与重置闭环**：在密码模式点击「忘记密码？」输入邮箱，调用 `supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/auth/reset-password` })`；用户点击邮件链接经 `/auth/callback` 完成会话交换后落到新建的 `/auth/reset-password` 页，输入并二次确认不少于 6 位的新密码后调用 `supabase.auth.updateUser({ password })` 完成重置。
   - **Google 登录降级**：置于卡片底部分隔线（「或使用其他方式」）下方，改为浅色描边次级按钮，传入当前 `next`。
3. **`/auth/callback` 错误显式透传**：
   - 若 URL 携带 `?error=`（如用户取消 OAuth），或 `exchangeCodeForSession(code)` 返回 `error`，记录服务端错误日志并重定向至 `/login?error=auth_callback_failed&next=${encodeURIComponent(next)}`；同时兼容 `?token_hash=...&type=...` 邮件模板参数调用 `verifyOtp({ token_hash, type })`，失败跳 `/login?error=otp_expired&next=...`。`ensureUserProfile` 包裹 `try/catch` 仅打日志不中断已建立会话的重定向（后续业务页均会再次兜底调用 `ensureUserProfile`）。

### D3. 用户侧 `/billing` 账单明细页与合规静态页

1. **直读现有 RLS 表 + 前置惰性结算**：
   - `/billing`（`app/billing/page.tsx`）为服务端组件：未登录重定向 `/login?next=/billing`；登录后先执行 `ensureUserProfile` 与 `getCreditBalance(createSupabaseAdminClient(), user.id)` 触发 `evaluate_membership` 完成到期清零或周期发放，再用带用户 Cookie 的 `createSupabaseServerClient()` 并行读取 `memberships`、`orders`（最近 50 条）、`credit_events`（最近 100 条），由数据库已有 RLS 保证严格本人可见。
2. **收银台年卡分期文案与异常客服联系**：
   - `app/pay/[orderId]/page.tsx` 读取 `order.plan_snapshot`（回退查 `getMembershipPlan(order.pack_id)`）：当 `tranches > 1`（年卡 12 期）时，明确展示总期数、每 30 天发放额度与首期立即到账说明；当 `tranches === 1`（月卡）时保留 `100 积分` / `100 积分已到账` 核心字样以兼容既有文案与 E2E 断言。
   - `failed` / `flagged` 异常状态读取 `NEXT_PUBLIC_SUPPORT_EMAIL`，展示客服邮箱链接与当前订单号便于用户核对补发。
3. **法务合规页（`/terms` 与 `/privacy`）**：
   - 纯静态服务端页面，无需登录即可公开访问，明确写清产品性质、人民币会员卡单次付费不自动扣款、首期即发与 30 天分期不滚存规则、数字商品退款与争议处理流程、用户数据/图片/支付元数据收集边界及客服联系邮箱。

### D4. 4 项后端与管理端 P0 修复细则

1. **`lib/billing/env.ts` 布尔环境变量解析**：改用 `const envBoolean = z.preprocess((value) => value === "true" || value === true, z.boolean())`，确保 `ALLOW_MOCK_IN_PRODUCTION="false"` 解析为 `false`。
2. **函数超时与参考图真实 MIME 检测**：
   - `app/api/generate/route.ts` 导出 `export const maxDuration = 120;`（覆盖 90s 生图超时 + Storage 上传 + RPC）；`app/api/agent/sessions/[id]/messages/route.ts` 导出 `export const maxDuration = 300;`（覆盖多步 LLM 120s + 生图 90s；注：Vercel 部署保持默认开启 Fluid Compute 或 Pro 计划即可支持，若在关闭 Fluid Compute 的旧版 Hobby 计划部署需下调至 `60`）。
   - `lib/openai/images.ts` 在 `editImageBase64` 内对解码后的 `Buffer` 检测文件头魔数（`FF D8 FF` -> `image/jpeg` / `.jpg`，`89 50 4E 47` -> `image/png` / `.png`，`RIFF....WEBP` -> `image/webp` / `.webp`，其余回退 `image/png`），消除前端 `compressImageToBase64` 输出 JPEG 而后端硬编码声明 `image/png` 的不一致，同时保持 Agent 从 Storage 读取 PNG 编辑的路径正常。
3. **`0007_orders_profiles_fk.sql` 与 `/admin/orders` 错误提示**：
   - 先把 `orders` 中可能缺少 `profiles` 行的历史 `user_id` 从 `auth.users` 幂等补齐到 `public.profiles`，再添加 `orders_user_id_profiles_fkey` 外键指向 `public.profiles(id) on delete cascade`，同时将 `orders_channel_check` 扩展为 `('wechat', 'alipay', 'stripe')` 并发送 `NOTIFY pgrst, 'reload schema'`。
   - `app/admin/orders/page.tsx` 解构 `{ data: orders, error: queryError }`，查询报错时渲染明确的错误横幅（含错误信息提示），不再静默展示「暂无订单」。
   - **迁移号顺延声明**：本变更占用 `0007_orders_profiles_fk.sql`；尚未实施的 `docs/openspec/changes/add-video-workbench/` 后续落地时其数据库迁移须顺延命名为 `0008_video_workbench.sql`。
4. **Agent `RealBrain` 协议、轮内余额、孤儿清理与比例继承**：
   - `lib/agent/types.ts`、`brain.ts`、`loop.ts`：在回传 `role: "tool"` 消息前必须先压入带 `toolCalls` 列表的 `role: "assistant"` 消息；`RealBrain` 提取 `choice.message.tool_calls` 全部工具调用（不再只取 `[0]`），`loop.ts` 按返回顺序逐个串行执行（保证 `build_prompt -> generate_image` 先后依赖与余额顺序扣减），并为每个 `tool_call_id` 回填对应的 `role: "tool"` 结果。
   - `lib/agent/tools.ts`：`runGenerateImage` 与 `runEditImage` 在 `record_successful_generation` 成功后立即执行 `ctx.totalCredits = Math.max(0, ctx.totalCredits - 1)`；若 RPC 报错，先调用 `ctx.admin.storage.from(GENERATED_IMAGES_BUCKET).remove([uploaded.storagePath]).catch(() => undefined)` 清理孤儿图片，且当错误为 `insufficient_credits` 时置 `ctx.totalCredits = 0` 并返回 `retryable: false`；`runEditImage` 查询源图 `aspect_ratio` 列，合法比例继承对应的 `aspectRatios[key].size` 与 `p_aspect_ratio`（未知值回退 `"square"`）。

---

## 2. 跨工作区锁定的共享契约（环境变量、TS 类型、HTTP 与 SQL）

> **重要约束**：B1、B2、B3 三个工作区基于同一基线并行开发，以下环境变量名、TypeScript 字段名与路由参数一经锁定不得单方面改名。

### 2.1 新增与变更的环境变量契约

| 变量名 | 所属文件 | 类型 / 默认值 | 必填条件与说明 |
| --- | --- | --- | --- |
| `BILLING_PROVIDER` | `lib/billing/env.ts` | `"mock" \| "lantu" \| "xunhupay" \| "stripe"`（默认 `"mock"`） | 设为 `"stripe"` 时启用 Stripe Checkout 收款；生产环境设为 `"mock"` 且 `ALLOW_MOCK_IN_PRODUCTION !== true` 时抛错拒绝 |
| `ALLOW_MOCK_IN_PRODUCTION` | `lib/billing/env.ts` | `envBoolean`（默认 `false`） | 仅字面量 `"true"` 或 `true` 为真；`"false"`、`""`、未设置均为 `false` |
| `STRIPE_SECRET_KEY` | `lib/billing/env.ts` | `string`（默认 `""`） | 当 `BILLING_PROVIDER="stripe"` 时必填（如 `sk_live_...` / `sk_test_...`），缺失时抛 `stripe_provider_not_configured` |
| `STRIPE_WEBHOOK_SECRET` | `lib/billing/env.ts` | `string`（默认 `""`） | `/api/webhooks/stripe` 验签密钥（`whsec_...`），缺失时回调返回 503/400 拒绝 |
| `STRIPE_API_BASE` | `lib/billing/env.ts` | `string` URL（默认 `"https://api.stripe.com"`） | Stripe REST API 基址，测试或代理环境可覆盖 |
| `STRIPE_PAYMENT_METHODS` | `lib/billing/env.ts` | `string`（默认 `"card,alipay,wechat_pay"`） | 逗号分隔的支付方式白名单，仅允许 `card`、`alipay`、`wechat_pay` 子集 |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | `lib/billing/support.ts` | `string`（可选，未设时回退空） | 公开客服联系邮箱，供 `/pay/[orderId]`、`/billing`、`/terms`、`/privacy` 前后端读取展示 |

### 2.2 TypeScript 与 API 接口契约

#### （1）支付 Provider 接口（`lib/billing/providers/types.ts` — B1 修改）

```ts
export type PayChannel = "wechat" | "alipay" | "stripe";

export interface CreatePaymentResult {
  payUrl: string;
  /** 托管收银台外跳地址（Stripe Checkout 返回 session.url；扫码通道不返回） */
  redirectUrl?: string;
  providerTradeNo: string | null;
  raw: unknown;
}

export interface QueryOrderInput {
  orderId: string;
  amountFen: number;
  channel: PayChannel;
  providerTradeNo?: string | null;
  stripeSessionId?: string | null;
}
```

`lib/billing/provider.ts` 新增导出 `getBillingProviderById(providerId: string): BillingProvider | undefined`，供 `GET /api/orders/[id]` 按订单自身记录的 `order.provider` 精确选择对账实现。

#### （2）下单接口契约（`POST /api/checkout` — B1 修改，B3 调用）

- **请求体**：
  ```ts
  {
    planId?: string;
    packId?: string; // 仍返回 404 unknown_sku
    channel?: "wechat" | "alipay" | "stripe"; // 默认 "wechat"；当激活 provider 为 "stripe" 时落库归一化为 "stripe"
  }
  ```
- **成功响应（HTTP 200）**：
  ```ts
  {
    orderId: string;
    reused: boolean;
    /** 仅当 provider === "stripe" 时返回（含 2 分钟内命中复用订单时返回其 pay_url）；非 Stripe 通道省略该字段以保持旧测试完全兼容 */
    redirectUrl?: string;
  }
  ```

#### （3）订单查询与跳回对账契约（`GET /api/orders/[id]` — B1 修改，B3 调用）

- **请求 URL**：`GET /api/orders/[id]?stripe_session_id={可选}`
- **成功响应（HTTP 200）**：
  ```ts
  {
    order: {
      id: string;
      status: "pending" | "paid" | "expired" | "failed" | "flagged";
      credits: number;
      amountFen: number;
      channel: "wechat" | "alipay" | "stripe";
      provider: string;
      payUrl: string | null;
      expiresAt: string;
      createdAt: string;
    };
  }
  ```

#### （4）收银台视图契约（`components/pay-client.tsx` — B3 修改）

> **并行编译兼容要点**：B3 在独立工作区编译时 `types/database.ts` 尚未合入 B1 的 `"stripe"` 联合类型，因此 B3 将 `PayOrderView["channel"]` 定义为宽类型 `"wechat" | "alipay" | "stripe"`，将 `PricingPlans` 的 `billingProvider` 属性定义为 `string | undefined`，确保合入前后 `tsc --noEmit` 均零报错。

```ts
export type PlanSnapshotView = {
  planId: string;
  quotaPerTranche: number;
  tranches: number;
  periodDays: number;
};

export type PayOrderView = {
  id: string;
  status: "pending" | "paid" | "expired" | "failed" | "flagged";
  payUrl: string | null;
  channel: "wechat" | "alipay" | "stripe";
  provider: string;
  amountFen: number;
  credits: number;
  packId: string;
  kind: "pack" | "plan";
  planSnapshot: PlanSnapshotView | null;
  expiresAt: string;
  createdAt: string;
};
```

#### （5）登录跳回与错误码契约（B2 内部及跨页链接契约）

- 安全跳回函数：`getSafeNextPath(next: string | null | undefined, fallback = "/generate"): string`（位于 `lib/auth/redirect.ts`）。
- 站内跨页链接约定：
  - 落地页免费/通用入口：`/login`
  - 落地页付费会员卡入口：`/login?next=/upgrade`
  - `/billing` 未登录重定向：`/login?next=/billing`
  - 法务合规页固定路由：`/terms`、`/privacy`
  - 密码重置页固定路由：`/auth/reset-password`
  - `/login` 支持的错误查询参数：`error=auth_callback_failed | oauth_failed | otp_expired`

#### （6）Agent 工具调用消息契约（`lib/agent/types.ts` — B1 修改）

```ts
export type ToolCallSpec = {
  id: string;
  toolName: string;
  args: unknown;
};

export type BrainTurnMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCallSpec[] }
  | { role: "tool"; toolCallId?: string; toolName: string; result: ToolResult };

export type BrainTurnResponse =
  | { kind: "text"; text: string }
  | { kind: "tool_call"; id?: string; toolName: string; args: unknown }
  | { kind: "tool_calls"; content?: string; calls: ToolCallSpec[] };
```

### 2.3 数据库迁移 `supabase/migrations/0007_orders_profiles_fk.sql` 精确定义

```sql
-- 0007_orders_profiles_fk.sql
-- 1) Backfill any missing public.profiles rows for existing orders so adding
--    the FK never fails on historical data.
insert into public.profiles (id, email, credits)
select u.id, u.email, 5
from auth.users u
where exists (
  select 1 from public.orders o where o.user_id = u.id
)
on conflict (id) do nothing;

-- 2) Add explicit FK from public.orders(user_id) to public.profiles(id) so
--    PostgREST embedded selects `orders(..., profiles(email))` succeed on
--    /admin/orders and admin order action routes.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_user_id_profiles_fkey'
  ) then
    alter table public.orders
      add constraint orders_user_id_profiles_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

-- 3) Widen orders.channel check constraint to support Stripe Checkout orders
--    alongside legacy wechat/alipay aggregator channels.
alter table public.orders
  drop constraint if exists orders_channel_check;

alter table public.orders
  add constraint orders_channel_check
  check (channel in ('wechat', 'alipay', 'stripe'));

notify pgrst, 'reload schema';
```

> **迁移序号协调说明**：本迁移正式使用编号 `0007`（`supabase/migrations/0007_orders_profiles_fk.sql`）。仓库中未合入的视频工作台提案 `docs/openspec/changes/add-video-workbench/` 原计划的 `0007_video_workbench.sql` 在其后续实施时顺延为 `0008_video_workbench.sql`。

---

## 3. 并行工作区严格隔离矩阵（Allowed Files）

B1、B2、B3 三个工作区允许新建或修改的文件集合**两两交集严格为空（`B1 ∩ B2 = ∅`、`B1 ∩ B3 = ∅`、`B2 ∩ B3 = ∅`）**。任何工作区执行期间若发现需触碰本表以外的文件，必须停下上报总控，严禁越界修改。

### 全局禁改范围（B1 / B2 / B3 均禁止触碰）
- `package.json`、`package-lock.json`、`tsconfig.json`、`next.config.ts`、`tailwind.config.ts`、`eslint.config.mjs`、`vitest.config.ts`、`playwright.config.ts`
- 已归档或已有数据库迁移 `supabase/migrations/0001_initial.sql` 至 `0006_membership.sql`
- 其他未合入变更目录 `docs/openspec/changes/add-video-workbench/**` 与 `docs/openspec/changes/archive/**`
- `.env`、`.env.local`（严禁读取或修改真实密钥文件）

### B1 / B2 / B3 允许操作文件归属表

| 工作区 | 允许新建 / 修改的文件路径 | 动作 | 核心职责说明 |
| --- | --- | --- | --- |
| **B1**<br>Stripe 服务端与后端 P0 | `lib/billing/env.ts` | 修改 | 修复 `ALLOW_MOCK_IN_PRODUCTION` 为严格 `envBoolean`；扩展 `"stripe"` 枚举与 `STRIPE_*` 环境变量 |
| **B1** | `lib/billing/providers/types.ts` | 修改 | 扩展 `PayChannel`、`CreatePaymentResult.redirectUrl`、`QueryOrderInput` |
| **B1** | `lib/billing/providers/stripe.ts` | 新建 | Stripe Checkout 会话创建、会话查询防串单核验、`Stripe-Signature` HMAC-SHA256 验签 |
| **B1** | `lib/billing/provider.ts` | 修改 | 注册 `stripeProvider` 并导出 `getBillingProviderById` |
| **B1** | `app/api/checkout/route.ts` | 修改 | 支持 `"stripe"` 渠道、30 分钟最小 TTL、保存 `provider_trade_no`、返回 `redirectUrl`（含复用单） |
| **B1** | `app/api/orders/[id]/route.ts` | 修改 | 支持 `?stripe_session_id=` 跳回即时主动对账入账，响应补充 `provider` 字段 |
| **B1** | `app/api/webhooks/stripe/route.ts` | 新建 | Stripe 异步回调原始请求体验签、金额/币种核对与幂等 `fulfill_order` 发货 |
| **B1** | `app/api/admin/orders/[id]/query/route.ts` | 修改 | 向 `provider.queryOrder` 透传 `providerTradeNo: order.provider_trade_no` |
| **B1** | `app/admin/orders/page.tsx` | 修改 | 捕获并展示 PostgREST 查询错误横幅；`CHANNEL_LABEL` 补充 `stripe: "Stripe"` |
| **B1** | `supabase/migrations/0007_orders_profiles_fk.sql` | 新建 | 补齐缺失 profile、新增 `orders_user_id_profiles_fkey` 外键、扩展 `orders_channel_check` |
| **B1** | `types/database.ts` | 修改 | 同步 `orders.channel` 联合类型与 `orders_user_id_profiles_fkey` 关系声明 |
| **B1** | `app/api/generate/route.ts` | 修改 | 显式导出 `export const maxDuration = 120;` |
| **B1** | `app/api/agent/sessions/[id]/messages/route.ts` | 修改 | 显式导出 `export const maxDuration = 300;` |
| **B1** | `lib/openai/images.ts` | 修改 | `editImageBase64` 按解码字节魔数自动识别 `image/jpeg` / `image/png` / `image/webp` 与扩展名 |
| **B1** | `lib/agent/types.ts` | 修改 | 新增 `ToolCallSpec`，扩展 `BrainTurnMessage` 与 `BrainTurnResponse` 支持多工具调用与 `toolCallId` |
| **B1** | `lib/agent/brain.ts` | 修改 | `RealBrain` 补齐 `assistant.tool_calls` 标准消息并完整返回多 `tool_calls` |
| **B1** | `lib/agent/loop.ts` | 修改 | 压入 `assistant.toolCalls` 消息、按序串行执行多工具调用并回填匹配的 `toolCallId` |
| **B1** | `lib/agent/tools.ts` | 修改 | 成功后实时扣减 `ctx.totalCredits`、RPC 失败清理 Storage 孤儿图、`edit_image` 继承源图 `aspect_ratio` |
| **B1** | `tests/billing/env.test.ts`<br>`tests/billing/stripe-provider.test.ts`<br>`tests/api/stripe-webhook-route.test.ts`<br>`tests/api/orders-route.test.ts` | 新建 | B1 新增环境变量、Stripe provider、Stripe webhook 与订单对账单测 |
| **B1** | `tests/api/checkout-route.test.ts`<br>`tests/openai/images.test.ts`<br>`tests/agent/brain.test.ts`<br>`tests/agent/loop.test.ts`<br>`tests/agent/tools.test.ts` | 修改 | 补充 Stripe 下单跳转、JPEG/PNG MIME 识别与 Agent 4 项修复的回归单测 |
| **B2**<br>国内邮箱登录闭环 | `lib/auth/redirect.ts` | 新建 | `getSafeNextPath` 安全站内路径校验工具函数 |
| **B2** | `app/page.tsx` | 修改 | 根路径 `?code=` 转发 `/auth/callback` 时保留 `next` 参数 |
| **B2** | `components/landing-page.tsx` | 修改 | 全站 5 处未登录主 CTA 改为跳 `/login`（付费卡跳 `/login?next=/upgrade`）；页脚挂载 `/terms` 与 `/privacy` |
| **B2** | `app/login/page.tsx` | 修改 | 解析 `next` / `error` / `reset` 参数传给 `LoginForm`；更新双模式登录文案；底部挂载 `/terms` 与 `/privacy` |
| **B2** | `components/login-form.tsx` | 修改 | 重构为「6 位邮箱验证码免密登录/注册 ⇄ 邮箱密码登录/注册 + 忘记密码」主入口，Google 按钮沉底次选 |
| **B2** | `components/auth-button.tsx` | 修改 | 保持 `GoogleLoginButton` 支持 `next` 与次级按钮样式、异常兜底 |
| **B2** | `app/auth/callback/route.ts` | 修改 | 修复吞掉 `exchangeCodeForSession` 错误的问题，支持 `token_hash` 验证，失败带错误码跳回 `/login` |
| **B2** | `app/auth/reset-password/page.tsx` | 新建 | 邮件重置链接落地后的设置新密码与二次确认页面 |
| **B2** | `tests/auth/redirect.test.ts`<br>`tests/components/login-form.test.tsx` | 新建 | 站内跳转防开放重定向单测、双模式登录与重置表单组件测试 |
| **B2** | `tests/auth/callback-route.test.ts`<br>`e2e/smoke.spec.ts` | 修改 | 补齐回调失败重定向与 `token_hash` 单测；同步首页登录入口与无效 `code` 烟雾断言 |
| **B3**<br>账单页、收银文案与合规页 | `lib/billing/support.ts` | 新建 | 封装读取 `NEXT_PUBLIC_SUPPORT_EMAIL` 与客服联系文案辅助函数 |
| **B3** | `app/billing/page.tsx` | 新建 | 用户侧「账单与积分明细」页（双池与会员概览、历史订单、积分流水） |
| **B3** | `components/app-shell.tsx` | 修改 | 工作台导航挂载 `/billing`（「账单与明细」）入口（保持 `BrandMark` 导出签名不变） |
| **B3** | `app/upgrade/page.tsx` | 修改 | 向 `PricingPlans` 传递 `billingProvider` |
| **B3** | `components/pricing-plans.tsx` | 修改 | `billingProvider === "stripe"` 时展示 Stripe 支付方式说明并按 `redirectUrl` 外跳结账 |
| **B3** | `app/pay/[orderId]/page.tsx` | 修改 | 读取 `stripe_session_id` / `canceled` 与 `plan_snapshot` 传给 `PayClient`；挂载 `/terms` 与 `/privacy` |
| **B3** | `components/pay-client.tsx` | 修改 | 年卡 12 期分期文案修正、异常订单展示客服邮箱与单号、Stripe 即时回跳对账轮询与继续支付按钮 |
| **B3** | `app/terms/page.tsx` | 新建 | 静态公开「服务条款与退款规则」页 |
| **B3** | `app/privacy/page.tsx` | 新建 | 静态公开「隐私政策」页 |
| **B3** | `tests/components/pay-client.test.tsx`<br>`tests/components/pricing-plans.test.tsx`<br>`tests/pages/legal-and-billing.test.tsx` | 新建 | 收银台年卡文案/客服邮箱/Stripe 回跳测试、升级页外跳测试、法务与账单页渲染测试 |
| **B4**<br>合并联调与验收 | `README.md`<br>`e2e/billing.spec.ts`（或新增 `e2e/compliance-and-billing.spec.ts`） | 修改 / 新建 | 合并 B1+B2+B3 后更新部署文档、补充跨模块端到端验证并执行唯一一次全量门禁 |

---

## 4. 派发执行快规则（B1 / B2 / B3 执行器共同遵守）

1. **修缺陷先复现**：涉及 P0 缺陷或回调吞错的任务，先在对应测试文件写出复现旧缺陷的断言并运行单文件 `npx vitest run <该测试文件>` 确认失败，再改业务代码至同用例转绿。
2. **严控测试频率**：编码途中仅允许运行 `npm run typecheck` 或单文件 `npx vitest run <单个文件>`；**严禁**中途运行全量 `npm test`、`npm run build` 或 `npm run e2e`。
3. **收尾局部快测**：本工作区全部代码与测试写完后，按 `tasks.md` 指定的本工作区局部快测命令跑一次（失败修复重跑最多 3 轮），不得删除、跳过或放宽既有断言。
4. **严守文件边界**：不得读取 `.env` / `.env.local`，不得触碰上表「允许新建 / 修改的文件路径」以外的任何文件；不要自行 `git push`。
