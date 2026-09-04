import { ArrowLeft, BarChart3, ClipboardList, Download, MoreHorizontal, Package, Users, X } from "lucide-react";
import { C, BUSINESS_NAME, BUSINESS_TAGLINE } from "../app/constants";
import { iconFor } from "../app/helpers";

export const navBtnStyle = { width: 30, height: 30, borderRadius: 10, border: `1px solid ${C.paperLine}`, background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", color: C.ink };
export const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.paperLine}`, fontSize: 14, background: C.paper };

export function AppHeader({ logo }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 0" }}>
    {logo && <img src={logo} alt={BUSINESS_NAME} style={{ width: 34, height: 34, borderRadius: 9, background: "#000", flexShrink: 0 }} />}
    <div style={{ lineHeight: 1.1 }}><div style={{ fontFamily: "'Fraunces',serif", fontSize: 15.5, fontWeight: 700, color: C.primaryDark, letterSpacing: 0.2 }}>{BUSINESS_NAME}</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: C.inkMute, letterSpacing: 1.2, textTransform: "uppercase" }}>{BUSINESS_TAGLINE}</div></div>
  </div>;
}

export function BottomNav({ tab, setTab, badge }) {
  const items = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "orders", label: "Orders", icon: Package },
    { id: "customers", label: "Customers", icon: Users },
    { id: "reports", label: "Reports", icon: ClipboardList },
    { id: "more", label: "More", icon: MoreHorizontal },
  ];
  return <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.paper, borderTop: `1px solid ${C.paperLine}`, boxShadow: "0 -4px 16px rgba(30,20,10,0.06)", zIndex: 40 }}><div style={{ maxWidth: 480, margin: "0 auto", display: "flex" }}>{items.map((item) => { const active = tab === item.id; const Icon = item.icon; return <button key={item.id} className="tap" onClick={() => setTab(item.id)} style={{ flex: 1, border: "none", background: "transparent", padding: "10px 4px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative", color: active ? C.primary : C.inkMute }}><Icon size={20} strokeWidth={active ? 2.4 : 1.9} /><span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500 }}>{item.label}</span>{item.id === "orders" && badge > 0 && <span style={{ position: "absolute", top: 4, right: "28%", background: C.brick, color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 20, padding: "1px 5px", minWidth: 14, textAlign: "center" }}>{badge}</span>}</button>; })}</div></div>;
}

export function TopBar({ title, subtitle, right }) {
  return <div style={{ padding: "12px 16px" }}><div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}><div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 600, color: C.primaryDark }}>{title}</div>{subtitle && <div style={{ fontSize: 12.5, color: C.inkMute, marginTop: 2 }}>{subtitle}</div>}</div>{right}</div></div>;
}

export function StatusPill({ status, kind }) {
  const map = { order: { Pending: [C.gold, C.goldSoft], Delivered: [C.green, C.greenSoft], Cancelled: [C.inkMute, C.cream] }, pay: { Pending: [C.brick, C.brickSoft], Paid: [C.green, C.greenSoft], Partial: [C.gold, C.goldSoft] } };
  const [color, background] = (map[kind] || map.order)[status] || [C.inkMute, C.cream];
  return <span style={{ fontSize: 11, fontWeight: 700, color, background, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>{status}</span>;
}

export function QtyLine({ items }) { return <div style={{ fontSize: 13, color: C.ink, marginTop: 2 }}>{items.map((item, index) => <span key={index}>{iconFor(item.category)} {item.qty} × {item.productName}{index < items.length - 1 ? " + " : ""}</span>)}</div>; }
export function ActionBtn({ onClick, icon: Icon, label, tone, toneSoft }) { return <button className="tap" onClick={onClick} style={{ border: "none", background: toneSoft, color: tone, borderRadius: 10, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><Icon size={12.5} /> {label}</button>; }
export function Chip({ active, onClick, label }) { return <button className="tap" onClick={onClick} style={{ border: `1px solid ${active ? C.primary : C.paperLine}`, background: active ? C.primary : C.paper, color: active ? "#fff" : C.ink, borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{label}</button>; }
export function SelectChip({ value, onChange, options }) { return <select value={value} onChange={(event) => onChange(event.target.value)} style={{ border: `1px solid ${value !== "All" ? C.primary : C.paperLine}`, borderRadius: 20, padding: "6px 10px", fontSize: 12, fontWeight: 600, background: value !== "All" ? C.primarySoft : C.paper, color: C.ink }}>{options.map((option) => <option key={option} value={option}>{option === "All" ? "Any status" : option}</option>)}</select>; }
export function MiniStat({ label, value, tone }) { return <div style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 12, padding: "10px 12px" }}><div style={{ fontSize: 10.5, color: C.inkMute, fontWeight: 600 }}>{label}</div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 600, color: tone || C.ink }}>{value}</div></div>; }
export function ExportBtn({ label, onClick }) { return <button className="tap" onClick={onClick} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 600 }}>{label} <Download size={15} color={C.inkMute} /></button>; }
export function NoteCard({ icon: Icon, tone, toneSoft, title, desc }) { return <div style={{ background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 14, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}><div style={{ width: 34, height: 34, borderRadius: 10, background: toneSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={16} color={tone} /></div><div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{title}</div><div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>{desc}</div></div></div>; }
export function ModalShell({ title, onClose, children, footer }) { return <div style={{ position: "fixed", inset: 0, background: "rgba(20,15,10,0.45)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}><div style={{ background: C.bg, width: "100%", maxWidth: 480, maxHeight: "92vh", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px", borderBottom: `1px solid ${C.paperLine}`, background: C.paper }}><div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 600 }}>{title}</div><button className="tap" onClick={onClose} style={{ border: "none", background: C.cream, borderRadius: 10, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button></div><div style={{ overflowY: "auto", padding: 16, flex: 1 }}>{children}</div>{footer && <div style={{ padding: 16, borderTop: `1px solid ${C.paperLine}`, background: C.paper }}>{footer}</div>}</div></div>; }
export function Field({ label, children }) { return <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11.5, fontWeight: 700, color: C.inkMute, marginBottom: 5 }}>{label}</div>{children}</div>; }
export function BackButton({ onClick }) { return <button className="tap" onClick={onClick} style={navBtnStyle}><ArrowLeft size={16} /></button>; }
