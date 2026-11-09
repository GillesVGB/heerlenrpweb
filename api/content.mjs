import { readContent, publicContent } from '../server/content-store.mjs';
import { badMethod, json } from '../server/http.mjs';
import { vercelHandler } from '../server/vercel-adapter.mjs';

async function handler(request) {
  if (request.method !== 'GET') return badMethod('GET');
  try {
    const state = await readContent();
    return json(publicContent(state), 200, { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60' });
  } catch (error) {
    return json({ error: 'Gedeelde inhoud is tijdelijk niet beschikbaar.' }, 503);
  }
}

export default vercelHandler(handler);
