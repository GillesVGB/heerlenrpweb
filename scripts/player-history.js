(function () {
  var historyKey = "heerlenrp_player_history_v1";
  var historyWindow = 24 * 60 * 60 * 1000;
  var refreshTimer;
  var pending = false;

  function recordPlayers(players) {
    var now = Date.now();
    var history = [];
    try {
      var stored = JSON.parse(localStorage.getItem(historyKey) || "[]");
      if (Array.isArray(stored)) {
        history = stored.filter(function (point) {
          return point && Number.isSafeInteger(point.time) && point.time >= now - historyWindow &&
            Number.isSafeInteger(point.players) && point.players >= 0 && point.players <= 1000000;
        });
      }
    } catch (error) {
      return;
    }

    var previous = history[history.length - 1];
    if (!previous || now - previous.time >= 45000) {
      history.push({ time: now, players: players });
    }
    try {
      localStorage.setItem(historyKey, JSON.stringify(history.slice(-1440)));
    } catch (error) {}
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    if (!document.hidden) refreshTimer = window.setTimeout(fetchStatus, 60000);
  }

  function fetchStatus() {
    if (pending || document.hidden) return;
    pending = true;
    window.clearTimeout(refreshTimer);

    fetch("/api/players", { cache: "no-store", credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("Status niet beschikbaar");
        return response.json();
      })
      .then(function (data) {
        if (data && data.online === false) {
          recordPlayers(0);
          return;
        }
        var players = Number(data && data.clients);
        if (data && data.online === true && Number.isFinite(players) && players >= 0 && players <= 1000000) {
          recordPlayers(Math.floor(players));
        }
      })
      .catch(function () {})
      .then(function () {
        pending = false;
        scheduleRefresh();
      });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) window.clearTimeout(refreshTimer);
    else fetchStatus();
  });

  fetchStatus();
})();
