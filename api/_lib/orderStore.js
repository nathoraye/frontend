import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultFile = path.resolve(__dirname, '../../data/orders.json');
const BLOB_NAME = 'west-vinyl-orders.json';

function mode() {
  if (process.env.ORDER_STORE === 'blob') return 'blob';
  if (process.env.ORDER_STORE === 'file') return 'file';
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  return 'file';
}

function filePath() {
  return process.env.ORDERS_FILE || defaultFile;
}

async function ensureFile() {
  const file = filePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, '[]', 'utf8');
  }
}

async function readFile() {
  await ensureFile();
  return JSON.parse(await fs.readFile(filePath(), 'utf8'));
}

async function writeFile(orders) {
  await ensureFile();
  await fs.writeFile(filePath(), JSON.stringify(orders, null, 2), 'utf8');
}

async function readBlob() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is required for blob order storage');
  const { list } = await import('@vercel/blob');
  const { blobs } = await list({ prefix: BLOB_NAME, token, limit: 1 });
  const hit = blobs.find((b) => b.pathname === BLOB_NAME) || blobs[0];
  if (!hit) return [];
  const response = await fetch(hit.url);
  if (!response.ok) throw new Error(`Failed to read orders blob (${response.status})`);
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

async function writeBlob(orders) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is required for blob order storage');
  const { put } = await import('@vercel/blob');
  await put(BLOB_NAME, JSON.stringify(orders, null, 2), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    token,
  });
}

export async function listOrders() {
  return mode() === 'blob' ? readBlob() : readFile();
}

export async function saveOrders(orders) {
  return mode() === 'blob' ? writeBlob(orders) : writeFile(orders);
}

export async function appendOrder(order) {
  const orders = await listOrders();
  const existing = orders.find((o) => o.paypalOrderId && o.paypalOrderId === order.paypalOrderId);
  if (existing) return { order: existing, ordersCount: orders.length, duplicate: true };
  orders.unshift(order);
  await saveOrders(orders);
  return { order, ordersCount: orders.length, duplicate: false };
}

export function publicOrderView(order) {
  if (!order) return null;
  return {
    id: order.id,
    createdAt: order.createdAt,
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    orderType: order.orderConfig?.orderType,
  };
}
