(function () {
  "use strict";
  var current = null;
  var content = {};
  var user = {};
  var typeSelect = document.getElementById("communityType");
  var list = document.getElementById("communityRecordList");
  var editor = document.getElementById("communityEditor");
  var appSelect = document.getElementById("applicationSelect");
  var appDetail = document.getElementById("applicationDetail");
  var reviewForm = document.getElementById("applicationReviewForm");
  if (!typeSelect || !list || !editor) return;
  var labels = { events: "evenement", jobs: "vacature", applicationForms: "sollicitatieformulier", helpCategories: "helpcategorie", helpArticles: "helpartikel" };
  function can(permission) { return Array.isArray(user.permissions) && user.permissions.includes(permission); }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]; }); }
  function dateInput(value) {
    if (!value) return "";
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function request(body) {
    return fetch("/api/admin", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (response) { return response.json().then(function (result) { if (!response.ok) throw new Error(result.error || "Actie is niet gelukt."); return result; }); });
  }
  function show(message) {
    var toast = document.getElementById("toast");
    if (toast) { toast.textContent = message; toast.hidden = false; toast.classList.add("is-on"); setTimeout(function () { toast.classList.remove("is-on"); toast.hidden = true; }, 2500); }
  }
  function permissionFor(type) {
    if (type === "events") return "events:manage";
    if (type === "jobs") return "jobs:manage";
    if (type === "applicationForms") return "forms:manage";
    return "help:manage";
  }
  function items(type) { return Array.isArray(content[type]) ? content[type] : []; }
  function newItem(type) {
    var id = type.replace(/([A-Z])/g, "-$1").toLowerCase() + "-" + Date.now().toString(36);
    if (type === "events") return { id: id, title: "", excerpt: "", description: "", image: "", location: "", organizer: user.username || "", startsAt: "", endsAt: "", capacity: 0, featured: false, status: "draft" };
    if (type === "jobs") return { id: id, title: "", excerpt: "", description: "", image: "", requirements: "", responsibilities: "", information: "", formId: (content.applicationForms || [])[0]?.id || "", opensAt: "", closesAt: "", allowMultiple: false, closed: false, status: "draft" };
    if (type === "applicationForms") return { id: id, title: "", description: "", sections: [], questions: [{ id: "vraag-1", title: "Vertel iets over jezelf", type: "long", required: true, description: "" }], status: "draft", version: 1 };
    if (type === "helpCategories") return { id: id, name: "", description: "", order: 0 };
    return { id: id, title: "", category: "", keywords: [], excerpt: "", content: "", image: "", featured: false, publishAt: "", status: "draft" };
  }
  function field(name, label, value, type, options) {
    var input;
    if (options) {
      input = '<select name="' + name + '">' + options.map(function (option) { return '<option value="' + esc(option.value) + '"' + (String(value) === String(option.value) ? " selected" : "") + '>' + esc(option.label) + "</option>"; }).join("") + "</select>";
    } else if (type === "textarea") input = '<textarea name="' + name + '" rows="4">' + esc(value) + "</textarea>";
    else input = '<input name="' + name + '" type="' + (type || "text") + '" value="' + esc(value) + '">';
    return '<label><span>' + esc(label) + "</span>" + input + "</label>";
  }
  function recordFields(type, item) {
    var html = '<input type="hidden" name="id" value="' + esc(item.id) + '">';
    if (type === "events") {
      html += field("title", "Titel", item.title) + field("excerpt", "Intro", item.excerpt, "textarea") +
        field("description", "Beschrijving", item.description, "textarea") + field("image", "Afbeelding (HTTPS URL)", item.image) +
        field("location", "Locatie", item.location) + field("organizer", "Organisator", item.organizer) +
        field("startsAt", "Start", dateInput(item.startsAt), "datetime-local") + field("endsAt", "Einde", dateInput(item.endsAt), "datetime-local") +
        field("capacity", "Capaciteit (0 = onbeperkt)", item.capacity, "number") +
        '<label class="check"><input name="featured" type="checkbox"' + (item.featured ? " checked" : "") + '><span>Uitgelicht</span></label>' +
        '<label class="check"><input name="cancelled" type="checkbox"' + (item.cancelled ? " checked" : "") + '><span>Geannuleerd</span></label>';
    } else if (type === "jobs") {
      var forms = (content.applicationForms || []).map(function (form) { return { value: form.id, label: form.title + (form.status === "published" ? "" : " · concept") }; });
      html += field("title", "Titel", item.title) + field("excerpt", "Intro", item.excerpt, "textarea") +
        field("description", "Beschrijving", item.description, "textarea") + field("image", "Afbeelding (HTTPS URL)", item.image) +
        field("requirements", "Vereisten", item.requirements, "textarea") + field("responsibilities", "Verantwoordelijkheden", item.responsibilities, "textarea") +
        field("information", "Praktische informatie", item.information, "textarea") +
        '<label><span>Discord-webhook voor sollicitaties (optioneel)</span><input name="webhookUrl" type="password" autocomplete="new-password" maxlength="300" value="' + esc(item.webhookUrl || "") + '" placeholder="https://discord.com/api/webhooks/..."><small>Sollicitatieantwoorden en eventuele bestanden worden privé naar dit Discord-kanaal gestuurd. De webhook blijft server-side en komt niet in de openbare vacature.</small></label>' +
        field("formId", "Sollicitatieformulier", item.formId, "", forms) +
        field("opensAt", "Open vanaf (optioneel)", dateInput(item.opensAt), "datetime-local") + field("closesAt", "Sluit op (optioneel)", dateInput(item.closesAt), "datetime-local") +
        '<label class="check"><input name="allowMultiple" type="checkbox"' + (item.allowMultiple ? " checked" : "") + '><span>Meerdere sollicitaties toestaan</span></label>' +
        '<label class="check"><input name="closed" type="checkbox"' + (item.closed ? " checked" : "") + '><span>Vacature sluiten</span></label>';
    } else if (type === "applicationForms") {
      html += field("title", "Titel", item.title) + field("description", "Intro", item.description, "textarea") +
        '<label><span>Onderdelen (JSON-array)</span><textarea name="sections" rows="5">' + esc(JSON.stringify(item.sections || [], null, 2)) + '</textarea></label>' +
        '<label><span>Vragen (JSON-array)</span><textarea name="questions" rows="16">' + esc(JSON.stringify(item.questions || [], null, 2)) + '</textarea><small>Types: short, long, number, date, choice, multiple, dropdown, boolean, file, info. Koppel een vraag met sectionId aan een onderdeel-ID. Voorwaardelijke vragen gebruiken conditions: [{"questionId":"vraag-id","value":"Ja"}].</small></label>';
    } else if (type === "helpCategories") {
      html += field("name", "Naam", item.name) + field("description", "Beschrijving", item.description, "textarea") + field("order", "Volgorde", item.order, "number");
    } else {
      html += field("title", "Titel", item.title) + field("category", "Categorie-ID of naam", item.category) +
        field("keywords", "Zoekwoorden (komma-gescheiden)", (item.keywords || []).join(", ")) + field("excerpt", "Intro", item.excerpt, "textarea") +
        field("content", "Artikeltekst", item.content, "textarea") + field("image", "Afbeelding (HTTPS URL)", item.image) +
        field("publishAt", "Publiceren vanaf (optioneel)", dateInput(item.publishAt), "datetime-local") +
        '<label class="check"><input name="featured" type="checkbox"' + (item.featured ? " checked" : "") + '><span>Uitgelicht</span></label>';
    }
    return html + '<label><span>Status</span><select name="status"><option value="draft"' + (item.status !== "published" ? " selected" : "") + '>Concept</option><option value="published"' + (item.status === "published" ? " selected" : "") + '>Publiceren</option></select></label>';
  }
  function openEditor(type, item) {
    current = item;
    editor.innerHTML = '<h3>' + (item.id ? "Item bewerken" : "Nieuw item") + " · " + esc(labels[type]) + "</h3>" + recordFields(type, item) +
      '<div class="cms-actions"><button class="btn btn-blue" type="submit">Opslaan</button><button class="btn btn-ghost" type="button" data-cancel>Annuleren</button>' +
      (item.id ? '<button class="btn btn-danger" type="button" data-delete>Verwijderen</button>' : "") + '</div><p class="cms-message" role="status"></p>';
    editor.hidden = false;
    editor.onsubmit = function (event) {
      event.preventDefault();
      var data = Object.fromEntries(new FormData(editor).entries());
      ["featured", "cancelled", "allowMultiple", "closed"].forEach(function (key) { if (editor.elements[key]) data[key] = editor.elements[key].checked; });
      ["capacity", "order"].forEach(function (key) { if (data[key] !== undefined) data[key] = Number(data[key]); });
      if (data.publishAt) data.publishAt = new Date(data.publishAt).toISOString();
      if (data.startsAt) data.startsAt = new Date(data.startsAt).toISOString();
      if (data.endsAt) data.endsAt = new Date(data.endsAt).toISOString();
      if (data.opensAt) data.opensAt = new Date(data.opensAt).toISOString();
      if (data.closesAt) data.closesAt = new Date(data.closesAt).toISOString();
      if (type === "applicationForms") {
        try { data.sections = JSON.parse(data.sections || "[]"); data.questions = JSON.parse(data.questions || "[]"); }
        catch (_) { editor.querySelector(".cms-message").textContent = "Onderdelen en vragen moeten geldige JSON-arrays zijn."; return; }
      }
      if (type === "helpArticles") data.keywords = data.keywords.split(",").map(function (word) { return word.trim(); }).filter(Boolean);
      editor.querySelector(".cms-message").textContent = "Opslaan…";
      request({ action: "save-community-record", type: type, item: data }).then(function () {
        editor.hidden = true; refresh(); show("Item opgeslagen");
      }).catch(function (error) { editor.querySelector(".cms-message").textContent = error.message; });
    };
    editor.querySelector("[data-cancel]").onclick = function () { editor.hidden = true; };
    var remove = editor.querySelector("[data-delete]");
    if (remove) remove.onclick = function () {
      if (!confirm("Dit item verwijderen?")) return;
      request({ action: "delete-community-record", type: type, item: { id: item.id, title: item.title } }).then(function () { editor.hidden = true; refresh(); show("Item verwijderd"); }).catch(function (error) { editor.querySelector(".cms-message").textContent = error.message; });
    };
  }
  function renderRecords() {
    var type = typeSelect.value;
    var allowed = can(permissionFor(type));
    typeSelect.querySelectorAll("option").forEach(function (option) { option.hidden = !can(permissionFor(option.value)); });
    var add = document.getElementById("communityNew");
    add.hidden = !allowed;
    list.replaceChildren();
    items(type).slice().sort(function (a, b) { return String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")); }).forEach(function (item) {
      var button = document.createElement("button"); button.type = "button"; button.className = "cms-list-item";
      var title = item.title || item.name || item.id || "Naamloos";
      var meta = type === "events" ? dateInput(item.startsAt) : type === "jobs" ? (item.formId || "") : item.category || item.status || "";
      button.innerHTML = "<strong>" + esc(title) + "</strong><span>" + esc(meta) + "</span><small>" + (item.status === "published" ? "Gepubliceerd" : "Concept") + "</small>";
      button.disabled = !allowed;
      button.addEventListener("click", function () { if (allowed) openEditor(type, item); });
      list.appendChild(button);
    });
    if (!list.childNodes.length) list.appendChild(document.createTextNode("Nog geen items."));
  }
  function renderApplications() {
    var applications = Array.isArray(content.applications) ? content.applications : [];
    var selected = appSelect.value;
    appSelect.replaceChildren(new Option("Selecteer een sollicitatie", ""));
    applications.slice().sort(function (a, b) { return String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")); }).forEach(function (item) {
      var option = new Option((item.jobTitle || "Vacature") + " · " + (item.username || "Inwoner") + " · " + item.status, item.id);
      appSelect.appendChild(option);
    });
    if (applications.some(function (item) { return item.id === selected; })) appSelect.value = selected;
    var app = applications.find(function (item) { return item.id === appSelect.value; });
    if (!app) { appDetail.textContent = applications.length ? "Selecteer een sollicitatie om de antwoorden te bekijken." : "Er zijn nog geen sollicitaties."; return; }
    var answers = Object.fromEntries(Object.entries(app.answers || {}).map(function (entry) {
      return [entry[0], typeof entry[1] === "string" && entry[1].startsWith("data:") ? "[bestand toegevoegd]" : entry[1]];
    }));
    appDetail.textContent = JSON.stringify({ kandidaat: app.username, inGameNaam: app.inGameName, vacature: app.jobTitle, status: app.status, versie: app.formVersion, antwoorden: answers, interneNotities: app.notes || [] }, null, 2);
    reviewForm.elements.id.value = app.id;
    reviewForm.elements.status.value = app.status;
    reviewForm.elements.status.disabled = !can("applications:review");
    reviewForm.elements.message.disabled = !can("applications:review");
    reviewForm.elements.note.disabled = !can("applications:review");
    reviewForm.querySelector("button[type=submit]").hidden = !can("applications:review");
  }
  function renderComments() {
    var target = document.getElementById("commentModerationList");
    target.replaceChildren();
    var comments = Array.isArray(content.newsComments) ? content.newsComments.slice().reverse() : [];
    comments.forEach(function (comment) {
      var row = document.createElement("div"); row.className = "cms-list-item is-static";
      var title = document.createElement("strong"); title.textContent = comment.username + " · " + comment.newsId;
      var text = document.createElement("span"); text.textContent = comment.content;
      row.append(title, text);
      if (can("comments:moderate")) {
        var button = document.createElement("button"); button.type = "button"; button.className = "btn btn-ghost"; button.textContent = comment.hidden ? "Weer zichtbaar maken" : "Verbergen";
        button.addEventListener("click", function () {
          request({ action: "moderate-comment", id: comment.id, hidden: !comment.hidden }).then(refresh).catch(function (error) { show(error.message); });
        });
        row.appendChild(button);
      }
      target.appendChild(row);
    });
    if (!comments.length) target.textContent = "Er zijn geen reacties om te modereren.";
    target.hidden = !can("comments:moderate");
  }
  function refresh() {
    return fetch("/api/admin", { credentials: "same-origin", cache: "no-store" }).then(function (response) {
      return response.json().then(function (result) { if (!response.ok) throw new Error(result.error || "Beheergegevens niet beschikbaar."); return result; });
    }).then(function (result) { content = result.content || {}; user = result.user || user; renderRecords(); renderApplications(); renderComments(); });
  }
  typeSelect.addEventListener("change", renderRecords);
  document.getElementById("communityNew").addEventListener("click", function () { openEditor(typeSelect.value, newItem(typeSelect.value)); });
  appSelect.addEventListener("change", renderApplications);
  reviewForm.addEventListener("submit", function (event) {
    event.preventDefault();
    request({ action: "review-application", id: reviewForm.elements.id.value, status: reviewForm.elements.status.value, message: reviewForm.elements.message.value, note: reviewForm.elements.note.value })
      .then(function () { document.getElementById("applicationReviewState").textContent = "Beoordeling opgeslagen."; refresh(); })
      .catch(function (error) { document.getElementById("applicationReviewState").textContent = error.message; });
  });
  document.getElementById("residentBroadcastForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var output = document.getElementById("broadcastState"); output.textContent = "Versturen…";
    request({ action: "send-resident-notification", discordId: form.elements.discordId.value.trim(), title: form.elements.title.value, message: form.elements.message.value })
      .then(function (result) { output.textContent = "Melding verstuurd naar " + result.recipients + " inwoner(s)."; form.reset(); form.elements.discordId.value = "all"; })
      .catch(function (error) { output.textContent = error.message; });
  });
  function update(result) {
    content = result.content || {}; user = result.user || {};
    var canManageRecords = ["events:manage", "jobs:manage", "forms:manage", "help:manage"].some(can);
    typeSelect.closest("section").hidden = !canManageRecords;
    document.getElementById("applicationReviewForm").closest("section").hidden = !can("applications:read") && !can("applications:review");
    document.getElementById("residentBroadcastForm").closest("section").hidden = !can("notifications:manage");
    document.getElementById("commentModerationList").closest("section").hidden = !can("comments:moderate");
    renderRecords(); renderApplications(); renderComments();
  }
  window.addEventListener("heerlen:admin-loaded", function (event) { update(event.detail || {}); });
  if (window.HeerlenAdminState) update(window.HeerlenAdminState);
})();
