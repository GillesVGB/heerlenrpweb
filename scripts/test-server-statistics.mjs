import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const page = await readFile(new URL('../server-statistieken/index.html', import.meta.url), 'utf8');
const builtPage = await readFile(new URL('../dist/server-statistieken/index.html', import.meta.url), 'utf8');
const homepage = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const clientScript = await readFile(new URL('./server-statistics.js', import.meta.url), 'utf8');
const builtScript = await readFile(new URL('../dist/scripts/server-statistics.js', import.meta.url), 'utf8');
const stylesheet = await readFile(new URL('../styles/server-statistics.css', import.meta.url), 'utf8');
const builtStylesheet = await readFile(new URL('../dist/styles/server-statistics.css', import.meta.url), 'utf8');

assert.equal(builtPage, page, 'The Vercel build should include the statistics page');
assert.equal(builtScript, clientScript, 'The Vercel build should include the statistics client script');
assert.equal(builtStylesheet, stylesheet, 'The Vercel build should include the statistics stylesheet');
assert.match(homepage, /<a\b[^>]*id="serverStatus"[^>]*href="\/server-statistieken\/"/, 'The homepage status block should link to the statistics page');
assert.doesNotMatch(homepage.match(/<nav class="nav-links"[\s\S]*?<\/nav>/)?.[0] || '', /server-statistieken/i, 'Server statistics should not appear in the homepage navigation');
assert.doesNotMatch(page.match(/<nav class="nav-links"[\s\S]*?<\/nav>/)?.[0] || '', /server-statistieken/i, 'Server statistics should not appear in the page navigation');
const navigation = await readFile(new URL('./nav.js', import.meta.url), 'utf8');
assert.doesNotMatch(navigation, /\["Serverstatistieken",\s*"\/server-statistieken\/"\]/, 'The shared navigation should not reinsert server statistics');
assert.match(page, /aria-current="page"/, 'The page should identify the current navigation item');
assert.match(page, /id="statsStatusCard"[^>]*role="status"[^>]*aria-live="polite"/, 'The live status should be announced accessibly');
assert.match(page, /id="statsRefresh"/, 'The page should provide a manual refresh control');
assert.match(page, /href="https:\/\/cfx\.re\/join\/j48ry5k"/, 'Connect links on the statistics page should use the current server code');
assert.match(page, /Metingen worden alleen in deze browser bewaard/i, 'The page should disclose that history is browser-local');
assert.match(page, /maximaal 24 uur/i, 'The page should disclose the chart retention period');
assert.match(clientScript, /fetch\("\/api\/players"/, 'The page should use the existing server status API');
assert.match(clientScript, /setTimeout\(fetchStatus, 60000\)/, 'The live status should refresh periodically');
assert.match(clientScript, /localStorage\.setItem\(historyKey/, 'The chart should persist only measurements captured by this browser');
assert.match(stylesheet, /prefers-reduced-motion/);
assert.doesNotMatch(page, /ZuiderVeen/i, 'The Heerlen page should not use the reference site branding');

function fakeElement() {
  const attributes = new Map();
  const classes = new Set();
  const children = [];
  return {
    textContent: '',
    dataset: {},
    style: {},
    children,
    hidden: false,
    disabled: false,
    appendChild(child) { children.push(child); return child; },
    replaceChildren(...nextChildren) { children.splice(0, children.length, ...nextChildren); },
    classList: {
      add(name) { classes.add(name); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); }
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.get(name) || null; },
    addEventListener(name, callback) { this['on' + name] = callback; }
  };
}

async function verifyClientState(initialResponse, options = {}) {
  const ids = [
    'statsStatusCard', 'statsStatusLabel', 'statsStatusDetail', 'statsPlayers',
    'statsCapacity', 'statsOccupancy', 'statsProgress', 'statsProgressFill',
    'statsSource', 'statsCheckedAt', 'statsRefresh', 'statsChart', 'statsChartGrid',
    'statsChartArea', 'statsChartLine', 'statsChartPoints', 'statsChartLabels',
    'statsChartEmpty', 'statsChartNote'
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, fakeElement()]));
  const documentEvents = {};
  const storage = new Map(options.storage || []);
  let response = initialResponse;
  let now = Date.now();
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = {
    document: {
      hidden: false,
      getElementById(id) { return elements[id] || null; },
      createElementNS(namespace, name) {
        const element = fakeElement();
        element.localName = name;
        return element;
      },
      addEventListener(name, callback) { documentEvents[name] = callback; }
    },
    window: { setTimeout() { return 1; } },
    clearTimeout() {},
    fetch: async () => response,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) {
        if (options.storageThrows) throw new Error('Storage unavailable');
        storage.set(key, String(value));
      }
    },
    Intl,
    Date: TestDate,
    Number,
    String,
    Math
  };
  vm.runInNewContext(clientScript, context);
  await new Promise((resolve) => setImmediate(resolve));
  return {
    elements,
    documentEvents,
    storage,
    setResponse(value) { response = value; },
    advanceTime(milliseconds) { now += milliseconds; }
  };
}

