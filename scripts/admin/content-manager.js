(function () {
  "use strict";
  var root = document.getElementById("board");
  if (!root) return;
  var state = null;
  var currentUser = null;
  var labels = { news: "nieuwsbericht", changelog: "serverupdate", staff: "staffprofiel" };
  var categories = ["Nieuwe functies", "Bugfixes", "Aanpassingen", "Serverupdates", "Regelwijzigingen", "Nieuws"];

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function dateInput(value) {
    if (!value) return "";
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function api(body) {
    return fetch("/api/admin", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (result) {
        if (!response.ok) throw new Error(result.error || "Opslaan is niet gelukt.");
        return result;
      });
    });
  }
  function show(message) {
    var toast = document.getElementById("toast");
    if (toast) { toast.textContent = message; toast.hidden = false; toast.classList.add("is-on"); setTimeout(function () { toast.classList.remove("is-on"); toast.hidden = true; }, 2600); }
  }
  function selectSection(name) {
    document.querySelectorAll("[data-admin-section]").forEach(function (section) { section.hidden = section.getAttribute("data-admin-section") !== name; });
    document.querySelectorAll("#cmsTabs [data-section]").forEach(function (button) { button.classList.toggle("is-active", button.getAttribute("data-section") === name); });
    var save = document.getElementById("saveAll");
    if (save) save.hidden = name !== "settings" && name !== "shop";
  }
  function can(permission) { return !!currentUser && Array.isArray(currentUser.permissions) && currentUser.permissions.includes(permission); }
  function accessTabs() {
    document.querySelectorAll("#cmsTabs [data-section]").forEach(function (button) {
      var section = button.getAttribute("data-section");
      var permitted = ((section === "settings" || section === "shop") && can("admin:site")) || (section === "audit" && can("audit:read")) || (section === "news" && can("news:write")) || (section === "changelog" && can("changelog:write")) || (section === "staff" && can("staff:write")) || (section === "rules" && can("rules:write"));
      button.hidden = !permitted;
    });
    if (!can("admin:site")) document.querySelector('[data-admin-section="settings"]')?.setAttribute("hidden", "");
    if (!can("admin:site")) document.querySelector('[data-admin-section="shop"]')?.setAttribute("hidden", "");
    if (!can("audit:read")) document.querySelector('[data-admin-section="audit"]')?.setAttribute("hidden", "");
    if (!can("news:write")) document.querySelector('[data-admin-section="news"]')?.setAttribute("hidden", "");
    if (!can("changelog:write")) document.querySelector('[data-admin-section="changelog"]')?.setAttribute("hidden", "");
    if (!can("staff:write")) document.querySelector('[data-admin-section="staff"]')?.setAttribute("hidden", "");
    if (!can("rules:write")) document.querySelector('[data-admin-section="rules"]')?.setAttribute("hidden", "");
  }
  function newItem(type) {
    var base = { id: "", title: "", category: type === "staff" ? "Moderatie" : "Nieuwe functies", excerpt: "", content: "", image: "", publishAt: new Date().toISOString(), status: "draft", featured: false, author: currentUser.username || "Staff", version: "", name: "", username: "", role: "", bio: "", discordId: "", order: 0, active: true };
    return base;
  }
  function items(type) {
    return state && state[type === "news" ? "news" : type === "staff" ? "staff" : "changelog"] || [];
  }
  function renderList(type) {
    var target = document.getElementById(type + "List");
    if (!target) return;
    var list = items(type).slice().sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); });
    if (!list.length) { target.innerHTML = '<p class="content-empty">Nog geen ' + labels[type] + ' aangemaakt.</p>'; return; }
    target.innerHTML = list.map(function (item) {
      var title = item.title || item.name || "Naamloos";
      var status = item.status === "published" ? "Gepubliceerd" : item.active === false ? "Verborgen" : "Concept";
      var extra = [item.category, item.role, item.version].filter(Boolean).join(" · ");
      return '<button class="cms-list-item" type="button" data-edit="' + esc(type) + '" data-id="' + esc(item.id) + '"><strong>' + esc(title) + '</strong><span>' + esc(extra) + '</span><small>' + esc(status) + '</small></button>';
    }).join("");
  }
  function editorMarkup(type, item) {
    var common = '<input type="hidden" name="id" value="' + esc(item.id) + '">';
    if (type === "staff") {
      return common + '<h3>Staffprofiel</h3><label><span>Naam</span><input name="name" maxlength="80" required value="' + esc(item.name) + '"></label><label><span>Gebruikersnaam</span><input name="username" maxlength="80" value="' + esc(item.username) + '"></label><label><span>Functie / rang</span><input name="role" maxlength="80" required value="' + esc(item.role) + '"></label><label><span>Categorie</span><input name="category" maxlength="60" value="' + esc(item.category) + '"></label><label><span>Korte beschrijving</span><textarea name="bio" rows="4" maxlength="600">' + esc(item.bio) + '</textarea></label><label><span>Discord-ID (optioneel)</span><input name="discordId" maxlength="40" value="' + esc(item.discordId) + '"></label><label><span>Volgnummer</span><input name="order" type="number" min="0" max="9999" value="' + esc(item.order) + '"></label><label><span>Profielfoto (HTTPS URL)</span><input name="avatar" maxlength="2000" value="' + esc(item.avatar) + '"></label><label><span>Of kies een kleine profielfoto (max. 400 KB)</span><input type="file" accept="image/png,image/jpeg,image/webp" data-image-file></label><label class="check"><input name="active" type="checkbox"' + (item.active !== false ? " checked" : "") + '><span>Profiel tonen</span></label>';
    }
    var categoryOptions = categories.slice();
    if (item.category && categoryOptions.indexOf(item.category) < 0) categoryOptions.push(item.category);
    var categorySelect = categoryOptions.map(function (category) { return '<option' + (item.category === category ? ' selected' : '') + '>' + esc(category) + '</option>'; }).join("");
    return common + '<h3>' + (type === "news" ? "Nieuwsbericht" : "Serverupdate") + '</h3>' + (type === "changelog" ? '<label><span>Versie / naam</span><input name="version" maxlength="60" value="' + esc(item.version) + '" placeholder="Bijv. Versie 1.4"></label>' : '') + '<label><span>Titel</span><input name="title" maxlength="160" required value="' + esc(item.title) + '"></label><label><span>Categorie</span><select name="category">' + categorySelect + '</select></label><label><span>Intro / samenvatting</span><textarea name="excerpt" rows="2" maxlength="600">' + esc(item.excerpt) + '</textarea></label><label><span>Uitgebreide beschrijving</span><textarea name="content" rows="9" maxlength="12000" required>' + esc(item.content) + '</textarea></label><label><span>Afbeelding (HTTPS URL)</span><input name="image" maxlength="2000" value="' + esc(item.image) + '"></label><label><span>Of kies een kleine afbeelding (max. 400 KB)</span><input type="file" accept="image/png,image/jpeg,image/webp" data-image-file></label><label><span>Publicatiedatum</span><input name="publishAt" type="datetime-local" value="' + esc(dateInput(item.publishAt)) + '"></label><label><span>Auteur</span><input name="author" maxlength="80" value="' + esc(currentUser.username || item.author || "Staff") + '"></label><label class="check"><input name="featured" type="checkbox"' + (item.featured ? " checked" : "") + '><span>Uitgelicht</span></label><label><span>Status</span><select name="status"><option value="draft"' + (item.status !== "published" ? " selected" : "") + '>Concept</option><option value="published"' + (item.status === "published" ? " selected" : "") + '>Publiceren</option></select></label>';
  }
  function openEditor(type, item) {
    var form = document.getElementById(type + "Editor");
    form.innerHTML = editorMarkup(type, item) + '<div class="cms-actions"><button class="btn btn-blue" type="submit">Opslaan</button><button class="btn btn-ghost" type="button" data-cancel>Annuleren</button>' + (item.id ? '<button class="btn btn-danger" type="button" data-remove>Verwijderen</button>' : '') + '</div><p class="cms-message" role="status"></p>';
    form.hidden = false;
    form.onsubmit = function (event) { event.preventDefault(); saveEditor(type, form); };
    form.querySelector("[data-cancel]").onclick = function () { form.hidden = true; };
    var file = form.querySelector("[data-image-file]");
    if (file) file.onchange = function () { readImage(file, form); };
    var remove = form.querySelector("[data-remove]");
    if (remove) remove.onclick = function () { deleteItem(type, item); };
  }
  function readImage(input, form) {
    var file = input.files && input.files[0];
    if (!file) return;
    var status = form.querySelector(".cms-message");
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 400 * 1024) { status.textContent = "Kies PNG, JPEG of WebP tot 400 KB."; input.value = ""; return; }
    var reader = new FileReader();
    reader.onload = function () { form.querySelector('[name="' + (form.id === "staffEditor" ? "avatar" : "image") + '"]').value = reader.result; status.textContent = "Afbeelding klaar om op te slaan."; };
    reader.readAsDataURL(file);
  }
  function formValue(form, name) { var field = form.elements.namedItem(name); return field ? field.value.trim() : ""; }
  function saveEditor(type, form) {
    var item = {};
    ["id", "title", "category", "excerpt", "content", "image", "publishAt", "status", "author", "version", "name", "username", "role", "bio", "discordId", "avatar", "order"].forEach(function (key) {
      var value = formValue(form, key);
      if (value !== "") item[key] = value;
    });
    if (form.elements.featured) item.featured = form.elements.featured.checked;
    if (form.elements.active) item.active = form.elements.active.checked;
    if (item.publishAt) item.publishAt = new Date(item.publishAt).toISOString();
    if (!item.id) item.id = "item-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    var status = form.querySelector(".cms-message");
    status.textContent = "Opslaan…";
    api({ action: "save", type: type, item: item }).then(function () { form.hidden = true; load(); show("" + (labels[type][0].toUpperCase() + labels[type].slice(1)) + " opgeslagen"); }).catch(function (error) { status.textContent = error.message; });
  }
  function deleteItem(type, item) {
    if (!confirm("Weet je zeker dat je dit " + labels[type] + " wilt verwijderen?")) return;
    api({ action: "delete", type: type, item: item }).then(function () { document.getElementById(type + "Editor").hidden = true; load(); show("Verwijderd"); }).catch(function (error) { alert(error.message); });
  }
  function renderRules() {
    var editorRoot = document.getElementById("rulesEditors");
    var docs = (state.rulesDraft && state.rulesDraft.documents) || [];
    editorRoot.replaceChildren();
    docs.forEach(function (doc) {
      var label = document.createElement("label");
      label.className = "rule-edit-card";
      var title = document.createElement("span"); title.textContent = doc.title;
      var textarea = document.createElement("textarea"); textarea.rows = 18; textarea.dataset.ruleId = doc.id; textarea.value = doc.content || "";
      label.append(title, textarea); editorRoot.appendChild(label);
    });
    var versions = state.rulesVersions || [];
    var list = document.getElementById("rulesVersionList");
    list.innerHTML = versions.slice().reverse().map(function (version) {
      return '<div class="cms-list-item is-static"><strong>Versie ' + esc(version.version) + ' · ' + esc(version.title) + '</strong><span>' + esc(version.author) + ' · ' + esc(new Date(version.publishedAt).toLocaleString("nl-NL")) + '</span><small>Vastgelegd · niet verwijderbaar</small></div>';
    }).join("") || '<p class="content-empty">Nog geen gepubliceerde versies.</p>';
    ["rulesCompareFrom", "rulesCompareTo"].forEach(function (id) {
      var select = document.getElementById(id);
      if (!select) return;
      select.innerHTML = versions.map(function (version, index) { return '<option value="' + esc(version.id) + '">' + esc(version.version + " — " + version.title) + (index === 0 ? " (huidig)" : "") + "</option>"; }).join("");
    });
    var from = document.getElementById("rulesCompareFrom");
    var to = document.getElementById("rulesCompareTo");
    if (from && versions.length > 1) from.value = versions[1].id;
    if (to && versions.length) to.value = versions[0].id;
    var meta = document.getElementById("ruleVersionState");
    if (state.rulesDraft && state.rulesDraft.updatedAt) meta.textContent = "Concept laatst bewerkt door " + state.rulesDraft.updatedBy + " · " + new Date(state.rulesDraft.updatedAt).toLocaleString("nl-NL");
  }
  function compareRules() {
    var fromId = document.getElementById("rulesCompareFrom").value;
    var toId = document.getElementById("rulesCompareTo").value;
    var older = (state.rulesVersions || []).find(function (version) { return version.id === fromId; });
    var newer = (state.rulesVersions || []).find(function (version) { return version.id === toId; });
    var output = document.getElementById("rulesDiff");
    output.replaceChildren();
    if (!older || !newer || older.id === newer.id) { output.textContent = "Kies twee verschillende versies."; return; }
    var before = new Map((older.documents || []).map(function (doc) { return [doc.id, doc]; }));
    (newer.documents || []).forEach(function (doc) {
      var oldDoc = before.get(doc.id);
      if (!oldDoc) return;
      var oldLines = String(oldDoc.content || "").split(/\r?\n/);
      var newLines = String(doc.content || "").split(/\r?\n/);
      if (oldLines.length > 1000 || newLines.length > 1000) { output.appendChild(document.createTextNode(doc.title + ": vergelijking overgeslagen; document is erg lang. ")); return; }
      var dp = Array.from({ length: oldLines.length + 1 }, function () { return new Uint16Array(newLines.length + 1); });
      for (var i = oldLines.length - 1; i >= 0; i--) for (var j = newLines.length - 1; j >= 0; j--) dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      var section = document.createElement("section");
      var heading = document.createElement("h4"); heading.textContent = doc.title; section.appendChild(heading);
      var list = document.createElement("pre");
      var lines = [];
      i = 0; j = 0;
      while (i < oldLines.length || j < newLines.length) {
        if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) { lines.push("  " + oldLines[i]); i++; j++; }
        else if (i < oldLines.length && (j >= newLines.length || dp[i + 1][j] >= dp[i][j + 1])) { lines.push("− " + oldLines[i++]); }
        else { lines.push("+ " + newLines[j++]); }
      }
      list.textContent = lines.filter(function (line) { return line.startsWith("+ ") || line.startsWith("− "); }).join("\n") || "Geen tekstverschillen.";
      section.appendChild(list); output.appendChild(section);
    });
  }
  function renderAudit() {
    var list = document.getElementById("auditList");
    list.innerHTML = (state.auditLog || []).slice(0, 50).map(function (entry) {
      return '<div class="cms-list-item is-static"><strong>' + esc(entry.actor) + ' · ' + esc(entry.action) + '</strong><span>' + esc(entry.itemType) + ': ' + esc(entry.itemTitle) + '</span><small>' + esc(new Date(entry.at).toLocaleString("nl-NL")) + '</small></div>';
    }).join("") || '<p class="content-empty">Nog geen beheeracties vastgelegd.</p>';
  }
  function load() {
    fetch("/api/admin", { credentials: "same-origin", cache: "no-store" }).then(function (response) { return response.json().then(function (body) { if (!response.ok) throw new Error(body.error || "Beheergegevens niet beschikbaar."); return body; }); }).then(function (result) {
      state = result.content; currentUser = result.user;
      accessTabs();
      var activeTab = document.querySelector("#cmsTabs [data-section].is-active");
      if (!activeTab || activeTab.hidden) {
        var firstTab = Array.from(document.querySelectorAll("#cmsTabs [data-section]")).find(function (button) { return !button.hidden; });
        if (firstTab) selectSection(firstTab.dataset.section);
      }
      if (state.news) renderList("news");
      if (state.changelog) renderList("changelog");
      if (state.staff) renderList("staff");
      if (state.rulesDraft) renderRules();
      if (state.auditLog) renderAudit();
      var discord = document.getElementById("discordState");
      if (discord) discord.textContent = result.integration.discord ? "Discord-login, guildcontrole en Discord-rolcontrole zijn ingesteld." : "Discord-login vraagt nog Discord OAuth Client ID/Secret, server-ID en bot-token als geheime hostingvariabelen. De twee rol-ID’s staan hieronder al ingevuld.";
      if (result.integration.database) discord && (discord.textContent += " PostgreSQL-opslag is gekoppeld.");
      else if (result.integration.privateBlob) discord && (discord.textContent += " Private Vercel Blob-opslag is gekoppeld.");
      else discord && (discord.textContent += " Persistente Vercel-opslag ontbreekt.");
    }).catch(function (error) { show(error.message); });
  }

  document.getElementById("cmsTabs").addEventListener("click", function (event) {
    var button = event.target.closest("[data-section]");
    if (button && !button.hidden) selectSection(button.dataset.section);
  });
  document.querySelectorAll("[data-new]").forEach(function (button) { button.addEventListener("click", function () { openEditor(button.dataset.new, newItem(button.dataset.new)); }); });
  ["news", "changelog", "staff"].forEach(function (type) {
    document.getElementById(type + "List").addEventListener("click", function (event) {
      var button = event.target.closest("[data-edit]");
      if (!button) return;
      var item = items(type).find(function (row) { return row.id === button.dataset.id; });
      if (item) openEditor(type, structuredClone(item));
    });
  });
  function saveRulesDraft() {
    var documents = Array.from(document.querySelectorAll("[data-rule-id]")).map(function (textarea) {
      var original = state.rulesDraft.documents.find(function (doc) { return doc.id === textarea.dataset.ruleId; });
      return { id: textarea.dataset.ruleId, title: original.title, content: textarea.value };
    });
    return api({ action: "save-rules-draft", documents: documents }).then(function () { return documents; });
  }
  document.getElementById("saveRulesDraft").addEventListener("click", function () {
    saveRulesDraft().then(function () { show("Regelconcept opgeslagen"); load(); }).catch(function (error) { alert(error.message); });
  });
  document.getElementById("publishRules").addEventListener("click", function () {
    var title = document.getElementById("rulesVersionTitle").value.trim();
    if (!confirm("Publiceer een onveranderbare nieuwe versie van alle regels?")) return;
    saveRulesDraft().then(function () { return api({ action: "publish-rules", title: title }); }).then(function (result) { document.getElementById("rulesVersionTitle").value = ""; show("Versie " + result.version.version + " gepubliceerd"); load(); }).catch(function (error) { alert(error.message); });
  });
  document.getElementById("compareRules").addEventListener("click", compareRules);
  document.querySelector('[data-section="settings"]').addEventListener("click", function () { selectSection("settings"); });
  window.addEventListener("heerlen:admin-ready", load);
  document.getElementById("logout").addEventListener("click", function () { setTimeout(function () { document.getElementById("gate").hidden = false; }, 0); });
  document.querySelectorAll("#cmsTabs [data-section]").forEach(function (button) { button.addEventListener("click", function () { selectSection(button.dataset.section); }); });
})();
