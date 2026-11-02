import { fireEvent, render, screen } from "@testing-library/react";
import LoginScreen from "./LoginScreen";

test("disables delivery login when there are no delivery staff", () => {
  render(<LoginScreen onLogin={jest.fn()} deliveryBoys={[]} />);

  fireEvent.click(screen.getByRole("button", { name: "Select delivery role" }));

  expect(screen.getByRole("status")).toHaveTextContent(
    "No delivery staff are available.",
  );
  expect(
    screen.getByRole("button", { name: /Continue as Delivery/ }),
  ).toBeDisabled();
});

test("logs in as the selected delivery staff member", () => {
  const onLogin = jest.fn();
  const deliveryBoys = [
    { id: "staff-1", name: "Raju", phone: "123" },
    { id: "staff-2", name: "Suresh", phone: "456" },
  ];
  render(<LoginScreen onLogin={onLogin} deliveryBoys={deliveryBoys} />);

  fireEvent.click(screen.getByRole("button", { name: "Select delivery role" }));
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "staff-2" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Continue as Delivery/ }));

  expect(onLogin).toHaveBeenCalledWith({
    role: "delivery",
    deliveryBoyId: "staff-2",
    name: "Suresh",
  });
});
