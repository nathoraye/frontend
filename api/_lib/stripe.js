import Stripe from 'stripe';
import {
  jobSummary,
  moneyString,
  ORDER_CURRENCY,
  SHIPPING_COST,
  smokeCheckoutAmountCents,
  unitPriceForConfig,
} from './orderPricing.js';

let stripeClient = null;
let stripeClientKey = null;

const trimmedEnvWarned = new Set();

/**
 * Read a process.env value with surrounding whitespace stripped.
 * Never logs the value. Warns once (name + lengths only) when trimming changes length.
 * @param {string} name
 * @returns {string | undefined}
 */
export function readTrimmedEnv(name) {
  const raw = process.env[name];
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  if (raw.length !== trimmed.length && !trimmedEnvWarned.has(name)) {
    trimmedEnvWarned.add(name);
    console.warn(
      `[env] ${name} had surrounding whitespace (length ${raw.length} -> ${trimmed.length}); using trimmed value`,
    );
  }
  return trimmed;
}

/** Non-secret classification of STRIPE_SECRET_KEY for health/diagnostics. */
export function stripeSecretKeyShape(raw = readTrimmedEnv('STRIPE_SECRET_KEY')) {
  if (raw == null || raw === '') {
    return { present: false, prefix: 'missing', length: 0, trimmedLength: 0, hasWhitespace: false };
  }
  const hasWhitespace = /\s/.test(raw);
  const trimmed = raw.trim();
  let prefix = 'other';
  if (trimmed.startsWith('sk_live_')) prefix = 'sk_live';
  else if (trimmed.startsWith('sk_test_')) prefix = 'sk_test';
  else if (trimmed.startsWith('rk_live_')) prefix = 'rk_live';
  else if (trimmed.startsWith('rk_test_')) prefix = 'rk_test';
  else if (trimmed.startsWith('whsec_')) prefix = 'whsec';
  else if (trimmed.startsWith('pk_')) prefix = 'pk';
  return {
    present: true,
    prefix,
    length: raw.length,
    trimmedLength: trimmed.length,
    hasWhitespace,
  };
}

export function stripeConfigured() {
  const shape = stripeSecretKeyShape();
  return (
    shape.present &&
    shape.trimmedLength > 0 &&
    (shape.prefix === 'sk_live' ||
      shape.prefix === 'sk_test' ||
      shape.prefix === 'rk_live' ||
      shape.prefix === 'rk_test')
  );
}

export function webhookSecretConfigured() {
  return Boolean(readTrimmedEnv('STRIPE_WEBHOOK_SECRET'));
}

export function allowUnverifiedOrders() {
  return process.env.ALLOW_UNVERIFIED_ORDERS === '1';
}

function createFetchStripeClient(apiKey) {
  return new Stripe(apiKey, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: 20000,
  });
}

/**
 * Throw a specific 503 when STRIPE_SECRET_KEY is present but not a usable secret/restricted key.
 * No-op when the key is missing (caller may allow unverified local orders).
 */
export function assertStripeSecretUsable() {
  if (!readTrimmedEnv('STRIPE_SECRET_KEY')) return;
  getStripe();
}

/**
 * Resolve and validate the secret key. Never log the returned value.
 * Uses fetch HTTP client — Node keepAlive agents break on Vercel serverless freezes
 * and surface as StripeConnectionError ("connection to Stripe… retried 2 times").
 */
export function getStripe() {
  const key = readTrimmedEnv('STRIPE_SECRET_KEY');
  if (!key) throw new Error('Stripe secret key is not configured');
  const shape = stripeSecretKeyShape(key);
  if (shape.prefix === 'whsec') {
    throw Object.assign(
      new Error(
        'STRIPE_SECRET_KEY looks like a webhook signing secret (whsec_…). Use the Secret key (sk_live_/sk_test_) or a restricted key (rk_…).',
      ),
      { status: 503 },
    );
  }
  if (shape.prefix === 'pk') {
    throw Object.assign(
      new Error('STRIPE_SECRET_KEY looks like a publishable key (pk_…). Use the Secret key instead.'),
      { status: 503 },
    );
  }
  if (shape.prefix === 'other') {
    throw Object.assign(
      new Error(
        'STRIPE_SECRET_KEY has an unexpected prefix. Expected sk_live_, sk_test_, rk_live_, or rk_test_.',
      ),
      { status: 503 },
    );
  }

  if (!stripeClient || stripeClientKey !== key) {
    stripeClient = createFetchStripeClient(key);
    stripeClientKey = key;
  }
  return stripeClient;
}

