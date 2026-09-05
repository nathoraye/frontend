import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import * as fabric from 'fabric/node';
import { snapshotDesignAsDataURL } from '../src/utils/designSnapshot.ts';

const require = createRequire(import.meta.url);

function countOpaquePixels(dataUrl: string): Promise<{ width: number; height: number; opaque: number }> {
  const { Image, createCanvas } = require('canvas') as {
    Image: typeof Image;
    createCanvas: (w: number, h: number) => { getContext: (id: '2d') => CanvasRenderingContext2D };
  };
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const off = createCanvas(img.width, img.height);
      const ctx = off.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, img.width, img.height);
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 10) opaque += 1;
      }
      resolve({ width: img.width, height: img.height, opaque });
    };
    img.onerror = () => reject(new Error('failed to decode snapshot'));
    img.src = dataUrl;
  });
}

test('snapshot captures artwork at identity zoom', async () => {
  const canvas = new fabric.Canvas(undefined, { width: 800, height: 600 });
  canvas.add(new fabric.Rect({ left: 300, top: 220, width: 160, height: 140, fill: '#111111' }));
  const snap = snapshotDesignAsDataURL(canvas);
  const pixels = await countOpaquePixels(snap);
  assert.ok(pixels.opaque > 1000, `expected painted pixels, got ${pixels.opaque}`);
  canvas.dispose();
});

test('snapshot still captures artwork after zoom and pan', async () => {
  const canvas = new fabric.Canvas(undefined, { width: 800, height: 600 });
  canvas.add(new fabric.Rect({ left: 300, top: 220, width: 160, height: 140, fill: '#111111' }));
  canvas.setZoom(2.4);
  canvas.absolutePan(new fabric.Point(120, 80));
  const snap = snapshotDesignAsDataURL(canvas);
  const pixels = await countOpaquePixels(snap);
  assert.ok(pixels.opaque > 1000, `zoomed crop was empty (${pixels.opaque} opaque px)`);
  assert.equal(canvas.getZoom(), 2.4);
  canvas.dispose();
});
