import { errorStatus, readJsonBody, sendJson } from '../_lib/http.js';
import { handleCreatePaymentIntent } from '../_lib/orderService.js';
import { logStripeFailure, stripeErrorPayload } from '../_lib/stripeErrors.js';

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
    const body = await readJsonBody(req);
    const payload = await handleCreatePaymentIntent(body);
    sendJson(res, 200, payload);
  } catch (error) {
    logStripeFailure('create-payment-intent', error);
    sendJson(
      res,
      errorStatus(error),
      stripeErrorPayload(error, 'Failed to create payment intent'),
    );
  }
}
