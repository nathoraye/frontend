/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback } from 'react';
import * as fabric from 'fabric';
import { keepWeldArtwork, tightPackWeldObject } from '../utils/weldImport';

export function useBooleanEngine(canvas: fabric.Canvas | null, saveHistorySnapshot: (c: fabric.Canvas, i?: boolean) => void) {

    const selectionHasRasterImage = (objs: fabric.Object[]) => {
        return objs.some((obj: any) => {
            if (obj?.type === 'image') return true;
            if (obj?.type === 'group' || obj?.type === 'activeSelection') {
                return obj.getObjects?.().some((child: any) => child?.type === 'image');
            }
            return false;
        });
    };

  const performBoolean = useCallback(async (operation: 'weld' | 'punch') => {
    if (!canvas) return;
    
    // Use getActiveObjects to accurately count individual items (even in a drag-box selection)
    const actives = canvas.getActiveObjects();
    if (!actives || actives.length === 0) return;

    // Allow welding if they selected multiple items, a group, or a single text object
    const isGroup = actives.length === 1 && actives[0].type === 'group';
    const isText = actives.length === 1 && (actives[0].type === 'i-text' || actives[0].type === 'textbox' || actives[0].type === 'text');

    if (actives.length < 2 && !isGroup && !isText) {
        return alert("Select at least 2 shapes, overlapping Text, or a Group to Weld!");
    }

    if (operation === 'weld') {
        if (selectionHasRasterImage(actives)) {
            alert("Weld only works on vector shapes. Trace image layers to vectors first, then weld.");
            return;
        }

        // 1. Capture the visual fill color before we destroy the objects
        const fillToUse = actives[0].fill || '#FF1493';

        // 2. THE ISOLATED BAKE PASS
        // We temporarily hide everything else on the canvas. This allows us to export 
        // a pure, absolute canvas-sized SVG that locks in the exact scale, X/Y coordinates, 
        // and rotation multipliers permanently into the raw paths.
        const allObjs = canvas.getObjects();
        const visibilityMap = new Map();
        
        allObjs.forEach(obj => {
            visibilityMap.set(obj, obj.visible);
            if (!actives.includes(obj)) {
                obj.set('visible', false);
            }
        });

        // Strip the background so we don't accidentally weld a giant background square
        const currentBg = canvas.backgroundColor;
        const currentOverlay = 'overlayColor' in canvas ? (canvas as any).overlayColor : undefined;
        // eslint-disable-next-line no-useless-assignment -- read below only if canvas.toSVG() throws before reassigning
        let fullSvg = '';

        try {
            // Empty string is falsy — Fabric then skips the SVG background
            // <rect width="100%" height="100%">. The string "transparent" is
            // truthy and re-imports as leftover 100×100 squares at the origin.
            canvas.backgroundColor = '';
            if ('overlayColor' in canvas) {
                (canvas as any).overlayColor = '';
            }

            // 3. Export the absolute baked SVG
            fullSvg = canvas.toSVG();
        } finally {
            // 4. Always restore the canvas visibility and background state
            canvas.backgroundColor = currentBg;
            if ('overlayColor' in canvas && currentOverlay !== undefined) {
                (canvas as any).overlayColor = currentOverlay;
            }
            allObjs.forEach(obj => {
                obj.set('visible', visibilityMap.get(obj));
            });
            canvas.requestRenderAll();
        }
        
        try {
            // 5. Parse the newly baked, 1:1 scale paths
            const { objects, options } = await (fabric as any).loadSVGFromString(fullSvg);
            const frame = {
                width: Number(options?.width || 0),
                height: Number(options?.height || 0),
            };
            const validObjects = keepWeldArtwork(
                ((objects || []).filter(Boolean) as fabric.Object[]),
                frame,
            );

            if (!validObjects.length) {
                throw new Error('Weld produced no vector output.');
            }

            // 6. Force overlapping lines to visually merge
            validObjects.forEach((obj: any) => { if (obj.set) obj.set({ fillRule: 'nonzero' }); });
            
            // 7. Tight-group from the artwork only. Passing the SVG document
            // size into groupSVGElements stretched the result to the canvas
            // and made designs look like they jumped.
            const result = validObjects.length === 1
                ? validObjects[0]
                : new fabric.Group(validObjects, {
                    originX: 'center',
                    originY: 'center',
                    subTargetCheck: false,
                });

            // 8. Replace originals only after we have a valid weld result
            actives.forEach(obj => canvas.remove(obj));
            canvas.discardActiveObject();
            
            result.set({
                fill: fillToUse,
                stroke: '',
                cornerColor: '#FF1493',
                transparentCorners: false,
                objectCaching: true,
                fillRule: 'nonzero'
            });
            tightPackWeldObject(result);
            
            canvas.add(result);
            canvas.setActiveObject(result);
            canvas.requestRenderAll();
            saveHistorySnapshot(canvas, true);
        } catch (err) {
            console.error("Weld Failed:", err);
            alert("Weld failed. Your original objects were kept unchanged.");
        }
    }
  }, [canvas, saveHistorySnapshot]);

  return { performBoolean };
}