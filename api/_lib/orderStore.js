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

export function orderStoreLocation() {
  return mode() === 'blob' ? `vercel-blob:${BLOB_NAME}` : `file:${filePath()}`;
}

export async function listOrders() {
  return mode() === 'blob' ? readBlob() : readFile();
}

export async function saveOrders(orders) {
  return mode() === 'blob' ? writeBlob(orders) : writeFile(orders);
}

function paymentKey(order) {
  return order?.paymentIntentId || order?.checkoutSessionId || order?.paypalOrderId || null;
}

export async function getOrderById(id) {
  if (!id) return null;
  const orders = await listOrders();
  return orders.find((entry) => entry.id === id) || null;
}

export async function findOrder(predicate) {
  const orders = await listOrders();
  return orders.find(predicate) || null;
}

export async function appendOrder(order) {
  const orders = await listOrders();
  const key = paymentKey(order);
  const existing = key
    ? orders.find((o) => paymentKey(o) && paymentKey(o) === key)
    : undefined;
  if (existing) return { order: existing, ordersCount: orders.length, duplicate: true };
  orders.unshift(order);
  await saveOrders(orders);
  return { order, ordersCount: orders.length, duplicate: false };
}

export async function updateOrder(id, patch) {
  const orders = await listOrders();
  const idx = orders.findIndex((entry) => entry.id === id);
  if (idx === -1) return null;
  const next = { ...orders[idx], ...patch, id: orders[idx].id };
  orders[idx] = next;
  await saveOrders(orders);
  return next;
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

/** Jobs-board payload: product + customer, no cut SVG (fetch /api/orders/:id for that). */
export function fulfillmentOrderView(order, { includeDesign = false } = {}) {
  if (!order) return null;
  return {
    id: order.id,
    createdAt: order.createdAt,
    paidAt: order.paidAt || null,
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    orderType: order.orderConfig?.orderType || 'vinyl',
    customer: order.customer || null,
    orderConfig: order.orderConfig || null,
    checkoutSessionId: order.checkoutSessionId || null,
    paymentIntentId: order.paymentIntentId || order.paypalOrderId || null,
    chargeId: order.chargeId || null,
    payerEmail: order.payerEmail || null,
    hasDesign: Boolean(order.designSvg),
    ...(includeDesign ? { designSvg: order.designSvg || '' } : {}),
  };
}

export function publicConfirmation(order) {
  if (!order) return null;
  return {
    orderId: order.id,
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    orderType: order.orderConfig?.orderType || 'vinyl',
    email: order.customer?.email || order.payerEmail || null,
    createdAt: order.createdAt,
    paidAt: order.paidAt || null,
    unverified: order.status === 'unverified',
  };
}
