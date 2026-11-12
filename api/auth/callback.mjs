import { clearOAuthCookie, makeSession, permissionsForRoleIds, sessionCookie, validateOAuthState } from '../../server/security.mjs';
import { json } from '../../server/http.mjs';
import { vercelHandler } from '../../server/vercel-adapter.mjs';

function redirect(request, path) {
  return new Response(null, { status: 302, headers: { Location: new URL(path, request.url).toString(), 'Cache-Control': 'no-store', 'Set-Cookie': clearOAuthCookie(request) } });
}

function failurePath(returnTo, reason) {
  const target = returnTo === '/dashboard/' || returnTo === '/staff/' ? returnTo : '/admin.html';
  return `${target}?login=${encodeURIComponent(reason)}`;
}

async function handler(request) {
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const returnTo = validateOAuthState(request, state);
  if (url.searchParams.has('error') || !code || !returnTo) return redirect(request, failurePath(returnTo, 'discord'));
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET || !process.env.DISCORD_REDIRECT_URI || !process.env.DISCORD_GUILD_ID || !process.env.DISCORD_BOT_TOKEN) return redirect(request, failurePath(returnTo, 'setup'));

  try {
    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: process.env.DISCORD_REDIRECT_URI }),
      signal: AbortSignal.timeout(7000)
    });
    if (!tokenResponse.ok) return redirect(request, failurePath(returnTo, 'discord'));
    const token = await tokenResponse.json();
    const profileResponse = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(7000) });
    if (!profileResponse.ok) return redirect(request, failurePath(returnTo, 'discord'));
    const profile = await profileResponse.json();
    const memberResponse = await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(process.env.DISCORD_GUILD_ID)}/members/${encodeURIComponent(profile.id)}`, { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }, signal: AbortSignal.timeout(7000) });
    if (!memberResponse.ok) return redirect(request, failurePath(returnTo, 'denied'));
    const member = await memberResponse.json();
    const roles = Array.isArray(member.roles) ? member.roles : [];
    const permissions = permissionsForRoleIds(roles);
    if (!permissions.length && returnTo !== '/dashboard/') return redirect(request, failurePath(returnTo, 'denied'));
    const user = { id: profile.id, username: profile.global_name || profile.username, avatar: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=128` : null, roles, permissions, provider: 'discord' };
    const cookie = sessionCookie(makeSession(user), request);
    const headers = new Headers({ Location: new URL('/admin.html', request.url).toString(), 'Cache-Control': 'no-store' });
    headers.set('Location', new URL(returnTo, request.url).toString());
    headers.append('Set-Cookie', cookie);
    headers.append('Set-Cookie', clearOAuthCookie(request));
    return new Response(null, { status: 302, headers });
  } catch { return redirect(request, failurePath(returnTo, 'error')); }
}

export default vercelHandler(handler);
