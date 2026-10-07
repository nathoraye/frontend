import { createHash } from 'node:crypto';
import { adminAuthClientKey } from './adminRateLimit.js';
import { blobClientOptions, orderStoreMode } from './orderStore.js';

/** Free artwork generations per IP per UTC day. */
export const IMAGE_QUOTA_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const BLOB_PREFIX = 'ai-image-quota';

/**
 * Same shape as the admin login limiter: an in-memory copy for this isolate,
 * plus the existing private Vercel Blob store when orders use blob mode.
 * Blob writes are last-write-wins, so two isolates can under-count a race;
 * they cannot erase a count that is already stored. Local file-store dev
 * (no Blob env) keeps the in-memory map for that single process.
 */
const memory = new Map();

/** @type {null | { read: (key: string) => Promise<{count: number, resetAt: number} | null>, write: (key: string, record: {count: number, resetAt: number}) => Promise<void> }} */
let durableOverride = null;

export function setImageQuotaDurableStoreForTests(store) {
  durableOverride = store;
}

export function clearImageQuotaMemoryForTests() {
  memory.clear();
}

export function resetImageQuotaForTests() {
  memory.clear();
  durableOverride = null;
}

export function imageQuotaClientKey(req) {
  return adminAuthClientKey(req);
}

/** UTC calendar day. resetAt is the following midnight. */
export function imageQuotaWindow(nowMs) {
  const start = Math.floor(nowMs / DAY_MS) * DAY_MS;
  return { start, resetAt: start + DAY_MS };
}

function blobEnabled() {
  if (durableOverride) return false;
  if (process.env.NODE_TEST_CONTEXT) return false;
  return orderStoreMode() === 'blob';
}

function blobPath(key) {
  const hash = createHash('sha256').update(key).digest('hex');
  return `${BLOB_PREFIX}/${hash}.json`;
}

function parseRecord(value) {
  if (!value || typeof value !== 'object') return null;
  const count = Number(value.count);
  const resetAt = Number(value.resetAt);
  if (!Number.isFinite(count) || !Number.isFinite(resetAt)) return null;
  return { count, resetAt };
}

function active(record, nowMs) {
  if (!record || record.resetAt <= nowMs) return null;
  return record;
}

function merge(left, right) {
  if (!left) return right;
  if (!right) return left;
  return {
    count: Math.max(left.count, right.count),
    resetAt: Math.min(left.resetAt, right.resetAt),
  };
}

async function readDurable(key) {
  if (durableOverride) {
    const stored = await durableOverride.read(key);
    return parseRecord(stored);
  }
  if (!blobEnabled()) return null;
  try {
    const { get } = await import('@vercel/blob');
    const result = await get(blobPath(key), {
      access: 'private',
      useCache: false,
      ...blobClientOptions(),
    });
    if (!result?.stream) return null;
    const text = await new Response(result.stream).text();
    return parseRecord(text ? JSON.parse(text) : null);
  } catch (error) {
    if (error?.name === 'BlobNotFoundError') return null;
    return null;
  }
}

async function writeDurable(key, record) {
  if (durableOverride) {
    await durableOverride.write(key, record);
    return;
  }
  if (!blobEnabled()) return;
  try {
    const { put } = await import('@vercel/blob');
    await put(blobPath(key), JSON.stringify(record), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      ...blobClientOptions(),
    });
  } catch {
    // This isolate still has the memory copy.
  }
}

async function currentRecord(req, nowMs) {
  const key = imageQuotaClientKey(req);
  const window = imageQuotaWindow(nowMs);
  const local = active(parseRecord(memory.get(key)), nowMs);
  const remote = active(await readDurable(key), nowMs);
  const current = merge(local, remote) || { count: 0, resetAt: window.resetAt };
  return { key, current };
}

export function quotaSnapshot(record) {
  const count = Math.max(0, record.count);
  return {
    limit: IMAGE_QUOTA_LIMIT,
    remaining: Math.max(0, IMAGE_QUOTA_LIMIT - count),
    resetAt: record.resetAt,
    used: count,
  };
}

export async function readImageQuota(req, nowMs = Date.now()) {
  const { current } = await currentRecord(req, nowMs);
  return quotaSnapshot(current);
}

/**
 * Count one generation. Does not call the provider.
 * Returns ok: false when this IP is already at the daily cap.
 */
export async function reserveImageGeneration(req, nowMs = Date.now()) {
  const { key, current } = await currentRecord(req, nowMs);
  if (current.count >= IMAGE_QUOTA_LIMIT) {
    memory.set(key, current);
    return { ok: false, ...quotaSnapshot(current) };
  }
  const next = { count: current.count + 1, resetAt: current.resetAt };
  memory.set(key, next);
  await writeDurable(key, next);
  return { ok: true, ...quotaSnapshot(next) };
}

/** Give a slot back when the provider fails, so a timeout does not spend the day. */
export async function refundImageGeneration(req, nowMs = Date.now()) {
  const { key, current } = await currentRecord(req, nowMs);
  if (current.count <= 0) return quotaSnapshot(current);
  const next = { count: current.count - 1, resetAt: current.resetAt };
  memory.set(key, next);
  await writeDurable(key, next);
  return quotaSnapshot(next);
}
