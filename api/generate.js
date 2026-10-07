import { sendJson, readJsonBody } from './_lib/http.js';
import { createArtwork, describeArtworkQuota } from './_lib/imageGenerate.js';

export const maxDuration = 60;

function sendArtworkError(res, error) {
  const status = Number(error?.status) || 500;
  const payload = {
    error: error instanceof Error ? error.message : 'Artwork could not be generated. Please try again.',
  };
  if (error?.quota && typeof error.quota === 'object') {
    payload.remaining = error.quota.remaining;
    payload.limit = error.quota.limit;
    payload.resetAt = error.quota.resetAt;
  }
  if (status === 429) {
    const seconds = Number(error?.retryAfterSeconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      res.setHeader('Retry-After', String(Math.ceil(seconds)));
    }
  }
  sendJson(res, status, payload);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (req.method === 'GET') {
      sendJson(res, 200, await describeArtworkQuota(req));
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: 'Enter a short description of the artwork.' });
      return;
    }
    sendJson(res, 200, await createArtwork(body?.prompt, req));
  } catch (error) {
    if (!error?.status || Number(error.status) >= 500) {
      const detail = error?.cause instanceof Error ? error.cause.message : '';
      console.error('Artwork generation failed', error instanceof Error ? error.message : error, detail);
    }
    sendArtworkError(res, error);
  }
}
