import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./nav.js', import.meta.url), 'utf8');
const start = source.indexOf('  function ensureContentLinks() {');
const end = source.indexOf('  function ensureRulesSubmenu() {', start);
assert.ok(start >= 0 && end > start, 'The shared navigation normalizer should exist');
const context = {
  Array,
  URL,
  location: { href: 'https://site.test/updates/', pathname: '/updates/' },
  document: null
};
const ensureContentLinks = vm.runInNewContext(`(${source.slice(start, end).trim()})`, context);

function makeAnchor(href, label) {
  const attributes = {};
  const classes = new Set();
  return {
    tagName: 'A',
    href,
    textContent: label,
    className: '',
    classList: {
      toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
      add(name) { classes.add(name); }
    },
    setAttribute(name, value) { attributes[name] = value; },
    removeAttribute(name) { delete attributes[name]; },
    remove() {
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    },
    querySelector() { return null; },
    _classes: classes,
    _attributes: attributes
  };
}

const cases = [
  [['/staff/', 'Staff'], ['/server-statistieken/', 'Serverstatistieken'], ['/updates/', 'Updates'], ['/nieuws/', 'Nieuws'], ['/regels/', 'Regels'], ['/winkel/', 'Store'], ['/', 'Home']],
  [['../index.html', 'Home'], ['./', 'Store'], ['../regels.html', 'Regels']],
  [['/', 'Home'], ['/faq/', 'FAQ'], ['/nieuws/', 'Nieuws'], ['/updates/', 'Updates'], ['/staff/', 'Staff'], ['/regels/', 'Regels'], ['/winkel/', 'Store']]
];

for (const links of cases) {
  const children = links.map(([href, label]) => makeAnchor(href, label));
  const container = {
    children,
    querySelectorAll(selector) { return selector === 'a' ? this.children : []; },
    querySelector(selector) { return this.children.find((child) => child.className === selector.slice(1)) || null; },
    appendChild(child) {
      if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((existing) => existing !== child);
      this.children = this.children.filter((existing) => existing !== child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
  };
  children.forEach((child) => { child.parentNode = container; });
  context.document = {
    querySelector(selector) { return selector === '.nav-links' ? container : null; },
    createElement(tagName) { return tagName === 'a' ? makeAnchor('', '') : { tagName: tagName.toUpperCase(), className: '', setAttribute() {}, classList: { add() {} } }; }
  };
  context.location = { href: 'https://site.test/updates/', pathname: '/updates/' };
  ensureContentLinks();
  assert.deepEqual(container.children.slice(0, 6).map((anchor) => anchor.textContent), [
    'Home', 'Store', 'Regels', 'FAQ', 'Nieuws', 'Updates'
  ]);
  assert.ok(!container.children.some((anchor) => anchor.href === '/staff/'), 'Staff should not appear in the top navigation');
  assert.ok(!container.children.some((anchor) => anchor.href === '/server-statistieken/'), 'Server statistics should not appear in the top navigation');
}

const footer = await readFile(new URL('./site-footer.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles/heerlen.css', import.meta.url), 'utf8');
assert.match(footer, /class="hr-footer-staff" href="\/staff\/"/, 'Staff should be linked from the shared footer');
assert.match(styles, /\.hr-footer-staff \{[^}]*font-size:\.72rem/, 'The footer Staff link should remain visually small');

console.log('Navigation checks passed: six shared top links, Staff and server statistics removed from every menu variant, and small footer Staff link.');
