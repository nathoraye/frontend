/* eslint-disable @typescript-eslint/no-explicit-any */
import { registerCanvasCustomProperties } from './utils/canvasSerialize';
import * as fabric from 'fabric'; 
import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useCanvasEngine } from './hooks/useCanvasEngine';
import { useHistoryEngine } from './hooks/useHistoryEngine';
import { useAlignmentEngine } from './hooks/useAlignmentEngine'; 
import { useVectorEngine } from './hooks/useVectorEngine';      
import { useCanvasEvents, type TrackLineApi } from './hooks/useCanvasEvents';   
import { useVectorMath } from './hooks/useVectorMath';   
import { useStudioActions } from './hooks/useStudioActions'; 
import { useToolEngine } from './hooks/useToolEngine'; 
import { useBooleanEngine } from './hooks/useBooleanEngine';
import { useNodeEditEngine } from './hooks/useNodeEditEngine';
import { groupActiveSelection, isUngroupable, ungroupOnce } from './utils/groupOps';
import { AiArtworkPanel } from './components/AiArtworkPanel';
import { LeftDock } from './components/LeftDock';
import { RightInspector } from './components/RightInspector';
import { CropModal } from './components/CropModal';
import { ContourModal } from './components/ContourModal';
import { TracePreviewModal } from './components/TracePreviewModal';
import { PhoneStudioMenu } from './components/PhoneStudioMenu';
import { StudioNoticeHost } from './components/StudioNoticeHost';
import { StudioTour } from './components/StudioTour';
import { CutReadyBadge } from './components/CutReadyPanel';
import { inspectObjectsForCut } from './utils/cutReady';
import { notifyStudio } from './utils/studioNotice';
import { clearSavedCanvas } from './utils/canvasStore';
import { useCanvasAutosave } from './hooks/useCanvasAutosave';
import { PLACEMENT_SCALE_MAX, PLACEMENT_SCALE_MIN, type ProductPlacement } from './utils/apparelPlacement';
import {
  APPAREL_SIZES,
  isSizedProduct,
  PRODUCT_CATALOG,
  PRODUCT_IDS,
  type ProductId,
} from './three/productCatalog';
import { snapshotDesignAsDataURL } from './utils/designSnapshot';
import { productTypeFromCatalog, type ShippingOption } from './lib/pricing';
import { chargedTotal, moneyString, quoteOrder } from './utils/orderPricing';
import {
  CHEST_LOGO_CM,
  formatPrintCm,
  maxPrintCm,
  MEDIUM_PRINT_CM,
  printSizeCm,
  scaleForLongestSide,
  clampStickerSize,
} from './utils/printSize';
import { tracedSvgToObject } from './utils/placeTracedSvg';
import { rasterToImageData, yieldToPaint } from './utils/tracePrep';
import { imageDataToPngDataUrl } from './utils/imageDataPng';
import { trackViewItem } from './analytics/track';
import {
  AiArtworkError,
  fetchAiQuota,
  readLocalAiQuota,
  requestAiArtwork,
  writeLocalAiQuota,
  type AiQuota,
} from './utils/aiArtwork';
import { TOUR_STEPS, isTourDismissed, markTourDismissed } from './utils/studioTour';

type AppTool = 'select' | 'draw' | 'track-line' | 'wand' | 'bucket' | 'eraser';
type ViewMode = 'sticker' | 'decal' | 'product';

const CANVAS_BG = '#2a2e3c';
const BTN =
  'inline-flex h-10 shrink-0 items-center justify-center rounded-md px-3.5 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40';
const BTN_PRIMARY = `${BTN} bg-[#FF1493] text-black hover:bg-[#d41270]`;
const BTN_APPAREL = `${BTN} bg-[#10b981] text-black hover:bg-[#047857]`;
const BTN_SECONDARY = `${BTN} border border-slate-600 bg-transparent text-slate-100 hover:bg-slate-800`;
const BTN_QUIET = `${BTN} text-slate-300 hover:bg-slate-800 hover:text-white`;

const OrderModal = lazy(() => import('./components/OrderModal'));
const ApparelMockupViewer = lazy(() => import('./components/ApparelMockupViewer').then(module => ({ default: module.ApparelMockupViewer })));

registerCanvasCustomProperties();

