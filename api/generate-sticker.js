import handler, { maxDuration as generateMaxDuration } from './generate.js';

/** Previous path. Same handler as /api/generate so it cannot skip the quota. */
export const maxDuration = generateMaxDuration;
export default handler;
