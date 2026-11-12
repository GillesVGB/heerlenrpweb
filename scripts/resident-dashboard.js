(function () {
  var login = document.getElementById("residentLogin");
  var workspace = document.getElementById("residentWorkspace");
  var profileForm = document.getElementById("residentProfileForm");
  var loginError = document.getElementById("residentLoginError");
  var saveState = document.getElementById("profileSaveState");

  function node(tag, className, text) {
    var item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = String(text);
    return item;
  }

  function showLogin(message) {
    login.hidden = false;
    workspace.hidden = true;
    if (message) loginError.textContent = message;
  }

  function render(data) {
    var user = data.user;
    var profile = data.profile || {};
    workspace.hidden = false;
    login.hidden = true;
    document.getElementById("residentUsername").textContent = user.username;
    document.getElementById("residentGreeting").textContent = user.username;
    document.getElementById("profileDiscordName").textContent = user.username;
    document.getElementById("profileDiscordId").textContent = user.id;
    document.getElementById("profileCreatedAt").textContent = profile.createdAt
      ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(profile.createdAt))
      : "Profiel aangemaakt bij eerste wijziging";
    if (user.avatar) {
      var avatar = document.getElementById("residentAvatar");
      avatar.src = user.avatar;
      avatar.hidden = false;
      document.getElementById("residentAvatarFallback").hidden = true;
    }
    profileForm.elements.inGameName.value = profile.inGameName || "";

    var achievements = Array.isArray(data.achievements) ? data.achievements : [];
    document.getElementById("achievementCount").textContent = String(achievements.length);
    var achievementList = document.getElementById("residentAchievements");
    achievementList.replaceChildren();
    if (!achievements.length) achievementList.appendChild(node("p", "resident-empty", "Je hebt nog geen onderscheidingen. Behaalde mijlpalen verschijnen hier."));
    achievements.forEach(function (achievement) {
      var card = node("article", "resident-achievement");
      card.appendChild(node("span", "resident-achievement-icon", achievement.icon || "✦"));
      card.appendChild(node("h3", "", achievement.title));
      card.appendChild(node("p", "", achievement.description || ""));
      if (achievement.awardedAt) card.appendChild(node("small", "", "Toegekend op " + new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(achievement.awardedAt))));
      achievementList.appendChild(card);
    });

    var notices = Array.isArray(data.notices) ? data.notices : [];
    var noticeList = document.getElementById("residentNotices");
    noticeList.replaceChildren();
    if (!notices.length) noticeList.appendChild(node("p", "resident-empty", "Er zijn momenteel geen communitymeldingen."));
    notices.forEach(function (notice) {
      var card = node("article", "resident-notice");
      card.appendChild(node("h3", "", notice.title));
      card.appendChild(node("p", "", notice.message));
      noticeList.appendChild(card);
    });
  }

  fetch("/api/portal", { credentials: "same-origin", cache: "no-store" })
    .then(function (response) {
      if (response.status === 401) {
        var reason = new URLSearchParams(location.search).get("login");
        var message = reason === "denied"
          ? "Je moet lid zijn van de Heerlen Roleplay Discord-server om je dashboard te openen."
          : reason === "setup"
            ? "Discord-login is nog niet ingesteld."
            : reason
              ? "Discord kon niet aanmelden. Probeer het opnieuw."
              : "";
        showLogin(message);
        return null;
      }
      if (!response.ok) throw new Error("Je dashboard kan nu niet worden geladen.");
      return response.json();
    })
    .then(function (data) {
      if (data) render(data);
    })
    .catch(function () { showLogin("Je dashboard kan tijdelijk niet worden geladen. Probeer het later opnieuw."); });

  profileForm.addEventListener("submit", function (event) {
    event.preventDefault();
    saveState.textContent = "Opslaan…";
    fetch("/api/portal", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save-profile", inGameName: profileForm.elements.inGameName.value })
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(data.error || "Opslaan is niet gelukt.");
        return data;
      });
    }).then(function () {
      saveState.textContent = "Je profiel is opgeslagen.";
      document.getElementById("profileCreatedAt").textContent = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date());
    }).catch(function (error) {
      saveState.textContent = error.message;
    });
  });

  document.getElementById("residentLogout").addEventListener("click", function () {
    fetch("/api/portal", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" })
    }).then(function () { location.href = "/"; }).catch(function () {
      saveState.textContent = "Uitloggen is niet gelukt. Vernieuw de pagina en probeer opnieuw.";
    });
  });

  document.querySelectorAll(".resident-sidebar nav a").forEach(function (link) {
    link.addEventListener("click", function () {
      document.querySelectorAll(".resident-sidebar nav a").forEach(function (item) { item.classList.toggle("is-active", item === link); });
    });
  });
})();
