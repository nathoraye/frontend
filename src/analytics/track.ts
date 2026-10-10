/**
 * Browser tags for GA4, Google Ads, and the Meta Pixel.
 * No script is inserted and no event function calls the network unless the
 * matching VITE_ id is set. /admin/orders and /jobs never load tags.
 */
import { captureLandingAttribution, readStoredAttribution } from './attribution';
import {
  customerTrackingEnabled,
  ga4MeasurementId,
  googleAdsConfigId,
  googleAdsConversionSendTo,
  isTrackerBlockedPath,
  metaPixelId,
} from './config';
import { buildGa4CollectUrl, type Ga4CollectItem } from './ga4Collect';

export interface TrackedItem {
  itemId: string;
  itemName: string;
  quantity?: number;
  value?: number;
}

type Gtag = (...args: unknown[]) => void;

interface Fbq {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Fbq;
  loaded: boolean;
  version: string;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

const CURRENCY = 'AUD';
const GA_SESSION_KEY = 'wvs.ga.sid';
const GA_SEEN_KEY = 'wvs.ga.seen';
const viewed = new Set<string>();
const added = new Set<string>();
const purchaseFired = new Set<string>();
let booted = false;
let pageViewSent = false;
let hitIndex = 0;
let pageLoadId = '';

function onCustomerSite(): boolean {
  if (typeof window === 'undefined') return false;
  return !isTrackerBlockedPath(window.location.pathname);
}

function installGtag() {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    // gtag.js drains Arguments objects. An array pushed here is ignored.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };
  }
}

function installFbq() {
  if (window.fbq) return;
  const fbq = ((...args: unknown[]) => {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  }) as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;
}

function appendScript(src: string, marker: string) {
  if (document.querySelector(`script[data-wvs-tracker="${marker}"]`)) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  script.dataset.wvsTracker = marker;
  script.onerror = () => {
    console.error(`[analytics] ${marker} script failed to load`);
  };
  document.head.appendChild(script);
}

