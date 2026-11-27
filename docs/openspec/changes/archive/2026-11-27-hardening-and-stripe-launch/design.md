# Design: hardening-and-stripe-launch

## 1. 核心架构与技术决策

### D1. Stripe Checkout 单次人民币付款（`mode: "payment"`）+ 双路径幂等履约

1. **为什么用 `mode: "payment"` 而非 `mode: "subscription"`**：
   - Stripe 官方限制 `alipay` 与 `wechat_pay` 在 `cny` 币种下原生支持 `mode: "payment"` 单次收款；同时现有 `0006_membership.sql` 的 `fulfill_order` 已经是「每笔订单发放首期额度 + 顺延 `paid_until` + 年卡剩余 11 期写入 `pending_tranches` 队列」的单次订单模型，两者天然契合，无需改动任何计费 RPC。
2. **不引入 `stripe` NPM 包，沿用原生 `fetch` + `node:crypto`**：
   - 仓库内 `lantu.ts`、`xunhupay.ts` 均采用原生 `fetch` + `node:crypto` 实现。Stripe 仅需两个 REST 端点（`POST /v1/checkout/sessions` 创建会话、`GET /v1/checkout/sessions/{id}` 查询会话）及标准的 `Stripe-Signature`（`t=<timestamp>,v1=<hmac_sha256>`）验签。使用内置模块避免并行工作区改动 `package.json` / `package-lock.json` 产生锁文件冲突，也便于 `vitest` 直接拦截 `fetch` 做确定性单测。
3. **表单编码参数、微信支付硬约束与会话有效期时钟余量**：
   - `POST /v1/checkout/sessions` 使用 `application/x-www-form-urlencoded` 编码，并附带 `Authorization: Bearer ${STRIPE_SECRET_KEY}` 与 `Idempotency-Key: checkout_${orderId}`：
     - `mode=payment`、`locale=zh`
     - `client_reference_id=${orderId}`、`metadata[order_id]=${orderId}`
     - `line_items[0][price_data][currency]=cny`、`line_items[0][price_data][unit_amount]=${amountFen}`、`line_items[0][price_data][product_data][name]=${body}`、`line_items[0][quantity]=1`
     - `payment_method_types[0]=...`、`payment_method_types[1]=...`（按 `STRIPE_PAYMENT_METHODS` 清洗去重后的非空子集编码，仅允许 `card` / `alipay` / `wechat_pay`，含非法项或为空时抛出 `stripe_invalid_payment_methods`）
     - 当列表包含 `wechat_pay` 时**必须**附带 `payment_method_options[wechat_pay][client]=web`，否则 Stripe API 直接返回 400。
   - **会话有效期安全余量**：Stripe Checkout Session 要求 `expires_at` 距 Stripe 服务端 `created` 时间严格在 **30 分钟（1800s）至 24 小时** 之间；若按 30 分钟整计算，任意 ≥1 秒的网络抖动或服务器时钟偏差都会触发 Stripe 400。因此当 `provider.id === "stripe"` 时，`POST /api/checkout` 与 `stripeProvider.createPayment` 统一采用 `effectiveTtlMinutes = Math.max(env.ORDER_TTL_MINUTES, 31)`（保留 60 秒时钟余量，且因 `ORDER_TTL_MINUTES <= 120` 远低于 24 小时上限）计算订单 `expires_at` 与 Stripe `expires_at`；`mock` / `lantu` / `xunhupay` 保持原 `ORDER_TTL_MINUTES` 不变。
