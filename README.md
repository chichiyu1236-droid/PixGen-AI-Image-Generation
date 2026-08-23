# AI Image Generation MVP

Production-ready MVP for structured GPT Image generation.

## Stack

- Next.js App Router
- Supabase Auth, Postgres, Storage
- OpenAI Images API
- Vercel

## Local Setup

1. Create `.env.local` in the project root with the following variables (all `.env*` files are git-ignored):

   ```env
   OPENAI_API_KEY=your-openai-api-key
   OPENAI_IMAGE_MODEL=gpt-image2
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   BILLING_PROVIDER=mock
   MOCK_APP_SECRET=mock-secret
   ALLOW_MOCK_IN_PRODUCTION=true
   ORDER_TTL_MINUTES=15
   AGENT_PROVIDER=mock
   IMAGE_PROVIDER=mock
   ```

   `AGENT_PROVIDER=mock` 与 `IMAGE_PROVIDER=mock` 让 Agent 工作台在本地无需任何外部 LLM/图像 API 即可完整体验；生产环境默认禁止 mock（同 billing 守卫），切真实服务时设置 `AGENT_PROVIDER=real` + `AGENT_LLM_API_KEY`（OpenAI 兼容 function calling，默认智谱 `glm-4.6`），`IMAGE_PROVIDER=openai`。

2. Run `npm install`.
3. Apply the SQL migrations in `supabase/migrations/` to Supabase.
5. Create a public Supabase Storage bucket named `generated-images`.
6. Enable Google OAuth and set callback URL to `http://localhost:3000/auth/callback`.
7. Run `npm run dev`.

## Verification

Run:

```bash
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
- `ADMIN_EMAILS` (optional; comma-separated admin emails for `/admin/credits`)
- `BILLING_PROVIDER` (`mock` for dev/test, `lantu` or `xunhupay` for production)
- `LANTU_MCH_ID` (蓝兔商户号, required when `BILLING_PROVIDER=lantu`)
- `LANTU_APP_SECRET` (蓝兔应用密钥, required when `BILLING_PROVIDER=lantu`)
- `LANTU_API_BASE` (default: `https://api.ltzf.cn`)
- `XUNHUPAY_APP_ID` (虎皮椒 App ID, required when `BILLING_PROVIDER=xunhupay`)
- `XUNHUPAY_APP_SECRET` (虎皮椒 App Secret, required when `BILLING_PROVIDER=xunhupay`)
- `XUNHUPAY_API_BASE` (default: `https://api.xunhupay.com`)
- `ORDER_TTL_MINUTES` (order expiry, default: 15)
- `ALLOW_MOCK_IN_PRODUCTION` (set `true` to allow mock payment in production for demo/testing)
- `AGENT_PROVIDER` (`mock` for dev/test, `real` for production)
- `AGENT_LLM_BASE_URL` (OpenAI-compatible chat endpoint, default: `https://open.bigmodel.cn/api/paas/v4`)
- `AGENT_LLM_API_KEY` (required when `AGENT_PROVIDER=real`)
- `AGENT_LLM_MODEL` (default: `glm-4.6`)
- `IMAGE_PROVIDER` (`openai` default; `mock` returns placeholder images for dev/test)

The default image model is `gpt-image2`. If your OpenAI account or region does not support it, set `OPENAI_IMAGE_MODEL` to another image model available to your account.

For an OpenAI-compatible relay, set:

```env
OPENAI_API_KEY=your-relay-api-key
OPENAI_BASE_URL=https://your-relay-domain/v1
OPENAI_IMAGE_MODEL=gpt-image2
```

Add the production auth callback URL in Supabase:

```text
https://YOUR_DOMAIN/auth/callback
```

### Billing / Payments

The billing system supports credit pack purchases via aggregator payment platforms (蓝兔/虎皮椒).

**Environment variables:**

| Variable | Required | Description |
|---|---|---|
| `BILLING_PROVIDER` | Yes | `mock` (dev/test), `lantu` or `xunhupay` (production) |
| `LANTU_MCH_ID` | When `lantu` | 蓝兔商户号 |
| `LANTU_APP_SECRET` | When `lantu` | 蓝兔应用密钥 |
| `LANTU_API_BASE` | No | Default: `https://api.ltzf.cn` |
| `XUNHUPAY_APP_ID` | When `xunhupay` | 虎皮椒 App ID |
| `XUNHUPAY_APP_SECRET` | When `xunhupay` | 虎皮椒 App Secret |
| `XUNHUPAY_API_BASE` | No | Default: `https://api.xunhupay.com` |
| `MOCK_APP_SECRET` | No | Mock provider secret (default: `mock-secret`) |
| `ORDER_TTL_MINUTES` | No | Order expiry in minutes (default: 15) |

**Deployment checklist:**

1. Apply `supabase/migrations/0003_billing.sql` (adds `orders` table, `fulfill_order` and `adjust_credits` RPCs).
2. Set `BILLING_PROVIDER=mock` and deploy to verify the checkout flow end-to-end.
3. Register with 蓝兔 or 虎皮椒, obtain merchant credentials, and set `BILLING_PROVIDER` accordingly (`lantu` or `xunhupay`) with the platform keys.
4. Configure the webhook URL `https://YOUR_DOMAIN/api/webhooks/lantu` on the payment platform.
5. Run a small real payment test (self-purchase) to verify the full callback → fulfillment → credit grant flow.

**Manual credit adjustment:**

Admins can adjust credits via `/admin/credits` or the Supabase dashboard. The `adjust_credits` RPC ensures atomicity and correct event type (`admin_adjustment`). This serves as a fallback if the payment platform has issues.

**Platform balance:**

Withdraw aggregator platform balances regularly — these are individual-account aggregators, not official merchant accounts.
