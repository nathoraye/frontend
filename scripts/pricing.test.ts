import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chargedTotal,
  decalVinylCost,
  dimensionError,
  MIN_DIMENSION_ERROR,
  quoteOrder,
  vinylCost,
} from '../src/lib/pricing.ts';

function mustQuote(raw: Record<string, unknown>) {
  const result = quoteOrder(raw);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  if (!result.ok) throw new Error(result.error);
  return result;
}

test('single-colour decal vinyl follows the longest side', () => {
  assert.equal(decalVinylCost(5, 5), 5.5);
  assert.equal(decalVinylCost(7.5, 7.5), 7.25);
  assert.equal(decalVinylCost(10, 10), 9);
  assert.equal(decalVinylCost(15, 15), 12.5);
  assert.equal(decalVinylCost(20, 20), 16);
  assert.equal(decalVinylCost(30, 30), 23);
  assert.equal(decalVinylCost(2, 2), 4);
  assert.ok(decalVinylCost(30, 5) < decalVinylCost(30, 30));
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
    amount: 1,
    unitAmount: 100,
  };
  const untracked = mustQuote({ ...shared, shippingOption: 'untracked' });
  assert.equal(untracked.quote.areaCm2, 100);
  assert.equal(untracked.quote.base, 0);
  assert.equal(untracked.quote.rawAreaCost, 9);
  assert.equal(untracked.quote.vinyl, 9);
  assert.equal(untracked.quote.labour, 5);
  assert.equal(untracked.quote.subtotal, 14);
  assert.equal(untracked.quote.shipping, 4);
  assert.equal(untracked.quote.total, 18);

  const tracked = mustQuote({ ...shared, shippingOption: 'tracked' });
  assert.equal(tracked.quote.shipping, 10);
  assert.equal(tracked.quote.total, 24);
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

test('30×60 intricate decal adds area over 300', () => {
  const untracked = mustQuote({
    productType: 'decal',
    widthCm: 30,
    heightCm: 60,
    designType: 'intricate',
    shippingOption: 'untracked',
  });
  assert.equal(untracked.quote.areaCm2, 1800);
  assert.equal(untracked.quote.rawAreaCost, 34.1);
  assert.equal(untracked.quote.vinyl, 34.1);
  assert.equal(untracked.quote.labour, 12);
  assert.equal(untracked.quote.subtotal, 46.1);
  assert.equal(untracked.quote.total, 50.1);

  const tracked = mustQuote({
    productType: 'decal',
    widthCm: 60,
    heightCm: 30,
    designType: 'intricate',
    shippingOption: 'tracked',
    requiresPrep: true,
  });
  assert.equal(tracked.quote.subtotal, 46.1);
  assert.equal(tracked.quote.shipping, 10);
  assert.equal(tracked.quote.total, 56.1);
  assert.equal('prep' in tracked.quote, false);
  assert.equal('requiresPrep' in tracked.input, false);
});

test('a thinner decal costs less than a square of the same long side', () => {
  const atCap = mustQuote({
    productType: 'decal',
    widthCm: 10,
    heightCm: 30,
    designType: 'graphic',
    shippingOption: 'untracked',
    requiresPrep: true,
  });
  assert.equal(atCap.quote.areaCm2, 300);
  assert.equal(atCap.quote.vinyl, 16.1);
  assert.equal(atCap.quote.subtotal, 21.1);
  assert.equal(atCap.quote.total, 25.1);
  assert.ok(atCap.quote.vinyl < decalVinylCost(30, 30));

  const over = mustQuote({
    productType: 'decal',
    widthCm: 7,
    heightCm: 43,
    designType: 'graphic',
    shippingOption: 'untracked',
    prep: true,
  });
  assert.equal(over.quote.areaCm2, 301);
  assert.equal(over.quote.vinyl, 20.01);
  assert.equal(over.quote.subtotal, 25.01);
  assert.equal(over.quote.total, 29.01);
  assert.equal('prep' in over.quote, false);
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

  const teeOver = mustQuote({
    productType: 'tee',
    widthCm: 17,
    heightCm: 53,
    designType: 'graphic',
    requiresPrep: true,
  });
  assert.equal(teeOver.quote.areaCm2, 901);
  assert.equal(teeOver.quote.vinyl, 0.02);
  assert.equal(teeOver.quote.base, 32);
  assert.equal(teeOver.quote.labour, 5);
  assert.equal(teeOver.quote.subtotal, 37.02);
  assert.equal(teeOver.quote.total, 49.02);

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

  assert.equal(dimensionError('baby', 23, 25), null);
  assert.equal(dimensionError('baby', 25, 25), null);
  assert.match(dimensionError('baby', 25.1, 10) || '', /25cm × 25cm/);
  assert.match(dimensionError('baby', 10, 26) || '', /25cm × 25cm/);

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
  assert.equal(chargedTotal(result.quote, 2), 32);
  assert.equal(chargedTotal(result.quote, 2.9), 32);
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
