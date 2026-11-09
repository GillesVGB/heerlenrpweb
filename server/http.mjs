import { randomUUID } from 'node:crypto';

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

export async function readJson(request, maxBytes = 4_200_000) {
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('De aanvraag is te groot.');
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new Error('Ongeldige JSON-inhoud.'); }
}

export function badMethod(allow) {
  return json({ error: 'Methode niet toegestaan.' }, 405, { Allow: allow });
}

export function appendAudit(state, user, action, itemType, itemTitle) {
  state.auditLog ||= [];
  state.auditLog.unshift({
    id: randomUUID(),
    actor: String(user.username || 'Staff').slice(0, 80),
    actorId: String(user.id || '').slice(0, 40),
    action: String(action).slice(0, 40),
    itemType: String(itemType).slice(0, 40),
    itemTitle: String(itemTitle || '').slice(0, 140),
    at: new Date().toISOString()
  });
  state.auditLog = state.auditLog.slice(0, 500);
}

export function cleanText(value, max, label, allowEmpty = false) {
  const text = String(value ?? '').trim();
  if (!allowEmpty && !text) throw new Error(`${label} is verplicht.`);
  if (text.length > max) throw new Error(`${label} mag maximaal ${max} tekens bevatten.`);
  return text;
}

export function cleanImage(value) {
  const image = String(value || '').trim();
  if (!image) return '';
  if (/^https:\/\//i.test(image) && image.length <= 2000) return image;
  if (/^data:image\/(?:png|jpeg|webp);base64,[a-z\d+/]+=*$/i.test(image) && image.length <= 600_000) return image;
  throw new Error('Afbeelding moet PNG, JPEG, WebP of een HTTPS-link zijn (maximaal 400 KB).');
}

export function cleanDate(value) {
  const date = String(value || '').trim();
  if (!date) return '';
  if (!Number.isFinite(Date.parse(date))) throw new Error('Ongeldige publicatiedatum.');
  return new Date(date).toISOString();
}
