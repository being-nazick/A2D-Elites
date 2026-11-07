import logoIcon from "./assets/logo.png";
import React, { useState, useEffect, useMemo } from "react";
// import { ThemeProvider, useTheme } from "./app/ThemeContext";
import { generateBill } from "./features/invoiceService";
import { getMonthlySummaries, generateMonthlyStatementPDF } from "./billing";
import {
  Plus,
  Package,
  Clock,
  CheckCircle2,
  Edit2,
  Trash2,
  Search,
  Phone,
  MapPin,
  X,
  ChevronRight,
  Repeat,
  Download,
  ArrowLeft,
  Wallet,
  Navigation,
  Route,
  FileText,
} from "lucide-react";
import { Dialog } from "@capacitor/dialog";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Geolocation } from "@capacitor/geolocation";
import {
  C,
  FONTS,
  EMPTY_DATA,
  weekdayShort,
 } from "./app/constants";
import { useCapacitorStorage } from "./app/storage";
import { useSupabaseSync } from "./app/useSupabaseSync";
import { markSelectedOrdersDelivered } from "./features/orders/ordersTabUtils";
import {
  uid,
  todayStr,
  fmtINR,
  fmtBalance,
  fmtDateShort,
  monthKey,
  iconFor,
  orderTotal,
  amountDue,
  hasCoordinates,
  openCustomerRoute,
  openDeliveryWhatsApp,
} from "./app/helpers";
import {
  AppHeader as SharedAppHeader,
  BottomNav as SharedBottomNav,
  TopBar as SharedTopBar,
  Chip,
  QtyLine,
  StatusPill,
} from "./components/Shared";
import ImportExportModal from "./components/ImportExportModal";
import SupabaseSyncPanel from "./components/SupabaseSyncPanel";

import LocationPicker from "./components/LocationPicker";
// import LoginScreen from "./components/LoginScreen";
import DashboardTab from "./features/dashboard/Dashboard";
import OrdersTab from "./features/orders/OrdersTab";

// ------------------------ App Logic starts -----------------------
function generateRecurringForToday(data) {
  const today = todayStr();
  const dayOfWeek = new Date().getDay();

  let modified = false;
  const newOrders = [];

  const newRecurring = (data.recurring || []).map((recurring) => {
    // Skip inactive recurring orders
    if (!recurring.active) return recurring;

    // Already generated for today
    if (recurring.lastGeneratedDate === today) {
      return recurring;
    }

    // Check whether this recurring order should run today
    let matches = false;
    if (recurring.frequency === "daily") {
      matches = true;
    } else if (recurring.frequency === "weekly") {
      matches = (recurring.daysOfWeek || []).includes(dayOfWeek);
    } else if (recurring.frequency === "alternate") {
      if (!recurring.lastGeneratedDate) {
        matches = true;
      } else {
        const lastGen = new Date(recurring.lastGeneratedDate);
        const todayDate = new Date(today);
        const diffDays = Math.floor((todayDate - lastGen) / (1000 * 60 * 60 * 24));
        matches = diffDays >= 2;
      }
    }

    if (!matches) return recurring;

    modified = true;

    // Create fresh item IDs and calculate item totals
    const items = recurring.items.map((item) => ({
      ...item,
      id: uid("it"),
      total: Math.round((item.qty * item.price + Number.EPSILON) * 100) / 100,
    }));

    // Create today's order
    newOrders.push({
      id: uid("o"),
      customerId: recurring.customerId,
      customerName: recurring.customerName,
      phone: recurring.phone || "",
      address: recurring.address || "",
      items,
      orderDate: today,
      deliveryDate: today,
      paymentStatus: "Pending",
      amountPaid: 0,
      orderStatus: "Pending",
      notes: "Auto-created from recurring order",
      total: orderTotal(items),
      recurringId: recurring.id,
      createdAt: new Date().toISOString(),
      latitude: 0, // <-- added here
      longitude: 0, // <-- added here
    });

    // Mark this recurring order as generated today
    return {
      ...recurring,
      lastGeneratedDate: today,
    };
  });

  // Nothing changed
  if (!modified) {
    return data;
  }

  // Save updated recurring orders + newly generated orders
  return {
    ...data,
    recurring: newRecurring,
    orders: [...data.orders, ...newOrders],
  };
}

async function csvDownload(filename, rows) {
  try {
    const csv = "\uFEFF" + rows
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell ?? "");
            return `"${value.replace(/"/g, '""')}"`;
          })
          .join(","),
      )
      .join("\r\n");

    const isNative = window.Capacitor?.isNativePlatform?.();

    if (isNative) {
      // Native Android / iOS flow
      const result = await Filesystem.writeFile({
        path: filename,
        data: csv,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      await Share.share({
        title: filename,
        url: result.uri,
        dialogTitle: 'Save or Share CSV',
      });
    } else {
      // Web fallback
      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.setAttribute("download", filename);
      link.style.display = "none";

      document.body.appendChild(link);
      requestAnimationFrame(() => {
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 1500);
      });
    }
  } catch (error) {
    console.error("CSV download failed:", error);
    alert("Unable to download the CSV file.");
  }
}
/* ============================== ROOT APP ============================== */
export default function App() {
  const [data, setData, isLoaded] = useCapacitorStorage(
    "business-data",
    EMPTY_DATA,
  );
  const [localUserSession, setLocalUserSession] = useCapacitorStorage(
    "user-session",
    null,
  );
  const supabaseSync = useSupabaseSync({ data, setData, isLocalLoaded: isLoaded });
  const userSession = supabaseSync.isConfigured
    ? supabaseSync.appSession
    : localUserSession;
  const [tab, setTab] = useState("dashboard");
  const activeTab =
    userSession?.role === "delivery" && tab !== "more" ? "orders" : tab;
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [orderModal, setOrderModal] = useState(null); // { order?, prefillCustomer? } or null
  const [custModal, setCustModal] = useState(null);
  const [recurModal, setRecurModal] = useState(null);
  const [returnModalOrder, setReturnModalOrder] = useState(null); // { order, bottlesReturned }
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [moreView, setMoreView] = useState("menu"); // menu | products | recurring | notifications
  const [importExportModalOpen, setImportExportModalOpen] = useState(false);

  useEffect(() => {
    if (isLoaded)
      setData((currentData) => generateRecurringForToday(currentData));
  }, [isLoaded, setData]);

  useEffect(() => {
    if (userSession?.role === "delivery" && tab !== "orders" && tab !== "more") {
      setTab("orders");
    }
  }, [userSession, tab]);

  useEffect(() => {
    if (userSession?.role === "delivery") {
      setMoreView("menu");
      setImportExportModalOpen(false);
      setOrderModal(null);
      setCustModal(null);
      setRecurModal(null);
      setReturnModalOrder(null);
      setActiveCustomer(null);
    }
  }, [userSession?.role]);

  function update(mutator) {
    setData((prev) => {
      const next = mutator(structuredClone(prev));
      return next;
    });
  }

  /* ---------- order CRUD ---------- */
  function upsertOrder(order) {
    update((d) => {
      const items = order.items.filter((it) => it.qty > 0);
      const total = orderTotal(items);
      const full = { ...order, items, total };
      const idx = d.orders.findIndex((o) => o.id === order.id);
      if (idx >= 0) d.orders[idx] = full;
      else d.orders.push(full);
      // ensure customer exists
      if (
        order.customerId &&
        !d.customers.find((c) => c.id === order.customerId)
      ) {
        d.customers.push({
          id: order.customerId,
          name: order.customerName,
          phone: order.phone,
          address: order.address,
          createdAt: new Date().toISOString(),
        });
      } else if (order.customerId) {
        const c = d.customers.find((c) => c.id === order.customerId);
        if (c) {
          c.phone = order.phone || c.phone;
          c.address = order.address || c.address;
        }
      }
      return d;
    });
  }
  function deleteOrder(id) {
    update((d) => {
      d.orders = d.orders.filter((o) => o.id !== id);
      return d;
    });
  }

  function markDelivered(id) {
    if (userSession?.role === "delivery") {
      supabaseSync.updateDriverStatus(id, "Delivered");
      return;
    }
    const order = data.orders.find((item) => item.id === id);
    if (!order) return;
    // Open unified delivery modal for all orders
    setReturnModalOrder(order);
  }

  function markOrdersDelivered(orderIds) {
    const selectedIds = new Set(orderIds.map(String));

    if (userSession?.role === "delivery") {
      data.orders
        .filter(
          (order) =>
            selectedIds.has(String(order.id)) &&
            String(order.deliveryBoyId || "") ===
              String(userSession.deliveryBoyId || "") &&
            order.orderStatus === "Out for Delivery",
        )
        .forEach((order) =>
          supabaseSync.updateDriverStatus(order.id, "Delivered"),
        );
      return;
    }

    const deliveredAt = new Date().toISOString();
    update((d) => {
      d.orders = markSelectedOrdersDelivered(
        d.orders,
        Array.from(selectedIds),
        deliveredAt,
      );
      return d;
    });
  }

  function startDelivery(id) {
    supabaseSync.updateDriverStatus(id, "Out for Delivery");
  }

  function confirmDelivery(payload, maybeBottles) {
    let orderId, deliveredBy, customAmount, bottlesReturned;
    if (typeof payload === "object" && payload !== null) {
      orderId = payload.orderId;
      deliveredBy = payload.deliveredBy;
      customAmount = payload.customAmount;
      bottlesReturned = payload.bottlesReturned;
    } else {
      orderId = payload;
      bottlesReturned = maybeBottles;
    }

    const existingOrder = data.orders.find((o) => o.id === orderId);
    if (!existingOrder) return;

    const parsedBottlesReturned = Number(bottlesReturned);
    // Allow returning bottles accumulated from previous orders by not capping at current order qty.
    // Only ensure the value is non-negative.
    const validBottles = Number.isFinite(parsedBottlesReturned)
      ? Math.max(0, Math.floor(parsedBottlesReturned))
      : 0;

    const finalDeliveredBy = String(deliveredBy || "").trim();
    const orderTotalVal = Number(existingOrder.total) || orderTotal(existingOrder.items || []);
    const parsedCustomAmount = Number(customAmount);
    const finalCustomAmount =
      customAmount !== undefined && customAmount !== null && customAmount !== ""
        ? Number.isFinite(parsedCustomAmount)
          ? Math.max(0, Math.round(parsedCustomAmount))
          : 0
        : orderTotalVal;

    let paymentStatus = existingOrder.paymentStatus || "Pending";
    if (finalCustomAmount >= orderTotalVal) {
      paymentStatus = "Paid";
    } else if (finalCustomAmount > 0) {
      paymentStatus = "Partial";
    } else {
      paymentStatus = "Pending";
    }

    const deliveredOrder = {
      ...existingOrder,
      total: orderTotalVal,
      orderStatus: "Delivered",
      deliveredBy: finalDeliveredBy || existingOrder.deliveredBy || "",
      deliveryBoyName: finalDeliveredBy || existingOrder.deliveryBoyName || "",
      customAmount: finalCustomAmount,
      amountPaid: finalCustomAmount,
      paymentStatus,
      bottlesReturned: validBottles,
      deliveredAt: new Date().toISOString(),
    };

    update((d) => {
      const idx = d.orders.findIndex((o) => o.id === orderId);
      if (idx >= 0) {
        d.orders[idx] = deliveredOrder;
      }
      // Recompute and persist balance on customer record
      if (deliveredOrder.customerId) {
        const custOrders = d.orders.filter(
          (o) =>
            String(o.customerId) === String(deliveredOrder.customerId) &&
            o.orderStatus !== "Cancelled",
        );
        const totalPaid = custOrders.reduce((sum, o) => {
          const paid =
            o.customAmount !== undefined && o.customAmount !== null
              ? Number(o.customAmount)
              : o.paymentStatus === "Paid"
                ? Number(o.total)
                : Number(o.amountPaid) || 0;
          return sum + (Number(paid) || 0);
        }, 0);
        const totalPurchased = custOrders.reduce(
          (sum, o) => sum + (Number(o.total) || 0),
          0,
        );
        const custIdx = d.customers.findIndex(
          (c) => String(c.id) === String(deliveredOrder.customerId),
        );
        if (custIdx >= 0) {
          d.customers[custIdx] = {
            ...d.customers[custIdx],
            balance: totalPaid - totalPurchased,
          };
        }
      }
      return d;
    });

    setReturnModalOrder(null);
    openDeliveryWhatsApp(deliveredOrder, data.orders, data.customers);
  }

  function clearCustomerBottleBalance(customerId) {
    update((d) => {
      const customer = d.customers.find(
        (c) => String(c.id) === String(customerId),
      );
      if (!customer) return d;

      const bottleBalance = d.orders
        .filter(
          (order) =>
            String(order.customerId) === String(customerId) &&
            order.orderStatus !== "Cancelled",
        )
        .reduce((balance, order) => {
          const sent = (order.items || [])
            .filter(
              (item) =>
                (item.category || "").toLowerCase() === "milk" ||
                (item.productName || "").toLowerCase().includes("milk"),
            )
            .reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
          return balance + sent - (Number(order.bottlesReturned) || 0);
        }, 0);

      customer.bottleBalanceAdjustment = -bottleBalance;
      return d;
    });
  }

  function markPaid(id) {
    update((d) => {
      const o = d.orders.find((o) => o.id === id);
      if (o) {
        const total = Number(o.total) || orderTotal(o.items || []);
        o.paymentStatus = "Paid";
        o.amountPaid = total;
        o.customAmount = total;
      }
      return d;
    });
  }

  /* ---------- customer CRUD ---------- */
  function upsertCustomer(c) {
    update((d) => {
      const idx = d.customers.findIndex((x) => x.id === c.id);
      if (idx >= 0) d.customers[idx] = { ...d.customers[idx], ...c };
      else d.customers.push(c);
      return d;
    });
  }
  function deleteCustomer(id) {
    update((d) => {
      d.customers = d.customers.filter((c) => c.id !== id);
      return d;
    });
  }

  /* ---------- recurring CRUD ---------- */
  function upsertRecurring(r) {
    update((d) => {
      const idx = d.recurring.findIndex((x) => x.id === r.id);
      if (idx >= 0) d.recurring[idx] = r;
      else d.recurring.push(r);
      return d;
    });
  }
  function deleteRecurring(id) {
    update((d) => {
      d.recurring = d.recurring.filter((r) => r.id !== id);
      return d;
    });
  }

  /* ---------- product CRUD ---------- */
  function upsertProduct(p) {
    update((d) => {
      const idx = d.products.findIndex((x) => x.id === p.id);
      if (idx >= 0) d.products[idx] = p;
      else d.products.push(p);
      return d;
    });
  }

  const pendingDeliveries = data.orders.filter(
    (o) => o.orderStatus === "Pending",
  ).length;
  const pendingPayments = data.orders.filter(
    (o) => o.paymentStatus !== "Paid" && o.orderStatus !== "Cancelled",
  ).length;

  if (supabaseSync.isConfigured && !supabaseSync.authReady) {
    return (
      <div role="status" style={{ padding: 32, textAlign: "center", color: C.inkMute }}>
        Connecting to Supabase…
      </div>
    );
  }

  if (
    supabaseSync.isConfigured &&
    supabaseSync.authReady &&
    (!supabaseSync.session || !supabaseSync.appSession)
  ) {
    return (
      <SupabaseSyncPanel
        sync={supabaseSync}
        showBack={false}
        onBack={() => {}}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: "'DM Sans',sans-serif",
        color: C.ink,
        paddingBottom: 84,
      }}
    >
      <style>{`${FONTS}
          * { box-sizing: border-box; }
          input, select, textarea { font-family: 'DM Sans', sans-serif; }
          input:focus, select:focus, textarea:focus { outline: 2px solid ${C.primary}; outline-offset: 1px; }
          button { font-family: 'DM Sans', sans-serif; cursor: pointer; }
          ::-webkit-scrollbar { height: 6px; width: 6px; }
          .tap { transition: transform .12s ease, opacity .12s ease; }
          .tap:active { transform: scale(0.97); opacity: 0.85; }
          @media (prefers-reduced-motion: reduce) { .tap { transition: none; } }
        `}</style>

      <div style={{ maxWidth: 480, margin: "0 auto", position: "relative" }}>
        <SharedAppHeader
          logo={logoIcon}
          userSession={userSession}
          onLogout={
            supabaseSync.isConfigured
              ? supabaseSync.signOut
              : () => setLocalUserSession(null)
          }
        />
        {activeTab === "dashboard" && (
          <DashboardTab
            data={data}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            onAddOrder={() => setOrderModal({})}
            onQuickAction={{
              markDelivered,
              markPaid,
              edit: (o) => setOrderModal({ order: o }),
              del: deleteOrder,
              orders: data.orders,
            }}
            onOpenCustomer={(c) => {
              setActiveCustomer(c);
              setTab("customers");
            }}
            OrderRow={OrderRow}
            navBtnStyle={navBtnStyle}
          />
        )}
        {activeTab === "orders" && (
          <OrdersTab
            data={data}
            onAdd={() => setOrderModal({})}
            onEdit={(o) => setOrderModal({ order: o })}
            onDelete={deleteOrder}
            onMarkDelivered={markDelivered}
            onBulkMarkDelivered={markOrdersDelivered}
            onStartDelivery={startDelivery}
            onMarkPaid={markPaid}
            OrderRow={OrderRow}
            userSession={userSession}
          />
        )}
        {activeTab === "customers" && (
          <CustomersTab
            data={data}
            activeCustomer={activeCustomer}
            setActiveCustomer={setActiveCustomer}
            onAddCustomer={() => setCustModal({})}
            onEditCustomer={(c) => setCustModal({ customer: c })}
            onNewOrderFor={(c) => setOrderModal({ prefillCustomer: c })}
            onEditOrder={(o) => setOrderModal({ order: o })}
            onDeleteCustomer={deleteCustomer}
            onClearBottleBalance={clearCustomerBottleBalance}
          />
        )}
        {activeTab === "reports" && <ReportsTab data={data} />}
        {activeTab === "more" && (
          <MoreTab
            view={moreView}
            setView={setMoreView}
            data={data}
            onSaveProduct={upsertProduct}
            onAddRecurring={() => setRecurModal({})}
            onEditRecurring={(r) => setRecurModal({ recurring: r })}
            onDeleteRecurring={deleteRecurring}
            onOpenImportExport={() => setImportExportModalOpen(true)}
            pendingDeliveries={pendingDeliveries}
            pendingPayments={pendingPayments}
            supabaseSync={supabaseSync}
            userSession={userSession}
          />
        )}
      </div>

      <SharedBottomNav
        tab={activeTab}
        setTab={setTab}
        badge={pendingDeliveries}
        role={userSession?.role === "delivery" ? "delivery" : "owner"}
      />

      {orderModal && (
        <OrderModal
          initial={orderModal.order}
          prefillCustomer={orderModal.prefillCustomer}
          products={data.products}
          customers={data.customers}
          drivers={supabaseSync.drivers}
          onClose={() => setOrderModal(null)}
          onSave={(o) => {
            upsertOrder(o);
            setOrderModal(null);
          }}
        />
      )}
      {custModal && (
        <CustomerModal
          initial={custModal.customer}
          onClose={() => setCustModal(null)}
          onSave={(c) => {
            upsertCustomer(c);
            setCustModal(null);
          }}
        />
      )}
      {recurModal && (
        <RecurringModal
          initial={recurModal.recurring}
          products={data.products}
          customers={data.customers}
          onClose={() => setRecurModal(null)}
          onSave={(r) => {
            upsertRecurring(r);
            setRecurModal(null);
          }}
        />
      )}
      {returnModalOrder && (
        <ReturnBottleModal
          order={returnModalOrder}
          userSession={userSession}
          data={data}
          onClose={() => setReturnModalOrder(null)}
          onConfirm={confirmDelivery}
        />
      )}
      <ImportExportModal
        isOpen={importExportModalOpen}
        onClose={() => setImportExportModalOpen(false)}
        data={data}
        setData={setData}
      />
    </div>
  );
}