4. **下单归一化、会话单号存储与双保险对账防串单**：
   - **下单校验与复用顺序（`POST /api/checkout`）**：须在 2 分钟复用查询**之前**调用 `getBillingProvider()` 解析当前激活 provider 并确定 `effectiveChannel`：
     - 当 `provider.id === "stripe"` 时，请求体 `channel` 允许省略或为 `"wechat" | "alipay" | "stripe"`，落库与复用查询统一归一化为 `effectiveChannel = "stripe"`；
     - 当 `provider.id !== "stripe"` 时，若客户端传入 `channel === "stripe"` 返回 `400 { error: "invalid_request" }`（防止 `lantuProvider` 将 `"stripe"` 误路由至支付宝），省略时默认 `"wechat"`。
     - 复用查询同时按 `.eq("provider", provider.id)` 与 `.eq("channel", effectiveChannel)` 过滤，并 `select("id, pay_url, provider")`；命中复用且 `provider === "stripe"` 且 `pay_url` 非空时一并返回 `redirectUrl: reusable.pay_url`。
     - 新建 Stripe 订单调用 `createPayment` 成功后，仅在 `payment.providerTradeNo` 非空时一并回写 `provider_trade_no: payment.providerTradeNo`（`mock` / `lantu` 返回 `null` 时更新对象保持 `{ pay_url }`，确保既有 `tests/api/checkout-route.test.ts` 断言兼容）。
   - **路径 ① 异步回调（`POST /api/webhooks/stripe`）**：
     - 独立新建静态路由 `app/api/webhooks/stripe/route.ts`（Next.js App Router 中静态段优先于 `[provider]`，互不干扰；同时 `stripeProvider.verifyCallback` 满足 `BillingProvider` 接口并返回 `{ valid: false, reason: "bad_signature" }`）。
     - 若未配置 `STRIPE_WEBHOOK_SECRET`，立即返回 `503 { error: "stripe_webhook_not_configured" }`（5xx 便于配置补齐后由 Stripe 自动重试，禁止静默返回 200）。
     - 必须先用 `await request.text()` 读取原始请求体与 `stripe-signature` 头（严禁先 `request.json()`）：解析 `t`（纯数字 Unix 秒）与全部 `v1`（支持密钥滚动轮换多签名），校验 `Math.abs(nowSec - t) <= 300`，对 `${t}.${rawBody}` 计算 HMAC-SHA256 hex，先校验候选项为 64 位十六进制且 `Buffer` 字节长度一致后再调用 `crypto.timingSafeEqual`（避免长度不等抛 `RangeError`）。签名为空、格式非法、过期或校验失败一律返回 `400 { error: "invalid_signature" }`。
     - 仅在事件类型为 `checkout.session.completed` 或 `checkout.session.async_payment_succeeded` 且 `session.payment_status === "paid"` 时进入履约，其余合法事件直接返回 `200 { received: true }`。
     - 按 `orderId = session.metadata?.order_id || session.client_reference_id` 提取并校验 UUID；未找到订单或 `order.provider !== "stripe"` 时记告警日志并返回 `200 { received: true }`（避免同账号无关会话引发 Stripe 无限重试）。
     - 若 `order.status === "paid"`，记录 `raw_notify` / `notified_at` 并幂等返回 `200 { received: true }`。
     - 严格核对 `session.amount_total === order.amount_fen` 且 `session.currency?.toLowerCase() === "cny"`；任一不符则将非已付订单置为 `status = "flagged"`、写入 `raw_notify` / `notified_at` 并返回 `200 { received: true, flagged: true }` 停止重试。
     - 核对通过调用幂等 `fulfill_order(order.id, session.id ?? "")`：若报错含 `order_not_fulfillable`（如订单已 `failed` / `flagged`），记录错误与 `raw_notify` 并返回 `200` 避免无意义重试；其他瞬时数据库错误返回 `500` 触发 Stripe 重试；成功则写入 `raw_notify` / `notified_at` 并返回 `200 { received: true }`。
   - **路径 ② 跳回即查与轮询兜底（`GET /api/orders/[id]`）**：
     - Stripe `success_url` 设为 `${siteUrl}/pay/${orderId}?stripe_session_id={CHECKOUT_SESSION_ID}`，`cancel_url` 设为 `${siteUrl}/pay/${orderId}?canceled=1`。
     - `GET /api/orders/[id]` 通过用户态 RLS 查询确保仅归属当前用户的订单可查（他人订单返回 `404`）。
     - **防路径穿越与防串单硬边界**：
       1. 读取查询参数 `stripe_session_id` 时，必须先用 `/^cs_[A-Za-z0-9_]+$/` 校验格式（不合法则直接忽略，禁止把未经校验的用户参数拼进 Stripe URL）；
       2. 若订单已保存 `current.provider_trade_no` 且传入的 `stripe_session_id` 与之不一致，则忽略不可信的 `stripe_session_id`，只信任订单已绑定的 `current.provider_trade_no`（且不跳过 30 秒阈值）；
       3. `stripeProvider.queryOrder` 内部同样对 `sessionId` 校验 `/^cs_[A-Za-z0-9_]+$/` 并使用 `encodeURIComponent(sessionId)` 请求 `GET /v1/checkout/sessions/${encodeURIComponent(sessionId)}`；仅当**同时满足** `session.metadata?.order_id === input.orderId`、`session.client_reference_id === input.orderId`、`session.payment_status === "paid"`、`session.amount_total === input.amountFen`、`session.currency?.toLowerCase() === "cny"` 时才返回 `paid: true`，杜绝低价单或他人 `cs_...` 撞库冒领；
       4. 仅当 `current.provider === "stripe"` 且带有效匹配的 `stripe_session_id` 时，跳过 `30s` 的 `RECONCILE_AFTER_MS` 等待阈值，但仍执行轻量节流（首次 `last_checked_at === null` 立即查，后续距上次查询需 `>= 3s`）防止客户端高频刷接口击穿 Stripe 限流；
       5. **临近过期支付回跳兜底**：若用户在有效期最后几秒付款、跳回时订单刚被惰性翻转为 `expired`，只要 `current.provider === "stripe"` 且携带有效匹配的 `stripe_session_id` 且 `(current.status === "pending" || current.status === "expired")`，仍执行一次主动对账；因 `fulfill_order` 支持 `pending | expired -> paid`，可确保「钱到必发货」。
     - `getBillingProviderById(providerId)` 按 `order.provider` 精确查找 provider，当 `providerId === "mock"` 且 `NODE_ENV === "production" && !env.ALLOW_MOCK_IN_PRODUCTION` 时同样拒绝并返回错误/抛错，不绕过生产 Mock 守卫。

### D2. 国内邮箱登录主入口、6 位 OTP 与密码重置闭环

