import {
  calculateOrderTotal,
  clampQuantity,
  moneyString,
  ORDER_CURRENCY,
  PERMANENT_SURCHARGE,
  SHIPPING_COST,
  UNIT_PRICES,
} from './orderPricing.js';
import {
  allowUnverifiedOrders,
  createPaymentIntent,
  stripeConfigured,
  verifyPaymentIntent,
} from './stripe.js';
import { appendOrder, listOrders, publicOrderView } from './orderStore.js';

export function adminAuthorized(req) {
  const token = process.env.ORDERS_ADMIN_TOKEN;
  if (!token) return false;
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  return header === `Bearer ${token}`;
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

/** Create a Stripe PaymentIntent (or local unverified stub) for the trusted price. */
export async function handleCreatePaymentIntent(payload = {}) {
  const orderConfig = normalizeOrderConfig(payload.orderConfig || {});
  const amount = calculateOrderTotal(orderConfig);

  if (!stripeConfigured()) {
    if (!allowUnverifiedOrders()) {
      throw Object.assign(
        new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.'),
        { status: 503 },
      );
    }
    return {
      id: `LOCAL-${Date.now()}`,
      clientSecret: null,
      status: 'requires_payment_method',
      amount: moneyString(amount),
      currency: ORDER_CURRENCY,
      unverified: true,
    };
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

export async function handleSubmitOrder(payload = {}) {
  const customer = normalizeCustomer(payload.customer);
  const orderConfig = normalizeOrderConfig(payload.orderConfig || {});
  const designSvg = typeof payload.designSvg === 'string' ? payload.designSvg : '';
  if (!designSvg || designSvg.length < 20) {
    throw Object.assign(new Error('designSvg is required'), { status: 400 });
  }
  if (designSvg.length > 2_500_000) {
    throw Object.assign(new Error('designSvg is too large'), { status: 413 });
  }

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
    id: `ord-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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

export async function handleListOrders(req) {
  if (!adminAuthorized(req) && process.env.ALLOW_PUBLIC_ORDER_LIST !== '1') {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }
  const orders = await listOrders();
  return {
    orders: orders.map((entry) => ({
      ...publicOrderView(entry),
      customerEmail: entry.customer?.email,
      paymentIntentId: entry.paymentIntentId || entry.paypalOrderId || null,
    })),
  };
}

export {
  calculateOrderTotal,
  clampQuantity,
  moneyString,
  ORDER_CURRENCY,
  PERMANENT_SURCHARGE,
  SHIPPING_COST,
  UNIT_PRICES,
};
