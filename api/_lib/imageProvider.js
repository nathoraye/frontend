/**
 * Artwork providers. Pollinations is the default and needs no API key.
 * Cloudflare Workers AI and Hugging Face are selected with IMAGE_PROVIDER
 * and their own credentials. Those env vars are optional and unused unless set.
 */

export const POLLINATIONS_REFERRER = 'westvinylstudio.com';
export const IMAGE_FETCH_TIMEOUT_MS = 35_000;

const POLLINATIONS_ORIGIN = 'https://image.pollinations.ai/prompt';

let fetchImpl = globalThis.fetch.bind(globalThis);

export function setImageFetchForTests(fn) {
  fetchImpl = fn || globalThis.fetch.bind(globalThis);
}

export function resetImageProviderForTests() {
  fetchImpl = globalThis.fetch.bind(globalThis);
}

export function activeImageProvider() {
  const name = String(process.env.IMAGE_PROVIDER || 'pollinations').trim().toLowerCase();
  return name || 'pollinations';
}

/**
 * Anonymous Pollinations image URL.
 * model=flux is requested as specified. As of October 2026 the keyless host
 * only lists `sana` and may ignore flux (response header x-model-used).
 * seed and referrer follow the current image API docs.
 */
export function buildPollinationsImageUrl(prompt, seed, model = 'flux') {
  const safeSeed = Number.isFinite(Number(seed)) ? String(Math.floor(Number(seed))) : '1';
  const query = [
    `model=${encodeURIComponent(model)}`,
    'width=1024',
    'height=1024',
    'nologo=true',
    `seed=${safeSeed}`,
    `referrer=${encodeURIComponent(POLLINATIONS_REFERRER)}`,
    'private=true',
  ].join('&');
  return `${POLLINATIONS_ORIGIN}/${encodeURIComponent(prompt)}?${query}`;
}

function providerError(message, status = 502) {
  return Object.assign(new Error(message), { status });
}

export function artworkBusyError(cause) {
  const name = cause?.name || '';
  const timedOut = name === 'TimeoutError' || name === 'AbortError';
  const error = providerError(
    timedOut
      ? 'Artwork took too long to generate. Please try again.'
      : 'The artwork service is busy right now. Please try again in a moment.',
    502,
  );
  error.cause = cause;
  return error;
}

function sniffImage(bytes) {
  if (!bytes || bytes.length < 32) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 12
    && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

async function readImageResponse(response) {
  if (!response?.ok) {
    let snippet = '';
    try {
      snippet = (await response.text()).replace(/\s+/g, ' ').slice(0, 160);
    } catch {
      snippet = '';
    }
    throw artworkBusyError(new Error(`provider status ${response?.status} ${snippet}`));
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = sniffImage(bytes);
  if (!contentType) {
    throw artworkBusyError(new Error(`provider payload was not an image (${bytes.length} bytes)`));
  }
  return { bytes, contentType };
}

async function fetchImage(url, init) {
  try {
    return await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
  } catch (cause) {
    throw artworkBusyError(cause);
  }
}

async function generatePollinations(prompt) {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const headers = {
    Accept: 'image/jpeg, image/png, image/*',
    Referer: `https://${POLLINATIONS_REFERRER}/`,
  };
  const fluxResponse = await fetchImage(buildPollinationsImageUrl(prompt, seed, 'flux'), { headers });
  if (fluxResponse?.ok) return readImageResponse(fluxResponse);
  // Keyless image.pollinations.ai currently serves only `sana`. If flux is
  // rejected outright, one follow-up on the same host still returns an image.
  if (fluxResponse && [400, 401, 402, 403, 404].includes(Number(fluxResponse.status))) {
    const fallback = await fetchImage(buildPollinationsImageUrl(prompt, seed, 'sana'), { headers });
    return readImageResponse(fallback);
  }
  return readImageResponse(fluxResponse);
}

async function generateCloudflare(prompt) {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !token) {
    throw providerError('Cloudflare Workers AI is not configured.', 500);
  }
  const response = await fetchImage(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    },
  );
  if (!response?.ok) throw artworkBusyError(new Error(`cloudflare status ${response?.status}`));
  const data = await response.json();
  const raw = data?.result?.image;
  if (typeof raw !== 'string' || !raw) {
    throw artworkBusyError(new Error('cloudflare returned no image'));
  }
  const base64 = raw.replace(/^data:image\/\w+;base64,/, '');
  const bytes = Buffer.from(base64, 'base64');
  const contentType = sniffImage(bytes) || 'image/png';
  return { bytes, contentType };
}

async function generateHuggingFace(prompt) {
  const token = String(process.env.HUGGINGFACE_API_TOKEN || process.env.HF_TOKEN || '').trim();
  const model = String(process.env.HUGGINGFACE_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell').trim();
  if (!token) {
    throw providerError('Hugging Face image generation is not configured.', 500);
  }
  const response = await fetchImage(
    `https://router.huggingface.co/hf-inference/models/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'image/png, image/jpeg, image/*',
      },
      body: JSON.stringify({ inputs: prompt }),
    },
  );
  return readImageResponse(response);
}

export async function generateArtworkImage(prompt) {
  const provider = activeImageProvider();
  if (provider === 'pollinations') return generatePollinations(prompt);
  if (provider === 'cloudflare') return generateCloudflare(prompt);
  if (provider === 'huggingface' || provider === 'hf') return generateHuggingFace(prompt);
  throw providerError('Artwork provider is not available.', 500);
}
