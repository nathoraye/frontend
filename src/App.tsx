/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fabric from 'fabric'; 
import { useEffect, useRef, useState, useCallback } from 'react';
import { useCanvasEngine } from './hooks/useCanvasEngine';
import { useHistoryEngine } from './hooks/useHistoryEngine';
import { useAlignmentEngine } from './hooks/useAlignmentEngine'; 
import { useVectorEngine } from './hooks/useVectorEngine';      
import { useCanvasEvents } from './hooks/useCanvasEvents';   
import { useVectorMath } from './hooks/useVectorMath';   
import { useStudioActions } from './hooks/useStudioActions'; 
import { useToolEngine } from './hooks/useToolEngine'; 
import { useBooleanEngine } from './hooks/useBooleanEngine';
import { LeftDock } from './components/LeftDock';
import { RightInspector } from './components/RightInspector';
import { CropModal } from './components/CropModal';
import { ContourModal } from './components/ContourModal';
import { OrderModal } from './components/OrderModal';
import { ApparelMockupViewer, type ProductPlacement } from './components/ApparelMockupViewer';
import { PRODUCT_CATALOG, PRODUCT_IDS, type ProductId } from './three/productCatalog';
import { snapshotDesignAsDataURL } from './utils/designSnapshot';

type AppTool = 'select' | 'draw' | 'track-line' | 'wand' | 'bucket' | 'eraser';
type ViewMode = 'sticker' | 'product';

