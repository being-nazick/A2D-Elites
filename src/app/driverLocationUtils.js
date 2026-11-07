export const MAX_LOCATION_ACCURACY_METERS = 100;
export const STALE_LOCATION_AFTER_MS = 5 * 60 * 1000;

export function normalizeDriverLocation(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  const accuracy = Number(location?.accuracy);
  const capturedAt = Number(location?.time);

  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(accuracy) ||
    accuracy < 0 ||
    accuracy > MAX_LOCATION_ACCURACY_METERS
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy,
    capturedAt: Number.isFinite(capturedAt) && capturedAt > 0
      ? new Date(capturedAt).toISOString()
      : new Date().toISOString(),
  };
}

export function isDriverLocationStale(location, now = Date.now()) {
  const updatedAt = Date.parse(location?.updated_at || "");
  return !Number.isFinite(updatedAt) || now - updatedAt > STALE_LOCATION_AFTER_MS;
}

export function formatLocationTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}
