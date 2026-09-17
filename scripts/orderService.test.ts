import assert from 'node:assert/strict';
import test from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  expireCheckoutSession,
  fulfillCheckoutSession,
  handleCreateCheckoutSession,
  handleCreatePaymentIntent,
  handleGetOrder,
  handleHealth,
  handleListOrders,
  handleSessionStatus,
  handleStripeEvent,
  handleSubmitOrder,
} from '../api/_lib/orderService.js';

const customer = {
  fullName: 'Ada Vinyl',
  email: 'ada@example.com',
  street: '1 Cut Street',
  city: 'Sydney',
  state: 'NSW',
  postcode: '2000',
  country: 'Australia',
};

const designSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>';

test('unverified local checkout creates and lists an order', async () => {
  const file = path.join(os.tmpdir(), `wvs-orders-${Date.now()}.json`);
  process.env.ALLOW_UNVERIFIED_ORDERS = '1';
  process.env.ALLOW_PUBLIC_ORDER_LIST = '1';
  process.env.ORDER_STORE = 'file';
  process.env.ORDERS_FILE = file;
  delete process.env.STRIPE_SECRET_KEY;

  const created = await handleCreatePaymentIntent({
    orderConfig: { orderType: 'vinyl', quantity: 1 },
  });
  assert.ok(created.id.startsWith('LOCAL-'));
  assert.equal(created.unverified, true);
  assert.equal(created.amount, '18.98');

  const submitted = await handleSubmitOrder({
    paymentIntentId: created.id,
    customer,
    orderConfig: { orderType: 'vinyl', quantity: 1 },
    designSvg,
  });
  assert.equal(submitted.order.status, 'unverified');
  assert.equal(submitted.ordersCount, 1);

  const again = await handleSubmitOrder({
    paymentIntentId: created.id,
    customer,
    orderConfig: { orderType: 'vinyl', quantity: 1 },
    designSvg,
  });
  assert.equal(again.duplicate, true);
  assert.equal(again.ordersCount, 1);

  const listed = await handleListOrders({ headers: {} });
  assert.equal(listed.orders.length, 1);
  assert.equal(listed.orders[0].id, submitted.order.id);

  await fs.unlink(file).catch(() => {});
});

test('order list is gated without admin token', async () => {
  process.env.ALLOW_PUBLIC_ORDER_LIST = '0';
  process.env.ORDERS_ADMIN_TOKEN = 'secret-admin';
  await assert.rejects(
    () => handleListOrders({ headers: {} }),
    (err) => err.status === 401,
  );
  const listed = await handleListOrders({ headers: { authorization: 'Bearer secret-admin' } });
  assert.ok(Array.isArray(listed.orders));
});

test('checkout session persists an unverified job and success status', async () => {
  const file = path.join(os.tmpdir(), `wvs-checkout-${Date.now()}.json`);
  process.env.ALLOW_UNVERIFIED_ORDERS = '1';
  process.env.ALLOW_PUBLIC_ORDER_LIST = '1';
  process.env.ORDER_STORE = 'file';
  process.env.ORDERS_FILE = file;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.PUBLIC_APP_URL;
  delete process.env.SMOKE_CHECKOUT_AMOUNT_CENTS;

  const created = await handleCreateCheckoutSession(
    {
      customer,
      orderConfig: { orderType: 'vinyl', quantity: 1, vinylWidthCm: 10, vinylHeightCm: 10 },
      designSvg,
      origin: 'http://127.0.0.1:5173',
    },
    { headers: {} },
  );
  assert.equal(created.unverified, true);
  assert.ok(created.orderId.startsWith('ord-'));
  assert.match(created.url, /\/order\/success\?orderId=/);

  const status = await handleSessionStatus({ orderId: created.orderId });
  assert.equal(status.orderId, created.orderId);
  assert.equal(status.status, 'unverified');
  assert.equal(status.unverified, true);

  const listed = await handleListOrders({ headers: {} });
  assert.equal(listed.orders[0].customer.email, 'ada@example.com');
  assert.equal(listed.orders[0].hasDesign, true);
  assert.equal(listed.orders[0].designSvg, undefined);

  const detail = await handleGetOrder({ headers: {} }, created.orderId);
  assert.match(detail.order.designSvg, /<svg/);

  await fs.unlink(file).catch(() => {});
});

