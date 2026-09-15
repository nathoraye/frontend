import { errorStatus, readRawBody, sendJson } from '../_lib/http.js';
import { handleStripeWebhookRequest } from '../_lib/orderService.js';

// Keep the raw body so Stripe signature verification can succeed on Vercel.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    const payload = await handleStripeWebhookRequest(req, rawBody);
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, errorStatus(error), {
      error: error instanceof Error ? error.message : 'Webhook handler failed',
    });
  }
}
