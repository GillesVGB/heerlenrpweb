import { randomUUID } from 'node:crypto';
import { readContent, updateContent } from '../server/content-store.mjs';
import { clearSessionCookie, constantTimeEqual, hasPermission, makeSession, permissionsForRoleIds, readSession, safeUser, sessionCookie, verifyOrigin } from '../server/security.mjs';
import { appendAudit, badMethod, cleanDate, cleanImage, cleanText, json, readJson } from '../server/http.mjs';
import { vercelHandler } from '../server/vercel-adapter.mjs';

const attempts = new Map();
const maxPasswordAttempts = 8;

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
    if (!hasPermission(session, 'admin:site') && !hasPermission(session, 'staff:read')) return json({ ok: false }, 403);
    try {
      const content = await readContent();
      const view = {
        news: hasPermission(session, 'news:write') ? content.news : undefined,
        changelog: hasPermission(session, 'changelog:write') ? content.changelog : undefined,
        staff: hasPermission(session, 'staff:read') || hasPermission(session, 'staff:write') ? content.staff : undefined,
        rulesDraft: hasPermission(session, 'rules:write') ? content.rulesDraft : undefined,
        rulesVersions: hasPermission(session, 'audit:read') ? content.rulesVersions : undefined,
        auditLog: hasPermission(session, 'audit:read') ? content.auditLog : undefined,
        achievements: hasPermission(session, 'users:manage') ? (content.achievements || []) : undefined,
        achievementAwards: hasPermission(session, 'users:manage') ? (content.achievementAwards || []) : undefined,
        residentProfiles: hasPermission(session, 'users:manage') ? (content.residentProfiles || []) : undefined,
        residentNotices: hasPermission(session, 'users:manage') ? (content.residentNotices || []) : undefined,
        siteSettings: hasPermission(session, 'admin:site') ? (content.siteSettings || {}) : undefined,
        storeSettings: hasPermission(session, 'admin:site') ? (content.storeSettings || {}) : undefined
      };
      return json({ ok: true, user: safeUser(session), content: view, integration: { discord: !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_GUILD_ID && process.env.DISCORD_BOT_TOKEN), database: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) || !!process.env.DATABASE_URL, privateBlob: !!process.env.BLOB_READ_WRITE_TOKEN || !!(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN) } });
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
      const permissions = ['admin:site', 'news:write', 'changelog:write', 'staff:write', 'staff:read', 'rules:write', 'audit:read', 'discord:read', 'users:manage'];
      const session = makeSession({ id: 'password-admin', username: 'Beheerder', roles: ['password-admin'], permissions, provider: 'password' });
      return json({ ok: true, user: { id: 'password-admin', username: 'Beheerder', permissions } }, 200, { 'Set-Cookie': sessionCookie(session, request) });
    } catch (error) { return json({ error: error.message }, 503); }
  }

  if (body.action === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
  const current = await currentSession(request);
  const user = current.user;
  if (!user) return json({ error: current.error }, current.status);

  try {
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

    if (body.action === 'save-achievement') {
      if (!hasPermission(user, 'users:manage')) return json({ error: 'Je mag onderscheidingen niet beheren.' }, 403);
      const item = body.item;
      if (!item || typeof item !== 'object' || Array.isArray(item)) return json({ error: 'Ongeldige onderscheiding.' }, 400);
      if (typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(item.id)) return json({ error: 'Gebruik een geldige onderscheiding-ID.' }, 400);
      const achievement = {
        id: item.id,
        title: cleanText(item.title, 60, 'Naam'),
        description: cleanText(item.description, 240, 'Beschrijving', true),
        icon: cleanText(item.icon || '✦', 8, 'Icoon'),
        updatedAt: new Date().toISOString()
      };
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
      if (!hasPermission(user, 'users:manage')) return json({ error: 'Je mag onderscheidingen niet toekennen.' }, 403);
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
        if (index >= 0) state.residentNotices[index] = cleanNotice;
        else {
          if (state.residentNotices.length >= 50) throw new Error('Je kunt maximaal 50 inwonersmeldingen beheren.');
          state.residentNotices.push(cleanNotice);
        }
        appendAudit(state, user, index >= 0 ? 'aangepast' : 'aangemaakt', 'inwonersmelding', cleanNotice.title);
        return { ok: true, notice: cleanNotice };
      });
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
      const result = await updateContent(state => recordAction(state, user, body.type, body.action, item));
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
