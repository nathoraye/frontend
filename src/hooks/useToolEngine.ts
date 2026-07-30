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
}

export function useToolEngine({ canvas, tool, brushColor, brushSize, brushType, setQuickMenu }: ToolEngineProps) {
  useEffect(() => {
    if (!canvas) return;
    const canvasInstance = canvas;

    // 1. Reset standard canvas states
    canvasInstance.isDrawingMode = false;
    canvasInstance.selection = false;
    canvasInstance.defaultCursor = 'default';

    // 2. Lock down object interactivity
    const objects = canvas.getObjects();
    objects.forEach((obj) => {
      if (tool === 'select') {
        // Only allow dragging and scaling in Select mode
        obj.set({ selectable: true, evented: true });
      } else {
        // Freeze all objects on the mat, but allow Wand/Bucket to detect clicks
        obj.set({ selectable: false, evented: tool === 'wand' || tool === 'bucket' });
      }
    });

    // 3. Execute specific tool physics
    if (tool === 'select') {
      canvas.selection = true;
    } 
    else if (tool === 'draw') {
      canvasInstance.isDrawingMode = true;
      canvasInstance.discardActiveObject(); // Deselect everything so drawing is unobstructed
      setQuickMenu(null);
      
      if ((canvasInstance as any).freeDrawingBrush) {
        (canvasInstance as any).freeDrawingBrush.color = brushColor;
        (canvasInstance as any).freeDrawingBrush.width = brushSize;
        (canvasInstance as any).freeDrawingBrush.strokeLineCap = brushType === 'chisel' ? 'square' : 'round';
        (canvasInstance as any).freeDrawingBrush.strokeLineJoin = brushType === 'chisel' ? 'miter' : 'round';
      }
    }
    else if (tool === 'eraser') {
      canvasInstance.isDrawingMode = true;
      setQuickMenu(null);
      
      // CRITICAL: We DO NOT discard the active object here. 
      // The Eraser's 'Layer Mode' needs to remember what object is selected so it knows what to punch a hole through.
      
      if ((canvasInstance as any).freeDrawingBrush) {
        // Apply the Hot Pink overlay so the user can see their extraction mask
        (canvasInstance as any).freeDrawingBrush.color = 'rgba(255, 20, 147, 0.5)';
        (canvasInstance as any).freeDrawingBrush.width = brushSize;
        (canvasInstance as any).freeDrawingBrush.strokeLineCap = brushType === 'chisel' ? 'square' : 'round';
        (canvasInstance as any).freeDrawingBrush.strokeLineJoin = brushType === 'chisel' ? 'miter' : 'round';
      }
    }
    else if (tool === 'wand' || tool === 'bucket' || tool === 'track-line') {
      canvas.defaultCursor = 'crosshair';
      canvas.discardActiveObject();
      setQuickMenu(null);
    }

    // 4. Commit changes to the engine
    canvas.requestRenderAll();

  }, [canvas, tool, brushColor, brushSize, brushType, setQuickMenu]);
}
