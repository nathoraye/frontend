/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useCallback } from 'react';
import { TRACE_UPSCALE_MULT } from '../utils/constants';
// Must use Vite's ?worker suffix — omitting it will cause a build failure.
import TracerWorker from '../workers/tracerWorker.ts?worker';

export function useVectorEngine() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new TracerWorker();
    return () => {
      workerRef.current?.terminate(); 
    };
  }, []);

  const traceImage = useCallback(async (imageData: ImageData, smoothness: number = 5): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) return reject("Worker thread offline.");

      const w = imageData.width;
      const h = imageData.height;

      // 1. RAW CANVAS EXTRACTION
      const rawCanvas = document.createElement('canvas');
      rawCanvas.width = w; 
      rawCanvas.height = h;
      const rCtx = rawCanvas.getContext('2d');
      if (!rCtx) return reject("Canvas context failed");
      rCtx.putImageData(imageData, 0, 0);

      // 2. THE 1x PRE-MELT
      // Blurring the jagged pixel staircases at their original size fuses the hard
      // corners together into a continuous mathematical slope.
      const preCanvas = document.createElement('canvas');
      preCanvas.width = w; 
      preCanvas.height = h;
      const pCtx = preCanvas.getContext('2d');
      if (!pCtx) return reject("Canvas context failed");
      pCtx.filter = `blur(1.5px)`;
      pCtx.drawImage(rawCanvas, 0, 0);

      // 3. THE GOD-TIER UPSCALE
      // We take the continuous slope and stretch it massively. Hardware anti-aliasing
      // interpolates the slope into a perfectly straight, buttery-smooth gradient.
      const upCanvas = document.createElement('canvas');
      upCanvas.width = w * TRACE_UPSCALE_MULT; 
      upCanvas.height = h * TRACE_UPSCALE_MULT;
      const uCtx = upCanvas.getContext('2d', { willReadFrequently: true });
      if (!uCtx) return reject("Canvas context failed");
      
      uCtx.imageSmoothingEnabled = true;
      uCtx.imageSmoothingQuality = 'high';
      uCtx.filter = `blur(${Math.max(1, smoothness)}px)`;
      uCtx.drawImage(preCanvas, 0, 0, upCanvas.width, upCanvas.height);
      
      // 4. THE RAZOR SNAP
      // Tightened brightness threshold (200 vs old 230) captures mid-tones that were
      // previously leaking through as ghost areas, producing a crisper silhouette.
      const upData = uCtx.getImageData(0, 0, upCanvas.width, upCanvas.height);
      const d = upData.data;
      
      let hasVisiblePixels = false;

      for (let i = 0; i < d.length; i += 4) {
          const r = d[i]; const g = d[i + 1]; const b = d[i + 2]; const a = d[i + 3];
          
          const brightness = (r * 0.299 + g * 0.587 + b * 0.114);

          if (a < 128 || brightness > 200) {
              d[i] = 255; d[i+1] = 255; d[i+2] = 255; d[i+3] = 255; // WHITE BG
          } else {
              d[i] = 0; d[i+1] = 0; d[i+2] = 0; d[i+3] = 255; // BLACK INK
              hasVisiblePixels = true;
          }
      }

      if (!hasVisiblePixels) return reject("Image is completely transparent or too faint.");
      
      uCtx.putImageData(upData, 0, 0);

      const handleMessage = (e: MessageEvent) => {
          workerRef.current?.removeEventListener('message', handleMessage);
          if (e.data.error) reject(e.data.error);
          else resolve(e.data.svgString);
      };

      workerRef.current.addEventListener('message', handleMessage);
      
      try {
          workerRef.current.postMessage({ imageData: upData }, [upData.data.buffer]);
      } catch {
          workerRef.current.postMessage({ imageData: upData });
      }
    });
  }, []);

  return { traceImage };
}