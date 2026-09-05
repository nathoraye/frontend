import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ProductId } from '../three/productCatalog';
import { getMockupView } from '../three/mockupCatalog';
import {
  clampPlacement,
  type ProductPlacement,
} from '../utils/apparelPlacement';

export interface ApparelMockupViewerProps {
  productId: ProductId;
  color: string;
  activeView: string;
  designDataUrl: string | null;
  placement: ProductPlacement;
  interactive?: boolean;
  onPlacementChange?: (placement: ProductPlacement) => void;
}

type DragKind = 'move' | 'scale' | 'rotate' | null;

const FALLBACK_SRC = '/mockups/tshirt-front.svg';

function isDarkHex(color: string): boolean {
  const hex = color.replace('#', '');
  if (hex.length !== 6 && hex.length !== 3) return false;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 80;
}

function Handle({
  label,
  kind,
  className,
  onBegin,
}: {
  label: string;
  kind: Exclude<DragKind, 'move' | null>;
  className: string;
  onBegin: (kind: Exclude<DragKind, 'move' | null>, event: ReactPointerEvent) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`absolute z-20 flex h-11 w-11 items-center justify-center touch-none ${className}`}
      onPointerDown={(event) => onBegin(kind, event)}
    >
      <span className="h-4 w-4 rounded-sm border-2 border-white bg-[#FF1493] shadow-md shadow-black/50" />
    </button>
  );
}

