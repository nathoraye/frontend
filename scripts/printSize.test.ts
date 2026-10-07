import assert from 'node:assert/strict';
import test from 'node:test';
import { chargedTotal, moneyString, quoteOrder } from '../src/lib/pricing.ts';
import { formatPrintCm, printSizeCm } from '../src/utils/printSize.ts';

test('hoodie size M front at scale 1 is the print zone of a 60 by 70 cm blank', () => {
  const size = printSizeCm({
    productId: 'hoodie',
    viewId: 'front',
    color: '#ffffff',
    garmentSize: 'M',
    scale: 1,
  });
  assert.deepEqual(size, { widthCm: 18, heightCm: 16.8 });
  assert.equal(`${formatPrintCm(size!.widthCm)} × ${formatPrintCm(size!.heightCm)} cm`, '18 × 16.8 cm');
});

test('doubling the scale doubles the hoodie print', () => {
  const size = printSizeCm({
    productId: 'hoodie',
    viewId: 'front',
    color: '#ffffff',
    garmentSize: 'M',
    scale: 2,
  });
  assert.deepEqual(size, { widthCm: 36, heightCm: 33.6 });
});

test('a larger tee blank makes a larger print at the same scale', () => {
  const medium = printSizeCm({
    productId: 'tshirt',
    viewId: 'front',
    color: '#ffffff',
    garmentSize: 'M',
    scale: 1,
  });
  const large = printSizeCm({
    productId: 'tshirt',
    viewId: 'front',
    color: '#ffffff',
    garmentSize: 'L',
    scale: 1,
  });
  assert.ok(large && medium && large.widthCm > medium.widthCm);
  assert.equal(large.widthCm, 19);
  assert.equal(large.heightCm, 21.6);
});

test('preview prices use the shared quote and ignore a client total', () => {
  const size = printSizeCm({
    productId: 'hoodie',
    viewId: 'front',
    color: '#111111',
    garmentSize: 'M',
    scale: 1,
  });
  assert.ok(size);
  const sticker = quoteOrder({
    productType: 'decal',
    widthCm: size.widthCm,
    heightCm: size.heightCm,
    designType: 'graphic',
    shippingOption: 'untracked',
    amount: 1,
    total: 1,
  });
  const apparel = quoteOrder({
    productType: 'hoodie',
    widthCm: size.widthCm,
    heightCm: size.heightCm,
    designType: 'graphic',
    amount: 1,
  });
  assert.equal(sticker.ok && apparel.ok, true);
  if (!sticker.ok || !apparel.ok) return;
  assert.equal(moneyString(chargedTotal(sticker.quote, 1)), '42.05');
  assert.equal(moneyString(chargedTotal(apparel.quote, 1)), '69.00');
  assert.equal(sticker.quote.subtotal, 38.05);
});
