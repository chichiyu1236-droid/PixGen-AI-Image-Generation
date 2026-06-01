# AI Image Generation MVP

Production-ready MVP for structured GPT Image generation.

## Stack

- Next.js App Router
- Supabase Auth, Postgres, Storage
- OpenAI Images API
- Vercel

## Local Setup

1. Copy `.env.example` to `.env.local`.
2. Fill in OpenAI and Supabase environment variables.
3. Run `npm install`.
4. Apply `supabase/migrations/0001_initial.sql` to Supabase.
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
- `OPENAI_IMAGE_MODEL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

The default image model is `gpt-image2`. If your OpenAI account or region does not support it, set `OPENAI_IMAGE_MODEL` to another image model available to your account.

Add the production auth callback URL in Supabase:

```text
https://YOUR_DOMAIN/auth/callback
```
