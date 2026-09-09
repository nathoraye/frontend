import assert from 'node:assert/strict';
import test from 'node:test';
import { filterWeldImportedObjects, isPhantomWeldRect, stripPhantomWeldChildren, dropDistantSpecks, keepWeldArtwork } from '../src/utils/weldImport.ts';

test('transparent canvas-export rects are phantom leftover boxes', () => {
  assert.equal(isPhantomWeldRect({ type: 'rect', fill: 'transparent', width: 100, height: 100, left: 0, top: 0 }), true);
  assert.equal(isPhantomWeldRect({ type: 'rect', fill: 'none', stroke: '', strokeWidth: 0, width: 1200, height: 800 }), true);
  assert.equal(isPhantomWeldRect({ id: 'workspace', type: 'path' }), true);
});

test('100% background parsed as a 100×100 square at the origin is dropped', () => {
  assert.equal(
    isPhantomWeldRect({ type: 'rect', fill: 'transparent', width: 100, height: 100, left: 0, top: 0, strokeWidth: 0 }),
    true,
  );
  // Real Fabric 7 import: center origin moves the 100×100 paper to 50,50
  assert.equal(
    isPhantomWeldRect({
      type: 'rect',
      fill: 'transparent',
      stroke: '',
      strokeWidth: 1,
      width: 100,
      height: 100,
      left: 50,
      top: 50,
    }),
    true,
  );
});

test('real artwork and weeding boxes are kept', () => {
  assert.equal(isPhantomWeldRect({ type: 'path', fill: '#000000', width: 400, height: 200 }), false);
  assert.equal(
    isPhantomWeldRect({
      type: 'rect',
      fill: 'transparent',
      stroke: '#00FFFF',
      strokeWidth: 1,
      width: 200,
      height: 120,
    }),
    false,
  );
  assert.equal(isPhantomWeldRect({ type: 'rect', fill: '#FF1493', width: 100, height: 100, left: 0, top: 0 }), false);
  assert.equal(
    isPhantomWeldRect({ type: 'rect', fill: '#ffffff', width: 80, height: 80, left: 40, top: 40 }),
    false,
  );
});

test('full-frame paper rects matching the SVG document are dropped', () => {
  assert.equal(
    isPhantomWeldRect(
      { type: 'rect', fill: '#ffffff', width: 1200, height: 800 },
      { width: 1200, height: 800 },
    ),
    true,
  );
});

test('filterWeldImportedObjects keeps only real cut shapes', () => {
  const kept = filterWeldImportedObjects([
    { type: 'rect', fill: 'transparent', width: 100, height: 100, left: 0, top: 0 },
    { type: 'path', fill: '#111111', width: 240, height: 80 },
    { type: 'rect', fill: 'transparent', width: 100, height: 100, left: 0, top: 0 },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].type, 'path');
});

test('dropDistantSpecks removes far dust but keeps nearby drips', () => {
  const art = {
    type: 'path',
    fill: '#111111',
    left: 800,
    top: 560,
    width: 280,
    height: 90,
    originX: 'center',
    originY: 'center',
  };
  const speck = {
    type: 'path',
    fill: '#111111',
    left: 40,
    top: 30,
    width: 3,
    height: 3,
    originX: 'center',
    originY: 'center',
  };
  const drip = {
    type: 'path',
    fill: '#111111',
    left: 945,
    top: 560,
    width: 8,
    height: 8,
    originX: 'center',
    originY: 'center',
  };
  const kept = dropDistantSpecks([art, speck, drip]);
  assert.equal(kept.length, 2);
  assert.ok(kept.includes(art));
  assert.ok(kept.includes(drip));
  assert.ok(!kept.includes(speck));
});

test('keepWeldArtwork drops leftover paper and distant specks together', () => {
  const kept = keepWeldArtwork([
    { type: 'rect', fill: 'transparent', width: 100, height: 100, left: 50, top: 50, originX: 'center', originY: 'center' },
    { type: 'path', fill: '#111111', width: 240, height: 80, left: 400, top: 300, originX: 'center', originY: 'center' },
    { type: 'path', fill: '#111111', width: 2, height: 2, left: 8, top: 8, originX: 'center', originY: 'center' },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].width, 240);
});

test('two large distant shapes stay — they are not specks', () => {
  const left = { type: 'path', fill: '#111', width: 120, height: 80, left: 80, top: 80, originX: 'center', originY: 'center' };
  const right = { type: 'path', fill: '#111', width: 120, height: 80, left: 700, top: 80, originX: 'center', originY: 'center' };
  const kept = dropDistantSpecks([left, right]);
  assert.equal(kept.length, 2);
});

test('stripPhantomWeldChildren removes leftover origin squares from a group', () => {
  const leftover = { type: 'rect', fill: 'transparent', width: 100, height: 100, left: 0, top: 0 };
  const art = { type: 'path', fill: '#111111', width: 240, height: 80 };
  const children = [leftover, art];
  const group = {
    type: 'group',
    getObjects: () => children,
    remove: (child: unknown) => {
      const idx = children.indexOf(child as typeof leftover);
      if (idx >= 0) children.splice(idx, 1);
    },
  };
  assert.equal(stripPhantomWeldChildren(group), 1);
  assert.deepEqual(children, [art]);
});
