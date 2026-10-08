import assert from 'node:assert/strict';
import test from 'node:test';
import { chargedTotal, decalVinylCost, moneyString, quoteOrder } from '../src/lib/pricing.ts';
import {
  formatPrintCm,
  maxPrintCm,
  printSizeCm,
  scaleForLongestSide,
  STICKER_SIDE_MAX_CM,
  STICKER_SIDE_MIN_CM,
} from '../src/utils/printSize.ts';

test('adult full front follows the inch chart and the 30 cm width cap', () => {
  assert.deepEqual(maxPrintCm({ productId: 'tshirt', garmentSize: 'M' }), { widthCm: 25.4, heightCm: 30.5 });
  assert.deepEqual(maxPrintCm({ productId: 'hoodie', garmentSize: 'M' }), { widthCm: 25.4, heightCm: 30.5 });
  assert.deepEqual(maxPrintCm({ productId: 'tshirt', garmentSize: '2XL' }), { widthCm: 30, heightCm: 35.6 });
  assert.deepEqual(maxPrintCm({ productId: 'tshirt', viewId: 'back', garmentSize: 'L' }), { widthCm: 26.7, heightCm: 31.8 });
});

test('baby sizes step up to the 23 by 25 cm kids guide', () => {
  assert.deepEqual(maxPrintCm({ productId: 'babyClothes', garmentSize: 'XS' }), { widthCm: 12, heightCm: 14 });
  assert.deepEqual(maxPrintCm({ productId: 'babyClothes', garmentSize: '2XL' }), { widthCm: 23, heightCm: 25 });
});

test('scale 1 is the max print and a chest preset fits a 10 cm longest side', () => {
  const full = printSizeCm({
    productId: 'hoodie',
    viewId: 'front',
    garmentSize: 'M',
    scale: 1,
  });
  assert.equal(`${formatPrintCm(full!.widthCm)} × ${formatPrintCm(full!.heightCm)} cm`, '25.4 × 30.5 cm');
  const max = maxPrintCm({ productId: 'hoodie', garmentSize: 'M' })!;
  const chest = printSizeCm({
    productId: 'hoodie',
    viewId: 'front',
    garmentSize: 'M',
    scale: scaleForLongestSide(max, 10),
  });
  assert.equal(chest!.heightCm, 10);
  assert.ok(chest!.widthCm < 10);
});

test('hoodie print price stays flat under 900 cm² and rises once the max print passes it', () => {
  const medium = printSizeCm({ productId: 'hoodie', viewId: 'front', garmentSize: 'M', scale: 1 })!;
  const extraLarge = printSizeCm({ productId: 'hoodie', viewId: 'front', garmentSize: '2XL', scale: 1 })!;
  const mediumQuote = quoteOrder({
    productType: 'hoodie',
    widthCm: medium.widthCm,
    heightCm: medium.heightCm,
    designType: 'graphic',
  });
  const extraQuote = quoteOrder({
    productType: 'hoodie',
    widthCm: extraLarge.widthCm,
    heightCm: extraLarge.heightCm,
    designType: 'graphic',
  });
  assert.equal(mediumQuote.ok && extraQuote.ok, true);
  if (!mediumQuote.ok || !extraQuote.ok) return;
  assert.equal(mediumQuote.quote.vinyl, 0);
  assert.equal(moneyString(chargedTotal(mediumQuote.quote, 1)), '69.00');
  assert.ok(extraQuote.quote.areaCm2 > 900);
  assert.equal(extraQuote.quote.vinyl, 3.36);
  assert.equal(moneyString(chargedTotal(extraQuote.quote, 1)), '72.36');
});

test('the sticker slider stays inside the existing decal caps', () => {
  assert.equal(STICKER_SIDE_MIN_CM, 3);
  assert.equal(STICKER_SIDE_MAX_CM, 30);
  const small = quoteOrder({
    productType: 'decal',
    widthCm: STICKER_SIDE_MIN_CM,
    heightCm: STICKER_SIDE_MIN_CM,
    designType: 'graphic',
    shippingOption: 'untracked',
  });
  const large = quoteOrder({
    productType: 'decal',
    widthCm: STICKER_SIDE_MAX_CM,
    heightCm: STICKER_SIDE_MAX_CM,
    designType: 'graphic',
    shippingOption: 'tracked',
  });
  assert.equal(small.ok && large.ok, true);
});

test('an 18 by 16.8 cm sticker uses the longest-side curve and ignores a client total', () => {
  const sticker = quoteOrder({
    productType: 'decal',
    widthCm: 18,
    heightCm: 16.8,
    designType: 'graphic',
    shippingOption: 'untracked',
    amount: 1,
    total: 1,
  });
  assert.equal(sticker.ok, true);
  if (!sticker.ok) return;
  assert.equal(sticker.quote.vinyl, decalVinylCost(18, 16.8));
  assert.equal(moneyString(chargedTotal(sticker.quote, 1)), '23.16');
  assert.notEqual(sticker.quote.total, 1);
});
