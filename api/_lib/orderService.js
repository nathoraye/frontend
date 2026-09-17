import {
  calculateOrderTotal,
  checkoutChargeAmount,
  clampQuantity,
  jobSummary,
  moneyString,
  ORDER_CURRENCY,
  PERMANENT_SURCHARGE,
  SHIPPING_COST,
  smokeCheckoutAmountCents,
  UNIT_PRICES,
} from './orderPricing.js';
import {
  allowUnverifiedOrders,
  assertStripeSecretUsable,
  constructWebhookEvent,
  createCheckoutSession,
  createPaymentIntent,
  retrieveCheckoutSession,
  stripeConfigured,
  stripeSecretKeyShape,
  toStripeAmount,
  verifyPaymentIntent,
} from './stripe.js';
import {
  appendOrder,
  fulfillmentOrderView,
  getOrderById,
  listOrders,
  orderStoreLocation,
  publicConfirmation,
  publicOrderView,
  updateOrder,
} from './orderStore.js';

export function adminAuthorized(req) {
  const token = process.env.ORDERS_ADMIN_TOKEN;
  if (!token) return false;
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  return header === `Bearer ${token}`;
}

export function handleHealth() {
  const keyShape = stripeSecretKeyShape();
  let smokeAmountCents = null;
  let smokeAmountInvalid = false;
  try {
    smokeAmountCents = smokeCheckoutAmountCents();
  } catch {
    smokeAmountInvalid = true;
  }
  return {
    ok: true,
    service: 'west-vinyl-orders',
    checkout: {
      stripe: stripeConfigured(),
      unverifiedAllowed: allowUnverifiedOrders(),
      // Temporary live smoke-test total. Unset → retail (e.g. A$18.98 vinyl).
      smokeAmountCents,
      smokeAmountInvalid,
      // Non-secret key shape only — never includes the key value.
      stripeKey: {
        prefix: keyShape.prefix,
        length: keyShape.length,
        trimmedLength: keyShape.trimmedLength,
        hasWhitespace: keyShape.hasWhitespace,
      },
    },
    ordersStore: orderStoreLocation(),
  };
}

export function normalizeCustomer(customer = {}) {
  const required = ['fullName', 'email', 'street', 'city', 'state', 'postcode', 'country'];
  for (const key of required) {
    if (!customer[key] || typeof customer[key] !== 'string' || !customer[key].trim()) {
      throw Object.assign(new Error(`Missing customer.${key}`), { status: 400 });
    }
  }
  return {
    fullName: customer.fullName.trim(),
    email: customer.email.trim(),
    phone: typeof customer.phone === 'string' ? customer.phone.trim() : undefined,
    street: customer.street.trim(),
    city: customer.city.trim(),
    state: customer.state.trim(),
    postcode: customer.postcode.trim(),
    country: customer.country.trim(),
  };
}

export function normalizeOrderConfig(orderConfig = {}) {
  return {
    ...orderConfig,
    orderType: orderConfig.orderType === 'product' ? 'product' : 'vinyl',
    quantity: clampQuantity(orderConfig.quantity),
    vinylPermanent: Boolean(orderConfig.vinylPermanent),
  };
}

export function requireDesignSvg(designSvg) {
  if (typeof designSvg !== 'string' || designSvg.length < 20) {
    throw Object.assign(new Error('designSvg is required'), { status: 400 });
  }
  if (designSvg.length > 2_500_000) {
    throw Object.assign(new Error('designSvg is too large'), { status: 413 });
  }
  return designSvg;
}

function newOrderId() {
  return `ord-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function checkoutReturnOrigin(req = {}, payload = {}) {
  const envUrl = process.env.PUBLIC_APP_URL;
  if (envUrl) return String(envUrl).replace(/\/$/, '');
  const fromClient = payload.origin;
  if (typeof fromClient === 'string' && fromClient.length < 200) {
    try {
      const url = new URL(fromClient);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
    } catch {
      // ignore invalid origin
    }
  }
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${String(vercel).replace(/^https?:\/\//, '')}`;
  const proto = req.headers?.['x-forwarded-proto'] || 'http';
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'localhost:5173';
  return `${proto}://${host}`;
}

function buildPendingOrder({ customer, orderConfig, designSvg, status, extra = {} }) {
  const amount = extra.amount ?? checkoutChargeAmount(orderConfig);
  return {
    id: newOrderId(),
    createdAt: new Date().toISOString(),
    status,
    amount,
    currency: ORDER_CURRENCY,
    customer,
    orderConfig,
    designSvg,
    checkoutSessionId: null,
    paymentIntentId: null,
    chargeId: null,
    payerEmail: null,
    ...extra,
  };
}