export default function App() {
  const { canvasRef, containerRef, canvas } = useCanvasEngine();
  useAlignmentEngine(canvas);
  const { traceImage } = useVectorEngine(canvas);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const matOverlayRef = useRef<HTMLDivElement>(null); 
  const isProcessingRef = useRef<boolean>(false);
  const quickMenuRef = useRef<HTMLDivElement>(null);
  const eraserTargetRef = useRef<fabric.Object | null>(null);
  
  const [tool, setTool] = useState<AppTool>('select');
  const [activeTab, setActiveTab] = useState<'design' | 'layers'>('design');
  const [showRightPanel, setShowRightPanel] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : !window.matchMedia('(max-width: 1023px)').matches
  );
  const trackLineApiRef = useRef<TrackLineApi | null>(null);
  const [showLeftPanel, setShowLeftPanel] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : !window.matchMedia('(max-width: 1023px)').matches
  );
  const [isMobileLayout, setIsMobileLayout] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(max-width: 1023px)').matches
  );
  const [isPhoneLayout, setIsPhoneLayout] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(max-width: 639px)').matches
  );
  const [tourOpen, setTourOpen] = useState(() => typeof window !== 'undefined' && !isTourDismissed());
  const [tourStep, setTourStep] = useState(0);
  const [toolBeforeTour, setToolBeforeTour] = useState<AppTool | null>(() =>
    typeof window !== 'undefined' && !isTourDismissed() ? 'select' : null,
  );
  const tourReplayRef = useRef<HTMLButtonElement>(null);
  const tourOpenRef = useRef(tourOpen);
   
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
  const [aiQuota, setAiQuota] = useState<AiQuota>(() => readLocalAiQuota());
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSession, setAiSession] = useState<{
    id: number;
    mode: 'create' | 'edit';
    prompt: string;
    target: fabric.Object | null;
  } | null>(null);
  const aiSessionSeq = useRef(0);
  const [isTracing, setIsTracing] = useState(false);
  const [canvasObjects, setCanvasObjects] = useState<fabric.Object[]>([]);
  const [quickMenu, setQuickMenu] = useState<{ top: number, left: number, show: boolean } | null>(null);
  
  const [pendingCropImage, setPendingCropImage] = useState<string | null>(null);
  const [pendingTrace, setPendingTrace] = useState<{
    imageData: ImageData;
    dataUrl: string;
    source?: fabric.Object;
    mode?: 'cutout' | 'stacked';
  } | null>(null);
  const [showOffsetConfig, setShowOffsetConfig] = useState<boolean>(false);
  const [contourTarget, setContourTarget] = useState<fabric.Path | null>(null);
  
  const [activeOrderTab, setActiveOrderTab] = useState<'vinyl' | 'apparel' | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('sticker');
  const tourRevealKey = tourOpen ? `${tourStep}:${isMobileLayout ? 'phone' : 'desk'}` : 'closed';
  const [appliedTourReveal, setAppliedTourReveal] = useState<string | null>(() =>
    typeof window !== 'undefined' && !isTourDismissed() ? null : 'closed',
  );
  if (appliedTourReveal !== tourRevealKey) {
    setAppliedTourReveal(tourRevealKey);
    const step = tourOpen ? TOUR_STEPS[tourStep] : null;
    if (step) {
      setViewMode('sticker');
      if (step.tool === 'wand') {
        setTool('wand');
        setWandMode('erase');
      } else if (toolBeforeTour) {
        setTool(toolBeforeTour);
      }
      if (step.reveal === 'tools') {
        setShowLeftPanel(true);
        if (isMobileLayout) setShowRightPanel(false);
      } else if (step.reveal === 'canvas') {
        if (isMobileLayout) {
          setShowLeftPanel(false);
          setShowRightPanel(false);
        }
      } else {
        setShowRightPanel(true);
        if (isMobileLayout) setShowLeftPanel(false);
        if (step.tab) setActiveTab(step.tab);
      }
    }
  }
  const [selectedProduct, setSelectedProduct] = useState<ProductId>('hoodie');
  const [productColor, setProductColor] = useState<string>(PRODUCT_CATALOG.hoodie.colorOptions[0]);
  const [productSize, setProductSize] = useState<string>('M');
  const [activeProductView, setActiveProductView] = useState<string>('front');
  const [productPlacement, setProductPlacement] = useState<ProductPlacement>({ posX: 0, posY: 0, scale: 1, rotationDeg: 0 });
  const [stickerWidthCm, setStickerWidthCm] = useState(10);
  const [stickerHeightCm, setStickerHeightCm] = useState(10);
  const [stickerShipping, setStickerShipping] = useState<ShippingOption>('untracked');
  const [designSnapshot, setDesignSnapshot] = useState<string | null>(null);

  const handleSelectProduct = (id: ProductId) => {
    setSelectedProduct(id);
    setProductColor(PRODUCT_CATALOG[id].colorOptions[0]);
    setProductSize(isSizedProduct(id) ? 'M' : '');
    setActiveProductView(PRODUCT_CATALOG[id].views[0].id);
    setProductPlacement({ posX: 0, posY: 0, scale: 1, rotationDeg: 0 });
  };

  const applyDesignToProduct = useCallback(() => {
    if (!canvas) return;
    const next = snapshotDesignAsDataURL(canvas);
    if (next) setDesignSnapshot(next);
  }, [canvas]);

  const openProductPreview = useCallback(() => {
    applyDesignToProduct();
    setViewMode('product');
  }, [applyDesignToProduct]);

  const openSticker = useCallback(() => {
    applyDesignToProduct();
    setViewMode('decal');
  }, [applyDesignToProduct]);

  useEffect(() => {
    if (viewMode !== 'product') return;
    const product = PRODUCT_CATALOG[selectedProduct];
    trackViewItem({ itemId: selectedProduct, itemName: product.label });
  }, [viewMode, selectedProduct]);

  const { saveHistorySnapshot, handleUndo, handleRedo } = useHistoryEngine({ setCanvasObjects });
  const clipboard = useRef<fabric.Object | null>(null);
  useCanvasAutosave(canvas, () => {
    if (canvas) saveHistorySnapshot(canvas, true);
  });

  const { performBoolean } = useBooleanEngine(canvas, saveHistorySnapshot);
  const { handleCreateOffset: offsetCore } = useVectorMath({ canvas, isProcessingRef, setIsTracing, traceImage, saveHistorySnapshot });
  const openImageTrace = useCallback((img: fabric.Image, mode: 'cutout' | 'stacked' = 'cutout') => {
    const imageData = rasterToImageData(img.getElement());
    setQuickMenu(null);
    setPendingTrace({
      imageData,
      dataUrl: imageDataToPngDataUrl(imageData),
      source: img,
      mode,
    });
  }, []);
  const handleVectorTrace = () => {
    if (!activeObj || activeObj.type !== 'image') {
      notifyStudio({ tone: 'info', title: 'Already a vector', detail: 'Select a photo to trace. Shapes on the mat are already cut-ready.' });
      return;
    }
    openImageTrace(activeObj as fabric.Image, 'cutout');
  };
  const handleStackedVectorTrace = () => {
    if (!activeObj || activeObj.type !== 'image') {
      notifyStudio({ tone: 'info', title: 'Already a vector', detail: 'Select a photo to trace. Shapes on the mat are already cut-ready.' });
      return;
    }
    openImageTrace(activeObj as fabric.Image, 'stacked');
  };
  const handleCreateOffset = () => offsetCore(activeObj, offsetSize);
  const handleUngroup = useCallback(() => {
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!isUngroupable(obj)) return;
    ungroupOnce(canvas, obj);
    saveHistorySnapshot(canvas, true);
    setQuickMenu(null);
  }, [canvas, saveHistorySnapshot]);
  const handleGroupSelection = useCallback(() => {
    if (!canvas) return;
    const obj = canvas.getActiveObject() as fabric.ActiveSelection | null;
    if (!obj || String(obj.type || '').toLowerCase() !== 'activeselection') return;
    groupActiveSelection(canvas, obj);
    saveHistorySnapshot(canvas, true);
    setQuickMenu(null);
  }, [canvas, saveHistorySnapshot]);

  const { isNodeEditing, canEditActive, toggleNodeEdit, exitNodeEdit } = useNodeEditEngine({
    canvas,
    tool,
    activeObj,
    saveHistorySnapshot,
    setQuickMenu,
    setTool: (next) => setTool(next),
  });

  const { alignObject, applyTextCurve, explodeText, addText, addShape, placeGeneratedArtwork, addWeedingBox } = useStudioActions({
    canvas, activeObj, brushColor, setTool, setTextCurve, saveHistorySnapshot
  });

  useEffect(() => {
    let cancelled = false;
    void fetchAiQuota()
      .then((quota) => {
        if (cancelled) return;
        writeLocalAiQuota(quota);
        setAiQuota(quota);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const openAiArtwork = useCallback(() => {
    const selected = activeObj as (fabric.Object & { aiPrompt?: unknown }) | null;
    const editing = Boolean(
      selected
      && selected.type === 'image'
      && typeof selected.aiPrompt === 'string'
      && selected.aiPrompt.trim(),
    );
    aiSessionSeq.current += 1;
    setAiError(null);
    setAiSession({
      id: aiSessionSeq.current,
      mode: editing ? 'edit' : 'create',
      prompt: editing ? String(selected?.aiPrompt) : '',
      target: editing ? selected : null,
    });
  }, [activeObj]);

  const submitAiArtwork = useCallback(async (prompt: string) => {
    if (!canvas || !aiSession || isGenerating) return;
    setAiError(null);
    setIsGenerating(true);
    const previous = aiQuota;
    const optimistic: AiQuota = { ...aiQuota, remaining: Math.max(0, aiQuota.remaining - 1) };
    setAiQuota(optimistic);
    writeLocalAiQuota(optimistic);
    let accepted = false;
    try {
      const result = await requestAiArtwork(prompt);
      accepted = true;
      const nextQuota: AiQuota = {
        remaining: result.remaining,
        limit: result.limit,
        resetAt: result.resetAt,
      };
      writeLocalAiQuota(nextQuota);
      setAiQuota(nextQuota);
      await placeGeneratedArtwork(result.image, prompt, aiSession.mode === 'edit' ? aiSession.target : null);
      setAiSession(null);
    } catch (error) {
      const artworkError = error instanceof AiArtworkError ? error : null;
      const message = artworkError?.message || (accepted
        ? 'The image was generated but could not be placed on the mat.'
        : 'Artwork could not be generated. Please try again.');
      if (!accepted) {
        const restored = artworkError?.quota ?? previous;
        writeLocalAiQuota(restored);
        setAiQuota(restored);
      }
      setAiError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [aiQuota, aiSession, canvas, isGenerating, placeGeneratedArtwork]);

  const cutReport = useMemo(() => inspectObjectsForCut(canvasObjects), [canvasObjects]);

  const handleSafeSVGExport = useCallback(() => {
    if (!canvas) return;
    const report = inspectObjectsForCut(canvas.getObjects());
    if (!report.ok) {
      notifyStudio({
        tone: 'error',
        title: 'Not cut ready',
        detail: report.issues.find((i) => i.severity === 'error')?.message,
      });
      setShowRightPanel(true);
      setActiveTab('design');
      return;
    }
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
        if (report.issues.length > 0) {
          notifyStudio({
            tone: 'warning',
            title: 'Exported with warnings',
            detail: report.issues[0]?.message,
          });
        }
    } catch (err) {
        console.error("SVG Pipeline Error:", err);
        notifyStudio({
          tone: 'error',
          title: 'Export failed',
          detail: 'If the mat has photos, trace them to vectors first.',
        });
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
      void smoothness;
      setPendingCropImage(null);
      if (!canvas) return;
      
      const img = new Image();
      img.onload = async () => {
          if (asVector) {
              isProcessingRef.current = true;
              setIsTracing(true);
              await yieldToPaint();
              try {
                      const rawImgData = rasterToImageData(img);
                      setPendingTrace({
                        imageData: rawImgData,
                        dataUrl: imageDataToPngDataUrl(rawImgData),
                      });
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

  const handleTraceCanvasImage = () => {
      if (!canvas || !activeObj || activeObj.type !== 'image') return;
      openImageTrace(activeObj as fabric.Image);
  };

  const handleAcceptTrace = async (svgString: string) => {
      if (!canvas || !pendingTrace) return;
      const source = pendingTrace.source;
      const mode = pendingTrace.mode;
      try {
          const traced = await tracedSvgToObject(svgString, {
            source,
            hierarchical: mode,
          });
          if (!traced) throw new Error('No solid shapes found to trace after background removal.');
          if (source) {
              canvas.remove(source);
          } else {
              const maxDim = 800;
              const gw = traced.width || 1;
              const gh = traced.height || 1;
              const scale = Math.min(1, maxDim / gw, maxDim / gh);
              traced.set({ left: 600, top: 600, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale });
              traced.setCoords();
          }
          canvas.add(traced);
          canvas.setActiveObject(traced);
          eraserTargetRef.current = traced;
          canvas.requestRenderAll();
          saveHistorySnapshot(canvas, true);
          setPendingTrace(null);
      } catch (err) {
          console.error('Place trace failed:', err);
          notifyStudio({ tone: 'error', title: 'Could not place trace', detail: 'The original image is still on the mat.' });
      }
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
    if (actives.length === 1) eraserTargetRef.current = actives[0];
    
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
    canvas.requestRenderAll();
    saveHistorySnapshot(canvas, key === 'textAlign');
  };

  useCanvasEvents({ canvas, matOverlayRef, isProcessingRef, tool, brushColor, brushSize, brushType, wandTolerance, wandMode, eraserMode, setIsTracing, setQuickMenu, updateUIFromSelection, saveHistorySnapshot, traceImage, setTool, quickMenuRef, eraserTargetRef, isNodeEditing, onNodeEditToggle: toggleNodeEdit, trackLineApiRef });
  useToolEngine({ canvas, tool, brushColor, brushSize, brushType, setQuickMenu, eraserTargetRef });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const updateLayout = () => {
      const mobile = mediaQuery.matches;
      setIsMobileLayout(mobile);
      if (mobile && !tourOpenRef.current) {
        setShowRightPanel(false);
        setShowLeftPanel(false);
      }
    };
    updateLayout();
    mediaQuery.addEventListener?.('change', updateLayout);
    return () => mediaQuery.removeEventListener?.('change', updateLayout);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const phoneQuery = window.matchMedia('(max-width: 639px)');
    const updatePhone = () => setIsPhoneLayout(phoneQuery.matches);
    updatePhone();
    phoneQuery.addEventListener?.('change', updatePhone);
    return () => phoneQuery.removeEventListener?.('change', updatePhone);
  }, []);

  const replayTour = useCallback(() => {
    tourOpenRef.current = true;
    setToolBeforeTour((previous) => previous ?? tool);
    setViewMode('sticker');
    setTourStep(0);
    setTourOpen(true);
  }, [tool]);

  const dismissTour = useCallback(() => {
    markTourDismissed();
    tourOpenRef.current = false;
    setTourOpen(false);
    if (toolBeforeTour) setTool(toolBeforeTour);
    setToolBeforeTour(null);
    window.setTimeout(() => tourReplayRef.current?.focus(), 0);
  }, [toolBeforeTour]);
 
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
      if (tourOpen) return;
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
      if (e.key === 'Escape' && isNodeEditing) {
        e.preventDefault();
        exitNodeEdit(true);
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n' && canEditActive) {
        e.preventDefault();
        toggleNodeEdit(activeObj);
      }
    };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, canvas, saveHistorySnapshot, deleteSelected, isNodeEditing, exitNodeEdit, canEditActive, toggleNodeEdit, activeObj, tourOpen]);

  const livePrint = printSizeCm({
    productId: selectedProduct,
    viewId: activeProductView,
    color: productColor,
    garmentSize: productSize,
    scale: productPlacement.scale,
  });
  const apparelType = productTypeFromCatalog(selectedProduct);
  const stickerQuote = quoteOrder({
    productType: 'decal',
    widthCm: stickerWidthCm,
    heightCm: stickerHeightCm,
    designType: 'graphic',
    shippingOption: stickerShipping,
  });
  const apparelQuote = livePrint && apparelType
    ? quoteOrder({
        productType: apparelType,
        widthCm: livePrint.widthCm,
        heightCm: livePrint.heightCm,
        designType: 'graphic',
      })
    : null;
  const printSizeLabel = livePrint
    ? `${formatPrintCm(livePrint.widthCm)} × ${formatPrintCm(livePrint.heightCm)} cm`
    : '';

  return (
    <div data-nosnippet="" className="relative flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-[#0f111a] font-sans text-slate-200 select-none pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
        {isPhoneLayout ? (
          <header data-testid="studio-header" className="z-20 flex h-11 shrink-0 items-center gap-1 border-b border-slate-800 bg-[#181a25] px-1.5">
            <button
              type="button"
              onClick={() => setShowLeftPanel((prev) => !prev)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-200 touch-manipulation"
              aria-label="Open sidebar"
              title="Tools"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
            </button>
            <CutReadyBadge
              report={cutReport}
              onClick={() => {
                setShowRightPanel(true);
                setActiveTab('design');
              }}
            />
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <button type="button" onClick={() => setViewMode('sticker')} className={`h-8 rounded-md px-1.5 text-[11px] font-semibold touch-manipulation ${viewMode === 'sticker' ? 'bg-[#FF1493] text-black' : 'text-slate-300'}`}>Design</button>
              <button type="button" onClick={openSticker} className={`h-8 rounded-md px-1.5 text-[11px] font-semibold touch-manipulation ${viewMode === 'decal' ? 'bg-[#FF1493] text-black' : 'text-slate-300'}`}>Sticker</button>
              <button type="button" onClick={openProductPreview} className={`h-8 rounded-md px-1.5 text-[11px] font-semibold touch-manipulation ${viewMode === 'product' ? 'bg-[#FF1493] text-black' : 'text-slate-300'}`}>Product</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setShowRightPanel((prev) => !prev); }} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-slate-300 touch-manipulation" title="Toggle Inspector Panel" aria-label="Toggle inspector"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg></button>
            </div>
          </header>
        ) : (
        <header className="z-20 flex min-h-12 shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-slate-800 bg-[#181a25] px-2 shadow-sm sm:min-h-14 sm:px-4">
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
              <span className="truncate text-xs font-black tracking-widest uppercase sm:text-sm">
                <span className="sm:hidden">WVS</span>
                <span className="hidden sm:inline">West Vinyl Studio</span>
              </span>
              <a
                href="/policies"
                className="shrink-0 text-[10px] font-bold tracking-wider text-slate-400 uppercase hover:text-pink-400"
              >
                Info
              </a>
              <button type="button" ref={tourReplayRef} data-testid="studio-tour-replay" onClick={replayTour} className="shrink-0 text-[10px] font-bold tracking-wider text-slate-400 uppercase hover:text-[#FF1493]">Tour</button>
              <div className="mx-1 hidden h-5 w-px bg-slate-800 sm:block"></div>
              <div className="flex items-center gap-1 rounded-lg bg-slate-500/5 p-1">
                <button onClick={() => handleUndo(canvas)} className="min-h-9 min-w-9 rounded-md p-1.5 text-slate-300 transition-colors hover:bg-slate-700/50 touch-manipulation" title="Undo (Ctrl+Z)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg></button>
                <button onClick={() => handleRedo(canvas)} className="min-h-9 min-w-9 rounded-md p-1.5 text-slate-300 transition-colors hover:bg-slate-700/50 touch-manipulation" title="Redo (Ctrl+Y)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg></button>
                <div className="mx-1 hidden h-4 w-px bg-slate-800 sm:block"></div>
                <button onClick={() => {if(canvas){ canvas.clear(); void clearSavedCanvas(); saveHistorySnapshot(canvas, true);}}} className="min-h-9 min-w-9 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500 touch-manipulation" title="Clear Mat"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <CutReadyBadge
                report={cutReport}
                onClick={() => {
                  setShowRightPanel(true);
                  setActiveTab('design');
                }}
              />
              <button
                type="button"
                data-testid="ai-artwork-button"
                aria-label="Create and edit with AI"
                aria-haspopup="dialog"
                aria-expanded={Boolean(aiSession)}
                disabled={isGenerating}
                onClick={() => {
                  if (aiSession) {
                    setAiSession(null);
                    setAiError(null);
                    return;
                  }
                  openAiArtwork();
                }}
                title={`${aiQuota.remaining} of ${aiQuota.limit} free generations left today`}
                className={`${BTN_SECONDARY} touch-manipulation`}
              >
                {isGenerating ? 'Generating…' : (
                  <>
                    <span className="sm:hidden">AI</span>
                    <span className="hidden sm:inline">Create and edit with AI</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-1">
                <button onClick={() => setViewMode('sticker')} className={`touch-manipulation ${viewMode === 'sticker' ? BTN_PRIMARY : BTN_QUIET}`}>Design</button>
                <button type="button" onClick={openSticker} className={`touch-manipulation ${viewMode === 'decal' ? BTN_PRIMARY : BTN_QUIET}`}>Sticker</button>
                <button
                  type="button"
                  onClick={openProductPreview}
                  className={`touch-manipulation ${viewMode === 'product' ? BTN_PRIMARY : BTN_QUIET}`}
                >
                  <span className="sm:hidden">Product</span>
                  <span className="hidden sm:inline">Product Preview</span>
                </button>
              </div>

              <button type="button" onClick={(e) => { e.stopPropagation(); setShowRightPanel((prev) => !prev); }} className={`flex h-8 min-w-8 items-center justify-center rounded-md p-1.5 transition-colors hover:bg-slate-700/50 touch-manipulation ${!showRightPanel ? 'bg-[#FF1493]/10 text-[#FF1493]' : 'text-slate-400'}`} title="Toggle Inspector Panel"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg></button>
            </div>
        </header>
        )}
        {!isPhoneLayout && !showLeftPanel && (
          <button
            type="button"
            onClick={() => setShowLeftPanel(true)}
            className="absolute top-3 left-3 z-50 flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 bg-[#181a25]/95 text-slate-300 shadow-lg shadow-black/30 transition-transform hover:scale-110 hover:bg-slate-700 hover:text-white touch-manipulation pointer-events-auto sm:top-4 sm:left-4 sm:h-10 sm:w-10"
            aria-label="Open sidebar"
            title="Toggle Sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
          </button>
        )}
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
            {isMobileLayout ? (
              <>
                <div
                  className={`absolute inset-0 z-30 bg-slate-950/55 backdrop-blur-[2px] transition-opacity duration-200 ${showLeftPanel ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
                  onClick={() => setShowLeftPanel(false)}
                />
                <div
                  className={`absolute inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-out ${showLeftPanel ? 'pointer-events-auto translate-x-0' : 'pointer-events-none -translate-x-full'}`}
                >
                  <div className="flex h-full" onClick={(e) => e.stopPropagation()}>
                    {showLeftPanel && isPhoneLayout && (
                      <PhoneStudioMenu
                        tourRef={tourReplayRef}
                        aiDisabled={isGenerating}
                        onUndo={() => { handleUndo(canvas); setShowLeftPanel(false); }}
                        onRedo={() => { handleRedo(canvas); setShowLeftPanel(false); }}
                        onClear={() => {
                          if (canvas) {
                            canvas.clear();
                            void clearSavedCanvas();
                            saveHistorySnapshot(canvas, true);
                          }
                          setShowLeftPanel(false);
                        }}
                        onTour={() => { setShowLeftPanel(false); replayTour(); }}
                        onAi={() => {
                          setShowLeftPanel(false);
                          if (aiSession) {
                            setAiSession(null);
                            setAiError(null);
                            return;
                          }
                          openAiArtwork();
                        }}
                      />
                    )}
                    {showLeftPanel && (
                      <LeftDock tool={tool} setTool={setTool as any} addText={addText} addShape={addShape} fileInputRef={fileInputRef} handleImageUpload={handleInterceptUpload} borderCol="border-slate-800" bgPanel="bg-[#181a25]" setShowLeftPanel={setShowLeftPanel} />
                    )}
                  </div>
                </div>
              </>
            ) : (
              showLeftPanel && (
                <LeftDock tool={tool} setTool={setTool as any} addText={addText} addShape={addShape} fileInputRef={fileInputRef} handleImageUpload={handleInterceptUpload} borderCol="border-slate-800" bgPanel="bg-[#181a25]" setShowLeftPanel={setShowLeftPanel} />
              )
            )}
            <main
              className="relative min-h-0 min-w-0 flex-1 touch-manipulation"
              data-testid="studio-mat"
              ref={containerRef}
              style={{ backgroundColor: viewMode === 'sticker' ? CANVAS_BG : undefined }}
            >
                <div
                  className={viewMode === 'sticker' ? 'contents' : 'pointer-events-none invisible absolute inset-0 overflow-hidden'}
                  aria-hidden={viewMode !== 'sticker'}
                >
                  <canvas ref={canvasRef} />
                </div>

                {viewMode === 'sticker' && tool === 'wand' && (
                  <div className="absolute top-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-fuchsia-500/30 bg-[#1e2230]/95 p-1 shadow-xl touch-manipulation">
                    <button type="button" data-tour="erase-color" onClick={() => setWandMode('erase')} className={`min-h-10 rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${wandMode === 'erase' ? 'bg-fuchsia-500 text-black' : 'text-slate-300 hover:text-white'}`}>Erase Color</button>
                    <button type="button" onClick={() => setWandMode('extract')} className={`min-h-10 rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${wandMode === 'extract' ? 'bg-fuchsia-500 text-black' : 'text-slate-300 hover:text-white'}`}>Extract Shape</button>
                  </div>
                )}
                {viewMode === 'sticker' && tool === 'track-line' && (
                  <div className="absolute top-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-[#FF1493]/30 bg-[#1e2230]/95 p-1 shadow-xl touch-manipulation">
                    <span className="hidden px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:inline">Tap points</span>
                    <button type="button" onClick={() => trackLineApiRef.current?.finish(false)} className="min-h-10 rounded-lg bg-[#FF1493] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white">Finish</button>
                    <button type="button" onClick={() => trackLineApiRef.current?.finish(true)} className="min-h-10 rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:text-white">Close shape</button>
                  </div>
                )}
                {viewMode === 'sticker' && tool === 'eraser' && (
                  <div className="absolute top-3 left-1/2 z-30 -translate-x-1/2 rounded-xl border border-red-500/30 bg-[#1e2230]/95 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400 shadow-xl">
                    {eraserMode === 'layer' ? 'Eraser: draw on the selected layer' : 'Eraser: stroke through overlapping objects'}
                  </div>
                )}

                {viewMode === 'decal' && (
                  <div className="absolute inset-0 flex flex-col bg-[#0f111a]" data-testid="sticker-panel">
                    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
                      {designSnapshot ? (
                        <img src={designSnapshot} alt="Sticker artwork" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <p className="max-w-xs text-center text-sm text-slate-400">Design on the mat, then set the sticker size here.</p>
                      )}
                    </div>
                    <div className="shrink-0 space-y-2 border-t border-slate-800 bg-[#181a25] px-3 py-3">
                      <div className="flex gap-2">
                        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Width
                          <input
                            type="number"
                            inputMode="decimal"
                            min={3}
                            max={60}
                            step={0.1}
                            value={stickerWidthCm}
                            aria-label="Sticker width"
                            onChange={(e) => {
                              const next = clampStickerSize(Number(e.target.value), stickerHeightCm, 'width');
                              setStickerWidthCm(next.widthCm);
                              setStickerHeightCm(next.heightCm);
                            }}
                            className="h-11 w-full rounded border border-slate-700 bg-[#0f111a] px-2 font-mono text-sm normal-case text-slate-100"
                          />
                        </label>
                        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Height
                          <input
                            type="number"
                            inputMode="decimal"
                            min={3}
                            max={60}
                            step={0.1}
                            value={stickerHeightCm}
                            aria-label="Sticker height"
                            onChange={(e) => {
                              const next = clampStickerSize(stickerWidthCm, Number(e.target.value), 'height');
                              setStickerWidthCm(next.widthCm);
                              setStickerHeightCm(next.heightCm);
                            }}
                            className="h-11 w-full rounded border border-slate-700 bg-[#0f111a] px-2 font-mono text-sm normal-case text-slate-100"
                          />
                        </label>
                      </div>
                      <p data-testid="sticker-size" className="font-mono text-sm text-[#FF1493]">{formatPrintCm(stickerWidthCm)} × {formatPrintCm(stickerHeightCm)} cm</p>
                      <fieldset className="flex flex-wrap gap-3 text-xs text-slate-200">
                        <legend className="sr-only">Shipping</legend>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name="sticker-shipping"
                            checked={stickerShipping === 'untracked'}
                            onChange={() => setStickerShipping('untracked')}
                            className="accent-[#FF1493]"
                          />
                          Untracked A$4
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name="sticker-shipping"
                            checked={stickerShipping === 'tracked'}
                            onChange={() => setStickerShipping('tracked')}
                            className="accent-[#FF1493]"
                          />
                          Tracked A$10
                        </label>
                      </fieldset>
                      <p className="font-mono text-sm text-slate-100">
                        {stickerQuote.ok ? (
                          <span data-testid="print-price-sticker">Sticker A${moneyString(chargedTotal(stickerQuote.quote, 1))}</span>
                        ) : (
                          <span data-testid="print-price-sticker" className="text-red-400">{stickerQuote.error}</span>
                        )}
                      </p>
                      <div className="flex justify-end">
                        <button type="button" onClick={() => setActiveOrderTab('vinyl')} disabled={!stickerQuote.ok} className={BTN_PRIMARY}>Buy sticker</button>
                      </div>
                    </div>
                  </div>
                )}

                {viewMode === 'product' && (
                  <div className="absolute inset-0 flex flex-col bg-[#0f111a]">
                    <div className="flex-1 min-h-0">
                      <Suspense fallback={<div role="status" className="h-full p-4 text-sm text-slate-400">Loading apparel preview…</div>}>
                      <ApparelMockupViewer
                        productId={selectedProduct}
                        color={productColor}
                        activeView={activeProductView}
                        designDataUrl={designSnapshot}
                        placement={productPlacement}
                        interactive
                        onPlacementChange={setProductPlacement}
                      />
                      </Suspense>
                    </div>
                    <div className="flex max-h-[34%] shrink-0 flex-wrap items-center gap-2 overflow-y-auto border-t border-slate-800 bg-[#181a25] p-2 sm:max-h-none sm:gap-3 sm:p-3">
                      <select
                        id="preview-product"
                        aria-label="Product"
                        value={selectedProduct}
                        onChange={(e) => handleSelectProduct(e.target.value as ProductId)}
                        className="bg-slate-800 text-slate-200 text-xs font-mono border border-slate-700 rounded px-2 py-1"
                      >
                        {PRODUCT_IDS.map((id) => (
                          <option key={id} value={id}>{PRODUCT_CATALOG[id].label}</option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1">
                        {PRODUCT_CATALOG[selectedProduct].colorOptions.map((c) => (
                          <button key={c} onClick={() => setProductColor(c)} className={`h-8 w-8 rounded-full border-2 ${productColor === c ? 'border-[#FF1493]' : 'border-slate-700'}`} style={{ backgroundColor: c }} title={c} aria-label={`Colour ${c}`} />
                        ))}
                      </div>

                      <div className="flex items-center gap-1">
                        {PRODUCT_CATALOG[selectedProduct].views.map((v) => (
                          <button key={v.id} type="button" onClick={() => setActiveProductView(v.id)} className={activeProductView === v.id ? BTN_PRIMARY : BTN_QUIET}>{v.label}</button>
                        ))}
                      </div>

                      <button type="button" onClick={applyDesignToProduct} className={BTN_SECONDARY}>Apply design</button>

                      {isSizedProduct(selectedProduct) && (
                        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                          Garment
                          <select
                            id="preview-garment-size"
                            aria-label="Garment size"
                            value={productSize}
                            onChange={(e) => setProductSize(e.target.value)}
                            className="bg-slate-800 text-slate-200 text-xs font-mono border border-slate-700 rounded px-2 py-1"
                          >
                            {APPAREL_SIZES.map((size) => (
                              <option key={size} value={size}>{size}</option>
                            ))}
                          </select>
                        </label>
                      )}

                      <button
                        type="button"
                        onClick={() => setProductPlacement({ posX: 0, posY: 0, scale: 1, rotationDeg: 0 })}
                        className={BTN_SECONDARY}
                      >
                        Reset place
                      </button>

                      <button type="button" onClick={handleSafeSVGExport} className={BTN_SECONDARY}>Export SVG</button>
                      <p className="w-full text-xs leading-relaxed text-slate-300">Drag the print. Pink corners scale it. The green handle rotates it.</p>
                    </div>
                    <div className="shrink-0 space-y-1 border-t border-slate-800 bg-[#181a25] px-2 py-2">
                      <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                        <span className="shrink-0">Print size</span>
                        <input
                          type="range"
                          min={PLACEMENT_SCALE_MIN}
                          max={PLACEMENT_SCALE_MAX}
                          step={0.01}
                          value={productPlacement.scale}
                          onChange={(e) => setProductPlacement((prev) => ({ ...prev, scale: Number(e.target.value) }))}
                          className="h-8 min-w-0 flex-1 accent-[#FF1493]"
                          aria-label="Print size"
                        />
                        <span data-testid="print-size" className="shrink-0 whitespace-nowrap font-mono text-sm normal-case text-[#FF1493]">{printSizeLabel}</span>
                      </label>
                      {isSizedProduct(selectedProduct) && (
                        <div className="flex flex-wrap gap-1">
                          {([
                            ['chest', 'Chest', CHEST_LOGO_CM],
                            ['medium', 'Medium', MEDIUM_PRINT_CM],
                            ['full', 'Full', null],
                          ] as const).map(([id, label, target]) => {
                            const max = maxPrintCm({
                              productId: selectedProduct,
                              viewId: activeProductView,
                              garmentSize: productSize,
                            });
                            const scale = max
                              ? (target == null ? PLACEMENT_SCALE_MAX : scaleForLongestSide(max, target))
                              : PLACEMENT_SCALE_MAX;
                            const active = Math.abs(productPlacement.scale - scale) < 0.001;
                            return (
                              <button
                                key={id}
                                type="button"
                                data-testid={`print-preset-${id}`}
                                title={target == null ? 'Full print area' : `Longest side ${target} cm`}
                                onClick={() => setProductPlacement((prev) => ({ ...prev, scale }))}
                                className={active ? BTN_PRIMARY : BTN_QUIET}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <p data-testid="print-prices" className="font-mono text-xs text-slate-100">
                        {apparelQuote?.ok ? (
                          <span data-testid="print-price-apparel">{PRODUCT_CATALOG[selectedProduct].label} A${moneyString(chargedTotal(apparelQuote.quote, 1))}</span>
                        ) : (
                          <span data-testid="print-price-apparel" className="text-red-400">{apparelQuote && !apparelQuote.ok ? apparelQuote.error : 'No price'}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-800 bg-[#181a25] px-3 py-2">
                      <button type="button" onClick={() => setActiveOrderTab('apparel')} disabled={!apparelQuote?.ok} className={BTN_APPAREL}>Buy apparel</button>
                    </div>
                  </div>
                )}

                {isNodeEditing && viewMode === 'sticker' && (
                  <div className="absolute top-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#FF1493]/40 bg-[#181a25]/95 px-4 py-2 shadow-xl shadow-black/40">
                    <span className="h-2 w-2 rounded-full bg-[#FF1493] animate-pulse" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
                      Editing nodes — drag the pink dots. Esc to finish.
                    </p>
                    <button
                      type="button"
                      onClick={() => exitNodeEdit(true)}
                      className="h-7 rounded-full bg-[#FF1493] px-3 text-[10px] font-black uppercase tracking-wider text-white hover:bg-[#ff4da6]"
                    >
                      Done
                    </button>
                  </div>
                )}

                {quickMenu && quickMenu.show && !contourTarget && !isNodeEditing && viewMode === 'sticker' && (
                  <div ref={quickMenuRef} className="absolute z-20 flex items-center gap-1 p-1.5 rounded-xl shadow-2xl bg-[#1e2230]/90 border border-slate-700 transform -translate-x-1/2" style={{ top: quickMenu.top, left: quickMenu.left }}>
                    
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
                            <button onClick={duplicateSelected} className="min-h-10 min-w-10 p-2.5 rounded-lg hover:bg-slate-700 text-slate-300 touch-manipulation" title="Duplicate (Ctrl+C, Ctrl+V)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                            
                            {activeObj?.type === 'image' && (
                                <button onClick={handleTraceCanvasImage} className="p-1.5 rounded-lg hover:bg-[#FF1493]/20 text-[#FF1493] transition-colors" title="Trace Image to Vector"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
                            )}

                            {canEditActive && (
                                <button onClick={() => { toggleNodeEdit(activeObj); setQuickMenu(null); }} className="p-1.5 rounded-lg hover:bg-[#FF1493]/20 text-[#FF1493] transition-colors" title="Edit Nodes (N) — drag path anchors"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="12" cy="19" r="2"/><path d="M7 12h10M12 7v10"/></svg></button>
                            )}

                            {activeObj?.type === 'path' && (
                                <button onClick={() => { setContourTarget(activeObj as fabric.Path); setQuickMenu(null); }} className="p-1.5 rounded-lg hover:bg-[#FF1493]/20 text-[#FF1493] transition-colors" title="Contour (Hide Internal Cuts)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" strokeDasharray="2 2" /></svg></button>
                            )}

                            <div className="w-px h-5 mx-1 bg-slate-700"></div>
                            
                            <button onClick={() => setShowOffsetConfig(true)} className="p-1.5 rounded-lg hover:bg-amber-500/20 text-amber-500 transition-colors" title="Create Offset Outline"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v16H4z" strokeDasharray="2 2" /><path d="M8 8h8v8H8z" fill="currentColor" opacity="0.5" /></svg></button>
                            <button onClick={() => { addWeedingBox(); setQuickMenu(null); }} className="p-1.5 rounded-lg hover:bg-[#00FFFF]/20 text-[#00FFFF] transition-colors" title="Add Weeding Box"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeDasharray="3 3"/><path d="M9 9h6v6H9z" fill="currentColor" stroke="none" opacity="0.5"/></svg></button>
                            
                            {(canvas?.getActiveObjects()?.length || 0) > 1 && !isUngroupable(activeObj) && (
                              <button onClick={handleGroupSelection} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300" title="Group Objects"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg></button>
                            )}
                            {isUngroupable(activeObj) && (
                              <button onClick={handleUngroup} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300" title="Ungroup"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3z"/></svg></button>
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
                {aiSession && (
                  <AiArtworkPanel
                    key={aiSession.id}
                    mode={aiSession.mode}
                    initialPrompt={aiSession.prompt}
                    remaining={aiQuota.remaining}
                    limit={aiQuota.limit}
                    generating={isGenerating}
                    error={aiError}
                    onClose={() => {
                      setAiSession(null);
                      setAiError(null);
                    }}
                    onSubmit={(prompt) => { void submitAiArtwork(prompt); }}
                  />
                )}
            </main>
            {isMobileLayout ? (
              <>
                <div className={`absolute inset-0 z-30 bg-slate-950/55 backdrop-blur-[2px] transition-opacity duration-200 ${showRightPanel ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={() => setShowRightPanel(false)} />
                <div className={`absolute inset-y-0 right-0 z-40 h-full w-[min(92vw,320px)] transform transition-transform duration-200 ease-out ${showRightPanel ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'}`}>
                  <div className="h-full w-full" onClick={(e) => e.stopPropagation()}>
                    {showRightPanel && (
                      <RightInspector
                        canvas={canvas} activeTab={activeTab} setActiveTab={setActiveTab} activeObj={activeObj} canvasObjects={canvasObjects} tool={tool} setTool={setTool as any}
                        brushColor={brushColor} setBrushColor={setBrushColor} brushSize={brushSize} setBrushSize={setBrushSize} brushType={brushType} setBrushType={setBrushType}
                        opacity={opacity} wandTolerance={wandTolerance} setWandTolerance={setWandTolerance} wandMode={wandMode} setWandMode={setWandMode} 
                        eraserMode={eraserMode} setEraserMode={setEraserMode} 
                        textCurve={textCurve} charSpacing={charSpacing} setCharSpacing={setCharSpacing}
                        lineHeight={lineHeight} setLineHeight={setLineHeight} isTracing={isTracing} offsetSize={offsetSize} setOffsetSize={setOffsetSize} handleCreateOffset={handleCreateOffset}
                        performBoolean={performBoolean} handlePropChange={handlePropChange} alignObject={alignObject} applyTextCurve={applyTextCurve} explodeText={explodeText} handleVectorTrace={handleVectorTrace} handleStackedVectorTrace={handleStackedVectorTrace}
                        isNodeEditing={isNodeEditing} canNodeEdit={canEditActive} toggleNodeEdit={() => toggleNodeEdit(activeObj)} handleUngroup={handleUngroup}
                        saveHistorySnapshot={saveHistorySnapshot} borderCol="border-slate-800" bgPanel="bg-[#181a25]" isDark={true} textMuted="text-slate-400" textMain="text-slate-200" btnHover="hover:bg-slate-700/50"
                      />
                    )}
                  </div>
                </div>
                {!isPhoneLayout && !showRightPanel && viewMode === 'sticker' && (
                  <button type="button" onClick={() => setShowRightPanel(true)} className="absolute bottom-3 right-3 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-[#181a25]/95 text-[#FF1493] shadow-lg shadow-black/30 transition-transform hover:scale-105 touch-manipulation sm:bottom-4 sm:right-4" aria-label="Open inspector">
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
                performBoolean={performBoolean} handlePropChange={handlePropChange} alignObject={alignObject} applyTextCurve={applyTextCurve} explodeText={explodeText} handleVectorTrace={handleVectorTrace} handleStackedVectorTrace={handleStackedVectorTrace}
                isNodeEditing={isNodeEditing} canNodeEdit={canEditActive} toggleNodeEdit={() => toggleNodeEdit(activeObj)} handleUngroup={handleUngroup}
                saveHistorySnapshot={saveHistorySnapshot} borderCol="border-slate-800" bgPanel="bg-[#181a25]" isDark={true} textMuted="text-slate-400" textMain="text-slate-200" btnHover="hover:bg-slate-700/50"
              />
            ) : null}
        </div>
        
        {pendingCropImage && (
            <CropModal imageUrl={pendingCropImage} onCrop={handleConfirmCrop} onCancel={() => setPendingCropImage(null)} />
        )}

        {pendingTrace && (
          <TracePreviewModal
            rasterDataUrl={pendingTrace.dataUrl}
            imageData={pendingTrace.imageData}
            mode={pendingTrace.mode}
            traceImage={traceImage}
            onAccept={handleAcceptTrace}
            onCancel={() => setPendingTrace(null)}
          />
        )}

        {contourTarget && (
            <ContourModal targetPath={contourTarget} onConfirm={handleApplyContour} onCancel={() => setContourTarget(null)} />
        )}

        {/* --- INJECTED ROUTED STOREFRONT MODAL --- */}
        {activeOrderTab && canvas && (
            <Suspense fallback={<div role="status" className="fixed inset-0 z-50 bg-slate-950/90 p-8 text-white">Loading checkout…</div>}>
            <OrderModal
              canvas={canvas}
              initialTab={activeOrderTab}
              preview={
                activeOrderTab === 'apparel' && livePrint
                  ? {
                      productId: selectedProduct,
                      productColor,
                      productSize: isSizedProduct(selectedProduct) ? productSize : undefined,
                      activeView: activeProductView,
                      placement: productPlacement,
                      widthCm: livePrint.widthCm,
                      heightCm: livePrint.heightCm,
                    }
                  : activeOrderTab === 'vinyl'
                    ? {
                        productId: selectedProduct,
                        productColor,
                        activeView: 'front',
                        placement: { posX: 0, posY: 0, scale: 1, rotationDeg: 0 },
                        widthCm: stickerWidthCm,
                        heightCm: stickerHeightCm,
                        shippingOption: stickerShipping,
                      }
                    : undefined
              }
              onClose={() => setActiveOrderTab(null)}
            />
            </Suspense>
        )}
        <StudioTour open={tourOpen} stepIndex={tourStep} onStep={setTourStep} onDismiss={dismissTour} />
        <StudioNoticeHost />
    </div>
  );
}