import assert from 'node:assert/strict';
import test from 'node:test';
import * as fabric from 'fabric/node';
import { deserializeCanvas, serializeCanvas } from '../src/utils/canvasSerialize.ts';
import { serializeDesignSvgForOrder } from '../src/utils/orderDesignSerialize.ts';

const SAMPLE = 'WEST VINYL\nHI';

function secondLineX(svg: string): number {
  const xs = [...svg.matchAll(/<tspan x="([^"]+)"/g)].map((match) => Number(match[1]));
  assert.equal(xs.length, 2);
  return xs[1];
}

test('multi-line text alignment moves the short line in the SVG and survives save and undo', async () => {
  const canvas = new fabric.StaticCanvas(undefined, { width: 800, height: 500 });
  const text = new fabric.IText(SAMPLE, { fontSize: 64, left: 80, top: 80 });
  canvas.add(text);

  const leftSvg = text.toSVG();
  text.set('textAlign', 'center');
  const centreSvg = text.toSVG();
  text.set('textAlign', 'right');
  const rightSvg = text.toSVG();

  const leftX = secondLineX(leftSvg);
  const centreX = secondLineX(centreSvg);
  const rightX = secondLineX(rightSvg);
  assert.ok(centreX > leftX);
  assert.ok(rightX > centreX);

  const saved = serializeCanvas(canvas);
  assert.match(saved, /"textAlign":"right"/);
  const checkoutSvg = await serializeDesignSvgForOrder(canvas);
  assert.equal(secondLineX(checkoutSvg), rightX);

  const restoredCanvas = new fabric.StaticCanvas(undefined, { width: 800, height: 500 });
  await deserializeCanvas(restoredCanvas, saved);
  const restored = restoredCanvas.getObjects()[0] as fabric.IText;
  assert.equal(restored.text, SAMPLE);
  assert.equal(restored.textAlign, 'right');
  assert.equal(secondLineX(restored.toSVG()), rightX);

  canvas.dispose();
  restoredCanvas.dispose();
});
