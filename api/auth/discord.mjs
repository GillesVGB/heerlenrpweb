import { setOAuthState } from '../../server/security.mjs';
import { json } from '../../server/http.mjs';
import { vercelHandler } from '../../server/vercel-adapter.mjs';

async function handler(request) {
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
  const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI, DISCORD_GUILD_ID, DISCORD_BOT_TOKEN } = process.env;
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI || !DISCORD_GUILD_ID || !DISCORD_BOT_TOKEN || !process.env.SESSION_SECRET) {
    return new Response(null, { status: 302, headers: { Location: new URL('/admin.html?login=setup', request.url).toString(), 'Cache-Control': 'no-store' } });
  }
  try {
    const { nonce, cookie } = setOAuthState(request);
    const authorize = new URL('https://discord.com/oauth2/authorize');
    authorize.searchParams.set('client_id', DISCORD_CLIENT_ID);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('redirect_uri', DISCORD_REDIRECT_URI);
    authorize.searchParams.set('scope', 'identify');
    authorize.searchParams.set('state', nonce);
    return new Response(null, { status: 302, headers: { Location: authorize.toString(), 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });
  } catch (error) { return json({ error: error.message }, 503); }
}

export default vercelHandler(handler);
