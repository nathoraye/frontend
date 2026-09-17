import assert from 'node:assert/strict';
import test from 'node:test';
import Stripe from 'stripe';
import {
  constructWebhookEvent,
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
