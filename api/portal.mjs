import { randomUUID } from 'node:crypto';
import { readContent, updateContent } from '../server/content-store.mjs';
import { clearSessionCookie, hasPermission, readSession, verifyOrigin } from '../server/security.mjs';
import { appendAudit, badMethod, cleanImage, cleanText, json, readJson } from '../server/http.mjs';
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
        profile: {
          slug: profile.slug || '',
          inGameName: profile.inGameName || '',
          bio: profile.bio || '',
          banner: profile.banner || '',
          isPublic: profile.isPublic === true,
          showBio: profile.showBio !== false,
          showInGameName: profile.showInGameName !== false,
          showAchievements: profile.showAchievements !== false,
          createdAt: profile.createdAt || ''
        },
        achievements: awards,
        notices: (state.residentNotices || []).filter(notice => notice.active !== false).slice(0, 20),
        rsvps: (state.eventRsvps || []).filter(item => item.discordId === user.id).map(item => {
          const event = (state.events || []).find(row => row.id === item.eventId);
          return event ? { eventId: event.id, title: event.title, startsAt: event.startsAt, status: event.cancelled || event.status !== 'published' ? 'cancelled' : item.status } : null;
        }).filter(Boolean),
        applications: (state.applications || []).filter(item => item.discordId === user.id).map(item => ({
          id: item.id, jobId: item.jobId, jobTitle: item.jobTitle, status: item.status, submittedAt: item.submittedAt,
          history: (item.history || []).filter(entry => entry.public === true).map(entry => ({ status: entry.status, message: entry.message, at: entry.at }))
        })),
        notifications: (state.notifications || []).filter(item => item.discordId === user.id).slice(-100).reverse()
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

  const input = body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile) ? body.profile : body;
  let profileFields;
  try {
    profileFields = {
      inGameName: cleanText(input.inGameName, 80, 'In-game naam', true),
      bio: cleanText(input.bio || '', 500, 'Beschrijving', true),
      banner: cleanImage(input.banner || ''),
      isPublic: input.isPublic === true,
      showBio: input.showBio !== false,
      showInGameName: input.showInGameName !== false,
      showAchievements: input.showAchievements !== false
    };
  } catch (error) { return json({ error: error.message }, 400); }
  for (const key of ['isPublic', 'showBio', 'showInGameName', 'showAchievements']) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean') return json({ error: 'Ongeldige privacyinstelling.' }, 400);
  }

  try {
    const savedProfile = await updateContent(state => {
      state.residentProfiles ||= [];
      let profile = state.residentProfiles.find(item => item.discordId === user.id);
      if (!profile) {
        if (state.residentProfiles.length >= 10000) throw new Error('Het aantal inwonerprofielen heeft de beheerlimiet bereikt.');
        profile = { discordId: user.id, createdAt: new Date().toISOString(), slug: randomUUID().replaceAll('-', '').slice(0, 24) };
        state.residentProfiles.push(profile);
      }
      if (!/^[a-z0-9]{24}$/.test(String(profile.slug || ''))) profile.slug = randomUUID().replaceAll('-', '').slice(0, 24);
      Object.assign(profile, profileFields, {
        username: cleanText(user.username || 'Heerlen-inwoner', 80, 'Discord-naam'),
        avatar: typeof user.avatar === 'string' && user.avatar.startsWith(`https://cdn.discordapp.com/avatars/${user.id}/`) ? user.avatar.slice(0, 1000) : ''
      });
      profile.updatedAt = new Date().toISOString();
      if (hasPermission(user, 'admin:site')) appendAudit(state, user, 'aangepast', 'inwonersprofiel', user.username);
      return { slug: profile.slug, inGameName: profile.inGameName, createdAt: profile.createdAt };
    });
    return json({ ok: true, profile: savedProfile });
  } catch (error) {
    return json({ error: error.message || 'Je profiel kon niet worden opgeslagen.' }, 503);
  }
}

export default vercelHandler(handler);
