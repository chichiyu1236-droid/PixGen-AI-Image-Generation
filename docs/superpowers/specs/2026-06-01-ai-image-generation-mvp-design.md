# AI Image Generation MVP Design

Date: 2026-06-01
Status: Approved for implementation planning

## Goal

Build a production-ready MVP for an AI image generation website. The product should not ask users to write a complete prompt from scratch. Instead, users choose structured options for image type, aspect ratio, style, scene, and whitespace, then add their own subject and extra requirements. The server turns these inputs into a professional GPT Image prompt and generates one high-quality image through the OpenAI Image API.

The MVP must be real enough to deploy and test with users: Google login, generation history, credit accounting, and an upgrade prompt are included. Real payments, email flows, admin tools, complex SEO, image editing, reference image upload, and model switching are explicitly out of scope.

## Product Scope

### Included

- Home page
- Image generation page
- Google OAuth login through Supabase Auth
- Generation history page
- Credit system
- New user signup bonus of 5 credits
- One successful image generation costs 1 credit
- Insufficient-credit upgrade prompt
- Upgrade placeholder page or modal
- Supabase Storage persistence for generated images
- Server-side prompt assembly
- OpenAI Image API generation with `gpt-image-1.5`, `quality: high`, and one image per request

### Excluded

- Real payment processing
- Email login, transactional email, or marketing email
- Admin dashboard
- Complex SEO/content marketing pages
- Image editing
- Reference image upload
- Multi-model switching
- Public gallery, sharing, favorites, or deletion
- User-selectable generation quality
- Daily credit rewards, invite rewards, or manual recharge tooling

## User Experience

### Home Page

The home page explains the core product value: users create polished AI images by selecting structured requirements rather than writing expert prompts. The first viewport should include the product value, example-image area, and a clear entry button.

If the user is not logged in, the primary action starts Google login. If the user is already logged in, it opens the generation page.

The home page should avoid a large marketing-site buildout in the MVP. No blog, public gallery, complex SEO system, or excessive landing-page sections are required.

### Generation Page

The generation page is the core workspace. It should use a practical tool layout rather than a marketing layout.

The form includes:

- Image type
- Aspect ratio
- Style
- Scene
- Whitespace requirement
- Subject description
- Extra requirements

The page also shows:

- Current credit balance
- Generate button
- Loading state
- Generated image preview
- Download button
- Error states
- Insufficient-credit upgrade prompt

If credits are zero, the user cannot submit a generation request. The UI should show the upgrade prompt before calling the server-side OpenAI flow.

### Login

The MVP supports Google OAuth only. Supabase Auth handles the OAuth flow.

After a successful login, the app ensures the user has a `profiles` row. New users receive 5 credits. Existing users keep their current credit balance.

### Generation History

The history page shows the logged-in user's generated images. Each record should include:

- Thumbnail
- Created time
- User subject input
- User extra requirement input
- Chosen options
- Final assembled prompt, shown through an expandable detail or similar compact affordance
- Download action

The MVP does not include deletion, sharing, public visibility, favorites, or collection management.

### Upgrade Placeholder

When a user has insufficient credits, the app shows an upgrade modal or page. It explains that more credits will be available through an upgrade flow later.

The MVP does not process payments, create subscriptions, manage invoices, or define full paid plans. The upgrade entry exists only to validate user intent and preserve a natural product path.

## Architecture

Use Next.js App Router, Supabase, and Vercel.

### Pages

- `app/page.tsx`: home page
- `app/generate/page.tsx`: generation workspace
- `app/history/page.tsx`: generation history
- `app/upgrade/page.tsx`: upgrade placeholder
- Auth callback route as required by Supabase

### Server API

- `app/api/generate/route.ts`: authenticated image generation endpoint

The generation endpoint:

1. Verifies the current user.
2. Validates the request body.
3. Checks the user's credit balance.
4. Builds the final image prompt from structured inputs.
5. Calls the OpenAI Image API.
6. Uploads the generated image to Supabase Storage.
7. Writes the generation record.
8. Deducts 1 credit.
9. Writes a credit event.
10. Returns the persisted image URL and generation metadata.

### Libraries and Modules

- `lib/supabase/`: browser, server, and admin Supabase clients
- `lib/openai/`: OpenAI image generation wrapper
- `lib/prompts/`: option definitions, English prompt mappings, and prompt builder
- `lib/credits/`: credit checks, deductions, and credit event creation
- `components/`: form, preview, history grid, credit display, and upgrade prompt components
- `supabase/`: migrations, RLS policies, and Storage setup notes

OpenAI calls must only run on the server. `OPENAI_API_KEY` must never be exposed to browser code.

## Data Model

### `profiles`

Stores application-specific user profile and credit balance.

Fields:

- `id`: UUID, primary key, references `auth.users.id`
- `email`: text
- `display_name`: text
- `avatar_url`: text
- `credits`: integer, not null, default 5
- `created_at`: timestamp
- `updated_at`: timestamp

New users receive `credits = 5` when their profile is created.

### `generations`

Stores generation attempts and successful results.

Fields:

