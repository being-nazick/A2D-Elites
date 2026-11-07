alter table public.profiles add column if not exists phone text;
alter table public.customers add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.orders add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.order_items add column if not exists item_id text;
alter table public.order_items add column if not exists category text;
alter table public.order_items add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.recurring_orders (
  business_id uuid not null references public.businesses (id) on delete cascade,
  id text not null,
  customer_id text,
  active boolean not null default true,
  frequency text not null default 'daily',
  days_of_week integer[] not null default '{}',
  last_generated_date date,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, id),
  foreign key (business_id, customer_id)
    references public.customers (business_id, id)
);

alter table public.recurring_orders enable row level security;

drop policy if exists "Owners can manage customers" on public.customers;
create policy "Owners can manage customers"
  on public.customers for all to authenticated
  using ((select public.has_business_role(business_id, 'owner')))
  with check ((select public.has_business_role(business_id, 'owner')));

drop policy if exists "Owners can manage products" on public.products;
create policy "Owners can manage products"
  on public.products for all to authenticated
  using ((select public.has_business_role(business_id, 'owner')))
  with check ((select public.has_business_role(business_id, 'owner')));

drop policy if exists "Owners can manage orders" on public.orders;
create policy "Owners can manage orders"
  on public.orders for all to authenticated
  using ((select public.has_business_role(business_id, 'owner')))
  with check ((select public.has_business_role(business_id, 'owner')));

drop policy if exists "Owners can manage order items" on public.order_items;
create policy "Owners can manage order items"
  on public.order_items for all to authenticated
  using ((select public.has_business_role(business_id, 'owner')))
  with check ((select public.has_business_role(business_id, 'owner')));

drop policy if exists "Owners can manage recurring orders" on public.recurring_orders;
create policy "Owners can manage recurring orders"
  on public.recurring_orders for all to authenticated
  using ((select public.has_business_role(business_id, 'owner')))
  with check ((select public.has_business_role(business_id, 'owner')));

drop policy if exists "Owners can manage business settings" on public.business_settings;
create policy "Owners can manage business settings"
  on public.business_settings for all to authenticated
  using ((select public.has_business_role(business_id, 'owner')))
  with check ((select public.has_business_role(business_id, 'owner')));

grant select on public.recurring_orders to authenticated;
grant insert, update, delete on public.customers, public.products, public.orders,
  public.order_items, public.business_settings, public.recurring_orders
  to authenticated;
grant usage, select on sequence public.order_items_id_seq to authenticated;

create or replace function public.validate_order_driver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_driver_id is not null and not exists (
    select 1
    from public.business_memberships as m
    where m.business_id = new.business_id
      and m.user_id = new.assigned_driver_id
      and m.role = 'delivery_driver'
  ) then
    raise exception 'Assigned user is not a delivery driver in this business'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_order_driver() from public, anon, authenticated;

drop trigger if exists orders_validate_driver on public.orders;
create trigger orders_validate_driver
  before insert or update of business_id, assigned_driver_id
  on public.orders
  for each row execute function public.validate_order_driver();

drop function if exists public.owner_save_order(
  uuid, text, text, uuid, date, date, public.delivery_status,
  public.payment_status, numeric, text, jsonb
);
drop function if exists public.owner_save_order(
  uuid, text, text, uuid, date, date, public.delivery_status,
  public.payment_status, numeric, text, jsonb, jsonb
);

