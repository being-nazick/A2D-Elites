import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

// Fix default marker icon in Webpack/CRA
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function ClickToPlace({ onSelect }) {
  useMapEvents({
    click(e) {
      onSelect({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    },
  });
  return null;
}

function RecenterOnChange({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) map.setView([lat, lng], 16);
  }, [lat, lng, map]);
  return null;
}

export default function LocationPicker({ latitude, longitude, onChange, height = 220 }) {
  const hasPos =
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude)) &&
    Number(latitude) !== 0 &&
    Number(longitude) !== 0;

  // Default to a fallback center (change to your city)
  const DEFAULT_CENTER = [12.9716, 77.5946];
  const center = hasPos ? [Number(latitude), Number(longitude)] : DEFAULT_CENTER;

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #EAE1D0" }}>
      <MapContainer
        center={center}
        zoom={hasPos ? 16 : 13}
        style={{ height, width: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {hasPos ? (
          <Marker
            position={[Number(latitude), Number(longitude)]}
            draggable={true}
            eventHandlers={{
              dragend(e) {
                const { lat, lng } = e.target.getLatLng();
                onChange({ latitude: lat, longitude: lng });
              },
            }}
          />
        ) : null}

        <ClickToPlace onSelect={onChange} />
        {hasPos && <RecenterOnChange lat={Number(latitude)} lng={Number(longitude)} />}
      </MapContainer>

      <div
        style={{
          padding: "7px 10px",
          fontSize: 11,
          color: "#8A7F70",
          background: "#FBF7F0",
          textAlign: "center",
        }}
      >
        {hasPos
          ? "Tap map or drag the pin to adjust"
          : "Tap anywhere on the map to set location"}
      </div>
    </div>
  );
}
