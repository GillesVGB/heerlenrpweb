import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');

// Generate the public default rule/content snapshot from the existing APV page.
await import('./build-initial-content.mjs');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const staticEntries = [
  'index.html',
  '404.html',
  'admin.html',
  'regels.html',
  'images',
  'styles',
  'scripts',
  'nieuws',
  'regels',
  'staff',
  'updates',
  'faq',
  'server-statistieken',
  'winkel'
];

for (const entry of staticEntries) {
  await cp(path.join(root, entry), path.join(output, entry), { recursive: true });
}

console.log('Vercel static site prepared in ' + output);
