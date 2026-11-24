# AI Image Generation MVP (PixGen)

Production-ready MVP for structured GPT Image generation, Agent workbench, and CNY membership billing.

## Stack

- Next.js App Router
- Supabase Auth, Postgres, Storage
- OpenAI Images API
- Stripe Checkout / Aggregator Payments
- Vercel

## Local Setup

1. Create `.env.local` in the project root from `.env.example` (all `.env*` files are git-ignored):

   ```env
   OPENAI_API_KEY=your-openai-api-key
   OPENAI_IMAGE_MODEL=gpt-image2
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   BILLING_PROVIDER=mock
   MOCK_APP_SECRET=mock-secret
   ALLOW_MOCK_IN_PRODUCTION=false
   ORDER_TTL_MINUTES=15
   AGENT_PROVIDER=mock
   IMAGE_PROVIDER=mock
   ```

   `AGENT_PROVIDER=mock`、`IMAGE_PROVIDER=mock` 与 `BILLING_PROVIDER=mock` 让本地无需真实外部 LLM/生图/支付 API 即可完整联调；生产环境默认禁止 mock（仅显式设置 `ALLOW_MOCK_IN_PRODUCTION=true` 放行，`"false"` / 空值 / 未设置均视为 `false`）。切真实服务时设置 `AGENT_PROVIDER=real` + `AGENT_LLM_API_KEY`（OpenAI 兼容 function calling，默认智谱 `glm-4.6`）、`IMAGE_PROVIDER=openai` 与正式 `BILLING_PROVIDER`。

