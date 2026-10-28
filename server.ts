import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadLocalEnv() {
  if (process.env.VERCEL) return;
  const file = path.join(__dirname, '.env');
  let text: string;
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

if (!readTrimmedEnv('STRIPE_SECRET_KEY') && process.env.ALLOW_UNVERIFIED_ORDERS == null) {
  process.env.ALLOW_UNVERIFIED_ORDERS = '1';
}
if (process.env.ALLOW_UNVERIFIED_ORDERS === '1' && process.env.ALLOW_PUBLIC_ORDER_LIST == null) {
  process.env.ALLOW_PUBLIC_ORDER_LIST = '1';
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// API routes middleware matching server.mjs
app.use('/api', async (req: Request, res: Response) => {
  const url = new URL(req.originalUrl ?? req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).query = Object.fromEntries(url.searchParams.entries());
      return ordersHandler(req, res);
    }

    const orderAssetMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/(design|preview)$/);
    if (req.method === 'GET' && orderAssetMatch) {
      const orderId = decodeURIComponent(orderAssetMatch[1]);
      const kind = orderAssetMatch[2] as 'design' | 'preview';
      const download = url.searchParams.get('download') === '1';
      const asset = await handleGetOrderAsset(req, orderId, kind, { download });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (sendBinary as any)(res, 200, asset.body, {
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

app.get('/.well-known/assetlinks.json', (_req: Request, res: Response) => {
  const devFile = path.resolve(__dirname, 'public/.well-known/assetlinks.json');
  const prodFile = path.resolve(__dirname, 'dist/.well-known/assetlinks.json');
  const file = fs.existsSync(devFile) ? devFile : prodFile;
  if (fs.existsSync(file)) {
    res.setHeader('Content-Type', 'application/json');
    res.send(fs.readFileSync(file, 'utf8'));
    return;
  }
  res.status(404).json({ error: 'Asset links not found' });
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath, { dotfiles: 'allow' }));
    app.use((_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`West Vinyl Studio server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
