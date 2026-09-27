import { errorStatus, sendBinary, sendJson } from '../../_lib/http.js';
import { handleGetOrderAsset } from '../../_lib/orderService.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const orderId = req.query?.id;
    if (!orderId) {
      sendJson(res, 400, { error: 'Missing order id' });
      return;
    }
    const download = String(req.query?.download || '') === '1';
    const asset = await handleGetOrderAsset(req, orderId, 'preview', { download });
    sendBinary(res, 200, asset.body, {
      contentType: asset.contentType,
      fileName: asset.fileName,
      download: asset.download,
    });
  } catch (error) {
    sendJson(res, errorStatus(error), {
      error: error instanceof Error ? error.message : 'Failed to load preview',
    });
  }
}
