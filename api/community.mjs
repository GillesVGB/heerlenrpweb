import { randomUUID } from 'node:crypto';
import { readContent, updateContent } from '../server/content-store.mjs';
import { clearSessionCookie, readSession, verifyOrigin } from '../server/security.mjs';
import { badMethod, cleanImage, cleanText, json, readJson } from '../server/http.mjs';
import { vercelHandler } from '../server/vercel-adapter.mjs';

const commentAttempts = new Map();
const allowedApplicationStatuses = new Set(['received', 'reviewing', 'interview', 'approved', 'rejected']);

function resident(request) {
  const user = readSession(request);
  return user && user.provider === 'discord' && /^\d{17,22}$/.test(String(user.id || '')) ? user : null;
}

function conditionMatches(question, answers) {
  const conditions = Array.isArray(question.conditions) ? question.conditions : [];
  if (!conditions.length) return true;
  const match = condition => {
    if (!condition || typeof condition.questionId !== 'string') return false;
    const actual = answers[condition.questionId];
    return Array.isArray(actual)
      ? actual.includes(condition.value)
      : String(actual ?? '') === String(condition.value ?? '');
  };
  return question.conditionMode === 'any' ? conditions.some(match) : conditions.every(match);
}

function validUpload(value) {
  if (typeof value !== 'string' || value.length > 550_000) return false;
  const match = value.match(/^data:(application\/pdf|image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return false;
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > 400_000) return false;
  if (match[1] === 'application/pdf') return data.subarray(0, 5).toString() === '%PDF-';
  if (match[1] === 'image/png') return data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (match[1] === 'image/jpeg') return data[0] === 255 && data[1] === 216 && data[data.length - 2] === 255 && data[data.length - 1] === 217;
  return data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';
}

function validateAnswers(form, rawAnswers) {
  if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) throw new Error('Controleer je antwoorden.');
  const questions = Array.isArray(form.questions) ? form.questions : [];
  const answers = {};
  const questionIds = new Set(questions.map(question => question.id));
  if (questions.length > 100 || Object.keys(rawAnswers).length > 100) throw new Error('Dit formulier bevat te veel vragen of antwoorden.');
  for (const question of questions) {
    if (!question || typeof question.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,59}$/.test(question.id)) throw new Error('Het formulier bevat een ongeldige vraag.');
    const conditions = Array.isArray(question.conditions) ? question.conditions : [];
    if (conditions.some(condition => !questionIds.has(condition.questionId) || condition.questionId === question.id)) throw new Error('Het formulier bevat een ongeldige vraagvoorwaarde.');
    if (!conditionMatches(question, rawAnswers)) continue;
    const value = rawAnswers[question.id];
    if (question.type === 'info') continue;
    if (value === undefined || value === null || value === '') {
      if (question.required) throw new Error(`Beantwoord de verplichte vraag: ${question.title}`);
      continue;
    }
    if (question.type === 'multiple' && question.required && (!Array.isArray(value) || !value.length)) throw new Error(`Kies minstens één antwoord bij "${question.title}".`);
    if (question.type === 'file') {
      if (!validUpload(value)) throw new Error(`Het bestand bij "${question.title}" is ongeldig of te groot.`);
      answers[question.id] = value;
      continue;
    }
    const options = Array.isArray(question.options) ? question.options.map(String) : [];
    if (question.type === 'multiple') {
      if (!Array.isArray(value) || value.length > options.length || value.some(answer => !options.includes(String(answer)))) throw new Error(`Kies geldige antwoorden bij "${question.title}".`);
      answers[question.id] = value.map(String);
      continue;
    }
    if (question.type === 'choice' || question.type === 'dropdown' || question.type === 'boolean') {
      const allowed = question.type === 'boolean' ? ['Ja', 'Nee'] : options;
      if (!allowed.includes(String(value))) throw new Error(`Kies een geldig antwoord bij "${question.title}".`);
      answers[question.id] = String(value);
      continue;
    }
    if (question.type === 'number') {
      const number = Number(value);
      if (!Number.isFinite(number) || String(value).length > 40) throw new Error(`Vul een geldig getal in bij "${question.title}".`);
      answers[question.id] = number;
      continue;
    }
    if (question.type === 'date') {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Vul een geldige datum in bij "${question.title}".`);
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`Vul een geldige datum in bij "${question.title}".`);
      answers[question.id] = value;
      continue;
    }
    if (!['short', 'long'].includes(question.type)) throw new Error(`Vraagtype "${question.type}" wordt niet ondersteund.`);
    const text = cleanText(value, question.maxLength || (question.type === 'long' ? 5000 : 500), question.title || 'Antwoord', !question.required);
    if (text.length < (Number(question.minLength) || 0)) throw new Error(`Je antwoord bij "${question.title}" is te kort.`);
    answers[question.id] = text;
  }
  return answers;
}

async function sendApplicationWebhook(webhookUrl, application) {
  const attachments = [];
  const lines = [
    `Sollicitatie: ${application.jobTitle}`,
    `Naam: ${application.username}`,
    `In-game naam: ${application.inGameName || 'Niet ingevuld'}`,
    `Discord-ID: ${application.discordId}`,
    `Sollicitatie-ID: ${application.id}`,
    `Ingediend: ${application.submittedAt}`,
    '',
    'Antwoorden:'
  ];
  const answerFields = [];
  for (const question of application.formSnapshot.questions || []) {
    if (question.type === 'info') continue;
    const value = application.answers[question.id];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'string' && value.startsWith('data:')) {
      const match = value.match(/^data:(application\/pdf|image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match || attachments.length >= 9) throw new Error('Bestandsbijlagen konden niet veilig worden voorbereid.');
      const extension = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[match[1]];
      const filename = `${question.id}.${extension}`;
      const id = String(attachments.length + 1);
      attachments.push({ id: Number(id), filename, contentType: match[1], data: Buffer.from(match[2], 'base64') });
      const answer = `${filename} (bijgevoegd)`;
      lines.push(`${question.title}: ${answer}`);
      answerFields.push({ name: question.title.slice(0, 256) || 'Bijlage', value: answer, inline: false });
    } else {
      const answer = Array.isArray(value) ? value.join(', ') : String(value);
      lines.push(`${question.title}: ${answer}`);
      answerFields.push({ name: question.title.slice(0, 256) || 'Antwoord', value: answer.slice(0, 1024) || '—', inline: false });
    }
  }
  const summary = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const files = [{ id: 0, filename: 'sollicitatie.txt', contentType: 'text/plain', data: summary }];
  files.push(...attachments);
  const formData = new FormData();
  const embeds = [];
  let fields = [];
  let fieldChars = 0;
  for (const field of answerFields) {
    const size = field.name.length + field.value.length;
    if (fields.length >= 20 || (fields.length && fieldChars + size > 4800)) {
      embeds.push({ title: `Antwoorden · deel ${embeds.length + 1}`, color: 0x3286f5, fields });
      fields = [];
      fieldChars = 0;
    }
    fields.push(field);
    fieldChars += size;
  }
  if (fields.length) embeds.push({ title: `Antwoorden${embeds.length ? ` · deel ${embeds.length + 1}` : ''}`, color: 0x3286f5, fields });
  embeds.unshift({
    title: `Nieuwe sollicitatie · ${application.jobTitle}`.slice(0, 256),
    color: 0x3286f5,
    description: `**${application.username}**${application.inGameName ? ` · ${application.inGameName}` : ''}\nIngediend <t:${Math.floor(Date.parse(application.submittedAt) / 1000)}:F> · ID \`${application.id}\``,
    footer: { text: 'Volledige antwoorden en bijlagen staan in sollicitatie.txt en de bijgevoegde bestanden.' }
  });
  formData.append('payload_json', JSON.stringify({
    content: `Nieuwe sollicitatie ontvangen · ${application.jobTitle}`,
    allowed_mentions: { parse: [] }, embeds: embeds.slice(0, 10),
    attachments: files.map(({ id, filename }) => ({ id, filename }))
  }));
  files.forEach(file => {
    const data = file.data instanceof Blob ? file.data : new Blob([file.data], { type: file.contentType });
    formData.append(`files[${file.id}]`, data, file.filename);
  });
  const response = await fetch(webhookUrl, {
    method: 'POST',
    body: formData,
    redirect: 'error',
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Discord-webhook gaf HTTP ${response.status}.`);
}

function addNotification(state, discordId, type, title, message, key) {
  state.notifications ||= [];
  if (key && state.notifications.some(item => item.discordId === discordId && item.key === key)) return;
  state.notifications.push({
    id: randomUUID(), discordId, type, title: String(title).slice(0, 100),
    message: String(message).slice(0, 300), key: key || '', readAt: '', createdAt: new Date().toISOString()
  });
  const accountItems = state.notifications.filter(item => item.discordId === discordId);
  for (const old of accountItems.slice(0, Math.max(0, accountItems.length - 100))) {
    state.notifications = state.notifications.filter(item => item.id !== old.id);
  }
  if (state.notifications.length > 10000) state.notifications = state.notifications.slice(-10000);
}

async function handler(request) {
  if (request.method === 'GET') {
    const user = resident(request);
    if (!user) return json({ error: 'Log in met Discord om je communitygegevens te bekijken.' }, 401);
    try {
      const state = await readContent();
      const profile = (state.residentProfiles || []).find(item => item.discordId === user.id) || {};
      return json({
        ok: true,
        profile: {
          slug: profile.slug || '',
          inGameName: profile.inGameName || '',
          bio: profile.bio || '',
          banner: profile.banner || '',
          isPublic: profile.isPublic === true,
          showBio: profile.showBio !== false,
          showInGameName: profile.showInGameName !== false,
          showAchievements: profile.showAchievements !== false
        },
        rsvps: (state.eventRsvps || []).filter(item => item.discordId === user.id).map(item => {
          const event = (state.events || []).find(row => row.id === item.eventId);
          return event ? { eventId: event.id, title: event.title, startsAt: event.startsAt, status: event.cancelled || event.status !== 'published' ? 'cancelled' : item.status } : null;
        }).filter(Boolean),
        applications: (state.applications || []).filter(item => item.discordId === user.id).map(item => ({
          id: item.id, jobId: item.jobId, jobTitle: item.jobTitle, status: item.status, submittedAt: item.submittedAt,
          history: (item.history || []).filter(entry => entry.public === true).map(entry => ({ status: entry.status, message: entry.message, at: entry.at }))
        })),
        notifications: (state.notifications || []).filter(item => item.discordId === user.id).slice(-100).reverse()
      }, 200, { 'Cache-Control': 'private, no-store' });
    } catch (error) {
      return json({ error: error.message || 'Communitygegevens zijn tijdelijk niet beschikbaar.' }, 503);
    }
  }

  if (request.method !== 'POST') return badMethod('GET, POST');
  if (!verifyOrigin(request)) return json({ error: 'Ongeldige herkomst van het verzoek.' }, 403);
  let body;
  try { body = await readJson(request, 600_000); }
  catch (error) { return json({ error: error.message }, 400); }
  if (body.action === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
  const user = resident(request);
  if (!user) return json({ error: 'Je Discord-sessie is verlopen. Log opnieuw in.' }, 401);

  try {
    if (body.action === 'save-profile') {
      const input = body.profile;
      if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Ongeldig profiel.' }, 400);
      const profile = {
        inGameName: cleanText(input.inGameName || '', 80, 'In-game naam', true),
        bio: cleanText(input.bio || '', 500, 'Beschrijving', true),
        banner: cleanImage(input.banner || ''),
        isPublic: input.isPublic === true,
        showBio: input.showBio !== false,
        showInGameName: input.showInGameName !== false,
        showAchievements: input.showAchievements !== false
      };
      for (const key of ['isPublic', 'showBio', 'showInGameName', 'showAchievements']) {
        if (input[key] !== undefined && typeof input[key] !== 'boolean') return json({ error: 'Ongeldige privacyinstelling.' }, 400);
      }
      const result = await updateContent(state => {
        state.residentProfiles ||= [];
        let current = state.residentProfiles.find(item => item.discordId === user.id);
        const isNew = !current;
        if (!current) {
          if (state.residentProfiles.length >= 10000) throw new Error('Het aantal inwonerprofielen heeft de beheerlimiet bereikt.');
          current = { discordId: user.id, createdAt: new Date().toISOString(), slug: randomUUID().replaceAll('-', '').slice(0, 24) };
          state.residentProfiles.push(current);
        }
        if (!/^[a-z0-9]{24}$/.test(String(current.slug || ''))) current.slug = randomUUID().replaceAll('-', '').slice(0, 24);
        Object.assign(current, profile, {
          username: cleanText(user.username || 'Heerlen-inwoner', 80, 'Discord-naam'),
          avatar: typeof user.avatar === 'string' && user.avatar.startsWith(`https://cdn.discordapp.com/avatars/${user.id}/`) ? user.avatar.slice(0, 1000) : '',
          updatedAt: new Date().toISOString()
        });
        return { slug: current.slug, createdAt: current.createdAt, isNew };
      });
      return json({ ok: true, profile: result });
    }

    if (body.action === 'event-rsvp') {
      const eventId = cleanText(body.eventId, 80, 'Evenement-ID');
      const result = await updateContent(state => {
        const event = (state.events || []).find(item => item.id === eventId && item.status === 'published' && item.cancelled !== true);
        if (!event) throw new Error('Dit evenement is niet beschikbaar.');
        if (Date.parse(event.startsAt) <= Date.now()) throw new Error('Aanmelden voor dit evenement is gesloten.');
        state.eventRsvps ||= [];
        const existing = state.eventRsvps.find(item => item.eventId === eventId && item.discordId === user.id);
        if (body.cancel === true) {
          if (existing) state.eventRsvps.splice(state.eventRsvps.indexOf(existing), 1);
          const waiting = state.eventRsvps.filter(item => item.eventId === eventId && item.status === 'waitlist')
            .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
          if (existing?.status === 'going' && waiting && Number(event.capacity) > 0) {
            waiting.status = 'going';
            addNotification(state, waiting.discordId, 'event', 'Je plek is vrijgekomen', `Er is een plek vrijgekomen bij "${event.title}". Je bent nu aangemeld.`, `event:${eventId}:promoted:${waiting.id}`);
          }
          return { status: '' };
        }
        if (existing) return { status: existing.status };
        if (state.eventRsvps.length >= 10000) throw new Error('Het aantal evenementaanmeldingen heeft de opslaglimiet bereikt.');
        const attendees = state.eventRsvps.filter(item => item.eventId === eventId && item.status === 'going').length;
        const status = Number(event.capacity) > 0 && attendees >= Number(event.capacity) ? 'waitlist' : 'going';
        state.eventRsvps.push({ id: randomUUID(), eventId, discordId: user.id, username: user.username, status, createdAt: new Date().toISOString() });
        return { status };
      });
      return json({ ok: true, ...result });
    }

    if (body.action === 'submit-application') {
      const jobId = cleanText(body.jobId, 80, 'Vacature-ID');
      const result = await updateContent(state => {
        const job = (state.jobs || []).find(item => item.id === jobId && item.status === 'published' && item.closed !== true &&
          (!item.opensAt || Date.parse(item.opensAt) <= Date.now()) && (!item.closesAt || Date.parse(item.closesAt) > Date.now()));
        if (!job) throw new Error('Deze vacature is niet beschikbaar.');
        const form = (state.applicationForms || []).find(item => item.id === job.formId && item.status === 'published');
        if (!form) throw new Error('Het sollicitatieformulier is niet beschikbaar.');
        state.applications ||= [];
        if (job.allowMultiple !== true && state.applications.some(item => item.jobId === jobId && item.discordId === user.id && !['rejected'].includes(item.status))) {
          throw new Error('Je hebt al op deze vacature gesolliciteerd.');
        }
        if (state.applications.length >= 10000) throw new Error('Het aantal sollicitaties heeft de opslaglimiet bereikt.');
        const answers = validateAnswers(form, body.answers);
        if (job.webhookUrl && Object.values(answers).filter(value => typeof value === 'string' && value.startsWith('data:')).length > 9) {
          throw new Error('Bij een vacature met Discord-webhook kun je maximaal 9 bestanden meesturen.');
        }
        const application = {
          id: randomUUID(), discordId: user.id, username: cleanText(user.username || 'Inwoner', 80, 'Naam'),
          inGameName: cleanText(body.inGameName || '', 80, 'In-game naam', true),
          jobId, jobTitle: job.title, formId: form.id, formVersion: form.version || 1,
          formSnapshot: { title: form.title, sections: structuredClone(form.sections || []), questions: structuredClone(form.questions || []) },
          answers, status: 'received', notes: [], history: [{ status: 'received', public: true, message: 'Je sollicitatie is ontvangen.', at: new Date().toISOString() }],
          submittedAt: new Date().toISOString()
        };
        state.applications.push(application);
        return {
          application: { id: application.id, submittedAt: application.submittedAt },
          webhookUrl: job.webhookUrl || '',
          webhookApplication: job.webhookUrl ? structuredClone(application) : null
        };
      });
      let webhook = null;
      if (result.webhookUrl) {
        try {
          await sendApplicationWebhook(result.webhookUrl, result.webhookApplication);
          webhook = { delivered: true };
        } catch {
          webhook = { delivered: false, message: 'Je sollicitatie is opgeslagen, maar de melding naar het vacaturekanaal kon niet worden verstuurd. Het team kan je sollicitatie nog steeds in het adminpanel bekijken.' };
        }
      }
      return json({ ok: true, application: result.application, webhook }, 201);
    }

    if (body.action === 'notification-read' || body.action === 'notification-delete') {
      const id = cleanText(body.id, 80, 'Melding-ID');
      await updateContent(state => {
        const index = (state.notifications || []).findIndex(item => item.id === id && item.discordId === user.id);
        if (index >= 0) {
          if (body.action === 'notification-delete') state.notifications.splice(index, 1);
          else state.notifications[index].readAt = new Date().toISOString();
        }
        return { ok: true };
      });
      return json({ ok: true });
    }
    if (body.action === 'notifications-read-all') {
      await updateContent(state => {
        const at = new Date().toISOString();
        (state.notifications || []).forEach(item => { if (item.discordId === user.id && !item.readAt) item.readAt = at; });
        return { ok: true };
      });
      return json({ ok: true });
    }
    if (body.action === 'comment-create') {
      const now = Date.now();
      const lastAttempt = commentAttempts.get(user.id) || 0;
      if (now - lastAttempt < 10000) return json({ error: 'Wacht even voordat je nog een reactie plaatst.' }, 429);
      const newsId = cleanText(body.newsId, 80, 'Nieuws-ID');
      const comment = cleanText(body.content, 1000, 'Reactie');
      if (commentAttempts.size >= 5000) {
        for (const [id, at] of commentAttempts) if (now - at >= 10 * 60 * 1000) commentAttempts.delete(id);
        if (commentAttempts.size >= 5000) return json({ error: 'Er zijn momenteel te veel reacties. Probeer het later opnieuw.' }, 429);
      }
      commentAttempts.set(user.id, now);
      await updateContent(state => {
        const news = (state.news || []).find(item => item.id === newsId && item.status === 'published');
        if (!news || news.commentsEnabled !== true) throw new Error('Reageren op dit bericht is niet mogelijk.');
        state.newsComments ||= [];
        const dayAgo = now - 24 * 60 * 60 * 1000;
        if (state.newsComments.filter(item => item.discordId === user.id && Date.parse(item.createdAt) >= dayAgo).length >= 20) throw new Error('Je hebt de dagelijkse reactielimiet bereikt.');
        state.newsComments.push({ id: randomUUID(), newsId, discordId: user.id, username: cleanText(user.username || 'Inwoner', 80, 'Naam'), content: comment, hidden: false, createdAt: new Date().toISOString() });
        if (state.newsComments.length > 20000) state.newsComments = state.newsComments.slice(-20000);
        return { ok: true };
      });
      return json({ ok: true }, 201);
    }
    if (body.action === 'comment-delete') {
      const id = cleanText(body.id, 80, 'Reactie-ID');
      await updateContent(state => {
        const comment = (state.newsComments || []).find(item => item.id === id && item.discordId === user.id);
        if (comment) comment.hidden = true;
        return { ok: true };
      });
      return json({ ok: true });
    }
    return json({ error: 'Onbekende communityactie.' }, 400);
  } catch (error) {
    return json({ error: error.message || 'De communityactie is niet gelukt.' }, 400);
  }
}

export default vercelHandler(handler);
