import assert from 'node:assert/strict';
import test from 'node:test';
import * as fabric from 'fabric';
import { canNodeEdit, isNodeEditable } from '../src/utils/nodeEditMode.ts';

test('paths, polygons, and polylines are node-editable', () => {
  assert.equal(isNodeEditable(new fabric.Path('M 0 0 L 10 10 Z')), true);
  assert.equal(isNodeEditable(new fabric.Polygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }])), true);
  assert.equal(isNodeEditable(new fabric.Polyline([{ x: 0, y: 0 }, { x: 10, y: 10 }])), true);
  assert.equal(isNodeEditable(new fabric.Rect({ width: 10, height: 10 })), false);
  assert.equal(isNodeEditable(null), false);
});

test('groups with a path child can enter node edit', () => {
  const path = new fabric.Path('M 0 0 L 8 8 Z');
  const group = new fabric.Group([path]);
  assert.equal(canNodeEdit(group), true);
  assert.equal(canNodeEdit(new fabric.Group([new fabric.Rect({ width: 4, height: 4 })])), false);
});
