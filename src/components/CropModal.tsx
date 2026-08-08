/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect } from 'react';

interface CropModalProps {
  imageUrl: string;
  onCrop: (base64: string, asVector: boolean, smoothness: number) => void;
  onCancel: () => void;
}

type DragMode = 'new' | 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null;

export function CropModal({ imageUrl, onCrop, onCancel }: CropModalProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    
    const [cropBox, setCropBox] = useState<{x: number, y: number, w: number, h: number} | null>(null);
    const [dragMode, setDragMode] = useState<DragMode>(null);
    const dragStart = useRef({ x: 0, y: 0, box: { x: 0, y: 0, w: 0, h: 0 } });
    
    // Kept the upscaler, just renamed it for clarity since we removed vector tracing
    const [smoothness, setSmoothness] = useState<number>(5);

    const getPointer = (e: any) => {
        if (!imgRef.current) return { x: 0, y: 0 };
        const rect = imgRef.current.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: Math.max(0, Math.min(clientX - rect.left, rect.width)),
            y: Math.max(0, Math.min(clientY - rect.top, rect.height))
        };
    };

    const handlePointerDown = (e: any, mode: DragMode) => {
        e.stopPropagation();
        if (e.type === 'mousedown' && e.button !== 0) return; 
        const pt = getPointer(e);
        setDragMode(mode);
        dragStart.current = {
            x: pt.x,
            y: pt.y,
            box: cropBox ? { ...cropBox } : { x: pt.x, y: pt.y, w: 0, h: 0 }
        };
        if (mode === 'new') setCropBox({ x: pt.x, y: pt.y, w: 0, h: 0 });
    };

    useEffect(() => {
        if (!dragMode) return;
        const handlePointerMove = (e: any) => {
            if (!imgRef.current) return;
            const pt = getPointer(e);
            const dx = pt.x - dragStart.current.x;
            const dy = pt.y - dragStart.current.y;
            const sb = dragStart.current.box;
            const rect = imgRef.current.getBoundingClientRect();

            let nx = sb.x; let ny = sb.y; let nw = sb.w; let nh = sb.h;

            if (dragMode === 'new') {
                nx = Math.min(dragStart.current.x, pt.x); ny = Math.min(dragStart.current.y, pt.y);
                nw = Math.abs(pt.x - dragStart.current.x); nh = Math.abs(pt.y - dragStart.current.y);
            } else if (dragMode === 'move') {
                nx = Math.max(0, Math.min(sb.x + dx, rect.width - sb.w)); ny = Math.max(0, Math.min(sb.y + dy, rect.height - sb.h));
            } else {
                if (dragMode.includes('w')) { const right = sb.x + sb.w; nx = Math.min(right, Math.max(0, sb.x + dx)); nw = right - nx; }
                if (dragMode.includes('e')) { nw = Math.max(0, Math.min(sb.w + dx, rect.width - sb.x)); }
                if (dragMode.includes('n')) { const bottom = sb.y + sb.h; ny = Math.min(bottom, Math.max(0, sb.y + dy)); nh = bottom - ny; }
                if (dragMode.includes('s')) { nh = Math.max(0, Math.min(sb.h + dy, rect.height - sb.y)); }
            }
            setCropBox({ x: nx, y: ny, w: nw, h: nh });
        };
        const handlePointerUp = () => setDragMode(null);
        window.addEventListener('mousemove', handlePointerMove); window.addEventListener('mouseup', handlePointerUp);
        window.addEventListener('touchmove', handlePointerMove, { passive: false }); window.addEventListener('touchend', handlePointerUp);
        return () => {
            window.removeEventListener('mousemove', handlePointerMove); window.removeEventListener('mouseup', handlePointerUp);
            window.removeEventListener('touchmove', handlePointerMove); window.removeEventListener('touchend', handlePointerUp);
        };
    }, [dragMode]);

    const executeCrop = () => {
        if (!cropBox || cropBox.w < 10 || cropBox.h < 10) {
            // Always pass false for vector tracing here now
            onCrop(imageUrl, false, smoothness);
            return;
        }
        const img = imgRef.current;
        if (!img) return;

        const rect = img.getBoundingClientRect();
        const scaleX = img.naturalWidth / rect.width;
        const scaleY = img.naturalHeight / rect.height;

        const sx = cropBox.x * scaleX;
        const sy = cropBox.y * scaleY;
        const sw = cropBox.w * scaleX;
        const sh = cropBox.h * scaleY;

        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            onCrop(canvas.toDataURL('image/png'), false, smoothness);
        }
    };

    const renderHandle = (mode: DragMode, cursor: string, style: React.CSSProperties) => (
        <div 
            onMouseDown={(e) => handlePointerDown(e, mode)} onTouchStart={(e) => handlePointerDown(e, mode)}
            className="absolute bg-white border-2 border-[#FF1493] rounded-sm shadow-lg z-30 transition-transform hover:scale-125"
            style={{ ...style, width: '14px', height: '14px', cursor, transform: 'translate(-50%, -50%)', pointerEvents: 'auto' }}
        />
    );

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#0f111a]/95 select-none backdrop-blur-sm">
            <div className="flex-none p-6 text-white text-center">
                <h2 className="text-2xl font-black tracking-widest uppercase mb-2">Crop Upload</h2>
                <p className="text-sm text-slate-400">Click and drag to isolate your sticker. Pull the anchors to adjust.</p>
            </div>
            
            <div className="flex-1 w-full flex items-center justify-center touch-none p-2 md:p-4 min-h-0">
                <div ref={containerRef} className="relative w-full max-w-5xl max-h-[85vh] min-h-0 flex items-center justify-center bg-slate-900/90 shadow-2xl border border-slate-700 rounded-lg" style={{ fontSize: 0, lineHeight: 0 }}>
                    <img ref={imgRef} src={imageUrl} alt="Target" className="pointer-events-none block max-w-full max-h-full w-auto h-auto object-contain" draggable={false} />
                    <div className="absolute inset-0 z-10 cursor-crosshair pointer-events-auto" onMouseDown={(e) => handlePointerDown(e, 'new')} onTouchStart={(e) => handlePointerDown(e, 'new')} />
                    {cropBox && (cropBox.w > 0 || dragMode === 'new') && (
                        <div className="absolute z-20 border-[3px] border-[#FF1493] box-border" style={{ left: cropBox.x, top: cropBox.y, width: cropBox.w, height: cropBox.h, boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)' }}>
                            <div className="absolute inset-0 cursor-move pointer-events-auto" onMouseDown={(e) => handlePointerDown(e, 'move')} onTouchStart={(e) => handlePointerDown(e, 'move')} />
                            {renderHandle('nw', 'nwse-resize', { top: 0, left: 0 })} {renderHandle('n', 'ns-resize', { top: 0, left: '50%' })} {renderHandle('ne', 'nesw-resize', { top: 0, left: '100%' })} {renderHandle('e', 'ew-resize', { top: '50%', left: '100%' })} {renderHandle('se', 'nwse-resize', { top: '100%', left: '100%' })} {renderHandle('s', 'ns-resize', { top: '100%', left: '50%' })} {renderHandle('sw', 'nesw-resize', { top: '100%', left: 0 })} {renderHandle('w', 'ew-resize', { top: '50%', left: 0 })}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-none p-6 bg-[#181a25] border-t border-slate-800">
                <div className="max-w-md mx-auto mb-6">
                    <div className="flex justify-between items-center text-xs font-bold text-[#FF1493] mb-3 uppercase tracking-wider">
                        <span>Image Resolution Multiplier</span>
                        <span className="bg-[#FF1493]/20 px-2 py-0.5 rounded">{smoothness}x</span>
                    </div>
                    <input 
                        type="range" min="1" max="10" 
                        value={smoothness} onChange={e => setSmoothness(Number(e.target.value))} 
                        className="w-full accent-[#FF1493] cursor-pointer" 
                    />
                    <p className="text-[10px] text-slate-500 mt-2 text-center">Increase multiplier to upscale the raw image resolution before adding.</p>
                </div>

                <div className="flex justify-center gap-4">
                    <button onClick={onCancel} className="px-6 py-3 rounded-lg font-bold text-white bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-600">Cancel</button>
                    <button onClick={() => executeCrop()} className="px-8 py-3 rounded-lg font-black uppercase tracking-wider text-white bg-[#FF1493] hover:bg-[#ff4da6] transition-all shadow-lg shadow-[#FF1493]/20 hover:shadow-[#FF1493]/40 hover:-translate-y-0.5 active:translate-y-0">
                        Add to Canvas
                    </button>
                </div>
            </div>
        </div>
    );
}