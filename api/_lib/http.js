export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function sendJson(res, status, payload) {
  setCors(res);
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status).json(payload);
    return;
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

/** Binary / text file response for authenticated jobs-board asset downloads. */
export function sendBinary(res, status, body, { contentType, fileName, download = false } = {}) {
  setCors(res);
  const type = contentType || 'application/octet-stream';
  const disposition = `${download ? 'attachment' : 'inline'}; filename="${fileName || 'download'}"`;
  if (typeof res.status === 'function' && typeof res.setHeader === 'function') {
    res.status(status);
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', disposition);
    res.setHeader('Cache-Control', 'private, no-store');
    if (typeof res.send === 'function') {
      res.send(body);
      return;
    }
    res.end(body);
    return;
  }
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', disposition);
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(body);
}

export async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw = await readRawBody(req);
  const text = raw.toString('utf8');
  if (!text) return {};
  return JSON.parse(text);
}

export function errorStatus(error) {
  return Number(error?.status) || 500;
}