create function public.owner_save_order(
  p_business_id uuid,
  p_order_id text,
  p_customer_id text,
  p_assigned_driver_id uuid,
  p_order_date date,
  p_delivery_date date,
  p_delivery_status public.delivery_status,
  p_payment_status public.payment_status,
  p_amount_paid numeric,
  p_notes text,
  p_order_metadata jsonb,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_business_role(p_business_id, 'owner') then
    raise exception 'Owner role required' using errcode = '42501';
  end if;

  if nullif(trim(p_order_id), '') is null then
    raise exception 'Order ID is required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.customers c
    where c.business_id = p_business_id and c.id = p_customer_id
  ) then
    raise exception 'Customer does not belong to this business'
      using errcode = '22023';
  end if;

  if p_assigned_driver_id is not null and not exists (
    select 1 from public.business_memberships m
    where m.business_id = p_business_id
      and m.user_id = p_assigned_driver_id
      and m.role = 'delivery_driver'
  ) then
    raise exception 'Assigned user is not a driver in this business'
      using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Items must be a JSON array' using errcode = '22023';
  end if;

  insert into public.orders (
    business_id, id, customer_id, assigned_driver_id, order_date,
    delivery_date, delivery_status, payment_status, amount_paid, notes,
    created_by, delivered_at, metadata
  )
  values (
    p_business_id, p_order_id, p_customer_id, p_assigned_driver_id, p_order_date,
    p_delivery_date, p_delivery_status, p_payment_status,
    greatest(coalesce(p_amount_paid, 0), 0), coalesce(p_notes, ''),
    (select auth.uid()),
    case when p_delivery_status = 'delivered' then now() else null end,
    coalesce(p_order_metadata, '{}'::jsonb)
  )
  on conflict (business_id, id) do update set
    customer_id = excluded.customer_id,
    assigned_driver_id = excluded.assigned_driver_id,
    order_date = excluded.order_date,
    delivery_date = excluded.delivery_date,
    delivery_status = excluded.delivery_status,
    payment_status = excluded.payment_status,
    amount_paid = excluded.amount_paid,
    notes = excluded.notes,
    delivered_at = excluded.delivered_at,
    metadata = excluded.metadata,
    updated_at = now();

  delete from public.order_items
  where business_id = p_business_id and order_id = p_order_id;

  insert into public.order_items (
    business_id, order_id, product_id, product_name, item_id, category,
    quantity, unit_price, metadata
  )
  select p_business_id, p_order_id, item.product_id,
    item.product_name, item.item_id, item.category, item.quantity,
    item.unit_price, coalesce(item.metadata, '{}'::jsonb)
  from jsonb_to_recordset(p_items) as item(
    product_id text,
    product_name text,
    item_id text,
    category text,
    quantity numeric,
    unit_price numeric,
    metadata jsonb
  );

  update public.orders o
  set total = coalesce((
    select sum(i.line_total)
    from public.order_items i
    where i.business_id = p_business_id and i.order_id = p_order_id
  ), 0),
  updated_at = now()
  where o.business_id = p_business_id and o.id = p_order_id;
end;
$$;

revoke all on function public.owner_save_order(
  uuid, text, text, uuid, date, date, public.delivery_status,
  public.payment_status, numeric, text, jsonb, jsonb
) from public;
grant execute on function public.owner_save_order(
  uuid, text, text, uuid, date, date, public.delivery_status,
  public.payment_status, numeric, text, jsonb, jsonb
) to authenticated;

create or replace function public.driver_update_delivery_status(
  p_business_id uuid,
  p_order_id text,
  p_status public.delivery_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.delivery_status;
begin
  if not public.has_business_role(p_business_id, 'delivery_driver') then
    raise exception 'Delivery driver role required' using errcode = '42501';
  end if;

  if p_status not in ('out_for_delivery', 'delivered') then
    raise exception 'Drivers may only set out_for_delivery or delivered'
      using errcode = '42501';
  end if;

  select o.delivery_status into current_status
  from public.orders o
  where o.business_id = p_business_id
    and o.id = p_order_id
    and o.assigned_driver_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'Assigned order not found' using errcode = '42501';
  end if;

  if current_status = p_status then
    return;
  end if;

  if (p_status = 'out_for_delivery' and current_status <> 'pending')
    or (p_status = 'delivered' and current_status <> 'out_for_delivery') then
    raise exception 'Invalid delivery status transition' using errcode = '22023';
  end if;

  update public.orders
  set delivery_status = p_status,
      delivered_at = case when p_status = 'delivered' then now() else null end,
      updated_at = now()
  where business_id = p_business_id and id = p_order_id;
end;
$$;
