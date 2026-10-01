import { createHash } from 'node:crypto';
import { blobClientOptions, orderStoreMode } from './orderStore.js';

/** Failed admin credential guesses allowed per IP before HTTP 429. */
export const ADMIN_AUTH_FAILURE_LIMIT = 10;
/** Fixed window for those failures. */
export const ADMIN_AUTH_FAILURE_WINDOW_MS = 15 * 60 * 1000;

const BLOB_PREFIX = 'admin-auth-failures';

/**
 * Per-isolate copy. On Vercel this alone resets whenever a new lambda starts,
 * so production also persists the counter in the existing private Blob store
 * (same auth as orders). No KV/Upstash dependency — those are not configured.
 * Blob writes are last-write-wins, so two isolates can under-count a race;
 * they cannot reset a live window. If Blob is unset (local file store) or a
 * Blob call fails, the in-memory map still limits that process.
 */
const memory = new Map();

/** @type {null | { read: (key: string) => Promise<{count: number, resetAt: number} | null>, write: (key: string, record: {count: number, resetAt: number}) => Promise<void> }} */
let durableOverride = null;

export function setAdminAuthDurableStoreForTests(store) {
  durableOverride = store;
}

export function clearAdminAuthRateLimitMemoryForTests() {
  memory.clear();
}

export function resetAdminAuthRateLimitForTests() {
  memory.clear();
  durableOverride = null;
}

function headerValue(req, name) {
  const headers = req?.headers || {};
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(direct)) return direct[0] == null ? '' : String(direct[0]);
  return direct == null ? '' : String(direct);
}

/** Prefer the platform client IP. Vercel sets x-real-ip and it is not taken from the left-most forwarded hop. */
export function adminAuthClientKey(req) {
  const realIp = headerValue(req, 'x-real-ip').trim();
  if (realIp) return realIp;
  const forwarded = headerValue(req, 'x-forwarded-for').split(',')[0].trim();
  if (forwarded) return forwarded;
  const socketIp = req?.socket?.remoteAddress || req?.connection?.remoteAddress;
  if (socketIp) return String(socketIp);
  return 'unknown';
}

function blobEnabled() {
  if (durableOverride) return false;
  // node:test sets this. Never touch the production Blob store from unit tests.
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

/**
 * Record one failed admin credential guess.
 * Returns limited: true when this key is already at the cap (does not extend the window).
 */
export async function registerAdminAuthFailure(req, nowMs = Date.now()) {
  const key = adminAuthClientKey(req);
  const local = active(parseRecord(memory.get(key)), nowMs);
  const remote = active(await readDurable(key), nowMs);
  const current = merge(local, remote) || {
    count: 0,
    resetAt: nowMs + ADMIN_AUTH_FAILURE_WINDOW_MS,
  };
  if (current.count >= ADMIN_AUTH_FAILURE_LIMIT) {
    memory.set(key, current);
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - nowMs) / 1000)),
    };
  }
  const next = { count: current.count + 1, resetAt: current.resetAt };
  memory.set(key, next);
  await writeDurable(key, next);
  return { limited: false, retryAfterSeconds: 0 };
}

export async function consumeFailedAdminAttempt(req, nowMs = Date.now()) {
  const outcome = await registerAdminAuthFailure(req, nowMs);
  if (!outcome.limited) return;
  throw Object.assign(new Error('Too many failed attempts. Try again later.'), {
    status: 429,
    retryAfterSeconds: outcome.retryAfterSeconds,
  });
}
