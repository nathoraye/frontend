import { useCallback } from 'react';
import { imageDataToPngDataUrl } from '../utils/imageDataPng';
import { cleanupTracedSvg } from '../utils/svgTraceCleanup';
import { DEFAULT_COLOR_TRACE, normalizeColorTraceParams, type ColorTraceParams } from '../utils/traceParams';

export type { ColorTraceParams };

export function useVectorEngine() {
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

  return { traceImage, defaultParams: DEFAULT_COLOR_TRACE };
}
