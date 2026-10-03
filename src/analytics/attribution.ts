/**
 * First-party click and campaign attribution.
 * Stored in localStorage so it survives the redirect to Stripe and back.
 * Later visits keep earlier values unless the new URL supplies a replacement.
 */

export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  gaClientId?: string;
}

export interface CheckoutAnalyticsPayload extends Attribution {
  eventId: string;
}

const STORAGE_KEY = 'wvs.attribution';

const QUERY_FIELDS = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_term: 'utmTerm',
  utm_content: 'utmContent',
  gclid: 'gclid',
  fbclid: 'fbclid',
} as const;

type AttributionField = (typeof QUERY_FIELDS)[keyof typeof QUERY_FIELDS];

function clean(value: string, max = 200): string {
  let out = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 31 || code === 127) continue;
    out += char;
  }
  return out.trim().slice(0, max);
}

export function cookieValue(cookieHeader: string, name: string): string {
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return '';
}

/** `_ga=GA1.1.123.456` → `123.456` */
export function gaClientIdFromCookie(cookieHeader: string): string {
  const value = cookieValue(cookieHeader, '_ga');
  const match = value.match(/^GA\d+\.\d+\.(\d+\.\d+)$/);
  return match?.[1] ?? '';
}

export function newEventId(now = Date.now()): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-${now}-${Math.floor(Math.random() * 1e9)}`;
}

function randomClientId(now: number, random?: () => number): string {
  const roll = random ? random() : Math.random();
  const prefix = Math.floor(roll * 1e10);
  return `${prefix}.${Math.floor(now / 1000)}`;
}

export function captureAttribution(input: {
  search: string;
  cookieHeader?: string;
  now?: number;
  existing?: Attribution | null;
  random?: () => number;
}): Attribution {
  const params = new URLSearchParams(
    input.search.startsWith('?') ? input.search.slice(1) : input.search,
  );
  const next: Attribution = { ...(input.existing || {}) };
  for (const [query, field] of Object.entries(QUERY_FIELDS) as [string, AttributionField][]) {
    const value = clean(params.get(query) || '');
    if (value) next[field] = value;
  }

  const cookies = input.cookieHeader || '';
  const now = input.now ?? Date.now();
  const fbcCookie = clean(cookieValue(cookies, '_fbc'), 500);
  const fbpCookie = clean(cookieValue(cookies, '_fbp'), 200);
  const gaClient = gaClientIdFromCookie(cookies);

  if (fbcCookie) next.fbc = fbcCookie;
  else if (next.fbclid && (!next.fbc || !next.fbc.endsWith(`.${next.fbclid}`))) {
    next.fbc = `fb.1.${now}.${next.fbclid}`.slice(0, 500);
  }
  if (fbpCookie) next.fbp = fbpCookie;
  if (gaClient) next.gaClientId = gaClient;
  else if (!next.gaClientId) next.gaClientId = randomClientId(now, input.random);

  return next;
}

export function readStoredAttribution(): Attribution {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Attribution;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistAttribution(value: Attribution) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode and blocked storage still let checkout continue.
  }
}

/** Read the landing URL and refresh fbc/fbp/ga cookies into first-party storage. */
export function captureLandingAttribution(): Attribution {
  const next = captureAttribution({
    search: window.location.search,
    cookieHeader: document.cookie,
    existing: readStoredAttribution(),
  });
  persistAttribution(next);
  return next;
}

export function checkoutAnalyticsPayload(eventId: string): CheckoutAnalyticsPayload {
  const attribution =
    typeof window === 'undefined' ? {} : captureLandingAttribution();
  return { eventId, ...attribution };
}
