import { json, badMethod } from '../server/http.mjs';
import { vercelHandler } from '../server/vercel-adapter.mjs';

const DEFAULT_HOST = '185.228.81.117';
const DEFAULT_PORT = '30120';
function host(value) { const input = String(value || '').trim(); return /^[a-z0-9.-]+$/i.test(input) ? input : DEFAULT_HOST; }
function port(value) { const number = Number(value); return Number.isInteger(number) && number > 0 && number <= 65535 ? String(number) : DEFAULT_PORT; }
function timeout() { return AbortSignal.timeout(7000); }

async function fetchDynamic(base) {
  const response = await fetch(new URL('dynamic.json', base), { headers: { Accept: 'application/json', 'User-Agent': 'HeerlenRoleplayWeb/1.0' }, signal: timeout() });
  if (!response.ok) throw new Error('FiveM status niet bereikbaar');
  const data = await response.json();
  if (data.clients === undefined || data.sv_maxclients === undefined) throw new Error('Ongeldige status');
  return { clients: Number(data.clients) || 0, max: Number(data.sv_maxclients) || 0, hostname: String(data.hostname || '').slice(0, 100), source: 'ingame' };
}

async function livePlayers(options) {
  try { return await fetchDynamic(`http://${options.host}:${options.port}/`); }
  catch (_) {}
  if (options.code) {
    try {
      const response = await fetch(`https://frontend.cfx-services.net/api/servers/single/${options.code}`, { headers: { Accept: 'application/json', 'User-Agent': 'HeerlenRoleplayWeb/1.0' }, signal: timeout() });
      if (response.ok) {
        const body = await response.json();
        const data = body && body.Data ? body.Data : {};
        const clients = Number(data.clients);
        if (Number.isFinite(clients)) return { clients, max: Number(data.sv_maxclients || data.svMaxclients) || 0, hostname: String(data.hostname || '').slice(0, 100), source: 'cfx-listing' };
      }
    } catch (_) {}
    try {
      const response = await fetch('https://cfx.re/join/' + options.code, { redirect: 'manual', headers: { 'User-Agent': 'HeerlenRoleplayWeb/1.0' }, signal: timeout() });
      const endpoint = response.headers.get('x-citizenfx-url');
      if (endpoint) return await fetchDynamic(endpoint.replace(/\/?$/, '/') );
    } catch (_) {}
  }
  throw new Error('Serverstatus niet beschikbaar');
}

async function handler(request) {
  if (request.method !== 'GET') return badMethod('GET');
  const url = new URL(request.url);
  const code = String(url.searchParams.get('code') || '5oayqbr').replace(/[^a-z0-9]/gi, '').slice(0, 32);
  try {
    const data = await livePlayers({ host: host(url.searchParams.get('host')), port: port(url.searchParams.get('port')), code });
    return json(data, 200, { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' });
  } catch {
    return json({ error: 'Serverstatus niet beschikbaar' }, 502, { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' });
  }
}

export default vercelHandler(handler);
