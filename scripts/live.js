(function () {
  var cfg = window.HeerlenSettings;
  if (!cfg) return;

  var toast = document.getElementById("buyToast");
  var toastName = document.getElementById("buyToastName");
  var toastItem = document.getElementById("buyToastItem");
  var toastAvatar = document.getElementById("buyToastAvatar");
  var toastClose = document.getElementById("buyToastClose");
  var playersEl = document.getElementById("playersOnline");
  var video = document.getElementById("heroVideo");
  var timer;
  var gapTimer;
  var idx = 0;
  var queue = [];
  var maintenanceLayer = null;

  function applyMaintenance(s) {
    if (!maintenanceLayer) maintenanceLayer = document.querySelector(".site-maintenance");
    if (!s.maintenanceEnabled) {
      maintenanceLayer?.remove();
      maintenanceLayer = null;
      document.body.classList.remove("maintenance-active");
      return;
    }
    if (!maintenanceLayer) {
      maintenanceLayer = document.createElement("main");
      maintenanceLayer.className = "site-maintenance";
      maintenanceLayer.setAttribute("role", "status");
      maintenanceLayer.innerHTML = '<div class="maintenance-panel"><span class="maintenance-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l2.5 2.5"/><circle cx="12" cy="12" r="9"/><path d="M3.5 9h2M18.5 9h2"/></svg></span><p class="kicker">HEERLEN ROLEPLAY</p><h1>We zijn even bezig</h1><p class="maintenance-copy"></p><span class="maintenance-status"><i></i> Onderhoud</span></div>';
      document.body.appendChild(maintenanceLayer);
    }
    maintenanceLayer.querySelector(".maintenance-copy").textContent = s.maintenanceMessage || "We zijn snel weer terug. Probeer het later opnieuw.";
    document.body.classList.add("maintenance-active");
  }

  function settings() {
    return cfg.load();
  }

  function applyChrome() {
    var s = Object.assign({}, settings(), window.HeerlenPublicContent && window.HeerlenPublicContent.siteSettings || {});
    if (!window.HeerlenSiteEffects) applyMaintenance(s);
    var bonus = document.getElementById("promoBonus");
    var text = document.getElementById("promoText");
    var cta = document.getElementById("promoCta");
    var promo = document.querySelector(".promo");
    var title = document.getElementById("heroTitle");
    var lead = document.getElementById("heroLead");
    if (bonus) bonus.textContent = s.promoBonus;
    if (text) text.textContent = s.promoText;
    if (cta) {
      var ctaLabel = Array.prototype.find.call(cta.childNodes, function (node) { return node.nodeType === 3; });
      if (ctaLabel) ctaLabel.nodeValue = s.promoCta ? s.promoCta + " " : "";
      cta.href = "/winkel/";
    }
    if (promo) {
      var announcement = s.promoMode === "announcement";
      promo.hidden = s.promoEnabled === false;
      promo.classList.toggle("is-announcement", announcement);
      if (bonus) bonus.textContent = announcement ? "Mededeling" : s.promoBonus;
      if (cta) cta.hidden = !s.promoCta;
      var divider = promo.querySelector(".promo-divider");
      if (divider) divider.hidden = !s.promoCta;
    }
    if (title) title.textContent = s.heroTitle;
    if (lead) lead.textContent = s.heroLead;
    if (playersEl && !playersEl.dataset.live) {
      var n = Number(s.players) || 0;
      playersEl.textContent = n + " / " + (Number(s.maxPlayers) || 64);
    }
    document.querySelectorAll("[data-join]").forEach(function (el) {
      el.setAttribute("href", s.joinUrl || "https://cfx.re/join/5oayqbr");
    });
    if (video) {
      var next = s.heroVideo || "./images/hero.mp4";
      var src = video.querySelector("source");
      var hero = document.querySelector(".home-hero");
      if (src && (src.getAttribute("src") || video.dataset.videoSrc) !== next) {
        if (hero) hero.classList.remove("is-playing");
        src.removeAttribute("src");
        video.dataset.videoSrc = next;
        video.dataset.heroScheduled = "";
      }
      video.style.display = "";
      scheduleHeroVideo(video, hero);
    }
  }

  function scheduleHeroVideo(video, hero) {
    if (!video || video.dataset.heroBooted === "1" || video.dataset.heroScheduled === "1") return;
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (window.matchMedia("(max-width: 720px), (prefers-reduced-motion: reduce)").matches ||
        (connection && (connection.saveData || /^(slow-2g|2g|3g)$/.test(connection.effectiveType || "")))) return;
    video.dataset.heroScheduled = "1";
    var start = function () {
      if (!document.documentElement.contains(video) || video.dataset.heroBooted === "1") return;
      bootHeroVideo(video, hero);
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 2500 });
    else window.setTimeout(start, 1200);
  }

  function bootHeroVideo(video, hero) {
    if (!video || video.dataset.heroBooted === "1") return;
    video.dataset.heroBooted = "1";
    video.dataset.heroScheduled = "";
    var source = video.querySelector("source");
    if (source && !source.getAttribute("src")) {
      source.setAttribute("src", video.dataset.videoSrc || "./images/hero.mp4");
      video.load();
    }

    function revealVideo() {
      if (!hero || hero.classList.contains("is-playing")) return;
      if (video.readyState < 3) return;

      function go() {
        if (!hero || hero.classList.contains("is-playing")) return;
        hero.classList.add("is-playing");
      }

      // wacht op écht frame → geen zwarte flits
      if (typeof video.requestVideoFrameCallback === "function") {
        try {
          video.requestVideoFrameCallback(function () { go(); });
          return;
        } catch (e) {}
      }
      requestAnimationFrame(function () {
        requestAnimationFrame(go);
      });
    }

    video.addEventListener("loadeddata", revealVideo);
    video.addEventListener("canplay", revealVideo);
    video.addEventListener("playing", revealVideo);
    video.addEventListener("error", function () {
      video.style.display = "none";
      if (hero) hero.classList.remove("is-playing");
    });

    var play = video.play();
    if (play && play.then) {
      play.then(revealVideo).catch(function () {
        video.style.display = "none";
        if (hero) hero.classList.remove("is-playing");
      });
    } else {
      revealVideo();
    }
  }

  function activeNotes() {
    return settings().notifications.filter(function (n) { return n && n.enabled !== false && n.name && n.item; });
  }

  function showNote(note) {
    if (!toast || !note) return;
    toastName.textContent = note.name;
    toastItem.textContent = note.item;
    var base = document.body.getAttribute("data-base") || "./";
    toastAvatar.replaceChildren();
    var avatar = document.createElement("img");
    avatar.alt = "";
    avatar.src = note.avatar || (window.HeerlenAuth && window.HeerlenAuth.avatarUrl
      ? window.HeerlenAuth.avatarUrl(note.name)
      : base + "images/heerlen-mark.png");
    avatar.addEventListener("error", function () {
      if (avatar.src.indexOf("heerlen-mark.png") !== -1) return;
      avatar.src = base + "images/heerlen-mark.png";
    });
    toastAvatar.appendChild(avatar);
    toast.hidden = false;
    toast.classList.add("is-on");
    clearTimeout(timer);
    var sec = Math.max(2, Number(settings().toastSeconds) || 5);
    timer = setTimeout(hideNote, sec * 1000);
  }

  function hideNote() {
    if (!toast) return;
    toast.classList.remove("is-on");
    timer = setTimeout(function () { toast.hidden = true; }, 280);
  }

  function nextNote() {
    if (queue.length) {
      showNote(queue.shift());
      schedule();
      return;
    }
    // Geen demo-loop: alleen admin-meldingen als die bewust zijn toegevoegd
    var list = activeNotes();
    if (!list.length) {
      hideNote();
      return;
    }
    showNote(list[idx % list.length]);
    idx += 1;
    schedule();
  }

  function schedule() {
    clearTimeout(gapTimer);
    if (!queue.length && !activeNotes().length) return;
    var gap = Math.max(3, Number(settings().toastGap) || 8);
    gapTimer = setTimeout(nextNote, gap * 1000);
  }

  function pushLive(note) {
    if (!note || !note.name || !note.item) return;
    queue.push(note);
    showNote(note);
    schedule();
  }

  if (toastClose) toastClose.addEventListener("click", hideNote);

  window.addEventListener("heerlen:settings", function () {
    applyChrome();
    idx = 0;
    hideNote();
    schedule();
  });

  window.addEventListener("heerlen:purchase", function (e) {
    if (e && e.detail) pushLive(e.detail);
  });

  function setPlayers(n, max) {
    if (!playersEl) return;
    playersEl.dataset.live = "1";
    var label = n + " / " + (Number(max) || 64);
    playersEl.textContent = label;
  }

  function playersApiUrl(code) {
    var s = settings();
    var host = String(s.serverHost || "185.228.81.117").trim();
    var port = String(s.serverPort || "30120").trim();
    var custom = String(s.playersApi || "").trim();
    var fill = function (url) {
      return url
        .replace(/\{code\}/g, encodeURIComponent(code))
        .replace(/\{host\}/g, encodeURIComponent(host))
        .replace(/\{port\}/g, encodeURIComponent(port));
    };
    if (custom) return fill(custom);
    try {
      return fill(new URL("/api/players?host={host}&port={port}&code={code}", location.origin).toString());
    } catch (e) {
      return fill("/api/players?host={host}&port={port}&code={code}");
    }
  }

  function readPlayersPayload(data) {
    if (!data || typeof data !== "object") return null;
    if (data.Data) {
      return {
        clients: Number(data.Data.clients),
        max: Number(data.Data.sv_maxclients || data.Data.svMaxclients)
      };
    }
    return {
      clients: Number(data.clients),
      max: Number(data.max || data.sv_maxclients || data.svMaxclients)
    };
  }

  function fetchPlayers() {
    if (!playersEl || settings().playersLive === false) return;
    var code = (settings().joinCode || "5oayqbr").replace(/[^a-z0-9]/gi, "");
    var urls = [
      playersApiUrl(code),
      "https://frontend.cfx-services.net/api/servers/single/" + code
    ];

    function tryNext(i) {
      if (i >= urls.length) {
        delete playersEl.dataset.live;
        applyChrome();
        return;
      }
      fetch(urls[i], { cache: "no-store" })
        .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
        .then(function (data) {
          var parsed = readPlayersPayload(data);
          if (!parsed || !isFinite(parsed.clients)) throw new Error("no clients");
          setPlayers(parsed.clients, isFinite(parsed.max) ? parsed.max : 0);
        })
        .catch(function () { tryNext(i + 1); });
    }

    tryNext(0);
  }

  applyChrome();
  fetchPlayers();
  hideNote();
  if (activeNotes().length) setTimeout(nextNote, 2500);
  setInterval(fetchPlayers, 30000);

  // back/forward cache: opnieuw poster tot er een echt frame is
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted || !video) return;
    var hero = document.querySelector(".home-hero");
    if (!hero) return;
    hero.classList.remove("is-playing");
    video.dataset.heroBooted = "";
    video.dataset.heroScheduled = "";
    bootHeroVideo(video, hero);
  });
})();
