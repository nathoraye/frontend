import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGa4CollectUrl } from '../src/analytics/ga4Collect.ts';

test('GA4 collect URL carries AUD value, event id, and the order id', () => {
  const url = buildGa4CollectUrl({
    measurementId: 'G-TEST1234',
    clientId: '555.666',
    eventName: 'purchase',
    pageLocation: 'https://westvinylstudio.com/order/success',
    pageTitle: 'Order',
    language: 'en-AU',
    screen: '1280x720',
    sessionId: '1700000000',
    hitIndex: 2,
    pageLoadId: '1700000000000',
    currency: 'AUD',
    value: 22,
    eventId: 'evt-1',
    transactionId: 'ord_1',
    items: [{ id: 'decal', name: 'Custom decal', quantity: 1, price: 22 }],
  });
  const query = new URL(url).searchParams;
  assert.equal(url.startsWith('https://www.google-analytics.com/g/collect?'), true);
  assert.equal(query.get('tid'), 'G-TEST1234');
  assert.equal(query.get('cid'), '555.666');
  assert.equal(query.get('en'), 'purchase');
  assert.equal(query.get('cu'), 'AUD');
  assert.equal(query.get('epn.value'), '22');
  assert.equal(query.get('evnid'), 'evt-1');
  assert.equal(query.get('ep.transaction_id'), 'ord_1');
  assert.equal(query.get('pr1'), 'iddecal~nmCustom decal~qt1~pr22');
  assert.equal(query.get('dl'), 'https://westvinylstudio.com/order/success');
});

test('item names cannot break the product parameter', () => {
  const url = buildGa4CollectUrl({
    measurementId: 'G-TEST1234',
    clientId: '1.2',
    eventName: 'view_item',
    pageLocation: 'https://westvinylstudio.com/',
    pageTitle: 'Studio',
    language: 'en-us',
    screen: '800x600',
    sessionId: '1',
    hitIndex: 1,
    pageLoadId: '2',
    items: [{ id: 'a~b', name: 'Tee & hoodie', quantity: 2, price: 10 }],
  });
  assert.equal(new URL(url).searchParams.get('pr1'), 'ida b~nmTee   hoodie~qt2~pr10');
});
