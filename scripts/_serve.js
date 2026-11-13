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
  "/api/portal": "api/portal.mjs",
  "/api/fivem/link": "api/fivem/link.mjs",
  "/api/account": "api/account.mjs",
  "/api/community": "api/community.mjs",
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
function sendNotFound(res) {
  fs.readFile(path.join(root, "404.html"), function (err, page) {
    if (err) {
      console.error("Custom 404 page could not be read:", err.message);
      return send(res, 500, null, "Custom 404 page unavailable");
    }
    send(res, 404, types[".html"], page);
  });
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
        if (e2) return sendNotFound(res);
        send(res, 200, types[".html"], d);
      });
    }
    fs.readFile(f, function (e2, d) {
      if (e2) return sendNotFound(res);
      send(res, 200, types[path.extname(f)] || "application/octet-stream", d);
    });
  });
}).listen(Number(process.env.PORT) || 8765, "127.0.0.1", function () {
  const port = Number(process.env.PORT) || 8765;
  console.log("http://127.0.0.1:" + port);
  console.log("admin: http://127.0.0.1:" + port + "/admin");
  console.log("players api: /api/players");
});
