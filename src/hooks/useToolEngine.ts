/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/immutability */
import * as fabric from 'fabric';
import { useEffect } from 'react';

interface ToolEngineProps {
  canvas: fabric.Canvas | null;
  tool: 'select' | 'draw' | 'track-line' | 'wand' | 'bucket' | 'eraser';
  brushColor: string;
  brushSize: number;
  brushType: 'round' | 'chisel';
  setQuickMenu: (menu: { top: number; left: number; show: boolean } | null) => void;
  eraserTargetRef?: React.MutableRefObject<fabric.Object | null>;
}

function applyBrush(canvas: fabric.Canvas, color: string, size: number, type: 'round' | 'chisel') {
  if (!(canvas as any).freeDrawingBrush) {
    (canvas as any).freeDrawingBrush = new (fabric as any).PencilBrush(canvas);
  }
  const brush = (canvas as any).freeDrawingBrush;
  if (!brush) return;
  brush.color = color;
  brush.width = size;
  brush.strokeLineCap = type === 'chisel' ? 'square' : 'round';
  brush.strokeLineJoin = type === 'chisel' ? 'miter' : 'round';
}

export function useToolEngine({ canvas, tool, brushColor, brushSize, brushType, setQuickMenu, eraserTargetRef }: ToolEngineProps) {
  useEffect(() => {
    if (!canvas) return;
    const canvasInstance = canvas;

    canvasInstance.isDrawingMode = false;
    canvasInstance.selection = false;
    canvasInstance.defaultCursor = 'default';
    canvasInstance.skipTargetFind = false;

    // Snapshot before toggling evented/selectable — Fabric may drop the
    // active object when the target becomes non-evented.
    const activeBefore = canvasInstance.getActiveObject();
    if (tool === 'eraser' && activeBefore && eraserTargetRef) {
      eraserTargetRef.current = activeBefore;
    }

    const objects = canvas.getObjects();
    objects.forEach((obj) => {
      if (tool === 'select') {
        obj.set({ selectable: true, evented: true });
      } else if (tool === 'eraser') {
        obj.set({ selectable: false, evented: false });
      } else {
        obj.set({ selectable: false, evented: tool === 'wand' || tool === 'bucket' });
      }
    });

    if (tool === 'select') {
      canvas.selection = true;
    } else if (tool === 'draw') {
      canvasInstance.isDrawingMode = true;
      canvasInstance.skipTargetFind = true;
      canvasInstance.discardActiveObject();
      setQuickMenu(null);
    } else if (tool === 'eraser') {
      canvasInstance.isDrawingMode = true;
      canvasInstance.skipTargetFind = true;
      setQuickMenu(null);
    } else if (tool === 'wand' || tool === 'bucket' || tool === 'track-line') {
      canvas.defaultCursor = 'crosshair';
      canvas.discardActiveObject();
      setQuickMenu(null);
    }

    canvas.requestRenderAll();
  }, [canvas, tool, setQuickMenu, eraserTargetRef]);

  useEffect(() => {
    if (!canvas) return;
    if (tool === 'draw') applyBrush(canvas, brushColor, brushSize, brushType);
    if (tool === 'eraser') applyBrush(canvas, 'rgba(255, 20, 147, 0.5)', brushSize, brushType);
  }, [canvas, tool, brushColor, brushSize, brushType]);
}
