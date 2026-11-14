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
  var supportSelect = document.getElementById("supportTicketSelect");
  var supportDetail = document.getElementById("supportTicketDetail");
  var supportForm = document.getElementById("supportReplyForm");
  var supportStats = document.getElementById("supportTicketStats");
  var supportCategoryEditor = document.getElementById("supportCategoryEditor");
  var supportCategoryDraft = [];
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
  function downloadPrivateFile(attachment) {
    return fetch(attachment.dataUrl).then(function (response) { return response.blob(); }).then(function (blob) {
      var url = URL.createObjectURL(blob); var link = document.createElement("a");
      link.href = url; link.download = attachment.name || "bijlage"; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
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
        '<label><span>Discord-webhook voor deze vacature (optioneel)</span><input name="webhookUrl" type="password" autocomplete="new-password" maxlength="300" value="' + esc(item.webhookUrl || "") + '" placeholder="https://discord.com/api/webhooks/..."><small>Nieuwe sollicitaties voor deze vacature worden naar dit kanaal gestuurd. Antwoorden zijn direct leesbaar; uploads en het volledige antwoordoverzicht worden als bijlage meegestuurd. De webhook blijft server-side.</small></label>' +
        '<div class="cms-actions"><button type="button" class="btn btn-ghost" data-test-application-webhook>Webhook testen</button><span class="cms-message" data-webhook-test-state role="status" aria-live="polite"></span></div>' +
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
    var testWebhook = editor.querySelector("[data-test-application-webhook]");
    if (testWebhook) testWebhook.onclick = function () {
      var input = editor.elements.webhookUrl;
      var output = editor.querySelector("[data-webhook-test-state]");
      testWebhook.disabled = true;
      output.textContent = "Testbericht versturen…";
      request({ action: "test-application-webhook", webhookUrl: input.value.trim() })
        .then(function (result) { output.textContent = result.message || "Webhook werkt."; })
        .catch(function (error) { output.textContent = error.message; })
        .finally(function () { testWebhook.disabled = false; });
    };
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
  function renderSupportTickets() {
    if (!supportSelect || !supportDetail || !supportForm) return;
    var tickets = Array.isArray(content.supportTickets) ? content.supportTickets : [];
    if (supportStats) {
      supportStats.replaceChildren();
      var closed = tickets.filter(function (ticket) { return ticket.status === "closed" && ticket.closedAt && Date.parse(ticket.createdAt) && Date.parse(ticket.closedAt) >= Date.parse(ticket.createdAt); });
      var average = closed.length ? closed.reduce(function (sum, ticket) { return sum + Date.parse(ticket.closedAt) - Date.parse(ticket.createdAt); }, 0) / closed.length : 0;
      [["Open", tickets.filter(function (ticket) { return ticket.status !== "closed"; }).length], ["Wacht op inwoner", tickets.filter(function (ticket) { return ticket.status === "waiting"; }).length], ["Afgerond", tickets.filter(function (ticket) { return ticket.status === "closed"; }).length], ["Gem. afhandeltijd", average ? Math.max(1, Math.round(average / 3600000)) + " uur" : "Nog geen data"]].forEach(function (metric) {
        var card = document.createElement("div"); card.className = "support-ticket-stat";
        var value = document.createElement("strong"); value.textContent = metric[1];
        var label = document.createElement("span"); label.textContent = metric[0];
        card.append(value, label); supportStats.appendChild(card);
      });
    }
    var selected = supportSelect.value;
    supportSelect.replaceChildren(new Option("Selecteer een ticket", ""));
    tickets.slice().sort(function (a, b) { return String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")); }).forEach(function (ticket) {
      supportSelect.appendChild(new Option(ticket.subject + " · " + ticket.username + " · " + ticket.status + (ticket.assignedTo ? " · " + ticket.assignedTo : ""), ticket.id));
    });
    if (tickets.some(function (ticket) { return ticket.id === selected; })) supportSelect.value = selected;
    var ticket = tickets.find(function (item) { return item.id === supportSelect.value; });
    supportForm.hidden = !ticket;
    supportForm.elements.id.value = ticket ? ticket.id : "";
    if (!ticket) {
      supportDetail.textContent = tickets.length ? "Selecteer een ticket om het gesprek te bekijken." : "Er zijn nog geen supporttickets.";
      return;
    }
    supportDetail.replaceChildren();
    var summary = document.createElement("header"); summary.className = "support-admin-summary";
    var title = document.createElement("strong"); title.textContent = ticket.subject;
    var meta = document.createElement("span"); meta.textContent = ticket.username + " · " + ticket.category + " · " + ticket.discordId;
    summary.append(title, meta); supportDetail.appendChild(summary);
    var ticketCategory = (content.supportCategories || []).find(function (item) { return item.id === ticket.categoryId; });
    Object.entries(ticket.answers || {}).forEach(function (entry) {
      var question = (ticket.questionSnapshot || []).find(function (item) { return item.id === entry[0]; }) || (ticketCategory && ticketCategory.questions || []).find(function (item) { return item.id === entry[0]; });
      var label = question ? question.label : entry[0];
      if (entry[1] && typeof entry[1] === "object" && entry[1].attachment === true) {
        var attachment = document.createElement("div"); attachment.className = "support-admin-answer support-admin-file";
        var details = document.createElement("span"); details.textContent = label + ": " + entry[1].name + " · " + Math.max(1, Math.ceil((Number(entry[1].size) || 0) / 1024)) + " KB";
        var download = document.createElement("button"); download.type = "button"; download.className = "btn btn-ghost"; download.textContent = "Bijlage downloaden"; download.dataset.supportAttachment = entry[0]; download.dataset.ticketId = ticket.id;
        attachment.append(details, download); supportDetail.appendChild(attachment);
      } else {
        var answer = document.createElement("p"); answer.className = "support-admin-answer";
        answer.textContent = label + ": " + (Array.isArray(entry[1]) ? entry[1].join(", ") : String(entry[1])); supportDetail.appendChild(answer);
      }
    });
    (ticket.internalNotes || []).forEach(function (entry) {
      var note = document.createElement("article"); note.className = "support-admin-note";
      var author = document.createElement("strong"); author.textContent = "Interne notitie · " + (entry.authorName || "Support");
      var body = document.createElement("p"); body.textContent = entry.content; body.style.whiteSpace = "pre-wrap";
      var date = document.createElement("time"); var parsed = new Date(entry.createdAt); date.textContent = Number.isNaN(parsed.getTime()) ? "" : new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" }).format(parsed);
      note.append(author, body, date); supportDetail.appendChild(note);
    });
    var transcript = document.createElement("div"); transcript.className = "support-admin-transcript";
    (ticket.messages || []).forEach(function (message) {
      var bubble = document.createElement("article"); bubble.className = "support-admin-message" + (message.authorRole === "staff" ? " is-staff" : "");
      var head = document.createElement("header");
      var author = document.createElement("strong"); author.textContent = message.authorRole === "staff" ? (message.authorName || "Support") : ticket.username;
      var time = document.createElement("time");
      var parsed = new Date(message.createdAt);
      time.textContent = Number.isNaN(parsed.getTime()) ? "" : new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" }).format(parsed);
      var body = document.createElement("p"); body.textContent = message.content; body.style.whiteSpace = "pre-wrap";
      head.append(author, time); bubble.append(head, body); transcript.appendChild(bubble);
    });
    supportDetail.appendChild(transcript);
    supportForm.elements.status.value = ticket.status;
    supportForm.elements.assignedTo.value = ticket.assignedTo || "";
    var categorySelect = supportForm.elements.categoryId;
    var selectedCategory = ticket.categoryId || "";
    categorySelect.replaceChildren(new Option("Huidige categorie behouden", ""));
    (content.supportCategories || []).forEach(function (category) { categorySelect.add(new Option(category.name, category.id)); });
    categorySelect.value = selectedCategory;
    supportForm.elements.status.disabled = !can("support:manage");
    supportForm.elements.assignedTo.disabled = !can("support:manage");
    categorySelect.disabled = !can("support:manage");
    supportForm.elements.message.disabled = !can("support:manage");
    supportForm.elements.internalNote.disabled = !can("support:manage");
    supportForm.querySelector("button[type=submit]").hidden = !can("support:manage");
  }
  function renderSupportCategories() {
    if (!supportCategoryEditor) return;
    supportCategoryEditor.replaceChildren();
    supportCategoryDraft.forEach(function (category, index) {
      var card = document.createElement("article"); card.className = "cms-list-item is-static";
      var head = document.createElement("div"); head.className = "cms-actions";
      var name = document.createElement("input"); name.value = category.name || ""; name.placeholder = "Categorienaam"; name.dataset.categoryName = index;
      var id = document.createElement("input"); id.value = category.id || ""; id.placeholder = "id-zonder-spaties"; id.dataset.categoryId = index;
      var enabledLabel = document.createElement("label"); enabledLabel.className = "check";
      var enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.checked = category.enabled !== false; enabled.dataset.categoryEnabled = index;
      var enabledText = document.createElement("span"); enabledText.textContent = "Actief"; enabledLabel.append(enabled, enabledText);
      var removeCategory = document.createElement("button"); removeCategory.type = "button"; removeCategory.className = "btn btn-danger"; removeCategory.textContent = "Categorie verwijderen"; removeCategory.dataset.removeCategory = index;
      head.append(name, id, enabledLabel, removeCategory); card.appendChild(head);
      var description = document.createElement("input"); description.value = category.description || ""; description.placeholder = "Korte toelichting"; description.dataset.categoryDescription = index; card.appendChild(description);
      (category.questions || []).forEach(function (question, questionIndex) {
        var row = document.createElement("div"); row.className = "cms-actions";
        var qid = document.createElement("input"); qid.value = question.id || ""; qid.placeholder = "vraag-id"; qid.dataset.questionId = index + ":" + questionIndex;
        var label = document.createElement("input"); label.value = question.label || ""; label.placeholder = "Vraag"; label.dataset.questionLabel = index + ":" + questionIndex;
        var type = document.createElement("select"); type.dataset.questionType = index + ":" + questionIndex;
        [["short", "Korte tekst"], ["long", "Lange tekst"], ["choice", "Keuze"], ["dropdown", "Keuzelijst"], ["file", "Bestandsbijlage (PDF/afbeelding)"]].forEach(function (option) { var el = new Option(option[1], option[0]); type.add(el); }); type.value = question.type || "short";
        var requiredLabel = document.createElement("label"); requiredLabel.className = "check";
        var required = document.createElement("input"); required.type = "checkbox"; required.checked = question.required === true; required.dataset.questionRequired = index + ":" + questionIndex;
        requiredLabel.append(required, document.createTextNode("Verplicht"));
        var options = document.createElement("input"); options.value = Array.isArray(question.options) ? question.options.join(", ") : ""; options.placeholder = "Opties, komma-gescheiden"; options.dataset.questionOptions = index + ":" + questionIndex; options.hidden = !["choice", "dropdown"].includes(type.value);
        type.addEventListener("change", function () { options.hidden = !["choice", "dropdown"].includes(type.value); });
        var removeQuestion = document.createElement("button"); removeQuestion.type = "button"; removeQuestion.className = "btn btn-ghost"; removeQuestion.textContent = "Vraag verwijderen"; removeQuestion.dataset.removeQuestion = index + ":" + questionIndex;
        row.append(qid, label, type, requiredLabel, options, removeQuestion); card.appendChild(row);
      });
      var addQuestion = document.createElement("button"); addQuestion.type = "button"; addQuestion.className = "btn btn-ghost"; addQuestion.textContent = "Vraag toevoegen"; addQuestion.dataset.addQuestion = index; card.appendChild(addQuestion);
      supportCategoryEditor.appendChild(card);
    });
  }
  function readSupportCategoryInputs() {
    supportCategoryEditor.querySelectorAll("[data-category-name]").forEach(function (input) { supportCategoryDraft[Number(input.dataset.categoryName)].name = input.value; });
    supportCategoryEditor.querySelectorAll("[data-category-id]").forEach(function (input) { supportCategoryDraft[Number(input.dataset.categoryId)].id = input.value; });
    supportCategoryEditor.querySelectorAll("[data-category-enabled]").forEach(function (input) { supportCategoryDraft[Number(input.dataset.categoryEnabled)].enabled = input.checked; });
    supportCategoryEditor.querySelectorAll("[data-category-description]").forEach(function (input) { supportCategoryDraft[Number(input.dataset.categoryDescription)].description = input.value; });
    supportCategoryEditor.querySelectorAll("[data-question-id]").forEach(function (input) { var p = input.dataset.questionId.split(":").map(Number); supportCategoryDraft[p[0]].questions[p[1]].id = input.value; });
    supportCategoryEditor.querySelectorAll("[data-question-label]").forEach(function (input) { var p = input.dataset.questionLabel.split(":").map(Number); supportCategoryDraft[p[0]].questions[p[1]].label = input.value; });
    supportCategoryEditor.querySelectorAll("[data-question-type]").forEach(function (input) { var p = input.dataset.questionType.split(":").map(Number); supportCategoryDraft[p[0]].questions[p[1]].type = input.value; });
    supportCategoryEditor.querySelectorAll("[data-question-required]").forEach(function (input) { var p = input.dataset.questionRequired.split(":").map(Number); supportCategoryDraft[p[0]].questions[p[1]].required = input.checked; });
    supportCategoryEditor.querySelectorAll("[data-question-options]").forEach(function (input) { var p = input.dataset.questionOptions.split(":").map(Number); supportCategoryDraft[p[0]].questions[p[1]].options = input.value.split(",").map(function (v) { return v.trim(); }).filter(Boolean); });
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
    }).then(function (result) { content = result.content || {}; user = result.user || user; renderRecords(); renderApplications(); renderSupportTickets(); renderComments(); });
  }
  typeSelect.addEventListener("change", renderRecords);
  document.getElementById("communityNew").addEventListener("click", function () { openEditor(typeSelect.value, newItem(typeSelect.value)); });
  appSelect.addEventListener("change", renderApplications);
  if (supportSelect) supportSelect.addEventListener("change", renderSupportTickets);
  if (supportDetail) supportDetail.addEventListener("click", function (event) {
    var button = event.target.closest("[data-support-attachment]");
    if (!button) return;
    button.disabled = true; button.textContent = "Laden…";
    request({ action: "download-support-attachment", id: button.dataset.ticketId, questionId: button.dataset.supportAttachment })
      .then(function (result) { return downloadPrivateFile(result.attachment); })
      .catch(function (error) { button.textContent = error.message; })
      .finally(function () { button.disabled = false; if (button.textContent === "Laden…") button.textContent = "Bijlage downloaden"; });
  });
  if (supportForm) supportForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var output = document.getElementById("supportReplyState");
    output.textContent = "Opslaan…";
    request({
      action: "manage-support-ticket",
      id: supportForm.elements.id.value,
      status: supportForm.elements.status.value,
      message: supportForm.elements.message.value,
      assignedTo: supportForm.elements.assignedTo.value,
      categoryId: supportForm.elements.categoryId.value,
      internalNote: supportForm.elements.internalNote.value
    }).then(function () {
      supportForm.elements.message.value = "";
      supportForm.elements.internalNote.value = "";
      output.textContent = "Supportticket bijgewerkt.";
      return refresh();
    }).catch(function (error) { output.textContent = error.message; });
  });
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
    var supportPanel = document.getElementById("supportTicketPanel");
    if (supportPanel) supportPanel.hidden = !can("support:manage");
    supportCategoryDraft = (content.supportCategories || []).map(function (category) { return Object.assign({}, category, { questions: (category.questions || []).map(function (question) { return Object.assign({}, question); }) }); });
    document.getElementById("residentBroadcastForm").closest("section").hidden = !can("notifications:manage");
    document.getElementById("commentModerationList").closest("section").hidden = !can("comments:moderate");
    renderRecords(); renderApplications(); renderSupportTickets(); renderSupportCategories(); renderComments();
  }
  if (supportCategoryEditor) {
    supportCategoryEditor.addEventListener("input", readSupportCategoryInputs);
    supportCategoryEditor.addEventListener("change", readSupportCategoryInputs);
    supportCategoryEditor.addEventListener("click", function (event) {
      var target = event.target;
      if (target.dataset.addQuestion !== undefined) { readSupportCategoryInputs(); supportCategoryDraft[Number(target.dataset.addQuestion)].questions.push({ id: "vraag-" + (supportCategoryDraft[Number(target.dataset.addQuestion)].questions.length + 1), label: "", type: "short", required: false }); renderSupportCategories(); }
      if (target.dataset.removeQuestion) { readSupportCategoryInputs(); var q = target.dataset.removeQuestion.split(":").map(Number); supportCategoryDraft[q[0]].questions.splice(q[1], 1); renderSupportCategories(); }
      if (target.dataset.removeCategory !== undefined) { readSupportCategoryInputs(); supportCategoryDraft.splice(Number(target.dataset.removeCategory), 1); renderSupportCategories(); }
    });
    document.getElementById("supportCategoryAdd").addEventListener("click", function () { readSupportCategoryInputs(); supportCategoryDraft.push({ id: "categorie-" + (supportCategoryDraft.length + 1), name: "Nieuwe categorie", description: "", enabled: true, questions: [] }); renderSupportCategories(); });
    document.getElementById("supportCategorySave").addEventListener("click", function () {
      readSupportCategoryInputs(); var output = document.getElementById("supportCategoryState"); output.textContent = "Opslaan…";
      request({ action: "save-support-categories", categories: supportCategoryDraft }).then(function () { output.textContent = "Ticketcategorieën opgeslagen."; refresh(); }).catch(function (error) { output.textContent = error.message; });
    });
  }
  window.addEventListener("heerlen:admin-loaded", function (event) { update(event.detail || {}); });
  if (window.HeerlenAdminState) update(window.HeerlenAdminState);
})();
