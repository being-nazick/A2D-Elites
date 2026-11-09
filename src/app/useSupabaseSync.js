import { useCallback, useEffect, useRef, useState } from "react";
import { Preferences } from "@capacitor/preferences";
import {
  mapCustomerToRow,
  mapOrderToRows,
  mapProductToRow,
  mapRecurringToRow,
  mapRelationalRowsToAppData,
  mergeLocalWithRemote,
  normalizeAppData,
} from "./relationalData";
import { amountDue } from "./helpers";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const OUTBOX_PREFIX = "relational-outbox";
const MEMBERSHIP_PREFIX = "business-membership";
const DATA_BUSINESS_KEY = "relational-data-business";

function assertNoError(result) {
  if (result.error) throw result.error;
  return result.data;
}

function mapStatusToDatabase(status) {
  return {
    Pending: "pending",
    "Out for Delivery": "out_for_delivery",
    Delivered: "delivered",
    Cancelled: "cancelled",
  }[status];
}

async function reauthenticateUser(email, password) {
  if (!email || !password) {
    throw new Error("Enter the account's current password to continue.");
  }
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
}

async function getFunctionError(error) {
  const response = error?.context;
  if (response instanceof Response) {
    try {
      const body = await response.clone().json();
      if (typeof body?.error === "string") {
        return new Error(body.error);
      }
    } catch {
      return error;
    }
  }
  return error;
}

function changedItems(previous = [], next = []) {
  const previousById = new Map(previous.map((item) => [String(item.id), item]));
  return next.filter(
    (item) =>
      JSON.stringify(previousById.get(String(item.id))) !== JSON.stringify(item),
  );
}

function removedIds(previous = [], next = []) {
  const nextIds = new Set(next.map((item) => String(item.id)));
  return previous
    .filter((item) => !nextIds.has(String(item.id)))
    .map((item) => String(item.id));
}

async function deleteBusinessRows(table, businessId, ids) {
  if (ids.length === 0) return;
  assertNoError(
    await supabase
      .from(table)
      .delete()
      .eq("business_id", businessId)
      .in("id", ids),
  );
}

async function syncOwnerChanges(previous, next, businessId, assignedUserIds) {
  const previousData = normalizeAppData(previous);
  const nextData = normalizeAppData(next);
  const deletedOrderIds = removedIds(previousData.orders, nextData.orders);
  const deletedRecurringIds = removedIds(previousData.recurring, nextData.recurring);
  const deletedCustomerIds = removedIds(previousData.customers, nextData.customers);

  await deleteBusinessRows("orders", businessId, deletedOrderIds);
  await deleteBusinessRows("recurring_orders", businessId, deletedRecurringIds);

  const customers = changedItems(previousData.customers, nextData.customers).map(
    (customer) => mapCustomerToRow(customer, businessId),
  );
  if (customers.length) {
    assertNoError(
      await supabase.from("customers").upsert(customers, {
        onConflict: "business_id,id",
      }),
    );
  }

  const products = changedItems(previousData.products, nextData.products).map(
    (product) => mapProductToRow(product, businessId),
  );
  if (products.length) {
    assertNoError(
      await supabase.from("products").upsert(products, {
        onConflict: "business_id,id",
      }),
    );
  }

  const orders = changedItems(previousData.orders, nextData.orders);
  for (const order of orders) {
    const mapped = mapOrderToRows(order, businessId, assignedUserIds);
    assertNoError(
      await supabase.rpc("owner_save_order", {
        p_business_id: mapped.order.business_id,
        p_order_id: mapped.order.id,
        p_customer_id: mapped.order.customer_id,
        p_assigned_driver_id: mapped.order.assigned_driver_id,
        p_order_date: mapped.order.order_date,
        p_delivery_date: mapped.order.delivery_date,
        p_delivery_status: mapped.order.delivery_status,
        p_payment_status: mapped.order.payment_status,
        p_amount_paid: mapped.order.amount_paid,
        p_notes: mapped.order.notes,
        p_order_metadata: mapped.order.metadata,
        p_items: mapped.items
          .filter((item) => item.quantity > 0 && item.product_name)
          .map((item) => ({
            product_id: item.product_id,
            product_name: item.product_name,
            item_id: item.item_id,
            category: item.category,
            quantity: item.quantity,
            unit_price: item.unit_price,
            metadata: item.metadata,
          })),
      }),
    );
  }

  const recurring = changedItems(
    previousData.recurring,
    nextData.recurring,
  ).map((item) => mapRecurringToRow(item, businessId));
  if (recurring.length) {
    assertNoError(
      await supabase.from("recurring_orders").upsert(recurring, {
        onConflict: "business_id,id",
      }),
    );
  }

  await deleteBusinessRows("customers", businessId, deletedCustomerIds);
  await deleteBusinessRows(
    "products",
    businessId,
    removedIds(previousData.products, nextData.products),
  );
}

