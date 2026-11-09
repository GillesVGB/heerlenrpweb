import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import vm from 'node:vm';

const source = await readFile(new URL('./nav.js', import.meta.url), 'utf8');
const root = fileURLToPath(new URL('../', import.meta.url));
const start = source.indexOf('  function ensurePrimaryNavOrder(links) {');
assert.notEqual(start, -1, 'Shared navigation should expose its primary-link ordering routine');
let depth = 0;
let end = -1;
for (let index = source.indexOf('{', start); index < source.length; index += 1) {
  if (source[index] === '{') depth += 1;
  if (source[index] === '}') {
    depth -= 1;
    if (depth === 0) {
      end = index + 1;
      break;
    }
  }
}
assert.notEqual(end, -1, 'Primary-link ordering routine should be complete');

const location = { href: 'https://www.heerlenrp.nl/nieuws/', pathname: '/nieuws/' };
const orderPrimaryNav = vm.runInNewContext(`(${source.slice(start, end).trim()})`, {
  URL,
  Array,
  location,
  document: {
    createElement(tagName) {
      return {
        tagName,
        href: '',
        textContent: '',
        classList: { toggle() {}, add() {} }
      };
    }
  }
});

function createNav(hrefs, baseUrl = location.href) {
  const children = hrefs.map((href) => ({
    tagName: 'A',
    href: new URL(href, baseUrl).href,
    textContent: href,
    classList: { toggle() {}, add() {} }
  }));
  return {
    get children() { return children; },
    querySelectorAll(selector) {
      assert.equal(selector, 'a');
      return children.filter((node) => node.tagName === 'A');
    },
    appendChild(node) {
      const oldIndex = children.indexOf(node);
      if (oldIndex !== -1) children.splice(oldIndex, 1);
      children.push(node);
      return node;
    },
    insertBefore(node, reference) {
      const oldIndex = children.indexOf(node);
      if (oldIndex !== -1) children.splice(oldIndex, 1);
      const referenceIndex = reference ? children.indexOf(reference) : -1;
      children.splice(referenceIndex === -1 ? children.length : referenceIndex, 0, node);
      return node;
    }
  };
}

const expected = ['/', '/winkel', '/regels', '/faq', '/nieuws', '/updates'];
function assertOrder(nav, expectedOrder, message) {
  assert.deepEqual(
    Array.from(nav.children.slice(0, expectedOrder.length), (node) => {
      const path = new URL(node.href, location.href).pathname.replace(/\/index\.html$/i, '').replace(/\/$/, '');
      return path === '/regels.html' ? '/regels' : path || '/';
    }),
    expectedOrder,
    message
  );
}

const legacyMissingFaq = createNav(['/', '/winkel/', '/regels/', '/nieuws/', '/updates/'].reverse());
orderPrimaryNav(legacyMissingFaq);
assertOrder(legacyMissingFaq, expected, 'Legacy navigation missing FAQ should insert it before Nieuws and Updates');

const misplacedFaq = createNav(['/', '/winkel/', '/regels/', '/nieuws/', '/updates/', '/faq/']);
orderPrimaryNav(misplacedFaq);
assertOrder(misplacedFaq, expected, 'Existing FAQ and content links should be reordered canonically');

const legacyProductNav = createNav(['/winkel/index.html', '/regels.html']);
orderPrimaryNav(legacyProductNav);
assertOrder(legacyProductNav, expected, 'Legacy product navigation should gain missing shared links canonically');

async function assertEveryPageNavigation(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', '.vercel', 'node_modules', 'dist'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await assertEveryPageNavigation(path);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    const html = await readFile(path, 'utf8');
    const nav = html.match(/<nav class="nav-links"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    if (!nav) continue;

    const relativePath = relative(root, path).replace(/\\/g, '/');
    const pagePath = relativePath === 'index.html'
      ? '/'
      : `/${relativePath.replace(/\/index\.html$/i, '/').replace(/\/$/, '').replace(/^(.+\.html)$/i, '$1')}`;
    location.href = new URL(pagePath, 'https://www.heerlenrp.nl').href;
    location.pathname = new URL(location.href).pathname;
    const hrefs = Array.from(nav.matchAll(/<a\b[^>]*href=["']([^"']+)["']/g), ([, href]) => href);
    const links = createNav(hrefs);
    orderPrimaryNav(links);
    assertOrder(links, expected, `Runtime navigation should be canonical on ${relativePath}`);
  }
}

await assertEveryPageNavigation(root);
console.log('Navigation checks passed: canonical ordering, legacy nav repair, and all site pages.');
