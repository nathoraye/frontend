/**
 * vtracerWasm.ts
 *
 * Client-side VTracer integration for vinyl-safe raster → SVG conversion.
 *
 * Architecture note
 * -----------------
 * The `@visioncortex/vtracer` npm package ships a Node.js-only CJS wrapper that
 * loads the `.wasm` binary synchronously via `require('fs')`.  No browser-compatible
 * ESM / wasm-pack `--target web` build is published, so the WASM engine cannot be
 * instantiated directly inside a browser bundle.
 *
 * Instead this module sends the raw RGBA pixel buffer (no PNG encode/decode round-
 * trip) to the existing `/api/trace` endpoint which runs the same VTracer WASM on
 * the server.  The function is fully async so the UI render thread is never blocked,
 * and the parameter mapping mirrors the VTracer option surface exactly as specified.
 */

import { cleanupTracedSvg } from './svgTraceCleanup';
import type { ColorTraceParams } from './traceParams';
import { normalizeColorTraceParams } from './traceParams';

/** Options forwarded to the `/api/trace` endpoint (matches the server contract). */
interface TraceApiPayload {
  /** Base64-encoded raw RGBA8 buffer (width × height × 4 bytes). */
  rgba: string;
  width: number;
  height: number;
  maxColors: number;
  cornerThreshold: number;
  curveFit: number;
  filterSpeckle: number;
}

/**
 * Encode a raw RGBA `Uint8ClampedArray` to a base-64 string without going
 * through a PNG canvas encode.  This is cheaper than `imageDataToPngDataUrl`
 * and avoids lossy re-compression.
 */
function rgbaToBase64(data: Uint8ClampedArray): string {
  // Convert every byte to a char code and join into a binary string,
  // then hand that to btoa.  For large images (>1 MP) we chunk to avoid
  // call-stack overflows from Function.prototype.apply spreading.
  const CHUNK = 32_768;
  let binary = '';
  for (let i = 0; i < data.length; i += CHUNK) {
    binary += String.fromCharCode(...data.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Convert an `ImageData` raster to an SVG string using the VTracer WASM
 * engine (running server-side at `/api/trace`).
 *
 * Parameter mapping
 * -----------------
 * | UI control         | VTracer option      | Notes                            |
 * |--------------------|---------------------|----------------------------------|
 * | `curveFit`         | `curveFit`          | 0 = polygon (hard stencil edges) |
 * | `cornerThreshold`  | `cornerThreshold`   | degrees, lower = more corners    |
 * | `maxColors`        | `maxColors`         | colour cluster count             |
 * | `filterSpeckle`    | (hardcoded = 8 px²) | eliminates razor-chatter noise   |
 *
 * Vinyl-safe locked defaults
 * --------------------------
 * - `mode: 'polygon'` (curveFit === 0) or `'spline'` (curveFit > 0):
 *   polygon enforces solid closed silhouette paths; spline smooths them when
 *   the user wants organic edges.  Both avoid open stroked outlines.
 * - `hierarchical: 'cutout'` (enforced server-side): prevents stacked opaque
 *   background rectangles that waste vinyl material.
 * - `path_omit_size: 8` (filterSpeckle hardcoded to 8): automatically
 *   eliminates isolated speckle artefacts so the cutter blade doesn't chatter.
 *
 * @param pixelData  Raw ImageData from canvas (width × height RGBA pixels).
 * @param uiConfig   Slider values from the trace-settings UI.
 * @returns          Cleaned-up SVG string ready for `loadTracedObjects`.
 */
export async function traceImageToVector(
  pixelData: ImageData,
  uiConfig: ColorTraceParams,
): Promise<string> {
  // Normalise + clamp all slider values to their legal ranges.
  const p = normalizeColorTraceParams(uiConfig);

  const payload: TraceApiPayload = {
    rgba: rgbaToBase64(pixelData.data),
    width: pixelData.width,
    height: pixelData.height,

    // UI slider → VTracer option mappings:
    maxColors: p.maxColors,            // colour_count
    cornerThreshold: p.cornerThreshold, // corner_threshold (degrees)
    curveFit: p.curveFit,              // curve_fitting_error proxy (0–10)

    // Hardcoded speckle suppression — eliminates isolated noise patches so
    // the razor blade never chatters over stray micro-paths.
    filterSpeckle: 8,
  };

  const res = await fetch('/api/trace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({})) as { svg?: string; error?: string };

  if (!res.ok || !json.svg) {
    throw new Error(json.error ?? `VTracer WASM trace failed (HTTP ${res.status})`);
  }

  // Post-process: drop paper/full-frame paths, grey AA fringe, merge same-
  // colour contours. Returns a clean SVG string suitable for Fabric.js.
  return cleanupTracedSvg(json.svg, pixelData.width, pixelData.height);
}
