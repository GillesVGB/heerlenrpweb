(function () {
  var cat = window.HeerlenCatalog;
  var cartApi = window.HeerlenCart;
  if (!cat) return;

  var page = document.body.getAttribute("data-page") || "";
  var grid = document.getElementById("grid");
  var popularGrid = document.getElementById("popularGrid");
  var empty = document.getElementById("empty");
  var count = document.getElementById("count");
  var search = document.getElementById("search");
  var sort = document.getElementById("sort");
  var categorySelect = document.getElementById("shopCategory");
  var toolbar = document.getElementById("toolbar");
  var storeTitle = document.getElementById("storeTitle");
  var storeNote = document.getElementById("storeNote");
  var productRoot = document.getElementById("productRoot");
  var currentCat = "coins";

  function bagQty(id) {
    return (cartApi && cartApi.cart()[id]) || 0;
  }

  function currentBasketSubtotal() {
    if (!cartApi || !cartApi.cart) return 0;
    var basket = cartApi.cart();
    return Object.keys(basket).reduce(function (sum, id) {
      var product = cat.pack(id);
      return product ? sum + Math.max(0, Number(basket[id]) || 0) * cat.basePrice(product) : sum;
    }, 0);
  }

  function priceMarkup(product) {
    var info = cat.priceInfo(product, currentBasketSubtotal());
    if (!info.sale) return '<span class="price">' + cat.money(info.price) + "</span>";
    if (!info.sale.eligible) {
      return '<span class="price-sale"><span class="price">' + cat.money(info.original) + '</span><small class="price-sale-label">' + cat.esc(info.sale.label) + " KORTING</small></span>";
    }
    return '<span class="price-sale"><del class="price-old">' + cat.money(info.original) + '</del><span class="price">' + cat.money(info.price) + '</span><small class="price-sale-label">' + cat.esc(info.sale.label) + " KORTING</small></span>";
  }

  function artHtml(p, link) {
    var img = cat.imageFor(p) || (p.image
      ? cat.asset(p.image)
      : p.amount
        ? cat.asset("images/" + p.amount + ".jpg")
        : cat.asset("images/heerlen-mark.png"));
    var faceClass = "art-face has-photo";
    var faceInner = '<img src="' + cat.esc(img) + '" alt="' + cat.esc(p.name) + '" loading="lazy" decoding="async">';
    var inner =
      (p.badge ? '<span class="badge-pop">' + cat.esc(p.badge) + "</span>" : "") +
      (p.bonus ? '<span class="bonus">+' + p.bonus + "% bonus</span>" : "") +
      '<div class="' + faceClass + '">' + faceInner + "</div>";
    if (link) return '<a class="art" href="' + cat.productUrl(p) + '">' + inner + "</a>";
    return '<div class="art">' + inner + "</div>";
  }

  function readMoreMarkup(p, opts) {
    return opts.readMore !== false
      ? '<a class="read-more" href="' + cat.productUrl(p) + '">Lees meer</a>'
      : "";
  }

  function shopCard(p, opts) {
    opts = opts || {};
    var qty = bagQty(p.id);
    var description = String(p.blurb || "");
    var preview = p.custom && description.length > 120
      ? description.slice(0, 117).trimEnd() + "…"
      : description;
    var round = opts.roundCart
      ? '<button type="button" class="cart-round" data-add="' + p.id + '" aria-label="' + cat.esc(p.name) + ' in winkelmand">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg></button>'
      : '<button type="button" class="buy' + (qty ? " is-in" : "") + '" data-add="' + p.id + '">' +
        (qty ? "In mand · " + qty : "In mand") + "</button>";
    return (
      '<article class="card shop-card">' +
      artHtml(p, true) +
      '<div class="card-body">' +
      '<h3><a href="' + cat.productUrl(p) + '">' + cat.esc(p.name) + "</a></h3>" +
      "<p>" + cat.esc(preview) + "</p>" +
      readMoreMarkup(p, opts) +
      '<div class="card-row">' +
      '<div class="price-wrap">' + priceMarkup(p) +
      (p.bonus ? '<span class="bonus-inline">+' + p.bonus + "% bonus</span>" : "") +
      "</div>" +
      round +
      "</div></div></article>"
    );
  }

  function popularCard(p) {
    return (
      '<article class="card popular-card">' +
      artHtml(p, true) +
      '<div class="card-body">' +
      '<h3><a href="' + cat.productUrl(p) + '">' + cat.esc(p.name) + "</a></h3>" +
      "<p>" + cat.esc(p.blurb) + "</p>" +
      '<div class="card-row">' +
      '<div class="price-wrap">' + priceMarkup(p) +
      (p.bonus ? '<span class="bonus-inline">+' + p.bonus + "% bonus</span>" : "") +
      "</div>" +
      '<button type="button" class="cart-round" data-add="' + p.id + '" aria-label="In mand">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg></button>' +
      "</div></div></article>"
    );
  }

  function renderPopular() {
    if (!popularGrid) return;
    popularGrid.innerHTML = cat.popular().map(popularCard).join("");
  }

  function renderShop() {
    if (!grid) return;
    var q = (search && search.value.trim().toLowerCase()) || "";
    var list = cat.byCat(currentCat).filter(function (p) {
      return !q || p.name.toLowerCase().indexOf(q) !== -1 || String(p.amount || "").indexOf(q) !== -1 || String(p.blurb || "").toLowerCase().indexOf(q) !== -1;
    });
    if (sort) list.sort(function (a, b) {
      var first = cat.priceInfo(a).price;
      var second = cat.priceInfo(b).price;
      return sort.value === "desc" ? second - first : first - second;
    });
    grid.hidden = false;
    if (toolbar) toolbar.hidden = false;
    grid.innerHTML = list.map(function (p) { return shopCard(p, { roundCart: true }); }).join("");
    if (empty) empty.hidden = list.length !== 0;
    if (count) count.textContent = list.length + (list.length === 1 ? " product" : " producten");
  }

  function setCat(catName) {
    var categories = cat.categories();
    var selected = categories.find(function (category) { return category.id === catName; }) || categories[0];
    currentCat = selected.id;
    if (storeTitle) storeTitle.textContent = selected.name;
    if (storeNote) storeNote.textContent = "";
    if (categorySelect) categorySelect.value = selected.id;
    renderShop();
  }

  function renderCategories() {
    if (!categorySelect) return;
    categorySelect.innerHTML = cat.categories().map(function (category) {
      return '<option value="' + cat.esc(category.id) + '">' + cat.esc(category.name) + '</option>';
    }).join("");
  }

  function renderProduct() {
    if (!productRoot) return;
    var slug = document.body.getAttribute("data-product");
    if (slug === "custom-package") slug = new URLSearchParams(location.search).get("id") || "";
    var p = cat.pack(slug);
    if (!p) {
      productRoot.innerHTML = '<p class="empty">Product niet gevonden. <a href="' + cat.storeUrl() + '">Terug naar de store</a></p>';
      return;
    }
    document.title = p.name + " | Heerlen Roleplay Store";
    var category = cat.categories().find(function (item) { return item.id === p.cat; });
    var categoryName = category ? category.name : "Shop";
    var related = cat.byCat(p.cat).filter(function (x) { return x.id !== p.id; }).slice(0, 4);
    productRoot.innerHTML =
      '<div class="product-layout">' +
      '<div class="product-media">' + artHtml(p, false) + "</div>" +
      '<div class="product-copy">' +
      '<p class="kicker"><a href="' + cat.storeUrl(p.cat) + '">' + cat.esc(categoryName) + "</a></p>" +
      "<h1>" + cat.esc(p.name) + "</h1>" +
      "<p class=\"product-lead\">" + cat.esc(p.blurb) + "</p>" +
      '<div class="product-buy">' +
      '<div class="price-wrap">' + priceMarkup(p) +
      (p.bonus ? '<span class="bonus-inline">+' + p.bonus + "% bonus</span>" : "") +
      "</div>" +
      '<button type="button" class="btn btn-primary" data-add="' + p.id + '" data-keep-label="1">In winkelmand</button>' +
      "</div>" +
      '<p class="pay-note">Betaling via Tebex. Je logt in met je Cfx.re-account voordat je afrekent.</p>' +
      "</div></div>" +
      '<section class="product-extra">' +
      "<h2>Omschrijving</h2>" +
      (p.custom ? "<p>" + cat.esc(p.blurb || "Dit pakket wordt direct via Tebex afgerekend.") + "</p>" : "<p>" + cat.esc(p.blurb) + " Coins geef je uit in-game met <code>/store</code>.</p>") +
      "</section>" +
      (related.length
        ? '<section class="product-more"><h2>Meer in ' + cat.esc(categoryName) + "</h2>" +
          '<div class="grid popular-grid">' + related.map(function (x) { return shopCard(x, { roundCart: true, readMore: true }); }).join("") + "</div></section>"
        : "");
  }

  function bootShop() {
    if (search) search.addEventListener("input", renderShop);
    if (sort) sort.addEventListener("change", renderShop);
    if (categorySelect) categorySelect.addEventListener("change", function () {
      setCat(categorySelect.value);
      var url = new URL(location.href);
      if (currentCat === "coins") url.searchParams.delete("cat");
      else url.searchParams.set("cat", currentCat);
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    });
    loadStoreData().then(function () {
      renderCategories();
      var requestedCategory = new URLSearchParams(location.search).get("cat") || "coins";
      setCat(requestedCategory);
    }).catch(function (error) {
      renderCategories();
      setCat("coins");
      showSalesError(error);
    });
  }

  function showSalesError(error) {
    console.error("[store] Tebex-kortingen konden niet worden geladen.", error);
    var status = storeNote || productRoot;
    if (status) {
      var message = "Tebex-kortingen konden niet worden opgehaald. De actuele afrekening verloopt via Tebex.";
      if (status === productRoot) {
        var productStatus = productRoot.querySelector(".store-sale-status") || document.createElement("p");
        productStatus.className = "store-sale-status";
        productStatus.setAttribute("role", "status");
        productStatus.textContent = message;
        if (!productStatus.parentNode) productRoot.insertBefore(productStatus, productRoot.firstChild);
      } else {
        status.textContent = message;
        status.hidden = false;
      }
      return;
    }
    if (popularGrid && popularGrid.parentNode) {
      var homeStatus = document.getElementById("storeSaleStatus");
      if (!homeStatus) {
        homeStatus = document.createElement("p");
        homeStatus.id = "storeSaleStatus";
        homeStatus.className = "store-sale-status";
        homeStatus.setAttribute("role", "status");
        popularGrid.parentNode.insertBefore(homeStatus, popularGrid);
      }
      homeStatus.textContent = "Tebex-kortingen konden niet worden opgehaald. De actuele afrekening verloopt via Tebex.";
    }
  }

  function loadStoreData() {
    var api = window.HeerlenTebex;
    if (!api) return Promise.resolve();
    return api.loadStoreSettings().then(function () { return api.loadActiveSales(); });
  }

  function renderPage() {
    if (page === "home") renderPopular();
    if (page === "winkel") renderShop();
    if (page === "product") renderProduct();
  }

  if (page === "winkel") bootShop();
  else if (page === "home" || page === "product") {
    loadStoreData().then(renderPage).catch(function (error) {
      renderPage();
      showSalesError(error);
    });
  }

  window.addEventListener("heerlen:tebex-sales", renderPage);
  window.addEventListener("heerlen:settings", renderPage);

  window.addEventListener("heerlen:cart", function () {
    renderPage();
  });
})();
