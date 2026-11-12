import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = await readFile(new URL('../404.html', import.meta.url), 'utf8');
const built = await readFile(new URL('../dist/404.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles/404.css', import.meta.url), 'utf8');
assert.equal(built, source, 'Vercel build should include the custom 404 page');
assert.match(source, /<html lang="nl">/);
assert.match(source, /<meta name="robots" content="noindex">/);
assert.match(source, /href="\/"/, 'The page should link back to the home page');
assert.match(source, /href="\/regels\/"/, 'The page should link to a valid site section');
assert.match(styles, /:focus-visible/);
assert.match(styles, /prefers-reduced-motion/);

const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once('error', reject);
  reservation.listen(0, '127.0.0.1', resolve);
});
const port = reservation.address().port;
await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));

const server = spawn(process.execPath, [fileURLToPath(new URL('./_serve.js', import.meta.url))], {
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore'
});

try {
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await fetch(origin);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.ok(ready, 'Local preview server should start');

  const missing = await fetch(`${origin}/this-route-does-not-exist`);
  assert.equal(missing.status, 404, 'Unknown routes should keep HTTP 404 status');
  assert.match(await missing.text(), /Deze pagina is de weg kwijt\./);

  for (const route of ['/', '/winkel/', '/regels/', '/dashboard/', '/images/heerlen-logo.png']) {
    const response = await fetch(`${origin}${route}`);
    assert.notEqual(response.status, 404, `${route} should not be handled by the not-found page`);
  }
  const dashboard = await fetch(`${origin}/dashboard/`);
  assert.match(await dashboard.text(), /Mijn dashboard/, 'the resident dashboard page should be served');

  const api = await fetch(`${origin}/api/content`);
  assert.notEqual(api.status, 404, 'Known API routes should retain their API handler');
  assert.match(api.headers.get('content-type') || '', /application\/json/);
  const portal = await fetch(`${origin}/api/portal`);
  assert.equal(portal.status, 401, 'resident API is available but requires an authenticated Discord session');
} finally {
  server.kill();
}

console.log('Custom 404 checks passed: build output, not-found status, valid pages, image assets, and API routing.');
