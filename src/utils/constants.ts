/**
 * TRACE_UPSCALE_MULT controls the internal upscaling factor for the vector trace algorithm.
 * 
 * When tracing an image to SVG:
 * 1. Original image is blurred at 1x to fuse pixel staircases into smooth gradients
 * 2. Blurred image is upscaled to 6x resolution (6x × 6x pixels per original pixel)
 * 3. Hardware anti-aliasing interpolates the upscaled gradient into perfect smoothness
 * 4. Tracer runs on 6x image to extract mathematically clean Bezier curves
 * 5. Paths are downscaled by 1/6 to fit back on the canvas at original visual size
 * 
 * Must stay in sync between useVectorEngine.ts and useVectorMath.ts.
 */
export const TRACE_UPSCALE_MULT = 6;
