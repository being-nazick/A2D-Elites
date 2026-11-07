# Supabase multi-role setup

The target design uses relational tables shared by owner and delivery-driver
accounts. A user's role belongs to a business membership, not to client-editable
Auth metadata. Row Level Security (RLS) is the security boundary; hiding screens
in React is not sufficient access control.

## App migration status

The React app now authenticates with Supabase and reads/writes the relational
tables. Owners can manage business data; drivers receive assigned and
unassigned pending orders, but can change status only on their assigned orders.
Existing local records are merged when an owner first syncs. Review and back up
local data before signing in.

## 1. Create a Supabase project

1. Create a project in the Supabase dashboard and save the database password
   somewhere secure.
2. In **Project Settings → API**, copy the Project URL and the anon/publishable
   key. These are intended for client applications; never put a `service_role`
   or secret key in this React app.
3. In **Authentication → Providers**, enable Email. Configure email confirmation
   according to your needs.

## 2. Install the relational schema

In a new/test Supabase project, open **SQL Editor**, run
[`../supabase/relational_schema.sql`](../supabase/relational_schema.sql) once,
then run
[`../supabase/migrations/20261109_enable_relational_realtime.sql`](../supabase/migrations/20261109_enable_relational_realtime.sql)
and
[`../supabase/migrations/20261110_driver_locations.sql`](../supabase/migrations/20261110_driver_locations.sql)
to enable Realtime publications. Then provision the initial owner as described
below. The schema creates:

- `profiles`: non-role profile information linked to `auth.users`.
- `businesses` and `business_memberships`: tenant boundary and per-business
  `owner` / `delivery_driver` role.
- `customers`, `products`, `orders`, and `order_items`.
- `driver_locations`, which holds at most one current location per driver.
- `business_settings`, which only an owner can read or update.
- RLS policies and narrow RPCs for owner order writes and driver status updates.

Drivers can read orders assigned to their Auth user ID and unassigned orders
with `delivery_status = 'pending'`; customer details are visible only for
those orders. Drivers still cannot update an unassigned order. Status updates
are allowed only on their assigned orders through the checked RPC.

If you already ran the initial schema and policy migration, apply these in
order:
[`../supabase/migrations/20261107_driver_open_orders.sql`](../supabase/migrations/20261107_driver_open_orders.sql)
and
[`../supabase/migrations/20261108_relational_client_support.sql`](../supabase/migrations/20261108_relational_client_support.sql)
and
[`../supabase/migrations/20261109_enable_relational_realtime.sql`](../supabase/migrations/20261109_enable_relational_realtime.sql)
and
[`../supabase/migrations/20261110_driver_locations.sql`](../supabase/migrations/20261110_driver_locations.sql)
in SQL Editor. These migrations add client fields/policies and enable
business-scoped change events for customers, products, orders, order items,
recurring orders, and driver locations. Do not rerun the first-install schema
against an existing project.

### Driver location sharing

The driver location migration creates a table with one row per business and
driver. RLS allows a driver to upsert/delete only their own row and lets an
owner read locations for their business. Realtime refreshes the owner's map.
The row is deleted when the driver stops sharing; if the phone is offline at
that time, the app records a pending clear and retries on reconnect.

Location sharing is explicitly started by the driver for a shift. Android uses
a foreground location service with a persistent notification and sends a new
point when the device moves at least about 50 metres. Low-accuracy fixes over
100 metres are not uploaded. The owner sees the server update time and marks
locations stale after five minutes. This is best-effort: GPS, network, OS
battery controls, app force-stop, or an expired sign-in can interrupt updates.
Only the latest point is retained; no route history is collected.

The current native project is Android. After installing the app dependencies,
run `npx cap sync android` and rebuild/reinstall the Android app so the
background location and notification plugins are included. The browser build
shares location only while open. iOS background sharing is not configured in
this repository because it has no iOS native project; iOS usage descriptions
and background location capability must be configured before enabling it.

The SQL is a first-install schema, not a repeatable migration: it creates enum
types. Test it in a development project and plan a data migration/backup before
applying it to a project that already has data.

## 3. Provision roles securely

The Auth trigger creates a profile only. It ignores any role supplied in
`raw_user_meta_data`; users must never be able to set their own role or add
themselves to a business.

Create the first owner account through Supabase Auth (dashboard or a signup
form). Then, in SQL Editor, create the business and owner membership using that
user's Auth UUID:

```sql
with new_business as (
  insert into public.businesses (name)
  values ('Your Dairy')
  returning id
)
insert into public.business_memberships (business_id, user_id, role)
select id, 'AUTH_USER_UUID_HERE'::uuid, 'owner'
from new_business;
```

Drivers may sign up through the same Auth flow, but cannot access business data
until an owner/admin provisions a `delivery_driver` membership. For a live
invitation flow, use a Supabase Edge Function or trusted server that verifies
the caller is an owner before inserting a membership. Keep the service-role key
only in that server's secret environment, never in React or a Capacitor bundle.

## Owner credential management

The Cloud Sync panel lets an authenticated owner update their own email/password
after confirming their current password, and set a delivery member's email
and/or password. The owner's email update follows Supabase Auth's email-change
confirmation settings. Driver credential updates are handled only by
[`../supabase/functions/manage-driver-credentials/index.ts`](../supabase/functions/manage-driver-credentials/index.ts):
the function validates the caller's Auth token, verifies their owner membership
and the target's delivery-driver membership in the same business, then calls
the Auth Admin API. A driver cannot invoke it to change credentials.
For safety, it refuses to change credentials for a driver account that is
shared across multiple businesses.

