import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupTracedSvg } from '../src/utils/svgTraceCleanup.ts';
import { DEFAULT_COLOR_TRACE, normalizeColorTraceParams } from '../src/utils/traceParams.ts';
import { buildVtracerOptions, traceRgba } from '../traceColor.mjs';

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

test('defaults keep colour count, sharp corners, and low speckle', () => {
  assert.equal(DEFAULT_COLOR_TRACE.maxColors, 8);
  assert.equal(DEFAULT_COLOR_TRACE.cornerThreshold, 90);
  assert.equal(DEFAULT_COLOR_TRACE.filterSpeckle, 2);
  const opts = buildVtracerOptions(DEFAULT_COLOR_TRACE);
  assert.equal(opts.clustering, 'color-cluster');
  assert.equal(opts.hierarchical, 'cutout');
  assert.equal(opts.mode, 'polygon');
  assert.equal(opts.maxColors, 8);
  assert.equal(opts.filterSpeckle, 2);
});

test('higher curve-fit switches to spline', () => {
  const lo = buildVtracerOptions({ curveFit: 2 });
  const hi = buildVtracerOptions({ curveFit: 8 });
  assert.equal(lo.mode, 'polygon');
  assert.equal(hi.mode, 'spline');
  assert.ok(Number(hi.simplify) > Number(lo.simplify));
});

test('VTracer emits one fill per distinct colour and keeps the ring hole', () => {
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
  const raw = traceRgba(rgba, w, h, DEFAULT_COLOR_TRACE);
  const svg = cleanupTracedSvg(raw, w, h);
  const fills = [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
  const unique = new Set(fills);
  assert.ok(unique.size >= 3, `expected ≥3 colours, got ${[...unique]}`);
  assert.ok([...unique].some((f) => f === '#DC1E28' || f.startsWith('#DC')));
  assert.ok([...unique].some((f) => f === '#1E5AD2' || f.startsWith('#1E')));
  const black = [...svg.matchAll(/<path fill="([^"]+)" fill-rule="evenodd" d="([^"]+)"/g)]
    .find((m) => m[1] === '#141414' || m[1] === '#151515' || m[1] === '#161616');
  assert.ok(black, 'missing dark graffiti path');
  const subpaths = black![2].split(/M/i).filter(Boolean).length;
  assert.ok(subpaths >= 2, 'ring must keep a hole subpath so O/0 counters stay open');
  assert.doesNotMatch(svg, /fill="#F5F5F0"/);
});

test('normalize clamps colour count', () => {
  assert.equal(normalizeColorTraceParams({ maxColors: 99 }).maxColors, 32);
  assert.equal(normalizeColorTraceParams({ maxColors: 1 }).maxColors, 2);
});
