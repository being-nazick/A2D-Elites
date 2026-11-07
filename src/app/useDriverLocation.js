import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Preferences } from "@capacitor/preferences";
import {
  normalizeDriverLocation,
} from "./driverLocationUtils";
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabaseClient";

const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");
const SHARING_KEY = "driver-location-sharing";
const PENDING_CLEAR_KEY = "driver-location-clear-needed";

function getSharingKey(userId, businessId) {
  return `${SHARING_KEY}:${userId}:${businessId}`;
}

function getPendingClearKey(userId, businessId) {
  return `${PENDING_CLEAR_KEY}:${userId}:${businessId}`;
}

async function clearRemoteLocation(userId, businessId) {
  if (!navigator.onLine) throw new Error("Offline.");
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase
    .from("driver_locations")
    .delete()
    .eq("business_id", businessId)
    .eq("driver_id", userId);
  if (error) throw error;
}

async function writeLocation(row, accessToken) {
  if (!navigator.onLine) {
    throw new Error("Offline. Location is not being sent to the owner.");
  }
  if (!supabase || !accessToken) {
    throw new Error("Sign in to Supabase before sharing your location.");
  }

  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      url: `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/driver_locations?on_conflict=business_id,driver_id`,
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      data: row,
    });
    if (response.status < 200 || response.status >= 300) {
      const message =
        typeof response.data?.message === "string"
          ? response.data.message
          : `Location update failed (HTTP ${response.status}).`;
      throw new Error(message);
    }
    return;
  }

  const { error } = await supabase
    .from("driver_locations")
    .upsert(row, { onConflict: "business_id,driver_id" });
  if (error) throw error;
}

