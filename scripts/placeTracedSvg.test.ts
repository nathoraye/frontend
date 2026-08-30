import assert from 'node:assert/strict';
import test from 'node:test';
import { isBackgroundFill, isBlackFill, isFullFrameShape } from '../src/utils/traceFills.ts';

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
  assert.equal(isFullFrameShape({ type: 'rect', width: 1024, height: 1024, scaleX: 1, scaleY: 1 }, 1024, 1024), true);
  assert.equal(isFullFrameShape({ type: 'path', width: 80, height: 90, scaleX: 1, scaleY: 1 }, 1024, 1024), false);
});