let result = await verifyClientState({
  ok: true,
  json: async () => ({ online: true, clients: 12, max: 64, source: 'cfx-listing' })
});
assert.equal(result.elements.statsStatusLabel.textContent, 'Online');
assert.equal(result.elements.statsPlayers.textContent, '12');
assert.equal(result.elements.statsCapacity.textContent, '64');
assert.equal(result.elements.statsOccupancy.textContent, '19%');
assert.equal(result.elements.statsProgress.hidden, false);
assert.equal(result.elements.statsProgress.getAttribute('aria-valuenow'), '19');
assert.equal(result.elements.statsSource.textContent, 'CFX-serverlijst');
assert.notEqual(result.elements.statsCheckedAt.textContent, 'Nog niet gecontroleerd');
assert.equal(result.elements.statsStatusCard.getAttribute('aria-busy'), 'false');
assert.equal(result.elements.statsChart.hidden, false, 'A first sample should be shown without implying a trend');
assert.match(result.elements.statsChartEmpty.textContent, /Eerste meting opgeslagen/);
assert.equal(JSON.parse(result.storage.get('heerlenrp_player_history_v1')).length, 1);
result.advanceTime(60000);
result.setResponse({
  ok: true,
  json: async () => ({ online: true, clients: 18, max: 64, source: 'cfx-listing' })
});
result.elements.statsRefresh.onclick();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(result.elements.statsChart.hidden, false);
assert.match(result.elements.statsChartLine.getAttribute('d'), /^M.* L/);
assert.equal(result.elements.statsChartPoints.children.length, 2);
assert.equal(JSON.parse(result.storage.get('heerlenrp_player_history_v1')).length, 2);
assert.equal(result.elements.statsChartEmpty.hidden, true);

result = await verifyClientState({
  ok: true,
  json: async () => ({ online: false, clients: 0, max: 0, source: 'cfx-listing' })
});
assert.equal(result.elements.statsStatusLabel.textContent, 'Offline');
assert.equal(result.elements.statsPlayers.textContent, '0');
assert.equal(result.elements.statsCapacity.textContent, 'Niet beschikbaar');
assert.equal(result.elements.statsOccupancy.textContent, '—');
assert.equal(result.elements.statsProgress.hidden, true);
assert.equal(JSON.parse(result.storage.get('heerlenrp_player_history_v1'))[0].players, 0, 'Confirmed offline states should be recorded as zero');

result = await verifyClientState({
  ok: false,
  json: async () => ({ online: null, error: 'Serverstatus niet beschikbaar' })
});
assert.equal(result.elements.statsStatusLabel.textContent, 'Status niet beschikbaar');
assert.equal(result.elements.statsPlayers.textContent, '—');
assert.equal(result.elements.statsCapacity.textContent, '—');
assert.equal(result.elements.statsProgress.hidden, true);
assert.equal(result.elements.statsStatusCard.dataset.state, 'unknown');
assert.equal(result.storage.has('heerlenrp_player_history_v1'), false, 'Unknown states must not be recorded as zero players');

result = await verifyClientState({
  ok: true,
  json: async () => ({ online: true, clients: 7, max: 64, source: 'cfx-listing' })
}, { storageThrows: true });
assert.match(result.elements.statsChartNote.textContent, /alleen bewaard zolang deze pagina openstaat/);

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
  assert.ok(ready, 'The local preview server should start');

  for (const [route, pattern] of [
    ['/server-statistieken/', /De stad, live in beeld\./],
    ['/scripts/server-statistics.js', /statsStatusCard/],
    ['/styles/server-statistics.css', /\.stats-status-card/]
  ]) {
    const response = await fetch(`${origin}${route}`);
    assert.equal(response.status, 200, `${route} should be served successfully`);
    assert.match(await response.text(), pattern);
  }
} finally {
  server.kill();
}

console.log('Server statistics checks passed: build output, homepage link, live/offline/unavailable states, refresh behavior, accessibility, and local routes.');
