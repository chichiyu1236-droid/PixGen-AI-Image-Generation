# Tasks: hardening-and-stripe-launch

> 各并行工作区（B1 / B2 / B3）严格在 `design.md` 第 3 节锁定的 Allowed Files 范围内实施，互不触碰对方文件；全部合入后由 B4 统一跑一次全量构建与 Playwright E2E 门禁。

## B1：Stripe 服务端收款与后端/管理端 P0 止血

**允许修改 / 新建文件**：`lib/billing/env.ts`、`lib/billing/providers/types.ts`、`lib/billing/providers/stripe.ts`、`lib/billing/provider.ts`、`app/api/checkout/route.ts`、`app/api/orders/[id]/route.ts`、`app/api/webhooks/stripe/route.ts`、`app/api/admin/orders/[id]/query/route.ts`、`app/admin/orders/page.tsx`、`supabase/migrations/0007_orders_profiles_fk.sql`、`types/database.ts`、`app/api/generate/route.ts`、`app/api/agent/sessions/[id]/messages/route.ts`、`lib/openai/images.ts`、`lib/agent/types.ts`、`lib/agent/brain.ts`、`lib/agent/loop.ts`、`lib/agent/tools.ts` 及对应 `tests/` 下指定单测文件。

- [ ] **B1.1 修复计费布尔环境变量并扩展 Stripe 配置（`lib/billing/env.ts`、`tests/billing/env.test.ts`）**
  - 先写失败测试复现 `ALLOW_MOCK_IN_PRODUCTION="false"` 被旧代码解析为 `true` 的缺陷，再改为与 `lib/env.ts` 一致的严格 `envBoolean`。
  - 扩展 `BILLING_PROVIDER` 支持 `"stripe"`，新增 `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`STRIPE_API_BASE`、`STRIPE_PAYMENT_METHODS`。
- [ ] **B1.2 实现 Stripe Checkout Provider 与双路径履约接口（`lib/billing/providers/types.ts`、`lib/billing/providers/stripe.ts`、`lib/billing/provider.ts`、`app/api/checkout/route.ts`、`app/api/orders/[id]/route.ts`、`app/api/webhooks/stripe/route.ts`、`app/api/admin/orders/[id]/query/route.ts`）**
  - `stripe.ts` 用原生 `fetch` + `node:crypto` 实现 `mode: "payment"`、`currency: "cny"` 会话创建（含 `card` / `alipay` / `wechat_pay` 及 `wechat_pay.client="web"`、最小 30 分钟 `expires_at`、`client_reference_id` 与 `metadata.order_id`），返回 `payUrl`、`redirectUrl` 与 `providerTradeNo: session.id`。
  - 实现 `Stripe-Signature` HMAC-SHA256 验签（`±300s` 防重放、`timingSafeEqual`）与 `/api/webhooks/stripe` 路由：校验 `checkout.session.completed` / `checkout.session.async_payment_succeeded`、核对人民币分值金额（不符置 `flagged`），调用幂等 `fulfill_order`。
  - `POST /api/checkout` 支持 `"stripe"` 渠道、保存 `provider_trade_no` 并向前端返回 `redirectUrl`（含 2 分钟复用单）；`GET /api/orders/[id]` 支持 `?stripe_session_id=` 即时主动对账（严格核验 `client_reference_id === order.id`、金额与币种防串单），响应补充 `provider` 字段；管理端 `/api/admin/orders/[id]/query` 透传 `providerTradeNo`。
  - 编写 `tests/billing/stripe-provider.test.ts`、`tests/api/stripe-webhook-route.test.ts`、`tests/api/orders-route.test.ts` 并扩展 `tests/api/checkout-route.test.ts`。
- [ ] **B1.3 补齐订单表外键迁移与管理后台订单页错误提示（`supabase/migrations/0007_orders_profiles_fk.sql`、`types/database.ts`、`app/admin/orders/page.tsx`）**
  - 按 `design.md` 2.3 节创建 `0007_orders_profiles_fk.sql`（幂等补齐缺失 `profiles`、添加 `orders_user_id_profiles_fkey` 外键、扩展 `orders_channel_check` 支持 `'stripe'`、刷新 PostgREST schema 缓存；视频工作台迁移顺延为 `0008`）。
  - 更新 `types/database.ts` 中 `orders` 的 `channel` 与外键名；修改 `app/admin/orders/page.tsx` 解构并渲染 PostgREST 查询错误提示横幅，不再静默显示「暂无订单」，补充 `stripe` 通道标签。
- [ ] **B1.4 显式配置 Serverless `maxDuration` 并修复参考图 MIME 不一致（`app/api/generate/route.ts`、`app/api/agent/sessions/[id]/messages/route.ts`、`lib/openai/images.ts`、`tests/openai/images.test.ts`）**
  - 在 `/api/generate` 导出 `maxDuration = 120`，在 `/api/agent/sessions/[id]/messages` 导出 `maxDuration = 300`。
  - 先在 `tests/openai/images.test.ts` 写出传入 JPEG base64 时文件名为 `.jpg` 且 `type` 为 `image/jpeg` 的断言，再在 `lib/openai/images.ts` 按字节魔数识别 `image/jpeg` / `image/png` / `image/webp`。
- [ ] **B1.5 修复 Agent `RealBrain` 消息协议、轮内余额扣减、孤儿清理与编辑比例继承（`lib/agent/types.ts`、`lib/agent/brain.ts`、`lib/agent/loop.ts`、`lib/agent/tools.ts` 及 `tests/agent/*.test.ts`）**
  - 先在 `tests/agent/{brain,loop,tools}.test.ts` 复现 4 处缺陷：① 回传 `role: "tool"` 前缺少 `assistant.tool_calls` 及多 `tool_calls` 丢失；② 单轮连续生成时 `ctx.totalCredits` 未扣减导致超额调起生图；③ RPC 失败未删除 Storage 已上传图片；④ `edit_image` 硬编码 `"square"` 丢失原图画幅。
  - 逐项修复并确认既有 `MockBrain` 与新增 `RealBrain` 协议单测全部转绿。

**B1 收尾局部快测命令**：
```bash
npm run typecheck && npm run lint && npx vitest run tests/billing/env.test.ts tests/billing/stripe-provider.test.ts tests/billing/mock-provider.test.ts tests/billing/lantu-provider.test.ts tests/billing/xunhupay-provider.test.ts tests/api/checkout-route.test.ts tests/api/stripe-webhook-route.test.ts tests/api/orders-route.test.ts tests/api/generate-route.test.ts tests/openai/images.test.ts tests/agent/brain.test.ts tests/agent/loop.test.ts tests/agent/tools.test.ts
```

---

## B2：国内邮箱密码 + 6 位验证码（OTP）+ 重置密码登录闭环

**允许修改 / 新建文件**：`lib/auth/redirect.ts`、`app/page.tsx`、`components/landing-page.tsx`、`app/login/page.tsx`、`components/login-form.tsx`、`components/auth-button.tsx`、`app/auth/callback/route.ts`、`app/auth/reset-password/page.tsx`、`tests/auth/redirect.test.ts`、`tests/auth/callback-route.test.ts`、`tests/components/login-form.test.tsx`、`e2e/smoke.spec.ts`。

- [ ] **B2.1 抽离安全站内路径工具并修复 `/auth/callback` 吞错问题（`lib/auth/redirect.ts`、`app/auth/callback/route.ts`、`app/page.tsx`、`tests/auth/redirect.test.ts`、`tests/auth/callback-route.test.ts`）**
  - 新建 `getSafeNextPath` 拦截外链、`//` 与 `\` 注入，编写 `tests/auth/redirect.test.ts` 覆盖边界。
  - 先在 `tests/auth/callback-route.test.ts` 复现 `exchangeCodeForSession` 返回错误仍静默 307 到 `/generate` 的问题，修改 `/auth/callback`：当携带 `?error=` 或 `exchangeCodeForSession` 失败时重定向至 `/login?error=auth_callback_failed&next=...`；支持 `token_hash` + `type`（`email` / `recovery` / `signup` / `magiclink`）校验；`app/page.tsx` 转发根路径 `?code=` 时一并透传 `next`。
- [ ] **B2.2 落地页全站未登录主 CTA 改跳 `/login` 并挂载法务页脚链接（`components/landing-page.tsx`、`e2e/smoke.spec.ts`）**
  - 将 `components/landing-page.tsx` 中导航栏、首屏、底部行动区、免费价格卡共 4 处未登录按钮改为跳 `/login`；标准/Pro 两张付费价格卡未登录按钮改为跳 `/login?next=/upgrade`。
  - 在落地页 `<footer>` 增加 `/terms`（服务条款）与 `/privacy`（隐私政策）入口链接；同步更新 `e2e/smoke.spec.ts` 中首页未登录入口与无效授权码断言。
- [ ] **B2.3 重构 `/login` 双模式主入口并补齐 `/auth/reset-password` 重置密码闭环（`app/login/page.tsx`、`components/login-form.tsx`、`components/auth-button.tsx`、`app/auth/reset-password/page.tsx`、`tests/components/login-form.test.tsx`）**
  - `/login` 解析 `next`、`error`、`reset` 查询参数并底部挂载 `/terms`、`/privacy` 链接。
  - 重构 `LoginForm` 为「邮箱 6 位验证码免密登录/注册（`signInWithOtp` + 60s 倒计时 + `verifyOtp`）⇄ 邮箱密码登录/注册」双模式主入口，Google 登录沉底改为浅色描边次选按钮并透传 `next`。
  - 密码模式内置「忘记密码？」发送重置邮件（`resetPasswordForEmail` 指向 `/auth/callback?next=/auth/reset-password`）；新建 `/auth/reset-password` 页面校验恢复会话并通过 `supabase.auth.updateUser({ password })` 完成新密码设置。
  - 编写 `tests/components/login-form.test.tsx` 覆盖密码登录/注册、OTP 发送与 6 位码验证、忘记密码触发、回调错误展示及 `next` 跳回。

**B2 收尾局部快测命令**：
```bash
npm run typecheck && npm run lint && npx vitest run tests/auth/redirect.test.ts tests/auth/callback-route.test.ts tests/components/login-form.test.tsx
```

---

## B3：账单与积分明细页、收银台文案修正与法务合规页

**允许修改 / 新建文件**：`lib/billing/support.ts`、`app/billing/page.tsx`、`components/app-shell.tsx`、`app/upgrade/page.tsx`、`components/pricing-plans.tsx`、`app/pay/[orderId]/page.tsx`、`components/pay-client.tsx`、`app/terms/page.tsx`、`app/privacy/page.tsx`、`tests/components/pay-client.test.tsx`、`tests/components/pricing-plans.test.tsx`、`tests/pages/legal-and-billing.test.tsx`。

- [ ] **B3.1 新增客服邮箱辅助工具及 `/terms`、`/privacy` 法务合规静态页（`lib/billing/support.ts`、`app/terms/page.tsx`、`app/privacy/page.tsx`）**
  - 新建 `lib/billing/support.ts` 统一读取 `NEXT_PUBLIC_SUPPORT_EMAIL`。
  - 新建静态公开页 `/terms`（服务条款与退款规则：产品说明、人民币会员卡手动续费不自动扣款、首期即发与 30 天分期不滚存规则、异常扣款与退款申请联系方式）与 `/privacy`（隐私政策：账号信息、提示词与参考图/成图存储、Stripe 支付不留存卡号、用户删除与联系权利），两页互链并提供返回首页与升级页入口。
- [ ] **B3.2 新增用户侧 `/billing`「账单与积分明细」页并挂载侧边栏导航（`app/billing/page.tsx`、`components/app-shell.tsx`）**
  - 在 `components/app-shell.tsx` 的 `NAV_ITEMS` 新增 `/billing`（「账单与明细」），保持 `BrandMark` 导出签名不变。
  - 新建 `app/billing/page.tsx`：未登录跳 `/login?next=/billing`；先调 `ensureUserProfile` + `getCreditBalance(admin, user.id)` 完成惰性周期结算，再用用户端 Supabase 客户端读取本人 `memberships`、`orders`、`credit_events`，清晰展示双池余额与待发期数、订单列表（待支付订单附「继续支付」入口）及中文分类积分流水。
- [ ] **B3.3 修正 `/pay/[orderId]` 年卡文案、客服联系邮箱与 Stripe 前后端衔接（`app/upgrade/page.tsx`、`components/pricing-plans.tsx`、`app/pay/[orderId]/page.tsx`、`components/pay-client.tsx`）**
  - `app/upgrade/page.tsx` 向 `PricingPlans` 传入 `billingProvider`；当 `billingProvider === "stripe"` 时展示支付宝/微信支付/银行卡说明，且下单响应含 `redirectUrl` 时通过 `window.location.assign` 直接跳往 Stripe Checkout。
  - `app/pay/[orderId]/page.tsx` 与 `PayClient`：解析 `plan_snapshot` 对年卡明确展示「共 12 期、每 30 天发放 X 积分、首期立即到账」（月卡保持原有 `100 积分` / `100 积分已到账` 核心文案兼容既有测试）；`failed` / `flagged` 状态展示客服邮箱与订单号；携带 `?stripe_session_id=` 时挂载即刻请求 `/api/orders/[id]?stripe_session_id=...` 对账确认；Stripe 待支付态展示「前往 Stripe 收银台完成支付」按钮及取消提示；收银页底部挂载 `/terms` 与 `/privacy` 链接。
- [ ] **B3.4 编写收银台、定价页与账单/合规页组件测试（`tests/components/pay-client.test.tsx`、`tests/components/pricing-plans.test.tsx`、`tests/pages/legal-and-billing.test.tsx`）**
  - 覆盖月卡与年卡 12 期文案差异、异常订单显示客服邮箱与订单号、Stripe `?stripe_session_id=` 立即轮询与 `redirectUrl` 跳转、`/terms` 与 `/privacy` 关键合规段落及 `/billing` 空态/有数据态渲染。

**B3 收尾局部快测命令**：
```bash
npm run typecheck && npm run lint && npx vitest run tests/components/pay-client.test.tsx tests/components/pricing-plans.test.tsx tests/pages/legal-and-billing.test.tsx
```

---

## B4：跨分支合并、联调测试与上线门禁验收

**前置条件**：B1、B2、B3 均通过各自局部快测并经审查确认无越界改动。

- [ ] **B4.1 按序合入并行分支并校验零冲突**
  - 依次合入 `B1 -> B2 -> B3`（由于文件归属严格正交，合入过程应零代码冲突），每合入一个分支执行一次 `npm run typecheck`。
- [ ] **B4.2 同步部署与运维说明（`README.md`）**
  - 更新 `README.md`：补充 `BILLING_PROVIDER=stripe`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`STRIPE_PAYMENT_METHODS`、`NEXT_PUBLIC_SUPPORT_EMAIL` 配置说明，补充 `0007_orders_profiles_fk.sql` 迁移步骤，以及 Supabase Auth 开启邮箱 6 位 OTP 模板（`{{ .Token }}`）与配置 `/auth/callback`、`/auth/reset-password` 重定向白名单的上线核对清单。
- [ ] **B4.3 补充跨模块 E2E 用例并运行全量合并门禁**
  - 在 `e2e/` 中补充或扩展端到端验证：访客首页点击登录进入 `/login` 双模式页、公开访问 `/terms` 与 `/privacy`、已登录用户购买会员卡后访问 `/billing` 看到已付订单与 `membership_grant` 流水。
  - 执行唯一一次全量门禁并确认通过：

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```