/* ============================== DASHBOARD ============================== */
const navBtnStyle = {
  width: 30,
  height: 30,
  borderRadius: 10,
  border: `1px solid ${C.paperLine}`,
  background: C.paper,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: C.ink,
};

function OrderRow({ order, actions, onOpenCustomer, data }) {
  return (
    <div
      style={{
        background: C.paper,
        border: `1px solid ${C.paperLine}`,
        borderRadius: 14,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div
          className="tap"
          onClick={() =>
            onOpenCustomer &&
            onOpenCustomer({ id: order.customerId, name: order.customerName })
          }
        >
          <div style={{ fontWeight: 700, fontSize: 14, color: C.primaryDark }}>
            {order.customerName}
          </div>
          {order.phone && (
            <div
              style={{
                fontSize: 11.5,
                color: C.inkMute,
                marginTop: 1,
              }}
            >
              {order.phone}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontFamily: "'Fraunces',serif",
              fontSize: 16,
              fontWeight: 600,
              color: C.primaryDark,
            }}
          >
            {fmtINR(order.total)}
          </div>
          {order.paymentStatus !== "Paid" && amountDue(order) > 0 && (
            <div
              style={{
                fontSize: 10.5,
                color: C.brick,
                fontWeight: 700,
                marginTop: 1,
              }}
            >
              {fmtINR(amountDue(order))} due
            </div>
          )}
        </div>
      </div>

      <QtyLine items={order.items} />

      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginTop: 2,
        }}
      >
        <StatusPill status={order.orderStatus} kind="order" />
        <StatusPill status={order.paymentStatus} kind="pay" />
        {order.deliveredBy && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 12,
              background: C.primarySoft,
              color: C.primaryDark,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            By: {order.deliveredBy}
          </span>
        )}
        {order.customAmount !== undefined && order.customAmount !== null && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 12,
              background: C.goldSoft,
              color: C.gold,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Paid: {fmtINR(order.customAmount)}
          </span>
        )}
        {order.bottlesReturned > 0 && (
          <StatusPill
            status={`Returned: ${order.bottlesReturned}`}
            kind="order"
          />
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          paddingTop: 4,
        }}
      >
        {actions.isDelivery ? (
          String(order.deliveryBoyId || "") ===
            String(actions.deliveryBoyId || "") && (
            <>
              {order.orderStatus === "Pending" && (
                <ActionBtn
                  onClick={() => actions.markOutForDelivery(order.id)}
                  icon={Route}
                  label="Start delivery"
                  tone={C.primary}
                  toneSoft={C.primarySoft}
                />
              )}
              {order.orderStatus === "Out for Delivery" && (
                <ActionBtn
                  onClick={() => actions.markDelivered(order.id)}
                  icon={CheckCircle2}
                  label="Delivered"
                  tone={C.green}
                  toneSoft={C.greenSoft}
                />
              )}
            </>
          )
        ) : (
          <>
            {order.orderStatus === "Pending" && (
              <ActionBtn
                onClick={() => actions.markDelivered(order.id)}
                icon={CheckCircle2}
                label="Delivered"
                tone={C.green}
                toneSoft={C.greenSoft}
              />
            )}
            {order.paymentStatus !== "Paid" && (
              <ActionBtn
                onClick={() => actions.markPaid(order.id)}
                icon={Wallet}
                label="Mark Paid"
                tone={C.gold}
                toneSoft={C.goldSoft}
              />
            )}
            <ActionBtn
              onClick={() => generateBill(order, data.orders, data.customers)}
              icon={Download}
              label="Bill"
              tone={C.primary}
              toneSoft={C.primarySoft}
            />
            <ActionBtn
              onClick={() => actions.edit(order)}
              icon={Edit2}
              label="Edit"
              tone={C.inkMute}
              toneSoft={C.cream}
            />
            <ActionBtn
              onClick={async () => {
                const { value } = await Dialog.confirm({
                  title: "Delete Order",
                  message: "Delete this order?",
                  okButtonTitle: "Delete",
                  cancelButtonTitle: "Cancel",
                });
                if (value) actions.del(order.id);
              }}
              icon={Trash2}
              label="Delete"
              tone={C.brick}
              toneSoft={C.brickSoft}
            />
          </>
        )}
      </div>
    </div>
  );
}
function ActionBtn({ onClick, icon: Icon, label, tone, toneSoft }) {
  return (
    <button
      className="tap"
      onClick={onClick}
      style={{
        border: "none",
        background: toneSoft,
        color: tone,
        borderRadius: 10,
        padding: "6px 10px",
        fontSize: 11.5,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      <Icon size={12.5} /> {label}
    </button>
  );
}

/* ============================== CUSTOMER DETAIL ============================== */
function CustomerDetail({
  activeCustomer,
  full,
  data,
  setActiveCustomer,
  onNewOrderFor,
  onEditCustomer,
  onDeleteCustomer,
  onEditOrder,
  onClearBottleBalance,
}) {
  const [viewTab, setViewTab] = useState("orders");
  const [downloadingMonthKey, setDownloadingMonthKey] = useState(null);

  const getOrderTotal = (order) => {
    if (order.total !== undefined && order.total !== null) {
      return Number(order.total) || 0;
    }
    return (order.items || []).reduce(
      (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0),
      0,
    );
  };

  const custId = activeCustomer?.id || activeCustomer;
  const custName = full?.name || activeCustomer?.name || "";

  const orders = useMemo(
    () =>
      (data.orders || [])
        .filter((o) => {
          const matchId = Boolean(custId && String(o.customerId) === String(custId));
          const matchName = Boolean(custName && o.customerName && String(o.customerName).toLowerCase().trim() === custName.toLowerCase().trim());
          return matchId || matchName;
        })
        .sort((a, b) => new Date(b.orderDate || 0) - new Date(a.orderDate || 0)),
    [data.orders, custId, custName],
  );

  const monthlySummaries = useMemo(
    () => getMonthlySummaries(custId, data.orders, custName),
    [custId, data.orders, custName],
  );

  const ledgerOrders = useMemo(
    () =>
      orders
        .filter((o) => o.orderStatus !== "Cancelled")
        .slice()
        .sort((a, b) => new Date(a.orderDate || 0) - new Date(b.orderDate || 0)),
    [orders],
  );

  const { cumulativeBalanceMap, customerBalance } = useMemo(() => {
    let runningBalance = 0;
    const map = {};
    ledgerOrders.forEach((o) => {
      const total = getOrderTotal(o);
      const paid =
        o.customAmount !== undefined && o.customAmount !== null
          ? Number(o.customAmount)
          : o.paymentStatus === "Paid"
            ? total
            : Number(o.amountPaid) || 0;
      // Balance impact: amount paid minus order charges
      const balanceImpact = paid - total;
      runningBalance += balanceImpact;
      map[o.id] = runningBalance;
    });
    return { cumulativeBalanceMap: map, customerBalance: runningBalance };
  }, [ledgerOrders]);

  async function handleDownloadPDF(monthSummary) {
    try {
      setDownloadingMonthKey(monthSummary.monthKey);
      await generateMonthlyStatementPDF(full, monthSummary, data.orders);
    } catch (err) {
      console.error("Monthly statement generation error:", err);
      alert("Failed to generate PDF statement.");
    } finally {
      setDownloadingMonthKey(null);
    }
  }

  return (
    <div>
      {/* HEADER */}
      <div
        style={{
          padding: "18px 16px 8px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button
          className="tap"
          onClick={() => setActiveCustomer(null)}
          style={navBtnStyle}
        >
          <ArrowLeft size={16} />
        </button>

        <div
          style={{
            fontFamily: "'Fraunces',serif",
            fontSize: 20,
            fontWeight: 600,
          }}
        >
          {full.name}
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>
        {/* PHONE */}
        {full.phone && (
          <div
            style={{
              fontSize: 13,
              color: C.inkMute,
              display: "flex",
              alignItems: "center",
              gap: 5,
              marginTop: 2,
            }}
          >
            <Phone size={13} />
            {full.phone}
          </div>
        )}

        {/* ADDRESS */}
        {full.address && (
          <div
            style={{
              fontSize: 13,
              color: C.inkMute,
              display: "flex",
              alignItems: "center",
              gap: 5,
              marginTop: 2,
            }}
          >
            <MapPin size={13} />
            {full.address}
          </div>
        )}

        {/* NAVIGATION */}
        {hasCoordinates(full) && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${full.latitude},${full.longitude}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginTop: 6,
              color: C.primary,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <Navigation size={13} />
            Navigate to customer
          </a>
        )}

        {/* CUSTOMER STATS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginTop: 14,
          }}
        >
          <MiniStat label="Total Orders" value={full.totalOrders} />

          <MiniStat
            label="Total Purchased"
            value={fmtINR(full.totalAmount)}
          />

          <MiniStat
            label="Customer Balance"
            value={fmtBalance(customerBalance)}
            tone={customerBalance > 0 ? C.green : customerBalance < 0 ? C.brick : C.ink}
          />

          <MiniStat
            label="Bottles Owed"
            value={full.bottlesOwed || 0}
            tone={full.bottlesOwed > 0 ? C.gold : C.ink}
          />

          <MiniStat
            label="Last Order"
            value={full.lastOrder ? fmtDateShort(full.lastOrder) : "—"}
          />
        </div>

        {/* ACTION BUTTONS */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 14,
          }}
        >
          <button
            className="tap"
            onClick={() => onNewOrderFor(full)}
            style={{
              flex: 1,
              background: C.primary,
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "11px",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            + New Order
          </button>

          <button
            className="tap"
            onClick={() => onEditCustomer(full)}
            style={{
              background: C.cream,
              border: "none",
              borderRadius: 12,
              padding: "11px 14px",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <Edit2 size={14} />
          </button>

          <button
            className="tap"
            onClick={() => {
              if (
                window.confirm(
                  "Are you sure you want to delete this customer? Their past orders will remain in history.",
                )
              ) {
                onDeleteCustomer(full.id);
                setActiveCustomer(null);
              }
            }}
            style={{
              background: C.brickSoft,
              color: C.brick,
              border: "none",
              borderRadius: 12,
              padding: "11px 14px",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* CLEAR ALL BOTTLE BALANCE */}
        <div style={{ marginTop: 10 }}>
          <button
            className="tap"
            onClick={async () => {
              let confirmed = false;
              try {
                const res = await Dialog.confirm({
                  title: "Clear Bottle Balance",
                  message: `Are you sure you want to clear all bottle balance for ${full.name}? This will reset bottles owed to 0.`,
                  okButtonTitle: "Clear",
                  cancelButtonTitle: "Cancel",
                });
                confirmed = res.value;
              } catch (e) {
                confirmed = window.confirm(
                  `Are you sure you want to clear all bottle balance for ${full.name}? This will reset bottles owed to 0.`,
                );
              }
              if (confirmed && onClearBottleBalance) {
                onClearBottleBalance(full.id);
              }
            }}
            style={{
              width: "100%",
              background: full.bottlesOwed > 0 ? C.goldSoft : C.paper,
              color: full.bottlesOwed > 0 ? C.gold : C.inkMute,
              border: `1px solid ${full.bottlesOwed > 0 ? C.gold : C.paperLine}`,
              borderRadius: 12,
              padding: "10px 14px",
              fontWeight: 700,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer",
            }}
          >
            <span>🥛</span> Clear All Bottle Balance
          </button>
        </div>

        {/* SECTION TOGGLE: ORDER HISTORY VS BILLING HISTORY */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 20,
            marginBottom: 12,
          }}
        >
          <button
            className="tap"
            onClick={() => setViewTab("orders")}
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: 10,
              border: `1px solid ${viewTab === "orders" ? C.primary : C.paperLine}`,
              background: viewTab === "orders" ? C.primarySoft : C.paper,
              color: viewTab === "orders" ? C.primaryDark : C.inkMute,
              fontWeight: 700,
              fontSize: 12.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Clock size={14} /> Order History ({orders.length})
          </button>

          <button
            className="tap"
            onClick={() => setViewTab("billing")}
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: 10,
              border: `1px solid ${viewTab === "billing" ? C.primary : C.paperLine}`,
              background: viewTab === "billing" ? C.primarySoft : C.paper,
              color: viewTab === "billing" ? C.primaryDark : C.inkMute,
              fontWeight: 700,
              fontSize: 12.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <FileText size={14} /> Billing History ({monthlySummaries.length})
          </button>
        </div>
      </div>

      {/* VIEW CONTENTS */}
      {viewTab === "orders" ? (
        <div
          style={{
            padding: "0 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {orders.length === 0 && (
            <div style={{ color: C.inkMute, fontSize: 13 }}>
              No orders yet.
            </div>
          )}

          {orders.map((o) => {
            const isCancelled = o.orderStatus === "Cancelled";
            const orderTotalVal = getOrderTotal(o);
            const amountPaid =
              o.customAmount !== undefined && o.customAmount !== null
                ? Number(o.customAmount) || 0
                : Number(o.amountPaid) || 0;
            const orderDue = Math.max(0, orderTotalVal - amountPaid);
            const cumBal = cumulativeBalanceMap[o.id];

            return (
              <div
                key={o.id}
                className="tap"
                onClick={() => onEditOrder(o)}
                style={{
                  background: C.paper,
                  border: `1px solid ${C.paperLine}`,
                  borderRadius: 12,
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: C.inkMute,
                      fontFamily: "'JetBrains Mono',monospace",
                    }}
                  >
                    {fmtDateShort(o.orderDate)}
                  </div>

                  <QtyLine items={o.items} />

                  {!isCancelled && orderDue > 0 && (
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 10,
                        color: C.brick,
                        fontWeight: 700,
                      }}
                    >
                      {fmtINR(orderDue)} due
                    </div>
                  )}
                </div>

                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontFamily: "'JetBrains Mono',monospace",
                    }}
                  >
                    {fmtINR(orderTotalVal)}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 6,
                      marginTop: 3,
                    }}
                  >
                    {!isCancelled && cumBal !== undefined && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "2px 5px",
                          borderRadius: 4,
                          background:
                            cumBal > 0
                              ? C.greenSoft || "#e8f5e9"
                              : cumBal < 0
                                ? C.brickSoft || "#ffebee"
                                : "#f1f3f5",
                          color:
                            cumBal > 0
                              ? C.green || "#2e7d32"
                              : cumBal < 0
                                ? C.brick || "#c62828"
                                : "#6c757d",
                          fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >
                        Cum. Bal: {fmtBalance(cumBal)}
                      </span>
                    )}

                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        if (o.orderStatus === "Delivered") {
                          openDeliveryWhatsApp(o, data.orders, data.customers);
                        }
                      }}
                      style={{
                        cursor:
                          o.orderStatus === "Delivered" ? "pointer" : "default",
                      }}
                      title={
                        o.orderStatus === "Delivered"
                          ? "Open delivery WhatsApp"
                          : undefined
                      }
                    >
                      {o.orderStatus === "Delivered" ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeliveryWhatsApp(o, data.orders, data.customers);
                          }}
                          style={{
                            border: "none",
                            padding: 0,
                            margin: 0,
                            background: "transparent",
                            cursor: "pointer",
                          }}
                        >
                          <StatusPill status="Delivered" kind="order" />
                        </button>
                      ) : (
                        <StatusPill status={o.orderStatus} kind="order" />
                      )}
                    </div>
                  </div>

                  {!isCancelled && (
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 9.5,
                        color: orderDue > 0 ? C.brick : C.green,
                        fontWeight: 700,
                      }}
                    >
                      {orderDue > 0 ? `${fmtINR(orderDue)} due` : "Paid"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* BILLING HISTORY LIST */
        <div
          style={{
            padding: "0 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {monthlySummaries.length === 0 ? (
            <div style={{ color: C.inkMute, fontSize: 13 }}>
              No billing history available for this customer.
            </div>
          ) : (
            monthlySummaries.map((ms) => {
              const [y, m] = ms.monthKey.split("-").map(Number);
              const monthName = new Date(y, m - 1, 1).toLocaleString("default", {
                month: "long",
                year: "numeric",
              });
              const bottlesBalance = Math.max(
                0,
                ms.totalBottlesSent - ms.totalBottlesReturned,
              );
              const isDownloading = downloadingMonthKey === ms.monthKey;

              return (
                <div
                  key={ms.monthKey}
                  style={{
                    background: C.paper,
                    border: `1px solid ${C.paperLine}`,
                    borderRadius: 14,
                    padding: "14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: 15,
                          color: C.primaryDark,
                        }}
                      >
                        {monthName}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: C.inkMute,
                          marginTop: 2,
                        }}
                      >
                        {ms.orders.length} order{ms.orders.length !== 1 ? "s" : ""}
                      </div>
                    </div>

                    <button
                      className="tap"
                      onClick={() => handleDownloadPDF(ms)}
                      disabled={isDownloading}
                      style={{
                        background: C.primarySoft,
                        color: C.primaryDark,
                        border: `1px solid ${C.primary}`,
                        borderRadius: 10,
                        padding: "7px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        opacity: isDownloading ? 0.6 : 1,
                      }}
                    >
                      <Download size={13} />
                      {isDownloading ? "Generating..." : "Statement PDF"}
                    </button>
                  </div>

                  {/* SUMMARY CARDS GRID */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr 1fr",
                      gap: 6,
                      background: C.bg || "#f8f9fa",
                      padding: "10px 8px",
                      borderRadius: 10,
                      border: `1px solid ${C.paperLine}`,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 9,
                          color: C.inkMute,
                          fontWeight: 700,
                          textTransform: "uppercase",
                        }}
                      >
                        Sales
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: C.ink,
                          marginTop: 2,
                        }}
                      >
                        {fmtINR(ms.totalSales)}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: 9,
                          color: C.green,
                          fontWeight: 700,
                          textTransform: "uppercase",
                        }}
                      >
                        Paid
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: C.green,
                          marginTop: 2,
                        }}
                      >
                        {fmtINR(ms.totalPaid)}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: 9,
                          color: ms.totalPending > 0 ? C.brick : C.inkMute,
                          fontWeight: 700,
                          textTransform: "uppercase",
                        }}
                      >
                        Pending
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: ms.totalPending > 0 ? C.brick : C.ink,
                          marginTop: 2,
                        }}
                      >
                        {fmtINR(ms.totalPending)}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: 9,
                          color: bottlesBalance > 0 ? C.gold : C.inkMute,
                          fontWeight: 700,
                          textTransform: "uppercase",
                        }}
                      >
                        Bottles
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: bottlesBalance > 0 ? C.gold : C.ink,
                          marginTop: 2,
                        }}
                      >
                        {bottlesBalance}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <div style={{ height: 16 }} />
    </div>
  );
}

