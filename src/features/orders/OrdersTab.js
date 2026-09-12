import { Search, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { C } from "../../app/constants";
import { addDays, fmtDateShort, monthKey, todayStr } from "../../app/helpers";
import { Chip, SelectChip, TopBar } from "../../components/Shared";

export default function OrdersTab({
  data,
  onAdd,
  onEdit,
  onDelete,
  onMarkDelivered,
  onMarkPaid,
  OrderRow,
}) {
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPay, setFilterPay] = useState("All");
  const [filterProduct, setFilterProduct] = useState("All");
  const [range, setRange] = useState("all");
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);

  const filtered = useMemo(() => {
    let list = [...data.orders].sort((a, b) =>
      (b.orderDate + b.createdAt).localeCompare(a.orderDate + a.createdAt),
    );

    const today = todayStr();

    if (range === "today") {
      list = list.filter((order) => order.orderDate === today);
    }

    if (range === "7d") {
      list = list.filter((order) => order.orderDate >= addDays(today, -6));
    }

    if (range === "month") {
      list = list.filter(
        (order) => monthKey(order.orderDate) === monthKey(today),
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
  }, [data.orders, query, filterStatus, filterPay, filterProduct, range]);

  // -----------------------------
  // Bulk selection
  // -----------------------------

  const selectableOrders = filtered.filter(
    (order) =>
      order.paymentStatus !== "Paid" && order.orderStatus !== "Cancelled",
  );

  const toggleOrderSelection = (orderId) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId],
    );
  };

  const selectAllUnpaid = () => {
    const unpaidIds = selectableOrders.map((order) => order.id);

    setSelectedOrderIds(unpaidIds);
  };

  const clearSelection = () => {
    setSelectedOrderIds([]);
  };

  const allUnpaidSelected =
    selectableOrders.length > 0 &&
    selectableOrders.every((order) => selectedOrderIds.includes(order.id));

  const handleSelectAll = () => {
    if (allUnpaidSelected) {
      clearSelection();
    } else {
      selectAllUnpaid();
    }
  };

  const handleBulkMarkPaid = () => {
    selectedOrderIds.forEach((id) => {
      onMarkPaid(id);
    });

    setSelectedOrderIds([]);
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      <TopBar
        title="Orders"
        subtitle={`${filtered.length} order${filtered.length !== 1 ? "s" : ""}`}
        right={
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
            onChange={(event) => setQuery(event.target.value)}
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
            }}
            options={["All", "Pending", "Delivered", "Cancelled"]}
          />

          <SelectChip
            value={filterPay}
            onChange={(value) => {
              setFilterPay(value);
              setSelectedOrderIds([]);
            }}
            options={["All", "Paid", "Pending", "Partial"]}
          />

          <SelectChip
            value={filterProduct}
            onChange={(value) => {
              setFilterProduct(value);
              setSelectedOrderIds([]);
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
              {allUnpaidSelected ? "Deselect all" : "Select all unpaid"}
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
          const canSelect =
            order.paymentStatus !== "Paid" && order.orderStatus !== "Cancelled";

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
                {fmtDateShort(order.orderDate)}
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
                    aria-label={`Select ${order.customerName}`}
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
                      markPaid: onMarkPaid,
                      edit: onEdit,
                      del: onDelete,
                    }}
                    data={data}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {selectedOrderIds.length > 0 && (
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
              {selectedOrderIds.length} selected
            </div>

            <div
              style={{
                fontSize: 10.5,
                opacity: 0.7,
                marginTop: 2,
              }}
            >
              Unpaid orders
            </div>
          </div>

          <button
            type="button"
            className="tap"
            onClick={handleBulkMarkPaid}
            style={{
              border: "none",
              background: "#fff",
              color: C.primaryDark,
              borderRadius: 11,
              padding: "10px 14px",
              fontWeight: 700,
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            ✓ Mark Paid
          </button>
        </div>
      )}

      <div style={{ height: 12 }} />
    </div>
  );
}
