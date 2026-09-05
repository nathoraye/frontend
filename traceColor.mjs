/**
 * Colour-aware raster → SVG via Vision Cortex VTracer (WASM, no native deps).
 * Used by `server.mjs` and `api/trace.js`.
 */
import { createRequire } from 'node:module';
import { extractInkPalette, normalizePalette, prepareColorTraceRgba } from './tracePalette.mjs';

const require = createRequire(import.meta.url);
const vtracer = require('@visioncortex/vtracer');

export const DEFAULT_COLOR_TRACE = {
  maxColors: 4,
  cornerThreshold: 90,
  curveFit: 4,
  filterSpeckle: 0,
};

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)));
}

export function normalizeColorTraceParams(params = {}) {
  const palette = normalizePalette(params.palette);
  return {
    maxColors: clampInt(params.maxColors, 2, 32, DEFAULT_COLOR_TRACE.maxColors),
    cornerThreshold: clampInt(params.cornerThreshold, 20, 180, DEFAULT_COLOR_TRACE.cornerThreshold),
    curveFit: clampInt(params.curveFit, 0, 10, DEFAULT_COLOR_TRACE.curveFit),
    filterSpeckle: clampInt(params.filterSpeckle, 0, 16, DEFAULT_COLOR_TRACE.filterSpeckle),
    palette,
  };
}

/**
 * Colour-preview defaults: always spline. Polygon mode at Curve Fit 0
 * stair-steps lettering into blobs and ignores the sharpness sliders.
 * The simplify floor stays high enough that outlines follow the letter,
 * not the source pixel grid.
 */
export function buildVtracerOptions(params = {}) {
  const p = normalizeColorTraceParams(params);
  const t = p.curveFit / 10;
  const palette = p.palette;
  const opts = {
    clustering: 'color-cluster',
    hierarchical: 'cutout',
    mode: 'spline',
    maxColors: palette?.length ?? p.maxColors,
    cornerThreshold: p.cornerThreshold,
    filterSpeckle: p.filterSpeckle,
    colorPrecision: 8,
    layerDifference: 16,
    lengthThreshold: 3.2 + t * 8,
    spliceThreshold: 45,
    simplify: 1.8 + t * 3.2,
    pathPrecision: 2,
    optimize: 1,
  };
  if (palette) opts.palette = palette;
  return opts;
}

export function resolveTraceParams(rgba, width, height, params = {}) {
  const p = normalizeColorTraceParams(params);
  if (p.palette) return p;
  return {
    ...p,
    palette: extractInkPalette(rgba, width, height, p.maxColors),
  };
}

export function traceRgba(rgba, width, height, params = {}) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const pixels = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba);
  if (pixels.length < w * h * 4) {
    throw new Error('RGBA buffer is shorter than width × height × 4.');
  }
  const prepared = prepareColorTraceRgba(pixels, w, h, resolveTraceParams(pixels, w, h, params));
  return vtracer.convertPixels(
    prepared.rgba,
    prepared.width,
    prepared.height,
    buildVtracerOptions({
      ...normalizeColorTraceParams(params),
      palette: prepared.palette,
      maxColors: prepared.palette.length,
    }),
  );
}

export function traceImageBuffer(buffer, params = {}) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return vtracer.convertBuffer(bytes, buildVtracerOptions(params));
}

export function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new Error('Expected a data URL image.');
  }
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Malformed data URL.');
  return Buffer.from(dataUrl.slice(comma + 1), 'base64');
}

export function readSvgSize(svg, fallbackW = 1, fallbackH = 1) {
  const w = Number(/width="([\d.]+)"/.exec(svg)?.[1]);
  const h = Number(/height="([\d.]+)"/.exec(svg)?.[1]);
  return {
    width: Number.isFinite(w) && w > 0 ? w : fallbackW,
    height: Number.isFinite(h) && h > 0 ? h : fallbackH,
  };
}