1. **安全跳回路径归一化（`lib/auth/redirect.ts`）**：
   - 抽离纯函数 `getSafeNextPath(next: string | null | undefined, fallback = "/generate"): string`：
     - 仅允许非空字符串、以单个 `/` 开头且不以 `//` 开头、不含 `//` / `\` / 控制字符（`[\u0000-\u001f\u007f]`）；
     - 经 `new URL(candidate, "https://pixgen.local")` 解析后 `origin` 必须仍等于 `"https://pixgen.local"`；
     - 拦截跳回循环路径（`/auth/callback` 及 `/login` 自身），其余一律回退 `fallback`（允许带查询参数的合法站内路径如 `/upgrade`、`/generate?mode=agent`、`/auth/reset-password`、`/pay/<uuid>?stripe_session_id=cs_...`）。
   - 落地页未登录点击导航栏、首屏、底部 CTA、免费价格卡统一跳 `/login`，点击标准/Pro 两张付费价格卡跳 `/login?next=/upgrade`；登录成功后（密码、OTP、注册直登、Google OAuth）统一落到安全归一化后的 `next`。
2. **`/login` 双模式交互结构与 Supabase `@supabase/supabase-js@2.106.2` 兼容细节**：
   - 主入口顶部为双模式切换：「验证码登录」（默认推荐，新老邮箱免密直达）⇄「密码登录」（含登录/注册切换与「忘记密码？」内联切换）。
   - **6 位验证码模式**：
     - 发送验证码调用 `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}` } })` 并启动 60 秒重发倒计时。
     - 核验 6 位数字调用 `supabase.auth.verifyOtp({ email, token, type: "email" })`。在仓内锁定的 `@supabase/supabase-js@2.106.2`（`@supabase/auth-js@2.106.2`）中，`type: "email"` 对 `signInWithOtp({ shouldCreateUser: true })` 创建的新用户与存量用户统一有效；成功后跳转 `safeNext` 并 `router.refresh()`（新用户由 `0001_initial.sql` 触发器 `on_auth_user_created` 自动创建 `profiles` + 5 积分，各业务页亦兜底调用 `ensureUserProfile`）。
     - **Supabase 邮件模板硬依赖（上线必配）**：当 `signInWithOtp({ shouldCreateUser: true })` 面向**存量用户**时 Supabase 发送 **Magic Link** 模板，面向**首次注册新用户**时发送 **Confirm signup** 模板；因此上线前必须在 Supabase Dashboard 同时将 **Magic Link** 与 **Confirm signup** 两套模板均加入 `{{ .Token }}`，否则新用户收不到 6 位验证码。
   - **忘记密码与重置闭环**：
     - 在密码模式点击「忘记密码？」输入邮箱，调用 `supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/auth/reset-password` })`。
     - 新建 `/auth/reset-password`（`app/auth/reset-password/page.tsx`）：加载时先校验当前是否存在有效恢复会话（`supabase.auth.getUser()`），若无有效会话则展示「重置链接已失效或已过期」提示与返回 `/login` 按钮，禁止盲提表单；会话有效时输入并二次确认不少于 6 位的新密码，调用 `supabase.auth.updateUser({ password })`，成功后调用 `supabase.auth.signOut()` 清理恢复态并跳转 `/login?reset=success` 展示绿色成功提示。
   - **Google 登录降级**：置于卡片底部分隔线（「或使用其他方式」）下方，改为浅色描边次级按钮，传入当前 `next`；`GoogleLoginButton` 补充 `loading` 状态与 `signInWithOAuth` 失败/网络异常反馈（国内无代理用户点击时不静默无响应）。
3. **`/auth/callback` 错误显式透传与 `token_hash` 恢复兼容**：
   - `app/page.tsx`：当 Supabase 回退到站点根路径并携带 `?code=` 或 `?token_hash=&type=` 时，一并透传 `next` 转发至 `/auth/callback`。
   - `app/auth/callback/route.ts`：
     - 若 URL 携带 `?error=`，记录日志并 307 重定向 `/login?error=auth_callback_failed&next=${encodeURIComponent(safeNext)}`；
     - 若携带 `?code=`，调用 `exchangeCodeForSession(code)`，若返回 `error` 则记日志并重定向 `/login?error=auth_callback_failed&next=${encodeURIComponent(safeNext)}`；
     - 若携带 `?token_hash=` 与 `?type=`，先校验 `type` 属于 `EmailOtpType` 白名单（`"email" | "recovery" | "signup" | "magiclink" | "invite" | "email_change"`），调用 `verifyOtp({ token_hash, type })`，不合法或失败重定向 `/login?error=otp_expired&next=${encodeURIComponent(safeNext)}`；若 `type === "recovery"` 且 URL 未显式传 `next`，默认跳转路径自动取 `"/auth/reset-password"`（兼容跨设备/手机邮件客户端使用 `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery` 模板，规避 PKCE `code_verifier` 跨浏览器丢失）；
     - 若既无 `error`、亦无 `code` 或 `token_hash`，保持重定向到 `getSafeNextPath(url.searchParams.get("next"))`（兼容既有单测 `tests/auth/callback-route.test.ts`）；
     - `ensureUserProfile` 包裹 `try/catch` 仅打日志不中断已建立会话的重定向。

### D3. 用户侧 `/billing` 账单明细页与合规静态页

1. **直读现有 RLS 表 + 前置惰性结算**：
   - `/billing`（`app/billing/page.tsx`）为服务端组件：未登录重定向 `/login?next=/billing`；登录后先执行 `ensureUserProfile` 与 `getCreditBalance(createSupabaseAdminClient(), user.id)` 触发 `evaluate_membership` 完成到期清零或周期发放，再用带用户 Cookie 的 `createSupabaseServerClient()` 并行读取 `memberships`、`orders`（最近 50 条）、`credit_events`（最近 100 条），由数据库已有 RLS 保证严格本人可见。
   - 待支付订单若 `new Date(order.expires_at).getTime() > Date.now()` 展示「继续支付」链向 `/pay/${order.id}`；若已超过 `expires_at` 则按惰性过期语义直接展示「已过期」不再提供失效入口。
2. **收银台年卡分期文案、Stripe 交互与异常客服联系**：
   - `app/pay/[orderId]/page.tsx` 读取 Next.js 15 异步 `searchParams`（`stripe_session_id`、`canceled`）与 `order.plan_snapshot`（回退查 `getMembershipPlan(order.pack_id)`）传给 `PayClient`；未登录时重定向至 `/login?next=...`（保留 `/pay/${orderId}` 及可选 `stripe_session_id`）。
   - `PayClient`：
     - 年卡（`tranches > 1`）明确展示「共 12 期、每 30 天发放 X 积分、首期立即到账」；月卡（`tranches === 1`）保留 `100 积分` / `100 积分已到账`、`CHECKOUT`、`订单有效期剩余` 核心字样以完全兼容既有 `e2e/billing.spec.ts` 断言。
     - Stripe 订单（`order.provider === "stripe" || order.channel === "stripe"`）**不生成二维码**（跳过 `QRCode.toDataURL`），待支付态渲染「前往 Stripe 收银台完成支付」外跳按钮（仅在 `order.payUrl` 以 `https://` 或 `http://` 开头时可用）；若带 `canceled=1` 显示取消提示；若带 `stripeSessionId` 挂载即刻请求一次 `GET /api/orders/${order.id}?stripe_session_id=${encodeURIComponent(stripeSessionId)}`（即使初始为 `pending` 或刚过期 `expired` 也触发，并在返回状态变化时立即更新 UI）。
     - `repurchase()` 重新下单时若 `/api/checkout` 返回 `redirectUrl`，调用 `window.location.assign(body.redirectUrl)` 外跳，否则沿用 `router.push(/pay/${body.orderId})`。
     - `failed` / `flagged` 异常状态读取 `NEXT_PUBLIC_SUPPORT_EMAIL`，展示客服邮箱链接与当前订单号便于用户核对补发。
