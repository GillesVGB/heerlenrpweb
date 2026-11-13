import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readContent, updateContent } from '../server/content-store.mjs';
import { clearSessionCookie, hasPermission, readSession, verifyOrigin } from '../server/security.mjs';
import { appendAudit, badMethod, cleanImage, cleanText, json, readJson } from '../server/http.mjs';
import { vercelHandler } from '../server/vercel-adapter.mjs';

const supportAttempts = new Map();

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
      const gameLink = (state.gameLinks || []).find(item => item.discordId === user.id);
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
        gameLink: gameLink ? { linked: true, name: gameLink.name, linkedAt: gameLink.linkedAt } : { linked: false },
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
        supportTickets: (state.supportTickets || []).filter(item => item.discordId === user.id).slice(-50).reverse().map(item => ({
          id: item.id, subject: item.subject, category: item.category, status: item.status,
          createdAt: item.createdAt, updatedAt: item.updatedAt,
          messages: (item.messages || []).slice(-100).map(message => ({
            author: message.authorRole === 'staff' ? 'Supportteam' : 'Jij',
            authorRole: message.authorRole, content: message.content, createdAt: message.createdAt
          }))
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
  if (body.action === 'create-game-link') {
    try {
      const code = randomBytes(5).toString('hex').toUpperCase();
      const now = Date.now();
      const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
      await updateContent(state => {
        state.gameLinkRequests ||= [];
        state.gameLinks ||= [];
        if (state.gameLinks.some(item => item.discordId === user.id)) throw new Error('Je Discord-account is al aan een personage gekoppeld. Verbreek eerst de huidige koppeling.');
        state.gameLinkRequests = state.gameLinkRequests.filter(item => Date.parse(item.expiresAt) > now && item.discordId !== user.id).slice(-4999);
        state.gameLinkRequests.push({ discordId: user.id, codeHash: createHash('sha256').update(code).digest('hex'), createdAt: new Date(now).toISOString(), expiresAt });
        return true;
      });
      return json({ ok: true, code, expiresAt, command: `/koppelaccount ${code}` }, 201);
    } catch (error) { return json({ error: error.message || 'De koppelcode kon niet worden aangemaakt.' }, 400); }
  }
  if (body.action === 'unlink-game-account') {
    try {
      await updateContent(state => {
        state.gameLinks ||= [];
        const before = state.gameLinks.length;
        state.gameLinks = state.gameLinks.filter(item => item.discordId !== user.id);
        if (state.gameLinks.length === before) throw new Error('Er is geen personage gekoppeld.');
        state.gameLinkRequests ||= [];
        state.gameLinkRequests = state.gameLinkRequests.filter(item => item.discordId !== user.id);
        appendAudit(state, user, 'ontkoppeld', 'game-account', user.username);
      });
      return json({ ok: true });
    } catch (error) { return json({ error: error.message || 'De koppeling kon niet worden verbroken.' }, 400); }
  }
  if (body.action === 'create-support-ticket' || body.action === 'reply-support-ticket') {
    const now = Date.now();
    const lastAttempt = supportAttempts.get(user.id) || 0;
    if (now - lastAttempt < 10000) return json({ error: 'Wacht even voordat je een nieuw supportbericht verstuurt.' }, 429);
    if (supportAttempts.size >= 5000) {
      for (const [id, at] of supportAttempts) if (now - at >= 10 * 60 * 1000) supportAttempts.delete(id);
      if (supportAttempts.size >= 5000) return json({ error: 'Support is momenteel druk. Probeer het later opnieuw.' }, 429);
    }
    supportAttempts.set(user.id, now);
    try {
      const content = cleanText(body.content, 4000, 'Bericht');
      const result = await updateContent(state => {
        state.supportTickets ||= [];
        const at = new Date().toISOString();
        if (body.action === 'create-support-ticket') {
          if (state.supportTickets.filter(ticket => ticket.discordId === user.id && ticket.status !== 'closed').length >= 10) {
            throw new Error('Je hebt al 10 open supporttickets. Reageer op een bestaand ticket of wacht op antwoord.');
          }
          if (state.supportTickets.length >= 20000) throw new Error('Support kan tijdelijk geen nieuwe tickets aannemen.');
          const ticket = {
            id: randomUUID(), discordId: user.id,
            username: cleanText(user.username || 'Inwoner', 80, 'Discord-naam'),
            subject: cleanText(body.subject, 120, 'Onderwerp'),
            category: cleanText(body.category || 'Overig', 40, 'Categorie'),
            status: 'open', createdAt: at, updatedAt: at,
            messages: [{ id: randomUUID(), authorId: user.id, authorName: cleanText(user.username || 'Inwoner', 80, 'Discord-naam'), authorRole: 'resident', content, createdAt: at }]
          };
          state.supportTickets.push(ticket);
          return { ok: true, ticketId: ticket.id };
        }
        const ticketId = cleanText(body.ticketId, 80, 'Ticket-ID');
        const ticket = state.supportTickets.find(item => item.id === ticketId && item.discordId === user.id);
        if (!ticket) throw new Error('Dit supportticket is niet gevonden.');
        if (ticket.status === 'closed') throw new Error('Dit supportticket is gesloten. Maak een nieuw ticket als je nog hulp nodig hebt.');
        ticket.messages ||= [];
        if (ticket.messages.length >= 200) throw new Error('Dit ticket bevat te veel berichten. Maak een nieuw ticket voor een vervolgvraag.');
        ticket.messages.push({
          id: randomUUID(), authorId: user.id, authorName: cleanText(user.username || 'Inwoner', 80, 'Discord-naam'),
          authorRole: 'resident', content, createdAt: at
        });
        ticket.updatedAt = at;
        if (ticket.status === 'waiting') ticket.status = 'open';
        return { ok: true, ticketId: ticket.id };
      });
      return json(result, body.action === 'create-support-ticket' ? 201 : 200);
    } catch (error) {
      return json({ error: error.message || 'Je supportbericht kon niet worden opgeslagen.' }, 400);
    }
  }
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
