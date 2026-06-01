# AI Image Generation MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a deployable Next.js + Supabase + OpenAI MVP for structured AI image generation with Google login, credits, generation history, and an upgrade placeholder.

**Architecture:** The app uses Next.js App Router for pages and server routes, Supabase for Auth/Postgres/Storage, and the OpenAI Images API behind a server-only route. Credit mutation is centralized in a Postgres RPC so successful generation, history persistence, and credit ledger writes stay consistent.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, Vitest, Playwright, Supabase Auth/Postgres/Storage, OpenAI Node SDK, Zod, Vercel.

---

## File Structure

- `package.json`: scripts and runtime dependencies.
- `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `tailwind.config.ts`, `vitest.config.ts`, `playwright.config.ts`: project tooling.
- `app/layout.tsx`, `app/globals.css`: app shell and global styling.
- `app/page.tsx`: home page.
- `app/login/page.tsx`: login page with Google OAuth button.
- `app/auth/callback/route.ts`: Supabase OAuth callback.
- `app/generate/page.tsx`: authenticated generation workspace.
- `app/history/page.tsx`: authenticated generation history.
- `app/upgrade/page.tsx`: upgrade placeholder.
- `app/api/generate/route.ts`: authenticated generation API.
- `components/auth-button.tsx`: Google login and logout controls.
- `components/credit-badge.tsx`: current credit balance display.
- `components/generation-form.tsx`: structured generation form and result state.
- `components/history-grid.tsx`: history list/grid.
- `components/upgrade-prompt.tsx`: insufficient-credit prompt.
- `lib/env.ts`: environment validation.
- `lib/prompts/options.ts`: option definitions and labels.
- `lib/prompts/builder.ts`: final prompt builder.
- `lib/openai/images.ts`: OpenAI image wrapper.
- `lib/supabase/browser.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`: Supabase clients.
- `lib/auth/profile.ts`: profile bootstrap and credit reads.
- `lib/storage/images.ts`: generated image upload helper.
- `lib/validation/generate.ts`: request schema.
- `types/database.ts`: generated-style database types for first implementation.
- `supabase/migrations/0001_initial.sql`: tables, RLS, triggers, and RPC.
- `supabase/README.md`: Supabase setup instructions.
- `tests/prompts/builder.test.ts`: prompt builder tests.
- `tests/validation/generate.test.ts`: request validation tests.
- `tests/api/generate-route.test.ts`: route behavior tests with mocks.
- `tests/db/rls-notes.md`: manual RLS verification checklist.
- `e2e/smoke.spec.ts`: basic unauthenticated UI smoke test.
- `.env.example`: required environment variables.
- `README.md`: local development and deployment instructions.

---

### Task 1: Scaffold Next.js App and Tooling

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Create the project manifest**

Create `package.json`:

```json
{
  "name": "ai-image-generation",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@supabase/ssr": "^0.6.1",
    "@supabase/supabase-js": "^2.49.4",
    "lucide-react": "^0.468.0",
    "next": "^15.3.3",
    "openai": "^5.0.1",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "zod": "^3.25.30"
  },
  "devDependencies": {
    "@playwright/test": "^1.52.0",
    "@testing-library/react": "^16.3.0",
    "@types/node": "^22.15.29",
    "@types/react": "^19.1.6",
    "@types/react-dom": "^19.1.5",
    "autoprefixer": "^10.4.21",
    "eslint": "^9.27.0",
    "eslint-config-next": "^15.3.3",
    "jsdom": "^26.1.0",
    "postcss": "^8.5.6",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.8.3",
    "vitest": "^3.1.4"
  }
}
```

- [ ] **Step 2: Create config files**

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `postcss.config.mjs`:

```js
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

Create `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#141414",
        paper: "#fbfaf7",
        moss: "#5c6f59",
        clay: "#b76e4c",
        steel: "#496a81",
      },
    },
  },
  plugins: [],
};

export default config;
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
```

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
```

- [ ] **Step 3: Create environment and ignore files**

Create `.env.example`:

```bash
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-1.5
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Create `.gitignore`:

