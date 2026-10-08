import * as fabric from 'fabric';
import { useState, useRef, useCallback } from 'react';
import { deserializeCanvas, serializeCanvas } from '../utils/canvasSerialize';
import { queueCanvasAutosave } from '../utils/canvasStore';
import { notifyStudio } from '../utils/studioNotice';

interface UseHistoryEngineProps {
  setCanvasObjects: React.Dispatch<React.SetStateAction<fabric.Object[]>>;
}

const HISTORY_CAP = 30;

export function useHistoryEngine({ setCanvasObjects }: UseHistoryEngineProps) {
  const history = useRef<string[]>([]);
  const historyIndex = useRef<number>(-1);
  const isHistoryProcessing = useRef<boolean>(false);
  const historyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateHistoryUI = useCallback(() => {
    setCanUndo(historyIndex.current > 0);
    setCanRedo(historyIndex.current < history.current.length - 1);
  }, []);

  const syncObjects = useCallback((targetCanvas: fabric.Canvas) => {
    setCanvasObjects([...targetCanvas.getObjects()]);
  }, [setCanvasObjects]);

  const saveHistorySnapshot = useCallback((targetCanvas: fabric.Canvas, immediate = false) => {
    if (isHistoryProcessing.current) return;

    const save = () => {
      const json = serializeCanvas(targetCanvas);
      if (historyIndex.current < history.current.length - 1) {
        history.current = history.current.slice(0, historyIndex.current + 1);
      }
      history.current.push(json);

      if (history.current.length > HISTORY_CAP) {
        history.current.shift();
      } else {
        historyIndex.current++;
      }
      updateHistoryUI();
      syncObjects(targetCanvas);
      queueCanvasAutosave(targetCanvas);
    };

    if (historyTimeout.current) {
      clearTimeout(historyTimeout.current);
      historyTimeout.current = null;
    }

    if (immediate) {
      save();
      return;
    }

    historyTimeout.current = setTimeout(save, 300);
  }, [updateHistoryUI, syncObjects]);

  const loadSnapshot = useCallback(async (targetCanvas: fabric.Canvas, json: string) => {
    isHistoryProcessing.current = true;
    try {
      await deserializeCanvas(targetCanvas, json);
      syncObjects(targetCanvas);
      queueCanvasAutosave(targetCanvas);
    } finally {
      isHistoryProcessing.current = false;
      updateHistoryUI();
    }
  }, [syncObjects, updateHistoryUI]);

  const handleUndo = useCallback(async (targetCanvas: fabric.Canvas | null) => {
    if (!targetCanvas || historyIndex.current <= 0 || isHistoryProcessing.current) return;
    historyIndex.current--;
    try {
      await loadSnapshot(targetCanvas, history.current[historyIndex.current]);
    } catch {
      historyIndex.current++;
      updateHistoryUI();
      notifyStudio({ tone: 'error', title: 'Undo failed', detail: 'The previous step could not be restored.' });
    }
  }, [loadSnapshot, updateHistoryUI]);

  const handleRedo = useCallback(async (targetCanvas: fabric.Canvas | null) => {
    if (!targetCanvas || historyIndex.current >= history.current.length - 1 || isHistoryProcessing.current) return;
    historyIndex.current++;
    try {
      await loadSnapshot(targetCanvas, history.current[historyIndex.current]);
    } catch {
      historyIndex.current--;
      updateHistoryUI();
      notifyStudio({ tone: 'error', title: 'Redo failed', detail: 'The next step could not be restored.' });
    }
  }, [loadSnapshot, updateHistoryUI]);

  return {
    history,
    canUndo,
    canRedo,
    saveHistorySnapshot,
    handleUndo,
    handleRedo,
  };
}
