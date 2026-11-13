import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'heerlen_admin_session';
const OAUTH_COOKIE = 'heerlen_discord_state';
const ADMIN_ROLE_ID = process.env.DISCORD_ADMIN_ROLE_ID || '1568033014384951366';
const STAFF_ROLE_ID = process.env.DISCORD_STAFF_ROLE_ID || '1567581357004038184';

function secret() {
  const value = process.env.SESSION_SECRET || '';
  return value.length >= 32 ? value : '';
}

function sign(value) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

export function makeSession(user) {
  if (!secret()) throw new Error('SESSION_SECRET ontbreekt');
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readSession(request) {
  const cookie = request.headers.get('cookie') || '';
  const raw = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!raw || !secret()) return null;
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { return null; }
  const [payload, signature] = decoded.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return user.exp > Date.now() ? user : null;
  } catch { return null; }
}

export function sessionCookie(value, request, maxAge = 28800) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

export function setOAuthState(request, returnTo = '/admin.html') {
  if (!secret()) throw new Error('SESSION_SECRET ontbreekt');
  const nonce = randomBytes(32).toString('base64url');
  const allowedReturnPaths = new Set(['/admin.html', '/staff/', '/dashboard/']);
  const target = allowedReturnPaths.has(returnTo) ? returnTo : '/admin.html';
  const encodedTarget = Buffer.from(target).toString('base64url');
  const value = `${nonce}.${encodedTarget}.${sign(`${nonce}.${encodedTarget}`)}`;
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return { nonce, cookie: `${OAUTH_COOKIE}=${encodeURIComponent(value)}; HttpOnly; Path=/api/auth; SameSite=Lax; Max-Age=600${secure}` };
}

export function validateOAuthState(request, state) {
  const cookie = request.headers.get('cookie') || '';
  const raw = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${OAUTH_COOKIE}=`))?.slice(OAUTH_COOKIE.length + 1);
  if (!raw || !state) return false;
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { return false; }
  const [nonce, encodedTarget, signature] = decoded.split('.');
  if (nonce !== state || !encodedTarget || !signature) return false;
  const expected = Buffer.from(sign(`${nonce}.${encodedTarget}`));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try {
    const target = Buffer.from(encodedTarget, 'base64url').toString('utf8');
    return ['/admin.html', '/staff/', '/dashboard/'].includes(target) ? target : false;
  } catch {
    return false;
  }
}

export function clearOAuthCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${OAUTH_COOKIE}=; HttpOnly; Path=/api/auth; SameSite=Lax; Max-Age=0${secure}`;
}

export function discordRoleIds() {
  return { admin: ADMIN_ROLE_ID, staff: STAFF_ROLE_ID };
}

export function permissionsForRoleIds(roleIds) {
  const roles = new Set(roleIds || []);
  const permissions = new Set();
  if (roles.has(ADMIN_ROLE_ID)) [
    'admin:site', 'news:write', 'changelog:write', 'staff:write', 'staff:read',
    'rules:write', 'audit:read', 'discord:read', 'users:manage',
    'events:manage', 'jobs:manage', 'forms:manage', 'applications:read',
    'applications:review', 'help:manage', 'comments:moderate',
    'achievements:manage', 'profiles:moderate', 'notifications:manage', 'support:manage'
  ].forEach(permission => permissions.add(permission));
  if (roles.has(STAFF_ROLE_ID)) permissions.add('staff:read');
  const rolePermissions = [
    ['DISCORD_EVENTS_ROLE_ID', 'events:manage'],
    ['DISCORD_JOBS_ROLE_ID', 'jobs:manage'],
    ['DISCORD_FORMS_ROLE_ID', 'forms:manage'],
    ['DISCORD_APPLICATIONS_READ_ROLE_ID', 'applications:read'],
    ['DISCORD_APPLICATIONS_REVIEW_ROLE_ID', 'applications:review'],
    ['DISCORD_HELP_ROLE_ID', 'help:manage'],
    ['DISCORD_COMMENTS_ROLE_ID', 'comments:moderate'],
    ['DISCORD_ACHIEVEMENTS_ROLE_ID', 'achievements:manage'],
    ['DISCORD_PROFILES_ROLE_ID', 'profiles:moderate'],
    ['DISCORD_NOTIFICATIONS_ROLE_ID', 'notifications:manage'],
    ['DISCORD_SUPPORT_ROLE_ID', 'support:manage']
  ];
  rolePermissions.forEach(([key, permission]) => {
    const roleId = process.env[key];
    if (roleId && roles.has(roleId)) permissions.add(permission);
  });
  return Array.from(permissions);
}

export function hasPermission(user, permission) {
  return !!user && Array.isArray(user.permissions) && user.permissions.includes(permission);
}

export function verifyOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  let expected = process.env.PUBLIC_ORIGIN;
  if (!expected) expected = new URL(request.url).origin;
  try {
    const normalize = value => {
      const url = new URL(value);
      url.hostname = url.hostname.replace(/^www\./i, '');
      return url.origin;
    };
    return normalize(origin) === normalize(expected);
  } catch { return false; }
}

export function safeUser(user) {
  return { id: user.id, username: user.username, avatar: user.avatar || null, roles: user.roles || [], permissions: user.permissions || [] };
}

export function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}
