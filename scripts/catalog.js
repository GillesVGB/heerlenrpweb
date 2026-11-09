(function (root) {
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
    for (var i = 0; i < PACKS.length; i++) if (PACKS[i].id === id || PACKS[i].slug === id) return PACKS[i];
    return null;
  }

  function byCat(cat) {
    return PACKS.filter(function (p) { return p.cat === cat; });
  }

  function popular() {
    var order = ["coins-300", "coins-600", "coins-1000", "coins-1200"];
    return order.map(pack).filter(Boolean);
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
    money: money,
    esc: esc,
    pack: pack,
    byCat: byCat,
    popular: popular,
    asset: asset,
    productUrl: productUrl,
    storeUrl: storeUrl
  };
})(window);
