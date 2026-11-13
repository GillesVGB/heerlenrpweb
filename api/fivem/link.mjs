import { createHash } from 'node:crypto';
import { updateContent } from '../../server/content-store.mjs';
import { constantTimeEqual } from '../../server/security.mjs';
import { appendAudit, badMethod, json, readJson } from '../../server/http.mjs';
import { vercelHandler } from '../../server/vercel-adapter.mjs';

async function handler(request) {
  if (request.method !== 'POST') return badMethod('POST');
  const configuredSecret = process.env.FIVEM_LINK_SECRET || '';
  if (configuredSecret.length < 32) return json({ error: 'FiveM accountkoppeling is niet geconfigureerd.' }, 503);
  const suppliedSecret = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
  if (!constantTimeEqual(suppliedSecret, configuredSecret)) return json({ error: 'Niet geautoriseerd.' }, 401);

  let body;
  try { body = await readJson(request, 8_000); }
  catch (error) { return json({ error: error.message }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Ongeldige koppelgegevens.' }, 400);
  const code = String(body.code || '').trim().toUpperCase();
  const license = String(body.license || '').trim();
  const name = String(body.name || '').trim();
  if (!/^[A-F0-9]{10}$/.test(code) || !/^license:[A-Za-z0-9]{8,100}$/.test(license) || !name || name.length > 80 || /[\r\n\0]/.test(name)) {
    return json({ error: 'Ongeldige koppelgegevens.' }, 400);
  }
  const codeHash = createHash('sha256').update(code).digest('hex');
  try {
    const result = await updateContent(state => {
      const now = Date.now();
      state.gameLinkRequests ||= [];
      state.gameLinks ||= [];
      const requestIndex = state.gameLinkRequests.findIndex(item => item.codeHash === codeHash && Date.parse(item.expiresAt) > now);
      if (requestIndex < 0) throw new Error('Deze code is ongeldig, verlopen of al gebruikt. Maak een nieuwe code in je dashboard.');
      const pending = state.gameLinkRequests[requestIndex];
      if (state.gameLinks.some(item => item.discordId === pending.discordId)) throw new Error('Dit Discord-account heeft al een gekoppeld personage.');
      if (state.gameLinks.some(item => item.license === license)) throw new Error('Dit in-game account is al aan een ander websiteaccount gekoppeld.');
      const linkedAt = new Date(now).toISOString();
      state.gameLinks.push({ discordId: pending.discordId, license, name, linkedAt });
      state.gameLinkRequests.splice(requestIndex, 1);
      state.gameLinkRequests = state.gameLinkRequests.filter(item => Date.parse(item.expiresAt) > now);
      appendAudit(state, { id: 'fivem-server', username: 'FiveM-server' }, 'gekoppeld', 'game-account', name);
      return { ok: true, name, linkedAt };
    });
    return json(result);
  } catch (error) {
    const message = error.message || 'Het in-game account kon niet worden gekoppeld.';
    return json({ error: message }, /ongeldig|verlopen|al gebruikt|al gekoppeld|ander websiteaccount/i.test(message) ? 409 : 503);
  }
}

export default vercelHandler(handler);
