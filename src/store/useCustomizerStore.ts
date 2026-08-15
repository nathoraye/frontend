import { create } from 'zustand';
import * as fabric from 'fabric';
import type {
  CameraView,
  ColorOption,
  CustomizerPhase,
  CustomizerStep,
  DecalConfig,
  PlacementZone,
} from '../types/customizer';

export const COLOR_OPTIONS: ColorOption[] = [
  { id: 'black', name: 'Black', hex: '#111111' },
  { id: 'charcoal', name: 'Charcoal', hex: '#36454f' },
  { id: 'heather-gray', name: 'Heather Gray', hex: '#9e9e9e' },
  { id: 'beige', name: 'Beige', hex: '#d9c9a3' },
  { id: 'coral', name: 'Coral', hex: '#ff6f61' },
  { id: 'navy', name: 'Navy', hex: '#1d2951' },
  { id: 'slate', name: 'Slate', hex: '#4a5a6a' },
];

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function createDecalId(): string {
  return `decal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface CustomizerStore {
  color: ColorOption;
  decals: DecalConfig[];
  activeDecalId: string | null;
  activePlacement: PlacementZone;
  cameraView: CameraView;
  zoom: number;
  step: CustomizerStep;
  phase: CustomizerPhase;

  /** Live Fabric.js render surface, shared with the R3F side to build a THREE.CanvasTexture from it. */
  fabricCanvasEl: HTMLCanvasElement | null;
  /** Bumped (debounced) on every Fabric render so the 3D texture knows to mark itself dirty. */
  textureVersion: number;
  setFabricCanvasEl: (el: HTMLCanvasElement | null) => void;
  bumpTextureVersion: () => void;

  setColor: (color: ColorOption) => void;
  setStep: (step: CustomizerStep) => void;
  setPhase: (phase: CustomizerPhase) => void;
  setActivePlacement: (placement: PlacementZone) => void;
  setCameraView: (view: CameraView) => void;
  setZoom: (zoom: number) => void;

  addDecal: (decal: Omit<DecalConfig, 'id'>) => string;
  removeDecal: (id: string) => void;
  setActiveDecalId: (id: string | null) => void;
  updateDecal: (id: string, patch: Partial<Omit<DecalConfig, 'id'>>) => void;
  updateActiveDecalPosition: (position: { x: number; y: number }) => void;
  updateActiveDecalScale: (scale: number) => void;
  updateActiveDecalOpacity: (opacity: number) => void;

  reset: () => void;

  /** 2D Fabric editor (garment texture) state — independent of the 3D preview above. */
  garmentColor: string;
  fabricCanvas: fabric.Canvas | null;
  setGarmentColor: (color: string) => void;
  setFabricCanvas: (canvas: fabric.Canvas | null) => void;
  addText: () => void;
}

export const useCustomizerStore = create<CustomizerStore>((set, get) => ({
  color: COLOR_OPTIONS[0],
  decals: [],
  activeDecalId: null,
  activePlacement: 'chest',
  cameraView: 'front',
  zoom: 100,
  step: 'Customizer',
  phase: 'Overview',

  fabricCanvasEl: null,
  textureVersion: 0,
  setFabricCanvasEl: (fabricCanvasEl) => set({ fabricCanvasEl }),
  bumpTextureVersion: () => set((state) => ({ textureVersion: state.textureVersion + 1 })),

  setColor: (color) => set({ color }),
  setStep: (step) => set({ step }),
  setPhase: (phase) => set({ phase }),
  setActivePlacement: (activePlacement) => set({ activePlacement }),
  setCameraView: (cameraView) => set({ cameraView }),
  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),

  addDecal: (decal) => {
    const id = createDecalId();
    set((state) => ({
      decals: [...state.decals, { ...decal, id }],
      activeDecalId: id,
    }));
    return id;
  },

  removeDecal: (id) =>
    set((state) => {
      const decals = state.decals.filter((decal) => decal.id !== id);
      const activeDecalId = state.activeDecalId === id ? decals.at(-1)?.id ?? null : state.activeDecalId;
      return { decals, activeDecalId };
    }),

  setActiveDecalId: (activeDecalId) => set({ activeDecalId }),

  updateDecal: (id, patch) =>
    set((state) => ({
      decals: state.decals.map((decal) => (decal.id === id ? { ...decal, ...patch } : decal)),
    })),

  updateActiveDecalPosition: (position) => {
    const { activeDecalId, updateDecal } = get();
    if (!activeDecalId) return;
    updateDecal(activeDecalId, { position });
  },

  updateActiveDecalScale: (scale) => {
    const { activeDecalId, updateDecal } = get();
    if (!activeDecalId) return;
    updateDecal(activeDecalId, { scale: Math.max(0.05, scale) });
  },

  updateActiveDecalOpacity: (opacity) => {
    const { activeDecalId, updateDecal } = get();
    if (!activeDecalId) return;
    updateDecal(activeDecalId, { opacity: clampUnit(opacity) });
  },

  reset: () =>
    set({
      color: COLOR_OPTIONS[0],
      decals: [],
      activeDecalId: null,
      activePlacement: 'chest',
      cameraView: 'front',
      zoom: 100,
      step: 'Customizer',
      phase: 'Overview',
    }),

  garmentColor: '#000000',
  fabricCanvas: null,

  setGarmentColor: (color) => set({ garmentColor: color }),

  setFabricCanvas: (canvas) => set({ fabricCanvas: canvas }),

  addText: () => {
    const canvas = get().fabricCanvas;
    if (!canvas) return;

    const text = new fabric.IText('Double click to edit', {
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      originX: 'center',
      originY: 'center',
      fontSize: 28,
      fill: '#ffffff',
      fontFamily: 'Arial',
    });

    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.requestRenderAll();
  },
}));
