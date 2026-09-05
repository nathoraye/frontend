import { useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { imageDataToPngDataUrl } from '../utils/imageDataPng';
import { cleanupTracedSvg } from '../utils/svgTraceCleanup';
import { DEFAULT_COLOR_TRACE, normalizeColorTraceParams, type ColorTraceParams } from '../utils/traceParams';
import { extractInkPalette } from '../utils/tracePalette';
import {
  traceImageToVector,
  type TracingUiConfig,
} from '../utils/vtracerWasm';
import { placeTracedSvg } from '../utils/placeTracedSvg';

export type { ColorTraceParams, TracingUiConfig };

function upscaleNearest(imageData: ImageData, factor: number): ImageData {
  if (factor <= 1) return imageData;
  const src = document.createElement('canvas');
  src.width = imageData.width;
  src.height = imageData.height;
  const sctx = src.getContext('2d');
  if (!sctx) return imageData;
  sctx.putImageData(imageData, 0, 0);
  const w = Math.max(1, Math.round(imageData.width * factor));
  const h = Math.max(1, Math.round(imageData.height * factor));
  const dst = document.createElement('canvas');
  dst.width = w;
  dst.height = h;
  const dctx = dst.getContext('2d', { willReadFrequently: true });
  if (!dctx) return imageData;
  dctx.imageSmoothingEnabled = false;
  dctx.drawImage(src, 0, 0, w, h);
  return dctx.getImageData(0, 0, w, h);
}

export function useVectorEngine(canvas: fabric.Canvas | null = null) {
  const [isTracing, setIsTracing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Network trace path: encodes the ImageData as a PNG data URL and sends it
   * to `/api/trace` (VTracer running server-side).  Kept as the default path
   * for the colour preview modal.
   */
  const traceImage = useCallback(async (imageData: ImageData, params?: ColorTraceParams): Promise<string> => {
    const options = normalizeColorTraceParams(params);
    const scaled = upscaleNearest(imageData, 2);
    const palette = options.palette ?? extractInkPalette(
      scaled.data,
      scaled.width,
      scaled.height,
      options.maxColors,
    );
    const body = {
      image: imageDataToPngDataUrl(scaled),
      width: scaled.width,
      height: scaled.height,
      ...options,
      palette,
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
    return cleanupTracedSvg(json.svg, scaled.width, scaled.height);
  }, []);

  /**
   * Colour WASM path: raw RGBA → `/api/trace` (no PNG round-trip, no binarise).
   */
  const traceImageWasm = useCallback(
    (imageData: ImageData, params?: ColorTraceParams): Promise<string> =>
      traceImageToVector(imageData, params ?? {}),
    [],
  );

  /**
   * Stencil pipeline: 2× upscale + BT.601 binarise + VTracer, then inject the
   * resulting SVG onto the live Fabric canvas as an editable group.
   */
  const runVectorTrace = useCallback(async (
    sourceCanvas: HTMLCanvasElement,
    uiConfig: TracingUiConfig,
  ) => {
    if (!canvas) return;

    setIsTracing(true);
    setError(null);
    try {
      const svgResult = await traceImageToVector(sourceCanvas, uiConfig);
      await placeTracedSvg(svgResult, canvas);
    } catch (err: unknown) {
      console.error('Vector processing exception encountered:', err);
      const message = err instanceof Error ? err.message : 'Failed to complete trace sequence.';
      setError(message);
    } finally {
      setIsTracing(false);
    }
  }, [canvas]);

  return {
    traceImage,
    traceImageWasm,
    runVectorTrace,
    isTracing,
    error,
    defaultParams: DEFAULT_COLOR_TRACE,
  };
}
