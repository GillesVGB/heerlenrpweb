(function (root) {
  var KEY = "heerlenrp_cart";
  var PAY_KEY = "heerlenrp_pays_v2";
  var NAME_KEY = "heerlenrp_name";
  var cat = root.HeerlenCatalog;
  if (!cat) return;

  var timer;

  function cart() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }

  function pays() {
    try {
      var saved = JSON.parse(localStorage.getItem(PAY_KEY));
      if (Array.isArray(saved)) return saved;
    } catch (e) {}
    return [];
  }

  function when(iso) {
    var d = new Date(iso);
    var months = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    return d.getDate() + " " + months[d.getMonth()];
  }

  function els() {
    return {
      toast: document.getElementById("toast"),
      drawer: document.getElementById("drawer"),
      shade: document.getElementById("shade"),
      cartBody: document.getElementById("cartBody"),
      cartFoot: document.getElementById("cartFoot"),
      cartBadge: document.getElementById("cartBadge"),
      cartSub: document.getElementById("cartSub"),
      cartTotal: document.getElementById("cartTotal"),
      cartWho: document.getElementById("cartWho"),
      payerName: document.getElementById("payerName"),
      payerDiscord: document.getElementById("payerDiscord"),
      payBtn: document.getElementById("payBtn"),
      cartOpen: document.getElementById("cartOpen"),
      cartClose: document.getElementById("cartClose"),
      menuBtn: document.getElementById("menuBtn"),
      navLinks: document.getElementById("navLinks"),
      donor: document.getElementById("donor"),
      paysEl: document.getElementById("pays")
    };
  }

  function showToast(text) {
    var e = els();
    if (!e.toast) return;
    e.toast.textContent = text;
    e.toast.hidden = false;
    e.toast.classList.add("is-on");
    clearTimeout(timer);
    timer = setTimeout(function () {
      e.toast.classList.remove("is-on");
      setTimeout(function () { e.toast.hidden = true; }, 280);
    }, 2200);
  }

  function thumbFor(p) {
    if (p.image) return cat.asset(p.image);
    if (p.amount) return cat.asset("images/" + p.amount + ".jpg");
    return cat.asset("images/heerlen-mark.png");
  }

  function cfxAvatar(name) {
    var auth = root.HeerlenAuth;
    return auth && auth.avatarUrl
      ? auth.avatarUrl(name)
      : "https://forum.cfx.re/user_avatar/forum.cfx.re/" + encodeURIComponent(String(name || "speler").toLowerCase()) + "/96/1.png";
  }

  function avatarMarkup(name, savedAvatar) {
    var initial = cat.esc(String(name || "S").charAt(0).toUpperCase());
    var src = cat.esc(savedAvatar || cfxAvatar(name));
    return '<span class="avatar"><img src="' + src + '" alt="" loading="lazy" decoding="async"><span aria-hidden="true">' + initial + '</span></span>';
  }

  function removeBrokenAvatars(container) {
    container.querySelectorAll(".avatar img").forEach(function (image) {
      image.addEventListener("error", function () { image.remove(); }, { once: true });
    });
  }

  function renderFeed() {
    var e = els();
    var list = pays().slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    var now = new Date();
    var totals = {};
    list.forEach(function (p) {
      var d = new Date(p.at);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return;
      totals[p.name] = (totals[p.name] || 0) + Number(p.amount || 0);
    });
    var topName = "";
    var topAmount = 0;
    Object.keys(totals).forEach(function (name) {
      if (totals[name] > topAmount) {
        topAmount = totals[name];
        topName = name;
      }
    });
    if (e.donor) {
      e.donor.innerHTML = topName
        ? avatarMarkup(topName) + '<div><strong>' + cat.esc(topName) + '</strong><small>' + cat.money(topAmount) + ' besteed</small></div>'
        : '<span class="avatar"></span><div><strong>Nog niemand</strong><small>Deze maand is er nog niks gedoneerd.</small></div>';
      removeBrokenAvatars(e.donor);
    }
    if (e.paysEl) {
      e.paysEl.innerHTML = list.length
        ? list.slice(0, 5).map(function (p) {
            return '<li>' + avatarMarkup(p.name, p.avatar) + '<div><strong>' + cat.esc(p.name) + '</strong><small>' + cat.esc(p.item) + '</small></div><time datetime="' + cat.esc(p.at) + '">' + when(p.at) + '</time></li>';
          }).join("")
        : '<li class="pays-empty"><div><strong>Nog geen betalingen</strong><small>Zodra iemand doneert, zie je het hier.</small></div></li>';
      removeBrokenAvatars(e.paysEl);
    }
  }

  function renderWho() {
    var e = els();
    if (!e.cartWho) return;
    var auth = root.HeerlenAuth && root.HeerlenAuth.session && root.HeerlenAuth.session();
    if (auth && auth.name) {
      e.cartWho.innerHTML = 'Ingelogd als <strong>' + cat.esc(auth.name) + '</strong>';
      e.cartWho.hidden = false;
    } else {
      e.cartWho.textContent = "Log rechtsboven in met Cfx.re om af te rekenen.";
      e.cartWho.hidden = false;
    }
  }

  function renderCart() {
    var e = els();
    if (!e.cartBody) return;
    var bag = cart();
    var ids = Object.keys(bag).filter(function (id) { return bag[id] > 0 && cat.pack(id); });
    var totalQty = ids.reduce(function (sum, id) { return sum + bag[id]; }, 0);
    var subtotal = ids.reduce(function (sum, id) { return sum + bag[id] * cat.basePrice(cat.pack(id)); }, 0);
    var total = ids.reduce(function (sum, id) { return sum + bag[id] * cat.priceInfo(cat.pack(id), subtotal).price; }, 0);
    if (e.cartBadge) {
      e.cartBadge.hidden = totalQty === 0;
      e.cartBadge.textContent = String(totalQty);
    }
    if (e.cartSub) e.cartSub.textContent = totalQty ? totalQty + (totalQty === 1 ? " product" : " producten") : "Leeg";
    if (e.cartTotal) e.cartTotal.textContent = cat.money(total);
    if (e.cartFoot) e.cartFoot.hidden = totalQty === 0;
    renderWho();
    if (!ids.length) {
      e.cartBody.innerHTML = '<p class="cart-empty">Je winkelmand is leeg.<br><span>Pak een stapel coins in de store.</span></p>';
    } else {
      e.cartBody.innerHTML = '<ul class="cart-items">' + ids.map(function (id) {
        var p = cat.pack(id);
        var qty = bag[id];
        var price = cat.priceInfo(p, subtotal).price;
        return '<li class="cart-item">' +
          '<a class="cart-thumb" href="' + cat.productUrl(p) + '"><img src="' + cat.esc(thumbFor(p)) + '" alt="" width="96" height="54" loading="lazy"></a>' +
          '<div class="cart-info"><strong>' + cat.esc(p.name) + '</strong><span class="cart-unit">' + cat.money(price) + ' · eenmalig</span></div>' +
          '<div class="cart-row"><span class="cart-price">' + cat.money(price * qty) + '</span>' +
          '<span class="qty"><button type="button" data-dec="' + id + '" aria-label="Minder">−</button>' +
          '<span>' + qty + '</span><button type="button" data-inc="' + id + '" aria-label="Meer">+</button></span>' +
          '<button type="button" class="drop" data-drop="' + id + '">Verwijderen</button></div></li>';
      }).join("") + "</ul>";
    }
    document.querySelectorAll("[data-add]").forEach(function (btn) {
      var qty = bag[btn.getAttribute("data-add")] || 0;
      btn.classList.toggle("is-in", qty > 0);
      if (btn.classList.contains("cart-round")) return;
      if (btn.dataset.keepLabel) return;
      btn.textContent = qty ? "In mand · " + qty : "In mand";
    });
    document.querySelectorAll("[data-cart-qty]").forEach(function (el) {
      var id = el.getAttribute("data-cart-qty");
      el.textContent = String(bag[id] || 0);
    });
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
    renderCart();
    root.dispatchEvent(new Event("heerlen:cart"));
  }

  function add(id, delta) {
    if (!cat.pack(id)) return;
    var bag = cart();
    var next = (bag[id] || 0) + delta;
    if (next <= 0) delete bag[id];
    else bag[id] = next;
    save(bag);
  }

  function openCart() {
    var e = els();
    if (!e.drawer) return;
    renderCart();
    e.drawer.classList.add("is-open");
    e.drawer.setAttribute("aria-hidden", "false");
    if (e.shade) e.shade.hidden = false;
    document.body.classList.add("cart-open");
  }

  function closeCart() {
    var e = els();
    if (!e.drawer) return;
    e.drawer.classList.remove("is-open");
    e.drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("cart-open");
    if (e.shade && !document.body.classList.contains("nav-open")) e.shade.hidden = true;
  }

  function recordLocalPayment(name, items, discordId, savedAvatar) {
    var list = pays();
    var now = new Date().toISOString();
    var first = "";
    var avatar = savedAvatar || cfxAvatar(name);
    items.forEach(function (it) {
      var p = cat.pack(it.id);
      if (!p) return;
      if (!first) first = p.name;
      list.push({
        name: name,
        avatar: avatar,
        discordId: discordId || "",
        item: p.name,
        amount: cat.priceInfo(p).price * it.quantity,
        at: now
      });
    });
    localStorage.setItem(PAY_KEY, JSON.stringify(list));
    save({});
    renderFeed();
    if (first) {
      root.dispatchEvent(new CustomEvent("heerlen:purchase", { detail: { name: name, item: first, avatar: avatar, discordId: discordId || "" } }));
    }
  }

  function finishPaidOrder() {
    var tebex = root.HeerlenTebex;
    var pending = (tebex && tebex.loadPending && tebex.loadPending()) || {};
    var name = pending.username || localStorage.getItem(NAME_KEY) || "Speler";
    var discordId = pending.discordId || localStorage.getItem("heerlenrp_discord") || "";
    var items = (pending.items || []).map(function (it) {
      return { id: it.id, quantity: it.quantity };
    });
    if (!items.length) {
      var bag = cart();
      items = Object.keys(bag).filter(function (id) { return bag[id] > 0; }).map(function (id) {
        return { id: id, quantity: bag[id] };
      });
    }
    if (items.length) recordLocalPayment(name, items, discordId, pending.avatar);
    save({});
    if (tebex && tebex.clearPending) tebex.clearPending();
    showToast("Bedankt! Je coins komen automatisch op je account.");
    closeCart();
    setPayBusy(false);
  }

  function setPayBusy(busy) {
    var e = els();
    if (!e.payBtn) return;
    e.payBtn.disabled = !!busy;
    e.payBtn.textContent = busy ? "Even geduld…" : "Betalen via Tebex";
  }

  function pay() {
    var e = els();
    var bag = cart();
    var ids = Object.keys(bag).filter(function (id) { return bag[id] > 0 && cat.pack(id); });
    var name = (e.payerName && e.payerName.value || "").trim().replace(/\s+/g, " ").slice(0, 24);
    var discordRaw = (e.payerDiscord && e.payerDiscord.value || "").trim();
    var tebex = root.HeerlenTebex;
    var discordId = tebex && tebex.normalizeDiscordId
      ? tebex.normalizeDiscordId(discordRaw)
      : String(discordRaw).replace(/[^0-9]/g, "");
    if (!ids.length) return;
    if (name.length < 2) {
      if (e.payerName) e.payerName.focus();
      showToast("Vul je spelersnaam in");
      return;
    }
    if (discordRaw && (!discordId || discordId.length < 16)) {
      if (e.payerDiscord) e.payerDiscord.focus();
      showToast("Discord ID lijkt ongeldig (alleen cijfers, 17–19 tekens)");
      return;
    }
    localStorage.setItem(NAME_KEY, name);
    if (discordId) localStorage.setItem("heerlenrp_discord", discordId);

    if (!tebex) {
      showToast("Checkout is niet beschikbaar.");
      return;
    }

    setPayBusy(true);
    tebex.loadStoreSettings().then(function () {
      var items = ids.map(function (id) {
        var p = cat.pack(id);
        return {
          id: id,
          name: p.name,
          quantity: bag[id],
          packageId: tebex.packageIdFor(id)
        };
      });
      return tebex.startCheckout(items, { username: name, discordId: discordId });
    }).then(function (result) {
      if (result && result.launched) {
        setPayBusy(false);
        showToast("Checkout geopend");
      }
      // redirect naar Cfx of fallback volgt
    }).catch(function (err) {
      setPayBusy(false);
      var msg = err && err.message ? err.message : "Betaling mislukt";
      showToast(msg);
      if (/Log eerst in met Cfx/i.test(msg)) {
        var loginBtn = document.getElementById("authLoginCfx");
        if (loginBtn) loginBtn.focus();
      }
    });
  }

  function handleTebexReturn() {
    var params = new URLSearchParams(location.search);
    var mode = params.get("tebex");
    if (!mode) return;
    var tebex = root.HeerlenTebex;
    if (!tebex) return;

    if (mode === "cancel") {
      tebex.clearPending();
      showToast("Betaling geannuleerd");
    } else if (mode === "done") {
      finishPaidOrder();
    } else if (mode === "resume") {
      setPayBusy(true);
      showToast("Bezig met checkout…");
      openCart();
      tebex.resumeCheckout().then(function (result) {
        if (result && result.launched) {
          setPayBusy(false);
          showToast("Checkout geopend");
        }
      }).catch(function (err) {
        setPayBusy(false);
        showToast(err && err.message ? err.message : "Checkout mislukt");
      });
    }

    if (history.replaceState) {
      var clean = location.pathname + location.hash;
      history.replaceState(null, "", clean);
    }
  }

  function bind() {
    var e = els();
    if (e.payBtn) {
      e.payBtn.textContent = "Betalen via Tebex";
      e.payBtn.addEventListener("click", pay);
    }
    if (e.payerName) {
      var auth = root.HeerlenAuth && root.HeerlenAuth.session && root.HeerlenAuth.session();
      var savedName = (auth && auth.name) || localStorage.getItem(NAME_KEY);
      if (savedName) e.payerName.value = savedName;
      if (auth && auth.name) {
        e.payerName.readOnly = true;
        e.payerName.title = "Ingelogd met Cfx.re / Discord";
      }
    }
    if (e.payerDiscord) {
      var auth2 = root.HeerlenAuth && root.HeerlenAuth.session && root.HeerlenAuth.session();
      var savedDiscord = (auth2 && auth2.discordId) || localStorage.getItem("heerlenrp_discord") || "";
      if (savedDiscord) e.payerDiscord.value = savedDiscord;
    }
    if (e.cartOpen) e.cartOpen.addEventListener("click", openCart);
    if (e.cartClose) e.cartClose.addEventListener("click", closeCart);
    if (e.shade) e.shade.addEventListener("click", function () {
      closeCart();
      document.body.classList.remove("nav-open");
      if (e.menuBtn) e.menuBtn.setAttribute("aria-expanded", "false");
      e.shade.hidden = true;
    });
    if (e.menuBtn && e.menuBtn.dataset.menuBound !== "true") {
      e.menuBtn.dataset.menuBound = "true";
      e.menuBtn.addEventListener("click", function () {
      var open = document.body.classList.toggle("nav-open");
      this.setAttribute("aria-expanded", open ? "true" : "false");
      if (e.shade) e.shade.hidden = !open && !(e.drawer && e.drawer.classList.contains("is-open"));
      });
    }
    if (e.navLinks) e.navLinks.addEventListener("click", function (ev) {
      if (ev.target.closest("a")) {
        document.body.classList.remove("nav-open");
        if (e.shade) e.shade.hidden = !(e.drawer && e.drawer.classList.contains("is-open"));
      }
    });
    if (e.cartBody) e.cartBody.addEventListener("click", function (ev) {
      var inc = ev.target.closest("[data-inc]");
      var dec = ev.target.closest("[data-dec]");
      var drop = ev.target.closest("[data-drop]");
      if (inc) add(inc.getAttribute("data-inc"), 1);
      if (dec) add(dec.getAttribute("data-dec"), -1);
      if (drop) add(drop.getAttribute("data-drop"), -999);
    });
    document.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-add]");
      if (!btn) return;
      var id = btn.getAttribute("data-add");
      add(id, 1);
      var p = cat.pack(id);
      if (p) showToast(p.name + " zit in je mand");
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeCart();
    });
    root.addEventListener("heerlen:tebex-complete", finishPaidOrder);
    root.addEventListener("heerlen:tebex-error", function () {
      setPayBusy(false);
      showToast("Betaling mislukt. Probeer opnieuw.");
    });
    root.addEventListener("heerlen:tebex-close", function () {
      setPayBusy(false);
    });
    root.addEventListener("heerlen:auth", function () {
      renderWho();
      var auth = root.HeerlenAuth && root.HeerlenAuth.session && root.HeerlenAuth.session();
      if (e.payerName && auth && auth.name) {
        e.payerName.value = auth.name;
        e.payerName.readOnly = true;
      }
      if (e.payerDiscord && auth && auth.discordId) e.payerDiscord.value = auth.discordId;
    });
    var year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());
    renderCart();
    renderFeed();
    handleTebexReturn();
  }

  root.HeerlenCart = {
    cart: cart,
    add: add,
    open: openCart,
    close: closeCart,
    render: renderCart,
    renderFeed: renderFeed,
    showToast: showToast,
    bind: bind
  };

  root.addEventListener("heerlen:tebex-sales", renderCart);
  root.addEventListener("heerlen:settings", renderCart);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})(window);
