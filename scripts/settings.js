(function (root) {
  var KEY = "heerlenrp_settings";
  var PASS_KEY = "heerlenrp_admin_ok";

  var DEFAULTS = {
    promoEnabled: true,
    promoMode: "promo",
    seasonEnabled: true,
    seasonTheme: "standard",
    seasonAccentEnabled: false,
    seasonAccent: "#5aaefd",
    seasonEffects: true,
    seasonIntensity: 1,
    seasonSpeed: 1,
    seasonDensity: 16,
    seasonFrequency: 1,
    seasonPages: ["home", "news", "updates", "staff", "rules", "shop"],
    seasonStart: "",
    seasonEnd: "",
    maintenanceEnabled: false,
    maintenanceMessage: "We zijn snel weer terug. Probeer het later opnieuw.",
    promoBonus: "Tot +47% bonus",
    promoText: "op alle coinpakketten",
    promoCta: "Naar de store",
    heroTitle: "Heerlen Roleplay",
    heroLead: "Nederlandse FiveM-stad. Straten, wagens, je eigen verhaal - met een toegankelijke economie waarin roleplay voorop staat.",
    heroVideo: "./images/hero.mp4",
    joinUrl: "https://cfx.re/join/j48ry5k",
    toastSeconds: 5,
    toastGap: 8,
    notifications: [],
    tebexToken: "",
    shopProducts: {},
    tebexPackages: {
      "coins-100": "",
      "coins-200": "",
      "coins-300": "",
      "coins-400": "",
      "coins-500": "",
      "coins-600": "",
      "coins-700": "",
      "coins-800": "",
      "coins-900": "",
      "coins-1000": "",
      "coins-1100": "",
      "coins-1200": ""
    }
  };

  var DEMO_TOAST_NAMES = {
    Riekeltje57: 1,
    devano3: 1,
    Dev123456: 1,
    Elias4312421: 1,
    swessel: 1
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY));
      if (!saved || typeof saved !== "object") return clone(DEFAULTS);
      var out = clone(DEFAULTS);
      Object.keys(DEFAULTS).forEach(function (k) {
        if (saved[k] !== undefined) out[k] = saved[k];
      });
      if (!Array.isArray(out.notifications)) out.notifications = [];
      // oude demo-toasts weg: alleen echte/admin-meldingen tonen
      out.notifications = out.notifications.filter(function (n) {
        return n && n.name && !DEMO_TOAST_NAMES[n.name];
      });
      if (!out.tebexPackages || typeof out.tebexPackages !== "object") {
        out.tebexPackages = clone(DEFAULTS.tebexPackages);
      } else {
        Object.keys(DEFAULTS.tebexPackages).forEach(function (id) {
          if (out.tebexPackages[id] === undefined) out.tebexPackages[id] = "";
        });
      }
      if (/Coins geef je uit in-game met \/store/.test(String(out.heroLead || ""))) {
        out.heroLead = DEFAULTS.heroLead;
      }
      return out;
    } catch (e) {
      return clone(DEFAULTS);
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
    window.dispatchEvent(new Event("heerlen:settings"));
  }

  function uid() {
    return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  root.HeerlenSettings = {
    KEY: KEY,
    PASS_KEY: PASS_KEY,
    DEFAULTS: DEFAULTS,
    load: load,
    save: save,
    clone: clone,
    uid: uid
  };
})(window);
