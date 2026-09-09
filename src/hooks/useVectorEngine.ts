import { useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { DEFAULT_COLOR_TRACE, type ColorTraceParams } from '../utils/traceParams';
import { requestServerTrace } from '../utils/traceRequest';
import {
  traceImageToVector,
  type TracingUiConfig,
} from '../utils/vtracerWasm';
import { placeTracedSvg } from '../utils/placeTracedSvg';

export type { ColorTraceParams, TracingUiConfig };

export function useVectorEngine(canvas: fabric.Canvas | null = null) {
  const [isTracing, setIsTracing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Network trace path: encodes the ImageData as a PNG (not raw RGBA JSON)
   * and sends it to `/api/trace` (VTracer running server-side).
   */
  const traceImage = useCallback(
    (imageData: ImageData, params?: ColorTraceParams): Promise<string> =>
      requestServerTrace(imageData, params),
    [],
  );

  /**
   * Colour WASM path: PNG → `/api/trace` (no binarise).
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
