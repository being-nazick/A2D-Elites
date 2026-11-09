import { Search, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { C } from "../../app/constants";
import {
  addDays,
  amountDue,
  fmtDateShort,
  monthKey,
  todayStr,
  uid,
} from "../../app/helpers";
import { Chip, SelectChip, TopBar } from "../../components/Shared";
import { Dialog } from "@capacitor/dialog";
import {
  getOrderDeliveryDate,
  getSelectableDeliveryOrders,
} from "./ordersTabUtils";


export default function OrdersTab({
  data,
  onAdd,
  onEdit,
  onDelete,
  onMarkDelivered,
  onBulkMarkDelivered,
  onStartDelivery,
  onMarkPaid,
  onRecordPayment,
  onBulkAssign,
  drivers = [],
  OrderRow,
  userSession,
}) {
  const isDelivery = userSession?.role === "delivery";
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPay, setFilterPay] = useState("All");
  const [filterProduct, setFilterProduct] = useState("All");
  const [range, setRange] = useState(isDelivery ? "today" : "all");
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [bulkDriverId, setBulkDriverId] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [paymentOrderId, setPaymentOrderId] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentNotice, setPaymentNotice] = useState(null);
  const [paymentBusy, setPaymentBusy] = useState(false);

  const submitDriverPayment = async (event, order) => {
    event.preventDefault();
    setPaymentError("");
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > amountDue(order)) {
      setPaymentError(
        `Enter an amount between ₹0.01 and ₹${amountDue(order).toFixed(2)}.`,
      );
      return;
    }

    setPaymentBusy(true);
    try {
      const result = await onRecordPayment(order.id, amount, paymentId);
      setPaymentNotice({
        orderId: order.id,
        message: result?.queued
          ? "Payment saved on this device and will sync when online."
          : "Payment recorded.",
      });
      setPaymentOrderId(null);
    } catch (error) {
      setPaymentError(error.message || "Unable to record this payment.");
    } finally {
      setPaymentBusy(false);
    }
  };

  const filtered = useMemo(() => {
    let list = [...data.orders];

    // Drivers only see orders assigned to their authenticated account.
    if (isDelivery && userSession?.deliveryBoyId) {
      list = list.filter(
        (order) =>
          String(order.deliveryBoyId || "") ===
          String(userSession.deliveryBoyId),
      );
    }
    list.sort((a, b) => {
      const aDate = isDelivery ? getOrderDeliveryDate(a) : a.orderDate;
      const bDate = isDelivery ? getOrderDeliveryDate(b) : b.orderDate;
      return (bDate + b.createdAt).localeCompare(aDate + a.createdAt);
    });

    const today = todayStr();

    if (range === "today") {
      list = list.filter(
        (order) =>
          (isDelivery ? getOrderDeliveryDate(order) : order.orderDate) ===
          today,
      );
    }

    if (range === "7d") {
      list = list.filter((order) => {
        const orderDate = isDelivery
          ? getOrderDeliveryDate(order)
          : order.orderDate;
        return orderDate >= addDays(today, -6) && orderDate <= today;
      });
    }

    if (range === "month") {
      list = list.filter(
        (order) =>
          monthKey(isDelivery ? getOrderDeliveryDate(order) : order.orderDate) ===
          monthKey(today),
      );
    }

    if (filterStatus !== "All") {
      list = list.filter((order) => order.orderStatus === filterStatus);
    }

    if (filterPay !== "All") {
      list = list.filter((order) => order.paymentStatus === filterPay);
    }

    if (filterProduct !== "All") {
      list = list.filter((order) =>
        order.items.some((item) => item.category === filterProduct),
      );
    }

    if (query.trim()) {
      const search = query.toLowerCase();

      list = list.filter(
        (order) =>
          (order.customerName || "").toLowerCase().includes(search) ||
          (order.phone || "").includes(search),
      );
    }

    return list;
  }, [data.orders, query, filterStatus, filterPay, filterProduct, range, isDelivery, userSession]);

  // -----------------------------
  // Bulk selection
  // -----------------------------

  const selectableOrders = getSelectableDeliveryOrders(
    filtered,
    isDelivery,
    userSession?.deliveryBoyId,
  );
  const selectedOrders = selectableOrders.filter((order) =>
    selectedOrderIds.includes(order.id),
  );
  const unpaidSelectedOrders = isDelivery
    ? []
    : selectedOrders.filter((order) => order.paymentStatus !== "Paid");

  const toggleOrderSelection = (orderId) => {
    setBulkError("");
    setSelectedOrderIds((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId],
    );
  };

  const selectAllEligible = () => {
    setSelectedOrderIds(selectableOrders.map((order) => order.id));
  };

  const clearSelection = () => {
    setSelectedOrderIds([]);
    setBulkError("");
  };

  const allEligibleSelected =
    selectableOrders.length > 0 &&
    selectableOrders.every((order) => selectedOrderIds.includes(order.id));

  const handleSelectAll = () => {
    if (allEligibleSelected) {
      clearSelection();
    } else {
      selectAllEligible();
    }
  };

  const handleBulkMarkPaid = () => {
    unpaidSelectedOrders.forEach((order) => {
      const { id } = order;
      onMarkPaid(id);
    });
    clearSelection();
  };

  const handleBulkMarkDelivered = async () => {
    if (selectedOrders.length === 0) return;

    try {
      const { value } = await Dialog.confirm({
        title: "Mark selected orders delivered?",
        message: `This will mark ${selectedOrders.length} order(s) delivered and record the delivery time. Payment, returned bottles, and customer balances will not change.`,
        okButtonTitle: "Mark Delivered",
        cancelButtonTitle: "Cancel",
      });

      if (!value) return;
      await onBulkMarkDelivered(selectedOrders.map((order) => order.id));
      clearSelection();
    } catch (error) {
      console.error("Bulk delivery update failed:", error);
      setBulkError(error.message || "Unable to mark the selected orders delivered.");
    }
  };

  const handleBulkAssign = async () => {
    const driver =
      drivers.find((item) => String(item.id) === String(bulkDriverId)) ||
      (userSession?.role === "owner" &&
      String(userSession.id) === String(bulkDriverId)
        ? { id: userSession.id, name: userSession.name || "Owner" }
        : null);
    if (!driver || !onBulkAssign || selectedOrders.length === 0) return;

    try {
      const { value } = await Dialog.confirm({
        title: "Assign selected orders?",
        message: `Assign ${selectedOrders.length} order(s) to ${driver.name}?`,
        okButtonTitle: "Assign",
        cancelButtonTitle: "Cancel",
      });
      if (!value) return;
      await onBulkAssign(
        selectedOrders.map((order) => order.id),
        driver.id,
      );
      setBulkDriverId("");
      clearSelection();
    } catch (error) {
      console.error("Bulk order assignment failed:", error);
      setBulkError(error.message || "Unable to assign the selected orders.");
    }
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      <TopBar
        title={isDelivery ? "Deliveries" : "Orders"}
        subtitle={`${filtered.length} ${isDelivery ? "delivery" : "order"}${filtered.length !== 1 ? "s" : ""}`}
        right={
          !isDelivery && (
            <button
              className="tap"
              onClick={onAdd}
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
              <Plus size={15} />
              New
            </button>
          )
        }
      />

      {/* Search + Filters */}
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
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedOrderIds([]);
              setBulkError("");
            }}
            placeholder="Search customer or phone"
            style={{
              width: "100%",
              padding: "10px 12px 10px 34px",
              borderRadius: 12,
              border: `1px solid ${C.paperLine}`,
              fontSize: 13.5,
              background: C.paper,
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>

        {/* Date filters */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 8,
            overflowX: "auto",
            paddingBottom: 2,
          }}
        >
          {["all", "today", "7d", "month"].map((value) => (
            <Chip
              key={value}
              active={range === value}
              onClick={() => {
                setRange(value);
                setSelectedOrderIds([]);
                setBulkError("");
              }}
              label={
                {
                  all: "All time",
                  today: "Today",
                  "7d": "Last 7 days",
                  month: "This month",
                }[value]
              }
            />
          ))}
        </div>

        {/* Status filters */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 6,
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          <SelectChip
            value={filterStatus}
            onChange={(value) => {
              setFilterStatus(value);
              setSelectedOrderIds([]);
              setBulkError("");
            }}
            options={[
              "All",
              "Pending",
              "Out for Delivery",
              "Delivered",
              "Cancelled",
            ]}
          />

          <SelectChip
            value={filterPay}
            onChange={(value) => {
              setFilterPay(value);
              setSelectedOrderIds([]);
              setBulkError("");
            }}
            options={["All", "Paid", "Pending", "Partial"]}
          />

          <SelectChip
            value={filterProduct}
            onChange={(value) => {
              setFilterProduct(value);
              setSelectedOrderIds([]);
              setBulkError("");
            }}
            options={["All", "Milk", "Paneer", "Curd"]}
          />
        </div>

        {/* Select all */}
        {selectableOrders.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 4,
            }}
          >
            <button
              type="button"
              className="tap"
              onClick={handleSelectAll}
              style={{
                border: "none",
                background: "transparent",
                color: C.primary,
                fontWeight: 700,
                fontSize: 12,
                padding: "7px 0",
              }}
            >
              {allEligibleSelected ? "Deselect all" : "Select all eligible"}
            </button>

            {selectedOrderIds.length > 0 && (
              <button
                type="button"
                className="tap"
                onClick={clearSelection}
                style={{
                  border: "none",
                  background: "transparent",
                  color: C.inkMute,
                  fontSize: 12,
                  padding: "7px 0",
                }}
              >
                Clear selection
              </button>
            )}
          </div>
        )}
        {bulkError && (
          <div
            role="alert"
            style={{
              color: C.brick,
              fontSize: 12,
              padding: "4px 0",
            }}
          >
            {bulkError}
          </div>
        )}
      </div>

      {/* Orders */}
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
            No orders match your filters.
          </div>
        )}

        {filtered.map((order) => {
          const canSelect = selectableOrders.some(
            (selectableOrder) => selectableOrder.id === order.id,
          );

          const isSelected = selectedOrderIds.includes(order.id);

          return (
            <div key={order.id}>
              {/* Date */}
              <div
                style={{
                  fontSize: 10.5,
                  color: C.inkMute,
                  marginBottom: 3,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {fmtDateShort(
                  isDelivery ? getOrderDeliveryDate(order) : order.orderDate,
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                {/* Checkbox */}
                {canSelect ? (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOrderSelection(order.id)}
                    aria-label={`Select order ${order.id}`}
                    style={{
                      width: 18,
                      height: 18,
                      marginTop: 14,
                      flexShrink: 0,
                      accentColor: C.primary,
                      cursor: "pointer",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 18,
                      flexShrink: 0,
                    }}
                  />
                )}

                {/* Order */}
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <OrderRow
                    order={order}
                    actions={{
                      markDelivered: onMarkDelivered,
                      markOutForDelivery: onStartDelivery,
                      markPaid: onMarkPaid,
                      edit: onEdit,
                      del: onDelete,
                      isDelivery,
                      deliveryBoyId: userSession?.deliveryBoyId,
                      recordPayment: onRecordPayment
                        ? () => {
                            setPaymentOrderId(order.id);
                            setPaymentAmount(amountDue(order).toFixed(2));
                            setPaymentId(uid("pay"));
                            setPaymentError("");
                            setPaymentNotice(null);
                          }
                        : undefined,
                    }}
                    data={data}
                  />
                </div>
              </div>
              {paymentOrderId === order.id && (
                <form
                  onSubmit={(event) => submitDriverPayment(event, order)}
                  style={{
                    margin: "8px 0 0 26px",
                    padding: 12,
                    background: C.paper,
                    border: `1px solid ${C.paperLine}`,
                    borderRadius: 12,
                  }}
                >
                  <label
                    htmlFor={`payment-amount-${order.id}`}
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 700,
                      color: C.inkMute,
                      marginBottom: 6,
                    }}
                  >
                    Amount collected on this visit (₹{amountDue(order).toFixed(2)} due)
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      id={`payment-amount-${order.id}`}
                      aria-label="Amount collected"
                      type="number"
                      min="0.01"
                      max={amountDue(order).toFixed(2)}
                      step="0.01"
                      required
                      value={paymentAmount}
                      onChange={(event) => setPaymentAmount(event.target.value)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: "9px 10px",
                        border: `1px solid ${C.paperLine}`,
                        borderRadius: 9,
                        fontSize: 14,
                      }}
                    />
                    <button
                      type="submit"
                      className="tap"
                      disabled={paymentBusy}
                      style={primaryActionStyle}
                    >
                      {paymentBusy ? "Saving…" : "Record"}
                    </button>
                    <button
                      type="button"
                      className="tap"
                      disabled={paymentBusy}
                      onClick={() => setPaymentOrderId(null)}
                      style={secondaryActionStyle}
                    >
                      Cancel
                    </button>
                  </div>
                  {paymentError && (
                    <div role="alert" style={paymentErrorStyle}>
                      {paymentError}
                    </div>
                  )}
                </form>
              )}
              {paymentNotice?.orderId === order.id && (
                <div role="status" style={paymentNoticeStyle}>
                  {paymentNotice.message}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {selectedOrders.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 76,
            left: "50%",
            transform: "translateX(-50%)",
            width: "calc(100% - 32px)",
            maxWidth: 448,
            background: C.primaryDark,
            color: "#fff",
            borderRadius: 16,
            padding: "10px 12px 10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            boxShadow: "0 8px 24px rgba(18,53,48,0.30)",
            zIndex: 50,
            boxSizing: "border-box",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {selectedOrders.length} selected
            </div>

            <div
              style={{
                fontSize: 10.5,
                opacity: 0.7,
                marginTop: 2,
              }}
            >
              {isDelivery
                ? "Delivery status and payment"
                : "Assignment, payment, delivery"}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            {!isDelivery && unpaidSelectedOrders.length > 0 && (
              <button
                type="button"
                className="tap"
                onClick={handleBulkMarkPaid}
                style={{
                  border: "none",
                  background: "#fff",
                  color: C.primaryDark,
                  borderRadius: 11,
                  padding: "10px 12px",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                ✓ Mark {unpaidSelectedOrders.length} paid
              </button>
            )}
            {!isDelivery &&
              onBulkAssign &&
              (drivers.length > 0 ||
                (userSession?.role === "owner" && userSession?.id)) && (
              <div style={{ display: "flex", gap: 6 }}>
                <select
                  aria-label="Assign selected orders to driver"
                  value={bulkDriverId}
                  onChange={(event) => setBulkDriverId(event.target.value)}
                  style={{
                    maxWidth: 140,
                    border: "none",
                    borderRadius: 10,
                    padding: "8px",
                    fontSize: 11,
                  }}
                >
                  <option value="">Assign driver…</option>
                  {userSession?.role === "owner" && userSession?.id && (
                    <option value={userSession.id}>
                      Assign to owner (you)
                    </option>
                  )}
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="tap"
                  onClick={handleBulkAssign}
                  disabled={!bulkDriverId}
                  style={{
                    border: "none",
                    background: "#fff",
                    color: C.primaryDark,
                    borderRadius: 10,
                    padding: "8px 10px",
                    fontWeight: 700,
                    fontSize: 11,
                    opacity: bulkDriverId ? 1 : 0.55,
                  }}
                >
                  Assign
                </button>
              </div>
            )}
            <button
              type="button"
              className="tap"
              onClick={handleBulkMarkDelivered}
              style={{
                border: "none",
                background: "#fff",
                color: C.primaryDark,
                borderRadius: 11,
                padding: "10px 12px",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              ✓ Mark Delivered
            </button>
          </div>
        </div>
      )}

      <div style={{ height: 12 }} />
    </div>
  );
}

const primaryActionStyle = {
  border: "none",
  background: C.primary,
  color: "#fff",
  borderRadius: 9,
  padding: "9px 12px",
  fontWeight: 700,
  fontSize: 12,
};

const secondaryActionStyle = {
  border: `1px solid ${C.paperLine}`,
  background: C.paper,
  color: C.inkMute,
  borderRadius: 9,
  padding: "9px 10px",
  fontWeight: 700,
  fontSize: 12,
};

const paymentErrorStyle = { color: C.brick, fontSize: 12, marginTop: 8 };
const paymentNoticeStyle = { color: C.primaryDark, fontSize: 12, margin: "6px 0 0 26px" };
