import assert from 'node:assert/strict';
import test from 'node:test';
import { flattenPathD, mergeSameColorDs, unionPathDs } from '../src/utils/pathContours.ts';

test('flattenPathD splits compound paths into separate contours', () => {
  const contours = flattenPathD('M 0 0 L 30 0 L 30 30 L 0 30 Z M 10 10 L 10 20 L 20 20 L 20 10 Z');
  assert.equal(contours.length, 2);
  assert.ok(contours[0].length >= 4);
  assert.ok(contours[1].length >= 4);
});

test('mergeSameColorDs concatenates disjoint blobs and keeps both moves', () => {
  const d = mergeSameColorDs(['M 1 1 L 8 1 L 8 8 L 1 8 Z', 'M 20 20 L 28 20 L 28 28 L 20 28 Z']);
  assert.match(d, /M 1 1/);
  assert.match(d, /M 20 20/);
});

test('union of overlapping squares is a single filled silhouette', () => {
  const d = unionPathDs(['M 0 0 L 20 0 L 20 20 L 0 20 Z', 'M 10 10 L 30 10 L 30 30 L 10 30 Z']);
  const subpaths = d.split(/M/i).filter(Boolean).length;
  assert.equal(subpaths, 1);
});

test('union of a ring keeps the hole subpath', () => {
  const d = unionPathDs(['M 0 0 L 30 0 L 30 30 L 0 30 Z M 10 10 L 10 20 L 20 20 L 20 10 Z']);
  const subpaths = d.split(/M/i).filter(Boolean).length;
  assert.equal(subpaths, 2);
});