/**
 * Stripe client for local webhook signature verification only.
 * Does not require a valid STRIPE_SECRET_KEY — constructEvent never calls the API.
 */
export function getStripeForWebhooks() {
  return createFetchStripeClient('sk_test_webhook_verify_only');
}

/** Attach safe Stripe/network diagnostics onto thrown errors (no secrets). */
export function annotateStripeError(error) {
  if (!error || typeof error !== 'object') return error;
  const detail = error.detail;
  const networkCode =
    detail?.code || detail?.cause?.code || (typeof detail?.errno === 'string' ? detail.errno : null);
  const networkMessage =
    typeof detail?.message === 'string'
      ? detail.message.slice(0, 200)
      : typeof detail?.cause?.message === 'string'
        ? detail.cause.message.slice(0, 200)
        : null;
  error.stripeType = error.type || error.constructor?.name || null;
  error.networkCode = networkCode;
  error.networkMessage = networkMessage;
  if (!error.status && error.type === 'StripeConnectionError') error.status = 502;
  if (!error.status && error.type === 'StripeAuthenticationError') error.status = 502;
  return error;
}

/** Convert AUD dollars to Stripe's smallest currency unit (cents). */
export function toStripeAmount(amount) {
  return Math.round(Number.parseFloat(moneyString(amount)) * 100);
}

export async function createPaymentIntent({ amount, description, metadata = {} }) {
  const stripe = getStripe();
  try {
    return await stripe.paymentIntents.create({
      amount: toStripeAmount(amount),
      currency: ORDER_CURRENCY.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      description: description || 'West Vinyl Studio order',
      metadata,
    });
  } catch (error) {
    throw annotateStripeError(error);
  }
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
  const smokeCents = smokeCheckoutAmountCents();
  const lineItems =
    smokeCents != null
      ? [
          {
            quantity: 1,
            price_data: {
              currency: ORDER_CURRENCY.toLowerCase(),
              unit_amount: smokeCents,
              product_data: {
                name: productName,
                description: jobSummary(orderConfig).slice(0, 500),
              },
            },
          },
        ]
      : [
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
        ];

  try {
    return await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customerEmail,
      client_reference_id: orderId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Customer-facing Checkout name. Account business_profile.name is still
      // "West Vinyl co" in the Dashboard; this overrides the hosted pay page.
      // Button color is dark enough for Stripe's white-label contrast check.
      branding_settings: {
        display_name: 'West Vinyl Studio',
        button_color: '#7A1040',
        background_color: '#ffffff',
        border_style: 'rounded',
      },
      custom_text: {
        submit: {
          message:
            'Custom vinyl and iron-on orders are made after payment. Questions: nathanriant@gmail.com',
        },
      },
      line_items: lineItems,
      metadata: {
        orderId,
        orderType,
        quantity: String(quantity),
        ...(smokeCents != null ? { smokeCheckoutAmountCents: String(smokeCents) } : {}),
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
  } catch (error) {
    throw annotateStripeError(error);
  }
}

export async function retrieveCheckoutSession(sessionId, stripeClientOverride = null) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw Object.assign(new Error('Missing Checkout Session id'), { status: 400 });
  }
  const stripe = stripeClientOverride || getStripe();
  try {
    return await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
  } catch (error) {
    throw annotateStripeError(error);
  }
}

export function constructWebhookEvent(rawBody, signature, stripeClientOverride = null) {
  const secret = readTrimmedEnv('STRIPE_WEBHOOK_SECRET');
  if (!secret) {
    throw Object.assign(new Error('STRIPE_WEBHOOK_SECRET is not configured'), { status: 503 });
  }
  if (!signature) {
    throw Object.assign(new Error('Missing Stripe-Signature header'), { status: 400 });
  }
  // Signature verify is local crypto — do not require a valid API secret key.
  const stripe = stripeClientOverride || getStripeForWebhooks();
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
  let intent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    throw annotateStripeError(error);
  }

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