export default function App() {
  const { canvasRef, containerRef, canvas } = useCanvasEngine();
  useAlignmentEngine(canvas);
  const { traceImage } = useVectorEngine();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const matOverlayRef = useRef<HTMLDivElement>(null); 
  const isProcessingRef = useRef<boolean>(false);
  
  const [tool, setTool] = useState<AppTool>('select');
  const [activeTab, setActiveTab] = useState<'design' | 'layers'>('design');
  const [showRightPanel, setShowRightPanel] = useState<boolean>(true);
  const [showLeftPanel, setShowLeftPanel] = useState<boolean>(true);
  const [isMobileLayout, setIsMobileLayout] = useState<boolean>(false);
   
  const [activeObj, setActiveObj] = useState<fabric.Object | null>(null);
  const [brushColor, setBrushColor] = useState<string>('#FF1493'); 
  const [brushSize, setBrushSize] = useState<number>(5);
  const [brushType, setBrushType] = useState<'round' | 'chisel'>('round');
  const [opacity, setOpacity] = useState<number>(100);
  
  const [wandTolerance, setWandTolerance] = useState<number>(0.1);
  const [wandMode, setWandMode] = useState<'erase' | 'extract'>('erase');
  const [eraserMode, setEraserMode] = useState<'layer' | 'canvas'>('layer');
  
  const [textCurve, setTextCurve] = useState<number>(0);
  
  // Reverted to strict numbers to satisfy RightInspector prop types
  const [charSpacing, setCharSpacing] = useState<number>(0);
  const [lineHeight, setLineHeight] = useState<number>(1.16);
  const [offsetSize, setOffsetSize] = useState<number>(10);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTracing, setIsTracing] = useState(false);
  const [canvasObjects, setCanvasObjects] = useState<fabric.Object[]>([]);
  const [quickMenu, setQuickMenu] = useState<{ top: number, left: number, show: boolean } | null>(null);
  
  const [pendingCropImage, setPendingCropImage] = useState<string | null>(null);
  const [showOffsetConfig, setShowOffsetConfig] = useState<boolean>(false);
  const [contourTarget, setContourTarget] = useState<fabric.Path | null>(null);
  
  const [activeOrderTab, setActiveOrderTab] = useState<'vinyl' | 'apparel' | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('sticker');
  const [selectedProduct, setSelectedProduct] = useState<ProductId>('hoodie');
  const [productColor, setProductColor] = useState<string>(PRODUCT_CATALOG.hoodie.colorOptions[0]);
  const [activeProductView, setActiveProductView] = useState<string>('front');
  const [productPlacement, setProductPlacement] = useState<ProductPlacement>({ posX: 0, posY: 0, scale: 1, rotationDeg: 0 });
  const [designSnapshot, setDesignSnapshot] = useState<string | null>(null);

  const handleSelectProduct = (id: ProductId) => {
    setSelectedProduct(id);
    setProductColor(PRODUCT_CATALOG[id].colorOptions[0]);
    setActiveProductView(PRODUCT_CATALOG[id].views[0].id);
    setProductPlacement({ posX: 0, posY: 0, scale: 1, rotationDeg: 0 });
  };

  const applyDesignToProduct = useCallback(() => {
    if (!canvas) return;
    setDesignSnapshot(snapshotDesignAsDataURL(canvas));
  }, [canvas]);

  const { saveHistorySnapshot, handleUndo, handleRedo } = useHistoryEngine({ setCanvasObjects });
  const clipboard = useRef<fabric.Object | null>(null);

  const { performBoolean } = useBooleanEngine(canvas, saveHistorySnapshot);
  const { handleVectorTrace: traceCore, handleCreateOffset: offsetCore } = useVectorMath({ canvas, isProcessingRef, setIsTracing, traceImage, saveHistorySnapshot });
  const handleVectorTrace = () => traceCore(activeObj);
  const handleCreateOffset = () => offsetCore(activeObj, offsetSize);

  const { alignObject, applyTextCurve, explodeText, addText, addShape, handleAIGeneration, addWeedingBox } = useStudioActions({
    canvas, activeObj, brushColor, setTool, setIsGenerating, setTextCurve, saveHistorySnapshot
  });

  const handleSafeSVGExport = useCallback(() => {
    if (!canvas) return;
    try {
        const svgString = canvas.toSVG({
            suppressPreamble: false,
            width: String(canvas.width),
            height: String(canvas.height)
        });
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'west-vinyl-co-design.svg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("SVG Pipeline Error:", err);
        alert("SVG Export failed. If you have uploaded complex raster images, ensure they are traced to vectors first.");
    }
  }, [canvas]);

  const handleInterceptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (f) => { if (f.target?.result) setPendingCropImage(f.target.result as string); };
      reader.readAsDataURL(file);
      e.target.value = ''; 
  };

  const handleConfirmCrop = async (base64: string, asVector: boolean, smoothness: number) => {
      setPendingCropImage(null);
      if (!canvas) return;
      
      const img = new Image();
      img.onload = async () => {
          if (asVector) {
              isProcessingRef.current = true;
              setIsTracing(true);
              try {
                  const tCan = document.createElement('canvas');
                  tCan.width = img.naturalWidth; tCan.height = img.naturalHeight;
                  const tCtx = tCan.getContext('2d', { willReadFrequently: true });
                  if (tCtx) {
                      tCtx.drawImage(img, 0, 0);
                      const rawImgData = tCtx.getImageData(0, 0, tCan.width, tCan.height);
                      
                      const svgString = await traceImage(rawImgData, smoothness);
                      const result = await (fabric as any).loadSVGFromString(svgString);
                      const wrapper = (fabric as any).util.groupSVGElements(result.objects || result, result.options || {});

                      const maxDim = 800;
                      let scale = 1;
                      if (wrapper.width > maxDim || wrapper.height > maxDim) {
                          scale = Math.min(maxDim / wrapper.width, maxDim / wrapper.height);
                      }

                      wrapper.set({ left: 600, top: 600, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale });

                      const paths = wrapper.type === 'group' ? wrapper.getObjects() : [wrapper];
                      paths.forEach((p: any) => { p.set({ fill: brushColor, stroke: '', strokeWidth: 0, objectCaching: true }); });

                      canvas.add(wrapper); canvas.setActiveObject(wrapper); canvas.requestRenderAll(); saveHistorySnapshot(canvas, true);
                  }
              } catch (err) { console.error("Direct Trace Failed:", err); } 
              finally { isProcessingRef.current = false; setIsTracing(false); }
          } else {
              const fImg = new (fabric as any).Image(img);
              const maxDim = 800; let scale = 1;
              if (fImg.width > maxDim || fImg.height > maxDim) scale = Math.min(maxDim / fImg.width, maxDim / fImg.height);
              fImg.set({ left: 600, top: 600, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale, objectCaching: true });
              canvas.add(fImg); canvas.setActiveObject(fImg); canvas.requestRenderAll(); saveHistorySnapshot(canvas, true);
          }
      };
      img.src = base64;
  };

  const handleTraceCanvasImage = async () => {
      if (!canvas || !activeObj || activeObj.type !== 'image') return;
      isProcessingRef.current = true;
      setIsTracing(true);
      setQuickMenu(null);
      try {
          const img = activeObj as fabric.Image;
          const htmlImg = img.getElement() as HTMLImageElement;
          const tCan = document.createElement('canvas');
          tCan.width = htmlImg.naturalWidth || htmlImg.width;
          tCan.height = htmlImg.naturalHeight || htmlImg.height;
          const tCtx = tCan.getContext('2d', { willReadFrequently: true });
          
          if (tCtx) {
              tCtx.drawImage(htmlImg, 0, 0);
              const rawImgData = tCtx.getImageData(0, 0, tCan.width, tCan.height);
              
              const svgString = await traceImage(rawImgData, 5);
              const result = await (fabric as any).loadSVGFromString(svgString);
              const wrapper = (fabric as any).util.groupSVGElements(result.objects || result, result.options || {});
              
              wrapper.set({
                  left: img.left, top: img.top, originX: img.originX, originY: img.originY,
                  scaleX: img.scaleX, scaleY: img.scaleY, angle: img.angle
              });
              
              const paths = wrapper.type === 'group' ? wrapper.getObjects() : [wrapper];
              paths.forEach((p: any) => { p.set({ fill: brushColor, stroke: '', strokeWidth: 0, objectCaching: true }); });
              
              canvas.remove(img); canvas.add(wrapper); canvas.setActiveObject(wrapper); canvas.requestRenderAll(); saveHistorySnapshot(canvas, true);
          }
      } catch (err) { console.error("In-Canvas Trace Failed:", err); }
      finally { isProcessingRef.current = false; setIsTracing(false); }
  };

  const handleApplyContour = (newPathString: string | null) => {
      if (!canvas || !contourTarget) return;
      if (!newPathString) { canvas.remove(contourTarget); } 
      else {
          const newPath = new (fabric as any).Path(newPathString, {
              left: contourTarget.left, top: contourTarget.top,
              originX: contourTarget.originX, originY: contourTarget.originY,
              scaleX: contourTarget.scaleX, scaleY: contourTarget.scaleY,
              angle: contourTarget.angle, fill: contourTarget.fill,
              stroke: contourTarget.stroke, strokeWidth: contourTarget.strokeWidth, objectCaching: true
          });
          canvas.remove(contourTarget); canvas.add(newPath); canvas.setActiveObject(newPath);
      }
      canvas.requestRenderAll(); saveHistorySnapshot(canvas, true); setContourTarget(null); setQuickMenu(null);
  };

  const updateUIFromSelection = useCallback(() => {
    if (!canvas || isProcessingRef.current) return;
    setShowOffsetConfig(false); 
    const actives = canvas.getActiveObjects();
    setActiveObj(actives.length === 1 ? actives[0] : null);
    
    if (actives.length > 0) {
      let targetForColor: any = actives[0];
      if (targetForColor.type === 'group' || targetForColor.type === 'activeSelection' || targetForColor._objects) {
          const children = targetForColor._objects || (typeof targetForColor.getObjects === 'function' ? targetForColor.getObjects() : []);
          if (children.length > 0) targetForColor = children[0];
      }
      const strokeValue = targetForColor.stroke;
      const fillValue = targetForColor.fill; 
      if (fillValue && typeof fillValue === 'string' && fillValue !== 'transparent' && fillValue !== 'none' && !fillValue.includes('0.01')) setBrushColor(fillValue); 
      else if (strokeValue && typeof strokeValue === 'string' && strokeValue !== 'transparent' && strokeValue !== 'none') setBrushColor(strokeValue);
      setOpacity(Math.round(((actives[0].opacity ?? 1)) * 100)); 
      if (showRightPanel) setActiveTab('design'); 
    }
    setCanvasObjects([...canvas.getObjects()]);
  }, [canvas, showRightPanel]);

  const handlePropChange = (key: string, val: unknown) => {
    if (!canvas) return;
    const actives = canvas.getActiveObjects();
    if (!actives || actives.length === 0) return;
    if (key === 'fill' || key === 'stroke') {
        const hexColor = val as string;
        const applyColor = (target: any) => {
            if (target.type === 'group' || target.type === 'activeSelection' || target._objects) {
                target.set({ fill: 'transparent', stroke: 'transparent', dirty: true }); 
                const children = target._objects || (typeof target.getObjects === 'function' ? target.getObjects() : []);
                children.forEach((child: any) => applyColor(child));
            } else {
                if ((target.type === 'polyline' || target.type === 'line' || target.type === 'path') && (!target.fill || target.fill === 'transparent' || target.fill === 'none' || target.fill.toString().includes('0.01'))) target.set({ stroke: hexColor, dirty: true });
                else { target.set({ fill: hexColor }); if ((target.strokeWidth && target.strokeWidth > 0) || (target.stroke && target.stroke !== 'transparent' && target.stroke !== 'none')) target.set({ stroke: hexColor, strokeUniform: true }); target.set({ dirty: true }); }
            }
        };
        actives.forEach(obj => applyColor(obj)); setBrushColor(hexColor);
    } else { actives.forEach(obj => { obj.set({ [key]: val } as Record<string, unknown>); obj.set({ dirty: true }); }); if (key === 'opacity' && typeof val === 'number') setOpacity(val * 100); }
    canvas.requestRenderAll(); saveHistorySnapshot(canvas);
  };

  useCanvasEvents({ canvas, matOverlayRef, isProcessingRef, tool, brushColor, brushSize, brushType, wandTolerance, wandMode, eraserMode, setIsTracing, setQuickMenu, updateUIFromSelection, saveHistorySnapshot, traceImage, setTool });
  useToolEngine({ canvas, tool, brushColor, brushSize, brushType, setQuickMenu });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const updateLayout = () => setIsMobileLayout(mediaQuery.matches);
    updateLayout();
    mediaQuery.addEventListener?.('change', updateLayout);
    return () => mediaQuery.removeEventListener?.('change', updateLayout);
  }, []);
 
  const deleteSelected = useCallback(() => {
    if (!canvas || isProcessingRef.current) return; 
    const actives = canvas.getActiveObjects();
    if (actives.length > 0) { actives.forEach(obj => canvas.remove(obj)); canvas.discardActiveObject(); canvas.requestRenderAll(); saveHistorySnapshot(canvas, true); setQuickMenu(null); }
  }, [canvas, saveHistorySnapshot]);

  const duplicateSelected = useCallback(async () => {
    if (!canvas || isProcessingRef.current) return; 
    const actives = canvas.getActiveObjects(); if (actives.length === 0) return;
    isProcessingRef.current = true;
    try {
        const activeObj = actives.length === 1 ? actives[0] : canvas.getActiveObject();
        if (!activeObj) return;
        const clonedObj = await (activeObj as fabric.Object).clone();
        canvas.discardActiveObject(); 
        clonedObj.set({ left: clonedObj.left + 20, top: clonedObj.top + 20, evented: true, objectCaching: true });
        if (clonedObj.type === 'activeSelection') { const activeSelection = clonedObj as fabric.ActiveSelection; activeSelection.canvas = canvas; activeSelection.forEachObject((obj: fabric.Object) => canvas.add(obj)); activeSelection.setCoords(); } else canvas.add(clonedObj);
        canvas.setActiveObject(clonedObj); canvas.requestRenderAll(); saveHistorySnapshot(canvas, true); 
    } catch (err) { console.error("Duplicate Failed:", err); } finally { isProcessingRef.current = false; setQuickMenu(null); }
  }, [canvas, saveHistorySnapshot]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (isProcessingRef.current || document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) handleRedo(canvas); else handleUndo(canvas); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); handleRedo(canvas); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); const activeObject = canvas?.getActiveObject(); if (activeObject) clipboard.current = await activeObject.clone(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault(); 
        if (canvas && clipboard.current) {
          isProcessingRef.current = true;
          try {
              const cl = await clipboard.current.clone(); canvas.discardActiveObject(); 
              cl.set({ left: cl.left + 20, top: cl.top + 20, evented: true, objectCaching: true });
              if (cl.type === 'activeSelection') { const activeSelection = cl as fabric.ActiveSelection; activeSelection.canvas = canvas; activeSelection.forEachObject((o: fabric.Object) => canvas.add(o)); activeSelection.setCoords(); } else canvas.add(cl);
              if (clipboard.current) { clipboard.current.top += 20; clipboard.current.left += 20; }
              canvas.setActiveObject(cl); canvas.requestRenderAll(); saveHistorySnapshot(canvas, true);
          } catch(err) { console.error('Paste failed:', err); } finally { isProcessingRef.current = false; }
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
    };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, canvas, saveHistorySnapshot, deleteSelected]);

  return (
    <div className="fixed inset-0 flex flex-col font-sans select-none overflow-hidden bg-[#0f111a] text-slate-200">
        <header className="h-14 border-b border-slate-800 bg-[#181a25] flex items-center justify-between px-4 z-20 shrink-0 shadow-sm">
            <div className="flex items-center gap-4">
              <span className="font-black tracking-widest uppercase text-sm">West Vinyl Studio</span>
              <div className="h-5 w-px bg-slate-800 mx-1"></div>
              <div className="flex items-center gap-1 bg-slate-500/5 rounded-lg p-1">
                <button onClick={() => handleUndo(canvas)} className="p-1.5 rounded-md transition-colors hover:bg-slate-700/50 text-slate-300" title="Undo (Ctrl+Z)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg></button>
                <button onClick={() => handleRedo(canvas)} className="p-1.5 rounded-md transition-colors hover:bg-slate-700/50 text-slate-300" title="Redo (Ctrl+Y)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg></button>
                <div className="h-4 w-px bg-slate-800 mx-1"></div>
                <button onClick={() => {if(canvas){ canvas.clear(); saveHistorySnapshot(canvas, true);}}} className="p-1.5 rounded-md transition-colors hover:bg-red-500/10 hover:text-red-500 text-slate-400" title="Clear Mat"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button disabled={isGenerating} onClick={handleAIGeneration} className="flex items-center gap-2 bg-[#181a25] border border-slate-700 text-white px-3 py-1.5 rounded-md text-[10px] font-bold hover:bg-slate-800 transition-colors uppercase tracking-wider h-8">{isGenerating ? 'Generating...' : 'Generate AI'}</button>
              <button onClick={handleSafeSVGExport} className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-md text-[10px] font-bold transition-colors uppercase tracking-wider h-8">Export SVG</button>

              <div className="w-px h-5 bg-slate-700 mx-1"></div>

              <div className="flex items-center gap-1 bg-slate-500/5 rounded-lg p-1">
                <button onClick={() => setViewMode('sticker')} className={`h-6 px-2 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${viewMode === 'sticker' ? 'bg-[#FF1493] text-white' : 'text-slate-400 hover:text-slate-200'}`}>2D Studio</button>
                <button
                  type="button"
                  onClick={() => { setViewMode('product'); applyDesignToProduct(); }}
                  className={`h-6 px-2 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${viewMode === 'product' ? 'bg-[#FF1493] text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Product Review
                </button>
              </div>

              <div className="w-px h-5 bg-slate-700 mx-1"></div>
              
              <button onClick={() => setActiveOrderTab('vinyl')} className="h-8 px-3 flex items-center justify-center bg-[#FF1493] hover:bg-[#ff4da6] text-white rounded text-[10px] font-black tracking-wider uppercase transition-colors shadow-sm whitespace-nowrap">
                  Buy Sticker
              </button>
              <button onClick={() => setActiveOrderTab('apparel')} className="h-8 px-3 flex items-center justify-center bg-emerald-500 hover:bg-emerald-400 text-white rounded text-[10px] font-black tracking-wider uppercase transition-colors shadow-sm whitespace-nowrap">
                  Buy Apparel
              </button>

              <div className="w-px h-5 bg-slate-700 mx-1"></div>
              <button type="button" onClick={(e) => { e.stopPropagation(); setShowRightPanel((prev) => !prev); }} className={`p-1.5 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-slate-700/50 touch-manipulation ${!showRightPanel ? 'text-[#FF1493] bg-[#FF1493]/10' : 'text-slate-400'}`} title="Toggle Inspector Panel"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg></button>
            </div>
        </header>
        {!showLeftPanel && (
          <button
            type="button"
            onClick={() => setShowLeftPanel(true)}
            className="fixed top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-[#181a25]/95 text-slate-300 shadow-lg shadow-black/30 transition-transform hover:scale-110 hover:text-white hover:bg-slate-700 touch-manipulation pointer-events-auto"
            aria-label="Open sidebar"
            title="Toggle Sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
          </button>
        )}
        <div className="flex-1 flex overflow-hidden">
            {showLeftPanel && (
              <LeftDock tool={tool} setTool={setTool as any} addText={addText} addShape={addShape} fileInputRef={fileInputRef} handleImageUpload={handleInterceptUpload} borderCol="border-slate-800" bgPanel="bg-[#181a25]" setShowLeftPanel={setShowLeftPanel} />
            )}
            <main className="flex-1 relative min-w-0 touch-manipulation" ref={containerRef}>
                <canvas ref={canvasRef} style={viewMode === 'product' ? { visibility: 'hidden', position: 'absolute' } : undefined} />

                {viewMode === 'product' && (
                  <div className="absolute inset-0 flex flex-col bg-[#0f111a]">
                    <div className="flex-1 min-h-0">
                      <ApparelMockupViewer
                        productId={selectedProduct}
                        color={productColor}
                        activeView={activeProductView}
                        designDataUrl={designSnapshot}
                        placement={productPlacement}
                      />
                    </div>
                    <div className="shrink-0 border-t border-slate-800 bg-[#181a25] p-3 flex flex-wrap items-center gap-3">
                      <select value={selectedProduct} onChange={(e) => handleSelectProduct(e.target.value as ProductId)} className="bg-slate-800 text-slate-200 text-xs font-mono border border-slate-700 rounded px-2 py-1">
                        {PRODUCT_IDS.map((id) => (
                          <option key={id} value={id}>{PRODUCT_CATALOG[id].label}</option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1">
                        {PRODUCT_CATALOG[selectedProduct].colorOptions.map((c) => (
                          <button key={c} onClick={() => setProductColor(c)} className={`w-5 h-5 rounded-full border-2 ${productColor === c ? 'border-[#FF1493]' : 'border-slate-700'}`} style={{ backgroundColor: c }} title={c} />
                        ))}
                      </div>

                      <div className="flex items-center gap-1">
                        {PRODUCT_CATALOG[selectedProduct].views.map((v) => (
                          <button key={v.id} onClick={() => setActiveProductView(v.id)} className={`px-2 py-1 rounded text-[10px] font-mono uppercase ${activeProductView === v.id ? 'bg-[#FF1493] text-white' : 'bg-slate-800 text-slate-400'}`}>{v.label}</button>
                        ))}
                      </div>

                      <label className="flex items-center gap-1 text-[10px] font-mono text-slate-400">X
                        <input type="range" min={-50} max={50} value={productPlacement.posX} onChange={(e) => setProductPlacement((p) => ({ ...p, posX: Number(e.target.value) }))} className="w-16" />
                      </label>
                      <label className="flex items-center gap-1 text-[10px] font-mono text-slate-400">Y
                        <input type="range" min={-50} max={50} value={productPlacement.posY} onChange={(e) => setProductPlacement((p) => ({ ...p, posY: Number(e.target.value) }))} className="w-16" />
                      </label>
                      <label className="flex items-center gap-1 text-[10px] font-mono text-slate-400">Scale
                        <input type="range" min={0.2} max={2} step={0.05} value={productPlacement.scale} onChange={(e) => setProductPlacement((p) => ({ ...p, scale: Number(e.target.value) }))} className="w-16" />
                      </label>
                      <label className="flex items-center gap-1 text-[10px] font-mono text-slate-400">Rotate
                        <input type="range" min={-180} max={180} value={productPlacement.rotationDeg} onChange={(e) => setProductPlacement((p) => ({ ...p, rotationDeg: Number(e.target.value) }))} className="w-16" />
                      </label>

                      <button onClick={applyDesignToProduct} className="ml-auto h-7 px-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded text-[10px] font-black uppercase tracking-wider">Apply Design</button>
                    </div>
                  </div>
                )}

                {quickMenu && quickMenu.show && !contourTarget && viewMode === 'sticker' && (
                  <div className="absolute z-20 flex items-center gap-1 p-1.5 rounded-xl shadow-2xl bg-[#1e2230]/90 border border-slate-700 transform -translate-x-1/2 transition-opacity" style={{ top: quickMenu.top, left: quickMenu.left }}>
                    
                    {showOffsetConfig ? (
                        <div className="flex items-center gap-2 px-2 py-1">
                            <span className="text-[10px] font-bold text-[#FF1493] uppercase tracking-wider">Offset</span>
                            <input type="range" min="1" max="100" value={offsetSize} onChange={(e) => setOffsetSize(Number(e.target.value))} className="w-24 accent-[#FF1493]" />
                            <span className="text-xs w-6 text-center font-mono">{offsetSize}</span>
                            <div className="w-px h-5 mx-1 bg-slate-700"></div>
                            <button onClick={() => { handleCreateOffset(); setShowOffsetConfig(false); setQuickMenu(null); }} className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-emerald-500 transition-colors" title="Apply Offset"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg></button>
                            <button onClick={() => setShowOffsetConfig(false)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-500 transition-colors" title="Cancel"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
                        </div>
                    ) : (
                        <>
                            <button onClick={duplicateSelected} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300" title="Duplicate (Ctrl+C, Ctrl+V)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                            
                            {activeObj?.type === 'image' && (
                                <button onClick={handleTraceCanvasImage} className="p-1.5 rounded-lg hover:bg-[#FF1493]/20 text-[#FF1493] transition-colors" title="Trace Image to Vector"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
                            )}

                            {activeObj?.type === 'path' && (
                                <button onClick={() => { setContourTarget(activeObj as fabric.Path); setQuickMenu(null); }} className="p-1.5 rounded-lg hover:bg-[#FF1493]/20 text-[#FF1493] transition-colors" title="Contour (Hide Internal Cuts)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" strokeDasharray="2 2" /></svg></button>
                            )}

                            <div className="w-px h-5 mx-1 bg-slate-700"></div>
                            
                            <button onClick={() => setShowOffsetConfig(true)} className="p-1.5 rounded-lg hover:bg-amber-500/20 text-amber-500 transition-colors" title="Create Offset Outline"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v16H4z" strokeDasharray="2 2" /><path d="M8 8h8v8H8z" fill="currentColor" opacity="0.5" /></svg></button>
                            <button onClick={() => { addWeedingBox(); setQuickMenu(null); }} className="p-1.5 rounded-lg hover:bg-[#00FFFF]/20 text-[#00FFFF] transition-colors" title="Add Weeding Box"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeDasharray="3 3"/><path d="M9 9h6v6H9z" fill="currentColor" stroke="none" opacity="0.5"/></svg></button>
                            
                            {(canvas?.getActiveObjects()?.length || 0) > 1 && activeObj?.type !== 'group' && (
                              <button onClick={() => { const sel = canvas?.getActiveObject() as fabric.ActiveSelection | null; if (sel && sel.type === 'activeSelection') { const group = (sel as any).toGroup(); canvas?.setActiveObject(group); canvas?.requestRenderAll(); saveHistorySnapshot(canvas!, true); setQuickMenu(null); } }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300" title="Group Objects"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg></button>
                            )}
                            {activeObj?.type === 'group' && (
                              <button onClick={() => { const group = canvas?.getActiveObject() as fabric.Group | null; if (group && group.type === 'group') { const sel = (group as any).toActiveSelection(); canvas?.setActiveObject(sel); canvas?.requestRenderAll(); saveHistorySnapshot(canvas!, true); setQuickMenu(null); } }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300" title="Ungroup"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3z"/></svg></button>
                            )}
                            {((canvas?.getActiveObjects()?.length || 0) > 1 || activeObj?.type === 'group') && (
                              <>
                                <div className="w-px h-5 mx-1 bg-slate-700"></div>
                                <button onClick={() => { performBoolean('weld'); setQuickMenu(null); }} className="p-1.5 rounded-lg hover:bg-[#FF1493]/20 text-[#FF1493] transition-colors" title="Weld (Merge Solid)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></button>
                              </>
                            )}
                            <div className="w-px h-5 mx-1 bg-slate-700"></div>
                            <button onClick={() => { if(canvas && activeObj){ const orderedCanvas = canvas as unknown as { bringObjectForward?: (obj: fabric.Object) => void }; orderedCanvas.bringObjectForward?.(activeObj); saveHistorySnapshot(canvas, true); } }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300" title="Bring Forward"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6"/></svg></button>
                            <button onClick={() => { if(canvas && activeObj){ const orderedCanvas = canvas as unknown as { sendObjectBackwards?: (obj: fabric.Object) => void }; orderedCanvas.sendObjectBackwards?.(activeObj); saveHistorySnapshot(canvas, true); } }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300" title="Send Backward"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg></button>
                            <div className="w-px h-5 mx-1 bg-slate-700"></div>
                            <button onClick={deleteSelected} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-500" title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                        </>
                    )}
                  </div>
                )}
            </main>
            {isMobileLayout ? (
              <>
                <div className={`fixed inset-0 z-30 bg-slate-950/55 backdrop-blur-[2px] transition-opacity duration-200 ${showRightPanel ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={() => setShowRightPanel(false)} />
                <div className={`fixed inset-y-0 right-0 z-40 w-[min(92vw,320px)] h-full transform transition-transform duration-200 ease-out ${showRightPanel ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'}`}>
                  <div className="h-full w-full" onClick={(e) => e.stopPropagation()}>
                    {showRightPanel && (
                      <RightInspector
                        canvas={canvas} activeTab={activeTab} setActiveTab={setActiveTab} activeObj={activeObj} canvasObjects={canvasObjects} tool={tool} setTool={setTool as any}
                        brushColor={brushColor} setBrushColor={setBrushColor} brushSize={brushSize} setBrushSize={setBrushSize} brushType={brushType} setBrushType={setBrushType}
                        opacity={opacity} wandTolerance={wandTolerance} setWandTolerance={setWandTolerance} wandMode={wandMode} setWandMode={setWandMode} 
                        eraserMode={eraserMode} setEraserMode={setEraserMode} 
                        textCurve={textCurve} charSpacing={charSpacing} setCharSpacing={setCharSpacing}
                        lineHeight={lineHeight} setLineHeight={setLineHeight} isTracing={isTracing} offsetSize={offsetSize} setOffsetSize={setOffsetSize} handleCreateOffset={handleCreateOffset}
                        performBoolean={performBoolean} handlePropChange={handlePropChange} alignObject={alignObject} applyTextCurve={applyTextCurve} explodeText={explodeText} handleVectorTrace={handleVectorTrace} 
                        saveHistorySnapshot={saveHistorySnapshot} borderCol="border-slate-800" bgPanel="bg-[#181a25]" isDark={true} textMuted="text-slate-400" textMain="text-slate-200" btnHover="hover:bg-slate-700/50"
                      />
                    )}
                  </div>
                </div>
                {!showRightPanel && (
                  <button type="button" onClick={() => setShowRightPanel(true)} className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-[#181a25]/95 text-[#FF1493] shadow-lg shadow-black/30 transition-transform hover:scale-105 touch-manipulation" aria-label="Open inspector">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                  </button>
                )}
              </>
            ) : showRightPanel ? (
              <RightInspector
                canvas={canvas} activeTab={activeTab} setActiveTab={setActiveTab} activeObj={activeObj} canvasObjects={canvasObjects} tool={tool} setTool={setTool as any}
                brushColor={brushColor} setBrushColor={setBrushColor} brushSize={brushSize} setBrushSize={setBrushSize} brushType={brushType} setBrushType={setBrushType}
                opacity={opacity} wandTolerance={wandTolerance} setWandTolerance={setWandTolerance} wandMode={wandMode} setWandMode={setWandMode} 
                eraserMode={eraserMode} setEraserMode={setEraserMode} 
                textCurve={textCurve} charSpacing={charSpacing} setCharSpacing={setCharSpacing}
                lineHeight={lineHeight} setLineHeight={setLineHeight} isTracing={isTracing} offsetSize={offsetSize} setOffsetSize={setOffsetSize} handleCreateOffset={handleCreateOffset}
                performBoolean={performBoolean} handlePropChange={handlePropChange} alignObject={alignObject} applyTextCurve={applyTextCurve} explodeText={explodeText} handleVectorTrace={handleVectorTrace} 
                saveHistorySnapshot={saveHistorySnapshot} borderCol="border-slate-800" bgPanel="bg-[#181a25]" isDark={true} textMuted="text-slate-400" textMain="text-slate-200" btnHover="hover:bg-slate-700/50"
              />
            ) : null}
        </div>
        
        {pendingCropImage && (
            <CropModal imageUrl={pendingCropImage} onCrop={handleConfirmCrop} onCancel={() => setPendingCropImage(null)} />
        )}

        {contourTarget && (
            <ContourModal targetPath={contourTarget} onConfirm={handleApplyContour} onCancel={() => setContourTarget(null)} />
        )}

        {/* --- INJECTED ROUTED STOREFRONT MODAL --- */}
        {activeOrderTab && canvas && (
            <OrderModal canvas={canvas} initialTab={activeOrderTab} onClose={() => setActiveOrderTab(null)} />
        )}
    </div>
  );
}