export function useSupabaseSync({ data, setData, isLocalLoaded }) {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [membership, setMembership] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [businessName, setBusinessName] = useState("");
  const [syncStatus, setSyncStatus] = useState(
    isSupabaseConfigured ? "signed-out" : "not-configured",
  );
  const [syncError, setSyncError] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [syncReadyUserId, setSyncReadyUserId] = useState(null);
  const sessionRestoreRef = useRef(0);
  const latestDataRef = useRef(data);
  const baselineDataRef = useRef(normalizeAppData(data));

  latestDataRef.current = data;

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const restoreSession = async (nextSession) => {
      const restoreId = ++sessionRestoreRef.current;
      let cachedMembership = null;
      let cachedBusinessName = "";

      if (nextSession?.user?.id) {
        try {
          const { value } = await Preferences.get({
            key: `${MEMBERSHIP_PREFIX}:${nextSession.user.id}`,
          });
          const cached = value ? JSON.parse(value) : null;
          if (
            cached?.user_id === nextSession.user.id &&
            cached?.business_id &&
            ["owner", "delivery_driver"].includes(cached.role)
          ) {
            cachedMembership = { ...cached, user: nextSession.user };
            cachedBusinessName = cached.businessName || "";
          }
        } catch (error) {
          console.error("Unable to restore cached Supabase membership:", error);
        }
      }

      if (!active || restoreId !== sessionRestoreRef.current) return;
      setMembership(cachedMembership);
      setBusinessName(cachedBusinessName);
      setSyncReadyUserId(null);
      setSession(nextSession);
      setSyncStatus(nextSession ? "connecting" : "signed-out");
      setSyncError("");
      setAuthError("");
      setAuthReady(true);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void restoreSession(nextSession);
    });

    supabase.auth
      .getSession()
      .then(({ data: sessionData, error }) => {
        if (error) {
          console.error("Unable to restore Supabase auth session:", error);
        }
        return restoreSession(sessionData?.session || null).then(() => {
          if (error && active) setAuthError(error.message);
        });
      })
      .catch((error) => {
        if (!active) return;
        console.error("Unable to restore Supabase auth session:", error);
        setAuthError(error.message || "Unable to restore Supabase session.");
        setAuthReady(true);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !isLocalLoaded || !session?.user?.id) {
      setSyncReadyUserId(null);
      if (!session) setMembership(null);
      return undefined;
    }

    let active = true;
    const userId = session.user.id;

    const initializeRelationalSync = async () => {
      setSyncStatus("connecting");
      setSyncError("");
      setAuthError("");

      try {
        const membershipRows = assertNoError(
          await supabase
            .from("business_memberships")
            .select("business_id,user_id,role,created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: true }),
        );
        const selectedMembership = membershipRows?.[0];
        if (!selectedMembership) {
          throw new Error(
            "This account has no business role yet. Ask the business owner to add your membership.",
          );
        }

        const businessId = selectedMembership.business_id;
        const business = assertNoError(
          await supabase
            .from("businesses")
            .select("id,name")
            .eq("id", businessId)
            .maybeSingle(),
        );
        if (!business) throw new Error("The assigned business could not be found.");

        const allMemberships =
          selectedMembership.role === "owner"
            ? assertNoError(
                await supabase
                  .from("business_memberships")
                  .select("user_id,role")
                  .eq("business_id", businessId),
              )
            : [selectedMembership];
        const driverMemberships = allMemberships.filter(
          (item) => item.role === "delivery_driver",
        );
        const driverIds = driverMemberships.map((item) => item.user_id);
        const profileRows = driverIds.length
          ? assertNoError(
              await supabase
                .from("profiles")
                .select("id,display_name,phone")
                .in("id", driverIds),
            )
          : [];
        const loadedDrivers = profileRows.map((profile) => ({
          id: profile.id,
          name:
            profile.display_name ||
            (profile.id === userId
              ? session.user.user_metadata?.display_name ||
                session.user.email?.split("@")[0]
              : "Unnamed driver"),
          phone: profile.phone || "",
        }));
        const orderAssignees =
          selectedMembership.role === "owner"
            ? [
                ...loadedDrivers,
                {
                  id: userId,
                  name:
                    session.user.user_metadata?.display_name ||
                    session.user.email?.split("@")[0] ||
                    "Owner",
                },
              ]
            : loadedDrivers;

        const [customerRows, productRows, orderRows, itemRows, recurringRows] =
          await Promise.all([
            supabase
              .from("customers")
              .select("*")
              .eq("business_id", businessId),
            supabase.from("products").select("*").eq("business_id", businessId),
            supabase.from("orders").select("*").eq("business_id", businessId),
            supabase
              .from("order_items")
              .select("*")
              .eq("business_id", businessId),
            supabase
              .from("recurring_orders")
              .select("*")
              .eq("business_id", businessId),
          ]);

        const remoteData = mapRelationalRowsToAppData({
          customers: assertNoError(customerRows) || [],
          products: assertNoError(productRows) || [],
          orders: assertNoError(orderRows) || [],
          orderItems: assertNoError(itemRows) || [],
          recurring: assertNoError(recurringRows) || [],
          drivers: orderAssignees,
        });

        if (!active) return;
        const { value: cachedBusinessId } = await Preferences.get({
          key: DATA_BUSINESS_KEY,
        });
        const nextMembership = {
          ...selectedMembership,
          user: session.user,
        };
        setMembership(nextMembership);
        setDrivers(loadedDrivers);
        setBusinessName(business.name);
        await Preferences.set({
          key: `${MEMBERSHIP_PREFIX}:${userId}`,
          value: JSON.stringify({ ...selectedMembership, businessName: business.name }),
        });

        if (selectedMembership.role === "owner") {
          const canMergeLocalData =
            !cachedBusinessId || cachedBusinessId === businessId;
          const mergedData = canMergeLocalData
            ? mergeLocalWithRemote(remoteData, latestDataRef.current)
            : remoteData;
          baselineDataRef.current = remoteData;
          setData(mergedData);
          await syncOwnerChanges(
            remoteData,
            mergedData,
            businessId,
            new Set([...loadedDrivers.map((driver) => driver.id), userId]),
          );
          baselineDataRef.current = mergedData;
        } else {
          baselineDataRef.current = remoteData;
          setData(remoteData);
        }
        await Preferences.set({
          key: DATA_BUSINESS_KEY,
          value: businessId,
        });

        setSyncReadyUserId(userId);
        setSyncStatus("synced");
      } catch (error) {
        if (!active) return;
        console.error("Supabase relational sync failed:", error);
        setSyncError(error.message || "Unable to connect to Supabase.");
        setSyncStatus("error");
        if (
          error.message?.includes("no business role") ||
          error.message?.includes("business could not be found")
        ) {
          setMembership(null);
          setAuthError(error.message);
        }
      }
    };

    initializeRelationalSync();
    return () => {
      active = false;
    };
  }, [session, isLocalLoaded, retryCount, setData]);

  useEffect(() => {
    const userId = session?.user?.id;
    const currentMembership = membership;
    if (
      !supabase ||
      !userId ||
      !currentMembership ||
      syncReadyUserId !== userId ||
      currentMembership.role !== "owner"
    ) {
      return undefined;
    }

    if (!navigator.onLine) {
      setSyncStatus("offline");
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      setSyncStatus("syncing");
      setSyncError("");
      try {
        await syncOwnerChanges(
          baselineDataRef.current,
          data,
          currentMembership.business_id,
          new Set([
            ...drivers.map((driver) => driver.id),
            session.user.id,
          ]),
        );
        baselineDataRef.current = normalizeAppData(data);
        setSyncStatus("synced");
      } catch (error) {
        console.error("Supabase relational write failed:", error);
        setSyncError(error.message || "Unable to sync changes.");
        setSyncStatus("error");
      }
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [data, drivers, membership, retryCount, session?.user?.id, syncReadyUserId]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (
      !supabase ||
      !userId ||
      !membership ||
      membership.role !== "delivery_driver" ||
      syncReadyUserId !== userId
    ) {
      return undefined;
    }

    let active = true;
    const flushDriverOutbox = async () => {
      if (!navigator.onLine) {
        setSyncStatus("offline");
        return;
      }
      const key = `${OUTBOX_PREFIX}:${userId}:${membership.business_id}`;
      const { value } = await Preferences.get({ key });
      const outbox = value ? JSON.parse(value) : [];
      const remaining = [];
      let hasError = false;

      for (let index = 0; index < outbox.length; index += 1) {
        const operation = outbox[index];
        try {
          const { error } =
            operation.type === "payment"
              ? await supabase.rpc("driver_record_order_payment", {
                  p_business_id: operation.businessId,
                  p_order_id: operation.orderId,
                  p_payment_id: operation.paymentId,
                  p_amount: operation.amount,
                })
              : operation.type === "delivery"
                ? await supabase.rpc("driver_confirm_delivery", {
                    p_business_id: operation.businessId,
                    p_order_id: operation.orderId,
                    p_bottles_returned: operation.bottlesReturned,
                    p_delivered_by: operation.deliveredBy,
                  })
              : await supabase.rpc("driver_update_delivery_status", {
                  p_business_id: operation.businessId,
                  p_order_id: operation.orderId,
                  p_status: operation.status,
                });
          if (error) throw error;
        } catch (error) {
          remaining.push(...outbox.slice(index));
          if (navigator.onLine) {
            hasError = true;
            console.error("Driver outbox operation failed:", error);
          }
          if (active && navigator.onLine) {
            setSyncError(error.message || "Unable to sync driver changes.");
            setSyncStatus("error");
          }
          break;
        }
      }

      await Preferences.set({ key, value: JSON.stringify(remaining) });
      if (active && hasError) {
        return;
      }
      if (active && remaining.length > 0) {
        setSyncStatus("offline");
      } else if (active && navigator.onLine && !hasError) {
        setSyncStatus("synced");
        setSyncError("");
        if (outbox.length) setRetryCount((count) => count + 1);
      }
    };

    flushDriverOutbox();
    return () => {
      active = false;
    };
  }, [membership, retryCount, session?.user?.id, syncReadyUserId]);

  useEffect(() => {
    const currentMembership = membership;
    const userId = session?.user?.id;
    if (
      !supabase ||
      !userId ||
      !currentMembership ||
      currentMembership.role !== "delivery_driver" ||
      syncReadyUserId !== userId
    ) {
      return undefined;
    }

    const previousOrders = new Map(
      (baselineDataRef.current.orders || []).map((order) => [
        String(order.id),
        order,
      ]),
    );
    const acceptedOrderIds = new Set();
    const changed = (data.orders || []).filter((order) => {
      const previous = previousOrders.get(String(order.id));
      return previous && previous.orderStatus !== order.orderStatus;
    });
    if (!changed.length) return undefined;

    let active = true;
    const persistStatusChanges = async () => {
      for (const order of changed) {
        const status = mapStatusToDatabase(order.orderStatus);
        if (!["out_for_delivery", "delivered"].includes(status)) continue;
        const operation = {
          businessId: currentMembership.business_id,
          orderId: String(order.id),
          status,
        };

        try {
          if (!navigator.onLine) throw new Error("Offline");
          const { error } = await supabase.rpc(
            "driver_update_delivery_status",
            {
              p_business_id: operation.businessId,
              p_order_id: operation.orderId,
              p_status: operation.status,
            },
          );
          if (error) throw error;
          previousOrders.set(String(order.id), order);
          acceptedOrderIds.add(String(order.id));
        } catch (error) {
          if (!navigator.onLine) {
            const key = `${OUTBOX_PREFIX}:${userId}:${operation.businessId}`;
            const { value } = await Preferences.get({ key });
            const outbox = value ? JSON.parse(value) : [];
            await Preferences.set({
              key,
              value: JSON.stringify([...outbox, operation]),
            });
            previousOrders.set(String(order.id), order);
            acceptedOrderIds.add(String(order.id));
            setSyncStatus("offline");
          } else {
            if (active) {
              setSyncError(error.message || "Unable to update delivery status.");
              setSyncStatus("error");
            }
          }
        }
      }
      if (active) {
        const successfulOrders = new Map(
          changed
            .filter((order) => acceptedOrderIds.has(String(order.id)))
            .map((order) => [String(order.id), order]),
        );
        const priorOrders = new Map(
          (baselineDataRef.current.orders || []).map((order) => [
            String(order.id),
            order,
          ]),
        );
        successfulOrders.forEach((order, id) => priorOrders.set(id, order));
        baselineDataRef.current = {
          ...baselineDataRef.current,
          orders: Array.from(priorOrders.values()),
        };
      }
    };

    persistStatusChanges();
    return () => {
      active = false;
    };
  }, [data.orders, membership, session?.user?.id, syncReadyUserId]);

  useEffect(() => {
    if (!supabase) return undefined;
    const handleOnline = () => setRetryCount((count) => count + 1);
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (
      !supabase ||
      !userId ||
      !membership ||
      syncReadyUserId !== userId
    ) {
      return undefined;
    }

    let active = true;
    let refreshTimeoutId;
    const refreshFromRealtime = () => {
      if (!active || !navigator.onLine) return;
      window.clearTimeout(refreshTimeoutId);
      refreshTimeoutId = window.setTimeout(() => {
        if (!active) return;
        setSyncStatus("connecting");
        setRetryCount((count) => count + 1);
      }, 250);
    };
    const channel = supabase.channel(
      `business-data:${membership.business_id}:${userId}`,
    );
    ["customers", "products", "orders", "order_items", "recurring_orders"].forEach(
      (table) => {
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: `business_id=eq.${membership.business_id}`,
          },
          refreshFromRealtime,
        );
      },
    );
    channel.subscribe((status, error) => {
      if (
        active &&
        (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
      ) {
        const message =
          error?.message || `Realtime subscription ${status.toLowerCase()}.`;
        console.error(
          "Supabase relational realtime subscription failed:",
          error || status,
        );
        setSyncError(message);
        setSyncStatus("error");
      }
    });

    return () => {
      active = false;
      window.clearTimeout(refreshTimeoutId);
      supabase.removeChannel(channel);
    };
  }, [membership, session?.user?.id, syncReadyUserId]);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error) {
      setAuthError(error.message || "Unable to sign in.");
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setAuthError(error.message || "Unable to sign out.");
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const updateOwnCredentials = useCallback(
    async ({ currentPassword, email, password }) => {
      if (!supabase || membership?.role !== "owner") {
        throw new Error("Owner access is required to manage credentials.");
      }

      const updates = {};
      if (email?.trim()) updates.email = email.trim();
      if (password) updates.password = password;
      if (!Object.keys(updates).length) {
        throw new Error("Enter a new email address or password.");
      }

      setAuthBusy(true);
      try {
        await reauthenticateUser(session?.user?.email, currentPassword);
        const { data: userData, error } = await supabase.auth.updateUser(updates);
        if (error) throw error;
        return { emailChangePending: Boolean(userData.user?.new_email) };
      } finally {
        setAuthBusy(false);
      }
    },
    [membership?.role, session?.user?.email],
  );

  const updateDriverCredentials = useCallback(
    async ({ currentPassword, driverUserId, email, password }) => {
      if (!supabase || membership?.role !== "owner") {
        throw new Error("Owner access is required to manage driver credentials.");
      }
      if (!email?.trim() && !password) {
        throw new Error("Enter a new email address or password.");
      }

      setAuthBusy(true);
      try {
        await reauthenticateUser(session?.user?.email, currentPassword);
        const { error } = await supabase.functions.invoke(
          "manage-driver-credentials",
          {
            body: {
              businessId: membership.business_id,
              driverUserId,
              email: email?.trim() || undefined,
              password: password || undefined,
            },
          },
        );
        if (error) throw await getFunctionError(error);
      } finally {
        setAuthBusy(false);
      }
    },
    [membership?.business_id, membership?.role, session?.user?.email],
  );

  const createDriverAccount = useCallback(
    async ({ currentPassword, name, email, password }) => {
      if (!supabase || membership?.role !== "owner") {
        throw new Error("Owner access is required to create a delivery account.");
      }
      if (!name?.trim() || !email?.trim() || !password) {
        throw new Error("Enter the driver's name, email, and password.");
      }
      if (password.length < 8) {
        throw new Error("New passwords must be at least 8 characters.");
      }

      setAuthBusy(true);
      try {
        await reauthenticateUser(session?.user?.email, currentPassword);
        const { error } = await supabase.functions.invoke(
          "manage-driver-credentials",
          {
            body: {
              action: "create",
              businessId: membership.business_id,
              name: name.trim(),
              email: email.trim(),
              password,
            },
          },
        );
        if (error) throw await getFunctionError(error);
        setSyncReadyUserId(null);
        setRetryCount((count) => count + 1);
      } finally {
        setAuthBusy(false);
      }
    },
    [membership?.business_id, membership?.role, session?.user?.email],
  );

  const updateDriverStatus = useCallback(
    (orderId, status) => {
      setData((current) => ({
        ...current,
        orders: current.orders.map((order) =>
          String(order.id) === String(orderId)
            ? {
                ...order,
                orderStatus: status,
                deliveredAt:
                  status === "Delivered" ? new Date().toISOString() : order.deliveredAt,
              }
            : order,
        ),
      }));
    },
    [setData],
  );

  const recordDriverPayment = useCallback(
    async (orderId, amount, paymentId) => {
      if (!supabase || membership?.role !== "delivery_driver" || !session?.user?.id) {
        throw new Error("Delivery driver access is required to record payment.");
      }

      const amountInCents = Math.round(Number(amount) * 100);
      if (
        !Number.isFinite(amountInCents) ||
        amountInCents <= 0 ||
        Math.abs(Number(amount) * 100 - amountInCents) > 1e-8
      ) {
        throw new Error("Enter a valid payment amount in rupees and paise.");
      }

      const order = latestDataRef.current.orders.find(
        (item) => String(item.id) === String(orderId),
      );
      if (
        !order ||
        String(order.deliveryBoyId || "") !== String(session.user.id) ||
        amount > amountDue(order)
      ) {
        throw new Error(
          "You can only collect up to the remaining balance on an order assigned to you.",
        );
      }

      const operation = {
        type: "payment",
        businessId: membership.business_id,
        orderId: String(orderId),
        paymentId: String(paymentId),
        amount: amountInCents / 100,
      };
      const enqueue = async () => {
        const key = `${OUTBOX_PREFIX}:${session.user.id}:${membership.business_id}`;
        const { value } = await Preferences.get({ key });
        const outbox = value ? JSON.parse(value) : [];
        if (!outbox.some((item) => item.paymentId === operation.paymentId)) {
          outbox.push(operation);
          await Preferences.set({ key, value: JSON.stringify(outbox) });
        }
        setData((current) => ({
          ...current,
          orders: current.orders.map((item) => {
            if (String(item.id) !== operation.orderId) return item;
            const amountPaid =
              (item.customAmount !== undefined && item.customAmount !== null
                ? Number(item.customAmount)
                : Number(item.amountPaid) || 0) + operation.amount;
            return {
              ...item,
              amountPaid,
              ...(item.customAmount !== undefined && item.customAmount !== null
                ? { customAmount: amountPaid }
                : {}),
              paymentStatus:
                amountPaid >= Number(item.total) ? "Paid" : "Partial",
            };
          }),
        }));
        setSyncStatus("offline");
        return { queued: true };
      };

      if (!navigator.onLine) return enqueue();

      const { error } = await supabase.rpc("driver_record_order_payment", {
        p_business_id: operation.businessId,
        p_order_id: operation.orderId,
        p_payment_id: operation.paymentId,
        p_amount: operation.amount,
      });
      if (error) throw error;

      setData((current) => ({
        ...current,
        orders: current.orders.map((item) => {
          if (String(item.id) !== operation.orderId) return item;
          const amountPaid =
            (item.customAmount !== undefined && item.customAmount !== null
              ? Number(item.customAmount)
              : Number(item.amountPaid) || 0) + operation.amount;
          return {
            ...item,
            amountPaid,
            ...(item.customAmount !== undefined && item.customAmount !== null
              ? { customAmount: amountPaid }
              : {}),
            paymentStatus:
              amountPaid >= Number(item.total) ? "Paid" : "Partial",
          };
        }),
      }));
      setSyncError("");
      setSyncStatus("synced");
      return { queued: false };
    },
    [membership, session?.user?.id, setData],
  );

  const confirmDriverDelivery = useCallback(
    async (orderId, bottlesReturned, deliveredBy) => {
      if (!supabase || membership?.role !== "delivery_driver" || !session?.user?.id) {
        throw new Error("Delivery driver access is required to complete an order.");
      }
      const count = Number(bottlesReturned);
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error("Enter a valid non-negative bottle return count.");
      }

      const order = latestDataRef.current.orders.find(
        (item) => String(item.id) === String(orderId),
      );
      if (
        !order ||
        String(order.deliveryBoyId || "") !== String(session.user.id) ||
        order.orderStatus !== "Out for Delivery"
      ) {
        throw new Error("Only your assigned order that is out for delivery can be completed.");
      }

      const operation = {
        type: "delivery",
        businessId: membership.business_id,
        orderId: String(orderId),
        bottlesReturned: count,
        deliveredBy: String(deliveredBy || "").trim().slice(0, 100),
      };
      if (navigator.onLine) {
        const { error } = await supabase.rpc("driver_confirm_delivery", {
          p_business_id: operation.businessId,
          p_order_id: operation.orderId,
          p_bottles_returned: operation.bottlesReturned,
          p_delivered_by: operation.deliveredBy,
        });
        if (error) throw error;
      } else {
        const key = `${OUTBOX_PREFIX}:${session.user.id}:${membership.business_id}`;
        const { value } = await Preferences.get({ key });
        const outbox = value ? JSON.parse(value) : [];
        if (
          !outbox.some(
            (item) =>
              item.type === "delivery" && item.orderId === operation.orderId,
          )
        ) {
          outbox.push(operation);
          await Preferences.set({ key, value: JSON.stringify(outbox) });
        }
      }

      const deliveredAt = new Date().toISOString();
      const updateOrder = (item) =>
        String(item.id) === operation.orderId
          ? {
              ...item,
              orderStatus: "Delivered",
              deliveredAt,
              deliveredBy: operation.deliveredBy,
              bottlesReturned: operation.bottlesReturned,
            }
          : item;
      const nextData = {
        ...latestDataRef.current,
        orders: latestDataRef.current.orders.map(updateOrder),
      };
      latestDataRef.current = nextData;
      baselineDataRef.current = {
        ...baselineDataRef.current,
        orders: baselineDataRef.current.orders.map(updateOrder),
      };
      setData(nextData);
      if (navigator.onLine) {
        setSyncError("");
        setSyncStatus("synced");
      } else {
        setSyncStatus("offline");
      }
      return { queued: !navigator.onLine };
    },
    [membership, session?.user?.id, setData],
  );

  const syncNow = useCallback(() => {
    if (session?.user?.id) {
      setSyncReadyUserId(null);
      setRetryCount((count) => count + 1);
    }
  }, [session?.user?.id]);

  const appSession = membership
    ? {
        id: session?.user?.id,
        email: session?.user?.email,
        name:
          session?.user?.user_metadata?.display_name ||
          (membership.role === "owner"
            ? "Owner"
            : drivers.find((driver) => driver.id === session?.user?.id)?.name ||
              session?.user?.email?.split("@")[0] ||
              "Delivery driver"),
        role: membership.role === "delivery_driver" ? "delivery" : "owner",
        deliveryBoyId:
          membership.role === "delivery_driver" ? session?.user?.id : null,
        businessId: membership.business_id,
        businessName,
      }
    : null;
  const isSyncReady = Boolean(
    session?.user?.id && syncReadyUserId === session.user.id,
  );

  return {
    isConfigured: isSupabaseConfigured,
    authReady,
    session,
    membership,
    appSession,
    isSyncReady,
    drivers,
    businessName,
    syncStatus,
    syncError,
    authError,
    authBusy,
    signIn,
    signOut,
    updateOwnCredentials,
    updateDriverCredentials,
    createDriverAccount,
    syncNow,
    updateDriverStatus,
    confirmDriverDelivery,
    recordDriverPayment,
  };
}
