import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import DriverLocationView from "./DriverLocationView";

jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  useMap: () => ({ setView: jest.fn(), fitBounds: jest.fn() }),
}));

jest.mock("leaflet", () => ({
  __esModule: true,
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: jest.fn() } },
    latLngBounds: jest.fn(),
  },
}));

const locationSharing = {
  sharing: false,
  sharingStatus: "stopped",
  sharingError: "",
  lastSentAt: "",
  lastAccuracy: null,
  startSharing: jest.fn(),
  stopSharing: jest.fn(),
  driverLocations: [],
  locationsLoading: false,
  locationsError: "",
  refreshLocations: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("requires explicit consent before starting shift location sharing", () => {
  render(
    <DriverLocationView
      userSession={{ role: "delivery" }}
      locationSharing={locationSharing}
    />,
  );

  const startButton = screen.getByRole("button", {
    name: "Start Shift Location Sharing",
  });
  expect(startButton).toBeDisabled();
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: /share my location with the A2D Elites owner/i,
    }),
  );
  expect(startButton).toBeEnabled();
  fireEvent.click(startButton);
  expect(locationSharing.startSharing).toHaveBeenCalledTimes(1);
});

test("lets the driver stop sharing", () => {
  render(
    <DriverLocationView
      userSession={{ role: "delivery" }}
      locationSharing={{
        ...locationSharing,
        sharing: true,
        sharingStatus: "sharing",
      }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Stop Sharing" }));
  expect(locationSharing.stopSharing).toHaveBeenCalledTimes(1);
});

test("shows the business ID used to look up owner-visible locations", () => {
  render(
    <DriverLocationView
      userSession={{
        role: "owner",
        businessId: "business-1",
      }}
      drivers={[{ id: "driver-1", name: "Raju" }]}
      locationSharing={locationSharing}
    />,
  );

  expect(screen.getByText("Business ID: business-1")).toBeInTheDocument();
});