3. **法务合规页（`/terms` 与 `/privacy`）**：
   - 纯静态服务端页面，无需登录即可公开访问，明确写清产品性质、人民币会员卡单次付费不自动扣款、首期即发与 30 天分期不滚存规则、数字商品退款与争议处理流程、用户数据/图片/支付元数据收集边界及客服联系邮箱。

### D4. 4 项后端与管理端 P0 修复细则

1. **`lib/billing/env.ts` 布尔环境变量解析**：改用 `const envBoolean = z.preprocess((value) => value === "true" || value === true, z.boolean())`（与 `lib/env.ts`、`lib/agent/env.ts` 一致），确保 `ALLOW_MOCK_IN_PRODUCTION="false"` 解析为 `false`。
2. **函数超时与参考图真实 MIME 检测（严格兼容 `d64310b`）**：
   - `app/api/generate/route.ts` 导出 `export const maxDuration = 180;`（覆盖 `IMAGE_REQUEST_TIMEOUT_MS = 90s` + `d64310b` 引入的托管图下载 `IMAGE_DOWNLOAD_TIMEOUT_MS = 60s` + Storage 上传与 RPC 余量）；`app/api/agent/sessions/[id]/messages/route.ts` 导出 `export const maxDuration = 300;`（覆盖多步 LLM 120s + 生图/下载）。注：Vercel 开启默认 Fluid Compute 或 Pro 计划均支持；若部署在关闭 Fluid Compute 的旧版 Hobby 计划需下调至 `60`。
   - `lib/openai/images.ts` **仅修改 `editImageBase64` 的输入参考图 `toFile` 构造部分**：对解码后的 `Buffer` 检测文件头魔数（`FF D8 FF` -> `image/jpeg` / `.jpg`，`89 50 4E 47` -> `image/png` / `.png`，`RIFF....WEBP` -> `image/webp` / `.webp`，其余回退 `image/png` / `.png`），消除前端 `compressImageToBase64` 产出 JPEG 与后端硬编码 `image/png` 的不一致。
   - **强制保护基线 `d64310b`（禁止回退）**：严禁改动、简化或削弱 `lib/openai/images.ts` 中的 `safeLookup`（DNS 校验并钉扎公网 IP）、`assertSafeImageUrlSyntax`、`requestHttpsOnce`（`node:https` + `agent: false` + `lookup: safeLookup`）、`downloadImageAsBase64`（`MAX_IMAGE_DOWNLOAD_BYTES = 25MiB`、`MAX_IMAGE_DOWNLOAD_REDIRECTS = 3`、`IMAGE_DOWNLOAD_TIMEOUT_MS = 60_000`）、`output_format: "png"`，以及 `tests/openai/images.test.ts` 中全部既有 SSRF / DNS Rebinding / 字节上限 / 超时单测。
3. **`0007_orders_profiles_fk.sql` 与 `/admin/orders` 错误提示**：
   - 因 `0003_billing.sql` 已保证 `orders.user_id` 外键引用 `auth.users(id)`，迁移先从 `auth.users` 幂等补齐 `orders` 中可能缺少 `public.profiles` 行的用户（`0001_initial.sql` 与 `0006_membership.sql` 已为其余列提供默认值），再以 `conrelid = 'public.orders'::regclass` 作用域幂等添加 `orders_user_id_profiles_fkey` 外键指向 `public.profiles(id) on delete cascade`，同时将 `orders_channel_check` 扩展为 `('wechat', 'alipay', 'stripe')` 并发送 `NOTIFY pgrst, 'reload schema'`。
   - `app/admin/orders/page.tsx` 解构 `{ data: orders, error: queryError }`，查询报错时渲染明确的错误横幅（含错误信息提示），不再静默展示「暂无订单」，并在 `CHANNEL_LABEL` 补充 `stripe: "Stripe"`。
   - **迁移号顺延声明**：本变更占用 `0007_orders_profiles_fk.sql`（当前仓内已有 `0001`–`0006`，无冲突）；尚未实施的 `docs/openspec/changes/add-video-workbench/` 后续落地时其数据库迁移须顺延命名为 `0008_video_workbench.sql`。
4. **Agent `RealBrain` 协议、轮内余额、孤儿清理与比例继承**：
   - `lib/agent/types.ts`、`brain.ts`、`loop.ts`：
     - `RealBrain` 只要 `choice?.message?.tool_calls` 含非空函数调用即提取全部 `tool_calls`（不再只取 `[0]`，且不因 OpenAI 兼容中继返回 `finish_reason: "stop"` 而丢弃 `tool_calls`）；发送给上游时，将带 `toolCalls` 的 `assistant` 消息正确序列化为 OpenAI `tool_calls` 数组，并将每条 `role: "tool"` 消息映射到对应的 `tool_call_id: message.toolCallId ?? \`call_${message.toolName}\``。
     - `loop.ts` 对每轮工具调用（兼容单调用 `tool_call` 与多调用 `tool_calls`）先压入一条含全部 `toolCalls` 的 `role: "assistant"` 消息，再按序串行执行每个调用，并保证为每一个 `tool_call_id` 均压入对应的 `role: "tool"` 结果（不提前 `break` 破坏 OpenAI 工具消息配对协议；同时 `messages.at(-1)` 仍为 `role: "tool"`，保持既有 `MockBrain` 与 `tests/agent/loop.test.ts` 兼容）。
   - `lib/agent/tools.ts`：
     - `runGenerateImage` 与 `runEditImage` 在 `record_successful_generation` 成功后立即执行 `ctx.totalCredits = Math.max(0, ctx.totalCredits - 1)`，防止单轮多工具调用超额调起上游生图；
     - 若 `record_successful_generation` 返回错误，立即调用 `ctx.admin.storage.from(GENERATED_IMAGES_BUCKET).remove([uploaded.storagePath]).catch(() => undefined)` 清理孤儿图片（同步在 `tests/agent/tools.test.ts` 的 `fakeAdmin.storage` 中补充 `remove` mock）；若错误为 `insufficient_credits`，置 `ctx.totalCredits = 0` 并返回 `retryable: false`；
     - `runEditImage` 在查询源图时补充 `aspect_ratio` 列（`.select("id, user_id, storage_path, final_prompt, aspect_ratio")`），若其为 `aspectRatios` 合法键则向 `editImageBase64` 传入对应 `size` 并在 RPC 写入相同 `p_aspect_ratio`，缺失或未知值回退 `"square"`。

