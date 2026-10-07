/** User prompt length before the vinyl style suffix is added. */
export const IMAGE_PROMPT_MAX_LENGTH = 300;

/**
 * Icon prompts. The keyless host draws sketches unless the wrap forbids
 * gray, texture, and lettering.
 */
export const VINYL_PROMPT_SUFFIX =
  'One die-cut vinyl sticker icon. Solid flat black shapes only, thick closed outlines, minimal detail, no text, no letters, no numbers, pure white background, no gray, no shading, no gradients, no pencil, no brush strokes, no texture, no photorealism, stencil cut-ready';

/** Logo prompts. Names the exact lettering so the model is not asked to invent a mascot. */
export const VINYL_LOGO_SUFFIX_LEAD =
  'Vinyl cutter wordmark. Render only the readable text';

/**
 * Obvious abuse only. Word boundaries avoid blocking ordinary sticker words
 * (a cat, a classic car, a baby onesie).
 */
const BLOCKED_PATTERNS = [
  /\bcsam\b/i,
  /\bchild\s*porn/i,
  /\bloli(?:con)?\b/i,
  /\bshota\b/i,
  /\bpreteen\b/i,
  /\bunderage\b/i,
  /\b(?:child|minor|toddler|infant)\b(?:\W+\w+){0,4}\W+\b(?:nude|naked|porn|sex|sexual|nsfw)\b/i,
  /\b(?:nude|naked|porn|sex|sexual|nsfw)\b(?:\W+\w+){0,4}\W+\b(?:child|minor|toddler|infant|baby)\b/i,
];

function promptError(message) {
  return Object.assign(new Error(message), { status: 400 });
}

/**
 * Trim, collapse whitespace, reject empty / oversized / blocked prompts.
 * Returns the customer wording only — the vinyl suffix is applied separately.
 */
export function sanitizeImagePrompt(input) {
  if (typeof input !== 'string') {
    throw promptError('Enter a short description of the artwork.');
  }
  const cleaned = input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || !/[\p{L}\p{N}]/u.test(cleaned)) {
    throw promptError('Enter a short description of the artwork.');
  }
  if (cleaned.length > IMAGE_PROMPT_MAX_LENGTH) {
    throw promptError(`Keep the description under ${IMAGE_PROMPT_MAX_LENGTH} characters.`);
  }
  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    throw promptError('That description is not allowed.');
  }
  return cleaned;
}

const LOGO_INTENT =
  /\b(logos?|word-?marks?|lettering|monograms?|logotypes?|brands?|branding|slogans?|typefaces?|typography|initials)\b/i;

const STOP_WORDS = new Set([
  'logo', 'logos', 'wordmark', 'wordmarks', 'word-mark', 'lettering', 'monogram', 'monograms',
  'logotype', 'logotypes', 'brand', 'brands', 'branding', 'slogan', 'slogans', 'typeface',
  'typefaces', 'typography', 'initials', 'design', 'sticker', 'please', 'make', 'create',
  'simple', 'flat', 'vector', 'die', 'cut', 'a', 'an', 'the', 'of', 'for', 'my', 'our',
  'with', 'that', 'says', 'reads', 'reading',
]);

/**
 * Logo, brand, collection, wordmark, or “says …” prompts need lettering.
 * “a collection of cats” stays an icon prompt.
 */
export function isLogoPrompt(prompt) {
  if (LOGO_INTENT.test(prompt)) return true;
  if (/\bcollection\b/i.test(prompt) && !/\bcollection of\b/i.test(prompt)) return true;
  if (/\b(?:says|reads)\b/i.test(prompt)) return true;
  return false;
}

/** Words that should appear in the wordmark, in order, uppercased. */
export function letteringFromPrompt(prompt) {
  const says = String(prompt).match(/\b(?:says|reads)\s+["']?(.+?)["']?$/i);
  const source = (says ? says[1] : String(prompt)).replace(/["']/g, ' ');
  const words = source
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word.toLowerCase()));
  const text = words.join(' ').toUpperCase();
  if (text) return text;
  return String(prompt).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

export function wrapVinylPrompt(userPrompt) {
  if (isLogoPrompt(userPrompt)) {
    const lettering = letteringFromPrompt(userPrompt);
    return `${userPrompt}. ${VINYL_LOGO_SUFFIX_LEAD} "${lettering}" in heavy black block letters, centered, thick uniform strokes, solid flat black on a pure white background. No icon, no mascot, no face, no sketch, no pencil, no brush, no gray, no shading, no gradients, no texture, no decoration, stencil die-cut.`;
  }
  return `${userPrompt}. ${VINYL_PROMPT_SUFFIX}`;
}
