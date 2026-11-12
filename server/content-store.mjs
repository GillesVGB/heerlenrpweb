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
  return state;
}

function parseStored(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
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
  return {
    news: visible(state.news).sort((a, b) => Date.parse(b.publishAt || b.updatedAt || 0) - Date.parse(a.publishAt || a.updatedAt || 0)),
    changelog: visible(state.changelog).sort((a, b) => Date.parse(b.publishAt || b.updatedAt || 0) - Date.parse(a.publishAt || a.updatedAt || 0)),
    staff,
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
