import type { Canvas as FabricCanvas } from 'fabric';

/**
 * Checkout must not ship blob: or short-lived object URLs inside designSvg —
 * those die after revokeObjectURL / when the jobs board loads the order later.
 * Re-encode every raster image as a durable data URL before canvas.toSVG().
 */
export async function embedCanvasImagesAsDataUrls(canvas: FabricCanvas): Promise<void> {
  const images = canvas.getObjects().filter((obj) => obj.type === 'image');
  await Promise.all(
    images.map(async (img) => {
      const image = img as typeof img & {
        getElement?: () => HTMLImageElement | HTMLCanvasElement | undefined;
        setSrc?: (src: string, options?: { crossOrigin?: string }) => Promise<unknown>;
      };
      const element = image.getElement?.();
      if (!element) return;

      let dataUrl = '';
      if ('toDataURL' in element && typeof element.toDataURL === 'function') {
        dataUrl = element.toDataURL('image/png');
      } else if (element instanceof HTMLImageElement) {
        const src = element.currentSrc || element.src || '';
        if (src.startsWith('data:')) return;
        const off = document.createElement('canvas');
        off.width = element.naturalWidth || element.width || 1;
        off.height = element.naturalHeight || element.height || 1;
        const ctx = off.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(element, 0, 0);
        dataUrl = off.toDataURL('image/png');
      }
      if (!dataUrl.startsWith('data:')) return;
      await image.setSrc?.(dataUrl, { crossOrigin: 'anonymous' });
    }),
  );
  canvas.requestRenderAll?.();
}

/** Durable cut SVG for order persistence (no blob: image hrefs). */
export async function serializeDesignSvgForOrder(canvas: FabricCanvas): Promise<string> {
  await embedCanvasImagesAsDataUrls(canvas);
  return canvas.toSVG();
}
