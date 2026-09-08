import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canvasPixelFromClient,
  distance,
  getClientPoint,
  midpoint,
  sampleOpaquePixel,
} from '../src/utils/pointerEvents.ts';

test('getClientPoint reads mouse / pointer client coordinates', () => {
  assert.deepEqual(getClientPoint({ clientX: 12, clientY: 34 }), { x: 12, y: 34 });
  assert.equal(getClientPoint(null), null);
  assert.equal(getClientPoint({}), null);
});

test('getClientPoint reads finger coordinates from a TouchEvent-shaped object', () => {
  assert.deepEqual(
    getClientPoint({ touches: [{ clientX: 80, clientY: 120 }] }),
    { x: 80, y: 120 },
  );
  assert.deepEqual(
    getClientPoint({ changedTouches: [{ clientX: 9, clientY: 11 }] }),
    { x: 9, y: 11 },
  );
  // touchend: touches is empty, changedTouches still has the lifted finger
  assert.deepEqual(
    getClientPoint({ touches: [], changedTouches: [{ clientX: 4, clientY: 5 }] }),
    { x: 4, y: 5 },
  );
});

test('canvasPixelFromClient maps CSS pixels onto the backing store', () => {
  const el = {
    width: 600,
    height: 400,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 300, height: 200 }) as DOMRect,
  };
  assert.deepEqual(canvasPixelFromClient(el, 10 + 150, 20 + 100), { x: 300, y: 200 });
});

test('sampleOpaquePixel finds a nearby painted pixel when the tap is off-centre', () => {
  const painted = new Map<string, Uint8ClampedArray>([
    ['9,9', new Uint8ClampedArray([255, 20, 147, 255])],
  ]);
  const ctx = {
    canvas: { width: 20, height: 20 },
    getImageData(x: number, y: number) {
      return { data: painted.get(`${x},${y}`) ?? new Uint8ClampedArray([0, 0, 0, 0]) };
    },
  } as unknown as CanvasRenderingContext2D;

  assert.equal(ctx.getImageData(0, 0, 1, 1).data[3], 0);
  const hit = sampleOpaquePixel(ctx, 0, 0, 12);
  assert.ok(hit);
  assert.equal(hit!.r, 255);
  assert.equal(hit!.g, 20);
  assert.equal(hit!.b, 147);
  assert.equal(hit!.x, 9);
  assert.equal(hit!.y, 9);
});

test('midpoint and distance helpers', () => {
  assert.deepEqual(midpoint({ x: 0, y: 0 }, { x: 10, y: 10 }), { x: 5, y: 5 });
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});
