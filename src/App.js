  import React, { useState, useEffect, useMemo, useCallback } from "react";
  import {
      Plus, Package, Users, BarChart3, MoreHorizontal, Clock,
    CheckCircle2, Edit2, Trash2, Search, Phone, MapPin, Calendar, X,
      ChevronLeft, ChevronRight, Repeat, Download, ArrowLeft, Wallet, ClipboardList
  } from "lucide-react";
  import {
      LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
      CartesianGrid, Tooltip, ResponsiveContainer
  } from "recharts";
  import { Preferences } from '@capacitor/preferences';
  import { Directory, Filesystem } from '@capacitor/filesystem';
  import { Share } from '@capacitor/share';

  /* ============================== DESIGN TOKENS ============================== */
  const C = {
    bg: "#FBF7F0",
    paper: "#FFFFFF",
    paperLine: "#EAE1D0",
    ink: "#2A2320",
    inkMute: "#8A7F70",
    primary: "#1E4B42",
    primaryDark: "#123530",
    primarySoft: "#E4EEE9",
    gold: "#C08A28",
    goldSoft: "#F7ECD6",
    brick: "#B54A3B",
    brickSoft: "#F6E3DE",
    green: "#3E7A56",
    greenSoft: "#E3EFE6",
    cream: "#F1E9D8",
  };

  const FONTS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
  `;

  const BUSINESS_NAME = "A2D'Elites";
  const BUSINESS_TAGLINE = "Since 2025";
  const LOGO_ICON = "/logo.png";
  /* ============================== HELPERS ============================== */
  const uid = (p = "id") => p + "_" + Math.random().toString(36).slice(2, 10);
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const fmtINR = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };
  const fmtDateShort = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };
  const weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const addDays = (iso, n) => {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const monthKey = (iso) => iso.slice(0, 7);
  const CATEGORY_ICON = { Milk: "🥛", Paneer: "🧀", Curd: "🥣" };
  const iconFor = (category) => CATEGORY_ICON[category] || "🏷️";

  // Helper hook for persistent state on Android devices
 export const useCapacitorStorage = (key, initialValue) => {
  const [state, setState] = useState(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadStoredValue = async () => {
      try {
        const { value } = await Preferences.get({ key });
        if (value !== null && isMounted) {
          setState(JSON.parse(value));
        }
      } catch (e) {
        console.error(`Error reading key "${key}":`, e);
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    };

    loadStoredValue();

    return () => {
      isMounted = false;
    };
  }, [key]);

  const setPersistentState = useCallback((newValue) => {
    setState((prevState) => {
      const updated = typeof newValue === "function" ? newValue(prevState) : newValue;
      Preferences.set({ key, value: JSON.stringify(updated) }).catch((e) => {
        console.error(`Error saving key "${key}":`, e);
      });
      return updated;
    });
  }, [key]);

  return [state, setPersistentState, isLoaded];
};

  const DEFAULT_PRODUCTS = [
    { id: "p_milk_500ml", name: "Milk Bottle (500 ml)", category: "Milk", unit: "Bottle", price: 35, active: true },
    { id: "p_curd_500g", name: "Curd (500 g)", category: "Curd", unit: "Pack", price: 50, active: true },
    { id: "p_curd_1kg", name: "Curd (1 kg)", category: "Curd", unit: "Pack", price: 100, active: true },
    { id: "p_paneer_200g", name: "Paneer (200 g)", category: "Paneer", unit: "Pack", price: 110, active: true },
    { id: "p_paneer_500g", name: "Paneer (500 g)", category: "Paneer", unit: "Pack", price: 250, active: true },
  ];

  const EMPTY_DATA = { products: DEFAULT_PRODUCTS, customers: [], orders: [], recurring: [] };

 function orderTotal(items) {
    const total = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
    return Math.round((total + Number.EPSILON) * 100) / 100;
  }
  
  function amountDue(order) {
    const paid = order.paymentStatus === "Paid" ? order.total : (Number(order.amountPaid) || 0);
    const diff = order.total - paid;
    return Math.max(0, Math.round((diff + Number.EPSILON) * 100) / 100);
  }
  function openDeliveryWhatsApp(order) {
    const digits = String(order.phone || "").replace(/\D/g, "");
    if (!digits) return;

    const phone = digits.length === 10 ? `91${digits}` : digits.replace(/^0+/, "");
    const items = order.items.map((item) => `${item.qty} x ${item.productName}`).join(", ");
    const message = `Hi ${order.customerName || "there"}, your order has been delivered.\n\nItems: ${items}\nTotal: ${fmtINR(order.total)}\n\nThank you for choosing ${BUSINESS_NAME}!`;
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
  }

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
    const matches =
      recurring.frequency === "daily" ||
      (
        recurring.frequency === "weekly" &&
        (recurring.daysOfWeek || []).includes(dayOfWeek)
      );

    if (!matches) return recurring;

    modified = true;

    // Create fresh item IDs and calculate item totals
    const items = recurring.items.map((item) => ({
      ...item,
      id: uid("it"),
      total:
        Math.round(
          ((item.qty * item.price) + Number.EPSILON) * 100
        ) / 100,
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
      latitude: 0,      // <-- added here
      longitude: 0,     // <-- added here
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

  function csvDownload(filename, rows) {
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ============================== PDF / BILL GENERATION ============================== */
  async function ensureHtml2Pdf() {
    if (window.html2pdf) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.3/html2pdf.bundle.min.js";
      s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }

  async function generateBill(order) {
    try {
      await ensureHtml2Pdf();
    } catch (e) {
      openPrintable(order);
      return;
    }

    const el = document.createElement("div");
    el.style.width = "380px";
    el.style.padding = "0";
    el.style.fontFamily = "'DM Sans', sans-serif";
    el.style.background = C.bg;
    el.style.color = C.ink;
    el.innerHTML = `
      <div style="background:${C.primary}; color:#fff; padding:20px 18px 16px; border-radius:14px 14px 0 0;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div>
            <div style="font-family:'Fraunces',serif; font-size:22px; font-weight:700;">${BUSINESS_NAME}</div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:1.5px; opacity:.75; text-transform:uppercase;">${BUSINESS_TAGLINE}</div>
          </div>
          <div style="background:${C.gold}; color:#fff; padding:7px 10px; border-radius:9px; font-size:11px; font-weight:700; letter-spacing:1px;">BILL</div>
        </div>
      </div>
      <div style="background:${C.paper}; padding:14px 18px 18px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px;">
          <div><div style="font-size:10px; color:${C.inkMute}; text-transform:uppercase; letter-spacing:1px;">Customer</div><div style="font-size:15px; font-weight:700; margin-top:3px;">${order.customerName || "—"}</div></div>
          <div style="text-align:right;"><div style="font-size:10px; color:${C.inkMute}; text-transform:uppercase; letter-spacing:1px;">Date</div><div style="font-size:12px; font-weight:600; margin-top:3px;">${fmtDate(order.orderDate || todayStr())}</div></div>
        </div>
        <div style="background:${C.primarySoft}; color:${C.primaryDark}; padding:7px 9px; border-radius:7px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Order Summary</div>
        ${order.items.map(it => `
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; padding:10px 2px; border-bottom:1px solid ${C.paperLine};">
            <div style="max-width:65%;"><span style="color:${C.gold}; font-weight:700;">${it.qty} ×</span> ${it.productName}<div style="font-size:10px; color:${C.inkMute}; margin-top:2px;">${it.unit || "Unit"}</div></div>
            <div style="text-align:right; font-weight:700; color:${C.primaryDark};">${fmtINR((it.qty||0)*(it.price||0))}</div>
          </div>
        `).join("")}
        <div style="display:flex; justify-content:space-between; align-items:center; background:${C.goldSoft}; color:${C.primaryDark}; padding:12px 10px; margin-top:14px; border-radius:9px; font-weight:700; font-size:15px;"><div>Total</div><div>${fmtINR(order.total|| order.items.reduce((s,it)=>s+(Number(it.qty)||0)*(Number(it.price)||0),0))}</div></div>
        <div style="display:flex; gap:6px; margin-top:12px; font-size:10px; font-weight:700;"><span style="background:${C.greenSoft}; color:${C.green}; padding:5px 8px; border-radius:12px;">${order.orderStatus || 'Pending'}</span><span style="background:${C.brickSoft}; color:${C.brick}; padding:5px 8px; border-radius:12px;">${order.paymentStatus || 'Pending'}</span></div>
        <div style="text-align:center; font-size:10px; color:${C.inkMute}; margin-top:16px;">Thank you for your purchase!</div>
      </div>
    `;

    document.body.appendChild(el);
    try {
      const filename = `bill-${order.id || 'invoice'}.pdf`;
      const opt = { margin: 8, filename, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a5', orientation: 'portrait' } };
      const pdfDataUri = await window.html2pdf().set(opt).from(el).outputPdf('datauristring');
      const base64 = pdfDataUri.split(',')[1];
      const file = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
        recursive: true,
      });
      document.body.removeChild(el);
      await Share.share({
        title: 'Dairy bill',
        text: `Bill for ${order.customerName || 'customer'}`,
        url: file.uri,
        dialogTitle: 'Share or print bill',
      });
    } catch (e) {
      if (el.parentNode) document.body.removeChild(el);
      openPrintable(order);
    }
  }

  function openPrintable(order) {
    const billMarkup = `
      <div style="font-family: 'DM Sans', sans-serif; padding:18px; color:${C.ink}">
        <h2 style="margin:0">${BUSINESS_NAME}</h2>
        <div style="color:${C.inkMute}">${BUSINESS_TAGLINE}</div>
        <hr />
        <div>Customer: <b>${order.customerName || ''}</b></div>
        ${order.items.map((it) => `<div style="display:flex; justify-content:space-between; margin-top:8px"><div>${it.qty} × ${it.productName}</div><div>${fmtINR((it.qty || 0) * (it.price || 0))}</div></div>`).join('')}
        <hr />
        <div style="font-weight:700; display:flex; justify-content:space-between"><div>Total</div><div>${fmtINR(order.total || 0)}</div></div>
      </div>`;

    const w = window.open('', '_blank');
    if (w) {
      w.document.write(`<html><head><title>Bill</title></head><body>${billMarkup}</body></html>`);
      w.document.close();
      w.onload = () => { w.focus(); w.print(); };
      return;
    }

    // Android WebView may block window.open, so print through a hidden iframe.
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);
    const frameDocument = frame.contentDocument || frame.contentWindow.document;
    frameDocument.open();
    frameDocument.write(`<html><head><title>Bill</title></head><body>${billMarkup}</body></html>`);
    frameDocument.close();
    frame.onload = () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 1000);
    };
  }

  /* ============================== ROOT APP ============================== */
  export default function App() {
    const [data, setData, isLoaded] = useCapacitorStorage("business-data", EMPTY_DATA);
    const [tab, setTab] = useState("dashboard");
    const [selectedDate, setSelectedDate] = useState(todayStr());
    const [orderModal, setOrderModal] = useState(null); // { order?, prefillCustomer? } or null
    const [custModal, setCustModal] = useState(null);
    const [recurModal, setRecurModal] = useState(null);
    const [returnModalOrder, setReturnModalOrder] = useState(null); // { order, bottlesReturned }
    const [activeCustomer, setActiveCustomer] = useState(null);
    const [moreView, setMoreView] = useState("menu"); // menu | products | recurring | notifications

    useEffect(() => {
      if (isLoaded) setData((currentData) => generateRecurringForToday(currentData));
    }, [isLoaded, setData]);

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
        if (idx >= 0) d.orders[idx] = full; else d.orders.push(full);
        // ensure customer exists
        if (order.customerId && !d.customers.find((c) => c.id === order.customerId)) {
          d.customers.push({ id: order.customerId, name: order.customerName, phone: order.phone, address: order.address, createdAt: new Date().toISOString() });
        } else if (order.customerId) {
          const c = d.customers.find((c) => c.id === order.customerId);
          if (c) { c.phone = order.phone || c.phone; c.address = order.address || c.address; }
        }
        return d;
      });
    }
    function deleteOrder(id) { update((d) => { d.orders = d.orders.filter((o) => o.id !== id); return d; }); }
    function markDelivered(id) {
      const order = data.orders.find((item) => item.id === id);
      if (!order) return;
      setReturnModalOrder(order);
    }
    function markPaid(id) { update((d) => { const o = d.orders.find((o) => o.id === id); if (o) { o.paymentStatus = "Paid"; o.amountPaid = o.total; } return d; }); }

    /* ---------- customer CRUD ---------- */
    function upsertCustomer(c) {
      update((d) => {
        const idx = d.customers.findIndex((x) => x.id === c.id);
        if (idx >= 0) d.customers[idx] = c; else d.customers.push(c);
        return d;
      });
    }
    function deleteCustomer(id) { update((d) => { d.customers = d.customers.filter((c) => c.id !== id); return d; }); }

    /* ---------- recurring CRUD ---------- */
    function upsertRecurring(r) {
      update((d) => {
        const idx = d.recurring.findIndex((x) => x.id === r.id);
        if (idx >= 0) d.recurring[idx] = r; else d.recurring.push(r);
        return d;
      });
    }
    function deleteRecurring(id) { update((d) => { d.recurring = d.recurring.filter((r) => r.id !== id); return d; }); }

    /* ---------- product CRUD ---------- */
    function upsertProduct(p) {
      update((d) => {
        const idx = d.products.findIndex((x) => x.id === p.id);
        if (idx >= 0) d.products[idx] = p; else d.products.push(p);
        return d;
      });
    }

    const pendingDeliveries = data.orders.filter((o) => o.orderStatus === "Pending").length;
    const pendingPayments = data.orders.filter((o) => o.paymentStatus !== "Paid" && o.orderStatus !== "Cancelled").length;

    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans',sans-serif", color: C.ink, paddingBottom: 84 }}>
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
          <AppHeader />
          {tab === "dashboard" && (
            <Dashboard
              data={data} selectedDate={selectedDate} setSelectedDate={setSelectedDate}
              onAddOrder={() => setOrderModal({})}
              onQuickAction={{ markDelivered, markPaid, edit: (o) => setOrderModal({ order: o }), del: deleteOrder }}
              onOpenCustomer={(c) => { setActiveCustomer(c); setTab("customers"); }}
            />
          )}
          {tab === "orders" && (
            <OrdersTab
              data={data}
              onAdd={() => setOrderModal({})}
              onEdit={(o) => setOrderModal({ order: o })}
              onDelete={deleteOrder} onMarkDelivered={markDelivered} onMarkPaid={markPaid}
            />
          )}
          {tab === "customers" && (
            <CustomersTab
              data={data} activeCustomer={activeCustomer} setActiveCustomer={setActiveCustomer}
              onAddCustomer={() => setCustModal({})} onEditCustomer={(c) => setCustModal({ customer: c })}
              onNewOrderFor={(c) => setOrderModal({ prefillCustomer: c })}
              onEditOrder={(o) => setOrderModal({ order: o })}
              onDeleteCustomer={deleteCustomer}
            />
          )}
          {tab === "reports" && <ReportsTab data={data} />}
          {tab === "more" && (
            <MoreTab
              view={moreView} setView={setMoreView} data={data}
              onSaveProduct={upsertProduct}
              onAddRecurring={() => setRecurModal({})} onEditRecurring={(r) => setRecurModal({ recurring: r })}
              onDeleteRecurring={deleteRecurring}
              pendingDeliveries={pendingDeliveries} pendingPayments={pendingPayments}
            />
          )}
        </div>

        <BottomNav tab={tab} setTab={setTab} badge={pendingDeliveries} />

        {orderModal && (
          <OrderModal
            initial={orderModal.order} prefillCustomer={orderModal.prefillCustomer}
            products={data.products} customers={data.customers}
            onClose={() => setOrderModal(null)}
            onSave={(o) => { upsertOrder(o); setOrderModal(null); }}
          />
        )}
        {custModal && (
          <CustomerModal
            initial={custModal.customer}
            onClose={() => setCustModal(null)}
            onSave={(c) => { upsertCustomer(c); setCustModal(null); }}
          />
        )}
        {recurModal && (
          <RecurringModal
            initial={recurModal.recurring} products={data.products} customers={data.customers}
            onClose={() => setRecurModal(null)}
            onSave={(r) => { upsertRecurring(r); setRecurModal(null); }}
          />
        )}
      </div>
    );
  }

  /* ============================== APP HEADER ============================== */
  function AppHeader() {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 0" }}>
        <img src={LOGO_ICON} alt={BUSINESS_NAME} style={{ width: 34, height: 34, borderRadius: 9, background: "#000", flexShrink: 0 }} />
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 15.5, fontWeight: 700, color: C.primaryDark, letterSpacing: 0.2 }}>{BUSINESS_NAME}</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: C.inkMute, letterSpacing: 1.2, textTransform: "uppercase" }}>{BUSINESS_TAGLINE}</div>
        </div>
      </div>
    );
  }

  /* ============================== BOTTOM NAV ============================== */
  function BottomNav({ tab, setTab, badge }) {
    const items = [
      { id: "dashboard", label: "Dashboard", icon: BarChart3 },
      { id: "orders", label: "Orders", icon: Package },
      { id: "customers", label: "Customers", icon: Users },
      { id: "reports", label: "Reports", icon: ClipboardList },
      { id: "more", label: "More", icon: MoreHorizontal },
    ];
    return (
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, background: C.paper,
        borderTop: `1px solid ${C.paperLine}`, boxShadow: "0 -4px 16px rgba(30,20,10,0.06)", zIndex: 40,
      }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex" }}>
          {items.map((it) => {
            const active = tab === it.id;
            const Icon = it.icon;
            return (
              <button key={it.id} className="tap" onClick={() => setTab(it.id)}
                style={{
                  flex: 1, border: "none", background: "transparent", padding: "10px 4px 8px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative",
                  color: active ? C.primary : C.inkMute,
                }}>
                <Icon size={20} strokeWidth={active ? 2.4 : 1.9} />
                <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500 }}>{it.label}</span>
                {it.id === "orders" && badge > 0 && (
                  <span style={{
                    position: "absolute", top: 4, right: "28%", background: C.brick, color: "#fff",
                    fontSize: 9, fontWeight: 700, borderRadius: 20, padding: "1px 5px", minWidth: 14, textAlign: "center",
                  }}>{badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ============================== SHARED BITS ============================== */
  function TopBar({ title, subtitle, right }) {
    return (
      <div style={{ padding: "12px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 600, color: C.primaryDark }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: C.inkMute, marginTop: 2 }}>{subtitle}</div>}
          </div>
          {right}
        </div>
      </div>
    );
  }

  function StatusPill({ status, kind }) {
    const map = {
      order: { Pending: [C.gold, C.goldSoft], Delivered: [C.green, C.greenSoft], Cancelled: [C.inkMute, C.cream] },
      pay: { Pending: [C.brick, C.brickSoft], Paid: [C.green, C.greenSoft], Partial: [C.gold, C.goldSoft] },
    };
    const [fg, bg] = (map[kind] || map.order)[status] || [C.inkMute, C.cream];
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color: fg, background: bg, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>
        {status}
      </span>
    );
  }

  function QtyLine({ items }) {
    return (
      <div style={{ fontSize: 13, color: C.ink, marginTop: 2 }}>
        {items.map((it, i) => (
          <span key={i}>{iconFor(it.category)} {it.qty} × {it.productName}{i < items.length - 1 ? " + " : ""}</span>
        ))}
      </div>
    );
  }

  /* ============================== DASHBOARD ============================== */
  function Dashboard({ data, selectedDate, setSelectedDate, onAddOrder, onQuickAction, onOpenCustomer }) {
    const isToday = selectedDate === todayStr();
    const dayOrders = data.orders.filter((o) => o.orderDate === selectedDate);
    const active = dayOrders.filter((o) => o.orderStatus !== "Cancelled");
    const totalSales = active.reduce((s, o) => s + o.total, 0);
    const pendingOrders = dayOrders.filter((o) => o.orderStatus === "Pending");
    const deliveredOrders = dayOrders.filter((o) => o.orderStatus === "Delivered");
    const pendingPayAmt = active.reduce((s, o) => s + amountDue(o), 0);

    const productTotals = { Milk: 0, Paneer: 0, Curd: 0 };
    active.forEach((o) => o.items.forEach((it) => { productTotals[it.category] = (productTotals[it.category] || 0) + Number(it.qty); }));

    const totalBottlesToCollect = active.reduce((acc, o) => {
      const todayBottles = o.items.filter(it => it.category === "Milk").reduce((s, it) => s + (Number(it.qty) || 0), 0);
      const returned = Number(o.bottlesReturned) || 0;
      return acc + Math.max(0, todayBottles - returned);
    }, 0);

    const mk = monthKey(selectedDate);
    const monthOrders = data.orders.filter((o) => monthKey(o.orderDate) === mk && o.orderStatus !== "Cancelled");
    const monthSales = monthOrders.reduce((s, o) => s + o.total, 0);

    const cards = [
      { label: "Total Sales", value: fmtINR(totalSales), icon: "💰", fg: C.primary, bg: C.primarySoft },
      { label: "Bottles to Collect", value: totalBottlesToCollect, icon: "🍼", fg: C.gold, bg: C.goldSoft },
      { label: "Pending", value: pendingOrders.length, icon: "⏳", fg: C.brick, bg: C.brickSoft },
      { label: "Delivered", value: deliveredOrders.length, icon: "✅", fg: C.green, bg: C.greenSoft },
    ];

    return (
      <div>
        <TopBar
          title={isToday ? "Good day 👋" : "Business Day"}
          subtitle={new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          right={
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button className="tap" onClick={() => setSelectedDate(addDays(selectedDate, -1))} style={navBtnStyle}><ChevronLeft size={16} /></button>
              <label style={{ position: "relative" }}>
                <button className="tap" onClick={(e) => e.currentTarget.nextSibling.showPicker?.()} style={{ ...navBtnStyle, display: "flex" }}><Calendar size={16} /></button>
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                  style={{ position: "absolute", opacity: 0, width: 1, height: 1, top: 0, left: 0 }} />
              </label>
              <button className="tap" onClick={() => setSelectedDate(addDays(selectedDate, 1))} style={{ ...navBtnStyle, opacity: isToday ? 0.35 : 1 }}><ChevronRight size={16} /></button>
            </div>
          }
        />

        {/* Delivery-slip style hero */}
        <div style={{ margin: "0 16px 14px", background: C.primary, borderRadius: 16, padding: "18px 18px 14px", color: "#fff", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 90% -10%, rgba(255,255,255,0.10), transparent 55%)" }} />
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.75, fontFamily: "'JetBrains Mono',monospace" }}>Today's Business</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 36, fontWeight: 600 }}>{fmtINR(totalSales)}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{dayOrders.length} orders</div>
          </div>
          <div style={{ borderTop: "1px dashed rgba(255,255,255,0.35)", margin: "12px 0 10px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}>
            {["Milk", "Paneer", "Curd"].map((p) => (
              <div key={p} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18 }}>{iconFor(p)}</div>
                <div style={{ fontWeight: 700 }}>{productTotals[p] || 0}</div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>units sold</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 16px" }}>
          {cards.map((c) => (
            <div key={c.label} style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: C.inkMute, fontWeight: 600 }}>{c.label}</span>
                <span style={{ width: 26, height: 26, borderRadius: 20, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{c.icon}</span>
              </div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 600, color: c.fg, marginTop: 4 }}>{c.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, padding: "12px 16px 4px" }}>
          <div style={{ flex: 1, background: C.brickSoft, borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.brick, fontWeight: 700 }}>💵 Pending Payment</div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600, color: C.brick }}>{fmtINR(pendingPayAmt)}</div>
          </div>
          <div style={{ flex: 1, background: C.goldSoft, borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.gold, fontWeight: 700 }}>📊 Month Sales</div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600, color: C.gold }}>{fmtINR(monthSales)}</div>
            <div style={{ fontSize: 10, color: C.inkMute }}>{monthOrders.length} orders</div>
          </div>
        </div>

        <div style={{ padding: "16px 16px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Pending Orders</div>
          <span style={{ fontSize: 12, color: C.inkMute }}>{pendingOrders.length} waiting</span>
        </div>

        <div style={{ padding: "6px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          {pendingOrders.length === 0 && (
            <div style={{ textAlign: "center", color: C.inkMute, fontSize: 13, padding: "18px 0" }}>Nothing pending — everything's delivered. 🎉</div>
          )}
          {pendingOrders.map((o) => (
            <OrderRow key={o.id} order={o} onOpenCustomer={onOpenCustomer} actions={onQuickAction} />
          ))}
        </div>

        <div style={{ height: 20 }} />

        <button className="tap" onClick={onAddOrder} style={{
          position: "fixed", bottom: 96, right: "50%", transform: "translateX(190px)",
          background: C.primary, color: "#fff", border: "none", borderRadius: 30,
          padding: "13px 20px", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6,
          boxShadow: "0 8px 20px rgba(18,53,48,0.35)", zIndex: 30,
        }}>
          <Plus size={18} /> Add Order
        </button>
      </div>
    );
  }

  const navBtnStyle = { width: 30, height: 30, borderRadius: 10, border: `1px solid ${C.paperLine}`, background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", color: C.ink };

  function OrderRow({ order, actions, onOpenCustomer }) {
    return (
      <div style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 14, padding: "12px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }} onClick={() => onOpenCustomer && onOpenCustomer({ id: order.customerId, name: order.customerName })}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{order.customerName}</div>
            <QtyLine items={order.items} />
            {order.phone && <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} />{order.phone}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 15 }}>{fmtINR(order.total)}</div>
            <div style={{ marginTop: 4, display: "flex", gap: 4, justifyContent: "flex-end" }}>
              <StatusPill status={order.orderStatus} kind="order" />
              <StatusPill status={order.paymentStatus} kind="pay" />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {order.orderStatus !== "Delivered" && (
            <ActionBtn onClick={() => actions.markDelivered(order.id)} icon={CheckCircle2} label="Mark Delivered" tone={C.green} toneSoft={C.greenSoft} />
          )}
          {order.paymentStatus !== "Paid" && (
            <ActionBtn onClick={() => actions.markPaid(order.id)} icon={Wallet} label="Mark Paid" tone={C.gold} toneSoft={C.goldSoft} />
          )}
          <ActionBtn onClick={() => generateBill(order)} icon={Download} label="Bill" tone={C.primary} toneSoft={C.primarySoft} />
          <ActionBtn onClick={() => actions.edit(order)} icon={Edit2} label="Edit" tone={C.ink} toneSoft={C.cream} />
          <ActionBtn onClick={() => { if (window.confirm("Are you sure you want to delete this order?")) { actions.del(order.id); } }} icon={Trash2} label="Delete" tone={C.brick} toneSoft={C.brickSoft} />
        </div>
      </div>
    );
  }
  function ActionBtn({ onClick, icon: Icon, label, tone, toneSoft }) {
    return (
      <button className="tap" onClick={onClick} style={{
        border: "none", background: toneSoft, color: tone, borderRadius: 10, padding: "6px 10px",
        fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 4,
      }}>
        <Icon size={12.5} /> {label}
      </button>
    );
  }

  /* ============================== ORDERS TAB ============================== */
  function OrdersTab({ data, onAdd, onEdit, onDelete, onMarkDelivered, onMarkPaid }) {
    const [q, setQ] = useState("");
    const [filterStatus, setFilterStatus] = useState("All");
    const [filterPay, setFilterPay] = useState("All");
    const [filterProduct, setFilterProduct] = useState("All");
    const [range, setRange] = useState("all"); // all|today|7d|month

    const filtered = useMemo(() => {
      let list = [...data.orders].sort((a, b) => (b.orderDate + b.createdAt).localeCompare(a.orderDate + a.createdAt));
      const today = todayStr();
      if (range === "today") list = list.filter((o) => o.orderDate === today);
      if (range === "7d") list = list.filter((o) => o.orderDate >= addDays(today, -6));
      if (range === "month") list = list.filter((o) => monthKey(o.orderDate) === monthKey(today));
      if (filterStatus !== "All") list = list.filter((o) => o.orderStatus === filterStatus);
      if (filterPay !== "All") list = list.filter((o) => o.paymentStatus === filterPay);
      if (filterProduct !== "All") list = list.filter((o) => o.items.some((it) => it.category === filterProduct));
      if (q.trim()) {
        const s = q.toLowerCase();
        list = list.filter((o) => o.customerName.toLowerCase().includes(s) || (o.phone || "").includes(s));
      }
      return list;
    }, [data.orders, q, filterStatus, filterPay, filterProduct, range]);

    return (
      <div>
        <TopBar title="Orders" subtitle={`${filtered.length} order${filtered.length !== 1 ? "s" : ""}`} right={
          <button className="tap" onClick={onAdd} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 12, padding: "9px 13px", display: "flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 12.5 }}>
            <Plus size={15} /> New
          </button>
        } />

        <div style={{ padding: "0 16px" }}>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: 11, color: C.inkMute }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer or phone"
              style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 12, border: `1px solid ${C.paperLine}`, fontSize: 13.5, background: C.paper }} />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", paddingBottom: 2 }}>
            {["all", "today", "7d", "month"].map((r) => (
              <Chip key={r} active={range === r} onClick={() => setRange(r)} label={{ all: "All time", today: "Today", "7d": "Last 7 days", month: "This month" }[r]} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, overflowX: "auto", paddingBottom: 4 }}>
            <SelectChip value={filterStatus} onChange={setFilterStatus} options={["All", "Pending", "Delivered", "Cancelled"]} />
            <SelectChip value={filterPay} onChange={setFilterPay} options={["All", "Paid", "Pending", "Partial"]} />
            <SelectChip value={filterProduct} onChange={setFilterProduct} options={["All", "Milk", "Paneer", "Curd"]} />
          </div>
        </div>

        <div style={{ padding: "10px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && <div style={{ textAlign: "center", color: C.inkMute, fontSize: 13, padding: "30px 0" }}>No orders match your filters.</div>}
          {filtered.map((o) => (
            <div key={o.id}>
              <div style={{ fontSize: 10.5, color: C.inkMute, marginBottom: 3, fontFamily: "'JetBrains Mono',monospace" }}>{fmtDateShort(o.orderDate)}</div>
              <OrderRow order={o} actions={{ markDelivered: onMarkDelivered, markPaid: onMarkPaid, edit: onEdit, del: onDelete }} />
            </div>
          ))}
        </div>
        <div style={{ height: 12 }} />
      </div>
    );
  }
  function Chip({ active, onClick, label }) {
    return (
      <button className="tap" onClick={onClick} style={{
        border: `1px solid ${active ? C.primary : C.paperLine}`, background: active ? C.primary : C.paper,
        color: active ? "#fff" : C.ink, borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
      }}>{label}</button>
    );
  }
  function SelectChip({ value, onChange, options }) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{
        border: `1px solid ${value !== "All" ? C.primary : C.paperLine}`, borderRadius: 20, padding: "6px 10px",
        fontSize: 12, fontWeight: 600, background: value !== "All" ? C.primarySoft : C.paper, color: C.ink,
      }}>
        {options.map((o) => <option key={o} value={o}>{o === "All" ? options[0] === "All" ? "Any status" : o : o}</option>)}
      </select>
    );
  }

  /* ============================== CUSTOMERS TAB ============================== */
  function CustomersTab({ data, activeCustomer, setActiveCustomer, onAddCustomer, onEditCustomer, onNewOrderFor, onEditOrder, onDeleteCustomer }) {
    const [q, setQ] = useState("");

  const stats = useMemo(() => {
    const map = {};
    data.customers.forEach((c) => { map[c.id] = { ...c, totalOrders: 0, totalAmount: 0, pending: 0, lastOrder: null, bottlesOwed: 0 }; });
    data.orders.forEach((o) => {
      if (!map[o.customerId]) return;
      if (o.orderStatus === "Cancelled") return;
      map[o.customerId].totalOrders += 1;
      map[o.customerId].totalAmount += o.total;
      map[o.customerId].pending += amountDue(o);

      const delivered = o.items.filter(it => it.category === "Milk").reduce((s, it) => s + (Number(it.qty) || 0), 0);
      const returned = Number(o.bottlesReturned) || 0;
      map[o.customerId].bottlesOwed += Math.max(0, delivered - returned);

      if (!map[o.customerId].lastOrder || o.orderDate > map[o.customerId].lastOrder) map[o.customerId].lastOrder = o.orderDate;
    });
    return Object.values(map);
  }, [data]);

    const filtered = stats.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone || "").includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (activeCustomer) {
      const full = stats.find((c) => c.id === activeCustomer.id) || { ...activeCustomer, totalOrders: 0, totalAmount: 0, pending: 0, lastOrder: null };
      const orders = data.orders.filter((o) => o.customerId === activeCustomer.id).sort((a, b) => b.orderDate.localeCompare(a.orderDate));
      return (
        <div>
          <div style={{ padding: "18px 16px 8px", display: "flex", alignItems: "center", gap: 10 }}>
            <button className="tap" onClick={() => setActiveCustomer(null)} style={navBtnStyle}><ArrowLeft size={16} /></button>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600 }}>{full.name}</div>
          </div>
          <div style={{ padding: "0 16px" }}>
            {full.phone && <div style={{ fontSize: 13, color: C.inkMute, display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}><Phone size={13} />{full.phone}</div>}
            {full.address && <div style={{ fontSize: 13, color: C.inkMute, display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}><MapPin size={13} />{full.address}</div>}

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
      <MiniStat label="Total Orders" value={full.totalOrders} />
      <MiniStat label="Total Purchased" value={fmtINR(full.totalAmount)} />
      <MiniStat label="Pending Payment" value={fmtINR(full.pending)} tone={C.brick} />
      <MiniStat label="Bottles Owed" value={full.bottlesOwed || 0} tone={full.bottlesOwed > 0 ? C.gold : C.ink} />
      <MiniStat label="Last Order" value={full.lastOrder ? fmtDateShort(full.lastOrder) : "—"} />
    </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="tap" onClick={() => onNewOrderFor(full)} style={{ flex: 1, background: C.primary, color: "#fff", border: "none", borderRadius: 12, padding: "11px", fontWeight: 700, fontSize: 13 }}>+ New Order</button>
              <button className="tap" onClick={() => onEditCustomer(full)} style={{ background: C.cream, border: "none", borderRadius: 12, padding: "11px 14px", fontWeight: 700, fontSize: 13 }}><Edit2 size={14} /></button>
              <button className="tap" onClick={() => { if (window.confirm("Are you sure you want to delete this customer? Their past orders will remain in history.")) { onDeleteCustomer(full.id); setActiveCustomer(null); } }} style={{ background: C.brickSoft, color: C.brick, border: "none", borderRadius: 12, padding: "11px 14px", fontWeight: 700, fontSize: 13 }}><Trash2 size={14} /></button>
            </div>

            <div style={{ fontWeight: 700, fontSize: 14, marginTop: 20, marginBottom: 8 }}>Order History</div>
          </div>
          <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {orders.length === 0 && <div style={{ color: C.inkMute, fontSize: 13 }}>No orders yet.</div>}
            {orders.map((o) => (
              <div key={o.id} className="tap" onClick={() => onEditOrder(o)} style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 12, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: C.inkMute, fontFamily: "'JetBrains Mono',monospace" }}>{fmtDateShort(o.orderDate)}</div>
                  <QtyLine items={o.items} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{fmtINR(o.total)}</div>
                  <StatusPill status={o.orderStatus} kind="order" />
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 16 }} />
        </div>
      );
    }

    return (
      <div>
        <TopBar title="Customers" subtitle={`${filtered.length} total`} right={
          <button className="tap" onClick={onAddCustomer} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 12, padding: "9px 13px", display: "flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 12.5 }}>
            <Plus size={15} /> New
          </button>
        } />
        <div style={{ padding: "0 16px" }}>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: 11, color: C.inkMute }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or phone"
              style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 12, border: `1px solid ${C.paperLine}`, fontSize: 13.5, background: C.paper }} />
          </div>
        </div>
        <div style={{ padding: "10px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && <div style={{ textAlign: "center", color: C.inkMute, fontSize: 13, padding: "30px 0" }}>No customers yet. Add your first one.</div>}
          {filtered.map((c) => (
            <div key={c.id} className="tap" onClick={() => setActiveCustomer(c)} style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 14, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 2 }}>{c.phone || "No phone"} · {c.totalOrders} orders</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>{fmtINR(c.totalAmount)}</div>
                {c.pending > 0 && <div style={{ fontSize: 10.5, color: C.brick, fontWeight: 700 }}>{fmtINR(c.pending)} due</div>}
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
      <div style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 12, padding: "10px 12px" }}>
        <div style={{ fontSize: 10.5, color: C.inkMute, fontWeight: 600 }}>{label}</div>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 600, color: tone || C.ink }}>{value}</div>
      </div>
    );
  }

  /* ============================== REPORTS TAB ============================== */
  function ReportsTab({ data }) {
    const [view, setView] = useState("daily"); // daily | monthly
    const [month, setMonth] = useState(monthKey(todayStr()));

    const monthOrders = data.orders.filter((o) => monthKey(o.orderDate) === month && o.orderStatus !== "Cancelled");
    const totalSales = monthOrders.reduce((s, o) => s + o.total, 0);
    const totalPaid = monthOrders.reduce((s, o) => s + (o.paymentStatus === "Paid" ? o.total : (o.amountPaid || 0)), 0);
    const totalPending = totalSales - totalPaid;
    const productTotals = { Milk: 0, Paneer: 0, Curd: 0 };
    monthOrders.forEach((o) => o.items.forEach((it) => { productTotals[it.category] = (productTotals[it.category] || 0) + Number(it.qty); }));

    const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const dailySeries = Array.from({ length: daysInMonth }, (_, i) => {
      const dateStr = `${month}-${String(i + 1).padStart(2, "0")}`;
      const sales = monthOrders.filter((o) => o.orderDate === dateStr).reduce((s, o) => s + o.total, 0);
      return { day: i + 1, sales };
    });
    const bestDay = dailySeries.reduce((best, d) => (d.sales > (best?.sales || 0) ? d : best), null);
    const avgDaily = monthOrders.length ? totalSales / new Set(monthOrders.map((o) => o.orderDate)).size : 0;

    const productPie = [
      { name: "Milk", value: productTotals.Milk, color: C.primary },
      { name: "Paneer", value: productTotals.Paneer, color: C.gold },
      { name: "Curd", value: productTotals.Curd, color: C.brick },
    ].filter((p) => p.value > 0);

    const payPie = [
      { name: "Paid", value: totalPaid, color: C.green },
      { name: "Pending", value: totalPending, color: C.brick },
    ].filter((p) => p.value > 0);

    function exportMonthlyCSV() {
      const rows = [["Date", "Customer", "Phone", "Products", "Total", "Payment Status", "Order Status"]];
      monthOrders.forEach((o) => rows.push([o.orderDate, o.customerName, o.phone, o.items.map((it) => `${it.qty}${it.unit} ${it.productName}`).join(" + "), o.total, o.paymentStatus, o.orderStatus]));
      csvDownload(`sales-report-${month}.csv`, rows);
    }
    function exportPendingCSV() {
      const rows = [["Date", "Customer", "Phone", "Amount Due"]];
      data.orders.filter((o) => amountDue(o) > 0).forEach((o) => rows.push([o.orderDate, o.customerName, o.phone, amountDue(o)]));
      csvDownload("pending-payments.csv", rows);
    }
    function exportCustomerCSV() {
      const rows = [["Name", "Phone", "Address", "Total Orders", "Total Amount", "Pending"]];
      const map = {};
      data.customers.forEach((c) => { map[c.id] = { ...c, totalOrders: 0, totalAmount: 0, pending: 0 }; });
      data.orders.forEach((o) => { if (map[o.customerId] && o.orderStatus !== "Cancelled") { map[o.customerId].totalOrders++; map[o.customerId].totalAmount += o.total; map[o.customerId].pending += amountDue(o); } });
      Object.values(map).forEach((c) => rows.push([c.name, c.phone, c.address, c.totalOrders, c.totalAmount, c.pending]));
      csvDownload("customer-report.csv", rows);
    }

    return (
      <div>
        <TopBar title="Reports" subtitle="Sales, trends & exports" />
        <div style={{ padding: "0 16px", display: "flex", gap: 6 }}>
          <Chip active={view === "daily"} onClick={() => setView("daily")} label="Daily Sales" />
          <Chip active={view === "monthly"} onClick={() => setView("monthly")} label="Monthly Report" />
        </div>

        <div style={{ padding: "14px 16px 0" }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} max={monthKey(todayStr())}
            style={{ padding: "9px 12px", borderRadius: 10, border: `1px solid ${C.paperLine}`, fontSize: 13, background: C.paper }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 16px 0" }}>
          <MiniStat label="Total Sales" value={fmtINR(totalSales)} tone={C.primary} />
          <MiniStat label="Total Orders" value={monthOrders.length} />
          <MiniStat label="Total Paid" value={fmtINR(totalPaid)} tone={C.green} />
          <MiniStat label="Total Pending" value={fmtINR(totalPending)} tone={C.brick} />
          <MiniStat label="Avg Daily Sales" value={fmtINR(avgDaily)} />
          <MiniStat label="Best Sales Day" value={bestDay && bestDay.sales > 0 ? `${bestDay.day} ${month.slice(5,7)}` : "—"} />
        </div>

        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Daily Sales Trend</div>
          <div style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 14, padding: "10px 6px", height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailySeries} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.paperLine} />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmtINR(v)} labelFormatter={(l) => `Day ${l}`} />
                <Line type="monotone" dataKey="sales" stroke={C.primary} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, padding: "16px 16px 0" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Product-wise Sold</div>
            <div style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 14, height: 160, padding: 6 }}>
              {productPie.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={productPie} dataKey="value" nameKey="name" innerRadius={30} outerRadius={55} paddingAngle={3}>
                      {productPie.map((p, i) => <Cell key={i} fill={p.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div style={{ fontSize: 11, color: C.inkMute, textAlign: "center", paddingTop: 60 }}>No data</div>}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Paid vs Pending</div>
            <div style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 14, height: 160, padding: 6 }}>
              {payPie.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={payPie} dataKey="value" nameKey="name" innerRadius={30} outerRadius={55} paddingAngle={3}>
                      {payPie.map((p, i) => <Cell key={i} fill={p.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtINR(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div style={{ fontSize: 11, color: C.inkMute, textAlign: "center", paddingTop: 60 }}>No data</div>}
            </div>
          </div>
        </div>

        <div style={{ padding: "18px 16px 4px", fontWeight: 700, fontSize: 14 }}>Export</div>
        <div style={{ padding: "6px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          <ExportBtn label="Monthly Sales Report (CSV)" onClick={exportMonthlyCSV} />
          <ExportBtn label="Pending Payment Report (CSV)" onClick={exportPendingCSV} />
          <ExportBtn label="Customer Report (CSV)" onClick={exportCustomerCSV} />
          <ExportBtn label="Print / Save as PDF" onClick={() => window.print()} />
        </div>
        <div style={{ height: 16 }} />
      </div>
    );
  }
  function ExportBtn({ label, onClick }) {
    return (
      <button className="tap" onClick={onClick} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 600 }}>
        {label} <Download size={15} color={C.inkMute} />
      </button>
    );
  }

  /* ============================== MORE TAB ============================== */
  function MoreTab({ view, setView, data, onSaveProduct, onAddRecurring, onEditRecurring, onDeleteRecurring, pendingDeliveries, pendingPayments }) {
    if (view === "products") return <ProductsView data={data} onSave={onSaveProduct} onBack={() => setView("menu")} />;
    if (view === "recurring") return <RecurringView data={data} onAdd={onAddRecurring} onEdit={onEditRecurring} onDelete={onDeleteRecurring} onBack={() => setView("menu")} />;
    if (view === "notifications") return <NotificationsView data={data} onBack={() => setView("menu")} />;

    const items = [
      { id: "products", label: "Products & Pricing", desc: "Manage Milk, Paneer, Curd prices", icon: "🏷️" },
      { id: "recurring", label: "Recurring Orders", desc: "Daily & weekly standing orders", icon: "🔁" },
      { id: "notifications", label: "Reminders", desc: `${pendingDeliveries} deliveries · ${pendingPayments} payments due`, icon: "🔔" },
    ];
    return (
      <div>
        <TopBar title="More" subtitle="Settings & tools" />
        <div style={{ padding: "6px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it) => (
            <div key={it.id} className="tap" onClick={() => setView(it.id)} style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 14, padding: "14px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 22 }}>{it.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{it.label}</div>
                <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>{it.desc}</div>
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
    return (
      <div>
        <div style={{ padding: "18px 16px 8px", display: "flex", alignItems: "center", gap: 10 }}>
          <button className="tap" onClick={onBack} style={navBtnStyle}><ArrowLeft size={16} /></button>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600 }}>Products & Pricing</div>
        </div>
        <div style={{ padding: "8px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          {data.products.map((p) => (
            <div key={p.id} style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 22 }}>{iconFor(p.category)}</div>
              {editing === p.id ? (
                <InlineProductEdit product={p} onCancel={() => setEditing(null)} onSave={(np) => { onSave(np); setEditing(null); }} />
              ) : (
                <>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name} <span style={{ fontWeight: 400, color: C.inkMute, fontSize: 11.5 }}>/ {p.unit}</span></div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: C.primary }}>{fmtINR(p.price)}</div>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                    <input type="checkbox" checked={p.active} onChange={(e) => onSave({ ...p, active: e.target.checked })} /> Active
                  </label>
                  <button className="tap" onClick={() => setEditing(p.id)} style={{ border: "none", background: C.cream, borderRadius: 10, padding: 8 }}><Edit2 size={13} /></button>
                </>
              )}
            </div>
          ))}
        </div>
        <div style={{ height: 16 }} />
      </div>
    );
  }
  function InlineProductEdit({ product, onCancel, onSave }) {
    const [price, setPrice] = useState(product.price);
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
        <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 80, padding: "7px 8px", borderRadius: 8, border: `1px solid ${C.paperLine}` }} />
        <button className="tap" onClick={() => onSave({ ...product, price: Number(price) })} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "7px 10px", fontSize: 11.5, fontWeight: 700 }}>Save</button>
        <button className="tap" onClick={onCancel} style={{ background: C.cream, border: "none", borderRadius: 8, padding: "7px 10px", fontSize: 11.5 }}>Cancel</button>
      </div>
    );
  }

  function RecurringView({ data, onAdd, onEdit, onDelete, onBack }) {
    return (
      <div>
        <div style={{ padding: "18px 16px 8px", display: "flex", alignItems: "center", gap: 10 }}>
          <button className="tap" onClick={onBack} style={navBtnStyle}><ArrowLeft size={16} /></button>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600, flex: 1 }}>Recurring Orders</div>
          <button className="tap" onClick={onAdd} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 12, padding: "8px 12px", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><Plus size={14} />New</button>
        </div>
        <div style={{ padding: "8px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          {data.recurring.length === 0 && <div style={{ textAlign: "center", color: C.inkMute, fontSize: 13, padding: "30px 0" }}>No standing orders yet. Add a daily or weekly customer order.</div>}
          {data.recurring.map((r) => (
            <div key={r.id} style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.customerName}</div>
                  <QtyLine items={r.items} />
                  <div style={{ fontSize: 11, color: C.inkMute, marginTop: 3 }}>
                    {r.frequency === "daily" ? "Every day" : `Weekly: ${(r.daysOfWeek || []).map((d) => weekdayShort[d]).join(", ")}`}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: r.active ? C.green : C.inkMute, background: r.active ? C.greenSoft : C.cream, padding: "3px 9px", borderRadius: 20 }}>{r.active ? "Active" : "Paused"}</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <ActionBtn onClick={() => onEdit(r)} icon={Edit2} label="Edit" tone={C.ink} toneSoft={C.cream} />
                <ActionBtn onClick={() => { if (window.confirm("Are you sure you want to delete this recurring order?")) onDelete(r.id); }} icon={Trash2} label="Delete" tone={C.brick} toneSoft={C.brickSoft} />
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
    const pendingDeliveries = data.orders.filter((o) => o.orderStatus === "Pending");
    const pendingPayments = data.orders.filter((o) => o.paymentStatus !== "Paid" && o.orderStatus !== "Cancelled");
    const overdue = pendingDeliveries.filter((o) => o.deliveryDate < today);
    const activeRecurring = data.recurring.filter((r) => r.active);

    return (
      <div>
        <div style={{ padding: "18px 16px 8px", display: "flex", alignItems: "center", gap: 10 }}>
          <button className="tap" onClick={onBack} style={navBtnStyle}><ArrowLeft size={16} /></button>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600 }}>Reminders</div>
        </div>
        <div style={{ padding: "8px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          <NoteCard icon={Clock} tone={C.brick} toneSoft={C.brickSoft} title={`${overdue.length} overdue deliveries`} desc="Orders past their delivery date, still pending." />
          <NoteCard icon={Package} tone={C.gold} toneSoft={C.goldSoft} title={`${pendingDeliveries.length} pending deliveries`} desc="Orders not yet marked delivered." />
          <NoteCard icon={Wallet} tone={C.brick} toneSoft={C.brickSoft} title={`${pendingPayments.length} pending payments`} desc={`${fmtINR(pendingPayments.reduce((s, o) => s + amountDue(o), 0))} outstanding.`} />
          <NoteCard icon={Repeat} tone={C.primary} toneSoft={C.primarySoft} title={`${activeRecurring.length} active recurring orders`} desc="Auto-generated each matching day." />
        </div>
        <div style={{ height: 16 }} />
      </div>
    );
  }
  function NoteCard({ icon: Icon, tone, toneSoft, title, desc }) {
    return (
      <div style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 14, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: toneSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={16} color={tone} /></div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{title}</div>
          <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>{desc}</div>
        </div>
      </div>
    );
  }

  /* ============================== MODAL SHELL ============================== */
  function ModalShell({ title, onClose, children, footer }) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(20,15,10,0.45)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div style={{ background: C.bg, width: "100%", maxWidth: 480, maxHeight: "92vh", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px", borderBottom: `1px solid ${C.paperLine}`, background: C.paper }}>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 600 }}>{title}</div>
            <button className="tap" onClick={onClose} style={{ border: "none", background: C.cream, borderRadius: 10, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
          </div>
          <div style={{ overflowY: "auto", padding: 16, flex: 1 }}>{children}</div>
          {footer && <div style={{ padding: 16, borderTop: `1px solid ${C.paperLine}`, background: C.paper }}>{footer}</div>}
        </div>
      </div>
    );
  }
  function Field({ label, children }) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.inkMute, marginBottom: 5 }}>{label}</div>
        {children}
      </div>
    );
  }
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.paperLine}`, fontSize: 14, background: C.paper };

  /* ============================== ORDER MODAL ============================== */
  function OrderModal({ initial, prefillCustomer, products, customers, onClose, onSave }) {
    const isEdit = !!initial;
    const [customerId, setCustomerId] = useState(initial?.customerId || prefillCustomer?.id || "");
    const [customerName, setCustomerName] = useState(initial?.customerName || prefillCustomer?.name || "");
    const [phone, setPhone] = useState(initial?.phone || prefillCustomer?.phone || "");
    const [address, setAddress] = useState(initial?.address || prefillCustomer?.address || "");
    const [items, setItems] = useState(initial?.items?.length ? initial.items : [{ id: uid("it"), productId: products[0]?.id, productName: products[0]?.name, category: products[0]?.category, qty: 1, unit: products[0]?.unit, price: products[0]?.price }]);
    const [orderDate, setOrderDate] = useState(initial?.orderDate || todayStr());
    const [deliveryDate, setDeliveryDate] = useState(initial?.deliveryDate || todayStr());
    const [paymentStatus, setPaymentStatus] = useState(initial?.paymentStatus || "Pending");
    const [amountPaid, setAmountPaid] = useState(initial?.amountPaid || 0);
    const [orderStatus, setOrderStatus] = useState(initial?.orderStatus || "Pending");
    const [notes, setNotes] = useState(initial?.notes || "");
    const [bottlesReturned, setBottlesReturned] = useState(initial?.bottlesReturned || 0);
    const [showCustList, setShowCustList] = useState(false);

    const total = orderTotal(items);

    function updateItem(idx, patch) {
      setItems((prev) => prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        if (patch.productId) {
          const p = products.find((p) => p.id === patch.productId);
          next.productName = p.name; next.unit = p.unit; next.price = p.price; next.category = p.category;
        }
        return next;
      }));
    }
    function addItem() {
      const p = products.find((p) => !items.some((it) => it.productId === p.id)) || products[0];
      setItems((prev) => [...prev, { id: uid("it"), productId: p.id, productName: p.name, category: p.category, qty: 1, unit: p.unit, price: p.price }]);
    }
    function removeItem(idx) { setItems((prev) => prev.filter((_, i) => i !== idx)); }

    function selectCustomer(c) {
      setCustomerId(c.id); setCustomerName(c.name); setPhone(c.phone || ""); setAddress(c.address || ""); setShowCustList(false);
    }

    function handleSave() {
      if (!customerName.trim()) { alert("Please enter a customer name."); return; }
      if (items.length === 0) { alert("Add at least one product."); return; }
      onSave({
        id: initial?.id || uid("o"),
        customerId: customerId || uid("c"),
        customerName: customerName.trim(), phone, address, items,
        orderDate, deliveryDate, paymentStatus,
        amountPaid: paymentStatus === "Paid" ? total : Number(amountPaid) || 0,
        orderStatus, notes, total,
        bottlesReturned: Number(bottlesReturned) || 0,
        createdAt: initial?.createdAt || new Date().toISOString(),
        recurringId: initial?.recurringId,
      });
    }

    function handlePrint() {
      const draft = {
        id: initial?.id || uid("o"),
        customerId: customerId || uid("c"),
        customerName: customerName.trim(), phone, address, items,
        orderDate, deliveryDate, paymentStatus,
        amountPaid: paymentStatus === "Paid" ? total : Number(amountPaid) || 0,
        orderStatus, notes, total, createdAt: initial?.createdAt || new Date().toISOString(),
      };
      generateBill(draft);
    }

    return (
      <ModalShell title={isEdit ? "Edit Order" : "Add Order"} onClose={onClose} footer={
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 14 }}>
            <span style={{ fontWeight: 700 }}>Total</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 18, color: C.primary }}>{fmtINR(total)}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="tap" onClick={handlePrint} style={{ flex: 0.42, background: C.cream, color: C.ink, border: "none", borderRadius: 12, padding: "11px", fontWeight: 700, fontSize: 14 }}>Print Bill</button>
            <button className="tap" onClick={handleSave} style={{ flex: 0.58, background: C.primary, color: "#fff", border: "none", borderRadius: 12, padding: "11px", fontWeight: 700, fontSize: 14 }}>
              {isEdit ? "Save Changes" : "Create Order"}
            </button>
          </div>
        </div>
      }>
        <Field label="Customer Name">
          <input style={inputStyle} value={customerName} onChange={(e) => { setCustomerName(e.target.value); setCustomerId(""); setShowCustList(true); }} placeholder="e.g. Ravi Kumar" />
          {showCustList && customerName && (
            <div style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 10, marginTop: 4, maxHeight: 140, overflowY: "auto" }}>
              {customers.filter((c) => c.name.toLowerCase().includes(customerName.toLowerCase())).slice(0, 5).map((c) => (
                <div key={c.id} className="tap" onClick={() => selectCustomer(c)} style={{ padding: "8px 12px", fontSize: 13, borderBottom: `1px solid ${C.paperLine}` }}>{c.name} <span style={{ color: C.inkMute }}>{c.phone}</span></div>
              ))}
            </div>
          )}
        </Field>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><Field label="Phone Number"><input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number" /></Field></div>
        </div>
        <Field label="Delivery Address"><input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House / street / area" /></Field>

        <Field label="Products">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it, idx) => (
              <div key={it.id} style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 12, padding: 10 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <select style={{ ...inputStyle, flex: 1.3 }} value={it.productId} onChange={(e) => updateItem(idx, { productId: e.target.value })}>
                    {products.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{iconFor(p.category)} {p.name}</option>)}
                  </select>
                  <button className="tap" onClick={() => removeItem(idx)} style={{ border: "none", background: C.brickSoft, color: C.brick, borderRadius: 10, width: 38 }}><Trash2 size={14} /></button>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="number" min="0" step="0.1" style={{ ...inputStyle, flex: 1 }} value={it.qty} onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })} placeholder="Qty" />
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, color: C.inkMute }}>{it.unit}</div>
                  <input type="number" min="0" style={{ ...inputStyle, flex: 1 }} value={it.price} onChange={(e) => updateItem(idx, { price: Number(e.target.value) })} placeholder="Price/unit" />
                </div>
                <div style={{ textAlign: "right", marginTop: 6, fontSize: 12.5, color: C.inkMute }}>= <b style={{ color: C.ink }}>{fmtINR((it.qty || 0) * (it.price || 0))}</b></div>
              </div>
            ))}
          </div>
          <button className="tap" onClick={addItem} style={{ marginTop: 8, border: `1px dashed ${C.primary}`, background: "transparent", color: C.primary, borderRadius: 10, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, width: "100%" }}>+ Add another product</button>
        </Field>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><Field label="Order Date"><input type="date" style={inputStyle} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Delivery Date"><input type="date" style={inputStyle} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></Field></div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><Field label="Order Status">
            <select style={inputStyle} value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
              <option>Pending</option><option>Delivered</option><option>Cancelled</option>
            </select>
          </Field></div>
          <div style={{ flex: 1 }}><Field label="Payment Status">
            <select style={inputStyle} value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
              <option>Pending</option><option>Partial</option><option>Paid</option>
            </select>
          </Field></div>
        </div>
        {paymentStatus === "Partial" && (
          <Field label="Amount Paid So Far"><input type="number" style={inputStyle} value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} /></Field>
        )}
        <Field label="Bottles Returned (Empty)"><input type="number" style={inputStyle} value={bottlesReturned} onChange={(e) => setBottlesReturned(e.target.value)} placeholder="Count of glass bottles collected" /></Field>
        <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" /></Field>
      </ModalShell>
    );
  }

  /* ============================== CUSTOMER MODAL ============================== */
  function CustomerModal({ initial, onClose, onSave }) {
    const [name, setName] = useState(initial?.name || "");
    const [phone, setPhone] = useState(initial?.phone || "");
    const [address, setAddress] = useState(initial?.address || "");
    return (
      <ModalShell title={initial ? "Edit Customer" : "Add Customer"} onClose={onClose} footer={
        <button className="tap" onClick={() => { if (!name.trim()) { alert("Enter a name"); return; } onSave({ id: initial?.id || uid("c"), name: name.trim(), phone, address, createdAt: initial?.createdAt || new Date().toISOString() }); }}
          style={{ width: "100%", background: C.primary, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 14.5 }}>Save Customer</button>
      }>
        <Field label="Name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone"><input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Address"><input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
      </ModalShell>
    );
  }

  /* ============================== RECURRING MODAL ============================== */
  function RecurringModal({ initial, products, customers, onClose, onSave }) {
    const [customerName, setCustomerName] = useState(initial?.customerName || "");
    const [customerId, setCustomerId] = useState(initial?.customerId || "");
    const [phone, setPhone] = useState(initial?.phone || "");
    const [address, setAddress] = useState(initial?.address || "");
    const [items, setItems] = useState(initial?.items?.length ? initial.items : [{ id: uid("it"), productId: products[0]?.id, productName: products[0]?.name, category: products[0]?.category, qty: 1, unit: products[0]?.unit, price: products[0]?.price }]);
    const [frequency, setFrequency] = useState(initial?.frequency || "daily");
    const [daysOfWeek, setDaysOfWeek] = useState(initial?.daysOfWeek || [1, 2, 3, 4, 5, 6, 0]);
    const [active, setActive] = useState(initial?.active ?? true);
    const [showCustList, setShowCustList] = useState(false);

    function updateItem(idx, patch) {
      setItems((prev) => prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        if (patch.productId) { const p = products.find((p) => p.id === patch.productId); next.productName = p.name; next.unit = p.unit; next.price = p.price; next.category = p.category; }
        return next;
      }));
    }
    function addItem() {
      const p = products.find((p) => !items.some((it) => it.productId === p.id)) || products[0];
      setItems((prev) => [...prev, { id: uid("it"), productId: p.id, productName: p.name, category: p.category, qty: 1, unit: p.unit, price: p.price }]);
    }
    function toggleDay(d) { setDaysOfWeek((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]); }

    function selectCustomer(c) { setCustomerId(c.id); setCustomerName(c.name); setPhone(c.phone || ""); setAddress(c.address || ""); setShowCustList(false); }

    function handleSave() {
      if (!customerName.trim()) { alert("Enter a customer name"); return; }
      onSave({
        id: initial?.id || uid("r"), customerId: customerId || uid("c"), customerName: customerName.trim(),
        phone, address, items, frequency, daysOfWeek: frequency === "daily" ? [0, 1, 2, 3, 4, 5, 6] : daysOfWeek, active,
      });
    }

    return (
      <ModalShell title={initial ? "Edit Recurring Order" : "New Recurring Order"} onClose={onClose} footer={
        <button className="tap" onClick={handleSave} style={{ width: "100%", background: C.primary, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 14.5 }}>Save Recurring Order</button>
      }>
        <Field label="Customer Name">
          <input style={inputStyle} value={customerName} onChange={(e) => { setCustomerName(e.target.value); setCustomerId(""); setShowCustList(true); }} />
          {showCustList && customerName && (
            <div style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 10, marginTop: 4, maxHeight: 140, overflowY: "auto" }}>
              {customers.filter((c) => c.name.toLowerCase().includes(customerName.toLowerCase())).slice(0, 5).map((c) => (
                <div key={c.id} className="tap" onClick={() => selectCustomer(c)} style={{ padding: "8px 12px", fontSize: 13, borderBottom: `1px solid ${C.paperLine}` }}>{c.name} <span style={{ color: C.inkMute }}>{c.phone}</span></div>
              ))}
            </div>
          )}
        </Field>
        <Field label="Phone"><input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Address"><input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>

        <Field label="Standing Order">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it, idx) => (
              <div key={it.id} style={{ display: "flex", gap: 8 }}>
                <select style={{ ...inputStyle, flex: 1.2 }} value={it.productId} onChange={(e) => updateItem(idx, { productId: e.target.value })}>
                  {products.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{iconFor(p.category)} {p.name}</option>)}
                </select>
                <input type="number" min="0" step="0.1" style={{ ...inputStyle, flex: 0.7 }} value={it.qty} onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })} />
                <div style={{ flex: 0.6, display: "flex", alignItems: "center", fontSize: 12, color: C.inkMute }}>{it.unit}</div>
              </div>
            ))}
          </div>
          <button className="tap" onClick={addItem} style={{ marginTop: 8, border: `1px dashed ${C.primary}`, background: "transparent", color: C.primary, borderRadius: 10, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, width: "100%" }}>+ Add product</button>
        </Field>

        <Field label="Frequency">
          <div style={{ display: "flex", gap: 6 }}>
            {["daily", "weekly"].map((f) => <Chip key={f} active={frequency === f} onClick={() => setFrequency(f)} label={f === "daily" ? "Every day" : "Specific days"} />)}
          </div>
        </Field>
        {frequency === "weekly" && (
          <Field label="Days of the Week">
            <div style={{ display: "flex", gap: 5 }}>
              {weekdayShort.map((w, i) => (
                <button key={i} className="tap" onClick={() => toggleDay(i)} style={{
                  width: 36, height: 36, borderRadius: 10, border: `1px solid ${daysOfWeek.includes(i) ? C.primary : C.paperLine}`,
                  background: daysOfWeek.includes(i) ? C.primary : C.paper, color: daysOfWeek.includes(i) ? "#fff" : C.ink, fontSize: 11, fontWeight: 700,
                }}>{w[0]}</button>
              ))}
            </div>
          </Field>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginTop: 4 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active — auto-create today's order
        </label>
      </ModalShell>
    );
  }

  /* ============================== RETURN BOTTLE MODAL ============================== */
  function ReturnBottleModal({ order, onClose, onConfirm }) {
    const [count, setCount] = useState(order.bottlesReturned || 0);
    
    // Calculate how many bottles they ARE receiving today to show as a hint
    const bottlesSent = order.items
      .filter(it => it.category === "Milk")
      .reduce((s, it) => s + (Number(it.qty) || 0), 0);

    return (
      <ModalShell title="Confirm Delivery" onClose={onClose} footer={
        <button className="tap" 
          onClick={() => onConfirm(order.id, Number(count))}
          style={{ width: "100%", background: C.green, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 14.5 }}>
          Confirm & Mark Delivered
        </button>
      }>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 40 }}>🥛</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 10 }}>{order.customerName}</div>
          <div style={{ fontSize: 13, color: C.inkMute }}>Delivering {bottlesSent} bottles today</div>
        </div>

        <Field label="Empty Bottles Returned">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input 
              type="number" 
              style={{ ...inputStyle, textAlign: 'center', fontSize: 24, fontWeight: '700' }} 
              value={count} 
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
            {[0, 1, 2, 3, 4, 5].map(num => (
              <button 
                key={num} 
                className="tap"
                onClick={() => setCount(num)}
                style={{ 
                  padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.paperLine}`,
                  background: count == num ? C.primary : C.paper,
                  color: count == num ? '#fff' : C.ink,
                  fontWeight: '700'
                }}>
                {num}
              </button>
            ))}
          </div>
        </Field>
        
        <div style={{ background: C.greenSoft, padding: 12, borderRadius: 10, fontSize: 12, color: C.green, marginTop: 10 }}>
          <b>Note:</b> This will update the customer's bottle balance and send a delivery confirmation via WhatsApp.
        </div>
      </ModalShell>
    );
  }
