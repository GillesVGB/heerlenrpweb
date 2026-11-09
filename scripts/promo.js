(function () {
  "use strict";
  var current = document.currentScript;
  if (!current) return;
  if (!document.querySelector(".promo")) {
    current.insertAdjacentHTML("afterend", '<aside class="promo" aria-label="Aanbieding"><div class="promo-inner"><span class="promo-tag" id="promoBonus">Tot +47% bonus</span><p id="promoText">op alle coinpakketten</p><span class="promo-divider" aria-hidden="true"></span><a href="/winkel/" id="promoCta">Naar de store <span aria-hidden="true">→</span></a></div></aside>');
  }
  current.remove();
})();