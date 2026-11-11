import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

class Element {
  constructor(id) {
    this.id = id;
    this.listeners = {};
    this.attributes = {};
    this.classes = new Set();
    this.hidden = false;
    this.open = false;
    this.value = '';
    this.innerHTML = '';
    this.textContent = '';
    this.classList = {
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name)
    };
  }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || ''; }
  querySelectorAll(selector) {
    if (selector !== '[data-compare-toggle]') return [];
    return Array.from(this.innerHTML.matchAll(/data-compare-toggle="([^"]+)"/g), match => {
      const element = new Element('compare-' + match[1]);
      element.setAttribute('data-compare-toggle', match[1]);
      return element;
    });
  }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

const elements = new Map();
const getElement = id => {
  if (!elements.has(id)) elements.set(id, new Element(id));
  return elements.get(id);
};
const products = [
  { id: 'coins-100', cat: 'coins', name: '100 Coins', amount: 100, bonus: 10, price: 5, blurb: 'Een klein coinpakket.' },
  { id: 'coins-200', cat: 'coins', name: '200 Coins', amount: 200, bonus: 20, price: 10, blurb: 'Een pakket met korting.', salePrice: 6.5 },
  { id: 'custom-car', cat: 'cars', name: 'Premium auto', amount: 0, bonus: 0, price: 30, blurb: 'Een Tebex-autopakket.' },
  { id: 'custom-house', cat: 'cars', name: 'Premium huis', amount: 0, bonus: 0, price: 40, blurb: 'Een Tebex-huispakket.' },
  { id: 'custom-bike', cat: 'cars', name: 'Premium motor', amount: 0, bonus: 0, price: 25, blurb: 'Een Tebex-motorpakket.' }
];
const categories = [
  { id: 'coins', name: 'Coins' },
  { id: 'cars', name: 'Pakketten' }
];
const catalog = {
  categories: () => categories,
  byCat: id => products.filter(product => product.cat === id),
  pack: id => products.find(product => product.id === id) || null,
  products: () => products,
  popular: () => [],
  priceInfo: product => product.salePrice
    ? { price: product.salePrice, discountedPrice: product.salePrice, original: product.price, sale: { eligible: true, label: '35%' } }
    : { price: product.price, original: product.price, sale: null },
  money: value => '€' + Number(value).toFixed(2),
  esc: value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
  productUrl: product => '/winkel/' + product.id,
  asset: path => '/' + path,
  imageFor: () => ''
};
const window = {
  HeerlenCatalog: catalog,
  HeerlenCart: { cart: () => ({}) },
  addEventListener() {}
};
const document = {
  title: '',
  body: { getAttribute: name => name === 'data-page' ? 'winkel' : '' },
  getElementById: getElement
};
const location = { href: 'https://heerlenrp.nl/winkel/', search: '', pathname: '/winkel/', hash: '' };
const history = { replaceState() {} };
const source = await readFile(new URL('./store.js', import.meta.url), 'utf8');
runInNewContext(source, { window, document, location, history, URL, URLSearchParams, console });
await new Promise(resolve => setImmediate(resolve));

const grid = getElement('grid');
const compareDock = getElement('compareDock');
const compareCount = getElement('compareCount');
const compareHint = getElement('compareHint');
const compareOpen = getElement('compareOpen');
const compareClear = getElement('compareClear');
const compareDialog = getElement('compareDialog');
const compareTable = getElement('compareTable');

function clickGridProduct(id) {
  const button = { getAttribute: name => name === 'data-compare-toggle' ? id : '' };
  grid.listeners.click({ target: { closest: selector => selector === '[data-compare-toggle]' ? button : null } });
}

assert.match(grid.innerHTML, /data-compare-toggle="coins-100"/, 'shop cards include compare buttons');
clickGridProduct('coins-100');
assert.equal(compareDock.hidden, false, 'the comparison dock appears when a product is selected');
assert.equal(compareCount.textContent, '1/3 producten geselecteerd');
assert.equal(compareOpen.disabled, true, 'comparison requires at least two products');
clickGridProduct('coins-200');
assert.equal(compareOpen.disabled, false);
compareOpen.listeners.click({});
assert.equal(compareDialog.open, true, 'the comparison table opens');
assert.match(compareTable.innerHTML, /100 Coins/);
assert.match(compareTable.innerHTML, /200 Coins/);
assert.match(compareTable.innerHTML, /35% KORTING/);
assert.match(compareTable.innerHTML, /€6\.50/);
assert.match(compareTable.innerHTML, /<del class="price-old">€10\.00<\/del>/, 'the original price remains visible beside the discount');
assert.match(compareTable.innerHTML, /\+10% extra/);
assert.match(compareTable.innerHTML, /Een klein coinpakket/);
assert.match(compareTable.innerHTML, /Coins/);
assert.match(compareTable.innerHTML, /Bekijk product/);

const categoryNav = getElement('shopCategories');
const categoryButton = { getAttribute: name => name === 'data-shop-category' ? 'cars' : '' };
categoryNav.listeners.click({ target: { closest: selector => selector === '[data-shop-category]' ? categoryButton : null } });
clickGridProduct('custom-car');
assert.match(compareTable.innerHTML, /Pakketten/, 'products can be compared across categories');
clickGridProduct('custom-house');
assert.equal(compareCount.textContent, '3/3 producten geselecteerd', 'at most three products can be compared');
assert.match(compareHint.textContent, /maximaal 3/);
clickGridProduct('custom-bike');
assert.equal(compareCount.textContent, '3/3 producten geselecteerd', 'a fourth product cannot be added');

const removeButton = { getAttribute: name => name === 'data-compare-remove' ? 'coins-100' : '' };
compareTable.listeners.click({ target: { closest: selector => selector === '[data-compare-remove]' ? removeButton : null } });
assert.equal(compareCount.textContent, '2/3 producten geselecteerd', 'a product can be removed from the comparison');
assert.doesNotMatch(compareTable.innerHTML, /100 Coins/);

compareClear.listeners.click({});
assert.equal(compareDock.hidden, true, 'clearing hides the comparison dock');
assert.equal(compareDialog.open, false, 'clearing closes the comparison dialog');

console.log('Shop product comparison checks passed: selection limit, live count, discount pricing, categories, product details, removal and clearing.');
