import React, { useId, useState } from "react";
import { ArrowLeft, Cloud, Eye, EyeOff, RefreshCw, ShieldCheck } from "lucide-react";
import { C } from "../app/constants";

function PasswordField({ label, autoComplete, value, onChange, required, minLength }) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();

  return (
    <div style={labelStyle}>
      <label htmlFor={inputId}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          value={value}
          onChange={onChange}
          required={required}
          style={{ ...inputStyle, paddingRight: 44 }}
        />
        <button
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          style={passwordToggleStyle}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </div>
  );
}

export default function SupabaseSyncPanel({ sync, onBack, showBack = true }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ownCredentials, setOwnCredentials] = useState({
    currentPassword: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [driverCredentials, setDriverCredentials] = useState({
    currentPassword: "",
    driverUserId: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [newDriver, setNewDriver] = useState({
    currentPassword: "",
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [credentialMessage, setCredentialMessage] = useState("");
  const [credentialError, setCredentialError] = useState("");

  const statusText = {
    connecting: "Connecting and merging this device's data…",
    syncing: "Saving changes to the cloud…",
    synced: "Your local and cloud data are synced.",
    offline: "Offline. Changes are saved on this device and will sync when online.",
    error: "Cloud sync needs attention.",
    "signed-out": "Your data is saved on this device only.",
    "not-configured": "Supabase is not configured yet.",
  }[sync.syncStatus];

  const submit = (event) => {
    event.preventDefault();
    sync.signIn(email.trim(), password);
  };

  const submitOwnCredentials = async (event) => {
    event.preventDefault();
    setCredentialMessage("");
    setCredentialError("");
    if (
      ownCredentials.password &&
      ownCredentials.password !== ownCredentials.confirmPassword
    ) {
      setCredentialError("The new passwords do not match.");
      return;
    }

    try {
      const result = await sync.updateOwnCredentials({
        currentPassword: ownCredentials.currentPassword,
        email: ownCredentials.email,
        password: ownCredentials.password,
      });
      setCredentialMessage(
        result.emailChangePending
          ? "Password updated if provided. Confirm the email-change link sent to the new address to finish changing your email."
          : "Owner credentials updated.",
      );
      setOwnCredentials({
        currentPassword: "",
        email: "",
        password: "",
        confirmPassword: "",
      });
    } catch (error) {
      setCredentialError(error.message || "Unable to update owner credentials.");
    }
  };

  const submitDriverCredentials = async (event) => {
    event.preventDefault();
    setCredentialMessage("");
    setCredentialError("");
    if (!driverCredentials.driverUserId) {
      setCredentialError("Select a delivery person.");
      return;
    }
    if (
      driverCredentials.password &&
      driverCredentials.password !== driverCredentials.confirmPassword
    ) {
      setCredentialError("The new passwords do not match.");
      return;
    }

    try {
      await sync.updateDriverCredentials({
        currentPassword: driverCredentials.currentPassword,
        driverUserId: driverCredentials.driverUserId,
        email: driverCredentials.email,
        password: driverCredentials.password,
      });
      setCredentialMessage(
        "Delivery person's credentials updated. Their new email and password are active immediately; existing signed-in sessions may remain valid until they expire.",
      );
      setDriverCredentials({
        currentPassword: "",
        driverUserId: "",
        email: "",
        password: "",
        confirmPassword: "",
      });
    } catch (error) {
      setCredentialError(error.message || "Unable to update driver credentials.");
    }
  };

  const submitCreateDriver = async (event) => {
    event.preventDefault();
    setCredentialMessage("");
    setCredentialError("");
    if (newDriver.password !== newDriver.confirmPassword) {
      setCredentialError("The new passwords do not match.");
      return;
    }

    try {
      await sync.createDriverAccount({
        currentPassword: newDriver.currentPassword,
        name: newDriver.name,
        email: newDriver.email,
        password: newDriver.password,
      });
      setCredentialMessage(
        "Delivery account created. Share the email and password with the driver so they can sign in.",
      );
      setNewDriver({
        currentPassword: "",
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
      });
    } catch (error) {
      setCredentialError(error.message || "Unable to create the delivery account.");
    }
  };

  return (
    <div>
      <div style={{ padding: "18px 16px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        {showBack && (
          <button className="tap" onClick={onBack} style={navButtonStyle} aria-label="Back to More">
            <ArrowLeft size={16} />
          </button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600 }}>
            Cloud Sync
          </div>
          <div style={{ color: C.inkMute, fontSize: 12 }}>Supabase account and data sync</div>
        </div>
        <Cloud size={21} color={C.primary} />
      </div>

      <div style={{ margin: "4px 16px 16px", padding: 16, background: C.paper, border: `1px solid ${C.paperLine}`, borderRadius: 14 }}>
        <div role="status" style={{ fontSize: 13, fontWeight: 600, color: sync.syncStatus === "error" ? C.brick : C.ink }}>
          {statusText}
        </div>
        {sync.session && (
          <div style={{ marginTop: 6, color: C.inkMute, fontSize: 12 }}>
            Signed in as {sync.session.user.email}
          </div>
        )}
        {sync.session && sync.membership?.business_id && (
          <div style={{ marginTop: 4, color: C.inkMute, fontSize: 11, wordBreak: "break-all" }}>
            Active business: {sync.businessName || "Business"} ({sync.membership.business_id})
          </div>
        )}
        {sync.syncError && (
          <div role="alert" style={{ color: C.brick, fontSize: 12, marginTop: 8 }}>
            {sync.syncError}
          </div>
        )}
        {sync.session && sync.authError && (
          <div role="alert" style={{ color: C.brick, fontSize: 12, marginTop: 8 }}>
            {sync.authError}
          </div>
        )}
      </div>

      {!sync.isConfigured ? (
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
            <ShieldCheck size={18} color={C.primary} />
            Setup required
          </div>
          <p style={{ color: C.inkMute, fontSize: 12, lineHeight: 1.6 }}>
            Create a Supabase project, run the SQL in <code>supabase/relational_schema.sql</code>, then add
            its Project URL and anon/publishable key to <code>.env.local</code>. See
            <code> docs/SUPABASE_SETUP.md</code>.
          </p>
        </div>
      ) : sync.session ? (
        <>
          <div style={{ padding: "0 16px", display: "flex", gap: 8 }}>
            <button type="button" className="tap" onClick={sync.syncNow} disabled={sync.syncStatus === "connecting" || sync.syncStatus === "syncing"} style={primaryButtonStyle}>
              <RefreshCw size={15} /> Sync now
            </button>
            <button type="button" className="tap" onClick={sync.signOut} disabled={sync.authBusy} style={secondaryButtonStyle}>
              Sign out
            </button>
          </div>

          {sync.membership?.role === "owner" && (
            <>
              <form
                onSubmit={submitCreateDriver}
                style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: C.primaryDark }}>
                  Create delivery account
                </div>
                <div style={{ color: C.inkMute, fontSize: 11, lineHeight: 1.5 }}>
                  Create a separate sign-in for another driver in this business. The account is active immediately.
                </div>
                <label style={labelStyle}>
                  Driver name
                  <input
                    type="text"
                    autoComplete="name"
                    maxLength={100}
                    value={newDriver.name}
                    onChange={(event) => setNewDriver((value) => ({ ...value, name: event.target.value }))}
                    required
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Driver email
                  <input
                    type="email"
                    autoComplete="email"
                    value={newDriver.email}
                    onChange={(event) => setNewDriver((value) => ({ ...value, email: event.target.value }))}
                    required
                    style={inputStyle}
                  />
                </label>
                <PasswordField
                  label="Temporary password"
                  autoComplete="new-password"
                  minLength={8}
                  value={newDriver.password}
                  onChange={(event) => setNewDriver((value) => ({ ...value, password: event.target.value }))}
                  required
                />
                <PasswordField
                  label="Confirm temporary password"
                  autoComplete="new-password"
                  minLength={8}
                  value={newDriver.confirmPassword}
                  onChange={(event) => setNewDriver((value) => ({ ...value, confirmPassword: event.target.value }))}
                  required
                />
                <PasswordField
                  label="Owner's current password"
                  autoComplete="current-password"
                  value={newDriver.currentPassword}
                  onChange={(event) => setNewDriver((value) => ({ ...value, currentPassword: event.target.value }))}
                  required
                />
                <button type="submit" className="tap" disabled={sync.authBusy} style={primaryButtonStyle}>
                  {sync.authBusy ? "Please wait…" : "Create delivery account"}
                </button>
              </form>

              <form
                onSubmit={submitOwnCredentials}
                style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: C.primaryDark }}>
                  Owner credentials
                </div>
                <div style={{ color: C.inkMute, fontSize: 11, lineHeight: 1.5 }}>
                  Enter your current password to confirm changes. Leave an update field blank to keep that credential unchanged.
                </div>
                <PasswordField
                  label="Current password"
                  autoComplete="current-password"
                  value={ownCredentials.currentPassword}
                  onChange={(event) => setOwnCredentials((value) => ({ ...value, currentPassword: event.target.value }))}
                  required
                />
                <label style={labelStyle}>
                  New email
                  <input
                    type="email"
                    autoComplete="email"
                    value={ownCredentials.email}
                    onChange={(event) => setOwnCredentials((value) => ({ ...value, email: event.target.value }))}
                    style={inputStyle}
                  />
                </label>
                <PasswordField
                  label="New password"
                  autoComplete="new-password"
                  minLength={8}
                  value={ownCredentials.password}
                  onChange={(event) => setOwnCredentials((value) => ({ ...value, password: event.target.value }))}
                />
                <PasswordField
                  label="Confirm new password"
                  autoComplete="new-password"
                  minLength={8}
                  value={ownCredentials.confirmPassword}
                  onChange={(event) => setOwnCredentials((value) => ({ ...value, confirmPassword: event.target.value }))}
                />
                <button type="submit" className="tap" disabled={sync.authBusy} style={primaryButtonStyle}>
                  {sync.authBusy ? "Please wait…" : "Update owner credentials"}
                </button>
              </form>

              <form
                onSubmit={submitDriverCredentials}
                style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: C.primaryDark }}>
                  Delivery person credentials
                </div>
                <div style={{ color: C.inkMute, fontSize: 11, lineHeight: 1.5 }}>
                  You can set a driver email and/or password. The new email is activated immediately; the driver will use the new credentials at their next sign-in.
                </div>
                <label style={labelStyle}>
                  Delivery person
                  <select
                    value={driverCredentials.driverUserId}
                    onChange={(event) => setDriverCredentials((value) => ({ ...value, driverUserId: event.target.value }))}
                    required
                    style={inputStyle}
                  >
                    <option value="">Select a delivery person</option>
                    {sync.drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name}{driver.phone ? ` (${driver.phone})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  New email
                  <input
                    type="email"
                    autoComplete="off"
                    value={driverCredentials.email}
                    onChange={(event) => setDriverCredentials((value) => ({ ...value, email: event.target.value }))}
                    style={inputStyle}
                  />
                </label>
                <PasswordField
                  label="New password"
                  autoComplete="new-password"
                  minLength={8}
                  value={driverCredentials.password}
                  onChange={(event) => setDriverCredentials((value) => ({ ...value, password: event.target.value }))}
                />
                <PasswordField
                  label="Confirm new password"
                  autoComplete="new-password"
                  minLength={8}
                  value={driverCredentials.confirmPassword}
                  onChange={(event) => setDriverCredentials((value) => ({ ...value, confirmPassword: event.target.value }))}
                />
                <PasswordField
                  label="Owner's current password"
                  autoComplete="current-password"
                  value={driverCredentials.currentPassword}
                  onChange={(event) => setDriverCredentials((value) => ({ ...value, currentPassword: event.target.value }))}
                  required
                />
                <button type="submit" className="tap" disabled={sync.authBusy || sync.drivers.length === 0} style={primaryButtonStyle}>
                  {sync.authBusy ? "Please wait…" : "Update delivery credentials"}
                </button>
              </form>
              {credentialMessage && (
                <div role="status" style={{ ...cardStyle, color: C.green, fontSize: 12 }}>
                  {credentialMessage}
                </div>
              )}
              {credentialError && (
                <div role="alert" style={{ ...cardStyle, color: C.brick, fontSize: 12 }}>
                  {credentialError}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <form onSubmit={submit} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={labelStyle}>
            Email
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required style={inputStyle} />
          </label>
          <PasswordField
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {sync.authError && <div role="alert" style={{ color: C.brick, fontSize: 12 }}>{sync.authError}</div>}
          <button type="submit" className="tap" disabled={sync.authBusy} style={primaryButtonStyle}>
            {sync.authBusy ? "Please wait…" : "Sign in"}
          </button>
          <div style={{ color: C.inkMute, fontSize: 11, lineHeight: 1.5 }}>
            Accounts are created by the business administrator. Ask the owner to provision your role.
          </div>
        </form>
      )}
    </div>
  );
}

const cardStyle = {
  margin: "0 16px 16px",
  padding: 16,
  background: C.paper,
  border: `1px solid ${C.paperLine}`,
  borderRadius: 14,
};

const navButtonStyle = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: `1px solid ${C.paperLine}`,
  background: C.paper,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: C.ink,
};

const labelStyle = { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: C.inkMute };
const inputStyle = { width: "100%", padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.paperLine}`, background: C.bg, color: C.ink, fontSize: 14 };
const passwordToggleStyle = {
  position: "absolute",
  top: 0,
  right: 0,
  height: "100%",
  width: 42,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  background: "transparent",
  color: C.inkMute,
  cursor: "pointer",
};
const primaryButtonStyle = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flex: 1, border: "none", borderRadius: 11, padding: "12px 14px", background: C.primary, color: "#fff", fontSize: 13, fontWeight: 700 };
const secondaryButtonStyle = { ...primaryButtonStyle, border: `1px solid ${C.paperLine}`, background: C.paper, color: C.ink };
