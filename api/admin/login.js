import { handleAdminLogin } from '../_lib/adminSession.js';
import { readJsonBody, sendJson, sendRouteError } from '../_lib/http.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    sendJson(res, 200, await handleAdminLogin(body, req));
  } catch (error) {
    sendRouteError(res, error, 'Sign-in failed');
  }
}
