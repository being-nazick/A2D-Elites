import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  MapPin,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { DatetimePicker } from "@capawesome-team/capacitor-datetime-picker";
import { C } from "../../app/constants";
import {
  addDays,
  amountDue,
  fmtINR,
  iconFor,
  monthKey,
  todayStr,
  hasCoordinates,
} from "../../app/helpers";

import { TopBar } from "../../components/Shared";
import { Geolocation } from "@capacitor/geolocation";
import { useEffect, useState } from "react";

export default function Dashboard({
  data,
  selectedDate,
  setSelectedDate,
  onAddOrder,
  onQuickAction,
  onOpenCustomer,
  OrderRow,
  navBtnStyle,
}) {
  const isToday = selectedDate === todayStr();
  const [myLocation, setMyLocation] = useState(null);

  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    async function getMyLocation() {
      setLocationLoading(true);

      try {
        let position;

        if (Capacitor.isNativePlatform()) {
          // Android / iOS
          const permission = await Geolocation.requestPermissions();

          if (
            permission.location !== "granted" &&
            permission.location !== "limited"
          ) {
            console.warn("Location permission denied");
            return;
          }

          position = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        } else {
          // Chrome / Web
          position = await new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
              reject(new Error("Browser does not support geolocation"));
              return;
            }

            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0,
            });
          });
        }

        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        setMyLocation(location);

        console.log("MY LOCATION:", location);
      } catch (error) {
        console.error("Could not get delivery person's location:", error);
      } finally {
        setLocationLoading(false);
      }
    }

    getMyLocation();
  }, []);

  function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;

    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
  // Native Capacitor date picker
  const openDatePicker = async () => {
    try {
      const [year, month, day] = selectedDate.split("-").map(Number);

      const currentDate = new Date(year, month - 1, day);

      const { value } = await DatetimePicker.present({
        mode: "date",
        value: currentDate.toISOString(),
        locale: "en-IN",
        theme: "auto",
        cancelButtonText: "Cancel",
        doneButtonText: "Done",
      });

      if (value) {
        const pickedDate = new Date(value);

        const yyyy = pickedDate.getFullYear();
        const mm = String(pickedDate.getMonth() + 1).padStart(2, "0");
        const dd = String(pickedDate.getDate()).padStart(2, "0");

        setSelectedDate(`${yyyy}-${mm}-${dd}`);
      }
    } catch (error) {
      console.error("Date picker error:", error);
    }
  };

  const dayOrders = data.orders.filter(
    (order) => order.orderDate === selectedDate,
  );

  const active = dayOrders.filter((order) => order.orderStatus !== "Cancelled");

  const totalSales = active.reduce((sum, order) => sum + order.total, 0);

  console.log(
    "CUSTOMERS:",
    data.customers.map((customer) => ({
      name: customer.name,
      latitude: customer.latitude,
      longitude: customer.longitude,
    })),
  );

  const pendingOrders = dayOrders
    .filter((order) => order.orderStatus === "Pending")
    .map((order) => {
      const customer = data.customers.find(
        (customer) => customer.id === order.customerId,
      );

      let distanceKm = null;

      if (
        myLocation &&
        customer &&
        hasCoordinates({
          latitude: customer.latitude,
          longitude: customer.longitude,
        })
      ) {
        distanceKm = getDistanceKm(
          myLocation.latitude,
          myLocation.longitude,
          Number(customer.latitude),
          Number(customer.longitude),
        );
      }

      return {
        ...order,
        distanceKm,
      };
    })
    .sort((a, b) => {
      // Customers without GPS go to the bottom
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;

      return a.distanceKm - b.distanceKm;
    });

  const deliveredOrders = dayOrders.filter(
    (order) => order.orderStatus === "Delivered",
  );

  const pendingPayAmt = active.reduce(
    (sum, order) => sum + amountDue(order),
    0,
  );

  const productTotals = {
    Milk: 0,
    Paneer: 0,
    Curd: 0,
  };

  active.forEach((order) =>
    order.items.forEach((item) => {
      productTotals[item.category] =
        (productTotals[item.category] || 0) + Number(item.qty);
    }),
  );

  const totalMilkQty = active.reduce(
    (sum, order) =>
      sum +
      order.items
        .filter((item) => item.category === "Milk")
        .reduce((itemSum, item) => itemSum + (Number(item.qty) || 0), 0),
    0,
  );

  const totalReturned = active.reduce(
    (sum, order) => sum + (Number(order.bottlesReturned) || 0),
    0,
  );

  const totalBottlesToCollect = Math.max(0, totalMilkQty - totalReturned);

  const mk = monthKey(selectedDate);

  const monthOrders = data.orders.filter(
    (order) =>
      monthKey(order.orderDate) === mk && order.orderStatus !== "Cancelled",
  );

  const monthSales = monthOrders.reduce((sum, order) => sum + order.total, 0);

  const cards = [
    {
      label: "Total Sales",
      value: fmtINR(totalSales),
      icon: "💰",
      fg: C.primary,
      bg: C.primarySoft,
    },
    {
      label: "Bottles to Collect",
      value: totalBottlesToCollect,
      icon: "🍼",
      fg: C.gold,
      bg: C.goldSoft,
    },
    {
      label: "Pending",
      value: pendingOrders.length,
      icon: "⏳",
      fg: C.brick,
      bg: C.brickSoft,
    },
    {
      label: "Delivered",
      value: deliveredOrders.length,
      icon: "✅",
      fg: C.green,
      bg: C.greenSoft,
    },
  ];

  return (
    <div>
      <TopBar
        title={isToday ? "Good day 👋" : "Business Day"}
        subtitle={new Date(selectedDate + "T00:00:00").toLocaleDateString(
          "en-IN",
          {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          },
        )}
        right={
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            {/* Previous day */}
            <button
              type="button"
              className="tap"
              onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              style={navBtnStyle}
            >
              <ChevronLeft size={16} />
            </button>

            {/* Native Capacitor date picker */}
            <button
              type="button"
              className="tap"
              onClick={openDatePicker}
              style={{
                ...navBtnStyle,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Select date"
            >
              <Calendar size={16} />
            </button>

            {/* Next day */}
            <button
              type="button"
              className="tap"
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              style={navBtnStyle}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        }
      />

      {/* Business summary */}
      <div
        style={{
          margin: "0 16px 14px",
          background: C.primary,
          borderRadius: 16,
          padding: "18px 18px 14px",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 90% -10%, rgba(255,255,255,0.10), transparent 55%)",
          }}
        />

        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            opacity: 0.75,
            fontFamily: "'JetBrains Mono',monospace",
          }}
        >
          Today's Business
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            marginTop: 4,
          }}
        >
          <div
            style={{
              fontFamily: "'Fraunces',serif",
              fontSize: 36,
              fontWeight: 600,
            }}
          >
            {fmtINR(totalSales)}
          </div>

          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {dayOrders.length} orders
          </div>
        </div>

        <div
          style={{
            borderTop: "1px dashed rgba(255,255,255,0.35)",
            margin: "12px 0 10px",
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 13,
          }}
        >
          {["Milk", "Paneer", "Curd"].map((product) => (
            <div key={product} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18 }}>{iconFor(product)}</div>

              <div style={{ fontWeight: 700 }}>
                {productTotals[product] || 0}
              </div>

              <div
                style={{
                  fontSize: 10,
                  opacity: 0.7,
                }}
              >
                units sold
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          padding: "0 16px",
        }}
      >
        {cards.map((card) => (
          <div
            key={card.label}
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
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: C.inkMute,
                  fontWeight: 600,
                }}
              >
                {card.label}
              </span>

              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 20,
                  background: card.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                }}
              >
                {card.icon}
              </span>
            </div>

            <div
              style={{
                fontFamily: "'Fraunces',serif",
                fontSize: 22,
                fontWeight: 600,
                color: card.fg,
                marginTop: 4,
              }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Payment / month sales */}
      <div
        style={{
          display: "flex",
          gap: 10,
          padding: "12px 16px 4px",
        }}
      >
        <div
          style={{
            flex: 1,
            background: C.brickSoft,
            borderRadius: 14,
            padding: "12px 14px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: C.brick,
              fontWeight: 700,
            }}
          >
            💵 Pending Payment
          </div>

          <div
            style={{
              fontFamily: "'Fraunces',serif",
              fontSize: 20,
              fontWeight: 600,
              color: C.brick,
            }}
          >
            {fmtINR(pendingPayAmt)}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            background: C.goldSoft,
            borderRadius: 14,
            padding: "12px 14px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: C.gold,
              fontWeight: 700,
            }}
          >
            📊 Month Sales
          </div>

          <div
            style={{
              fontFamily: "'Fraunces',serif",
              fontSize: 20,
              fontWeight: 600,
              color: C.gold,
            }}
          >
            {fmtINR(monthSales)}
          </div>

          <div
            style={{
              fontSize: 10,
              color: C.inkMute,
            }}
          >
            {monthOrders.length} orders
          </div>
        </div>
      </div>

      {/* Pending orders */}
      <div
        style={{
          padding: "16px 16px 4px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          Pending Orders
        </div>

        <span
          style={{
            fontSize: 12,
            color: C.inkMute,
          }}
        >
          {pendingOrders.length} waiting
        </span>
      </div>

      <div
        style={{
          padding: "6px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {locationLoading ? (
          <div
            style={{
              textAlign: "center",
              color: C.inkMute,
              fontSize: 13,
              padding: "18px 0",
            }}
          >
            📍 Getting your location...
          </div>
        ) : pendingOrders.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: C.inkMute,
              fontSize: 13,
              padding: "18px 0",
            }}
          >
            Nothing pending — everything's delivered. 🎉
          </div>
        ) : (
          pendingOrders.map((order) => (
            <div key={order.id}>
              {order.distanceKm !== null && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    color: C.primary,
                    fontWeight: 700,
                    margin: "2px 4px 3px",
                  }}
                >
                  <MapPin size={12} />
                  {order.distanceKm < 1
                    ? `${Math.round(order.distanceKm * 1000)} m away`
                    : `${order.distanceKm.toFixed(1)} km away`}
                </div>
              )}

              {order.distanceKm === null && (
                <div
                  style={{
                    fontSize: 10.5,
                    color: C.inkMute,
                    margin: "2px 4px 3px",
                  }}
                >
                  📍 Location not available
                </div>
              )}

              <OrderRow
                order={order}
                onOpenCustomer={onOpenCustomer}
                actions={onQuickAction}
                data={data}
              />
            </div>
          ))
        )}{" "}
      </div>

      <div style={{ height: 20 }} />

      {/* Add Order */}
      <button
        className="tap"
        onClick={onAddOrder}
        style={{
          position: "fixed",
          bottom: 96,
          right: "50%",
          transform: "translateX(190px)",
          background: C.primary,
          color: "#fff",
          border: "none",
          borderRadius: 30,
          padding: "13px 20px",
          fontWeight: 700,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          gap: 6,
          boxShadow: "0 8px 20px rgba(18,53,48,0.35)",
          zIndex: 30,
        }}
      >
        <Plus size={18} />
        Add Order
      </button>
    </div>
  );
}
