import React, { useState } from "react";
import logoIcon from "../assets/logo.png";
import { C, BUSINESS_NAME, BUSINESS_TAGLINE, DEFAULT_DELIVERY_BOYS } from "../app/constants";
import { Truck, ShieldCheck, ArrowRight } from "lucide-react";

export default function LoginScreen({ onLogin, deliveryBoys = DEFAULT_DELIVERY_BOYS }) {
  const [role, setRole] = useState("owner"); // "owner" | "delivery"
  const [selectedBoyId, setSelectedBoyId] = useState(
    String(deliveryBoys[0]?.id ?? ""),
  );
  const selectedBoy =
    deliveryBoys.find((boy) => String(boy.id) === selectedBoyId) ||
    deliveryBoys[0];

  const handleLogin = () => {
    if (role === "owner") {
      onLogin({ role: "owner", name: "Owner" });
    } else if (selectedBoy) {
      onLogin({
        role: "delivery",
        deliveryBoyId: selectedBoy.id,
        name: selectedBoy.name,
      });
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: "'DM Sans', sans-serif",
        color: C.ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: C.paper,
          borderRadius: 24,
          padding: "32px 24px",
          border: `1px solid ${C.paperLine}`,
          boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
          textAlign: "center",
        }}
      >
        <img
          src={logoIcon}
          alt={BUSINESS_NAME}
          style={{ width: 64, height: 64, borderRadius: 16, marginBottom: 12 }}
        />
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, color: C.primaryDark, margin: 0 }}>
          {BUSINESS_NAME}
        </h2>
        <p style={{ fontSize: 12, color: C.inkMute, marginTop: 4, letterSpacing: 1.1, textTransform: "uppercase" }}>
          {BUSINESS_TAGLINE} • Role Access
        </p>

        <div style={{ marginTop: 28, textAlign: "left" }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: C.inkMute, display: "block", marginBottom: 8 }}>
            SELECT YOUR ROLE
          </label>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              aria-label="Select owner role"
              aria-pressed={role === "owner"}
              className="tap"
              onClick={() => setRole("owner")}
              style={{
                width: "100%",
                border: `2px solid ${role === "owner" ? C.primary : C.paperLine}`,
                background: role === "owner" ? C.primarySoft : C.paper,
                borderRadius: 14,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                color: C.ink,
                font: "inherit",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: role === "owner" ? C.primary : C.cream,
                  color: role === "owner" ? "#fff" : C.ink,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ShieldCheck size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.primaryDark }}>Owner / Admin</div>
                <div style={{ fontSize: 11.5, color: C.inkMute }}>Full access to revenue, orders & settings</div>
              </div>
            </button>

            <button
              type="button"
              aria-label="Select delivery role"
              aria-pressed={role === "delivery"}
              className="tap"
              onClick={() => setRole("delivery")}
              style={{
                width: "100%",
                border: `2px solid ${role === "delivery" ? C.primary : C.paperLine}`,
                background: role === "delivery" ? C.primarySoft : C.paper,
                borderRadius: 14,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                color: C.ink,
                font: "inherit",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: role === "delivery" ? C.primary : C.cream,
                  color: role === "delivery" ? "#fff" : C.ink,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Truck size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.primaryDark }}>Delivery Boy</div>
                <div style={{ fontSize: 11.5, color: C.inkMute }}>View delivery routes & mark order status</div>
              </div>
            </button>
          </div>

          {role === "delivery" && (
            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.inkMute, display: "block", marginBottom: 6 }}>
                SELECT DELIVERY PERSON
              </label>
              <select
                value={selectedBoy ? String(selectedBoy.id) : ""}
                onChange={(e) => setSelectedBoyId(e.target.value)}
                disabled={deliveryBoys.length === 0}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 12,
                  border: `1px solid ${C.paperLine}`,
                  background: C.paper,
                  fontSize: 14,
                  fontWeight: 600,
                  color: C.ink,
                }}
              >
                {deliveryBoys.map((boy) => (
                  <option key={boy.id} value={boy.id}>
                    {boy.name} ({boy.phone})
                  </option>
                ))}
              </select>
              {deliveryBoys.length === 0 && (
                <div role="status" style={{ fontSize: 12, color: C.brick, marginTop: 6 }}>
                  No delivery staff are available.
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="tap"
            onClick={handleLogin}
            disabled={role === "delivery" && !selectedBoy}
            style={{
              marginTop: 24,
              width: "100%",
              background: C.primary,
              color: "#fff",
              border: "none",
              borderRadius: 14,
              padding: "14px",
              fontWeight: 700,
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "0 4px 12px rgba(30,75,66,0.25)",
              opacity: role === "delivery" && !selectedBoy ? 0.6 : 1,
              cursor: role === "delivery" && !selectedBoy ? "not-allowed" : "pointer",
            }}
          >
            Continue as {role === "owner" ? "Owner" : "Delivery"} <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
