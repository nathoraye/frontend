import assert from 'node:assert/strict';
import test from 'node:test';
import Stripe from 'stripe';
import { handleHealth } from '../api/_lib/orderService.js';
import {
  constructWebhookEvent,
  getStripe,
  readTrimmedEnv,
  stripeConfigured,
  stripeSecretKeyShape,
  toStripeAmount,
  verifyPaymentIntent,
} from '../api/_lib/stripe.js';

test('toStripeAmount converts AUD dollars to cents', () => {
  assert.equal(toStripeAmount(18.98), 1898);
  assert.equal(toStripeAmount('12.99'), 1299);
});

test('stripeSecretKeyShape classifies prefixes without exposing secrets', () => {
  assert.deepEqual(stripeSecretKeyShape(''), {
    present: false,
    prefix: 'missing',
    length: 0,
    trimmedLength: 0,
    hasWhitespace: false,
  });
  assert.equal(stripeSecretKeyShape('sk_live_abc').prefix, 'sk_live');
  assert.equal(stripeSecretKeyShape('  sk_test_abc\n').prefix, 'sk_test');
  assert.equal(stripeSecretKeyShape('  sk_test_abc\n').hasWhitespace, true);
  assert.equal(stripeSecretKeyShape('rk_live_abc').prefix, 'rk_live');
  assert.equal(stripeSecretKeyShape('whsec_abc').prefix, 'whsec');
  assert.equal(stripeSecretKeyShape('pk_live_abc').prefix, 'pk');
  assert.equal(stripeSecretKeyShape('not-a-key').prefix, 'other');
});

test('stripeConfigured rejects webhook, publishable, and other key shapes', () => {
  const prev = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'whsec_oops';
  assert.equal(stripeConfigured(), false);
  process.env.STRIPE_SECRET_KEY = 'pk_live_oops';
  assert.equal(stripeConfigured(), false);
  process.env.STRIPE_SECRET_KEY = 'garbage';
  assert.equal(stripeConfigured(), false);
  process.env.STRIPE_SECRET_KEY = 'sk_live_ok';
  assert.equal(stripeConfigured(), true);
  process.env.STRIPE_SECRET_KEY = 'rk_test_ok';
  assert.equal(stripeConfigured(), true);
  if (prev === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = prev;
});

test('verifyPaymentIntent rejects amount mismatch', async () => {
  const fakeStripe = {
    paymentIntents: {
      async retrieve() {
        return {
          id: 'pi_1',
          status: 'succeeded',
          amount: 100,
          currency: 'aud',
          latest_charge: 'ch_1',
          receipt_email: null,
        };
      },
    },
  };

  await assert.rejects(
    () => verifyPaymentIntent('pi_1', 18.98, fakeStripe),
    (err) => err.status === 402 && /does not match expected/.test(err.message),
  );
});

test('verifyPaymentIntent accepts matching succeeded intent', async () => {
  const fakeStripe = {
    paymentIntents: {
      async retrieve() {
        return {
          id: 'pi_2',
          status: 'succeeded',
          amount: 1898,
          currency: 'aud',
          latest_charge: 'ch_2',
          receipt_email: 'buyer@example.com',
        };
      },
    },
  };

  const result = await verifyPaymentIntent('pi_2', 18.98, fakeStripe);
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.amount, 18.98);
  assert.equal(result.chargeId, 'ch_2');
  assert.equal(result.payerEmail, 'buyer@example.com');
});

test('constructWebhookEvent verifies a Stripe-signed payload', () => {
  const secret = 'whsec_test_checkout';
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  const payload = JSON.stringify({
    id: 'evt_test',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test' } },
  });
  const stripe = new Stripe('sk_test_dummy');
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const event = constructWebhookEvent(payload, signature);
  assert.equal(event.type, 'checkout.session.completed');
  assert.equal(event.data.object.id, 'cs_test');

  assert.throws(
    () => constructWebhookEvent(payload, 't=1,v1=bad'),
    (err) => err.status === 400,
  );
});

test('constructWebhookEvent works when STRIPE_SECRET_KEY is a webhook secret', () => {
  const secret = 'whsec_test_checkout';
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  process.env.STRIPE_SECRET_KEY = 'whsec_misplaced_as_api_key';
  const payload = JSON.stringify({
    id: 'evt_test2',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test2' } },
  });
  const stripe = new Stripe('sk_test_dummy');
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const event = constructWebhookEvent(payload, signature);
  assert.equal(event.type, 'checkout.session.completed');
});

test('getStripe rejects whsec prefix with a specific 503', () => {
  const prev = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'whsec_oops';
  assert.throws(
    () => getStripe(),
    (err) => err.status === 503 && /webhook signing secret/.test(err.message),
  );
  if (prev === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = prev;
});

test('trimmed env loader is used by health and Stripe clients without logging secrets', () => {
  const prevSecret = process.env.STRIPE_SECRET_KEY;
  const prevWebhook = process.env.STRIPE_WEBHOOK_SECRET;
  const warns = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warns.push(args.map(String).join(' '));
  };

  try {
    process.env.STRIPE_SECRET_KEY = ' sk_test_dummy\n';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_checkout ';

    const key = readTrimmedEnv('STRIPE_SECRET_KEY');
    const webhook = readTrimmedEnv('STRIPE_WEBHOOK_SECRET');
    assert.equal(key, 'sk_test_dummy');
    assert.equal(webhook, 'whsec_test_checkout');

    const joined = warns.join('\n');
    assert.match(joined, /STRIPE_SECRET_KEY had surrounding whitespace \(length 15 -> 13\)/);
    assert.match(joined, /STRIPE_WEBHOOK_SECRET had surrounding whitespace \(length 21 -> 20\)/);
    assert.equal(joined.includes('sk_test_dummy'), false);
    assert.equal(joined.includes('whsec_test_checkout'), false);

    const shape = stripeSecretKeyShape();
    assert.equal(shape.prefix, 'sk_test');
    assert.equal(shape.hasWhitespace, false);
    assert.equal(shape.length, shape.trimmedLength);
    assert.equal(shape.length, 'sk_test_dummy'.length);
    assert.equal(stripeConfigured(), true);

    const health = handleHealth();
    assert.equal(health.checkout.stripe, true);
    assert.equal(health.checkout.stripeKey.hasWhitespace, false);
    assert.equal(health.checkout.stripeKey.length, health.checkout.stripeKey.trimmedLength);
    assert.equal(health.checkout.stripeKey.prefix, 'sk_test');

    assert.ok(getStripe());

    const payload = JSON.stringify({
      id: 'evt_trim',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_trim' } },
    });
    const stripe = new Stripe('sk_test_dummy');
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_test_checkout',
    });
    const event = constructWebhookEvent(payload, signature);
    assert.equal(event.data.object.id, 'cs_trim');
  } finally {
    console.warn = originalWarn;
    if (prevSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = prevSecret;
    if (prevWebhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = prevWebhook;
  }
});
