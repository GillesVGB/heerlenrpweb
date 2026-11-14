import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readContent, updateContent } from '../server/content-store.mjs';
import { clearSessionCookie, hasPermission, readSession, verifyOrigin } from '../server/security.mjs';
import { appendAudit, badMethod, cleanImage, cleanText, json, readJson } from '../server/http.mjs';
import { vercelHandler } from '../server/vercel-adapter.mjs';
import { dispatchAutomation, enqueueAutomation } from '../server/community-automation.mjs';
import { findSupportAttachment, inspectSupportUpload, supportAttachmentList } from '../server/support-files.mjs';

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
        supportCategories: (state.supportCategories || []).filter(item => item && item.enabled !== false).slice(0, 30).map(item => ({
          id: String(item.id || '').slice(0, 40), name: String(item.name || '').slice(0, 80),
          description: String(item.description || '').slice(0, 240),
          questions: (Array.isArray(item.questions) ? item.questions : []).slice(0, 20).map(question => ({
            id: String(question.id || '').slice(0, 40), label: String(question.label || '').slice(0, 120),
            type: ['short', 'long', 'choice', 'dropdown', 'file'].includes(question.type) ? question.type : 'short',
            required: question.required === true,
            options: Array.isArray(question.options) ? question.options.slice(0, 20).map(option => String(option).slice(0, 80)) : []
          }))
        })).filter(item => item.id && item.name),
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
          attachments: supportAttachmentList(item),
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
  try { body = await readJson(request, 1_200_000); }
  catch (error) { return json({ error: error.message }, 400); }
  if (body.action === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });

  const user = currentResident(request);
  if (!user) return json({ error: 'Je Discord-sessie is verlopen. Log opnieuw in.' }, 401);
  if (body.action === 'download-support-attachment') {
    try {
      const ticketId = cleanText(body.id, 80, 'Ticket-ID');
      const questionId = cleanText(body.questionId, 40, 'Vraag-ID');
      const state = await readContent();
      const ticket = (state.supportTickets || []).find(item => item.id === ticketId && item.discordId === user.id);
      if (!ticket) return json({ error: 'Dit supportticket is niet gevonden.' }, 404);
      const attachment = findSupportAttachment(ticket, questionId);
      if (!attachment) return json({ error: 'Deze bijlage is niet beschikbaar.' }, 404);
      return json({ attachment: { name: attachment.name, mime: attachment.mime, dataUrl: attachment.dataUrl } });
    } catch (error) { return json({ error: error.message || 'De bijlage kon niet worden geladen.' }, 400); }
  }
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
          const categoryId = cleanText(body.category, 40, 'Categorie');
          const legacyCategoryIds = { Account: 'algemeen', Whitelist: 'algemeen', Aankoop: 'aankoop', 'Speler of straf': 'melding', 'Technisch probleem': 'technisch', Overig: 'overig' };
          const category = (state.supportCategories || []).find(item => item.enabled !== false &&
            (item.id === categoryId || item.id === legacyCategoryIds[categoryId] || String(item.name || '').toLocaleLowerCase('nl-NL') === categoryId.toLocaleLowerCase('nl-NL')));
          if (!category) throw new Error('Kies een beschikbare supportcategorie.');
          const inputFields = body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields) ? body.fields : {};
          const answers = {};
          const questions = (Array.isArray(category.questions) ? category.questions : []).slice(0, 20);
          let attachmentCount = 0;
          for (const question of questions) {
            const raw = inputFields[question.id];
            if ((raw === undefined || raw === '') && question.required) throw new Error(`Vul in: ${question.label}`);
            if (raw === undefined || raw === '') continue;
            if (question.type === 'file') {
              if (++attachmentCount > 2) throw new Error('Je kunt maximaal 2 bijlagen aan een supportticket toevoegen.');
              answers[question.id] = inspectSupportUpload(raw);
              continue;
            }
            if (question.type === 'choice' || question.type === 'dropdown') {
              const options = Array.isArray(question.options) ? question.options.map(String) : [];
              if (!options.includes(String(raw))) throw new Error(`Kies een geldige optie bij: ${question.label}`);
              answers[question.id] = String(raw);
            } else answers[question.id] = cleanText(raw, question.type === 'long' ? 2000 : 300, question.label || 'Antwoord');
          }
          const ticket = {
            id: randomUUID(), discordId: user.id,
            username: cleanText(user.username || 'Inwoner', 80, 'Discord-naam'),
            subject: cleanText(body.subject, 120, 'Onderwerp'),
            category: category.name.slice(0, 80), categoryId,
            answers,
            questionSnapshot: questions.map(question => ({ id: String(question.id || '').slice(0, 40), label: String(question.label || '').slice(0, 120), type: question.type })),
            status: 'open', createdAt: at, updatedAt: at,
            messages: [{ id: randomUUID(), authorId: user.id, authorName: cleanText(user.username || 'Inwoner', 80, 'Discord-naam'), authorRole: 'resident', content, createdAt: at }]
          };
          state.supportTickets.push(ticket);
          const automationId = enqueueAutomation(state, 'ticket_opened', { sourceId: ticket.id, createdAt: at, title: 'Nieuw supportticket', summary: `Categorie: ${category.name} · ticketnummer ${ticket.id}`, url: '/admin.html', actor: 'Inwoner' });
          return { ok: true, ticketId: ticket.id, automationId };
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
      const automationId = result.automationId; delete result.automationId;
      if (automationId) await dispatchAutomation(automationId).catch(error => console.error('[portal] Support notification could not be dispatched', error?.message));
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
