import { randomUUID } from 'node:crypto';
import { readContent, updateContent } from '../server/content-store.mjs';
import { clearSessionCookie, constantTimeEqual, hasPermission, makeSession, permissionsForRoleIds, readSession, safeUser, sessionCookie, verifyOrigin } from '../server/security.mjs';
import { appendAudit, badMethod, cleanDate, cleanImage, cleanText, json, readJson } from '../server/http.mjs';
import { vercelHandler } from '../server/vercel-adapter.mjs';
import { automationTriggers, dispatchAutomation, enqueueAutomation, safeAutomationHistory, safeAutomationSettings } from '../server/community-automation.mjs';
import { findSupportAttachment, supportTicketView } from '../server/support-files.mjs';

const attempts = new Map();
const webhookTests = new Map();
const maxPasswordAttempts = 8;
const allowedApplicationStatuses = new Set(['received', 'reviewing', 'interview', 'approved', 'rejected']);

function limiterKey(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
}

function permitPasswordAttempt(request) {
  const now = Date.now();
  const key = limiterKey(request);
  const row = attempts.get(key);
  if (row && row.until > now && row.count >= maxPasswordAttempts) return false;
  if (!row || row.until <= now) attempts.set(key, { count: 1, until: now + 10 * 60 * 1000 });
  else row.count++;
  if (attempts.size > 5000) for (const [entry, item] of attempts) if (item.until <= now) attempts.delete(entry);
  return true;
}

function cleanRecord(type, raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Ongeldig bericht.');
  const common = {
    id: cleanText(raw.id || randomUUID(), 80, 'ID'),
    title: cleanText(raw.title, 160, 'Titel'),
    category: cleanText(raw.category || (type === 'news' ? 'Nieuws' : 'Serverupdate'), 60, 'Categorie'),
    excerpt: cleanText(raw.excerpt || '', 600, 'Intro', true),
    content: cleanText(raw.content, 12000, 'Beschrijving'),
    image: cleanImage(raw.image),
    publishAt: cleanDate(raw.publishAt),
    status: raw.status === 'published' ? 'published' : 'draft',
    featured: raw.featured === true,
    author: cleanText(raw.author || 'Heerlen Roleplay', 80, 'Auteur'),
    updatedAt: new Date().toISOString()
  };
  if (type === 'news') {
    if (raw.commentsEnabled !== undefined && typeof raw.commentsEnabled !== 'boolean') throw new Error('Ongeldige reactie-instelling.');
    common.commentsEnabled = raw.commentsEnabled === true;
  }
  if (type === 'changelog') common.version = cleanText(raw.version || 'Update', 60, 'Versie');
  return common;
}

function cleanStaff(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Ongeldig staffprofiel.');
  return {
    id: cleanText(raw.id || randomUUID(), 80, 'ID'),
    name: cleanText(raw.name, 80, 'Naam'),
    username: cleanText(raw.username || '', 80, 'Gebruikersnaam', true),
    category: cleanText(raw.category || 'Staff', 60, 'Categorie'),
    role: cleanText(raw.role, 80, 'Functie'),
    bio: cleanText(raw.bio || '', 600, 'Beschrijving', true),
    avatar: cleanImage(raw.avatar),
    discordId: cleanText(raw.discordId || '', 40, 'Discord-ID', true),
    joinedAt: cleanDate(raw.joinedAt),
    order: Math.max(0, Math.min(9999, Number(raw.order) || 0)),
    active: raw.active !== false,
    updatedAt: new Date().toISOString()
  };
}

