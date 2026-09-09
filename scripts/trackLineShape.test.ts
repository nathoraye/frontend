import assert from 'node:assert/strict';
import test from 'node:test';
import * as fabric from 'fabric';
import {
  collectTrackPoints,
  createTrackLineShape,
  uniqueTrackPoints,
} from '../src/utils/trackLineShape.ts';

test('uniqueTrackPoints drops duplicate taps but keeps a real stroke', () => {
  assert.deepEqual(
    uniqueTrackPoints([
      { x: 10, y: 10 },
      { x: 10, y: 11 },
      { x: 10, y: 80 },
    ]),
    [
      { x: 10, y: 10 },
      { x: 10, y: 80 },
    ],
  );
});

test('collectTrackPoints keeps a one-finger rubber-band as the second point', () => {
  const pts = collectTrackPoints([{ x: 40, y: 20 }], { x2: 40, y2: 220 });
  assert.equal(pts.length, 2);
  assert.deepEqual(pts[1], { x: 40, y: 220 });
});

test('a two-point vertical stroke becomes a Line, not a zero-width Polyline', () => {
  const shape = createTrackLineShape(fabric, [{ x: 100, y: 10 }, { x: 100, y: 240 }], {
    brushSize: 12,
    brushColor: '#111111',
  });
  assert.ok(shape);
  assert.equal(shape!.type, 'line');
  assert.equal(shape!.stroke, '#111111');
  assert.equal(shape!.strokeWidth, 12);
});

test('three or more points become a Polyline; close makes a Polygon', () => {
  const poly = createTrackLineShape(fabric, [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 30 },
  ]);
  assert.equal(poly?.type, 'polyline');
  const closed = createTrackLineShape(
    fabric,
    [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 20, y: 30 },
    ],
    { closed: true },
  );
  assert.equal(closed?.type, 'polygon');
});
