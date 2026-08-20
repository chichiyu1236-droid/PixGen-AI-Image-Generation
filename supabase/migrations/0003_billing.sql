-- Billing: credit pack purchases via aggregator payment providers.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text not null,
  credits integer not null check (credits > 0),
  amount_fen integer not null check (amount_fen > 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'expired', 'failed', 'flagged')),
  channel text not null check (channel in ('wechat', 'alipay')),
  provider text not null,
  provider_trade_no text,
  pay_url text,
  raw_notify jsonb,
  notified_at timestamptz,
  last_checked_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (provider, provider_trade_no)
);

create index orders_user_id_created_at_idx
  on public.orders (user_id, created_at desc);

create index orders_status_created_at_idx
  on public.orders (status, created_at desc);

alter table public.orders enable row level security;

-- Users may read their own orders; every write goes through service-role RPCs,
-- so no insert/update/delete policies exist by design.
create policy "Users read own orders"
  on public.orders for select
  using (auth.uid() = user_id);

alter table public.credit_events
  drop constraint credit_events_type_check;

alter table public.credit_events
  add constraint credit_events_type_check
  check (type in ('signup_bonus', 'generation_charge', 'purchase', 'admin_adjustment'));

-- Fulfills a paid order exactly once: pending|expired -> paid, credit grant and
-- audit event happen in the same transaction. Safe to call repeatedly and
-- concurrently; callers that lose the race see the paid order unchanged.
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

-- Atomic admin credit adjustment (add or deduct). Replaces the read-modify-write
-- in the admin credits route.
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

revoke execute on function public.fulfill_order(uuid, text) from public;
grant execute on function public.fulfill_order(uuid, text) to service_role;

revoke execute on function public.adjust_credits(uuid, integer, text, text) from public;
grant execute on function public.adjust_credits(uuid, integer, text, text) to service_role;
