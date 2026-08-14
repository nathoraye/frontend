/** Type definitions for the standalone 3D product customizer module. */

/** Zones on the garment where a decal/graphic can be projected. */
export type PlacementZone = 'chest' | 'pocket' | 'back' | 'sleeve';

/** Named camera framing presets driven by the bottom action bar. */
export type CameraView = 'front' | 'back' | 'side';

/** A single selectable base color swatch. */
export interface ColorOption {
  id: string;
  name: string;
  hex: string;
}

/** Configuration for one decal/graphic projected onto the garment mesh. */
export interface DecalConfig {
  id: string;
  /** Data URL or object URL of the uploaded/preset graphic. */
  imageUrl: string;
  /** Human-readable label, e.g. preset graphic name or uploaded file name. */
  name: string;
  placement: PlacementZone;
  /** Offset from the placement zone's anchor, in -100..100 range (percent). */
  position: {
    x: number;
    y: number;
  };
  /** Multiplier applied to the placement zone's base decal size. */
  scale: number;
  /** 0..1 opacity applied to the decal material. */
  opacity: number;
  /** Rotation in degrees applied around the surface normal. */
  rotation: number;
}

/** Top-level sidebar step tabs. */
export type CustomizerStep = 'Customizer' | 'Grade/Scale' | 'Colors';

/** Secondary sidebar step tabs. */
export type CustomizerPhase = 'Overview' | 'Review';

/** Full customizer state describing the current hoodie configuration. */
export interface HoodieState {
  color: ColorOption;
  decals: DecalConfig[];
  activeDecalId: string | null;
  activePlacement: PlacementZone;
  cameraView: CameraView;
  zoom: number;
  step: CustomizerStep;
  phase: CustomizerPhase;
}
