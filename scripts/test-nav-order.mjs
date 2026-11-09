import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expected = ['Home', 'Store', 'Regels', 'FAQ', 'Nieuws', 'Updates'];

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['dist', 'node_modules', '.git', 'scripts', 'server', 'api'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await htmlFiles(full));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

let checked = 0;
for (const file of await htmlFiles(root)) {
  const html = await readFile(file, 'utf8');
  const nav = html.match(/<nav class="nav-links"[\s\S]*?<\/nav>/)?.[0];
  if (!nav) continue;
  const labels = Array.from(nav.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)).map((m) => m[1].trim());
  assert.deepEqual(labels, expected, `${path.relative(root, file)}: navigation order`);
  assert.doesNotMatch(nav, /staff/i, `${path.relative(root, file)}: navigation must not link to Staff`);
  checked += 1;
}
assert.ok(checked >= 10, 'expected to check all pages with a navigation bar');

const navJs = await readFile(path.join(root, 'scripts/nav.js'), 'utf8');
assert.doesNotMatch(navJs, /\["Staff",\s*"\/staff\/"\]/, 'shared nav.js must not add Staff');
assert.doesNotMatch(navJs, /<a href="\/staff\/">/, 'shared footer must not link to Staff');

const home = await readFile(path.join(root, 'index.html'), 'utf8');
const status = home.match(/<a class="hero-statusline[\s\S]*?<\/a>/)?.[0] || '';
assert.ok(status.indexOf('players') < status.indexOf('Bekijk serverstatistieken'), 'statistics link sits below the online counter');
console.log(`Navigation order checks passed for ${checked} pages.`);
