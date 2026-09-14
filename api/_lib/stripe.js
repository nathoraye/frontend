import Stripe from 'stripe';
import {
  jobSummary,
  moneyString,
  ORDER_CURRENCY,
  SHIPPING_COST,
  unitPriceForConfig,
} from './orderPricing.js';

let stripeClient = null;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function webhookSecretConfigured() {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
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
 * Hosted Stripe Checkout Session for a one-time merchandise payment.
 * Omits payment_method_types so Dashboard dynamic methods apply.
 */
export async function createCheckoutSession(
  { orderId, orderConfig, customerEmail, successUrl, cancelUrl, metadata = {} },
  stripeClientOverride = null,
) {
  const stripe = stripeClientOverride || getStripe();
  const orderType = orderConfig.orderType === 'product' ? 'product' : 'vinyl';
  const quantity = Number(orderConfig.quantity) || 1;
  const unit = unitPriceForConfig(orderConfig);
  const productName =
    orderType === 'product'
      ? `Custom ${String(orderConfig.productId || 'apparel')}`
      : 'Custom vinyl sticker';

  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: customerEmail,
    client_reference_id: orderId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [
      {
        quantity,
        price_data: {
          currency: ORDER_CURRENCY.toLowerCase(),
          unit_amount: toStripeAmount(unit),
          product_data: {
            name: productName,
            description: jobSummary(orderConfig).slice(0, 500),
          },
        },
      },
      {
        quantity: 1,
        price_data: {
          currency: ORDER_CURRENCY.toLowerCase(),
          unit_amount: toStripeAmount(SHIPPING_COST),
          product_data: { name: 'Shipping' },
        },
      },
    ],
    metadata: {
      orderId,
      orderType,
      quantity: String(quantity),
      ...metadata,
    },
    payment_intent_data: {
      description: `West Vinyl Studio - ${orderType}`,
      metadata: {
        orderId,
        orderType,
      },
    },
  });
}

export async function retrieveCheckoutSession(sessionId, stripeClientOverride = null) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw Object.assign(new Error('Missing Checkout Session id'), { status: 400 });
  }
  const stripe = stripeClientOverride || getStripe();
  return stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
}

export function constructWebhookEvent(rawBody, signature, stripeClientOverride = null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw Object.assign(new Error('STRIPE_WEBHOOK_SECRET is not configured'), { status: 503 });
  }
  if (!signature) {
    throw Object.assign(new Error('Missing Stripe-Signature header'), { status: 400 });
  }
  const stripe = stripeClientOverride || getStripe();
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw Object.assign(new Error('Invalid Stripe webhook signature'), { status: 400 });
  }
}

/**
 * Retrieve a PaymentIntent and assert it succeeded for the expected AUD amount.
 * @param {string} paymentIntentId
 * @param {number} expectedAmount
 */
export async function verifyPaymentIntent(paymentIntentId, expectedAmount, stripeClientOverride = null) {
  if (!paymentIntentId || typeof paymentIntentId !== 'string') {
    throw Object.assign(new Error('Missing paymentIntentId'), { status: 400 });
  }

  const stripe = stripeClientOverride || getStripe();
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
