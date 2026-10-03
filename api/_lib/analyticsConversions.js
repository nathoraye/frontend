/**
 * Server purchase events for GA4 Measurement Protocol and the Meta Conversions API.
 * Both providers are optional. Missing env vars skip that provider with no request.
 * Callers must catch nothing themselves: this function never throws.
 */
import { createHash, randomUUID } from 'node:crypto';

const GA4_COLLECT = 'https://www.google-analytics.com/mp/collect';
const META_GRAPH_VERSION = 'v21.0';
const GA4_ID_RE = /^G-[A-Z0-9]+$/;
const PIXEL_RE = /^\d{5,20}$/;
const EVENT_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

const ANALYTICS_FIELDS = [
  ['eventId', 'event_id', 80],
  ['gaClientId', 'ga_client_id', 64],
  ['gclid', 'gclid', 200],
  ['fbclid', 'fbclid', 200],
  ['fbc', 'fbc', 500],
  ['fbp', 'fbp', 200],
  ['utmSource', 'utm_source', 120],
  ['utmMedium', 'utm_medium', 120],
  ['utmCampaign', 'utm_campaign', 200],
  ['utmTerm', 'utm_term', 200],
  ['utmContent', 'utm_content', 200],
];

const warned = new Set();

function readEnv(name) {
  const raw = process.env[name];
  if (raw == null) return '';
  return String(raw).trim();
}

function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[analytics] ${message}`);
}

function safeError(error) {
  const message = error instanceof Error ? error.message : 'request failed';
  return message.replace(/https?:\S+/g, '[url]').slice(0, 240);
}

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}

function clientIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '';
  const first = String(forwarded).split(',')[0].trim();
  if (/^[\da-fA-F:.]+$/.test(first) && first.length <= 64) return first;
  return '';
}

function clientUserAgent(req) {
  return clean(String(req?.headers?.['user-agent'] || ''), 200);
}

/** Meta: trim and lowercase. Returns '' when there is no address. */
export function normalizeMetaEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/** SHA-256 hex of a Meta-normalized email. Empty input returns ''. */
export function hashMetaEmail(email) {
  const normalized = normalizeMetaEmail(email);
  if (!normalized) return '';
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Allow-listed attribution for Stripe Checkout Session metadata and the order row.
 * Client IP and user agent come from the checkout request, not the browser payload.
 */
export function normalizeCheckoutAnalytics(input = {}, req = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const stored = {};
  const metadata = {};
  for (const [field, metaKey, max] of ANALYTICS_FIELDS) {
    let value = clean(source[field], max);
    if (field === 'eventId' && value && !EVENT_ID_RE.test(value)) value = '';
    if (!value) continue;
    stored[field] = value;
    metadata[metaKey] = value;
  }
  if (!stored.eventId) {
    stored.eventId = randomUUID();
    metadata.event_id = stored.eventId;
  }
  const ip = clientIp(req);
  const ua = clientUserAgent(req);
  if (ip) stored.clientIp = ip;
  if (ua) stored.clientUa = ua;
  return { eventId: stored.eventId, stored, metadata };
}

function moneyNumber(amount) {
  const value = typeof amount === 'number' ? amount : Number.parseFloat(String(amount ?? ''));
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function purchaseItem(order, value) {
  const config = order?.orderConfig || {};
  const itemId = String(config.productId || config.productType || config.orderType || 'custom').slice(0, 80);
  const names = {
    decal: 'Custom decal',
    vinyl: 'Custom decal',
    tee: 'T-Shirt',
    hoodie: 'Hoodie',
    baby: 'Baby clothes',
    clock: 'Wall clock',
    bottle: 'Drink bottle',
    product: 'Custom apparel',
  };
  const itemName = names[config.productType] || names[config.orderType] || 'Custom order';
  const quantity = Math.max(1, Number(config.quantity) || 1);
  const price = Math.round((value / quantity) * 100) / 100;
  return { itemId, itemName, quantity, price };
}

function attributionOf(order, session) {
  const meta = session?.metadata || {};
  const stored = order?.analytics || {};
  const pick = (field, metaKey) => stored[field] || meta[metaKey] || '';
  return {
    eventId: pick('eventId', 'event_id') || order?.analyticsEventId || order?.id || '',
    gaClientId: pick('gaClientId', 'ga_client_id') || (order?.id ? `server.${order.id}` : ''),
    gclid: pick('gclid', 'gclid'),
    fbc: pick('fbc', 'fbc'),
    fbp: pick('fbp', 'fbp'),
    clientIp: stored.clientIp || '',
    clientUa: stored.clientUa || '',
    email:
      session?.customer_details?.email ||
      session?.customer_email ||
      order?.payerEmail ||
      order?.customer?.email ||
      '',
  };
}

export function buildGa4PurchasePayload(order, session) {
  const value = moneyNumber(order?.amount);
  const attribution = attributionOf(order, session);
  if (value == null || !order?.id || !attribution.gaClientId) return null;
  const item = purchaseItem(order, value);
  const params = {
    transaction_id: order.id,
    currency: 'AUD',
    value,
    engagement_time_msec: 1,
    event_id: attribution.eventId,
    items: [
      {
        item_id: item.itemId,
        item_name: item.itemName,
        quantity: item.quantity,
        price: item.price,
      },
    ],
  };
  if (attribution.gclid) params.gclid = attribution.gclid;
  if (readEnv('GA4_DEBUG') === '1') params.debug_mode = 1;
  return {
    client_id: attribution.gaClientId,
    events: [{ name: 'purchase', params }],
  };
}

export function buildMetaPurchasePayload(order, session) {
  const value = moneyNumber(order?.amount);
  const attribution = attributionOf(order, session);
  const emailHash = hashMetaEmail(attribution.email);
  if (value == null || !order?.id || !attribution.eventId || !emailHash) return null;
  const item = purchaseItem(order, value);
  const userData = { em: [emailHash] };
  if (attribution.fbc) userData.fbc = attribution.fbc;
  if (attribution.fbp) userData.fbp = attribution.fbp;
  if (attribution.clientIp) userData.client_ip_address = attribution.clientIp;
  if (attribution.clientUa) userData.client_user_agent = attribution.clientUa;
  const event = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: attribution.eventId,
    action_source: 'website',
    event_source_url: eventSourceUrl(),
    user_data: userData,
    custom_data: {
      currency: 'AUD',
      value,
      order_id: order.id,
      content_ids: [item.itemId],
      content_type: 'product',
      content_name: item.itemName,
    },
  };
  const body = { data: [event] };
  const testCode = readEnv('META_TEST_EVENT_CODE');
  if (testCode) body.test_event_code = testCode;
  return body;
}

function eventSourceUrl() {
  const base = readEnv('PUBLIC_APP_URL').replace(/\/$/, '') || 'https://westvinylstudio.com';
  return `${base}/order/success`;
}

function providerConfig(kind) {
  if (kind === 'ga4') {
    const measurementId = readEnv('GA4_MEASUREMENT_ID');
    const apiSecret = readEnv('GA4_API_SECRET');
    if (!measurementId && !apiSecret) return null;
    if (!GA4_ID_RE.test(measurementId) || apiSecret.length < 8) {
      warnOnce('ga4-config', 'GA4 Measurement Protocol is incomplete or invalid; purchase events are off');
      return null;
    }
    const url = new URL(GA4_COLLECT);
    url.searchParams.set('measurement_id', measurementId);
    url.searchParams.set('api_secret', apiSecret);
    return { url: url.toString(), label: 'GA4' };
  }
  const pixelId = readEnv('META_PIXEL_ID');
  const token = readEnv('META_CAPI_ACCESS_TOKEN');
  if (!pixelId && !token) return null;
  if (!PIXEL_RE.test(pixelId) || token.length < 20) {
    warnOnce('meta-config', 'Meta Conversions API is incomplete or invalid; purchase events are off');
    return null;
  }
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${pixelId}/events`);
  url.searchParams.set('access_token', token);
  return { url: url.toString(), label: 'Meta' };
}

