import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ordersFile = path.join('/tmp', 'west-vinyl-orders.json');

async function ensureFile() {
  try {
    await fs.access(ordersFile);
  } catch {
    await fs.writeFile(ordersFile, '[]', 'utf8');
  }
}

async function readOrders() {
  await ensureFile();
  const raw = await fs.readFile(ordersFile, 'utf8');
  return JSON.parse(raw);
}

async function writeOrders(orders) {
  await ensureFile();
  await fs.writeFile(ordersFile, JSON.stringify(orders, null, 2), 'utf8');
}

function sendJson(res, status, payload) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(status).json(payload);
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      resolve(req.body);
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/orders')) {
    const orders = await readOrders();
    sendJson(res, 200, { orders });
    return;
  }

  if (req.method === 'POST' && req.url?.startsWith('/api/orders')) {
    try {
      const payload = await getBody(req);
      const orders = await readOrders();
      const order = {
        id: `ord-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        createdAt: new Date().toISOString(),
        ...payload,
      };
      orders.unshift(order);
      await writeOrders(orders);
      sendJson(res, 201, { order, ordersCount: orders.length });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid order payload' });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}
