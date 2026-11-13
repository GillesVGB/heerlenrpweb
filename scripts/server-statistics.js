(function () {
  var card = document.getElementById("statsStatusCard");
  if (!card) return;

  var statusLabel = document.getElementById("statsStatusLabel");
  var statusDetail = document.getElementById("statsStatusDetail");
  var playersEl = document.getElementById("statsPlayers");
  var capacityEl = document.getElementById("statsCapacity");
  var occupancyEl = document.getElementById("statsOccupancy");
  var peakEl = document.getElementById("statsPeak");
  var progress = document.getElementById("statsProgress");
  var progressFill = document.getElementById("statsProgressFill");
  var sourceEl = document.getElementById("statsSource");
  var checkedAtEl = document.getElementById("statsCheckedAt");
  var refreshButton = document.getElementById("statsRefresh");
  var chart = document.getElementById("statsChart");
  var chartGrid = document.getElementById("statsChartGrid");
  var chartArea = document.getElementById("statsChartArea");
  var chartLine = document.getElementById("statsChartLine");
  var chartPoints = document.getElementById("statsChartPoints");
  var chartLabels = document.getElementById("statsChartLabels");
  var chartEmpty = document.getElementById("statsChartEmpty");
  var chartNote = document.getElementById("statsChartNote");
  var historyKey = "heerlenrp_player_history_v1";
  var historyWindow = 24 * 60 * 60 * 1000;
  var history = [];
  var storageAvailable = true;
  var refreshTimer;
  var pending = false;

  function readHistory() {
    try {
      var stored = JSON.parse(localStorage.getItem(historyKey) || "[]");
      if (!Array.isArray(stored)) return [];
      var cutoff = Date.now() - historyWindow;
      return stored.filter(function (point) {
        return point && Number.isSafeInteger(point.time) && point.time >= cutoff &&
          Number.isSafeInteger(point.players) && point.players >= 0 && point.players <= 1000000;
      }).sort(function (a, b) { return a.time - b.time; }).slice(-1440);
    } catch (error) {
      storageAvailable = false;
      return [];
    }
  }

  function svgElement(name, attributes, text) {
    var element = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attributes || {}).forEach(function (key) {
      element.setAttribute(key, attributes[key]);
    });
    if (text) element.textContent = text;
    return element;
  }

  function smoothPath(points) {
    if (!points.length) return "";
    var path = "M" + points[0].x.toFixed(2) + " " + points[0].y.toFixed(2);
    for (var index = 0; index < points.length - 1; index += 1) {
      var previous = points[Math.max(0, index - 1)];
      var start = points[index];
      var end = points[index + 1];
      var next = points[Math.min(points.length - 1, index + 2)];
      var controlOneX = start.x + (end.x - previous.x) / 6;
      var controlOneY = start.y + (end.y - previous.y) / 6;
      var controlTwoX = end.x - (next.x - start.x) / 6;
      var controlTwoY = end.y - (next.y - start.y) / 6;
      path += " C" + controlOneX.toFixed(2) + " " + controlOneY.toFixed(2) +
        " " + controlTwoX.toFixed(2) + " " + controlTwoY.toFixed(2) +
        " " + end.x.toFixed(2) + " " + end.y.toFixed(2);
    }
    return path;
  }

  function renderChart() {
    var now = Date.now();
    var cutoff = now - historyWindow;
    history = history.filter(function (point) { return point.time >= cutoff; }).slice(-1440);

    chartGrid.replaceChildren();
    chartPoints.replaceChildren();
    chartLabels.replaceChildren();

    var maxPlayers = history.reduce(function (max, point) { return Math.max(max, point.players); }, 0);
    peakEl.textContent = history.length ? String(maxPlayers) : "—";
    var yMax = Math.max(4, Math.ceil(maxPlayers / 4) * 4);
    var left = 54;
    var right = 788;
    var top = 16;
    var bottom = 216;
    var firstTime = history.length ? history[0].time : cutoff;
    var lastTime = history.length ? history[history.length - 1].time : now;
    var measuredRange = Math.max(1, lastTime - firstTime);
    var points = history.map(function (point) {
      return {
        time: point.time,
        players: point.players,
        x: history.length === 1
          ? (left + right) / 2
          : left + (point.time - firstTime) / measuredRange * (right - left),
        y: bottom - point.players / yMax * (bottom - top)
      };
    });

    for (var tick = 0; tick <= 4; tick += 1) {
      var value = yMax * tick / 4;
      var y = bottom - (bottom - top) * tick / 4;
      chartGrid.appendChild(svgElement("line", {
        x1: left, x2: right, y1: y, y2: y, class: "stats-chart-grid-line"
      }));
      chartLabels.appendChild(svgElement("text", {
        x: left - 12, y: y + 4, "text-anchor": "end", class: "stats-chart-axis-label"
      }, String(value)));
    }

    (history.length > 1 ? [0, 0.5, 1] : [0.5]).forEach(function (fraction) {
      var time = history.length ? firstTime + measuredRange * fraction : cutoff + historyWindow * fraction;
      var x = history.length > 1 ? left + (right - left) * fraction : (left + right) / 2;
      if (history.length > 1 && fraction > 0) {
        chartGrid.appendChild(svgElement("line", {
          x1: x, x2: x, y1: top, y2: bottom, class: "stats-chart-grid-line stats-chart-grid-vertical"
        }));
      }
      var label = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" })
        .format(new Date(time));
      chartLabels.appendChild(svgElement("text", {
        x: x, y: 246, "text-anchor": fraction === 0 ? "start" : fraction === 1 ? "end" : "middle",
        class: "stats-chart-axis-label"
      }, label));
    });

    if (points.length) {
      var linePath = smoothPath(points);
      chartLine.setAttribute("d", linePath);
      chartArea.setAttribute("d", linePath + " L" + points[points.length - 1].x.toFixed(2) + " " + bottom +
        " L" + points[0].x.toFixed(2) + " " + bottom + " Z");

      var stride = Math.max(1, Math.ceil(points.length / 80));
      points.forEach(function (point, index) {
        if (index % stride !== 0 && index !== points.length - 1) return;
        var title = new Intl.DateTimeFormat("nl-NL", {
          dateStyle: "short", timeStyle: "short"
        }).format(new Date(point.time)) + ": " + point.players + " spelers";
        var circle = svgElement("circle", {
          cx: point.x.toFixed(2), cy: point.y.toFixed(2), r: 4, class: "stats-chart-point"
        });
        circle.appendChild(svgElement("title", {}, title));
        chartPoints.appendChild(circle);
      });
      var currentPoint = points[points.length - 1];
      chartPoints.appendChild(svgElement("circle", {
        cx: currentPoint.x.toFixed(2), cy: currentPoint.y.toFixed(2), r: 9,
        class: "stats-chart-current-halo"
      }));
      chartPoints.appendChild(svgElement("circle", {
        cx: currentPoint.x.toFixed(2), cy: currentPoint.y.toFixed(2), r: 4.5,
        class: "stats-chart-current-point"
      }));
      chart.removeAttribute("hidden");
    } else {
      chartLine.removeAttribute("d");
      chartArea.removeAttribute("d");
      chart.setAttribute("hidden", "");
    }

    chartEmpty.hidden = points.length > 1;
    if (points.length === 1) {
      chartEmpty.textContent = "Eerste meting opgeslagen. Bij een volgende meting na ongeveer een minuut verschijnt de lijn.";
    } else if (points.length > 1) {
      chartEmpty.textContent = "";
    } else {
      chartEmpty.textContent = "De eerste meting wordt opgeslagen. Na een volgende meting verschijnt hier het verloop.";
    }
    chartNote.textContent = storageAvailable
      ? "Metingen worden alleen in deze browser bewaard, maximaal 24 uur. Dit is geen gedeelde servergeschiedenis."
      : "Browseropslag is niet beschikbaar; metingen blijven alleen bewaard zolang deze pagina openstaat.";
  }

  function recordPlayers(players) {
    var now = Date.now();
    var previous = history[history.length - 1];
    if (!previous || now - previous.time >= 45000) {
      history.push({ time: now, players: players });
    }
    history = history.filter(function (point) { return point.time >= now - historyWindow; }).slice(-1440);
    try {
      localStorage.setItem(historyKey, JSON.stringify(history));
    } catch (error) {
      storageAvailable = false;
    }
    renderChart();
  }

  function sourceLabel(source) {
    if (source === "ingame") return "FiveM serverstatus";
    if (source === "cfx-listing") return "CFX-serverlijst";
    return "CFX-serverstatus";
  }

  function setState(state, label, detail) {
    card.dataset.state = state;
    card.classList.remove("is-online", "is-offline", "is-unknown");
    card.classList.add("is-" + state);
    statusLabel.textContent = label;
    statusDetail.textContent = detail;
  }

  function clearMetrics() {
    playersEl.textContent = "—";
    capacityEl.textContent = "—";
    occupancyEl.textContent = "—";
    progress.hidden = true;
    progress.setAttribute("aria-valuenow", "0");
    progressFill.style.width = "0%";
  }

  function updateMetrics(clients, max) {
    playersEl.textContent = String(clients);
    capacityEl.textContent = max > 0 ? String(max) : "Niet beschikbaar";
    if (max > 0) {
      var percentage = Math.min(100, Math.round(clients / max * 100));
      occupancyEl.textContent = percentage + "%";
      progress.setAttribute("aria-valuenow", String(percentage));
      progressFill.style.width = percentage + "%";
      progress.hidden = false;
    } else {
      occupancyEl.textContent = "—";
      progress.hidden = true;
      progress.setAttribute("aria-valuenow", "0");
      progressFill.style.width = "0%";
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (!document.hidden) refreshTimer = window.setTimeout(fetchStatus, 60000);
  }

  function fetchStatus() {
    if (pending || document.hidden) return;
    pending = true;
    clearTimeout(refreshTimer);
    refreshButton.disabled = true;
    card.setAttribute("aria-busy", "true");

    fetch("/api/players", { cache: "no-store", credentials: "same-origin" })
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) throw new Error("Status niet beschikbaar");
          return data;
        });
      })
      .then(function (data) {
        sourceEl.textContent = sourceLabel(data && data.source);
        var serverInfo = [data && data.hostname, data && data.version ? "versie " + data.version : ""].filter(Boolean).join(" · ");
        var checkedAt = data && data.lastCheckedAt ? new Date(data.lastCheckedAt) : null;
        checkedAtEl.textContent = checkedAt && !Number.isNaN(checkedAt.getTime())
          ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(checkedAt)
          : "Niet beschikbaar";
        if (data && data.online === false) {
          updateMetrics(0, Number(data.max) || 0);
          recordPlayers(0);
          setState("offline", data.stale ? "Offline · laatst bekend" : "Offline",
            (serverInfo ? serverInfo + ". " : "") + "De statusbron meldt dat de server offline is.");
          return;
        }

        var clients = Number(data && data.clients);
        if (!data || data.online !== true || !Number.isFinite(clients) || clients < 0) {
          throw new Error("Ongeldige status");
        }
        var max = Number(data.max);
        updateMetrics(Math.floor(clients), Number.isFinite(max) && max > 0 ? Math.floor(max) : 0);
        recordPlayers(Math.floor(clients));
        setState("online", data.stale ? "Online · laatst bekend" : "Online",
          (serverInfo ? serverInfo + ". " : "") +
          (data.stale ? "Statuscontrole mislukt; dit zijn de laatst bekende spelersaantallen." : "De server is bereikbaar en spelersaantallen zijn actueel."));
      })
      .catch(function () {
        clearMetrics();
        setState("unknown", "Status niet beschikbaar", "De actuele status kon niet worden opgehaald. Probeer het later opnieuw.");
      })
      .then(function () {
        if (checkedAtEl.textContent === "Nog niet gecontroleerd") {
          checkedAtEl.textContent = new Intl.DateTimeFormat("nl-NL", {
            dateStyle: "medium",
            timeStyle: "short"
          }).format(new Date());
        }
        pending = false;
        refreshButton.disabled = false;
        card.setAttribute("aria-busy", "false");
        scheduleRefresh();
      });
  }

  refreshButton.addEventListener("click", fetchStatus);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) clearTimeout(refreshTimer);
    else fetchStatus();
  });
  history = readHistory();
  renderChart();
  fetchStatus();
})();
