import { Readable } from 'node:stream';

// Bridge Vercel's Node API function contract to the Web Request/Response
// handlers used throughout this project.
export function vercelHandler(webHandler) {
  return async function handler(req, res) {
    if (req instanceof Request) return webHandler(req);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers || {})) {
      if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
      else if (value != null) headers.set(name, String(value));
    }
    const host = headers.get('x-forwarded-host') || headers.get('host') || 'localhost';
    const protocol = (headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
    const url = new URL(req.url || '/', `${protocol}://${host}`);
    const method = String(req.method || 'GET').toUpperCase();
    const init = { method, headers };
    if (method !== 'GET' && method !== 'HEAD') { init.body = Readable.toWeb(req); init.duplex = 'half'; }
    try {
      const response = await webHandler(new Request(url, init));
      res.statusCode = response.status;
      response.headers.forEach((value, name) => { if (name.toLowerCase() !== 'set-cookie') res.setHeader(name, value); });
      for (const cookie of response.headers.getSetCookie?.() || []) res.appendHeader('Set-Cookie', cookie);
      if (!response.body) return res.end();
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error('Vercel API adapter failed:', error);
      if (res.headersSent) return res.end();
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ error: 'De server kon het verzoek niet verwerken.' }));
    }
  };
}
