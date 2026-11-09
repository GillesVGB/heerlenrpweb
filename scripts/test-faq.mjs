import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import vm from 'node:vm';

const source = await readFile(new URL('./faq.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../faq/index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles/content.css', import.meta.url), 'utf8');
const navigation = await readFile(new URL('./nav.js', import.meta.url), 'utf8');
const siteFooter = await readFile(new URL('./site-footer.js', import.meta.url), 'utf8');
const root = fileURLToPath(new URL('../', import.meta.url));
const questions = [
  'Hoe vraag ik een whitelist aan?',
  'Waar vind ik de serverregels?',
  'Hoe koop ik coins?',
  'Hoe neem ik contact op met support?'
];

for (const question of questions) assert.ok(page.includes(question), `FAQ should answer: ${question}`);
assert.ok(page.includes('id="faqSearch"') && page.includes('type="search"'), 'FAQ should expose a search field');
assert.ok(page.includes('aria-live="polite"') && page.includes('role="status"'), 'Search results should be announced accessibly');
assert.ok(styles.includes('.faq-item summary:focus-visible'), 'FAQ disclosures should have a visible keyboard focus style');
assert.ok(page.indexOf('scripts/promo.js') < page.indexOf('<header class="nav'), 'The announcement strip should be placed before the FAQ navigation');
assert.ok(page.includes('<body data-page="faq" data-base="/">'), 'FAQ auth controls should resolve shared assets from the site root');
const navMarkup = page.match(/<nav class="nav-links"[\s\S]*?<\/nav>/)?.[0] || '';
assert.deepEqual(
  Array.from(navMarkup.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g))
    .map(([, href, label]) => [label.trim(), href])
    .filter(([, href]) => ['/', '/winkel/', '/regels/', '/faq/', '/nieuws/', '/updates/'].includes(href)),
  [['Home', '/'], ['Store', '/winkel/'], ['Regels', '/regels/'], ['FAQ', '/faq/'], ['Nieuws', '/nieuws/'], ['Updates', '/updates/']],
  'The FAQ navigation should match the shared site order'
);
assert.doesNotMatch(navMarkup, /href="\/staff\/"/, 'Staff should not appear in the FAQ top navigation');
assert.doesNotMatch(navMarkup, /href="\/server-statistieken\/"/, 'The FAQ navigation should not expose server statistics');
const cartButton = page.match(/<button[^>]*class="cart-btn"[^>]*>[\s\S]*?<\/button>/)?.[0] || '';
assert.match(cartButton, /<svg[\s\S]*<\/svg>/, 'FAQ should use the shared SVG cart icon');
assert.match(cartButton, /id="cartBadge"/, 'FAQ should show the shared cart item badge');
assert.doesNotMatch(cartButton, /⌑/, 'FAQ should not use the legacy cart glyph');
for (const asset of ['catalog.js?v=20261109-2', 'tebex.js?v=20261109-6', 'auth.js?v=20261109-4', 'cart.js?v=20261109-6']) {
  assert.ok(page.includes(`/scripts/${asset}`), `FAQ should load ${asset}`);
}
assert.ok(page.indexOf('scripts/tebex.js') < page.indexOf('scripts/auth.js'), 'Tebex should load before shared authentication');
assert.ok(page.indexOf('scripts/auth.js') < page.indexOf('scripts/cart.js'), 'Authentication should load before the cart');
assert.ok(page.indexOf('scripts/cart.js') < page.indexOf('scripts/nav.js'), 'Cart behavior should load before shared navigation');
for (const cartElement of ['id="drawer"', 'id="cartClose"', 'id="cartBody"', 'id="payerName"', 'id="payBtn"']) {
  assert.ok(page.includes(cartElement), `FAQ should include working cart element ${cartElement}`);
}
assert.doesNotMatch(navigation, /\["Serverstatistieken",\s*"\/server-statistieken\/"\]/, 'Shared navigation must not add server statistics');
assert.doesNotMatch(navigation, /\["Staff",\s*"\/staff\/"\]/, 'Shared navigation must not add Staff to the top navigation');
assert.match(navigation, /link\.href = "https:\/\/cfx\.re\/join\/j48ry5k";/, 'The generated shared-nav Connect link should use the current server code');
assert.match(navigation, /<a href="\/staff\/">Staff<\/a>/, 'Staff should remain available in the shared footer');
assert.match(siteFooter, /<a href="\/staff\/">Staff<\/a>/, 'Staff should remain available in the compact site footer');
assert.doesNotMatch(navigation, /link\.href = "https:\/\/cfx\.re\/join\/5oayqbr";/, 'The generated shared-nav Connect link must not use the stale server code');

async function assertConsistentNavigation(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.vercel' || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await assertConsistentNavigation(path);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      const html = await readFile(path, 'utf8');
      const navs = Array.from(html.matchAll(/<nav class="nav-links"[\s\S]*?<\/nav>/g), ([markup]) => markup);
      for (const markup of navs) {
        assert.doesNotMatch(markup, /href=["'][^"']*\/staff\/["']/i, `Staff should not appear in the top navigation: ${relative(root, path)}`);
      }
      if (html.includes('<header class="nav')) {
        assert.match(html, /(?:\.\/|\.\.\/|\/)styles\/heerlen\.css\?v=20261109-15/, `Shared navigation stylesheet should be current: ${relative(root, path)}`);
      }
    }
  }
}

await assertConsistentNavigation(root);

const input = { value: '', handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; } };
const items = [
  { textContent: 'Whitelist aanmelden via Discord', hidden: false },
  { textContent: 'Coins kopen in de store', hidden: false },
  { textContent: 'Support via ticket in Discord', hidden: false }
];
const list = { querySelectorAll: () => items };
const empty = { hidden: true };
const results = { textContent: '' };
const document = {
  getElementById(id) {
    return { faqSearch: input, faqList: list, faqEmpty: empty, faqResults: results }[id] || null;
  }
};

vm.runInNewContext(source, { document, Array, String });
input.value = 'coins';
input.handlers.input();
assert.deepEqual(items.map((item) => item.hidden), [true, false, true], 'Search should show only matching answers');
assert.equal(results.textContent, '1 antwoord gevonden.');
assert.equal(empty.hidden, true);

input.value = 'not-a-topic';
input.handlers.input();
assert.ok(items.every((item) => item.hidden), 'No-result search should hide every answer');
assert.equal(empty.hidden, false, 'No-result guidance should become visible');
assert.equal(results.textContent, '0 antwoorden gevonden.');

input.value = '';
input.handlers.input();
assert.ok(items.every((item) => !item.hidden), 'Clearing the search should restore every answer');
assert.equal(empty.hidden, true);
console.log('FAQ checks passed: content coverage, shared header controls, navigation consistency, live filtering, empty state, and reset.');
