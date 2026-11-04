import { sendJson, sendRouteError } from './_lib/http.js';
import { getDepartmentCollection } from './_lib/shopify.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  const url = new URL(req.url, 'http://localhost');
  try {
    const collection = await getDepartmentCollection(url.searchParams.get('handle'));
    return sendJson(res, 200, { collection });
  } catch (error) {
    return sendRouteError(res, error, 'Products could not be loaded.');
  }
}
