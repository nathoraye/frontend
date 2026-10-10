import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = readFileSync(new URL('../src/analytics/config.ts', import.meta.url), 'utf8');
const track = readFileSync(new URL('../src/analytics/track.ts', import.meta.url), 'utf8');

test('Google tag defaults to the studio property with an environment override', () => {
  assert.ok(config.includes("readVite('VITE_GA4_MEASUREMENT_ID') || 'G-0NP4GQGMRB'"));
});

test('Google tag loads for GA4 without Ads and avoids a second page view', () => {
  const boot = track.slice(track.indexOf('export function bootCustomerAnalytics'), track.indexOf('export function trackPageView'));
  assert.ok(boot.includes('if (isTrackerBlockedPath(pathname)) return;'));
  assert.ok(boot.includes("window.gtag?.('config', ga4, { send_page_view: false })"));
  assert.ok(boot.includes('https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}'));
  assert.ok(boot.includes("if (adsId) window.gtag?.('config', adsId)"));
});