function cleanFormQuestion(raw, index) {
  const types = new Set(['short', 'long', 'number', 'date', 'choice', 'multiple', 'dropdown', 'boolean', 'file', 'info']);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Ongeldige vraag ${index + 1}.`);
  const id = cleanText(raw.id, 60, `Vraag-ID ${index + 1}`);
  if (!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(id)) throw new Error(`Ongeldige vraag-ID: ${id}`);
  if (!types.has(raw.type)) throw new Error(`Kies een geldig vraagtype voor "${raw.title}".`);
  if (raw.required !== undefined && typeof raw.required !== 'boolean') throw new Error('Ongeldige verplicht-instelling.');
  const question = {
    id,
    title: cleanText(raw.title, 160, 'Vraag'),
    type: raw.type,
    required: raw.required === true,
    description: cleanText(raw.description || '', 500, 'Vraagtoelichting', true)
  };
  if (raw.sectionId !== undefined && raw.sectionId !== '') question.sectionId = cleanText(raw.sectionId, 60, 'Formulieronderdeel');
  if (['choice', 'multiple', 'dropdown'].includes(question.type)) {
    if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 100) throw new Error(`Voeg 2 tot 100 antwoordopties toe aan "${question.title}".`);
    question.options = raw.options.map((option, optionIndex) => cleanText(option, 120, `Optie ${optionIndex + 1}`));
  }
  if (question.type === 'file') {
    question.allowedFiles = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    question.maxFileBytes = 400000;
  }
  for (const [key, max] of [['minLength', 5000], ['maxLength', 5000]]) {
    if (raw[key] !== undefined) {
      if (!Number.isInteger(Number(raw[key])) || Number(raw[key]) < (key === 'minLength' ? 0 : 1) || Number(raw[key]) > max) throw new Error(`Ongeldige ${key} bij "${question.title}".`);
      question[key] = Number(raw[key]);
    }
  }
  if (question.minLength && question.maxLength && question.minLength > question.maxLength) throw new Error(`De minimale lengte is groter dan de maximale lengte bij "${question.title}".`);
  if (raw.conditions !== undefined) {
    if (!Array.isArray(raw.conditions) || raw.conditions.length > 10) throw new Error(`Ongeldige voorwaarden bij "${question.title}".`);
    question.conditions = raw.conditions.map(condition => ({
      questionId: cleanText(condition?.questionId, 60, 'Voorwaardevraag'),
      value: cleanText(condition?.value, 240, 'Voorwaardeantwoord', true)
    }));
    question.conditionMode = raw.conditionMode === 'any' ? 'any' : 'all';
  }
  return question;
}

function cleanDiscordWebhook(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 300) throw new Error('Vul een geldige Discord-webhook-URL in.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Vul een geldige Discord-webhook-URL in.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || url.port || url.username || url.password || url.search || url.hash ||
      !/^\/api\/webhooks\/\d{17,22}\/[A-Za-z0-9._-]{20,200}$/.test(url.pathname)) {
    throw new Error('Gebruik de volledige HTTPS-webhook-URL van discord.com.');
  }
  return url.toString();
}

function cleanCommunityRecord(type, raw, current) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Ongeldig community-item.');
  const id = cleanText(raw.id || randomUUID(), 80, 'ID');
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)) throw new Error('Gebruik een geldige ID.');
  const status = raw.status === 'published' ? 'published' : 'draft';
  const updatedAt = new Date().toISOString();
  if (type === 'events') {
    const capacity = raw.capacity === '' || raw.capacity === undefined ? 0 : Number(raw.capacity);
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 10000) throw new Error('Vul een geldige capaciteit in.');
    const startsAt = cleanDate(raw.startsAt);
    const endsAt = cleanDate(raw.endsAt);
    if (!startsAt) throw new Error('Vul een startdatum in.');
    if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) throw new Error('De einddatum kan niet voor de startdatum liggen.');
    for (const field of ['featured', 'cancelled']) if (raw[field] !== undefined && typeof raw[field] !== 'boolean') throw new Error('Ongeldige evenementinstelling.');
    return {
      id, title: cleanText(raw.title, 120, 'Titel'), excerpt: cleanText(raw.excerpt || '', 600, 'Intro', true),
      description: cleanText(raw.description || '', 12000, 'Beschrijving', true), image: cleanImage(raw.image),
      location: cleanText(raw.location || '', 160, 'Locatie', true), organizer: cleanText(raw.organizer || '', 100, 'Organisator', true),
      startsAt, endsAt, capacity, featured: raw.featured === true, cancelled: raw.cancelled === true,
      status, updatedAt, ...(current?.createdAt ? { createdAt: current.createdAt } : { createdAt: updatedAt })
    };
  }
  if (type === 'jobs') {
    for (const field of ['closed', 'allowMultiple']) if (raw[field] !== undefined && typeof raw[field] !== 'boolean') throw new Error('Ongeldige vacature-instelling.');
    const opensAt = cleanDate(raw.opensAt);
    const closesAt = cleanDate(raw.closesAt);
    if (opensAt && closesAt && Date.parse(closesAt) <= Date.parse(opensAt)) throw new Error('De sluitingsdatum moet na de openingsdatum liggen.');
    return {
      id, title: cleanText(raw.title, 120, 'Titel'), excerpt: cleanText(raw.excerpt || '', 600, 'Intro', true),
      description: cleanText(raw.description || '', 12000, 'Beschrijving', true), image: cleanImage(raw.image),
      requirements: cleanText(raw.requirements || '', 6000, 'Vereisten', true),
      responsibilities: cleanText(raw.responsibilities || '', 6000, 'Verantwoordelijkheden', true),
      information: cleanText(raw.information || '', 6000, 'Informatie', true),
      formId: cleanText(raw.formId, 80, 'Sollicitatieformulier'), opensAt, closesAt,
      webhookUrl: cleanDiscordWebhook(raw.webhookUrl),
      allowMultiple: raw.allowMultiple === true, closed: raw.closed === true, status, updatedAt,
      ...(current?.createdAt ? { createdAt: current.createdAt } : { createdAt: updatedAt })
    };
  }
  if (type === 'applicationForms') {
    if (!Array.isArray(raw.questions) || raw.questions.length < 1 || raw.questions.length > 100) throw new Error('Een formulier heeft 1 tot 100 vragen nodig.');
    if (raw.sections !== undefined && (!Array.isArray(raw.sections) || raw.sections.length > 30)) throw new Error('Een formulier kan maximaal 30 onderdelen bevatten.');
    const sections = (raw.sections || []).map((section, index) => ({
      id: cleanText(section?.id || `section-${index + 1}`, 60, 'Onderdeel-ID'),
      title: cleanText(section?.title || `Onderdeel ${index + 1}`, 120, 'Onderdeeltitel'),
      description: cleanText(section?.description || '', 500, 'Onderdeelinformatie', true)
    }));
    const sectionIds = new Set();
    for (const section of sections) {
      if (!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(section.id) || sectionIds.has(section.id)) throw new Error(`Ongeldige of dubbele formulieronderdeel-ID: ${section.id}`);
      sectionIds.add(section.id);
    }
    const questions = raw.questions.map(cleanFormQuestion);
    const questionIds = new Set();
    for (const question of questions) {
      if (questionIds.has(question.id)) throw new Error(`De vraag-ID "${question.id}" komt meerdere keren voor.`);
      questionIds.add(question.id);
    }
    for (const question of questions) {
      if (question.sectionId && !sectionIds.has(question.sectionId)) throw new Error(`Ongeldig formulieronderdeel bij "${question.title}".`);
      for (const condition of question.conditions || []) {
        if (!questionIds.has(condition.questionId) || condition.questionId === question.id) throw new Error(`Ongeldige vraagvoorwaarde bij "${question.title}".`);
      }
    }
    const description = cleanText(raw.description || '', 600, 'Formulierintro', true);
    const unchanged = current && JSON.stringify(current.questions) === JSON.stringify(questions) &&
      JSON.stringify(current.sections || []) === JSON.stringify(sections) && current.title === raw.title && current.description === description;
    return {
      id, title: cleanText(raw.title, 120, 'Formuliertitel'), description,
      sections, questions, status, version: unchanged ? (current.version || 1) : (current?.version || 0) + 1,
      updatedAt, ...(current?.createdAt ? { createdAt: current.createdAt } : { createdAt: updatedAt })
    };
  }
  if (type === 'helpCategories') return {
    id, name: cleanText(raw.name, 80, 'Categorienaam'), description: cleanText(raw.description || '', 300, 'Beschrijving', true),
    order: Math.max(0, Math.min(9999, Number(raw.order) || 0)), updatedAt
  };
  if (type === 'helpArticles') return {
    id, title: cleanText(raw.title, 160, 'Titel'), category: cleanText(raw.category, 80, 'Categorie'),
    keywords: Array.isArray(raw.keywords) ? raw.keywords.slice(0, 20).map(value => cleanText(value, 40, 'Zoekwoord')) : [],
    excerpt: cleanText(raw.excerpt || '', 600, 'Intro', true), content: cleanText(raw.content, 12000, 'Artikel'),
    image: cleanImage(raw.image), featured: raw.featured === true, publishAt: cleanDate(raw.publishAt), status, updatedAt
  };
  throw new Error('Onbekend community-item.');
}

function addAdminNotification(state, discordId, type, title, message, key) {
  state.notifications ||= [];
  if (key && state.notifications.some(item => item.discordId === discordId && item.key === key)) return;
  state.notifications.push({ id: randomUUID(), discordId, type, title: title.slice(0, 100), message: message.slice(0, 300), key: key || '', readAt: '', createdAt: new Date().toISOString() });
  const items = state.notifications.filter(item => item.discordId === discordId);
  if (items.length > 100) {
    const removeIds = new Set(items.slice(0, items.length - 100).map(item => item.id));
    state.notifications = state.notifications.filter(item => !removeIds.has(item.id));
  }
  if (state.notifications.length > 10000) state.notifications = state.notifications.slice(-10000);
}

async function currentSession(request) {
  const session = readSession(request);
  if (!session) return { status: 401, error: 'Log opnieuw in.' };
  if (session.provider !== 'discord') return { user: session };
  if (!process.env.DISCORD_GUILD_ID || !process.env.DISCORD_BOT_TOKEN) return { status: 503, error: 'Discord-rolcontrole is niet ingesteld.' };
  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(process.env.DISCORD_GUILD_ID)}/members/${encodeURIComponent(session.id)}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    if (response.status === 404) return { status: 401, error: 'Je Discord-account heeft geen toegang meer tot deze server.' };
    if (!response.ok) return { status: 503, error: 'Discord kan je rechten nu niet controleren.' };
    const member = await response.json();
    const roles = Array.isArray(member.roles) ? member.roles : [];
    const permissions = permissionsForRoleIds(roles);
    if (!permissions.length) return { status: 403, error: 'Je Discord-rollen geven geen toegang meer.' };
    const user = { ...session, username: member.user?.global_name || member.user?.username || session.username, roles, permissions };
    return { user };
  } catch { return { status: 503, error: 'Discord kan je rechten nu niet controleren.' }; }
}

async function resolveDiscordProfile(raw) {
  const id = String(raw?.discordId || '').trim();
  if (!/^\d{17,22}$/.test(id) || !process.env.DISCORD_GUILD_ID || !process.env.DISCORD_BOT_TOKEN) return {};
  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(process.env.DISCORD_GUILD_ID)}/members/${id}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return {};
    const member = await response.json();
    const user = member.user || {};
    const avatar = user.avatar ? `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256` : '';
    return { username: user.global_name || user.username || '', avatar };
  } catch { return {}; }
}

function recordAction(state, user, type, action, raw) {
  const item = type === 'staff' ? cleanStaff(raw) : cleanRecord(type, raw);
  if (type !== 'staff') item.author = user.username;
  const key = type === 'staff' ? 'staff' : type === 'news' ? 'news' : 'changelog';
  state[key] ||= [];
  const index = state[key].findIndex(current => current.id === item.id);
  if (action === 'delete') {
    if (index >= 0) state[key].splice(index, 1);
  } else if (index >= 0) state[key][index] = { ...state[key][index], ...item };
  else state[key].push(item);
  appendAudit(state, user, action === 'delete' ? 'verwijderd' : index >= 0 ? 'aangepast' : 'aangemaakt', key, item.title || item.name);
  return { ok: true };
}

async function handler(request) {
  if (request.method === 'GET') {
    const current = await currentSession(request);
    if (!current.user) return json({ ok: false, error: current.error }, current.status);
    const session = current.user;
    const viewPermissions = ['admin:site', 'staff:read', 'users:manage', 'events:manage', 'jobs:manage', 'forms:manage', 'applications:read', 'applications:review', 'help:manage', 'comments:moderate', 'profiles:moderate', 'notifications:manage', 'achievements:manage', 'support:manage'];
    if (!viewPermissions.some(permission => hasPermission(session, permission))) return json({ ok: false }, 403);
    try {
      const content = await readContent();
      const view = {
        news: hasPermission(session, 'news:write') ? content.news : undefined,
        changelog: hasPermission(session, 'changelog:write') ? content.changelog : undefined,
        staff: hasPermission(session, 'staff:read') || hasPermission(session, 'staff:write') ? content.staff : undefined,
        rulesDraft: hasPermission(session, 'rules:write') ? content.rulesDraft : undefined,
        rulesVersions: hasPermission(session, 'audit:read') ? content.rulesVersions : undefined,
        auditLog: hasPermission(session, 'audit:read') ? content.auditLog : undefined,
        achievements: hasPermission(session, 'users:manage') || hasPermission(session, 'achievements:manage') ? (content.achievements || []) : undefined,
        achievementAwards: hasPermission(session, 'users:manage') || hasPermission(session, 'achievements:manage') ? (content.achievementAwards || []) : undefined,
        residentProfiles: hasPermission(session, 'users:manage') || hasPermission(session, 'profiles:moderate') ? (content.residentProfiles || []) : undefined,
        gameLinks: hasPermission(session, 'users:manage') ? (content.gameLinks || []).map(link => ({ discordId: link.discordId, name: link.name, linkedAt: link.linkedAt })) : undefined,
        residentNotices: hasPermission(session, 'users:manage') ? (content.residentNotices || []) : undefined,
        events: hasPermission(session, 'events:manage') ? (content.events || []) : undefined,
        eventRsvps: hasPermission(session, 'events:manage') ? (content.eventRsvps || []) : undefined,
        jobs: hasPermission(session, 'jobs:manage') ? (content.jobs || []) : undefined,
        applicationForms: hasPermission(session, 'forms:manage') ? (content.applicationForms || []) : undefined,
        applications: hasPermission(session, 'applications:read') || hasPermission(session, 'applications:review') ? (content.applications || []) : undefined,
        helpArticles: hasPermission(session, 'help:manage') ? (content.helpArticles || []) : undefined,
        helpCategories: hasPermission(session, 'help:manage') ? (content.helpCategories || []) : undefined,
        supportTickets: hasPermission(session, 'support:manage') ? (content.supportTickets || []).map(ticket => supportTicketView(ticket)) : undefined,
        supportCategories: hasPermission(session, 'support:manage') ? (content.supportCategories || []) : undefined,
        discordAutomations: hasPermission(session, 'notifications:manage') ? safeAutomationSettings(content) : undefined,
        automationHistory: hasPermission(session, 'notifications:manage') ? safeAutomationHistory(content) : undefined,
        newsComments: hasPermission(session, 'comments:moderate') ? (content.newsComments || []) : undefined,
        siteSettings: hasPermission(session, 'admin:site') ? (content.siteSettings || {}) : undefined,
        storeSettings: hasPermission(session, 'admin:site') ? (content.storeSettings || {}) : undefined
      };
      return json({ ok: true, user: safeUser(session), content: view, integration: { discord: !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_GUILD_ID && process.env.DISCORD_BOT_TOKEN), fivemLink: (process.env.FIVEM_LINK_SECRET || '').length >= 32, database: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) || !!process.env.DATABASE_URL, privateBlob: !!process.env.BLOB_READ_WRITE_TOKEN || !!(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN) } });
    } catch (error) { return json({ error: error.message }, 503); }
  }

  if (request.method !== 'POST') return badMethod('GET, POST');
  if (!verifyOrigin(request)) return json({ error: 'Ongeldige herkomst van het verzoek.' }, 403);

  let body;
  try { body = await readJson(request); }
  catch (error) { return json({ error: error.message }, 400); }

  if (body.action === 'password-login') {
    if (!permitPasswordAttempt(request)) return json({ error: 'Te veel pogingen. Probeer het later opnieuw.' }, 429);
    const expected = process.env.ADMIN_PASSWORD;
    if (expected && expected.length < 12) return json({ error: 'Stel ADMIN_PASSWORD in op minstens 12 tekens.' }, 503);
    if (!expected) return json({ error: 'ADMIN_PASSWORD ontbreekt op deze server. Stel de omgevingsvariabele in en herstart de preview.' }, 503);
    if (!constantTimeEqual(body.password, expected)) return json({ error: 'Inloggen is niet gelukt.' }, 401);
    try {
      attempts.delete(limiterKey(request));
      const permissions = ['admin:site', 'news:write', 'changelog:write', 'staff:write', 'staff:read', 'rules:write', 'audit:read', 'discord:read', 'users:manage', 'events:manage', 'jobs:manage', 'forms:manage', 'applications:read', 'applications:review', 'help:manage', 'comments:moderate', 'achievements:manage', 'profiles:moderate', 'notifications:manage', 'support:manage'];
      const session = makeSession({ id: 'password-admin', username: 'Beheerder', roles: ['password-admin'], permissions, provider: 'password' });
      return json({ ok: true, user: { id: 'password-admin', username: 'Beheerder', permissions } }, 200, { 'Set-Cookie': sessionCookie(session, request) });
    } catch (error) { return json({ error: error.message }, 503); }
  }

  if (body.action === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
  const current = await currentSession(request);
  const user = current.user;
  if (!user) return json({ error: current.error }, current.status);

  try {
    if (body.action === 'download-support-attachment') {
      if (!hasPermission(user, 'support:manage')) return json({ error: 'Je mag supportbijlagen niet bekijken.' }, 403);
      const id = cleanText(body.id, 80, 'Ticket-ID');
      const questionId = cleanText(body.questionId, 40, 'Vraag-ID');
      const content = await readContent();
      const ticket = (content.supportTickets || []).find(item => item.id === id);
      if (!ticket) return json({ error: 'Dit supportticket bestaat niet.' }, 404);
      const attachment = findSupportAttachment(ticket, questionId);
      if (!attachment) return json({ error: 'Deze bijlage is niet beschikbaar.' }, 404);
      return json({ attachment: { name: attachment.name, mime: attachment.mime, dataUrl: attachment.dataUrl } });
    }

    if (body.action === 'save-discord-automation') {
      if (!hasPermission(user, 'notifications:manage')) return json({ error: 'Je mag Discord-meldingen niet beheren.' }, 403);
      const type = cleanText(body.type, 40, 'Type melding');
      if (!Object.hasOwn(automationTriggers, type)) return json({ error: 'Kies een geldig meldingstype.' }, 400);
      if (typeof body.enabled !== 'boolean') return json({ error: 'Geef aan of de melding actief is.' }, 400);
      const template = cleanText(body.template || '', 900, 'Berichtsjabloon', true);
      let webhookUrl = '';
      if (body.webhookUrl) {
        try { webhookUrl = cleanDiscordWebhook(body.webhookUrl); }
        catch (error) { return json({ error: error.message }, 400); }
      }
      const result = await updateContent(state => {
        state.discordAutomations ||= {};
        const current = state.discordAutomations[type] || {};
        state.discordAutomations[type] = { enabled: body.enabled, template, webhookUrl: webhookUrl || current.webhookUrl || '' };
        appendAudit(state, user, 'aangepast', 'Discord-melding', automationTriggers[type]);
        return { ok: true, configured: !!state.discordAutomations[type].webhookUrl };
      });
      return json(result);
    }
    if (body.action === 'test-discord-automation') {
      if (!hasPermission(user, 'notifications:manage')) return json({ error: 'Je mag Discord-meldingen niet beheren.' }, 403);
      let webhookUrl = '';
      try {
        if (body.webhookUrl) webhookUrl = cleanDiscordWebhook(body.webhookUrl);
        else if (Object.hasOwn(automationTriggers, body.type)) webhookUrl = (await readContent()).discordAutomations?.[body.type]?.webhookUrl || '';
        if (!webhookUrl) throw new Error('Stel eerst een webhook in en sla de trigger op.');
      }
      catch (error) { return json({ error: error.message }, 400); }
      const now = Date.now();
      const lastTest = webhookTests.get(user.id) || 0;
      if (now - lastTest < 15_000) return json({ error: 'Wacht even voordat je opnieuw een testbericht verstuurt.' }, 429);
      webhookTests.set(user.id, now);
      if (webhookTests.size > 5000) for (const [id, testedAt] of webhookTests) if (now - testedAt > 60 * 60 * 1000) webhookTests.delete(id);
      const response = await fetch(webhookUrl, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(6000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '', allowed_mentions: { parse: [] }, embeds: [{ title: 'Heerlen Roleplay · testmelding', description: 'De Discord-koppeling werkt. Sla de trigger op om meldingen te activeren.', color: 0x3987e8, timestamp: new Date().toISOString() }] }) });
      if (!response.ok) return json({ error: `Discord weigerde de testmelding (HTTP ${response.status}).` }, 502);
      return json({ ok: true });
    }
    if (body.action === 'retry-discord-automation') {
      if (!hasPermission(user, 'notifications:manage')) return json({ error: 'Je mag Discord-meldingen niet beheren.' }, 403);
      const id = cleanText(body.id, 80, 'Verzend-ID');
      const result = await updateContent(state => {
        const run = (state.automationRuns || []).find(item => item.id === id && item.status === 'failed');
        if (!run) throw new Error('Alleen mislukte verzendingen kun je opnieuw proberen.');
        if ((Number(run.attempts) || 0) >= 3) throw new Error('Deze melding is al drie keer geprobeerd.');
        run.status = 'pending'; run.updatedAt = new Date().toISOString();
        appendAudit(state, user, 'opnieuw geprobeerd', 'Discord-melding', run.label);
        return { ok: true };
      });
      await dispatchAutomation(id);
      return json(result);
    }
    if (body.action === 'admin-unlink-game-account') {
      if (!hasPermission(user, 'users:manage')) return json({ error: 'Je mag in-game accounts niet beheren.' }, 403);
      const discordId = cleanText(body.discordId, 22, 'Discord-ID');
      if (!/^\d{17,22}$/.test(discordId)) return json({ error: 'Ongeldig Discord-ID.' }, 400);
      const result = await updateContent(state => {
        state.gameLinks ||= [];
        const link = state.gameLinks.find(item => item.discordId === discordId);
        if (!link) throw new Error('Er is geen gekoppeld personage voor dit account.');
        state.gameLinks = state.gameLinks.filter(item => item.discordId !== discordId);
        state.gameLinkRequests ||= [];
        state.gameLinkRequests = state.gameLinkRequests.filter(item => item.discordId !== discordId);
        appendAudit(state, user, 'ontkoppeld door beheer', 'game-account', `${link.name} · ${discordId}`);
        return { ok: true };
      });
      return json(result);
    }

    if (body.action === 'test-application-webhook') {
      if (!hasPermission(user, 'jobs:manage')) return json({ error: 'Je mag vacature-webhooks niet beheren.' }, 403);
      const webhookUrl = cleanDiscordWebhook(body.webhookUrl);
      if (!webhookUrl) return json({ error: 'Vul eerst de Discord-webhook van dit vacaturekanaal in.' }, 400);
      const now = Date.now();
      const lastTest = webhookTests.get(user.id) || 0;
      if (now - lastTest < 15_000) return json({ error: 'Wacht even voordat je opnieuw een testbericht verstuurt.' }, 429);
      webhookTests.set(user.id, now);
      if (webhookTests.size > 5000) for (const [id, testedAt] of webhookTests) if (now - testedAt > 60 * 60 * 1000) webhookTests.delete(id);
      const response = await fetch(webhookUrl, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(6000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '✅ Testbericht Heerlen Roleplay · deze webhook is gekoppeld aan een vacature.',
          allowed_mentions: { parse: [] },
          embeds: [{ title: 'Sollicitaties ontvangen', description: 'Nieuwe inzendingen voor deze vacature verschijnen hier met kandidaat, antwoorden en eventuele bijlagen.', color: 0x3286f5, timestamp: new Date().toISOString() }]
        })
      });
      if (!response.ok) return json({ error: `Discord heeft het testbericht geweigerd (HTTP ${response.status}). Controleer de webhook-URL en kanaalrechten.` }, 502);
      return json({ ok: true, message: 'Testbericht is in Discord geplaatst. Sla de vacature op om deze webhook te koppelen.' });
    }

    if (body.action === 'save-site-settings') {
      if (!hasPermission(user, 'admin:site')) return json({ error: 'Alleen sitebeheerders mogen de openbare instellingen wijzigen.' }, 403);
      const input = body.settings;
      if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Ongeldige site-instellingen.' }, 400);
      const themes = ['standard', 'halloween', 'christmas', 'newyear', 'easter'];
      const allowedSeasonPages = ['home', 'news', 'updates', 'staff', 'rules', 'shop'];
      if (input.seasonTheme !== undefined && !themes.includes(input.seasonTheme)) return json({ error: 'Kies een geldig seizoensthema.' }, 400);
      for (const key of ['promoEnabled', 'seasonEnabled', 'seasonAccentEnabled', 'seasonEffects', 'maintenanceEnabled']) {
        if (input[key] !== undefined && typeof input[key] !== 'boolean') return json({ error: 'Ongeldige schakelaar: ' + key }, 400);
      }
      if (input.seasonAccent !== undefined && (typeof input.seasonAccent !== 'string' || !/^#[\da-f]{6}$/i.test(input.seasonAccent))) return json({ error: 'Ongeldige accentkleur.' }, 400);
      const numericSettings = { seasonIntensity: [0.2, 2], seasonSpeed: [0.5, 2], seasonDensity: [0, 40], seasonFrequency: [0.5, 2] };
      for (const [key, [min, max]] of Object.entries(numericSettings)) {
        if (input[key] !== undefined && (!Number.isFinite(Number(input[key])) || Number(input[key]) < min || Number(input[key]) > max)) return json({ error: 'Ongeldige waarde voor ' + key + '.' }, 400);
      }
      if (input.seasonPages !== undefined && (!Array.isArray(input.seasonPages) || input.seasonPages.some(page => !allowedSeasonPages.includes(page)))) return json({ error: 'Ongeldige themapaginaselectie.' }, 400);
      for (const key of ['seasonStart', 'seasonEnd']) {
        if (input[key] !== undefined && input[key] !== '' && (typeof input[key] !== 'string' || input[key].length > 32 || !Number.isFinite(Date.parse(input[key])))) return json({ error: 'Ongeldige datum voor ' + key + '.' }, 400);
      }
      if (input.seasonStart && input.seasonEnd && Date.parse(input.seasonStart) >= Date.parse(input.seasonEnd)) return json({ error: 'De einddatum moet na de startdatum liggen.' }, 400);
      if (input.promoMode !== undefined && !['promo', 'announcement'].includes(input.promoMode)) return json({ error: 'Ongeldige mededelingweergave.' }, 400);
      const textFields = { promoBonus: [40, 'Kop'], promoText: [120, 'Tekst'], promoCta: [40, 'Knoptekst'], heroTitle: [60, 'Hoofdtitel'], heroLead: [240, 'Introtekst'], maintenanceMessage: [240, 'Onderhoudsmelding'] };
      const clean = {};
      for (const [key, [limit, label]] of Object.entries(textFields)) {
        if (input[key] !== undefined) clean[key] = cleanText(input[key], limit, label, true);
      }
      if (input.tebexToken !== undefined) {
        if (typeof input.tebexToken !== 'string' || input.tebexToken.length > 120) return json({ error: 'Ongeldige Tebex-token.' }, 400);
        clean.tebexToken = input.tebexToken.trim();
      }
      if (input.tebexPackages !== undefined) {
        if (!input.tebexPackages || typeof input.tebexPackages !== 'object' || Array.isArray(input.tebexPackages) || Object.keys(input.tebexPackages).length > 100) return json({ error: 'Ongeldige Tebex-pakketten.' }, 400);
        const packages = {};
        for (const [id, packageId] of Object.entries(input.tebexPackages)) {
          if (!/^[a-z0-9-]{1,60}$/.test(id) || typeof packageId !== 'string' || packageId.length > 32 || (packageId && !/^\d+$/.test(packageId))) return json({ error: 'Ongeldig Tebex-pakket-ID.' }, 400);
          packages[id] = packageId.trim();
        }
        clean.tebexPackages = packages;
      }
      if (input.shopProducts !== undefined) {
        const allowedProducts = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200].map(amount => `coins-${amount}`));
        if (!input.shopProducts || typeof input.shopProducts !== 'object' || Array.isArray(input.shopProducts) || Object.keys(input.shopProducts).length > 20) return json({ error: 'Ongeldige shopproducten.' }, 400);
        const products = {};
        for (const [id, product] of Object.entries(input.shopProducts)) {
          if (!allowedProducts.has(id) || !product || typeof product !== 'object' || Array.isArray(product)) return json({ error: 'Ongeldig shopproduct.' }, 400);
          const item = {};
          if (product.name !== undefined) item.name = cleanText(product.name, 60, 'Productnaam', false);
          if (product.blurb !== undefined) item.blurb = cleanText(product.blurb, 240, 'Productomschrijving', false);
          if (product.featured !== undefined) {
            if (typeof product.featured !== 'boolean') return json({ error: 'Ongeldige uitgelicht-instelling.' }, 400);
            item.featured = product.featured;
          }
          if (product.amount !== undefined) {
            if (!Number.isInteger(Number(product.amount)) || Number(product.amount) < 1 || Number(product.amount) > 100000) return json({ error: 'Ongeldig coin-aantal.' }, 400);
            item.amount = Number(product.amount);
          }
          if (product.bonus !== undefined) {
            if (!Number.isInteger(Number(product.bonus)) || Number(product.bonus) < 0 || Number(product.bonus) > 10000) return json({ error: 'Ongeldige productbonus.' }, 400);
            item.bonus = Number(product.bonus);
          }
          products[id] = item;
        }
        clean.shopProducts = products;
      }
      if (input.shopCategories !== undefined) {
        if (!Array.isArray(input.shopCategories) || input.shopCategories.length > 30) return json({ error: 'Ongeldige shopcategorieën.' }, 400);
        const ids = new Set();
        const names = new Set();
        clean.shopCategories = [];
        for (const category of input.shopCategories) {
          if (!category || typeof category !== 'object' || Array.isArray(category) || typeof category.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(category.id) || category.id === 'coins' || ids.has(category.id)) return json({ error: 'Ongeldige shopcategorie.' }, 400);
          const name = cleanText(category.name, 40, 'Categorienaam', false);
          const normalizedName = name.toLocaleLowerCase('nl-NL');
          if (names.has(normalizedName)) return json({ error: 'Deze shopcategorie bestaat al.' }, 400);
          ids.add(category.id);
          names.add(normalizedName);
          clean.shopCategories.push({ id: category.id, name });
        }
      }
      if (input.customShopProducts !== undefined) {
        if (!Array.isArray(input.customShopProducts) || input.customShopProducts.length > 100) return json({ error: 'Ongeldige extra Tebex-pakketten.' }, 400);
        const ids = new Set();
        clean.customShopProducts = [];
        for (const product of input.customShopProducts) {
          if (!product || typeof product !== 'object' || Array.isArray(product) || typeof product.id !== 'string' || !/^custom-[a-z0-9-]{1,50}$/.test(product.id) || ids.has(product.id)) return json({ error: 'Ongeldig extra Tebex-pakket.' }, 400);
          if (typeof product.category !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(product.category)) return json({ error: 'Kies een geldige productcategorie.' }, 400);
          if (typeof product.tebexId !== 'string' || product.tebexId.length > 32 || !/^\d+$/.test(product.tebexId)) return json({ error: 'Vul een geldig Tebex package-ID in.' }, 400);
          if (product.featured !== undefined && typeof product.featured !== 'boolean') return json({ error: 'Ongeldige uitgelicht-instelling.' }, 400);
          if (product.visible !== undefined && typeof product.visible !== 'boolean') return json({ error: 'Ongeldige zichtbaarheid-instelling.' }, 400);
          ids.add(product.id);
          clean.customShopProducts.push({
            id: product.id,
            name: cleanText(product.name, 60, 'Productnaam', false),
            blurb: cleanText(product.blurb, 240, 'Productomschrijving', true),
            category: product.category,
            tebexId: product.tebexId,
            featured: product.featured === true,
            visible: product.visible !== false
          });
        }
      }
      for (const key of ['promoEnabled', 'seasonEnabled', 'seasonAccentEnabled', 'seasonEffects', 'maintenanceEnabled', 'promoMode', 'seasonTheme', 'seasonStart', 'seasonEnd', 'seasonAccent']) {
        if (input[key] !== undefined) clean[key] = input[key];
      }
      for (const key of Object.keys(numericSettings)) if (input[key] !== undefined) clean[key] = Number(input[key]);
      if (input.seasonPages !== undefined) clean.seasonPages = [...new Set(input.seasonPages)];
      const result = await updateContent(state => {
        const { tebexToken, tebexPackages, shopCategories, customShopProducts, ...siteSettings } = clean;
        state.siteSettings = { ...(state.siteSettings || {}), ...siteSettings, updatedAt: new Date().toISOString(), updatedBy: user.username };
        if (clean.tebexToken !== undefined || clean.tebexPackages !== undefined || clean.shopProducts !== undefined || shopCategories !== undefined || customShopProducts !== undefined) {
          state.storeSettings = {
            ...(state.storeSettings || {}),
            ...(tebexToken !== undefined ? { tebexToken } : {}),
            ...(tebexPackages !== undefined ? { tebexPackages } : {}),
            ...(clean.shopProducts !== undefined ? { shopProducts: clean.shopProducts } : {}),
            ...(shopCategories !== undefined ? { shopCategories } : {}),
            ...(customShopProducts !== undefined ? { customShopProducts } : {}),
            updatedAt: new Date().toISOString(),
            updatedBy: user.username
          };
          appendAudit(state, user, 'aangepast', 'winkelinstellingen', 'Tebex-token, categorieën en producten');
        }
        appendAudit(state, user, 'aangepast', 'site-instellingen', 'Homepage, thema en onderhoud');
        return { ok: true };
      });
      return json(result);
    }

    if (body.action === 'save-community-record' || body.action === 'delete-community-record') {
      const collections = new Set(['events', 'jobs', 'applicationForms', 'helpArticles', 'helpCategories']);
      if (!collections.has(body.type)) return json({ error: 'Onbekend community-onderdeel.' }, 400);
      const permission = body.type === 'events' ? 'events:manage'
        : body.type === 'jobs' ? 'jobs:manage'
          : body.type === 'applicationForms' ? 'forms:manage' : 'help:manage';
      if (!hasPermission(user, permission)) return json({ error: 'Je hebt geen rechten voor dit onderdeel.' }, 403);
      const raw = body.item;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return json({ error: 'Ongeldig community-item.' }, 400);
      const id = cleanText(raw.id, 80, 'ID');
      const result = await updateContent(state => {
        state[body.type] ||= [];
        const index = state[body.type].findIndex(item => item.id === id);
        let automationId = '';
        if (body.action === 'delete-community-record') {
          if (body.type === 'jobs' && index >= 0) {
            state.jobs[index].status = 'draft';
            state.jobs[index].closed = true;
            state.jobs[index].updatedAt = new Date().toISOString();
            appendAudit(state, user, 'gesloten', 'vacature', state.jobs[index].title);
            return { ok: true, archived: true };
          }
          if (body.type === 'events' && index >= 0) {
            const event = state.events[index];
            automationId = enqueueAutomation(state, 'event_cancelled', { sourceId: id, version: `removed:${event.updatedAt || event.startsAt}`, title: event.title, summary: 'Dit evenement is verwijderd.', url: '/events/', actor: user.username });
            (state.eventRsvps || []).filter(rsvp => rsvp.eventId === id).forEach(rsvp => {
              addAdminNotification(state, rsvp.discordId, 'event', 'Evenement verwijderd', `Het evenement "${event.title}" is verwijderd.`, `event:${id}:deleted`);
            });
          }
          if (index >= 0) state[body.type].splice(index, 1);
          if (body.type === 'events') state.eventRsvps = (state.eventRsvps || []).filter(rsvp => rsvp.eventId !== id);
          appendAudit(state, user, 'verwijderd', body.type, raw.title || id);
          return { ok: true, automationId };
        }
        const currentRecord = index >= 0 ? state[body.type][index] : null;
        const record = cleanCommunityRecord(body.type, raw, currentRecord);
        if (body.type === 'jobs' && record.status === 'published' && !state.applicationForms?.some(form => form.id === record.formId && form.status === 'published')) {
          throw new Error('Publiceer eerst het gekoppelde sollicitatieformulier.');
        }
        if (body.type === 'events' && currentRecord) {
          const scheduleChanged = currentRecord.startsAt !== record.startsAt || currentRecord.endsAt !== record.endsAt ||
            currentRecord.location !== record.location || currentRecord.title !== record.title ||
            currentRecord.cancelled !== record.cancelled || currentRecord.status !== record.status;
          if (scheduleChanged && (record.cancelled || record.status !== 'published')) automationId = enqueueAutomation(state, 'event_cancelled', { sourceId: id, version: record.updatedAt, title: record.title, summary: 'Dit evenement is geannuleerd of offline gehaald.', url: '/events/', actor: user.username });
          else if (scheduleChanged && record.status === 'published' && !record.cancelled) automationId = enqueueAutomation(state, 'event_changed', { sourceId: id, version: record.updatedAt, title: record.title, summary: `${record.excerpt || record.description} ${record.location || ''}`.trim(), url: '/events/', actor: user.username });
          if (scheduleChanged) {
            const cancelled = record.cancelled || record.status !== 'published';
            const title = cancelled ? 'Evenement geannuleerd' : 'Evenement bijgewerkt';
            const message = cancelled
              ? `Het evenement "${record.title}" is geannuleerd.`
              : `Het evenement "${record.title}" is bijgewerkt. Nieuwe starttijd: ${new Date(record.startsAt).toLocaleString('nl-NL')}${record.location ? ` · ${record.location}` : ''}.`;
            (state.eventRsvps || []).filter(rsvp => rsvp.eventId === id).forEach(rsvp => {
              addAdminNotification(state, rsvp.discordId, 'event', title, message, `event:${id}:${record.updatedAt}`);
            });
          }
        }
        if (index >= 0) state[body.type][index] = record;
        else {
          if (state[body.type].length >= (body.type === 'applicationForms' ? 100 : 500)) throw new Error('Je hebt de maximale hoeveelheid items bereikt.');
          state[body.type].push(record);
        }
        if (body.type === 'events' && record.status === 'published' && !record.cancelled && (!currentRecord || currentRecord.status !== 'published' || currentRecord.cancelled)) {
          automationId = enqueueAutomation(state, 'event_published', { sourceId: id, version: record.updatedAt, title: record.title, summary: `${record.excerpt || record.description} ${record.location || ''}`.trim(), url: '/events/', actor: user.username });
        }
        if (body.type === 'events' && record.status === 'published' && !record.cancelled) {
          state.eventRsvps ||= [];
          const eventRsvps = state.eventRsvps.filter(rsvp => rsvp.eventId === id);
          const going = eventRsvps.filter(rsvp => rsvp.status === 'going')
            .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
          if (record.capacity > 0 && going.length > record.capacity) {
            going.slice(record.capacity).forEach(rsvp => {
              rsvp.status = 'waitlist';
              addAdminNotification(state, rsvp.discordId, 'event', 'Evenementcapaciteit aangepast', `Je staat op de wachtlijst voor "${record.title}" omdat de capaciteit is aangepast.`, `event:${id}:capacity:${record.updatedAt}:${rsvp.id}`);
            });
          }
          const remaining = eventRsvps.filter(rsvp => rsvp.status === 'going').length;
          const waitlist = eventRsvps.filter(rsvp => rsvp.status === 'waitlist')
            .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
          const available = record.capacity === 0 ? waitlist.length : Math.max(0, record.capacity - remaining);
          waitlist.slice(0, available).forEach(rsvp => {
            rsvp.status = 'going';
            addAdminNotification(state, rsvp.discordId, 'event', 'Je hebt een plek bij het evenement', `Je bent aangemeld voor "${record.title}".`, `event:${id}:capacity:${record.updatedAt}:${rsvp.id}`);
          });
        }
        appendAudit(state, user, index >= 0 ? 'aangepast' : 'aangemaakt', body.type, record.title || record.name || record.id);
        return { ok: true, item: record, automationId };
      });
      const automationId = result.automationId; delete result.automationId;
      if (automationId) await dispatchAutomation(automationId).catch(error => console.error('[admin] Event notification could not be dispatched', error?.message));
      return json(result);
    }

    if (body.action === 'review-application') {
      if (!hasPermission(user, 'applications:review')) return json({ error: 'Je mag sollicitaties niet beoordelen.' }, 403);
      const id = cleanText(body.id, 80, 'Sollicitatie-ID');
      if (!allowedApplicationStatuses.has(body.status)) return json({ error: 'Kies een geldige sollicitatiestatus.' }, 400);
      const publicMessage = cleanText(body.message || '', 500, 'Bericht voor de sollicitant', true);
      const internalNote = cleanText(body.note || '', 2000, 'Interne notitie', true);
      const result = await updateContent(state => {
        const application = (state.applications || []).find(item => item.id === id);
        if (!application) throw new Error('Deze sollicitatie bestaat niet.');
        const previousStatus = application.status;
        application.status = body.status;
        application.updatedAt = new Date().toISOString();
        application.history ||= [];
        application.history.push({
          status: body.status, public: !!publicMessage, message: publicMessage,
          at: application.updatedAt, reviewer: cleanText(user.username || 'Staff', 80, 'Beoordelaar')
        });
        if (internalNote) {
          application.notes ||= [];
          application.notes.push({ id: randomUUID(), author: cleanText(user.username || 'Staff', 80, 'Beoordelaar'), content: internalNote, createdAt: application.updatedAt });
          application.notes = application.notes.slice(-100);
        }
        if (application.history.length > 100) application.history = application.history.slice(-100);
        if (publicMessage) addAdminNotification(state, application.discordId, 'application', 'Update over je sollicitatie', publicMessage, `application:${application.id}:${application.updatedAt}`);
        appendAudit(state, user, 'beoordeeld', 'sollicitatie', `${application.jobTitle} · ${application.username}`);
        const automationId = previousStatus !== application.status
          ? enqueueAutomation(state, 'application_status_changed', { sourceId: application.id, version: application.updatedAt, title: 'Sollicitatiestatus gewijzigd', summary: `${application.jobTitle} · ${previousStatus} → ${application.status} · referentie ${application.id}`, url: '/admin.html', actor: user.username })
          : '';
        return { ok: true, automationId };
      });
      const automationId = result.automationId; delete result.automationId;
      if (automationId) await dispatchAutomation(automationId).catch(error => console.error('[admin] Application notification could not be dispatched', error?.message));
      return json(result);
    }

    if (body.action === 'manage-support-ticket') {
      if (!hasPermission(user, 'support:manage')) return json({ error: 'Je mag supporttickets niet beheren.' }, 403);
      const id = cleanText(body.id, 80, 'Ticket-ID');
      const status = body.status;
      if (!['open', 'in_progress', 'waiting', 'closed'].includes(status)) return json({ error: 'Kies een geldige ticketstatus.' }, 400);
      const message = cleanText(body.message || '', 4000, 'Antwoord', true);
      const internalNote = cleanText(body.internalNote || '', 2000, 'Interne notitie', true);
      const assignedTo = cleanText(body.assignedTo || '', 80, 'Toegewezen medewerker', true);
      const categoryId = cleanText(body.categoryId || '', 40, 'Ticketcategorie', true);
      const result = await updateContent(state => {
        const ticket = (state.supportTickets || []).find(item => item.id === id);
        if (!ticket) throw new Error('Dit supportticket bestaat niet.');
        if (ticket.status === 'closed' && status !== 'closed' && !message) throw new Error('Voeg een antwoord toe om het ticket te heropenen.');
        const at = new Date().toISOString();
        if (categoryId) {
          const category = (state.supportCategories || []).find(item => item.id === categoryId);
          if (!category) throw new Error('Kies een bestaande ticketcategorie.');
          ticket.categoryId = category.id; ticket.category = category.name;
        }
        ticket.assignedTo = assignedTo;
        ticket.status = status;
        ticket.updatedAt = at;
        if (status === 'closed') ticket.closedAt = at;
        else delete ticket.closedAt;
        if (internalNote) {
          ticket.internalNotes ||= [];
          if (ticket.internalNotes.length >= 200) throw new Error('Dit ticket bevat te veel interne notities.');
          ticket.internalNotes.push({ id: randomUUID(), authorId: String(user.id || ''), authorName: cleanText(user.username || 'Support', 80, 'Supportnaam'), content: internalNote, createdAt: at });
        }
        if (message) {
          ticket.messages ||= [];
          if (ticket.messages.length >= 200) throw new Error('Dit ticket bevat te veel berichten. Sluit het ticket en vraag de inwoner een nieuw ticket te openen.');
          ticket.messages.push({
            id: randomUUID(), authorId: String(user.id || ''), authorName: cleanText(user.username || 'Support', 80, 'Supportnaam'),
            authorRole: 'staff', content: message, createdAt: at
          });
          addAdminNotification(state, ticket.discordId, 'support', 'Antwoord van support', `Er is een nieuw antwoord op je ticket: ${ticket.subject}`, `support:${ticket.id}:${at}`);
        }
        appendAudit(state, user, message ? 'beantwoord' : 'bijgewerkt', 'supportticket', ticket.subject);
        return { ok: true, assignedTo: ticket.assignedTo, status: ticket.status };
      });
      return json(result);
    }

    if (body.action === 'save-support-categories') {
      if (!hasPermission(user, 'support:manage')) return json({ error: 'Je mag supportcategorieën niet beheren.' }, 403);
      if (!Array.isArray(body.categories) || body.categories.length < 1 || body.categories.length > 30) return json({ error: 'Voeg 1 tot 30 supportcategorieën toe.' }, 400);
      const ids = new Set();
      const categories = [];
      for (const [index, raw] of body.categories.entries()) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return json({ error: `Categorie ${index + 1} is ongeldig.` }, 400);
        const id = cleanText(raw.id, 40, 'Categorie-ID');
        if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id) || ids.has(id)) return json({ error: `Ongeldig of dubbel categorie-ID: ${id}` }, 400);
        ids.add(id);
        if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') return json({ error: `Ongeldige status bij ${id}.` }, 400);
        if (!Array.isArray(raw.questions || []) || (raw.questions || []).length > 20) return json({ error: `Categorie ${id} mag maximaal 20 vragen bevatten.` }, 400);
        const questionIds = new Set();
        const questions = [];
        let fileQuestionCount = 0;
        for (const [questionIndex, question] of (raw.questions || []).entries()) {
          const qid = cleanText(question?.id, 40, 'Vraag-ID');
          const type = question?.type;
          if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(qid) || questionIds.has(qid)) return json({ error: `Ongeldig of dubbel vraag-ID in ${id}.` }, 400);
          if (!['short', 'long', 'choice', 'dropdown', 'file'].includes(type)) return json({ error: `Niet-ondersteund vraagtype bij vraag ${questionIndex + 1}.` }, 400);
          if (type === 'file' && ++fileQuestionCount > 2) return json({ error: `Categorie ${id} mag maximaal 2 bestandsvragen bevatten.` }, 400);
          if (question.required !== undefined && typeof question.required !== 'boolean') return json({ error: `Ongeldige verplicht-instelling bij ${qid}.` }, 400);
          questionIds.add(qid);
          const item = { id: qid, label: cleanText(question.label, 120, 'Vraag'), type, required: question.required === true };
          if (type === 'choice' || type === 'dropdown') {
            if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 20) return json({ error: `Geef 2 tot 20 opties op voor ${qid}.` }, 400);
            item.options = [...new Set(question.options.map(option => cleanText(option, 80, 'Keuzeoptie')))];
            if (item.options.length < 2) return json({ error: `De opties voor ${qid} moeten uniek zijn.` }, 400);
          }
          questions.push(item);
        }
        categories.push({ id, name: cleanText(raw.name, 80, 'Categorienaam'), description: cleanText(raw.description || '', 240, 'Toelichting', true), enabled: raw.enabled !== false, questions });
      }
      const result = await updateContent(state => {
        state.supportCategories = categories;
        appendAudit(state, user, 'aangepast', 'supportformulier', `${categories.length} categorieën`);
        return { ok: true, count: categories.length };
      });
      return json(result);
    }

    if (body.action === 'moderate-comment') {
      if (!hasPermission(user, 'comments:moderate')) return json({ error: 'Je mag reacties niet modereren.' }, 403);
      if (typeof body.hidden !== 'boolean') return json({ error: 'Ongeldige moderatiestatus.' }, 400);
      const id = cleanText(body.id, 80, 'Reactie-ID');
      const result = await updateContent(state => {
        const comment = (state.newsComments || []).find(item => item.id === id);
        if (!comment) throw new Error('Deze reactie bestaat niet.');
        comment.hidden = body.hidden;
        appendAudit(state, user, body.hidden ? 'verborgen' : 'zichtbaar gemaakt', 'nieuwsreactie', comment.username);
        return { ok: true };
      });
      return json(result);
    }

    if (body.action === 'moderate-profile') {
      if (!hasPermission(user, 'profiles:moderate')) return json({ error: 'Je mag inwonerprofielen niet modereren.' }, 403);
      if (body.isPublic !== false) return json({ error: 'Beheerders kunnen een profiel verbergen, maar niet zonder toestemming openbaar maken.' }, 400);
      const discordId = cleanText(body.discordId, 22, 'Discord-ID');
      if (!/^\d{17,22}$/.test(discordId)) return json({ error: 'Ongeldig Discord-ID.' }, 400);
      const result = await updateContent(state => {
        const profile = (state.residentProfiles || []).find(item => item.discordId === discordId);
        if (!profile) throw new Error('Dit profiel bestaat niet.');
        profile.isPublic = body.isPublic;
        profile.updatedAt = new Date().toISOString();
        appendAudit(state, user, body.isPublic ? 'profiel zichtbaar' : 'profiel verborgen', 'inwoner', profile.username);
        if (!body.isPublic) addAdminNotification(state, discordId, 'profile', 'Je profiel is verborgen', 'Een beheerder heeft je profiel tijdelijk verborgen. Neem contact op met het team voor meer informatie.', `profile:${discordId}:${profile.updatedAt}`);
        return { ok: true };
      });
      return json(result);
    }

    if (body.action === 'send-resident-notification') {
      if (!hasPermission(user, 'notifications:manage')) return json({ error: 'Je mag inwonersmeldingen niet versturen.' }, 403);
      const title = cleanText(body.title, 100, 'Titel');
      const message = cleanText(body.message, 300, 'Bericht');
      const target = body.discordId === 'all' ? 'all' : cleanText(body.discordId, 22, 'Discord-ID');
      if (target !== 'all' && !/^\d{17,22}$/.test(target)) return json({ error: 'Ongeldig Discord-ID.' }, 400);
      const result = await updateContent(state => {
        const recipients = target === 'all'
          ? [...new Set((state.residentProfiles || []).map(profile => profile.discordId).filter(id => /^\d{17,22}$/.test(String(id || ''))))]
          : [target];
        if (recipients.length > 10000) throw new Error('Er zijn te veel ontvangers voor één melding.');
        recipients.forEach(discordId => addAdminNotification(state, discordId, 'announcement', title, message, `broadcast:${randomUUID()}`));
        appendAudit(state, user, 'verstuurd', 'inwonersmelding', `${title} · ${recipients.length} ontvangers`);
        return { ok: true, recipients: recipients.length };
      });
      return json(result);
    }

    if (body.action === 'save-achievement') {
      if (!hasPermission(user, 'users:manage') && !hasPermission(user, 'achievements:manage')) return json({ error: 'Je mag onderscheidingen niet beheren.' }, 403);
      const item = body.item;
      if (!item || typeof item !== 'object' || Array.isArray(item)) return json({ error: 'Ongeldige onderscheiding.' }, 400);
      if (typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(item.id)) return json({ error: 'Gebruik een geldige onderscheiding-ID.' }, 400);
      const achievement = {
        id: item.id,
        title: cleanText(item.title, 60, 'Naam'),
        description: cleanText(item.description, 240, 'Beschrijving', true),
        icon: cleanText(item.icon || '✦', 8, 'Icoon'),
        image: cleanImage(item.image || ''),
        archived: item.archived === true,
        updatedAt: new Date().toISOString()
      };
      if (item.archived !== undefined && typeof item.archived !== 'boolean') return json({ error: 'Ongeldige archiefinstelling.' }, 400);
      const result = await updateContent(state => {
        state.achievements ||= [];
        const index = state.achievements.findIndex(entry => entry.id === achievement.id);
        if (index >= 0) state.achievements[index] = achievement;
        else {
          if (state.achievements.length >= 50) throw new Error('Je kunt maximaal 50 onderscheidingen beheren.');
          state.achievements.push(achievement);
        }
        appendAudit(state, user, index >= 0 ? 'aangepast' : 'aangemaakt', 'onderscheiding', achievement.title);
        return { ok: true, achievement };
      });
      return json(result);
    }

    if (body.action === 'award-achievement') {
      if (!hasPermission(user, 'users:manage') && !hasPermission(user, 'achievements:manage')) return json({ error: 'Je mag onderscheidingen niet toekennen.' }, 403);
      if (typeof body.discordId !== 'string' || !/^\d{17,22}$/.test(body.discordId)) return json({ error: 'Vul een geldig Discord-ID in.' }, 400);
      if (typeof body.achievementId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(body.achievementId)) return json({ error: 'Kies een geldige onderscheiding.' }, 400);
      if (body.revoke !== undefined && typeof body.revoke !== 'boolean') return json({ error: 'Ongeldige actie.' }, 400);
      const result = await updateContent(state => {
        const achievement = (state.achievements || []).find(item => item.id === body.achievementId);
        if (!achievement) throw new Error('Deze onderscheiding bestaat niet.');
        state.achievementAwards ||= [];
        const index = state.achievementAwards.findIndex(award => award.discordId === body.discordId && award.achievementId === body.achievementId);
        if (body.revoke === true) {
          if (index >= 0) state.achievementAwards.splice(index, 1);
          appendAudit(state, user, 'ingetrokken', 'onderscheiding', `${achievement.title} · ${body.discordId}`);
          return { ok: true, awarded: false };
        }
        if (achievement.archived === true) throw new Error('Deze onderscheiding is gearchiveerd.');
        if (index >= 0) return { ok: true, awarded: true };
        if (state.achievementAwards.length >= 10000) throw new Error('Het aantal onderscheidingen heeft de beheerlimiet bereikt.');
        state.achievementAwards.push({
          discordId: body.discordId,
          achievementId: body.achievementId,
          awardedAt: new Date().toISOString(),
          awardedBy: user.id
        });
        appendAudit(state, user, 'toegekend', 'onderscheiding', `${achievement.title} · ${body.discordId}`);
        return { ok: true, awarded: true };
      });
      return json(result);
    }

    if (body.action === 'save-resident-notice') {
      if (!hasPermission(user, 'users:manage')) return json({ error: 'Je mag inwonersmeldingen niet beheren.' }, 403);
      const notice = body.notice;
      if (!notice || typeof notice !== 'object' || Array.isArray(notice)) return json({ error: 'Ongeldige inwonersmelding.' }, 400);
      if (notice.id !== undefined && (typeof notice.id !== 'string' || (notice.id && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(notice.id)))) return json({ error: 'Ongeldige melding-ID.' }, 400);
      const id = notice.id || randomUUID();
      const cleanNotice = {
        id,
        title: cleanText(notice.title, 80, 'Titel'),
        message: cleanText(notice.message, 300, 'Melding'),
        active: notice.active !== false,
        updatedAt: new Date().toISOString()
      };
      if (notice.active !== undefined && typeof notice.active !== 'boolean') return json({ error: 'Ongeldige zichtbaarheidsinstelling.' }, 400);
      const result = await updateContent(state => {
        state.residentNotices ||= [];
        const index = state.residentNotices.findIndex(item => item.id === id);
        const previous = index >= 0 ? state.residentNotices[index] : null;
        if (index >= 0) state.residentNotices[index] = cleanNotice;
        else {
          if (state.residentNotices.length >= 50) throw new Error('Je kunt maximaal 50 inwonersmeldingen beheren.');
          state.residentNotices.push(cleanNotice);
        }
        appendAudit(state, user, index >= 0 ? 'aangepast' : 'aangemaakt', 'inwonersmelding', cleanNotice.title);
        const automationId = cleanNotice.active && (!previous || previous.active !== true)
          ? enqueueAutomation(state, 'notice_published', { sourceId: id, version: cleanNotice.updatedAt, title: cleanNotice.title, summary: cleanNotice.message, url: '/dashboard/', actor: user.username })
          : '';
        return { ok: true, notice: cleanNotice, automationId };
      });
      const automationId = result.automationId; delete result.automationId;
      if (automationId) await dispatchAutomation(automationId).catch(error => console.error('[admin] Community notice could not be dispatched', error?.message));
      return json(result);
    }

    if (['news', 'changelog', 'staff'].includes(body.type) && ['save', 'delete'].includes(body.action)) {
      const permission = body.type === 'staff' ? 'staff:write' : `${body.type}:write`;
      if (!hasPermission(user, permission)) return json({ error: 'Je hebt geen rechten voor dit onderdeel.' }, 403);
      let item = body.item;
      if (body.type === 'staff' && body.action === 'save' && item && item.discordId) {
        const profile = await resolveDiscordProfile(item);
        item = { ...item, username: item.username || profile.username, avatar: item.avatar || profile.avatar };
      }
      const result = await updateContent(state => {
        const sourceKey = body.type === 'staff' ? 'staff' : body.type === 'news' ? 'news' : 'changelog';
        const previous = (state[sourceKey] || []).find(record => record.id === item?.id) || null;
        const saved = recordAction(state, user, body.type, body.action, item);
        if (body.type === 'news' && body.action === 'save' && item?.status === 'published' && previous?.status !== 'published') {
          saved.automationId = enqueueAutomation(state, 'news_published', { sourceId: item.id, version: item.updatedAt, title: item.title, summary: item.excerpt, url: '/nieuws/', actor: user.username });
        }
        if (body.type === 'changelog' && body.action === 'save' && item?.status === 'published') {
          if (!previous || previous.status !== 'published') saved.automationId = enqueueAutomation(state, 'site_update_published', { sourceId: item.id, version: item.updatedAt, title: item.title, summary: item.excerpt, url: '/updates/', actor: user.username });
        }
        return saved;
      });
      const automationId = result.automationId; delete result.automationId;
      if (automationId) await dispatchAutomation(automationId).catch(error => console.error('[admin] Content notification could not be dispatched', error?.message));
      return json(result);
    }

    if (body.action === 'save-rules-draft') {
      if (!hasPermission(user, 'rules:write')) return json({ error: 'Je mag de regels niet beheren.' }, 403);
      const documents = Array.isArray(body.documents) ? body.documents.slice(0, 20).map((doc, index) => ({
        id: cleanText(doc.id, 40, 'Document-ID'),
        title: cleanText(doc.title, 120, `Document ${index + 1}`),
        content: cleanText(doc.content, 150_000, `Document ${index + 1}`, true)
      })) : [];
      if (!documents.length) return json({ error: 'Voeg minstens één regelbestand toe.' }, 400);
      const result = await updateContent(state => {
        state.rulesDraft = { documents, updatedAt: new Date().toISOString(), updatedBy: user.username };
        appendAudit(state, user, 'concept opgeslagen', 'regels', 'Regelconcept');
        return { ok: true };
      });
      return json(result);
    }

    if (body.action === 'publish-rules') {
      if (!hasPermission(user, 'rules:write')) return json({ error: 'Je mag regels niet publiceren.' }, 403);
      const result = await updateContent(state => {
        if (!state.rulesDraft?.documents?.length) throw new Error('Er is geen regelconcept om te publiceren.');
        const previous = state.rulesVersions?.[state.rulesVersions.length - 1]?.version || '1.0';
        const parts = previous.split('.').map(Number);
        const version = `${Number.isFinite(parts[0]) ? parts[0] : 1}.${(Number.isFinite(parts[1]) ? parts[1] : 0) + 1}`;
        const snapshot = { id: randomUUID(), version, title: cleanText(body.title || `Versie ${version}`, 120, 'Versietitel'), status: 'published', publishedAt: new Date().toISOString(), author: user.username, documents: structuredClone(state.rulesDraft.documents) };
        state.rulesVersions ||= [];
        state.rulesVersions.push(snapshot);
        appendAudit(state, user, 'gepubliceerd', 'regelversie', snapshot.title);
        return { ok: true, version: snapshot };
      });
      return json(result);
    }

    return json({ error: 'Onbekende beheeractie.' }, 400);
  } catch (error) { return json({ error: error.message || 'Opslaan is niet gelukt.' }, 400); }
}

export default vercelHandler(handler);
