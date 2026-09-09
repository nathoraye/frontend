import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupStackedTracedSvg, listStackedLayers } from '../src/utils/svgTraceCleanup.ts';
import { DEFAULT_STACKED_TRACE, buildTraceQuery, normalizeColorTraceParams } from '../src/utils/traceParams.ts';
import { buildVtracerOptions, traceRgba } from '../traceColor.mjs';
import {
  assembleLayeredSvg,
  isPaperHex,
  isPaperPaint,
} from '../traceStacked.mjs';

function paint(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number?]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b, a = 255] = fn(x, y);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return data;
}

test('paper paint is dropped from vinyl palettes', () => {
  assert.equal(isPaperPaint(245, 245, 240, 255), true);
  assert.equal(isPaperPaint(20, 20, 20, 255), false);
  assert.equal(isPaperHex('#F5F5F0'), true);
  assert.equal(isPaperHex('#DC1E28'), false);
});

test('assembleLayeredSvg emits named groups back to front', () => {
  const svg = assembleLayeredSvg([
    { id: 'layer-silhouette', fill: '#000000', ds: ['M0 0h10v10H0Z'] },
    { id: 'layer-dc1e28', fill: '#DC1E28', ds: ['M2 2h4v4H2Z'] },
  ], 40, 40);
  assert.match(svg, /<g id="layer-silhouette" fill="#000000">/);
  assert.match(svg, /<g id="layer-dc1e28" fill="#DC1E28">/);
  const sil = svg.indexOf('layer-silhouette');
  const red = svg.indexOf('layer-dc1e28');
  assert.ok(sil < red, 'silhouette must sit behind colour sheets');
});

test('buildTraceQuery only adds hierarchical when stacked', () => {
  const cutout = new URLSearchParams(buildTraceQuery({ maxColors: 4 }));
  assert.equal(cutout.get('hierarchical'), null);
  const stacked = new URLSearchParams(buildTraceQuery({ ...DEFAULT_STACKED_TRACE }));
  assert.equal(stacked.get('hierarchical'), 'stacked');
  assert.equal(normalizeColorTraceParams({ hierarchical: 'stacked' }).hierarchical, 'stacked');
  assert.equal(buildVtracerOptions({ hierarchical: 'stacked' }).hierarchical, 'stacked');
  assert.equal(buildVtracerOptions({}).hierarchical, 'cutout');
});

test('stacked trace builds a silhouette plus per-colour groups without paper', () => {
  const w = 80;
  const h = 80;
  const rgba = paint(w, h, (x, y) => {
    const r = Math.hypot(x - 40, y - 32);
    if (r < 22 && r > 10) return [20, 20, 20];
    if (x > 36 && x < 44 && y > 32 && y < 70) return [20, 20, 20];
    if (x > 8 && x < 28 && y > 8 && y < 24) return [220, 30, 40];
    if (x > 52 && x < 72 && y > 8 && y < 24) return [30, 90, 210];
    return [245, 245, 240];
  });
  const svg = traceRgba(rgba, w, h, { maxColors: 4, hierarchical: 'stacked', filterSpeckle: 0 });
  assert.match(svg, /id="layer-silhouette"/);
  assert.doesNotMatch(svg, /fill="#F5F5F0"/i);
  const layers = listStackedLayers(svg);
  assert.ok(layers.length >= 3, `expected silhouette + colours, got ${JSON.stringify(layers)}`);
  assert.equal(layers[0].id, 'layer-silhouette');
  assert.ok(layers.some((layer) => /dc1e28/i.test(layer.id) || /dc1e28/i.test(layer.fill)));
  assert.ok(layers.some((layer) => /1e5ad2/i.test(layer.id) || /1e5ad2/i.test(layer.fill)));
  const cleaned = cleanupStackedTracedSvg(svg);
  assert.match(cleaned, /<g id="layer-silhouette"/);
  assert.equal(listStackedLayers(cleaned)[0].label, 'Silhouette');
});

test('solid black art keeps a silhouette and does not duplicate the black sheet', () => {
  const w = 48;
  const h = 48;
  const rgba = paint(w, h, (x, y) => (x > 8 && x < 40 && y > 8 && y < 40 ? [10, 10, 10] : [255, 255, 255]));
  const svg = traceRgba(rgba, w, h, { maxColors: 2, hierarchical: 'stacked' });
  const ids = [...svg.matchAll(/<g id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.includes('layer-silhouette'));
  assert.equal(ids.filter((id) => id === 'layer-000000' || id === 'layer-0a0a0a').length, 0);
});
