import { useEffect, useRef, useCallback } from 'react';
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
    void smoothness;
    return new Promise((resolve, reject) => {
      if (!workerRef.current) return reject('Worker thread offline.');

      const handleMessage = (e: MessageEvent) => {
        workerRef.current?.removeEventListener('message', handleMessage);
        if (e.data.error) reject(e.data.error);
        else resolve(e.data.svgString);
      };

      workerRef.current.addEventListener('message', handleMessage);

      const copy = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
      try {
        workerRef.current.postMessage({ imageData: copy }, [copy.data.buffer]);
      } catch {
        workerRef.current.postMessage({ imageData: copy });
      }
    });
  }, []);

  return { traceImage };
}
