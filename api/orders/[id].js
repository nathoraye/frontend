import { errorStatus, sendJson } from '../_lib/http.js';
import { handleGetOrder } from '../_lib/orderService.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const orderId = req.query?.id;
    if (!orderId) {
      sendJson(res, 400, { error: 'Missing order id' });
      return;
    }
    const payload = await handleGetOrder(req, orderId);
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, errorStatus(error), {
      error: error instanceof Error ? error.message : 'Failed to load order',
    });
  }
}