---

## 2. 跨工作区锁定的共享契约（环境变量、TS 类型、HTTP 与 SQL）

> **重要约束**：B1、B2、B3 三个工作区基于同一基线并行开发，以下环境变量名、TypeScript 字段名、并行编译兼容写法与路由参数一经锁定不得单方面改名。

### 2.1 新增与变更的环境变量契约

| 变量名 | 所属文件 | 类型 / 默认值 | 必填条件与说明 |
| --- | --- | --- | --- |
| `BILLING_PROVIDER` | `lib/billing/env.ts` | `"mock" \| "lantu" \| "xunhupay" \| "stripe"`（默认 `"mock"`） | 设为 `"stripe"` 时启用 Stripe Checkout 收款；生产环境设为 `"mock"` 且 `ALLOW_MOCK_IN_PRODUCTION !== true` 时抛错拒绝 |
| `ALLOW_MOCK_IN_PRODUCTION` | `lib/billing/env.ts` | `envBoolean`（默认 `false`） | 仅字面量 `"true"` 或 `true` 为真；`"false"`、`""`、未设置均为 `false` |
| `STRIPE_SECRET_KEY` | `lib/billing/env.ts` | `string`（默认 `""`） | 当 `BILLING_PROVIDER="stripe"` 时必填（如 `sk_live_...` / `sk_test_...`），缺失时抛 `stripe_provider_not_configured` |
| `STRIPE_WEBHOOK_SECRET` | `lib/billing/env.ts` | `string`（默认 `""`） | `/api/webhooks/stripe` 验签密钥（`whsec_...`），缺失时回调返回 `503` 拒绝 |
| `STRIPE_API_BASE` | `lib/billing/env.ts` | `string` URL（默认 `"https://api.stripe.com"`） | Stripe REST API 基址，测试或代理环境可覆盖 |
| `STRIPE_PAYMENT_METHODS` | `lib/billing/env.ts` | `string`（默认 `"card,alipay,wechat_pay"`） | 逗号分隔的支付方式白名单，清洗去重后非空且仅允许 `card`、`alipay`、`wechat_pay` 子集 |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | `lib/billing/support.ts` | `string`（可选，未设时回退空） | 公开客服联系邮箱，供 `/pay/[orderId]`、`/billing`、`/terms`、`/privacy` 前后端读取展示 |

> 按 `AGENTS.md` 规范，上述环境变量的安全占位统一由 **B4** 在合入后同步登记至 `.env.example`（并移除未使用的 `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` 占位），避免 B1/B3 并行冲突。

### 2.2 并行工作区独立 `tsc --noEmit` 零冲突兼容约定（必读）

B1、B2、B3 同时从本分支切出独立工作区开发，互不可见对方代码改动。经核查现有源码存在 **3 处跨工作区类型耦合点**，以下兼容写法已验证可使 B1、B2、B3 在未合入彼此前各自独立通过 `npm run typecheck`：

1. **`types/database.ts` `orders.Row.channel` 延后至 B4 放宽（解除 B1 对 B3 `app/pay/[orderId]/page.tsx` 的编译阻塞）**：
   - 基线 `app/pay/[orderId]/page.tsx:60`（归 B3）将 `orders.Row["channel"]` 直接传入 `components/pay-client.tsx`（归 B3，基线类型为 `"wechat" | "alipay"`）。若 B1 提前把 `orders.Row.channel` 放宽为含 `"stripe"`，B1 独立跑 `tsc --noEmit` 会在未改动的 `app/pay/[orderId]/page.tsx:60` 报 `TS2322`。
   - **锁定做法**：
     - **B1** 在 `types/database.ts` 中将 `orders.Insert.channel`、`orders.Update.channel` 放宽为 `"wechat" | "alipay" | "stripe"`，并将 `orders.Relationships[0].foreignKeyName` 更新为 `"orders_user_id_profiles_fkey"`，**`orders.Row.channel` 暂保持 `"wechat" | "alipay"`**；在 `app/api/checkout/route.ts` 的 `.eq("channel", ...)` 处使用 `effectiveChannel as Database["public"]["Tables"]["orders"]["Row"]["channel"]` 并标注释 `// TODO(B4): remove cast after widening orders.Row.channel`。
     - **B4** 在依次合入 B1 + B2 + B3（此时 B3 已将 `PayOrderView["channel"]` 放宽至含 `"stripe"`）后，将 `types/database.ts` 的 `orders.Row.channel` 同步放宽为 `"wechat" | "alipay" | "stripe"`，并移除 `app/api/checkout/route.ts` 中的临时类型断言。
