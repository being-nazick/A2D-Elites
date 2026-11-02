import {
  fmtBalance,
  computeCustomerBalance,
  amountDue,
} from './helpers';

describe('Balance calculation and formatting', () => {
  test('fmtBalance formats positive balances with explicit + sign', () => {
    expect(fmtBalance(50)).toBe('+₹50');
    expect(fmtBalance(100)).toBe('+₹100');
    expect(fmtBalance(1250)).toBe('+₹1,250');
  });

  test('fmtBalance formats negative or zero balances with explicit - sign', () => {
    expect(fmtBalance(-20)).toBe('-₹20');
    expect(fmtBalance(-100)).toBe('-₹100');
    expect(fmtBalance(0)).toBe('-₹0');
  });

  test('computeCustomerBalance computes correct net balance (paid - total)', () => {
    const customer = { id: 'c_1', name: 'Ramesh' };

    // Case 1: Overpaid (credit / advance)
    const orders1 = [
      { id: 'o_1', customerId: 'c_1', total: 100, customAmount: 150, orderStatus: 'Delivered' },
    ];
    expect(computeCustomerBalance(customer, orders1)).toBe(50);
    expect(fmtBalance(computeCustomerBalance(customer, orders1))).toBe('+₹50');

    // Case 2: Underpaid (due / outstanding)
    const orders2 = [
      { id: 'o_2', customerId: 'c_1', total: 100, customAmount: 80, orderStatus: 'Delivered' },
    ];
    expect(computeCustomerBalance(customer, orders2)).toBe(-20);
    expect(fmtBalance(computeCustomerBalance(customer, orders2))).toBe('-₹20');

    // Case 3: Zero paid (unpaid order)
    const orders3 = [
      { id: 'o_3', customerId: 'c_1', total: 100, customAmount: 0, orderStatus: 'Delivered' },
    ];
    expect(computeCustomerBalance(customer, orders3)).toBe(-100);
    expect(fmtBalance(computeCustomerBalance(customer, orders3))).toBe('-₹100');

    // Case 4: Multiple orders cumulative balance
    const orders4 = [
      { id: 'o_1', customerId: 'c_1', total: 100, customAmount: 150, orderStatus: 'Delivered' },
      { id: 'o_2', customerId: 'c_1', total: 200, customAmount: 100, orderStatus: 'Delivered' },
    ];
    // Total paid: 150 + 100 = 250. Total charged: 100 + 200 = 300. Net: -50
    expect(computeCustomerBalance(customer, orders4)).toBe(-50);
    expect(fmtBalance(computeCustomerBalance(customer, orders4))).toBe('-₹50');
  });

  test('amountDue considers customAmount when present', () => {
    const orderWithCustom = {
      id: 'o_1',
      total: 100,
      customAmount: 70,
      paymentStatus: 'Partial',
    };
    expect(amountDue(orderWithCustom)).toBe(30);

    const orderPaidInFull = {
      id: 'o_2',
      total: 100,
      customAmount: 120,
      paymentStatus: 'Paid',
    };
    expect(amountDue(orderPaidInFull)).toBe(0);
  });
});

