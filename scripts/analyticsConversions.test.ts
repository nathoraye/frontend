import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildGa4PurchasePayload,
  buildMetaPurchasePayload,
  hashMetaEmail,
  normalizeCheckoutAnalytics,
  normalizeMetaEmail,
  reportPurchaseConversions,
} from '../api/_lib/analyticsConversions.js';
import {
  fulfillCheckoutSession,
  handleCreateCheckoutSession,
  handleSessionStatus,
  handleStripeEvent,
} from '../api/_lib/orderService.js';

const ENV_KEYS = [
  'GA4_MEASUREMENT_ID',
  'GA4_API_SECRET',
  'GA4_DEBUG',
  'META_PIXEL_ID',
  'META_CAPI_ACCESS_TOKEN',
  'META_TEST_EVENT_CODE',
  'PUBLIC_APP_URL',
  'ALLOW_UNVERIFIED_ORDERS',
  'ALLOW_PUBLIC_ORDER_LIST',
  'ORDER_STORE',
  'ORDERS_FILE',
  'STRIPE_SECRET_KEY',
  'SMOKE_CHECKOUT_AMOUNT_CENTS',
];

const customer = {
  fullName: 'Ada Vinyl',
  email: 'Ada@Example.com',
  street: '1 Cut Street',
  city: 'Sydney',
  state: 'NSW',
  postcode: '2000',
  country: 'Australia',
};

const designSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>';

const decalConfig = {
  orderType: 'vinyl',
  productType: 'decal',
  widthCm: 10,
  heightCm: 10,
  designType: 'graphic',
  shippingOption: 'untracked',
  quantity: 1,
};

function snapshotEnv() {
  const saved = new Map();
  for (const key of ENV_KEYS) saved.set(key, process.env[key]);
  return saved;
}

