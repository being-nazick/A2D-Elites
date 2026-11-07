import { mergeBackupData } from "./importExportUtils";

const order = (overrides = {}) => ({
  id: "order-1",
  customerId: "customer-1",
  customerName: "Customer",
  phone: "5550100",
  orderDate: "2026-01-01",
  createdAt: "2026-01-01T10:00:00.000Z",
  items: [{ productId: "milk", name: "Milk", qty: 1, price: 10 }],
  total: 10,
  ...overrides,
});

const emptyData = {
  products: [],
  customers: [],
  orders: [],
  recurring: [],
  deliveryBoys: [],
};

test("merges customers by phone and remaps orders to the existing customer", () => {
  const { data, stats } = mergeBackupData(
    {
      ...emptyData,
      customers: [{ id: "customer-1", name: "Existing", phone: "555-0100" }],
      orders: [order()],
    },
    {
      ...emptyData,
      customers: [
        { id: "customer-copy", name: "Copied", phone: "(555) 0100" },
        { id: "customer-2", name: "New", phone: "5550200" },
      ],
      orders: [
        order({
          id: "new-order",
          customerId: "customer-copy",
          createdAt: "2026-01-02T10:00:00.000Z",
        }),
        order({
          id: "new-customer-order",
          customerId: "customer-2",
          phone: "5550200",
        }),
      ],
    },
  );

  expect(data.customers).toHaveLength(2);
  expect(data.customers[0].name).toBe("Existing");
  expect(data.orders).toHaveLength(3);
  expect(data.orders[1].customerId).toBe("customer-1");
  expect(stats.duplicateCustomerCount).toBe(1);
});

test("retains and flags an order linked by customer ID when its phone differs", () => {
  const { data, stats } = mergeBackupData(emptyData, {
    ...emptyData,
    customers: [{ id: "customer-1", name: "Customer", phone: "5550100" }],
    orders: [order({ phone: "5550999" })],
  });

  expect(data.orders).toHaveLength(1);
  expect(data.orders[0].customerId).toBe("customer-1");
  expect(data.orders[0].importReview).toEqual({
    phoneMismatch: true,
    sourcePhone: "5550999",
    customerPhone: "5550100",
  });
  expect(stats.phoneMismatchCount).toBe(1);
  expect(stats.invalidOrderCount).toBe(0);
});

test("skips an order with no matching customer ID or phone", () => {
  const { data, stats } = mergeBackupData(emptyData, {
    ...emptyData,
    customers: [{ id: "customer-1", name: "Customer", phone: "5550100" }],
    orders: [order({ customerId: "unknown", phone: "5550999" })],
  });

  expect(data.orders).toHaveLength(0);
  expect(stats.invalidOrderCount).toBe(1);
});

test("links an order with no customer ID by its normalized phone", () => {
  const { data, stats } = mergeBackupData(emptyData, {
    ...emptyData,
    customers: [{ id: "customer-1", name: "Customer", phone: "(555) 0100" }],
    orders: [order({ customerId: undefined, phone: "555-0100" })],
  });

  expect(data.orders).toHaveLength(1);
  expect(data.orders[0].customerId).toBe("customer-1");
  expect(stats.invalidOrderCount).toBe(0);
});

test("removes duplicate orders by id and by stable order details", () => {
  const { data, stats } = mergeBackupData(
    {
      ...emptyData,
      customers: [{ id: "customer-1", name: "Customer", phone: "5550100" }],
      orders: [order()],
    },
    {
      ...emptyData,
      customers: [{ id: "customer-copy", name: "Customer", phone: "5550100" }],
      orders: [
        order(),
        order({ id: "duplicate-with-new-id" }),
      ],
    },
  );

  expect(data.orders).toHaveLength(1);
  expect(stats.duplicateOrderCount).toBe(2);
});

test("does not treat blank-phone orders for different customers as duplicates", () => {
  const { data, stats } = mergeBackupData(emptyData, {
    ...emptyData,
    customers: [
      { id: "customer-1", name: "First", phone: "" },
      { id: "customer-2", name: "Second", phone: "" },
    ],
    orders: [
      order({ id: "first-order", customerId: "customer-1", phone: "" }),
      order({ id: "second-order", customerId: "customer-2", phone: "" }),
    ],
  });

  expect(data.orders).toHaveLength(2);
  expect(stats.duplicateOrderCount).toBe(0);
});

test("remaps existing orders to the canonical customer when customers are duplicates", () => {
  const { data } = mergeBackupData(
    {
      ...emptyData,
      customers: [
        { id: "customer-1", name: "Customer", phone: "5550100" },
        { id: "customer-copy", name: "Customer copy", phone: "555-0100" },
      ],
      orders: [order({ customerId: "customer-copy" })],
    },
    emptyData,
  );

  expect(data.customers).toHaveLength(1);
  expect(data.orders[0].customerId).toBe("customer-1");
});
