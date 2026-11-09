(function () {
  "use strict";
  var id = "960090714950225970";
  var existing = document.querySelector("footer.footer:not(#cartFoot), footer.content-footer, footer.site-footer");
  if (!existing || document.querySelector(".hr-site-footer")) return;

  var footer = document.createElement("footer");
  footer.className = "hr-site-footer";
  footer.innerHTML = '<div class="hr-footer-main"><a class="hr-footer-brand" href="/" aria-label="Heerlen Roleplay home"><img src="/images/heerlen-logo.png" alt="Heerlen Roleplay"><span><strong>Heerlen Roleplay</strong><small>Jouw stad. Jouw verhaal.</small></span></a><nav class="hr-footer-nav" aria-label="Footer"><a href="/winkel/">Winkel</a><a href="/regels/">Regels</a><a href="/faq/">FAQ</a><a href="/nieuws/">Nieuws</a><a href="/updates/">Updates</a><a href="https://discord.gg/heerlenrp" target="_blank" rel="noopener noreferrer">Discord ↗</a></nav></div><div class="hr-footer-bottom"><span>© <span data-hr-year></span> Heerlen Roleplay</span><a class="hr-footer-staff" href="/staff/">Staff</a><div class="hr-byline"><img data-gilles-avatar src="/images/heerlen-mark.png" alt=""><span>By Gilles</span></div></div>';
  existing.replaceWith(footer);
  footer.querySelector("[data-hr-year]").textContent = String(new Date().getFullYear());

  fetch("https://api.lanyard.rest/v1/users/" + id, { cache: "no-store" }).then(function (response) {
    if (!response.ok) throw new Error("Profile unavailable");
    return response.json();
  }).then(function (result) {
    var user = result && result.data && result.data.discord_user;
    if (!user || !user.avatar) return;
    var ext = user.avatar.indexOf("a_") === 0 ? "gif" : "webp";
    footer.querySelector("[data-gilles-avatar]").src = "https://cdn.discordapp.com/avatars/" + id + "/" + user.avatar + "." + ext + "?size=96";
  }).catch(function () {});
})();