export function useDriverLocation({ membership, session, syncReady }) {
  const [sharing, setSharing] = useState(false);
  const [sharingStatus, setSharingStatus] = useState("stopped");
  const [sharingError, setSharingError] = useState("");
  const [lastSentAt, setLastSentAt] = useState("");
  const [lastAccuracy, setLastAccuracy] = useState(null);
  const [driverLocations, setDriverLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState("");
  const watcherRef = useRef(null);
  const identity =
    membership?.role === "delivery_driver" && session?.user?.id
      ? `${membership.business_id}:${session.user.id}`
      : "";

  const removeWatcher = useCallback(async () => {
    const watcher = watcherRef.current;
    if (!watcher?.stop) {
      watcherRef.current = null;
      return true;
    }
    try {
      await watcher.stop();
      if (watcherRef.current === watcher) watcherRef.current = null;
      return true;
    } catch (error) {
      console.error("Unable to stop driver location watcher:", error);
      return false;
    }
  }, []);

  const startSharing = useCallback(
    async ({ persist = true } = {}) => {
      const userId = session?.user?.id;
      const businessId = membership?.business_id;
      if (
        !supabase ||
        !userId ||
        !businessId ||
        membership?.role !== "delivery_driver" ||
        !syncReady
      ) {
        setSharingError("A synced delivery-driver account is required.");
        return false;
      }
      if (watcherRef.current) return true;

      setSharingStatus("starting");
      setSharingError("");
      const key = getSharingKey(userId, businessId);
      const watcher = { key, stop: null };
      watcherRef.current = watcher;

      const onLocation = async (position, error) => {
        if (watcherRef.current !== watcher) return;
        if (error) {
          setSharingStatus("error");
          setSharingError(
            error.message || "Location permission or GPS is unavailable.",
          );
          return;
        }
        const normalized = normalizeDriverLocation(position);
        if (!normalized) {
          setSharingStatus("low-accuracy");
          setSharingError(
            "Waiting for a location fix with accuracy of 100 metres or better.",
          );
          return;
        }

        setSharingStatus("sharing");
        setSharingError("");
        setLastAccuracy(normalized.accuracy);
        try {
          await writeLocation(
            {
              business_id: businessId,
              driver_id: userId,
              latitude: normalized.latitude,
              longitude: normalized.longitude,
              accuracy: normalized.accuracy,
              captured_at: normalized.capturedAt,
            },
            session.access_token,
          );
          if (watcherRef.current !== watcher) return;
          setLastSentAt(new Date().toISOString());
          setSharingStatus("sharing");
        } catch (writeError) {
          if (watcherRef.current !== watcher) return;
          console.error("Driver location sync failed:", writeError);
          setSharingStatus("error");
          setSharingError(
            writeError.message || "Unable to send location to Supabase.",
          );
        }
      };

      try {
        if (!navigator.onLine) {
          throw new Error("Connect to the internet before starting location sharing.");
        }

        const platform = Capacitor.getPlatform();
        if (platform === "android") {
          let notificationPermission =
            await LocalNotifications.checkPermissions();
          if (notificationPermission.display !== "granted") {
            notificationPermission = await LocalNotifications.requestPermissions();
          }
          if (notificationPermission.display !== "granted") {
            throw new Error(
              "Allow notifications so Android can show the required location-sharing indicator.",
            );
          }

          const watcherId = await BackgroundGeolocation.addWatcher(
            {
              backgroundTitle: "A2D Elites location sharing",
              backgroundMessage:
                "Your location is shared with A2D Elites while your shift is active. Tap Stop Sharing in the app to end.",
              requestPermissions: true,
              stale: false,
              distanceFilter: 50,
            },
            onLocation,
          );
          if (watcherRef.current !== watcher) {
            await BackgroundGeolocation.removeWatcher({ id: watcherId });
            return false;
          }
          watcher.stop = () =>
            BackgroundGeolocation.removeWatcher({ id: watcherId });
        } else if (Capacitor.isNativePlatform()) {
          const watcherId = await Geolocation.watchPosition(
            { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
            onLocation,
          );
          if (watcherRef.current !== watcher) {
            await Geolocation.clearWatch({ id: watcherId });
            return false;
          }
          watcher.stop = () => Geolocation.clearWatch({ id: watcherId });
        } else {
          if (!navigator.geolocation) {
            throw new Error("This device does not support geolocation.");
          }
          const watcherId = navigator.geolocation.watchPosition(
            (position) => onLocation(position.coords, null),
            (error) => onLocation(null, error),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
          );
          watcher.stop = () =>
            navigator.geolocation.clearWatch(watcherId);
        }

        if (persist) {
          await Preferences.set({ key, value: "true" });
        }
        setSharing(true);
        setSharingStatus("sharing");
        return true;
      } catch (error) {
        if (watcherRef.current === watcher) {
          const stopped = await removeWatcher();
          if (!stopped) {
            setSharing(true);
            setSharingStatus("error");
            setSharingError(
              "Could not stop the location service after startup failed. Try Stop Sharing again.",
            );
            return false;
          }
        } else if (watcher.stop) {
          try {
            await watcher.stop();
          } catch (stopError) {
            console.error("Unable to clean up failed location startup:", stopError);
          }
        }
        setSharing(false);
        setSharingStatus("error");
        setSharingError(error.message || "Unable to start location sharing.");
        if (persist) await Preferences.remove({ key });
        return false;
      }
    },
    [membership, removeWatcher, session, syncReady],
  );

  const stopSharing = useCallback(async () => {
    const userId = session?.user?.id;
    const businessId = membership?.business_id;
    setSharingStatus("stopping");
    setSharingError("");
    const watcherStopped = await removeWatcher();
    if (!watcherStopped) {
      setSharing(true);
      setSharingStatus("error");
      setSharingError(
        "The location service did not stop. Keep the app open and try Stop Sharing again.",
      );
      return false;
    }
    setSharing(false);

    if (userId && businessId) {
      const key = getSharingKey(userId, businessId);
      const pendingClearKey = getPendingClearKey(userId, businessId);
      await Preferences.remove({ key });
      try {
        if (!navigator.onLine) {
          throw new Error(
            "Sharing stopped on this device. The last cloud location will remain visible until this device reconnects and clears it.",
          );
        }
        await clearRemoteLocation(userId, businessId);
        await Preferences.remove({ key: pendingClearKey });
        setSharingStatus("stopped");
      } catch (error) {
        await Preferences.set({ key: pendingClearKey, value: "true" });
        console.error("Unable to clear driver location:", error);
        setSharingStatus("stopped");
        setSharingError(
          error.message || "Sharing stopped, but the cloud location could not be cleared.",
        );
      }
    } else {
      setSharingStatus("stopped");
    }
    return true;
  }, [membership, removeWatcher, session?.user?.id]);

  useEffect(() => {
    let active = true;
    if (!identity || !syncReady) {
      setSharing(false);
      setSharingStatus("stopped");
      void removeWatcher();
      return () => {
        active = false;
      };
    }

    const [businessId, userId] = identity.split(":");
    const key = getSharingKey(userId, businessId);
    const pendingClearKey = getPendingClearKey(userId, businessId);
    Promise.all([
      Preferences.get({ key }),
      Preferences.get({ key: pendingClearKey }),
    ]).then(async ([sharingPreference, pendingClear]) => {
      if (!active) return;
      if (pendingClear.value === "true" && navigator.onLine) {
        try {
          await clearRemoteLocation(userId, businessId);
          await Preferences.remove({ key: pendingClearKey });
        } catch (error) {
          console.error("Unable to clear a pending driver location:", error);
        }
      }
      if (active && sharingPreference.value === "true") {
        startSharing({ persist: false });
      }
    }).catch((error) => {
      if (!active) return;
      console.error("Unable to restore driver location-sharing state:", error);
      setSharingError("Unable to restore the saved location-sharing state.");
    });

    return () => {
      active = false;
      void removeWatcher();
    };
  }, [identity, removeWatcher, startSharing, syncReady]);

  useEffect(() => {
    if (!identity || !syncReady) return undefined;
    let active = true;
    const [businessId, userId] = identity.split(":");
    const pendingClearKey = getPendingClearKey(userId, businessId);
    const clearIfPending = async () => {
      const { value } = await Preferences.get({ key: pendingClearKey });
      if (!active || value !== "true" || !navigator.onLine) return;
      try {
        await clearRemoteLocation(userId, businessId);
        await Preferences.remove({ key: pendingClearKey });
      } catch (error) {
        console.error("Unable to clear a pending driver location:", error);
      }
    };
    window.addEventListener("online", clearIfPending);
    return () => {
      active = false;
      window.removeEventListener("online", clearIfPending);
    };
  }, [identity, syncReady]);

  const refreshLocations = useCallback(async () => {
    if (
      !supabase ||
      membership?.role !== "owner" ||
      !membership.business_id ||
      !syncReady
    ) {
      setDriverLocations([]);
      return;
    }

    setLocationsLoading(true);
    setLocationsError("");
    try {
      const { data, error } = await supabase
        .from("driver_locations")
        .select("business_id,driver_id,latitude,longitude,accuracy,captured_at,updated_at")
        .eq("business_id", membership.business_id);
      if (error) throw error;
      setDriverLocations(data || []);
    } catch (error) {
      console.error("Unable to load driver locations:", error);
      setLocationsError(error.message || "Unable to load driver locations.");
    } finally {
      setLocationsLoading(false);
    }
  }, [membership?.business_id, membership?.role, syncReady]);

  useEffect(() => {
    if (membership?.role !== "owner" || !syncReady || !supabase) {
      setDriverLocations([]);
      return undefined;
    }

    let active = true;
    let refreshTimeout;
    const refresh = () => {
      if (!active) return;
      window.clearTimeout(refreshTimeout);
      refreshTimeout = window.setTimeout(() => {
        if (active) refreshLocations();
      }, 200);
    };
    refreshLocations();
    const channel = supabase
      .channel(`driver-locations:${membership.business_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "driver_locations",
          filter: `business_id=eq.${membership.business_id}`,
        },
        refresh,
      )
      .subscribe((status, error) => {
        if (
          active &&
          (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
        ) {
          console.error("Driver location realtime subscription failed:", error || status);
          setLocationsError(
            error?.message || "Live map updates are unavailable. Use Refresh to retry.",
          );
        }
      });

    return () => {
      active = false;
      window.clearTimeout(refreshTimeout);
      supabase.removeChannel(channel);
    };
  }, [membership?.business_id, membership?.role, refreshLocations, syncReady]);

  return {
    sharing,
    sharingStatus,
    sharingError,
    lastSentAt,
    lastAccuracy,
    startSharing,
    stopSharing,
    driverLocations,
    locationsLoading,
    locationsError,
    refreshLocations,
  };
}
