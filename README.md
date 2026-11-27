# PixGen (AI Image Generation & Agent Workbench)

Next.js App Router + Supabase + OpenAI Images API 图像生成、Agent 对话工作台与人民币会员计费应用。

## Stack

- Next.js App Router (React 19 + TypeScript + Tailwind CSS)
- Supabase Auth, Postgres (RLS + RPC), Storage
- OpenAI Images API (or OpenAI-compatible relay)
- Stripe Checkout (`Stripe-Version: 2026-09-30.endive`) / 聚合支付 / Mock
- Vercel

## Local Setup

1. 从 [.env.example](.env.example) 复制创建 `.env.local`（全部 `.env*` 已忽略，严禁提交真实凭据）。仓库全部 29 个环境变量的定义与默认值以 [.env.example](.env.example) 为唯一单源；本地最小联调配置：

   ```env
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   OPENAI_API_KEY=your-openai-api-key
   OPENAI_IMAGE_MODEL=gpt-image2
   IMAGE_PROVIDER=mock
   AGENT_PROVIDER=mock
   BILLING_PROVIDER=mock
   ALLOW_MOCK_IN_PRODUCTION=false
   ```

   - 三项 `mock` 配置可在不调用付费 API 的情况下本地联调；生产环境默认禁用所有 `mock`（仅字面量 `ALLOW_MOCK_IN_PRODUCTION=true` 放行，`"false"`/空值/未设置均为 `false`）。
   - 切真实服务时设置 `IMAGE_PROVIDER=openai`（中继另配 `OPENAI_BASE_URL`）、`AGENT_PROVIDER=real` + `AGENT_LLM_API_KEY`（默认 `glm-4.6`，单轮最大工具迭代见 `AGENT_MAX_ITERATIONS`，范围 `1-10`，默认 `5`）与正式 `BILLING_PROVIDER`。

