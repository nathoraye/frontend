import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateOrderTotal,
  checkoutChargeAmount,
  clampQuantity,
  jobSummary,
  moneyString,
  ORDER_CURRENCY,
  smokeCheckoutAmountCents,
} from '../api/_lib/orderPricing.js';

test('clampQuantity bounds quantity to 1..100', () => {
  assert.equal(clampQuantity(0), 1);
  assert.equal(clampQuantity(101), 100);
  assert.equal(clampQuantity(2.9), 2);
});

const decal10 = {
  orderType: 'vinyl',
  productType: 'decal',
  widthCm: 10,
  heightCm: 10,
  designType: 'graphic',
  shippingOption: 'untracked',
  quantity: 1,
};

test('quoted totals ignore client prices and flat legacy amounts', () => {
  assert.equal(ORDER_CURRENCY, 'AUD');
  assert.equal(calculateOrderTotal(decal10), 18);
  assert.equal(calculateOrderTotal({ ...decal10, amount: 1, unitAmount: 100, quantity: 2 }), 32);
  assert.equal(
    calculateOrderTotal({
      orderType: 'product',
      productId: 'tshirt',
      widthCm: 20,
      heightCm: 30,
      designType: 'text',
      textDensity: 'standard',
      quantity: 1,
    }),
    44,
  );
  assert.equal(moneyString(22), '22.00');
  assert.throws(
    () => calculateOrderTotal({ orderType: 'vinyl', quantity: 1 }),
    (err) => err.status === 400 && /centimetres/.test(err.message),
  );
});

test('smokeCheckoutAmountCents is unset by default and accepts 100', () => {
  const prev = process.env.SMOKE_CHECKOUT_AMOUNT_CENTS;
  try {
    delete process.env.SMOKE_CHECKOUT_AMOUNT_CENTS;
    assert.equal(smokeCheckoutAmountCents(), null);
    assert.equal(smokeCheckoutAmountCents(''), null);
    assert.equal(smokeCheckoutAmountCents('100'), 100);
    assert.equal(smokeCheckoutAmountCents(' 100 '), 100);
    process.env.SMOKE_CHECKOUT_AMOUNT_CENTS = '100';
    assert.equal(checkoutChargeAmount(decal10), 1);
    assert.equal(calculateOrderTotal(decal10), 18);
    delete process.env.SMOKE_CHECKOUT_AMOUNT_CENTS;
    assert.equal(checkoutChargeAmount(decal10), 18);
    assert.throws(
      () => smokeCheckoutAmountCents('1'),
      (err) => err.status === 503 && /between 50 and 100000/.test(err.message),
    );
    assert.throws(
      () => smokeCheckoutAmountCents('abc'),
      (err) => err.status === 503 && /integer number of cents/.test(err.message),
    );
  } finally {
    if (prev === undefined) delete process.env.SMOKE_CHECKOUT_AMOUNT_CENTS;
    else process.env.SMOKE_CHECKOUT_AMOUNT_CENTS = prev;
  }
});

test('jobSummary describes vinyl and apparel jobs', () => {
  assert.equal(
    jobSummary({ orderType: 'vinyl', quantity: 2, vinylWidthCm: 8, vinylHeightCm: 6 }),
    'vinyl 8×6cm removable ×2',
  );
  assert.equal(
    jobSummary({
      orderType: 'product',
      quantity: 1,
      productId: 'tshirt',
      productSize: 'L',
      productColor: '#ffffff',
    }),
    'tshirt · L · #ffffff ×1',
  );
});

test('formatOrderSize shows cm+inches for vinyl and garment size for apparel', async () => {
  const { formatOrderSize, vinylSizeCm, coercePositiveNumber } = await import(
    '../api/_lib/orderPricing.js'
  );
  assert.equal(coercePositiveNumber('15.5'), 15.5);
  assert.equal(coercePositiveNumber('nope', 10), 10);
  assert.deepEqual(vinylSizeCm({ vinylWidthCm: '12', vinylHeightCm: 8 }), {
    widthCm: 12,
    heightCm: 8,
  });
  assert.equal(formatOrderSize({ orderType: 'vinyl', vinylWidthCm: 10, vinylHeightCm: 10 }), '10×10 cm · 3.9×3.9 in');
  assert.equal(
    formatOrderSize({ orderType: 'product', productSize: 'L' }),
    'L',
  );
  assert.equal(formatOrderSize({ orderType: 'vinyl' }), null);
  assert.equal(formatOrderSize({ orderType: 'product', productId: 'tshirt' }), null);
});
