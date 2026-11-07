-- Relational, multi-role schema. Run in Supabase SQL Editor.
-- Do not put a role in user-editable auth metadata. Membership roles are
-- provisioned by a trusted administrator and checked by RLS.

create type public.business_role as enum ('owner', 'delivery_driver');
create type public.delivery_status as enum (
  'pending',
  'out_for_delivery',
  'delivered',
  'cancelled'
);
create type public.payment_status as enum ('pending', 'partial', 'paid');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.business_memberships (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.business_role not null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table public.business_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.customers (
  business_id uuid not null references public.businesses (id) on delete cascade,
  id text not null,
  name text not null,
  phone text not null default '',
  address text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, id)
);

create table public.products (
  business_id uuid not null references public.businesses (id) on delete cascade,
  id text not null,
  name text not null,
  price numeric(12, 2) not null default 0 check (price >= 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, id)
);

create table public.orders (
  business_id uuid not null references public.businesses (id) on delete cascade,
  id text not null,
  customer_id text not null,
  assigned_driver_id uuid references public.profiles (id) on delete set null,
  order_date date not null default current_date,
  delivery_date date,
  delivery_status public.delivery_status not null default 'pending',
  payment_status public.payment_status not null default 'pending',
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  notes text not null default '',
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  primary key (business_id, id),
  foreign key (business_id, customer_id)
    references public.customers (business_id, id)
);

create table public.order_items (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  order_id text not null,
  product_id text,
  product_name text not null,
  item_id text,
  category text,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  metadata jsonb not null default '{}'::jsonb,
  line_total numeric(12, 2) generated always as
    (round(quantity * unit_price, 2)) stored,
  foreign key (business_id, order_id)
    references public.orders (business_id, id) on delete cascade
);

create table public.recurring_orders (
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

create index orders_driver_status_idx
  on public.orders (business_id, assigned_driver_id, delivery_status, delivery_date);
create index orders_customer_date_idx
  on public.orders (business_id, customer_id, order_date desc);
create index order_items_order_idx
  on public.order_items (business_id, order_id);

-- A trusted trigger creates only a profile. It never trusts role metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select u.id, nullif(trim(u.raw_user_meta_data ->> 'display_name'), '')
from auth.users as u
on conflict (id) do nothing;

-- SECURITY DEFINER membership checks avoid recursive RLS evaluation on the
-- business_memberships table. The fixed search_path and qualified names are
-- intentional.
create or replace function public.has_business_role(
  p_business_id uuid,
  p_role public.business_role
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_memberships as m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.role = p_role
  );
$$;

create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id = (select auth.uid())
    or exists (
      select 1
      from public.business_memberships as mine
      join public.business_memberships as theirs
        on theirs.business_id = mine.business_id
      where mine.user_id = (select auth.uid())
        and mine.role = 'owner'
        and theirs.user_id = p_profile_id
    );
$$;

revoke all on function public.has_business_role(uuid, public.business_role) from public;
revoke all on function public.can_view_profile(uuid) from public;
grant execute on function public.has_business_role(uuid, public.business_role) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;
alter table public.business_settings enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.recurring_orders enable row level security;

create policy "Profiles are visible to self and business owners"
  on public.profiles for select to authenticated
  using ((select public.can_view_profile(id)));

create policy "Members can view their businesses"
  on public.businesses for select to authenticated
  using (
    exists (
      select 1 from public.business_memberships as m
      where m.business_id = businesses.id
        and m.user_id = (select auth.uid())
    )
  );

create policy "Members can view their own membership"
  on public.business_memberships for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners can view business memberships"
  on public.business_memberships for select to authenticated
  using ((select public.has_business_role(business_id, 'owner')));

create policy "Owners can read business settings"
  on public.business_settings for select to authenticated
  using ((select public.has_business_role(business_id, 'owner')));

create policy "Owners can view all customers"
  on public.customers for select to authenticated
  using ((select public.has_business_role(business_id, 'owner')));

create policy "Drivers can view customers on assigned orders"
  on public.customers for select to authenticated
  using (
    exists (
      select 1 from public.orders as o
      where o.business_id = customers.business_id
        and o.customer_id = customers.id
        and (
          o.assigned_driver_id = (select auth.uid())
          or (
            o.assigned_driver_id is null
            and o.delivery_status = 'pending'
          )
        )
        and (select public.has_business_role(
          o.business_id,
          'delivery_driver'
        ))
    )
  );

create policy "Owners can view products"
  on public.products for select to authenticated
  using ((select public.has_business_role(business_id, 'owner')));

create policy "Owners can view all orders"
  on public.orders for select to authenticated
  using ((select public.has_business_role(business_id, 'owner')));

create policy "Drivers can view only their assigned orders"
  on public.orders for select to authenticated
  using (
    (select public.has_business_role(business_id, 'delivery_driver'))
    and (
      assigned_driver_id = (select auth.uid())
      or (
        assigned_driver_id is null
        and delivery_status = 'pending'
      )
    )
  );

create policy "Members can view items of visible orders"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders as o
      where o.business_id = order_items.business_id
        and o.id = order_items.order_id
    )
  );

