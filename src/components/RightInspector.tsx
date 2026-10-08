import React from 'react';
import * as fabric from 'fabric';
import { FontPicker } from './FontPicker';
import { tightPackWeldObject } from '../utils/weldImport';
import { isUngroupable } from '../utils/groupOps';

const SWATCHES = [
  '#FFFFFF', '#000000', '#FF1493', '#FF0000', '#FF7F00', '#FFFF00', '#32CD32', '#00FF00', 
  '#00FFFF', '#00BFFF', '#0000FF', '#000080', '#8A2BE2', '#8B008B', '#A52A2A', '#8B4513'
];

interface RightInspectorProps {
  canvas: fabric.Canvas | null;
  activeTab: 'design' | 'layers';
  setActiveTab: (tab: 'design' | 'layers') => void;
  activeObj: fabric.Object | null;
  canvasObjects: fabric.Object[];
  tool: 'select' | 'draw' | 'track-line' | 'wand' | 'bucket' | 'eraser';
  setTool: (tool: 'select' | 'draw' | 'track-line' | 'wand' | 'bucket' | 'eraser') => void;
  brushColor: string;
  setBrushColor: (col: string) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  brushType: 'round' | 'chisel';
  setBrushType: (type: 'round' | 'chisel') => void;
  opacity: number;
  wandTolerance: number;
  setWandTolerance: (tol: number) => void;
  wandMode: 'erase' | 'extract';
  setWandMode: (mode: 'erase' | 'extract') => void;
  eraserMode: 'layer' | 'canvas';
  setEraserMode: (mode: 'layer' | 'canvas') => void;
  textCurve: number;
  charSpacing: number;
  setCharSpacing: (sp: number) => void;
  lineHeight: number;
  setLineHeight: (lh: number) => void;
  isTracing: boolean;
  offsetSize: number;
  setOffsetSize: (size: number) => void;
  handleCreateOffset: () => void;
  performBoolean: (op: 'weld' | 'punch') => void;
  handlePropChange: (key: string, val: string | number | boolean | undefined) => void;
  alignObject: (pos: 'centerH' | 'centerV') => void;
  applyTextCurve: (val: number) => void;
  explodeText: () => void;
  handleVectorTrace: () => void;
  handleStackedVectorTrace: () => void;
  isNodeEditing?: boolean;
  canNodeEdit?: boolean;
  toggleNodeEdit?: () => void;
  handleUngroup?: () => void;
  saveHistorySnapshot: (canvas: fabric.Canvas, immediate?: boolean) => void;
  borderCol: string;
  bgPanel: string;
  isDark: boolean;
  textMuted: string;
  textMain: string;
  btnHover: string;
}

