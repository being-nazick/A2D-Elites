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
