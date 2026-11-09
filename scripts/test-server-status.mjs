import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const originalEnv = {
  host: process.env.FIVEM_SERVER_HOST,
  port: process.env.FIVEM_SERVER_PORT,
  code: process.env.CFX_JOIN_CODE
};
const calls = [];

try {
  delete process.env.FIVEM_SERVER_HOST;
  delete process.env.FIVEM_SERVER_PORT;
  delete process.env.CFX_JOIN_CODE;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ Data: { clients: 7, sv_maxclients: 64, hostname: 'Heerlen' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  const { default: handler } = await import('../api/players.mjs');
  let response = await handler(new Request('https://site.test/api/players?host=127.0.0.1&code=attacker'));
  let data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.online, true);
  assert.equal(data.clients, 7);
  assert.equal(calls[0], 'https://frontend.cfx-services.net/api/servers/single/5oayqbr', 'Browser query parameters must not select a host or CFX code');

  calls.length = 0;
  process.env.FIVEM_SERVER_HOST = 'status.example.net';
  process.env.FIVEM_SERVER_PORT = '30125';
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ clients: 12, sv_maxclients: 64, hostname: 'Heerlen direct' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  response = await handler(new Request('https://site.test/api/players?host=127.0.0.1'));
  data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.online, true);
  assert.equal(data.clients, 12);
  assert.deepEqual(calls, ['http://status.example.net:30125/dynamic.json'], 'Direct status must use only server-side host and port configuration');

  delete process.env.FIVEM_SERVER_HOST;
  delete process.env.FIVEM_SERVER_PORT;
  calls.length = 0;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).startsWith('https://frontend.cfx-services.net/')) {
      return new Response(JSON.stringify({ Data: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (String(url).startsWith('https://cfx.re/join/')) {
      return new Response(null, {
        status: 302,
        headers: { 'x-citizenfx-url': 'http://status.example.net:30120/' }
      });
    }
    return new Response(JSON.stringify({ clients: 0, sv_maxclients: 64, hostname: 'Heerlen zero players' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  response = await handler(new Request('https://site.test/api/players'));
  data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.online, true, 'An empty listing should still check the join endpoint for an online server with zero players');
  assert.equal(data.clients, 0);
  assert.equal(data.max, 64);
  assert.deepEqual(calls, [
    'https://frontend.cfx-services.net/api/servers/single/5oayqbr',
    'https://cfx.re/join/5oayqbr',
    'http://status.example.net:30120/dynamic.json'
  ]);

  globalThis.fetch = async () => { throw new Error('upstream unavailable'); };
  response = await handler(new Request('https://site.test/api/players'));
  data = await response.json();
  assert.equal(response.status, 502);
  assert.equal(data.online, null, 'An upstream error must not be reported as offline');

  response = await handler(new Request('https://site.test/api/players', { method: 'POST' }));
  assert.equal(response.status, 405);
  console.log('Server status checks passed: safe CFX fallback, configured direct host, offline and unknown states, and GET-only behavior.');
} finally {
  globalThis.fetch = originalFetch;
  if (originalEnv.host === undefined) delete process.env.FIVEM_SERVER_HOST;
  else process.env.FIVEM_SERVER_HOST = originalEnv.host;
  if (originalEnv.port === undefined) delete process.env.FIVEM_SERVER_PORT;
  else process.env.FIVEM_SERVER_PORT = originalEnv.port;
  if (originalEnv.code === undefined) delete process.env.CFX_JOIN_CODE;
  else process.env.CFX_JOIN_CODE = originalEnv.code;
}
