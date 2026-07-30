import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';

export function useCanvasEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLElement>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const initCanvas = new fabric.Canvas(canvasRef.current, {
      preserveObjectStacking: true,
      selection: true,
      stopContextMenu: true,
      fireRightClick: true,
    });

    setCanvas(initCanvas);

    const handleResize = () => {
      if (containerRef.current && initCanvas) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        initCanvas.setDimensions({ width: w, height: h });
        initCanvas.requestRenderAll();
      }
    };

    // Set initial size
    handleResize();

    // BUG FIX: DEFERRED RESIZE OBSERVER
    // We use requestAnimationFrame to wait for the browser to finish repainting 
    // the flexbox layout before we measure the final physical pixels.
    let frameId: number;
    const resizeObserver = new ResizeObserver(() => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(handleResize);
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (frameId) cancelAnimationFrame(frameId);
      initCanvas.dispose();
    };
  }, []);

  return { canvasRef, containerRef, canvas };
}