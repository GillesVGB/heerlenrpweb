(function () {
  var login = document.getElementById("residentLogin");
  var workspace = document.getElementById("residentWorkspace");
  var profileForm = document.getElementById("residentProfileForm");
  var loginError = document.getElementById("residentLoginError");
  var saveState = document.getElementById("profileSaveState");
  var savedBanner = "";

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
    profileForm.elements.bio.value = profile.bio || "";
    savedBanner = profile.banner || "";
    profileForm.elements.banner.value = profile.banner && profile.banner.indexOf("data:") !== 0 ? profile.banner : "";
    profileForm.elements.isPublic.checked = profile.isPublic === true;
    profileForm.elements.showBio.checked = profile.showBio !== false;
    profileForm.elements.showInGameName.checked = profile.showInGameName !== false;
    profileForm.elements.showAchievements.checked = profile.showAchievements !== false;
    var profileLink = document.getElementById("publicProfileLink");
    profileLink.textContent = profile.isPublic && profile.slug ? "Je openbare profiel: " + location.origin + "/profiel/?id=" + profile.slug : "Je profiel is privé en wordt niet openbaar getoond.";

    var achievements = Array.isArray(data.achievements) ? data.achievements : [];
    document.getElementById("achievementCount").textContent = String(achievements.length);
    var achievementList = document.getElementById("residentAchievements");
    achievementList.replaceChildren();
    if (!achievements.length) achievementList.appendChild(node("p", "resident-empty", "Je hebt nog geen onderscheidingen. Behaalde mijlpalen verschijnen hier."));
    achievements.forEach(function (achievement) {
      var card = node("article", "resident-achievement");
      if (achievement.image) {
        var image = node("img", "resident-achievement-image");
        image.src = achievement.image;
        image.alt = "";
        image.loading = "lazy";
        card.appendChild(image);
      }
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

    function renderRows(targetId, rows, emptyText, titleFor, detailFor) {
      var target = document.getElementById(targetId);
      target.replaceChildren();
      if (!rows.length) target.appendChild(node("p", "resident-empty", emptyText));
      rows.forEach(function (row) {
        var card = node("article", "resident-notice");
        card.appendChild(node("h3", "", titleFor(row)));
        card.appendChild(node("p", "", detailFor(row)));
        target.appendChild(card);
      });
    }
    renderRows("residentRsvps", data.rsvps || [], "Je hebt je nog niet aangemeld voor een evenement.",
      function (item) { return item.title; },
      function (item) { return (item.status === "cancelled" ? "Geannuleerd" : item.status === "waitlist" ? "Wachtlijst" : "Aangemeld") + " · " + new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short" }).format(new Date(item.startsAt)); });
    renderRows("residentApplications", data.applications || [], "Je hebt nog geen sollicitaties ingediend.",
      function (item) { return item.jobTitle; },
      function (item) { return "Status: " + item.status + " · ingediend op " + new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(item.submittedAt)); });
    var notifications = Array.isArray(data.notifications) ? data.notifications : [];
    var notificationList = document.getElementById("residentNotifications");
    notificationList.replaceChildren();
    if (!notifications.length) notificationList.appendChild(node("p", "resident-empty", "Je hebt geen persoonlijke meldingen."));
    notifications.forEach(function (notification) {
      var card = node("article", "resident-notice");
      card.appendChild(node("h3", "", notification.title));
      card.appendChild(node("p", "", notification.message));
      if (!notification.readAt) {
        var read = node("button", "btn btn-ghost", "Gelezen");
        read.type = "button";
        read.addEventListener("click", function () {
          fetch("/api/community", {
            method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "notification-read", id: notification.id })
          }).then(function (response) {
            if (!response.ok) throw new Error("Melding kon niet worden bijgewerkt.");
            read.disabled = true; read.textContent = "Gelezen";
          }).catch(function (error) { saveState.textContent = error.message; });
        });
        card.appendChild(read);
      }
      notificationList.appendChild(card);
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
      body: JSON.stringify({ action: "save-profile", profile: {
        inGameName: profileForm.elements.inGameName.value,
        bio: profileForm.elements.bio.value,
        banner: profileForm.elements.banner.value || savedBanner,
        isPublic: profileForm.elements.isPublic.checked,
        showBio: profileForm.elements.showBio.checked,
        showInGameName: profileForm.elements.showInGameName.checked,
        showAchievements: profileForm.elements.showAchievements.checked
      } })
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(data.error || "Opslaan is niet gelukt.");
        return data;
      });
    }).then(function (result) {
      savedBanner = profileForm.elements.banner.value || savedBanner;
      saveState.textContent = "Je profiel is opgeslagen.";
      document.getElementById("profileCreatedAt").textContent = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date());
      var link = document.getElementById("publicProfileLink");
      link.textContent = profileForm.elements.isPublic.checked && result.profile && result.profile.slug
        ? "Je openbare profiel: " + location.origin + "/profiel/?id=" + result.profile.slug
        : "Je profiel is privé en wordt niet openbaar getoond.";
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
