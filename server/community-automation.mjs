import { randomUUID } from 'node:crypto';
import { readContent, updateContent } from './content-store.mjs';

export const automationTriggers = {
  news_published: 'Nieuw nieuwsbericht',
  event_published: 'Evenement gepubliceerd',
  event_changed: 'Evenement bijgewerkt',
  event_cancelled: 'Evenement geannuleerd',
  ticket_opened: 'Nieuw supportticket'
};

export function enqueueAutomation(state, type, event) {
  if (!Object.hasOwn(automationTriggers, type)) return '';
  const config = state.discordAutomations?.[type];
  if (!config?.enabled || !config.webhookUrl) return '';
  const sourceId = String(event.sourceId || '');
  const dedupeKey = `${type}:${sourceId}:${String(event.version || event.createdAt || '')}`;
  state.automationRuns ||= [];
  const previous = state.automationRuns.find(run => run.dedupeKey === dedupeKey);
  if (previous) return previous.id;
  const id = randomUUID();
  state.automationRuns.push({
    id, type, label: automationTriggers[type], dedupeKey, status: 'pending', attempts: 0,
    webhookUrl: config.webhookUrl,
    title: String(event.title || automationTriggers[type]).slice(0, 200),
    summary: String(event.summary || '').slice(0, 900),
    url: String(event.url || '').slice(0, 400),
    actor: String(event.actor || '').slice(0, 80),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), error: ''
  });
  state.automationRuns = state.automationRuns.slice(-500);
  return id;
}

export async function dispatchAutomation(id) {
  if (!id) return;
  const claim = await updateContent(state => {
    state.automationRuns ||= [];
    const run = state.automationRuns.find(item => item.id === id);
    if (!run || run.status !== 'pending') return null;
    run.status = 'sending'; run.attempts = (Number(run.attempts) || 0) + 1; run.updatedAt = new Date().toISOString();
    return structuredClone(run);
  });
  if (!claim) return;
  let status = 'sent'; let error = '';
  try {
    const current = await readContent();
    const config = current.discordAutomations?.[claim.type];
    if (!config?.enabled || !config.webhookUrl || config.webhookUrl !== claim.webhookUrl) throw new Error('Webhookinstelling is gewijzigd voordat het bericht is verzonden.');
    const templates = String(config.template || '').slice(0, 900);
    const values = { title: claim.title, summary: claim.summary, url: claim.url, actor: claim.actor, category: claim.label };
    const description = (templates || '{summary}').replace(/\{(title|summary|url|actor|category)\}/g, (_, key) => values[key] || '').slice(0, 4000);
    const embed = { title: claim.title.slice(0, 256), description: description || 'Er is een community-update.', color: 0x3987e8, timestamp: claim.createdAt };
    if (claim.url) embed.url = new URL(claim.url, process.env.PUBLIC_ORIGIN || 'https://heerlenrp.nl').toString();
    const response = await fetch(claim.webhookUrl, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(6000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '', allowed_mentions: { parse: [] }, embeds: [embed] })
    });
    if (!response.ok) throw new Error(`Discord antwoordde met HTTP ${response.status}.`);
  } catch (cause) { status = 'failed'; error = String(cause?.message || 'Verzenden mislukt.').slice(0, 240); }
  await updateContent(state => {
    const run = (state.automationRuns || []).find(item => item.id === id);
    if (!run || run.status !== 'sending') return;
    run.status = status; run.error = error; run.updatedAt = new Date().toISOString();
  });
}

export function safeAutomationHistory(state) {
  return (state.automationRuns || []).slice(-100).reverse().map(({ webhookUrl, dedupeKey, ...run }) => run);
}

export function safeAutomationSettings(state) {
  return Object.fromEntries(Object.keys(automationTriggers).map(type => {
    const item = state.discordAutomations?.[type] || {};
    return [type, { enabled: item.enabled === true, template: String(item.template || ''), configured: typeof item.webhookUrl === 'string' && item.webhookUrl.length > 0 }];
  }));
}
