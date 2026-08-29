-- Membership: monthly/yearly membership cards backed by a subscription credit
-- pool (profiles.sub_credits) on top of the permanent pool (profiles.credits).
-- Manual-renewal model: each purchase activates or extends the membership
-- window and grants one tranche immediately; yearly cards queue the remaining
-- tranches (FIFO) and grant them lazily on read paths - no cron anywhere.

-- ---------------------------------------------------------------------------
-- profiles: subscription pool columns (permanent pool `credits` untouched)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column sub_credits integer not null default 0 check (sub_credits >= 0),
  add column sub_credits_expires_at timestamptz;

-- ---------------------------------------------------------------------------
-- memberships: one active membership window per user.
-- pending_tranches is a FIFO jsonb array of per-period grant amounts, e.g.
-- [100,100,...] for an unused yearly card right after its first tranche.
-- The head element (index 0) is the next period's grant; skipped periods
-- forfeit head elements; mixed-tier purchases append, so earlier purchases
-- are always honoured before later ones.
-- ---------------------------------------------------------------------------
create table public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null,
  paid_until timestamptz not null,
  next_grant_at timestamptz not null,
  pending_tranches jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.memberships enable row level security;

create policy "Users read own membership"
  on public.memberships for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- orders: kind discriminator + frozen plan snapshot. `pack_id` doubles as the
-- SKU id for both kinds, keeping the reuse/cap queries unchanged; plan orders
-- freeze {planId, quotaPerTranche, tranches, periodDays} so catalog edits
-- never move an in-flight order, and `credits` stores the per-tranche quota
-- so cashier success copy and webhook logs keep working unchanged.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column kind text not null default 'pack'
    check (kind in ('pack', 'plan')),
  add column plan_snapshot jsonb;

-- ---------------------------------------------------------------------------
-- credit_events: membership audit types
-- ---------------------------------------------------------------------------
alter table public.credit_events
  drop constraint credit_events_type_check;

alter table public.credit_events
  add constraint credit_events_type_check
  check (type in (
    'signup_bonus',
    'generation_charge',
    'purchase',
    'admin_adjustment',
    'membership_grant',
    'membership_expire'
  ));

