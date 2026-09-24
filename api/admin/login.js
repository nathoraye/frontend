import { handleAdminLogin } from '../_lib/adminSession.js';
import { errorStatus, readJsonBody, sendJson } from '../_lib/http.js';

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
    sendJson(res, 200, handleAdminLogin(body));
  } catch (error) {
    sendJson(res, errorStatus(error), {
      error: error instanceof Error ? error.message : 'Sign-in failed',
    });
  }
}
