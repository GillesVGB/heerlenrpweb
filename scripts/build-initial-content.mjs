import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'regels.html'), 'utf8');

function decode(value) {
  return String(value || '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
    if (entity[0] === '#') return String.fromCodePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[entity.toLowerCase()] || '';
  });
}

function matchingSection(start) {
  const openAt = html.lastIndexOf('<section', start);
  const openEnd = html.indexOf('>', openAt) + 1;
  let depth = 1;
  const tags = /<\/?section\b[^>]*>/gi;
  tags.lastIndex = openEnd;
  let m;
  while ((m = tags.exec(html))) {
    if (m[0][1] === '/') depth--;
    else depth++;
    if (!depth) return { open: html.slice(openAt, openEnd), body: html.slice(openEnd, m.index), end: tags.lastIndex };
  }
  throw new Error('Doc-pane section is not closed');
}

function toMarkdown(fragment) {
  const stack = [];
  let output = '';
  const tokens = fragment.replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, match => match.replace(/<\/?button\b[^>]*>/gi, '')).match(/<[^>]+>|[^<]+/g) || [];
  for (const token of tokens) {
    const tag = token.match(/^<\s*(\/?)\s*([a-z0-9]+)[^>]*>/i);
    if (!tag) { output += decode(token); continue; }
    const closing = tag[1] === '/';
    const name = tag[2].toLowerCase();
    if (!closing) {
      if (name === 'ol') stack.push({ type: 'ol', count: 0 });
      if (name === 'ul') stack.push({ type: 'ul', count: 0 });
      if (name === 'h2') output += '\n# ';
      if (name === 'h3') output += '\n## ';
      if (name === 'h4') output += '\n### ';
      if (name === 'p' || name === 'section' || name === 'div' || name === 'blockquote') output += '\n';
      if (name === 'br') output += '\n';
      if (name === 'li') {
        const level = Math.max(0, stack.length - 1);
        const list = stack[stack.length - 1];
        const marker = list && list.type === 'ol' ? `${++list.count}. ` : '- ';
        output += `\n${'  '.repeat(level)}${marker}`;
      }
    } else {
      if (name === 'ol' || name === 'ul') stack.pop();
      if (name === 'p' || name === 'h2' || name === 'h3' || name === 'h4' || name === 'section' || name === 'div' || name === 'blockquote') output += '\n\n';
    }
  }
  return output.split(/\r?\n/).map(line => line.replace(/[\t ]+/g, ' ').trim()).filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const docs = [];
let cursor = 0;
while ((cursor = html.indexOf('class="doc-pane', cursor)) >= 0) {
  const section = matchingSection(cursor);
  const id = section.open.match(/data-pane="([^"]+)"/)?.[1];
  const fragment = section.open + section.body;
  const title = decode(fragment.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1]?.replace(/<[^>]+>/g, '') || id);
  if (id && !docs.some(doc => doc.id === id)) docs.push({ id, title, content: toMarkdown(fragment) });
  cursor = section.end;
}

if (docs.length !== 3) throw new Error(`Expected 3 rule documents, found ${docs.length}`);
const now = new Date().toISOString();
const output = {
  schemaVersion: 1,
  updatedAt: now,
  news: [],
  changelog: [],
  staff: [],
  rulesDraft: { documents: docs },
  rulesVersions: [{ id: 'regels-v1', version: '1.0', title: 'Oorspronkelijke regels', status: 'published', publishedAt: now, author: 'Migratie uit bestaande website', documents: docs }],
  auditLog: [],
  siteSettings: {
    promoEnabled: true,
    promoMode: 'promo',
    promoBonus: 'Tot +47% bonus',
    promoText: 'op alle coinpakketten',
    promoCta: 'Naar de store',
    heroTitle: 'Heerlen Roleplay',
    heroLead: 'Nederlandse FiveM-stad. Straten, wagens, je eigen verhaal - met een toegankelijke economie waarin roleplay voorop staat.',
    seasonEnabled: true,
    seasonTheme: 'standard',
    seasonAccentEnabled: false,
    seasonAccent: '#5aaefd',
    seasonEffects: true,
    seasonIntensity: 1,
    seasonSpeed: 1,
    seasonDensity: 16,
    seasonFrequency: 1,
    seasonPages: ['home', 'news', 'updates', 'staff', 'rules', 'shop'],
    seasonStart: '',
    seasonEnd: '',
    maintenanceEnabled: false,
    maintenanceMessage: 'We zijn snel weer terug. Probeer het later opnieuw.'
  }
};
await mkdir(path.join(root, 'data'), { recursive: true });
await writeFile(path.join(root, 'data', 'initial-content.json'), JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(`Initial content created with ${docs.length} complete rule documents.`);
