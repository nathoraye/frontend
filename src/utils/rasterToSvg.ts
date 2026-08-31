import ImageTracer from 'imagetracerjs';
import { downsampleNearest, keyOutBackground, stampWhiteBorder, TRACE_MAX_EDGE } from './tracePrep';

export function rasterToSvg(imageData: ImageData): string {
  const copied = new Uint8ClampedArray(imageData.data);
  const down = downsampleNearest(copied, imageData.width, imageData.height, TRACE_MAX_EDGE);
  const { ink, paper } = keyOutBackground(down.data, down.width, down.height);

  if (ink === 0) {
    throw new Error('No visible artwork pixels found for trace.');
  }
  if (paper === 0) {
    stampWhiteBorder(down.data, down.width, down.height);
  }

  const pixels = new Uint8ClampedArray(down.data.length);
  pixels.set(down.data);
  const normalizedImageData = new ImageData(pixels, down.width, down.height);

  return ImageTracer.imagedataToSVG(normalizedImageData, {
    pathomit: 1,
    ltres: 0.2,
    qtres: 0.4,
    scale: 1,
    rightangleenhance: true,
    numberofcolors: 2,
    colorquantcycles: 2,
    mincolorgap: 128,
    pal: [
      { r: 255, g: 255, b: 255, a: 255 },
      { r: 0, g: 0, b: 0, a: 255 },
    ],
    colorsampling: 0,
  });
}
