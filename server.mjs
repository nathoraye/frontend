import http from 'node:http';
import { handleTraceRequest } from './api/trace.js';
import { errorStatus, readJsonBody, readRawBody, sendBinary, sendJson } from './api/_lib/http.js';
import {
  handleCreateCheckoutSession,
  handleCreatePaymentIntent,
  handleGetOrder,
  handleGetOrderAsset,
  handleHealth,
  handleListOrders,
  handleSessionStatus,
  handleSetFulfillment,
  handleStripeWebhookRequest,
  handleSubmitOrder,
} from './api/_lib/orderService.js';
import { handleAdminLogin } from './api/_lib/adminSession.js';
import { readTrimmedEnv } from './api/_lib/stripe.js';

// Local/dev convenience when Stripe secrets are absent. Vercel stays fail-closed.
if (!readTrimmedEnv('STRIPE_SECRET_KEY') && process.env.ALLOW_UNVERIFIED_ORDERS == null) {
  process.env.ALLOW_UNVERIFIED_ORDERS = '1';
}
if (process.env.ALLOW_UNVERIFIED_ORDERS === '1' && process.env.ALLOW_PUBLIC_ORDER_LIST == null) {
  process.env.ALLOW_PUBLIC_ORDER_LIST = '1';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  try {
    if (req.method === 'OPTIONS') {
      return sendJson(res, 204, {});
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      const health = await handleHealth();
      return sendJson(res, health.ok ? 200 : 503, health);
    }

    if (url.pathname === '/api/trace') {
      return handleTraceRequest(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/stripe/webhook') {
      const rawBody = await readRawBody(req);
      return sendJson(res, 200, await handleStripeWebhookRequest(req, rawBody));
    }

    if (req.method === 'POST' && url.pathname === '/api/stripe/create-checkout-session') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, await handleCreateCheckoutSession(body, req));
    }

    if (req.method === 'GET' && url.pathname === '/api/stripe/session-status') {
      return sendJson(
        res,
        200,
        await handleSessionStatus({
          session_id: url.searchParams.get('session_id'),
          orderId: url.searchParams.get('orderId'),
        }),
      );
    }

    if (req.method === 'POST' && url.pathname === '/api/stripe/create-payment-intent') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, await handleCreatePaymentIntent(body));
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/login') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, handleAdminLogin(body));
    }

    if (req.method === 'GET' && url.pathname === '/api/orders') {
      return sendJson(res, 200, await handleListOrders(req));
    }

    const orderAssetMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/(design|preview)$/);
    if (req.method === 'GET' && orderAssetMatch) {
      const orderId = decodeURIComponent(orderAssetMatch[1]);
      const kind = orderAssetMatch[2];
      const download = url.searchParams.get('download') === '1';
      const asset = await handleGetOrderAsset(req, orderId, kind, { download });
      return sendBinary(res, 200, asset.body, {
        contentType: asset.contentType,
        fileName: asset.fileName,
        download: asset.download,
      });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/orders/')) {
      const orderId = decodeURIComponent(url.pathname.split('/').pop() || '');
      return sendJson(res, 200, await handleGetOrder(req, orderId));
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/orders/')) {
      const orderId = decodeURIComponent(url.pathname.split('/').pop() || '');
      const body = await readJsonBody(req);
      return sendJson(res, 200, await handleSetFulfillment(req, orderId, body));
    }

    if (req.method === 'POST' && url.pathname === '/api/orders') {
      const body = await readJsonBody(req);
      return sendJson(res, 201, await handleSubmitOrder(body));
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    return sendJson(res, errorStatus(error), {
      error: error instanceof Error ? error.message : 'Request failed',
    });
  }
});

server.listen(3001, () => {
  console.log('West Vinyl order backend listening on http://localhost:3001');
});