2. **B3 `app/upgrade/page.tsx` 读取 `billingProvider` 不窄化依赖未合入的 `lib/billing/env.ts`**：
   - 基线 `lib/billing/env.ts` 的 `BILLING_PROVIDER` 枚举不含 `"stripe"`；若 B3 在 `app/upgrade/page.tsx` 中直接拿 `getBillingEnv().BILLING_PROVIDER` 与 `"stripe"` 比较会触发 `TS2367`，且在测试传 `BILLING_PROVIDER=stripe` 时会提前 Zod 抛错。
   - **锁定做法**：`app/upgrade/page.tsx` 直接读取 `const billingProvider = process.env.BILLING_PROVIDER?.trim() || "mock";`（动态服务端组件，类型为 `string`）传给 `PricingPlans`，`PricingPlans` 的 `billingProvider` 属性定义为 `string | undefined`。
3. **B3 `app/billing/page.tsx` 与 `components/pay-client.tsx` 处理 `order.channel` 使用宽类型映射**：
   - B3 独立编译时 Supabase 查询返回的 `order.channel` 仍为 `"wechat" | "alipay"`，若直接写 `order.channel === "stripe"` 或 `Record<OrderRow["channel"], string>` 含 `stripe` 键会触发 `TS2367` / `TS2353`。
   - **锁定做法**：`app/billing/page.tsx` 使用 `const CHANNEL_LABEL: Record<string, string> = { wechat: "微信支付", alipay: "支付宝", stripe: "Stripe 在线支付" }` 且通过 `const channel: string = order.channel` 读取；`PayOrderView["channel"]` 定义为 `"wechat" | "alipay" | "stripe"`，合入前后 `tsc --noEmit` 均零报错。

### 2.3 TypeScript 与 API 接口契约

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

`lib/billing/provider.ts` 新增导出 `getBillingProviderById(providerId: string): BillingProvider | undefined`，供 `GET /api/orders/[id]` 按订单自身记录的 `order.provider` 精确选择对账实现（当 `providerId === "mock"` 且处于生产环境未放行时同样抛出 `mock_billing_provider_forbidden_in_production`）。

#### （2）下单接口契约（`POST /api/checkout` — B1 修改，B3 调用）

- **请求体**：
  ```ts
  {
    planId?: string;
    packId?: string; // 仍返回 404 unknown_sku
    channel?: "wechat" | "alipay" | "stripe"; // 非 Stripe provider 时必填或默认 "wechat" 且拒绝 "stripe"（400）；Stripe provider 时归一化为 "stripe"
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

- **请求 URL**：`GET /api/orders/[id]?stripe_session_id={可选，须匹配 /^cs_[A-Za-z0-9_]+$/}`
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

`PayClient` props：`{ order: PayOrderView; stripeSessionId?: string; canceled?: boolean; supportEmail?: string }`。

#### （5）登录跳回与错误码契约（B2 内部及跨页链接契约）

- 安全跳回函数：`getSafeNextPath(next: string | null | undefined, fallback = "/generate"): string`（位于 `lib/auth/redirect.ts`）。
- 站内跨页链接约定：
  - 落地页免费/通用入口：`/login`
  - 落地页付费会员卡入口：`/login?next=/upgrade`
  - `/upgrade` 未登录重定向：`/login?next=/upgrade`
  - `/billing` 未登录重定向：`/login?next=/billing`
  - 法务合规页固定路由：`/terms`、`/privacy`
  - 密码重置页固定路由：`/auth/reset-password`
  - `/login` 支持的查询参数：`next`、`error=auth_callback_failed | oauth_failed | otp_expired`、`reset=success`

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

### 2.4 数据库迁移 `supabase/migrations/0007_orders_profiles_fk.sql` 精确定义

```sql
-- 0007_orders_profiles_fk.sql
-- 1) Backfill any missing public.profiles rows for existing orders so adding
--    the FK never fails on historical data (orders.user_id already references
--    auth.users(id), so every existing orders.user_id is guaranteed present in
--    auth.users).
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
    select 1
    from pg_constraint
    where conname = 'orders_user_id_profiles_fkey'
      and conrelid = 'public.orders'::regclass
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

> **迁移序号协调与上线确认**：本迁移正式使用编号 `0007`（`supabase/migrations/0007_orders_profiles_fk.sql`），与仓内既有 `0001`–`0006` 无冲突。未合入的视频工作台提案 `docs/openspec/changes/add-video-workbench/` 后续实施时其迁移顺延为 `0008_video_workbench.sql`。按 `AGENTS.md` 安全红线，**禁止在未获 Owner 明确确认前对生产/共享 Supabase 数据库执行本迁移**。

---

## 3. 并行工作区严格隔离矩阵（Allowed Files）

B1、B2、B3 三个工作区允许新建或修改的文件集合**两两交集严格为空（`B1 ∩ B2 = ∅`、`B1 ∩ B3 = ∅`、`B2 ∩ B3 = ∅`）**。任何工作区执行期间若发现需触碰本表以外的文件，必须停下上报总控，严禁越界修改。

### 全局禁改范围（B1 / B2 / B3 均禁止触碰）
- `package.json`、`package-lock.json`、`tsconfig.json`、`next.config.ts`、`tailwind.config.ts`、`eslint.config.mjs`、`vitest.config.ts`、`playwright.config.ts`、`next-env.d.ts`
- 已归档或已有数据库迁移 `supabase/migrations/0001_initial.sql` 至 `0006_membership.sql`
- 其他未合入变更目录 `docs/openspec/changes/add-video-workbench/**` 与 `docs/openspec/changes/archive/**`
- `.env`、`.env.local`（严禁读取、打印或修改真实密钥文件）

### B1 / B2 / B3 / B4 允许操作文件归属表

