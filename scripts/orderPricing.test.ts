import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateOrderTotal,
  clampQuantity,
  moneyString,
  ORDER_CURRENCY,
} from '../api/_lib/orderPricing.js';

test('clampQuantity bounds quantity to 1..100', () => {
  assert.equal(clampQuantity(0), 1);
  assert.equal(clampQuantity(101), 100);
  assert.equal(clampQuantity(2.9), 2);
});

test('vinyl and product totals include shipping', () => {
  assert.equal(ORDER_CURRENCY, 'AUD');
  assert.equal(calculateOrderTotal({ orderType: 'vinyl', quantity: 1 }), 18.98);
  assert.equal(calculateOrderTotal({ orderType: 'vinyl', quantity: 1, vinylPermanent: true }), 24.98);
  assert.equal(calculateOrderTotal({ orderType: 'product', quantity: 2 }), 55.97);
  assert.equal(moneyString(18.98), '18.98');
});
