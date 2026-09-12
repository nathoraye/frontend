import { errorStatus, readJsonBody, sendJson } from '../_lib/http.js';
import { handleCreatePayPalOrder } from '../_lib/orderService.js';

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
    const payload = await handleCreatePayPalOrder(body);
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, errorStatus(error), {
      error: error instanceof Error ? error.message : 'Failed to create PayPal order',
    });
  }
}
