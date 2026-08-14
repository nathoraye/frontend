import { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useCustomizerStore } from '../store/useCustomizerStore';

const TEXTURE_UPDATE_DEBOUNCE_MS = 80;

export interface UseFabricEditorOptions {
  width?: number;
  height?: number;
}

/**
 * Initializes a Fabric.js canvas on the given <canvas> element and bridges it to the
 * customizer store: the raw canvas element is exposed as `fabricCanvasEl` so the R3F
 * side can wrap it in a THREE.CanvasTexture, and every render/edit bumps `textureVersion`
 * (debounced) so that texture knows when to mark itself dirty.
 */
export function useFabricEditor(canvasEl: HTMLCanvasElement | null, options: UseFabricEditorOptions = {}) {
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setFabricCanvasEl = useCustomizerStore((s) => s.setFabricCanvasEl);
  const bumpTextureVersion = useCustomizerStore((s) => s.bumpTextureVersion);

  const { width = 1024, height = 1024 } = options;

  useEffect(() => {
    if (!canvasEl) return;

    const canvas = new fabric.Canvas(canvasEl, {
      width,
      height,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
    });
    fabricCanvasRef.current = canvas;

    const requestTextureUpdate = () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      debounceTimeout.current = setTimeout(bumpTextureVersion, TEXTURE_UPDATE_DEBOUNCE_MS);
    };

    canvas.on('after:render', requestTextureUpdate);
    canvas.on('object:modified', requestTextureUpdate);

    setFabricCanvasEl(canvas.getElement());
    bumpTextureVersion();

    return () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      canvas.off('after:render', requestTextureUpdate);
      canvas.off('object:modified', requestTextureUpdate);
      setFabricCanvasEl(null);
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [canvasEl, width, height, setFabricCanvasEl, bumpTextureVersion]);

  return fabricCanvasRef;
}
