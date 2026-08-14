import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useCustomizerStore } from '../store/useCustomizerStore';

/**
 * Wraps the shared Fabric.js canvas element (registered via useFabricEditor) in a
 * THREE.CanvasTexture. The texture instance is created once per canvas element; every
 * time the store's (debounced) textureVersion changes, we flag it dirty so R3F re-uploads
 * the latest 2D render to the GPU on the next frame — no per-frame polling required.
 */
export function useFabricCanvasTexture(): THREE.CanvasTexture | null {
  const fabricCanvasEl = useCustomizerStore((s) => s.fabricCanvasEl);
  const textureVersion = useCustomizerStore((s) => s.textureVersion);

  const texture = useMemo(() => {
    if (!fabricCanvasEl) return null;
    const canvasTexture = new THREE.CanvasTexture(fabricCanvasEl);
    canvasTexture.colorSpace = THREE.SRGBColorSpace;
    canvasTexture.needsUpdate = true;
    return canvasTexture;
  }, [fabricCanvasEl]);

  useEffect(() => {
    // Three.js requires mutating this flag in place to trigger a GPU re-upload; not real React state.
    // eslint-disable-next-line react-hooks/immutability
    if (texture) texture.needsUpdate = true;
  }, [texture, textureVersion]);

  useEffect(() => () => texture?.dispose(), [texture]);

  return texture;
}