function rememberGaClient(clientId: string) {
  if (!clientId || typeof document === 'undefined') return;
  const prefix = `_ga=GA1.1.${clientId}`;
  if (document.cookie.split(';').some((part) => part.trim().startsWith(`${prefix}`))) return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${prefix}; path=/; max-age=63072000; SameSite=Lax${secure}`;
}

function sessionState(): { sid: string; sessionStart: boolean; firstVisit: boolean } {
  let sid: string | null;
  try {
    sid = sessionStorage.getItem(GA_SESSION_KEY);
  } catch {
    sid = null;
  }
  let sessionStart = false;
  if (!sid) {
    sid = String(Math.floor(Date.now() / 1000));
    sessionStart = true;
    try {
      sessionStorage.setItem(GA_SESSION_KEY, sid);
    } catch {
      // Storage blocked. The hit still sends with this session id.
    }
  }
  let firstVisit = false;
  try {
    if (!localStorage.getItem(GA_SEEN_KEY)) {
      localStorage.setItem(GA_SEEN_KEY, '1');
      firstVisit = true;
    }
  } catch {
    firstVisit = sessionStart;
  }
  return { sid, sessionStart, firstVisit };
}

function collectItem(item: TrackedItem): Ga4CollectItem {
  const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
  const collected: Ga4CollectItem = {
    id: item.itemId,
    name: item.itemName,
    quantity,
  };
  if (typeof item.value === 'number' && Number.isFinite(item.value)) {
    collected.price = Math.round((item.value / quantity) * 100) / 100;
  }
  return collected;
}

/** Post one GA4 hit. No request is made when the measurement id is unset. */
function sendGa4(
  eventName: string,
  extra: {
    value?: number;
    eventId?: string;
    transactionId?: string;
    items?: TrackedItem[];
  } = {},
) {
  const measurementId = ga4MeasurementId();
  if (!measurementId || typeof navigator === 'undefined') return;
  hitIndex += 1;
  if (!pageLoadId) pageLoadId = String(Date.now());
  const stored = readStoredAttribution();
  const clientId =
    stored.gaClientId || `${Math.floor(Math.random() * 1e10)}.${Math.floor(Date.now() / 1000)}`;
  const session = sessionState();
  const url = buildGa4CollectUrl({
    measurementId,
    clientId,
    eventName,
    pageLocation: window.location.href,
    pageTitle: document.title || 'West Vinyl Studio',
    language: navigator.language || 'en-us',
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    sessionId: session.sid,
    hitIndex,
    pageLoadId,
    sessionStart: session.sessionStart,
    firstVisit: session.firstVisit,
    currency: typeof extra.value === 'number' && Number.isFinite(extra.value) ? CURRENCY : undefined,
    value: extra.value,
    eventId: extra.eventId,
    transactionId: extra.transactionId,
    items: extra.items?.map(collectItem),
  });
  try {
    const queued = typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url);
    if (!queued) {
      void fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        credentials: 'omit',
      }).catch(() => {
        console.error('[analytics] ga4 hit failed');
      });
    }
  } catch {
    console.error('[analytics] ga4 hit failed');
  }
}

/** Remarketing events for the Ads tag. GA4 is sent separately. */
function adsEvent(name: string, params: Record<string, unknown>) {
  if (!googleAdsConfigId() || !window.gtag) return;
  window.gtag('event', name, params);
}

function fbqTrack(name: string, params: Record<string, unknown>, eventId?: string) {
  if (!metaPixelId() || !window.fbq) return;
  if (eventId) window.fbq('track', name, params, { eventID: eventId });
  else window.fbq('track', name, params);
}

function itemParams(item: TrackedItem) {
  const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
  const params: Record<string, unknown> = {
    item_id: item.itemId,
    item_name: item.itemName,
    quantity,
  };
  if (typeof item.value === 'number' && Number.isFinite(item.value)) {
    params.price = Math.round((item.value / quantity) * 100) / 100;
  }
  return params;
}

function valueParams(value?: number): Record<string, unknown> {
  if (typeof value !== 'number' || !Number.isFinite(value)) return { currency: CURRENCY };
  return { currency: CURRENCY, value };
}

/** Load tags once. Safe to call before React renders. Uses the configured analytics providers. */
export function bootCustomerAnalytics(pathname = typeof window === 'undefined' ? '/' : window.location.pathname) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (isTrackerBlockedPath(pathname)) return;
  captureLandingAttribution();
  if (booted) return;
  const ga4 = ga4MeasurementId();
  const pixel = metaPixelId();
  if (!ga4 && !pixel) return;
  booted = true;

  if (ga4) rememberGaClient(readStoredAttribution().gaClientId || '');

  const adsId = ga4 ? googleAdsConfigId() : '';
  if (ga4) {
    installGtag();
    window.gtag?.('js', new Date());
    // Page views are already sent by trackPageView through the GA4 collector.
    window.gtag?.('config', ga4, { send_page_view: false });
    if (adsId) window.gtag?.('config', adsId);
    appendScript(
      `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}`,
      'google-tag',
    );
  }

  if (pixel) {
    installFbq();
    window.fbq?.('init', pixel);
    window.fbq?.('track', 'PageView');
    appendScript('https://connect.facebook.net/en_US/fbevents.js', 'meta');
  }
}

export function trackPageView() {
  if (!onCustomerSite() || !customerTrackingEnabled() || pageViewSent) return;
  pageViewSent = true;
  sendGa4('page_view');
  // Meta PageView is sent when the pixel boots. The Ads tag sends its own page view.
}

export function trackViewItem(item: TrackedItem) {
  if (!onCustomerSite() || !customerTrackingEnabled() || !item.itemId) return;
  if (viewed.has(item.itemId)) return;
  viewed.add(item.itemId);
  const params = valueParams(item.value);
  sendGa4('view_item', { value: item.value, items: [item] });
  adsEvent('view_item', { ...params, items: [itemParams(item)] });
  fbqTrack('ViewContent', {
    content_ids: [item.itemId],
    content_name: item.itemName,
    content_type: 'product',
    ...params,
  });
}

export function trackAddToCart(item: TrackedItem) {
  if (!onCustomerSite() || !customerTrackingEnabled() || !item.itemId) return;
  if (added.has(item.itemId)) return;
  added.add(item.itemId);
  const params = valueParams(item.value);
  sendGa4('add_to_cart', { value: item.value, items: [item] });
  adsEvent('add_to_cart', { ...params, items: [itemParams(item)] });
  fbqTrack('AddToCart', {
    content_ids: [item.itemId],
    content_name: item.itemName,
    content_type: 'product',
    ...params,
  });
}

/**
 * Fires begin checkout, then calls onDone. The redirect waits for the GA4
 * beacon (or a short timeout) so the hit is not cancelled by leaving the page.
 * When tracking is off, onDone runs immediately.
 */
export function trackBeginCheckout(
  input: {
    eventId: string;
    value: number;
    item: TrackedItem;
  },
  onDone?: () => void,
) {
  const finish = () => onDone?.();
  if (!onCustomerSite() || !customerTrackingEnabled()) {
    finish();
    return;
  }
  if (!input.eventId || !Number.isFinite(input.value)) {
    finish();
    return;
  }
  fbqTrack(
    'InitiateCheckout',
    {
      content_ids: [input.item.itemId],
      content_name: input.item.itemName,
      content_type: 'product',
      currency: CURRENCY,
      value: input.value,
      num_items: input.item.quantity || 1,
    },
    input.eventId,
  );
  sendGa4('begin_checkout', {
    value: input.value,
    eventId: input.eventId,
    items: [{ ...input.item, value: input.value }],
  });
  const adsReady = Boolean(googleAdsConfigId() && window.gtag);
  if (adsReady) {
    window.gtag?.('event', 'begin_checkout', {
      currency: CURRENCY,
      value: input.value,
      event_id: input.eventId,
      items: [itemParams({ ...input.item, value: input.value })],
    });
  }
  // GA4 is queued with sendBeacon and survives the redirect.
  // The Ads tag and the Meta pixel still need a moment before navigation.
  if (adsReady || metaPixelId()) {
    window.setTimeout(finish, 300);
    return;
  }
  finish();
}

/**
 * Browser purchase on the success page.
 * The webhook Measurement Protocol / Conversions API event is the source of truth.
 * The same event_id (Meta) and transaction_id (GA4) let those platforms dedupe.
 */
export function trackPurchase(input: {
  transactionId: string;
  eventId: string;
  value: number;
  item?: TrackedItem;
}) {
  if (!onCustomerSite() || !customerTrackingEnabled()) return;
  if (!input.transactionId || !input.eventId || !Number.isFinite(input.value)) return;
  const storageKey = `wvs.purchase.${input.transactionId}`;
  try {
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, input.eventId);
  } catch {
    if (purchaseFired.has(input.transactionId)) return;
    purchaseFired.add(input.transactionId);
  }

  const item = input.item || {
    itemId: 'custom',
    itemName: 'Custom order',
    quantity: 1,
    value: input.value,
  };
  sendGa4('purchase', {
    value: input.value,
    eventId: input.eventId,
    transactionId: input.transactionId,
    items: [{ ...item, value: input.value }],
  });
  const sendTo = googleAdsConversionSendTo();
  if (sendTo && window.gtag) {
    window.gtag('event', 'conversion', {
      send_to: sendTo,
      value: input.value,
      currency: CURRENCY,
      transaction_id: input.transactionId,
    });
  }
  fbqTrack(
    'Purchase',
    {
      content_ids: [item.itemId],
      content_name: item.itemName,
      content_type: 'product',
      currency: CURRENCY,
      value: input.value,
    },
    input.eventId,
  );
}
