/**
 * Colour-aware raster → SVG via Vision Cortex VTracer (WASM, no native deps).
 * Used by `server.mjs` and `api/trace.js`.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const vtracer = require('@visioncortex/vtracer');

export const DEFAULT_COLOR_TRACE = {
  maxColors: 8,
  cornerThreshold: 90,
  curveFit: 2,
  filterSpeckle: 2,
};

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)));
}

export function normalizeColorTraceParams(params = {}) {
  return {
    maxColors: clampInt(params.maxColors, 2, 32, DEFAULT_COLOR_TRACE.maxColors),
    cornerThreshold: clampInt(params.cornerThreshold, 20, 180, DEFAULT_COLOR_TRACE.cornerThreshold),
    curveFit: clampInt(params.curveFit, 0, 10, DEFAULT_COLOR_TRACE.curveFit),
    filterSpeckle: clampInt(params.filterSpeckle, 0, 16, DEFAULT_COLOR_TRACE.filterSpeckle),
  };
}

/**
 * Graffiti/stencil defaults: colour clustering, cutout mosaic (holes are
 * extra subpaths, not a stacked white disc). Curve Fit 0 = polygon; 1–10 = spline.
 */
export function buildVtracerOptions(params = {}) {
  const p = normalizeColorTraceParams(params);
  const t = p.curveFit / 10;
  return {
    clustering: 'color-cluster',
    hierarchical: 'cutout',
    // Polygon ignores cornerThreshold / simplify / lengthThreshold. Any
    // Curve Fit above 0 must use spline so those sliders actually change
    // the trace. 0 stays polygon for hard stencil edges.
    mode: p.curveFit <= 0 ? 'polygon' : 'spline',
    maxColors: p.maxColors,
    cornerThreshold: p.cornerThreshold,
    filterSpeckle: p.filterSpeckle,
    colorPrecision: 6,
    layerDifference: 16,
    lengthThreshold: Math.max(3.5, 3.2 + t * 5),
    spliceThreshold: 45,
    simplify: 0.35 + t * 2.2,
    pathPrecision: 1,
    optimize: 1,
  };
}

export function traceRgba(rgba, width, height, params = {}) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const pixels = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba);
  if (pixels.length < w * h * 4) {
    throw new Error('RGBA buffer is shorter than width × height × 4.');
  }
  return vtracer.convertPixels(pixels, w, h, buildVtracerOptions(params));
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
