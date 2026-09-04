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

export function openDeliveryWhatsApp(order) {
  if (!order) return;
  const digits = String(order.phone || "").replace(/\D/g, "");
  if (!digits) return;
  const cleanDigits = digits.replace(/^0+/, "");
  const phone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
  const items = (order.items || []).map((item) => `${item.qty} × ${item.productName}`).join(", ");
  const due = amountDue(order);
  const payStatus = order.paymentStatus === "Paid" ? "Paid ✅" : `${order.paymentStatus} (Due: ${fmtINR(due)})`;
  const bottleText = order.bottlesReturned > 0 ? `\nEmpty Bottles Returned: ${order.bottlesReturned}` : "";
  const message = `Hi ${order.customerName || "there"}, your order has been delivered! 🥛\n\nItems: ${items || "Dairy products"}\nTotal: ${fmtINR(order.total)}\nPayment: ${payStatus}${bottleText}\n\nThank you for choosing ${BUSINESS_NAME}!`;
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const win = window.open(url, "_blank");
  if (!win) window.location.href = url;
}
