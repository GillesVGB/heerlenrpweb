(function () {
  var tabs = document.querySelectorAll(".doc-tabs [data-doc]");
  var panes = document.querySelectorAll(".doc-pane");
  var toc = document.getElementById("toc");
  var jumps = document.querySelectorAll(".doc-jump");
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  function activePane() {
    return document.querySelector(".doc-pane.is-on");
  }

  function buildToc() {
    var pane = activePane();
    if (!pane || !toc) return;
    var sections = pane.querySelectorAll("section[id]");
    toc.innerHTML = Array.prototype.map.call(sections, function (sec) {
      var title = sec.querySelector("h3");
      if (!title) return "";
      return '<a href="#' + sec.id + '">' + title.textContent + "</a>";
    }).join("");
  }
  window.addEventListener("heerlen:rules-updated", buildToc);

  function showDoc(id) {
    tabs.forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-doc") === id);
    });
    panes.forEach(function (pane) {
      var on = pane.getAttribute("data-pane") === id;
      pane.classList.toggle("is-on", on);
      pane.hidden = !on;
    });
    buildToc();
    history.replaceState(null, "", "#" + id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      showDoc(btn.getAttribute("data-doc"));
    });
  });

  jumps.forEach(function (btn) {
    btn.addEventListener("click", function () {
      showDoc(btn.getAttribute("data-doc"));
    });
  });

  toc.addEventListener("click", function (e) {
    var a = e.target.closest("a");
    if (!a) return;
    toc.querySelectorAll("a").forEach(function (el) { el.classList.remove("is-on"); });
    a.classList.add("is-on");
  });

  var menuBtn = document.getElementById("menuBtn");
  if (menuBtn && menuBtn.dataset.menuBound !== "true") {
    menuBtn.dataset.menuBound = "true";
    menuBtn.addEventListener("click", function () {
      document.body.classList.toggle("nav-open");
      menuBtn.setAttribute("aria-expanded", document.body.classList.contains("nav-open") ? "true" : "false");
    });
  }

  var start = "apv";
  if (/^#(apv|strafrecht|strafvordering)$/.test(location.hash)) start = location.hash.slice(1);
  showDoc(start);
})();
