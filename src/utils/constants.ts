/**
 * Upscale multiplier used during the vector trace pipeline.
 * The image is blown up by this factor before thresholding so the
 * tracer sees a smooth gradient rather than pixel stairs, producing
 * far cleaner cut paths.  Both useVectorEngine and useVectorMath must
 * reference this constant so the forward-upscale and the
 * reverse-scale-back always stay in sync.
 */
export const TRACE_UPSCALE_MULT = 6;
