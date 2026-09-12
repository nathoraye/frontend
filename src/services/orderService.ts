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
  paypalOrderId: string;
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

export interface CreatePayPalOrderResult {
  id: string;
  status?: string;
  amount?: string;
  currency?: string;
  unverified?: boolean;
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

/** Ask the server to create a PayPal order for the trusted price of orderConfig. */
export async function createPayPalCheckout(
  orderConfig: Record<string, unknown>,
): Promise<CreatePayPalOrderResult> {
  const response = await fetch(`${API_BASE_URL}/api/paypal/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderConfig }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<CreatePayPalOrderResult>;
}

/** Persist an order after PayPal approval. The server verifies/captures payment. */
export async function submitOrder(payload: OrderSubmissionPayload): Promise<OrderSubmissionResult> {
  const response = await fetch(`${API_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<OrderSubmissionResult>;
}
