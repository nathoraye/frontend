import assert from 'node:assert/strict';
import test from 'node:test';
import { keyOutBackground, otsuThreshold, fitTraceSize, prepareTraceRaster, TRACE_MIN_EDGE } from '../src/utils/tracePrep.ts';

function fillRgba(
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return data;
}

function setRect(
  data: Uint8ClampedArray,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
}

function sample(data: Uint8ClampedArray, w: number, x: number, y: number) {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

test('transparent pixels become paper and light artwork stays ink', () => {
  const w = 40;
  const h = 40;
  const data = fillRgba(w, h, 0, 0, 0, 0);
  setRect(data, w, 12, 12, 28, 28, 230, 230, 230, 255);
  const { ink, paper } = keyOutBackground(data, w, h);
  assert.ok(ink > 200);
  assert.ok(paper > 1000);
  assert.deepEqual(sample(data, w, 0, 0), [255, 255, 255, 255]);
  assert.deepEqual(sample(data, w, 20, 20), [0, 0, 0, 255]);
});

test('red graffiti on a black mat keys out the mat and keeps the shape plus outline', () => {
  const w = 80;
  const h = 80;
  const data = fillRgba(w, h, 0, 0, 0, 255);
  // Inner red fill with a 4px black outline (same colour as the mat).
  setRect(data, w, 24, 24, 56, 56, 0, 0, 0, 255);
  setRect(data, w, 28, 28, 52, 52, 200, 20, 40, 255);
  const { ink, paper } = keyOutBackground(data, w, h);
  assert.ok(ink < w * h * 0.35, `mat must not become ink (${ink} ink pixels)`);
  assert.ok(ink > 400, `shape must not be dropped (${ink} ink pixels)`);
  assert.ok(paper > 4000);
  assert.deepEqual(sample(data, w, 1, 1), [255, 255, 255, 255]);
  assert.deepEqual(sample(data, w, 40, 40), [0, 0, 0, 255]);
  // Dilated outline just outside the red fill should be ink, not paper.
  assert.deepEqual(sample(data, w, 26, 40), [0, 0, 0, 255]);
});

test('black artwork on white paper stays ink', () => {
  const w = 40;
  const h = 40;
  const data = fillRgba(w, h, 255, 255, 255, 255);
  setRect(data, w, 10, 10, 30, 30, 0, 0, 0, 255);
  const { ink, paper } = keyOutBackground(data, w, h);
  assert.equal(ink, 400);
  assert.equal(paper, 1200);
  assert.deepEqual(sample(data, w, 0, 0), [255, 255, 255, 255]);
  assert.deepEqual(sample(data, w, 20, 20), [0, 0, 0, 255]);
});

test('Otsu finds a mid threshold on a bimodal black/white image', () => {
  const w = 32;
  const h = 32;
  const data = fillRgba(w, h, 255, 255, 255, 255);
  setRect(data, w, 0, 0, 16, 32, 0, 0, 0, 255);
  const t = otsuThreshold(data);
  assert.ok(t >= 64 && t <= 192, `expected mid-gray Otsu, got ${t}`);
});

test('fitTraceSize upsamples tiny logos (capped at 3×) and downsamples huge ones', () => {
  const tiny = fitTraceSize(100, 80);
  assert.equal(tiny.width, 300);
  assert.equal(tiny.height, 240);

  const mid = fitTraceSize(600, 400);
  assert.equal(mid.width, 600);
  assert.equal(mid.height, 400);

  const huge = fitTraceSize(2000, 500);
  assert.equal(huge.width, 1000);
  assert.equal(huge.height, 250);

  const minEdge = fitTraceSize(TRACE_MIN_EDGE, TRACE_MIN_EDGE);
  assert.equal(minEdge.width, TRACE_MIN_EDGE);
});

test('prepareTraceRaster keeps black-on-white ink after blur and binarize', () => {
  const w = 40;
  const h = 40;
  const data = fillRgba(w, h, 255, 255, 255, 255);
  setRect(data, w, 10, 10, 30, 30, 0, 0, 0, 255);
  const prepared = prepareTraceRaster(data, w, h);
  assert.ok(prepared.width >= w);
  assert.ok(prepared.height >= h);
  assert.ok(prepared.ink > 800, `ink vanished (${prepared.ink})`);
  assert.ok(prepared.paper > prepared.ink, 'paper should remain the majority');
  const cx = Math.floor(prepared.width / 2);
  const cy = Math.floor(prepared.height / 2);
  assert.deepEqual(sample(prepared.data, prepared.width, 1, 1), [255, 255, 255, 255]);
  assert.deepEqual(sample(prepared.data, prepared.width, cx, cy), [0, 0, 0, 255]);
});
