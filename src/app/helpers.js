import { BUSINESS_NAME } from "./constants";

export const uid = (prefix = "id") => prefix + "_" + Math.random().toString(36).slice(2, 10);
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const fmtINR = (value) => "₹" + Math.round(value || 0).toLocaleString("en-IN");
export const fmtDate = (iso) => {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
export const fmtDateShort = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
export const addDays = (iso, days) => {
  const date = new Date(iso + "T00:00:00");
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
export const monthKey = (iso) => iso.slice(0, 7);
export const iconFor = (category) => ({ Milk: "🥛", Paneer: "🧀", Curd: "🥣" }[category] || "🏷️");

export function orderTotal(items) {
  const total = items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0), 0);
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

export function amountDue(order) {
  if (!order || typeof order.total !== "number" || Number.isNaN(order.total)) return 0;
  const paid = order.paymentStatus === "Paid" ? order.total : Number(order.amountPaid) || 0;
  return Math.max(0, Math.round((order.total - paid + Number.EPSILON) * 100) / 100);
}

export const hasCoordinates = (place) => Number.isFinite(Number(place?.latitude)) && Number.isFinite(Number(place?.longitude)) && Number(place.latitude) !== 0 && Number(place.longitude) !== 0;

export function openCustomerRoute(customers) {
  const stops = customers.filter(hasCoordinates);
  if (!stops.length) {
    alert("Add GPS locations to at least one customer first.");
    return;
  }
  const destination = `${stops[stops.length - 1].latitude},${stops[stops.length - 1].longitude}`;
  const waypoints = stops.slice(0, -1).map((customer) => `${customer.latitude},${customer.longitude}`).join("|");
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}`;
  const win = window.open(url, "_blank");
  if (!win) window.location.href = url;
}

export function openCustomerNavigation(customer) {
  if (!hasCoordinates(customer)) return;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${customer.latitude},${customer.longitude}`;
  const win = window.open(url, "_blank");
  if (!win) window.location.href = url;
}

export function openDeliveryWhatsApp(order, allOrders = []) {
  if (!order) return;
  const digits = String(order.phone || "").replace(/\D/g, "");
  if (!digits) return;
  const cleanDigits = digits.replace(/^0+/, "");
  const phone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
  const items = (order.items || []).map((item) => `${item.qty} × ${item.productName}`).join(", ");

  // Total pending from OTHER unpaid orders (exclude this one to avoid double-count)
  const pendingFromOthers = (allOrders || [])
    .filter(o => o.id !== order.id
              && o.customerId === order.customerId
              && o.orderStatus !== "Cancelled"
              && o.paymentStatus !== "Paid")
    .reduce((sum, o) => sum + amountDue(o), 0);
    
  // Bottles still owed from OTHER orders
  const bottlesFromOthers = (allOrders || [])
    .filter(o => o.id !== order.id && o.customerId === order.customerId && o.orderStatus !== "Cancelled")
    .reduce((sum, o) => {
      const delivered = (o.items || [])
        .filter(it => it.category === "Milk")
        .reduce((s, it) => s + (Number(it.qty) || 0), 0);
      const returned = Number(o.bottlesReturned) || 0;
      return sum + delivered - returned;
    }, 0);

  // Current order's bottle balance
  const currentDelivered = (order.items || [])
    .filter(it => it.category === "Milk")
    .reduce((s, it) => s + (Number(it.qty) || 0), 0);
  const currentReturned = Number(order.bottlesReturned) || 0;
  const currentBottleNet = currentDelivered - currentReturned;

  // Totals
  const totalCustomerPending = pendingFromOthers + amountDue(order);
  const totalBottlesOwed = Math.max(0, bottlesFromOthers + currentBottleNet);

  // Payment line
  const payStatus = order.paymentStatus === "Paid"
    ? "Paid ✅"
    : `${order.paymentStatus} (Due: ${fmtINR(amountDue(order))})`;

  // Optional extras
  const pendingLine = totalCustomerPending > 0 && order.paymentStatus !== "Paid"
    ? `\n\n💰 Total Pending: ${fmtINR(totalCustomerPending)}`
    : "";
  const returnedLine = currentReturned > 0
    ? `\n✅ Empty Bottles Returned: ${currentReturned}`
    : "";
  const bottlesLine = totalBottlesOwed > 0
    ? `\n🍼 Bottles to Return: ${totalBottlesOwed}`
    : "";

  const message =
    `Hi ${order.customerName}, your order has been delivered! 🥛\n\n` +
    `Items: ${items || "Dairy products"}\n` +
    `Total: ${fmtINR(order.total)}\n` +
    `Payment: ${payStatus}` +
    `${pendingLine}` +
    `${returnedLine}` +
    `${bottlesLine}\n\n` +
    `Thank you for choosing ${BUSINESS_NAME}!`;

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const win = window.open(url, "_blank");
  if (!win) window.location.href = url;
}