Deploy `manage-driver-credentials` to the Supabase project with the Supabase
CLI. It uses Supabase's server-injected `SUPABASE_SECRET_KEYS` environment
variable; do not create or expose a service-role/secret key in `.env.local`,
frontend build variables, or app code. The owner-managed driver email is
activated immediately, and existing signed-in driver sessions can remain valid
until their access tokens expire.

## 4. Signup, login, and role lookup

Use the Supabase client in React for authentication. Do not include a role in
signup metadata:

```js
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: { data: { display_name: displayName } },
});
if (error) throw error;
```

Login and retrieve the user's provisioned business memberships:

```js
const { data: authData, error: loginError } =
  await supabase.auth.signInWithPassword({ email, password });
if (loginError) throw loginError;

const { data: memberships, error: membershipError } = await supabase
  .from("business_memberships")
  .select("business_id, role")
  .eq("user_id", authData.user.id);
if (membershipError) throw membershipError;
```

Use the membership to choose owner or driver UI, but treat the RLS policies and
RPC checks—not that UI decision—as authorization. Example calls:

```js
// Owner creates or edits an order. The RPC validates role, customer,
// assignment, and replaces the order's item rows in one transaction.
await supabase.rpc("owner_save_order", {
  p_business_id: businessId,
  p_order_id: order.id,
  p_customer_id: order.customerId,
  p_assigned_driver_id: driverAuthUserId,
  p_order_date: order.orderDate,
  p_delivery_date: order.deliveryDate || null,
  p_delivery_status: "pending",
  p_payment_status: "pending",
  p_amount_paid: 0,
  p_notes: order.notes || "",
  p_order_metadata: {},
  p_items: order.items.map((item) => ({
    product_id: item.productId || null,
    product_name: item.name,
    item_id: item.id || null,
    category: item.category || "",
    quantity: item.qty,
    unit_price: item.price,
    metadata: {},
  })),
});

// Driver can update only their own assigned order, and only through the
// allowed pending -> out_for_delivery -> delivered transitions.
await supabase.rpc("driver_update_delivery_status", {
  p_business_id: businessId,
  p_order_id: orderId,
  p_status: "out_for_delivery",
});
```

Owner cancellation uses `owner_cancel_order`. Order reads can use the normal
Supabase query API; RLS automatically limits driver results:

```js
const { data: orders, error } = await supabase
  .from("orders")
  .select("*, order_items(*)")
  .eq("business_id", businessId);
if (error) throw error;
```

## RLS/permission summary

The exact policies and grants are in the SQL file:

| Resource | Owner | Delivery driver |
|---|---|---|
| `orders` | Read all orders in the business; create/update through `owner_save_order`; cancel through `owner_cancel_order` | Read assigned orders and unassigned pending orders; update status only on assigned orders through the checked RPC |
| `order_items` | Read items for business orders; writes happen in `owner_save_order` | Read items only for orders RLS lets them see |
| `customers` | Read all customers in the business | Read customers referenced by assigned orders and unassigned pending orders |
| `products` | Read business products | No direct product table access; assigned order items contain product snapshots |
| `business_settings` | Read and update through the checked owner RPC | No access |
| `profiles` / memberships | Own profile and profiles/memberships in businesses they own | Own profile and own membership only |

RLS limits direct writes to owners. Driver status changes use a narrow RPC that
checks the caller, assignment, and allowed transition on the server.

## Merging backup files

Use **Import / Export → Merge Data (JSON)** and select each backup file
separately. Customers are merged by normalized phone number; orders are
deduplicated by ID or stable order details. An order linked by customer ID is
kept if its phone differs and is marked in `importReview`; an order without a
valid ID link may be matched by phone. Orders with neither a valid ID link nor
a matching phone are skipped and reported.

## Offline and relational sync

The app keeps its current data in Capacitor Preferences and queues driver
delivery-status transitions while offline. Owner changes are saved locally and
sent when online; after a cold start without network access, the app cannot
verify the Supabase membership, so full offline sign-in is not yet supported.
When online, a business data change event causes signed-in devices to re-fetch
rows allowed by RLS and reconcile by stable ID. A driver's status change is
written through the database RPC, then appears on the owner's screen after that
refresh. Realtime requires the publication migration above and an active
connection; offline queued changes appear on other devices only after they
reach Supabase.

## 5. Configure and test the app

1. Copy `.env.example` to `.env.local` and set `REACT_APP_SUPABASE_URL` and
   `REACT_APP_SUPABASE_ANON_KEY` using the project's URL and anon/publishable
   key. Never use a service-role key in the app.
2. Restart the development server after editing environment variables.
3. Sign in as the provisioned owner. The first owner sync merges the existing
   device records with relational data; review the resulting customers and
   orders before using production data.
4. Provision a driver account with a `delivery_driver` membership. Sign in as
   that user and verify that assigned and unassigned pending orders are visible,
   while only assigned orders have delivery actions.
For production, also set the same environment variables in the build
environment; rebuild and sync the Capacitor native project after making a new
web build.