-- ---------------------------------------------------------------------------
-- evaluate_membership: lazy membership engine + dual-pool balance read.
-- Called on every balance read path (badge, pricing page, generate preflight,
-- agent preflight). Single transaction, row-locked, idempotent under
-- concurrency. Returns a jsonb object:
--   { permanentCredits, subCredits, subCreditsExpiresAt, planId, paidUntil,
--     membershipActive, totalCredits }
-- ---------------------------------------------------------------------------
create or replace function public.evaluate_membership(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_member public.memberships%rowtype;
  v_member_found boolean;
  v_quota integer;
  v_now timestamptz := now();
begin
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then
    raise exception 'rpc_forbidden_for_client_role';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if v_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  -- Expire the subscription pool lazily; the permanent pool is never touched.
  if v_profile.sub_credits > 0
     and v_profile.sub_credits_expires_at is not null
     and v_profile.sub_credits_expires_at <= v_now then
    insert into public.credit_events (user_id, type, amount, reason)
    values (p_user_id, 'membership_expire', -v_profile.sub_credits, 'Subscription credits expired');
    v_profile.sub_credits := 0;
  end if;

  select * into v_member
  from public.memberships
  where user_id = p_user_id
  for update;

  v_member_found := v_member.user_id is not null;

  if v_member_found then
    -- Whole unclaimed periods forfeit their tranche (queue head first).
    while v_member.next_grant_at + interval '30 days' <= v_now loop
      if v_member.next_grant_at < v_member.paid_until
         and jsonb_array_length(v_member.pending_tranches) > 0 then
        v_member.pending_tranches := v_member.pending_tranches - 0;
      end if;
      v_member.next_grant_at := v_member.next_grant_at + interval '30 days';
    end loop;

    -- Claim the current period when one is due inside the membership window.
    if v_member.next_grant_at <= v_now
       and v_member.next_grant_at < v_member.paid_until
       and jsonb_array_length(v_member.pending_tranches) > 0 then
      v_quota := (v_member.pending_tranches ->> 0)::integer;
      v_member.pending_tranches := v_member.pending_tranches - 0;
      v_profile.sub_credits := v_profile.sub_credits + v_quota;
      v_profile.sub_credits_expires_at := least(
        v_member.next_grant_at + interval '30 days',
        v_member.paid_until
      );

      insert into public.credit_events (user_id, type, amount, reason)
      values (
        p_user_id,
        'membership_grant',
        v_quota,
        'Membership ' || v_member.plan_id || ' period tranche'
      );

      update public.memberships
      set pending_tranches = v_member.pending_tranches,
          next_grant_at = v_member.next_grant_at + interval '30 days',
          updated_at = v_now
      where user_id = p_user_id;
    end if;
  end if;

  update public.profiles
  set sub_credits = v_profile.sub_credits,
      sub_credits_expires_at = v_profile.sub_credits_expires_at,
      updated_at = v_now
  where id = p_user_id;

  return jsonb_build_object(
    'permanentCredits', v_profile.credits,
    'subCredits', v_profile.sub_credits,
    'subCreditsExpiresAt', v_profile.sub_credits_expires_at,
    'planId', case when v_member_found then v_member.plan_id end,
    'paidUntil', case when v_member_found then v_member.paid_until end,
    'membershipActive', v_member_found and v_member.paid_until > v_now,
    'totalCredits', v_profile.credits + v_profile.sub_credits
  );
end;
$$;

revoke execute on function public.evaluate_membership(uuid) from public;
grant execute on function public.evaluate_membership(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- fulfill_order: same idempotent skeleton, fulfilment branches by order kind.
-- pack -> permanent pool credits (unchanged); plan -> activate/extend the
-- membership window (stacking: time always extends, quotas queue FIFO) and
-- grant the first tranche immediately.
-- ---------------------------------------------------------------------------
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
  v_profile public.profiles%rowtype;
  v_member public.memberships%rowtype;
  v_member_active boolean;
  v_plan jsonb;
  v_quota integer;
  v_tranches integer;
  v_period_days integer;
  v_base_until timestamptz;
  v_new_until timestamptz;
  v_tranche_expires timestamptz;
  v_queue jsonb;
  v_next_grant_at timestamptz;
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

  select * into v_profile
  from public.profiles
  where id = locked_order.user_id
  for update;

  if v_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  if locked_order.kind = 'plan' then
    v_plan := coalesce(locked_order.plan_snapshot, '{}'::jsonb);
    v_quota := coalesce((v_plan ->> 'quotaPerTranche')::integer, locked_order.credits);
    v_tranches := coalesce((v_plan ->> 'tranches')::integer, 1);
    v_period_days := coalesce((v_plan ->> 'periodDays')::integer, 30);

    select * into v_member
    from public.memberships
    where user_id = locked_order.user_id
    for update;

    v_member_active := v_member.user_id is not null and v_member.paid_until > now();

    if v_member_active then
      v_base_until := v_member.paid_until;
      v_queue := v_member.pending_tranches;
      v_next_grant_at := v_member.next_grant_at;
    else
      v_base_until := now();
      v_queue := '[]'::jsonb;
      v_next_grant_at := now() + interval '30 days';
    end if;

    v_new_until := v_base_until + make_interval(days => v_period_days);

    if v_tranches > 1 then
      v_queue := v_queue || to_jsonb(array_fill(v_quota, array[v_tranches - 1]));
    end if;

    v_tranche_expires := least(now() + interval '30 days', v_new_until);

    insert into public.memberships (
      user_id, plan_id, paid_until, next_grant_at, pending_tranches
    )
    values (
      locked_order.user_id, locked_order.pack_id, v_new_until, v_next_grant_at, v_queue
    )
    on conflict (user_id) do update set
      plan_id = excluded.plan_id,
      paid_until = excluded.paid_until,
      next_grant_at = excluded.next_grant_at,
      pending_tranches = excluded.pending_tranches,
      updated_at = now();

    update public.profiles
    set sub_credits = sub_credits + v_quota,
        sub_credits_expires_at = greatest(
          case when v_member_active then v_profile.sub_credits_expires_at end,
          v_tranche_expires
        ),
        updated_at = now()
    where id = locked_order.user_id;

    insert into public.credit_events (user_id, type, amount, reason)
    values (
      locked_order.user_id,
      'membership_grant',
      v_quota,
      'Membership ' || locked_order.pack_id || ' order ' || locked_order.id::text
        || ' first tranche, provider trade ' || coalesce(updated_order.provider_trade_no, 'n/a')
    );
  else
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
  end if;

  return updated_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_successful_generation: unchanged 1-image-1-credit charge, now with a
-- dual-pool consumption order - subscription pool first, permanent second.
-- An expired subscription pool counts as zero and is zeroed inline with an
-- audit event, so the atomic charge never draws from a stale balance.
-- ---------------------------------------------------------------------------
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
  v_profile public.profiles%rowtype;
  v_charge_sub boolean;
  created_generation public.generations;
begin
  if coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then
    raise exception 'rpc_forbidden_for_client_role';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if v_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  if v_profile.sub_credits > 0
     and v_profile.sub_credits_expires_at is not null
     and v_profile.sub_credits_expires_at <= now() then
    insert into public.credit_events (user_id, type, amount, reason)
    values (p_user_id, 'membership_expire', -v_profile.sub_credits, 'Subscription credits expired');
    v_profile.sub_credits := 0;
  end if;

  v_charge_sub := v_profile.sub_credits >= 1;

  if not v_charge_sub and v_profile.credits < 1 then
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

  if v_charge_sub then
    update public.profiles
    set sub_credits = sub_credits - 1,
        updated_at = now()
    where id = p_user_id;

    insert into public.credit_events (user_id, generation_id, type, amount, reason)
    values (p_user_id, created_generation.id, 'generation_charge', -1, 'Image generation (subscription pool)');
  else
    update public.profiles
    set credits = credits - 1,
        sub_credits = v_profile.sub_credits,
        updated_at = now()
    where id = p_user_id;

    insert into public.credit_events (user_id, generation_id, type, amount, reason)
    values (p_user_id, created_generation.id, 'generation_charge', -1, 'Image generation (permanent pool)');
  end if;

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

revoke execute on function public.fulfill_order(uuid, text) from public;
grant execute on function public.fulfill_order(uuid, text) to service_role;