| 工作区 | 允许新建 / 修改的文件路径 | 动作 | 核心职责说明 |
| --- | --- | --- | --- |
| **B1**<br>Stripe 服务端与后端 P0 | `lib/billing/env.ts` | 修改 | 修复 `ALLOW_MOCK_IN_PRODUCTION` 为严格 `envBoolean`；扩展 `"stripe"` 枚举与 `STRIPE_*` 环境变量 |
| **B1** | `lib/billing/providers/types.ts` | 修改 | 扩展 `PayChannel`、`CreatePaymentResult.redirectUrl`、`QueryOrderInput` |
| **B1** | `lib/billing/providers/stripe.ts` | 新建 | Stripe Checkout 会话创建（含 `wechat_pay.client=web`、`31m` 最小 TTL、`Idempotency-Key`）、防路径穿越/防串单查询、`Stripe-Signature` HMAC-SHA256 验签 |
| **B1** | `lib/billing/provider.ts` | 修改 | 注册 `stripeProvider` 并导出含生产 Mock 守卫的 `getBillingProviderById` |
| **B1** | `app/api/checkout/route.ts` | 修改 | 前置解析 provider 与归一化 `"stripe"` 渠道、非 Stripe 拒绝 `channel="stripe"`、31 分钟最小 TTL、条件保存 `provider_trade_no`、返回 `redirectUrl`（含复用单） |
| **B1** | `app/api/orders/[id]/route.ts` | 修改 | 校验并支持 `?stripe_session_id=` 跳回即时主动对账（含临近过期恢复与 3s 节流），响应补充 `provider` 字段 |
| **B1** | `app/api/webhooks/stripe/route.ts` | 新建 | Stripe 异步回调原始请求体验签、金额/币种核对、写 `raw_notify`/`notified_at` 与幂等 `fulfill_order` 发货 |
| **B1** | `app/api/admin/orders/[id]/query/route.ts` | 修改 | 向 `provider.queryOrder` 透传 `providerTradeNo: order.provider_trade_no` |
| **B1** | `app/admin/orders/page.tsx` | 修改 | 捕获并展示 PostgREST 查询错误横幅；`CHANNEL_LABEL` 补充 `stripe: "Stripe"` |
| **B1** | `supabase/migrations/0007_orders_profiles_fk.sql` | 新建 | 补齐缺失 profile、作用域幂等新增 `orders_user_id_profiles_fkey` 外键、扩展 `orders_channel_check` |
| **B1** | `types/database.ts` | 修改 | 同步 `orders.Insert/Update.channel` 含 `"stripe"` 及 `orders_user_id_profiles_fkey` 关系声明（`orders.Row.channel` 留 B4 放宽以保 B1 独立编过） |
| **B1** | `app/api/generate/route.ts` | 修改 | 显式导出 `export const maxDuration = 180;` |
| **B1** | `app/api/agent/sessions/[id]/messages/route.ts` | 修改 | 显式导出 `export const maxDuration = 300;` |
| **B1** | `lib/openai/images.ts` | 修改 | 仅在 `editImageBase64` 按解码字节魔数自动识别 `image/jpeg` / `image/png` / `image/webp` 与扩展名；严禁改动 `d64310b` 的 `node:https` / `safeLookup` / 25MiB / 3 跳重定向防护 |
| **B1** | `lib/agent/types.ts` | 修改 | 新增 `ToolCallSpec`，扩展 `BrainTurnMessage` 与 `BrainTurnResponse` 支持多工具调用与 `toolCallId` |
| **B1** | `lib/agent/brain.ts` | 修改 | `RealBrain` 补齐 `assistant.tool_calls` 标准消息并完整返回多 `tool_calls`（不因 `finish_reason` 差异丢弃） |
| **B1** | `lib/agent/loop.ts` | 修改 | 压入 `assistant.toolCalls` 消息、按序串行执行多工具调用并为每个 `tool_call_id` 回填 `role: "tool"` |
| **B1** | `lib/agent/tools.ts` | 修改 | 成功后实时扣减 `ctx.totalCredits`、RPC 失败清理 Storage 孤儿图、`edit_image` 查询并继承源图 `aspect_ratio` |
| **B1** | `tests/billing/env.test.ts`<br>`tests/billing/stripe-provider.test.ts`<br>`tests/api/stripe-webhook-route.test.ts`<br>`tests/api/orders-route.test.ts` | 新建 | B1 新增环境变量、Stripe provider、Stripe webhook 与订单对账单测 |
| **B1** | `tests/api/checkout-route.test.ts`<br>`tests/openai/images.test.ts`<br>`tests/agent/brain.test.ts`<br>`tests/agent/loop.test.ts`<br>`tests/agent/tools.test.ts` | 修改 | 补充 Stripe 下单跳转、JPEG/PNG/WebP MIME 识别（保留全部 `d64310b` 用例）与 Agent 4 项修复回归单测 |
| **B2**<br>国内邮箱登录闭环 | `lib/auth/redirect.ts` | 新建 | `getSafeNextPath` 安全站内路径校验工具函数（拦截外链、`//`、`\`、控制字符及登录/回调循环） |
| **B2** | `app/page.tsx` | 修改 | 根路径 `?code=` 及 `?token_hash=&type=` 转发 `/auth/callback` 时保留 `next` 参数 |
| **B2** | `components/landing-page.tsx` | 修改 | 全站 4 处通用/免费未登录 CTA 改跳 `/login`，2 处付费价格卡改跳 `/login?next=/upgrade`，移除未用 `GoogleLoginButton` 导入；页脚挂载 `/terms` 与 `/privacy` |
| **B2** | `app/login/page.tsx` | 修改 | 解析 `next` / `error` / `reset` 参数传给 `LoginForm`；更新双模式登录文案；底部挂载 `/terms` 与 `/privacy` |
| **B2** | `components/login-form.tsx` | 修改 | 重构为「6 位邮箱验证码免密登录/注册 ⇄ 邮箱密码登录/注册 + 忘记密码」主入口，Google 按钮沉底次选 |
| **B2** | `components/auth-button.tsx` | 修改 | 保持 `GoogleLoginButton` 导出兼容，支持 `next`、次级按钮样式、`loading` 与失败错误提示 |
| **B2** | `app/auth/callback/route.ts` | 修改 | 修复吞掉 `exchangeCodeForSession` 错误的问题，支持白名单 `token_hash` + `type`（`recovery` 默认落 `/auth/reset-password`），失败带错误码跳回 `/login` |
| **B2** | `app/auth/reset-password/page.tsx` | 新建 | 校验恢复会话后的设置新密码与二次确认页面，成功后 `signOut()` 并跳转 `/login?reset=success` |
| **B2** | `tests/auth/redirect.test.ts`<br>`tests/components/login-form.test.tsx` | 新建 | 站内跳转防开放重定向单测、双模式登录与重置表单组件测试 |
| **B2** | `tests/auth/callback-route.test.ts`<br>`e2e/smoke.spec.ts` | 修改 | 补齐回调失败重定向与 `token_hash` 单测；同步首页登录入口与无效 `code` 烟雾断言 |
| **B3**<br>账单页、收银文案与合规页 | `lib/billing/support.ts` | 新建 | 封装读取 `NEXT_PUBLIC_SUPPORT_EMAIL` 与客服联系文案辅助函数 |
| **B3** | `app/billing/page.tsx` | 新建 | 用户侧「账单与积分明细」页（双池与会员概览、历史订单、积分流水，通道标签用 `Record<string, string>` 宽映射） |
| **B3** | `components/app-shell.tsx` | 修改 | 工作台导航挂载 `/billing`（「账单与明细」）入口（保持 `BrandMark` 导出签名不变） |
| **B3** | `app/upgrade/page.tsx` | 修改 | 未登录改跳 `/login?next=/upgrade`；以 `string` 传 `billingProvider` 给 `PricingPlans` |
| **B3** | `components/pricing-plans.tsx` | 修改 | `billingProvider === "stripe"` 时展示 Stripe 支付方式说明、下单传 `channel: "stripe"` 并按 `redirectUrl` 外跳结账 |
| **B3** | `app/pay/[orderId]/page.tsx` | 修改 | 异步读取 `searchParams`（`stripe_session_id` / `canceled`）与 `plan_snapshot` 传给 `PayClient`；未登录带 `next` 跳回；挂载 `/terms` 与 `/privacy` |
| **B3** | `components/pay-client.tsx` | 修改 | 年卡 12 期分期文案修正、异常订单展示客服邮箱与单号、Stripe 跳过二维码渲染并支持即时回跳对账与 `repurchase` 外跳 |
| **B3** | `app/terms/page.tsx` | 新建 | 静态公开「服务条款与退款规则」页 |
| **B3** | `app/privacy/page.tsx` | 新建 | 静态公开「隐私政策」页 |
| **B3** | `tests/components/pay-client.test.tsx`<br>`tests/components/pricing-plans.test.tsx`<br>`tests/pages/legal-and-billing.test.tsx` | 新建 | 收银台年卡文案/客服邮箱/Stripe 回跳与重下测试、升级页外跳测试、法务与账单页渲染测试 |
| **B4**<br>合并联调与验收 | `types/database.ts`<br>`app/api/checkout/route.ts`<br>`.env.example`<br>`README.md`<br>`e2e/billing.spec.ts`（或新增 `e2e/compliance-and-billing.spec.ts`） | 修改 / 新建 | 依次合入 `B1 -> B2 -> B3` 后放宽 `orders.Row.channel` 并清理临时断言、同步 `.env.example` 与 `README.md`、补充跨模块端到端验证并执行唯一一次全量门禁 |

---

## 4. 派发执行快规则（B1 / B2 / B3 执行器共同遵守）

1. **修缺陷先复现**：涉及 P0 缺陷或回调吞错的任务，先在对应测试文件写出复现旧缺陷的断言并运行单文件 `npx vitest run <该测试文件>` 确认失败，再改业务代码至同用例转绿。
2. **严控测试频率**：编码途中仅允许运行 `npm run typecheck` 或单文件 `npx vitest run <单个文件>`；**严禁**中途运行全量 `npm test`、`npm run build` 或 `npm run e2e`。
3. **收尾局部快测**：本工作区全部代码与测试写完后，按 `tasks.md` 指定的本工作区局部快测命令跑一次（失败修复重跑最多 3 轮），不得删除、跳过或放宽既有断言。
4. **严守文件边界与安全红线**：不得读取 `.env` / `.env.local`，不得触碰上表「允许新建 / 修改的文件路径」以外的任何文件，不得对生产/共享 Supabase 执行迁移，不得自行 `git push`。

---

## 5. 归档演进尾注（合入后增量修订）

本变更按计划合入主干（`0db69e5`–`943bdc7`）后，上线联调期间又落地了以下 4 项小幅修订，正式行为契约已同步至 `docs/openspec/specs/`：

- **`d09891c`（登录注册入口收敛与错误文案汉化）**：`/login` 将新老用户注册与免密登录统一收口至默认「验证码登录 / 注册」页签，移除密码模式内的独立注册切换，保留邮箱密码登录与「忘记密码 / 首次设置密码」入口，并对 Supabase Auth 错误提示做中文映射。
- **`509810f`（Stripe Webhook 订单与会话绑定加固）**：`/api/webhooks/stripe` 强制校验 `session.id` 格式、`metadata.order_id === client_reference_id` 与本地 `provider_trade_no` 一致性，异常绑定时按是否唯一命中本地待付订单决定忽略或标记 `flagged`，不再覆盖既有 `provider_trade_no`。
- **`03b96dc`（Stripe API 版本升级）**：`lib/billing/providers/stripe.ts` 的 `createPayment` 与 `queryOrder` 均显式固定请求头 `Stripe-Version: 2026-09-30.endive`，并将 `POST /v1/checkout/sessions` 废弃的 `payment_method_types[i]` 替换为 `allowed_payment_method_types[i]`。
- **`05acabf` / `0a2bcd8`（Checkout 邮箱预填与严格校验）**：`POST /api/checkout` 向 `stripeProvider.createPayment` 传入已登录用户的 `customerEmail`，经 `normalizeCustomerEmail` 严格校验本地段、域名标签与 TLD 后以 `customer_email` 预填至 Stripe Checkout Session。
