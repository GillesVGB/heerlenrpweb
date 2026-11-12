import { readContent, updateContent } from '../server/content-store.mjs';
import { clearSessionCookie, hasPermission, readSession, verifyOrigin } from '../server/security.mjs';
import { appendAudit, badMethod, cleanText, json, readJson } from '../server/http.mjs';
import { vercelHandler } from '../server/vercel-adapter.mjs';

function currentResident(request) {
  const user = readSession(request);
  if (!user || user.provider !== 'discord' || !/^\d{17,22}$/.test(String(user.id || ''))) return null;
  return user;
}

async function handler(request) {
  if (request.method === 'GET') {
    const user = currentResident(request);
    if (!user) return json({ error: 'Log in met Discord om je dashboard te openen.' }, 401);
    try {
      const state = await readContent();
      const profile = (state.residentProfiles || []).find(item => item.discordId === user.id) || {};
      const awards = (state.achievementAwards || [])
        .filter(award => award.discordId === user.id)
        .map(award => {
          const achievement = (state.achievements || []).find(item => item.id === award.achievementId);
          return achievement ? { ...achievement, awardedAt: award.awardedAt } : null;
        })
        .filter(Boolean);
      return json({
        ok: true,
        user: { id: user.id, username: user.username, avatar: user.avatar || null },
        profile: { inGameName: profile.inGameName || '', createdAt: profile.createdAt || '' },
        achievements: awards,
        notices: (state.residentNotices || []).filter(notice => notice.active !== false).slice(0, 20)
      });
    } catch (error) {
      return json({ error: error.message || 'Je dashboard kan nu niet worden geladen.' }, 503);
    }
  }

  if (request.method !== 'POST') return badMethod('GET, POST');
  if (!verifyOrigin(request)) return json({ error: 'Ongeldige herkomst van het verzoek.' }, 403);

  let body;
  try { body = await readJson(request, 16_000); }
  catch (error) { return json({ error: error.message }, 400); }
  if (body.action === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });

  const user = currentResident(request);
  if (!user) return json({ error: 'Je Discord-sessie is verlopen. Log opnieuw in.' }, 401);
  if (body.action !== 'save-profile') return json({ error: 'Onbekende dashboardactie.' }, 400);

  let inGameName;
  try { inGameName = cleanText(body.inGameName, 80, 'In-game naam', true); }
  catch (error) { return json({ error: error.message }, 400); }

  try {
    await updateContent(state => {
      state.residentProfiles ||= [];
      let profile = state.residentProfiles.find(item => item.discordId === user.id);
      if (!profile) {
        if (state.residentProfiles.length >= 10000) throw new Error('Het aantal inwonerprofielen heeft de beheerlimiet bereikt.');
        profile = { discordId: user.id, createdAt: new Date().toISOString() };
        state.residentProfiles.push(profile);
      }
      profile.inGameName = inGameName;
      profile.updatedAt = new Date().toISOString();
      if (hasPermission(user, 'admin:site')) appendAudit(state, user, 'aangepast', 'inwonersprofiel', user.username);
      return { ok: true };
    });
    return json({ ok: true, profile: { inGameName } });
  } catch (error) {
    return json({ error: error.message || 'Je profiel kon niet worden opgeslagen.' }, 503);
  }
}

export default vercelHandler(handler);
