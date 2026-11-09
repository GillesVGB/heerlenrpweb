import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const initialContent = JSON.parse(await readFile(path.join(root, 'data', 'initial-content.json'), 'utf8'));
const localPath = process.env.CONTENT_STORE_PATH || path.join(root, 'data', 'local-content.json');
const blobPath = 'fantasy-roleplay/content-v1.json';
const useDatabase = !!process.env.DATABASE_URL;
const useBlob = !useDatabase && (!!process.env.BLOB_READ_WRITE_TOKEN || (!!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN));
const inVercel = !!process.env.VERCEL;
let sql;
let dbReady;
let localQueue = Promise.resolve();

async function initialState() {
  return structuredClone(initialContent);
}

function parseStored(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function initDatabase() {
  if (!dbReady) dbReady = (async () => {
    const { neon } = await import('@neondatabase/serverless');
    sql = neon(process.env.DATABASE_URL);
    await sql`CREATE TABLE IF NOT EXISTS fantasy_roleplay_content (singleton SMALLINT PRIMARY KEY CHECK (singleton = 1), revision BIGINT NOT NULL, body JSONB NOT NULL)`;
    const seed = JSON.stringify(await initialState());
    await sql`INSERT INTO fantasy_roleplay_content (singleton, revision, body) VALUES (1, 0, ${seed}::jsonb) ON CONFLICT (singleton) DO NOTHING`;
  })();
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
    await initDatabase();
    const rows = await sql`SELECT body FROM fantasy_roleplay_content WHERE singleton = 1`;
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
    await initDatabase();
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
    await initDatabase();
    for (let attempt = 0; attempt < 5; attempt++) {
      const rows = await sql`SELECT revision, body FROM fantasy_roleplay_content WHERE singleton = 1`;
      const row = rows[0];
      const current = parseStored(row.body);
      const next = structuredClone(current);
      const result = await mutator(next);
      next.updatedAt = new Date().toISOString();
      if (Buffer.byteLength(JSON.stringify(next), 'utf8') > 4_000_000) throw new Error('Beheerinhoud is groter dan 4 MB. Verklein afbeeldingen of teksten.');
      const data = JSON.stringify(next);
      const written = await sql`UPDATE fantasy_roleplay_content SET body = ${data}::jsonb, revision = revision + 1 WHERE singleton = 1 AND revision = ${row.revision} RETURNING revision`;
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
  return {
    news: visible(state.news).sort((a, b) => Date.parse(b.publishAt || b.updatedAt || 0) - Date.parse(a.publishAt || a.updatedAt || 0)),
    changelog: visible(state.changelog).sort((a, b) => Date.parse(b.publishAt || b.updatedAt || 0) - Date.parse(a.publishAt || a.updatedAt || 0)),
    rulesVersions: (state.rulesVersions || []).filter(version => version.status === 'published').sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    siteSettings,
    storeSettings: {
      tebexToken: typeof savedStore.tebexToken === 'string' ? savedStore.tebexToken.slice(0, 120) : '',
      tebexPackages
    }
  };
}
