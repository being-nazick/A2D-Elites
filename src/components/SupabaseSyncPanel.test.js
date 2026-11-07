import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SupabaseSyncPanel from "./SupabaseSyncPanel";

function createSync(role = "owner") {
  return {
    syncStatus: "synced",
    syncError: "",
    authError: "",
    authBusy: false,
    isConfigured: true,
    session: { user: { email: `${role}@example.com` } },
    membership: { role, business_id: "business-1" },
    drivers: [{ id: "driver-1", name: "Raju", phone: "9000000000" }],
    syncNow: jest.fn(),
    signOut: jest.fn(),
    updateOwnCredentials: jest.fn().mockResolvedValue({ emailChangePending: false }),
    updateDriverCredentials: jest.fn().mockResolvedValue(undefined),
  };
}

test("owner can submit a driver's new credentials", async () => {
  const sync = createSync();
  render(<SupabaseSyncPanel sync={sync} />);

  const driverForm = screen
    .getByText("Delivery person credentials")
    .closest("form");
  fireEvent.change(within(driverForm).getByLabelText("Delivery person"), {
    target: { value: "driver-1" },
  });
  fireEvent.change(within(driverForm).getByLabelText("New email"), {
    target: { value: "new-driver@example.com" },
  });
  fireEvent.change(within(driverForm).getByLabelText("New password"), {
    target: { value: "new-pass-123" },
  });
  fireEvent.change(within(driverForm).getByLabelText("Confirm new password"), {
    target: { value: "new-pass-123" },
  });
  fireEvent.change(within(driverForm).getByLabelText("Owner's current password"), {
    target: { value: "owner-current" },
  });
  fireEvent.click(
    within(driverForm).getByRole("button", {
      name: "Update delivery credentials",
    }),
  );

  await waitFor(() =>
    expect(sync.updateDriverCredentials).toHaveBeenCalledWith({
      currentPassword: "owner-current",
      driverUserId: "driver-1",
      email: "new-driver@example.com",
      password: "new-pass-123",
    }),
  );
  expect(
    await screen.findByText(/Delivery person's credentials updated/),
  ).toBeInTheDocument();
});

test("owner credential changes require matching new passwords", async () => {
  const sync = createSync();
  render(<SupabaseSyncPanel sync={sync} />);

  const ownerForm = screen.getByText("Owner credentials").closest("form");
  fireEvent.change(within(ownerForm).getByLabelText("Current password"), {
    target: { value: "owner-current" },
  });
  fireEvent.change(within(ownerForm).getByLabelText("New password"), {
    target: { value: "new-pass-123" },
  });
  fireEvent.change(within(ownerForm).getByLabelText("Confirm new password"), {
    target: { value: "different-pass" },
  });
  fireEvent.click(
    within(ownerForm).getByRole("button", {
      name: "Update owner credentials",
    }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The new passwords do not match.",
  );
  expect(sync.updateOwnCredentials).not.toHaveBeenCalled();
});

test("delivery drivers cannot access owner credential management", () => {
  render(<SupabaseSyncPanel sync={createSync("delivery_driver")} />);

  expect(screen.queryByText("Owner credentials")).not.toBeInTheDocument();
  expect(screen.queryByText("Delivery person credentials")).not.toBeInTheDocument();
});
