import { errorStatus, readJsonBody, sendJson } from './_lib/http.js';
import {
  handleCreatePaymentIntent,
  handleListOrders,
  handleSubmitOrder,
} from './_lib/orderService.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (req.method === 'GET') {
      const payload = await handleListOrders(req);
      sendJson(res, 200, payload);
      return;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body?.action === 'create-payment-intent') {
        const payload = await handleCreatePaymentIntent(body);
        sendJson(res, 200, payload);
        return;
      }
      const payload = await handleSubmitOrder(body);
      sendJson(res, 201, payload);
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    sendJson(res, errorStatus(error), {
      error: error instanceof Error ? error.message : 'Order request failed',
    });
  }
}