```gitignore
node_modules
.next
.vercel
.env
.env*.local
coverage
test-results
playwright-report
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: packages install and `package-lock.json` is created.

- [ ] **Step 5: Verify tooling baseline**

Run: `npm run typecheck`

Expected: TypeScript reports no source files or only Next-generated setup requirements. If `next-env.d.ts` is missing, run `npm run dev` once, stop it, then run `npm run typecheck` again.

- [ ] **Step 6: Commit**

Run:

```bash
git add package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs tailwind.config.ts vitest.config.ts playwright.config.ts .env.example .gitignore
git commit -m "chore: scaffold next app tooling"
```

---

### Task 2: Add Prompt Options, Validation, and Tests

**Files:**
- Create: `lib/prompts/options.ts`
- Create: `lib/prompts/builder.ts`
- Create: `lib/validation/generate.ts`
- Create: `tests/prompts/builder.test.ts`
- Create: `tests/validation/generate.test.ts`

- [ ] **Step 1: Write failing prompt builder tests**

Create `tests/prompts/builder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildImagePrompt } from "@/lib/prompts/builder";

describe("buildImagePrompt", () => {
  it("builds a stable English prompt from Chinese UI option IDs and user text", () => {
    const prompt = buildImagePrompt({
      imageType: "ecommerce_hero",
      aspectRatio: "square",
      style: "premium_minimal",
      scene: "studio",
      whitespace: "top_space",
      subject: "一瓶高端护肤精华，透明玻璃瓶，银色瓶盖",
      extra: "背景干净，适合小红书广告图",
    });

    expect(prompt).toContain("premium ecommerce product hero image");
    expect(prompt).toContain("premium minimal commercial photography");
    expect(prompt).toContain("clean professional studio environment");
    expect(prompt).toContain("square 1:1 composition");
    expect(prompt).toContain("leave clean negative space near the top");
    expect(prompt).toContain("一瓶高端护肤精华");
    expect(prompt).toContain("free of text unless explicitly requested");
  });

  it("omits the extra requirements sentence when extra is blank", () => {
    const prompt = buildImagePrompt({
      imageType: "social_post",
      aspectRatio: "portrait",
      style: "soft_realistic",
      scene: "lifestyle",
      whitespace: "balanced",
      subject: "一杯冰拿铁",
      extra: "",
    });

    expect(prompt).not.toContain("Additional requirements:");
    expect(prompt).toContain("vertical 4:5 composition");
  });
});
```

- [ ] **Step 2: Write failing validation tests**

Create `tests/validation/generate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateRequestSchema } from "@/lib/validation/generate";

