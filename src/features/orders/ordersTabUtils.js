export function getOrderDeliveryDate(order) {
  return order.deliveryDate || order.orderDate || "";
}

export function countTodayRemainingAssignedOrders(orders, driverId, today) {
  if (!driverId) return 0;
  return orders.filter(
    (order) =>
      String(order.deliveryBoyId || "") === String(driverId) &&
      getOrderDeliveryDate(order) === today &&
      !["Delivered", "Cancelled"].includes(order.orderStatus),
  ).length;
}

export function assignSelectedOrders(orders, orderIds, driver) {
  const selectedIds = new Set(orderIds.map(String));
  return orders.map((order) =>
    selectedIds.has(String(order.id)) &&
    !["Delivered", "Cancelled"].includes(order.orderStatus)
      ? {
          ...order,
          deliveryBoyId: driver.id,
          deliveryBoyName: driver.name,
        }
      : order,
  );
}

export function getSelectableDeliveryOrders(orders, isDelivery, deliveryBoyId) {
  return orders.filter((order) => {
    if (["Delivered", "Cancelled"].includes(order.orderStatus)) return false;
    if (!isDelivery) return true;

    return (
      Boolean(deliveryBoyId) &&
      String(order.deliveryBoyId || "") === String(deliveryBoyId) &&
      order.orderStatus === "Out for Delivery"
    );
  });
}

export function markSelectedOrdersDelivered(orders, orderIds, deliveredAt) {
  const selectedIds = new Set(orderIds.map(String));
  return orders.map((order) =>
    selectedIds.has(String(order.id)) &&
    !["Delivered", "Cancelled"].includes(order.orderStatus)
      ? { ...order, orderStatus: "Delivered", deliveredAt }
      : order,
  );
}
