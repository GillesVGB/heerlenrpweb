import { json, badMethod } from '../server/http.mjs';
import { vercelHandler } from '../server/vercel-adapter.mjs';

const DEFAULT_CODE = 'j48ry5k';
const LEGACY_CODE = '5oayqbr';
const DEFAULT_PORT = 30120;
const REQUEST_TIMEOUT_MS = 7000;
const DEFAULT_CACHE_SECONDS = 30;
const MAX_STALE_MS = 5 * 60 * 1000;
let lastKnownStatus = null;

function cacheSeconds() {
  const configured = Number(process.env.FIVEM_STATUS_CACHE_SECONDS);
  return Number.isInteger(configured) ? Math.min(300, Math.max(10, configured)) : DEFAULT_CACHE_SECONDS;
}

function serverVersion(data) {
  const value = data?.version || data?.vars?.sv_projectVersion || data?.vars?.sv_version || '';
  return typeof value === 'string' ? value.replace(/[^\w.+-]/g, '').slice(0, 40) : '';
}

function configuredHost() {
  const value = String(process.env.FIVEM_SERVER_HOST || '').trim();
  return /^[a-z0-9.-]+$/i.test(value) ? value : '';
}

function configuredPort() {
  const value = Number(process.env.FIVEM_SERVER_PORT || DEFAULT_PORT);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : DEFAULT_PORT;
}

function configuredCode() {
  const configured = String(process.env.CFX_JOIN_CODE || '').replace(/[^a-z0-9]/gi, '').slice(0, 32).toLowerCase();
  return !configured || configured === LEGACY_CODE ? DEFAULT_CODE : configured;
}

function timeout() {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

async function fetchDynamic(base) {
  const response = await fetch(new URL('dynamic.json', base), {
    headers: { Accept: 'application/json', 'User-Agent': 'HeerlenRoleplayWeb/1.0' },
    signal: timeout()
  });
  if (!response.ok) throw new Error('FiveM status niet bereikbaar');
  const data = await response.json();
  const clients = Number(data.clients);
  if (!Number.isFinite(clients) || data.sv_maxclients === undefined) throw new Error('Ongeldige status');
  return {
    online: true,
    clients: Math.max(0, Math.floor(clients)),
    max: Math.max(0, Math.floor(Number(data.sv_maxclients) || 0)),
    hostname: String(data.hostname || '').slice(0, 100),
    version: serverVersion(data),
    source: 'ingame'
  };
}

async function livePlayers() {
  const host = configuredHost();
  const port = configuredPort();
  const code = configuredCode();

  if (host) {
    try {
      return await fetchDynamic(`http://${host}:${port}/`);
    } catch {}
  }

  try {
    const response = await fetch(`https://frontend.cfx-services.net/api/servers/single/${code}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'HeerlenRoleplayWeb/1.0' },
      signal: timeout()
    });
    if (response.status === 404) {
      return { online: false, clients: 0, max: 0, hostname: '', version: '', source: 'cfx-listing' };
    }
    if (response.ok) {
      const body = await response.json();
      const data = body && body.Data;
      if (data === null) return { online: false, clients: 0, max: 0, hostname: '', version: '', source: 'cfx-listing' };
      const clients = Number(data && data.clients);
      if (Number.isFinite(clients)) {
        return {
          online: true,
          clients: Math.max(0, Math.floor(clients)),
          max: Math.max(0, Math.floor(Number(data.sv_maxclients || data.svMaxclients) || 0)),
          hostname: String(data.hostname || '').slice(0, 100),
          version: serverVersion(data),
          source: 'cfx-listing'
        };
      }
    }
  } catch {}

  try {
    const response = await fetch(`https://cfx.re/join/${code}`, {
      redirect: 'manual',
      headers: { 'User-Agent': 'HeerlenRoleplayWeb/1.0' },
      signal: timeout()
    });
    const endpoint = response.headers.get('x-citizenfx-url');
    if (endpoint) return await fetchDynamic(endpoint.replace(/\/?$/, '/'));
  } catch {}

  throw new Error('Serverstatus niet beschikbaar');
}

async function handler(request) {
  if (request.method !== 'GET') return badMethod('GET');
  try {
    const data = await livePlayers();
    lastKnownStatus = { ...data, lastCheckedAt: new Date().toISOString(), stale: false };
    const seconds = cacheSeconds();
    return json(lastKnownStatus, 200, { 'Cache-Control': `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}` });
  } catch {
    if (lastKnownStatus && Date.now() - Date.parse(lastKnownStatus.lastCheckedAt) <= MAX_STALE_MS) {
      return json({ ...lastKnownStatus, stale: true, error: 'Statuscontrole mislukt; laatst bekende status wordt getoond.' }, 200, {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20'
      });
    }
    return json({ online: null, lastCheckedAt: lastKnownStatus?.lastCheckedAt || null, stale: false, error: 'Serverstatus niet beschikbaar' }, 502, {
      'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20'
    });
  }
}

export default vercelHandler(handler);
