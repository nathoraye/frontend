import { useCallback } from 'react';
import { imageDataToPngDataUrl } from '../utils/imageDataPng';
import { cleanupTracedSvg } from '../utils/svgTraceCleanup';
import { DEFAULT_COLOR_TRACE, normalizeColorTraceParams, type ColorTraceParams } from '../utils/traceParams';
import { traceImageToVector } from '../utils/vtracerWasm';

export type { ColorTraceParams };

export function useVectorEngine() {
  /**
   * Network trace path: encodes the ImageData as a PNG data URL and sends it
   * to `/api/trace` (VTracer running server-side).  Kept as the default path
   * for compatibility with deployments where the server is available.
   */
  const traceImage = useCallback(async (imageData: ImageData, params?: ColorTraceParams): Promise<string> => {
    const options = normalizeColorTraceParams(params);
    const body = {
      image: imageDataToPngDataUrl(imageData),
      width: imageData.width,
      height: imageData.height,
      ...options,
    };
    const res = await fetch('/api/trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({})) as { svg?: string; error?: string };
    if (!res.ok || !json.svg) {
      throw new Error(json.error || `Trace request failed (${res.status})`);
    }
    return cleanupTracedSvg(json.svg, imageData.width, imageData.height);
  }, []);

  /**
   * WASM trace path: sends raw RGBA pixels directly to `/api/trace`, bypassing
   * the PNG encode/decode step.  The VTracer WASM engine runs on the server
   * (the npm package ships a Node.js-only build; no browser WASM bundle exists).
   * The function is fully async so the React render thread is never blocked.
   *
   * UI control → VTracer parameter mapping is handled inside `traceImageToVector`.
   * Mode is locked to `'polygon'`/`'spline'` (vinyl silhouettes) and layering is
   * locked to `'cutout'` (no stacked fills) — both enforced server-side.
   */
  const traceImageWasm = useCallback(
    (imageData: ImageData, params?: ColorTraceParams): Promise<string> =>
      traceImageToVector(imageData, params ?? {}),
    [],
  );

  return { traceImage, traceImageWasm, defaultParams: DEFAULT_COLOR_TRACE };
}