/* ============================== CUSTOMERS TAB ============================== */
function CustomersTab({
  data,
  activeCustomer,
  setActiveCustomer,
  onAddCustomer,
  onEditCustomer,
  onNewOrderFor,
  onEditOrder,
  onDeleteCustomer,
  onClearBottleBalance,
}) {
  const [q, setQ] = useState("");
  const [selectedRouteCustomers, setSelectedRouteCustomers] = useState([]);

  const stats = useMemo(() => {
    const map = {};
    data.customers.forEach((c) => {
      map[c.id] = {
        ...c,
        totalOrders: 0,
        totalAmount: 0,
        totalPaid: 0,
        balance: c.balance !== undefined ? c.balance : 0,
        pending: 0,
        lastOrder: null,
        bottlesOwed: 0,
      };
    });
    data.orders.forEach((o) => {
      if (!map[o.customerId]) return;
      if (o.orderStatus === "Cancelled") return;
      map[o.customerId].totalOrders += 1;
      const orderTotalVal = Number(o.total) || 0;
      map[o.customerId].totalAmount += orderTotalVal;
      const paid =
        o.customAmount !== undefined && o.customAmount !== null
          ? Number(o.customAmount)
          : o.paymentStatus === "Paid"
            ? orderTotalVal
            : Number(o.amountPaid) || 0;
      map[o.customerId].totalPaid += paid;
      map[o.customerId].pending += amountDue(o);

      const delivered = (o.items || [])
        .filter(
          (it) =>
            (it.category || "").toLowerCase() === "milk" ||
            (it.productName || "").toLowerCase().includes("milk"),
        )
        .reduce((s, it) => s + (Number(it.qty) || 0), 0);
      const returned = Number(o.bottlesReturned) || 0;
      map[o.customerId].bottlesOwed += delivered - returned;

      if (
        !map[o.customerId].lastOrder ||
        o.orderDate > map[o.customerId].lastOrder
      )
        map[o.customerId].lastOrder = o.orderDate;
    });
    return Object.values(map).map((customer) => ({
      ...customer,
      balance: customer.totalPaid - customer.totalAmount,
      bottlesOwed: Math.max(
        0,
        customer.bottlesOwed + (Number(customer.bottleBalanceAdjustment) || 0),
      ),
    }));
  }, [data]);

  const filtered = stats
    .filter(
      (c) =>
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        (c.phone || "").includes(q),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  function toggleRouteCustomer(customerId) {
    setSelectedRouteCustomers((current) =>
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId],
    );
  }
  if (activeCustomer) {
    const full = stats.find((c) => c.id === activeCustomer.id) || {
      ...activeCustomer,
      totalOrders: 0,
      totalAmount: 0,
      totalPaid: 0,
      balance: 0,
      pending: 0,
      lastOrder: null,
      bottlesOwed: 0,
    };

    return (
      <CustomerDetail
        activeCustomer={activeCustomer}
        full={full}
        data={data}
        setActiveCustomer={setActiveCustomer}
        onNewOrderFor={onNewOrderFor}
        onEditCustomer={onEditCustomer}
        onDeleteCustomer={onDeleteCustomer}
        onEditOrder={onEditOrder}
        onClearBottleBalance={onClearBottleBalance}
      />
    );
  }

  return (
    <div>
      <SharedTopBar
        title="Customers"
        subtitle={`${filtered.length} total`}
        right={
          <button
            className="tap"
            onClick={onAddCustomer}
            style={{
              background: C.primary,
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "9px 13px",
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontWeight: 700,
              fontSize: 12.5,
            }}
          >
            <Plus size={15} /> New
          </button>
        }
      />
      <div style={{ padding: "0 16px" }}>
        <div style={{ position: "relative" }}>
          <Search
            size={15}
            style={{
              position: "absolute",
              left: 12,
              top: 11,
              color: C.inkMute,
            }}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or phone"
            style={{
              width: "100%",
              padding: "10px 12px 10px 34px",
              borderRadius: 12,
              border: `1px solid ${C.paperLine}`,
              fontSize: 13.5,
              background: C.paper,
            }}
          />
        </div>
        {selectedRouteCustomers.length > 0 && (
          <button
            className="tap"
            onClick={() =>
              openCustomerRoute(
                stats.filter((customer) =>
                  selectedRouteCustomers.includes(customer.id),
                ),
              )
            }
            style={{
              marginTop: 8,
              width: "100%",
              background: C.primary,
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontWeight: 700,
              fontSize: 12.5,
            }}
          >
            <Route size={15} /> Open route for {selectedRouteCustomers.length}{" "}
            customer{selectedRouteCustomers.length === 1 ? "" : "s"}
          </button>
        )}
      </div>
      <div
        style={{
          padding: "10px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {filtered.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: C.inkMute,
              fontSize: 13,
              padding: "30px 0",
            }}
          >
            No customers yet. Add your first one.
          </div>
        )}
        {filtered.map((c) => (
          <div
            key={c.id}
            className="tap"
            onClick={() => setActiveCustomer(c)}
            style={{
              background: C.paper,
              border: `1px solid ${C.paperLine}`,
              borderRadius: 14,
              padding: "12px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
            }}
          >
            <input
              type="checkbox"
              checked={selectedRouteCustomers.includes(c.id)}
              onChange={() => toggleRouteCustomer(c.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${c.name} for route`}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
              <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 2 }}>
                {c.phone || "No phone"} · {c.totalOrders} orders
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {fmtINR(c.totalAmount)}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color:
                    c.balance > 0
                      ? C.green
                      : c.balance < 0
                        ? C.brick
                        : C.inkMute,
                  fontWeight: 700,
                }}
              >
                Bal: {fmtBalance(c.balance)}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: hasCoordinates(c) ? C.green : C.inkMute,
                  fontWeight: 700,
                }}
              >
                {hasCoordinates(c) ? "GPS saved" : "No GPS"}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}
function MiniStat({ label, value, tone }) {
  return (
    <div
      style={{
        background: C.paper,
        border: `1px solid ${C.paperLine}`,
        borderRadius: 12,
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: 10.5, color: C.inkMute, fontWeight: 600 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Fraunces',serif",
          fontSize: 17,
          fontWeight: 600,
          color: tone || C.ink,
        }}
      >
        {value}
      </div>
    </div>
  )
}

/* ============================== REPORTS TAB ============================== */
function ReportsTab({ data }) {
  const [view, setView] = useState("daily"); // daily | monthly
  const [month, setMonth] = useState(monthKey(todayStr()));
  const [selectedStaff, setSelectedStaff] = useState("All");

  // Unique list of staff from delivery boys and orders
  const staffList = useMemo(() => {
    const set = new Set();
    (data.deliveryBoys || []).forEach((b) => b.name && set.add(b.name));
    (data.orders || []).forEach((o) => {
      const staff = o.deliveredBy || o.deliveryBoyName;
      if (staff) set.add(staff);
      else if (o.orderStatus !== "Cancelled") set.add("Unassigned");
    });
    return Array.from(set).filter(Boolean).sort();
  }, [data.deliveryBoys, data.orders]);

  // Orders for the active month, optionally filtered by delivered by staff
  const monthOrders = useMemo(() => {
    return data.orders.filter((o) => {
      if (monthKey(o.orderDate) !== month || o.orderStatus === "Cancelled") return false;
      if (selectedStaff !== "All") {
        const staff = o.deliveredBy || o.deliveryBoyName || "Unassigned";
        return staff.toLowerCase().trim() === selectedStaff.toLowerCase().trim();
      }
      return true;
    });
  }, [data.orders, month, selectedStaff]);

  // Overall staff breakdown for the selected month
  const staffBreakdown = useMemo(() => {
    const rawMonthOrders = data.orders.filter(
      (o) => monthKey(o.orderDate) === month && o.orderStatus !== "Cancelled",
    );
    const map = {};
    rawMonthOrders.forEach((o) => {
      const staff = o.deliveredBy || o.deliveryBoyName || "Unassigned";
      if (!map[staff]) {
        map[staff] = {
          name: staff,
          deliveries: 0,
          totalSales: 0,
          totalCollected: 0,
          bottlesReturned: 0,
        };
      }
      if (o.orderStatus === "Delivered") {
        map[staff].deliveries += 1;
      }
      map[staff].totalSales += Number(o.total) || 0;
      const collected =
        o.customAmount !== undefined && o.customAmount !== null
          ? Number(o.customAmount)
          : o.paymentStatus === "Paid"
            ? Number(o.total) || 0
            : Number(o.amountPaid) || 0;
      map[staff].totalCollected += collected;
      map[staff].bottlesReturned += Number(o.bottlesReturned) || 0;
    });
    return Object.values(map).sort((a, b) => b.deliveries - a.deliveries);
  }, [data.orders, month]);

  // Memoized calculations and performance metrics, including dailySeries
  const {
    totalSales,
    totalPaid,
    totalPending,
    avgDaily,
    bestDay,
    productTotals,
    dailySeries,
  } = useMemo(() => {
    const sales = monthOrders.reduce((s, o) => s + Number(o.total), 0);
    const paid = monthOrders.reduce(
      (s, o) =>
        s +
        (o.customAmount !== undefined && o.customAmount !== null
          ? Number(o.customAmount) || 0
          : o.paymentStatus === "Paid"
            ? Number(o.total)
            : Number(o.amountPaid || 0)),
      0,
    );
    const pending = monthOrders.reduce((sum, order) => sum + amountDue(order), 0);

    const totals = { Milk: 0, Paneer: 0, Curd: 0 };
    monthOrders.forEach((o) => {
      o.items.forEach((it) => {
        totals[it.category] = (totals[it.category] || 0) + Number(it.qty);
      });
    });

    const [year, m] = month.split("-").map(Number);
    const daysInMonth = new Date(year, m, 0).getDate();

    const series = Array.from({ length: daysInMonth }, (_, i) => {
      const dateStr = `${month}-${String(i + 1).padStart(2, "0")}`;
      const daySales = monthOrders
        .filter((o) => o.orderDate === dateStr)
        .reduce((s, o) => s + o.total, 0);
      return { day: i + 1, sales: daySales };
    });

    const best = series.reduce(
      (b, d) => (d.sales > (b?.sales || 0) ? d : b),
      null,
    );

    const uniqueDaysWithOrders = new Set(monthOrders.map((o) => o.orderDate))
      .size;
    const avg = uniqueDaysWithOrders ? sales / uniqueDaysWithOrders : 0;

    return {
      totalSales: sales,
      totalPaid: paid,
      totalPending: pending,
      avgDaily: avg,
      bestDay: best,
      productTotals: totals,
      dailySeries: series,
    };
  }, [monthOrders, month]);

  const productPie = useMemo(
    () =>
      [
        { name: "Milk", value: productTotals.Milk, color: C.primary },
        { name: "Paneer", value: productTotals.Paneer, color: C.gold },
        { name: "Curd", value: productTotals.Curd, color: C.brick },
      ].filter((p) => p.value > 0),
    [productTotals],
  );

  const payPie = useMemo(
    () =>
      [
        { name: "Paid", value: totalPaid, color: C.green },
        { name: "Pending", value: totalPending, color: C.brick },
      ].filter((p) => p.value > 0),
    [totalPaid, totalPending],
  );

  // Human-friendly formatted best day label
  const formattedBestDay = useMemo(() => {
    if (!bestDay || bestDay.sales <= 0) return "—";
    try {
      const [year, m] = month.split("-");
      const dateObj = new Date(year, Number(m) - 1, bestDay.day);
      const monthName = dateObj.toLocaleString("default", { month: "short" });
      return `${bestDay.day} ${monthName}`;
    } catch {
      return `${bestDay.day} ${month.slice(5, 7)}`;
    }
  }, [bestDay, month]);

  // CSV Exports wrapped in quotes to prevent structural corruption from commas in names/addresses
  function exportMonthlyCSV() {
    const rows = [
      [
        "Date",
        "Customer",
        "Phone",
        "Products",
        "Total (₹)",
        "Amount Collected (₹)",
        "Payment Status",
        "Order Status",
        "Delivered By",
      ],
    ];

    monthOrders.forEach((o) => {
      const itemsStr = (o.items || [])
        .map((it) => `${it.qty}${it.unit || ""} ${it.productName || it.name}`)
        .join(" + ");

      const collected =
        o.customAmount !== undefined && o.customAmount !== null
          ? o.customAmount
          : o.paymentStatus === "Paid"
            ? o.total
            : o.amountPaid || 0;

      rows.push([
        o.orderDate,
        o.customerName || "",
        o.phone || "",
        itemsStr,
        o.total,
        collected,
        o.paymentStatus,
        o.orderStatus,
        o.deliveredBy || o.deliveryBoyName || "Unassigned",
      ]);
    });

    const staffSuffix = selectedStaff !== "All" ? `-${selectedStaff}` : "";
    csvDownload(`sales-report-${month}${staffSuffix}.csv`, rows);
  }

  function exportDeliveryStaffCSV() {
    const rows = [
      [
        "Staff Name",
        "Delivered Orders",
        "Total Order Value (₹)",
        "Total Amount Collected (₹)",
        "Empty Bottles Returned",
      ],
    ];

    staffBreakdown.forEach((s) => {
      rows.push([
        s.name,
        s.deliveries,
        s.totalSales,
        s.totalCollected,
        s.bottlesReturned,
      ]);
    });

    csvDownload(`delivery-staff-report-${month}.csv`, rows);
  }

  function exportPendingCSV() {
  const rows = [["Date", "Customer", "Phone", "Amount Due"]];

  data.orders
      .filter(
        (o) => o.orderStatus !== "Cancelled" && Number(amountDue(o)) > 0,
      )
    .forEach((o) => {
      rows.push([
        o.orderDate,
        o.customerName || "",
        o.phone || "",
        Number(amountDue(o)),
      ]);
    });

  csvDownload("pending-payments.csv", rows);
}


  function exportCustomerCSV() {
    const rows = [
      ["Name", "Phone", "Address", "Total Orders", "Total Amount", "Pending"],
    ];
    const map = {};
    data.customers.forEach((c) => {
      map[c.id] = { ...c, totalOrders: 0, totalAmount: 0, pending: 0 };
    });
    data.orders.forEach((o) => {
      if (map[o.customerId] && o.orderStatus !== "Cancelled") {
        map[o.customerId].totalOrders++;
        map[o.customerId].totalAmount += o.total;
        map[o.customerId].pending += amountDue(o);
      }
    });
    Object.values(map).forEach((c) => {
     rows.push([
      c.name || "",
      c.phone || "",
      c.address || "",
      c.totalOrders,
      c.totalAmount,
      c.pending,
    ]);
  });

    csvDownload("customer-report.csv", rows);
  }

  return (
    <div>
      <SharedTopBar title="Reports" subtitle="Sales, trends & exports" />
      <div style={{ padding: "0 16px", display: "flex", gap: 6 }}>
        <Chip
          active={view === "daily"}
          onClick={() => setView("daily")}
          label="Daily Sales"
        />
        <Chip
          active={view === "monthly"}
          onClick={() => setView("monthly")}
          label="Monthly Report"
        />
      </div>

      <div
        style={{
          padding: "14px 16px 0",
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        <div style={{ flex: 1 }}>
          <label
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: C.inkMute,
              display: "block",
              marginBottom: 4,
              letterSpacing: 0.5,
            }}
          >
            MONTH
          </label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            max={monthKey(todayStr())}
            style={{
              width: "100%",
              padding: "9px 10px",
              borderRadius: 10,
              border: `1px solid ${C.paperLine}`,
              fontSize: 12.5,
              background: C.paper,
            }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <label
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: C.inkMute,
              display: "block",
              marginBottom: 4,
              letterSpacing: 0.5,
            }}
          >
            DELIVERED BY
          </label>
          <select
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 10px",
              borderRadius: 10,
              border: `1px solid ${selectedStaff !== "All" ? C.primary : C.paperLine}`,
              fontSize: 12.5,
              background: selectedStaff !== "All" ? C.primarySoft : C.paper,
              color: selectedStaff !== "All" ? C.primaryDark : C.ink,
              fontWeight: selectedStaff !== "All" ? 700 : 500,
            }}
          >
            <option value="All">All Staff ({staffList.length})</option>
            {staffList.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          padding: "14px 16px 0",
        }}
      >
        <MiniStat
          label="Total Sales"
          value={fmtINR(totalSales)}
          tone={C.primary}
        />
        <MiniStat label="Total Orders" value={monthOrders.length} />
        <MiniStat label="Total Paid" value={fmtINR(totalPaid)} tone={C.green} />
        <MiniStat
          label="Total Pending"
          value={fmtINR(totalPending)}
          tone={C.brick}
        />
        <MiniStat label="Avg Daily Sales" value={fmtINR(avgDaily)} />
        <MiniStat label="Best Sales Day" value={formattedBestDay} />
      </div>

      {view === "daily" ? (
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
            Daily Sales Trend
          </div>
          <div
            style={{
              background: C.paper,
              border: `1px solid ${C.paperLine}`,
              borderRadius: 14,
              padding: "10px 6px",
              height: 190,
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={dailySeries}
                margin={{ top: 8, right: 10, left: -18, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={C.paperLine} />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v) => fmtINR(v)}
                  labelFormatter={(l) => `Day ${l}`}
                />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke={C.primary}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
            Monthly Summary Overview
          </div>
          <div
            style={{
              background: C.paper,
              border: `1px solid ${C.paperLine}`,
              borderRadius: 14,
              padding: 16,
              fontSize: 13,
              color: C.ink,
            }}
          >
            <p style={{ margin: "0 0 8px 0" }}>
              Aggregated analytics active for <strong>{month}</strong>.
            </p>
            <p style={{ margin: 0, color: C.inkMute }}>
              Switch to Daily Sales view anytime to reveal the trend line chart
              breakdown.
            </p>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, padding: "16px 16px 0" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
            Product-wise Sold
          </div>
          <div
            style={{
              background: C.paper,
              border: `1px solid ${C.paperLine}`,
              borderRadius: 14,
              height: 160,
              padding: 6,
            }}
          >
            {productPie.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={productPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={30}
                    outerRadius={55}
                    paddingAngle={3}
                  >
                    {productPie.map((p, i) => (
                      <Cell key={i} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  fontSize: 11,
                  color: C.inkMute,
                  textAlign: "center",
                  paddingTop: 60,
                }}
              >
                No data
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
            Paid vs Pending
          </div>
          <div
            style={{
              background: C.paper,
              border: `1px solid ${C.paperLine}`,
              borderRadius: 14,
              height: 160,
              padding: 6,
            }}
          >
            {payPie.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={payPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={30}
                    outerRadius={55}
                    paddingAngle={3}
                  >
                    {payPie.map((p, i) => (
                      <Cell key={i} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtINR(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  fontSize: 11,
                  color: C.inkMute,
                  textAlign: "center",
                  paddingTop: 60,
                }}
              >
                No data
              </div>
            )}
          </div>
        </div>
      </div>

      {/* STAFF DELIVERY BREAKDOWN */}
      <div style={{ padding: "16px 16px 0" }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 13,
            marginBottom: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Staff Deliveries ({month})</span>
          {selectedStaff !== "All" && (
            <button
              className="tap"
              onClick={() => setSelectedStaff("All")}
              style={{
                fontSize: 11,
                border: "none",
                background: C.primarySoft,
                color: C.primaryDark,
                borderRadius: 8,
                padding: "3px 8px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Reset Filter
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {staffBreakdown.length === 0 ? (
            <div
              style={{
                fontSize: 12,
                color: C.inkMute,
                textAlign: "center",
                padding: "16px 0",
                background: C.paper,
                borderRadius: 12,
                border: `1px solid ${C.paperLine}`,
              }}
            >
              No delivery data recorded for this month.
            </div>
          ) : (
            staffBreakdown.map((st) => (
              <div
                key={st.name}
                className="tap"
                onClick={() =>
                  setSelectedStaff(st.name === selectedStaff ? "All" : st.name)
                }
                style={{
                  background:
                    selectedStaff === st.name ? C.primarySoft : C.paper,
                  border: `1px solid ${selectedStaff === st.name ? C.primary : C.paperLine}`,
                  borderRadius: 12,
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 13.5,
                      color: C.ink,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>🚚</span> {st.name}
                    {selectedStaff === st.name && (
                      <span
                        style={{
                          fontSize: 9.5,
                          background: C.primary,
                          color: "#fff",
                          borderRadius: 6,
                          padding: "1px 5px",
                        }}
                      >
                        Active Filter
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: C.inkMute,
                      marginTop: 2,
                    }}
                  >
                    {st.deliveries} delivered • {st.bottlesReturned} bottles returned
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      fontFamily: "'JetBrains Mono',monospace",
                      color: C.primaryDark,
                    }}
                  >
                    {fmtINR(st.totalCollected)}
                  </div>
                  <div style={{ fontSize: 10, color: C.inkMute }}>collected</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ padding: "18px 16px 4px", fontWeight: 700, fontSize: 14 }}>
        Export
      </div>
      <div
        style={{
          padding: "6px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <ExportBtn
          label="Monthly Sales Report (CSV)"
          onClick={exportMonthlyCSV}
        />
        <ExportBtn
          label="Delivery Staff Report (CSV)"
          onClick={exportDeliveryStaffCSV}
        />
        <ExportBtn
          label="Pending Payment Report (CSV)"
          onClick={exportPendingCSV}
        />
        <ExportBtn label="Customer Report (CSV)" onClick={exportCustomerCSV} />
        <ExportBtn label="Print / Save as PDF" onClick={() => window.print()} />
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}

function ExportBtn({ label, onClick }) {
  return (
    <button
      className="tap"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: C.paper,
        border: `1px solid ${C.paperLine}`,
        borderRadius: 12,
        padding: "12px 14px",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {label} <Download size={15} color={C.inkMute} />
    </button>
  );
}
/* ============================== MORE TAB ============================== */
function MoreTab({
  view,
  setView,
  data,
  onSaveProduct,
  onAddRecurring,
  onEditRecurring,
  onDeleteRecurring,
  onOpenImportExport,
  pendingDeliveries,
  pendingPayments,
  supabaseSync,
  userSession,
}) {
  if (
    userSession?.role === "delivery" &&
    view !== "menu" &&
    view !== "cloud-sync"
  ) {
    return null;
  }
  if (view === "products")
    return (
      <ProductsView
        data={data}
        onSave={onSaveProduct}
        onBack={() => setView("menu")}
      />
    );
  if (view === "recurring")
    return (
      <RecurringView
        data={data}
        onAdd={onAddRecurring}
        onEdit={onEditRecurring}
        onDelete={onDeleteRecurring}
        onBack={() => setView("menu")}
      />
    );
  if (view === "notifications")
    return <NotificationsView data={data} onBack={() => setView("menu")} />;
  if (view === "cloud-sync")
    return <SupabaseSyncPanel sync={supabaseSync} onBack={() => setView("menu")} />;

  const ownerItems = [
    {
      id: "products",
      label: "Products & Pricing",
      desc: "Manage Milk, Paneer, Curd prices",
      icon: "🏷️",
    },
    {
      id: "recurring",
      label: "Recurring Orders",
      desc: "Daily & weekly standing orders",
      icon: "🔁",
    },
    {
      id: "notifications",
      label: "Reminders",
      desc: `${pendingDeliveries} deliveries · ${pendingPayments} payments due`,
      icon: "🔔",
    },
    {
      id: "import-export",
      label: "Import/Export",
      desc: "Backup & restore app data",
      icon: "📤",
    },
    {
      id: "cloud-sync",
      label: "Cloud Sync",
      desc: "Connect a Supabase account",
      icon: "☁️",
    },
];
  const items =
    userSession?.role === "delivery"
      ? ownerItems.filter((item) => item.id === "cloud-sync")
      : ownerItems;
  return (
    <div>
      <SharedTopBar title="More" subtitle="Settings & tools" />
      <div
        style={{
          padding: "6px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {items.map((it) => (
          <div
            key={it.id}
            className="tap"
            onClick={() => {
              if (it.id === "import-export") {
                onOpenImportExport();
              } else {
                setView(it.id);
              }
            }}
            style={{
              background: C.paper,
              border: `1px solid ${C.paperLine}`,
              borderRadius: 14,
              padding: "14px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 22 }}>{it.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{it.label}</div>
              <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>
                {it.desc}
              </div>
            </div>
            <ChevronRight size={16} color={C.inkMute} />
          </div>
        ))}
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}

function ProductsView({ data, onSave, onBack }) {
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div>
      <div
        style={{
          padding: "18px 16px 8px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button className="tap" onClick={onBack} style={navBtnStyle}>
          <ArrowLeft size={16} />
        </button>
        <div
          style={{
            fontFamily: "'Fraunces',serif",
            fontSize: 20,
            fontWeight: 600,
            flex: 1,
          }}
        >
          Products & Pricing
        </div>
        <button
          className="tap"
          onClick={() => setShowAdd(true)}
          style={{
            background: C.primary,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "8px 12px",
            fontWeight: 700,
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Plus size={14} />
          Add
        </button>
      </div>
      <div
        style={{
          padding: "8px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {data.products.map((p) => (
          <div
            key={p.id}
            style={{
              background: C.paper,
              border: `1px solid ${C.paperLine}`,
              borderRadius: 14,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 22 }}>{iconFor(p.category)}</div>
            {editing === p.id ? (
              <InlineProductEdit
                product={p}
                onCancel={() => setEditing(null)}
                onSave={(np) => {
                  onSave(np);
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {p.name}{" "}
                    <span
                      style={{
                        fontWeight: 400,
                        color: C.inkMute,
                        fontSize: 11.5,
                      }}
                    >
                      / {p.unit}
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontWeight: 700,
                      color: C.primary,
                    }}
                  >
                    {fmtINR(p.price)}
                  </div>
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={p.active}
                    onChange={(e) => onSave({ ...p, active: e.target.checked })}
                  />{" "}
                  Active
                </label>
                <button
                  className="tap"
                  onClick={() => setEditing(p.id)}
                  style={{
                    border: "none",
                    background: C.cream,
                    borderRadius: 10,
                    padding: 8,
                  }}
                >
                  <Edit2 size={13} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <div style={{ height: 16 }} />
      {showAdd && (
        <AddProductModal
          onClose={() => setShowAdd(false)}
          onSave={(np) => {
            onSave(np);
            setShowAdd(false);
          }}
          existingIds={data.products.map((p) => p.id)}
        />
      )}
    </div>
  );
}
function AddProductModal({ onClose, onSave, existingIds = [] }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Milk");
  const [unit, setUnit] = useState("Bottle");
  const [price, setPrice] = useState("");

  const categories = ["Milk", "Curd", "Paneer", "Ghee", "Butter", "Other"];
  const units = ["Bottle", "Pack", "Kg", "g", "L", "ml", "Piece"];

  const canSave = name.trim() && Number(price) > 0;

  function handleSave() {
    const idBase = (
      "p_" +
      name.toLowerCase().replace(/[^a-z0-9]+/g, "_") +
      "_" +
      unit.toLowerCase()
    ).replace(/_+/g, "_");
    let id = idBase;
    let n = 1;
    while (existingIds.includes(id)) {
      id = idBase + "_" + ++n;
    }
    onSave({
      id,
      name: name.trim(),
      category,
      unit,
      price: Number(price),
      active: true,
    });
  }

  return (
    <ModalShell
      title="Add New Product"
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="tap"
            onClick={onClose}
            style={{
              flex: 1,
              background: C.cream,
              border: "none",
              borderRadius: 12,
              padding: "12px",
              fontWeight: 700,
              fontSize: 13,
              color: C.ink,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            className="tap"
            onClick={handleSave}
            disabled={!canSave}
            style={{
              flex: 2,
              background: canSave ? C.primary : C.inkMute,
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "12px",
              fontWeight: 700,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              opacity: canSave ? 1 : 0.6,
              cursor: canSave ? "pointer" : "not-allowed",
            }}
          >
            <Plus size={15} />
            Add Product
          </button>
        </div>
      }
    >
      <Field label="Product Name">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Milk Bottle (1000 ml)"
          style={inputStyle}
        />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={inputStyle}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {iconFor(c)} {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unit">
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            style={inputStyle}
          >
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Price (₹)">
        <input
          type="number"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0"
          style={inputStyle}
        />
      </Field>
      <div
        style={{
          background: C.primarySoft,
          border: `1px solid ${C.primarySoft}`,
          borderRadius: 12,
          padding: "10px 12px",
          fontSize: 12,
          color: C.primary,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        💡 New products appear immediately in Orders and Recurring.
      </div>
    </ModalShell>
  );
}
function InlineProductEdit({ product, onCancel, onSave }) {
  const [price, setPrice] = useState(product.price);
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        style={{
          width: 80,
          padding: "7px 8px",
          borderRadius: 8,
          border: `1px solid ${C.paperLine}`,
        }}
      />
      <button
        className="tap"
        onClick={() => onSave({ ...product, price: Number(price) })}
        style={{
          background: C.primary,
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "7px 10px",
          fontSize: 11.5,
          fontWeight: 700,
        }}
      >
        Save
      </button>
      <button
        className="tap"
        onClick={onCancel}
        style={{
          background: C.cream,
          border: "none",
          borderRadius: 8,
          padding: "7px 10px",
          fontSize: 11.5,
        }}
      >
        Cancel
      </button>
    </div>
  );
}

function RecurringView({ data, onAdd, onEdit, onDelete, onBack }) {
  return (
    <div>
      <div
        style={{
          padding: "18px 16px 8px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button className="tap" onClick={onBack} style={navBtnStyle}>
          <ArrowLeft size={16} />
        </button>
        <div
          style={{
            fontFamily: "'Fraunces',serif",
            fontSize: 20,
            fontWeight: 600,
            flex: 1,
          }}
        >
          Recurring Orders
        </div>
        <button
          className="tap"
          onClick={onAdd}
          style={{
            background: C.primary,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "8px 12px",
            fontWeight: 700,
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Plus size={14} />
          New
        </button>
      </div>
      <div
        style={{
          padding: "8px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {data.recurring.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: C.inkMute,
              fontSize: 13,
              padding: "30px 0",
            }}
          >
            No standing orders yet. Add a daily or weekly customer order.
          </div>
        )}
        {data.recurring.map((r) => (
          <div
            key={r.id}
            style={{
              background: C.paper,
              border: `1px solid ${C.paperLine}`,
              borderRadius: 14,
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {r.customerName}
                </div>
                <QtyLine items={r.items} />
                <div style={{ fontSize: 11, color: C.inkMute, marginTop: 3 }}>
                  {r.frequency === "daily"
                    ? "Every day"
                    : r.frequency === "alternate"
                    ? "Alternate days"
                    : `Weekly: ${(r.daysOfWeek || []).map((d) => weekdayShort[d]).join(", ")}`}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: r.active ? C.green : C.inkMute,
                  background: r.active ? C.greenSoft : C.cream,
                  padding: "3px 9px",
                  borderRadius: 20,
                }}
              >
                {r.active ? "Active" : "Paused"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <ActionBtn
                onClick={() => onEdit(r)}
                icon={Edit2}
                label="Edit"
                tone={C.ink}
                toneSoft={C.cream}
              />
              <ActionBtn
                onClick={() => {
                  if (
                    window.confirm(
                      "Are you sure you want to delete this recurring order?",
                    )
                  )
                    onDelete(r.id);
                }}
                icon={Trash2}
                label="Delete"
                tone={C.brick}
                toneSoft={C.brickSoft}
              />
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}

function NotificationsView({ data, onBack }) {
  const today = todayStr();
  const pendingDeliveries = data.orders.filter(
    (o) => o.orderStatus === "Pending",
  );
  const pendingPayments = data.orders.filter(
    (o) => o.paymentStatus !== "Paid" && o.orderStatus !== "Cancelled",
  );
  const overdue = pendingDeliveries.filter((o) => o.deliveryDate < today);
  const activeRecurring = data.recurring.filter((r) => r.active);

  return (
    <div>
      <div
        style={{
          padding: "18px 16px 8px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button className="tap" onClick={onBack} style={navBtnStyle}>
          <ArrowLeft size={16} />
        </button>
        <div
          style={{
            fontFamily: "'Fraunces',serif",
            fontSize: 20,
            fontWeight: 600,
          }}
        >
          Reminders
        </div>
      </div>
      <div
        style={{
          padding: "8px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <NoteCard
          icon={Clock}
          tone={C.brick}
          toneSoft={C.brickSoft}
          title={`${overdue.length} overdue deliveries`}
          desc="Orders past their delivery date, still pending."
        />
        <NoteCard
          icon={Package}
          tone={C.gold}
          toneSoft={C.goldSoft}
          title={`${pendingDeliveries.length} pending deliveries`}
          desc="Orders not yet marked delivered."
        />
        <NoteCard
          icon={Wallet}
          tone={C.brick}
          toneSoft={C.brickSoft}
          title={`${pendingPayments.length} pending payments`}
          desc={`${fmtINR(pendingPayments.reduce((s, o) => s + amountDue(o), 0))} outstanding.`}
        />
        <NoteCard
          icon={Repeat}
          tone={C.primary}
          toneSoft={C.primarySoft}
          title={`${activeRecurring.length} active recurring orders`}
          desc="Auto-generated each matching day."
        />
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}
function NoteCard({ icon: Icon, tone, toneSoft, title, desc }) {
  return (
    <div
      style={{
        background: C.paper,
        border: `1px solid ${C.paperLine}`,
        borderRadius: 14,
        padding: "12px 14px",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: toneSoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={16} color={tone} />
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>
          {desc}
        </div>
      </div>
    </div>
  );
}

/* ============================== MODAL SHELL ============================== */
function ModalShell({ title, onClose, children, footer }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,15,10,0.45)",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: C.bg,
          width: "100%",
          maxWidth: 480,
          maxHeight: "92vh",
          borderRadius: "20px 20px 0 0",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 16px 12px",
            borderBottom: `1px solid ${C.paperLine}`,
            background: C.paper,
          }}
        >
          <div
            style={{
              fontFamily: "'Fraunces',serif",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            {title}
          </div>
          <button
            className="tap"
            onClick={onClose}
            style={{
              border: "none",
              background: C.cream,
              borderRadius: 10,
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: 16, flex: 1 }}>
          {children}
        </div>
        {footer && (
          <div
            style={{
              padding: 16,
              borderTop: `1px solid ${C.paperLine}`,
              background: C.paper,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          color: C.inkMute,
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${C.paperLine}`,
  fontSize: 14,
  background: C.paper,
};

/* ============================== ORDER MODAL ============================== */
function OrderModal({
  initial,
  prefillCustomer,
  products,
  customers,
  drivers = [],
  onClose,
  onSave,
}) {
  const isEdit = !!initial;
  const [customerId, setCustomerId] = useState(
    initial?.customerId || prefillCustomer?.id || "",
  );
  const [customerName, setCustomerName] = useState(
    initial?.customerName || prefillCustomer?.name || "",
  );
  const [phone, setPhone] = useState(
    initial?.phone || prefillCustomer?.phone || "",
  );
  const [address, setAddress] = useState(
    initial?.address || prefillCustomer?.address || "",
  );
  const [items, setItems] = useState(
    initial?.items?.length
      ? initial.items
      : [
          {
            id: uid("it"),
            productId: products[0]?.id,
            productName: products[0]?.name,
            category: products[0]?.category,
            qty: 1,
            unit: products[0]?.unit,
            price: products[0]?.price,
          },
        ],
  );
  const [orderDate, setOrderDate] = useState(initial?.orderDate || todayStr());
  const [deliveryDate, setDeliveryDate] = useState(
    initial?.deliveryDate || todayStr(),
  );
  const [paymentStatus, setPaymentStatus] = useState(
    initial?.paymentStatus || "Pending",
  );
  const [amountPaid, setAmountPaid] = useState(initial?.amountPaid || 0);
  const [orderStatus, setOrderStatus] = useState(
    initial?.orderStatus || "Pending",
  );
  const [deliveryBoyId, setDeliveryBoyId] = useState(
    initial?.deliveryBoyId || "",
  );
  const [notes, setNotes] = useState(initial?.notes || "");
  const [bottlesReturned, setBottlesReturned] = useState(
    initial?.bottlesReturned || 0,
  );
  const [latitude, setLatitude] = useState(initial?.latitude || 0);
  const [longitude, setLongitude] = useState(initial?.longitude || 0);
  const [locLoading, setLocLoading] = useState(false);
  const [showCustList, setShowCustList] = useState(false);

  const total = orderTotal(items);

  function handleGetLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setLocLoading(false);
      },
      (error) => {
        alert("Could not get location: " + error.message);
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function updateItem(idx, patch) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        if (patch.productId) {
          const p = products.find((p) => p.id === patch.productId);
          next.productName = p.name;
          next.unit = p.unit;
          next.price = p.price;
          next.category = p.category;
        }
        return next;
      }),
    );
  }
  function addItem() {
    const p =
      products.find((p) => !items.some((it) => it.productId === p.id)) ||
      products[0];
    setItems((prev) => [
      ...prev,
      {
        id: uid("it"),
        productId: p.id,
        productName: p.name,
        category: p.category,
        qty: 1,
        unit: p.unit,
        price: p.price,
      },
    ]);
  }
  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function selectCustomer(c) {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setPhone(c.phone || "");
    setAddress(c.address || "");
    setShowCustList(false);
  }

  function handleSave() {
    if (!customerName.trim()) {
      alert("Please enter a customer name.");
      return;
    }
    if (items.length === 0) {
      alert("Add at least one product.");
      return;
    }
    // Clamp partial payment between 0 and total to prevent invalid amounts
    const safeAmountPaid =
      paymentStatus === "Paid"
        ? total
        : Math.min(Math.max(Number(amountPaid) || 0, 0), total);
    onSave({
      id: initial?.id || uid("o"),
      customerId: customerId || uid("c"),
      customerName: customerName.trim(),
      phone,
      address,
      items,
      orderDate,
      deliveryDate,
      paymentStatus,
      amountPaid: safeAmountPaid,
      orderStatus,
      deliveryBoyId,
      deliveryBoyName:
        drivers.find((driver) => driver.id === deliveryBoyId)?.name || "",
      notes,
      total,
      bottlesReturned: Number(bottlesReturned) || 0,
      deliveredBy: initial?.deliveredBy,
      customAmount:
        initial?.customAmount !== undefined && initial?.customAmount !== null
          ? safeAmountPaid
          : undefined,
      latitude,
      longitude,
      createdAt: initial?.createdAt || new Date().toISOString(),
      recurringId: initial?.recurringId,
    });
  }

  function handlePrint() {
    const draft = {
      id: initial?.id || uid("o"),
      customerId: customerId || uid("c"),

      // Preserve the data entered on the order itself.
      customerName: String(customerName || "").trim(),
      phone: String(phone || "").trim(),
      address: String(address || "").trim(),

      items: Array.isArray(items) ? items : [],

      orderDate: orderDate || todayStr(),
      deliveryDate: deliveryDate || "",

      paymentStatus: paymentStatus || "Pending",

      amountPaid:
        paymentStatus === "Paid"
          ? Number(total) || 0
          : Math.max(0, Number(amountPaid) || 0),

      orderStatus: orderStatus || "Pending",
      notes: String(notes || "").trim(),

      total: Number(total) || 0,

      createdAt: initial?.createdAt || new Date().toISOString(),
    };

    generateBill(draft);
  }

  return (
    <ModalShell
      title={isEdit ? "Edit Order" : "Add Order"}
      onClose={onClose}
      footer={
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 10,
              fontSize: 14,
            }}
          >
            <span style={{ fontWeight: 700 }}>Total</span>
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontWeight: 700,
                fontSize: 18,
                color: C.primary,
              }}
            >
              {fmtINR(total)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="tap"
              onClick={handlePrint}
              style={{
                flex: 0.42,
                background: C.cream,
                color: C.ink,
                border: "none",
                borderRadius: 12,
                padding: "11px",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Print Bill
            </button>
            <button
              className="tap"
              onClick={handleSave}
              style={{
                flex: 0.58,
                background: C.primary,
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "11px",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {isEdit ? "Save Changes" : "Create Order"}
            </button>
          </div>
        </div>
      }
    >
      <Field label="Customer Name">
        <input
          style={inputStyle}
          value={customerName}
          onChange={(e) => {
            setCustomerName(e.target.value);
            setCustomerId("");
            setShowCustList(true);
          }}
          placeholder="e.g. Ravi Kumar"
        />
        {showCustList && customerName && (
          <div
            style={{
              background: C.paper,
              border: `1px solid ${C.paperLine}`,
              borderRadius: 10,
              marginTop: 4,
              maxHeight: 140,
              overflowY: "auto",
            }}
          >
            {customers
              .filter((c) =>
                c.name.toLowerCase().includes(customerName.toLowerCase()),
              )
              .slice(0, 5)
              .map((c) => (
                <div
                  key={c.id}
                  className="tap"
                  onClick={() => selectCustomer(c)}
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    borderBottom: `1px solid ${C.paperLine}`,
                  }}
                >
                  {c.name} <span style={{ color: C.inkMute }}>{c.phone}</span>
                </div>
              ))}
          </div>
        )}
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Phone Number">
            <input
              style={inputStyle}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit number"
            />
          </Field>
        </div>
      </div>
      <Field label="Delivery Address">
        <input
          style={inputStyle}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="House / street / area"
        />
      </Field>

      {/* <Field label="📍 Delivery Location (GPS)"> */}
      <Field label=" Delivery Location">
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            className="tap"
            onClick={handleGetLocation}
            disabled={locLoading}
            style={{
              background: latitude && longitude ? C.greenSoft : C.cream,
              color: latitude && longitude ? C.green : C.primary,
              border: `1px solid ${latitude && longitude ? C.green : C.primary}`,
              borderRadius: 10,
              padding: "9px 14px",
              fontSize: 12.5,
              fontWeight: 700,
              opacity: locLoading ? 0.6 : 1,
              cursor: locLoading ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <MapPin size={14} />
            {locLoading
              ? "Getting..."
              : latitude && longitude
                ? "Captured"
                : "Get Location"}
          </button>
          {latitude && longitude && (
            <span style={{ fontSize: 11.5, color: C.primary }}>
              {latitude.toFixed(5)}, {longitude.toFixed(5)}
            </span>
          )}
        </div>
        <div style={{ marginTop: 10 }}>
          <LocationPicker
            latitude={latitude}
            longitude={longitude}
            onChange={({ latitude: lat, longitude: lng }) => {
              setLatitude(lat);
              setLongitude(lng);
            }}
          />
        </div>
      </Field>

      <Field label="Products">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it, idx) => (
            <div
              key={it.id}
              style={{
                background: C.paper,
                border: `1px solid ${C.paperLine}`,
                borderRadius: 12,
                padding: 10,
              }}
            >
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <select
                  style={{ ...inputStyle, flex: 1.3 }}
                  value={it.productId}
                  onChange={(e) =>
                    updateItem(idx, { productId: e.target.value })
                  }
                >
                  {products
                    .filter((p) => p.active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {iconFor(p.category)} {p.name}
                      </option>
                    ))}
                </select>
                <button
                  className="tap"
                  onClick={() => removeItem(idx)}
                  style={{
                    border: "none",
                    background: C.brickSoft,
                    color: C.brick,
                    borderRadius: 10,
                    width: 38,
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  style={{ ...inputStyle, flex: 1 }}
                  value={it.qty}
                  onChange={(e) =>
                    updateItem(idx, { qty: Number(e.target.value) })
                  }
                  placeholder="Qty"
                />
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12.5,
                    color: C.inkMute,
                  }}
                >
                  {it.unit}
                </div>
                <input
                  type="number"
                  min="0"
                  style={{ ...inputStyle, flex: 1 }}
                  value={it.price}
                  onChange={(e) =>
                    updateItem(idx, { price: Number(e.target.value) })
                  }
                  placeholder="Price/unit"
                />
              </div>
              <div
                style={{
                  textAlign: "right",
                  marginTop: 6,
                  fontSize: 12.5,
                  color: C.inkMute,
                }}
              >
                ={" "}
                <b style={{ color: C.ink }}>
                  {fmtINR((it.qty || 0) * (it.price || 0))}
                </b>
              </div>
            </div>
          ))}
        </div>
        <button
          className="tap"
          onClick={addItem}
          style={{
            marginTop: 8,
            border: `1px dashed ${C.primary}`,
            background: "transparent",
            color: C.primary,
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12.5,
            fontWeight: 700,
            width: "100%",
          }}
        >
          + Add another product
        </button>
      </Field>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Order Date">
            <input
              type="date"
              style={inputStyle}
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Delivery Date">
            <input
              type="date"
              style={inputStyle}
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <Field label="Assigned delivery driver">
        <select
          style={inputStyle}
          value={deliveryBoyId}
          onChange={(event) => setDeliveryBoyId(event.target.value)}
        >
          <option value="">Unassigned</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </select>
      </Field>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Order Status">
            <select
              style={inputStyle}
              value={orderStatus}
              onChange={(e) => setOrderStatus(e.target.value)}
            >
              <option>Pending</option>
              <option>Out for Delivery</option>
              <option>Delivered</option>
              <option>Cancelled</option>
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Payment Status">
            <select
              style={inputStyle}
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
            >
              <option>Pending</option>
              <option>Partial</option>
              <option>Paid</option>
            </select>
          </Field>
        </div>
      </div>
      {paymentStatus === "Partial" && (
        <Field label="Amount Paid So Far">
          <input
            type="number"
            style={inputStyle}
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
          />
        </Field>
      )}
      <Field label="Bottles Returned (Empty)">
        <input
          type="number"
          style={inputStyle}
          value={bottlesReturned}
          onChange={(e) => setBottlesReturned(e.target.value)}
          placeholder="Count of glass bottles collected"
        />
      </Field>
      <Field label="Notes">
        <textarea
          style={{ ...inputStyle, minHeight: 60 }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
        />
      </Field>
    </ModalShell>
  );
}
/* ============================== CUSTOMER MODAL ============================== */
function CustomerModal({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [latitude, setLatitude] = useState(initial?.latitude || 0);
  const [longitude, setLongitude] = useState(initial?.longitude || 0);
  const [locLoading, setLocLoading] = useState(false);

  async function handleGetLocation() {
    setLocLoading(true);
    try {
      const permission = await Geolocation.requestPermissions();
      if (permission.location === "denied")
        throw new Error("Location permission was denied.");
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      setLatitude(position.coords.latitude);
      setLongitude(position.coords.longitude);
    } catch (error) {
      alert(`Could not get customer location: ${error.message}`);
    } finally {
      setLocLoading(false);
    }
  }
  return (
    <ModalShell
      title={initial ? "Edit Customer" : "Add Customer"}
      onClose={onClose}
      footer={
        <button
          className="tap"
          onClick={() => {
            if (!name.trim()) {
              alert("Enter a name");
              return;
            }
            onSave({
              id: initial?.id || uid("c"),
              name: name.trim(),
              phone,
              address,
              latitude,
              longitude,
              createdAt: initial?.createdAt || new Date().toISOString(),
            });
          }}
          style={{
            width: "100%",
            background: C.primary,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "13px",
            fontWeight: 700,
            fontSize: 14.5,
          }}
        >
          Save Customer
        </button>
      }
    >
      <Field label="Name">
        <input
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Phone">
        <input
          style={inputStyle}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </Field>
      <Field label="Address">
        <input
          style={inputStyle}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </Field>
      <Field label="Customer Location">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
              className="tap"
              onClick={handleGetLocation}
              disabled={locLoading}
              style={{
                background: hasCoordinates({ latitude, longitude })
                  ? C.greenSoft
                  : C.cream,
                color: hasCoordinates({ latitude, longitude })
                  ? C.green
                  : C.primary,
                border: `1px solid ${hasCoordinates({ latitude, longitude }) ? C.green : C.primary}`,
                borderRadius: 10,
                padding: "9px 12px",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 5,
                opacity: locLoading ? 0.6 : 1,
              }}
            >
              <MapPin size={14} />{" "}
              {locLoading
                ? "Getting..."
                : hasCoordinates({ latitude, longitude })
                  ? "Update GPS"
                  : "Get GPS"}
          </button>
          {hasCoordinates({ latitude, longitude }) && (
            <span style={{ fontSize: 11.5, color: C.inkMute }}>
              {Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}
            </span>
          )}
        </div>
        <div style={{ marginTop: 10 }}>
          <LocationPicker
            latitude={latitude}
            longitude={longitude}
            onChange={({ latitude: lat, longitude: lng }) => {
              setLatitude(lat);
              setLongitude(lng);
            }}
          />
        </div>
      </Field>
    </ModalShell>
  );
}

/* ============================== RECURRING MODAL ============================== */
function RecurringModal({ initial, products, customers, onClose, onSave }) {
  const [customerName, setCustomerName] = useState(initial?.customerName || "");
  const [customerId, setCustomerId] = useState(initial?.customerId || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [items, setItems] = useState(
    initial?.items?.length
      ? initial.items
      : [
          {
            id: uid("it"),
            productId: products[0]?.id,
            productName: products[0]?.name,
            category: products[0]?.category,
            qty: 1,
            unit: products[0]?.unit,
            price: products[0]?.price,
          },
        ],
  );
  const [frequency, setFrequency] = useState(initial?.frequency || "daily");
  const [daysOfWeek, setDaysOfWeek] = useState(
    initial?.daysOfWeek || [1, 2, 3, 4, 5, 6, 0],
  );
  const [active, setActive] = useState(initial?.active ?? true);
  const [showCustList, setShowCustList] = useState(false);

  function updateItem(idx, patch) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        if (patch.productId) {
          const p = products.find((p) => p.id === patch.productId);
          next.productName = p.name;
          next.unit = p.unit;
          next.price = p.price;
          next.category = p.category;
        }
        return next;
      }),
    );
  }
  function addItem() {
    const p =
      products.find((p) => !items.some((it) => it.productId === p.id)) ||
      products[0];
    setItems((prev) => [
      ...prev,
      {
        id: uid("it"),
        productId: p.id,
        productName: p.name,
        category: p.category,
        qty: 1,
        unit: p.unit,
        price: p.price,
      },
    ]);
  }
  function toggleDay(d) {
    setDaysOfWeek((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  }

  function selectCustomer(c) {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setPhone(c.phone || "");
    setAddress(c.address || "");
    setShowCustList(false);
  }

  function handleSave() {
    if (!customerName.trim()) {
      alert("Enter a customer name");
      return;
    }
    onSave({
      id: initial?.id || uid("r"),
      customerId: customerId || uid("c"),
      customerName: customerName.trim(),
      phone,
      address,
      items,
      frequency,
      daysOfWeek: (frequency === "daily" || frequency === "alternate") ? [0, 1, 2, 3, 4, 5, 6] : daysOfWeek,
      active,
    });
  }

  return (
    <ModalShell
      title={initial ? "Edit Recurring Order" : "New Recurring Order"}
      onClose={onClose}
      footer={
        <button
          className="tap"
          onClick={handleSave}
          style={{
            width: "100%",
            background: C.primary,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "13px",
            fontWeight: 700,
            fontSize: 14.5,
          }}
        >
          Save Recurring Order
        </button>
      }
    >
      <Field label="Customer Name">
        <input
          style={inputStyle}
          value={customerName}
          onChange={(e) => {
            setCustomerName(e.target.value);
            setCustomerId("");
            setShowCustList(true);
          }}
        />
        {showCustList && customerName && (
          <div
            style={{
              background: C.paper,
              border: `1px solid ${C.paperLine}`,
              borderRadius: 10,
              marginTop: 4,
              maxHeight: 140,
              overflowY: "auto",
            }}
          >
            {customers
              .filter((c) =>
                c.name.toLowerCase().includes(customerName.toLowerCase()),
              )
              .slice(0, 5)
              .map((c) => (
                <div
                  key={c.id}
                  className="tap"
                  onClick={() => selectCustomer(c)}
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    borderBottom: `1px solid ${C.paperLine}`,
                  }}
                >
                  {c.name} <span style={{ color: C.inkMute }}>{c.phone}</span>
                </div>
              ))}
          </div>
        )}
      </Field>
      <Field label="Phone">
        <input
          style={inputStyle}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </Field>
      <Field label="Address">
        <input
          style={inputStyle}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </Field>

      <Field label="Standing Order">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it, idx) => (
            <div key={it.id} style={{ display: "flex", gap: 8 }}>
              <select
                style={{ ...inputStyle, flex: 1.2 }}
                value={it.productId}
                onChange={(e) => updateItem(idx, { productId: e.target.value })}
              >
                {products
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {iconFor(p.category)} {p.name}
                    </option>
                  ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.1"
                style={{ ...inputStyle, flex: 0.7 }}
                value={it.qty}
                onChange={(e) =>
                  updateItem(idx, { qty: Number(e.target.value) })
                }
              />
              <div
                style={{
                  flex: 0.6,
                  display: "flex",
                  alignItems: "center",
                  fontSize: 12,
                  color: C.inkMute,
                }}
              >
                {it.unit}
              </div>
            </div>
          ))}
        </div>
        <button
          className="tap"
          onClick={addItem}
          style={{
            marginTop: 8,
            border: `1px dashed ${C.primary}`,
            background: "transparent",
            color: C.primary,
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12.5,
            fontWeight: 700,
            width: "100%",
          }}
        >
          + Add product
        </button>
      </Field>

      <Field label="Frequency">
        <div style={{ display: "flex", gap: 6 }}>
          {["daily", "alternate", "weekly"].map((f) => (
            <Chip
              key={f}
              active={frequency === f}
              onClick={() => setFrequency(f)}
              label={f === "daily" ? "Every day" : f === "alternate" ? "Alternate days" : "Specific days"}
            />
          ))}
        </div>
      </Field>
      {frequency === "weekly" && (
        <Field label="Days of the Week">
          <div style={{ display: "flex", gap: 5 }}>
            {weekdayShort.map((w, i) => (
              <button
                key={i}
                className="tap"
                onClick={() => toggleDay(i)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: `1px solid ${daysOfWeek.includes(i) ? C.primary : C.paperLine}`,
                  background: daysOfWeek.includes(i) ? C.primary : C.paper,
                  color: daysOfWeek.includes(i) ? "#fff" : C.ink,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {w[0]}
              </button>
            ))}
          </div>
        </Field>
      )}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
          marginTop: 4,
        }}
      >
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />{" "}
        Active — auto-create today's order
      </label>
    </ModalShell>
  );
}

