import assert from 'node:assert/strict';
import test from 'node:test';
import * as fabric from 'fabric';
import {
  eraseMatchingVectorColors,
  hasPaintedAppearance,
  keepMatchingVectorColors,
} from '../src/utils/wandVectorCleanup.ts';

const matchExact: (colorVal: unknown, hex: string) => boolean = (colorVal, hex) => {
  if (colorVal == null) return false;
  return String(colorVal).toLowerCase() === hex.toLowerCase();
};

function makeGroup(children: Record<string, unknown>[], extras: Record<string, unknown> = {}) {
  const group: Record<string, unknown> = {
    type: 'group',
    fill: '',
    stroke: 'transparent',
    _objects: children,
    remove(child: unknown) {
      this._objects = (this._objects as unknown[]).filter((item) => item !== child);
    },
    ...extras,
  };
  return group;
}

test('hasPaintedAppearance is true for a transparent group that still has painted children', () => {
  const leaf = { type: 'rect', fill: '#FF1493', stroke: '' };
  const inner = makeGroup([leaf]);
  const outer = makeGroup([inner]);
  assert.equal(hasPaintedAppearance(inner), true);
  assert.equal(hasPaintedAppearance(outer), true);
  assert.equal(hasPaintedAppearance({ type: 'group', fill: '', stroke: '', _objects: [] }), false);
  assert.equal(hasPaintedAppearance({ type: 'rect', fill: 'transparent', stroke: '' }), false);
});

test('extract cleanup keeps a nested group when only the descendant paint matches', () => {
  const pink = { type: 'rect', fill: '#FF1493', stroke: '' };
  const green = { type: 'rect', fill: '#00AA00', stroke: '' };
  const inner = makeGroup([pink, green]);
  const outer = makeGroup([inner]);

  keepMatchingVectorColors(outer as never, '#FF1493', 0.1, matchExact);

  assert.equal((outer._objects as unknown[]).length, 1);
  assert.equal(inner, (outer._objects as unknown[])[0]);
  assert.equal((inner._objects as unknown[]).length, 1);
  assert.equal((inner._objects as unknown[])[0], pink);
  assert.equal(pink.fill, '#FF1493');
});

test('extract cleanup does not treat an unpainted group wrapper as empty while descendants remain', () => {
  const pink = { type: 'path', fill: '#111111', stroke: 'transparent' };
  const wrapper = makeGroup([pink]);

  keepMatchingVectorColors(wrapper as never, '#111111', 0.1, matchExact);

  assert.equal((wrapper._objects as unknown[]).length, 1);
  assert.equal(pink.fill, '#111111');
});

test('extract cleanup still drops groups that have no remaining paint', () => {
  const green = { type: 'rect', fill: '#00AA00', stroke: '' };
  const inner = makeGroup([green]);
  const outer = makeGroup([inner]);

  keepMatchingVectorColors(outer as never, '#FF1493', 0.1, matchExact);

  assert.equal((outer._objects as unknown[]).length, 0);
});

test('erase cleanup keeps a group whose remaining children do not match the erased colour', () => {
  const pink = { type: 'rect', fill: '#FF1493', stroke: '' };
  const green = { type: 'rect', fill: '#00AA00', stroke: '' };
  const inner = makeGroup([pink, green]);
  const outer = makeGroup([inner]);

  eraseMatchingVectorColors(outer as never, '#FF1493', 0.1, matchExact);

  assert.equal((outer._objects as unknown[]).length, 1);
  assert.equal((inner._objects as unknown[]).length, 1);
  assert.equal(green.fill, '#00AA00');
});

test('fabric Group extract keeps a nested group that only paints via children', () => {
  const pink = new fabric.Rect({ fill: '#FF1493', width: 24, height: 24 });
  const green = new fabric.Rect({ fill: '#00AA00', width: 12, height: 12 });
  const inner = new fabric.Group([pink, green]);
  const outer = new fabric.Group([inner]);

  keepMatchingVectorColors(outer, '#FF1493', 0.1, matchExact);

  const outerKids = outer.getObjects();
  assert.equal(outerKids.length, 1);
  assert.equal(outerKids[0].type, 'group');
  const innerKids = (outerKids[0] as fabric.Group).getObjects();
  assert.equal(innerKids.length, 1);
  assert.equal(String(innerKids[0].fill).toLowerCase(), '#ff1493');
});
