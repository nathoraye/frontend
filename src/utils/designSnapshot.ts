import type { Canvas as FabricCanvas } from 'fabric';

/** Rasterizes the current fabric canvas to a PNG data URL for use as a 3D decal texture. */
export function snapshotDesignAsDataURL(canvas: FabricCanvas): string {
  canvas.discardActiveObject?.();
  canvas.renderAll?.();
  return canvas.toDataURL({ format: 'png', multiplier: 1 });
}
