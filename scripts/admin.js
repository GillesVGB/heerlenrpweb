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
    document.querySelectorAll("#siteForm [name], #playersForm [name], #toastForm [name], #tebexForm [name]").forEach(function (el) {
      var key = el.name;
      if (!(key in s)) return;
      if (key === "seasonPages") return;
      if (el.type === "checkbox") el.checked = !!s[key];
      else el.value = s[key];
    });
    var pages = Array.isArray(s.seasonPages) ? s.seasonPages : ["home", "news", "updates", "staff", "rules", "shop"];
    document.querySelectorAll('#siteForm [name="seasonPages"]').forEach(function (el) { el.checked = pages.indexOf(el.value) >= 0; });
    renderTebexPackages();
    updateSeasonPreview();
  }

  function tebexCommand(amount) {
    return "givecoins {id} " + amount + " {transaction} {username}";
  }

  function renderTebexPackages() {
    var packs = (window.HeerlenCatalog && window.HeerlenCatalog.PACKS) || [];
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

  function readForms() {
    var next = cfg.clone(state);
    document.querySelectorAll("#siteForm [name], #playersForm [name], #toastForm [name], #tebexForm [name]").forEach(function (el) {
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
      if (e.target.closest("#siteForm, #tebexForm")) siteSettingsDirty = true;
      if (e.target.closest("#siteForm")) updateSeasonPreview();
      scheduleSave();
    });
    root.addEventListener("change", function (e) {
      if (!e.target.closest("input, textarea, select")) return;
      if (e.target.closest("#siteForm, #tebexForm")) siteSettingsDirty = true;
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
    var themes = { standard: ["✨", "Standaard", "De normale Heerlen-uitstraling."], halloween: ["🎃", "Halloween", "Warme accenten met vallende bladeren, vleermuizen en spookjes."], christmas: ["❄", "Kerst", "Een lichte wintergloed met vallende sneeuw en kerstlichtjes."], newyear: ["🎆", "Oud en nieuw", "Gouden lichtaccenten met bewegend vuurwerk."], easter: ["🐣", "Pasen", "Frisse lentekleuren met bewegende paaselementen."] };
    var selected = themes[select.value] || themes.standard;
    preview.dataset.season = select.value;
    preview.classList.toggle("is-disabled", !document.querySelector('#siteForm [name="seasonEnabled"]').checked);
    preview.classList.toggle("is-static", !document.querySelector('#siteForm [name="seasonEffects"]').checked);
    var icon = preview.querySelector(".season-preview-icon");
    var title = preview.querySelector("strong");
    var copy = preview.querySelector("p");
    if (icon) icon.textContent = selected[0];
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
