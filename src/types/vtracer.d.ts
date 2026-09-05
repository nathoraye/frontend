/**
 * Ambient declarations for `@visioncortex/vtracer`.
 *
 * The published package already ships `index.d.ts` (`convertPixels`, camelCase
 * `Options`).  This file *augments* that module with the snake_case
 * `VTracerConfig` / `convert_image_to_svg` surface used by the browser stencil
 * pipeline, so TypeScript accepts those imports without fighting the CJS types.
 */

declare module '@visioncortex/vtracer' {
  export interface VTracerConfig {
    mode?: 'polygon' | 'spline';
    layering?: 'cutout' | 'stacked';
    color_count?: number;
    color_precision?: number;
    hierarchical?: 'sliced' | 'stacked';
    corner_threshold?: number;
    length_threshold?: number;
    max_iterations?: number;
    splice_threshold?: number;
    path_omit_size?: number;
    curve_fitting_error?: number;
  }

  /**
   * Traces an image and returns an SVG string.
   * @param imgData Sequential RGBA pixel values array
   * @param width Image width in pixels
   * @param height Image height in pixels
   * @param config VTracer options object
   */
  export function convert_image_to_svg(
    imgData: Uint8ClampedArray | number[],
    width: number,
    height: number,
    config: VTracerConfig,
  ): string;
}
