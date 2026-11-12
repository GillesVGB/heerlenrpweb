(function (root) {
  var SESSION_KEY = "heerlenrp_cfx_session";
  var LOGIN_KEY = "heerlenrp_cfx_login";
  var NAME_KEY = "heerlenrp_name";

  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
    catch (e) { return null; }
  }

  function saveSession(data) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    if (data && data.name) localStorage.setItem(NAME_KEY, data.name);
    root.dispatchEvent(new Event("heerlen:auth"));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    root.dispatchEvent(new Event("heerlen:auth"));
  }

  function avatarUrl(name) {
    var n = String(name || "speler").trim().toLowerCase().replace(/\s+/g, "-");
    var base = document.body.getAttribute("data-base") || "./";
    return base + "api/avatar?name=" + encodeURIComponent(n);
  }

  function showToast(text) {
    var el = document.getElementById("authToast") || document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    el.classList.add("is-on");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      el.classList.remove("is-on");
      setTimeout(function () { el.hidden = true; }, 280);
    }, 2200);
  }

  function ensureToast() {
    if (document.getElementById("authToast")) return;
    var el = document.createElement("div");
    el.id = "authToast";
    el.className = "auth-toast";
    el.setAttribute("role", "status");
    el.hidden = true;
    document.body.appendChild(el);
  }

  function ensurePurchases() {
    if (document.getElementById("purchasesShade")) return;
    var shade = document.createElement("div");
    shade.className = "shade";
    shade.id = "purchasesShade";
    shade.hidden = true;
    var panel = document.createElement("aside");
    panel.className = "purchases-drawer";
    panel.id = "purchasesDrawer";
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML =
      '<header class="purchases-head">' +
      "<div><p class=\"kicker\">Account</p><h2>Mijn aankopen</h2></div>" +
      '<button type="button" class="buy-close" id="purchasesClose" aria-label="Sluiten">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
      "</button></header>" +
      '<div class="purchases-body" id="purchasesBody"></div>';
    document.body.appendChild(shade);
    document.body.appendChild(panel);
    shade.addEventListener("click", closePurchases);
    document.getElementById("purchasesClose").addEventListener("click", closePurchases);
  }

  function openPurchases() {
    ensurePurchases();
    var s = session();
    var body = document.getElementById("purchasesBody");
    var pays = [];
    try { pays = JSON.parse(localStorage.getItem("heerlenrp_pays_v2") || "[]"); } catch (e) {}
    var mine = (pays || []).filter(function (p) {
      return s && p && String(p.name || "").toLowerCase() === String(s.name || "").toLowerCase();
    }).slice().reverse();
    body.innerHTML = mine.length
      ? '<ul class="purchases-list">' + mine.map(function (p) {
          return "<li><div><strong>" + esc(p.item) + "</strong><small>" + esc(p.name) + "</small></div>" +
            "<span>" + (window.HeerlenCatalog ? HeerlenCatalog.money(p.amount) : ("€" + Number(p.amount).toFixed(2))) + "</span></li>";
        }).join("") + "</ul>"
      : '<p class="hint">Nog geen aankopen gekoppeld aan dit Cfx.re-account op deze site.</p>';
    document.getElementById("purchasesShade").hidden = false;
    var drawer = document.getElementById("purchasesDrawer");
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    closeMenu();
  }

  function closePurchases() {
    var shade = document.getElementById("purchasesShade");
    var drawer = document.getElementById("purchasesDrawer");
    if (shade) shade.hidden = true;
    if (drawer) {
      drawer.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
    }
  }

  function closeMenu() {
    var menu = document.getElementById("authMenu");
    var btn = document.getElementById("authUser");
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function renderAuth() {
    var wrap = document.getElementById("authWrap");
    if (!wrap) return;
    var s = session();
    if (!s || !s.name) {
      wrap.innerHTML =
        '<div class="auth-login-group">' +
        '<button type="button" class="auth-login" id="authLoginCfx" aria-label="Inloggen met Cfx.re" title="Inloggen met Cfx.re">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"></circle><path d="M5 21v-1.5a7 7 0 0 1 14 0V21"></path></svg>' +
        "Inloggen</button></div>";
      document.getElementById("authLoginCfx").addEventListener("click", function () { startLogin("fivem"); });
      return;
    }

    var av = esc(s.avatar || avatarUrl(s.name));
    var sub = s.discordId
      ? ("Discord ID · " + s.discordId)
      : (s.provider === "discord" ? "Discord-account" : "Cfx.re-account");
    wrap.innerHTML =
      '<div class="auth-box">' +
      '<button type="button" class="auth-user is-connected" id="authUser" aria-label="Account van ' + esc(s.name) + '" title="Account van ' + esc(s.name) + '" aria-expanded="false" aria-haspopup="true">' +
      '<img class="auth-avatar" src="' + av + '" alt="" width="28" height="28" onerror="this.src=\'' + esc((document.body.getAttribute("data-base") || "./") + "images/heerlen-mark.png") + '\'">' +
      "<span>" + esc(s.name) + "</span></button>" +
      '<div class="auth-menu" id="authMenu" hidden role="menu">' +
      '<div class="auth-menu-head">' +
      '<img class="auth-avatar lg" src="' + av + '" alt="" width="44" height="44" onerror="this.src=\'' + esc((document.body.getAttribute("data-base") || "./") + "images/heerlen-mark.png") + '\'">' +
      "<div><strong>" + esc(s.name) + "</strong><small>" + esc(sub) + "</small></div></div>" +
      '<div class="auth-menu-links">' +
      '<a class="auth-link" href="/dashboard/" role="menuitem">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg>' +
      "Inwonersdashboard</a>" +
      '<button type="button" class="auth-link" id="authPurchases" role="menuitem">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>' +
      "Mijn aankopen</button>" +
      '<button type="button" class="auth-link is-muted" id="authLogout" role="menuitem">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>' +
      "Uitloggen</button>" +
      "</div></div></div>";

    document.getElementById("authUser").addEventListener("click", function (e) {
      e.stopPropagation();
      var menu = document.getElementById("authMenu");
      var open = menu.hidden;
      menu.hidden = !open;
      this.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.getElementById("authPurchases").addEventListener("click", openPurchases);
    document.getElementById("authLogout").addEventListener("click", logout);
  }

  function mount() {
    ensureToast();
    var actions = document.querySelector(".nav-actions");
    if (!actions) return;

    // Connect-knop in header vervangen door Cfx-login
    var connect = actions.querySelector(".nav-login");
    if (connect) connect.remove();

    // Gebruik in de header overal dezelfde Discord-knop: Tebex-accountkoppeling.
    // De Discord-community blijft beschikbaar via het mobiele menu en de footers.
    actions.querySelectorAll(".nav-discord").forEach(function (link) { link.remove(); });

    if (!document.getElementById("authWrap")) {
      var wrap = document.createElement("div");
      wrap.id = "authWrap";
      wrap.className = "auth-wrap";
      var menu = document.getElementById("menuBtn");
      if (menu) actions.insertBefore(wrap, menu);
      else actions.appendChild(wrap);
    }
    renderAuth();
    syncCartName();
  }

  function syncCartName() {
    var s = session();
    var input = document.getElementById("payerName");
    var discord = document.getElementById("payerDiscord");
    if (input) {
      if (s && s.name) {
        input.value = s.name;
        input.readOnly = true;
        input.title = "Ingelogd";
      } else {
        input.readOnly = false;
        input.title = "";
      }
    }
    if (discord) {
      if (s && s.discordId) {
        discord.value = s.discordId;
        localStorage.setItem("heerlenrp_discord", s.discordId);
      }
    }
  }

  async function startLogin(provider) {
    var tebex = root.HeerlenTebex;
    if (!tebex) {
      showToast("Shop-login is niet beschikbaar.");
      return;
    }
    var btn = document.getElementById(provider === "discord" ? "authLoginDiscord" : "authLoginCfx");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Bezig…";
    }
    try {
      await tebex.startLogin(provider || "fivem");
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        renderAuth();
      }
      showToast(err && err.message ? err.message : "Inloggen mislukt");
    }
  }

  function logout() {
    clearSession();
    closeMenu();
    closePurchases();
    renderAuth();
    syncCartName();
    showToast("Je bent uitgelogd.");
  }

  async function handleReturn() {
    var params = new URLSearchParams(location.search);
    var mode = params.get("cfx");
    if (!mode) return;
    var tebex = root.HeerlenTebex;
    if (!tebex) return;

    if (mode === "cancel") {
      sessionStorage.removeItem(LOGIN_KEY);
      showToast("Inloggen geannuleerd");
    } else if (mode === "done" || mode === "resume") {
      try {
        var user = await tebex.finishLogin();
        if (user && user.name) {
          saveSession({
            name: user.name,
            id: user.id || "",
            discordId: user.discordId || "",
            provider: user.provider || "fivem",
            avatar: avatarUrl(user.name),
            at: Date.now()
          });
          if (user.discordId) localStorage.setItem("heerlenrp_discord", user.discordId);
          showToast("Welkom, " + user.name);
          renderAuth();
          syncCartName();
        } else {
          showToast("Inloggen niet gelukt");
        }
      } catch (err) {
        showToast(err && err.message ? err.message : "Inloggen mislukt");
      }
    }

    if (history.replaceState) {
      history.replaceState(null, "", location.pathname + location.hash);
    }
  }

  document.addEventListener("click", function (e) {
    if (!e.target.closest("#authWrap")) closeMenu();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeMenu();
      closePurchases();
    }
  });
  root.addEventListener("heerlen:auth", function () {
    renderAuth();
    syncCartName();
  });

  root.HeerlenAuth = {
    session: session,
    logout: logout,
    startLogin: startLogin,
    avatarUrl: avatarUrl,
    SESSION_KEY: SESSION_KEY,
    LOGIN_KEY: LOGIN_KEY
  };

  mount();
  handleReturn();
})(window);
