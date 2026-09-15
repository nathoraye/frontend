import { errorStatus, sendJson } from '../_lib/http.js';
import { handleSessionStatus } from '../_lib/orderService.js';

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
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const query = {
      session_id: url.searchParams.get('session_id') || req.query?.session_id,
      orderId: url.searchParams.get('orderId') || req.query?.orderId,
    };
    const payload = await handleSessionStatus(query);
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, errorStatus(error), {
      error: error instanceof Error ? error.message : 'Failed to load checkout status',
    });
  }
}
