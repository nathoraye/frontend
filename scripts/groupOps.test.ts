import assert from 'node:assert/strict';
import test from 'node:test';
import * as fabric from 'fabric';
import {
  forEachLeafObject,
  getGroupChildren,
  groupActiveSelection,
  isGroupLike,
  paintOffsetAppearance,
  ungroupOnce,
} from '../src/utils/groupOps.ts';

function path(d: string, fill: string) {
  return new fabric.Path(d, { fill });
}

function layeredStack() {
  const silhouette = new fabric.Group([path('M 0 0 H 40 V 40 H 0 Z', '#000000')]);
  (silhouette as fabric.Group & { name?: string }).name = 'Silhouette';
  const colour = new fabric.Group([path('M 8 8 H 32 V 32 H 8 Z', '#FFD400')]);
  (colour as fabric.Group & { name?: string }).name = '#FFD400';
  const stacked = new fabric.Group([silhouette, colour]);
  (stacked as fabric.Group & { name?: string }).name = 'Layered SVG';
  return stacked;
}

test('isGroupLike recognizes groups and selections', () => {
  assert.equal(isGroupLike(new fabric.Group([path('M0 0h2v2H0Z', '#000')])), true);
  assert.equal(isGroupLike(path('M0 0h2v2H0Z', '#000')), false);
});

test('paintOffsetAppearance reaches nested layered SVG leaves', () => {
  const stacked = layeredStack();
  assert.equal(isGroupLike(stacked), true);
  paintOffsetAppearance(stacked, 12);
  const fills: string[] = [];
  const widths: number[] = [];
  forEachLeafObject(stacked, (leaf) => {
    fills.push(String(leaf.fill));
    widths.push(leaf.strokeWidth || 0);
  });
  assert.equal(fills.length, 1);
  assert.equal(fills[0], '#FF1493');
  assert.equal(widths[0], 12);
  assert.equal((stacked as fabric.Object & { name?: string }).name, 'Offset');
  assert.equal(getGroupChildren(stacked).length, 1);
});

test('ungroupOnce explodes a layered stack into named cut sheets', () => {
  const stacked = layeredStack();
  const added: fabric.Object[] = [];
  const canvas = {
    add: (...objects: fabric.Object[]) => {
      added.push(...objects);
    },
    remove: () => {},
    setActiveObject: () => {},
    requestRenderAll: () => {},
  };
  const sheets = ungroupOnce(canvas, stacked);
  assert.ok(sheets.length >= 2);
  assert.deepEqual(
    added.map((obj) => (obj as fabric.Object & { name?: string }).name),
    sheets.map((obj) => (obj as fabric.Object & { name?: string }).name),
  );
  assert.ok(sheets.some((obj) => (obj as fabric.Object & { name?: string }).name === 'Silhouette'));
});

test('groupActiveSelection rebuilds a group without toGroup', () => {
  const a = path('M0 0h4v4H0Z', '#111');
  const b = path('M8 0h4v4H8Z', '#eee');
  const sel = { type: 'activeSelection', removeAll: () => [a, b], getObjects: () => [a, b] };
  const added: fabric.Object[] = [];
  let active: fabric.Object | null = null;
  const canvas = {
    add: (...objects: fabric.Object[]) => {
      added.push(...objects);
    },
    remove: () => {},
    setActiveObject: (obj: fabric.Object) => {
      active = obj;
    },
    requestRenderAll: () => {},
  };
  const grouped = groupActiveSelection(canvas, sel as unknown as fabric.ActiveSelection);
  assert.ok(grouped);
  assert.equal(isGroupLike(grouped), true);
  assert.equal(active, grouped);
  assert.equal(getGroupChildren(grouped!).length, 2);
});
