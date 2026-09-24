import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_PREFIX = 'wvs1';
const MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

function readUser() {
  return String(process.env.JOBS_ADMIN_USERNAME || '').trim();
}

function readPass() {
  return String(process.env.JOBS_ADMIN_PASSWORD || '').trim();
}

function signingKey() {
  return String(process.env.ORDERS_ADMIN_TOKEN || '').trim() || readPass();
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function jobsAdminConfigured() {
  return Boolean(readUser() && readPass() && signingKey());
}

export function credentialsMatch(username, password) {
  const expectedUser = readUser();
  const expectedPass = readPass();
  if (!expectedUser || !expectedPass) return false;
  const userOk = safeEqual(String(username || '').trim(), expectedUser);
  const passOk = safeEqual(String(password || '').trim(), expectedPass);
  return userOk && passOk;
}

function sign(payload) {
  const key = signingKey();
  if (!key) return '';
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function issueSessionToken(username, nowMs = Date.now()) {
  if (!jobsAdminConfigured()) {
    throw Object.assign(new Error('Admin login is not set up on this server'), { status: 503 });
  }
  const exp = Math.floor(nowMs / 1000) + MAX_AGE_SECONDS;
  const payload = Buffer.from(JSON.stringify({ u: String(username).trim(), exp }), 'utf8').toString(
    'base64url',
  );
  return `${SESSION_PREFIX}.${payload}.${sign(payload)}`;
}

export function sessionTokenValid(token, nowMs = Date.now()) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== SESSION_PREFIX) return false;
  const [, payload, sig] = parts;
  const expected = sign(payload);
  if (!expected || !safeEqual(sig, expected)) return false;
  let body;
  try {
    body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return false;
  }
  if (!body || typeof body.exp !== 'number' || body.exp * 1000 <= nowMs) return false;
  const expectedUser = readUser();
  if (!expectedUser || body.u !== expectedUser) return false;
  return true;
}

export function handleAdminLogin(body) {
  if (!jobsAdminConfigured()) {
    throw Object.assign(new Error('Admin login is not set up on this server'), { status: 503 });
  }
  const username = String(body?.username || '');
  const password = String(body?.password || '');
  if (!credentialsMatch(username, password)) {
    throw Object.assign(new Error('Wrong username or password'), { status: 401 });
  }
  return { ok: true, token: issueSessionToken(username.trim()) };
}
