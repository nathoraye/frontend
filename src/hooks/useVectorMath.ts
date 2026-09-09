/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fabric from 'fabric';
import { useCallback } from 'react';
import { paintOffsetAppearance } from '../utils/groupOps';
import { tracedSvgToObject } from '../utils/placeTracedSvg';
import { rasterToImageData, yieldToPaint } from '../utils/tracePrep';
import { tightPackWeldObject } from '../utils/weldImport';

interface VectorMathProps {
  canvas: fabric.Canvas | null;
  isProcessingRef: React.MutableRefObject<boolean>;
  setIsTracing: (val: boolean) => void;
  traceImage: (imageData: ImageData) => Promise<string>;
  saveHistorySnapshot: (canvas: fabric.Canvas, immediate?: boolean) => void;
}

export function useVectorMath({
  canvas,
  isProcessingRef,
  setIsTracing,
  traceImage,
  saveHistorySnapshot,
}: VectorMathProps) {
  const handleVectorTrace = useCallback(async (activeObj: fabric.Object | null) => {
    if (!canvas || !activeObj || isProcessingRef.current) return;

    if (activeObj.type !== 'image') {
      alert('Select a raster image to trace. Vector shapes are already cut-ready.');
      return;
    }

    isProcessingRef.current = true;
    setIsTracing(true);
    await yieldToPaint();

    try {
      const img = activeObj as fabric.Image;
      const imgData = rasterToImageData(img.getElement());
      const svgString = await traceImage(imgData);
      const traced = await tracedSvgToObject(svgString, {
        source: img,
      });
      if (!traced) throw new Error('No solid shapes found to trace after background removal.');

      canvas.remove(img);
      canvas.add(traced);
      canvas.setActiveObject(traced);
      canvas.requestRenderAll();
      saveHistorySnapshot(canvas, true);
    } catch (error) {
      console.error('Vector Trace Failed:', error);
      alert('Failed to trace image. The design might be too faint or completely transparent.');
    } finally {
      isProcessingRef.current = false;
      setIsTracing(false);
    }
  }, [canvas, isProcessingRef, setIsTracing, traceImage, saveHistorySnapshot]);

  const handleCreateOffset = useCallback(async (activeObj: fabric.Object | null, offsetSize: number) => {
    if (!canvas || !activeObj || isProcessingRef.current) return;

    if ((activeObj.type || '').toLowerCase() === 'image') {
      alert("Raster Image Detected!\n\nVinyl cutters cannot offset pixels. Trace to SVG first, then apply a kiss-cut border.");
      return;
    }

    isProcessingRef.current = true;

    try {
      // Drop leftover weld-export paper before cloning so Add Outline does
      // not paint invisible origin squares as extra pink boxes.
      tightPackWeldObject(activeObj);

      const clonedObj = await (activeObj as any).clone();
      tightPackWeldObject(clonedObj);
      paintOffsetAppearance(clonedObj, offsetSize * 2);

      const center = activeObj.getCenterPoint();
      clonedObj.set({ left: center.x, top: center.y, originX: 'center', originY: 'center' });
      clonedObj.setCoords();

      canvas.add(clonedObj);
      if (typeof (canvas as any).sendObjectToBack === 'function') {
        (canvas as any).sendObjectToBack(clonedObj);
      } else if (typeof (canvas as any).sendToBack === 'function') {
        (canvas as any).sendToBack(clonedObj);
      }
      canvas.setActiveObject(activeObj);
      canvas.requestRenderAll();
      saveHistorySnapshot(canvas, true);
    } catch (error) {
      console.error('Offset Generation Failed:', error);
    } finally {
      isProcessingRef.current = false;
    }
  }, [canvas, isProcessingRef, saveHistorySnapshot]);

  return { handleVectorTrace, handleCreateOffset };
}
