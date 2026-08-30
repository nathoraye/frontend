import { useMemo } from 'react';
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
}

/** Front/back flat mockup with the current design composited onto the print zone. */
export function ApparelMockupViewer({
  productId,
  color,
  activeView,
  designDataUrl,
  placement,
}: ApparelMockupViewerProps) {
  const mockup = useMemo(() => getMockupView(productId, activeView, color), [productId, activeView, color]);

  const designStyle = useMemo(() => {
    if (!mockup) return undefined;
    const zone = mockup.printZone;
    return {
      left: `${zone.centerX + placement.posX * 0.25}%`,
      top: `${zone.centerY - placement.posY * 0.25}%`,
      width: `${zone.widthPct * placement.scale}%`,
      maxHeight: `${zone.heightPct * placement.scale}%`,
      transform: `translate(-50%, -50%) rotate(${placement.rotationDeg}deg)`,
    };
  }, [mockup, placement.posX, placement.posY, placement.scale, placement.rotationDeg]);

  if (!mockup) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0f111a] p-6 text-center">
        <p className="max-w-sm text-sm font-mono text-slate-400">
          Flat mockup preview is not available for this product yet. Choose a T-shirt or hoodie to preview front and back views.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-[#0f111a] p-4">
      <div className="relative w-full max-w-[520px]">
        <img
          src={mockup.imageSrc}
          alt={`${mockup.label} mockup`}
          className="mx-auto h-auto max-h-[min(72vh,640px)] w-full select-none object-contain"
          draggable={false}
        />

        {designDataUrl ? (
          <img
            src={designDataUrl}
            alt="Design preview"
            className="pointer-events-none absolute object-contain drop-shadow-md"
            style={designStyle}
            draggable={false}
          />
        ) : null}
      </div>
    </div>
  );
}

export default ApparelMockupViewer;
