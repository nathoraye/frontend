/**
 * Ambient type declarations for `@visioncortex/vtracer`.
 *
 * The published package ships `index.d.ts` covering the Node.js CJS surface.
 * These declarations extend that with the option interface re-exported so
 * application code can import `VTracerOptions` without depending on the CJS
 * wrapper at runtime.
 */

declare module '@visioncortex/vtracer' {
  /** Conversion options recognised by VTracer.  All fields are optional. */
  export interface VTracerOptions {
    /** Broad preset: `'bw'` | `'poster'` | `'photo'`. */
    preset?: 'bw' | 'poster' | 'photo';
    /** Region-forming algorithm. */
    clustering?: 'color-cluster' | 'bw' | 'watershed';
    /**
     * Layer compositing strategy.
     * - `'stacked'`  — layers sit on top of each other (default, bad for vinyl).
     * - `'cutout'`   — each layer subtracts the shape above it; required for
     *                  knife-plotter output with no stacked fills.
     */
    hierarchical?: 'stacked' | 'cutout';
    /**
     * Path geometry mode.
     * - `'polygon'` — straight-line segments only; gives hard stencil edges.
     * - `'spline'`  — Bézier curves; smooths organic shapes.
     * - `'pixel'`   — pixel-art friendly.
     */
    mode?: 'pixel' | 'polygon' | 'spline';
    /** Minimum region area in px²; regions smaller than this are dropped. */
    filterSpeckle?: number;
    /** Colour quantisation precision (bits). */
    colorPrecision?: number;
    /** Minimum luminance difference between adjacent colour layers. */
    layerDifference?: number;
    /**
     * Corner detection threshold in degrees.
     * Lower values detect sharper corners (more anchor points).
     * Maps to the "Corner Sharpness" UI slider.
     */
    cornerThreshold?: number;
    /** Spline: minimum segment length before a new anchor is inserted. */
    lengthThreshold?: number;
    maxIterations?: number;
    spliceThreshold?: number;
    /**
     * Spline: curve simplification tolerance in px.
     * Maps (scaled) to the "Curve Fit" UI slider.
     */
    simplify?: number;
    pathPrecision?: number;
    /** Fixed colour palette as `#rrggbb` strings. */
    palette?: string[];
    /**
     * Target distinct colour count for auto-quantisation.
     * Maps to the "Colours" UI slider.
     */
    maxColors?: number;
    /** Post-processing level: 0 = off, 1 = simplify, 2 = + shorthands. */
    optimize?: number;
    binaryThreshold?: number;
    adaptive?: boolean;
    adaptiveWindow?: number;
    adaptiveT?: number;
    watershedDetail?: number;
  }

  /** Vectorize an encoded image (PNG/JPEG/GIF/BMP) buffer → SVG string. */
  export function convertBuffer(buffer: Uint8Array, options?: VTracerOptions): string;

  /** Vectorize a raw RGBA8 buffer (`width * height * 4` bytes) → SVG string. */
  export function convertPixels(
    rgba: Uint8Array,
    width: number,
    height: number,
    options?: VTracerOptions,
  ): string;

  /** Read an image file, vectorize it, write SVG to disk. */
  export function convertFile(
    inputPath: string,
    outputPath: string,
    options?: VTracerOptions,
  ): Promise<void>;

  /** Synchronous {@link convertFile}. */
  export function convertFileSync(
    inputPath: string,
    outputPath: string,
    options?: VTracerOptions,
  ): void;
}