function restoreEnv(saved) {
  for (const [key, value] of saved) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearAnalyticsEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

test('meta email hash follows trim and lowercase', () => {
  assert.equal(normalizeMetaEmail('  Mary@Example.com \n'), 'mary@example.com');
  const expected = createHash('sha256').update('mary@example.com').digest('hex');
  assert.equal(hashMetaEmail('  Mary@Example.com \n'), expected);
  assert.equal(hashMetaEmail(''), '');
});

test('checkout analytics metadata is allow-listed and keeps the request ip', () => {
  const analytics = normalizeCheckoutAnalytics(
    {
      eventId: 'evt_checkout_1',
      orderId: 'evil-order',
      gclid: 'gclid-123',
      fbclid: 'fb-1',
      fbc: 'fb.1.10.fb-1',
      fbp: 'fb.1.10.999',
      utmSource: 'google',
      utmMedium: 'cpc',
      gaClientId: '555.666',
      clientIp: '198.51.100.9',
    },
    {
      headers: {
        'x-forwarded-for': '203.0.113.5, 10.0.0.1',
        'user-agent': 'TestAgent/1.0',
      },
    },
  );
  assert.equal(analytics.eventId, 'evt_checkout_1');
  assert.equal(analytics.metadata.orderId, undefined);
  assert.equal(analytics.metadata.event_id, 'evt_checkout_1');
  assert.equal(analytics.metadata.gclid, 'gclid-123');
  assert.equal(analytics.metadata.fbc, 'fb.1.10.fb-1');
  assert.equal(analytics.metadata.fbp, 'fb.1.10.999');
  assert.equal(analytics.metadata.utm_source, 'google');
  assert.equal(analytics.metadata.clientIp, undefined);
  assert.equal(analytics.stored.clientIp, '203.0.113.5');
  assert.equal(analytics.stored.clientUa, 'TestAgent/1.0');

  const replaced = normalizeCheckoutAnalytics({ eventId: 'bad id' });
  assert.notEqual(replaced.eventId, 'bad id');
  assert.match(replaced.metadata.event_id, /^[0-9a-f-]{36}$/);
});

test('purchase payloads use AUD, the order id, and the shared event id', () => {
  const order = {
    id: 'ord-1',
    amount: 22,
    analyticsEventId: 'evt_checkout_1',
    analytics: {
      eventId: 'evt_checkout_1',
      gaClientId: '555.666',
      gclid: 'gclid-123',
      fbc: 'fb.1.10.fb-1',
      fbp: 'fb.1.10.999',
      clientIp: '203.0.113.5',
      clientUa: 'TestAgent/1.0',
    },
    customer: { email: 'Ada@Example.com' },
    orderConfig: { orderType: 'vinyl', productType: 'decal', quantity: 1 },
  };
  const session = {
    metadata: { event_id: 'evt_checkout_1', orderId: 'ord-1' },
    customer_details: { email: 'Ada@Example.com' },
  };
  const ga4 = buildGa4PurchasePayload(order, session);
  assert.equal(ga4.client_id, '555.666');
  assert.equal(ga4.events[0].name, 'purchase');
  assert.equal(ga4.events[0].params.transaction_id, 'ord-1');
  assert.equal(ga4.events[0].params.currency, 'AUD');
  assert.equal(ga4.events[0].params.value, 22);
  assert.equal(ga4.events[0].params.event_id, 'evt_checkout_1');
  assert.equal(ga4.events[0].params.gclid, 'gclid-123');

  const meta = buildMetaPurchasePayload(order, session);
  assert.equal(meta.data[0].event_name, 'Purchase');
  assert.equal(meta.data[0].event_id, 'evt_checkout_1');
  assert.equal(meta.data[0].custom_data.currency, 'AUD');
  assert.equal(meta.data[0].custom_data.value, 22);
  assert.equal(meta.data[0].custom_data.order_id, 'ord-1');
  assert.deepEqual(meta.data[0].user_data.em, [hashMetaEmail('ada@example.com')]);
  assert.equal(meta.data[0].user_data.fbc, 'fb.1.10.fb-1');
  assert.equal(meta.data[0].user_data.fbp, 'fb.1.10.999');
  assert.equal(meta.data[0].user_data.client_ip_address, '203.0.113.5');
});

test('unset analytics env makes purchase reporting a no-op', async () => {
  const saved = snapshotEnv();
  clearAnalyticsEnv();
  let calls = 0;
  try {
    const summary = await reportPurchaseConversions({
      order: {
        id: 'ord-1',
        amount: 22,
        analytics: { eventId: 'evt_checkout_1', gaClientId: '1.2' },
        customer: { email: 'ada@example.com' },
      },
      session: { customer_details: { email: 'ada@example.com' }, metadata: {} },
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, text: async () => '' };
      },
    });
    assert.equal(calls, 0);
    assert.deepEqual(summary, { ga4: 'skipped', meta: 'skipped' });
  } finally {
    restoreEnv(saved);
  }
});

test('provider failures are logged without secrets and do not throw', async () => {
  const saved = snapshotEnv();
  clearAnalyticsEnv();
  process.env.GA4_MEASUREMENT_ID = 'G-TEST123';
  process.env.GA4_API_SECRET = 'test-secret';
  process.env.META_PIXEL_ID = '1234567890';
  process.env.META_CAPI_ACCESS_TOKEN = 'meta-capi-token-test-value';
  const logs = [];
  const original = console.error;
  console.error = (...args) => {
    logs.push(args.map(String).join(' '));
  };
  try {
    const summary = await reportPurchaseConversions({
      order: {
        id: 'ord-1',
        amount: 22,
        analytics: { eventId: 'evt_checkout_1', gaClientId: '1.2' },
        customer: { email: 'ada@example.com' },
      },
      session: { customer_details: { email: 'ada@example.com' }, metadata: { event_id: 'evt_checkout_1' } },
      fetchImpl: async (url) => {
        throw new Error(`network down ${url}`);
      },
    });
    assert.equal(summary.ga4, 'failed');
    assert.equal(summary.meta, 'failed');
    assert.equal(logs.length, 2);
    assert.equal(logs.some((line) => line.includes('meta-capi-token-test-value')), false);
    assert.equal(logs.some((line) => line.includes('test-secret')), false);
    assert.equal(logs.every((line) => line.includes('[url]')), true);
  } finally {
    console.error = original;
    restoreEnv(saved);
  }
});

