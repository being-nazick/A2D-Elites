drop policy if exists "Drivers can view customers on assigned orders"
  on public.customers;
drop policy if exists "Drivers can view customers on assigned and open orders"
  on public.customers;

create policy "Drivers can view customers on assigned and open orders"
  on public.customers for select to authenticated
  using (
    exists (
      select 1
      from public.orders as o
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

drop policy if exists "Drivers can view only their assigned orders"
  on public.orders;
drop policy if exists "Drivers can view assigned and open orders"
  on public.orders;

create policy "Drivers can view assigned and open orders"
  on public.orders for select to authenticated
  using (
    (select public.has_business_role(
      business_id,
      'delivery_driver'
    ))
    and (
      assigned_driver_id = (select auth.uid())
      or (
        assigned_driver_id is null
        and delivery_status = 'pending'
      )
    )
  );
