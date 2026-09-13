import http from 'node:http';
import { handleTraceRequest } from './api/trace.js';
import { errorStatus, readJsonBody, sendJson } from './api/_lib/http.js';
import {
  handleCreatePaymentIntent,
  handleListOrders,
  handleSubmitOrder,
} from './api/_lib/orderService.js';

// Local/dev convenience when Stripe secrets are absent. Vercel stays fail-closed.
if (!process.env.STRIPE_SECRET_KEY && process.env.ALLOW_UNVERIFIED_ORDERS == null) {
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
      return sendJson(res, 200, { ok: true, service: 'west-vinyl-orders' });
    }

    if (url.pathname === '/api/trace') {
      return handleTraceRequest(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/stripe/create-payment-intent') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, await handleCreatePaymentIntent(body));
    }

    if (req.method === 'GET' && url.pathname === '/api/orders') {
      return sendJson(res, 200, await handleListOrders(req));
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/orders/')) {
      const payload = await handleListOrders(req);
      const orderId = url.pathname.split('/').pop();
      const order = payload.orders.find((entry) => entry.id === orderId);
      if (!order) return sendJson(res, 404, { error: 'Order not found' });
      return sendJson(res, 200, { order });
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
