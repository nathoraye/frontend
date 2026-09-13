import Stripe from 'stripe';
import { moneyString, ORDER_CURRENCY } from './orderPricing.js';

let stripeClient = null;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function allowUnverifiedOrders() {
  return process.env.ALLOW_UNVERIFIED_ORDERS === '1';
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe secret key is not configured');
  if (!stripeClient || stripeClient._apiKey !== key) {
    stripeClient = new Stripe(key);
    stripeClient._apiKey = key;
  }
  return stripeClient;
}

/** Convert AUD dollars to Stripe's smallest currency unit (cents). */
export function toStripeAmount(amount) {
  return Math.round(Number.parseFloat(moneyString(amount)) * 100);
}

export async function createPaymentIntent({ amount, description, metadata = {} }) {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount: toStripeAmount(amount),
    currency: ORDER_CURRENCY.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    description: description || 'West Vinyl Studio order',
    metadata,
  });
}

/**
 * Retrieve a PaymentIntent and assert it succeeded for the expected AUD amount.
 * @param {string} paymentIntentId
 * @param {number} expectedAmount
 */
export async function verifyPaymentIntent(paymentIntentId, expectedAmount, stripeClient = null) {
  if (!paymentIntentId || typeof paymentIntentId !== 'string') {
    throw Object.assign(new Error('Missing paymentIntentId'), { status: 400 });
  }

  const stripe = stripeClient || getStripe();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (intent.status !== 'succeeded') {
    throw Object.assign(
      new Error(`Stripe payment status is ${intent.status || 'unknown'}; expected succeeded`),
      { status: 402 },
    );
  }

  const expectedCents = toStripeAmount(expectedAmount);
  const currency = (intent.currency || '').toUpperCase();
  if (currency !== ORDER_CURRENCY) {
    throw Object.assign(new Error(`Unexpected Stripe currency ${currency}`), { status: 402 });
  }
  if (intent.amount !== expectedCents) {
    throw Object.assign(
      new Error(
        `Stripe amount ${intent.amount} ${currency} does not match expected ${expectedCents} ${ORDER_CURRENCY}`,
      ),
      { status: 402 },
    );
  }

  const chargeId =
    typeof intent.latest_charge === 'string'
      ? intent.latest_charge
      : intent.latest_charge?.id || null;

  return {
    paymentIntentId: intent.id,
    chargeId,
    payerEmail: intent.receipt_email || null,
    amount: Number.parseFloat(moneyString(expectedAmount)),
    currency: ORDER_CURRENCY,
    status: 'SUCCEEDED',
  };
}

