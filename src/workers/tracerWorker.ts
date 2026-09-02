import { rasterToSvg } from '../utils/rasterToSvg';

self.onmessage = function (e: MessageEvent) {
  try {
    const smoothness = typeof e.data.smoothness === 'number' ? e.data.smoothness : 5;
    const svgString = rasterToSvg(e.data.imageData, smoothness);
    self.postMessage({ svgString });
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : 'Background trace failed' });
  }
};