export const RightInspector: React.FC<RightInspectorProps> = React.memo((props) => {
  const {
    canvas, activeTab, setActiveTab, activeObj, canvasObjects, tool, setTool,
    brushColor, setBrushColor, brushSize, setBrushSize, brushType, setBrushType,
    opacity, wandTolerance, setWandTolerance, wandMode, setWandMode, eraserMode, setEraserMode, textCurve, charSpacing, setCharSpacing,
    lineHeight, setLineHeight, isTracing, offsetSize, setOffsetSize, handleCreateOffset,
    performBoolean, handlePropChange, alignObject, applyTextCurve, explodeText, 
    handleVectorTrace, handleStackedVectorTrace, isNodeEditing, canNodeEdit, toggleNodeEdit, handleUngroup, saveHistorySnapshot, borderCol, bgPanel,
    isDark, textMuted, textMain, btnHover
  } = props;

  // Fit the selection box to the remaining artwork (drops weld/trace dust).
  const handleShrinkWrapBounds = () => {
    if (!activeObj || !canvas) return;

    if (activeObj.type === 'textbox' || activeObj.type === 'i-text') {
        const textObj = activeObj as unknown as {
          text?: string;
          set: (key: string, value: string | number) => void;
          calcTextWidth?: () => number;
        };
        if (textObj.text) textObj.set('text', textObj.text.trim());
        if (typeof textObj.calcTextWidth === 'function') {
            textObj.set('width', textObj.calcTextWidth());
        }
    }

    tightPackWeldObject(activeObj);
    const withDims = activeObj as fabric.Object & {
      setDimensions?: () => void;
      triggerLayout?: () => void;
    };
    withDims.setDimensions?.();
    withDims.triggerLayout?.();
    activeObj.setCoords();
    canvas.requestRenderAll();
    saveHistorySnapshot(canvas, true);
  };

  return (
    <aside className={`w-full max-w-[320px] md:w-[320px] border-l ${borderCol} ${bgPanel} flex flex-col z-20 shrink-0 shadow-[-10px_0_30px_rgba(0,0,0,0.05)] touch-manipulation pointer-events-auto h-full`}>
      <div className={`flex border-b ${borderCol}`}>
        <button onClick={() => setActiveTab('design')} className={`flex-1 py-3 text-[11px] font-bold uppercase tracking-wider transition-colors ${activeTab==='design' ? 'text-[#FF1493] border-b-2 border-[#FF1493] bg-[#FF1493]/5' : `${textMuted} hover:${textMain}`}`}>Design</button>
        <button type="button" data-tour="layers-tab" onClick={() => setActiveTab('layers')} className={`flex-1 py-3 text-[11px] font-bold uppercase tracking-wider transition-colors ${activeTab==='layers' ? 'text-[#FF1493] border-b-2 border-[#FF1493] bg-[#FF1493]/5' : `${textMuted} hover:${textMain}`}`}>Layers</button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6 custom-scrollbar">
        {tool === 'eraser' && (
          <div className={`p-4 rounded-xl border ${borderCol} bg-red-500/5 border-red-500/20`}>
            <h3 className={`text-[10px] uppercase font-bold tracking-widest text-red-500 mb-2 flex items-center gap-1`}>Vector Eraser Engine</h3>
            
            <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50 mb-4 mt-3">
               <button onClick={() => setEraserMode('layer')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${eraserMode === 'layer' ? 'bg-red-500 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>Selected Layer</button>
               <button onClick={() => setEraserMode('canvas')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${eraserMode === 'canvas' ? 'bg-red-500 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>Entire Canvas</button>
            </div>
            
            <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
               {eraserMode === 'layer' ? 'Draw over the selected object. Only the stroke is subtracted — the rest of the artwork stays. Works on photos and vector paths.' : 'Stroke-erases through every object the brush crosses, without deleting whole layers.'}
            </p>

            <div className="flex justify-between text-xs mb-3"><span className="font-bold">Eraser Size</span><span className={textMuted}>{brushSize}px</span></div>
             <input type="range" min="1" max="100" value={brushSize} onChange={(e) => {
                const size = Number(e.target.value); setBrushSize(size);
             }} className="w-full accent-red-500 mb-2" />
          </div>
        )}

        {tool === 'wand' && (
          <div className={`p-4 rounded-xl border ${borderCol} bg-fuchsia-500/5 border-fuchsia-500/20`}>
            <h3 className={`text-[10px] uppercase font-bold tracking-widest text-fuchsia-500 mb-2 flex items-center gap-1`}>Magic Wand Engine</h3>
            
            <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50 mb-4 mt-3">
               <button onClick={() => setWandMode('erase')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${wandMode === 'erase' ? 'bg-fuchsia-500 text-black shadow' : 'text-slate-300 hover:text-white'}`}>Erase Color</button>
               <button onClick={() => setWandMode('extract')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${wandMode === 'extract' ? 'bg-fuchsia-500 text-black shadow' : 'text-slate-300 hover:text-white'}`}>Extract Shape</button>
            </div>
            
            <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
               {wandMode === 'erase' ? 'Tap or click a colour to delete it from the image.' : 'Tap or click a colour to extract it into a brand new vector layer.'}
            </p>
            
            <div className="flex justify-between text-xs mb-2"><span className="font-bold">Tolerance</span><span className={textMuted}>{Math.round(wandTolerance * 100)}%</span></div>
            <input type="range" min="0" max="1" step="0.01" value={wandTolerance} onChange={(e) => setWandTolerance(Number(e.target.value))} className="w-full accent-fuchsia-500" />
          </div>
        )}

        {tool === 'bucket' && (
          <div className={`p-4 rounded-xl border ${borderCol} bg-[#FF1493]/5 border-[#FF1493]/20`}>
            <h3 className={`text-[10px] uppercase font-bold tracking-widest text-[#FF1493] mb-2 flex items-center gap-1`}>Paint Bucket Engine</h3>
            <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">Select a color below and click inside any vector shape to instantly fill it.</p>
          </div>
        )}

        {activeTab === 'design' && (
          <>
            {activeObj && (
              <div>
                <h3 className={`text-[10px] uppercase font-bold tracking-widest ${textMuted} mb-3`}>Alignment & Ops</h3>
                <div className="flex gap-2">
                  <InspectorBtn onClick={() => alignObject('centerH')} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18M8 10h8M8 14h8"/></svg>} />
                  <InspectorBtn onClick={() => alignObject('centerV')} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M10 8v8M14 8v8"/></svg>} />
                  <InspectorBtn onClick={handleShrinkWrapBounds} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/><path d="m12 8-4 4 4 4"/></svg>} tooltip="Fit Box to Content" />
                  <InspectorBtn onClick={() => performBoolean('weld')} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>} tooltip="Weld (Merge)" />
                </div>
              </div>
            )}

            {activeObj && (
              <div>
                <h3 className={`text-[10px] uppercase font-bold tracking-widest ${textMuted} mb-3`}>Transform</h3>
                <div className="grid grid-cols-2 gap-2">
                  <PropInput label="X" value={Math.round(activeObj.left || 0)} onChange={(v) => handlePropChange('left', Number(v))} isDark={isDark} />
                  <PropInput label="Y" value={Math.round(activeObj.top || 0)} onChange={(v) => handlePropChange('top', Number(v))} isDark={isDark} />
                  <PropInput label="W" value={Math.round((activeObj.width || 0) * (activeObj.scaleX || 1))} onChange={(v) => handlePropChange('scaleX', Number(v) / (activeObj.width || 1))} isDark={isDark} />
                  <PropInput label="H" value={Math.round((activeObj.height || 0) * (activeObj.scaleY || 1))} onChange={(v) => handlePropChange('scaleY', Number(v) / (activeObj.height || 1))} isDark={isDark} />
                  <PropInput label="°" value={Math.round(activeObj.angle || 0)} onChange={(v) => handlePropChange('angle', Number(v))} isDark={isDark} />
                  <PropInput label="%" value={opacity} onChange={(v) => handlePropChange('opacity', Number(v)/100)} isDark={isDark} />
                </div>
              </div>
            )}

            {(activeObj || tool === 'draw' || tool === 'track-line' || tool === 'bucket') && (
               <div>
                 <h3 className={`text-[10px] uppercase font-bold tracking-widest ${textMuted} mb-3`}>Color Palette</h3>
                 <div className={`flex flex-col p-3 rounded-xl border ${borderCol} ${isDark?'bg-[#0f111a]':'bg-slate-50'} mb-3 shadow-inner`}>
                   <div className="flex items-center justify-between mb-3">
                     <span className="text-xs font-bold">Custom Color</span>
                     <div className="flex gap-2 items-center">
                        <button onClick={async () => {
                          const EyeDropper = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
                          if (EyeDropper) {
                            const ed = new EyeDropper();
                            const res = await ed.open();
                            handlePropChange('fill', res.sRGBHex);
                            setBrushColor(res.sRGBHex);
                          }
                        }} className={`p-1.5 rounded transition-colors ${btnHover}`}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg></button>
                        <input type="color" value={brushColor} onChange={(e) => {
                           const color = e.target.value;
                           setBrushColor(color);
                           if (activeObj) {
                             if (activeObj.type === 'line' || activeObj.type === 'polyline' || activeObj.type === 'path') activeObj.set('stroke', color);
                             else activeObj.set('fill', color);
                             canvas?.requestRenderAll(); saveHistorySnapshot(canvas!);
                           }
                        }} className="w-8 h-8 rounded-full cursor-pointer border-0 p-0 shadow-sm" />
                     </div>
                   </div>
                   
                   <div className="grid grid-cols-8 gap-1.5 pt-3 border-t border-slate-700/30">
                     {SWATCHES.map((hex, i) => (
                       <button key={i} onClick={() => {
                         setBrushColor(hex);
                         if (activeObj) {
                           if (activeObj.type === 'line' || activeObj.type === 'polyline' || activeObj.type === 'path') activeObj.set('stroke', hex);
                           else activeObj.set('fill', hex);
                           canvas?.requestRenderAll(); saveHistorySnapshot(canvas!);
                         }
                       }} className="w-full aspect-square rounded shadow-sm border border-slate-700/50 hover:scale-110 transition-transform" style={{backgroundColor: hex}} title={hex}></button>
                     ))}
                   </div>
                 </div>

                 {(tool === 'draw' || tool === 'track-line' || activeObj?.type === 'path' || activeObj?.type === 'line' || activeObj?.type === 'polyline') && (
                   <div className={`p-3 rounded-xl border ${borderCol} ${isDark?'bg-[#0f111a]':'bg-slate-50'}`}>
                     <div className="flex justify-between text-xs mb-3"><span className="font-bold">Stroke Width</span><span className={textMuted}>{brushSize}px</span></div>
                     <input type="range" min="1" max="100" value={brushSize} onChange={(e) => {
                        const size = Number(e.target.value); setBrushSize(size);
                        if (activeObj && (activeObj.type === 'line' || activeObj.type === 'path' || activeObj.type === 'polyline')) { activeObj.set('strokeWidth', size); canvas?.requestRenderAll(); saveHistorySnapshot(canvas!); }
                     }} className="w-full accent-[#FF1493] mb-4" />
                     
                     <div className="flex bg-slate-800/30 rounded-lg p-1 border border-slate-700/50">
                        <button onClick={() => setBrushType('round')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${brushType === 'round' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>Round</button>
                        <button onClick={() => setBrushType('chisel')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${brushType === 'chisel' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>Chisel / Square</button>
                     </div>
                   </div>
                 )}
               </div>
            )}

            {activeObj?.type === 'i-text' && (
              <div>
                <TextAlignControl
                  value={(activeObj as fabric.IText).textAlign}
                  onChange={(next) => handlePropChange('textAlign', next)}
                />
                <div className="mb-4 mt-4">
                  <FontPicker 
                    currentFont={(activeObj as fabric.IText).fontFamily || 'Arial'} 
                    onSelectFont={(fontName) => handlePropChange('fontFamily', fontName)} 
                  />
                </div>

                <div className={`p-4 rounded-xl border ${borderCol} ${isDark?'bg-[#0f111a]':'bg-slate-50'} flex flex-col gap-4 shadow-inner`}>
                  <div>
                    <div className="flex justify-between text-xs mb-2"><span className="font-bold">Letter Spacing</span><span className={textMuted}>{charSpacing}</span></div>
                    <input type="range" min="-100" max="500" value={charSpacing} onChange={(e) => { setCharSpacing(Number(e.target.value)); handlePropChange('charSpacing', Number(e.target.value)); }} className="w-full accent-blue-500" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-2"><span className="font-bold">Line Height</span><span className={textMuted}>{lineHeight}</span></div>
                    <input type="range" min="0.5" max="3" step="0.1" value={lineHeight} onChange={(e) => { setLineHeight(Number(e.target.value)); handlePropChange('lineHeight', Number(e.target.value)); }} className="w-full accent-blue-500" />
                  </div>
                  <div className="pt-2 border-t border-slate-700/30">
                    <div className="flex justify-between text-xs mb-2"><span className="font-bold text-[#FF1493]">Curve / Warp Text</span><span className={textMuted}>{textCurve}</span></div>
                    <input type="range" min="-150" max="150" value={textCurve} onChange={(e) => applyTextCurve(Number(e.target.value))} className="w-full accent-[#FF1493]" />
                  </div>
                  
                  <button onClick={explodeText} className="w-full bg-slate-800 hover:bg-slate-700 text-white text-[10px] uppercase tracking-widest font-bold py-2.5 rounded-lg transition-colors border border-slate-600 flex justify-center items-center gap-2 mt-2">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>
                     Explode (Ungroup Letters)
                  </button>
                </div>
              </div>
            )}

            {isUngroupable(activeObj) && (
              <div className="mt-2">
                <h3 className={`text-[10px] uppercase font-bold tracking-widest text-[#FF1493] mb-3`}>Layers</h3>
                <div className={`p-4 rounded-xl border ${borderCol} ${isDark ? 'bg-[#0f111a]' : 'bg-slate-50'}`}>
                  <button
                    type="button"
                    onClick={handleUngroup}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-lg text-xs font-bold transition-all border border-slate-600 flex items-center justify-center gap-2"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3z"/><path d="M8 8h8v8H8z"/></svg>
                    Ungroup layers
                  </button>
                  <p className={`text-[10px] mt-3 leading-relaxed ${textMuted}`}>
                    Layered SVG ungroups into named cut sheets (silhouette, then each vinyl colour), the same way Razor SVG ungroups colour paths.
                  </p>
                </div>
              </div>
            )}

            {canNodeEdit && activeObj && (
              <div className="mt-2">
                <h3 className={`text-[10px] uppercase font-bold tracking-widest text-[#FF1493] mb-3`}>Node Edit</h3>
                <div className={`p-4 rounded-xl border ${isNodeEditing ? 'border-[#FF1493]/50 bg-[#FF1493]/5' : borderCol} ${isDark ? 'bg-[#0f111a]' : 'bg-slate-50'}`}>
                  <button
                    type="button"
                    onClick={() => toggleNodeEdit?.()}
                    className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${isNodeEditing ? 'bg-[#FF1493] text-white shadow-lg shadow-pink-900/30' : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-600'}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="12" cy="19" r="2"/><path d="M7 12h10M12 7v10"/></svg>
                    {isNodeEditing ? 'Done editing nodes' : 'Edit nodes'}
                  </button>
                  <p className={`text-[10px] mt-3 leading-relaxed ${textMuted}`}>
                    {isNodeEditing
                      ? 'Drag the pink dots to reshape the cut. Press Esc or Done when the silhouette looks right.'
                      : 'Double-click the shape, press N, or use this button to drag individual path anchors. Traced groups ungroup first so each colour layer can be edited.'}
                  </p>
                </div>
              </div>
            )}

            {activeObj && (
              <div className="mt-2">
                <h3 className={`text-[10px] uppercase font-bold tracking-widest text-indigo-400 mb-3`}>Path Offset Layer</h3>
                <div className={`p-4 rounded-xl border ${borderCol} ${isDark ? 'bg-[#0f111a]' : 'bg-slate-50'}`}>
                  <div className="flex justify-between items-center mb-4">
                    <span className={`text-xs font-bold uppercase tracking-wider ${textMuted}`}>Thickness</span>
                    <span className={`text-xs font-mono bg-slate-500/10 px-2 py-1 rounded ${textMuted}`}>{offsetSize}px</span>
                  </div>
                  <input type="range" min="1" max="100" value={offsetSize} onChange={(e) => setOffsetSize(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer mb-4 accent-indigo-500" />
                  <button onClick={handleCreateOffset} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-lg text-xs font-bold transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M9 3v18"/><path d="M3 9h18"/></svg> Apply Offset Layer
                  </button>
                </div>
              </div>
            )}

            <div className="mt-2">
                <h3 className={`text-[10px] uppercase font-bold tracking-widest text-blue-500 mb-3`}>Master Vector Trace</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" data-tour="trace-svg" onClick={handleVectorTrace} disabled={!activeObj || isTracing} className="flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-2 py-2 text-center text-[11px] font-bold leading-tight text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
                    {isTracing ? 'Calculating Paths...' : 'Trace to Razor SVG'}
                  </button>
                  <button
                    type="button"
                    data-tour="trace-layered"
                    onClick={handleStackedVectorTrace}
                    disabled={!activeObj || isTracing}
                    className="flex min-h-11 items-center justify-center rounded-xl border border-slate-600 bg-transparent px-2 py-2 text-center text-[11px] font-bold leading-tight text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Trace layered SVG
                  </button>
                </div>
                <p className={`text-[10px] mt-3 leading-relaxed ${textMuted}`}>Select a raster image to preview a colour vector trace before it replaces the photo. Layered SVG stacks a black underbase plus one cut sheet per colour for Cricut.</p>
              </div>
          </>
        )}

        {activeTab === 'layers' && (
          <div className="flex flex-col gap-1.5">
            {canvasObjects.length === 0 && <div className={`text-center mt-10 ${textMuted} text-xs italic opacity-50`}>Canvas is empty</div>}
            {[...canvasObjects].reverse().map((obj, i) => {
              const isSelected = activeObj === obj;
              return (
                <div key={i} onClick={() => { canvas?.setActiveObject(obj); canvas?.requestRenderAll(); setTool('select'); }} className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer border transition-colors ${isSelected ? 'bg-blue-500/10 border-blue-500/50' : `border-transparent ${isDark?'hover:bg-slate-800':'hover:bg-slate-100'}`}`}>
                  <div className="flex items-center gap-2 overflow-hidden">
                    <button onClick={(e) => { e.stopPropagation(); obj.set('visible', !obj.visible); canvas?.requestRenderAll(); saveHistorySnapshot(canvas!, true); }} className={`p-1.5 hover:bg-slate-700/50 rounded ${obj.visible ? textMain : 'text-red-400'}`}>
                      {obj.visible ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>}
                    </button>
                    <span className="text-xs font-bold truncate w-28">{obj.type === 'i-text' ? `Text: ${(obj as fabric.IText).text}` : ((obj as fabric.Object & { name?: string }).name || (obj.type === 'image' ? 'Image' : (obj.type === 'path' ? 'Stroke' : (obj.type === 'polyline' ? 'Track Line' : (obj.type === 'polygon' ? 'Shape' : obj.type)))))}</span>
                  </div>
                  <div className="flex items-center bg-slate-800/30 rounded-lg p-0.5 border border-slate-700/50">
                    <button onClick={(e) => {
                      e.stopPropagation();
                      const orderedCanvas = canvas as unknown as { bringObjectForward?: (obj: fabric.Object) => void };
                      orderedCanvas.bringObjectForward?.(obj);
                      saveHistorySnapshot(canvas!, true);
                    }} className={`p-1.5 rounded-md ${btnHover}`}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6"/></svg></button>
                    <button onClick={(e) => {
                      e.stopPropagation();
                      const orderedCanvas = canvas as unknown as { sendObjectBackwards?: (obj: fabric.Object) => void };
                      orderedCanvas.sendObjectBackwards?.(obj);
                      saveHistorySnapshot(canvas!, true);
                    }} className={`p-1.5 rounded-md ${btnHover}`}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6-6-6"/></svg></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
});

type TextAlign = 'left' | 'center' | 'right';

function normalizeTextAlign(value: string | undefined): TextAlign {
  if (value === 'center' || value === 'right') return value;
  return 'left';
}

function TextAlignControl({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (next: TextAlign) => void;
}) {
  const align = normalizeTextAlign(value);

  const options: { id: TextAlign; label: string }[] = [
    { id: 'left', label: 'Left' },
    { id: 'center', label: 'Centre' },
    { id: 'right', label: 'Right' },
  ];

  return (
    <div>
      <div className="mb-2 text-xs font-bold">Align</div>
      <div role="group" aria-label="Text alignment" data-testid="text-align" className="flex gap-1 rounded-lg border border-slate-700 bg-[#0f111a] p-1">
        {options.map((option) => {
          const selected = align === option.id;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`text-align-${option.id}`}
              aria-pressed={selected}
              onClick={() => {
                if (selected) return;
                onChange(option.id);
              }}
              className={`min-h-11 flex-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${selected ? 'bg-[#FF1493] text-black' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InspectorBtn({ icon, onClick, tooltip }: { icon: React.ReactNode; onClick: () => void; tooltip?: string }) {
  return (
    <button onClick={onClick} title={tooltip} className="flex-1 py-2 flex justify-center items-center rounded-lg border border-slate-700 bg-slate-800/30 hover:bg-slate-700 transition-colors text-slate-400">
      {icon}
    </button>
  );
}

function PropInput({ label, value, onChange, isDark }: { label: string; value: number; onChange: (v: string) => void; isDark: boolean }) {
  return (
    <div className={`flex items-center rounded-lg border ${isDark?'border-slate-700 bg-[#0f111a]':'border-slate-200 bg-slate-50'} overflow-hidden focus-within:border-blue-500 transition-colors`}>
      <span className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 bg-slate-800/50">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent text-xs font-bold p-1.5 outline-none font-mono" />
    </div>
  );
}