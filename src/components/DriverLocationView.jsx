import React, { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { Capacitor } from "@capacitor/core";
import { ArrowLeft, LocateFixed, MapPinned, Radio, RefreshCw } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { C } from "../app/constants";
import {
  formatLocationTime,
  isDriverLocationStale,
} from "../app/driverLocationUtils";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function FitDriverLocations({ locations }) {
  const map = useMap();
  useEffect(() => {
    if (!locations.length) return;
    if (locations.length === 1) {
      map.setView(
        [Number(locations[0].latitude), Number(locations[0].longitude)],
        14,
      );
      return;
    }
    const bounds = L.latLngBounds(
      locations.map((location) => [
        Number(location.latitude),
        Number(location.longitude),
      ]),
    );
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
  }, [locations, map]);
  return null;
}

function DriverSharingControls({ locationSharing }) {
  const [consent, setConsent] = useState(false);
  const platform = Capacitor.getPlatform();
  const busy = ["starting", "stopping"].includes(
    locationSharing.sharingStatus,
  );
  const platformMessage =
    platform === "android"
      ? "On Android, a persistent notification stays visible while sharing. Updates are sent as the device moves (about every 50 m); battery-saving settings may delay them."
      : "In this build, location is shared only while the app is open. Background sharing is not configured for this platform.";
  const toggleSharing = async () => {
    if (locationSharing.sharing) {
      await locationSharing.stopSharing();
      setConsent(false);
    } else {
      await locationSharing.startSharing();
    }
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Radio size={18} color={locationSharing.sharing ? C.green : C.inkMute} />
        <strong>{locationSharing.sharing ? "Sharing location" : "Location sharing is off"}</strong>
      </div>
      <p style={bodyTextStyle}>
        Sharing is opt-in and should be active only during your delivery shift.
        The owner can see your latest point and its update time. Stopping sharing
        removes that point from the cloud.
      </p>
      <p style={bodyTextStyle}>{platformMessage}</p>
      {locationSharing.lastSentAt && (
        <div style={metaTextStyle}>
          Last sent {formatLocationTime(locationSharing.lastSentAt)}
          {Number.isFinite(locationSharing.lastAccuracy)
            ? ` · ±${Math.round(locationSharing.lastAccuracy)} m accuracy`
            : ""}
        </div>
      )}
      {!locationSharing.sharing && (
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "12px 0", fontSize: 12, lineHeight: 1.5 }}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            style={{ marginTop: 2 }}
          />
          I agree to share my location with the A2D Elites owner for this shift.
        </label>
      )}
      <button
        type="button"
        className="tap"
        disabled={busy || (!locationSharing.sharing && !consent)}
        onClick={toggleSharing}
        style={{
          ...buttonStyle,
          background: locationSharing.sharing ? C.brick : C.primary,
          opacity: busy || (!locationSharing.sharing && !consent) ? 0.55 : 1,
        }}
      >
        {locationSharing.sharing ? "Stop Sharing" : "Start Shift Location Sharing"}
      </button>
      {locationSharing.sharingError && (
        <div role="alert" style={errorStyle}>
          {locationSharing.sharingError}
        </div>
      )}
    </div>
  );
}

