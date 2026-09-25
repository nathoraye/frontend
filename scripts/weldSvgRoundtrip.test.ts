import assert from 'node:assert/strict';
import test from 'node:test';
import * as fabric from 'fabric/node';
import { filterWeldImportedObjects, isPhantomWeldRect, keepWeldArtwork } from '../src/utils/weldImport.ts';
import { withSvgExportIsolation } from '../src/utils/weldExportIsolation.ts';

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

test('weld of artwork plus a distant speck fits the box to the artwork', async () => {
  const canvas = new fabric.Canvas(undefined, { width: 1200, height: 800, backgroundColor: '' });
  canvas.add(new fabric.Rect({ left: 720, top: 520, width: 280, height: 90, fill: '#111111' }));
  canvas.add(new fabric.Rect({ left: 40, top: 30, width: 3, height: 3, fill: '#111111' }));

  const svg = canvas.toSVG();
  const { objects, options } = await fabric.loadSVGFromString(svg);
  const imported = (objects || []).filter(Boolean) as fabric.FabricObject[];
  const loose = new fabric.Group(imported, { originX: 'center', originY: 'center' });
  assert.ok((loose.width || 0) > 500, 'unfiltered weld box should swallow the speck');

  const kept = keepWeldArtwork(imported, {
    width: Number(options?.width || 0),
    height: Number(options?.height || 0),
  });
  assert.equal(kept.length, 1);
  const tight = kept[0];
  assert.ok((tight.width || 0) <= 290, `expected tight width, got ${tight.width}`);
  assert.ok((tight.height || 0) <= 100, `expected tight height, got ${tight.height}`);

  canvas.dispose();
});

test('hiding non-selected objects still exports them; excludeFromExport isolates the weld', async () => {
  const canvas = new fabric.Canvas(undefined, { width: 1200, height: 800, backgroundColor: '' });
  const decoy = new fabric.Rect({ left: 40, top: 40, width: 220, height: 220, fill: '#00aaff' });
  const icons = [
    new fabric.Rect({ left: 900, top: 80, width: 40, height: 40, fill: '#111111' }),
    new fabric.Circle({ left: 960, top: 90, radius: 18, fill: '#111111' }),
    new fabric.Triangle({ left: 1020, top: 80, width: 40, height: 40, fill: '#111111' }),
  ];
  canvas.add(decoy, ...icons);

  const before = new fabric.ActiveSelection(icons, { canvas });
  canvas.setActiveObject(before);
  before.setCoords();
  const beforeW = before.getScaledWidth();
  const beforeH = before.getScaledHeight();

  // Legacy hide bake (the bug Nathan hit)
  const actives = canvas.getActiveObjects();
  const allObjs = canvas.getObjects();
  const visibilityMap = new Map();
  allObjs.forEach((obj) => {
    visibilityMap.set(obj, obj.visible);
    if (!actives.includes(obj)) obj.set('visible', false);
  });
  const hiddenSvg = canvas.toSVG();
  allObjs.forEach((obj) => obj.set('visible', visibilityMap.get(obj)));
  const hiddenImport = await fabric.loadSVGFromString(hiddenSvg);
  const hiddenKept = keepWeldArtwork(
    (hiddenImport.objects || []).filter(Boolean) as fabric.FabricObject[],
    { width: Number(hiddenImport.options?.width || 0), height: Number(hiddenImport.options?.height || 0) },
  );
  const broken = new fabric.Group(hiddenKept, { originX: 'center', originY: 'center' });
  assert.ok(
    (broken.getScaledWidth() || 0) > beforeW * 2,
    `hide-bake should swallow the decoy into a huge box (got ${broken.getScaledWidth()} vs before ${beforeW})`,
  );

  const isolatedSvg = withSvgExportIsolation(allObjs, actives, () => canvas.toSVG());
  const isolatedImport = await fabric.loadSVGFromString(isolatedSvg);
  const isolatedKept = keepWeldArtwork(
    (isolatedImport.objects || []).filter(Boolean) as fabric.FabricObject[],
    { width: Number(isolatedImport.options?.width || 0), height: Number(isolatedImport.options?.height || 0) },
  );
  assert.equal(isolatedKept.length, 3);
  const fixed = new fabric.Group(isolatedKept, { originX: 'center', originY: 'center' });
  assert.ok(Math.abs((fixed.getScaledWidth() || 0) - beforeW) < 2, `expected width ~${beforeW}, got ${fixed.getScaledWidth()}`);
  assert.ok(Math.abs((fixed.getScaledHeight() || 0) - beforeH) < 2, `expected height ~${beforeH}, got ${fixed.getScaledHeight()}`);
  assert.ok(Math.abs((fixed.left || 0) - (before.left || 0)) < 2);
  assert.ok(Math.abs((fixed.top || 0) - (before.top || 0)) < 2);

  canvas.dispose();
});
