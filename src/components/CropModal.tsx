/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect } from 'react';

interface CropModalProps {
  imageUrl: string;
  onCrop: (base64: string, asVector: boolean, smoothness: number) => void;
  onCancel: () => void;
}

type DragMode = 'new' | 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null;

export function CropModal({ imageUrl, onCrop, onCancel }: CropModalProps) {
    const stageRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    const [cropBox, setCropBox] = useState<{x: number, y: number, w: number, h: number} | null>(null);
    const [dragMode, setDragMode] = useState<DragMode>(null);
    const dragStart = useRef({ x: 0, y: 0, box: { x: 0, y: 0, w: 0, h: 0 } });
    const [stagePx, setStagePx] = useState({ w: 0, h: 0 });

    const [smoothness, setSmoothness] = useState<number>(5);
    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        const update = () => {
            setStagePx({ w: el.clientWidth, h: el.clientHeight });
            requestAnimationFrame(() => {
                const img = imgRef.current;
                if (!img) return;
                const rect = img.getBoundingClientRect();
                if (rect.width < 2 || rect.height < 2) return;
                setCropBox({ x: 0, y: 0, w: rect.width, h: rect.height });
            });
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const fitCropToImage = () => {
        const img = imgRef.current;
        if (!img) return;
        const rect = img.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;
        setCropBox({ x: 0, y: 0, w: rect.width, h: rect.height });
    };

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
        e.preventDefault();
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
                nx = Math.min(dragStart.current.x, pt.x);
                ny = Math.min(dragStart.current.y, pt.y);
                nw = Math.abs(pt.x - dragStart.current.x);
                nh = Math.abs(pt.y - dragStart.current.y);
            } else if (dragMode === 'move') {
                nx = Math.max(0, Math.min(sb.x + dx, rect.width - sb.w));
                ny = Math.max(0, Math.min(sb.y + dy, rect.height - sb.h));
            } else {
                if (dragMode.includes('w')) { const right = sb.x + sb.w; nx = Math.min(right, Math.max(0, sb.x + dx)); nw = right - nx; }
                if (dragMode.includes('e')) { nw = Math.max(0, Math.min(sb.w + dx, rect.width - sb.x)); }
                if (dragMode.includes('n')) { const bottom = sb.y + sb.h; ny = Math.min(bottom, Math.max(0, sb.y + dy)); nh = bottom - ny; }
                if (dragMode.includes('s')) { nh = Math.max(0, Math.min(sb.h + dy, rect.height - sb.y)); }
            }
            setCropBox({ x: nx, y: ny, w: nw, h: nh });
        };
        const handlePointerUp = () => setDragMode(null);
        window.addEventListener('mousemove', handlePointerMove);
        window.addEventListener('mouseup', handlePointerUp);
        window.addEventListener('touchmove', handlePointerMove, { passive: false });
        window.addEventListener('touchend', handlePointerUp);
        return () => {
            window.removeEventListener('mousemove', handlePointerMove);
            window.removeEventListener('mouseup', handlePointerUp);
            window.removeEventListener('touchmove', handlePointerMove);
            window.removeEventListener('touchend', handlePointerUp);
        };
    }, [dragMode]);

    const executeCrop = () => {
        const img = imgRef.current;
        if (!img) return;

        const rect = img.getBoundingClientRect();

        const targetBox = (cropBox && cropBox.w >= 10 && cropBox.h >= 10)
            ? cropBox
            : { x: 0, y: 0, w: rect.width, h: rect.height };

        const scaleX = img.naturalWidth / rect.width;
        const scaleY = img.naturalHeight / rect.height;

        const sx = targetBox.x * scaleX;
        const sy = targetBox.y * scaleY;
        const sw = targetBox.w * scaleX;
        const sh = targetBox.h * scaleY;

        const targetWidth = Math.max(1, Math.round(sw * (smoothness / 5)));
        const targetHeight = Math.max(1, Math.round(sh * (smoothness / 5)));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
            onCrop(canvas.toDataURL('image/png'), false, smoothness);
        }
    };

    const renderHandle = (mode: DragMode, cursor: string, style: React.CSSProperties) => (
        <div
            onMouseDown={(e) => handlePointerDown(e, mode)}
            onTouchStart={(e) => handlePointerDown(e, mode)}
            className="absolute bg-white border-2 border-[#FF1493] rounded-sm shadow-lg z-30 transition-transform hover:scale-125"
            style={{ ...style, width: '14px', height: '14px', cursor, transform: 'translate(-50%, -50%)', pointerEvents: 'auto' }}
        />
    );

    const imgMaxStyle: React.CSSProperties = stagePx.w > 0 && stagePx.h > 0
        ? {
            maxWidth: Math.max(40, stagePx.w - 16),
            maxHeight: Math.max(40, stagePx.h - 32),
            width: 'auto',
            height: 'auto',
          }
        : { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' };

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#0f111a]/95 select-none backdrop-blur-sm">
            <div className="shrink-0 px-3 py-2 text-white text-center">
                <h2 className="text-base md:text-xl font-black tracking-widest uppercase">Crop Upload</h2>
                <p className="text-[11px] text-slate-400">Drag to isolate the sticker. Pull the anchors to adjust.</p>
            </div>

            <div ref={stageRef} className="min-h-0 flex-1 overflow-hidden px-3 py-2">
                <div className="flex h-full w-full items-center justify-center">
                    <div className="relative inline-block" style={{ fontSize: 0, lineHeight: 0 }}>
                        <img
                            ref={imgRef}
                            src={imageUrl}
                            alt="Target"
                            onLoad={fitCropToImage}
                            className="pointer-events-none block object-contain rounded"
                            style={imgMaxStyle}
                            draggable={false}
                        />
                        <div
                            className="absolute inset-0 z-10 cursor-crosshair pointer-events-auto"
                            onMouseDown={(e) => handlePointerDown(e, 'new')}
                            onTouchStart={(e) => handlePointerDown(e, 'new')}
                        />
                        {cropBox && (cropBox.w > 0 || dragMode === 'new') && (
                            <div
                                className="absolute z-20 border-[3px] border-[#FF1493] box-border pointer-events-none"
                                style={{
                                    left: cropBox.x,
                                    top: cropBox.y,
                                    width: cropBox.w,
                                    height: cropBox.h,
                                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75)'
                                }}
                            >
                                <div
                                    className="absolute inset-0 cursor-move pointer-events-auto"
                                    onMouseDown={(e) => handlePointerDown(e, 'move')}
                                    onTouchStart={(e) => handlePointerDown(e, 'move')}
                                />
                                {renderHandle('nw', 'nwse-resize', { top: 0, left: 0 })}
                                {renderHandle('n', 'ns-resize', { top: 0, left: '50%' })}
                                {renderHandle('ne', 'nesw-resize', { top: 0, left: '100%' })}
                                {renderHandle('e', 'ew-resize', { top: '50%', left: '100%' })}
                                {renderHandle('se', 'nwse-resize', { top: '100%', left: '100%' })}
                                {renderHandle('s', 'ns-resize', { top: '100%', left: '50%' })}
                                {renderHandle('sw', 'nesw-resize', { top: '100%', left: 0 })}
                                {renderHandle('w', 'ew-resize', { top: '50%', left: 0 })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="shrink-0 max-h-[28vh] overflow-y-auto border-t border-slate-800 bg-[#181a25] px-3 py-2">
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowAdvanced((v) => !v)}
                        className="h-8 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200"
                    >
                        {showAdvanced ? 'Hide resolution' : 'Resolution'}
                    </button>
                    {showAdvanced && (
                        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#FF1493]">
                            <span>{smoothness}x</span>
                            <input
                                type="range" min="1" max="10"
                                value={smoothness} onChange={e => setSmoothness(Number(e.target.value))}
                                className="w-28 accent-[#FF1493] cursor-pointer"
                            />
                        </label>
                    )}
                    <button
                        onClick={onCancel}
                        className="h-8 px-4 rounded-lg font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-600"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={executeCrop}
                        className="h-8 px-5 rounded-lg font-black uppercase tracking-wider text-white bg-[#FF1493] hover:bg-[#ff4da6] shadow-lg shadow-[#FF1493]/20"
                    >
                        Add to Canvas
                    </button>
                </div>
            </div>
        </div>
    );
}
