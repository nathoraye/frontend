import { useEffect, useRef } from 'react';
import type * as fabric from 'fabric';
import { canvasJsonHasObjects, deserializeCanvas } from '../utils/canvasSerialize';
import { loadSavedCanvas, setCanvasRestoreDone } from '../utils/canvasStore';
import { notifyStudio } from '../utils/studioNotice';

export function useCanvasAutosave(
  canvas: fabric.Canvas | null,
  onReady: () => void,
): void {
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (!canvas) return;
    let cancelled = false;
    setCanvasRestoreDone(false);

    void (async () => {
      const json = await loadSavedCanvas();
      if (cancelled) return;
      if (json && canvasJsonHasObjects(json)) {
        try {
          await deserializeCanvas(canvas, json);
          notifyStudio({ tone: 'info', title: 'Restored last session' });
        } catch {
          notifyStudio({
            tone: 'warning',
            title: 'Could not restore last session',
            detail: 'Starting with a blank mat. Undo history is still available for this visit.',
          });
        }
      }
      setCanvasRestoreDone(true);
      onReadyRef.current();
    })();

    return () => {
      cancelled = true;
    };
  }, [canvas]);

  useEffect(() => {
    if (!canvas) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      if (canvas.getObjects().length === 0) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [canvas]);
}
