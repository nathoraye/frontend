import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ProductId } from '../three/productCatalog';
import { getMockupView } from '../three/mockupCatalog';

export interface ProductPlacement {
  posX: number;
  posY: number;
  scale: number;
  rotationDeg: number;
}

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

/** Front/back flat mockup with the current design composited onto the print zone. */
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

  useEffect(() => {
    setFailedSrc(null);
  }, [mockup?.imageSrc]);

  const designStyle = useMemo(() => {
    if (!mockup) return undefined;
    const zone = mockup.printZone;
    return {
      left: `${zone.centerX + placement.posX * 0.25}%`,
      top: `${zone.centerY - placement.posY * 0.25}%`,
      width: `${zone.widthPct * placement.scale}%`,
      height: `${zone.heightPct * placement.scale}%`,
      transform: `translate(-50%, -50%) rotate(${placement.rotationDeg}deg)`,
    };
  }, [mockup, placement.posX, placement.posY, placement.scale, placement.rotationDeg]);

  const clampPlacement = (next: ProductPlacement): ProductPlacement => ({
    posX: Math.max(-80, Math.min(80, next.posX)),
    posY: Math.max(-80, Math.min(80, next.posY)),
    scale: Math.max(0.2, Math.min(3, next.scale)),
    rotationDeg: next.rotationDeg,
  });

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
      const posX = origin.posX + (dx / bounds.width) * 400;
      const posY = origin.posY - (dy / bounds.height) * 400;
      onPlacementChange(clampPlacement({ ...origin, posX, posY }));
      return;
    }

    if (kind === 'scale') {
      const delta = (dx - dy) / Math.max(120, bounds.width * 0.25);
      onPlacementChange(clampPlacement({ ...origin, scale: origin.scale + delta }));
      return;
    }

    if (kind === 'rotate') {
      const zone = mockup.printZone;
      const centerX = bounds.left + (bounds.width * (zone.centerX + origin.posX * 0.25)) / 100;
      const centerY = bounds.top + (bounds.height * (zone.centerY - origin.posY * 0.25)) / 100;
      const startAngle = Math.atan2(startY - centerY, startX - centerX);
      const nowAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
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
    <div className="relative flex h-full w-full items-center justify-center bg-[#0f111a] p-4">
      <div
        ref={garmentRef}
        className="relative flex h-full max-h-[min(72vh,640px)] w-auto max-w-[520px] items-center justify-center"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          src={imageSrc}
          alt={tintWithColor ? '' : `${mockup.label} mockup`}
          aria-hidden={tintWithColor || undefined}
          className={`h-full w-auto max-w-full select-none object-contain ${tintWithColor ? 'opacity-0' : ''}`}
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
            <img
              src={designDataUrl}
              alt="Design preview"
              className="pointer-events-none h-full w-full select-none object-contain drop-shadow-md"
              draggable={false}
            />
            {interactive && (
              <>
                <button
                  type="button"
                  aria-label="Rotate print"
                  className="absolute -top-5 left-1/2 z-10 h-3 w-3 -translate-x-1/2 rounded-full border border-white bg-emerald-400"
                  onPointerDown={(event) => beginDrag('rotate', event)}
                />
                <button
                  type="button"
                  aria-label="Scale print"
                  className="absolute -bottom-1 -right-1 z-10 h-3 w-3 rounded-sm border border-white bg-[#FF1493]"
                  onPointerDown={(event) => beginDrag('scale', event)}
                />
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ApparelMockupViewer;
