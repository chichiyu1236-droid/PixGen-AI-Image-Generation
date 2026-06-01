# Supabase Setup

1. Create a Supabase project.
2. Run `supabase/migrations/0001_initial.sql` in the SQL editor or through the Supabase CLI.
3. Enable Google OAuth in Authentication > Providers.
4. Add local callback URL: `http://localhost:3000/auth/callback`.
5. Add production callback URL after Vercel deployment: `https://YOUR_DOMAIN/auth/callback`.
6. Create a Storage bucket named `generated-images`.
7. Set the bucket to public for the MVP.

The app uses `SUPABASE_SERVICE_ROLE_KEY` only in server code for the generation flow.
