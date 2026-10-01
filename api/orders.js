import { readJsonBody, sendBinary, sendJson, sendRouteError } from './_lib/http.js';
import {
  handleCreateCheckoutSession,
  handleCreatePaymentIntent,
  handleGetOrder,
  handleGetOrderAsset,
  handleListOrders,
  handleSetFulfillment,
  handleSubmitOrder,
} from './_lib/orderService.js';

function queryValue(value) {
  if (Array.isArray(value)) return value[0] == null ? '' : String(value[0]);
  return value == null ? '' : String(value);
}

/**
 * Jobs-board reads stay on this exact `/api/orders` function.
 * Vercel’s SPA rewrite serves index.html for `/api/orders/:id` and
 * `/api/orders/:id/design`, which the board then tries to parse as JSON
 * (`Unexpected token '<'`). Query params hit the function that already works.
 */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    const orderId = queryValue(req.query?.id).trim();
    const asset = queryValue(req.query?.asset).trim();

    if (req.method === 'GET' && orderId && (asset === 'design' || asset === 'preview')) {
      const download = queryValue(req.query?.download) === '1';
      const result = await handleGetOrderAsset(req, orderId, asset, { download });
      sendBinary(res, 200, result.body, {
        contentType: result.contentType,
        fileName: result.fileName,
        download: result.download,
      });
      return;
    }

    if (req.method === 'GET' && orderId) {
      sendJson(res, 200, await handleGetOrder(req, orderId));
      return;
    }

    if (req.method === 'GET') {
      const payload = await handleListOrders(req);
      sendJson(res, 200, payload);
      return;
    }

    if (req.method === 'POST' && orderId) {
      const body = await readJsonBody(req);
      sendJson(res, 200, await handleSetFulfillment(req, orderId, body));
      return;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body?.action === 'create-checkout-session') {
        const payload = await handleCreateCheckoutSession(body, req);
        sendJson(res, 200, payload);
        return;
      }
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
    sendRouteError(res, error, 'Order request failed');
  }
}
