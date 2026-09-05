import { decodeDataUrl, readSvgSize, traceImageBuffer, traceRgba } from '../traceColor.mjs';

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

function getBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 8_000_000) {
        reject(new Error('Trace payload too large.'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
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
    const payload = await getBody(req);
    const params = {
      maxColors: payload.maxColors,
      cornerThreshold: payload.cornerThreshold,
      curveFit: payload.curveFit,
      filterSpeckle: payload.filterSpeckle,
      palette: payload.palette,
    };

    let raw;
    const width = Number(payload.width) || 0;
    const height = Number(payload.height) || 0;
    if (typeof payload.image === 'string') {
      raw = traceImageBuffer(decodeDataUrl(payload.image), params);
    } else if (payload.rgba && width && height) {
      const rgba = Buffer.from(String(payload.rgba), 'base64');
      raw = traceRgba(rgba, width, height, params);
    } else {
      sendJson(res, 400, { error: 'Missing image data URL or rgba pixels.' });
      return;
    }

    const size = readSvgSize(raw, width || 1, height || 1);
    sendJson(res, 200, { svg: raw, width: size.width, height: size.height });
  } catch (error) {
    console.error('Colour trace failed', error);
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Trace failed' });
  }
}

export default async function handler(req, res) {
  await handleTraceRequest(req, res);
}
