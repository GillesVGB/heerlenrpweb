(function (root) {
  var activeSales = [];
  var tebexPackages = [];
  var PACKS = [
    { id: "coins-100", slug: "coins-100", cat: "coins", name: "100 Coins", amount: 100, price: 5, bonus: 10, popular: false, blurb: "Een handig pakket coins voor voertuigen, kentekens en meer via de in-game store." },
    { id: "coins-200", slug: "coins-200", cat: "coins", name: "200 Coins", amount: 200, price: 10, bonus: 15, popular: false, blurb: "Een handig pakket coins voor voertuigen, kentekens en meer via de in-game store." },
    { id: "coins-300", slug: "coins-300", cat: "coins", name: "300 Coins", amount: 300, price: 15, bonus: 16, popular: true, blurb: "Een mooi pakket coins voor voertuigen, kentekens en meer via de in-game store." },
    { id: "coins-400", slug: "coins-400", cat: "coins", name: "400 Coins", amount: 400, price: 20, bonus: 20, popular: false, blurb: "Een mooi pakket coins voor voertuigen, kentekens en meer via de in-game store." },
    { id: "coins-500", slug: "coins-500", cat: "coins", name: "500 Coins", amount: 500, price: 25, bonus: 30, popular: false, blurb: "Een mooi pakket coins voor voertuigen, kentekens en meer via de in-game store." },
    { id: "coins-600", slug: "coins-600", cat: "coins", name: "600 Coins", amount: 600, price: 30, bonus: 39, popular: true, blurb: "Een groot pakket coins voor voertuigen, kentekens en pakketten via de in-game store." },
    { id: "coins-700", slug: "coins-700", cat: "coins", name: "700 Coins", amount: 700, price: 35, bonus: 39, popular: false, blurb: "Een groot pakket coins voor voertuigen, kentekens en pakketten via de in-game store." },
    { id: "coins-800", slug: "coins-800", cat: "coins", name: "800 Coins", amount: 800, price: 40, bonus: 40, popular: false, blurb: "Een groot pakket coins voor voertuigen, kentekens en pakketten via de in-game store." },
    { id: "coins-900", slug: "coins-900", cat: "coins", name: "900 Coins", amount: 900, price: 45, bonus: 40, popular: false, blurb: "Een groot pakket coins voor voertuigen, kentekens en pakketten via de in-game store." },
    { id: "coins-1000", slug: "coins-1000", cat: "coins", name: "1.000 Coins", amount: 1000, price: 50, bonus: 40, popular: true, blurb: "Een groot pakket coins voor voertuigen, kentekens en pakketten via de in-game store." },
    { id: "coins-1100", slug: "coins-1100", cat: "coins", name: "1.100 Coins", amount: 1100, price: 55, bonus: 43, popular: false, blurb: "Een groot pakket coins voor voertuigen, kentekens en pakketten via de in-game store." },
    { id: "coins-1200", slug: "coins-1200", cat: "coins", name: "1.200 Coins", amount: 1200, price: 60, bonus: 47, popular: false, blurb: "Het dikste pakket. Voor wagens, kentekens en de rest van de stad." }
  ];

  function money(n) {
    return "€" + Number(n).toFixed(2);
  }

  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function pack(id) {
    var items = products();
    for (var i = 0; i < items.length; i++) if (items[i].id === id || items[i].slug === id) return items[i];
    return null;
  }

  function products() {
    var settings = root.HeerlenSettings ? root.HeerlenSettings.load() : {};
    var saved = settings.shopProducts || {};
    var builtIn = PACKS.map(function (pack) {
      var overrides = saved && saved[pack.id];
      if (!overrides || typeof overrides !== "object") return pack;
      var item = Object.assign({}, pack);
      if (typeof overrides.name === "string" && overrides.name.trim()) item.name = overrides.name.slice(0, 60);
      if (typeof overrides.blurb === "string") item.blurb = overrides.blurb.slice(0, 240);
      if (Number.isInteger(Number(overrides.amount)) && Number(overrides.amount) > 0 && Number(overrides.amount) <= 100000) item.amount = Number(overrides.amount);
      if (Number.isInteger(Number(overrides.bonus)) && Number(overrides.bonus) >= 0 && Number(overrides.bonus) <= 10000) item.bonus = Number(overrides.bonus);
      return item;
    });
    var custom = (Array.isArray(settings.customShopProducts) ? settings.customShopProducts : []).filter(function (product) {
      return product && typeof product.id === "string" && typeof product.name === "string" && typeof product.category === "string" && /^\d+$/.test(String(product.tebexId || ""));
    }).map(function (product) {
      return {
        id: product.id,
        slug: product.id,
        cat: product.category,
        name: product.name,
        amount: 0,
        price: 0,
        bonus: 0,
        blurb: product.blurb || "",
        tebexId: String(product.tebexId),
        custom: true
      };
    });
    return builtIn.concat(custom);
  }

  function byCat(cat) {
    return products().filter(function (p) { return p.cat === cat; });
  }

  function categories() {
    var saved = root.HeerlenSettings ? root.HeerlenSettings.load().shopCategories : [];
    var result = [{ id: "coins", name: "Coins" }];
    (Array.isArray(saved) ? saved : []).forEach(function (category) {
      if (!category || typeof category.id !== "string" || typeof category.name !== "string" || !category.id || !category.name) return;
      if (!result.some(function (item) { return item.id === category.id; })) result.push(category);
    });
    return result;
  }

  function popular() {
    var order = ["coins-300", "coins-600", "coins-1000", "coins-1200"];
    return order.map(pack).filter(Boolean);
  }

  function setActiveSales(sales, packages) {
    activeSales = Array.isArray(sales) ? sales : [];
    tebexPackages = Array.isArray(packages) ? packages : [];
  }

  function basePrice(product) {
    var original = Number(product && product.price);
    if (!Number.isFinite(original) || original < 0) return 0;
    var settings = root.HeerlenSettings ? root.HeerlenSettings.load() : {};
    var packageId = String((settings.tebexPackages || {})[product.id] || product.tebexId || "");
    if (!packageId) return original;
    var packageInfo = tebexPackages.find(function (item) { return String(item.id) === packageId; });
    if (packageInfo && packageInfo.currency && String(packageInfo.currency).toUpperCase() !== "EUR") return original;
    if (packageInfo && String(packageInfo.currency || "").toUpperCase() === "EUR" && Number.isFinite(Number(packageInfo.base_price)) && Number(packageInfo.base_price) >= 0) {
      original = Number(packageInfo.base_price);
    }
    return original;
  }

  function priceInfo(product, basketSubtotal) {
    var original = basePrice(product);
    for (var i = 0; i < activeSales.length; i++) {
      var sale = activeSales[i];
      var applies = sale.applies_to || {};
      var settings = root.HeerlenSettings ? root.HeerlenSettings.load() : {};
      var packageId = String((settings.tebexPackages || {})[product.id] || product.tebexId || "");
      var packageInfo = tebexPackages.find(function (item) { return String(item.id) === packageId; });
      if (!packageId || !packageInfo || !Array.isArray(sale.requirements)) continue;
      var appliesToPackage = applies.type === "package" && (applies.packages || []).some(function (item) { return String(item.id) === packageId; });
      var appliesToCategory = applies.type === "category" && packageInfo.category && (applies.categories || []).some(function (item) { return String(item.id) === String(packageInfo.category.id); });
      var excluded = (applies.excluded_packages || []).some(function (item) { return String(item.id) === packageId; });
      var appliesToAll = applies.type === "all" && !excluded;
      if (!appliesToPackage && !appliesToCategory && !appliesToAll) continue;
      var discount = sale.discount || {};
      var requirements = sale.requirements;
      var minimumBasketRequirement = requirements.find(function (requirement) { return requirement.type === "minimum_basket_value"; });
      var hasUnsupportedRequirement = requirements.some(function (requirement) { return requirement.type !== "minimum_basket_value"; });
      if (hasUnsupportedRequirement || (minimumBasketRequirement && String(minimumBasketRequirement.currency || "").toUpperCase() !== "EUR")) continue;
      var threshold = minimumBasketRequirement ? Number(minimumBasketRequirement.amount) : 0;
      var eligible = !minimumBasketRequirement || (Number.isFinite(Number(basketSubtotal)) && Number(basketSubtotal) >= threshold);
      var discountAmount = discount.type === "percentage" && Number.isFinite(Number(discount.percentage))
        ? Number(discount.percentage)
        : discount.type === "amount" && String(discount.currency || "").toUpperCase() === "EUR" && Number.isFinite(Number(discount.amount))
          ? Number(discount.amount)
          : null;
      if (discountAmount === null) continue;
      var amount = discount.type === "percentage"
        ? original * Math.max(0, 1 - discountAmount / 100)
        : original - discountAmount;
      amount = Math.max(0, Math.round(amount * 100) / 100);
      if (amount >= original) continue;
      return {
        price: eligible ? amount : original,
        original: original,
        sale: {
          name: String(sale.name || "Tebex-aanbieding"),
          label: discount.type === "percentage" ? Math.round(discountAmount) + "%" : "Aanbieding",
          eligible: eligible,
          minimumBasketValue: minimumBasketRequirement ? threshold : 0
        }
      };
    }
    return { price: original, original: original, sale: null };
  }

  function asset(path) {
    var base = document.body.getAttribute("data-base") || "./";
    return base + path.replace(/^\.\//, "");
  }

  function productUrl(p) {
    return asset("winkel/" + p.slug + ".html");
  }

  function storeUrl(cat) {
    var q = cat && cat !== "coins" ? "?cat=" + encodeURIComponent(cat) : "";
    return asset("winkel/index.html" + q);
  }

  root.HeerlenCatalog = {
    PACKS: PACKS,
    products: products,
    categories: categories,
    money: money,
    esc: esc,
    pack: pack,
    byCat: byCat,
    popular: popular,
    basePrice: basePrice,
    setActiveSales: setActiveSales,
    priceInfo: priceInfo,
    asset: asset,
    productUrl: productUrl,
    storeUrl: storeUrl
  };
})(window);
