(function () {
  "use strict";
  var page = document.body.getAttribute("data-community-page");
  var status = document.getElementById("communityStatus");
  var cards = document.getElementById("communityCards");
  var cache = null;
  document.querySelectorAll("[data-year]").forEach(function (item) { item.textContent = String(new Date().getFullYear()); });

  function node(tag, className, text) {
    var item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = String(text);
    return item;
  }
  function api(action, data) {
    return fetch("/api/community", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ action: action }, data || {}))
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (result) {
        if (!response.ok) throw new Error(result.error || "De actie is niet gelukt.");
        return result;
      });
    });
  }
  function loadContent() {
    return fetch("/api/content", { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("De inhoud kan momenteel niet worden geladen.");
      return response.json();
    });
  }
  function dateLabel(value) {
    var time = Date.parse(value);
    return Number.isFinite(time) ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short" }).format(new Date(time)) : "";
  }
  function image(parent, src, alt, className) {
    if (!src) return;
    var item = node("img", className || "");
    item.src = src;
    item.alt = alt || "";
    item.loading = "lazy";
    parent.appendChild(item);
  }
  function empty(target, text) {
    target.replaceChildren(node("p", "community-empty", text));
  }
  function eventCard(event, currentRsvps) {
    var card = node("article", "community-card" + (event.featured ? " is-featured" : ""));
    image(card, event.image, "", "");
    var meta = node("div", "community-meta");
    meta.appendChild(node("span", "community-pill", dateLabel(event.startsAt)));
    if (event.location) meta.appendChild(node("span", "community-pill", event.location));
    if (event.capacity) meta.appendChild(node("span", "community-pill", event.attendeeCount + " / " + event.capacity + " plekken"));
    card.appendChild(meta);
    card.appendChild(node("h2", "", event.title));
    card.appendChild(node("p", "", event.excerpt || event.description));
    var button = node("button", "btn btn-primary", "Aanmelden");
    button.type = "button";
    var current = currentRsvps.find(function (item) { return item.eventId === event.id; });
    if (current) { button.textContent = current.status === "waitlist" ? "Op wachtlijst · afmelden" : "Aangemeld · afmelden"; button.className = "btn btn-ghost"; }
    if (Date.parse(event.startsAt) <= Date.now()) { button.disabled = true; button.textContent = "Evenement afgelopen"; }
    button.addEventListener("click", function () {
      button.disabled = true;
      api("event-rsvp", { eventId: event.id, cancel: !!current }).then(function (result) {
        status.textContent = current ? "Je aanmelding is verwijderd." : result.status === "waitlist" ? "Je staat op de wachtlijst." : "Je bent aangemeld.";
        return renderEvents(cache);
      }).catch(function (error) {
        status.textContent = error.message + (error.message.indexOf("Log in") >= 0 ? " " : "");
        if (error.message.indexOf("Log in") >= 0) {
          var link = node("a", "content-more", "Inloggen met Discord");
          link.href = "/api/auth/discord?next=%2Fevents%2F";
          status.appendChild(link);
        }
        button.disabled = false;
      });
    });
    card.appendChild(button);
    return card;
  }
  function renderEvents(data) {
    cache = data;
    if (!cards) return;
    var events = Array.isArray(data.events) ? data.events : [];
    var rsvpPromise = fetch("/api/community", { credentials: "same-origin", cache: "no-store" }).then(function (response) {
      if (!response.ok) return [];
      return response.json().then(function (result) { return result.rsvps || []; });
    });
    return rsvpPromise.then(function (rsvps) {
      cards.replaceChildren();
      if (!events.length) return empty(cards, "Er zijn momenteel geen evenementen aangekondigd.");
      events.forEach(function (event) { cards.appendChild(eventCard(event, rsvps)); });
    });
  }
  function renderQuestion(question, index) {
    var fieldset = node("fieldset", "community-question");
    fieldset.dataset.questionId = question.id;
    fieldset.dataset.questionType = question.type;
    fieldset.dataset.conditions = JSON.stringify(question.conditions || []);
    fieldset.dataset.conditionMode = question.conditionMode || "all";
    var legend = node("legend", "", question.title + (question.required ? " *" : ""));
    fieldset.appendChild(legend);
    if (question.description) fieldset.appendChild(node("p", "", question.description));
    if (question.type === "info") {
      fieldset.appendChild(node("p", "", question.description || question.title));
      return fieldset;
    }
    var name = "question-" + question.id;
    if (question.type === "short" || question.type === "long" || question.type === "number" || question.type === "date") {
      var control = question.type === "long" ? node("textarea") : node("input");
      control.name = name;
      if (question.type !== "long") control.type = question.type === "short" ? "text" : question.type;
      control.required = question.required === true;
      if (question.maxLength) control.maxLength = question.maxLength;
      if (question.minLength) control.minLength = question.minLength;
      if (question.type === "long") control.rows = 4;
      fieldset.appendChild(control);
    } else if (question.type === "file") {
      var file = node("input");
      file.type = "file"; file.name = name; file.accept = (question.allowedFiles || []).join(","); file.required = question.required === true;
      file.dataset.fileQuestion = "true";
      fieldset.appendChild(file);
      fieldset.appendChild(node("small", "", "PDF, PNG, JPEG of WebP · maximaal 400 KB"));
    } else {
      var options = question.type === "boolean" ? ["Ja", "Nee"] : question.options || [];
      if (question.type === "dropdown") {
        var select = node("select"); select.name = name; select.required = question.required === true;
        select.appendChild(node("option", "", "Kies een optie")); select.options[0].value = "";
        options.forEach(function (option) { var entry = node("option", "", option); entry.value = option; select.appendChild(entry); });
        fieldset.appendChild(select);
      } else {
        var group = node("div", "community-options");
        options.forEach(function (option, optionIndex) {
          var label = node("label");
          var input = node("input");
          input.type = question.type === "multiple" ? "checkbox" : "radio";
          input.name = question.type === "multiple" ? name + "[]" : name;
          input.value = option; input.required = question.required === true && question.type !== "multiple";
          label.append(input, document.createTextNode(option)); group.appendChild(label);
        });
        fieldset.appendChild(group);
      }
    }
    return fieldset;
  }
  function answerValue(form, question) {
    var name = "question-" + question.id;
    if (question.type === "file") return form.elements.namedItem(name)?.dataset.value || "";
    if (question.type === "multiple") return Array.from(form.querySelectorAll('[name="' + name + '[]"]:checked')).map(function (item) { return item.value; });
    var control = form.elements.namedItem(name);
    return control ? control.value : "";
  }
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || file.size > 400 * 1024 || !/^(application\/pdf|image\/(png|jpeg|webp))$/.test(file.type)) return reject(new Error("Kies een PDF, PNG, JPEG of WebP-bestand tot 400 KB."));
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error("Het bestand kon niet worden gelezen.")); };
      reader.readAsDataURL(file);
    });
  }
  function matchesConditions(question, answers) {
    var conditions = question.conditions || [];
    if (!conditions.length) return true;
    var match = function (condition) {
      var answer = answers[condition.questionId];
      return Array.isArray(answer) ? answer.indexOf(condition.value) >= 0 : String(answer || "") === String(condition.value || "");
    };
    return question.conditionMode === "any" ? conditions.some(match) : conditions.every(match);
  }
  function openApplication(job, data) {
    var panel = document.getElementById("applicationPanel");
    var form = node("form", "community-form");
    var applicationForm = (data.applicationForms || []).find(function (item) { return item.id === job.formId; });
    if (!applicationForm) { status.textContent = "Het formulier is niet beschikbaar."; return; }
    panel.hidden = false;
    panel.replaceChildren(node("h2", "", "Solliciteren: " + job.title));
    panel.appendChild(node("p", "", applicationForm.description || "Vul de vragen in om je sollicitatie te versturen."));
    if (job.webhookEnabled) panel.appendChild(node("p", "community-status", "Let op: je sollicitatieantwoorden en eventuele bestanden worden ook naar het Discord-kanaal van deze vacature gestuurd."));
    var inGame = node("input"); inGame.name = "inGameName"; inGame.maxLength = 80;
    var nameLabel = node("label"); nameLabel.append(node("span", "", "In-game naam"), inGame); form.appendChild(nameLabel);
    (applicationForm.sections || []).forEach(function (section) {
      form.appendChild(node("h3", "", section.title));
      if (section.description) form.appendChild(node("p", "", section.description));
      applicationForm.questions.filter(function (question) { return question.sectionId === section.id; })
        .forEach(function (question, index) { form.appendChild(renderQuestion(question, index)); });
    });
    applicationForm.questions.filter(function (question) { return !question.sectionId; })
      .forEach(function (question, index) { form.appendChild(renderQuestion(question, index)); });
    var submit = node("button", "btn btn-primary", "Sollicitatie versturen"); submit.type = "submit";
    var note = node("p", "community-status"); note.setAttribute("role", "status");
    form.append(submit, note);
    form.addEventListener("change", function () {
      var answers = {};
      applicationForm.questions.forEach(function (question) { answers[question.id] = answerValue(form, question); });
      form.querySelectorAll("[data-question-id]").forEach(function (questionNode) {
        var question = applicationForm.questions.find(function (entry) { return entry.id === questionNode.dataset.questionId; });
        var hidden = question ? !matchesConditions(question, answers) : false;
        questionNode.hidden = hidden;
        questionNode.disabled = hidden;
      });
    });
    form.dispatchEvent(new Event("change"));
    form.querySelectorAll("[data-file-question]").forEach(function (input) {
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        readFile(file).then(function (dataUrl) { input.dataset.value = dataUrl; }).catch(function (error) { note.textContent = error.message; input.value = ""; });
      });
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault(); submit.disabled = true; note.textContent = "Versturen…";
      Promise.all(applicationForm.questions.filter(function (question) { return question.type === "file"; }).map(function (question) {
        var input = form.elements.namedItem("question-" + question.id);
        if (!input || !input.files || !input.files[0]) return Promise.resolve();
        return readFile(input.files[0]).then(function (dataUrl) { input.dataset.value = dataUrl; });
      })).then(function () {
        var answers = {};
        applicationForm.questions.forEach(function (question) { answers[question.id] = answerValue(form, question); });
        return api("submit-application", { jobId: job.id, inGameName: inGame.value, answers: answers });
      }).then(function (result) {
        note.textContent = result.webhook && result.webhook.delivered === false
          ? result.webhook.message
          : "Je sollicitatie is ontvangen. Je kunt de status volgen via je dashboard.";
        form.reset();
      }).catch(function (error) {
        note.textContent = error.message;
        if (error.message.indexOf("Log in") >= 0) {
          var login = node("a", "content-more", "Inloggen met Discord");
          login.href = "/api/auth/discord?next=%2Fsolliciteren%2F";
          note.appendChild(login);
        }
      }).finally(function () { submit.disabled = false; });
    });
    panel.appendChild(form);
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function renderJobs(data) {
    if (!cards) return;
    var jobs = Array.isArray(data.jobs) ? data.jobs : [];
    cards.replaceChildren();
    if (!jobs.length) return empty(cards, "Er zijn momenteel geen vacatures.");
    jobs.forEach(function (job) {
      var card = node("article", "community-card");
      image(card, job.image, "", "");
      card.appendChild(node("h2", "", job.title));
      card.appendChild(node("p", "", job.excerpt || job.description));
      if (job.requirements) card.appendChild(node("p", "", "Vereisten: " + job.requirements));
      var button = node("button", "btn btn-primary", "Bekijk vacature & solliciteer"); button.type = "button";
      button.addEventListener("click", function () {
        var panel = document.getElementById("applicationPanel");
        panel.replaceChildren(node("h2", "", job.title), node("p", "", job.description || job.excerpt));
        if (job.responsibilities) panel.appendChild(node("p", "", "Verantwoordelijkheden: " + job.responsibilities));
        if (job.information) panel.appendChild(node("p", "", job.information));
        var apply = node("button", "btn btn-primary", "Solliciteren"); apply.type = "button";
        apply.addEventListener("click", function () { openApplication(job, data); });
        panel.appendChild(apply); panel.hidden = false; panel.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      card.appendChild(button); cards.appendChild(card);
    });
  }
  function renderHelp(data) {
    var search = document.getElementById("helpSearch");
    var category = document.getElementById("helpCategory");
    var articles = data.helpArticles || [];
    (data.helpCategories || []).forEach(function (item) {
      var option = node("option", "", item.name); option.value = item.id; category.appendChild(option);
    });
    function render() {
      var query = search.value.trim().toLocaleLowerCase("nl");
      var filtered = articles.filter(function (item) {
        var cat = (data.helpCategories || []).find(function (entry) { return entry.id === item.category || entry.name === item.category; });
        var categoryMatch = !category.value || item.category === category.value || (cat && cat.id === category.value);
        return categoryMatch && [item.title, item.category, item.excerpt, item.content].concat(item.keywords || []).join(" ").toLocaleLowerCase("nl").indexOf(query) >= 0;
      });
      cards.replaceChildren();
      if (!filtered.length) return empty(cards, "Geen artikelen gevonden.");
      filtered.forEach(function (item) {
        var card = node("article", "community-card");
        image(card, item.image, "", "");
        card.appendChild(node("span", "community-pill", item.category));
        card.appendChild(node("h2", "", item.title));
        card.appendChild(node("p", "", item.excerpt || item.content));
        if (item.content && item.content !== item.excerpt) card.appendChild(node("details", "", ""));
        var details = card.querySelector("details");
        if (details) { details.appendChild(node("summary", "", "Lees verder")); details.appendChild(node("p", "", item.content)); }
        cards.appendChild(card);
      });
    }
    search.addEventListener("input", render); category.addEventListener("change", render); render();
  }
  function renderProfile(data) {
    var target = document.getElementById("communityProfile");
    var slug = new URLSearchParams(location.search).get("id");
    var profile = (data.profiles || []).find(function (item) { return item.slug === slug; });
    if (!profile) return empty(target, "Dit profiel is niet beschikbaar of is privé.");
    target.replaceChildren();
    image(target, profile.banner, "", "community-profile-banner");
    var header = node("header");
    image(header, profile.avatar, "", "community-profile-avatar");
    header.appendChild(node("h1", "community-heading", profile.username));
    if (profile.inGameName) header.appendChild(node("p", "community-pill", "In-game naam · " + profile.inGameName));
    target.appendChild(header);
    if (profile.bio) target.appendChild(node("p", "", profile.bio));
    var awards = node("section", "community-grid");
    (profile.achievements || []).forEach(function (award) {
      var item = node("article", "community-card");
      image(item, award.image, "", "community-profile-avatar");
      item.appendChild(node("h2", "", (award.icon || "✦") + " " + award.title));
      if (award.description) item.appendChild(node("p", "", award.description));
      awards.appendChild(item);
    });
    if (awards.childNodes.length) { target.appendChild(node("h2", "", "Onderscheidingen")); target.appendChild(awards); }
  }
  if (page === "profile") {
    loadContent().then(renderProfile).catch(function (error) { empty(document.getElementById("communityProfile"), error.message); });
    return;
  }
  loadContent().then(function (data) {
    if (page === "events") return renderEvents(data);
    if (page === "jobs") return renderJobs(data);
    if (page === "help") return renderHelp(data);
  }).catch(function (error) { status.textContent = error.message; if (cards) empty(cards, error.message); });
})();