2. 执行 `npm install`。
3. 按序向本地/开发 Supabase 应用 `supabase/migrations/`（`0001_initial.sql` 至 `0007_orders_profiles_fk.sql`）。**未经 Owner 确认严禁操作生产/共享库。**
4. 在 Supabase Storage 创建公开桶 `generated-images`。
5. 按下方 [Supabase Auth Launch Checklist](#supabase-auth-launch-checklist) 配置邮件模板与回调白名单。
6. 执行 `npm run dev`。

## Verification

```bash
npm run typecheck    # TypeScript 静态检查
npm run lint         # ESLint 零警告检查
npm test             # 全量 Vitest 单元测试（单文件可用 npx vitest run <path>）
npm run build        # 生产构建检查
npm run e2e:smoke    # 无真实 Supabase 依赖的 Playwright 烟雾测试
npm run e2e          # 全量 Playwright E2E（锁定 mock 提供方，无实库凭据时跳过实库用例）
npm run verify:rls   # 独立测试库 RLS 与核心资金 RPC 校验（见 tests/db/rls-notes.md）
```

## Deployment (Vercel)

全量环境变量见 [.env.example](.env.example)，上线重点配置四组变量：

1. **站点与 Supabase**：`NEXT_PUBLIC_SITE_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`ADMIN_EMAILS`（可选，逗号分隔，控制 `/admin/credits` 与 `/admin/orders` 权限）。
2. **生图与中继**：`OPENAI_API_KEY`、`OPENAI_BASE_URL`（可选中继）、`OPENAI_IMAGE_MODEL`（默认 `gpt-image2`）、`IMAGE_PROVIDER=openai`。
3. **Agent 模型**：`AGENT_PROVIDER=real`、`AGENT_LLM_BASE_URL`（默认 `https://open.bigmodel.cn/api/paas/v4`）、`AGENT_LLM_API_KEY`、`AGENT_LLM_MODEL`（默认 `glm-4.6`）、`AGENT_MAX_ITERATIONS`（`1-10`，默认 `5`）。
4. **计费与合规**：`BILLING_PROVIDER`（推荐 `stripe`，兼容 `lantu` / `xunhupay`）、`ORDER_TTL_MINUTES`（`1-120`，默认 `15`；Stripe 自动取 `>= 31` 分钟）、`NEXT_PUBLIC_SUPPORT_EMAIL`（展示于 `/pay/[orderId]`、`/billing`、`/terms`、`/privacy`）、`ALLOW_MOCK_IN_PRODUCTION=false` 及对应支付通道密钥（见 [.env.example](.env.example) 第 3 节）。

Serverless 超时：`/api/generate` 导出 `maxDuration = 180`，`/api/agent/sessions/[id]/messages` 导出 `maxDuration = 300`（Fluid Compute / Pro 适用；旧版 Hobby 需下调至 `60`）。

### Supabase Auth Launch Checklist

`/login` 提供 6 位邮箱验证码免密登录/注册（默认页签）+ 邮箱密码登录/找回作为国内主入口，Google OAuth 为次级备选：

1. **Redirect URLs 白名单**（Supabase → Authentication → URL Configuration）：
   - 生产：`https://YOUR_DOMAIN/auth/callback`、`https://YOUR_DOMAIN/auth/reset-password`
   - 本地：`http://localhost:3000/auth/callback`、`http://localhost:3000/auth/reset-password`
2. **邮件模板（`Magic Link` 与 `Confirm signup` 均须包含 `{{ .Token }}`）**：`signInWithOtp({ shouldCreateUser: true })` 对存量用户发 **Magic Link**、对新用户发 **Confirm signup**，两套模板都必须展示 6 位验证码。
3. **Reset Password 模板**：推荐链接至 `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery`（跨设备不依赖 PKCE），或 `{{ .ConfirmationURL }}`。
4. **Google OAuth（可选）**：如需海外登录，启用 Google 并配置回调 `https://YOUR_DOMAIN/auth/callback`。

### Billing & Stripe Launch Checklist

计费支持 **Stripe Checkout**（单次人民币 `mode: "payment"`，固定请求头 `Stripe-Version: 2026-09-30.endive`，通过 `allowed_payment_method_types` 启用 `alipay`、`wechat_pay`（`client=web`）与 `card`，并在已登录用户邮箱校验通过时透传 `customer_email` 预填回执邮箱；采用原生 `fetch` + `node:crypto`，无需 `publishable key`）及蓝兔/虎皮椒；用户账单位于 `/billing`，法务页位于 `/terms`、`/privacy`。

1. **获 Owner 确认后**向生产库应用 `supabase/migrations/0007_orders_profiles_fk.sql`（补齐 `profiles`、建 `orders_user_id_profiles_fkey`、扩展 `orders_channel_check` 含 `'stripe'` 并 `NOTIFY pgrst, 'reload schema'`）。
2. 在 Stripe Dashboard 开启 `Alipay`、`WeChat Pay`、`Card`，在 Vercel 配置 `BILLING_PROVIDER=stripe`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`STRIPE_PAYMENT_METHODS`、`NEXT_PUBLIC_SUPPORT_EMAIL`。
3. 配置 Webhook `https://YOUR_DOMAIN/api/webhooks/stripe`，订阅 `checkout.session.completed` 与 `checkout.session.async_payment_succeeded`，将 `whsec_...` 填入 `STRIPE_WEBHOOK_SECRET`。
4. 核验 `/terms`、`/privacy` 免登录可访问且定价/退款/客服邮箱准确；先在测试模式再以小额正式单验证 Webhook 与跳回即查（`/pay/[orderId]?stripe_session_id=...`），确认 `/billing` 与 `/admin/orders` 正常入账。
5. 使用蓝兔/虎皮椒时改设 `BILLING_PROVIDER` 并配 `https://YOUR_DOMAIN/api/webhooks/lantu`（或 `/xunhupay`）。管理员可在 `/admin/credits`（`adjust_credits` RPC）调账及 `/admin/orders` 查单/补发。
