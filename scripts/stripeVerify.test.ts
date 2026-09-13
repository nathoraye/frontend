import assert from 'node:assert/strict';
import test from 'node:test';
import { toStripeAmount, verifyPaymentIntent } from '../api/_lib/stripe.js';

test('toStripeAmount converts AUD dollars to cents', () => {
  assert.equal(toStripeAmount(18.98), 1898);
  assert.equal(toStripeAmount('12.99'), 1299);
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
