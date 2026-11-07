import {
  mapOrderToRows,
  mapRelationalRowsToAppData,
  mergeLocalWithRemote,
} from "./relationalData";

test("migrates local records while preserving cloud delivery status", () => {
  const merged = mergeLocalWithRemote(
    {
      customers: [{ id: "remote-customer", name: "Cloud Name", phone: "555-0100" }],
      products: [],
      orders: [
        {
          id: "order-1",
          customerId: "remote-customer",
          orderStatus: "Delivered",
          deliveryBoyId: "driver-1",
          items: [],
        },
      ],
      recurring: [],
      deliveryBoys: [{ id: "driver-1", name: "Driver" }],
    },
    {
      customers: [{ id: "local-customer", name: "Local Name", phone: "5550100" }],
      products: [],
      orders: [
        {
          id: "order-1",
          customerId: "local-customer",
          orderStatus: "Pending",
          items: [{ id: "item-1", productName: "Milk", qty: 1, price: 10 }],
        },
        {
          id: "local-order",
          customerId: "local-customer",
          orderStatus: "Pending",
          items: [],
        },
      ],
      recurring: [],
      deliveryBoys: [],
    },
  );

  expect(merged.customers).toHaveLength(1);
  expect(merged.orders).toHaveLength(2);
  expect(merged.orders[0]).toMatchObject({
    customerId: "remote-customer",
    orderStatus: "Delivered",
    deliveryBoyId: "driver-1",
    items: [{ id: "item-1" }],
  });
  expect(merged.deliveryBoys).toEqual([{ id: "driver-1", name: "Driver" }]);
});

test("maps an assigned order and its items to normalized table rows", () => {
  const mapped = mapOrderToRows(
    {
      id: "order-1",
      customerId: "customer-1",
      deliveryBoyId: "driver-1",
      orderStatus: "Out for Delivery",
      paymentStatus: "Partial",
      amountPaid: 5,
      orderDate: "2026-11-07",
      items: [
        {
          id: "item-1",
          productId: "milk-1",
          productName: "Milk",
          category: "Milk",
          qty: 2,
          price: 10,
        },
      ],
    },
    "business-1",
    new Set(["driver-1"]),
  );

  expect(mapped.order).toMatchObject({
    business_id: "business-1",
    assigned_driver_id: "driver-1",
    delivery_status: "out_for_delivery",
    payment_status: "partial",
  });
  expect(mapped.items[0]).toMatchObject({
    order_id: "order-1",
    item_id: "item-1",
    quantity: 2,
    unit_price: 10,
  });
});

test("hydrates related customer and order-item data", () => {
  const data = mapRelationalRowsToAppData({
    customers: [
      {
        id: "customer-1",
        name: "Customer",
        phone: "5550100",
        address: "Main Street",
        metadata: {},
      },
    ],
    products: [],
    orders: [
      {
        id: "order-1",
        customer_id: "customer-1",
        assigned_driver_id: null,
        order_date: "2026-11-07",
        delivery_date: null,
        delivery_status: "pending",
        payment_status: "pending",
        amount_paid: 0,
        total: 10,
        notes: "",
        created_at: "2026-11-07T10:00:00Z",
        metadata: {},
      },
    ],
    orderItems: [
      {
        id: 1,
        order_id: "order-1",
        product_id: "milk-1",
        product_name: "Milk",
        item_id: "item-1",
        category: "Milk",
        quantity: 1,
        unit_price: 10,
        metadata: {},
      },
    ],
  });

  expect(data.orders[0]).toMatchObject({
    customerName: "Customer",
    phone: "5550100",
    orderStatus: "Pending",
    items: [{ id: "item-1", productName: "Milk", qty: 1, price: 10 }],
  });
});