/** Create a Stripe PaymentIntent (or local unverified stub) for the trusted price. */
export async function handleCreatePaymentIntent(payload = {}) {
  const orderConfig = normalizeOrderConfig(payload.orderConfig || {});
  const amount = calculateOrderTotal(orderConfig);

  if (!stripeConfigured()) {
    if (allowUnverifiedOrders()) {
      return {
        id: `LOCAL-${Date.now()}`,
        clientSecret: null,
        status: 'requires_payment_method',
        amount: moneyString(amount),
        currency: ORDER_CURRENCY,
        unverified: true,
      };
    }
    // Present-but-wrong prefixes (e.g. whsec_) get a specific 503 from getStripe().
    assertStripeSecretUsable();
    throw Object.assign(
      new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.'),
      { status: 503 },
    );
  }

  const intent = await createPaymentIntent({
    amount,
    description: `West Vinyl Studio - ${orderConfig.orderType}`,
    metadata: {
      orderType: String(orderConfig.orderType || 'vinyl'),
      quantity: String(orderConfig.quantity || 1),
    },
  });

  return {
    id: intent.id,
    clientSecret: intent.client_secret,
    status: intent.status,
    amount: moneyString(amount),
    currency: ORDER_CURRENCY,
  };
}

/**
 * Persist the design job, then return a Stripe Checkout URL (or a local success URL).
 */
export async function handleCreateCheckoutSession(payload = {}, req = {}, stripeClient = null) {
  const customer = normalizeCustomer(payload.customer);
  const orderConfig = normalizeOrderConfig(payload.orderConfig || {});
  const designSvg = requireDesignSvg(payload.designSvg);
  const origin = checkoutReturnOrigin(req, payload);
  const amount = checkoutChargeAmount(orderConfig);

  if (!stripeConfigured()) {
    if (allowUnverifiedOrders()) {
      const order = buildPendingOrder({
        customer,
        orderConfig,
        designSvg,
        status: 'unverified',
        extra: { amount, paymentIntentId: `LOCAL-${Date.now()}` },
      });
      const saved = await appendOrder(order);
      return {
        url: `${origin}/order/success?orderId=${encodeURIComponent(saved.order.id)}&local=1`,
        sessionId: null,
        orderId: saved.order.id,
        amount: moneyString(amount),
        currency: ORDER_CURRENCY,
        unverified: true,
      };
    }
    // Present-but-wrong prefixes (e.g. whsec_) get a specific 503 from getStripe().
    assertStripeSecretUsable();
    throw Object.assign(
      new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.'),
      { status: 503 },
    );
  }

  const order = buildPendingOrder({
    customer,
    orderConfig,
    designSvg,
    status: 'pending',
    extra: { amount },
  });
  await appendOrder(order);

  const session = await createCheckoutSession(
    {
      orderId: order.id,
      orderConfig,
      customerEmail: customer.email,
      successUrl: `${origin}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/order/cancel?orderId=${encodeURIComponent(order.id)}`,
    },
    stripeClient,
  );

  await updateOrder(order.id, { checkoutSessionId: session.id });

  return {
    url: session.url,
    sessionId: session.id,
    orderId: order.id,
    amount: moneyString(amount),
    currency: ORDER_CURRENCY,
  };
}

