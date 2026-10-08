import { flattenArtworkBytes } from './imageFlatten.js';
import { activeImageProvider, generateArtworkImage } from './imageProvider.js';
import { isLogoPrompt, letteringFromPrompt, sanitizeImagePrompt, wrapVinylPrompt } from './imagePrompt.js';
import { renderStencilWordmark } from './imageWordmark.js';
import {
  IMAGE_QUOTA_LIMIT,
  readImageQuota,
  refundImageGeneration,
  reserveImageGeneration,
} from './imageQuota.js';

function withQuota(error, quota) {
  error.quota = {
    remaining: quota.remaining,
    limit: quota.limit,
    resetAt: quota.resetAt,
  };
  return error;
}

/**
 * Sanitize, reserve a daily slot, generate, and refund the slot if the
 * provider fails. `nowMs` is injectable for tests.
 */
export async function createArtwork(rawPrompt, req, nowMs = Date.now()) {
  const prompt = sanitizeImagePrompt(rawPrompt);
  const reservation = await reserveImageGeneration(req, nowMs);
  if (!reservation.ok) {
    const error = Object.assign(
      new Error(`You've used today's ${IMAGE_QUOTA_LIMIT} free artwork generations. Please try again tomorrow.`),
      {
        status: 429,
        retryAfterSeconds: Math.max(1, Math.ceil((reservation.resetAt - nowMs) / 1000)),
      },
    );
    throw withQuota(error, reservation);
  }

  try {
    // Keyless Pollinations (Sana) draws a mascot for names like "hunnid" and
    // cannot spell the wordmark. Set those prompts locally. Other providers
    // still receive the logo wrap. Icon prompts are flattened to black on white
    // so gray fringe does not become extra cut paths.
    let image;
    if (isLogoPrompt(prompt) && activeImageProvider() === 'pollinations') {
      image = renderStencilWordmark(letteringFromPrompt(prompt));
    } else {
      const generated = await generateArtworkImage(wrapVinylPrompt(prompt));
      image = flattenArtworkBytes(generated.bytes, generated.contentType);
    }
    return {
      image: `data:${image.contentType};base64,${image.bytes.toString('base64')}`,
      contentType: image.contentType,
      remaining: reservation.remaining,
      limit: reservation.limit,
      resetAt: reservation.resetAt,
    };
  } catch (cause) {
    const refunded = await refundImageGeneration(req, nowMs);
    if (cause?.status) throw withQuota(cause, refunded);
    const error = Object.assign(
      new Error('The artwork service is busy right now. Please try again in a moment.'),
      { status: 502 },
    );
    throw withQuota(error, refunded);
  }
}

export async function describeArtworkQuota(req, nowMs = Date.now()) {
  const quota = await readImageQuota(req, nowMs);
  return {
    remaining: quota.remaining,
    limit: quota.limit,
    resetAt: quota.resetAt,
  };
}
