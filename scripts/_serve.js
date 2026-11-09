const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const { pathToFileURL } = require("url");
// Lees lokaal ingestelde waarden zonder ze naar stdout te schrijven.
try {
  const envText = fs.readFileSync(path.join(root, ".env.local"), "utf8");
  envText.split(/\r?\n/).forEach(function (line) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) return;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  });
} catch (_) {}

const apiModules = {
  "/api/admin": "api/admin.mjs",
  "/api/players": "api/players.mjs",
  "/api/content": "api/content.mjs",
  "/api/auth/discord": "api/auth/discord.mjs",
  "/api/auth/callback": "api/auth/callback.mjs"
};
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".webp": "image/webp"
};

function send(res, code, type, body, extra) {
  res.writeHead(code, Object.assign({
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  }, extra || {}));
  res.end(body);
}

function sendJson(res, code, obj) {
  send(res, code, types[".json"], JSON.stringify(obj));
}

const DEFAULT_SERVER_HOST = "185.228.81.117";
const DEFAULT_SERVER_PORT = "30120";

function sanitizeHost(host) {
  const h = String(host || "").trim();
  if (!/^[a-z0-9.-]+$/i.test(h)) return DEFAULT_SERVER_HOST;
  return h;
}

function sanitizePort(port) {
  const n = Number(port);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return DEFAULT_SERVER_PORT;
  return String(Math.floor(n));
}

async function fetchDynamic(base) {
  const dyn = await fetch(new URL("dynamic.json", base), {
    headers: { Accept: "application/json", "User-Agent": "HeerlenRoleplayWeb/1.0" },
    signal: AbortSignal.timeout(8000)
  });
  if (!dyn.ok) throw new Error("dynamic.json niet bereikbaar");
  const d = await dyn.json();
  return {
    clients: Number(d.clients) || 0,
    max: Number(d.sv_maxclients) || 0,
    hostname: d.hostname || "",
    source: "ingame"
  };
}

async function resolveServerUrl(code) {
  const join = await fetch("https://cfx.re/join/" + code, {
    redirect: "manual",
    headers: { "User-Agent": "HeerlenRoleplayWeb/1.0" }
  });
  const url = join.headers.get("x-citizenfx-url");
  if (!url) throw new Error("Geen server-URL voor join-code");
  return url.replace(/\/?$/, "/");
}

async function livePlayers(opts) {
  const host = sanitizeHost(opts.host);
  const port = sanitizePort(opts.port);
  const code = String(opts.code || "5oayqbr").replace(/[^a-z0-9]/gi, "");

  // 1) Direct vanaf server-IP (in-game)
  try {
    return await fetchDynamic("http://" + host + ":" + port + "/");
  } catch (_) {}

  // 2) CFX listing API
  if (code) {
    try {
      const r = await fetch("https://frontend.cfx-services.net/api/servers/single/" + code, {
        headers: { Accept: "application/json", "User-Agent": "HeerlenRoleplayWeb/1.0" },
        signal: AbortSignal.timeout(8000)
      });
      if (r.ok) {
        const body = await r.json();
        const d = body && body.Data ? body.Data : {};
        const clients = Number(d.clients);
        const max = Number(d.sv_maxclients || d.svMaxclients);
        if (Number.isFinite(clients)) {
          return {
            clients,
            max: Number.isFinite(max) ? max : 0,
            hostname: d.hostname || "",
            source: "cfx-listing"
          };
        }
      }
    } catch (_) {}

    // 3) Join-code → dynamic.json
    try {
      const base = await resolveServerUrl(code);
      return await fetchDynamic(base);
    } catch (_) {}
  }

  throw new Error("Server niet bereikbaar op " + host + ":" + port);
}

http.createServer(function (req, res) {
  const raw = req.url || "/";
  const parsed = new URL(raw, "http://127.0.0.1");
  let u;
  try { u = decodeURIComponent(parsed.pathname); }
  catch (_) { return send(res, 400, null, "invalid path"); }

  if (apiModules[u]) {
    return (async function () {
      try {
        const route = await import(pathToFileURL(path.join(root, apiModules[u])).href);
        let body;
        if (req.method !== "GET" && req.method !== "HEAD") {
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 4_300_000) return sendJson(res, 413, { error: "De aanvraag is te groot." });
            chunks.push(chunk);
          }
          body = Buffer.concat(chunks);
        }
        const protocol = req.headers["x-forwarded-proto"] || "http";
        const host = req.headers.host || "127.0.0.1:8765";
        const request = new Request(protocol + "://" + host + raw, {
          method: req.method,
          headers: req.headers,
          body
        });
        const response = await route.default(request);
        const headers = {};
        response.headers.forEach(function (value, key) { headers[key] = value; });
        if (typeof response.headers.getSetCookie === "function") headers["Set-Cookie"] = response.headers.getSetCookie();
        const responseBody = Buffer.from(await response.arrayBuffer());
        res.writeHead(response.status, headers);
        res.end(responseBody);
      } catch (error) {
        console.error("API route failed:", u, error && error.message || error);
        sendJson(res, 500, { error: "Lokale API-fout. Controleer dependencies en serverconfiguratie." });
      }
    })();
  }

  if (u === "/api/players") {
    return livePlayers({
      host: parsed.searchParams.get("host") || DEFAULT_SERVER_HOST,
      port: parsed.searchParams.get("port") || DEFAULT_SERVER_PORT,
      code: parsed.searchParams.get("code") || "5oayqbr"
    })
      .then(function (data) { sendJson(res, 200, data); })
      .catch(function (err) { sendJson(res, 502, { error: String(err && err.message || err) }); });
  }

  // /admin en /admin/ tonen admin.html. Geen redirect: Vercel stuurt /admin/ terug naar /admin.
  if (u === "/admin" || u === "/admin/" || u === "/admin.html") {
    u = "/admin.html";
  }

  if (u.endsWith("/")) u += "index.html";
  if (u === "/") u = "/index.html";
  const f = path.normalize(path.join(root, u));
  const relative = path.relative(root, f);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return send(res, 403, null, "forbidden");
  fs.stat(f, function (err, st) {
    if (!err && st.isDirectory()) {
      return fs.readFile(path.join(f, "index.html"), function (e2, d) {
        if (e2) return send(res, 404, null, "404");
        send(res, 200, types[".html"], d);
      });
    }
    fs.readFile(f, function (e2, d) {
      if (e2) return send(res, 404, null, "404 " + u);
      send(res, 200, types[path.extname(f)] || "application/octet-stream", d);
    });
  });
}).listen(Number(process.env.PORT) || 8765, "127.0.0.1", function () {
  const port = Number(process.env.PORT) || 8765;
  console.log("http://127.0.0.1:" + port);
  console.log("admin: http://127.0.0.1:" + port + "/admin");
  console.log("players api: /api/players?host=185.228.81.117&port=30120");
});
