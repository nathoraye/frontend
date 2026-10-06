import assert from 'node:assert/strict';
import test from 'node:test';
import * as fabric from 'fabric';
import {
  canvasJsonHasObjects,
  registerCanvasCustomProperties,
} from '../src/utils/canvasSerialize.ts';

test('canvas JSON with objects is detected', () => {
  assert.equal(canvasJsonHasObjects('{"objects":[{"type":"rect"}]}'), true);
  assert.equal(canvasJsonHasObjects('{"objects":[]}'), false);
  assert.equal(canvasJsonHasObjects('not-json'), false);
});

test('Fabric serializes layered SVG name for undo and autosave', () => {
  registerCanvasCustomProperties();
  const sheet = new fabric.Group([]);
  const named = sheet as fabric.Group & { name?: string; aiPrompt?: string };
  named.name = 'Silhouette';
  named.aiPrompt = 'bold star';
  const json = sheet.toObject() as { name?: string; aiPrompt?: string };
  assert.equal(json.name, 'Silhouette');
  assert.equal(json.aiPrompt, 'bold star');
});

test('name is omitted without customProperties registration', () => {
  const prev = fabric.FabricObject.customProperties;
  fabric.FabricObject.customProperties = [];
  const sheet = new fabric.Group([]);
  (sheet as fabric.Group & { name?: string }).name = 'Offset';
  const json = sheet.toObject();
  fabric.FabricObject.customProperties = prev;
  registerCanvasCustomProperties();
  assert.equal(json.name, undefined);
});
