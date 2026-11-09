(function () {
  var cfg = window.HeerlenSettings;
  if (!cfg) return;

  var gate = document.getElementById("gate");
  var board = document.getElementById("board");
  var notesEl = document.getElementById("notes");
  var toast = document.getElementById("toast");
  var state = cfg.load();
  var currentUser = null;
  var siteSettingsDirty = false;
  var timer;

  function show(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    void toast.offsetWidth;
    toast.classList.add("is-on");
    clearTimeout(timer);
    timer = setTimeout(function () {
      toast.classList.remove("is-on");
      toast.hidden = true;
    }, 2600);
  }

  function api(body) {
    return fetch("/api/admin", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        j.status = r.status;
        return j;
      });
    });
  }

  function loginError(msg) {
    var el = document.getElementById("loginError");
    if (el) { el.textContent = msg; el.hidden = !msg; }
    if (msg) show(msg);
  }

  function canOpenAdmin(user) {
    var permissions = user && Array.isArray(user.permissions) ? user.permissions : [];
    return permissions.indexOf("admin:site") >= 0 || permissions.indexOf("news:write") >= 0 || permissions.indexOf("changelog:write") >= 0 || permissions.indexOf("staff:write") >= 0 || permissions.indexOf("rules:write") >= 0;
  }

  function openBoard(user) {
    currentUser = user || null;
    gate.hidden = true;
    board.hidden = false;
    var title = board.querySelector(".admin-head h1");
    if (title && user && !user.permissions.includes("admin:site")) title.textContent = "Berichten beheren";
    fillForms();
    renderNotes();
    window.dispatchEvent(new CustomEvent("heerlen:admin-ready"));
  }

  function fillForms() {
    var s = state;
    document.querySelectorAll("#siteForm [name], #playersForm [name], #toastForm [name], #tebexForm [name], #shopPromoForm [name]").forEach(function (el) {
      var key = el.name;
      if (!(key in s)) return;
      if (key === "seasonPages") return;
      if (el.type === "checkbox") el.checked = !!s[key];
      else el.value = s[key];
    });
    var pages = Array.isArray(s.seasonPages) ? s.seasonPages : ["home", "news", "updates", "staff", "rules", "shop"];
    document.querySelectorAll('#siteForm [name="seasonPages"]').forEach(function (el) { el.checked = pages.indexOf(el.value) >= 0; });
    renderTebexPackages();
    renderShopProducts();
    updateSeasonPreview();
  }

  function tebexCommand(amount) {
    return "givecoins {id} " + amount + " {transaction} {username}";
  }

  function renderTebexPackages() {
    var packs = ((window.HeerlenCatalog && window.HeerlenCatalog.PACKS) || []).map(function (pack) {
      return Object.assign({}, pack, (state.shopProducts || {})[pack.id] || {});
    });
    var map = state.tebexPackages || {};
    var list = document.getElementById("tebexCmdList");
    if (list) {
      list.innerHTML = packs.map(function (p) {
        var amt = Number(p.amount) || 0;
        var cmd = tebexCommand(amt);
        return '<div class="tebex-cmd-row">' +
          '<strong>' + esc(p.name) + '</strong>' +
          '<code>' + esc(cmd) + '</code>' +
          '<button type="button" class="btn btn-ghost tebex-copy" data-copy="' + esc(cmd) + '">Kopieer</button>' +
          "</div>";
      }).join("") +
        '<button type="button" class="btn btn-blue" id="copyAllTebexCmds">Alles kopiëren</button>';
      list.querySelectorAll("[data-copy]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var text = btn.getAttribute("data-copy") || "";
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { show("Command gekopieerd"); }).catch(function () {});
          }
        });
      });
      var allBtn = document.getElementById("copyAllTebexCmds");
      if (allBtn) {
        allBtn.addEventListener("click", function () {
          var block = packs.map(function (p) {
            return p.name + "\n" + tebexCommand(Number(p.amount) || 0);
          }).join("\n\n");
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(block).then(function () { show("Alle commands gekopieerd"); }).catch(function () {});
          }
        });
      }
    }
    var box = document.getElementById("tebexPackages");
    if (!box) return;
    box.innerHTML = packs.map(function (p) {
      var amt = Number(p.amount) || 0;
      var cmd = tebexCommand(amt);
      return '<label><span>' + esc(p.name) + ' <code>' + esc(p.id) + '</code></span>' +
        '<input data-tebex-pack="' + esc(p.id) + '" type="text" inputmode="numeric" placeholder="Tebex package ID" value="' + esc(map[p.id] || "") + '">' +
        '<small class="tebex-cmd"><code>' + esc(cmd) + '</code></small></label>';
    }).join("");
  }

  function renderShopProducts() {
    var box = document.getElementById("shopProducts");
    var catalog = window.HeerlenCatalog;
    if (!box || !catalog) return;
    var overrides = state.shopProducts || {};
    box.innerHTML = catalog.PACKS.map(function (pack) {
      var item = overrides[pack.id] || {};
      return '<fieldset class="shop-product-row" data-shop-product="' + esc(pack.id) + '">' +
        '<legend>' + esc(pack.name) + '</legend>' +
        '<label><span>Productnaam</span><input data-shop-field="name" maxlength="60" value="' + esc(item.name || pack.name) + '"></label>' +
        '<label><span>Omschrijving</span><textarea data-shop-field="blurb" rows="2" maxlength="240">' + esc(item.blurb || pack.blurb) + '</textarea></label>' +
        '<div class="shop-product-fields"><label><span>Coins</span><input data-shop-field="amount" type="number" min="1" max="100000" value="' + esc(item.amount || pack.amount) + '"></label>' +
        '<label><span>Bonus (%)</span><input data-shop-field="bonus" type="number" min="0" max="10000" value="' + esc(item.bonus == null ? pack.bonus : item.bonus) + '"></label></div>' +
        '</fieldset>';
    }).join("");
  }

  function readForms() {
    var next = cfg.clone(state);
    document.querySelectorAll("#siteForm [name], #playersForm [name], #toastForm [name], #tebexForm [name], #shopPromoForm [name]").forEach(function (el) {
      var key = el.name;
      if (key === "seasonPages") return;
      if (el.type === "checkbox") next[key] = el.checked;
      else if (el.type === "number") next[key] = Number(el.value) || 0;
      else next[key] = el.value.trim();
    });
    next.seasonPages = Array.prototype.map.call(document.querySelectorAll('#siteForm [name="seasonPages"]:checked'), function (el) { return el.value; });
    next.notifications = readNotes();
    next.tebexPackages = next.tebexPackages || {};
    document.querySelectorAll("[data-tebex-pack]").forEach(function (el) {
      next.tebexPackages[el.getAttribute("data-tebex-pack")] = el.value.trim();
    });
    next.shopProducts = next.shopProducts || {};
    document.querySelectorAll("[data-shop-product]").forEach(function (row) {
      var id = row.getAttribute("data-shop-product");
      var product = {};
      row.querySelectorAll("[data-shop-field]").forEach(function (field) {
        var key = field.getAttribute("data-shop-field");
        product[key] = field.type === "number" ? Number(field.value) : field.value.trim();
      });
      next.shopProducts[id] = product;
    });
    return next;
  }

  function readNotes() {
    return Array.prototype.map.call(notesEl.querySelectorAll(".note-row"), function (row) {
      return {
        id: row.getAttribute("data-id") || cfg.uid(),
        enabled: row.querySelector(".on").checked,
        name: row.querySelector('[data-k="name"]').value.trim(),
        item: row.querySelector('[data-k="item"]').value.trim()
      };
    }).filter(function (n) { return n.name && n.item; });
  }

  function renderNotes() {
    notesEl.innerHTML = (state.notifications || []).map(function (n) {
      return '<div class="note-row" data-id="' + n.id + '">' +
        '<input class="on" type="checkbox"' + (n.enabled !== false ? " checked" : "") + ' title="Aan/uit">' +
        '<input data-k="name" type="text" maxlength="24" value="' + esc(n.name) + '" placeholder="Speler">' +
        '<input data-k="item" type="text" maxlength="40" value="' + esc(n.item) + '" placeholder="Product">' +
        '<button type="button" class="kill" data-del>Weg</button>' +
        "</div>";
    }).join("") || '<p class="hint">Nog geen meldingen. Voeg er een toe.</p>';
  }

  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var saveTimer;

  var sharedSettingsKeys = ["promoEnabled", "promoMode", "promoBonus", "promoText", "promoCta", "heroTitle", "heroLead", "seasonEnabled", "seasonTheme", "seasonAccentEnabled", "seasonAccent", "seasonEffects", "seasonIntensity", "seasonSpeed", "seasonDensity", "seasonFrequency", "seasonPages", "seasonStart", "seasonEnd", "maintenanceEnabled", "maintenanceMessage"];

  function saveSharedSiteSettings() {
    var permissions = currentUser && Array.isArray(currentUser.permissions) ? currentUser.permissions : [];
    if (permissions.indexOf("admin:site") < 0) { show("Alleen een sitebeheerder kan website- en winkelinstellingen publiceren."); return; }
    var settings = {};
    sharedSettingsKeys.forEach(function (key) { settings[key] = state[key]; });
    settings.tebexToken = state.tebexToken;
    settings.tebexPackages = state.tebexPackages;
    settings.shopProducts = state.shopProducts;
    api({ action: "save-site-settings", settings: settings }).then(function (result) {
      if (result.ok) { siteSettingsDirty = false; show("Website- en winkelinstellingen gepubliceerd voor alle bezoekers"); }
      else show(result.error || "De website- en winkelinstellingen konden niet gedeeld worden.");
    }).catch(function () { show("De gedeelde opslag is niet bereikbaar. Het concept staat alleen in deze browser."); });
  }

  function persist(msg, quiet, publishSite) {
    state = readForms();
    if (state.tebexPackages) {
      delete state.tebexPackages["supporter-goud"];
      delete state.tebexPackages["supporter-zilver"];
    }
    cfg.save(state);
    if (publishSite) { saveSharedSiteSettings(); return; }
    if (!quiet) show(siteSettingsDirty ? "Concept lokaal bewaard — klik Opslaan om het voor iedereen te publiceren." : (msg || "Opgeslagen"));
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { persist("Automatisch opgeslagen", false); }, 450);
  }

  function bindAutoSave() {
    var root = document.getElementById("board");
    if (!root || root.dataset.autosave === "1") return;
    root.dataset.autosave = "1";
    root.addEventListener("input", function (e) {
      if (!e.target.closest("input, textarea, select")) return;
      if (e.target.closest("#siteForm, #tebexForm, #shopPromoForm, #shopProducts")) siteSettingsDirty = true;
      if (e.target.closest("#siteForm")) updateSeasonPreview();
      scheduleSave();
    });
    root.addEventListener("change", function (e) {
      if (!e.target.closest("input, textarea, select")) return;
      if (e.target.closest("#siteForm, #tebexForm, #shopPromoForm, #shopProducts")) siteSettingsDirty = true;
      if (e.target.closest("#siteForm")) updateSeasonPreview();
      scheduleSave();
    });
  }

  document.getElementById("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var pass = document.getElementById("pass").value;
    loginError("");
    api({ action: "password-login", password: pass }).then(function (res) {
      if (res.ok && canOpenAdmin(res.user)) {
        sessionStorage.removeItem(cfg.PASS_KEY);
        document.getElementById("pass").value = "";
        hydrateSharedSettings(res.user).then(function () { openBoard(res.user); bindAutoSave(); });
      } else if (res.status === 404) {
        loginError("De beheer-API ontbreekt in deze installatie.");
      } else if (res.status === 500) {
        loginError(res.error || "Serverfout: zet ADMIN_PASSWORD in Vercel en deploy opnieuw.");
      } else {
        loginError(res.error || "Onvoldoende beheerrechten");
      }
    }).catch(function () { loginError("Kan de server niet bereiken"); });
  });

  document.getElementById("logout").addEventListener("click", function () {
    api({ action: "logout" }).catch(function () {});
    sessionStorage.removeItem(cfg.PASS_KEY);
    board.hidden = true;
    gate.hidden = false;
  });

  document.getElementById("saveAll").addEventListener("click", function () { persist("", true, true); });
  var refreshSales = document.getElementById("refreshTebexSales");
  if (refreshSales) refreshSales.addEventListener("click", function () {
    var status = document.getElementById("tebexSalesStatus");
    status.textContent = "Tebex-sales ophalen…";
    if (!window.HeerlenTebex || !window.HeerlenTebex.loadActiveSales) {
      status.textContent = "Tebex-koppeling is niet beschikbaar.";
      return;
    }
    window.HeerlenTebex.loadStoreSettings().then(function () {
      if (!window.HeerlenTebex.configured()) {
        status.textContent = "Vul eerst de publieke Tebex-token in en klik op Opslaan.";
        return null;
      }
      return window.HeerlenTebex.loadActiveSales(true);
    }).then(function (sales) {
      if (!sales) return;
      status.textContent = sales.length
        ? sales.map(function (sale) {
          var discount = sale.discount || {};
          var label = discount.type === "percentage" ? Math.round(Number(discount.percentage)) + "% KORTING" : sale.name;
          var minimum = (sale.requirements || []).find(function (requirement) { return requirement.type === "minimum_basket_value" && requirement.currency === "EUR"; });
          return sale.name + " — " + label + (minimum ? " vanaf " + window.HeerlenCatalog.money(minimum.amount) + " winkelmand" : "");
        }).join(" · ") + " — actieve sales uit Tebex."
        : "Geen actieve sales gevonden in Tebex.";
    }).catch(function (error) {
      status.textContent = error.message || "Tebex-sales konden niet worden opgehaald.";
    });
  });
  document.getElementById("saveNotes").addEventListener("click", function () { persist("Meldingen opgeslagen"); });

  document.getElementById("addNote").addEventListener("click", function () {
    state.notifications = readNotes();
    state.notifications.push({ id: cfg.uid(), name: "Nieuwe speler", item: "100 Coins", enabled: true });
    renderNotes();
    scheduleSave();
  });

  notesEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-del]");
    if (!btn) return;
    btn.closest(".note-row").remove();
    scheduleSave();
  });

  document.getElementById("resetAll").addEventListener("click", function () {
    if (!confirm("Alles terugzetten naar standaard? Tebex-IDs gaan dan ook weg.")) return;
    state = cfg.clone(cfg.DEFAULTS);
    cfg.save(state);
    fillForms();
    renderNotes();
    show("Standaard teruggezet");
  });

  function hydrateSharedSettings(user) {
    if (!user || !Array.isArray(user.permissions) || user.permissions.indexOf("admin:site") < 0) return Promise.resolve();
    return fetch("/api/admin", { credentials: "same-origin", cache: "no-store" }).then(function (response) { return response.json().then(function (data) {
      if (!response.ok || !data.ok || !data.content) return;
      if (data.content.siteSettings) state = Object.assign(state, data.content.siteSettings);
      if (data.content.storeSettings) state = Object.assign(state, data.content.storeSettings);
    }); }).catch(function () {});
  }

  function updateSeasonPreview() {
    var select = document.querySelector('#siteForm [name="seasonTheme"]');
    var preview = document.getElementById("seasonPreview");
    if (!select || !preview) return;
    var themes = {
      standard: ['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5h16v14H4zM8 9h8M8 13h5"/></svg>', "Standaard", "De normale Heerlen-uitstraling."],
      halloween: ['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 14.7 8.5 21 9.4l-4.5 4.4 1.1 6.2L12 17l-5.6 3 1.1-6.2L3 9.4l6.3-.9L12 3Z"/></svg>', "Halloween", "Warme accenten met vallende bladeren, vleermuizen en spookjes."],
      christmas: ['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M8 4l4 2 4-2M8 20l4-2 4 2"/></svg>', "Kerst", "Een lichte wintergloed met vallende sneeuw en kerstlichtjes."],
      newyear: ['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 12 12 3M12 12l8-4M12 12l7 7M12 12l-8 5M12 12 4 6"/></svg>', "Oud en nieuw", "Gouden lichtaccenten met bewegend vuurwerk."],
      easter: ['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-4.5 0-7-3.1-7-7.5S8.2 3 12 3s7 6.1 7 10.5S16.5 21 12 21Z"/><path d="M9 10h.01M15 10h.01M9 15h6"/></svg>', "Pasen", "Frisse lentekleuren met bewegende paaselementen."]
    };
    var selected = themes[select.value] || themes.standard;
    preview.dataset.season = select.value;
    preview.classList.toggle("is-disabled", !document.querySelector('#siteForm [name="seasonEnabled"]').checked);
    preview.classList.toggle("is-static", !document.querySelector('#siteForm [name="seasonEffects"]').checked);
    var icon = preview.querySelector(".season-preview-icon");
    var title = preview.querySelector("strong");
    var copy = preview.querySelector("p");
    if (icon) icon.innerHTML = selected[0];
    if (title) title.textContent = selected[1];
    if (copy) copy.textContent = selected[2];
    var scene = document.getElementById("seasonPreviewScene");
    if (scene && scene.dataset.renderedTheme !== select.value) {
      scene.dataset.renderedTheme = select.value;
      scene.replaceChildren();
      var image = function (file, className) {
        var el = document.createElement("img");
        el.src = "/images/seasons/" + file;
        el.className = className;
        el.alt = "";
        el.setAttribute("aria-hidden", "true");
        scene.appendChild(el);
        return el;
      };
      var particle = function (className, index) {
        var el = document.createElement("i");
        el.className = className;
        el.style.setProperty("--particle-x", ((index * 37 + 8) % 100) + "%");
        el.style.setProperty("--particle-delay", (-index * .47) + "s");
        scene.appendChild(el);
      };
      if (select.value === "christmas") {
        image("christmas-lights.svg", "scene-lights");
        var snowSheet = document.createElement("div");
        snowSheet.className = "scene-snow-sheet";
        scene.appendChild(snowSheet);
        for (var snowIndex = 0; snowIndex < 18; snowIndex++) particle("scene-snow", snowIndex);
      } else if (select.value === "halloween") {
        image("halloween-mist.svg", "scene-mist");
        image("halloween-bats.svg", "scene-bat scene-bat-one");
        image("halloween-bats.svg", "scene-bat scene-bat-two");
        for (var leafIndex = 0; leafIndex < 8; leafIndex++) particle("scene-leaf", leafIndex);
      } else if (select.value === "newyear") {
        for (var burstIndex = 0; burstIndex < 4; burstIndex++) {
          var burst = image("newyear-fireworks.svg", "scene-firework scene-firework-" + burstIndex);
          burst.style.setProperty("--burst-x", (12 + burstIndex * 22) + "%");
          burst.style.setProperty("--burst-y", (20 + (burstIndex % 2) * 25) + "%");
        }
      } else if (select.value === "easter") {
        image("easter-decorations.svg", "scene-bunny");
        for (var petalIndex = 0; petalIndex < 12; petalIndex++) particle("scene-petal", petalIndex);
      }
    }
    document.querySelectorAll("[data-range-output]").forEach(function (output) {
      var input = document.querySelector('#siteForm [name="' + output.dataset.rangeOutput + '"]');
      if (input) output.value = output.textContent = output.dataset.rangeOutput === "seasonDensity" ? input.value : Number(input.value).toFixed(1).replace(/\.0$/, "") + "×";
    });
  }

  var previewButton = document.getElementById("previewSeason");
  var previewDialog = document.getElementById("seasonPreviewDialog");
  var previewFrame = document.getElementById("seasonPreviewFrame");
  var closePreviewButton = document.getElementById("closeSeasonPreview");
  if (previewButton) previewButton.addEventListener("click", function () {
    var settings = readForms();
    var url = new URL("/", window.location.origin);
    url.searchParams.set("themePreview", settings.seasonTheme || "standard");
    url.searchParams.set("themeEffects", settings.seasonEffects ? "1" : "0");
    url.searchParams.set("themeIntensity", settings.seasonIntensity || "1");
    url.searchParams.set("themeSpeed", settings.seasonSpeed || "1");
    url.searchParams.set("themeDensity", settings.seasonDensity || "0");
    url.searchParams.set("themeFrequency", settings.seasonFrequency || "1");
    if (settings.seasonAccentEnabled && settings.seasonAccent) url.searchParams.set("themeAccent", settings.seasonAccent);
    if (!previewDialog || !previewFrame) return;
    previewFrame.src = url.href;
    if (document.getElementById("seasonPreviewDialogTitle")) document.getElementById("seasonPreviewDialogTitle").textContent = "Voorbeeld: " + (settings.seasonTheme || "standard");
    if (typeof previewDialog.showModal === "function") previewDialog.showModal();
    else previewDialog.setAttribute("open", "open");
  });
  if (closePreviewButton && previewDialog) closePreviewButton.addEventListener("click", function () {
    if (typeof previewDialog.close === "function") previewDialog.close();
    else previewDialog.removeAttribute("open");
    previewFrame.src = "about:blank";
  });
  if (previewDialog && previewFrame) previewDialog.addEventListener("close", function () { previewFrame.src = "about:blank"; });
  var resetSeasonButton = document.getElementById("resetSeason");
  if (resetSeasonButton) resetSeasonButton.addEventListener("click", function () {
    var form = document.getElementById("siteForm");
    form.querySelector('[name="seasonEnabled"]').checked = true;
    form.querySelector('[name="seasonTheme"]').value = "standard";
    form.querySelector('[name="seasonAccentEnabled"]').checked = false;
    form.querySelector('[name="seasonAccent"]').value = "#5aaefd";
    form.querySelector('[name="seasonEffects"]').checked = false;
    form.querySelector('[name="seasonIntensity"]').value = "1";
    form.querySelector('[name="seasonSpeed"]').value = "1";
    form.querySelector('[name="seasonDensity"]').value = "16";
    form.querySelector('[name="seasonFrequency"]').value = "1";
    form.querySelectorAll('[name="seasonPages"]').forEach(function (el) { el.checked = true; });
    form.querySelector('[name="seasonStart"]').value = "";
    form.querySelector('[name="seasonEnd"]').value = "";
    state = readForms();
    cfg.save(state);
    siteSettingsDirty = true;
    updateSeasonPreview();
    show("Standaardthema als concept hersteld. Klik Opslaan om te publiceren.");
  });

  sessionStorage.removeItem(cfg.PASS_KEY);
  fetch("/api/admin", { credentials: "same-origin", cache: "no-store" }).then(function (res) { return res.json().then(function (data) { data.status = res.status; return data; }); }).then(function (res) {
    if (res.ok && canOpenAdmin(res.user)) {
      if (res.content && res.content.siteSettings) state = Object.assign(state, res.content.siteSettings);
      if (res.content && res.content.storeSettings) state = Object.assign(state, res.content.storeSettings);
      openBoard(res.user);
      bindAutoSave();
    }
    else if (res.ok && res.user) loginError("Je account heeft toegang tot de staffpagina, maar niet tot beheer. Voor beheer is de Discord-beheerdersrol nodig; je kunt ook met het ingestelde ADMIN_PASSWORD inloggen.");
    else if (new URLSearchParams(location.search).get("login") === "denied") loginError("Je Discord-account heeft geen beheerdersrol.");
    else if (new URLSearchParams(location.search).get("login") === "setup") loginError("Discord-login is nog niet ingesteld in de hostingomgeving.");
    else if (new URLSearchParams(location.search).get("login") === "discord") loginError("Discord kon niet aanmelden. Controleer de OAuth-configuratie en probeer opnieuw.");
    else if (new URLSearchParams(location.search).get("login") === "error") loginError("Discord-aanmelden is mislukt. Probeer het opnieuw.");
  }).catch(function () {});
})();
