import ImageTracer from 'imagetracerjs';
import { vinylTraceOptions } from './traceOptions';
import { cleanupTracedSvg } from './svgTraceCleanup';

/** @deprecated Browser traces go through `/api/trace` (VTracer). Kept for the compare harness. */
export function rasterToSvg(imageData: ImageData, smoothness = 5): string {
  const raw = ImageTracer.imagedataToSVG(imageData, vinylTraceOptions(smoothness));
  return cleanupTracedSvg(raw, imageData.width, imageData.height);
}
