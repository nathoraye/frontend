import { readJsonBody, sendJson, sendRouteError } from '../_lib/http.js';
import { handleGetOrder, handleSetFulfillment } from '../_lib/orderService.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const orderId = req.query?.id;
    if (!orderId) {
      sendJson(res, 400, { error: 'Missing order id' });
      return;
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const payload = await handleSetFulfillment(req, orderId, body);
      sendJson(res, 200, payload);
      return;
    }
    const payload = await handleGetOrder(req, orderId);
    sendJson(res, 200, payload);
  } catch (error) {
    sendRouteError(res, error, 'Failed to load order');
  }
}