2. Run `npm install`.
3. Apply the SQL migrations in `supabase/migrations/` (`0001_initial.sql` through `0007_orders_profiles_fk.sql`) to your local/dev Supabase instance (never run migrations against production/shared Supabase without explicit owner confirmation).
4. Create a public Supabase Storage bucket named `generated-images`.
5. Configure Supabase Auth email templates and redirect URLs (see [Supabase Auth Launch Checklist](#supabase-auth-launch-checklist)).
6. Run `npm run dev`.

## Verification

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e
```

## Deployment

Deploy to Vercel and set:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (optional; use this for an OpenAI-compatible relay endpoint)
- `OPENAI_IMAGE_MODEL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `ADMIN_EMAILS` (optional; comma-separated admin emails for `/admin/credits` and `/admin/orders`)
- `NEXT_PUBLIC_SUPPORT_EMAIL` (optional; public customer support email rendered on `/pay/[orderId]`, `/billing`, `/terms`, and `/privacy`)
- `BILLING_PROVIDER` (`mock` for dev/test; `stripe`, `lantu`, or `xunhupay` for production)
- `STRIPE_SECRET_KEY` (required when `BILLING_PROVIDER=stripe`, e.g. `sk_live_...` / `sk_test_...`)
- `STRIPE_WEBHOOK_SECRET` (required for `/api/webhooks/stripe` signature verification, e.g. `whsec_...`)
- `STRIPE_API_BASE` (optional; default `https://api.stripe.com`)
- `STRIPE_PAYMENT_METHODS` (optional; default `card,alipay,wechat_pay`; comma-separated non-empty subset of `card`, `alipay`, `wechat_pay`)
- `LANTU_MCH_ID` (蓝兔商户号, required when `BILLING_PROVIDER=lantu`)
- `LANTU_APP_SECRET` (蓝兔应用密钥, required when `BILLING_PROVIDER=lantu`)
- `LANTU_API_BASE` (default: `https://api.ltzf.cn`)
- `XUNHUPAY_APP_ID` (虎皮椒 App ID, required when `BILLING_PROVIDER=xunhupay`)
- `XUNHUPAY_APP_SECRET` (虎皮椒 App Secret, required when `BILLING_PROVIDER=xunhupay`)
- `XUNHUPAY_API_BASE` (default: `https://api.xunhupay.com`)
- `ORDER_TTL_MINUTES` (order expiry in minutes, `1-120`, default: `15`; Stripe sessions automatically enforce a minimum 31-minute expiry to accommodate clock skew)
- `ALLOW_MOCK_IN_PRODUCTION` (strict boolean: only literal `true` allows `mock` providers in production; `"false"`, empty, or unset all evaluate to `false`)
- `AGENT_PROVIDER` (`mock` for dev/test, `real` for production)
- `AGENT_LLM_BASE_URL` (OpenAI-compatible chat endpoint, default: `https://open.bigmodel.cn/api/paas/v4`)
- `AGENT_LLM_API_KEY` (required when `AGENT_PROVIDER=real`)
- `AGENT_LLM_MODEL` (default: `glm-4.6`)
- `IMAGE_PROVIDER` (`openai` default; `mock` returns placeholder images for dev/test)

Note on Serverless function timeouts: `/api/generate` exports `maxDuration = 180` and `/api/agent/sessions/[id]/messages` exports `maxDuration = 300` (supported on Vercel Fluid Compute / Pro; if deploying to legacy Hobby without Fluid Compute, adjust `maxDuration` down to `60`).

The default image model is `gpt-image2`. If your OpenAI account or region does not support it, set `OPENAI_IMAGE_MODEL` to another image model available to your account.

For an OpenAI-compatible relay, set:

```env
OPENAI_API_KEY=your-relay-api-key
OPENAI_BASE_URL=https://your-relay-domain/v1
OPENAI_IMAGE_MODEL=gpt-image2
```

### Supabase Auth Launch Checklist

PixGen uses email 6-digit OTP (passwordless login/signup) + email password login/reset as the primary CN-friendly entry at `/login`, with Google OAuth as a secondary option. Before launching:

1. **Redirect URLs allowlist** (Supabase Dashboard → Authentication → URL Configuration):
   - Production:
     - `https://YOUR_DOMAIN/auth/callback`
     - `https://YOUR_DOMAIN/auth/reset-password`
   - Local development:
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/auth/reset-password`
2. **Email Templates — BOTH `Magic Link` and `Confirm signup` MUST include `{{ .Token }}`**:
   - Calling `signInWithOtp({ shouldCreateUser: true })` sends the **Magic Link** template for existing users and the **Confirm signup** template for first-time users.
   - Make sure **both** templates prominently display the 6-digit verification code `{{ .Token }}`, otherwise new users will not receive an OTP code.
3. **Reset Password email template**:
   - Configure the **Reset Password** template to link to either:
     - `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery` (recommended: works across devices and mobile mail apps without PKCE `code_verifier` mismatch), or
     - `{{ .ConfirmationURL }}` (PKCE callback forwarding to `/auth/callback?next=/auth/reset-password`).
4. **Google OAuth (optional secondary login)**:
   - Enable Google provider in Supabase Auth if serving overseas users; the callback URL is `https://YOUR_DOMAIN/auth/callback`.

### Billing / Payments

The billing system supports single-payment CNY membership cards via **Stripe Checkout** (`mode: "payment"`, supporting `alipay`, `wechat_pay` with `client=web`, and `card`) as well as legacy aggregator platforms (蓝兔/虎皮椒) and local `mock`. Users can view their membership status, orders, and credit ledger at `/billing`, and review compliance disclosures at `/terms` and `/privacy`.

**Environment variables:**

| Variable | Required | Description |
|---|---|---|
| `BILLING_PROVIDER` | Yes | `mock` (dev/test), `stripe`, `lantu`, or `xunhupay` (production) |
| `STRIPE_SECRET_KEY` | When `stripe` | Stripe secret key (`sk_test_...` / `sk_live_...`); Stripe integration uses native `fetch` + `node:crypto` and does not need a publishable key |
| `STRIPE_WEBHOOK_SECRET` | When `stripe` | Webhook signing secret (`whsec_...`) for `/api/webhooks/stripe` |
| `STRIPE_API_BASE` | No | Default: `https://api.stripe.com` |
| `STRIPE_PAYMENT_METHODS` | No | Default: `card,alipay,wechat_pay` (comma-separated subset of `card`, `alipay`, `wechat_pay`) |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | No | Customer support email displayed on `/pay/[orderId]`, `/billing`, `/terms`, `/privacy` |
| `LANTU_MCH_ID` | When `lantu` | 蓝兔商户号 |
| `LANTU_APP_SECRET` | When `lantu` | 蓝兔应用密钥 |
| `LANTU_API_BASE` | No | Default: `https://api.ltzf.cn` |
| `XUNHUPAY_APP_ID` | When `xunhupay` | 虎皮椒 App ID |
| `XUNHUPAY_APP_SECRET` | When `xunhupay` | 虎皮椒 App Secret |
| `XUNHUPAY_API_BASE` | No | Default: `https://api.xunhupay.com` |
| `MOCK_APP_SECRET` | No | Mock provider secret (default: `mock-secret`) |
| `ORDER_TTL_MINUTES` | No | Order expiry in minutes (`1-120`, default: `15`; Stripe enforces `>= 31`) |
| `ALLOW_MOCK_IN_PRODUCTION` | No | Strict boolean (`true` only); defaults to `false` |

**Database migration (`0007_orders_profiles_fk.sql`) & Stripe deployment checklist:**

1. **After explicit Owner confirmation**, apply `supabase/migrations/0007_orders_profiles_fk.sql` to production Supabase (via Supabase SQL Editor or `supabase db push` in a confirmed release window):
   - Idempotently backfills any missing `public.profiles` rows referenced by existing `orders`.
   - Adds the explicit FK `orders_user_id_profiles_fkey` (`public.orders(user_id) -> public.profiles(id)`) so `/admin/orders` PostgREST joins `orders(..., profiles(email))` succeed.
   - Widens `orders_channel_check` to `('wechat', 'alipay', 'stripe')`.
   - Emits `NOTIFY pgrst, 'reload schema'` to refresh PostgREST's schema cache.
2. Enable `Alipay`, `WeChat Pay`, and `Card` payment methods in the Stripe Dashboard, then set `BILLING_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PAYMENT_METHODS`, and `NEXT_PUBLIC_SUPPORT_EMAIL` in Vercel.
3. Configure a Stripe Webhook endpoint pointing to:
   - `https://YOUR_DOMAIN/api/webhooks/stripe`
   - Subscribe to events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
   - Copy the generated `whsec_...` signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Verify `/terms` and `/privacy` are publicly accessible and list accurate pricing, refund rules, and support email for Stripe merchant compliance review.
5. Run a test checkout (Stripe test mode first, then a small live self-purchase) to verify both webhook fulfillment and immediate redirect-back reconciliation (`/pay/[orderId]?stripe_session_id=...`), and confirm the paid order and `membership_grant` entry appear on `/billing` and `/admin/orders`.
6. If using legacy 蓝兔 / 虎皮椒 instead, set `BILLING_PROVIDER=lantu` or `xunhupay` and configure `https://YOUR_DOMAIN/api/webhooks/lantu` (or `/xunhupay`).

**Manual credit adjustment:**

Admins can adjust credits via `/admin/credits` or inspect/query orders via `/admin/orders`. The `adjust_credits` RPC ensures atomicity and records `admin_adjustment` events.
