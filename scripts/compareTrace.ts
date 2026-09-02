/**
 * Before/after harness for the vinyl SVG tracer.
 * Usage: node --experimental-strip-types scripts/compareTrace.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import ImageTracer from 'imagetracerjs';
import {
  downsampleNearest,
  keyOutBackground,
  stampWhiteBorder,
  prepareTraceRaster,
  TRACE_MAX_EDGE,
} from '../src/utils/tracePrep.ts';
import { LEGACY_TRACE_OPTIONS, vinylTraceOptions } from '../src/utils/traceOptions.ts';
import { cleanupTracedSvg } from '../src/utils/svgTraceCleanup.ts';

/** Node has no canvas ImageData; ImageTracer only reads data/width/height. */
class ImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace = 'srgb' as const;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

function noisyLogo(size = 180): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      const inRing = r < size * 0.38 && r > size * 0.16;
      const inStem = x > cx - 8 && x < cx + 8 && y > cy && y < size * 0.82;
      let ink = inRing || inStem;
      // JPEG-like luma noise
      const n = ((x * 73 + y * 19) % 17) - 8;
      // Salt-and-pepper speckles
      const speckle = ((x * 13 + y * 31) % 97) === 0;
      if (speckle) ink = !ink;
      const v = ink ? Math.max(0, 18 + n) : Math.min(255, 235 + n);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, size, size);
}

function legacyTrace(imageData: ImageData): string {
  const copied = new Uint8ClampedArray(imageData.data);
  const down = downsampleNearest(copied, imageData.width, imageData.height, TRACE_MAX_EDGE);
  const { ink, paper } = keyOutBackground(down.data, down.width, down.height);
  if (ink === 0) throw new Error('legacy: no ink');
  if (paper === 0) stampWhiteBorder(down.data, down.width, down.height);
  const pixels = new Uint8ClampedArray(down.data.length);
  pixels.set(down.data);
  return ImageTracer.imagedataToSVG(new ImageData(pixels, down.width, down.height), LEGACY_TRACE_OPTIONS);
}

function improvedTrace(imageData: ImageData): string {
  const prepared = prepareTraceRaster(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  );
  if (prepared.ink === 0) throw new Error('improved: no ink');
  const pixels = new Uint8ClampedArray(prepared.data.length);
  pixels.set(prepared.data);
  const raw = ImageTracer.imagedataToSVG(
    new ImageData(pixels, prepared.width, prepared.height),
    vinylTraceOptions(5),
  );
  return cleanupTracedSvg(raw, prepared.width, prepared.height);
}

function stats(svg: string) {
  const paths = svg.match(/<path\b/g)?.length ?? 0;
  const q = (svg.match(/\bQ\b/g) || []).length;
  const c = (svg.match(/\bC\b/g) || []).length;
  const l = (svg.match(/\bL\b/g) || []).length;
  const longDecimals = (svg.match(/\d+\.\d{3,}/g) || []).length;
  return { bytes: Buffer.byteLength(svg), paths, q, c, l, longDecimals };
}

function dropPaperFills(svg: string): string {
  return svg.replace(/<path\b[^>]*fill="rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)"[^>]*\/?>/gi, '');
}

const sample = noisyLogo(180);
const before = legacyTrace(sample);
const after = improvedTrace(sample);
const beforeStats = stats(before);
const afterStats = stats(after);
const beforeDisplay = dropPaperFills(before);

const outDir = fs.existsSync('/opt/cursor/artifacts') ? '/opt/cursor/artifacts' : path.join(process.cwd(), 'tmp-trace-compare');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'noisy_logo_trace_before.svg'), before);
fs.writeFileSync(path.join(outDir, 'noisy_logo_trace_after.svg'), after);
fs.writeFileSync(path.join(outDir, 'noisy_logo_trace_before_ink.svg'), beforeDisplay);

const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8"/>
<title>SVG trace quality — before / after</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; background:#111; color:#eee; margin:24px; }
  h1 { font-size:18px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
  figure { margin:0; background:#1c1c22; padding:16px; border-radius:12px; }
  svg, img { width:100%; height:auto; background:#fff; border-radius:8px; }
  table { border-collapse:collapse; margin-top:16px; }
  td, th { border:1px solid #333; padding:6px 10px; text-align:left; }
</style>
<h1>West Vinyl Studio — noisy logo trace</h1>
<p>Left: previous ImageTracer settings (pathomit 1, ltres 0.2, 1px stroke; white paper fills hidden so the speckle is visible). Right: preprocess + smooth Béziers + SVG cleanup.</p>
<div class="grid">
  <figure>
    <figcaption>Before (${beforeStats.bytes} bytes, ${beforeStats.paths} paths, ${beforeStats.l} L / ${beforeStats.q} Q)</figcaption>
    ${beforeDisplay}
  </figure>
  <figure>
    <figcaption>After (${afterStats.bytes} bytes, ${afterStats.paths} paths, ${afterStats.l} L / ${afterStats.c} C)</figcaption>
    ${after}
  </figure>
</div>
<table>
  <tr><th></th><th>Before</th><th>After</th></tr>
  <tr><td>Bytes</td><td>${beforeStats.bytes}</td><td>${afterStats.bytes}</td></tr>
  <tr><td>Paths</td><td>${beforeStats.paths}</td><td>${afterStats.paths}</td></tr>
  <tr><td>Line commands (L)</td><td>${beforeStats.l}</td><td>${afterStats.l}</td></tr>
  <tr><td>Quadratic (Q)</td><td>${beforeStats.q}</td><td>${afterStats.q}</td></tr>
  <tr><td>Cubic (C)</td><td>${beforeStats.c}</td><td>${afterStats.c}</td></tr>
  <tr><td>Coords with ≥3 decimals</td><td>${beforeStats.longDecimals}</td><td>${afterStats.longDecimals}</td></tr>
</table>
</html>`;
fs.writeFileSync(path.join(outDir, 'noisy_logo_trace_compare.html'), html);

console.log(JSON.stringify({ outDir, before: beforeStats, after: afterStats }, null, 2));
if (afterStats.longDecimals > 0) {
  console.error('after still has over-precise coordinates');
  process.exit(1);
}
if (afterStats.q > 0) {
  console.error('after still emits quadratic commands');
  process.exit(1);
}
if (afterStats.paths < 1) {
  console.error('after dropped the shape');
  process.exit(1);
}
if (afterStats.paths > 3) {
  console.error('after still has speckle paths');
  process.exit(1);
}
if (afterStats.bytes >= beforeStats.bytes) {
  console.error('after is not smaller than before');
  process.exit(1);
}
