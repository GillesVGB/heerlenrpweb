import { json, badMethod } from '../server/http.mjs';
import { vercelHandler } from '../server/vercel-adapter.mjs';

const DEFAULT_CODE = 'j48ry5k';
const LEGACY_CODE = '5oayqbr';
const DEFAULT_PORT = 30120;
const REQUEST_TIMEOUT_MS = 7000;

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
      return { online: false, clients: 0, max: 0, hostname: '', source: 'cfx-listing' };
    }
    if (response.ok) {
      const body = await response.json();
      const data = body && body.Data;
      if (data === null) return { online: false, clients: 0, max: 0, hostname: '', source: 'cfx-listing' };
      const clients = Number(data && data.clients);
      if (Number.isFinite(clients)) {
        return {
          online: true,
          clients: Math.max(0, Math.floor(clients)),
          max: Math.max(0, Math.floor(Number(data.sv_maxclients || data.svMaxclients) || 0)),
          hostname: String(data.hostname || '').slice(0, 100),
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
    return json(data, 200, { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' });
  } catch {
    return json({ online: null, error: 'Serverstatus niet beschikbaar' }, 502, {
      'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20'
    });
  }
}

export default vercelHandler(handler);