export async function fulfillCheckoutSession(session) {
  const orderId = session?.metadata?.orderId || session?.client_reference_id;
  if (!orderId) {
    throw Object.assign(new Error('Checkout session is missing orderId'), { status: 400 });
  }

  const order = await getOrderById(orderId);
  if (!order) {
    throw Object.assign(new Error('Order not found for checkout session'), { status: 404 });
  }

  if (session.payment_status && session.payment_status !== 'paid') {
    return { order, deferred: true };
  }

  if (session.amount_total != null) {
    const expectedCents = toStripeAmount(order.amount);
    if (session.amount_total !== expectedCents) {
      throw Object.assign(
        new Error(
          `Stripe amount ${session.amount_total} does not match expected ${expectedCents} ${ORDER_CURRENCY}`,
        ),
        { status: 402 },
      );
    }
  }

  if (session.currency) {
    const currency = String(session.currency).toUpperCase();
    if (currency !== ORDER_CURRENCY) {
      throw Object.assign(new Error(`Unexpected Stripe currency ${currency}`), { status: 402 });
    }
  }

  if (order.status === 'paid') {
    return { order, duplicate: true };
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || order.paymentIntentId || null;

  const latestCharge = session.payment_intent?.latest_charge;
  const chargeId =
    typeof latestCharge === 'string' ? latestCharge : latestCharge?.id || order.chargeId || null;

  const updated = await updateOrder(order.id, {
    status: 'paid',
    paidAt: order.paidAt || new Date().toISOString(),
    checkoutSessionId: session.id || order.checkoutSessionId,
    paymentIntentId,
    chargeId,
    payerEmail:
      session.customer_details?.email || session.customer_email || order.payerEmail || null,
  });

  return { order: updated, duplicate: false };
}

export async function expireCheckoutSession(session) {
  const orderId = session?.metadata?.orderId || session?.client_reference_id;
  if (!orderId) return { ignored: true };
  const order = await getOrderById(orderId);
  if (!order || order.status !== 'pending') return { order, ignored: true };
  const updated = await updateOrder(order.id, {
    status: 'cancelled',
    checkoutSessionId: session.id || order.checkoutSessionId,
  });
  return { order: updated, cancelled: true };
}

export async function handleStripeEvent(event) {
  switch (event?.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return { fulfilled: await fulfillCheckoutSession(event.data.object) };
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      return { expired: await expireCheckoutSession(event.data.object) };
    default:
      return { ignored: event?.type || 'unknown' };
  }
}

export async function handleStripeWebhookRequest(req, rawBody, stripeClient = null) {
  const signature = req.headers?.['stripe-signature'] || req.headers?.['Stripe-Signature'];
  const event = constructWebhookEvent(rawBody, signature, stripeClient);
  try {
    const result = await handleStripeEvent(event);
    return { received: true, type: event.type, ...result };
  } catch (error) {
    if (error.status === 404) {
      return { received: true, type: event.type, error: error.message };
    }
    throw error;
  }
}

/** Success-page backup: retrieve the session from Stripe and fulfill if paid. */
export async function handleSessionStatus(query = {}, stripeClient = null) {
  const sessionId = query.session_id || query.sessionId;
  const orderId = query.orderId || query.order_id;

  if (sessionId) {
    if (!stripeConfigured()) {
      throw Object.assign(new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.'), {
        status: 503,
      });
    }
    const session = await retrieveCheckoutSession(sessionId, stripeClient);
    const result = await fulfillCheckoutSession(session);
    return {
      ...publicConfirmation(result.order),
      sessionStatus: session.status,
      paymentStatus: session.payment_status,
      duplicate: result.duplicate || false,
      deferred: result.deferred || false,
    };
  }

  if (orderId) {
    const order = await getOrderById(orderId);
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
    return publicConfirmation(order);
  }

  throw Object.assign(new Error('Missing session_id or orderId'), { status: 400 });
}

export async function handleSubmitOrder(payload = {}) {
  const customer = normalizeCustomer(payload.customer);
  const orderConfig = normalizeOrderConfig(payload.orderConfig || {});
  const designSvg = requireDesignSvg(payload.designSvg);

  const paymentIntentId = payload.paymentIntentId;
  const expectedAmount = calculateOrderTotal(orderConfig);
  let payment;
  if (stripeConfigured()) {
    payment = await verifyPaymentIntent(paymentIntentId, expectedAmount);
  } else if (allowUnverifiedOrders()) {
    payment = {
      paymentIntentId: paymentIntentId || `LOCAL-${Date.now()}`,
      chargeId: null,
      payerEmail: null,
      amount: expectedAmount,
      currency: ORDER_CURRENCY,
      status: 'UNVERIFIED',
    };
  } else {
    throw Object.assign(
      new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.'),
      { status: 503 },
    );
  }

  const order = {
    id: newOrderId(),
    createdAt: new Date().toISOString(),
    status: payment.status === 'SUCCEEDED' ? 'paid' : 'unverified',
    paymentIntentId: payment.paymentIntentId,
    chargeId: payment.chargeId,
    payerEmail: payment.payerEmail,
    amount: payment.amount,
    currency: payment.currency,
    customer,
    orderConfig,
    designSvg,
  };

  const saved = await appendOrder(order);
  return {
    order: publicOrderView(saved.order),
    ordersCount: saved.ordersCount,
    duplicate: saved.duplicate,
  };
}

function requireAdminOrPublicList(req) {
  if (!adminAuthorized(req) && process.env.ALLOW_PUBLIC_ORDER_LIST !== '1') {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }
}

export async function handleListOrders(req) {
  requireAdminOrPublicList(req);
  const orders = await listOrders();
  return {
    orders: orders.map((entry) => fulfillmentOrderView(entry, { includeDesign: false })),
    store: orderStoreLocation(),
  };
}

export async function handleGetOrder(req, orderId) {
  requireAdminOrPublicList(req);
  const order = await getOrderById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  return { order: fulfillmentOrderView(order, { includeDesign: true }) };
}

export {
  calculateOrderTotal,
  checkoutChargeAmount,
  clampQuantity,
  jobSummary,
  moneyString,
  ORDER_CURRENCY,
  PERMANENT_SURCHARGE,
  SHIPPING_COST,
  smokeCheckoutAmountCents,
  UNIT_PRICES,
};
