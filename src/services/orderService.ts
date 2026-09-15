const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export interface OrderCustomer {
  fullName: string;
  email: string;
  phone?: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
}

export interface OrderSubmissionPayload {
  paymentIntentId: string;
  customer: OrderCustomer;
  orderConfig: Record<string, unknown>;
  designSvg: string;
}

export interface OrderSubmissionResult {
  order: {
    id: string;
    createdAt: string;
    status?: string;
    amount?: number;
    currency?: string;
    [key: string]: unknown;
  };
  ordersCount: number;
  duplicate?: boolean;
}

export interface CreatePaymentIntentResult {
  id: string;
  clientSecret?: string | null;
  status?: string;
  amount?: string;
  currency?: string;
  unverified?: boolean;
}

export interface CreateCheckoutSessionPayload {
  customer: OrderCustomer;
  orderConfig: Record<string, unknown>;
  designSvg: string;
  origin?: string;
}

export interface CreateCheckoutSessionResult {
  url: string;
  sessionId?: string | null;
  orderId: string;
  amount?: string;
  currency?: string;
  unverified?: boolean;
}

export interface CheckoutHealth {
  ok: boolean;
  service?: string;
  checkout?: {
    stripe?: boolean;
    unverifiedAllowed?: boolean;
  };
  ordersStore?: string;
}

export interface SessionStatusResult {
  orderId: string;
  status: string;
  amount?: number;
  currency?: string;
  orderType?: string;
  email?: string | null;
  createdAt?: string;
  paidAt?: string | null;
  unverified?: boolean;
  sessionStatus?: string;
  paymentStatus?: string;
}

export interface FulfillmentOrder {
  id: string;
  createdAt: string;
  paidAt?: string | null;
  status?: string;
  amount?: number;
  currency?: string;
  orderType?: string;
  customer?: OrderCustomer | null;
  orderConfig?: Record<string, unknown> | null;
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  chargeId?: string | null;
  payerEmail?: string | null;
  hasDesign?: boolean;
  designSvg?: string;
}

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (data?.error) return String(data.error);
  } catch {
    // fall through
  }
  return (await response.text()) || `Request failed (${response.status})`;
}

export async function fetchCheckoutHealth(): Promise<CheckoutHealth> {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<CheckoutHealth>;
}

/** Ask the server to create a Stripe PaymentIntent for the trusted price of orderConfig. */
export async function createPaymentIntentCheckout(
  orderConfig: Record<string, unknown>,
): Promise<CreatePaymentIntentResult> {
  const response = await fetch(`${API_BASE_URL}/api/stripe/create-payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderConfig }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<CreatePaymentIntentResult>;
}

/** Persist design + shipping, then return a Stripe Checkout URL (or local success URL). */
export async function createCheckoutSession(
  payload: CreateCheckoutSessionPayload,
): Promise<CreateCheckoutSessionResult> {
  const response = await fetch(`${API_BASE_URL}/api/stripe/create-checkout-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, origin: payload.origin || window.location.origin }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<CreateCheckoutSessionResult>;
}

export async function fetchSessionStatus(params: {
  sessionId?: string | null;
  orderId?: string | null;
}): Promise<SessionStatusResult> {
  const query = new URLSearchParams();
  if (params.sessionId) query.set('session_id', params.sessionId);
  if (params.orderId) query.set('orderId', params.orderId);
  const response = await fetch(`${API_BASE_URL}/api/stripe/session-status?${query.toString()}`);
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<SessionStatusResult>;
}

export async function listFulfillmentOrders(adminToken?: string): Promise<{
  orders: FulfillmentOrder[];
  store?: string;
}> {
  const headers: Record<string, string> = {};
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  const response = await fetch(`${API_BASE_URL}/api/orders`, { headers });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{ orders: FulfillmentOrder[]; store?: string }>;
}

export async function getFulfillmentOrder(
  orderId: string,
  adminToken?: string,
): Promise<{ order: FulfillmentOrder }> {
  const headers: Record<string, string> = {};
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  const response = await fetch(`${API_BASE_URL}/api/orders/${encodeURIComponent(orderId)}`, {
    headers,
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{ order: FulfillmentOrder }>;
}

/** Persist an order after Stripe payment succeeds (or local unverified checkout). */
export async function submitOrder(payload: OrderSubmissionPayload): Promise<OrderSubmissionResult> {
  const response = await fetch(`${API_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<OrderSubmissionResult>;
}
