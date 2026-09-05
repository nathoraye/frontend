import assert from 'node:assert/strict';
import test from 'node:test';
import * as fabric from 'fabric/node';
import { filterWeldImportedObjects, isPhantomWeldRect } from '../src/utils/weldImport.ts';

function summarize(objects: fabric.FabricObject[]) {
  return objects.filter(Boolean).map((obj) => ({
    type: String(obj.type || ''),
    fill: String(obj.fill ?? ''),
    stroke: String(obj.stroke ?? ''),
    strokeWidth: Number(obj.strokeWidth) || 0,
    width: obj.width,
    height: obj.height,
    left: obj.left,
    top: obj.top,
  }));
}

async function bake(canvas: fabric.Canvas, backgroundColor: string) {
  const previous = canvas.backgroundColor;
  canvas.backgroundColor = backgroundColor;
  const svg = canvas.toSVG();
  canvas.backgroundColor = previous;
  const { objects, options } = await fabric.loadSVGFromString(svg);
  const imported = (objects || []).filter(Boolean) as fabric.FabricObject[];
  return { svg, imported, options };
}

test('transparent canvas background re-imports leftover origin rects; empty background does not', async () => {
  const canvas = new fabric.Canvas(undefined, { width: 800, height: 600, backgroundColor: '#2a2e3c' });
  canvas.add(new fabric.Rect({ left: 240, top: 180, width: 160, height: 120, fill: '#111111' }));
  canvas.add(new fabric.Circle({ left: 380, top: 200, radius: 50, fill: '#111111' }));
  canvas.add(new fabric.FabricText('KAS', { left: 250, top: 140, fill: '#111111', fontSize: 64, fontFamily: 'Arial' }));

  const broken = await bake(canvas, 'transparent');
  assert.match(broken.svg, /width="100%"/, 'Fabric writes a 100% paper rect when backgroundColor is the string transparent');
  const brokenSummary = summarize(broken.imported);
  const leftover = brokenSummary.filter((obj) => isPhantomWeldRect(obj));
  assert.ok(leftover.length >= 1, `expected leftover paper rects, got ${JSON.stringify(brokenSummary)}`);

  const fixed = await bake(canvas, '');
  assert.doesNotMatch(fixed.svg, /width="100%"/, 'empty backgroundColor skips the paper rect');
  const kept = filterWeldImportedObjects(summarize(fixed.imported), {
    width: Number(fixed.options?.width || 0),
    height: Number(fixed.options?.height || 0),
  });
  assert.equal(kept.filter((obj) => obj.type === 'rect' && isPhantomWeldRect(obj)).length, 0);
  assert.ok(kept.some((obj) => obj.type === 'rect' || obj.type === 'path' || obj.type === 'circle' || obj.type === 'i-text' || obj.type === 'text'));

  canvas.dispose();
});

test('painting every weld child without filtering would create extra outline boxes', async () => {
  const canvas = new fabric.Canvas(undefined, { width: 800, height: 600, backgroundColor: '#2a2e3c' });
  canvas.add(new fabric.Rect({ left: 300, top: 220, width: 140, height: 140, fill: '#000000' }));
  const broken = await bake(canvas, 'transparent');
  const painted = summarize(broken.imported).map((obj) => ({
    ...obj,
    fill: '#FF1493',
    stroke: '#FF1493',
  }));
  const extraPinkBoxes = painted.filter((obj) => obj.type === 'rect' && isPhantomWeldRect({
    ...obj,
    fill: broken.imported.find((raw) => raw.type === obj.type && raw.left === obj.left)?.fill,
    stroke: broken.imported.find((raw) => raw.type === obj.type && raw.left === obj.left)?.stroke,
    strokeWidth: broken.imported.find((raw) => raw.type === obj.type && raw.left === obj.left)?.strokeWidth,
  }));
  assert.ok(extraPinkBoxes.length >= 1, 'Add Outline used to paint leftover paper as extra pink boxes');

  const filtered = filterWeldImportedObjects(summarize(broken.imported));
  assert.equal(filtered.filter((obj) => isPhantomWeldRect(obj)).length, 0);

  canvas.dispose();
});
