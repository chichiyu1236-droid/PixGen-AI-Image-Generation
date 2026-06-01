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

revoke execute on function public.record_successful_generation(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text
) from public;

grant execute on function public.record_successful_generation(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text
) to service_role;
