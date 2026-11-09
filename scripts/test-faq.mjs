import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./faq.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../faq/index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles/content.css', import.meta.url), 'utf8');
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
assert.ok(page.includes('<script src="/scripts/promo.js?'), 'FAQ should load the shared promo/announcement strip');
assert.ok(page.indexOf('scripts/promo.js') < page.indexOf('<header class="nav'), 'Promo strip should be inserted before the shared navigation');
assert.ok(page.includes('scripts/nav.js?v=20261109-5'), 'FAQ should load the current shared navigation behavior');
assert.ok(page.includes('cart-btn" id="cartOpen"') && page.includes('<svg viewBox="0 0 24 24"'), 'FAQ navigation should use the shared cart icon instead of a text glyph');
assert.ok(page.includes('href="/faq/" class="is-active"'), 'FAQ should mark its own navigation item as active');

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
console.log('FAQ checks passed: content coverage, accessible controls, live filtering, empty state, and reset.');
