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

async function syncOwnerChanges(previous, next, businessId, driverIds) {
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
    const mapped = mapOrderToRows(order, businessId, driverIds);
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
  const latestDataRef = useRef(data);
  const baselineDataRef = useRef(normalizeAppData(data));

  latestDataRef.current = data;

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setMembership(null);
      setSyncReadyUserId(null);
      setSyncStatus(nextSession ? "connecting" : "signed-out");
      setSyncError("");
      setAuthError("");
      setAuthReady(true);
    });

    supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setSession(sessionData?.session || null);
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
          name: profile.display_name || "Delivery driver",
          phone: profile.phone || "",
        }));

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
          drivers: loadedDrivers,
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
            new Set(loadedDrivers.map((driver) => driver.id)),
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
          new Set(drivers.map((driver) => driver.id)),
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
          const { error } = await supabase.rpc(
            "driver_update_delivery_status",
            {
              p_business_id: operation.businessId,
              p_order_id: operation.orderId,
              p_status: operation.status,
            },
          );
          if (error) throw error;
        } catch (error) {
          remaining.push(...outbox.slice(index));
          if (navigator.onLine) {
            hasError = true;
            console.error("Driver delivery update failed:", error);
          }
          if (active && navigator.onLine) {
            setSyncError(error.message || "Unable to update delivery status.");
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
          (membership.role === "owner" ? "Owner" : "Delivery driver"),
        role: membership.role === "delivery_driver" ? "delivery" : "owner",
        deliveryBoyId:
          membership.role === "delivery_driver" ? session?.user?.id : null,
        businessId: membership.business_id,
        businessName,
      }
    : null;

  return {
    isConfigured: isSupabaseConfigured,
    authReady,
    session,
    membership,
    appSession,
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
    syncNow,
    updateDriverStatus,
  };
}
