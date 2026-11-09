import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App, { ReturnBottleModal } from './App';

// Mock browser / native / ESM-specific dependencies during Jest
jest.mock('./components/LocationPicker', () => () => <div data-testid="location-picker" />);
jest.mock('./components/DriverLocationView', () => () => <div data-testid="driver-location-view" />);

jest.mock('./features/invoiceService', () => ({
  generateBill: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./billing', () => ({
  getMonthlySummaries: jest.fn().mockReturnValue([]),
  generateMonthlyStatementPDF: jest.fn().mockResolvedValue(undefined),
}));

test('renders dairy app header', () => {
  render(<App />);
  const headerElement = screen.getByText(/A2D Elites/i);
  expect(headerElement).toBeInTheDocument();
});

test("driver confirms delivery and records returned bottles in the modal", async () => {
  const onConfirm = jest.fn().mockResolvedValue(undefined);
  render(
    <ReturnBottleModal
      order={{
        id: "order-1",
        customerId: "customer-1",
        customerName: "Customer One",
        total: 35,
        items: [{ category: "Milk", qty: 2 }],
        bottlesReturned: 0,
      }}
      userSession={{ role: "delivery", name: "Raju" }}
      data={{ orders: [], customers: [] }}
      onClose={jest.fn()}
      onConfirm={onConfirm}
    />,
  );

  expect(screen.queryByText("Custom Amount / Amount Collected (₹)")).toBeNull();
  fireEvent.change(screen.getByRole("spinbutton"), {
    target: { value: "2" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm & Mark Delivered" }),
  );

  await waitFor(() =>
    expect(onConfirm).toHaveBeenCalledWith({
      orderId: "order-1",
      deliveredBy: "Raju",
      bottlesReturned: 2,
    }),
  );
});
