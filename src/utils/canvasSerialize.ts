import * as fabric from 'fabric';

/** Custom Fabric fields that must survive undo, redo, and autosave. */
export const CANVAS_CUSTOM_PROPERTIES = ['name', 'aiPrompt'] as const;

export function registerCanvasCustomProperties(): void {
  const extra = [...CANVAS_CUSTOM_PROPERTIES];
  const current = fabric.FabricObject.customProperties ?? [];
  fabric.FabricObject.customProperties = [...new Set([...current, ...extra])];
}

export function serializeCanvas(canvas: fabric.Canvas): string {
  return JSON.stringify(canvas.toObject([...CANVAS_CUSTOM_PROPERTIES]));
}

export async function deserializeCanvas(canvas: fabric.Canvas, json: string): Promise<void> {
  await canvas.loadFromJSON(json);
  canvas.requestRenderAll();
}

export function canvasJsonHasObjects(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as { objects?: unknown };
    return Array.isArray(parsed.objects) && parsed.objects.length > 0;
  } catch {
    return false;
  }
}
