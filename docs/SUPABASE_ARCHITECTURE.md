# How Supabase works in A2D Elites

This note describes the app's current Supabase setup, data flow, and sync
behavior. It complements the setup steps in
[`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md).

## 1. Authentication and roles

- Supabase Auth authenticates users with email and password.
- The React app restores the Auth session from Supabase's local session store.
- Each authenticated user needs a row in `business_memberships`, which links
  their Auth user ID to a business and a role (`owner` or `delivery_driver`).
- The app caches the last membership locally so it can render the app shell
  while checking the current membership and loading cloud data.
- The cache is only a startup convenience. The app does not consider sync ready
  until the current membership is reloaded from Supabase. RLS and checked
  database functions enforce access independently of the UI.
- A profile's `display_name` is used as the driver's name. It can be set in
  Auth user metadata when creating a user or updated in `public.profiles`.

The browser/mobile app uses only the Supabase project URL and anon/publishable
key. Never place a service-role or secret key in client code. Driver credential
administration uses the `manage-driver-credentials` Edge Function and a
server-held secret key.

## 2. Data model and authorization

Business data is stored in relational tables, primarily:

- `businesses`, `business_memberships`, and `profiles`
- `customers`, `products`, `orders`, `order_items`, and `recurring_orders`
- `driver_locations`
- `driver_payments` (created by the driver-payment migration)

Tables use row-level security (RLS). Owners can manage their business records.
Drivers can read only orders assigned to their Auth user ID, plus the
configured unassigned pending orders. They update delivery status through
checked RPCs; `driver_confirm_delivery` also stores bottle-return details for
their assigned order.

Owners save complete orders through the `owner_save_order` RPC, which validates
business role, delivery-driver membership or the current owner's own
membership, customer membership, and order items. Owners can bulk-assign orders
to a delivery driver or to themselves.
Drivers record payments through `driver_record_order_payment`. That function
checks the driver's role and order assignment, locks the order while updating
it, validates the amount against the remaining balance, records an idempotent
payment row, and updates `amount_paid` / `payment_status`. Client-side checks
improve UX but are not the security boundary.

For schema details and the required migration sequence, see
[`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md).

## 3. Initial load and local cache

The app persists its working data using Capacitor Preferences on the device.
On launch:

1. Supabase restores the saved Auth session.
2. The app restores the cached membership for that same Auth user and displays
   the existing app shell/data when available. This avoids showing the
   Cloud Sync sign-in panel while the membership lookup runs.
3. In parallel with local app startup, the app verifies the membership and
   business from Supabase, then fetches the business's relational records.
4. Owners merge permitted local records with remote data and save the changes
   to Supabase. Drivers replace the working data with the records their RLS
   policies allow them to read.
5. Once that succeeds, sync is marked ready and Realtime subscriptions are
   enabled.

If there is no cached membership (for example, first sign-in on a device), the
app shows a short loading state until the authenticated membership is loaded.
A cloud/network error is shown in **More -> Cloud Sync**; cached data can remain
available when the membership cache exists.

## 4. Sync while the app is open

When online and the app is running:

- Owner changes are compared with the last cloud baseline and saved after a
  short debounce. Order saves use the checked RPC.
- Driver delivery-status changes use checked RPCs; delivery confirmation also
  stores returned-bottle details atomically with the status change.
- Driver payments use the payment RPC and are reflected in the order's paid
  total and status.
- Supabase Realtime listens for business-scoped changes to customers, products,
  orders, order items, and recurring orders. On an event, the app reloads the
  relational data.
- **More -> Cloud Sync -> Sync now** forces a reload. Browser online events also
  trigger a retry.

Realtime is a live connection while the app is active and connected; it is not
a background sync service that continuously runs after the app is closed.

## 5. Offline behavior and what "background sync" means here

The app has **offline persistence and reconnect sync**, but ordinary business
data does not sync continuously while the app is closed:

- Local app data is saved on the device.
- Owner edits made offline remain in that local data and are compared/sent when
  the app detects the connection again.
- Driver delivery-status updates and collected payments are added to a local
  outbox while offline and retried on reconnect. Payment IDs make retries
  idempotent.
- Location sharing is a separate, explicitly started shift feature. Android
  uses a foreground location service while sharing is enabled; this does not
  mean order/customer data is background-synced.

If the operating system suspends or closes the app, ordinary order changes and
Realtime refreshes wait until the app runs again. Drivers should confirm Cloud
Sync reports **synced** after reconnecting.

## 6. Important operational requirements

- Apply the SQL schema and migrations described in
  [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md), including the Realtime, driver
  payment, and owner-order-assignment migrations when using those features.
- Create each driver through **More -> Cloud Sync -> Create delivery account**
  or another trusted provisioning flow; each driver needs a real Supabase Auth
  user and a `delivery_driver` membership in the correct business.
- Assign orders to that Auth user's UUID. A local staff name alone does not
  grant account access.
- Deploy `manage-driver-credentials` separately if owners need to create driver
  accounts or change driver credentials through the app.
- A successful client build does not apply database migrations or deploy Edge
  Functions; those are separate Supabase project operations.
