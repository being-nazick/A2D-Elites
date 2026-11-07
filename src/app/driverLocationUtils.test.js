import {
  formatLocationTime,
  isDriverLocationStale,
  normalizeDriverLocation,
} from "./driverLocationUtils";

describe("normalizeDriverLocation", () => {
  test("accepts valid coordinates and records a timestamp", () => {
    const location = normalizeDriverLocation({
      latitude: 13.08,
      longitude: 80.27,
      accuracy: 10,
      time: 1_800_000_000_000,
    });

    expect(location).toEqual({
      latitude: 13.08,
      longitude: 80.27,
      accuracy: 10,
      capturedAt: new Date(1_800_000_000_000).toISOString(),
    });
  });

  test.each([
    [{ latitude: 91, longitude: 80, accuracy: 10 }],
    [{ latitude: 13, longitude: -181, accuracy: 10 }],
    [{ latitude: 13, longitude: 80, accuracy: 101 }],
    [{ latitude: 13, longitude: 80, accuracy: -1 }],
    [{ latitude: "bad", longitude: 80, accuracy: 10 }],
  ])("rejects invalid or inaccurate fixes: %o", (location) => {
    expect(normalizeDriverLocation(location)).toBeNull();
  });
});

describe("driver location display helpers", () => {
  test("marks a location stale after five minutes", () => {
    const now = 1_800_000_000_000;
    expect(
      isDriverLocationStale(
        { updated_at: new Date(now - 5 * 60 * 1000 - 1).toISOString() },
        now,
      ),
    ).toBe(true);
    expect(
      isDriverLocationStale(
        { updated_at: new Date(now - 60_000).toISOString() },
        now,
      ),
    ).toBe(false);
  });

  test("formats valid times and reports invalid values", () => {
    expect(formatLocationTime("not a time")).toBe("Unknown time");
    expect(formatLocationTime("2026-11-07T10:00:00Z")).not.toBe("Unknown time");
  });
});
