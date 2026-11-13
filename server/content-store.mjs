import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const initialContent = JSON.parse(await readFile(path.join(root, 'data', 'initial-content.json'), 'utf8'));
const localPath = process.env.CONTENT_STORE_PATH || path.join(root, 'data', 'local-content.json');
const blobPath = 'fantasy-roleplay/content-v1.json';
const useSupabase = !!(process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY);
const useDatabase = useSupabase || !!process.env.DATABASE_URL;
const useBlob = !useDatabase && (!!process.env.BLOB_READ_WRITE_TOKEN || (!!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN));
const inVercel = !!process.env.VERCEL;
let sql;
let supabase;
let dbReady;
let localQueue = Promise.resolve();

function databaseUnavailable(error) {
  const detail = error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
  console.error('[content-store] Shared database request failed', detail);
  const wrapped = new Error(useSupabase
    ? 'Supabase is niet bereikbaar of de contenttabel ontbreekt. Controleer SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in Vercel en voer de Supabase SQL-installatie uit.'
    : 'De gedeelde database is onbereikbaar. Controleer de PostgreSQL DATABASE_URL en databaseverbinding in Vercel.');
  wrapped.cause = error;
  return wrapped;
}

async function databaseRequest(request) {
  try {
    return await request();
  } catch (error) {
    throw databaseUnavailable(error);
  }
}

async function initialState() {
  const state = structuredClone(initialContent);
  state.residentProfiles ||= [];
  state.achievements ||= [];
  state.achievementAwards ||= [];
  state.residentNotices ||= [];
  state.events ||= [];
  state.eventRsvps ||= [];
  state.jobs ||= [];
  state.applicationForms ||= [];
  state.applications ||= [];
  state.helpArticles ||= [];
  state.helpCategories ||= [];
  state.notifications ||= [];
  state.newsComments ||= [];
  return state;
}

