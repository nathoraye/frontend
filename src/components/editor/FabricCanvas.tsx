import { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useCustomizerStore } from '../../store/useCustomizerStore';

const CANVAS_SIZE = 512;

export default function FabricCanvas() {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const setFabricCanvas = useCustomizerStore((s) => s.setFabricCanvas);
  const garmentColor = useCustomizerStore((s) => s.garmentColor);

  useEffect(() => {
    if (!canvasElRef.current) return;

    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      backgroundColor: useCustomizerStore.getState().garmentColor,
    });

    setFabricCanvas(canvas);

    return () => {
      canvas.dispose();
      setFabricCanvas(null);
    };
  }, [setFabricCanvas]);

  useEffect(() => {
    const canvas = useCustomizerStore.getState().fabricCanvas;
    if (!canvas) return;
    canvas.backgroundColor = garmentColor;
    canvas.requestRenderAll();
  }, [garmentColor]);

  return (
    <canvas
      ref={canvasElRef}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      className="rounded-lg shadow-lg"
    />
  );
}
