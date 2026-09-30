import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chargedTotal,
  dimensionError,
  MIN_DIMENSION_ERROR,
  quoteOrder,
  rawAreaCost,
  vinylCost,
} from '../src/lib/pricing.ts';

function mustQuote(raw: Record<string, unknown>) {
  const result = quoteOrder(raw);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  if (!result.ok) throw new Error(result.error);
  return result;
}

test('raw area cost hits 10, 300, and 301', () => {
  assert.equal(rawAreaCost(10), 4);
  assert.equal(rawAreaCost(10.1), 4.5);
  assert.equal(rawAreaCost(300), 33);
  assert.equal(rawAreaCost(301), 33.02);
  assert.equal(rawAreaCost(310.4), 33.21);
});

test('decal vinyl floor is $8.50 until the raw area cost passes it', () => {
  assert.equal(vinylCost('decal', 10), 8.5);
  assert.equal(vinylCost('decal', 55), 8.5);
  assert.equal(vinylCost('decal', 56), 9);
});

test('extra vinyl starts after 900 for tee/hoodie/clock/bottle and after 225 for baby', () => {
  assert.equal(vinylCost('tee', 900), 0);
  assert.equal(vinylCost('hoodie', 900), 0);
  assert.equal(vinylCost('clock', 900), 0);
  assert.equal(vinylCost('bottle', 75), 0);
  assert.equal(vinylCost('tee', 901), 0.02);
  assert.equal(vinylCost('baby', 225), 0);
  assert.equal(vinylCost('baby', 226), 0.02);
});

test('10×10 graphic decal untracked and tracked', () => {
  const shared = {
    productType: 'decal',
    widthCm: 10,
    heightCm: 10,
    designType: 'graphic',
    requiresPrep: true,
    amount: 1,
    unitAmount: 100,
  };
  const untracked = mustQuote({ ...shared, shippingOption: 'untracked' });
  assert.equal(untracked.quote.areaCm2, 100);
  assert.equal(untracked.quote.base, 0);
  assert.equal(untracked.quote.rawAreaCost, 13);
  assert.equal(untracked.quote.vinyl, 13);
  assert.equal(untracked.quote.labour, 5);
  assert.equal(untracked.quote.prep, 0);
  assert.equal(untracked.input.requiresPrep, false);
  assert.equal(untracked.quote.subtotal, 18);
  assert.equal(untracked.quote.shipping, 4);
  assert.equal(untracked.quote.total, 22);

  const tracked = mustQuote({ ...shared, shippingOption: 'tracked' });
  assert.equal(tracked.quote.shipping, 10);
  assert.equal(tracked.quote.total, 28);
  assert.equal(tracked.quote.shippingLabel, 'Tracked Parcel Mailer ($10.00)');
});

test('text tee, text hoodie, and baby standard text inside the included area', () => {
  const tee = mustQuote({
    productType: 'tee',
    widthCm: 20,
    heightCm: 30,
    designType: 'text',
    textDensity: 'standard',
  });
  assert.equal(tee.quote.areaCm2, 600);
  assert.equal(tee.quote.base, 32);
  assert.equal(tee.quote.vinyl, 0);
  assert.equal(tee.quote.labour, 0);
  assert.equal(tee.quote.shipping, 12);
  assert.equal(tee.quote.total, 44);
  assert.equal(tee.quote.shippingLabel, 'Standard AusPost Parcel ($12.00)');

  const hoodie = mustQuote({
    productType: 'hoodie',
    widthCm: 25,
    heightCm: 30,
    designType: 'text',
    textDensity: 'standard',
    shippingOption: 'tracked',
  });
  assert.equal(hoodie.quote.base, 52);
  assert.equal(hoodie.quote.shipping, 12);
  assert.equal(hoodie.quote.total, 64);

  const baby = mustQuote({
    productType: 'baby',
    widthCm: 12,
    heightCm: 12,
    designType: 'text',
    textDensity: 'standard',
  });
  assert.equal(baby.quote.base, 24);
  assert.equal(baby.quote.areaCm2, 144);
  assert.equal(baby.quote.vinyl, 0);
  assert.equal(baby.quote.total, 36);
});

test('bottle 15×5 graphic and either orientation', () => {
  for (const size of [
    { widthCm: 15, heightCm: 5 },
    { widthCm: 5, heightCm: 15 },
  ]) {
    const bottle = mustQuote({
      productType: 'bottle',
      ...size,
      designType: 'graphic',
    });
    assert.equal(bottle.quote.areaCm2, 75);
    assert.equal(bottle.quote.base, 32);
    assert.equal(bottle.quote.vinyl, 0);
    assert.equal(bottle.quote.labour, 5);
    assert.equal(bottle.quote.shipping, 12);
    assert.equal(bottle.quote.total, 49);
  }
});

test('30×60 intricate decal adds area over 300 and optional prep', () => {
  const plain = mustQuote({
    productType: 'decal',
    widthCm: 30,
    heightCm: 60,
    designType: 'intricate',
    shippingOption: 'untracked',
    requiresPrep: false,
  });
  assert.equal(plain.quote.areaCm2, 1800);
  assert.equal(plain.quote.rawAreaCost, 63);
  assert.equal(plain.quote.vinyl, 63);
  assert.equal(plain.quote.labour, 12);
  assert.equal(plain.quote.prep, 0);
  assert.equal(plain.quote.subtotal, 75);
  assert.equal(plain.quote.total, 79);

  const prepped = mustQuote({
    productType: 'decal',
    widthCm: 60,
    heightCm: 30,
    designType: 'intricate',
    shippingOption: 'tracked',
    requiresPrep: true,
  });
  assert.equal(prepped.quote.prep, 10);
  assert.equal(prepped.quote.subtotal, 85);
  assert.equal(prepped.quote.shipping, 10);
  assert.equal(prepped.quote.total, 95);
});

