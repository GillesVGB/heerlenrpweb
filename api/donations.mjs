import { readContent } from '../server/content-store.mjs';
import { badMethod, json } from '../server/http.mjs';
import { vercelHandler } from '../server/vercel-adapter.mjs';

const cacheHeaders = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' };

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...options.headers },
    signal: AbortSignal.timeout(7000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Tebex returned HTTP ${response.status}`);
  return body.data;
}

function cleanPayment(payment) {
  if (!payment || typeof payment !== 'object') return null;
  const username = typeof payment.username === 'string' ? payment.username.trim().slice(0, 80) : '';
  const item = payment.package && typeof payment.package.name === 'string' ? payment.package.name.trim().slice(0, 120) : '';
  if (!username || !item) return null;
  const createdAt = typeof payment.created_at === 'string' && Number.isFinite(Date.parse(payment.created_at)) ? payment.created_at : '';
  const price = Number(payment.price);
  return {
    username,
    item,
    ...(createdAt ? { createdAt } : {}),
    ...(Number.isFinite(price) && price >= 0 ? { amount: price } : {}),
    currency: typeof payment.currency === 'string' ? payment.currency.slice(0, 3) : ''
  };
}

async function handler(request) {
  if (request.method !== 'GET') return badMethod('GET');

  try {
    const state = await readContent();
    const token = typeof state.storeSettings?.tebexToken === 'string' ? state.storeSettings.tebexToken.trim() : '';
    if (!token) return json({ error: 'Tebex is nog niet ingesteld.' }, 503, { 'Cache-Control': 'no-store' });

    const accountUrl = `https://headless.tebex.io/api/accounts/${encodeURIComponent(token)}`;
    const sidebarData = await getJson(`${accountUrl}/sidebar`);
    const modules = Array.isArray(sidebarData) ? sidebarData : [];
    const recentModule = modules.find(module => module?.type === 'recent_payments');
    const recentPayments = (Array.isArray(recentModule?.data?.payments) ? recentModule.data.payments : [])
      .map(cleanPayment)
      .filter(Boolean)
      .slice(0, 10);

    let topDonor = null;
    let topDonorConfigured = Boolean(process.env.TEBEX_CHECKOUT_API_KEY);
    if (topDonorConfigured) {
      try {
        const [store, apiKey] = await Promise.all([
          getJson(accountUrl),
          Promise.resolve(process.env.TEBEX_CHECKOUT_API_KEY.trim())
        ]);
        if (!store?.id || !apiKey) throw new Error('Tebex checkout credentials are incomplete.');
        const authorization = Buffer.from(`${store.id}:${apiKey}`).toString('base64');
        const customer = await getJson(`${accountUrl}/top-customers?period=none`, {
          headers: { Authorization: `Basic ${authorization}` }
        });
        if (customer && typeof customer.username === 'string' && Number.isFinite(Number(customer.total))) {
          topDonor = {
            username: customer.username.slice(0, 80),
            total: Number(customer.total),
            currency: typeof customer.currency === 'string' ? customer.currency.slice(0, 3) : ''
          };
        }
      } catch (error) {
        console.error('[api/donations] Failed to load all-time top customer', error instanceof Error ? error.message : String(error));
        topDonorConfigured = false;
      }
    }

    return json({ topDonor, topDonorConfigured, recentPayments }, 200, cacheHeaders);
  } catch (error) {
    console.error('[api/donations] Failed to load Tebex storefront data', error instanceof Error ? error.message : String(error));
    return json({ error: 'Tebex-betalingen konden niet worden geladen.' }, 502, { 'Cache-Control': 'no-store' });
  }
}

export default vercelHandler(handler);
