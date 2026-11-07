import {
  getSelectableDeliveryOrders,
  markSelectedOrdersDelivered,
} from "./ordersTabUtils";

const orders = [
  { id: "pending", orderStatus: "Pending", deliveryBoyId: "driver-1" },
  { id: "out-for-delivery", orderStatus: "Out for Delivery", deliveryBoyId: "driver-1" },
  { id: "other-driver", orderStatus: "Out for Delivery", deliveryBoyId: "driver-2" },
  { id: "unassigned", orderStatus: "Pending", deliveryBoyId: "" },
  { id: "delivered", orderStatus: "Delivered", deliveryBoyId: "driver-1" },
  { id: "cancelled", orderStatus: "Cancelled", deliveryBoyId: "driver-1" },
];

test("owners can select visible orders not already delivered or cancelled", () => {
  expect(getSelectableDeliveryOrders(orders, false).map((order) => order.id)).toEqual([
    "pending",
    "out-for-delivery",
    "other-driver",
    "unassigned",
  ]);
});

test("drivers can select only their assigned orders already out for delivery", () => {
  expect(
    getSelectableDeliveryOrders(orders, true, "driver-1").map((order) => order.id),
  ).toEqual(["out-for-delivery"]);
});

test("driver selection is empty when there is no authenticated driver ID", () => {
  expect(getSelectableDeliveryOrders(orders, true).map((order) => order.id)).toEqual([]);
});

test("bulk delivery changes only selected active orders and preserves payment data", () => {
  const source = [
    { id: "selected", orderStatus: "Pending", paymentStatus: "Partial", amountPaid: 5, bottlesReturned: 2 },
    { id: "already-delivered", orderStatus: "Delivered", deliveredAt: "old-time" },
    { id: "cancelled", orderStatus: "Cancelled" },
    { id: "not-selected", orderStatus: "Pending" },
  ];

  const result = markSelectedOrdersDelivered(
    source,
    ["selected", "already-delivered", "cancelled"],
    "new-time",
  );

  expect(result).toEqual([
    {
      id: "selected",
      orderStatus: "Delivered",
      paymentStatus: "Partial",
      amountPaid: 5,
      bottlesReturned: 2,
      deliveredAt: "new-time",
    },
    source[1],
    source[2],
    source[3],
  ]);
  expect(source[0].orderStatus).toBe("Pending");
});
