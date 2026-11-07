function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function getCustomerKey(customer, index) {
  const phone = normalizePhone(customer.phone);
  if (phone) return `phone:${phone}`;
  if (customer.id !== undefined && customer.id !== null) return `id:${customer.id}`;
  return `index:${index}`;
}

function mergeCustomers(currentCustomers, importedCustomers) {
  const customers = [];
  const customerByKey = new Map();
  const importedCustomerIds = new Map();
  let duplicateCount = 0;

  [...currentCustomers, ...importedCustomers].forEach((customer, index) => {
    const key = getCustomerKey(customer, index);
    const existing = customerByKey.get(key);

    if (existing) {
      duplicateCount += 1;
      Object.keys(customer).forEach((field) => {
        if (
          (existing[field] === undefined ||
            existing[field] === null ||
            existing[field] === "") &&
          customer[field] !== undefined &&
          customer[field] !== null &&
          customer[field] !== ""
        ) {
          existing[field] = customer[field];
        }
      });
      if (customer.id !== undefined && customer.id !== null) {
        importedCustomerIds.set(String(customer.id), existing);
      }
      return;
    }

    const mergedCustomer = { ...customer };
    customers.push(mergedCustomer);
    customerByKey.set(key, mergedCustomer);
    if (customer.id !== undefined && customer.id !== null) {
      importedCustomerIds.set(String(customer.id), mergedCustomer);
    }
  });

  const importedCustomersByPhone = new Map();
  const customersByPhone = new Map();
  customers.forEach((customer) => {
    const phone = normalizePhone(customer.phone);
    if (phone && !customersByPhone.has(phone)) {
      customersByPhone.set(phone, customer);
    }
  });
  importedCustomers.forEach((customer) => {
    const phone = normalizePhone(customer.phone);
    if (phone && !importedCustomersByPhone.has(phone)) {
      importedCustomersByPhone.set(phone, customer);
    }
  });

  return {
    customers,
    importedCustomerIds,
    importedCustomersByPhone,
    customersByPhone,
    duplicateCount,
  };
}

function getOrderFingerprint(order) {
  const phone = normalizePhone(order.phone);
  const customerId = String(order.customerId || "");
  if ((!phone && !customerId) || !order.createdAt) return null;

  const items = Array.isArray(order.items)
    ? order.items
        .map((item) => ({
          productId: item.productId,
          name: item.name || item.productName,
          qty: item.qty,
          price: item.price,
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    : [];

  return JSON.stringify({
    customer: phone ? { phone } : { id: customerId },
    createdAt: order.createdAt,
    orderDate: order.orderDate,
    items,
    total: order.total,
  });
}

function mergeById(currentItems = [], importedItems = []) {
  const items = [];
  const ids = new Set();
  let duplicateCount = 0;

  [...currentItems, ...importedItems].forEach((item) => {
    if (item.id !== undefined && item.id !== null) {
      const id = String(item.id);
      if (ids.has(id)) {
        duplicateCount += 1;
        return;
      }
      ids.add(id);
    }
    items.push(item);
  });

  return { items, duplicateCount };
}

export function mergeBackupData(currentData, importedData) {
  const customerMerge = mergeCustomers(
    currentData.customers || [],
    importedData.customers || [],
  );
  const orders = [];
  const orderIds = new Set();
  const orderFingerprints = new Set();
  let duplicateOrderCount = 0;
  let invalidOrderCount = 0;
  let phoneMismatchCount = 0;

  (currentData.orders || []).forEach((order) => {
    const fingerprint = getOrderFingerprint(order);
    const phone = normalizePhone(order.phone);
    const orderId =
      order.id !== undefined && order.id !== null
        ? String(order.id)
        : null;
    if (
      (orderId && orderIds.has(orderId)) ||
      (fingerprint && orderFingerprints.has(fingerprint))
    ) {
      duplicateOrderCount += 1;
      return;
    }
    if (orderId) orderIds.add(orderId);
    if (fingerprint) orderFingerprints.add(fingerprint);
    const canonicalCustomer =
      customerMerge.importedCustomerIds.get(String(order.customerId)) ||
      customerMerge.customersByPhone.get(phone);
    orders.push(
      canonicalCustomer?.id !== undefined
        ? { ...order, customerId: canonicalCustomer.id }
        : order,
    );
  });

  (importedData.orders || []).forEach((order) => {
    const phone = normalizePhone(order.phone);
    const matchingImportedCustomer = customerMerge.importedCustomersByPhone.get(phone);
    const customerReferencedById =
      order.customerId !== undefined && order.customerId !== null
        ? customerMerge.importedCustomerIds.get(String(order.customerId))
        : null;
    const canonicalCustomer = customerReferencedById
      ? customerReferencedById
      : phone && matchingImportedCustomer
        ? customerMerge.customersByPhone.get(phone)
        : null;
    if (!canonicalCustomer) {
      invalidOrderCount += 1;
      return;
    }

    const customerPhone = normalizePhone(canonicalCustomer.phone);
    const phoneMismatch = Boolean(phone && customerPhone && phone !== customerPhone);
    const fingerprint = getOrderFingerprint(order);
    const orderId =
      order.id !== undefined && order.id !== null
        ? String(order.id)
        : null;
    if (
      (orderId && orderIds.has(orderId)) ||
      (fingerprint && orderFingerprints.has(fingerprint))
    ) {
      duplicateOrderCount += 1;
      return;
    }

    const mergedOrder = {
      ...order,
      customerId: canonicalCustomer.id ?? order.customerId,
    };
    if (phoneMismatch) {
      phoneMismatchCount += 1;
      mergedOrder.importReview = {
        ...(order.importReview || {}),
        phoneMismatch: true,
        sourcePhone: order.phone,
        customerPhone: canonicalCustomer.phone,
      };
    }

    orders.push(mergedOrder);
    if (orderId) orderIds.add(orderId);
    if (fingerprint) orderFingerprints.add(fingerprint);
  });

  const products = mergeById(currentData.products, importedData.products);
  const recurring = mergeById(currentData.recurring, importedData.recurring);
  const deliveryBoys = mergeById(
    currentData.deliveryBoys || [],
    importedData.deliveryBoys || [],
  );

  return {
    data: {
      ...currentData,
      ...importedData,
      products: products.items,
      customers: customerMerge.customers,
      orders,
      recurring: recurring.items,
      deliveryBoys: deliveryBoys.items,
    },
    stats: {
      duplicateCustomerCount: customerMerge.duplicateCount,
      duplicateOrderCount,
      invalidOrderCount,
      phoneMismatchCount,
      duplicateProductCount: products.duplicateCount,
      duplicateRecurringCount: recurring.duplicateCount,
      duplicateDeliveryBoyCount: deliveryBoys.duplicateCount,
    },
  };
}
