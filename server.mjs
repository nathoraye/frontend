import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleTraceRequest } from './api/trace.js';
import ordersHandler from './api/orders.js';
import { readJsonBody, readRawBody, sendBinary, sendJson, sendRouteError } from './api/_lib/http.js';
import {
  handleCreateCheckoutSession,
  handleCreatePaymentIntent,
  handleGetOrder,
  handleGetOrderAsset,
  handleHealth,
  handleSessionStatus,
  handleSetFulfillment,
  handleStripeWebhookRequest,
} from './api/_lib/orderService.js';
import { handleAdminLogin } from './api/_lib/adminSession.js';
import generateHandler from './api/generate.js';
import { readTrimmedEnv } from './api/_lib/stripe.js';

// Local `node server.mjs` does not use Vite's env loader. Fill empty vars from
// .env so the artwork key and Stripe secrets are available. Never overrides
// an already-set variable, and never runs this file on Vercel.
function loadLocalEnv() {
  if (process.env.VERCEL) return;
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadLocalEnv();

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

    if (
      (req.method === 'GET' || req.method === 'POST')
      && (url.pathname === '/api/generate' || url.pathname === '/api/generate-sticker')
    ) {
      return generateHandler(req, res);
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
      return sendJson(res, 200, await handleAdminLogin(body, req));
    }

    // Same handler Vercel runs for /api/orders, including ?id=&asset= design reads.
    if (
      (req.method === 'GET' || req.method === 'POST') &&
      url.pathname === '/api/orders'
    ) {
      req.query = Object.fromEntries(url.searchParams.entries());
      return ordersHandler(req, res);
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

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    return sendRouteError(res, error, 'Request failed');
  }
});

server.listen(3001, () => {
  console.log('West Vinyl order backend listening on http://localhost:3001');
});