/* ============================== UNIFIED DELIVERY MODAL ============================== */
function ReturnBottleModal({ order, userSession, data, onClose, onConfirm }) {
  const [deliveredBy, setDeliveredBy] = useState(
    order.deliveredBy || order.deliveryBoyName || userSession?.name || "",
  );
  const [customAmount, setCustomAmount] = useState(
    order.customAmount !== undefined && order.customAmount !== null
      ? String(order.customAmount)
      : String(order.total || 0),
  );
  const [count, setCount] = useState(order.bottlesReturned || 0);

  // Calculate how many bottles they ARE receiving today
  const bottlesSent = (order.items || [])
    .filter(
      (it) =>
        (it.category || "").toLowerCase() === "milk" ||
        (it.productName || "").toLowerCase().includes("milk"),
    )
    .reduce((s, it) => s + (Number(it.qty) || 0), 0);

  // Customer's prior balance (across all other orders)
  const priorBalance = useMemo(() => {
    if (!order.customerId || !data?.orders) return 0;
    const otherOrders = data.orders.filter(
      (o) =>
        String(o.customerId) === String(order.customerId) &&
        String(o.id) !== String(order.id) &&
        o.orderStatus !== "Cancelled",
    );
    const totalPaid = otherOrders.reduce((sum, o) => {
      const paid =
        o.customAmount !== undefined && o.customAmount !== null
          ? Number(o.customAmount)
          : o.paymentStatus === "Paid"
            ? Number(o.total)
            : Number(o.amountPaid) || 0;
      return sum + (Number(paid) || 0);
    }, 0);
    const totalPurchased = otherOrders.reduce(
      (sum, o) => sum + (Number(o.total) || 0),
      0,
    );
    return totalPaid - totalPurchased;
  }, [order.customerId, order.id, data?.orders]);

  const parsedAmount = Math.round(Number(customAmount) || 0);
  const orderTotalVal = Number(order.total) || 0;
  const orderImpact = parsedAmount - orderTotalVal;
  const resultingBalance = priorBalance + orderImpact;

  const handleConfirm = () => {
    const finalDeliveredBy = String(deliveredBy || "").trim();
    const parsedAmount = Number(customAmount);
    const finalAmount = Number.isFinite(parsedAmount)
      ? Math.max(0, Math.round(parsedAmount))
      : 0;
    const parsedBottleCount = Number(count);
    onConfirm({
      orderId: order.id,
      deliveredBy: finalDeliveredBy,
      customAmount: finalAmount,
      bottlesReturned: Number.isFinite(parsedBottleCount)
        ? Math.max(0, Math.floor(parsedBottleCount))
        : 0,
    });
  };

  return (
    <ModalShell
      title="Confirm Delivery"
      onClose={onClose}
      footer={
        <button
          className="tap"
          onClick={handleConfirm}
          style={{
            width: "100%",
            background: C.green,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "13px",
            fontWeight: 700,
            fontSize: 14.5,
          }}
        >
          Confirm & Mark Delivered
        </button>
      }
    >
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 36 }}>🚚</div>
        <div style={{ fontWeight: 700, fontSize: 16.5, marginTop: 6, color: C.ink }}>
          {order.customerName}
        </div>
        <div style={{ fontSize: 13, color: C.inkMute, marginTop: 2 }}>
          Order Total: <b>{fmtINR(order.total)}</b>
          {bottlesSent > 0 && ` • Delivering ${bottlesSent} bottle${bottlesSent > 1 ? "s" : ""}`}
        </div>
      </div>

      {/* 1. DELIVERED BY */}
      <Field label="Delivered By (Staff Name)">
        <input
          type="text"
          placeholder="Enter staff / delivery person name"
          value={deliveredBy}
          onChange={(e) => setDeliveredBy(e.target.value)}
          style={inputStyle}
        />
      </Field>

      {/* 2. CUSTOM AMOUNT */}
      <Field label="Custom Amount / Amount Collected (₹)">
        <input
          type="number"
          step="1"
          placeholder="0"
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          style={{
            ...inputStyle,
            fontSize: 20,
            fontWeight: "700",
            fontFamily: "'JetBrains Mono',monospace",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className="tap"
            onClick={() => setCustomAmount(String(orderTotalVal))}
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${C.paperLine}`,
              background: Number(customAmount) === orderTotalVal ? C.primarySoft : C.paper,
              color: Number(customAmount) === orderTotalVal ? C.primaryDark : C.ink,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Exact ({fmtINR(orderTotalVal)})
          </button>
          <button
            type="button"
            className="tap"
            onClick={() => setCustomAmount("0")}
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${C.paperLine}`,
              background: Number(customAmount) === 0 ? C.brickSoft : C.paper,
              color: Number(customAmount) === 0 ? C.brick : C.ink,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ₹0 (Unpaid)
          </button>
        </div>

        {/* LIVE RESULTING BALANCE PREVIEW */}
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 10,
            background: resultingBalance > 0 ? C.greenSoft : C.cream,
            border: `1px solid ${resultingBalance > 0 ? C.green : C.paperLine}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 600 }}>
              Resulting Customer Balance
            </div>
            <div style={{ fontSize: 10, color: C.inkMute, marginTop: 1 }}>
              Prev: {fmtBalance(priorBalance)} • Impact: {orderImpact >= 0 ? `+₹${orderImpact}` : `-₹${Math.abs(orderImpact)}`}
            </div>
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              fontFamily: "'JetBrains Mono',monospace",
              color: resultingBalance > 0 ? C.green : resultingBalance < 0 ? C.brick : C.ink,
            }}
          >
            {fmtBalance(resultingBalance)}
          </div>
        </div>
      </Field>

      {/* 3. EMPTY BOTTLES RETURNED */}
      {bottlesSent > 0 && (
        <Field label="Empty Bottles Returned">
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="number"
              style={{
                ...inputStyle,
                textAlign: "center",
                fontSize: 20,
                fontWeight: "700",
              }}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 8,
              marginTop: 10,
            }}
          >
            {[0, 1, 2, 3, 4, 5].map((num) => (
              <button
                key={num}
                type="button"
                className="tap"
                onClick={() => setCount(num)}
                style={{
                  padding: "7px 11px",
                  borderRadius: 8,
                  border: `1px solid ${C.paperLine}`,
                  background: Number(count) === num ? C.primary : C.paper,
                  color: Number(count) === num ? "#fff" : C.ink,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {num}
              </button>
            ))}
          </div>
        </Field>
      )}

      <div
        style={{
          background: C.greenSoft,
          padding: 10,
          borderRadius: 10,
          fontSize: 11.5,
          color: C.green,
          marginTop: 12,
        }}
      >
        <b>Note:</b> Confirming will save delivery staff name, amount collected, bottle returns, and send WhatsApp delivery confirmation.
      </div>
    </ModalShell>
  );
}
