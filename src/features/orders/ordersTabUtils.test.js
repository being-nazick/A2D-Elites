import {
  assignSelectedOrders,
  countTodayRemainingAssignedOrders,
  getSelectableDeliveryOrders,
  getOrderDeliveryDate,
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

test("delivery date takes precedence when filtering scheduled driver orders", () => {
  expect(
    getOrderDeliveryDate({
      orderDate: "2026-11-08",
      deliveryDate: "2026-11-09",
    }),
  ).toBe("2026-11-09");
  expect(
    getOrderDeliveryDate({ orderDate: "2026-11-08", deliveryDate: "" }),
  ).toBe("2026-11-08");
});

test("counts only today's assigned orders still awaiting delivery", () => {
  const scheduledOrders = [
    { deliveryBoyId: "driver-1", deliveryDate: "2026-11-08", orderStatus: "Pending" },
    { deliveryBoyId: "driver-1", deliveryDate: "2026-11-08", orderStatus: "Out for Delivery" },
    { deliveryBoyId: "driver-1", deliveryDate: "2026-11-08", orderStatus: "Delivered" },
    { deliveryBoyId: "driver-1", deliveryDate: "2026-11-07", orderStatus: "Pending" },
    { deliveryBoyId: "driver-2", deliveryDate: "2026-11-08", orderStatus: "Pending" },
    { deliveryBoyId: "", deliveryDate: "2026-11-08", orderStatus: "Pending" },
  ];

  expect(
    countTodayRemainingAssignedOrders(
      scheduledOrders,
      "driver-1",
      "2026-11-08",
    ),
  ).toBe(2);
  expect(
    countTodayRemainingAssignedOrders(
      scheduledOrders,
      null,
      "2026-11-08",
    ),
  ).toBe(0);
});

test("bulk assignment updates only selected active orders", () => {
  const source = [
    { id: "selected", orderStatus: "Pending", deliveryBoyId: "" },
    { id: "delivered", orderStatus: "Delivered", deliveryBoyId: "" },
    { id: "cancelled", orderStatus: "Cancelled", deliveryBoyId: "" },
    { id: "not-selected", orderStatus: "Pending", deliveryBoyId: "" },
  ];
  const driver = { id: "driver-1", name: "Raju" };

  expect(assignSelectedOrders(source, ["selected", "delivered", "cancelled"], driver)).toEqual([
    { id: "selected", orderStatus: "Pending", deliveryBoyId: "driver-1", deliveryBoyName: "Raju" },
    source[1],
    source[2],
    source[3],
  ]);
  expect(source[0].deliveryBoyId).toBe("");
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
