import assert from 'node:assert/strict';
import test from 'node:test';
import * as fabric from 'fabric/node';
import { cleanupTracedSvg } from '../src/utils/svgTraceCleanup.ts';
import { keepWeldArtwork, tightPackWeldObject, isPhantomWeldRect } from '../src/utils/weldImport.ts';
import { withSvgExportIsolation } from '../src/utils/weldExportIsolation.ts';
import { placeOverSource } from '../src/utils/placeTracedSvg.ts';

test('rgba(0,0,0,0) leftover paper is treated as a phantom weld rect', () => {
  assert.equal(
    isPhantomWeldRect({
      type: 'rect',
      fill: 'rgba(0,0,0,0)',
      strokeWidth: 0,
      width: 800,
      height: 600,
      left: 400,
      top: 300,
    }),
    true,
  );
});

test('placeOverSource scales by artboard frame so corner ink stays corner ink', async () => {
  const svg = cleanupTracedSvg(
    `<svg width="800" height="600">
      <path fill="#111111" d="M500 40 L760 40 L760 220 L500 220 Z"/>
    </svg>`,
    800,
    600,
  );
  const { objects } = await fabric.loadSVGFromString(svg);
  const paths = (objects || []).filter(Boolean) as fabric.FabricObject[];
  assert.equal(paths.length, 1);
  const ink = paths[0];
  const beforeW = ink.getScaledWidth();
  assert.ok(beforeW < 300, `ink should be tight before place, got ${beforeW}`);

  const source = new fabric.Rect({
    left: 600,
    top: 400,
    width: 400,
    height: 300,
    originX: 'center',
    originY: 'center',
  });
  placeOverSource(ink, source, { width: 800, height: 600 });

  // 260/800 of the photo ≈ 130 wide — not stretched to the full 400 photo width.
  assert.ok(
    ink.getScaledWidth() < 160,
    `expected ~130 wide corner logo, got ${ink.getScaledWidth()}`,
  );
  assert.ok(ink.getScaledWidth() > 100);
  // Ink centre maps to the right side of the photo, not the photo centre.
  assert.ok((ink.left || 0) > 600, `expected right-of-centre placement, got left=${ink.left}`);
});

test('weld of a corner-traced SVG keeps a tight selection box', async () => {
  const svg = cleanupTracedSvg(
    `<svg width="800" height="600">
      <path fill="#111111" d="M0 0 L2 0 L2 2 L0 2 Z"/>
      <path fill="#111111" d="M500 40 L760 40 L760 220 L500 220 Z"/>
      <path fill="#222222" d="M520 50 L700 50 L700 200 L520 200 Z"/>
    </svg>`,
    800,
    600,
  );
  assert.doesNotMatch(svg, /M\s*0\s+0/, 'distant dust must be stripped in cleanup');

  const canvas = new fabric.Canvas(undefined, { width: 1200, height: 800, backgroundColor: '' });
  const { objects } = await fabric.loadSVGFromString(svg);
  const paths = keepWeldArtwork((objects || []).filter(Boolean) as fabric.FabricObject[], {
    width: 800,
    height: 600,
  });
  const group = paths.length === 1
    ? paths[0]
    : new fabric.Group(paths, { originX: 'center', originY: 'center' });
  placeOverSource(group, new fabric.Rect({
    left: 600, top: 400, width: 400, height: 300, originX: 'center', originY: 'center',
  }), { width: 800, height: 600 });
  canvas.add(group);

  const beforeW = group.getScaledWidth();
  const beforeH = group.getScaledHeight();
  assert.ok(beforeW < 200, `pre-weld box should fit ink, got ${beforeW}`);

  const decoy = new fabric.Rect({ left: 40, top: 40, width: 200, height: 200, fill: '#00aaff' });
  canvas.add(decoy);

  const baked = withSvgExportIsolation(canvas.getObjects(), [group], () => {
    canvas.backgroundColor = '';
    return canvas.toSVG();
  });
  const { objects: imported, options } = await fabric.loadSVGFromString(baked);
  const kept = keepWeldArtwork((imported || []).filter(Boolean) as fabric.FabricObject[], {
    width: Number(options?.width || 0),
    height: Number(options?.height || 0),
  });
  const result = kept.length === 1
    ? kept[0]
    : new fabric.Group(kept, { originX: 'center', originY: 'center' });
  tightPackWeldObject(result);

  assert.ok(
    Math.abs((result as fabric.FabricObject).getScaledWidth() - beforeW) < 4,
    `weld width ${ (result as fabric.FabricObject).getScaledWidth() } should stay near ${beforeW}`,
  );
  assert.ok(
    Math.abs((result as fabric.FabricObject).getScaledHeight() - beforeH) < 4,
    `weld height ${ (result as fabric.FabricObject).getScaledHeight() } should stay near ${beforeH}`,
  );
  assert.ok((result as fabric.FabricObject).getScaledWidth() < 200);

  canvas.dispose();
});
