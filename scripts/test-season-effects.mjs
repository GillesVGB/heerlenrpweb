import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./site-effects.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles/site-effects.css', import.meta.url), 'utf8');
const snowArtwork = await readFile(new URL('../images/seasons/christmas-snow.svg', import.meta.url), 'utf8');
const made = [];
let reduceMotion = false;

function makeNode(tagName) {
  const node = {
    tagName: tagName.toUpperCase(), className: '', textContent: '', children: [], attributes: {},
    style: { values: {}, setProperty(key, value) { this.values[key] = String(value); }, removeProperty(key) { delete this.values[key]; } },
    setAttribute(key, value) { this.attributes[key] = value; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    }
  };
  made.push(node);
  return node;
}

const body = {
  dataset: { page: 'home' }, children: [],
  classList: { contains: () => false, add() {}, remove() {} },
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
};
const documentElement = { dataset: {}, style: { setProperty() {}, removeProperty() {} } };
const document = {
  body, documentElement,
  createElement: makeNode,
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll(selector) { return selector === '.season-layer' ? body.children.filter((node) => node.className.includes('season-layer')) : []; }
};
const defaults = { seasonEnabled: true, seasonTheme: 'standard', seasonEffects: true, seasonIntensity: 1, seasonSpeed: 1, seasonFrequency: 1, seasonDensity: 16, seasonPages: ['home'], seasonStart: '', seasonEnd: '', promoEnabled: false, maintenanceEnabled: false };
const window = {
  location: { search: '' },
  HeerlenSettings: { load: () => ({ ...defaults }), save() {} },
  HeerlenPublicContent: { siteSettings: { ...defaults } },
  matchMedia: (query) => ({ matches: query.includes('prefers-reduced-motion') && reduceMotion }),
  setTimeout: () => 1, clearTimeout() {}, dispatchEvent() {}
};
vm.runInNewContext(source, { window, document, CustomEvent: class { constructor(name, init) { this.type = name; this.detail = init?.detail; } }, URLSearchParams, Date, Math, Number, String, Array, Object, Promise });

const expectedAssets = {
  christmas: ['christmas-lights.svg'],
  halloween: ['halloween-mist.svg', 'halloween-bats.svg'],
  newyear: ['newyear-fireworks.svg'],
  easter: ['easter-decorations.svg']
};
for (const [theme, assets] of Object.entries(expectedAssets)) {
  window.HeerlenSiteEffects.apply({ ...defaults, seasonTheme: theme, seasonDensity: 16, seasonSpeed: 1.2, seasonFrequency: 1.6 });
  assert.equal(documentElement.dataset.season, theme, `${theme} theme should apply`);
  const layer = body.children.find((node) => node.className.includes('season-layer'));
  assert.ok(layer, `${theme} should create its animated layer`);
  const sources = made.filter((node) => node.tagName === 'IMG' && node.parentNode && layerContains(layer, node)).map((node) => node.src);
  for (const asset of assets) {
    assert.ok(sources.some((url) => url.endsWith(asset)), `${theme} should load ${asset}`);
    const svg = await readFile(new URL(`../images/seasons/${asset}`, import.meta.url), 'utf8');
    assert.ok(svg.startsWith('<svg'), `${asset} should be available SVG artwork`);
  }
  assert.equal(layer.style.values['--season-frequency'], '1.6', `${theme} should receive its configured frequency`);
}
for (const animation of ['season-snowfall', 'season-bat-flight', 'season-mist-drift', 'season-burst', 'season-burst-reduced', 'season-easter-drift', 'season-easter-gentle']) {
  assert.ok(styles.includes(`@keyframes ${animation}`), `${animation} should be defined`);
}
assert.ok(styles.includes('/images/seasons/christmas-snow.svg'), 'Christmas uses the tiled snowfall artwork');
assert.ok(snowArtwork.startsWith('<svg'), 'Christmas snowfall artwork should be available');
assert.ok(!source.includes('christmas-santa-sleigh.svg'), 'Christmas no longer inserts the removed sleigh artwork');
assert.ok(!source.includes('season-sleigh'), 'Christmas no longer creates a flying sleigh layer');
assert.ok(styles.includes('season-motion-reduced .season-firework {') && styles.includes('animation:season-burst-reduced'), 'Reduced-motion users still get gentle animated New Year bursts');
assert.ok(styles.includes('season-motion-reduced .season-easter-flight {') && styles.includes('animation:season-easter-gentle'), 'Reduced-motion users still get gentle Easter movement');

window.HeerlenSiteEffects.apply({ ...defaults, seasonTheme: 'christmas', seasonDensity: 0 });
let signatureLayer = body.children.find((node) => node.className.includes('season-layer'));
assert.ok(signatureLayer, 'Christmas should still create its signature effects at zero particle density');
assert.ok(!made.some((node) => node.className.includes('season-sleigh') && layerContains(signatureLayer, node)), 'The unwanted Santa sleigh should not render');

window.HeerlenSiteEffects.apply({ ...defaults, seasonTheme: 'newyear', seasonDensity: 0 });
signatureLayer = body.children.find((node) => node.className.includes('season-layer'));
assert.equal(signatureLayer.children.filter((node) => node.className.includes('season-firework')).length, 5, 'New Year should keep five signature fireworks at zero particle density');

reduceMotion = true;
window.HeerlenSiteEffects.apply({ ...defaults, seasonTheme: 'christmas', seasonDensity: 0 });
signatureLayer = body.children.find((node) => node.className.includes('season-layer'));
assert.ok(signatureLayer, 'Reduced-motion preference should not hide seasonal art');
assert.ok(signatureLayer.className.includes('season-motion-reduced'), 'Reduced-motion preference should select the low-motion accessible layout');
assert.ok(!made.some((node) => node.className.includes('season-sleigh') && layerContains(signatureLayer, node)), 'The unwanted Santa sleigh should not render for reduced-motion users either');
window.HeerlenSiteEffects.apply({ ...defaults, seasonTheme: 'newyear', seasonDensity: 0 });
signatureLayer = body.children.find((node) => node.className.includes('season-layer'));
assert.equal(signatureLayer.children.filter((node) => node.className.includes('season-firework')).length, 5, 'Reduced-motion New Year should keep visible static fireworks');
reduceMotion = false;

window.HeerlenSiteEffects.apply({ ...defaults, seasonTheme: 'standard' });
assert.equal(documentElement.dataset.season, 'standard');
assert.ok(!body.children.some((node) => node.className.includes('season-layer')), 'standard theme should remove decorative animation layers');
window.HeerlenSiteEffects.apply({ ...defaults, seasonTheme: 'christmas', seasonEffects: false });
assert.ok(!body.children.some((node) => node.className.includes('season-layer')), 'animation switch should disable effects');
window.HeerlenSiteEffects.apply({ ...defaults, seasonTheme: 'christmas', seasonPages: ['shop'] });
assert.ok(!body.children.some((node) => node.className.includes('season-layer')), 'page selection should scope effects');
console.log('Season effect checks passed: themes, assets, zero-density signature art, reduced-motion visibility, standard reset, animation switch, and page scope.');

function layerContains(layer, node) {
  if (layer === node) return true;
  return layer.children.some((child) => child === node || layerContains(child, node));
}
