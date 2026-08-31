import { rasterToSvg } from '../utils/rasterToSvg';

self.onmessage = function (e: MessageEvent) {
  try {
    const svgString = rasterToSvg(e.data.imageData);
    self.postMessage({ svgString });
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : 'Background trace failed' });
  }
};
