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
  /** Optional PNG data URL for the jobs-board product preview. */
  designPreviewPng?: string;
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
    smokeAmountCents?: number | null;
    smokeAmountInvalid?: boolean;
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
  fulfillmentStatus?: 'new' | 'making' | 'shipped' | null;
  fulfillmentUpdatedAt?: string | null;
  shippedAt?: string | null;
  hasDesign?: boolean;
  hasPreview?: boolean;
  designBlobPath?: string | null;
  previewBlobPath?: string | null;
  designSvg?: string;
  designPreviewPng?: string;
}

async function readError(response: Response): Promise<string> {
  const type = response.headers.get('content-type') || '';
  const text = await response.text();
  if (type.includes('json')) {
    try {
      const data = JSON.parse(text) as { error?: unknown };
      if (data?.error) return String(data.error);
    } catch {
      // fall through
    }
  }
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    return `The order API returned a page instead of JSON (${response.status}).`;
  }
  return trimmed.slice(0, 240) || `Request failed (${response.status})`;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await readError(response));
  const type = response.headers.get('content-type') || '';
  if (!type.includes('json')) {
    const text = await response.text();
    if (text.trimStart().startsWith('<')) {
      throw new Error('The order API returned the studio page instead of order data.');
    }
    throw new Error(text.trim().slice(0, 240) || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
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

export async function loginJobsAdmin(
  username: string,
  password: string,
): Promise<{ token: string }> {
  const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { token?: string };
  if (!data.token) throw new Error('Sign-in did not return a session');
  return { token: data.token };
}

export async function listFulfillmentOrders(adminToken?: string): Promise<{
  orders: FulfillmentOrder[];
  store?: string;
}> {
  const headers: Record<string, string> = {};
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  const response = await fetch(`${API_BASE_URL}/api/orders`, { headers });
  return readJson<{ orders: FulfillmentOrder[]; store?: string }>(response);
}

export async function setFulfillmentStatus(
  orderId: string,
  fulfillmentStatus: 'new' | 'making' | 'shipped',
  adminToken?: string,
): Promise<{ order: FulfillmentOrder }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  const query = new URLSearchParams({ id: orderId });
  const response = await fetch(`${API_BASE_URL}/api/orders?${query}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fulfillmentStatus }),
  });
  return readJson<{ order: FulfillmentOrder }>(response);
}

export async function getFulfillmentOrder(
  orderId: string,
  adminToken?: string,
): Promise<{ order: FulfillmentOrder }> {
  const headers: Record<string, string> = {};
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  const query = new URLSearchParams({ id: orderId });
  const response = await fetch(`${API_BASE_URL}/api/orders?${query}`, { headers });
  return readJson<{ order: FulfillmentOrder }>(response);
}

async function fetchOrderAssetBlob(
  orderId: string,
  kind: 'design' | 'preview',
  adminToken?: string,
  download = false,
): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  const query = new URLSearchParams({ id: orderId, asset: kind });
  if (download) query.set('download', '1');
  const response = await fetch(`${API_BASE_URL}/api/orders?${query}`, { headers });
  if (!response.ok) throw new Error(await readError(response));
  const type = response.headers.get('content-type') || '';
  if (type.includes('text/html')) {
    throw new Error('The order API returned the studio page instead of the design file.');
  }
  return response.blob();
}

/** Authenticated product-preview PNG (private Blob get or inline fallback). */
export async function fetchOrderPreviewBlob(orderId: string, adminToken?: string): Promise<Blob> {
  return fetchOrderAssetBlob(orderId, 'preview', adminToken);
}

/** Authenticated cut SVG (private Blob get or inline fallback). */
export async function fetchOrderDesignBlob(
  orderId: string,
  adminToken?: string,
  download = false,
): Promise<Blob> {
  return fetchOrderAssetBlob(orderId, 'design', adminToken, download);
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
