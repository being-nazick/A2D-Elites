import { Search, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { C } from "../../app/constants";
import { addDays, fmtDateShort, monthKey, todayStr } from "../../app/helpers";
import { Chip, SelectChip, TopBar } from "../../components/Shared";

export default function OrdersTab({ data, onAdd, onEdit, onDelete, onMarkDelivered, onMarkPaid, OrderRow, allData }) {
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPay, setFilterPay] = useState("All");
  const [filterProduct, setFilterProduct] = useState("All");
  const [range, setRange] = useState("all");
  const filtered = useMemo(() => {
    let list = [...data.orders].sort((a, b) => (b.orderDate + b.createdAt).localeCompare(a.orderDate + a.createdAt));
    const today = todayStr();
    if (range === "today") list = list.filter((order) => order.orderDate === today);
    if (range === "7d") list = list.filter((order) => order.orderDate >= addDays(today, -6));
    if (range === "month") list = list.filter((order) => monthKey(order.orderDate) === monthKey(today));
    if (filterStatus !== "All") list = list.filter((order) => order.orderStatus === filterStatus);
    if (filterPay !== "All") list = list.filter((order) => order.paymentStatus === filterPay);
    if (filterProduct !== "All") list = list.filter((order) => order.items.some((item) => item.category === filterProduct));
    if (query.trim()) { const search = query.toLowerCase(); list = list.filter((order) => order.customerName.toLowerCase().includes(search) || (order.phone || "").includes(search)); }
    return list;
  }, [data.orders, query, filterStatus, filterPay, filterProduct, range]);
  return <div>
    <TopBar title="Orders" subtitle={`${filtered.length} order${filtered.length !== 1 ? "s" : ""}`} right={<button className="tap" onClick={onAdd} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 12, padding: "9px 13px", display: "flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 12.5 }}><Plus size={15} /> New</button>} />
    <div style={{ padding: "0 16px" }}><div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 12, top: 11, color: C.inkMute }} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer or phone" style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 12, border: `1px solid ${C.paperLine}`, fontSize: 13.5, background: C.paper }} /></div><div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", paddingBottom: 2 }}>{["all", "today", "7d", "month"].map((value) => <Chip key={value} active={range === value} onClick={() => setRange(value)} label={{ all: "All time", today: "Today", "7d": "Last 7 days", month: "This month" }[value]} />)}</div><div style={{ display: "flex", gap: 6, marginTop: 6, overflowX: "auto", paddingBottom: 4 }}><SelectChip value={filterStatus} onChange={setFilterStatus} options={["All", "Pending", "Delivered", "Cancelled"]} /><SelectChip value={filterPay} onChange={setFilterPay} options={["All", "Paid", "Pending", "Partial"]} /><SelectChip value={filterProduct} onChange={setFilterProduct} options={["All", "Milk", "Paneer", "Curd"]} /></div></div>
    <div style={{ padding: "10px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>{filtered.length === 0 && <div style={{ textAlign: "center", color: C.inkMute, fontSize: 13, padding: "30px 0" }}>No orders match your filters.</div>}{filtered.map((order) => <div key={order.id}><div style={{ fontSize: 10.5, color: C.inkMute, marginBottom: 3, fontFamily: "'JetBrains Mono',monospace" }}>{fmtDateShort(order.orderDate)}</div><OrderRow order={order} actions={{ markDelivered: onMarkDelivered, markPaid: onMarkPaid, edit: onEdit, del: onDelete }} data={allData} /></div>)}</div><div style={{ height: 12 }} />
  </div>;
}

