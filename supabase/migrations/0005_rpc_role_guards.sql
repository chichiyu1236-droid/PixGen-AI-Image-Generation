-- Hotfix: Supabase's platform grant manager re-grants EXECUTE on public
-- functions to anon/authenticated after SQL runs, so the 0003/0004 REVOKEs
-- never stick. Guard the money/credit RPCs at runtime by caller role instead:
-- only service_role (app server) and postgres (SQL editor) may execute them.

create or replace function public.fulfill_order(
  p_order_id uuid,
  p_provider_trade_no text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_order public.orders;
  updated_order public.orders;
begin
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then
    raise exception 'rpc_forbidden_for_client_role';
  end if;

  select * into locked_order
  from public.orders
  where id = p_order_id
  for update;

  if locked_order is null then
    raise exception 'order_not_found';
  end if;

  if locked_order.status = 'paid' then
    return locked_order;
  end if;

  if locked_order.status not in ('pending', 'expired') then
    raise exception 'order_not_fulfillable: %', locked_order.status;
  end if;

  update public.orders
  set status = 'paid',
      paid_at = now(),
      provider_trade_no = coalesce(nullif(p_provider_trade_no, ''), provider_trade_no)
  where id = p_order_id
  returning * into updated_order;

  update public.profiles
  set credits = credits + updated_order.credits,
      updated_at = now()
  where id = updated_order.user_id;

  insert into public.credit_events (user_id, type, amount, reason)
  values (
    updated_order.user_id,
    'purchase',
    updated_order.credits,
    'Credit pack purchase order ' || updated_order.id::text
      || ' provider trade ' || coalesce(updated_order.provider_trade_no, 'n/a')
  );

  return updated_order;
end;
$$;

create or replace function public.adjust_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_type text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_credits integer;
  new_credits integer;
begin
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then
    raise exception 'rpc_forbidden_for_client_role';
  end if;

  if p_amount = 0 then
    raise exception 'zero_adjustment';
  end if;

  if p_type not in ('admin_adjustment') then
    raise exception 'invalid_adjustment_type';
  end if;

  select credits into current_credits
  from public.profiles
  where id = p_user_id
  for update;

  if current_credits is null then
    raise exception 'profile_not_found';
  end if;

  if current_credits + p_amount < 0 then
    raise exception 'insufficient_credits';
  end if;

  update public.profiles
  set credits = credits + p_amount,
      updated_at = now()
  where id = p_user_id
  returning credits into new_credits;

  insert into public.credit_events (user_id, type, amount, reason)
  values (p_user_id, p_type, p_amount, p_reason);

  return new_credits;
end;
$$;

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
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then
    raise exception 'rpc_forbidden_for_client_role';
  end if;

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
