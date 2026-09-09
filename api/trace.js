import {
  decodeDataUrl,
  readSvgSize,
  TRACE_REQUEST_BODY_LIMIT,
  traceImageBuffer,
  traceRgba,
} from '../traceColor.mjs';

function sendJson(res, status, payload) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status).json(payload);
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function payloadTooLargeError() {
  const error = new Error('Trace payload too large.');
  error.statusCode = 413;
  return error;
}

function readRawBody(req, limit = TRACE_REQUEST_BODY_LIMIT) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (req.body instanceof Uint8Array) return Promise.resolve(Buffer.from(req.body));
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body));
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const ok = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        fail(payloadTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}

function isAlreadyParsedJson(body) {
  return Boolean(
    body
    && typeof body === 'object'
    && !Buffer.isBuffer(body)
    && !(body instanceof Uint8Array)
    && !Array.isArray(body),
  );
}

function queryTraceParams(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  const paletteRaw = url.searchParams.get('palette');
  const palette = paletteRaw
    ? paletteRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;
  return {
    maxColors: url.searchParams.get('maxColors') ?? undefined,
    cornerThreshold: url.searchParams.get('cornerThreshold') ?? undefined,
    curveFit: url.searchParams.get('curveFit') ?? undefined,
    filterSpeckle: url.searchParams.get('filterSpeckle') ?? undefined,
    palette,
  };
}

function jsonTraceParams(payload) {
  return {
    maxColors: payload.maxColors,
    cornerThreshold: payload.cornerThreshold,
    curveFit: payload.curveFit,
    filterSpeckle: payload.filterSpeckle,
    palette: payload.palette,
  };
}

function isBinaryImage(contentType) {
  return contentType.includes('image/png')
    || contentType.includes('image/jpeg')
    || contentType.includes('image/jpg')
    || contentType.includes('application/octet-stream');
}

export async function handleTraceRequest(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const contentType = String(req.headers['content-type'] || '');
    let raw;
    let width;
    let height;

    if (isBinaryImage(contentType)) {
      const buffer = await readRawBody(req);
      const params = queryTraceParams(req);
      raw = traceImageBuffer(buffer, params);
      width = Number(new URL(req.url || '/', 'http://localhost').searchParams.get('width')) || 0;
      height = Number(new URL(req.url || '/', 'http://localhost').searchParams.get('height')) || 0;
    } else {
      const payload = isAlreadyParsedJson(req.body)
        ? req.body
        : JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
      const params = jsonTraceParams(payload);
      width = Number(payload.width) || 0;
      height = Number(payload.height) || 0;
      if (payload.rgba && width && height) {
        const rgba = Buffer.from(String(payload.rgba), 'base64');
        raw = traceRgba(rgba, width, height, params);
      } else if (typeof payload.image === 'string') {
        raw = traceImageBuffer(decodeDataUrl(payload.image), params);
      } else {
        sendJson(res, 400, { error: 'Missing image data URL, PNG body, or rgba pixels.' });
        return;
      }
    }

    const size = readSvgSize(raw, width || 1, height || 1);
    sendJson(res, 200, { svg: raw, width: size.width, height: size.height });
  } catch (error) {
    const status = error && error.statusCode === 413 ? 413 : 500;
    if (status !== 413) console.error('Colour trace failed', error);
    sendJson(res, status, { error: error instanceof Error ? error.message : 'Trace failed' });
  }
}

export default async function handler(req, res) {
  await handleTraceRequest(req, res);
}