create policy "Owners can manage customers"
  on public.customers for all to authenticated
  using ((select public.has_business_role(business_id, 'owner')))
  with check ((select public.has_business_role(business_id, 'owner')));

create policy "Owners can manage products"
  on public.products for all to authenticated
  using ((select public.has_business_role(business_id, 'owner')))
  with check ((select public.has_business_role(business_id, 'owner')));

create policy "Owners can manage orders"
  on public.orders for all to authenticated
  using ((select public.has_business_role(business_id, 'owner')))
  with check ((select public.has_business_role(business_id, 'owner')));

create policy "Owners can manage order items"
  on public.order_items for all to authenticated
  using ((select public.has_business_role(business_id, 'owner')))
  with check ((select public.has_business_role(business_id, 'owner')));

create policy "Owners can manage recurring orders"
  on public.recurring_orders for all to authenticated
  using ((select public.has_business_role(business_id, 'owner')))
  with check ((select public.has_business_role(business_id, 'owner')));

create policy "Owners can manage business settings"
  on public.business_settings for all to authenticated
  using ((select public.has_business_role(business_id, 'owner')))
  with check ((select public.has_business_role(business_id, 'owner')));

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

revoke all on public.profiles, public.businesses, public.business_memberships,
  public.business_settings, public.customers, public.products, public.orders,
  public.order_items, public.recurring_orders from anon, authenticated;
grant select on public.profiles, public.businesses, public.business_memberships,
  public.business_settings, public.customers, public.products, public.orders,
  public.order_items, public.recurring_orders to authenticated;
grant insert, update, delete on public.customers, public.products, public.orders,
  public.order_items, public.business_settings, public.recurring_orders
  to authenticated;
grant usage, select on sequence public.order_items_id_seq to authenticated;

create or replace function public.owner_save_order(
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
    delivery_date, delivery_status, payment_status, amount_paid, notes, created_by,
    delivered_at, metadata
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

create or replace function public.owner_delete_order(
  p_business_id uuid,
  p_order_id text
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
  delete from public.orders
  where business_id = p_business_id and id = p_order_id;
end;
$$;

create or replace function public.owner_cancel_order(
  p_business_id uuid,
  p_order_id text
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

  update public.orders
  set delivery_status = 'cancelled', updated_at = now()
  where business_id = p_business_id and id = p_order_id;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.owner_update_business_settings(
  p_business_id uuid,
  p_settings jsonb
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
  if jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Settings must be a JSON object' using errcode = '22023';
  end if;

  insert into public.business_settings (business_id, settings, updated_at)
  values (p_business_id, p_settings, now())
  on conflict (business_id) do update
  set settings = excluded.settings, updated_at = now();
end;
$$;

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

revoke all on function public.owner_save_order(
  uuid, text, text, uuid, date, date, public.delivery_status,
  public.payment_status, numeric, text, jsonb, jsonb
) from public;
revoke all on function public.owner_delete_order(uuid, text) from public;
revoke all on function public.owner_cancel_order(uuid, text) from public;
revoke all on function public.owner_update_business_settings(uuid, jsonb) from public;
revoke all on function public.driver_update_delivery_status(
  uuid, text, public.delivery_status
) from public;

grant execute on function public.owner_save_order(
  uuid, text, text, uuid, date, date, public.delivery_status,
  public.payment_status, numeric, text, jsonb, jsonb
) to authenticated;
grant execute on function public.owner_delete_order(uuid, text) to authenticated;
grant execute on function public.owner_cancel_order(uuid, text) to authenticated;
grant execute on function public.owner_update_business_settings(uuid, jsonb) to authenticated;
grant execute on function public.driver_update_delivery_status(
  uuid, text, public.delivery_status
) to authenticated;

-- Bootstrap owners only from the trusted Supabase SQL Editor / server. Replace
-- these UUID and name values after creating the auth user in Supabase Auth.
-- Never expose an endpoint that lets a user choose the owner role.
--
-- insert into public.businesses (name)
-- values ('Your Dairy')
-- returning id;
--
-- insert into public.business_memberships (business_id, user_id, role)
-- values ('<business-uuid>', '<auth-user-uuid>', 'owner');
--
-- Add drivers only after their auth user exists, using a trusted owner/admin
-- workflow or server-side Edge Function with the service-role key:
-- insert into public.business_memberships (business_id, user_id, role)
-- values ('<business-uuid>', '<driver-auth-user-uuid>', 'delivery_driver');
