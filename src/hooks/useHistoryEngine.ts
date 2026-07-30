import *as fabric from 'fabric'; 
import { useState, useRef, useCallback } from 'react';

interface UseHistoryEngineProps {
  setCanvasObjects: React.Dispatch<React.SetStateAction<fabric.Object[]>>;
}

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

  const saveHistorySnapshot = useCallback((targetCanvas: fabric.Canvas, immediate = false) => {
    if (isHistoryProcessing.current) return;
    
    const save = () => {
      const json = JSON.stringify(targetCanvas.toJSON());
      if (historyIndex.current < history.current.length - 1) {
        history.current = history.current.slice(0, historyIndex.current + 1);
      }
      history.current.push(json);
      
      // Cap memory at 30 steps to prevent browser crashes
      if (history.current.length > 30) {
        history.current.shift();
      } else {
        historyIndex.current++;
      }
      updateHistoryUI();
      setCanvasObjects([...targetCanvas.getObjects()]);
    };

    if (immediate) { 
      save(); 
      return; 
    }
    
    // Debounce slider updates (wait 300ms before saving to history)
    if (historyTimeout.current) clearTimeout(historyTimeout.current);
    historyTimeout.current = setTimeout(save, 300);
  }, [updateHistoryUI, setCanvasObjects]);

  const handleUndo = useCallback((targetCanvas: fabric.Canvas | null) => {
    if (!targetCanvas || historyIndex.current <= 0) return;
    isHistoryProcessing.current = true;
    historyIndex.current--;
    targetCanvas.loadFromJSON(history.current[historyIndex.current], () => {
      targetCanvas.requestRenderAll();
      isHistoryProcessing.current = false;
      updateHistoryUI();
      setCanvasObjects([...targetCanvas.getObjects()]);
    });
  }, [updateHistoryUI, setCanvasObjects]);

  const handleRedo = useCallback((targetCanvas: fabric.Canvas | null) => {
    if (!targetCanvas || historyIndex.current >= history.current.length - 1) return;
    isHistoryProcessing.current = true;
    historyIndex.current++;
    targetCanvas.loadFromJSON(history.current[historyIndex.current], () => {
      targetCanvas.requestRenderAll();
      isHistoryProcessing.current = false;
      updateHistoryUI();
      setCanvasObjects([...targetCanvas.getObjects()]);
    });
  }, [updateHistoryUI, setCanvasObjects]);

  return {
    history,
    canUndo,
    canRedo,
    saveHistorySnapshot,
    handleUndo,
    handleRedo
  };
}