test('prep is charged only when area is over 300', () => {
  const atCap = mustQuote({
    productType: 'decal',
    widthCm: 10,
    heightCm: 30,
    designType: 'graphic',
    shippingOption: 'untracked',
    requiresPrep: true,
  });
  assert.equal(atCap.quote.areaCm2, 300);
  assert.equal(atCap.quote.prep, 0);
  assert.equal(atCap.input.requiresPrep, false);

  const over = mustQuote({
    productType: 'decal',
    widthCm: 7,
    heightCm: 43,
    designType: 'graphic',
    shippingOption: 'untracked',
    requiresPrep: true,
  });
  assert.equal(over.quote.areaCm2, 301);
  assert.equal(over.quote.rawAreaCost, 33.02);
  assert.equal(over.quote.prep, 10);
  assert.equal(over.input.requiresPrep, true);
});

test('tee and baby area thresholds stay on the included-print boundary', () => {
  const teeIncluded = mustQuote({
    productType: 'tee',
    widthCm: 30,
    heightCm: 30,
    designType: 'graphic',
  });
  assert.equal(teeIncluded.quote.areaCm2, 900);
  assert.equal(teeIncluded.quote.vinyl, 0);
  assert.equal(teeIncluded.quote.prep, 0);

  const teeOver = mustQuote({
    productType: 'tee',
    widthCm: 17,
    heightCm: 53,
    designType: 'graphic',
    requiresPrep: true,
  });
  assert.equal(teeOver.quote.areaCm2, 901);
  assert.equal(teeOver.quote.vinyl, 0.02);
  assert.equal(teeOver.quote.prep, 10);
  assert.equal(teeOver.quote.base, 32);
  assert.equal(teeOver.quote.labour, 5);
  assert.equal(teeOver.quote.subtotal, 47.02);
  assert.equal(teeOver.quote.total, 59.02);

  const babyCap = mustQuote({
    productType: 'baby',
    widthCm: 15,
    heightCm: 15,
    designType: 'graphic',
  });
  assert.equal(babyCap.quote.vinyl, 0);
  assert.equal(babyCap.quote.total, 41);
});

test('minimum 2cm and every product max cap', () => {
  assert.equal(dimensionError('decal', 2, 2), null);
  assert.equal(dimensionError('decal', 1.99, 10), MIN_DIMENSION_ERROR);
  const tooSmall = quoteOrder({
    productType: 'tee',
    widthCm: 2,
    heightCm: 1,
    designType: 'text',
  });
  assert.equal(tooSmall.ok, false);
  if (!tooSmall.ok) assert.equal(tooSmall.error, MIN_DIMENSION_ERROR);

  assert.equal(dimensionError('decal', 30, 60), null);
  assert.equal(dimensionError('decal', 60, 30), null);
  assert.match(dimensionError('decal', 31, 50) || '', /30cm on the short side/);
  assert.match(dimensionError('tee', 20, 61) || '', /60cm on the long side/);
  assert.match(dimensionError('hoodie', 40, 40) || '', /short side/);

  assert.equal(dimensionError('baby', 15, 15), null);
  assert.match(dimensionError('baby', 15.1, 10) || '', /15cm × 15cm/);
  assert.match(dimensionError('baby', 10, 16) || '', /15cm × 15cm/);

  assert.equal(dimensionError('clock', 30, 30), null);
  assert.match(dimensionError('clock', 30, 30.1) || '', /30cm × 30cm/);

  assert.equal(dimensionError('bottle', 15, 5), null);
  assert.equal(dimensionError('bottle', 5, 15), null);
  assert.match(dimensionError('bottle', 15, 6) || '', /long side/);
  assert.match(dimensionError('bottle', 16, 5) || '', /long side/);
  assert.match(dimensionError('bottle', 5.1, 14) || '', /short side/);
});

test('dense text adds $5 and graphic or intricate labour does not use text density', () => {
  const dense = mustQuote({
    productType: 'tee',
    widthCm: 10,
    heightCm: 10,
    designType: 'text',
    textDensity: 'dense',
  });
  assert.equal(dense.quote.labour, 5);
  assert.equal(dense.quote.total, 49);

  const graphicIgnoresDensity = mustQuote({
    productType: 'tee',
    widthCm: 10,
    heightCm: 10,
    designType: 'graphic',
    textDensity: 'dense',
  });
  assert.equal(graphicIgnoresDensity.input.textDensity, null);
  assert.equal(graphicIgnoresDensity.quote.labour, 5);
});

test('quantity multiplies the item and leaves shipping once', () => {
  const result = mustQuote({
    productType: 'decal',
    widthCm: 10,
    heightCm: 10,
    designType: 'graphic',
    shippingOption: 'untracked',
  });
  assert.equal(chargedTotal(result.quote, 2), 40);
  assert.equal(chargedTotal(result.quote, 2.9), 40);
});

test('missing and invalid quote fields are rejected', () => {
  const missingSize = quoteOrder({ productType: 'decal', designType: 'graphic', shippingOption: 'untracked' });
  assert.equal(missingSize.ok, false);
  const badProduct = quoteOrder({ productType: 'sticker', widthCm: 10, heightCm: 10, designType: 'graphic' });
  assert.equal(badProduct.ok, false);
  const badShip = quoteOrder({
    productType: 'decal',
    widthCm: 10,
    heightCm: 10,
    designType: 'graphic',
    shippingOption: 'express',
  });
  assert.equal(badShip.ok, false);
  if (!badShip.ok) assert.match(badShip.error, /untracked or tracked/);
});
