import { useCallback, useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import {
  canNodeEdit,
  enterNodeEditMode,
  exitNodeEditMode,
  isInNodeEditMode,
  resolveEditableObject,
} from '../utils/nodeEditMode';

interface UseNodeEditEngineProps {
  canvas: fabric.Canvas | null;
  tool: string;
  activeObj: fabric.Object | null;
  saveHistorySnapshot: (canvas: fabric.Canvas, immediate?: boolean) => void;
  setQuickMenu: (menu: null) => void;
  setTool: (tool: 'select') => void;
}

export function useNodeEditEngine({
  canvas,
  tool,
  activeObj,
  saveHistorySnapshot,
  setQuickMenu,
  setTool,
}: UseNodeEditEngineProps) {
  const [nodeEditTarget, setNodeEditTarget] = useState<fabric.Object | null>(null);
  const targetRef = useRef<fabric.Object | null>(null);
  const enteringRef = useRef(false);

  const exitNodeEdit = useCallback((snapshot = true) => {
    const current = targetRef.current;
    if (!current || !canvas) {
      targetRef.current = null;
      setNodeEditTarget(null);
      return;
    }
    if (isInNodeEditMode(current)) {
      exitNodeEditMode(current, canvas);
    }
    targetRef.current = null;
    setNodeEditTarget(null);
    if (snapshot) saveHistorySnapshot(canvas, true);
  }, [canvas, saveHistorySnapshot]);

  const enterNodeEdit = useCallback((obj: fabric.Object) => {
    if (!canvas) return;
    enteringRef.current = true;
    if (targetRef.current && targetRef.current !== obj && isInNodeEditMode(targetRef.current)) {
      exitNodeEditMode(targetRef.current, canvas);
    }
    const resolved = resolveEditableObject(obj, canvas);
    if (!resolved) {
      enteringRef.current = false;
      return;
    }
    setTool('select');
    setQuickMenu(null);
    enterNodeEditMode(resolved, canvas);
    canvas.setActiveObject(resolved);
    targetRef.current = resolved;
    setNodeEditTarget(resolved);
    canvas.requestRenderAll();
    window.setTimeout(() => {
      enteringRef.current = false;
    }, 0);
  }, [canvas, setQuickMenu, setTool]);

  const toggleNodeEdit = useCallback((obj: fabric.Object | null) => {
    if (!obj) return;
    if (targetRef.current && (targetRef.current === obj || isInNodeEditMode(obj))) {
      exitNodeEdit(true);
      return;
    }
    enterNodeEdit(obj);
  }, [enterNodeEdit, exitNodeEdit]);

  useEffect(() => {
    if (enteringRef.current) return;
    if (!targetRef.current) return;
    if (!activeObj || activeObj !== targetRef.current) {
      exitNodeEdit(true);
    }
  }, [activeObj, exitNodeEdit]);

  useEffect(() => {
    if (tool !== 'select' && targetRef.current) {
      exitNodeEdit(true);
    }
  }, [tool, exitNodeEdit]);

  return {
    nodeEditTarget,
    isNodeEditing: Boolean(nodeEditTarget),
    canEditActive: canNodeEdit(activeObj),
    toggleNodeEdit,
    exitNodeEdit,
  };
}
