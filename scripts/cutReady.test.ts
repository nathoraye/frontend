import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectObjectsForCut } from '../src/utils/cutReady.ts';

test('empty mat is not cut-ready', () => {
  const report = inspectObjectsForCut([]);
  assert.equal(report.ok, false);
  assert.equal(report.ready, false);
  assert.ok(report.issues.some((i) => i.code === 'EMPTY_MAT'));
});

test('a vector shape without a weeding box is almost ready', () => {
  const report = inspectObjectsForCut([{ type: 'polygon', fill: '#FF1493' }]);
  assert.equal(report.ok, true);
  assert.equal(report.ready, false);
  assert.ok(report.issues.some((i) => i.code === 'NO_WEEDING_BOX'));
});

test('a leftover photo blocks cutting', () => {
  const report = inspectObjectsForCut([{ type: 'image' }]);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.code === 'RASTER_REMAINING'));
});

test('photos nested in a group are still flagged', () => {
  const report = inspectObjectsForCut([
    { type: 'group', getObjects: () => [{ type: 'image' }, { type: 'path' }] },
  ]);
  assert.equal(report.rasterCount, 1);
  assert.equal(report.vectorCount, 1);
  assert.equal(report.ok, false);
});

test('cyan weeding rect plus a path is cut ready', () => {
  const report = inspectObjectsForCut([
    { type: 'path', fill: '#000' },
    { type: 'rect', fill: 'transparent', stroke: '#00FFFF' },
  ]);
  assert.equal(report.hasWeedingBox, true);
  assert.equal(report.ready, true);
  assert.equal(report.issues.length, 0);
});

test('live text is a warning, not a hard error', () => {
  const report = inspectObjectsForCut([
    { type: 'i-text', fill: '#fff' },
    { type: 'rect', fill: 'transparent', stroke: '#00ffff' },
  ]);
  assert.equal(report.ok, true);
  assert.ok(report.issues.some((i) => i.code === 'LIVE_TEXT'));
});
