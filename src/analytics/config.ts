/**
 * Ads and analytics configuration.
 * Every id is optional. An empty or invalid value keeps that provider off.
 */

const GA4_RE = /^G-[A-Z0-9]+$/;
const ADS_ID_RE = /^AW-\d+$/;
const ADS_SEND_TO_RE = /^AW-\d+\/[\w-]+$/;
const ADS_LABEL_RE = /^[\w-]{1,80}$/;
const PIXEL_RE = /^\d{5,20}$/;

const warned = new Set<string>();

function readVite(name: string): string {
  const env = import.meta.env as Record<string, unknown> | undefined;
  const value = env?.[name];
  return typeof value === 'string' ? value.trim() : '';
}

function accept(name: string, value: string, pattern: RegExp): string {
  if (!value) return '';
  if (pattern.test(value)) return value;
  if (!warned.has(name)) {
    warned.add(name);
    console.warn(`[analytics] ${name} is set but is not a valid id, so that tag stays off`);
  }
  return '';
}

/** Jobs board must not load advertising or analytics tags. */
export function isTrackerBlockedPath(pathname: string): boolean {
  const path = (pathname || '/').split('?')[0].replace(/\/+$/, '') || '/';
  return path === '/admin/orders' || path === '/jobs';
}

export function ga4MeasurementId(): string {
  return accept('VITE_GA4_MEASUREMENT_ID', readVite('VITE_GA4_MEASUREMENT_ID'), GA4_RE);
}

/** AW-######### config id. A full AW-#########/label value still yields the AW- id. */
export function googleAdsConfigId(): string {
  const raw = readVite('VITE_GOOGLE_ADS_ID');
  if (!raw) return '';
  if (ADS_SEND_TO_RE.test(raw)) return raw.split('/')[0];
  return accept('VITE_GOOGLE_ADS_ID', raw, ADS_ID_RE);
}

/**
 * Google Ads purchase conversion destination.
 * Set VITE_GOOGLE_ADS_ID to AW-#########/label, or set the label separately.
 * Empty when no label is configured (GA4 purchase can still be imported in Ads).
 */
export function googleAdsConversionSendTo(): string {
  const raw = readVite('VITE_GOOGLE_ADS_ID');
  if (ADS_SEND_TO_RE.test(raw)) return raw;
  const id = googleAdsConfigId();
  const label = accept(
    'VITE_GOOGLE_ADS_CONVERSION_LABEL',
    readVite('VITE_GOOGLE_ADS_CONVERSION_LABEL'),
    ADS_LABEL_RE,
  );
  if (id && label) return `${id}/${label}`;
  return '';
}

export function metaPixelId(): string {
  return accept('VITE_META_PIXEL_ID', readVite('VITE_META_PIXEL_ID'), PIXEL_RE);
}

export function customerTrackingEnabled(pathname?: string): boolean {
  if (typeof window !== 'undefined') {
    const path = pathname ?? window.location.pathname;
    if (isTrackerBlockedPath(path)) return false;
  } else if (pathname && isTrackerBlockedPath(pathname)) {
    return false;
  }
  return Boolean(ga4MeasurementId() || metaPixelId());
}
