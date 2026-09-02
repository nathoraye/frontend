import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleTraceRequest } from './api/trace.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data');
const ordersFile = path.join(dataDir, 'orders.json');

async function ensureDataFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(ordersFile);
  } catch {
    await fs.writeFile(ordersFile, '[]', 'utf8');
  }
}

async function readOrders() {
  await ensureDataFile();
  const raw = await fs.readFile(ordersFile, 'utf8');
  return JSON.parse(raw);
}

async function writeOrders(orders) {
  await ensureDataFile();
  await fs.writeFile(ordersFile, JSON.stringify(orders, null, 2), 'utf8');
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, service: 'west-vinyl-orders' });
  }

  if (req.method === 'GET' && url.pathname === '/api/orders') {
    const orders = await readOrders();
    return sendJson(res, 200, { orders });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/orders/')) {
    const orderId = url.pathname.split('/').pop();
    const orders = await readOrders();
    const order = orders.find((entry) => entry.id === orderId);
    if (!order) return sendJson(res, 404, { error: 'Order not found' });
    return sendJson(res, 200, { order });
  }

  if (url.pathname === '/api/trace') {
    return handleTraceRequest(req, res);
  }

  if (req.method === 'POST' && url.pathname === '/api/orders') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const orders = await readOrders();
        const order = {
          id: `ord-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          createdAt: new Date().toISOString(),
          ...payload,
        };

        orders.unshift(order);
        await writeOrders(orders);
        return sendJson(res, 201, { order, ordersCount: orders.length });
      } catch (error) {
        return sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid order payload' });
      }
    });
    return;
  }

  return sendJson(res, 404, { error: 'Not found' });
});

server.listen(3001, () => {
  console.log('West Vinyl order backend listening on http://localhost:3001');
});
