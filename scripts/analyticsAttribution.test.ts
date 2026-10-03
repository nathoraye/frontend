import assert from 'node:assert/strict';
import test from 'node:test';
import { captureAttribution, gaClientIdFromCookie } from '../src/analytics/attribution.ts';
import { isTrackerBlockedPath } from '../src/analytics/config.ts';

test('jobs board paths do not load trackers', () => {
  assert.equal(isTrackerBlockedPath('/admin/orders'), true);
  assert.equal(isTrackerBlockedPath('/admin/orders/'), true);
  assert.equal(isTrackerBlockedPath('/jobs'), true);
  assert.equal(isTrackerBlockedPath('/jobs/'), true);
  assert.equal(isTrackerBlockedPath('/'), false);
  assert.equal(isTrackerBlockedPath('/privacy'), false);
  assert.equal(isTrackerBlockedPath('/order/success'), false);
  assert.equal(isTrackerBlockedPath('/admin'), false);
});

test('landing capture keeps utm and click ids and builds fbc from fbclid', () => {
  const first = captureAttribution({
    search: '?utm_source=google&utm_medium=cpc&utm_campaign=decals&utm_term=vinyl&utm_content=ad1&gclid=abc&fbclid=IwAR123',
    now: 1_700_000_000_000,
    random: () => 0.42,
  });
  assert.equal(first.utmSource, 'google');
  assert.equal(first.utmMedium, 'cpc');
  assert.equal(first.utmCampaign, 'decals');
  assert.equal(first.utmTerm, 'vinyl');
  assert.equal(first.utmContent, 'ad1');
  assert.equal(first.gclid, 'abc');
  assert.equal(first.fbclid, 'IwAR123');
  assert.equal(first.fbc, 'fb.1.1700000000000.IwAR123');
  assert.equal(first.gaClientId, '4200000000.1700000000');
});

test('later visits keep earlier campaigns and prefer fresh click cookies', () => {
  const existing = captureAttribution({
    search: '?utm_source=google&gclid=abc&fbclid=IwAR123',
    now: 1_700_000_000_000,
    random: () => 0.1,
  });
  assert.equal(gaClientIdFromCookie('_ga=GA1.1.555.666'), '555.666');
  const next = captureAttribution({
    search: '?gclid=newclick',
    cookieHeader: '_fbp=fb.1.1.999; _fbc=fb.1.9.IwAR123; _ga=GA1.1.555.666',
    existing,
    now: 1_800_000_000_000,
  });
  assert.equal(next.utmSource, 'google');
  assert.equal(next.gclid, 'newclick');
  assert.equal(next.fbclid, 'IwAR123');
  assert.equal(next.fbc, 'fb.1.9.IwAR123');
  assert.equal(next.fbp, 'fb.1.1.999');
  assert.equal(next.gaClientId, '555.666');
});
