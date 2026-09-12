import React from 'react';
import { C } from '../app/constants';
import { fmtDateShort, fmtINR, iconFor } from '../app/helpers';
import { StatusPill, QtyLine, ActionBtn } from '../components/Shared';

// OrderRow displays a single order in the list.
export default function OrderRow({ order, actions, data }) {
  const customer = data.customers.find(c => c.id === order.customerId);
  const statusText = order.orderStatus || 'Pending';
  const payStatus = order.paymentStatus || 'Pending';
  return (
    <div style={{ borderBottom: `1px solid ${C.paperLine}`, padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{order.id}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <ActionBtn onClick={() => actions.edit(order)} icon={() => <span>Edit</span>} label="Edit" tone={C.ink} toneSoft={C.paper} />
          <ActionBtn onClick={() => actions.del(order.id)} icon={() => <span>✕</span>} label="Del" tone={C.brick} toneSoft={C.brickSoft} />
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.inkMute }}>
        {customer ? `${customer.name} (${customer.phone || 'no phone'})` : 'Unknown customer'} – {fmtDateShort(order.orderDate)}
      </div>
      <QtyLine items={order.items} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <StatusPill status={statusText} kind="order" />
        <StatusPill status={payStatus} kind="pay" />
        <div style={{ fontWeight: 600, color: C.ink }}>{fmtINR(order.total)}</div>
      </div>
    </div>
  );
}
