/**
 * SvgTrace-style stacked vinyl layers: quantize → binary masks → trace each
 * mask → SVG groups ordered silhouette (back) to highlights (front).
 */
import { createRequire } from 'node:module';
import { prepareColorTraceRgba } from './tracePalette.mjs';

const require = createRequire(import.meta.url);
const vtracer = require('@visioncortex/vtracer');

function lumaOf(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function chromaOf(r, g, b) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

export function isPaperPaint(r, g, b, a = 255) {
  if (a < 28) return true;
  return lumaOf(r, g, b) > 230 && chromaOf(r, g, b) < 20;
}

export function isPaperHex(hex) {
  const n = Number.parseInt(String(hex).replace('#', ''), 16);
  if (!Number.isFinite(n)) return /^(?:#fff(?:fff)?|white)$/i.test(String(hex));
  return isPaperPaint((n >> 16) & 255, (n >> 8) & 255, n & 255, 255);
}

function parseHex(hex) {
  const n = Number.parseInt(String(hex).replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, hex: `#${n.toString(16).padStart(6, '0')}` };
}

function toCssHex(hex) {
  const h = String(hex || '#000000').replace('#', '').slice(0, 6);
  return `#${h.toUpperCase().padStart(6, '0')}`;
}

function layerIdForFill(hex) {
  return `layer-${toCssHex(hex).slice(1).toLowerCase()}`;
}

function roundPathD(d) {
  return d.replace(/-?\d+\.\d+/g, (token) => {
    const r = Math.round(Number(token) * 10) / 10;
    return Object.is(r, -0) ? '0' : String(r);
  });
}

function normalizePathD(d) {
  let s = roundPathD(String(d || '')).trim();
  if (!s) return s;
  if (!/^[Mm]/.test(s)) {
    s = s.replace(/^[LlCcQqSsTt]/, (cmd) => (cmd === cmd.toUpperCase() ? 'M' : 'm'));
  }
  return s.replace(/([Zz])\s*([Ll])/g, (_full, close, cmd) => `${close} ${cmd === 'L' ? 'M' : 'm'}`);
}

function pathAreaHint(d) {
  const nums = String(d).match(/-?\d*\.?\d+/g);
  if (!nums || nums.length < 4) return 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i]);
    const y = Number(nums[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return 0;
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
}

function parseAttr(attrs, name) {
  const match = String(attrs).match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
  return match ? match[1] : null;
}

export function extractTracedPathDs(svg) {
  const out = [];
  const re = /<path\b([^>]*)\/?>/gi;
  let match;
  while ((match = re.exec(svg)) !== null) {
    const attrs = match[1];
    const d = parseAttr(attrs, 'd');
    if (!d) continue;
    const fill = parseAttr(attrs, 'fill');
    if (fill && isPaperHex(fill)) continue;
    const normalized = normalizePathD(d);
    if (!/[MLCQ]/i.test(normalized)) continue;
    if (pathAreaHint(normalized) < 1) continue;
    out.push(normalized);
  }
  return out;
}

export function buildBwMask(src, width, height, keepPixel) {
  const n = width * height;
  const out = new Uint8Array(n * 4);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = src[o + 3] ?? 255;
    const hit = keepPixel(src[o], src[o + 1], src[o + 2], a);
    if (hit) count += 1;
    const v = hit ? 0 : 255;
    out[o] = v;
    out[o + 1] = v;
    out[o + 2] = v;
    out[o + 3] = 255;
  }
  return { rgba: out, count };
}

export function countInkPixels(src, width, height) {
  const n = width * height;
  const byHex = new Map();
  let silhouette = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = src[o + 3] ?? 255;
    const r = src[o];
    const g = src[o + 1];
    const b = src[o + 2];
    if (isPaperPaint(r, g, b, a)) continue;
    silhouette += 1;
    const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    byHex.set(hex, (byHex.get(hex) || 0) + 1);
  }
  return { silhouette, byHex };
}

function splineOpts(params) {
  const t = (Number(params.curveFit) || 0) / 10;
  return {
    clustering: 'bw',
    hierarchical: 'stacked',
    mode: 'spline',
    binaryThreshold: 128,
    filterSpeckle: Number(params.filterSpeckle) || 0,
    cornerThreshold: Number(params.cornerThreshold) || 90,
    lengthThreshold: 3.2 + t * 8,
    spliceThreshold: 45,
    simplify: 1.8 + t * 3.2,
    pathPrecision: 2,
    optimize: 1,
  };
}

export function traceBwMask(rgba, width, height, params) {
  return vtracer.convertPixels(rgba, width, height, splineOpts(params));
}

export function assembleLayeredSvg(layers, width, height) {
  const w = Math.round(Number(width) * 10) / 10;
  const h = Math.round(Number(height) * 10) / 10;
  const body = layers.map((layer) => {
    const fill = toCssHex(layer.fill);
    const paths = layer.ds
      .map((d) => `<path fill="${fill}" fill-rule="evenodd" d="${d}"/>`)
      .join('');
    return `<g id="${layer.id}" fill="${fill}">${paths}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

/**
 * Quantize, mask, and trace each vinyl sheet:
 * 1. Black silhouette of the whole artwork footprint (HTV underbase)
 * 2. One layer per ink colour, largest (body) first, highlights last
 */
export function traceStackedRgba(rgba, width, height, params = {}) {
  const prepared = prepareColorTraceRgba(rgba, width, height, params);
  const w = prepared.width;
  const h = prepared.height;
  const { silhouette, byHex } = countInkPixels(prepared.rgba, w, h);
  if (silhouette < 8) {
    throw new Error('No opaque artwork to trace into colour layers.');
  }

  const layers = [];
  const silMask = buildBwMask(
    prepared.rgba,
    w,
    h,
    (r, g, b, a) => !isPaperPaint(r, g, b, a),
  );
  const silDs = extractTracedPathDs(traceBwMask(silMask.rgba, w, h, params));
  if (silDs.length) {
    layers.push({ id: 'layer-silhouette', fill: '#000000', ds: silDs });
  }

  const inks = (prepared.palette || [])
    .filter((hex) => !isPaperHex(hex))
    .map((hex) => {
      const parsed = parseHex(hex);
      const key = `#${[parsed.r, parsed.g, parsed.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
      const count = byHex.get(key) || 0;
      return { ...parsed, key, count };
    })
    .filter((c) => c.count >= 8)
    .sort((a, b) => b.count - a.count || lumaOf(a.r, a.g, a.b) - lumaOf(b.r, b.g, b.b));

  for (const ink of inks) {
    const isNearBlack = lumaOf(ink.r, ink.g, ink.b) < 28;
    if (isNearBlack && ink.count >= silhouette * 0.98) continue;
    const mask = buildBwMask(
      prepared.rgba,
      w,
      h,
      (r, g, b, a) => a >= 28 && r === ink.r && g === ink.g && b === ink.b,
    );
    if (mask.count < 8) continue;
    const ds = extractTracedPathDs(traceBwMask(mask.rgba, w, h, params));
    if (!ds.length) continue;
    layers.push({
      id: layerIdForFill(ink.key),
      fill: toCssHex(ink.key),
      ds,
    });
  }

  if (!layers.length) {
    throw new Error('Layered trace produced no cut paths.');
  }
  return assembleLayeredSvg(layers, w, h);
}
