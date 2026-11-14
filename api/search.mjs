import { readContent, publicContent } from '../server/content-store.mjs';
import { badMethod, json } from '../server/http.mjs';
import { vercelHandler } from '../server/vercel-adapter.mjs';

const types = new Set(['all', 'news', 'updates', 'rules', 'help', 'events', 'profiles']);
const clip = value => String(value || '').replace(/[#>*_`\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);

function documents(content) {
  const rows = [];
  for (const item of content.news || []) rows.push({ type: 'news', label: 'Nieuws', title: item.title, text: `${item.excerpt} ${item.content}`, url: '/nieuws/' });
  for (const item of content.changelog || []) rows.push({ type: 'updates', label: 'Update', title: item.title, text: `${item.excerpt} ${item.content}`, url: '/updates/' });
  for (const version of content.rulesVersions || []) for (const document of version.documents || []) rows.push({ type: 'rules', label: 'Regels', title: document.title, text: document.content, url: '/regels/' });
  for (const item of content.helpArticles || []) rows.push({ type: 'help', label: 'Helpcentrum', title: item.title, text: `${item.category} ${item.keywords?.join(' ')} ${item.excerpt} ${item.content}`, url: '/helpcentrum/' });
  for (const item of content.events || []) rows.push({ type: 'events', label: 'Evenement', title: item.title, text: `${item.excerpt} ${item.description} ${item.location}`, url: '/events/' });
  for (const item of content.profiles || []) rows.push({ type: 'profiles', label: 'Openbaar profiel', title: item.username, text: `${item.inGameName} ${item.bio}`, url: item.slug ? `/profiel/?id=${encodeURIComponent(item.slug)}` : '/profiel/' });
  return rows;
}

async function handler(request) {
  if (request.method !== 'GET') return badMethod('GET');
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim().slice(0, 120);
  const type = types.has(url.searchParams.get('type')) ? url.searchParams.get('type') : 'all';
  if (query.length < 2) return json({ query, results: [] }, 200, { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=60' });
  try {
    const content = publicContent(await readContent());
    const terms = query.toLocaleLowerCase('nl-NL').split(/\s+/).filter(Boolean).slice(0, 8);
    const results = documents(content).map(item => {
      const haystack = `${item.title} ${item.text}`.toLocaleLowerCase('nl-NL');
      const matched = terms.filter(term => haystack.includes(term));
      return { ...item, score: matched.length + (item.title.toLocaleLowerCase('nl-NL').includes(query.toLocaleLowerCase('nl-NL')) ? 3 : 0), excerpt: clip(item.text) };
    }).filter(item => item.score > 0 && (type === 'all' || item.type === type))
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'nl'))
      .slice(0, 40)
      .map(({ score, text, ...item }) => item);
    return json({ query, results }, 200, { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=60' });
  } catch (error) {
    console.error('[api/search] Public search failed', error instanceof Error ? { name: error.name, message: error.message } : String(error));
    return json({ error: 'Zoeken is tijdelijk niet beschikbaar.' }, 503, { 'Cache-Control': 'no-store' });
  }
}

export default vercelHandler(handler);