test('webhook fulfill marks a pending job paid and is idempotent', async () => {
  const file = path.join(os.tmpdir(), `wvs-webhook-${Date.now()}.json`);
  process.env.ALLOW_UNVERIFIED_ORDERS = '1';
  process.env.ALLOW_PUBLIC_ORDER_LIST = '1';
  process.env.ORDER_STORE = 'file';
  process.env.ORDERS_FILE = file;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.SMOKE_CHECKOUT_AMOUNT_CENTS;

  const created = await handleCreateCheckoutSession({
    customer,
    orderConfig: { orderType: 'vinyl', quantity: 1 },
    designSvg,
    origin: 'http://localhost:5173',
  });

  // Pretend this job is waiting on Stripe Checkout.
  const { updateOrder } = await import('../api/_lib/orderStore.js');
  await updateOrder(created.orderId, { status: 'pending', amount: 18.98, currency: 'AUD' });

  const session = {
    id: 'cs_test_1',
    payment_status: 'paid',
    amount_total: 1898,
    currency: 'aud',
    metadata: { orderId: created.orderId },
    payment_intent: { id: 'pi_test_1', latest_charge: 'ch_test_1' },
    customer_details: { email: 'ada@example.com' },
  };

  const first = await fulfillCheckoutSession(session);
  assert.equal(first.order.status, 'paid');
  assert.equal(first.order.paymentIntentId, 'pi_test_1');
  assert.equal(first.duplicate, false);

  const second = await handleStripeEvent({
    type: 'checkout.session.completed',
    data: { object: session },
  });
  assert.equal(second.fulfilled.duplicate, true);
  assert.equal(second.fulfilled.order.status, 'paid');

  await assert.rejects(
    () => fulfillCheckoutSession({ ...session, amount_total: 100 }),
    (err) => err.status === 402,
  );

  await fs.unlink(file).catch(() => {});
});

test('expired checkout session cancels a pending job only', async () => {
  const file = path.join(os.tmpdir(), `wvs-expire-${Date.now()}.json`);
  process.env.ALLOW_UNVERIFIED_ORDERS = '1';
  process.env.ALLOW_PUBLIC_ORDER_LIST = '1';
  process.env.ORDER_STORE = 'file';
  process.env.ORDERS_FILE = file;
  delete process.env.STRIPE_SECRET_KEY;

  const created = await handleCreateCheckoutSession({
    customer,
    orderConfig: { orderType: 'product', quantity: 1, productId: 'tshirt' },
    designSvg,
    origin: 'http://localhost:5173',
  });
  const { updateOrder } = await import('../api/_lib/orderStore.js');
  await updateOrder(created.orderId, { status: 'pending' });

  const expired = await expireCheckoutSession({
    id: 'cs_test_exp',
    metadata: { orderId: created.orderId },
  });
  assert.equal(expired.cancelled, true);
  assert.equal(expired.order.status, 'cancelled');

  const again = await expireCheckoutSession({
    id: 'cs_test_exp',
    metadata: { orderId: created.orderId },
  });
  assert.equal(again.ignored, true);

  await fs.unlink(file).catch(() => {});
});

test('createCheckoutSession uses mocked Stripe when configured', async () => {
  const file = path.join(os.tmpdir(), `wvs-stripe-cs-${Date.now()}.json`);
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.ORDER_STORE = 'file';
  process.env.ORDERS_FILE = file;
  delete process.env.ALLOW_UNVERIFIED_ORDERS;
  delete process.env.SMOKE_CHECKOUT_AMOUNT_CENTS;

  const fakeStripe = {
    checkout: {
      sessions: {
        async create(params) {
          assert.equal(params.mode, 'payment');
          assert.equal(params.customer_email, 'ada@example.com');
          assert.ok(!('payment_method_types' in params));
          assert.equal(params.line_items.length, 2);
          assert.equal(params.line_items[0].price_data.unit_amount, 1299);
          assert.equal(params.line_items[1].price_data.unit_amount, 599);
          return { id: 'cs_test_live', url: 'https://checkout.stripe.com/c/pay/cs_test_live' };
        },
      },
    },
  };

  const created = await handleCreateCheckoutSession(
    {
      customer,
      orderConfig: { orderType: 'vinyl', quantity: 1 },
      designSvg,
      origin: 'https://frontendwvs-westvinylstudio.vercel.app',
      amount: 1,
      unitAmount: 100,
    },
    { headers: {} },
    fakeStripe,
  );
  assert.equal(created.url, 'https://checkout.stripe.com/c/pay/cs_test_live');
  assert.equal(created.sessionId, 'cs_test_live');
  assert.equal(created.unverified, undefined);
  assert.equal(created.amount, '18.98');

  process.env.ALLOW_PUBLIC_ORDER_LIST = '1';
  const listed = await handleListOrders({ headers: {} });
  assert.equal(listed.orders[0].status, 'pending');
  assert.equal(listed.orders[0].checkoutSessionId, 'cs_test_live');
  assert.equal(listed.orders[0].amount, 18.98);

  delete process.env.STRIPE_SECRET_KEY;
  await fs.unlink(file).catch(() => {});
});

