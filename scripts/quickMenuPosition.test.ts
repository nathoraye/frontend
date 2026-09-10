import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_QUICK_MENU_HEIGHT,
  DEFAULT_QUICK_MENU_WIDTH,
  FABRIC_ROTATE_HANDLE_OFFSET_Y,
  QUICK_MENU_GAP,
  TOUCH_CORNER_SIZE,
  placeQuickMenu,
  rectsOverlap,
  selectionFromFabricObject,
  type SelectionScreen,
} from '../src/utils/quickMenuPosition.ts';

const MENU = { width: DEFAULT_QUICK_MENU_WIDTH, height: DEFAULT_QUICK_MENU_HEIGHT };
const PHONE = { width: 390, height: 700 };

function menuBounds(top: number, left: number, size = MENU) {
  return {
    left: left - size.width / 2,
    top,
    right: left + size.width / 2,
    bottom: top + size.height,
  };
}

function handleBounds(rotate: { x: number; y: number }) {
  const r = TOUCH_CORNER_SIZE / 2 + QUICK_MENU_GAP;
  return {
    left: rotate.x - r,
    top: rotate.y - r,
    right: rotate.x + r,
    bottom: rotate.y + r,
  };
}

function midObject(): SelectionScreen {
  const box = { left: 140, top: 380, width: 110, height: 110 };
  return {
    box,
    rotateHandle: { x: 195, y: box.top - FABRIC_ROTATE_HANDLE_OFFSET_Y },
    bottomHandle: { x: 195, y: box.top + box.height },
  };
}

test('selectionFromFabricObject prefers oCoords.mtr over the bounding-box top', () => {
  const sel = selectionFromFabricObject({
    oCoords: {
      tl: { x: 100, y: 200 },
      tr: { x: 200, y: 200 },
      br: { x: 200, y: 300 },
      bl: { x: 100, y: 300 },
      mtr: { x: 150, y: 160 },
      mb: { x: 150, y: 300 },
    },
  });
  assert.ok(sel);
  assert.deepEqual(sel!.rotateHandle, { x: 150, y: 160 });
  assert.equal(sel!.box.top, 200);
  assert.equal(sel!.box.width, 100);
});

test('selectionFromFabricObject synthesizes mtr when the control is missing', () => {
  const sel = selectionFromFabricObject({
    oCoords: {
      tl: { x: 0, y: 40 },
      tr: { x: 80, y: 40 },
      br: { x: 80, y: 120 },
      bl: { x: 0, y: 120 },
    },
  });
  assert.ok(sel);
  assert.equal(sel!.rotateHandle.x, 40);
  assert.equal(sel!.rotateHandle.y, 40 - FABRIC_ROTATE_HANDLE_OFFSET_Y);
});

test('places the bar above the rotate handle with touch-target clearance', () => {
  const sel = midObject();
  const pos = placeQuickMenu(sel, PHONE, MENU);
  assert.equal(pos.placement, 'above');
  assert.equal(pos.left, sel.rotateHandle.x);
  const menu = menuBounds(pos.top, pos.left);
  assert.equal(
    rectsOverlap(menu, handleBounds(sel.rotateHandle)),
    false,
    'menu must not cover the rotate touch target',
  );
  assert.ok(
    menu.bottom <= sel.rotateHandle.y - TOUCH_CORNER_SIZE / 2,
    'menu bottom stays above the handle disc',
  );
});

test('old bounding-box-top-minus-90 placement would cover the rotate handle', () => {
  const sel = midObject();
  const oldTop = sel.box.top - 90;
  const old = menuBounds(oldTop, sel.rotateHandle.x);
  assert.equal(
    rectsOverlap(old, handleBounds(sel.rotateHandle)),
    true,
    'documents the phone bug: the previous offset sat on mtr',
  );
  const next = placeQuickMenu(sel, PHONE, MENU);
  assert.equal(rectsOverlap(menuBounds(next.top, next.left), handleBounds(sel.rotateHandle)), false);
});

test('flips below the object when there is no room above the rotate handle', () => {
  const box = { left: 140, top: 36, width: 110, height: 80 };
  const sel: SelectionScreen = {
    box,
    rotateHandle: { x: 195, y: box.top - FABRIC_ROTATE_HANDLE_OFFSET_Y },
    bottomHandle: { x: 195, y: box.top + box.height },
  };
  const pos = placeQuickMenu(sel, PHONE, MENU);
  assert.equal(pos.placement, 'below');
  assert.ok(pos.top >= box.top + box.height + TOUCH_CORNER_SIZE / 2);
  assert.equal(rectsOverlap(menuBounds(pos.top, pos.left), handleBounds(sel.rotateHandle)), false);
});

test('moves beside the object when above and below both clip the viewport', () => {
  const viewport = { width: 390, height: 420 };
  const box = { left: 40, top: 50, width: 310, height: 330 };
  const sel: SelectionScreen = {
    box,
    rotateHandle: { x: 195, y: box.top - FABRIC_ROTATE_HANDLE_OFFSET_Y },
    bottomHandle: { x: 195, y: box.top + box.height },
  };
  const pos = placeQuickMenu(sel, viewport, MENU);
  assert.equal(pos.placement, 'side');
  assert.equal(rectsOverlap(menuBounds(pos.top, pos.left), handleBounds(sel.rotateHandle)), false);
  const menu = menuBounds(pos.top, pos.left);
  assert.ok(menu.left >= 8);
  assert.ok(menu.right <= viewport.width - 8);
});

test('clamps horizontally so a left-edge object keeps the bar on screen', () => {
  const box = { left: 8, top: 300, width: 60, height: 60 };
  const sel: SelectionScreen = {
    box,
    rotateHandle: { x: 38, y: box.top - FABRIC_ROTATE_HANDLE_OFFSET_Y },
  };
  const pos = placeQuickMenu(sel, PHONE, MENU);
  const menu = menuBounds(pos.top, pos.left);
  assert.ok(menu.left >= 8);
  assert.ok(menu.right <= PHONE.width - 8);
  assert.equal(rectsOverlap(menu, handleBounds(sel.rotateHandle)), false);
});

test('tracks a rotated handle instead of the axis-aligned box top', () => {
  const box = { left: 120, top: 280, width: 140, height: 140 };
  const sel: SelectionScreen = {
    box,
    rotateHandle: { x: 250, y: 400 },
    bottomHandle: { x: 130, y: 300 },
  };
  const pos = placeQuickMenu(sel, PHONE, MENU);
  assert.equal(rectsOverlap(menuBounds(pos.top, pos.left), handleBounds(sel.rotateHandle)), false);
  if (pos.placement === 'above') {
    assert.ok(pos.top + MENU.height <= sel.rotateHandle.y - TOUCH_CORNER_SIZE / 2);
  }
});
