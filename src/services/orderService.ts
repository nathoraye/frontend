const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export interface OrderSubmissionPayload {
  paypalOrderId: string;
  customer: {
    fullName: string;
    email: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  orderConfig: Record<string, unknown>;
  designSvg: string;
}

export interface OrderSubmissionResult {
  order: {
    id: string;
    createdAt: string;
    [key: string]: unknown;
  };
  ordersCount: number;
}

export async function submitOrder(payload: OrderSubmissionPayload): Promise<OrderSubmissionResult> {
  const response = await fetch(`${API_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to submit order');
  }

  return response.json() as Promise<OrderSubmissionResult>;
}
