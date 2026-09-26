/**
 * Private per-order design assets in Vercel Blob.
 * The orders JSON index stays lean; jobs board fetches artwork via authenticated handlers.
 */
import { orderStoreLocation } from './orderStore.js';

const DESIGN_PREFIX = 'orders';

export function designAssetPath(orderId, kind) {
  const safe = String(orderId || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  if (kind === 'preview') return `${DESIGN_PREFIX}/${safe}/preview.png`;
  return `${DESIGN_PREFIX}/${safe}/design.svg`;
}

function blobMode() {
  return String(orderStoreLocation() || '').startsWith('vercel-blob:');
}

function blobAuthOptions() {
  const storeId = String(process.env.BLOB_STORE_ID || '').trim();
  if (storeId) return { storeId };
  const token = String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  if (token) return { token };
  throw new Error('BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN is required for blob order assets');
}

export async function putPrivateOrderAsset(pathname, body, contentType) {
  if (!blobMode()) return null;
  const auth = blobAuthOptions();
  const { put } = await import('@vercel/blob');
  const result = await put(pathname, body, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    ...auth,
  });
  return {
    pathname: result.pathname || pathname,
    url: result.url || null,
  };
}

export async function getPrivateOrderAsset(pathname) {
  if (!pathname || !blobMode()) return null;
  const auth = blobAuthOptions();
  const { get } = await import('@vercel/blob');
  const result = await get(pathname, { access: 'private', useCache: false, ...auth });
  if (!result?.stream) return null;
  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  return {
    buffer,
    contentType: result.blob?.contentType || null,
  };
}

/** Persist SVG (+ optional PNG preview) to private blob; returns path fields for the order row. */
export async function persistOrderDesignAssets(orderId, { designSvg, designPreviewPng } = {}) {
  const out = {
    designBlobPath: null,
    previewBlobPath: null,
  };
  if (!blobMode()) return out;

  if (typeof designSvg === 'string' && designSvg.length >= 20) {
    const designPath = designAssetPath(orderId, 'design');
    const saved = await putPrivateOrderAsset(designPath, designSvg, 'image/svg+xml;charset=utf-8');
    if (saved?.pathname) out.designBlobPath = saved.pathname;
  }

  if (typeof designPreviewPng === 'string' && designPreviewPng.startsWith('data:image/')) {
    const comma = designPreviewPng.indexOf(',');
    if (comma > 0) {
      const previewPath = designAssetPath(orderId, 'preview');
      const bytes = Buffer.from(designPreviewPng.slice(comma + 1), 'base64');
      const saved = await putPrivateOrderAsset(previewPath, bytes, 'image/png');
      if (saved?.pathname) out.previewBlobPath = saved.pathname;
    }
  }

  return out;
}
