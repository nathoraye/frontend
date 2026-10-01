import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultFile = path.resolve(__dirname, '../../data/orders.json');
const BLOB_NAME = 'west-vinyl-orders.json';

function mode() {
  if (process.env.ORDER_STORE === 'blob') return 'blob';
  if (process.env.ORDER_STORE === 'file') return 'file';
  // Prefer store id (OIDC on Vercel) over the legacy RW token. A stale/expired
  // BLOB_READ_WRITE_TOKEN on a deployment must not be required for blob mode.
  if (process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  return 'file';
}

function filePath() {
  return process.env.ORDERS_FILE || defaultFile;
}

/**
 * Auth options for @vercel/blob.
 *
 * Important: never pass an explicit `token` when `BLOB_STORE_ID` is set.
 * resolveBlobAuth prefers options.token over OIDC, so an expired
 * BLOB_READ_WRITE_TOKEN would force 403s even though VERCEL_OIDC_TOKEN works.
 * With store id only, the SDK uses OIDC on Vercel, then falls back to the RW
 * token from env when OIDC is unavailable (local tooling).
 */
function blobAuthOptions() {
  const storeId = String(process.env.BLOB_STORE_ID || '').trim();
  if (storeId) return { storeId };
  const token = String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  if (token) return { token };
  throw new Error('BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN is required for blob order storage');
}

/** Same private-blob credentials the order index uses. */
export function blobClientOptions() {
  return blobAuthOptions();
}

export function orderStoreMode() {
  return mode();
}

function blobAuthLabel() {
  if (String(process.env.BLOB_STORE_ID || '').trim()) return 'oidc-or-store-id';
  if (String(process.env.BLOB_READ_WRITE_TOKEN || '').trim()) return 'read-write-token';
  return 'none';
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
  const auth = blobAuthOptions();
  // Store is private — bare fetch(url) returns 403. Use authenticated get().
  const { get } = await import('@vercel/blob');
  const result = await get(BLOB_NAME, { access: 'private', useCache: false, ...auth });
  if (!result?.stream) return [];
  const text = await new Response(result.stream).text();
  return text ? JSON.parse(text) : [];
}

async function writeBlob(orders) {
  const auth = blobAuthOptions();
  const { put } = await import('@vercel/blob');
  await put(BLOB_NAME, JSON.stringify(orders, null, 2), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    ...auth,
  });
}

export function orderStoreLocation() {
  return mode() === 'blob' ? `vercel-blob:${BLOB_NAME}` : `file:${filePath()}`;
}

export function orderStoreAuthMode() {
  return mode() === 'blob' ? blobAuthLabel() : 'file';
}

/** Lightweight read probe for /api/health — does not mutate the store. */
export async function probeOrderStore() {
  if (mode() !== 'blob') {
    try {
      await listOrders();
      return { ok: true, mode: 'file', auth: 'file' };
    } catch (err) {
      return { ok: false, mode: 'file', auth: 'file', error: err instanceof Error ? err.message : String(err) };
    }
  }
  try {
    await readBlob();
    return { ok: true, mode: 'blob', auth: blobAuthLabel() };
  } catch (err) {
    return {
      ok: false,
      mode: 'blob',
      auth: blobAuthLabel(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
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

/** Jobs-board payload: product + customer, no cut SVG (fetch /api/orders?id= for that). */
export function fulfillmentOrderView(order, { includeDesign = false } = {}) {
  if (!order) return null;
  const hasInlineSvg = Boolean(order.designSvg);
  const hasBlobDesign = Boolean(order.designBlobPath);
  const hasInlinePreview = Boolean(order.designPreviewPng);
  const hasBlobPreview = Boolean(order.previewBlobPath);
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
    fulfillmentStatus: order.fulfillmentStatus || null,
    fulfillmentUpdatedAt: order.fulfillmentUpdatedAt || null,
    shippedAt: order.shippedAt || null,
    hasDesign: hasInlineSvg || hasBlobDesign,
    hasPreview: hasInlinePreview || hasBlobPreview,
    designBlobPath: order.designBlobPath || null,
    previewBlobPath: order.previewBlobPath || null,
    ...(includeDesign
      ? {
          designSvg: order.designSvg || '',
          // Prefer private blob assets on the board; still return inline preview for local file store.
          designPreviewPng: hasBlobPreview ? '' : order.designPreviewPng || '',
        }
      : {}),
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