function parseStored(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function publicImage(value) {
  if (typeof value !== 'string') return '';
  if (/^https:\/\/[^\s"'<>]{1,1900}$/i.test(value)) return value;
  return /^data:image\/(?:png|jpeg|webp);base64,[a-z\d+/]+=*$/i.test(value) && value.length <= 550_000 ? value : '';
}

function publicForm(form) {
  const allowedTypes = new Set(['short', 'long', 'number', 'date', 'choice', 'multiple', 'dropdown', 'boolean', 'file', 'info']);
  const questions = (Array.isArray(form.questions) ? form.questions : []).slice(0, 100)
    .filter(question => question && typeof question.id === 'string' && /^[a-z0-9][a-z0-9_-]{0,59}$/.test(question.id) && allowedTypes.has(question.type))
    .filter((question, index, list) => list.findIndex(item => item.id === question.id) === index);
  const ids = new Set(questions.map(question => question.id));
  const sections = (Array.isArray(form.sections) ? form.sections : []).slice(0, 30)
    .filter(section => section && typeof section === 'object')
    .map((section, index) => ({
      id: String(section.id || `section-${index + 1}`).slice(0, 60),
      title: String(section.title || '').slice(0, 120),
      description: String(section.description || '').slice(0, 500)
    }));
  const sectionIds = new Set(sections.map(section => section.id));
  return {
    id: String(form.id || '').slice(0, 80),
    title: String(form.title || '').slice(0, 120),
    description: String(form.description || '').slice(0, 600),
    version: Number.isInteger(Number(form.version)) ? Math.max(1, Number(form.version)) : 1,
    sections,
    questions: questions.map(question => ({
      id: question.id,
      title: String(question.title || '').slice(0, 160),
      description: String(question.description || '').slice(0, 500),
      ...(sectionIds.has(question.sectionId) ? { sectionId: question.sectionId } : {}),
      type: question.type,
      required: question.required === true,
      ...(Array.isArray(question.options) ? { options: question.options.slice(0, 100).map(option => String(option).slice(0, 120)) } : {}),
      ...(Number.isInteger(question.minLength) ? { minLength: Math.max(0, Math.min(5000, question.minLength)) } : {}),
      ...(Number.isInteger(question.maxLength) ? { maxLength: Math.max(1, Math.min(5000, question.maxLength)) } : {}),
      ...(question.type === 'file' ? { allowedFiles: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], maxFileBytes: 400000 } : {}),
      ...(Array.isArray(question.conditions) ? {
        conditions: question.conditions.slice(0, 10)
          .filter(condition => condition && ids.has(condition.questionId) && condition.questionId !== question.id)
          .map(condition => ({ questionId: condition.questionId, value: String(condition.value || '').slice(0, 240) })),
        conditionMode: question.conditionMode === 'any' ? 'any' : 'all'
      } : {})
    }))
  };
}

function publicPost(item, type) {
  const post = {
    id: String(item.id || '').slice(0, 80),
    title: String(item.title || '').slice(0, 160),
    category: String(item.category || (type === 'news' ? 'Nieuws' : 'Serverupdate')).slice(0, 60),
    excerpt: String(item.excerpt || '').slice(0, 600),
    content: String(item.content || '').slice(0, 12000),
    image: publicImage(item.image),
    publishAt: String(item.publishAt || ''),
    updatedAt: String(item.updatedAt || ''),
    featured: item.featured === true,
    author: String(item.author || 'Heerlen Roleplay').slice(0, 80)
  };
  if (type === 'news') {
    post.commentsEnabled = item.commentsEnabled === true;
    post.comments = post.commentsEnabled
      ? (item.comments || []).slice(0, 200).map(comment => ({
        id: String(comment.id || '').slice(0, 80),
        username: String(comment.username || 'Inwoner').slice(0, 80),
        content: String(comment.content || '').slice(0, 1000),
        createdAt: String(comment.createdAt || '')
      }))
      : [];
  } else post.version = String(item.version || '').slice(0, 60);
  return post;
}

async function initDatabase() {
  if (!dbReady) dbReady = (async () => {
    if (useSupabase) {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Configureer zowel SUPABASE_URL als SUPABASE_SERVICE_ROLE_KEY.');
      }
      const base = new URL(process.env.SUPABASE_URL);
      if (base.protocol !== 'https:' && base.hostname !== 'localhost') throw new Error('SUPABASE_URL moet HTTPS gebruiken.');
      const endpoint = new URL('/rest/v1/fantasy_roleplay_content', base);
      supabase = async (method, query, body, prefer) => {
        const response = await fetch(endpoint.toString() + (query || ''), {
          method,
          headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            ...(prefer ? { Prefer: prefer } : {})
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        const text = await response.text();
        if (!response.ok) throw new Error(`Supabase REST API returned HTTP ${response.status}: ${text.slice(0, 400)}`);
        return text ? JSON.parse(text) : [];
      };
      await supabase('POST', '?on_conflict=singleton', [{ singleton: 1, revision: 0, body: await initialState() }], 'resolution=ignore-duplicates,return=minimal');
      return;
    }
    const { neon } = await import('@neondatabase/serverless');
    sql = neon(process.env.DATABASE_URL);
    await sql`CREATE TABLE IF NOT EXISTS fantasy_roleplay_content (singleton SMALLINT PRIMARY KEY CHECK (singleton = 1), revision BIGINT NOT NULL, body JSONB NOT NULL)`;
    const seed = JSON.stringify(await initialState());
    await sql`INSERT INTO fantasy_roleplay_content (singleton, revision, body) VALUES (1, 0, ${seed}::jsonb) ON CONFLICT (singleton) DO NOTHING`;
  })().catch(error => {
    dbReady = undefined;
    throw error;
  });
  return dbReady;
}

async function readBlob() {
  const { get } = await import('@vercel/blob');
  const result = await get(blobPath, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return parseStored(await new Response(result.stream).text());
}

export async function readContent() {
  if (useDatabase) {
    await databaseRequest(initDatabase);
    if (useSupabase) {
      const rows = await databaseRequest(() => supabase('GET', '?singleton=eq.1&select=body'));
      return parseStored(rows[0]?.body) || initialState();
    }
    const rows = await databaseRequest(() => sql`SELECT body FROM fantasy_roleplay_content WHERE singleton = 1`);
    return parseStored(rows[0]?.body) || initialState();
  }
  if (useBlob) return await readBlob() || await initialState();
  if (inVercel) throw new Error('Vercel-opslag ontbreekt: koppel DATABASE_URL of een private Blob-store.');
  try { return parseStored(await readFile(localPath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return await initialState();
  }
}

async function writeContent(next) {
  const serialized = JSON.stringify(next);
  if (Buffer.byteLength(serialized, 'utf8') > 4_000_000) throw new Error('Beheerinhoud is groter dan 4 MB. Verklein afbeeldingen of teksten.');
  if (useDatabase) {
    await databaseRequest(initDatabase);
    if (useSupabase) throw new Error('Gebruik updateContent() voor databasewrites.');
    throw new Error('Gebruik updateContent() voor databasewrites.');
  }
  if (useBlob) {
    const { put } = await import('@vercel/blob');
    await put(blobPath, serialized, { access: 'private', allowOverwrite: true, contentType: 'application/json; charset=utf-8' });
    return;
  }
  if (inVercel) throw new Error('Vercel-opslag ontbreekt: koppel DATABASE_URL of een private Blob-store.');
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
}

export async function updateContent(mutator) {
  if (useDatabase) {
    await databaseRequest(initDatabase);
    for (let attempt = 0; attempt < 5; attempt++) {
      if (useSupabase) {
        const rows = await databaseRequest(() => supabase('GET', '?singleton=eq.1&select=revision,body'));
        const row = rows[0];
        if (!row) throw new Error('Supabase contenttabel is leeg. Voer de installatie-SQL uit en probeer opnieuw.');
        const current = parseStored(row.body);
        const next = structuredClone(current);
        const result = await mutator(next);
        next.updatedAt = new Date().toISOString();
        if (Buffer.byteLength(JSON.stringify(next), 'utf8') > 4_000_000) throw new Error('Beheerinhoud is groter dan 4 MB. Verklein afbeeldingen of teksten.');
        const updated = await databaseRequest(() => supabase(
          'PATCH',
          `?singleton=eq.1&revision=eq.${encodeURIComponent(String(row.revision))}&select=revision`,
          { body: next, revision: Number(row.revision) + 1 },
          'return=representation'
        ));
        if (updated.length) return result;
        continue;
      }
      const rows = await databaseRequest(() => sql`SELECT revision, body FROM fantasy_roleplay_content WHERE singleton = 1`);
      const row = rows[0];
      const current = parseStored(row.body);
      const next = structuredClone(current);
      const result = await mutator(next);
      next.updatedAt = new Date().toISOString();
      if (Buffer.byteLength(JSON.stringify(next), 'utf8') > 4_000_000) throw new Error('Beheerinhoud is groter dan 4 MB. Verklein afbeeldingen of teksten.');
      const data = JSON.stringify(next);
      const written = await databaseRequest(() => sql`UPDATE fantasy_roleplay_content SET body = ${data}::jsonb, revision = revision + 1 WHERE singleton = 1 AND revision = ${row.revision} RETURNING revision`);
      if (written.length) return result;
    }
    throw new Error('De gegevens zijn tegelijk aangepast. Vernieuw de lijst en probeer opnieuw.');
  }

  let result;
  const operation = localQueue.then(async () => {
    const current = await readContent();
    const next = structuredClone(current);
    result = await mutator(next);
    next.updatedAt = new Date().toISOString();
    await writeContent(next);
  });
  localQueue = operation.catch(() => {});
  await operation;
  return result;
}

export function publicContent(state) {
  const now = Date.now();
  const visible = (items) => (items || []).filter(item => item.status === 'published' && (!item.publishAt || Date.parse(item.publishAt) <= now));
  const saved = state.siteSettings || {};
  const savedStore = state.storeSettings || {};
  const savedPackages = savedStore.tebexPackages && typeof savedStore.tebexPackages === 'object' && !Array.isArray(savedStore.tebexPackages) ? savedStore.tebexPackages : {};
  const tebexPackages = Object.fromEntries(Object.entries(savedPackages)
    .filter(([id, packageId]) => /^[a-z0-9-]{1,60}$/.test(id) && typeof packageId === 'string' && /^\d{0,32}$/.test(packageId))
    .map(([id, packageId]) => [id, packageId]));
  const savedProducts = savedStore.shopProducts && typeof savedStore.shopProducts === 'object' && !Array.isArray(savedStore.shopProducts) ? savedStore.shopProducts : {};
  const allowedProductIds = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200].map(amount => `coins-${amount}`));
  const shopProducts = Object.fromEntries(Object.entries(savedProducts)
    .filter(([id, product]) => allowedProductIds.has(id) && product && typeof product === 'object' && !Array.isArray(product))
    .map(([id, product]) => [id, {
      ...(typeof product.name === 'string' ? { name: product.name.slice(0, 60) } : {}),
      ...(typeof product.blurb === 'string' ? { blurb: product.blurb.slice(0, 240) } : {}),
      ...(typeof product.featured === 'boolean' ? { featured: product.featured } : {}),
      ...(Number.isInteger(product.amount) && product.amount >= 1 && product.amount <= 100000 ? { amount: product.amount } : {}),
      ...(Number.isInteger(product.bonus) && product.bonus >= 0 && product.bonus <= 10000 ? { bonus: product.bonus } : {})
    }]));
  const savedCategories = Array.isArray(savedStore.shopCategories) ? savedStore.shopCategories : [];
  const shopCategories = savedCategories
    .filter(category => category && typeof category.id === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(category.id) && category.id !== 'coins' && typeof category.name === 'string' && category.name.trim())
    .slice(0, 30)
    .map(category => ({ id: category.id, name: category.name.trim().slice(0, 40) }));
  const categoryIds = new Set(['coins', ...shopCategories.map(category => category.id)]);
  const savedCustomProducts = Array.isArray(savedStore.customShopProducts) ? savedStore.customShopProducts : [];
  const customShopProducts = savedCustomProducts
    .filter(product => product && typeof product.id === 'string' && /^custom-[a-z0-9-]{1,50}$/.test(product.id) && typeof product.name === 'string' && product.name.trim() && typeof product.blurb === 'string' && typeof product.category === 'string' && categoryIds.has(product.category) && typeof product.tebexId === 'string' && /^\d{1,32}$/.test(product.tebexId))
    .slice(0, 100)
    .map(product => ({
      id: product.id,
      name: product.name.trim().slice(0, 60),
      blurb: product.blurb.slice(0, 240),
      category: product.category,
      tebexId: product.tebexId,
      featured: product.featured === true,
      visible: product.visible !== false
    }));
  const themes = ['standard', 'halloween', 'christmas', 'newyear', 'easter'];
  const allowedSeasonPages = ['home', 'news', 'updates', 'staff', 'rules', 'shop'];
  const siteSettings = {
    promoEnabled: saved.promoEnabled !== false,
    promoMode: saved.promoMode === 'announcement' ? 'announcement' : 'promo',
    promoBonus: String(saved.promoBonus || 'Tot +47% bonus').slice(0, 40),
    promoText: String(saved.promoText || '').slice(0, 120),
    promoCta: String(saved.promoCta || '').slice(0, 40),
    heroTitle: String(saved.heroTitle || 'Heerlen Roleplay').slice(0, 60),
    heroLead: String(saved.heroLead || '').slice(0, 240),
    seasonEnabled: saved.seasonEnabled !== false,
    seasonTheme: themes.includes(saved.seasonTheme) ? saved.seasonTheme : 'standard',
    seasonAccentEnabled: saved.seasonAccentEnabled === true,
    seasonAccent: /^#[\da-f]{6}$/i.test(String(saved.seasonAccent || '')) ? saved.seasonAccent : '#5aaefd',
    seasonEffects: saved.seasonEffects !== false,
    seasonIntensity: Number.isFinite(Number(saved.seasonIntensity)) ? Math.min(2, Math.max(0.2, Number(saved.seasonIntensity))) : 1,
    seasonSpeed: Number.isFinite(Number(saved.seasonSpeed)) ? Math.min(2, Math.max(0.5, Number(saved.seasonSpeed))) : 1,
    seasonDensity: Number.isFinite(Number(saved.seasonDensity)) ? Math.round(Math.min(40, Math.max(0, Number(saved.seasonDensity)))) : 16,
    seasonFrequency: Number.isFinite(Number(saved.seasonFrequency)) ? Math.min(2, Math.max(0.5, Number(saved.seasonFrequency))) : 1,
    seasonPages: Array.isArray(saved.seasonPages) ? saved.seasonPages.filter((page, index, pages) => allowedSeasonPages.includes(page) && pages.indexOf(page) === index) : allowedSeasonPages,
    seasonStart: typeof saved.seasonStart === 'string' ? saved.seasonStart.slice(0, 16) : '',
    seasonEnd: typeof saved.seasonEnd === 'string' ? saved.seasonEnd.slice(0, 16) : '',
    maintenanceEnabled: saved.maintenanceEnabled === true,
    maintenanceMessage: String(saved.maintenanceMessage || 'We zijn snel weer terug. Probeer het later opnieuw.').slice(0, 240)
  };
  const staff = (state.staff || [])
    .filter(person => person && person.active !== false)
    .map(person => ({
      id: String(person.id || '').slice(0, 80),
      name: String(person.name || '').slice(0, 80),
      username: String(person.username || '').slice(0, 80),
      category: String(person.category || 'Staff').slice(0, 60),
      role: String(person.role || '').slice(0, 80),
      bio: String(person.bio || '').slice(0, 600),
      avatar: typeof person.avatar === 'string' && (/^https:\/\//i.test(person.avatar) || /^data:image\/(?:png|jpeg|webp);base64,/i.test(person.avatar)) ? person.avatar.slice(0, 2000) : '',
      order: Number.isFinite(Number(person.order)) ? Math.max(0, Math.min(9999, Number(person.order))) : 0,
      joinedAt: typeof person.joinedAt === 'string' ? person.joinedAt.slice(0, 32) : ''
    }))
    .filter(person => person.id && person.name && person.role)
    .sort((a, b) => a.order - b.order || a.category.localeCompare(b.category, 'nl') || a.name.localeCompare(b.name, 'nl'));
  const events = (state.events || [])
    .filter(event => event.status === 'published' && event.cancelled !== true)
    .map(event => ({
      id: String(event.id || ''),
      title: String(event.title || '').slice(0, 120),
      excerpt: String(event.excerpt || '').slice(0, 600),
      description: String(event.description || '').slice(0, 12000),
      image: publicImage(event.image),
      location: String(event.location || '').slice(0, 160),
      organizer: String(event.organizer || '').slice(0, 100),
      startsAt: String(event.startsAt || ''),
      endsAt: String(event.endsAt || ''),
      capacity: Number.isInteger(event.capacity) && event.capacity > 0 ? Math.min(event.capacity, 10000) : 0,
      featured: event.featured === true,
      attendeeCount: (state.eventRsvps || []).filter(rsvp => rsvp.eventId === event.id && rsvp.status === 'going').length
    }))
    .filter(event => event.id && event.title && Number.isFinite(Date.parse(event.startsAt)))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const jobs = (state.jobs || [])
    .filter(job => job.status === 'published' && job.closed !== true &&
      (!job.opensAt || Date.parse(job.opensAt) <= now) &&
      (!job.closesAt || Date.parse(job.closesAt) > now) &&
      (state.applicationForms || []).some(form => form.id === job.formId && form.status === 'published'))
    .map(job => ({
      id: String(job.id || ''),
      title: String(job.title || '').slice(0, 120),
      excerpt: String(job.excerpt || '').slice(0, 600),
      description: String(job.description || '').slice(0, 12000),
      image: publicImage(job.image),
      requirements: String(job.requirements || '').slice(0, 6000),
      responsibilities: String(job.responsibilities || '').slice(0, 6000),
      information: String(job.information || '').slice(0, 6000),
      webhookEnabled: typeof job.webhookUrl === 'string' && job.webhookUrl.length > 0,
      formId: String(job.formId || ''),
      opensAt: String(job.opensAt || ''),
      closesAt: String(job.closesAt || '')
    }))
    .filter(job => job.id && job.title);
  const applicationForms = (state.applicationForms || [])
    .filter(form => form.status === 'published')
    .map(publicForm)
    .filter(form => form.id && form.title);
  const helpCategories = (state.helpCategories || [])
    .filter(category => category && typeof category.id === 'string' && typeof category.name === 'string')
    .map(category => ({ id: category.id.slice(0, 60), name: category.name.slice(0, 80), description: String(category.description || '').slice(0, 300), order: Math.max(0, Number(category.order) || 0) }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'nl'));
  const helpArticles = visible(state.helpArticles)
    .map(article => ({
      id: String(article.id || ''),
      title: String(article.title || '').slice(0, 160),
      category: String(article.category || '').slice(0, 80),
      keywords: Array.isArray(article.keywords) ? article.keywords.slice(0, 20).map(value => String(value).slice(0, 40)) : [],
      excerpt: String(article.excerpt || '').slice(0, 600),
      content: String(article.content || '').slice(0, 12000),
      image: publicImage(article.image),
      featured: article.featured === true,
      updatedAt: String(article.updatedAt || '')
    }))
    .filter(article => article.id && article.title);
  const profiles = (state.residentProfiles || [])
    .filter(profile => profile && profile.isPublic === true && /^\d{17,22}$/.test(String(profile.discordId || '')))
    .map(profile => {
      const avatar = typeof profile.avatar === 'string' && /^https:\/\/cdn\.discordapp\.com\/avatars\/\d{17,22}\/[\w.-]+(?:\.(?:png|webp|gif))?(?:\?.*)?$/i.test(profile.avatar)
        ? profile.avatar.slice(0, 1000) : '';
      return {
        slug: String(profile.slug || '').slice(0, 60),
        username: String(profile.username || 'Heerlen-inwoner').slice(0, 80),
        avatar,
        banner: publicImage(profile.banner),
        inGameName: profile.showInGameName === false ? '' : String(profile.inGameName || '').slice(0, 80),
        bio: profile.showBio === false ? '' : String(profile.bio || '').slice(0, 500),
        createdAt: String(profile.createdAt || ''),
        showAchievements: profile.showAchievements !== false,
        achievements: profile.showAchievements === false ? [] : (state.achievementAwards || [])
          .filter(award => award.discordId === profile.discordId)
          .map(award => {
            const achievement = (state.achievements || []).find(item => item.id === award.achievementId && item.archived !== true);
            return achievement ? { id: achievement.id, title: achievement.title, description: achievement.description, icon: achievement.icon, image: publicImage(achievement.image), awardedAt: award.awardedAt } : null;
          }).filter(Boolean)
      };
    })
    .filter(profile => /^[a-z0-9]{24}$/.test(profile.slug))
    .slice(0, 1000);
  const news = visible(state.news).sort((a, b) => Date.parse(b.publishAt || b.updatedAt || 0) - Date.parse(a.publishAt || a.updatedAt || 0))
    .map(item => publicPost({
      ...item,
      comments: item.commentsEnabled === true
        ? (state.newsComments || []).filter(comment => comment.newsId === item.id && comment.hidden !== true).slice(-200)
        : []
    }, 'news')).filter(item => item.id && item.title);
  const changelog = visible(state.changelog)
    .sort((a, b) => Date.parse(b.publishAt || b.updatedAt || 0) - Date.parse(a.publishAt || a.updatedAt || 0))
    .map(item => publicPost(item, 'changelog')).filter(item => item.id && item.title);
  return {
    news,
    changelog,
    staff,
    profiles,
    events,
    jobs,
    applicationForms,
    helpCategories,
    helpArticles,
    rulesVersions: (state.rulesVersions || []).filter(version => version.status === 'published').sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    siteSettings,
    storeSettings: {
      tebexToken: typeof savedStore.tebexToken === 'string' ? savedStore.tebexToken.slice(0, 120) : '',
      tebexPackages,
      shopProducts,
      shopCategories,
      customShopProducts
    }
  };
}
