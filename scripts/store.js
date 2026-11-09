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
  var toolbar = document.getElementById("toolbar");
  var storeTitle = document.getElementById("storeTitle");
  var storeNote = document.getElementById("storeNote");
  var productRoot = document.getElementById("productRoot");
  var currentCat = "coins";

  function bagQty(id) {
    return (cartApi && cartApi.cart()[id]) || 0;
  }

  function artHtml(p, link) {
    var img = p.image
      ? cat.asset(p.image)
      : p.amount
        ? cat.asset("images/" + p.amount + ".jpg")
        : cat.asset("images/heerlen-mark.png");
    var faceClass = "art-face has-photo";
    var faceInner = '<img src="' + img + '" alt="' + cat.esc(p.name) + '" loading="lazy" decoding="async">';
    var inner =
      (p.badge ? '<span class="badge-pop">' + cat.esc(p.badge) + "</span>" : "") +
      (p.bonus ? '<span class="bonus">+' + p.bonus + "% bonus</span>" : "") +
      '<div class="' + faceClass + '">' + faceInner + "</div>";
    if (link) return '<a class="art" href="' + cat.productUrl(p) + '">' + inner + "</a>";
    return '<div class="art">' + inner + "</div>";
  }

  function shopCard(p, opts) {
    opts = opts || {};
    var qty = bagQty(p.id);
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
      "<p>" + cat.esc(p.blurb) + "</p>" +
      (opts.readMore !== false
        ? '<a class="read-more" href="' + cat.productUrl(p) + '">Lees meer</a>'
        : "") +
      '<div class="card-row">' +
      '<div class="price-wrap"><span class="price">' + cat.money(p.price) + "</span>" +
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
      '<div class="price-wrap"><span class="price">' + cat.money(p.price) + "</span>" +
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
      return !q || p.name.toLowerCase().indexOf(q) !== -1 || String(p.amount).indexOf(q) !== -1;
    });
    if (sort) list.sort(function (a, b) { return sort.value === "desc" ? b.price - a.price : a.price - b.price; });
    grid.hidden = false;
    if (toolbar) toolbar.hidden = false;
    grid.innerHTML = list.map(function (p) { return shopCard(p, { roundCart: true }); }).join("");
    if (empty) empty.hidden = list.length !== 0;
    if (count) count.textContent = list.length + (list.length === 1 ? " product" : " producten");
  }

  function setCat(catName) {
    currentCat = "coins";
    if (storeTitle) storeTitle.textContent = "Coins";
    if (storeNote) storeNote.textContent = "";
    renderShop();
  }

  function renderProduct() {
    if (!productRoot) return;
    var slug = document.body.getAttribute("data-product");
    var p = cat.pack(slug);
    if (!p) {
      productRoot.innerHTML = '<p class="empty">Product niet gevonden. <a href="' + cat.storeUrl() + '">Terug naar de store</a></p>';
      return;
    }
    var related = cat.byCat(p.cat).filter(function (x) { return x.id !== p.id; }).slice(0, 4);
    productRoot.innerHTML =
      '<div class="product-layout">' +
      '<div class="product-media">' + artHtml(p, false) + "</div>" +
      '<div class="product-copy">' +
      '<p class="kicker"><a href="' + cat.storeUrl(p.cat) + '">Coins</a></p>' +
      "<h1>" + cat.esc(p.name) + "</h1>" +
      "<p class=\"product-lead\">" + cat.esc(p.blurb) + "</p>" +
      '<div class="product-buy">' +
      '<div class="price-wrap"><span class="price">' + cat.money(p.price) + "</span>" +
      (p.bonus ? '<span class="bonus-inline">+' + p.bonus + "% bonus</span>" : "") +
      "</div>" +
      '<button type="button" class="btn btn-primary" data-add="' + p.id + '" data-keep-label="1">In winkelmand</button>' +
      "</div>" +
      '<p class="pay-note">Betaling via Tebex. Je logt in met je Cfx.re-account voordat je afrekent.</p>' +
      "</div></div>" +
      '<section class="product-extra">' +
      "<h2>Omschrijving</h2>" +
      "<p>" + cat.esc(p.blurb) + " Coins geef je uit in-game met <code>/store</code>.</p>" +
      "</section>" +
      (related.length
        ? '<section class="product-more"><h2>Meer coins</h2>' +
          '<div class="grid popular-grid">' + related.map(function (x) { return shopCard(x, { roundCart: true, readMore: true }); }).join("") + "</div></section>"
        : "");
  }

  function bootShop() {
    setCat("coins");
    if (search) search.addEventListener("input", renderShop);
    if (sort) sort.addEventListener("change", renderShop);
  }

  if (page === "home") renderPopular();
  if (page === "winkel") bootShop();
  if (page === "product") renderProduct();

  window.addEventListener("heerlen:cart", function () {
    if (page === "home") renderPopular();
    if (page === "winkel") renderShop();
    if (page === "product") renderProduct();
  });
})();
