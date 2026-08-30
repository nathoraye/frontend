/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/immutability */
import * as fabric from 'fabric';
import { useEffect, useRef } from 'react';
import { TRACE_UPSCALE_MULT } from '../utils/constants';
import { tracedSvgToObject } from '../utils/placeTracedSvg';
import { applyEraserStroke } from '../utils/eraseStroke';

interface CanvasEventProps {
  canvas: fabric.Canvas | null;
  matOverlayRef: React.RefObject<HTMLDivElement | null>;
  isProcessingRef: React.MutableRefObject<boolean>;
  tool: string;
  brushColor: string;
  brushSize: number;
  brushType: 'round' | 'chisel';
  wandTolerance: number;
  wandMode: 'erase' | 'extract';
  eraserMode: 'layer' | 'canvas'; 
  setIsTracing: (val: boolean) => void;
  setQuickMenu: (menu: any) => void;
  updateUIFromSelection: () => void;
  saveHistorySnapshot: (canvas: fabric.Canvas, immediate?: boolean) => void;
  traceImage: (imageData: ImageData, smoothness?: number) => Promise<string>;
  setTool?: (tool: 'select' | 'draw' | 'track-line' | 'wand' | 'bucket' | 'eraser') => void;
  quickMenuRef?: React.RefObject<HTMLDivElement | null>;
  eraserTargetRef?: React.MutableRefObject<fabric.Object | null>;
}

// --- VECTOR SMOOTHING ENGINE (B&W FORCE) ---
// Forces the image into strict Black (Foreground) and White (Background)
// so the SVG Tracer doesn't get confused by alpha transparency.
const applyVectorSmoothing = (sourceCanvas: HTMLCanvasElement): ImageData | null => {
    const smoothCanvas = document.createElement('canvas');
    smoothCanvas.width = sourceCanvas.width;
    smoothCanvas.height = sourceCanvas.height;
    const smoothCtx = smoothCanvas.getContext('2d', { willReadFrequently: true });
    if (!smoothCtx) return null;

    smoothCtx.filter = 'blur(1.5px)';
    smoothCtx.drawImage(sourceCanvas, 0, 0);

    const sImgData = smoothCtx.getImageData(0, 0, smoothCanvas.width, smoothCanvas.height);
    const sData = sImgData.data;
    for (let i = 0; i < sData.length; i += 4) {
        if (sData[i+3] > 128) {
            // Target becomes BLACK
            sData[i] = 0; sData[i+1] = 0; sData[i+2] = 0; sData[i+3] = 255; 
        } else {
            // Background becomes WHITE
            sData[i] = 255; sData[i+1] = 255; sData[i+2] = 255; sData[i+3] = 255; 
        }
    }
    return sImgData;
};

