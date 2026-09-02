import ImageTracer from 'imagetracerjs';
import { prepareTraceRaster } from './tracePrep';
import { vinylTraceOptions } from './traceOptions';
import { cleanupTracedSvg } from './svgTraceCleanup';

export function rasterToSvg(imageData: ImageData, smoothness = 5): string {
  const prepared = prepareTraceRaster(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  );

  if (prepared.ink === 0) {
    throw new Error('No visible artwork pixels found for trace.');
  }

  const pixels = new Uint8ClampedArray(prepared.data.length);
  pixels.set(prepared.data);
  const normalizedImageData = new ImageData(pixels, prepared.width, prepared.height);

  const raw = ImageTracer.imagedataToSVG(normalizedImageData, vinylTraceOptions(smoothness));
  return cleanupTracedSvg(raw, prepared.width, prepared.height);
}
