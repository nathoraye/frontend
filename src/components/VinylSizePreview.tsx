import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

const PRESETS_MM = [50, 75, 100, 150];
const MIN_MM = 20;
const MAX_MM = 300;

interface VinylSizePreviewProps {
  designDataUrl: string | null;
  widthCm: number;
  heightCm: number;
  onSizeChange: (widthCm: number, heightCm: number) => void;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function VinylSizePreview({ designDataUrl, widthCm, heightCm, onSizeChange }: VinylSizePreviewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [units, setUnits] = useState<'mm' | 'cm'>('mm');
  const [aspect, setAspect] = useState(1);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const widthMm = Math.max(MIN_MM, Math.min(MAX_MM, (widthCm || 10) * 10));
  const heightMm = Math.max(MIN_MM, Math.min(MAX_MM, (heightCm || 10) * 10));

  useEffect(() => {
    if (!designDataUrl) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setAspect(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = designDataUrl;
  }, [designDataUrl]);

  const setSizeMm = (nextW: number, lockAspect = true) => {
    const w = Math.max(MIN_MM, Math.min(MAX_MM, nextW));
    const h = lockAspect ? Math.max(MIN_MM, Math.min(MAX_MM, w / (aspect || 1))) : heightMm;
    onSizeChange(round1(w / 10), round1(h / 10));
  };

  const displayW = units === 'mm' ? Math.round(widthMm) : round1(widthMm / 10);
  const displayH = units === 'mm' ? Math.round(heightMm) : round1(heightMm / 10);
  const unitLabel = units === 'mm' ? 'mm' : 'cm';

  const gridStyle = useMemo(
    () => ({
      backgroundImage:
        'linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px)',
      backgroundSize: '20px 20px',
    }),
    [],
  );

  const onPointerDown = (event: ReactPointerEvent) => {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startW: widthMm };
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!dragRef.current || !stageRef.current) return;
    const bounds = stageRef.current.getBoundingClientRect();
    const dx = event.clientX - dragRef.current.startX;
    const deltaMm = (dx / bounds.width) * MAX_MM;
    setSizeMm(dragRef.current.startW + deltaMm);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-mono text-pink-500">Sticker size</h3>
        <div className="flex rounded border border-gray-700 overflow-hidden text-[10px] font-mono uppercase">
          <button
            type="button"
            className={`px-2 py-1 ${units === 'mm' ? 'bg-pink-500 text-gray-900' : 'text-gray-400'}`}
            onClick={() => setUnits('mm')}
          >
            mm
          </button>
          <button
            type="button"
            className={`px-2 py-1 ${units === 'cm' ? 'bg-pink-500 text-gray-900' : 'text-gray-400'}`}
            onClick={() => setUnits('cm')}
          >
            cm
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className="relative h-72 overflow-hidden rounded border border-gray-700 bg-[#1a1d24]"
        style={gridStyle}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="absolute inset-x-3 top-2 flex justify-between text-[10px] font-mono text-slate-500">
          <span>0</span>
          <span>{units === 'mm' ? '300 mm' : '30 cm'}</span>
        </div>
        <div
          className="absolute left-1/2 top-1/2 max-h-[70%] max-w-[70%] -translate-x-1/2 -translate-y-1/2"
          style={{ width: `${(widthMm / MAX_MM) * 70}%` }}
        >
          {designDataUrl ? (
            <img src={designDataUrl} alt="Sticker preview" className="h-auto w-full select-none object-contain drop-shadow-lg" draggable={false} />
          ) : (
            <div className="flex h-32 items-center justify-center border border-dashed border-pink-500/40 text-xs font-mono text-slate-500">
              No design snapshot
            </div>
          )}
          <button
            type="button"
            aria-label="Scale sticker size"
            className="absolute -bottom-1 -right-1 h-4 w-4 cursor-nwse-resize rounded-sm border border-white bg-[#FF1493]"
            onPointerDown={onPointerDown}
          />
        </div>
      </div>

      <p className="text-center font-mono text-sm text-gray-200">
        {displayW} × {displayH} {unitLabel}
      </p>

      <div className="flex flex-wrap gap-2">
        {PRESETS_MM.map((mm) => (
          <button
            key={mm}
            type="button"
            onClick={() => setSizeMm(mm)}
            className={`rounded border px-2 py-1 font-mono text-[10px] uppercase ${
              Math.abs(widthMm - mm) < 1 ? 'border-pink-500 text-pink-400' : 'border-gray-700 text-gray-400 hover:text-gray-200'
            }`}
          >
            {units === 'mm' ? `${mm} mm` : `${mm / 10} cm`}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-3 text-xs font-mono text-gray-400">
        Longest side
        <input
          type="range"
          min={MIN_MM}
          max={MAX_MM}
          value={Math.max(widthMm, heightMm)}
          onChange={(e) => {
            const longest = Number(e.target.value);
            if (aspect >= 1) setSizeMm(longest);
            else setSizeMm(longest * aspect);
          }}
          className="flex-1 accent-pink-500"
        />
      </label>
      <p className="text-[10px] font-mono text-slate-500">
        Drag the pink handle to scale. Aspect ratio stays locked to your artwork. Max cut size is 300 mm.
      </p>
    </div>
  );
}