export function useCanvasEvents(props: CanvasEventProps) {
  const p = useRef(props);
  useEffect(() => { p.current = props; }, [props]);

  const isPanning = useRef<boolean>(false);
  const lastPanX = useRef<number>(0);
  const lastPanY = useRef<number>(0);
  
  const isDrawingPolyline = useRef<boolean>(false);
  const polylinePoints = useRef<{x: number, y: number}[]>([]);
  const activeLine = useRef<any>(null);
  const tempLines = useRef<any[]>([]);

  const canvas = props.canvas;

  useEffect(() => { 
    if (p.current.isProcessingRef) p.current.isProcessingRef.current = false; 
    p.current.setIsTracing(false); 

    if (props.tool !== 'track-line' && isDrawingPolyline.current) {
        isDrawingPolyline.current = false;
        if (activeLine.current) { props.canvas?.remove(activeLine.current); activeLine.current = null; }
        tempLines.current.forEach(line => props.canvas?.remove(line));
        tempLines.current = [];
        polylinePoints.current = [];
        props.canvas?.requestRenderAll();
    }
  }, [props.tool, props.canvas]);

  useEffect(() => {
    if (!canvas) return;
    const canvasInstance = canvas;
    canvasInstance.isDrawingMode = props.tool === 'draw' || props.tool === 'eraser';
    
    if (canvasInstance.isDrawingMode) {
        if (!(canvasInstance as any).freeDrawingBrush) {
            (canvasInstance as any).freeDrawingBrush = new (fabric as any).PencilBrush(canvasInstance);
        }
        const brush = (canvasInstance as any).freeDrawingBrush;
        if (brush) {
            brush.color = props.tool === 'eraser' ? 'rgba(255, 20, 147, 0.5)' : props.brushColor;
            brush.width = props.brushSize;
            brush.strokeLineCap = props.brushType === 'chisel' ? 'square' : 'round';
            brush.strokeLineJoin = props.brushType === 'chisel' ? 'miter' : 'round';
        }
    }
  }, [canvas, props.tool, props.brushSize, props.brushColor, props.brushType]);

  useEffect(() => {
    if (!canvas) return;

    const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    const hexToRgbObj = (hex: string) => {
        const num = parseInt(hex.slice(1), 16);
        return { r: num >> 16, g: (num >> 8) & 255, b: num & 255 };
    };

    const isColorMatch = (colorVal: any, hexStr: string, tol: number) => {
        if (!colorVal) return false;
        const c = typeof colorVal === 'string' ? colorVal : colorVal.toString();
        if (c.includes('url') || c === 'none' || c === 'transparent' || c === '') return false;
        try {
            let r=0, g=0, b=0;
            if (c.startsWith('#')) {
                const h = c.length === 4 ? '#' + c[1]+c[1]+c[2]+c[2]+c[3]+c[3] : c;
                const num = parseInt(h.slice(1), 16); r = num >> 16; g = (num >> 8) & 255; b = num & 255;
            } else if (c.startsWith('rgb')) {
                const parts = c.match(/\d+/g);
                if(parts) { r = parseInt(parts[0]); g = parseInt(parts[1]); b = parseInt(parts[2]); }
            } else return false;
            const tNum = parseInt(hexStr.slice(1), 16);
            const dist = Math.sqrt(Math.pow(r - (tNum >> 16), 2) + Math.pow(g - ((tNum >> 8) & 255), 2) + Math.pow(b - (tNum & 255), 2)) / 441.67;
            return dist <= tol;
        } catch { return false; }
    };

    const syncMatOverlay = () => {
      if (p.current.matOverlayRef.current && canvas.viewportTransform) {
        p.current.matOverlayRef.current.style.transform = `matrix(${canvas.viewportTransform.join(',')})`;
      }
    };

    const menuScreenPoint = (obj: any) => {
      obj.setCoords();
      const br = obj.getBoundingRect();
      const centerX = br.left + (br.width / 2);
      const topY = br.top;
      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const screenPt = (fabric as any).util.transformPoint({ x: centerX, y: topY }, vpt);
      return {
        top: isNaN(screenPt.y) ? 10 : Math.max(10, screenPt.y - 90),
        left: isNaN(screenPt.x) ? 100 : screenPt.x,
      };
    };

    const updateMenuPosition = () => {
      const obj = canvas.getActiveObject();
      const el = p.current.quickMenuRef?.current;
      if (obj && p.current.tool === 'select') {
        const { top, left } = menuScreenPoint(obj);
        if (el) {
          el.style.display = 'flex';
          el.style.top = `${top}px`;
          el.style.left = `${left}px`;
        }
        return { top, left };
      }
      if (el) el.style.display = 'none';
      return null;
    };

    const showMenu = (obj: any) => {
      if (!obj) return;
      const pos = updateMenuPosition();
      if (pos) p.current.setQuickMenu({ top: pos.top, left: pos.left, show: true });
    };

    const finishPolyline = (autoClose: boolean = false) => {
       if (!isDrawingPolyline.current) return;
       isDrawingPolyline.current = false;
       if (activeLine.current) { canvas.remove(activeLine.current); activeLine.current = null; }
       tempLines.current.forEach(line => canvas.remove(line));
       const pts = [...polylinePoints.current];
       const uniquePoints = pts.filter((pt, idx, self) => {
          if (idx === 0) return true; 
          const prev = self[idx - 1]; 
          return Math.abs(pt.x - prev.x) > 2 || Math.abs(pt.y - prev.y) > 2;
       });
       if (uniquePoints.length >= 2) {
          const ShapeClass = autoClose ? (fabric as any).Polygon : (fabric as any).Polyline;
          const finalShape = new ShapeClass(uniquePoints, {
             strokeWidth: p.current.brushSize || 5, fill: autoClose ? 'rgba(255,255,255,0.01)' : 'transparent', stroke: p.current.brushColor || '#FF1493', strokeUniform: true, cornerColor: '#FF1493', transparentCorners: false, objectCaching: false, strokeLineCap: p.current.brushType === 'chisel' ? 'square' : 'round', strokeLineJoin: p.current.brushType === 'chisel' ? 'miter' : 'round'
          });
          canvas.add(finalShape); canvas.setActiveObject(finalShape); finalShape.setCoords(); finalShape.set('dirty', true);
          p.current.saveHistorySnapshot(canvas, true);
       }
       polylinePoints.current = []; tempLines.current = [];
       if (p.current.setTool) p.current.setTool('select');
       canvas.requestRenderAll();
    };

    const onMouseWheel = (opt: any) => {
      let zoom = canvas.getZoom(); zoom *= 0.999 ** opt.e.deltaY;
      if (zoom > 10) zoom = 10; if (zoom < 0.05) zoom = 0.05;
      canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY } as any, zoom);
      syncMatOverlay(); canvas.requestRenderAll(); updateMenuPosition();
      opt.e.preventDefault(); opt.e.stopPropagation(); 
    };

    const getSafePointer = (opt: any) => {
        if (opt.scenePoint) return opt.scenePoint;
        if (typeof (canvas as any).getScenePoint === 'function') return (canvas as any).getScenePoint(opt.e);
        if (typeof (canvas as any).getPointer === 'function') return (canvas as any).getPointer(opt.e);
        return { x: opt.e.clientX, y: opt.e.clientY };
    };

    const onMouseDown = async (opt: any) => {
      if (p.current.isProcessingRef.current) return; 
      const evt = opt.e as MouseEvent;
      
      if (evt.altKey || evt.button === 1 || evt.button === 2) {
        isPanning.current = true; canvas.selection = false; lastPanX.current = evt.clientX; lastPanY.current = evt.clientY; 
        p.current.setQuickMenu(null); return;
      }
      
      if (!opt.target) p.current.setQuickMenu(null);
      const pointer = getSafePointer(opt);

      // --- DUAL MODE WAND ENGINE ---
      if (p.current.tool === 'wand' && opt.target) {
        p.current.isProcessingRef.current = true;
        try {
            const el = (canvas as any).lowerCanvasEl || document.querySelector('canvas');
            if (!el) throw new Error("DOM canvas not found");
            const ctx = el.getContext('2d', { willReadFrequently: true });
            const rect = el.getBoundingClientRect();
            
            const scaleX = el.width / rect.width; const scaleY = el.height / rect.height;
            const x = Math.floor((evt.clientX - rect.left) * scaleX);
            const y = Math.floor((evt.clientY - rect.top) * scaleY);
            const pixelData = ctx.getImageData(x, y, 1, 1).data;
            
            if (pixelData[3] > 0) {
                const clickedHex = rgbToHex(pixelData[0], pixelData[1], pixelData[2]);
                const targetRGB = hexToRgbObj(clickedHex);
                const target = opt.target;

                // 1. EXTRACT MODE
                if (p.current.wandMode === 'extract') {
                    if (target.type === 'image') {
                        const imgEl = (target as any).getElement();
                        if (!imgEl) throw new Error("Image element not found");

                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = imgEl.naturalWidth || imgEl.width;
                        tempCanvas.height = imgEl.naturalHeight || imgEl.height;
                        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                        if (!tempCtx) return;

                        tempCtx.drawImage(imgEl, 0, 0);
                        const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                        const data = imgData.data;
                        let hasPixels = false;
                        
                        for (let i = 0; i < data.length; i += 4) {
                            if (data[i + 3] < 128) {
                                data[i] = 255; data[i+1] = 255; data[i+2] = 255; data[i+3] = 255;
                                continue;
                            }
                            const dist = Math.sqrt(Math.pow(data[i] - targetRGB.r, 2) + Math.pow(data[i+1] - targetRGB.g, 2) + Math.pow(data[i+2] - targetRGB.b, 2)) / 441.67;

                            if (dist <= p.current.wandTolerance) {
                                data[i] = 0; data[i+1] = 0; data[i+2] = 0; data[i+3] = 255;
                                hasPixels = true;
                            } else {
                                data[i] = 255; data[i+1] = 255; data[i+2] = 255; data[i+3] = 255;
                            }
                        }

                        if (!hasPixels) { p.current.isProcessingRef.current = false; return; }
                        tempCtx.putImageData(imgData, 0, 0);

                        p.current.setIsTracing(true);
                        const svgString = await p.current.traceImage(imgData);
                        const traced = await tracedSvgToObject(svgString, {
                            keepOnlyBlack: true,
                            source: target,
                            fill: p.current.brushColor,
                            scaleDivisor: TRACE_UPSCALE_MULT,
                        });
                        if (traced) {
                            canvas.add(traced);
                            canvas.setActiveObject(traced);
                            canvas.requestRenderAll();
                            p.current.saveHistorySnapshot(canvas, true);
                        }
                        p.current.setIsTracing(false);
                    }
                } 
                // 2. ERASE MODE
                else if (p.current.wandMode === 'erase') {
                    if (target.type === 'image') {
                        const imgEl = (target as any).getElement();
                        if (!imgEl) throw new Error("Image element not found");

                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = imgEl.naturalWidth || imgEl.width;
                        tempCanvas.height = imgEl.naturalHeight || imgEl.height;
                        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                        if (!tempCtx) return;

                        tempCtx.drawImage(imgEl, 0, 0);
                        const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                        const data = imgData.data;
                        let pixelsModified = false;
                        
                        for (let i = 0; i < data.length; i += 4) {
                            if (data[i + 3] === 0) continue;
                            const dist = Math.sqrt(Math.pow(data[i] - targetRGB.r, 2) + Math.pow(data[i+1] - targetRGB.g, 2) + Math.pow(data[i+2] - targetRGB.b, 2)) / 441.67;

                            if (dist <= p.current.wandTolerance) {
                                data[i+3] = 0; 
                                pixelsModified = true;
                            }
                        }

                        if (!pixelsModified) { p.current.isProcessingRef.current = false; return; }
                        tempCtx.putImageData(imgData, 0, 0);

                        const newImg = new Image();
                        newImg.onload = () => {
                            const fImg = new (fabric as any).Image(newImg);
                            fImg.set({ 
                                left: target.left, top: target.top, 
                                originX: target.originX, originY: target.originY, 
                                scaleX: target.scaleX, scaleY: target.scaleY, 
                                angle: target.angle, objectCaching: true 
                            });
                            if (target.filters) fImg.filters = [...target.filters];
                            
                            canvas.remove(target); 
                            canvas.add(fImg); 
                            canvas.setActiveObject(fImg); 
                            canvas.requestRenderAll(); 
                            p.current.saveHistorySnapshot(canvas, true);
                        };
                        newImg.src = tempCanvas.toDataURL('image/png');
                    } else {
                        const processVector = (obj: any) => {
                            if (obj.type === 'group' || obj.type === 'activeSelection' || obj._objects) {
                                const objects = obj._objects || (typeof obj.getObjects === 'function' ? obj.getObjects() : []);
                                for (let i = objects.length - 1; i >= 0; i--) {
                                    const child = objects[i];
                                    processVector(child);
                                    if ((!child.fill || child.fill === '' || child.fill === 'transparent') && (!child.stroke || child.stroke === '' || child.stroke === 'transparent')) {
                                        if (obj.removeWithUpdate) {
                                            obj.removeWithUpdate(child);
                                        } else {
                                            obj.remove(child);
                                        }
                                    }
                                }
                            } else {
                                if (isColorMatch(obj.fill, clickedHex, p.current.wandTolerance)) obj.set('fill', 'transparent');
                                if (isColorMatch(obj.stroke, clickedHex, p.current.wandTolerance)) obj.set('stroke', 'transparent');
                                obj.set('dirty', true);
                            }
                        };

                        processVector(target);

                        if (target.type !== 'group' && target.type !== 'activeSelection' && !target._objects) {
                            if ((!target.fill || target.fill === '' || target.fill === 'transparent') && (!target.stroke || target.stroke === '' || target.stroke === 'transparent')) {
                                canvas.remove(target);
                            }
                        } else {
                            const children = target._objects || (typeof target.getObjects === 'function' ? target.getObjects() : []);
                            if (children.length === 0) canvas.remove(target);
                        }
                        canvas.requestRenderAll();
                        p.current.saveHistorySnapshot(canvas, true);
                    }
                }
            }
        } catch (e) { console.error("Wand failed.", e); } finally { p.current.isProcessingRef.current = false; }
        return; 
      }

      // --- THE GOD-MODE BUCKET ENGINE ---
      if (p.current.tool === 'bucket') {
        p.current.isProcessingRef.current = true; 
        try {
            let handled = false;
            if (opt.target && opt.target.type !== 'image') {
                const targetColor = p.current.brushColor;
                const applyBruteForceColor = (obj: any) => {
                    if (obj.type === 'group' || obj.type === 'activeSelection' || obj._objects) {
                        obj.set({ fill: 'transparent', stroke: 'transparent', dirty: true }); 
                        const children = obj._objects || (typeof obj.getObjects === 'function' ? obj.getObjects() : []);
                        children.forEach((child: any) => applyBruteForceColor(child));
                    } else {
                        obj.set({ fill: targetColor });
                        if ((obj.strokeWidth && obj.strokeWidth > 0) || (obj.stroke && obj.stroke !== 'transparent' && obj.stroke !== 'none')) {
                            obj.set({ stroke: targetColor, strokeUniform: true });
                        }
                        obj.set({ dirty: true });
                    }
                };
                applyBruteForceColor(opt.target);
                handled = true;
            }

            if (handled) { canvas.requestRenderAll(); p.current.saveHistorySnapshot(canvas, true); p.current.isProcessingRef.current = false; return; }

            const el = (canvas as any).lowerCanvasEl || document.querySelector('canvas');
            if (!el) throw new Error("Canvas not found");
            
            p.current.setIsTracing(true);
            const px = Math.floor(pointer.x); const py = Math.floor(pointer.y);
            if (px < 0 || py < 0 || px >= 1200 || py >= 1200) { p.current.isProcessingRef.current = false; p.current.setIsTracing(false); return; }

            const originalVpt = canvas.viewportTransform ? ([...canvas.viewportTransform] as any) : null;
            canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
            let dataUrl = '';
            try { dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1, left: 0, top: 0, width: 1200, height: 1200 }); } catch { p.current.isProcessingRef.current = false; p.current.setIsTracing(false); return; }
            if (originalVpt) canvas.setViewportTransform(originalVpt);

            const htmlImg = new Image();
            htmlImg.onload = async () => {
               try {
                   const tempCanvas = document.createElement('canvas'); tempCanvas.width = 1200; tempCanvas.height = 1200;
                   const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true }); if (!tempCtx) throw new Error("No Context");
                   tempCtx.fillStyle = '#FFFFFF'; tempCtx.fillRect(0, 0, 1200, 1200); tempCtx.drawImage(htmlImg, 0, 0);
                   const imgData = tempCtx.getImageData(0, 0, 1200, 1200); const data = imgData.data;
                   
                   const startPos = (py * 1200 + px) * 4;
                   const startR = data[startPos]; const startG = data[startPos + 1]; const startB = data[startPos + 2]; const startA = data[startPos + 3];
                   const colorMatch = (pos: number) => Math.abs(data[pos] - startR) < 10 && Math.abs(data[pos+1] - startG) < 10 && Math.abs(data[pos+2] - startB) < 10 && Math.abs(data[pos+3] - startA) < 10; 

                   if (colorMatch(startPos)) {
                     const pixelStack = [[px, py]];
                     while (pixelStack.length > 0) {
                        const newPos = pixelStack.pop()!; const x = newPos[0]; let y = newPos[1];
                        let pixelPos = (y * 1200 + x) * 4;
                        while (y-- >= 0 && colorMatch(pixelPos)) { pixelPos -= 4800; }
                        pixelPos += 4800; ++y; let reachLeft = false; let reachRight = false;
                        while (y++ < 1199 && colorMatch(pixelPos)) {
                           data[pixelPos] = 255; data[pixelPos+1] = 0; data[pixelPos+2] = 0; data[pixelPos+3] = 255;
                           if (x > 0) { if (colorMatch(pixelPos - 4)) { if (!reachLeft) { pixelStack.push([x - 1, y]); reachLeft = true; } } else if (reachLeft) reachLeft = false; }
                           if (x < 1199) { if (colorMatch(pixelPos + 4)) { if (!reachRight) { pixelStack.push([x + 1, y]); reachRight = true; } } else if (reachRight) reachRight = false; }
                           pixelPos += 4800;
                        }
                     }
                   }
                   
                   let hasFill = false;
                   for (let i = 0; i < data.length; i += 4) {
                      if (data[i] === 255 && data[i+1] === 0 && data[i+2] === 0) { 
                          data[i] = 0; data[i+1] = 0; data[i+2] = 0; data[i+3] = 255; // Fill becomes Black
                          hasFill = true; 
                      } else { 
                          data[i] = 255; data[i+1] = 255; data[i+2] = 255; data[i+3] = 255; // Background becomes White
                      }
                   }
                   if (!hasFill) throw new Error("No fill area detected");
                   tempCtx.putImageData(imgData, 0, 0);

                   const smoothedImgData = applyVectorSmoothing(tempCanvas) || tempCtx.getImageData(0, 0, 1200, 1200);

                   const svgString = await p.current.traceImage(smoothedImgData);
                   const traced = await tracedSvgToObject(svgString, {
                       keepOnlyBlack: true,
                       fill: p.current.brushColor,
                   });
                   if (traced) {
                      traced.set({
                          originX: 'left',
                          originY: 'top',
                          left: 0,
                          top: 0,
                          scaleX: 1 / TRACE_UPSCALE_MULT,
                          scaleY: 1 / TRACE_UPSCALE_MULT,
                      });
                      traced.setCoords();
                      canvas.add(traced);
                      canvas.setActiveObject(traced);
                      canvas.requestRenderAll();
                      p.current.saveHistorySnapshot(canvas, true);
                   }
               } catch (e) { console.error("Bucket Trace Error:", e); } finally { p.current.isProcessingRef.current = false; p.current.setIsTracing(false); }
            };
            htmlImg.onerror = () => { p.current.isProcessingRef.current = false; p.current.setIsTracing(false); }
            htmlImg.src = dataUrl;
        } catch (e) { console.error("Bucket failed:", e); p.current.isProcessingRef.current = false; }
        return; 
      }

      // --- MAGNETIC TRACK-LINE ENGINE ---
      if (p.current.tool === 'track-line') {
        if (isDrawingPolyline.current && polylinePoints.current.length > 2 && Math.sqrt(Math.pow(pointer.x - polylinePoints.current[0].x, 2) + Math.pow(pointer.y - polylinePoints.current[0].y, 2)) < 20) { finishPolyline(true); return; }
        
        const lineSettings = { strokeWidth: p.current.brushSize || 5, fill: 'transparent', stroke: p.current.brushColor || '#FF1493', selectable: false, evented: false, strokeLineCap: p.current.brushType === 'chisel' ? 'square' : 'round', strokeLineJoin: p.current.brushType === 'chisel' ? 'miter' : 'round' };
        if (!isDrawingPolyline.current) {
          isDrawingPolyline.current = true; polylinePoints.current = [{ x: pointer.x, y: pointer.y }];
          activeLine.current = new (fabric as any).Line([pointer.x, pointer.y, pointer.x, pointer.y], lineSettings); canvas.add(activeLine.current);
        } else {
          if (activeLine.current) tempLines.current.push(activeLine.current);
          polylinePoints.current.push({ x: pointer.x, y: pointer.y });
          activeLine.current = new (fabric as any).Line([pointer.x, pointer.y, pointer.x, pointer.y], lineSettings); canvas.add(activeLine.current);
        }
        canvas.requestRenderAll(); return;
      }
    };

    const onMouseMove = (opt: any) => {
      if (isPanning.current && canvas.viewportTransform) {
        const vpt = canvas.viewportTransform; vpt[4] += opt.e.clientX - lastPanX.current; vpt[5] += opt.e.clientY - lastPanY.current;
        canvas.setViewportTransform(vpt); canvas.requestRenderAll(); lastPanX.current = opt.e.clientX; lastPanY.current = opt.e.clientY;
        syncMatOverlay(); updateMenuPosition();
      }
      
      if (isDrawingPolyline.current && p.current.tool === 'track-line' && activeLine.current) {
        const pointer = getSafePointer(opt);
        activeLine.current.set({ x2: pointer.x, y2: pointer.y }); activeLine.current.setCoords(); canvas.requestRenderAll();
      }
    };

    const onMouseDblClick = () => { if (p.current.tool === 'track-line' && isDrawingPolyline.current) finishPolyline(false); };
    
    const onMouseUp = () => {
      if (isPanning.current && canvas.viewportTransform) { canvas.setViewportTransform(canvas.viewportTransform); isPanning.current = false; if (p.current.tool === 'select') canvas.selection = true; }
      if (p.current.tool === 'select') { const obj = canvas.getActiveObject(); if (obj) showMenu(obj); }
    };

    const onPathCreated = async (e: any) => { 
       if(!e.path) return;
       const path = e.path;
       if (p.current.tool === 'eraser') {
           canvas.remove(path);
           const target = p.current.eraserTargetRef?.current || canvas.getActiveObject() || null;
           if (p.current.eraserMode === 'layer' && !target) {
               alert('Select a layer first, then erase. The eraser only punches the stroke you draw — it will not delete the whole object.');
               return;
           }
           try {
               p.current.isProcessingRef.current = true;
               await applyEraserStroke(canvas, path, target, p.current.eraserMode);
               canvas.requestRenderAll();
               p.current.saveHistorySnapshot(canvas, true);
               if (target && p.current.eraserTargetRef) {
                   p.current.eraserTargetRef.current = canvas.getActiveObject() || target;
               }
           } catch (err) {
               console.error('Eraser failed:', err);
           } finally {
               p.current.isProcessingRef.current = false;
           }
           return;
       }
       path.set({ objectCaching: true, strokeLineCap: p.current.brushType === 'chisel' ? 'square' : 'round', strokeLineJoin: p.current.brushType === 'chisel' ? 'miter' : 'round' }); 
       p.current.saveHistorySnapshot(canvas, true); 
    };

    canvas.on('mouse:wheel', onMouseWheel); 
    canvas.on('mouse:down', onMouseDown); 
    canvas.on('mouse:move', onMouseMove);
    canvas.on('mouse:dblclick', onMouseDblClick); 
    canvas.on('mouse:up', onMouseUp); 
    canvas.on('path:created', onPathCreated);
    canvas.on('object:moving', updateMenuPosition); 
    canvas.on('object:scaling', updateMenuPosition); 
    canvas.on('object:rotating', updateMenuPosition);
    
    const handleSelectionCleared = () => { p.current.updateUIFromSelection(); p.current.setQuickMenu(null); };
    const handleObjectModified = () => { syncUI(); p.current.saveHistorySnapshot(canvas); };
    const syncUI = () => { p.current.updateUIFromSelection(); updateMenuPosition(); };
    canvas.on('selection:created', syncUI); 
    canvas.on('selection:updated', syncUI); 
    canvas.on('selection:cleared', handleSelectionCleared);
    canvas.on('object:modified', handleObjectModified);

    return () => {
      canvas.off('mouse:wheel', onMouseWheel); 
      canvas.off('mouse:down', onMouseDown); 
      canvas.off('mouse:move', onMouseMove);
      canvas.off('mouse:dblclick', onMouseDblClick); 
      canvas.off('mouse:up', onMouseUp); 
      canvas.off('path:created', onPathCreated);
      canvas.off('object:moving', updateMenuPosition); 
      canvas.off('object:scaling', updateMenuPosition); 
      canvas.off('object:rotating', updateMenuPosition);
      canvas.off('selection:created', syncUI); 
      canvas.off('selection:updated', syncUI); 
      canvas.off('selection:cleared', handleSelectionCleared); 
      canvas.off('object:modified', handleObjectModified);
    };
  }, [canvas]); 
}