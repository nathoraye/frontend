import * as fabric from 'fabric';
import { useCallback } from 'react';
import { exportCanvasToOptimizedSVG } from '../utils/exportPipeline';
import { validateSVGForCutting } from '../utils/geometryValidation';
import { notifyStudio } from '../utils/studioNotice';

const AI_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/** Scene-space centre so a new object lands in the visible viewport (phones included). */
function viewportDrop(canvas: fabric.Canvas) {
  const center = canvas.getVpCenter();
  return { left: center.x, top: center.y };
}

type ToolMode = 'select' | 'draw' | 'track-line' | 'wand' | 'bucket' | 'eraser';

interface StudioActionProps {
  canvas: fabric.Canvas | null;
  activeObj: (fabric.Object & { centerH?: () => void; centerV?: () => void }) | null;
  brushColor: string;
  setTool: (t: ToolMode) => void;
  setIsGenerating: (val: boolean) => void;
  setTextCurve: (val: number) => void;
  saveHistorySnapshot: (canvas: fabric.Canvas, immediate?: boolean) => void;
}

export function useStudioActions({
  canvas, activeObj, brushColor, setTool, setIsGenerating, setTextCurve, saveHistorySnapshot
}: StudioActionProps) {

  const alignObject = useCallback((position: 'centerH' | 'centerV') => {
    if (!canvas || !activeObj) return;
    if (position === 'centerH' && activeObj.centerH) activeObj.centerH();
    if (position === 'centerV' && activeObj.centerV) activeObj.centerV();
    activeObj.setCoords(); canvas.requestRenderAll(); saveHistorySnapshot(canvas, true);
  }, [canvas, activeObj, saveHistorySnapshot]);

  const applyTextCurve = useCallback((curveValue: number) => {
    setTextCurve(curveValue);
    if (!canvas || !activeObj || activeObj.type !== 'i-text') return;
    const txt = activeObj as fabric.IText;
    if (curveValue === 0) { txt.set({ path: undefined }); } 
    else {
      const w = txt.width || 200;
      const path = new fabric.Path(`M 0 0 Q ${w / 2} ${curveValue} ${w} 0`, { fill: '', stroke: '', visible: false });
      txt.set({ path });
    }
    canvas.requestRenderAll(); saveHistorySnapshot(canvas);
  }, [canvas, activeObj, setTextCurve, saveHistorySnapshot]);

  const explodeText = useCallback(() => {
    if (!canvas || !activeObj || activeObj.type !== 'i-text') return;
    const txt = activeObj as fabric.IText; const chars = (txt.text || '').split('');
    let currentLeft = txt.left || 0; const top = txt.top || 0;
    canvas.remove(txt); const newChars: fabric.IText[] = [];
    chars.forEach((char) => {
       const charObj = new fabric.IText(char, { fontFamily: txt.fontFamily, fontSize: txt.fontSize, fill: txt.fill, left: currentLeft, top: top, cornerColor: '#FF1493', transparentCorners: false, objectCaching: true });
       canvas.add(charObj); newChars.push(charObj); currentLeft += (charObj.width || 0) + (txt.charSpacing || 0);
    });
    const sel = new fabric.ActiveSelection(newChars, { canvas });
    canvas.setActiveObject(sel); canvas.requestRenderAll(); saveHistorySnapshot(canvas, true);
  }, [canvas, activeObj, saveHistorySnapshot]);

  const addText = useCallback(() => {
    if (!canvas) return;
    const drop = viewportDrop(canvas);
    const text = new fabric.IText('WEST VINYL', { left: drop.left, top: drop.top, fontFamily: 'Montserrat', fontWeight: 'bold', fill: brushColor, fontSize: 64, cornerColor: '#FF1493', transparentCorners: false, cornerStyle: 'circle' as const, objectCaching: true });
    canvas.add(text); canvas.setActiveObject(text); setTool('select'); canvas.requestRenderAll(); saveHistorySnapshot(canvas, true);
  }, [canvas, brushColor, setTool, saveHistorySnapshot]);

  // --- UPGRADED IMAGE UPLOAD ENGINE ---
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; 
    if (!file || !canvas) return; 

    try {
      // 1. Create a high-speed local memory URL instead of running a slow Base64 string reader
      const objectUrl = URL.createObjectURL(file);
      
      // 2. Fabric 7 requires a Promise (async/await)
      const img = await fabric.Image.fromURL(objectUrl);
      
      // 3. Apply standard styling and drop it into the physical view
      const drop = viewportDrop(canvas);
      img.set({ 
          left: drop.left, 
          top: drop.top, 
          cornerColor: '#FF1493', 
          transparentCorners: false, 
          cornerStyle: 'circle' as const, 
          objectCaching: true 
      });
      
      if (img.width && img.width > 800) img.scaleToWidth(800);
      
      canvas.add(img); 
      canvas.setActiveObject(img); 
      setTool('select'); 
      canvas.requestRenderAll(); 
      saveHistorySnapshot(canvas, true);
      
      // 4. Flush the temporary URL to prevent memory leaks in the browser
      URL.revokeObjectURL(objectUrl);

    } catch {
      console.error("Upload Engine Crash:");
      notifyStudio({ tone: 'error', title: 'Could not read image', detail: 'Use a valid PNG or JPG.' });
    } finally {
      // 5. Always reset the file input so you can re-upload the exact same file later
      e.target.value = '';
    }
  }, [canvas, setTool, saveHistorySnapshot]);

  const addShape = useCallback((shapeType: 'rect' | 'circle' | 'triangle' | 'star' | 'hex') => {
    if (!canvas) return;
    const drop = viewportDrop(canvas);
    const props = { left: drop.left, top: drop.top, fill: brushColor, cornerColor: '#FF1493', transparentCorners: false, cornerStyle: 'circle' as const, objectCaching: true };
    let shape;
    if (shapeType === 'rect') shape = new fabric.Rect({ ...props, width: 200, height: 200 });
    if (shapeType === 'circle') shape = new fabric.Circle({ ...props, radius: 100 });
    if (shapeType === 'triangle') shape = new fabric.Triangle({ ...props, width: 200, height: 200 });
    if (shapeType === 'star') shape = new fabric.Polygon([{x: 100, y: 0}, {x: 125, y: 70}, {x: 200, y: 70}, {x: 140, y: 115}, {x: 160, y: 190}, {x: 100, y: 145}, {x: 40, y: 190}, {x: 60, y: 115}, {x: 0, y: 70}, {x: 75, y: 70}], props);
    if (shapeType === 'hex') shape = new fabric.Polygon([{x: 100, y: 0}, {x: 200, y: 50}, {x: 200, y: 150}, {x: 100, y: 200}, {x: 0, y: 150}, {x: 0, y: 50}], props);
    if (shape) { canvas.add(shape); canvas.setActiveObject(shape); setTool('select'); canvas.requestRenderAll(); saveHistorySnapshot(canvas, true); }
  }, [canvas, brushColor, setTool, saveHistorySnapshot]);

  // --- UPGRADED AI GENERATION ENGINE ---
  const handleAIGeneration = useCallback(async () => {
    const userPrompt = window.prompt("What kind of sticker do you want to generate?"); 
    if (!userPrompt) return; 
    
    setIsGenerating(true);
    
    try {
      const response = await fetch(`${AI_API_BASE_URL || ''}/api/generate-sticker`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ prompt: userPrompt }) 
      });
      
      const data = await response.json();
      
      if (data.success && canvas) {
          // Changed to await Promise for Fabric 7 compatibility
          const img = await fabric.Image.fromURL(data.image, { crossOrigin: 'anonymous' });
          img.set({ left: 400, top: 400, scaleX: 600 / (img.width || 600), scaleY: 600 / (img.height || 600), cornerColor: '#FF1493', transparentCorners: false, cornerStyle: 'circle' as const, objectCaching: true });
          
          canvas.add(img); 
          canvas.setActiveObject(img); 
          setTool('select'); 
          canvas.requestRenderAll(); 
          saveHistorySnapshot(canvas, true);
      } else {
          notifyStudio({ tone: 'error', title: 'Generate failed', detail: String(data.error || 'Unknown error') });
      }
    } catch { 
      notifyStudio({ tone: 'error', title: 'Generate failed', detail: 'The sticker service did not respond.' });
    } finally { 
      setIsGenerating(false); 
    }
  }, [canvas, setTool, saveHistorySnapshot, setIsGenerating]);

  const handleExportSVG = useCallback(async () => {
    if (!canvas) return;

    try {
      const svg = await exportCanvasToOptimizedSVG(canvas, { addMetadata: true });
      const validation = validateSVGForCutting(svg);

      if (!validation.isValid) {
        const errors = validation.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
        notifyStudio({
          tone: 'error',
          title: 'Not cut ready',
          detail: errors[0] || 'Fix the cut checklist, then export again.',
        });
        return;
      }

      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'west-vinyl-export.svg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      notifyStudio({ tone: 'error', title: 'Export failed', detail: 'The SVG pipeline hit an error. Try tracing rasters first.' });
    }
  }, [canvas]);

  const addWeedingBox = useCallback(() => {
    if (!canvas || !activeObj) {
      notifyStudio({ tone: 'warning', title: 'Select a design first', detail: 'The weeding box is sized to the current selection.' });
      return;
    }
    const bounds = activeObj.getBoundingRect();
    const padding = 15; 
    const weedingBox = new fabric.Rect({
      left: bounds.left - padding,
      top: bounds.top - padding,
      width: bounds.width + (padding * 2),
      height: bounds.height + (padding * 2),
      fill: 'transparent',
      stroke: '#00FFFF', 
      strokeWidth: 1,
      strokeUniform: true, 
      cornerColor: '#FF1493',
      transparentCorners: false,
      cornerStyle: 'circle' as const
    });
    canvas.add(weedingBox);
    const canvasWithSendToBack = canvas as fabric.Canvas & { sendToBack(object: fabric.Object): void };
    canvasWithSendToBack.sendToBack(weedingBox);
    canvas.requestRenderAll();
    saveHistorySnapshot(canvas, true);
  }, [canvas, activeObj, saveHistorySnapshot]);

  return { alignObject, applyTextCurve, explodeText, addText, handleImageUpload, addShape, handleAIGeneration, handleExportSVG, addWeedingBox };
}