- `id`: UUID, primary key
- `user_id`: UUID, references `auth.users.id`
- `image_url`: text
- `storage_path`: text
- `final_prompt`: text
- `input_subject`: text
- `input_extra`: text
- `options_json`: jsonb
- `aspect_ratio`: text
- `status`: text, expected values `succeeded` or `failed`
- `error_message`: text
- `created_at`: timestamp

Successful records include the persisted image URL and final prompt. Failed records may be stored for operational debugging, but failed generations do not cost credits.

### `credit_events`

Stores a clear credit ledger.

Fields:

- `id`: UUID, primary key
- `user_id`: UUID, references `auth.users.id`
- `generation_id`: UUID, nullable reference to `generations.id`
- `type`: text, such as `signup_bonus` or `generation_charge`
- `amount`: integer
- `reason`: text
- `created_at`: timestamp

Signup creates a `signup_bonus` event with `amount = 5`. A successful generation creates a `generation_charge` event with `amount = -1`.

## Permissions and Security

Enable Row Level Security on app tables.

Users can read their own:

- `profiles`
- `generations`
- `credit_events`

Users cannot directly modify credits from the browser. Credit mutation must happen server-side through controlled code using the Supabase service role key.

Generated images should be uploaded to Supabase Storage. For the MVP, use a publicly readable bucket with unguessable randomized paths to keep history rendering simple. A future privacy-focused version can switch to signed URLs.

## Credit Rules

- New user: +5 credits
- Successful generation: -1 credit
- Failed OpenAI generation: no credit charge
- Failed Storage upload: no credit charge
- Insufficient credits: block generation and show upgrade prompt
- Duplicate clicks: disable the button in the UI and guard on the server

The recommended transaction shape is: check credits first, run generation, upload the image, then write the successful generation record and deduct the credit together in a database transaction or RPC. If the transaction fails after image upload, the app should not present the generation as a completed success.

## Prompt Assembly

The user submits structured fields, but the server owns the final prompt.

Input fields:

- Image type
- Aspect ratio
- Style
- Scene
- Whitespace requirement
- Subject description
- Extra requirements

The first prompt template should be fixed in code:

```text
Create a high-quality [image_type] image in [style] style.
Main subject: [subject].
Scene and environment: [scene].
Composition: [aspect_ratio], [whitespace_requirement].
Additional requirements: [extra].
The image should be commercially usable, visually polished, coherent, and free of text unless explicitly requested.
```

UI labels can be Chinese, but server-side mappings should convert selected options into stable English descriptions. For example, an ecommerce hero option can map to `premium ecommerce product hero image`.

The MVP does not include an admin prompt editor.

## OpenAI Image Generation

Use the OpenAI Image API from the server.

Default parameters:

- Model: `gpt-image-1.5`
- Quality: `high`
- Number of images: `1`

The model name should be configured through an environment variable, with `OPENAI_IMAGE_MODEL=gpt-image-1.5` as the default deployment value.

Aspect ratio choices in the UI must map to currently supported Image API sizes. If an exact ratio is unavailable, the app should either hide that option or map it to the closest supported size and label it honestly in the UI.

## Error Handling

### Not Logged In

Reject the API request and guide the user to Google login.

### Invalid Input

Reject the request before calling OpenAI. Show field-level or form-level validation messages.

### Insufficient Credits

Reject the request before calling OpenAI. Show the upgrade prompt.

### OpenAI Failure

Do not deduct credits. Show a retryable error. Optionally write a failed generation record with a sanitized error message.

### Storage Failure

Do not deduct credits. Show a retryable error. Optionally write a failed generation record.

### Database or Credit Mutation Failure

Do not report success to the user. Record enough error context for troubleshooting while avoiding sensitive data exposure.

## Deployment

Deploy the Next.js app on Vercel and use Supabase for Auth, Postgres, and Storage.

Required environment variables:

- `OPENAI_API_KEY`
- `OPENAI_IMAGE_MODEL=gpt-image-1.5`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

Supabase setup:

- Enable Google OAuth.
- Configure production and local callback URLs.
- Create database tables and RLS policies.
- Create the image Storage bucket.

Vercel setup:

- Configure environment variables.
- Set the production domain.
- Ensure server routes can call OpenAI and Supabase.

## Testing and Acceptance Criteria

### Automated Coverage

Cover these areas:

- Prompt builder maps options into a stable final English prompt.
- New users receive 5 credits.
- Successful generation deducts 1 credit.
- Failed generation does not deduct credits.
- Zero-credit users cannot generate.
- Unauthenticated API calls are rejected.
- Invalid form submissions are rejected.
- Users can only read their own history and credit events.

### Manual Acceptance

The MVP is ready when:

- A user can sign in with Google.
- A new user automatically receives 5 credits.
- A user can generate one high-quality image from structured options and free-text subject requirements.
- A successful generation deducts 1 credit.
- The generated image is persisted to Supabase Storage.
- The history page shows the user's generated image and metadata.
- A zero-credit user sees the upgrade prompt instead of triggering OpenAI generation.
- No OpenAI or Supabase service-role secrets are exposed to the browser.
- The app can be deployed to Vercel.

## Implementation Notes

The first implementation should prioritize the end-to-end generation loop over optional polish. The highest-risk areas are server-side credit consistency, Image API response handling, Storage persistence, and RLS policies. Those should receive focused tests before visual refinement.
