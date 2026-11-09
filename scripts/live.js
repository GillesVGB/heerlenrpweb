(function () {
  var cfg = window.HeerlenSettings;
  if (!cfg) return;

  var toast = document.getElementById("buyToast");
  var toastName = document.getElementById("buyToastName");
  var toastItem = document.getElementById("buyToastItem");
  var toastAvatar = document.getElementById("buyToastAvatar");
  var toastClose = document.getElementById("buyToastClose");
  var playersEl = document.getElementById("playersOnline");
  var statusEl = document.getElementById("serverStatus");
  var statusLabel = document.getElementById("serverStatusLabel");
  var video = document.getElementById("heroVideo");
  var timer;
  var gapTimer;
  var playersTimer;
  var playersPending = false;
  var heroVisible = !("IntersectionObserver" in window);
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
    document.querySelectorAll("[data-join]").forEach(function (el) {
      el.setAttribute("href", s.joinUrl || "https://cfx.re/join/j48ry5k");
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
      if (!heroVisible || document.hidden) {
        video.dataset.heroScheduled = "";
        return;
      }
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
    var avatarUrl = window.HeerlenAuth && window.HeerlenAuth.avatarUrl
      ? window.HeerlenAuth.avatarUrl(note.name)
      : base + "images/heerlen-mark.png";
    avatar.src = note.avatar && !/^https:\/\/forum\.cfx\.re\/user_avatar\//i.test(note.avatar) ? note.avatar : avatarUrl;
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
    if (settings().playersLive === false) {
      clearTimeout(playersTimer);
      setStatus("unknown", "Live status uitgeschakeld");
    } else {
      fetchPlayers();
    }
  });

  window.addEventListener("heerlen:purchase", function (e) {
    if (e && e.detail) pushLive(e.detail);
  });

  function setPlayers(n, max) {
    if (!playersEl) return;
    playersEl.dataset.live = "1";
    playersEl.textContent = Math.max(0, Math.floor(n)) + " / " + (Number(max) > 0 ? Math.floor(Number(max)) : 64);
  }

  function setStatus(state, message, clients, max) {
    if (statusEl) {
      statusEl.dataset.state = state;
      statusEl.classList.remove("is-online", "is-offline", "is-unknown");
      statusEl.classList.add("is-" + state);
    }
    if (statusLabel) {
      statusLabel.textContent = message || (state === "online" ? "Online" : state === "offline" ? "Offline" : "Status onbekend");
    }
    if (state === "online") setPlayers(clients, max);
    else if (playersEl) {
      playersEl.dataset.live = "1";
      playersEl.textContent = state === "offline" ? "0 / " + (Number(max) > 0 ? Math.floor(Number(max)) : 64) : "— / —";
    }
  }

  function schedulePlayersRefresh() {
    clearTimeout(playersTimer);
    if (playersEl && !document.hidden && settings().playersLive !== false) {
      playersTimer = setTimeout(fetchPlayers, 60000);
    }
  }

  function fetchPlayers() {
    if (!playersEl) return;
    if (settings().playersLive === false) {
      setStatus("unknown", "Live status uitgeschakeld");
      return;
    }
    if (document.hidden || playersPending) return;
    playersPending = true;
    fetch("/api/players", { cache: "no-store", credentials: "same-origin" })
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) throw new Error("Status niet beschikbaar");
          return data;
        });
      })
      .then(function (data) {
        if (data && data.online === false) {
          setStatus("offline", "Offline", 0, data.max);
          return;
        }
        var clients = Number(data && data.clients);
        if (!data || !Number.isFinite(clients)) throw new Error("Ongeldige status");
        setStatus("online", "Online", clients, data.max);
      })
      .catch(function () { setStatus("unknown", "Status niet beschikbaar"); })
      .then(function () {
        playersPending = false;
        schedulePlayersRefresh();
      });
  }

  if (video && "IntersectionObserver" in window) {
    var hero = document.querySelector(".home-hero");
    var videoObserver = new IntersectionObserver(function (entries) {
      heroVisible = entries.some(function (entry) { return entry.isIntersecting; });
      if (!heroVisible) {
        video.pause();
      } else if (video.dataset.heroBooted === "1" && !document.hidden) {
        var playback = video.play();
        if (playback && playback.catch) playback.catch(function () {});
      } else {
        scheduleHeroVideo(video, hero);
      }
    }, { threshold: 0.01 });
    videoObserver.observe(video);
  }

  applyChrome();
  fetchPlayers();
  hideNote();
  if (activeNotes().length) setTimeout(nextNote, 2500);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      clearTimeout(playersTimer);
      if (video) video.pause();
      return;
    }
    if (video && heroVisible) {
      if (video.dataset.heroBooted === "1") {
        var playback = video.play();
        if (playback && playback.catch) playback.catch(function () {});
      } else {
        scheduleHeroVideo(video, document.querySelector(".home-hero"));
      }
    }
    fetchPlayers();
  });
  // back/forward cache: opnieuw poster tot er een echt frame is
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted || !video) return;
    var hero = document.querySelector(".home-hero");
    if (!hero) return;
    hero.classList.remove("is-playing");
    video.dataset.heroBooted = "";
    video.dataset.heroScheduled = "";
    scheduleHeroVideo(video, hero);
  });
})();
