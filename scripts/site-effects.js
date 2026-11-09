(function (root) {
  "use strict";

  var allowed = ["standard", "halloween", "christmas", "newyear", "easter"];
  var allowedPages = ["home", "news", "updates", "staff", "rules", "shop"];
  var sharedKeys = [
    "promoEnabled", "promoMode", "promoBonus", "promoText", "promoCta", "heroTitle", "heroLead",
    "seasonEnabled", "seasonTheme", "seasonAccentEnabled", "seasonAccent", "seasonEffects", "seasonIntensity", "seasonSpeed",
    "seasonDensity", "seasonFrequency", "seasonPages", "seasonStart", "seasonEnd",
    "maintenanceEnabled", "maintenanceMessage"
  ];
  var seasonLayer = null;
  var maintenanceLayer = null;
  var lastSettings = null;
  var scheduleTimer = 0;
  var preview = new URLSearchParams(root.location.search).get("themePreview");

  function clamp(value, min, max, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  }

  function normalize(input) {
    var out = {};
    input = input && typeof input === "object" ? input : {};
    sharedKeys.forEach(function (key) { if (input[key] !== undefined) out[key] = input[key]; });
    if (allowed.indexOf(out.seasonTheme) < 0) out.seasonTheme = "standard";
    out.seasonEnabled = out.seasonEnabled !== false;
    out.seasonAccentEnabled = out.seasonAccentEnabled === true;
    out.seasonAccent = /^#[\da-f]{6}$/i.test(String(out.seasonAccent || "")) ? out.seasonAccent : "#5aaefd";
    out.seasonEffects = out.seasonEffects !== false;
    out.seasonIntensity = clamp(out.seasonIntensity, 0.2, 2, 1);
    out.seasonSpeed = clamp(out.seasonSpeed, 0.5, 2, 1);
    out.seasonDensity = Math.round(clamp(out.seasonDensity, 0, 40, 16));
    out.seasonFrequency = clamp(out.seasonFrequency, 0.5, 2, 1);
    out.seasonPages = Array.isArray(out.seasonPages) ? out.seasonPages.filter(function (page, index, pages) {
      return allowedPages.indexOf(page) >= 0 && pages.indexOf(page) === index;
    }) : allowedPages.slice();
    out.seasonStart = String(out.seasonStart || "").slice(0, 16);
    out.seasonEnd = String(out.seasonEnd || "").slice(0, 16);
    out.promoEnabled = out.promoEnabled !== false;
    out.promoMode = out.promoMode === "announcement" ? "announcement" : "promo";
    out.promoBonus = String(out.promoBonus || "Tot +47% bonus").slice(0, 40);
    out.promoText = String(out.promoText || "").slice(0, 120);
    out.promoCta = String(out.promoCta || "").slice(0, 40);
    out.maintenanceEnabled = out.maintenanceEnabled === true;
    out.maintenanceMessage = String(out.maintenanceMessage || "We zijn snel weer terug. Probeer het later opnieuw.").slice(0, 240);
    return out;
  }

  function pageName() {
    var body = document.body;
    var page = body.dataset.page || body.dataset.contentPage || "";
    if (page === "changelog") return "updates";
    if (page === "news") return "news";
    if (page === "staff") return "staff";
    if (body.classList.contains("apv-page") || /\/regels(?:\/|$)/.test(root.location.pathname)) return "rules";
    if (/\/winkel(?:\/|$)/.test(root.location.pathname)) return "shop";
    return "home";
  }

  function themeForNow(settings, now) {
    if (!settings.seasonEnabled || settings.seasonTheme === "standard") return "standard";
    var starts = settings.seasonStart ? Date.parse(settings.seasonStart) : NaN;
    var ends = settings.seasonEnd ? Date.parse(settings.seasonEnd) : NaN;
    if (Number.isFinite(starts) && now < starts) return "standard";
    if (Number.isFinite(ends) && now >= ends) return "standard";
    return settings.seasonTheme;
  }

  function clearSeasonLayer() {
    if (seasonLayer) seasonLayer.remove();
    seasonLayer = null;
    document.querySelectorAll(".season-layer").forEach(function (node) { node.remove(); });
  }

  function renderSeason(settings) {
    var now = Date.now();
    var theme = themeForNow(settings, now);
    document.documentElement.dataset.season = theme;
    if (settings.seasonAccentEnabled) {
      document.documentElement.style.setProperty("--blue", settings.seasonAccent);
      document.documentElement.style.setProperty("--season-accent", settings.seasonAccent);
    } else {
      document.documentElement.style.removeProperty("--blue");
      document.documentElement.style.removeProperty("--season-accent");
    }
    clearSeasonLayer();

    var inScope = settings.seasonPages.indexOf(pageName()) >= 0;
    if (theme === "standard" || !settings.seasonEffects || !inScope) return;

    var reduceMotion = root.matchMedia("(prefers-reduced-motion: reduce)").matches;

    seasonLayer = document.createElement("div");
    seasonLayer.className = "season-layer season-" + theme + (reduceMotion ? " season-motion-reduced" : "");
    seasonLayer.setAttribute("aria-hidden", "true");
    seasonLayer.style.setProperty("--season-opacity", String(Math.min(0.75, 0.3 * settings.seasonIntensity)));
    seasonLayer.style.setProperty("--season-speed", String(settings.seasonSpeed));
    seasonLayer.style.setProperty("--season-frequency", String(settings.seasonFrequency));
    var speed = settings.seasonSpeed;
    var frequency = settings.seasonFrequency;
    var count = Math.min(36, Math.round(settings.seasonDensity * settings.seasonIntensity));
    var asset = function (file, className) {
      var image = document.createElement("img");
      image.className = "season-asset " + className;
      image.src = "/images/seasons/" + file;
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      image.decoding = "async";
      seasonLayer.appendChild(image);
      return image;
    };
    var ranged = function (i, step, offset) { return ((i * step + offset) % 100) + "%"; };

    if (theme === "christmas") {
      asset("christmas-lights.svg", "season-lights");
      var snowSheet = document.createElement("div");
      snowSheet.className = "season-snow-sheet";
      snowSheet.setAttribute("aria-hidden", "true");
      seasonLayer.appendChild(snowSheet);
      for (var snowIndex = 0; snowIndex < (reduceMotion ? 0 : count); snowIndex++) {
        var snow = document.createElement("span");
        snow.className = "season-snowflake";
        snow.textContent = ["❄", "❅", "✣", "·"][snowIndex % 4];
        snow.style.setProperty("--x", ranged(snowIndex, 37, 4));
        snow.style.setProperty("--drift", (18 + (snowIndex * 29) % 88) + "px");
        snow.style.setProperty("--flake-size", (8 + (snowIndex * 7) % 16) + "px");
        snow.style.setProperty("--flake-opacity", String(Math.min(.88, .38 + settings.seasonIntensity * .2)));
        snow.style.setProperty("--delay", (-snowIndex * .83 / frequency) + "s");
        snow.style.setProperty("--duration", ((20 + snowIndex % 9) / speed) + "s");
        seasonLayer.appendChild(snow);
      }
    }

    if (theme === "halloween") {
      var mistA = asset("halloween-mist.svg", "season-mist");
      mistA.style.setProperty("--mist-bottom", "3vh");
      mistA.style.setProperty("--mist-opacity", String(Math.min(.25, .1 * settings.seasonIntensity)));
      mistA.style.setProperty("--duration", (46 / speed) + "s");
      var mistB = asset("halloween-mist.svg", "season-mist");
      mistB.style.setProperty("--mist-bottom", "15vh");
      mistB.style.setProperty("--mist-opacity", String(Math.min(.16, .07 * settings.seasonIntensity)));
      mistB.style.setProperty("--delay", "-17s");
      mistB.style.setProperty("--duration", (58 / speed) + "s");
      var batCount = reduceMotion ? 3 : Math.min(5, Math.max(1, Math.ceil(Math.max(count, 1) / 9)));
      for (var batIndex = 0; batIndex < batCount; batIndex++) {
        var bat = asset("halloween-bats.svg", "season-bat");
        bat.style.setProperty("--flight-y", (13 + (batIndex * 19) % 61) + "vh");
        bat.style.setProperty("--bat-size", (58 + (batIndex % 3) * 22) + "px");
        if (reduceMotion) bat.style.left = (18 + batIndex * 27) + "%";
        bat.style.setProperty("--delay", (-batIndex * 5.7 / frequency) + "s");
        bat.style.setProperty("--duration", ((25 + batIndex * 2) / (speed * frequency)) + "s");
      }
      for (var leafIndex = 0; leafIndex < (reduceMotion ? 0 : Math.ceil(count / 5)); leafIndex++) {
        var leaf = document.createElement("span");
        leaf.className = "season-leaf";
        leaf.textContent = ["🍂", "🍁", "✦"][leafIndex % 3];
        leaf.style.setProperty("--x", ranged(leafIndex, 41, 13));
        leaf.style.setProperty("--leaf-size", (16 + leafIndex % 3 * 5) + "px");
        leaf.style.setProperty("--drift", (42 + leafIndex * 9) + "px");
        leaf.style.setProperty("--duration", ((20 + leafIndex % 5) / speed) + "s");
        leaf.style.setProperty("--delay", (-leafIndex * 2.4 / frequency) + "s");
        seasonLayer.appendChild(leaf);
      }
    }

    if (theme === "newyear") {
      // Keep signature fireworks visible even when the decorative-particle density is set to zero.
      var bursts = reduceMotion ? 5 : Math.min(9, Math.max(5, Math.ceil(count / 4)));
      for (var burstIndex = 0; burstIndex < bursts; burstIndex++) {
        var burst = document.createElement("span");
        burst.className = "season-firework " + ["gold", "alt", "violet"][burstIndex % 3];
        burst.style.setProperty("--x", ranged(burstIndex, 29, 6));
        burst.style.setProperty("--y", (12 + (burstIndex * 23) % 46) + "vh");
        burst.style.setProperty("--burst-size", (72 + (burstIndex % 4) * 30) + "px");
        burst.style.setProperty("--delay", (-burstIndex * 1.05 / frequency) + "s");
        burst.style.setProperty("--duration", (6.5 / (speed * frequency)) + "s");
        var fireworkImage = document.createElement("img");
        fireworkImage.src = "/images/seasons/newyear-fireworks.svg";
        fireworkImage.alt = "";
        fireworkImage.setAttribute("aria-hidden", "true");
        fireworkImage.decoding = "async";
        burst.appendChild(fireworkImage);
        seasonLayer.appendChild(burst);
      }
    }

    if (theme === "easter") {
      var bunny = asset("easter-decorations.svg", "season-easter-flight");
      bunny.style.setProperty("--flight-y", "42vh");
      bunny.style.setProperty("--easter-size", "clamp(88px,15vw,170px)");
      bunny.style.setProperty("--delay", "-12s");
      bunny.style.setProperty("--duration", (34 / (speed * frequency)) + "s");
      for (var petalIndex = 0; petalIndex < (reduceMotion ? 0 : Math.min(22, count)); petalIndex++) {
        var petal = document.createElement("span");
        petal.className = "season-petal";
        petal.style.setProperty("--x", ranged(petalIndex, 31, 10));
        petal.style.setProperty("--petal-color", ["#f4b7ce", "#f8d47d", "#c7a9ef", "#b7dda6"][petalIndex % 4]);
        petal.style.setProperty("--drift", (30 + (petalIndex * 13) % 70) + "px");
        petal.style.setProperty("--delay", (-petalIndex * 1.3 / frequency) + "s");
        petal.style.setProperty("--duration", ((21 + petalIndex % 7) / speed) + "s");
        seasonLayer.appendChild(petal);
      }
    }
    document.body.appendChild(seasonLayer);
  }

  function applyPromo(settings) {
    var promo = document.querySelector(".promo");
    if (!promo) return;
    promo.hidden = settings.promoEnabled === false;
    promo.classList.toggle("is-announcement", settings.promoMode === "announcement");
    var bonus = document.getElementById("promoBonus");
    var text = document.getElementById("promoText");
    var cta = document.getElementById("promoCta");
    if (bonus) bonus.textContent = settings.promoMode === "announcement" ? "Mededeling" : settings.promoBonus;
    if (text) text.textContent = settings.promoText;
    if (cta) {
      var label = Array.prototype.find.call(cta.childNodes, function (node) { return node.nodeType === 3; });
      if (label) label.nodeValue = settings.promoCta ? settings.promoCta + " " : "";
      cta.href = "/winkel/";
      cta.hidden = !settings.promoCta;
    }
    var divider = promo.querySelector(".promo-divider");
    if (divider) divider.hidden = !settings.promoCta;
  }

  function renderMaintenance(settings) {
    if (!settings.maintenanceEnabled) {
      if (maintenanceLayer) maintenanceLayer.remove();
      maintenanceLayer = null;
      document.body.classList.remove("maintenance-active");
      return;
    }
    if (!maintenanceLayer) {
      maintenanceLayer = document.createElement("section");
      maintenanceLayer.className = "site-maintenance";
      maintenanceLayer.setAttribute("role", "status");
      maintenanceLayer.setAttribute("aria-live", "polite");
      maintenanceLayer.innerHTML = '<div class="maintenance-panel"><span class="maintenance-mark" aria-hidden="true">✦</span><p class="kicker">HEERLEN ROLEPLAY</p><h1>We zijn even bezig</h1><p class="maintenance-copy"></p><span class="maintenance-status"><i></i> Onderhoud</span></div>';
      document.body.appendChild(maintenanceLayer);
    }
    maintenanceLayer.querySelector(".maintenance-copy").textContent = settings.maintenanceMessage;
    document.body.classList.add("maintenance-active");
  }

  function previewOverrides(settings) {
    if (!preview || allowed.indexOf(preview) < 0) return settings;
    var params = new URLSearchParams(root.location.search);
    settings.seasonEnabled = true;
    settings.seasonTheme = preview;
    settings.seasonAccentEnabled = !!params.get("themeAccent");
    if (settings.seasonAccentEnabled) {
      var previewAccent = params.get("themeAccent");
      if (/^#[\da-f]{6}$/i.test(previewAccent || "")) settings.seasonAccent = previewAccent;
      else settings.seasonAccentEnabled = false;
    }
    settings.seasonEffects = params.get("themeEffects") !== "0";
    settings.seasonIntensity = clamp(params.get("themeIntensity"), 0.2, 2, settings.seasonIntensity);
    settings.seasonSpeed = clamp(params.get("themeSpeed"), 0.5, 2, settings.seasonSpeed);
    settings.seasonDensity = Math.round(clamp(params.get("themeDensity"), 0, 40, settings.seasonDensity));
    settings.seasonFrequency = clamp(params.get("themeFrequency"), 0.5, 2, settings.seasonFrequency);
    settings.seasonPages = [pageName()];
    settings.seasonStart = "";
    settings.seasonEnd = "";
    settings.maintenanceEnabled = false;
    return settings;
  }

  function scheduleBoundary(settings) {
    root.clearTimeout(scheduleTimer);
    if (preview) return;
    var now = Date.now();
    var boundaries = [settings.seasonStart, settings.seasonEnd].map(function (value) { return value ? Date.parse(value) : NaN; }).filter(function (time) { return Number.isFinite(time) && time > now; });
    if (!boundaries.length) return;
    var delay = Math.min.apply(Math, boundaries) - now + 50;
    scheduleTimer = root.setTimeout(function () { if (lastSettings) apply(lastSettings); }, Math.min(delay, 2147480000));
  }

  function apply(input) {
    var settings = previewOverrides(normalize(input));
    lastSettings = settings;
    var config = root.HeerlenSettings;
    if (config && config.save && !preview) {
      try { config.save(Object.assign(config.load(), settings)); } catch (error) {}
    }
    applyPromo(settings);
    renderSeason(settings);
    renderMaintenance(settings);
    scheduleBoundary(settings);
    root.dispatchEvent(new CustomEvent("heerlen:site-settings", { detail: settings }));
    root.dispatchEvent(new CustomEvent("heerlen:settings", { detail: settings }));
  }

  function load() {
    if (root.HeerlenContentPromise) return root.HeerlenContentPromise;
    root.HeerlenContentPromise = fetch("/api/content", { cache: "default" }).then(function (response) {
      if (!response.ok) throw new Error("Site-instellingen zijn tijdelijk niet beschikbaar");
      return response.json();
    });
    return root.HeerlenContentPromise;
  }

  root.HeerlenSiteEffects = { apply: apply, load: load, current: function () { return lastSettings; } };
  if (document.body.classList.contains("admin-body") || /\/admin(?:\.html)?\/?$/.test(root.location.pathname)) return;

  apply(root.HeerlenSettings ? root.HeerlenSettings.load() : {});
  if (root.HeerlenPublicContent && root.HeerlenPublicContent.siteSettings) {
    apply(root.HeerlenPublicContent.siteSettings);
  } else {
    load().then(function (data) {
      root.HeerlenPublicContent = data;
      if (data && data.siteSettings) apply(data.siteSettings);
    }).catch(function () {});
  }
})(window);
