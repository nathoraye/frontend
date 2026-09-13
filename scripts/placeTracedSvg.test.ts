import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computePlaceOverSourceTransform,
  isBackgroundFill,
  isBlackFill,
  isFullFrameShape,
  measureInkBounds,
} from '../src/utils/placeTracedSvg.ts';
import type { Object as FabricObject } from 'fabric';

test('background fill variants are stripped', () => {
  assert.equal(isBackgroundFill('#fff'), true);
  assert.equal(isBackgroundFill('#FFFFFF'), true);
  assert.equal(isBackgroundFill('rgb(255, 255, 255)'), true);
  assert.equal(isBackgroundFill('transparent'), true);
  assert.equal(isBackgroundFill('#FF1493'), false);
});

test('black fill variants are detected', () => {
  assert.equal(isBlackFill('#000'), true);
  assert.equal(isBlackFill('rgb(0,0,0)'), true);
  assert.equal(isBlackFill('#FF1493'), false);
});

test('full-frame rects are treated as tracer background', () => {
  assert.equal(
    isFullFrameShape({ type: 'rect', width: 1024, height: 1024, scaleX: 1, scaleY: 1 }, 1024, 1024),
    true,
  );
  assert.equal(
    isFullFrameShape({ type: 'path', width: 860, height: 860, scaleX: 1, scaleY: 1 }, 1024, 1024),
    true,
  );
  assert.equal(
    isFullFrameShape({ type: 'path', width: 80, height: 90, scaleX: 1, scaleY: 1 }, 1024, 1024),
    false,
  );
});

test('place-over-source uses viewBox scale, not tight ink stretch', () => {
  // Old bug: ink 150×150 inside a 1000×1000 frame was scaled by source/ink ≈ 2.67×
  // so a small cutout filled the whole photo. Correct scale is source/frame = 0.4.
  const transform = computePlaceOverSourceTransform({
    sourceCenter: { x: 200, y: 200 },
    sourceScaledWidth: 400,
    sourceScaledHeight: 400,
    frame: { width: 1000, height: 1000 },
    ink: { left: 100, top: 100, width: 150, height: 150 },
  });

  assert.equal(transform.scaleX, 0.4);
  assert.equal(transform.scaleY, 0.4);
  // Ink centre (175,175) vs frame centre (500,500) → offset (-325,-325) * 0.4
  assert.equal(transform.left, 200 + (175 - 500) * 0.4);
  assert.equal(transform.top, 200 + (175 - 500) * 0.4);
});

test('place-over-source rotates ink offset with the source angle', () => {
  const transform = computePlaceOverSourceTransform({
    sourceCenter: { x: 0, y: 0 },
    sourceScaledWidth: 100,
    sourceScaledHeight: 100,
    sourceAngleDeg: 90,
    frame: { width: 100, height: 100 },
    // Ink centre at (75, 50) → local offset (+25, 0) before rotation
    ink: { left: 50, top: 25, width: 50, height: 50 },
  });
  assert.ok(Math.abs(transform.left - 0) < 1e-9);
  assert.ok(Math.abs(transform.top - 25) < 1e-9);
  assert.equal(transform.angle, 90);
});

test('measureInkBounds unions object boxes', () => {
  const objects = [
    { left: 10, top: 20, width: 30, height: 40, scaleX: 1, scaleY: 1 },
    { left: 100, top: 5, width: 10, height: 10, scaleX: 1, scaleY: 1 },
  ] as unknown as FabricObject[];
  const ink = measureInkBounds(objects);
  assert.equal(ink.left, 10);
  assert.equal(ink.top, 5);
  assert.equal(ink.width, 100);
  assert.equal(ink.height, 55);
});
