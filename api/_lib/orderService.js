import {
  calculateOrderTotal,
  catalogIdForProduct,
  checkoutChargeAmount,
  clampQuantity,
  jobSummary,
  moneyString,
  ORDER_CURRENCY,
  quoteOrder,
  smokeCheckoutAmountCents,
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
import { secretEqual, sessionTokenValid } from './adminSession.js';
import { consumeFailedAdminAttempt } from './adminRateLimit.js';
import {
  appendOrder,
  fulfillmentOrderView,
  getOrderById,
  listOrders,
  orderStoreAuthMode,
  orderStoreLocation,
  probeOrderStore,
  publicConfirmation,
  publicOrderView,
  updateOrder,
} from './orderStore.js';
import { getPrivateOrderAsset, persistOrderDesignAssets } from './orderAssets.js';

function presentedBearer(req) {
  const header = String(req.headers?.authorization || req.headers?.Authorization || '');
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return '';
  // Trim both sides: Vercel/.env values often include a trailing newline, and the
  // jobs board trims values before sending Bearer.
  return header.slice(prefix.length).trim();
}

export function adminAuthorized(req) {
  const presented = presentedBearer(req);
  if (!presented) return false;
  const token = String(process.env.ORDERS_ADMIN_TOKEN || '').trim();
  // Always run both checks so a matching admin token does not return early.
  const tokenOk = Boolean(token) && secretEqual(presented, token);
  const sessionOk = sessionTokenValid(presented);
  return tokenOk || sessionOk;
}

export async function handleHealth() {
  const keyShape = stripeSecretKeyShape();
  let smokeAmountCents = null;
  let smokeAmountInvalid = false;
  try {
    smokeAmountCents = smokeCheckoutAmountCents();
  } catch {
    smokeAmountInvalid = true;
  }
  const storeProbe = await probeOrderStore();
  return {
    ok: storeProbe.ok,
    service: 'west-vinyl-orders',
    checkout: {
      stripe: stripeConfigured(),
      unverifiedAllowed: allowUnverifiedOrders(),
      // Temporary live smoke-test total. Unset → the shared size/design quote.
      smokeAmountCents,
      smokeAmountInvalid,
      // Non-secret key shape only — never includes the key value.
      // Uses the same trimmed loader as the Stripe SDK, so whitespace in Vercel
      // env no longer affects runtime or these metrics after deploy.
      stripeKey: {
        prefix: keyShape.prefix,
        length: keyShape.length,
        trimmedLength: keyShape.trimmedLength,
        hasWhitespace: keyShape.hasWhitespace,
      },
    },
    ordersStore: orderStoreLocation(),
    // Non-secret blob diagnostics — never includes token values.
    blob: {
      configured: storeProbe.mode === 'blob',
      auth: orderStoreAuthMode(),
      ok: storeProbe.ok,
      ...(storeProbe.error ? { error: storeProbe.error } : {}),
    },
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

/**
 * Normalize checkout orderConfig from the shared quote.
 * Client amount / unitAmount / quote totals are discarded and recomputed.
 * Apparel keeps productSize when present; sized garments default to M if omitted.
 */
export function normalizeOrderConfig(orderConfig = {}) {
  const result = quoteOrder(orderConfig);
  if (!result.ok) {
    throw Object.assign(new Error(result.error), { status: 400 });
  }
  const { input, quote } = result;
  const quantity = clampQuantity(orderConfig.quantity);
  const orderType = input.product === 'decal' ? 'vinyl' : 'product';
  const vinylPermanent = Boolean(orderConfig.vinylPermanent);
  const next = {
    ...orderConfig,
    orderType,
    quantity,
    vinylPermanent,
    productType: input.product,
    widthCm: input.widthCm,
    heightCm: input.heightCm,
    designType: input.designType,
    textDensity: input.textDensity,
    shippingOption: input.shippingOption,
    quote,
  };
  delete next.amount;
  delete next.unitAmount;
  delete next.total;
  delete next.price;
  delete next.grandTotal;
  delete next.requiresPrep;
  delete next.prep;

  if (orderType === 'vinyl') {
    next.vinylWidthCm = input.widthCm;
    next.vinylHeightCm = input.heightCm;
    if (vinylPermanent) {
      const finish =
        typeof orderConfig.vinylFinish === 'string' && orderConfig.vinylFinish.trim()
          ? orderConfig.vinylFinish.trim()
          : 'matte';
      next.vinylFinish = finish;
    }
  } else {
    const catalogId = catalogIdForProduct(input.product, orderConfig.productId);
    if (catalogId) next.productId = catalogId;
    if (typeof orderConfig.productColor === 'string' && orderConfig.productColor.trim()) {
      next.productColor = orderConfig.productColor.trim();
    }
    const sizedIds = new Set(['tshirt', 'hoodie', 'sloppyJoe', 'babyClothes']);
    const rawSize =
      typeof orderConfig.productSize === 'string' ? orderConfig.productSize.trim() : '';
    if (rawSize) {
      next.productSize = rawSize;
    } else if (sizedIds.has(String(next.productId || ''))) {
      next.productSize = 'M';
    }
  }

  return next;
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

/** Optional PNG data URL captured at checkout for the jobs-board product preview. */
export function normalizeDesignPreviewPng(designPreviewPng) {
  if (designPreviewPng == null || designPreviewPng === '') return '';
  if (typeof designPreviewPng !== 'string' || !designPreviewPng.startsWith('data:image/')) {
    throw Object.assign(new Error('designPreviewPng must be an image data URL'), { status: 400 });
  }
  if (designPreviewPng.length > 2_500_000) {
    throw Object.assign(new Error('designPreviewPng is too large'), { status: 413 });
  }
  return designPreviewPng;
}

async function attachDesignAssets(order, { designSvg, designPreviewPng }) {
  const paths = await persistOrderDesignAssets(order.id, { designSvg, designPreviewPng });
  const patch = {};
  if (paths.designBlobPath) {
    patch.designBlobPath = paths.designBlobPath;
    // Keep the index JSON lean once the cut file lives in private Blob.
    patch.designSvg = '';
  }
  if (paths.previewBlobPath) {
    patch.previewBlobPath = paths.previewBlobPath;
    patch.designPreviewPng = '';
  } else if (designPreviewPng) {
    patch.designPreviewPng = designPreviewPng;
  }
  if (!Object.keys(patch).length) {
    if (designPreviewPng) return { ...order, designPreviewPng };
    return order;
  }
  const updated = await updateOrder(order.id, patch);
  return updated || { ...order, ...patch };
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

function buildPendingOrder({ customer, orderConfig, designSvg, designPreviewPng = '', status, extra = {} }) {
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
    designPreviewPng: designPreviewPng || '',
    designBlobPath: null,
    previewBlobPath: null,
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
  const designPreviewPng = normalizeDesignPreviewPng(payload.designPreviewPng);
  const origin = checkoutReturnOrigin(req, payload);
  const amount = checkoutChargeAmount(orderConfig);

  if (!stripeConfigured()) {
    if (allowUnverifiedOrders()) {
      const order = buildPendingOrder({
        customer,
        orderConfig,
        designSvg,
        designPreviewPng,
        status: 'unverified',
        extra: { amount, paymentIntentId: `LOCAL-${Date.now()}` },
      });
      const saved = await appendOrder(order);
      if (!saved.duplicate) {
        await attachDesignAssets(saved.order, { designSvg, designPreviewPng });
      }
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
    designPreviewPng,
    status: 'pending',
    extra: { amount },
  });
  const saved = await appendOrder(order);
  if (!saved.duplicate) {
    await attachDesignAssets(saved.order, { designSvg, designPreviewPng });
  }

  const session = await createCheckoutSession(
    {
      orderId: saved.order.id,
      orderConfig,
      customerEmail: customer.email,
      successUrl: `${origin}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/order/cancel?orderId=${encodeURIComponent(saved.order.id)}`,
    },
    stripeClient,
  );

  await updateOrder(saved.order.id, { checkoutSessionId: session.id });

  return {
    url: session.url,
    sessionId: session.id,
    orderId: saved.order.id,
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
  const designPreviewPng = normalizeDesignPreviewPng(payload.designPreviewPng);

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
    designPreviewPng,
    designBlobPath: null,
    previewBlobPath: null,
  };

  const saved = await appendOrder(order);
  if (!saved.duplicate) {
    await attachDesignAssets(saved.order, { designSvg, designPreviewPng });
  }
  return {
    order: publicOrderView(saved.order),
    ordersCount: saved.ordersCount,
    duplicate: saved.duplicate,
  };
}

async function requireAdminOrPublicList(req) {
  if (adminAuthorized(req) || process.env.ALLOW_PUBLIC_ORDER_LIST === '1') return;
  if (presentedBearer(req)) await consumeFailedAdminAttempt(req);
  throw Object.assign(new Error('Unauthorized'), { status: 401 });
}

export async function handleListOrders(req) {
  await requireAdminOrPublicList(req);
  const orders = await listOrders();
  return {
    orders: orders.map((entry) => fulfillmentOrderView(entry, { includeDesign: false })),
    store: orderStoreLocation(),
  };
}

export async function handleGetOrder(req, orderId) {
  await requireAdminOrPublicList(req);
  const order = await getOrderById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  return { order: fulfillmentOrderView(order, { includeDesign: true }) };
}

/**
 * Authenticated design / product-preview bytes for the jobs board.
 * Prefer private Blob get(); fall back to inline fields for local/legacy orders.
 */
export async function handleGetOrderAsset(req, orderId, kind, { download = false } = {}) {
  await requireAdminOrPublicList(req);
  const order = await getOrderById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

  if (kind === 'preview') {
    if (order.previewBlobPath) {
      const asset = await getPrivateOrderAsset(order.previewBlobPath);
      if (asset?.buffer?.length) {
        return {
          body: asset.buffer,
          contentType: asset.contentType || 'image/png',
          fileName: `${order.id}-preview.png`,
          download,
        };
      }
    }
    if (typeof order.designPreviewPng === 'string' && order.designPreviewPng.startsWith('data:image/')) {
      const comma = order.designPreviewPng.indexOf(',');
      const buffer = Buffer.from(order.designPreviewPng.slice(comma + 1), 'base64');
      return {
        body: buffer,
        contentType: 'image/png',
        fileName: `${order.id}-preview.png`,
        download,
      };
    }
    throw Object.assign(new Error('No product preview stored for this order'), { status: 404 });
  }

  if (kind === 'design') {
    if (order.designBlobPath) {
      const asset = await getPrivateOrderAsset(order.designBlobPath);
      if (asset?.buffer?.length) {
        return {
          body: asset.buffer,
          contentType: asset.contentType || 'image/svg+xml;charset=utf-8',
          fileName: `${order.id}.svg`,
          download,
        };
      }
    }
    if (typeof order.designSvg === 'string' && order.designSvg.length >= 20) {
      return {
        body: Buffer.from(order.designSvg, 'utf8'),
        contentType: 'image/svg+xml;charset=utf-8',
        fileName: `${order.id}.svg`,
        download,
      };
    }
    throw Object.assign(new Error('No design file stored for this order'), { status: 404 });
  }

  throw Object.assign(new Error('Unknown asset kind'), { status: 400 });
}

const FULFILLMENT_STATUSES = new Set(['new', 'making', 'shipped']);

function fulfillmentWriteAuthorized(req) {
  if (adminAuthorized(req)) return true;
  const token = String(process.env.ORDERS_ADMIN_TOKEN || '').trim();
  // Local server.mjs opens the board when no admin token is configured.
  return (
    !token &&
    (process.env.ALLOW_PUBLIC_ORDER_LIST === '1' || process.env.ALLOW_UNVERIFIED_ORDERS === '1')
  );
}

/** Move a paid job through the shop: new → making → shipped. */
export async function handleSetFulfillment(req, orderId, payload = {}) {
  if (!fulfillmentWriteAuthorized(req)) {
    if (presentedBearer(req)) await consumeFailedAdminAttempt(req);
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }
  const nextStatus = String(payload.fulfillmentStatus || '').trim();
  if (!FULFILLMENT_STATUSES.has(nextStatus)) {
    throw Object.assign(new Error('fulfillmentStatus must be new, making, or shipped'), {
      status: 400,
    });
  }
  const order = await getOrderById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (order.status !== 'paid' && order.status !== 'unverified') {
    throw Object.assign(new Error('Only paid jobs can be updated'), { status: 409 });
  }
  const now = new Date().toISOString();
  const updated = await updateOrder(order.id, {
    fulfillmentStatus: nextStatus,
    fulfillmentUpdatedAt: now,
    ...(nextStatus === 'shipped' ? { shippedAt: now } : {}),
  });
  return { order: fulfillmentOrderView(updated, { includeDesign: false }) };
}

export {
  calculateOrderTotal,
  checkoutChargeAmount,
  clampQuantity,
  jobSummary,
  moneyString,
  ORDER_CURRENCY,
  smokeCheckoutAmountCents,
};
