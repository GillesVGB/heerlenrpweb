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
  assert.equal(calls[0], 'https://frontend.cfx-services.net/api/servers/single/j48ry5k', 'Browser query parameters must not select a host or CFX code');

  calls.length = 0;
  process.env.CFX_JOIN_CODE = '5oayqbr';
  response = await handler(new Request('https://site.test/api/players'));
  data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls[0], 'https://frontend.cfx-services.net/api/servers/single/j48ry5k', 'The stale legacy join code must not override the current default');

  calls.length = 0;
  process.env.CFX_JOIN_CODE = 'custom123';
  response = await handler(new Request('https://site.test/api/players'));
  data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls[0], 'https://frontend.cfx-services.net/api/servers/single/custom123', 'An explicitly configured current join code should remain supported');

  calls.length = 0;
  delete process.env.CFX_JOIN_CODE;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ Data: { clients: 0, sv_maxclients: 64, hostname: 'Heerlen Roleplay' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  response = await handler(new Request('https://site.test/api/players'));
  data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.online, true, 'A reachable server with zero players is still online');
  assert.equal(data.clients, 0);
  assert.equal(data.max, 64);
  assert.equal(calls[0], 'https://frontend.cfx-services.net/api/servers/single/j48ry5k');

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

  globalThis.fetch = async () => new Response(JSON.stringify({ Data: null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
  response = await handler(new Request('https://site.test/api/players'));
  data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.online, false, 'An explicit empty CFX listing should be represented as offline');

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
