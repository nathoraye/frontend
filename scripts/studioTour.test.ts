import assert from 'node:assert/strict';
import test from 'node:test';
import { placeTourBubble, rectsOverlap, type TourBox } from '../src/utils/studioTour.ts';

const BUBBLE = { width: 280, height: 160 };

function assertOnScreen(
  placement: { top: number; left: number },
  target: TourBox,
  viewport: { width: number; height: number },
) {
  const box: TourBox = { x: placement.left, y: placement.top, width: BUBBLE.width, height: BUBBLE.height };
  assert.ok(box.x >= 8 - 0.01, `left ${box.x} is inside the margin`);
  assert.ok(box.y >= 8 - 0.01, `top ${box.y} is inside the margin`);
  assert.ok(box.x + box.width <= viewport.width - 8 + 0.01, `right edge stays on screen`);
  assert.ok(box.y + box.height <= viewport.height - 8 + 0.01, `bottom edge stays on screen`);
  assert.equal(rectsOverlap(box, target), false);
}

test('left-dock target on 1280 prefers the right side', () => {
  const viewport = { width: 1280, height: 800 };
  const target = { x: 12, y: 180, width: 44, height: 44 };
  const placement = placeTourBubble(target, BUBBLE, viewport);
  assert.equal(placement.side, 'right');
  assertOnScreen(placement, target, viewport);
});

test('right-panel target on 1280 prefers the left side', () => {
  const viewport = { width: 1280, height: 800 };
  const target = { x: 980, y: 70, width: 260, height: 48 };
  const placement = placeTourBubble(target, BUBBLE, viewport);
  assert.equal(placement.side, 'left');
  assertOnScreen(placement, target, viewport);
});

test('top-center bar on a 375 phone prefers below the control', () => {
  const viewport = { width: 375, height: 812 };
  const target = { x: 90, y: 16, width: 190, height: 40 };
  const placement = placeTourBubble(target, BUBBLE, viewport);
  assert.equal(placement.side, 'bottom');
  assertOnScreen(placement, target, viewport);
});

test('a phone inspector control stays clear of a wide bubble', () => {
  const viewport = { width: 375, height: 700 };
  const target = { x: 215, y: 110, width: 150, height: 44 };
  const bubble = { width: 300, height: 170 };
  const placement = placeTourBubble(target, bubble, viewport);
  const box: TourBox = { x: placement.left, y: placement.top, width: bubble.width, height: bubble.height };
  assert.ok(box.x >= 8 - 0.01);
  assert.ok(box.y >= 8 - 0.01);
  assert.ok(box.x + box.width <= viewport.width - 8 + 0.01);
  assert.ok(box.y + box.height <= viewport.height - 8 + 0.01);
  assert.equal(rectsOverlap(box, target), false);
});