async function postJson(fetchImpl, url, body, label) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    let detail = '';
    try {
      detail = String(await response.text()).slice(0, 180);
    } catch {
      detail = '';
    }
    throw new Error(`${label} HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
}

/**
 * Send purchase events for a newly paid order.
 * Returns a status per provider: skipped, sent, or failed.
 * Never throws. Does not log secrets.
 */
export async function reportPurchaseConversions({ order, session, fetchImpl } = {}) {
  const summary = { ga4: 'skipped', meta: 'skipped' };
  const sender = fetchImpl || globalThis.fetch;
  const jobs = [];

  const ga4 = providerConfig('ga4');
  const ga4Body = ga4 ? buildGa4PurchasePayload(order, session) : null;
  if (ga4 && !ga4Body) {
    summary.ga4 = 'failed';
    console.error('[analytics] GA4 purchase skipped: missing amount or client id');
  }
  if (ga4 && ga4Body) {
    jobs.push(
      postJson(sender, ga4.url, ga4Body, 'GA4')
        .then(() => {
          summary.ga4 = 'sent';
        })
        .catch((error) => {
          summary.ga4 = 'failed';
          console.error('[analytics] GA4 purchase failed:', safeError(error));
        }),
    );
  }

  const meta = providerConfig('meta');
  const metaBody = meta ? buildMetaPurchasePayload(order, session) : null;
  if (meta && !metaBody) {
    summary.meta = 'failed';
    console.error('[analytics] Meta purchase skipped: missing email or amount');
  }
  if (meta && metaBody) {
    jobs.push(
      postJson(sender, meta.url, metaBody, 'Meta')
        .then(() => {
          summary.meta = 'sent';
        })
        .catch((error) => {
          summary.meta = 'failed';
          console.error('[analytics] Meta purchase failed:', safeError(error));
        }),
    );
  }

  if (jobs.length) await Promise.all(jobs);
  return summary;
}