/** Front/back flat mockup with the current design composited onto the garment. */
export function ApparelMockupViewer({
  productId,
  color,
  activeView,
  designDataUrl,
  placement,
  interactive = false,
  onPlacementChange,
}: ApparelMockupViewerProps) {
  const mockup = useMemo(
    () => getMockupView(productId, activeView, color),
    [productId, activeView, color],
  );
  const garmentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ kind: DragKind; startX: number; startY: number; origin: ProductPlacement } | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const designStyle = useMemo(() => {
    if (!mockup) return undefined;
    const zone = mockup.printZone;
    return {
      left: `${zone.centerX + placement.posX}%`,
      top: `${zone.centerY - placement.posY}%`,
      width: `${zone.widthPct * placement.scale}%`,
      height: `${zone.heightPct * placement.scale}%`,
      transform: `translate(-50%, -50%) rotate(${placement.rotationDeg}deg)`,
    };
  }, [mockup, placement.posX, placement.posY, placement.scale, placement.rotationDeg]);

  const designCenter = (bounds: DOMRect, origin: ProductPlacement) => {
    const zone = mockup!.printZone;
    return {
      x: bounds.left + (bounds.width * (zone.centerX + origin.posX)) / 100,
      y: bounds.top + (bounds.height * (zone.centerY - origin.posY)) / 100,
    };
  };

  const beginDrag = (kind: DragKind, event: ReactPointerEvent) => {
    if (!interactive || !onPlacementChange) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { kind, startX: event.clientX, startY: event.clientY, origin: { ...placement } };
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!dragRef.current || !onPlacementChange || !garmentRef.current || !mockup) return;
    const { kind, startX, startY, origin } = dragRef.current;
    const bounds = garmentRef.current.getBoundingClientRect();
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (kind === 'move') {
      const posX = origin.posX + (dx / Math.max(1, bounds.width)) * 100;
      const posY = origin.posY - (dy / Math.max(1, bounds.height)) * 100;
      onPlacementChange(clampPlacement({ ...origin, posX, posY }));
      return;
    }

    if (kind === 'scale') {
      const center = designCenter(bounds, origin);
      const startDist = Math.hypot(startX - center.x, startY - center.y);
      const nowDist = Math.hypot(event.clientX - center.x, event.clientY - center.y);
      const ratio = startDist > 4 ? nowDist / startDist : 1;
      onPlacementChange(clampPlacement({ ...origin, scale: origin.scale * ratio }));
      return;
    }

    if (kind === 'rotate') {
      const center = designCenter(bounds, origin);
      const startAngle = Math.atan2(startY - center.y, startX - center.x);
      const nowAngle = Math.atan2(event.clientY - center.y, event.clientX - center.x);
      const deg = origin.rotationDeg + ((nowAngle - startAngle) * 180) / Math.PI;
      onPlacementChange({ ...origin, rotationDeg: Math.round(deg) });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  if (!mockup) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0f111a] p-6 text-center">
        <p className="max-w-sm text-sm font-mono text-slate-400">
          Flat mockup preview is not available for this product yet. Choose a T-shirt or hoodie to preview front and back views.
        </p>
      </div>
    );
  }

  const imageSrc = failedSrc === mockup.imageSrc ? FALLBACK_SRC : mockup.imageSrc;
  const tintWithColor = mockup.tintWithColor === true;
  const darkGarment = isDarkHex(color);
  const maskStyle = {
    backgroundColor: color,
    WebkitMaskImage: `url(${imageSrc})`,
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskImage: `url(${imageSrc})`,
    maskRepeat: 'no-repeat',
    maskPosition: 'center',
    maskSize: 'contain',
  } as const;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-visible bg-[#0f111a] p-4">
      <div
        ref={garmentRef}
        className="relative h-full max-h-[min(72vh,640px)] w-fit max-w-[520px] overflow-visible"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          src={imageSrc}
          alt={tintWithColor ? '' : `${mockup.label} mockup`}
          aria-hidden={tintWithColor || undefined}
          className={`block h-full w-auto max-w-full select-none object-contain ${tintWithColor ? 'opacity-0' : ''}`}
          draggable={false}
          onError={() => setFailedSrc(mockup.imageSrc)}
        />
        {tintWithColor ? (
          <>
            <div className="absolute inset-0" style={maskStyle} />
            <img
              src={imageSrc}
              alt={`${mockup.label} mockup`}
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
              style={{ mixBlendMode: darkGarment ? 'screen' : 'multiply', opacity: darkGarment ? 0.28 : 0.5 }}
              draggable={false}
            />
          </>
        ) : null}

        {designDataUrl ? (
          <div
            className={`absolute ${interactive ? 'cursor-move touch-none' : 'pointer-events-none'}`}
            style={designStyle}
            onPointerDown={(event) => beginDrag('move', event)}
          >
            {interactive ? (
              <div className="pointer-events-none absolute -inset-1 rounded-sm border-2 border-[#FF1493] shadow-[0_0_0_1px_rgba(0,0,0,0.45)]" />
            ) : null}
            <img
              src={designDataUrl}
              alt="Design preview"
              className="pointer-events-none h-full w-full select-none object-contain drop-shadow-md"
              draggable={false}
            />
            {interactive && (
              <>
                <span className="pointer-events-none absolute left-1/2 top-0 z-10 h-6 w-px -translate-x-1/2 -translate-y-full bg-emerald-400" />
                <button
                  type="button"
                  aria-label="Rotate print"
                  className="absolute left-1/2 top-0 z-20 flex h-11 w-11 -translate-x-1/2 -translate-y-[calc(100%+4px)] items-center justify-center touch-none"
                  onPointerDown={(event) => beginDrag('rotate', event)}
                >
                  <span className="h-4 w-4 rounded-full border-2 border-white bg-emerald-400 shadow-md shadow-black/50" />
                </button>
                <Handle label="Scale from top left" kind="scale" className="-left-5 -top-5 cursor-nwse-resize" onBegin={beginDrag} />
                <Handle label="Scale from top right" kind="scale" className="-right-5 -top-5 cursor-nesw-resize" onBegin={beginDrag} />
                <Handle label="Scale from bottom left" kind="scale" className="-bottom-5 -left-5 cursor-nesw-resize" onBegin={beginDrag} />
                <Handle label="Scale from bottom right" kind="scale" className="-bottom-5 -right-5 cursor-nwse-resize" onBegin={beginDrag} />
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ApparelMockupViewer;
