-- Agent workbench: sessions, message traces, and generation lineage.

create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '新会话',
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index if not exists agent_sessions_user_last_idx
  on public.agent_sessions (user_id, last_message_at desc);

alter table public.agent_sessions enable row level security;

-- Users may read their own sessions; all writes go through the service role.
drop policy if exists "Users read own agent sessions" on public.agent_sessions;
create policy "Users read own agent sessions"
  on public.agent_sessions for select
  using (auth.uid() = user_id);

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  -- Ordered trace of steps / tool calls / costs for the assistant turn.
  trace jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_messages_session_created_idx
  on public.agent_messages (session_id, created_at);

alter table public.agent_messages enable row level security;

-- Messages are readable only through a session owned by the caller.
drop policy if exists "Users read own agent messages" on public.agent_messages;
create policy "Users read own agent messages"
  on public.agent_messages for select
  using (
    exists (
      select 1 from public.agent_sessions s
      where s.id = agent_messages.session_id and s.user_id = auth.uid()
    )
  );

-- Generation lineage: classic rows keep origin 'classic' and null parents.
alter table public.generations
  add column if not exists agent_session_id uuid
    references public.agent_sessions(id) on delete set null;

alter table public.generations
  add column if not exists parent_generation_id uuid
    references public.generations(id) on delete set null;

alter table public.generations
  add column if not exists origin text not null default 'classic';

alter table public.generations
  add column if not exists edit_instruction text;

-- Enforce origin values once the column exists (safe to re-run).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'generations_origin_check'
  ) then
    alter table public.generations
      add constraint generations_origin_check
      check (origin in ('classic', 'agent', 'agent_edit', 'agent_variant'));
  end if;
end $$;

create index if not exists generations_parent_idx
  on public.generations (parent_generation_id);

create index if not exists generations_agent_session_idx
  on public.generations (agent_session_id);

-- Replace record_successful_generation with a lineage-aware overload.
-- Parameter defaults keep the classic 8-argument call sites (generate route)
-- behaviorally identical; the function identity changes, so revoke/grant both.
drop function if exists public.record_successful_generation(
  uuid, text, text, text, text, text, jsonb, text
);

create or replace function public.record_successful_generation(
  p_user_id uuid,
  p_image_url text,
  p_storage_path text,
  p_final_prompt text,
  p_input_subject text,
  p_input_extra text,
  p_options_json jsonb,
  p_aspect_ratio text,
  p_agent_session_id uuid default null,
  p_parent_generation_id uuid default null,
  p_origin text default 'classic',
  p_edit_instruction text default null
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
    options_json, aspect_ratio, status,
    agent_session_id, parent_generation_id, origin, edit_instruction
  )
  values (
    p_user_id, p_image_url, p_storage_path, p_final_prompt, p_input_subject, p_input_extra,
    p_options_json, p_aspect_ratio, 'succeeded',
    p_agent_session_id, p_parent_generation_id, p_origin, p_edit_instruction
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
  uuid, text, text, text, text, text, jsonb, text,
  uuid, uuid, text, text
) from public;

grant execute on function public.record_successful_generation(
  uuid, text, text, text, text, text, jsonb, text,
  uuid, uuid, text, text
) to service_role;
