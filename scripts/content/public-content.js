(function () {
  "use strict";
  var page = document.body.getAttribute("data-content-page") || "";
  var dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  function loadPublicContent() {
    if (!window.HeerlenContentPromise) {
      window.HeerlenContentPromise = fetch("/api/content", { cache: "default" }).then(function (response) { if (!response.ok) throw new Error("content unavailable"); return response.json(); });
    }
    return window.HeerlenContentPromise;
  }
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function formatDate(value) {
    var date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? "" : dateFmt.format(date);
  }
  function card(item, type) {
    var article = element("article", "content-card" + (item.featured ? " is-featured" : ""));
    if (item.image) {
      var img = element("img", "content-card-image");
      img.src = item.image;
      img.alt = "";
      img.loading = "lazy";
      article.appendChild(img);
    }
    var body = element("div", "content-card-body");
    var meta = element("div", "content-card-meta");
    meta.append(element("span", "content-chip", type === "changelog" ? (item.version || item.category) : item.category));
    if (item.featured) meta.appendChild(element("span", "content-chip is-new", "Uitgelicht"));
    var published = Date.parse(item.publishAt || item.updatedAt || 0);
    if (type === "changelog" && Number.isFinite(published) && Date.now() - published < 14 * 24 * 60 * 60 * 1000) meta.appendChild(element("span", "content-chip is-new", "Nieuw"));
    body.appendChild(meta);
    body.appendChild(element("h2", "", item.title));
    body.appendChild(element("p", "content-card-copy", item.excerpt || item.content));
    var foot = element("div", "content-card-foot");
    foot.appendChild(element("span", "", formatDate(item.publishAt || item.updatedAt)));
    if (type === "news") {
      var link = element("a", "content-more", "Lees bericht →");
      link.href = "/nieuws/?id=" + encodeURIComponent(item.id);
      foot.appendChild(link);
    } else if (type === "changelog") {
      var updateLink = element("a", "content-more", "Volledige update");
      updateLink.href = "/updates/?id=" + encodeURIComponent(item.id);
      updateLink.setAttribute("aria-label", "Open update: " + item.title);
      updateLink.innerHTML += ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
      foot.appendChild(updateLink);
    }
    body.appendChild(foot);
    article.appendChild(body);
    return article;
  }
  function fillCards(target, items, type, emptyText) {
    if (!target) return;
    target.replaceChildren();
    if (!items.length) { target.appendChild(element("p", "content-empty", emptyText)); return; }
    items.forEach(function (item) { target.appendChild(card(item, type)); });
  }
  function showNews(data) {
    var cards = document.getElementById("newsCards");
    var detail = document.getElementById("newsDetail");
    var all = data.news || [];
    var id = new URLSearchParams(location.search).get("id");
    if (id && detail) {
      var item = all.find(function (row) { return row.id === id; });
      if (!item) detail.appendChild(element("p", "content-empty", "Dit nieuwsbericht is niet beschikbaar."));
      else {
        var article = element("article", "news-article");
        article.appendChild(element("p", "kicker", item.category + " · " + formatDate(item.publishAt)));
        article.appendChild(element("h2", "", item.title));
        if (item.image) { var image = element("img", "news-article-image"); image.src = item.image; image.alt = ""; article.appendChild(image); }
        if (item.author) article.appendChild(element("p", "content-muted", "Door " + item.author));
        (item.content || "").split(/\n{2,}/).filter(Boolean).forEach(function (line) { article.appendChild(element("p", "", line)); });
        if (item.commentsEnabled) {
          var comments = element("section", "community-panel community-comments");
          comments.appendChild(element("h3", "", "Reacties"));
          var commentList = element("div", "community-comment-list");
          (item.comments || []).forEach(function (comment) {
            var row = element("article", "community-comment");
            row.appendChild(element("strong", "", comment.username));
            row.appendChild(element("small", "", " · " + formatDate(comment.createdAt)));
            row.appendChild(element("p", "", comment.content));
            commentList.appendChild(row);
          });
          if (!item.comments || !item.comments.length) commentList.appendChild(element("p", "content-muted", "Er zijn nog geen reacties."));
          comments.appendChild(commentList);
          var commentForm = element("form", "community-form");
          var label = element("label");
          label.appendChild(element("span", "", "Plaats een reactie"));
          var input = element("textarea"); input.name = "content"; input.required = true; input.maxLength = 1000; input.rows = 3;
          label.appendChild(input); commentForm.appendChild(label);
          var submit = element("button", "btn btn-primary", "Reactie plaatsen"); submit.type = "submit";
          var state = element("p", "community-status"); state.setAttribute("role", "status");
          commentForm.append(submit, state);
          commentForm.addEventListener("submit", function (event) {
            event.preventDefault(); submit.disabled = true; state.textContent = "Versturen…";
            fetch("/api/community", {
              method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "comment-create", newsId: item.id, content: input.value })
            }).then(function (response) {
              return response.json().then(function (result) {
                if (!response.ok) throw new Error(result.error || "Reactie plaatsen is niet gelukt.");
                return result;
              });
            }).then(function () { state.textContent = "Je reactie is geplaatst."; input.value = ""; })
              .catch(function (error) {
                state.textContent = error.message;
                if (error.message.indexOf("Log in") >= 0) {
                  var login = element("a", "content-more", "Inloggen met Discord");
                  login.href = "/api/auth/discord?next=" + encodeURIComponent("/nieuws/?id=" + item.id);
                  state.appendChild(login);
                }
              }).finally(function () { submit.disabled = false; });
          });
          comments.appendChild(commentForm);
          article.appendChild(comments);
        }
        detail.appendChild(article);
      }
      fillCards(cards, all.filter(function (row) { return row.id !== id; }).slice(0, 3), "news", "");
    } else {
      var featured = all.filter(function (row) { return row.featured; });
      fillCards(cards, featured.concat(all.filter(function (row) { return !row.featured; })), "news", "Er zijn nog geen nieuwsberichten gepubliceerd.");
    }
    fillCards(document.getElementById("homeNewsCards"), all.slice(0, 3), "news", "Nieuws verschijnt hier zodra er berichten zijn gepubliceerd.");
  }
  function showChangelog(data) {
    var target = document.getElementById("changelogCards");
    var filters = document.getElementById("changelogFilters");
    if (!target) return;
    var items = data.changelog || [];
    var detail = document.getElementById("changelogDetail");
    var selectedId = new URLSearchParams(location.search).get("id");
    if (selectedId && detail) {
      var selected = items.find(function (item) { return item.id === selectedId; });
      if (!selected) {
        detail.appendChild(element("p", "content-empty", "Deze update is niet beschikbaar."));
      } else {
        var article = element("article", "news-article update-article");
        var meta = element("p", "kicker", [selected.version || selected.category, formatDate(selected.publishAt || selected.updatedAt)].filter(Boolean).join(" · "));
        article.appendChild(meta);
        article.appendChild(element("h2", "", selected.title));
        if (selected.image) {
          var image = element("img", "news-article-image");
          image.src = selected.image;
          image.alt = "";
          image.fetchPriority = "high";
          article.appendChild(image);
        }
        if (selected.author) article.appendChild(element("p", "content-muted update-author", "Door " + selected.author));
        var content = element("div", "update-article-content");
        renderMarkdown(content, selected.content || selected.excerpt || "");
        article.appendChild(content);
        detail.appendChild(article);
        document.title = selected.title + " | Heerlen Roleplay";
      }
      if (filters) filters.hidden = true;
      var back = element("a", "update-back", "Alle updates");
      back.href = "/updates/";
      back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/><path d="M9 12h11"/></svg> Alle updates';
      detail.prepend(back);
      fillCards(target, items.filter(function (item) { return item.id !== selectedId; }).slice(0, 3), "changelog", "");
      target.setAttribute("aria-label", "Meer serverupdates");
      return;
    }
    var categories = Array.from(new Set(items.map(function (item) { return item.category; }).filter(Boolean)));
    var active = "Alles";
    function render() { fillCards(target, items.filter(function (item) { return active === "Alles" || item.category === active; }), "changelog", "Er zijn nog geen serverupdates gepubliceerd."); }
    if (filters) {
      filters.replaceChildren();
      ["Alles"].concat(categories).forEach(function (name) {
        var button = element("button", "content-filter-btn" + (name === active ? " is-active" : ""), name);
        button.type = "button";
        button.addEventListener("click", function () { active = name; filters.querySelectorAll("button").forEach(function (el) { el.classList.toggle("is-active", el.textContent === active); }); render(); });
        filters.appendChild(button);
      });
    }
    render();
  }
  function renderMarkdown(root, value) {
    root.replaceChildren();
    var list = null;
    String(value || "").split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim();
      if (!line) { list = null; return; }
      var heading = line.match(/^(#{1,4})\s+(.*)$/);
      if (heading) {
        list = null;
        root.appendChild(element(heading[1].length <= 2 ? "h3" : "h4", "", heading[2]));
      } else if (/^(?:[-*]|\d+\.)\s+/.test(line)) {
        var ordered = /^\d+\./.test(line);
        var listType = ordered ? "ol" : "ul";
        if (!list || list.tagName.toLowerCase() !== listType) { list = element(listType); root.appendChild(list); }
        list.appendChild(element("li", "", line.replace(/^(?:[-*]|\d+\.)\s+/, "")));
      } else {
        list = null;
        root.appendChild(element("p", "", line));
      }
    });
  }
  function showRules(data) {
    var versions = data.rulesVersions || [];
    if (!versions.length) return;
    var newest = versions[0];
    (newest.documents || []).forEach(function (doc) {
      var pane = document.querySelector('.doc-pane[data-pane="' + CSS.escape(doc.id) + '"]');
      if (!pane) return;
      pane.replaceChildren();
      var title = element("h2", "", doc.title);
      pane.appendChild(title);
      renderMarkdown(pane, String(doc.content || "").replace(/^# [^\n]*\n?/, ""));
    });
    var history = document.getElementById("ruleHistory");
    var select = document.getElementById("ruleHistorySelect");
    if (!history || !select || versions.length < 2) { window.dispatchEvent(new Event("heerlen:rules-updated")); return; }
    history.hidden = false;
    select.replaceChildren();
    versions.forEach(function (version, index) {
      var option = element("option", "", version.version + " — " + version.title + (index === 0 ? " (huidig)" : ""));
      option.value = version.id;
      select.appendChild(option);
    });
    var meta = document.getElementById("ruleHistoryMeta");
    var preview = document.getElementById("ruleHistoryBody");
    function showVersion() {
      var version = versions.find(function (item) { return item.id === select.value; }) || newest;
      meta.textContent = "Versie " + version.version + " · gepubliceerd op " + formatDate(version.publishedAt) + " · door " + version.author;
      preview.replaceChildren();
      (version.documents || []).forEach(function (doc) {
        var section = element("section", "rule-version-doc");
        section.appendChild(element("h3", "", doc.title));
        renderMarkdown(section, String(doc.content || "").replace(/^# [^\n]*\n?/, ""));
        preview.appendChild(section);
      });
    }
    select.addEventListener("change", showVersion);
    select.value = versions[1].id;
    showVersion();
    window.dispatchEvent(new Event("heerlen:rules-updated"));
  }
  function showStaff(data) {
    var status = document.getElementById("staffLoadState");
    var message = document.getElementById("staffLoadMessage");
    var search = document.getElementById("staffSearch");
    var cards = document.getElementById("staffCards");
    var staff = Array.isArray(data.staff) ? data.staff : [];
    function render() {
      var query = (search.value || "").toLowerCase().trim();
      var filtered = staff.filter(function (person) {
        return [person.name, person.username, person.role, person.category, person.bio].join(" ").toLowerCase().includes(query);
      });
      cards.replaceChildren();
      var groups = Array.from(new Set(filtered.map(function (person) { return person.category || "Staff"; })));
      groups.forEach(function (category) {
        var section = element("section", "staff-group");
        section.appendChild(element("h2", "", category));
        var grid = element("div", "staff-grid");
        filtered.filter(function (person) { return (person.category || "Staff") === category; }).forEach(function (person) {
          var cardNode = element("article", "staff-card");
          if (person.avatar) {
            var img = element("img", "staff-avatar");
            img.src = person.avatar;
            img.alt = "";
            img.loading = "lazy";
            cardNode.appendChild(img);
          } else cardNode.appendChild(element("div", "staff-avatar staff-avatar-fallback", (person.name || "S").slice(0, 1).toUpperCase()));
          cardNode.appendChild(element("h3", "", person.name));
          if (person.username) cardNode.appendChild(element("p", "staff-username", "@" + person.username));
          cardNode.appendChild(element("span", "content-chip", person.role));
          if (person.joinedAt) cardNode.appendChild(element("p", "staff-username", "Sinds " + formatDate(person.joinedAt)));
          if (person.bio) cardNode.appendChild(element("p", "staff-bio", person.bio));
          grid.appendChild(cardNode);
        });
        section.appendChild(grid);
        cards.appendChild(section);
      });
      if (!filtered.length) cards.appendChild(element("p", "content-empty", query ? "Geen medewerkers gevonden." : "Er zijn nog geen staffprofielen toegevoegd."));
    }
    if (!data) {
      if (status) status.hidden = false;
      if (message) message.textContent = "De openbare stafflijst kan momenteel niet worden geladen.";
      cards.replaceChildren();
      return;
    }
    if (status) status.hidden = true;
    search.addEventListener("input", render);
    render();
  }
  document.querySelectorAll("[data-year]").forEach(function (node) { node.textContent = String(new Date().getFullYear()); });
  if (page === "staff") {
    loadPublicContent().then(function (data) { showStaff(data); }).catch(function () { showStaff(null); });
    return;
  }
  if (!page && !document.getElementById("ruleHistory") && !document.getElementById("homeNewsCards")) return;
  loadPublicContent().then(function (data) {
    window.HeerlenPublicContent = data;
    if (window.HeerlenSiteEffects && data.siteSettings) window.HeerlenSiteEffects.apply(data.siteSettings);
    if (page === "news" || document.getElementById("homeNewsCards")) showNews(data);
    if (page === "changelog") showChangelog(data);
    if (document.getElementById("ruleHistory")) showRules(data);
  }).catch(function () {
    if (page === "news") fillCards(document.getElementById("newsCards"), [], "news", "Nieuws kan momenteel niet worden geladen.");
    if (page === "changelog") fillCards(document.getElementById("changelogCards"), [], "changelog", "Updates kunnen momenteel niet worden geladen.");
  });
})();
