-- 0007_orders_profiles_fk.sql
-- 1) Backfill any missing public.profiles rows for existing orders so adding
--    the FK never fails on historical data (orders.user_id already references
--    auth.users(id), so every existing orders.user_id is guaranteed present in
--    auth.users).
insert into public.profiles (id, email, credits)
select u.id, u.email, 5
from auth.users u
where exists (
  select 1 from public.orders o where o.user_id = u.id
)
on conflict (id) do nothing;

-- 2) Add explicit FK from public.orders(user_id) to public.profiles(id) so
--    PostgREST embedded selects `orders(..., profiles(email))` succeed on
--    /admin/orders and admin order action routes.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_user_id_profiles_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_user_id_profiles_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

-- 3) Widen orders.channel check constraint to support Stripe Checkout orders
--    alongside legacy wechat/alipay aggregator channels.
alter table public.orders
  drop constraint if exists orders_channel_check;

alter table public.orders
  add constraint orders_channel_check
  check (channel in ('wechat', 'alipay', 'stripe'));

notify pgrst, 'reload schema';
