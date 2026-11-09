import { vercelHandler } from '../server/vercel-adapter.mjs';

async function handler(request) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } });
  }
  const username = new URL(request.url).searchParams.get('name') || '';
  if (!/^[a-z0-9_-]{2,40}$/i.test(username)) {
    return new Response(null, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const source = new URL(
    `https://forum.cfx.re/user_avatar/forum.cfx.re/${encodeURIComponent(username.toLowerCase())}/96/1.png`
  );
  try {
    const response = await fetch(source, {
      headers: { Accept: 'image/avif,image/webp,image/png,image/*;q=0.8', 'User-Agent': 'HeerlenRoleplayWeb/1.0' },
      signal: AbortSignal.timeout(7000)
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.startsWith('image/')) {
      return new Response(null, { status: response.status === 404 ? 404 : 502, headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
    }

    const image = await response.arrayBuffer();
    if (!image.byteLength || image.byteLength > 1_000_000) {
      return new Response(null, { status: 502, headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
    }
    return new Response(image, {
      status: 200,
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800', 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' }
    });
  } catch {
    return new Response(null, { status: 502, headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
  }
}

export default vercelHandler(handler);