test('SMOKE_CHECKOUT_AMOUNT_CENTS=100 charges A$1.00 and webhook still fulfills', async () => {
  const file = path.join(os.tmpdir(), `wvs-stripe-smoke-${Date.now()}.json`);
  const prevSmoke = process.env.SMOKE_CHECKOUT_AMOUNT_CENTS;
  const prevKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.SMOKE_CHECKOUT_AMOUNT_CENTS = '100';
  process.env.ORDER_STORE = 'file';
  process.env.ORDERS_FILE = file;
  process.env.ALLOW_PUBLIC_ORDER_LIST = '1';
  delete process.env.ALLOW_UNVERIFIED_ORDERS;

  try {
    const fakeStripe = {
      checkout: {
        sessions: {
          async create(params) {
            assert.equal(params.line_items.length, 1);
            assert.equal(params.line_items[0].quantity, 1);
            assert.equal(params.line_items[0].price_data.unit_amount, 100);
            assert.equal(params.line_items[0].price_data.currency, 'aud');
            assert.equal(params.metadata.orderId, params.client_reference_id);
            assert.equal(params.metadata.smokeCheckoutAmountCents, '100');
            assert.equal(params.payment_intent_data.metadata.orderId, params.client_reference_id);
            return { id: 'cs_test_smoke', url: 'https://checkout.stripe.com/c/pay/cs_test_smoke' };
          },
        },
      },
    };

    const created = await handleCreateCheckoutSession(
      {
        customer,
        orderConfig: { orderType: 'vinyl', quantity: 2, vinylPermanent: true },
        designSvg,
        origin: 'https://frontendwvs-westvinylstudio.vercel.app',
        amount: 1898,
        unitAmount: 1898,
      },
      { headers: {} },
      fakeStripe,
    );
    assert.equal(created.amount, '1.00');
    assert.equal(created.sessionId, 'cs_test_smoke');

    const health = handleHealth();
    assert.equal(health.checkout.smokeAmountCents, 100);
    assert.equal(health.checkout.smokeAmountInvalid, false);

    const session = {
      id: 'cs_test_smoke',
      payment_status: 'paid',
      amount_total: 100,
      currency: 'aud',
      metadata: { orderId: created.orderId },
      payment_intent: { id: 'pi_smoke_1', latest_charge: 'ch_smoke_1' },
      customer_details: { email: 'ada@example.com' },
    };
    const first = await fulfillCheckoutSession(session);
    assert.equal(first.order.status, 'paid');
    assert.equal(first.order.amount, 1);
    assert.equal(first.order.paymentIntentId, 'pi_smoke_1');
    assert.equal(first.duplicate, false);

    await assert.rejects(
      () => fulfillCheckoutSession({ ...session, amount_total: 1898 }),
      (err) => err.status === 402,
    );
  } finally {
    if (prevKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = prevKey;
    if (prevSmoke === undefined) delete process.env.SMOKE_CHECKOUT_AMOUNT_CENTS;
    else process.env.SMOKE_CHECKOUT_AMOUNT_CENTS = prevSmoke;
    await fs.unlink(file).catch(() => {});
  }
});

test('submit rejects tiny design payloads', async () => {
  process.env.ALLOW_UNVERIFIED_ORDERS = '1';
  delete process.env.STRIPE_SECRET_KEY;
  await assert.rejects(
    () =>
      handleSubmitOrder({
        paymentIntentId: 'LOCAL-1',
        customer,
        orderConfig: { orderType: 'vinyl', quantity: 1 },
        designSvg: '<svg/>',
      }),
    (err) => err.status === 400,
  );
});
