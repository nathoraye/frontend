/** User prompt length before the vinyl style suffix is added. */
export const IMAGE_PROMPT_MAX_LENGTH = 300;

/** Appended server-side so traces stay flat and cut-friendly. */
export const VINYL_PROMPT_SUFFIX =
  'die-cut vinyl sticker design, bold clean outlines, solid flat shapes, minimal detail, high contrast, pure white background, no gradients, no photorealism, stencil cut-ready';

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

export function wrapVinylPrompt(userPrompt) {
  return `${userPrompt}, ${VINYL_PROMPT_SUFFIX}`;
}
