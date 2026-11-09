(function (root) {
  var PENDING_KEY = "heerlenrp_tebex_pending";
  var LOGIN_KEY = "heerlenrp_cfx_login";
  var API = "https://headless.tebex.io/api";
  var TEBEX_JS = "https://js.tebex.io/v/1.js";
  var loadPromise = null;
  var storeSettingsPromise = null;
  var eventsBound = false;

  function settings() {
    return root.HeerlenSettings ? root.HeerlenSettings.load() : {};
  }

  function token() {
    return String(settings().tebexToken || "").trim();
  }

  function packageIdFor(productId) {
    var map = settings().tebexPackages || {};
    var fromSettings = map[productId];
    if (fromSettings) return String(fromSettings).trim();
    var pack = root.HeerlenCatalog && root.HeerlenCatalog.pack(productId);
    return pack && pack.tebexId ? String(pack.tebexId).trim() : "";
  }

  function configured() {
    return !!token();
  }

  function loadStoreSettings() {
    if (storeSettingsPromise) return storeSettingsPromise;
    storeSettingsPromise = fetch("/api/content", { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("Winkelinstellingen konden niet worden geladen.");
      return response.json();
    }).then(function (data) {
      if (!data.storeSettings || typeof data.storeSettings !== "object") return settings();
      var current = settings();
      current.tebexToken = typeof data.storeSettings.tebexToken === "string" ? data.storeSettings.tebexToken : "";
      current.tebexPackages = Object.assign({}, current.tebexPackages || {}, data.storeSettings.tebexPackages || {});
      root.HeerlenSettings.save(current);
      return current;
    }).catch(function (error) {
      storeSettingsPromise = null;
      throw error;
    });
    return storeSettingsPromise;
  }

  function json(res) {
    return res.json().then(function (body) {
      if (!res.ok) {
        var msg = (body && (body.detail || body.title || body.message)) || ("Tebex fout " + res.status);
        throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
      return body;
    });
  }

  function createBasket(meta) {
    var t = token();
    // Geen username hier: FiveM/Universal stores geven
    // "You can't set the username for this game type".
    // Speler koppelen gebeurt via Cfx.re auth (+ username_id op packages).
    var payload = {
      complete_url: meta.completeUrl,
      cancel_url: meta.cancelUrl,
      complete_auto_redirect: true,
      custom: meta.custom || {}
    };

    return fetch(API + "/accounts/" + encodeURIComponent(t) + "/baskets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    }).then(json).then(function (body) { return body.data || body; });
  }

  function addPackage(basketIdent, packageId, quantity, variableData) {
    var body = {
      package_id: Number(packageId) || packageId,
      quantity: quantity || 1
    };
    if (variableData && typeof variableData === "object" && Object.keys(variableData).length) {
      body.variable_data = variableData;
    }
    return fetch(API + "/baskets/" + encodeURIComponent(basketIdent) + "/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    }).then(json).then(function (body) { return body.data || body; });
  }

  function getBasket(basketIdent) {
    var t = token();
    return fetch(API + "/accounts/" + encodeURIComponent(t) + "/baskets/" + encodeURIComponent(basketIdent), {
      headers: { Accept: "application/json" }
    }).then(json).then(function (body) { return body.data || body; });
  }

  function authLinks(basketIdent, returnUrl) {
    var t = token();
    var url = API + "/accounts/" + encodeURIComponent(t) + "/baskets/" + encodeURIComponent(basketIdent) +
      "/auth?returnUrl=" + encodeURIComponent(returnUrl);
    return fetch(url, { headers: { Accept: "application/json" } }).then(json);
  }

  function parseAuthLinks(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.data)) return res.data;
    if (res && Array.isArray(res.links)) return res.links;
    return [];
  }

  function savePending(data) {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(data));
  }

  function loadPending() {
    try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null"); }
    catch (e) { return null; }
  }

  function clearPending() {
    sessionStorage.removeItem(PENDING_KEY);
  }

  function pageBase() {
    return location.href.split("#")[0].split("?")[0];
  }

  function withQuery(url, params) {
    var u = new URL(url, location.href);
    Object.keys(params).forEach(function (k) {
      if (params[k] == null || params[k] === "") u.searchParams.delete(k);
      else u.searchParams.set(k, params[k]);
    });
    return u.toString();
  }

  function pickAuthUrl(links, prefer) {
    if (!Array.isArray(links) || !links.length) return "";
    var want = String(prefer || "fivem").toLowerCase();
    var scored = links.slice().sort(function (a, b) {
      function score(l) {
        var t = String(l.name || "") + " " + String(l.url || "");
        if (want === "discord" && /discord/i.test(t)) return 0;
        if (want !== "discord" && /fivem|cfx/i.test(t)) return 0;
        if (/fivem|cfx|discord/i.test(t)) return 1;
        return 2;
      }
      return score(a) - score(b);
    });
    return (scored[0] && scored[0].url) || "";
  }

  function normalizeDiscordId(value) {
    var id = String(value || "").trim().replace(/[^0-9]/g, "");
    if (id.length >= 16 && id.length <= 20) return id;
    return "";
  }

  function checkoutUrl(basket) {
    return basket && basket.links && (basket.links.checkout || basket.links.payment) || "";
  }

  function packageVariables(basket, meta) {
    var data = {};
    var uid = basket && (basket.username_id || basket.usernameId);
    if (uid != null && uid !== "") data.username_id = String(uid);
    var discordId = normalizeDiscordId(meta && meta.discordId);
    if (discordId) {
      data.discord_id = discordId;
      data.discordId = discordId;
    }
    return Object.keys(data).length ? data : null;
  }

  async function fillBasket(basketIdent, items, basket, meta) {
    var vars = packageVariables(basket, meta || {});
    var i;
    for (i = 0; i < items.length; i++) {
      await addPackage(basketIdent, items[i].packageId, items[i].quantity, vars);
    }
    return getBasket(basketIdent);
  }

  async function redirectAuth(ident, returnUrl, prefer) {
    var linksRes = await authLinks(ident, returnUrl);
    var list = parseAuthLinks(linksRes);
    var authUrl = pickAuthUrl(list, prefer || "fivem") || pickAuthUrl(list, "discord");
    if (!authUrl) throw new Error("Geen Cfx.re-loginlink. Zet FiveM/Cfx auth aan in Tebex.");
    location.href = authUrl;
    return { redirected: true };
  }

  function loadTebexJs() {
    if (root.Tebex && root.Tebex.checkout) return Promise.resolve();
    if (loadPromise) return loadPromise;
    loadPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = TEBEX_JS;
      script.async = true;
      var timer = setTimeout(function () {
        script.remove();
        loadPromise = null;
        reject(new Error("Tebex.js laden duurde te lang."));
      }, 15000);
      script.onload = function () {
        clearTimeout(timer);
        if (root.Tebex && root.Tebex.checkout) resolve();
        else {
          loadPromise = null;
          reject(new Error("Tebex.js niet beschikbaar."));
        }
      };
      script.onerror = function () {
        clearTimeout(timer);
        script.remove();
        loadPromise = null;
        reject(new Error("Tebex.js laden mislukt."));
      };
      document.head.appendChild(script);
    });
    return loadPromise;
  }

  function bindCheckoutEvents() {
    if (eventsBound || !root.Tebex || !root.Tebex.checkout || !root.Tebex.checkout.on) return;
    eventsBound = true;
    root.Tebex.checkout.on("payment:complete", function (event) {
      root.dispatchEvent(new CustomEvent("heerlen:tebex-complete", { detail: event || {} }));
    });
    root.Tebex.checkout.on("payment:error", function (event) {
      root.dispatchEvent(new CustomEvent("heerlen:tebex-error", { detail: event || {} }));
    });
    root.Tebex.checkout.on("close", function () {
      root.dispatchEvent(new Event("heerlen:tebex-close"));
    });
  }

  function themeForCheckout() {
    var t = document.documentElement.getAttribute("data-theme");
    if (t === "light" || t === "dark") return t;
    return "dark";
  }

  async function launchCheckout(ident, payUrl) {
    try {
      await loadTebexJs();
      bindCheckoutEvents();
      root.Tebex.checkout.init({
        ident: ident,
        theme: themeForCheckout(),
        locale: "nl_NL",
        closeOnPaymentComplete: true,
        colors: [
          { name: "primary", color: "#5aaefd" },
          { name: "secondary", color: "#4ade80" }
        ]
      });
      root.Tebex.checkout.launch();
      return { launched: true, ident: ident };
    } catch (err) {
      if (payUrl) {
        location.href = payUrl;
        return { redirected: true };
      }
      throw err;
    }
  }

  async function openCheckout(basket) {
    var ident = basket.ident || basket.id;
    var payUrl = checkoutUrl(basket);
    if (!ident) throw new Error("Checkout niet beschikbaar. Probeer opnieuw in te loggen met Cfx.re.");
    return launchCheckout(ident, payUrl);
  }

  async function startCheckout(items, meta) {
    await loadStoreSettings();
    if (!configured()) throw new Error("Tebex is nog niet ingesteld in admin.");
    if (!items.length) throw new Error("Je winkelmand is leeg.");
    var missing = items.filter(function (it) { return !it.packageId; });
    if (missing.length) {
      throw new Error("Koppel Tebex package-ID’s in admin voor: " + missing.map(function (m) { return m.name; }).join(", "));
    }

    var discordId = normalizeDiscordId(meta && meta.discordId);
    var username = String((meta && meta.username) || "").trim();
    if (username.length < 2) throw new Error("Vul je Cfx.re-spelersnaam in (zelfde als in FiveM).");

    // verplicht: eerst Cfx-login zodat Tebex {id} kan koppelen
    var auth = root.HeerlenAuth && root.HeerlenAuth.session && root.HeerlenAuth.session();
    if (!auth || !auth.name) {
      throw new Error("Log eerst in met Cfx.re (rechtsboven), daarna betalen.");
    }
    // gebruik de echte Cfx-naam uit de login-sessie
    username = String(auth.name).trim();

    var completeUrl = withQuery(pageBase(), { tebex: "done" });
    var cancelUrl = withQuery(pageBase(), { tebex: "cancel" });
    var resumeUrl = withQuery(pageBase(), { tebex: "resume" });

    var custom = {
      username: username,
      source: "heerlen-webstore"
    };
    if (discordId) {
      custom.discord_id = discordId;
      custom.discordId = discordId;
    }

    var basket = await createBasket({
      completeUrl: completeUrl,
      cancelUrl: cancelUrl,
      custom: custom
    });

    var ident = basket.ident || basket.id;
    if (!ident) throw new Error("Geen basket ontvangen van Tebex.");

    savePending({
      ident: ident,
      items: items,
      username: username,
      discordId: discordId || "",
      createdAt: Date.now()
    });

    // FiveM/Universal: speler koppelen via Cfx.re auth (niet via username op create)
    if (!(basket.username || basket.username_id)) {
      return redirectAuth(ident, resumeUrl, "fivem");
    }

    try {
      basket = await fillBasket(ident, items, basket, { discordId: discordId, username: username });
    } catch (err) {
      return redirectAuth(ident, resumeUrl, "fivem");
    }

    return openCheckout(basket);
  }

  async function resumeCheckout() {
    await loadStoreSettings();
    var pending = loadPending();
    if (!pending || !pending.ident) return false;
    var basket = await getBasket(pending.ident);

    if (!(basket.username || basket.username_id)) {
      return redirectAuth(pending.ident, withQuery(pageBase(), { tebex: "resume" }), "fivem");
    }

    try {
      basket = await fillBasket(pending.ident, pending.items || [], basket, {
        username: pending.username,
        discordId: pending.discordId
      });
    } catch (e) {
      basket = await getBasket(pending.ident);
    }

    return openCheckout(basket);
  }

  async function startLogin(provider) {
    await loadStoreSettings();
    if (!configured()) throw new Error("Tebex is nog niet ingesteld in admin.");
    var doneUrl = withQuery(pageBase(), { cfx: "done" });
    var cancelUrl = withQuery(pageBase(), { cfx: "cancel" });
    var resumeUrl = withQuery(pageBase(), { cfx: "resume" });

    var basket = await createBasket({
      completeUrl: doneUrl,
      cancelUrl: cancelUrl,
      custom: { source: "heerlen-login" }
    });
    var ident = basket.ident || basket.id;
    if (!ident) throw new Error("Geen basket ontvangen van Tebex.");

    sessionStorage.setItem(LOGIN_KEY, JSON.stringify({
      ident: ident,
      provider: provider || "fivem",
      createdAt: Date.now()
    }));

    return redirectAuth(ident, resumeUrl, provider || "fivem");
  }

  async function finishLogin() {
    await loadStoreSettings();
    var raw = sessionStorage.getItem(LOGIN_KEY);
    var pending = null;
    try { pending = JSON.parse(raw || "null"); } catch (e) {}
    if (!pending || !pending.ident) throw new Error("Geen open login-sessie.");
    var basket = await getBasket(pending.ident);
    var name = basket.username || basket.username_id || "";
    if (typeof name === "object" && name) name = name.username || name.name || "";
    name = String(name || "").trim();
    var discordId = normalizeDiscordId(
      (basket.custom && (basket.custom.discord_id || basket.custom.discordId)) ||
      basket.discord_id ||
      basket.discordId ||
      ""
    );
    if (!discordId && /^\d{16,20}$/.test(name)) discordId = name;
    if (!name && !discordId) throw new Error("Account niet gekoppeld. Probeer opnieuw.");
    sessionStorage.removeItem(LOGIN_KEY);
    return {
      name: name || ("Discord " + discordId),
      id: basket.username_id || basket.id || "",
      usernameId: basket.username_id || "",
      discordId: discordId,
      provider: pending.provider || (/^\d{16,20}$/.test(name) ? "discord" : "fivem")
    };
  }

  root.HeerlenTebex = {
    configured: configured,
    loadStoreSettings: loadStoreSettings,
    packageIdFor: packageIdFor,
    startCheckout: startCheckout,
    resumeCheckout: resumeCheckout,
    startLogin: startLogin,
    finishLogin: finishLogin,
    normalizeDiscordId: normalizeDiscordId,
    loadPending: loadPending,
    clearPending: clearPending,
    loadTebexJs: loadTebexJs,
    PENDING_KEY: PENDING_KEY,
    LOGIN_KEY: LOGIN_KEY
  };
})(window);
