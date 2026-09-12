import { moneyString, ORDER_CURRENCY } from './orderPricing.js';

function apiBase() {
  return (process.env.PAYPAL_MODE || 'sandbox').toLowerCase() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

export function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export function allowUnverifiedOrders() {
  return process.env.ALLOW_UNVERIFIED_ORDERS === '1';
}

async function accessToken() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('PayPal server credentials are not configured');

  const response = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) {
    throw new Error(`PayPal auth failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()).access_token;
}

async function paypalFetch(pathname, { method = 'GET', body } = {}) {
  const token = await accessToken();
  const response = await fetch(`${apiBase()}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const err = new Error(
      `PayPal ${method} ${pathname} failed (${response.status}): ${data?.message || text || response.statusText}`,
    );
    err.status = response.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export async function createPayPalOrder({ amount, description, referenceId }) {
  return paypalFetch('/v2/checkout/orders', {
    method: 'POST',
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: ORDER_CURRENCY, value: moneyString(amount) },
          description: description || 'West Vinyl Studio order',
          reference_id: referenceId || `WVS-${Date.now()}`,
        },
      ],
    },
  });
}

export async function getPayPalOrder(orderId) {
  return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

export async function capturePayPalOrder(orderId) {
  return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    body: {},
  });
}

/**
 * Fetch (and capture if needed) a PayPal order, then assert COMPLETED + AUD amount.
 * @param {string} paypalOrderId
 * @param {number} expectedAmount
 */
export async function verifyAndCapturePayPalOrder(paypalOrderId, expectedAmount) {
  if (!paypalOrderId || typeof paypalOrderId !== 'string') {
    throw Object.assign(new Error('Missing paypalOrderId'), { status: 400 });
  }

  let order = await getPayPalOrder(paypalOrderId);
  if (order.status === 'APPROVED') {
    order = await capturePayPalOrder(paypalOrderId);
  }
  if (order.status !== 'COMPLETED') {
    throw Object.assign(
      new Error(`PayPal order status is ${order.status || 'unknown'}; expected COMPLETED`),
      { status: 402 },
    );
  }

  const capture = firstCapture(order);
  const value = Number.parseFloat(capture?.amount?.value ?? '');
  const currency = capture?.amount?.currency_code;
  const expected = Number.parseFloat(moneyString(expectedAmount));

  if (currency !== ORDER_CURRENCY) {
    throw Object.assign(new Error(`Unexpected PayPal currency ${currency}`), { status: 402 });
  }
  if (!Number.isFinite(value) || Math.abs(value - expected) > 0.009) {
    throw Object.assign(
      new Error(`PayPal amount ${value} ${currency} does not match expected ${expected} ${ORDER_CURRENCY}`),
      { status: 402 },
    );
  }

  return {
    paypalOrderId,
    captureId: capture?.id || null,
    payerEmail: order.payer?.email_address || null,
    amount: value,
    currency,
    status: order.status,
  };
}

function firstCapture(order) {
  for (const unit of order.purchase_units || []) {
    const capture = unit.payments?.captures?.[0];
    if (capture) return capture;
  }
  return null;
}