describe("generateRequestSchema", () => {
  it("accepts a complete request", () => {
    const result = generateRequestSchema.safeParse({
      imageType: "ecommerce_hero",
      aspectRatio: "square",
      style: "premium_minimal",
      scene: "studio",
      whitespace: "balanced",
      subject: "一双白色运动鞋",
      extra: "需要高级感",
    });

    expect(result.success).toBe(true);
  });

  it("rejects blank subject text", () => {
    const result = generateRequestSchema.safeParse({
      imageType: "ecommerce_hero",
      aspectRatio: "square",
      style: "premium_minimal",
      scene: "studio",
      whitespace: "balanced",
      subject: "  ",
      extra: "",
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/prompts/builder.test.ts tests/validation/generate.test.ts`

Expected: FAIL because `lib/prompts/builder` and `lib/validation/generate` do not exist.

- [ ] **Step 4: Implement prompt options and builder**

Create `lib/prompts/options.ts`:

```ts
export const imageTypes = {
  ecommerce_hero: {
    label: "电商主图",
    prompt: "premium ecommerce product hero image",
  },
  social_post: {
    label: "社交媒体图",
    prompt: "polished social media campaign image",
  },
  poster: {
    label: "宣传海报",
    prompt: "commercial poster-style promotional image",
  },
} as const;

export const aspectRatios = {
  square: {
    label: "1:1",
    prompt: "square 1:1 composition",
    size: "1024x1024",
  },
  portrait: {
    label: "4:5",
    prompt: "vertical 4:5 composition",
    size: "1024x1536",
  },
  landscape: {
    label: "16:9",
    prompt: "wide horizontal composition",
    size: "1536x1024",
  },
} as const;

export const styles = {
  premium_minimal: {
    label: "高级极简",
    prompt: "premium minimal commercial photography",
  },
  soft_realistic: {
    label: "柔和写实",
    prompt: "soft realistic editorial photography",
  },
  vibrant_ad: {
    label: "鲜明广告",
    prompt: "vibrant high-impact advertising visual",
  },
} as const;

export const scenes = {
  studio: {
    label: "影棚",
    prompt: "clean professional studio environment",
  },
  lifestyle: {
    label: "生活方式",
    prompt: "natural lifestyle environment with believable context",
  },
  outdoor: {
    label: "户外",
    prompt: "refined outdoor environment with natural light",
  },
} as const;

export const whitespaceOptions = {
  balanced: {
    label: "自然平衡",
    prompt: "balanced composition with comfortable breathing room",
  },
  top_space: {
    label: "顶部留白",
    prompt: "leave clean negative space near the top",
  },
  left_space: {
    label: "左侧留白",
    prompt: "leave clean negative space on the left side",
  },
  right_space: {
    label: "右侧留白",
    prompt: "leave clean negative space on the right side",
  },
} as const;

export type ImageTypeId = keyof typeof imageTypes;
export type AspectRatioId = keyof typeof aspectRatios;
export type StyleId = keyof typeof styles;
export type SceneId = keyof typeof scenes;
export type WhitespaceId = keyof typeof whitespaceOptions;
```

Create `lib/prompts/builder.ts`:

```ts
import {
  aspectRatios,
  imageTypes,
  scenes,
  styles,
  whitespaceOptions,
  type AspectRatioId,
  type ImageTypeId,
  type SceneId,
  type StyleId,
  type WhitespaceId,
} from "@/lib/prompts/options";

export type PromptInput = {
  imageType: ImageTypeId;
  aspectRatio: AspectRatioId;
  style: StyleId;
  scene: SceneId;
  whitespace: WhitespaceId;
  subject: string;
  extra?: string;
};

export function buildImagePrompt(input: PromptInput) {
  const lines = [
    `Create a high-quality ${imageTypes[input.imageType].prompt} in ${styles[input.style].prompt} style.`,
    `Main subject: ${input.subject.trim()}.`,
    `Scene and environment: ${scenes[input.scene].prompt}.`,
    `Composition: ${aspectRatios[input.aspectRatio].prompt}, ${whitespaceOptions[input.whitespace].prompt}.`,
  ];

  const extra = input.extra?.trim();
  if (extra) {
    lines.push(`Additional requirements: ${extra}.`);
  }

  lines.push("The image should be commercially usable, visually polished, coherent, and free of text unless explicitly requested.");

  return lines.join("\n");
}
```

- [ ] **Step 5: Implement request validation**

Create `lib/validation/generate.ts`:

```ts
import { z } from "zod";
import { aspectRatios, imageTypes, scenes, styles, whitespaceOptions } from "@/lib/prompts/options";

const enumKeys = <T extends Record<string, unknown>>(value: T) => Object.keys(value) as [keyof T & string, ...(keyof T & string)[]];

export const generateRequestSchema = z.object({
  imageType: z.enum(enumKeys(imageTypes)),
  aspectRatio: z.enum(enumKeys(aspectRatios)),
  style: z.enum(enumKeys(styles)),
  scene: z.enum(enumKeys(scenes)),
  whitespace: z.enum(enumKeys(whitespaceOptions)),
  subject: z.string().trim().min(2).max(500),
  extra: z.string().trim().max(800).optional().default(""),
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/prompts/builder.test.ts tests/validation/generate.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add lib/prompts lib/validation tests/prompts tests/validation
git commit -m "feat: add prompt builder and generation validation"
```

---

### Task 3: Add Supabase Schema, RLS, and Credit RPC

**Files:**
- Create: `supabase/migrations/0001_initial.sql`
- Create: `supabase/README.md`
- Create: `types/database.ts`
- Create: `tests/db/rls-notes.md`

- [ ] **Step 1: Create the initial migration**

Create `supabase/migrations/0001_initial.sql`:

```sql
create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  credits integer not null default 5 check (credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text,
  storage_path text,
  final_prompt text not null,
  input_subject text not null,
  input_extra text,
  options_json jsonb not null,
  aspect_ratio text not null,
  status text not null check (status in ('succeeded', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create table public.credit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references public.generations(id) on delete set null,
  type text not null check (type in ('signup_bonus', 'generation_charge')),
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.generations enable row level security;
alter table public.credit_events enable row level security;

create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users read own generations"
  on public.generations for select
  using (auth.uid() = user_id);

create policy "Users read own credit events"
  on public.credit_events for select
  using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url, credits)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    5
  )
  on conflict (id) do nothing;

  insert into public.credit_events (user_id, type, amount, reason)
  values (new.id, 'signup_bonus', 5, 'New user signup bonus')
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.record_successful_generation(
  p_user_id uuid,
  p_image_url text,
  p_storage_path text,
  p_final_prompt text,
  p_input_subject text,
  p_input_extra text,
  p_options_json jsonb,
  p_aspect_ratio text
)
returns public.generations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_credits integer;
  created_generation public.generations;
begin
  select credits into current_credits
  from public.profiles
  where id = p_user_id
  for update;

  if current_credits is null then
    raise exception 'profile_not_found';
  end if;

  if current_credits < 1 then
    raise exception 'insufficient_credits';
  end if;

  insert into public.generations (
    user_id, image_url, storage_path, final_prompt, input_subject, input_extra,
    options_json, aspect_ratio, status
  )
  values (
    p_user_id, p_image_url, p_storage_path, p_final_prompt, p_input_subject, p_input_extra,
    p_options_json, p_aspect_ratio, 'succeeded'
  )
  returning * into created_generation;

  update public.profiles
  set credits = credits - 1,
      updated_at = now()
  where id = p_user_id;

  insert into public.credit_events (user_id, generation_id, type, amount, reason)
  values (p_user_id, created_generation.id, 'generation_charge', -1, 'Image generation');

  return created_generation;
end;
$$;
```

- [ ] **Step 2: Create database type file**

Create `types/database.ts`:

```ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          credits: number;
          created_at: string;
          updated_at: string;
        };
      };
      generations: {
        Row: {
          id: string;
          user_id: string;
          image_url: string | null;
          storage_path: string | null;
          final_prompt: string;
          input_subject: string;
          input_extra: string | null;
          options_json: Json;
          aspect_ratio: string;
          status: "succeeded" | "failed";
          error_message: string | null;
          created_at: string;
        };
      };
      credit_events: {
        Row: {
          id: string;
          user_id: string;
          generation_id: string | null;
          type: "signup_bonus" | "generation_charge";
          amount: number;
          reason: string;
          created_at: string;
        };
      };
    };
    Functions: {
      record_successful_generation: {
        Args: {
          p_user_id: string;
          p_image_url: string;
          p_storage_path: string;
          p_final_prompt: string;
          p_input_subject: string;
          p_input_extra: string;
          p_options_json: Json;
          p_aspect_ratio: string;
        };
        Returns: Database["public"]["Tables"]["generations"]["Row"];
      };
    };
  };
};
```

- [ ] **Step 3: Document Supabase setup and manual RLS checks**

Create `supabase/README.md`:

```md
# Supabase Setup

1. Create a Supabase project.
2. Run `supabase/migrations/0001_initial.sql` in the SQL editor or through the Supabase CLI.
3. Enable Google OAuth in Authentication > Providers.
4. Add local callback URL: `http://localhost:3000/auth/callback`.
5. Add production callback URL after Vercel deployment: `https://YOUR_DOMAIN/auth/callback`.
6. Create a Storage bucket named `generated-images`.
7. Set the bucket to public for the MVP.

The app uses `SUPABASE_SERVICE_ROLE_KEY` only in server code for the generation flow.
```

Create `tests/db/rls-notes.md`:

```md
# Manual RLS Checks

- User A can select their own row from `profiles`.
- User A cannot select User B's row from `profiles`.
- User A can select their own rows from `generations`.
- User A cannot select User B's rows from `generations`.
- User A can select their own rows from `credit_events`.
- User A cannot insert or update `profiles.credits` from the browser client.
- `record_successful_generation` deducts 1 credit and creates one `credit_events` row.
- `record_successful_generation` raises `insufficient_credits` when credits are 0.
```

- [ ] **Step 4: Commit**

Run:

```bash
git add supabase types tests/db
git commit -m "feat: add supabase schema and credit ledger"
```

---

### Task 4: Add Supabase, Environment, Auth, Storage, and OpenAI Helpers

**Files:**
- Create: `lib/env.ts`
- Create: `lib/supabase/browser.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/admin.ts`
- Create: `lib/auth/profile.ts`
- Create: `lib/storage/images.ts`
- Create: `lib/openai/images.ts`

- [ ] **Step 1: Implement environment validation**

Create `lib/env.ts`:

```ts
import { z } from "zod";

const serverEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-1.5"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

export function getServerEnv() {
  return serverEnvSchema.parse(process.env);
}
```

- [ ] **Step 2: Implement Supabase clients**

Create `lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

Create `lib/supabase/server.ts`:

```ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server components cannot always set cookies; route handlers can.
          }
        },
      },
    },
  );
}
```

Create `lib/supabase/admin.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export function createSupabaseAdminClient() {
  const env = getServerEnv();

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
```

- [ ] **Step 3: Implement profile and storage helpers**

Create `lib/auth/profile.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function getProfileCredits(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", userId)
    .single();

  if (error) {
    throw new Error(`Unable to load credits: ${error.message}`);
  }

  return data.credits;
}
```

Create `lib/storage/images.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const BUCKET = "generated-images";

export async function uploadGeneratedImage(
  supabase: SupabaseClient<Database>,
  input: { userId: string; base64Image: string; contentType?: string },
) {
  const contentType = input.contentType ?? "image/png";
  const bytes = Buffer.from(input.base64Image, "base64");
  const storagePath = `${input.userId}/${crypto.randomUUID()}.png`;

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Unable to upload image: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  return {
    storagePath,
    imageUrl: data.publicUrl,
  };
}
```

- [ ] **Step 4: Implement OpenAI image wrapper**

Create `lib/openai/images.ts`:

```ts
import OpenAI from "openai";
import { getServerEnv } from "@/lib/env";

export async function generateImageBase64(input: { prompt: string; size: string }) {
  const env = getServerEnv();
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const response = await openai.images.generate({
    model: env.OPENAI_IMAGE_MODEL,
    prompt: input.prompt,
    quality: "high",
    n: 1,
    size: input.size as "1024x1024" | "1024x1536" | "1536x1024",
  });

  const image = response.data?.[0]?.b64_json;

  if (!image) {
    throw new Error("OpenAI did not return an image.");
  }

  return image;
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

Expected: PASS after dependencies are installed.

- [ ] **Step 6: Commit**

Run:

```bash
git add lib/env.ts lib/supabase lib/auth lib/storage lib/openai
git commit -m "feat: add service clients and image helpers"
```

---

### Task 5: Implement Auth Callback, Generate API, and Route Tests

**Files:**
- Create: `app/auth/callback/route.ts`
- Create: `app/api/generate/route.ts`
- Create: `tests/api/generate-route.test.ts`

- [ ] **Step 1: Write route tests for request-level failures**

Create `tests/api/generate-route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate/route";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  })),
}));

describe("POST /api/generate", () => {
  it("rejects unauthenticated users", async () => {
    const request = new Request("http://localhost/api/generate", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("not_authenticated");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/api/generate-route.test.ts`

Expected: FAIL because `app/api/generate/route.ts` does not exist.

- [ ] **Step 3: Implement auth callback**

Create `app/auth/callback/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/generate";

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
```

- [ ] **Step 4: Implement generation API**

Create `app/api/generate/route.ts`:

```ts
import { NextResponse } from "next/server";
import { aspectRatios } from "@/lib/prompts/options";
import { buildImagePrompt } from "@/lib/prompts/builder";
import { generateRequestSchema } from "@/lib/validation/generate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getProfileCredits } from "@/lib/auth/profile";
import { generateImageBase64 } from "@/lib/openai/images";
import { uploadGeneratedImage } from "@/lib/storage/images";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const parsed = generateRequestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const credits = await getProfileCredits(admin, user.id);

  if (credits < 1) {
    return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });
  }

  const finalPrompt = buildImagePrompt(parsed.data);
  const base64Image = await generateImageBase64({
    prompt: finalPrompt,
    size: aspectRatios[parsed.data.aspectRatio].size,
  });
  const uploaded = await uploadGeneratedImage(admin, { userId: user.id, base64Image });

  const { data: generation, error } = await admin.rpc("record_successful_generation", {
    p_user_id: user.id,
    p_image_url: uploaded.imageUrl,
    p_storage_path: uploaded.storagePath,
    p_final_prompt: finalPrompt,
    p_input_subject: parsed.data.subject,
    p_input_extra: parsed.data.extra,
    p_options_json: parsed.data,
    p_aspect_ratio: parsed.data.aspectRatio,
  });

  if (error) {
    return NextResponse.json({ error: "generation_record_failed" }, { status: 500 });
  }

  return NextResponse.json({ generation });
}
```

- [ ] **Step 5: Run route tests and typecheck**

Run:

```bash
npm test -- tests/api/generate-route.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add app/auth app/api tests/api
git commit -m "feat: add auth callback and generation api"
```

---

### Task 6: Build App Shell, Home, Login, and Upgrade Pages

**Files:**
- Create: `app/layout.tsx`
- Create: `app/globals.css`
- Create: `app/page.tsx`
- Create: `app/login/page.tsx`
- Create: `app/upgrade/page.tsx`
- Create: `components/auth-button.tsx`

- [ ] **Step 1: Implement global shell and styling**

Create `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PromptCraft Image",
  description: "Structured AI image generation for polished commercial visuals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

Create `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color: #141414;
  background: #fbfaf7;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: Arial, "Microsoft YaHei", sans-serif;
}

button,
input,
textarea,
select {
  font: inherit;
}
```

- [ ] **Step 2: Implement auth button**

Create `components/auth-button.tsx`:

```tsx
"use client";

import { LogIn, LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function GoogleLoginButton({ next = "/generate" }: { next?: string }) {
  async function signIn() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  return (
    <button onClick={signIn} className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
      <LogIn size={18} />
      Google 登录
    </button>
  );
}

export function LogoutButton() {
  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <button onClick={signOut} className="inline-flex items-center gap-2 rounded-md border border-ink/20 px-3 py-2 text-sm">
      <LogOut size={16} />
      退出
    </button>
  );
}
```

- [ ] **Step 3: Implement public pages**

Create `app/page.tsx`:

```tsx
import Link from "next/link";
import { GoogleLoginButton } from "@/components/auth-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-paper">
      <section className="mx-auto grid min-h-screen max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[1fr_460px] lg:items-center">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-clay">Structured GPT Image generation</p>
          <h1 className="max-w-3xl text-5xl font-bold leading-tight text-ink">勾选需求，生成更专业的商业图片</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-ink/70">
            选择图片类型、比例、风格、场景和留白，再填写主体。系统会自动组装专业提示词并生成高质量图片。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {user ? (
              <Link className="rounded-md bg-ink px-5 py-3 font-semibold text-white" href="/generate">
                开始生成
              </Link>
            ) : (
              <GoogleLoginButton />
            )}
            <Link className="rounded-md border border-ink/20 px-5 py-3 font-semibold" href="/history">
              查看历史
            </Link>
          </div>
        </div>
        <div className="grid aspect-[4/5] content-end rounded-lg bg-[linear-gradient(145deg,#496a81,#b76e4c)] p-6 text-white shadow-2xl">
          <div>
            <p className="text-sm uppercase tracking-wide opacity-80">Example output</p>
            <h2 className="mt-2 text-3xl font-bold">Premium product visual</h2>
            <p className="mt-3 text-sm leading-6 opacity-85">A realistic preview area for generated examples after the first production images exist.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
```

Create `app/login/page.tsx`:

```tsx
import { GoogleLoginButton } from "@/components/auth-button";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6">
      <section className="w-full max-w-sm rounded-lg border border-ink/10 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">登录后开始生成</h1>
        <p className="mt-3 text-sm leading-6 text-ink/70">第一版仅支持 Google 登录。新用户会自动获得 5 个积分。</p>
        <div className="mt-6">
          <GoogleLoginButton />
        </div>
      </section>
    </main>
  );
}
```

Create `app/upgrade/page.tsx`:

```tsx
import Link from "next/link";

export default function UpgradePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6">
      <section className="max-w-lg rounded-lg border border-ink/10 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-clay">Credits</p>
        <h1 className="mt-2 text-3xl font-bold">升级入口即将开放</h1>
        <p className="mt-4 leading-7 text-ink/70">当前版本暂不接入真实支付。后续你可以在这里获取更多生成积分。</p>
        <Link className="mt-6 inline-block rounded-md bg-ink px-5 py-3 font-semibold text-white" href="/generate">
          返回生成页
        </Link>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add app/layout.tsx app/globals.css app/page.tsx app/login app/upgrade components/auth-button.tsx
git commit -m "feat: add public app shell and auth pages"
```

---

### Task 7: Build Generation Workspace

**Files:**
- Create: `components/credit-badge.tsx`
- Create: `components/upgrade-prompt.tsx`
- Create: `components/generation-form.tsx`
- Create: `app/generate/page.tsx`

- [ ] **Step 1: Implement credit and upgrade components**

Create `components/credit-badge.tsx`:

```tsx
export function CreditBadge({ credits }: { credits: number }) {
  return (
    <div className="rounded-md border border-ink/10 bg-white px-3 py-2 text-sm font-semibold">
      剩余积分：{credits}
    </div>
  );
}
```

Create `components/upgrade-prompt.tsx`:

```tsx
import Link from "next/link";

export function UpgradePrompt() {
  return (
    <div className="rounded-lg border border-clay/30 bg-white p-4">
      <h2 className="font-semibold">积分不足</h2>
      <p className="mt-2 text-sm leading-6 text-ink/70">你当前没有可用积分。升级入口已预留，支付功能将在后续版本开放。</p>
      <Link className="mt-4 inline-block rounded-md bg-clay px-4 py-2 text-sm font-semibold text-white" href="/upgrade">
        查看升级入口
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Implement generation form**

Create `components/generation-form.tsx`:

```tsx
"use client";

import { Download, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { aspectRatios, imageTypes, scenes, styles, whitespaceOptions } from "@/lib/prompts/options";
import { UpgradePrompt } from "@/components/upgrade-prompt";

type GenerationResult = {
  generation: {
    image_url: string | null;
  };
};

export function GenerationForm({ credits }: { credits: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    if (credits < 1) {
      setError("insufficient_credits");
      return;
    }

    setLoading(true);
    setError(null);
    setImageUrl(null);

    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as GenerationResult | { error: string };

    setLoading(false);

    if (!response.ok) {
      setError("error" in body ? body.error : "generation_failed");
      return;
    }

    setImageUrl((body as GenerationResult).generation.image_url);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <form action={onSubmit} className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
        <div className="grid gap-4">
          <SelectField name="imageType" label="图片类型" options={imageTypes} />
          <SelectField name="aspectRatio" label="比例" options={aspectRatios} />
          <SelectField name="style" label="风格" options={styles} />
          <SelectField name="scene" label="场景" options={scenes} />
          <SelectField name="whitespace" label="留白" options={whitespaceOptions} />
          <label className="grid gap-2 text-sm font-semibold">
            主体描述
            <textarea name="subject" required minLength={2} className="min-h-24 rounded-md border border-ink/15 p-3 font-normal" placeholder="例如：一瓶高端护肤精华，透明玻璃瓶，银色瓶盖" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            补充要求
            <textarea name="extra" className="min-h-20 rounded-md border border-ink/15 p-3 font-normal" placeholder="例如：背景干净，适合广告图" />
          </label>
        </div>
        <button disabled={loading || credits < 1} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
          生成图片
        </button>
      </form>

      <section className="min-h-[520px] rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
        {credits < 1 || error === "insufficient_credits" ? <UpgradePrompt /> : null}
        {error && error !== "insufficient_credits" ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">生成失败，请稍后重试。</p> : null}
        {imageUrl ? (
          <div>
            <img className="w-full rounded-md border border-ink/10" src={imageUrl} alt="Generated result" />
            <a href={imageUrl} download className="mt-4 inline-flex items-center gap-2 rounded-md border border-ink/20 px-4 py-2 text-sm font-semibold">
              <Download size={16} />
              下载图片
            </a>
          </div>
        ) : (
          <div className="grid h-full min-h-[420px] place-items-center text-center text-ink/50">生成结果会显示在这里</div>
        )}
      </section>
    </div>
  );
}

function SelectField<T extends Record<string, { label: string }>>({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: T;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <select name={name} className="rounded-md border border-ink/15 bg-white p-3 font-normal">
        {Object.entries(options).map(([value, option]) => (
          <option key={value} value={value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 3: Implement authenticated generation page**

Create `app/generate/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditBadge } from "@/components/credit-badge";
import { GenerationForm } from "@/components/generation-form";
import { LogoutButton } from "@/components/auth-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function GeneratePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("credits").eq("id", user.id).single();
  const credits = profile?.credits ?? 0;

  return (
    <main className="min-h-screen bg-paper px-6 py-6">
      <header className="mx-auto mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">AI 图片生成</h1>
          <p className="mt-1 text-sm text-ink/60">用结构化选项生成专业 GPT Image 提示词。</p>
        </div>
        <nav className="flex items-center gap-3">
          <CreditBadge credits={credits} />
          <Link className="rounded-md border border-ink/20 px-3 py-2 text-sm" href="/history">历史</Link>
          <LogoutButton />
        </nav>
      </header>
      <div className="mx-auto max-w-6xl">
        <GenerationForm credits={credits} />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add app/generate components/credit-badge.tsx components/upgrade-prompt.tsx components/generation-form.tsx
git commit -m "feat: add generation workspace"
```

---

### Task 8: Build Generation History

**Files:**
- Create: `components/history-grid.tsx`
- Create: `app/history/page.tsx`

- [ ] **Step 1: Implement history grid**

Create `components/history-grid.tsx`:

```tsx
import type { Database } from "@/types/database";

type Generation = Database["public"]["Tables"]["generations"]["Row"];

export function HistoryGrid({ generations }: { generations: Generation[] }) {
  if (generations.length === 0) {
    return <div className="rounded-lg border border-ink/10 bg-white p-8 text-center text-ink/60">还没有生成记录。</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {generations.map((item) => (
        <article key={item.id} className="rounded-lg border border-ink/10 bg-white p-4 shadow-sm">
          {item.image_url ? <img className="aspect-square w-full rounded-md object-cover" src={item.image_url} alt={item.input_subject} /> : null}
          <p className="mt-3 text-sm text-ink/50">{new Date(item.created_at).toLocaleString("zh-CN")}</p>
          <h2 className="mt-2 line-clamp-2 font-semibold">{item.input_subject}</h2>
          {item.input_extra ? <p className="mt-2 line-clamp-2 text-sm text-ink/60">{item.input_extra}</p> : null}
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold">查看最终提示词</summary>
            <p className="mt-2 whitespace-pre-wrap rounded-md bg-paper p-3 text-ink/70">{item.final_prompt}</p>
          </details>
          {item.image_url ? (
            <a className="mt-4 inline-block rounded-md border border-ink/20 px-3 py-2 text-sm font-semibold" href={item.image_url} download>
              下载
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Implement authenticated history page**

Create `app/history/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { HistoryGrid } from "@/components/history-grid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HistoryPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: generations } = await supabase
    .from("generations")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-paper px-6 py-6">
      <header className="mx-auto mb-6 flex max-w-6xl items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">生成历史</h1>
          <p className="mt-1 text-sm text-ink/60">查看已保存的图片和最终提示词。</p>
        </div>
        <Link className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white" href="/generate">
          返回生成
        </Link>
      </header>
      <div className="mx-auto max-w-6xl">
        <HistoryGrid generations={generations ?? []} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add app/history components/history-grid.tsx
git commit -m "feat: add generation history"
```

---

### Task 9: Add E2E Smoke Test, README, and Final Verification

**Files:**
- Create: `e2e/smoke.spec.ts`
- Create: `README.md`
- Modify: existing files only if verification exposes specific issues.

- [ ] **Step 1: Add unauthenticated smoke test**

Create `e2e/smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("home page renders and login entry is visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "勾选需求，生成更专业的商业图片" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Google 登录" })).toBeVisible();
});

test("unauthenticated generation page redirects to login", async ({ page }) => {
  await page.goto("/generate");
  await expect(page.getByRole("heading", { name: "登录后开始生成" })).toBeVisible();
});
```

- [ ] **Step 2: Add README**

Create `README.md`:

```md
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

Add the production auth callback URL in Supabase:

```text
https://YOUR_DOMAIN/auth/callback
```
```

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
npm run e2e
```

Expected: all commands pass. If `npm run e2e` cannot run because environment variables are not configured, document the exact missing variables and run `npm run typecheck`, `npm test`, and `npm run build` instead.

- [ ] **Step 4: Commit**

Run:

```bash
git add e2e README.md
git commit -m "docs: add verification and deployment guide"
```

---

## Self-Review

- Spec coverage: The plan covers home, login, generation, history, credits, insufficient-credit upgrade prompt, Supabase Storage, OpenAI server-only generation, deployment variables, RLS, and verification. Excluded features remain out of scope.
- Placeholder scan: The plan contains no unresolved marker phrases. The upgrade placeholder is an intentional product feature from the approved spec.
- Type consistency: Prompt option IDs, validation schema fields, API payload fields, and UI form names use the same names: `imageType`, `aspectRatio`, `style`, `scene`, `whitespace`, `subject`, and `extra`.
- Risk note: OpenAI image model and size support must be verified during implementation against the current official Image API. The model is still environment-controlled so a current supported model can be swapped without UI changes.
