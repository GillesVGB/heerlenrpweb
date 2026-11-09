(function () {
  "use strict";
  var input = document.getElementById("faqSearch");
  var list = document.getElementById("faqList");
  var empty = document.getElementById("faqEmpty");
  var results = document.getElementById("faqResults");
  if (!input || !list || !empty || !results) return;

  var items = Array.prototype.slice.call(list.querySelectorAll("[data-faq]"));
  function filter() {
    var query = input.value.trim().toLocaleLowerCase("nl");
    var visible = 0;
    items.forEach(function (item) {
      var matches = !query || item.textContent.toLocaleLowerCase("nl").indexOf(query) !== -1;
      item.hidden = !matches;
      if (matches) visible += 1;
    });
    empty.hidden = visible !== 0;
    results.textContent = query
      ? visible + (visible === 1 ? " antwoord gevonden." : " antwoorden gevonden.")
      : "Alle " + visible + " antwoorden worden getoond.";
  }
  input.addEventListener("input", filter);
})();
