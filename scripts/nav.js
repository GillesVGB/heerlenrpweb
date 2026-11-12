(function () {
  var THEME_KEY = "heerlenrp_theme";
  var nav = document.getElementById("nav");

  function applyTheme(theme) {
    var next = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "light" ? "#eef1f4" : "#0a1018");
    syncThemeBtn();
  }

  function currentTheme() {
    try {
      var saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (e) {}
    return "dark";
  }

  function syncThemeBtn() {
    var btn = document.getElementById("themeBtn");
    if (!btn) return;
    var light = currentTheme() === "light";
    btn.setAttribute("aria-label", light ? "Donkere modus" : "Lichte modus");
    btn.setAttribute("title", light ? "Donkere modus" : "Lichte modus");
    // maan = donker, zon = licht (icoon toont huidige modus)
    btn.innerHTML = light
      ? '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M18.9 5.1l-1.6 1.6M6.7 17.3l-1.6 1.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M16.2 3.4a8.8 8.8 0 1 0 4.4 15.4A9.2 9.2 0 0 1 16.2 3.4Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function ensureThemeBtn() {
    var actions = document.querySelector(".nav-actions");
    if (!actions || document.getElementById("themeBtn")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-btn";
    btn.id = "themeBtn";
    btn.addEventListener("click", function () {
      applyTheme(currentTheme() === "light" ? "dark" : "light");
    });
    var cart = document.getElementById("cartOpen");
    if (cart) actions.insertBefore(btn, cart);
    else actions.insertBefore(btn, actions.firstChild);
    syncThemeBtn();
  }

  function ensureDiscordLink() {
    var actions = document.querySelector(".nav-actions");
    if (!actions) return;
    var legacyLink = Array.from(actions.querySelectorAll(".nav-login")).find(function (candidate) { return /discord\.gg/i.test(candidate.href || ""); });
    if (legacyLink) legacyLink.className = "nav-discord";
    var link = actions.querySelector(".nav-discord");
    // The shop account widget already provides a single Discord sign-in button.
    // Do not add a second invite button beside it. The mobile menu still carries the invite.
    if (!link && actions.querySelector(".auth-wrap .auth-login.is-discord")) return;
    if (!link) {
      link = document.createElement("a");
      link.className = "nav-discord";
      link.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.7 5.1A18.4 18.4 0 0 0 15.2 3.7l-.6 1.2a16.8 16.8 0 0 0-5.2 0l-.6-1.2a18.4 18.4 0 0 0-4.5 1.4C1.5 9.3.7 13.4 1.1 17.4A18.5 18.5 0 0 0 6.7 20l1.2-2a11.7 11.7 0 0 1-1.9-.9l.5-.4a13.2 13.2 0 0 0 11 0l.5.4a11.7 11.7 0 0 1-1.9.9l1.2 2a18.5 18.5 0 0 0 5.6-2.6c.5-4.6-.8-8.7-3.2-12.3ZM8.8 14.7c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/></svg><span>Discord</span>';
      var menu = document.getElementById("menuBtn");
      actions.insertBefore(link, menu || null);
    }
    if (!link.querySelector("svg")) link.insertAdjacentHTML("afterbegin", '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.7 5.1A18.4 18.4 0 0 0 15.2 3.7l-.6 1.2a16.8 16.8 0 0 0-5.2 0l-.6-1.2a18.4 18.4 0 0 0-4.5 1.4C1.5 9.3.7 13.4 1.1 17.4A18.5 18.5 0 0 0 6.7 20l1.2-2a11.7 11.7 0 0 1-1.9-.9l.5-.4a13.2 13.2 0 0 0 11 0l.5.4a11.7 11.7 0 0 1-1.9.9l1.2 2a18.5 18.5 0 0 0 5.6-2.6c.5-4.6-.8-8.7-3.2-12.3ZM8.8 14.7c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/></svg>');
    if (!link.querySelector("span")) {
      Array.from(link.childNodes).forEach(function (node) { if (node.nodeType === 3) node.remove(); });
      var label = document.createElement("span");
      label.textContent = "Discord";
      link.appendChild(label);
    }
    link.href = "https://discord.gg/heerlenrp";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", "Open de Heerlen Roleplay Discord");
    link.classList.add("nav-discord-neutral");
  }

  function normalizeConnectLink() {
    var actions = document.querySelector(".nav-actions");
    if (!actions || document.body.classList.contains("admin-body")) return;
    var loggedIn = false;
    try { loggedIn = !!JSON.parse(localStorage.getItem("heerlenrp_cfx_session") || "null")?.name; } catch (e) {}
    if (loggedIn) {
      actions.querySelectorAll(".nav-login[data-join]").forEach(function (link) { link.remove(); });
      return;
    }
    var link = actions && (actions.querySelector(".nav-login[data-join]") || Array.from(actions.querySelectorAll(".nav-login")).find(function (candidate) {
      return /(?:cfx\.re|fivem\.net)/i.test(candidate.href || "");
    }));
    if (!link) {
      // The shop auth widget already renders the Cfx.re button with its user icon.
      if (actions.querySelector(".auth-wrap #authLoginCfx")) return;
      link = document.createElement("a");
      link.className = "nav-login";
      link.href = "https://cfx.re/join/5oayqbr";
      link.textContent = "Connect";
      actions.insertBefore(link, actions.querySelector(".nav-discord, #menuBtn") || null);
    }
    if (!link) return;
    link.setAttribute("data-join", "");
    link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"></circle><path d="M5 21v-1.5a7 7 0 0 1 14 0V21"></path></svg><span>Cfx.re</span>';
    link.setAttribute("aria-label", "Verbinden met Heerlen Roleplay via Cfx.re");
    link.setAttribute("title", "Verbinden via Cfx.re");
  }

  function ensureContentLinks() {
    var links = document.querySelector(".nav-links");
    if (!links) return;
    Array.from(links.querySelectorAll("a")).forEach(function (anchor) {
      if (anchor.closest(".nav-rules-menu")) return;
      try {
        var path = new URL(anchor.href, location.href).pathname.replace(/\/$/, "");
        if (path === "/regels.html" || path === "/regels") { anchor.href = "/regels/"; path = "/regels"; }
        var current = location.pathname.replace(/\/$/, "") || "/";
        var isHome = current === "/" && (path === "/" || anchor.getAttribute("href") === "#top");
        anchor.classList.toggle("is-active", isHome || (current !== "/" && path === current));
      } catch (e) {}
    });
    var order = [
      ["Home", "/"],
      ["Store", "/winkel/"],
      ["Regels", "/regels/"],
      ["FAQ", "/faq/"],
      ["Nieuws", "/nieuws/"],
      ["Updates", "/updates/"]
    ];
    function normPath(anchor) {
      try {
        var path = new URL(anchor.href, location.href).pathname.replace(/\/index\.html$/, "/").replace(/\/$/, "");
        return path === "/regels.html" ? "/regels" : path;
      } catch (e) { return null; }
    }
    // Staff hoort niet in de navigatiebalk; verwijder een eventuele oude link.
    Array.from(links.querySelectorAll("a")).forEach(function (anchor) {
      if (normPath(anchor) === "/staff") anchor.remove();
    });
    var rulesGroup = links.querySelector(".nav-rules-group");
    var ordered = order.map(function (item) {
      var target = item[1].replace(/\/$/, "");
      if (item[0] === "Regels" && rulesGroup) return rulesGroup;
      var anchor = Array.from(links.children).find(function (candidate) {
        return candidate.tagName === "A" && normPath(candidate) === target;
      });
      if (!anchor) {
        anchor = document.createElement("a");
        anchor.href = item[1];
        anchor.textContent = item[0];
        if (item[1] !== "/" && location.pathname.startsWith(item[1])) anchor.classList.add("is-active");
      }
      return anchor;
    });
    // Zet de zes hoofdlinks vooraan in vaste volgorde; mobiele extra's blijven erachter.
    for (var i = ordered.length - 1; i >= 0; i--) links.insertBefore(ordered[i], links.firstChild);
    if (!links.querySelector(".nav-mobile-discord")) {
      var discord = document.createElement("a");
      discord.className = "nav-mobile-discord";
      discord.href = "https://discord.gg/heerlenrp";
      discord.target = "_blank";
      discord.rel = "noopener noreferrer";
      discord.textContent = "Discord-community openen ↗";
      links.appendChild(discord);
    }
    var actions = document.querySelector(".nav-actions");
    var action = actions && actions.querySelector(".nav-login");
    if (action && !links.querySelector(".nav-mobile-action")) {
      var mobileAction = document.createElement("a");
      mobileAction.className = "nav-mobile-action";
      mobileAction.href = action.href;
      mobileAction.textContent = action.textContent.trim() || "Verbinden";
      if (action.target) mobileAction.target = action.target;
      if (action.rel) mobileAction.rel = action.rel;
      if (action.hasAttribute("data-join")) mobileAction.setAttribute("data-join", "");
      links.appendChild(mobileAction);
    }
  }

  function ensureRulesSubmenu() {
    var links = document.querySelector(".nav-links");
    if (!links || links.querySelector(".nav-rules-menu")) return;
    var rulesLink = Array.from(links.querySelectorAll("a")).find(function (anchor) {
      try { return new URL(anchor.href, location.href).pathname.replace(/\/$/, "") === "/regels"; } catch (e) { return false; }
    });
    if (!rulesLink) return;
    var group = document.createElement("div");
    group.className = "nav-rules-group";
    links.insertBefore(group, rulesLink);
    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "nav-rules-trigger";
    trigger.setAttribute("aria-label", "Open het regelsmenu");
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "nav-rules-menu");
    trigger.innerHTML = '<span>Regels</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    if (rulesLink.classList.contains("is-active")) {
      trigger.classList.add("is-active");
      trigger.setAttribute("aria-current", "page");
    }
    rulesLink.remove();
    group.appendChild(trigger);
    var submenu = document.createElement("div");
    submenu.className = "nav-rules-menu";
    submenu.id = "nav-rules-menu";
    submenu.setAttribute("aria-label", "APV-onderdelen");
    var items = [["APV", "apv"], ["Strafcategorieën", "sancties"], ["Algemene regels", "algemeen"], ["Discord-regels", "discord"]];
    items.forEach(function (item) {
      var link = document.createElement("a");
      link.href = "/regels/#" + item[1];
      link.textContent = item[0];
      link.dataset.page = item[1];
      if (location.pathname.indexOf("/regels") === 0 && location.hash.slice(1).split("/")[0] === item[1]) link.classList.add("is-current");
      submenu.appendChild(link);
    });
    if (document.body.classList.contains("apv-page")) {
      var label = document.createElement("div");
      label.className = "nav-rules-label";
      label.textContent = "APV-ONDERWERPEN";
      var topics = document.createElement("nav");
      topics.id = "topic-nav";
      topics.className = "nav-rules-topics";
      topics.setAttribute("aria-label", "APV-onderwerpen");
      submenu.append(label, topics);
    }
    var saved = document.createElement("a");
    saved.href = "/regels/#bewaard";
    saved.dataset.page = "bewaard";
    saved.innerHTML = 'Bewaarde artikelen <span class="nav-count" id="saved-count" hidden>0</span>';
    try {
      var bookmarks = JSON.parse(localStorage.getItem("heerlen-apv-bookmarks") || "[]");
      var savedCount = saved.querySelector("#saved-count");
      var count = Array.isArray(bookmarks) ? bookmarks.length : 0;
      savedCount.textContent = String(count);
      savedCount.hidden = count === 0;
    } catch (e) {}
    submenu.appendChild(saved);
    group.appendChild(submenu);
    function setOpen(open) {
      group.classList.toggle("is-open", open);
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
    }
    trigger.addEventListener("click", function () {
      setOpen(!group.classList.contains("is-open"));
    });
    trigger.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
        var firstItem = submenu.querySelector("a");
        if (firstItem) firstItem.focus();
      }
    });
    submenu.addEventListener("click", function (event) {
      if (event.target.closest("a")) setOpen(false);
    });
    document.addEventListener("click", function (event) {
      if (!group.contains(event.target)) setOpen(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && group.classList.contains("is-open")) {
        setOpen(false);
        trigger.focus();
      }
    });
  }

  function ensureSiteFooter() {
    var footer = Array.from(document.querySelectorAll("footer")).find(function (candidate) {
      return candidate.id !== "cartFoot" && !candidate.closest("#drawer") &&
        /(?:^|\s)(?:footer|content-footer|site-footer)(?:\s|$)/.test(candidate.className || "");
    });
    if (!footer || footer.dataset.sharedFooter === "true") return;
    footer.className = "footer";
    footer.setAttribute("aria-label", "Voettekst");
    footer.dataset.sharedFooter = "true";
    footer.innerHTML = `
      <div class="wrap">
        <div class="foot-grid">
          <div class="foot-brand">
            <a href="/" aria-label="Heerlen Roleplay home">
              <img src="/images/heerlen-logo.png" alt="">
              <span>Heerlen Roleplay</span>
            </a>
            <p>Een Nederlandse FiveM roleplay server met een toegankelijke economie, waar jij zelf het verhaal van de stad schrijft.</p>
          </div>
          <div class="foot-col">
            <h4>Navigatie</h4>
            <nav aria-label="Navigatie">
              <a href="/">Home</a>
              <a href="/winkel/">Store</a>
              <a href="/regels/">Regels</a>
              <a href="/faq/">FAQ</a>
              <a href="/nieuws/">Nieuws</a>
              <a href="/updates/">Serverupdates</a>
              <a data-join href="https://cfx.re/join/5oayqbr">Connect</a>
            </nav>
          </div>
          <div class="foot-col">
            <h4>Regelgeving</h4>
            <nav aria-label="Regelgeving">
              <a href="/regels/">Serverregels</a>
              <a href="/regels/#apv">APV</a>
              <a href="/regels.html#strafrecht">Wetboek van Strafrecht</a>
              <a href="/regels.html#strafvordering">Wetboek van Strafvordering</a>
            </nav>
          </div>
          <div class="foot-col">
            <h4>Discord</h4>
            <nav aria-label="Discord">
              <a href="https://discord.gg/heerlenrp" target="_blank" rel="noopener noreferrer">Heerlen Roleplay</a>
              <a href="https://discord.gg/heerlenrp" target="_blank" rel="noopener noreferrer">Support</a>
              <a href="/regels/">Regels lezen</a>
              <a data-join href="https://cfx.re/join/5oayqbr">Server joinen</a>
            </nav>
          </div>
        </div>
        <div class="foot-bottom">
          <p>© <span id="year">${new Date().getFullYear()}</span> Heerlen Roleplay. Alle rechten voorbehouden.</p>
          <p>Betalingen verlopen veilig via Tebex.</p>
        </div>
      </div>`;
    if (document.body.classList.contains("apv-page")) {
      var nav = footer.querySelector(".foot-bottom nav");
      if (!nav) {
        nav = document.createElement("nav");
        nav.setAttribute("aria-label", "Regelhulpmiddelen");
        footer.querySelector(".foot-bottom").appendChild(nav);
      }
      nav.insertAdjacentHTML("beforeend", '<button id="print-button" class="footer-print" type="button"><span data-icon="print"></span>Afdrukken / PDF</button>');
    }
  }

  function ensureSiteEffects() {
    if (document.body.classList.contains("admin-body") || /\/admin(?:\.html)?\/?$/.test(location.pathname)) return;
    if (document.querySelector('script[src*="/scripts/site-effects.js"]')) return;
    var stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/styles/site-effects.css?v=20261109-2";
    document.head.appendChild(stylesheet);
    var script = document.createElement("script");
    script.src = "/scripts/site-effects.js?v=20261109-2";
    script.async = true;
    document.body.appendChild(script);
  }

  function ensureMenuBehavior() {
    var button = document.getElementById("menuBtn");
    var links = document.getElementById("navLinks");
    if (!button || !links || button.dataset.menuBound === "true") return;
    button.dataset.menuBound = "true";

    function closeMenu(restoreFocus) {
      document.body.classList.remove("nav-open");
      button.setAttribute("aria-expanded", "false");
      var shade = document.getElementById("shade");
      if (shade) shade.hidden = !document.body.classList.contains("cart-open");
      if (restoreFocus) button.focus();
    }

    button.addEventListener("click", function () {
      var open = !document.body.classList.contains("nav-open");
      document.body.classList.toggle("nav-open", open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
      var shade = document.getElementById("shade");
      if (shade) shade.hidden = !open && !document.body.classList.contains("cart-open");
    });
    links.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeMenu(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && document.body.classList.contains("nav-open")) closeMenu(true);
    });
    window.matchMedia("(min-width: 981px)").addEventListener("change", function () { closeMenu(false); });

    var cart = document.getElementById("cartOpen");
    if (cart && !document.getElementById("drawer")) {
      cart.addEventListener("click", function () { location.href = "/winkel/"; });
    }
  }

  function arrangeNavActions() {
    var actions = document.querySelector(".nav-actions");
    if (!actions) return;
    var theme = actions.querySelector("#themeBtn");
    var cart = actions.querySelector("#cartOpen");
    var connect = actions.querySelector(".nav-login[data-join]");
    var discord = actions.querySelector(".nav-discord");
    if (theme && cart) cart.parentNode.insertBefore(theme, cart);
    if (connect && cart) cart.insertAdjacentElement("afterend", connect);
    if (discord && connect) connect.insertAdjacentElement("afterend", discord);
  }

  function startPlayerHistoryCollection() {
    if (!document.body || document.body.classList.contains("admin-body") ||
        document.body.dataset.page === "server-statistics") return;
    var script = document.createElement("script");
    script.src = "/scripts/player-history.js?v=20261112-1";
    script.async = true;
    document.head.appendChild(script);
  }

  applyTheme(currentTheme());
  ensureThemeBtn();
  ensureDiscordLink();
  normalizeConnectLink();
  ensureContentLinks();
  ensureRulesSubmenu();
  ensureSiteFooter();
  ensureMenuBehavior();
  ensureSiteEffects();
  arrangeNavActions();
  startPlayerHistoryCollection();

  if (!nav) return;

  function onScroll() {
    nav.classList.toggle("is-scrolled", window.scrollY > 40);
  }

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
})();
