import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unlink } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

process.env.SESSION_SECRET = 'cms-workflow-test-session-secret-not-for-production';
process.env.ADMIN_PASSWORD = 'cms-workflow-test-password-not-for-production';
process.env.CONTENT_STORE_PATH = path.join(tmpdir(), `heerlen-cms-test-${process.pid}.json`);
const originalPublicOrigin = process.env.PUBLIC_ORIGIN;

const [{ default: admin }, { default: content }, { default: avatar }, { default: donations }, { makeSession, permissionsForRoleIds, sessionCookie, verifyOrigin }] = await Promise.all([
  import('../api/admin.mjs'), import('../api/content.mjs'), import('../api/avatar.mjs'), import('../api/donations.mjs'), import('../server/security.mjs')
]);
const base = 'http://127.0.0.1:8765';
const origin = { origin: base, 'content-type': 'application/json' };
const run = (handler, method, payload, cookie) => handler(new Request(base + '/api/admin', {
  method,
  headers: { ...origin, ...(cookie ? { cookie } : {}) },
  ...(method === 'GET' ? {} : { body: JSON.stringify(payload || {}) })
}));

try {
  process.env.PUBLIC_ORIGIN = 'https://heerlenrp.nl';
  assert.equal(verifyOrigin(new Request('https://www.heerlenrp.nl/api/admin', { headers: { origin: 'https://www.heerlenrp.nl' } })), true, 'canonical www domain is accepted when configured origin is apex');
  assert.equal(verifyOrigin(new Request('https://heerlenrp.nl/api/admin', { headers: { origin: 'https://heerlenrp.nl' } })), true, 'apex domain remains accepted');
  assert.equal(verifyOrigin(new Request('https://attacker.example/api/admin', { headers: { origin: 'https://attacker.example' } })), false, 'unrelated origins remain rejected');
  if (originalPublicOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = originalPublicOrigin;

  const wrongOrigin = await admin(new Request(base + '/api/admin', { method: 'POST', headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'password-login', password: process.env.ADMIN_PASSWORD }) }));
  assert.equal(wrongOrigin.status, 403, 'cross-origin state changes are rejected');

  const unauthenticated = await run(admin, 'POST', { action: 'save', type: 'news', item: { title: 'No access', content: 'No' } });
  assert.equal(unauthenticated.status, 401, 'content writes require a session');

  const login = await run(admin, 'POST', { action: 'password-login', password: process.env.ADMIN_PASSWORD });
  assert.equal(login.status, 200, 'admin password login succeeds in configured local mode');
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const adminData = await run(admin, 'GET', undefined, cookie);
  assert.equal(adminData.status, 200, 'authenticated admin can read protected CMS data');
  const data = await adminData.json();
  assert.equal(data.content.rulesVersions[0].version, '1.0', 'complete source rules were migrated as version 1');
  assert.equal(data.content.rulesDraft.documents.length, 3, 'the APV and two code books are present in the draft');

  const created = await run(admin, 'POST', { action: 'save', type: 'news', item: { id: 'test-news', title: 'Testbericht', category: 'Nieuws', excerpt: 'Intro', content: 'Eerste alinea', status: 'published', publishAt: new Date(Date.now() - 1000).toISOString() } }, cookie);
  assert.equal(created.status, 200, 'news can be created: ' + JSON.stringify(await created.clone().json()));
  const publicData = await content(new Request(base + '/api/content'));
  const publicBody = await publicData.json();
  assert.equal(publicBody.news[0].id, 'test-news', 'published news is visible publicly');
  assert.equal('auditLog' in publicBody, false, 'private audit data is not part of the public feed');

  const themeSettings = {
    seasonEnabled: true, seasonTheme: 'newyear', seasonAccentEnabled: true, seasonAccent: '#f0b44f', seasonEffects: true,
    seasonIntensity: 1.4, seasonSpeed: 1.2, seasonDensity: 22, seasonFrequency: 1.6,
    seasonPages: ['home', 'rules'], seasonStart: '2027-12-31T18:00', seasonEnd: '2028-01-01T23:59',
    tebexToken: 'public-token-test', tebexPackages: { 'coins-100': '12345' },
    shopProducts: { 'coins-100': { name: 'Test Coins', blurb: 'Aangepaste producttekst', amount: 150, bonus: 12, featured: true } },
    shopCategories: [{ id: 'cat-vehicles-a1b2c', name: 'Voertuigen' }],
    customShopProducts: [
      { id: 'custom-test-car', name: 'Test Auto', blurb: 'Een testpakket uit Tebex met een premium voertuig, aangepaste uitvoering en extra opties om je ervaring in Heerlen uit te breiden.', category: 'cat-vehicles-a1b2c', tebexId: '67890', featured: true, visible: true },
      { id: 'custom-hidden-car', name: 'Verborgen Auto', blurb: 'Niet zichtbaar voor bezoekers.', category: 'cat-vehicles-a1b2c', tebexId: '67891', featured: true, visible: false }
    ]
  };
  const savedTheme = await run(admin, 'POST', { action: 'save-site-settings', settings: themeSettings }, cookie);
  assert.equal(savedTheme.status, 200, 'site managers can publish seasonal theme settings');
  const themeFeed = await content(new Request(base + '/api/content'));
  const themeBody = await themeFeed.json();
  const publicTheme = themeBody.siteSettings;
  assert.equal(publicTheme.seasonTheme, 'newyear', 'the public feed returns the selected season');
  assert.equal(publicTheme.seasonIntensity, 1.4, 'theme intensity persists in shared storage');
  assert.equal(publicTheme.seasonFrequency, 1.6, 'theme animation frequency persists in shared storage');
  assert.deepEqual(publicTheme.seasonPages, ['home', 'rules'], 'page selection persists in shared storage');
  assert.equal(publicTheme.seasonAccent, '#f0b44f', 'custom theme accent persists in shared storage');
  assert.equal(publicTheme.seasonStart, '2027-12-31T18:00', 'theme schedule persists in shared storage');
  assert.equal(themeBody.storeSettings.tebexToken, 'public-token-test', 'public Tebex token is available to every shop visitor');
  assert.equal(themeBody.storeSettings.tebexPackages['coins-100'], '12345', 'Tebex package IDs persist in shared storage');
  assert.equal(themeBody.storeSettings.shopProducts['coins-100'].name, 'Test Coins', 'shop product edits persist in shared storage');
  assert.equal(themeBody.storeSettings.shopProducts['coins-100'].amount, 150, 'edited package coin amounts are published');
  assert.equal(themeBody.storeSettings.shopProducts['coins-100'].featured, true, 'featured coin packages are published');
  assert.equal(themeBody.storeSettings.shopCategories[0].name, 'Voertuigen', 'custom shop categories are published');
  assert.equal(themeBody.storeSettings.customShopProducts[0].tebexId, '67890', 'custom shop products retain their Tebex package ID');
  assert.equal(themeBody.storeSettings.customShopProducts[0].featured, true, 'featured custom packages are published');
  assert.equal(themeBody.storeSettings.customShopProducts[0].visible, true, 'custom products can remain visible');
  assert.equal(themeBody.storeSettings.customShopProducts[1].visible, false, 'hidden custom products retain their visibility state');
  const badTheme = await run(admin, 'POST', { action: 'save-site-settings', settings: { seasonTheme: 'unknown' } }, cookie);
  assert.equal(badTheme.status, 400, 'unknown seasonal themes are rejected server-side');
  const badPackage = await run(admin, 'POST', { action: 'save-site-settings', settings: { tebexPackages: { 'coins-100': 'not-an-id' } } }, cookie);
  assert.equal(badPackage.status, 400, 'invalid Tebex package IDs are rejected server-side');
  const badShopProduct = await run(admin, 'POST', { action: 'save-site-settings', settings: { shopProducts: { 'coins-100': { amount: 0 } } } }, cookie);
  assert.equal(badShopProduct.status, 400, 'invalid shop product values are rejected server-side');
  const badCustomProduct = await run(admin, 'POST', { action: 'save-site-settings', settings: { customShopProducts: [{ id: 'custom-bad', name: 'Fout pakket', category: 'coins', tebexId: 'not-an-id', blurb: '' }] } }, cookie);
  assert.equal(badCustomProduct.status, 400, 'invalid custom Tebex package IDs are rejected server-side');
  const badVisibility = await run(admin, 'POST', { action: 'save-site-settings', settings: { customShopProducts: [{ id: 'custom-bad', name: 'Fout pakket', category: 'coins', tebexId: '67890', visible: 'false' }] } }, cookie);
  assert.equal(badVisibility.status, 400, 'invalid custom product visibility is rejected server-side');
  const badSchedule = await run(admin, 'POST', { action: 'save-site-settings', settings: { seasonStart: '2028-01-02T00:00', seasonEnd: '2028-01-01T00:00' } }, cookie);
  assert.equal(badSchedule.status, 400, 'invalid theme date ranges are rejected server-side');

  const staffPermissions = permissionsForRoleIds(['1567581357004038184']);
  assert.deepEqual(staffPermissions, ['staff:read'], 'the configured staff-site role only grants access to the staff page');
  assert.ok(!staffPermissions.includes('rules:write') && !staffPermissions.includes('admin:site') && !staffPermissions.includes('news:write'), 'the staff-site role cannot manage the admin panel');
  const staffToken = makeSession({ id: 'staff-test', username: 'StaffTest', roles: ['1567581357004038184'], permissions: staffPermissions });
  const staffCookie = sessionCookie(staffToken, { url: base + '/api/admin' }).split(';')[0];
  const denied = await run(admin, 'POST', { action: 'publish-rules', title: 'Staff mag dit niet' }, staffCookie);
  assert.equal(denied.status, 403, 'staff role cannot publish rule versions');
  const staffNews = await run(admin, 'POST', { action: 'save', type: 'news', item: { id: 'staff-news', title: 'Staff update', content: 'Staff mag nieuws beheren.', status: 'draft' } }, staffCookie);
  assert.equal(staffNews.status, 403, 'staff-site role cannot change admin content');

  const originalFetch = globalThis.fetch;
  const oldGuildId = process.env.DISCORD_GUILD_ID;
  const oldBotToken = process.env.DISCORD_BOT_TOKEN;
  process.env.DISCORD_GUILD_ID = 'test-guild';
  process.env.DISCORD_BOT_TOKEN = 'test-bot-token';
  try {
    const discordToken = makeSession({ id: 'discord-test', username: 'DiscordTest', roles: ['1567581357004038184'], permissions: staffPermissions, provider: 'discord' });
    const discordCookie = sessionCookie(discordToken, { url: base + '/api/admin' }).split(';')[0];
    globalThis.fetch = async () => new Response(JSON.stringify({ user: { username: 'DiscordTest', global_name: 'Discord Test' }, roles: ['1568033014384951366'] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const promotedView = await run(admin, 'GET', undefined, discordCookie);
    assert.equal(promotedView.status, 200, 'Discord role changes are checked against the current guild roles');
    assert.ok((await promotedView.json()).content.rulesDraft, 'a newly assigned admin role is effective without re-login');

    globalThis.fetch = async () => new Response(JSON.stringify({ user: { username: 'DiscordTest' }, roles: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const removedRoleWrite = await run(admin, 'POST', { action: 'save', type: 'news', item: { id: 'removed-role', title: 'Geen toegang', content: 'Niet bewaren', status: 'draft' } }, discordCookie);
    assert.equal(removedRoleWrite.status, 403, 'removed Discord roles lose access immediately');
  } finally {
    globalThis.fetch = originalFetch;
    if (oldGuildId === undefined) delete process.env.DISCORD_GUILD_ID; else process.env.DISCORD_GUILD_ID = oldGuildId;
    if (oldBotToken === undefined) delete process.env.DISCORD_BOT_TOKEN; else process.env.DISCORD_BOT_TOKEN = oldBotToken;
  }

  const draftDocs = data.content.rulesDraft.documents.map(doc => ({ ...doc }));
  draftDocs[0].content += '\n### Testwijziging\n- Alleen testinhoud';
  const savedDraft = await run(admin, 'POST', { action: 'save-rules-draft', documents: draftDocs }, cookie);
  assert.equal(savedDraft.status, 200, 'rule draft can be saved');
  const published = await run(admin, 'POST', { action: 'publish-rules', title: 'Testversie' }, cookie);
  assert.equal(published.status, 200, 'rule version can be published');
  const afterPublish = await run(admin, 'GET', undefined, cookie);
  const afterBody = await afterPublish.json();
  assert.equal(afterBody.content.rulesVersions.length, 2, 'publishing adds a new version without overwriting version 1');
  assert.equal(afterBody.content.rulesVersions[0].documents[0].content.includes('Testwijziging'), false, 'historical rule snapshot stays immutable');
  assert.equal(afterBody.content.rulesVersions[1].documents[0].content.includes('Testwijziging'), true, 'new rule snapshot contains the published edit');

  const browserSettings = { tebexToken: 'stale-local-token', tebexPackages: {} };
  const browser = {
    dispatchEvent: () => {},
    HeerlenSettings: {
      load: () => browserSettings,
      save: value => Object.assign(browserSettings, value)
    }
  };
  class BrowserCustomEvent {
    constructor(type, options) { this.type = type; this.detail = options && options.detail; }
  }
  const catalogScript = await readFile(new URL('./catalog.js', import.meta.url), 'utf8');
  const browserContext = {
    window: browser,
    CustomEvent: BrowserCustomEvent,
    document: { body: { getAttribute: name => name === 'data-base' ? '../' : '' } },
    URL
  };
  runInNewContext(catalogScript, browserContext);
  const tebexScript = await readFile(new URL('./tebex.js', import.meta.url), 'utf8');
  runInNewContext(tebexScript, {
    ...browserContext,
    window: browser,
    fetch: async url => {
      if (url === '/api/content') return { ok: true, json: async () => ({ storeSettings: themeBody.storeSettings }) };
      if (url.endsWith('/sales')) return { ok: true, json: async () => ({ data: [
        {
          name: 'Test Sale', requirements: [{ type: 'minimum_basket_value', amount: 10, currency: 'EUR' }], discount: { type: 'percentage', percentage: 10 },
          applies_to: { type: 'package', packages: [{ id: 12345 }], categories: [], excluded_packages: [], variable_options: [] }
        },
        {
          name: 'Custom Sale', requirements: [], discount: { type: 'percentage', percentage: 20 },
          applies_to: { type: 'package', packages: [{ id: 67890 }], categories: [], excluded_packages: [], variable_options: [] }
        }
      ] }) };
      if (url.endsWith('/packages')) return { ok: true, json: async () => ({ data: [
        { id: 12345, category: { id: 7 }, base_price: 8, currency: 'EUR', image: 'javascript:alert(1)', media: [{ type: 'image', url: 'https://cdn.tebex.io/coins-100.jpg', primary: true }] },
        { id: 67890, category: { id: 8 }, base_price: 29.95, currency: 'EUR', image: 'https://cdn.tebex.io/test-auto.jpg' }
      ] }) };
      throw new Error('Unexpected request: ' + url);
    }
  });
  await browser.HeerlenTebex.loadStoreSettings();
  assert.equal(browserSettings.tebexToken, 'public-token-test', 'shop login loads the shared Tebex token for visitors');
  assert.equal(browser.HeerlenTebex.packageIdFor('coins-100'), '12345', 'checkout loads shared package IDs for visitors');
  assert.equal(browserSettings.shopProducts['coins-100'].name, 'Test Coins', 'shop product edits load for every visitor');
  assert.equal(browserSettings.shopProducts['coins-100'].featured, true, 'featured coin packages load for every visitor');
  assert.equal(browser.HeerlenCatalog.categories().some(category => category.id === 'cat-vehicles-a1b2c'), true, 'custom shop categories load for visitors');
  const customShopProduct = browser.HeerlenCatalog.pack('custom-test-car');
  assert.equal(customShopProduct.name, 'Test Auto', 'custom Tebex products load into the catalog');
  assert.equal(browser.HeerlenCatalog.popular().some(product => product.id === 'custom-test-car'), true, 'featured custom packages appear in the homepage selection');
  assert.equal(browser.HeerlenCatalog.pack('custom-hidden-car'), null, 'hidden custom packages are excluded from the public catalog');
  assert.equal(browser.HeerlenCatalog.popular().some(product => product.id === 'custom-hidden-car'), false, 'hidden custom packages do not appear in featured products');
  assert.equal(browser.HeerlenCatalog.popular().some(product => product.id === 'coins-100'), true, 'featured standard packages can be selected for the homepage');
  assert.equal(browser.HeerlenTebex.packageIdFor('custom-test-car'), '67890', 'custom product checkout uses its linked Tebex package ID');
  assert.equal(browser.HeerlenCatalog.productUrl(customShopProduct), '../winkel/pakket.html?id=custom-test-car', 'custom products link to their generated detail page');
  const sales = await browser.HeerlenTebex.loadActiveSales();
  assert.equal(sales[0].name, 'Test Sale', 'active Tebex sales are loaded from the public Headless API');
  const editedPack = browser.HeerlenCatalog.pack('coins-100');
  assert.equal(editedPack.name, 'Test Coins', 'product overrides are used by the store catalog');
  assert.equal(browser.HeerlenCatalog.priceInfo(editedPack).original, 8, 'the current base price is synchronized from Tebex');
  assert.equal(browser.HeerlenCatalog.priceInfo(editedPack).price, 8, 'conditional sales do not lower prices before the basket qualifies');
  assert.equal(browser.HeerlenCatalog.priceInfo(editedPack).discountedPrice, 7.2, 'the conditional discounted price is available to storefronts as a preview');
  assert.equal(browser.HeerlenCatalog.priceInfo(editedPack).sale.minimumBasketValue, 10, 'the minimum basket threshold is published with the active sale');
  assert.equal(browser.HeerlenCatalog.priceInfo(editedPack).sale.label, '10%', 'percentage sale badge contains only the percentage');
  assert.equal(browser.HeerlenCatalog.priceInfo(editedPack, 10).price, 7.2, 'active package sales lower prices once the minimum basket is reached');
  assert.equal(browser.HeerlenCatalog.priceInfo(customShopProduct).original, 29.95, 'custom product original price is synchronized from Tebex');
  assert.equal(browser.HeerlenCatalog.priceInfo(customShopProduct).price, 23.96, 'custom product price reflects its Tebex discount');
  assert.equal(browser.HeerlenCatalog.imageFor(editedPack), 'https://cdn.tebex.io/coins-100.jpg', 'unsafe package image URLs are ignored in favor of Tebex primary media');
  assert.equal(browser.HeerlenCatalog.imageFor(customShopProduct), 'https://cdn.tebex.io/test-auto.jpg', 'custom product images are synchronized from Tebex');

  const storeElements = {
    grid: { innerHTML: '', hidden: false },
    empty: { hidden: true },
    count: { textContent: '' },
    search: { value: '', addEventListener: () => {} },
    sort: { value: 'asc', addEventListener: () => {} },
    shopCategories: { innerHTML: '', addEventListener: (type, callback) => { storeElements.shopCategoryClick = callback; } },
    toolbar: { hidden: true },
    storeTitle: { textContent: '' }
  };
  const storeDocument = {
    body: { getAttribute: name => name === 'data-page' ? 'winkel' : './' },
    title: '',
    getElementById: id => storeElements[id] || null
  };
  browser.HeerlenCart = { cart: () => ({}) };
  browser.addEventListener = () => {};
  const storeScript = await readFile(new URL('./store.js', import.meta.url), 'utf8');
  runInNewContext(storeScript, {
    window: browser,
    document: storeDocument,
    URL,
    URLSearchParams,
    location: { href: 'https://heerlenrp.nl/winkel/?cat=cat-vehicles-a1b2c', search: '?cat=cat-vehicles-a1b2c' },
    history: { replaceState: (state, title, url) => { storeElements.url = url; } },
    console
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(storeElements.storeTitle.textContent, 'Voertuigen', 'the shop category selector opens the requested custom category');
  assert.ok(storeElements.shopCategories.innerHTML.includes('data-shop-category="cat-vehicles-a1b2c"'), 'shop categories render in the sidebar navigation');
  assert.ok(storeElements.shopCategories.innerHTML.includes('aria-pressed="true"'), 'the selected sidebar category is announced');
  assert.ok(storeElements.grid.innerHTML.includes('Test Auto'), 'custom Tebex products render in the storefront');
  assert.ok(storeElements.grid.innerHTML.includes('€29.95'), 'custom product cards display the live Tebex price');
  assert.ok(storeElements.grid.innerHTML.includes('<del class="price-old">€29.95</del><span class="price">€23.96</span>'), 'discounted product cards show old and updated prices together');
  assert.ok(storeElements.grid.innerHTML.includes('https://cdn.tebex.io/test-auto.jpg'), 'custom product cards display the package image from Tebex');
  assert.ok(storeElements.grid.innerHTML.includes('href="../winkel/pakket.html?id=custom-test-car"'), 'custom product cards have a working read-more link');
  storeElements.shopCategoryClick({ target: { closest: () => ({ getAttribute: () => 'coins' }) } });
  assert.equal(storeElements.storeTitle.textContent, 'Coins', 'clicking a sidebar category changes the selected category');
  assert.equal(storeElements.url, '/winkel/', 'sidebar category selection updates the category URL');

  const productElements = { productRoot: { innerHTML: '' } };
  const productDocument = {
    title: '',
    body: {
      getAttribute: name => name === 'data-page' ? 'product' : name === 'data-product' ? 'custom-package' : '../'
    },
    getElementById: id => productElements[id] || null
  };
  runInNewContext(storeScript, {
    window: browser,
    document: productDocument,
    URL,
    URLSearchParams,
    location: { href: 'https://heerlenrp.nl/winkel/pakket.html?id=custom-test-car', search: '?id=custom-test-car' },
    history: { replaceState: () => {} },
    console
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(productElements.productRoot.innerHTML.includes('Test Auto'), 'the generated package page displays the selected product');
  assert.ok(productElements.productRoot.innerHTML.includes('Voertuigen'), 'the package page displays its assigned category');
  assert.ok(productElements.productRoot.innerHTML.includes('€29.95'), 'the package page displays its Tebex price');
  assert.ok(productElements.productRoot.innerHTML.includes('https://cdn.tebex.io/test-auto.jpg'), 'the package page displays its Tebex image');
  assert.equal(productDocument.title, 'Test Auto | Heerlen Roleplay Store', 'the package page sets its product-specific title');
  const packageTemplate = await readFile(new URL('../winkel/pakket.html', import.meta.url), 'utf8');
  assert.ok(packageTemplate.includes('data-product="custom-package"'), 'the generator emits the dynamic package detail page');

  const originalAvatarFetch = globalThis.fetch;
  try {
    let avatarRequest;
    globalThis.fetch = async url => {
      avatarRequest = String(url);
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'Content-Type': 'image/png' } });
    };
    const avatarResponse = await avatar(new Request(base + '/api/avatar?name=TestPlayer'));
    assert.equal(avatarResponse.status, 200, 'the avatar endpoint returns a CFX image');
    assert.equal(avatarResponse.headers.get('Cache-Control'), 'public, s-maxage=86400, stale-while-revalidate=604800', 'CFX images are cached by the site');
    assert.ok(avatarRequest.includes('/user_avatar/forum.cfx.re/testplayer/96/1.png'), 'avatar requests use the normalized CFX profile name');
    const invalidAvatar = await avatar(new Request(base + '/api/avatar?name=bad%2Fhost'));
    assert.equal(invalidAvatar.status, 400, 'invalid avatar names cannot select an upstream host');
  } finally {
    globalThis.fetch = originalAvatarFetch;
  }

  const originalDonationsFetch = globalThis.fetch;
  const oldTebexCheckoutKey = process.env.TEBEX_CHECKOUT_API_KEY;
  try {
    process.env.TEBEX_CHECKOUT_API_KEY = 'test-checkout-api-key';
    globalThis.fetch = async (url, options) => {
      const requestUrl = String(url);
      if (requestUrl.endsWith('/sidebar')) {
        return new Response(JSON.stringify({ data: [
          { type: 'recent_payments', data: { payments: [
            { username: 'GlobalBuyer', package: { name: '500 Coins' }, avatar_url: 'https://forum.cfx.re/user_avatar/forum.cfx.re/globalbuyer/96/1.png', created_at: '2026-11-09T12:00:00Z', price: 25, currency: 'EUR' },
            { username: 'ProfileOnlyBuyer', avatar_url: 'https://forum.cfx.re/user_avatar/example/96/1.png' }
          ] } },
          { type: 'top_customer', data: null }
        ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (requestUrl.endsWith('/top-customers?period=none')) {
        assert.equal(options.headers.Authorization, 'Basic ' + Buffer.from('public-token-test:test-checkout-api-key').toString('base64'), 'Tebex basic auth uses the public token and keeps the private key server-side');
        return new Response(JSON.stringify({ data: { username: 'AllTimeTop', total: 240, currency: 'EUR' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error('Unexpected donations request: ' + requestUrl);
    };
    const donationResponse = await donations(new Request(base + '/api/donations'));
    assert.equal(donationResponse.status, 200, 'global donations endpoint returns Tebex data');
    const donationBody = await donationResponse.json();
    assert.equal(donationBody.topDonor.username, 'AllTimeTop', 'all-time top donor comes from Tebex');
    assert.equal(donationBody.recentPayments[0].username, 'GlobalBuyer', 'recent payments are global Tebex payments');
    assert.equal(donationBody.recentPayments[0].item, '500 Coins', 'recent payment package names are returned');
    assert.equal(donationBody.recentPayments[0].avatar, 'https://forum.cfx.re/user_avatar/forum.cfx.re/globalbuyer/96/1.png', 'CFX avatars from Tebex are retained');
    assert.equal(donationBody.recentPayments[1].username, 'ProfileOnlyBuyer', 'Tebex payments without package details are retained');
    assert.equal(donationBody.recentPayments[1].item, 'Betaling via Tebex', 'minimal public payment records get a safe generic label');
    assert.equal(JSON.stringify(donationBody).includes('test-checkout-api-key'), false, 'the Tebex checkout API key is never returned to visitors');

    delete process.env.TEBEX_CHECKOUT_API_KEY;
    const recentOnlyResponse = await donations(new Request(base + '/api/donations'));
    const recentOnlyBody = await recentOnlyResponse.json();
    assert.equal(recentOnlyBody.topDonor, null, 'the all-time top donor is omitted when its private API key is not configured');
    assert.equal(recentOnlyBody.recentPayments[0].username, 'GlobalBuyer', 'global recent payments still work without the private API key');
  } finally {
    globalThis.fetch = originalDonationsFetch;
    if (oldTebexCheckoutKey === undefined) delete process.env.TEBEX_CHECKOUT_API_KEY;
    else process.env.TEBEX_CHECKOUT_API_KEY = oldTebexCheckoutKey;
  }

  console.log('CMS and shop checks passed: origin guard, login, current Discord roles, authorization, global Tebex donations, staff permissions, shared shop product settings, Tebex package mapping and active sales, schedule validation, immutable APV versions.');
} finally {
  await unlink(process.env.CONTENT_STORE_PATH).catch(() => {});
}