export default function DriverLocationView({
  userSession,
  drivers = [],
  locationSharing,
  onBack,
}) {
  const [now, setNow] = useState(Date.now());
  const isOwner = userSession?.role === "owner";
  const locationsByDriver = useMemo(
    () =>
      new Map(
        locationSharing.driverLocations.map((location) => [
          String(location.driver_id),
          location,
        ]),
      ),
    [locationSharing.driverLocations],
  );
  const locatedDrivers = useMemo(
    () =>
      locationSharing.driverLocations
        .map((location) => ({
          ...location,
          name:
            drivers.find(
              (driver) => String(driver.id) === String(location.driver_id),
            )?.name || "Delivery driver",
        }))
        .filter(
          (location) =>
            Number.isFinite(Number(location.latitude)) &&
            Number.isFinite(Number(location.longitude)),
        ),
    [drivers, locationSharing.driverLocations],
  );
  const refreshLocations = locationSharing.refreshLocations;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (isOwner) refreshLocations();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [isOwner, refreshLocations]);

  return (
    <div>
      <div style={headerStyle}>
        <button className="tap" onClick={onBack} style={backButtonStyle} aria-label="Back to More">
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={titleStyle}>
            {isOwner ? "Driver Locations" : "Shift Location Sharing"}
          </div>
          <div style={metaTextStyle}>
            {isOwner
              ? "Latest shared locations for your delivery team"
              : "You control when your location is shared"}
          </div>
          {isOwner && userSession?.businessId && (
            <div style={{ ...metaTextStyle, wordBreak: "break-all" }}>
              Business ID: {userSession.businessId}
            </div>
          )}
        </div>
        {isOwner ? <MapPinned size={20} color={C.primary} /> : <LocateFixed size={20} color={C.primary} />}
      </div>

      {isOwner ? (
        <>
          <div style={{ padding: "0 16px 10px", display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="tap"
              onClick={locationSharing.refreshLocations}
              disabled={locationSharing.locationsLoading}
              style={refreshButtonStyle}
            >
              <RefreshCw size={14} />
              {locationSharing.locationsLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {locationSharing.locationsError && (
            <div role="alert" style={{ ...errorStyle, margin: "0 16px 10px" }}>
              {locationSharing.locationsError}
            </div>
          )}
          {locatedDrivers.length > 0 ? (
            <div style={mapFrameStyle}>
              <MapContainer
                center={[
                  Number(locatedDrivers[0].latitude),
                  Number(locatedDrivers[0].longitude),
                ]}
                zoom={13}
                style={{ height: 300, width: "100%" }}
                scrollWheelZoom
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitDriverLocations locations={locatedDrivers} />
                {locatedDrivers.map((location) => {
                  const stale = isDriverLocationStale(location, now);
                  return (
                    <Marker
                      key={location.driver_id}
                      position={[
                        Number(location.latitude),
                        Number(location.longitude),
                      ]}
                    >
                      <Popup>
                        <strong>{location.name}</strong>
                        <br />
                        {stale ? "Last location (stale)" : "Recently updated"}
                        <br />
                        Updated {formatLocationTime(location.updated_at)}
                        <br />
                        Accuracy ±{Math.round(Number(location.accuracy))} m
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          ) : (
            <div style={{ ...cardStyle, color: C.inkMute, fontSize: 13 }}>
              No delivery person is currently sharing a location.
            </div>
          )}
          <div style={{ padding: "8px 16px 20px", display: "grid", gap: 8 }}>
            {drivers.map((driver) => {
              const location = locationsByDriver.get(String(driver.id));
              const stale = location && isDriverLocationStale(location, now);
              return (
                <div key={driver.id} style={driverRowStyle}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: 13 }}>{driver.name}</strong>
                    <div style={metaTextStyle}>
                      {location
                        ? `${stale ? "Stale" : "Updated"} ${formatLocationTime(location.updated_at)} · ±${Math.round(Number(location.accuracy))} m`
                        : "Not sharing"}
                    </div>
                  </div>
                  {location && (
                    <span
                      style={{
                        ...statusPillStyle,
                        color: stale ? C.gold : C.green,
                        background: stale ? C.goldSoft : C.greenSoft,
                      }}
                    >
                      {stale ? "STALE" : "LIVE"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ padding: "0 16px 18px", color: C.inkMute, fontSize: 11, lineHeight: 1.5 }}>
            A location becomes stale after five minutes without an update. GPS
            may be delayed by weak signal, network loss, or battery restrictions.
            Only the latest point is retained; no route history is stored.
          </div>
        </>
      ) : (
        <div style={{ padding: "0 16px 20px" }}>
          <DriverSharingControls locationSharing={locationSharing} />
        </div>
      )}
    </div>
  );
}

const cardStyle = {
  margin: "4px 16px 14px",
  padding: 16,
  background: C.paper,
  border: `1px solid ${C.paperLine}`,
  borderRadius: 14,
};
const bodyTextStyle = {
  color: C.inkMute,
  fontSize: 12,
  lineHeight: 1.55,
  margin: "10px 0 0",
};
const metaTextStyle = { color: C.inkMute, fontSize: 11, marginTop: 4 };
const buttonStyle = {
  width: "100%",
  border: "none",
  borderRadius: 10,
  padding: "12px 14px",
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: 8,
};
const errorStyle = {
  color: C.brick,
  background: C.brickSoft,
  borderRadius: 9,
  padding: 10,
  fontSize: 12,
  lineHeight: 1.5,
  marginTop: 10,
};
const headerStyle = {
  padding: "18px 16px 14px",
  display: "flex",
  alignItems: "center",
  gap: 10,
};
const backButtonStyle = {
  width: 32,
  height: 32,
  borderRadius: 10,
  border: `1px solid ${C.paperLine}`,
  background: C.paper,
  color: C.ink,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const titleStyle = {
  fontFamily: "'Fraunces',serif",
  fontSize: 20,
  fontWeight: 600,
};
const refreshButtonStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  border: `1px solid ${C.paperLine}`,
  borderRadius: 9,
  background: C.paper,
  padding: "8px 10px",
  color: C.ink,
  fontSize: 12,
  fontWeight: 600,
};
const mapFrameStyle = {
  margin: "0 16px 12px",
  overflow: "hidden",
  border: `1px solid ${C.paperLine}`,
  borderRadius: 12,
};
const driverRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "11px 12px",
  border: `1px solid ${C.paperLine}`,
  borderRadius: 11,
  background: C.paper,
};
const statusPillStyle = {
  padding: "4px 7px",
  borderRadius: 12,
  fontSize: 9,
  fontWeight: 800,
};
