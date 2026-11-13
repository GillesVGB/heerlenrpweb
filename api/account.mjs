import { readSession } from '../server/security.mjs';
import { badMethod, json } from '../server/http.mjs';
import { vercelHandler } from '../server/vercel-adapter.mjs';

async function handler(request) {
  if (request.method !== 'GET') return badMethod('GET');
  const user = readSession(request);
  if (!user || user.provider !== 'discord') return json({ ok: true, authenticated: false, staff: false });
  return json({
    ok: true,
    authenticated: true,
    user: { id: user.id, username: user.username, avatar: user.avatar || null },
    staff: Array.isArray(user.permissions) && user.permissions.includes('staff:read')
  });
}

export default vercelHandler(handler);
