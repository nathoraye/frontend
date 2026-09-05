import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampPlacement,
  PLACEMENT_POS_RANGE,
  PLACEMENT_SCALE_MAX,
  PLACEMENT_SCALE_MIN,
} from '../src/utils/apparelPlacement.ts';

test('clamp allows offsets that reach sleeves and hem', () => {
  const wide = clampPlacement({ posX: 80, posY: -80, scale: 1, rotationDeg: 0 });
  assert.equal(wide.posX, PLACEMENT_POS_RANGE);
  assert.equal(wide.posY, -PLACEMENT_POS_RANGE);
  assert.ok(PLACEMENT_POS_RANGE >= 40, 'range must cover most of the garment');
});

test('clamp keeps scale usable from small to oversized', () => {
  assert.equal(clampPlacement({ posX: 0, posY: 0, scale: 0.01, rotationDeg: 0 }).scale, PLACEMENT_SCALE_MIN);
  assert.equal(clampPlacement({ posX: 0, posY: 0, scale: 99, rotationDeg: 0 }).scale, PLACEMENT_SCALE_MAX);
  assert.ok(PLACEMENT_SCALE_MAX >= 4);
});