test('paid webhook sends one purchase and a replay does not send again', async () => {
  const saved = snapshotEnv();
  const file = path.join(os.tmpdir(), `wvs-analytics-${Date.now()}.json`);
  clearAnalyticsEnv();
  process.env.GA4_MEASUREMENT_ID = 'G-TEST123';
  process.env.GA4_API_SECRET = 'test-secret';
  process.env.META_PIXEL_ID = '1234567890';
  process.env.META_CAPI_ACCESS_TOKEN = 'meta-capi-token-test-value';
  process.env.META_TEST_EVENT_CODE = 'TEST123';
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.ORDER_STORE = 'file';
  process.env.ORDERS_FILE = file;
  process.env.PUBLIC_APP_URL = 'https://westvinylstudio.com';

  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(null, { status: 204 });
  };

  try {
    let captured = null;
    const fakeStripe = {
      checkout: {
        sessions: {
          async create(params) {
            captured = params;
            return { id: 'cs_test_ads', url: 'https://checkout.stripe.com/c/pay/cs_test_ads' };
          },
        },
      },
    };

    const created = await handleCreateCheckoutSession(
      {
        customer,
        orderConfig: decalConfig,
        designSvg,
        origin: 'https://westvinylstudio.com',
        analytics: {
          eventId: 'evt_checkout_1',
          gaClientId: '555.666',
          gclid: 'gclid-123',
          fbc: 'fb.1.10.fb-1',
          fbp: 'fb.1.10.999',
          utmSource: 'google',
          utmMedium: 'cpc',
        },
      },
      { headers: { 'x-forwarded-for': '203.0.113.8', 'user-agent': 'TestAgent/1.0' } },
      fakeStripe,
    );
    assert.equal(created.eventId, 'evt_checkout_1');
    assert.equal(captured.metadata.event_id, 'evt_checkout_1');
    assert.equal(captured.metadata.gclid, 'gclid-123');
    assert.equal(captured.metadata.utm_source, 'google');
    assert.equal(captured.metadata.orderId, created.orderId);
    assert.equal(captured.metadata.orderId === 'evil', false);

    const session = {
      id: 'cs_test_ads',
      payment_status: 'paid',
      amount_total: 1800,
      currency: 'aud',
      metadata: captured.metadata,
      payment_intent: { id: 'pi_test_ads', latest_charge: 'ch_test_ads' },
      customer_details: { email: 'Ada@Example.com' },
    };

    const first = await fulfillCheckoutSession(session);
    assert.equal(first.duplicate, false);
    assert.equal(first.order.status, 'paid');
    assert.equal(first.analytics.ga4, 'sent');
    assert.equal(first.analytics.meta, 'sent');
    assert.equal(calls.length, 2);

    const ga4Call = calls.find((call) => call.url.includes('google-analytics.com'));
    const metaCall = calls.find((call) => call.url.includes('graph.facebook.com'));
    assert.ok(ga4Call);
    assert.ok(metaCall);
    assert.match(ga4Call.url, /measurement_id=G-TEST123/);
    assert.match(ga4Call.url, /api_secret=test-secret/);
    assert.equal(ga4Call.body.events[0].params.transaction_id, created.orderId);
    assert.equal(ga4Call.body.events[0].params.currency, 'AUD');
    assert.equal(ga4Call.body.events[0].params.event_id, 'evt_checkout_1');
    assert.equal(metaCall.body.data[0].event_id, 'evt_checkout_1');
    assert.equal(metaCall.body.data[0].custom_data.currency, 'AUD');
    assert.equal(metaCall.body.test_event_code, 'TEST123');
    assert.equal(metaCall.body.data[0].user_data.fbc, 'fb.1.10.fb-1');
    assert.equal(metaCall.body.data[0].user_data.client_ip_address, '203.0.113.8');
    assert.deepEqual(metaCall.body.data[0].user_data.em, [hashMetaEmail('ada@example.com')]);

    const second = await handleStripeEvent({
      type: 'checkout.session.completed',
      data: { object: session },
    });
    assert.equal(second.fulfilled.duplicate, true);
    assert.equal(calls.length, 2);

    const status = await handleSessionStatus({ orderId: created.orderId });
    assert.equal(status.eventId, 'evt_checkout_1');
    assert.equal(status.status, 'paid');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(saved);
    await fs.unlink(file).catch(() => {});
  }
});
