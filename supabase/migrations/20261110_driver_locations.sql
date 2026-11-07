create table if not exists public.driver_locations (
  business_id uuid not null,
  driver_id uuid not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy double precision not null check (accuracy between 0 and 100),
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, driver_id),
  foreign key (business_id, driver_id)
    references public.business_memberships (business_id, user_id)
    on delete cascade
);

create index if not exists driver_locations_business_updated_idx
  on public.driver_locations (business_id, updated_at desc);

create or replace function public.set_driver_location_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_driver_location_updated_at()
  from public, anon, authenticated;

drop trigger if exists driver_locations_set_updated_at
  on public.driver_locations;
create trigger driver_locations_set_updated_at
  before update on public.driver_locations
  for each row execute function public.set_driver_location_updated_at();

alter table public.driver_locations enable row level security;

drop policy if exists "Owners can view driver locations"
  on public.driver_locations;
create policy "Owners can view driver locations"
  on public.driver_locations for select to authenticated
  using ((select public.has_business_role(business_id, 'owner')));

drop policy if exists "Drivers can view their own location"
  on public.driver_locations;
create policy "Drivers can view their own location"
  on public.driver_locations for select to authenticated
  using (
    driver_id = (select auth.uid())
    and (select public.has_business_role(business_id, 'delivery_driver'))
  );

drop policy if exists "Drivers can insert their own location"
  on public.driver_locations;
create policy "Drivers can insert their own location"
  on public.driver_locations for insert to authenticated
  with check (
    driver_id = (select auth.uid())
    and (select public.has_business_role(business_id, 'delivery_driver'))
  );

drop policy if exists "Drivers can update their own location"
  on public.driver_locations;
create policy "Drivers can update their own location"
  on public.driver_locations for update to authenticated
  using (
    driver_id = (select auth.uid())
    and (select public.has_business_role(business_id, 'delivery_driver'))
  )
  with check (
    driver_id = (select auth.uid())
    and (select public.has_business_role(business_id, 'delivery_driver'))
  );

drop policy if exists "Drivers can clear their own location"
  on public.driver_locations;
create policy "Drivers can clear their own location"
  on public.driver_locations for delete to authenticated
  using (
    driver_id = (select auth.uid())
    and (select public.has_business_role(business_id, 'delivery_driver'))
  );

revoke all on public.driver_locations from anon, authenticated;
grant select, insert, update, delete
  on public.driver_locations to authenticated;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'driver_locations'
  ) then
    alter publication supabase_realtime add table public.driver_locations;
  end if;
end;
$$;
