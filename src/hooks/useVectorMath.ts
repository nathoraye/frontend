/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fabric from 'fabric';
import { useCallback } from 'react';
import { TRACE_UPSCALE_MULT } from '../utils/constants';

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
    saveHistorySnapshot 
}: VectorMathProps) {

  const handleVectorTrace = useCallback(async (activeObj: fabric.Object | null) => {
    if (!canvas || !activeObj || isProcessingRef.current) return;
    
    if (activeObj.type !== 'image') {
      alert("This object is already a vector design!");
      return;
    }

    isProcessingRef.current = true;
    setIsTracing(true);

    try {
      const img = activeObj as any;
      
      const imgCanvas = img.toCanvasElement();
      const ctx = imgCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error("Could not read image data.");
      
      const imgData = ctx.getImageData(0, 0, imgCanvas.width, imgCanvas.height);
      const svgString = await traceImage(imgData);
      
      const result = await (fabric as any).loadSVGFromString(svgString);
      let objects = result.objects || result;
      const options = result.options || {};
      
      if (!objects || !Array.isArray(objects) || objects.length === 0) {
          throw new Error("Tracer returned an empty path.");
      }

      // STRICT FILTER: Delete any stray background boxes.
      // Matches hex white (#fff / #ffffff), named transparent/none, and rgba(255,255,255,...).
      objects = objects.filter((obj: any) => {
        const fill = obj.fill ? obj.fill.toString().toLowerCase().replace(/\s/g, '') : '';
        if (
          fill === 'transparent' ||
          fill === 'none' ||
          fill === '#ffffff' ||
          fill === '#fff' ||
          fill === 'rgb(255,255,255)' ||
          /^rgba\(255,255,255,/.test(fill)
        ) return false;
        return true;
      });

      if (objects.length === 0) throw new Error("No solid shapes found to trace after background removal.");

      objects.forEach((obj: any) => {
         obj.set({
            fill: '#FF1493', 
            stroke: '',
            strokeWidth: 0,
            objectCaching: true
         });
      });
      
      const tracedGroup = (fabric as any).util.groupSVGElements(objects, options);

      // EXACT REVERSE-SCALE MATH: divide by TRACE_UPSCALE_MULT to snap traced paths
      // back to their original visual size on the canvas.
      const finalScaleX = (img.scaleX || 1) / TRACE_UPSCALE_MULT;
      const finalScaleY = (img.scaleY || 1) / TRACE_UPSCALE_MULT;

      // Grab the absolute center of the original image to prevent alignment shifts
      const center = img.getCenterPoint();

      tracedGroup.set({
        originX: 'center',
        originY: 'center',
        left: center.x,
        top: center.y,
        scaleX: finalScaleX,
        scaleY: finalScaleY,
        angle: img.angle || 0,
        cornerColor: '#FF1493',
        transparentCorners: false,
        objectCaching: true
      });

      tracedGroup.setCoords();

      // Nuke the old raster image and drop in the fresh vector
      canvas.remove(img);
      canvas.add(tracedGroup);
      canvas.setActiveObject(tracedGroup);
      canvas.requestRenderAll();
      saveHistorySnapshot(canvas, true);

    } catch (error) {
      console.error("Vector Trace Failed:", error);
      alert("Failed to trace image. The design might be too faint or completely transparent.");
    } finally {
      isProcessingRef.current = false;
      setIsTracing(false);
    }
  }, [canvas, isProcessingRef, setIsTracing, traceImage, saveHistorySnapshot]);


  const handleCreateOffset = useCallback(async (activeObj: fabric.Object | null, offsetSize: number) => {
    if (!canvas || !activeObj || isProcessingRef.current) return;

    if (activeObj.type === 'image') {
        alert("⚠️ Raster Image Detected!\n\nVinyl cutters cannot offset pixels. You must click 'Trace to Razor SVG' first to convert this image into vector paths before applying a Kiss Cut border.");
        return;
    }

    isProcessingRef.current = true;

    try {
      const clonedObj = await (activeObj as any).clone();
      
      const offsetColor = '#FF1493'; 
      
      clonedObj.set({
        fill: offsetColor,
        stroke: offsetColor,
        strokeWidth: offsetSize * 2, 
        strokeLineJoin: 'round',
        strokeLineCap: 'round',
        evented: true, 
        objectCaching: true
      });

      if (clonedObj.type === 'group' || clonedObj.type === 'activeSelection') {
         clonedObj.getObjects().forEach((child: any) => {
             child.set({
                fill: offsetColor,
                stroke: offsetColor,
                strokeWidth: offsetSize * 2,
                strokeLineJoin: 'round',
                strokeLineCap: 'round'
             });
         });
      }

      clonedObj.setCoords();

      canvas.add(clonedObj);
      (canvas as any).sendToBack(clonedObj);

      canvas.requestRenderAll();
      saveHistorySnapshot(canvas, true);
      
    } catch (error) {
      console.error("Offset Generation Failed:", error);
    } finally {
      isProcessingRef.current = false;
    }
  }, [canvas, isProcessingRef, saveHistorySnapshot]);

  return { handleVectorTrace, handleCreateOffset };
}