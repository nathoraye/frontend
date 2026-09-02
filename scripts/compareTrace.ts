/**
 * Before/after harness: bilevel ImageTracer vs colour VTracer.
 * Usage: node --experimental-strip-types scripts/compareTrace.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import ImageTracer from 'imagetracerjs';
import {
  downsampleNearest,
  keyOutBackground,
  stampWhiteBorder,
  TRACE_MAX_EDGE,
} from '../src/utils/tracePrep.ts';
import { LEGACY_TRACE_OPTIONS } from '../src/utils/traceOptions.ts';
import { cleanupTracedSvg } from '../src/utils/svgTraceCleanup.ts';
import { DEFAULT_COLOR_TRACE } from '../src/utils/traceParams.ts';
import { traceRgba } from '../traceColor.mjs';

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

function graffitiSample(size = 180): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  const cx = size / 2;
  const cy = size * 0.42;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const r = Math.hypot(x - cx, y - cy);
      const ring = r < size * 0.28 && r > size * 0.14;
      const stem = x > cx - 7 && x < cx + 7 && y > cy && y < size * 0.78;
      const drip = x > cx - 3 && x < cx + 3 && y > size * 0.76 && y < size * 0.88;
      const redTag = x > size * 0.08 && x < size * 0.28 && y > size * 0.08 && y < size * 0.22;
      const blueTag = x > size * 0.72 && x < size * 0.92 && y > size * 0.08 && y < size * 0.22;
      let col: [number, number, number] = [245, 245, 240];
      if (ring || stem || drip) col = [22, 22, 22];
      else if (redTag) col = [220, 30, 40];
      else if (blueTag) col = [30, 90, 210];
      data[i] = col[0];
      data[i + 1] = col[1];
      data[i + 2] = col[2];
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, size, size);
}

function bilevelTrace(imageData: ImageData): string {
  const copied = new Uint8ClampedArray(imageData.data);
  const down = downsampleNearest(copied, imageData.width, imageData.height, TRACE_MAX_EDGE);
  const { ink, paper } = keyOutBackground(down.data, down.width, down.height);
  if (ink === 0) throw new Error('legacy: no ink');
  if (paper === 0) stampWhiteBorder(down.data, down.width, down.height);
  const pixels = new Uint8ClampedArray(down.data.length);
  pixels.set(down.data);
  return ImageTracer.imagedataToSVG(new ImageData(pixels, down.width, down.height), LEGACY_TRACE_OPTIONS);
}

function colorTrace(imageData: ImageData): string {
  const raw = traceRgba(imageData.data, imageData.width, imageData.height, DEFAULT_COLOR_TRACE);
  return cleanupTracedSvg(raw, imageData.width, imageData.height);
}

function stats(svg: string) {
  const paths = svg.match(/<path\b/g)?.length ?? 0;
  const fills = [...new Set([...(svg.matchAll(/fill="([^"]+)"/g) ?? [])].map((m) => m[1]))];
  return { bytes: Buffer.byteLength(svg), paths, fills };
}

const sample = graffitiSample(180);
const before = bilevelTrace(sample);
const after = colorTrace(sample);
const beforeStats = stats(before);
const afterStats = stats(after);

const outDir = fs.existsSync('/opt/cursor/artifacts') ? '/opt/cursor/artifacts' : path.join(process.cwd(), 'tmp-trace-compare');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'color_trace_before.svg'), before);
fs.writeFileSync(path.join(outDir, 'color_trace_after.svg'), after);

const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8"/>
<title>Colour SVG trace — before / after</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; background:#111; color:#eee; margin:24px; }
  h1 { font-size:18px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
  figure { margin:0; background:#1c1c22; padding:16px; border-radius:12px; }
  img { width:100%; height:auto; border-radius:8px; display:block; background:
    linear-gradient(45deg,#bbb 25%,transparent 25%),linear-gradient(-45deg,#bbb 25%,transparent 25%),
    linear-gradient(45deg,transparent 75%,#bbb 75%),linear-gradient(-45deg,transparent 75%,#bbb 75%);
    background-size:16px 16px; background-position:0 0,0 8px,8px -8px,-8px 0; background-color:#eee; }
  table { border-collapse:collapse; margin-top:16px; }
  td, th { border:1px solid #333; padding:6px 10px; text-align:left; }
</style>
<h1>West Vinyl Studio — colour-aware trace</h1>
<p>Left: previous 2-colour ImageTracer flatten (everything becomes black ink). Right: VTracer colour-cluster + cutout, one path per colour, holes kept.</p>
<div class="grid">
  <figure>
    <figcaption>Before (${beforeStats.bytes} bytes, ${beforeStats.paths} paths, fills ${beforeStats.fills.join(', ') || '—'})</figcaption>
    <img src="color_trace_before.svg" alt="Bilevel flatten"/>
  </figure>
  <figure>
    <figcaption>After (${afterStats.bytes} bytes, ${afterStats.paths} paths, fills ${afterStats.fills.join(', ')})</figcaption>
    <img src="color_trace_after.svg" alt="Colour VTracer"/>
  </figure>
</div>
<table>
  <tr><th></th><th>Before (bilevel)</th><th>After (VTracer colour)</th></tr>
  <tr><td>Bytes</td><td>${beforeStats.bytes}</td><td>${afterStats.bytes}</td></tr>
  <tr><td>Paths</td><td>${beforeStats.paths}</td><td>${afterStats.paths}</td></tr>
  <tr><td>Fills</td><td>${beforeStats.fills.join(', ') || '—'}</td><td>${afterStats.fills.join(', ')}</td></tr>
</table>
</html>`;
fs.writeFileSync(path.join(outDir, 'color_trace_compare.html'), html);

console.log(JSON.stringify({ outDir, before: beforeStats, after: afterStats, defaults: DEFAULT_COLOR_TRACE }, null, 2));
if (afterStats.fills.length < 2) {
  console.error('after collapsed to a single colour');
  process.exit(1);
}
if (afterStats.paths < 1) {
  console.error('after dropped the shape');
  process.exit(1);
}
