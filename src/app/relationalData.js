import { EMPTY_DATA } from "./constants";

const ORDER_STATUS_TO_DB = {
  Pending: "pending",
  "Out for Delivery": "out_for_delivery",
  Delivered: "delivered",
  Cancelled: "cancelled",
};
const ORDER_STATUS_FROM_DB = {
  pending: "Pending",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const PAYMENT_STATUS_TO_DB = {
  Pending: "pending",
  Partial: "partial",
  Paid: "paid",
};
const PAYMENT_STATUS_FROM_DB = {
  pending: "Pending",
  partial: "Partial",
  paid: "Paid",
};

const without = (value, fields) =>
  Object.fromEntries(
    Object.entries(value || {}).filter(([key]) => !fields.includes(key)),
  );

export function normalizeAppData(data = {}) {
  return {
    ...EMPTY_DATA,
    ...data,
    products: Array.isArray(data.products) ? data.products : [],
    customers: Array.isArray(data.customers) ? data.customers : [],
    orders: Array.isArray(data.orders) ? data.orders : [],
    recurring: Array.isArray(data.recurring) ? data.recurring : [],
    deliveryBoys: Array.isArray(data.deliveryBoys) ? data.deliveryBoys : [],
  };
}

export function mergeLocalWithRemote(remoteData, localData) {
  const remote = normalizeAppData(remoteData);
  const local = normalizeAppData(localData);
  const customers = [...remote.customers];
  const customerById = new Map(customers.map((item) => [String(item.id), item]));
  const customerByPhone = new Map(
    customers
      .filter((item) => item.phone)
      .map((item) => [String(item.phone).replace(/\D/g, ""), item]),
  );
  const localCustomerIdMap = new Map();

  local.customers.forEach((customer) => {
    const sameId = customerById.get(String(customer.id));
    const normalizedPhone = String(customer.phone || "").replace(/\D/g, "");
    const samePhone = normalizedPhone && customerByPhone.get(normalizedPhone);
    const canonical = sameId || samePhone;
    if (canonical) {
      localCustomerIdMap.set(String(customer.id), canonical.id);
      if (sameId) Object.assign(canonical, customer);
      return;
    }

    customers.push(customer);
    customerById.set(String(customer.id), customer);
    if (normalizedPhone) customerByPhone.set(normalizedPhone, customer);
    localCustomerIdMap.set(String(customer.id), customer.id);
  });

  const mergeById = (remoteItems, localItems, mergeExisting = (remote, local) => ({
    ...remote,
    ...local,
  })) => {
    const result = [...remoteItems];
    const indexes = new Map(
      remoteItems.map((item, index) => [String(item.id), index]),
    );
    localItems.forEach((item) => {
      const existingIndex = indexes.get(String(item.id));
      if (existingIndex === undefined) {
        indexes.set(String(item.id), result.length);
        result.push(item);
      } else {
        result[existingIndex] = mergeExisting(result[existingIndex], item);
      }
    });
    return result;
  };

  const orders = mergeById(
    remote.orders,
    local.orders.map((order) => ({
      ...order,
      customerId:
        localCustomerIdMap.get(String(order.customerId)) ?? order.customerId,
    })),
    (remoteOrder, localOrder) => ({
      ...remoteOrder,
      ...localOrder,
      orderStatus: remoteOrder.orderStatus,
      deliveryBoyId: remoteOrder.deliveryBoyId,
      deliveryBoyName: remoteOrder.deliveryBoyName,
      deliveredAt: remoteOrder.deliveredAt || localOrder.deliveredAt,
    }),
  );
  const recurring = mergeById(
    remote.recurring,
    local.recurring.map((item) => ({
      ...item,
      customerId:
        localCustomerIdMap.get(String(item.customerId)) ?? item.customerId,
    })),
  );

  return {
    ...remote,
    ...local,
    customers,
    products: mergeById(remote.products, local.products),
    orders,
    recurring,
    deliveryBoys: remote.deliveryBoys,
  };
}

export function mapRelationalRowsToAppData({
  customers = [],
  products = [],
  orders = [],
  orderItems = [],
  recurring = [],
  drivers = [],
}) {
  const customerById = new Map(customers.map((item) => [item.id, item]));
  const itemsByOrder = new Map();

  orderItems.forEach((item) => {
    const currentItems = itemsByOrder.get(item.order_id) || [];
    currentItems.push({
      ...(item.metadata || {}),
      id: item.item_id || String(item.id),
      productId: item.product_id,
      productName: item.product_name,
      category: item.category || item.metadata?.category || "",
      qty: Number(item.quantity),
      price: Number(item.unit_price),
    });
    itemsByOrder.set(item.order_id, currentItems);
  });

  return {
    products: products.map((product) => ({
      ...(product.metadata || {}),
      id: product.id,
      name: product.name,
      price: Number(product.price),
      active: product.active,
    })),
    customers: customers.map((customer) => ({
      ...(customer.metadata || {}),
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
    })),
    orders: orders.map((order) => {
      const customer = customerById.get(order.customer_id);
      const driver = drivers.find(
        (item) => item.id === order.assigned_driver_id,
      );
      return {
        ...(order.metadata || {}),
        id: order.id,
        customerId: order.customer_id,
        customerName: customer?.name || "",
        phone: customer?.phone || "",
        address: customer?.address || "",
        deliveryBoyId: order.assigned_driver_id || "",
        deliveryBoyName: driver?.name || "",
        items: itemsByOrder.get(order.id) || [],
        orderDate: order.order_date,
        deliveryDate: order.delivery_date || "",
        orderStatus: ORDER_STATUS_FROM_DB[order.delivery_status] || "Pending",
        paymentStatus: PAYMENT_STATUS_FROM_DB[order.payment_status] || "Pending",
        amountPaid: Number(order.amount_paid) || 0,
        total: Number(order.total) || 0,
        notes: order.notes || "",
        deliveredAt: order.delivered_at || "",
        createdAt: order.created_at,
      };
    }),
    recurring: recurring.map((item) => item.payload || {}),
    deliveryBoys: drivers,
  };
}

export function mapCustomerToRow(customer, businessId) {
  return {
    business_id: businessId,
    id: String(customer.id),
    name: customer.name || "",
    phone: customer.phone || "",
    address: customer.address || "",
    metadata: without(customer, ["id", "name", "phone", "address"]),
    updated_at: new Date().toISOString(),
  };
}

export function mapProductToRow(product, businessId) {
  return {
    business_id: businessId,
    id: String(product.id),
    name: product.name || "",
    price: Number(product.price) || 0,
    active: product.active !== false,
    metadata: without(product, ["id", "name", "price", "active"]),
    updated_at: new Date().toISOString(),
  };
}

export function mapOrderToRows(order, businessId, assignedUserIds = new Set()) {
  const assignedDriverId = String(
    order.deliveryBoyId || order.assignedDriverId || "",
  );
  return {
    order: {
      business_id: businessId,
      id: String(order.id),
      customer_id: String(order.customerId),
      assigned_driver_id: assignedUserIds.has(assignedDriverId)
        ? assignedDriverId
        : null,
      order_date: order.orderDate || new Date().toISOString().slice(0, 10),
      delivery_date: order.deliveryDate || null,
      delivery_status: ORDER_STATUS_TO_DB[order.orderStatus] || "pending",
      payment_status: PAYMENT_STATUS_TO_DB[order.paymentStatus] || "pending",
      amount_paid: Number(order.amountPaid) || 0,
      total: Number(order.total) || 0,
      notes: order.notes || "",
      delivered_at: order.deliveredAt || null,
      metadata: without(order, [
        "id",
        "customerId",
        "deliveryBoyId",
        "assignedDriverId",
        "orderDate",
        "deliveryDate",
        "orderStatus",
        "paymentStatus",
        "amountPaid",
        "total",
        "notes",
        "deliveredAt",
        "items",
      ]),
      updated_at: new Date().toISOString(),
    },
    items: (order.items || []).map((item) => ({
      business_id: businessId,
      order_id: String(order.id),
      product_id: item.productId ? String(item.productId) : null,
      product_name: item.productName || item.name || "",
      item_id: item.id ? String(item.id) : null,
      category: item.category || "",
      quantity: Number(item.qty) || 0,
      unit_price: Number(item.price) || 0,
      metadata: without(item, [
        "id",
        "productId",
        "productName",
        "name",
        "category",
        "qty",
        "price",
      ]),
    })),
  };
}

export function mapRecurringToRow(item, businessId) {
  return {
    business_id: businessId,
    id: String(item.id),
    customer_id: item.customerId ? String(item.customerId) : null,
    active: item.active !== false,
    frequency: item.frequency || "daily",
    days_of_week: item.daysOfWeek || [],
    last_generated_date: item.lastGeneratedDate || null,
    payload: item,
    updated_at: new Date().toISOString(),
  };
}
