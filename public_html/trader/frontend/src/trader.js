const API_BASE = "/trade/api/trader";

const el = {
  loginScreen: document.getElementById("login-screen"),
  loginError: document.getElementById("login-error"),
  app: document.getElementById("app"),
  badgeDryrun: document.getElementById("badge-dryrun"),
  badgePaused: document.getElementById("badge-paused"),
  badgeMode: document.getElementById("badge-mode"),
  badgeSignal: document.getElementById("badge-signal"),
  badgeDryrunCash: document.getElementById("badge-dryrun-cash"),
  badgeDryrunTheoretical: document.getElementById("badge-dryrun-theoretical"),
  lastCycle: document.getElementById("last-cycle"),
  btnLogout: document.getElementById("btn-logout"),
  configForm: document.getElementById("config-form"),
  cfgDryrun: document.getElementById("cfg-dryrun"),
  cfgPaused: document.getElementById("cfg-paused"),
  cfgMode: document.getElementById("cfg-mode"),
  cfgPartialExit: document.getElementById("cfg-partial-exit"),
  cfgBudget: document.getElementById("cfg-budget"),
  cfgMaxcoin: document.getElementById("cfg-maxcoin"),
  cfgStoploss: document.getElementById("cfg-stoploss"),
  cfgStatus: document.getElementById("cfg-status"),
  btnRun: document.getElementById("btn-run"),
  btnStop: document.getElementById("btn-stop"),
  runOutput: document.getElementById("run-output"),
  positionsTable: document.getElementById("positions-table"),
  posCount: document.getElementById("pos-count"),
  ordersTable: document.getElementById("orders-table"),
  ordersPager: document.getElementById("orders-pager"),
  cycleRunsTable: document.getElementById("cycle-runs-table"),
  cycleRunsCount: document.getElementById("cycle-runs-count"),
  cycleRunsTrend: document.getElementById("cycle-runs-trend"),
  cycleRunsSummary: document.getElementById("cycle-runs-summary"),
  logOutput: document.getElementById("log-output"),
  logRefresh: document.getElementById("log-refresh"),
  logClearOut: document.getElementById("log-clear-out"),
  logClearErr: document.getElementById("log-clear-err"),
  logAuto: document.getElementById("log-auto"),
  logMeta: document.getElementById("log-meta"),
  logTabs: document.querySelectorAll(".log-tab")
};

const state = {
  ordersPage: 1,
  ordersPageSize: 10,
  ordersTotal: 0,
  ordersTotalPages: 0
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "Accept": "application/json", ...(options.headers || {}) },
    method: options.method || "GET",
    body: options.body
  });
  if (response.status === 401 || response.status === 403) throw new Error("unauthorized");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "api_error");
  return payload;
}

function fmt(dt) {
  if (!dt) return "–";
  return new Date(dt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function fmtNum(v, d = 6) {
  if (v == null) return "–";
  return Number(v).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: d });
}

function escHtml(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(v) {
  return escHtml(v).replace(/"/g, "&quot;");
}

function pnlClass(value) {
  if (value == null || Number.isNaN(Number(value))) return "pnl-neutral";
  const numeric = Number(value);
  if (numeric > 0) return "pnl-positive";
  if (numeric < 0) return "pnl-negative";
  return "pnl-neutral";
}

async function loadDashboard() {
  try {
    const [status, config, positions, orders, cycleRuns] = await Promise.all([
      api(`${API_BASE}/status`),
      api(`${API_BASE}/config`),
      api(`${API_BASE}/positions`),
      api(`${API_BASE}/orders?page=${state.ordersPage}&limit=${state.ordersPageSize}`),
      api(`${API_BASE}/cycle-runs?limit=10&seriesLimit=50`)
    ]);
    renderStatus(status);
    renderConfig(config);
    renderPositions(positions.items);
    renderOrders(orders);
    renderCycleRuns(cycleRuns.items, cycleRuns.summary, cycleRuns.series);
  } catch (error) {
    if (error.message === "unauthorized") {
      showLogin();
      throw error;
    }
  }
}

function renderStatus(s) {
  el.badgeDryrun.hidden = !s.dryRun;
  el.badgePaused.hidden = !s.paused;
  el.badgeSignal.textContent = `Signal API: ${s.signalApiOk ? "OK" : "FEHLT"}`;
  el.badgeSignal.className = `badge ${s.signalApiOk ? "badge--ok" : "badge--danger"}`;
  if (el.badgeDryrunCash) {
    el.badgeDryrunCash.hidden = !s.dryRun;
    el.badgeDryrunCash.textContent = `Cash: ${s.dryRunCashEur == null ? "–" : fmtNum(s.dryRunCashEur, 2)} EUR`;
  }
  if (el.badgeDryrunTheoretical) {
    el.badgeDryrunTheoretical.hidden = !s.dryRun;
    el.badgeDryrunTheoretical.textContent = `Theorie: ${s.dryRunTheoreticalEur == null ? "–" : fmtNum(s.dryRunTheoreticalEur, 2)} EUR`;
  }
  el.lastCycle.textContent = s.lastCycleAt ? `Letzter Zyklus: ${fmt(s.lastCycleAt)}` : "Noch kein Zyklus";
  if (el.badgeMode) {
    el.badgeMode.textContent = s.mode === "short" ? "SHORT" : "LONG";
    el.badgeMode.classList.toggle("is-short", s.mode === "short");
  }
}

function renderConfig(c) {
  el.cfgDryrun.checked = c.dryRun;
  el.cfgPaused.checked = c.paused;
  if (el.cfgMode) el.cfgMode.value = c.mode || "long";
  if (el.cfgPartialExit) el.cfgPartialExit.value = c.partialExitPercent ?? 0;
  el.cfgBudget.value = c.budgetEur;
  el.cfgMaxcoin.value = c.maxPerCoinEur;
  el.cfgStoploss.value = c.stopLossPercent;
}

function renderPositions(items) {
  el.posCount.textContent = items.length ? `(${items.length})` : "";
  if (!items.length) { el.positionsTable.innerHTML = '<div class="empty">Keine offenen Positionen.</div>'; return; }
  el.positionsTable.innerHTML = `
    <table>
      <thead><tr><th>Coin</th><th>Paar</th><th>Einstieg</th><th>Volumen</th><th>Realisiert</th><th>Unrealisiert</th><th>Gesamt</th><th>Stop-Loss</th><th>Seit</th><th></th></tr></thead>
      <tbody>
        ${items.map((p) => `
          <tr>
            <td><strong>${escHtml(p.coinSymbol)}</strong></td>
            <td>${escHtml(p.krakenPair)}</td>
            <td class="num">${fmtNum(p.entryPrice, 4)}</td>
            <td class="num">${fmtNum(p.entryVolume, 8)}</td>
            <td class="num ${pnlClass(p.realizedProfitEur)}">${fmtNum(p.realizedProfitEur, 2)}</td>
            <td class="num ${pnlClass(p.unrealizedProfitEur)}">${fmtNum(p.unrealizedProfitEur, 2)}</td>
            <td class="num ${pnlClass(p.totalProfitEur)}">${fmtNum(p.totalProfitEur, 2)}</td>
            <td class="num">${fmtNum(p.stopLossPrice, 4)}</td>
            <td>${fmt(p.openedAt)}</td>
            <td class="row-actions">
              <button
                class="btn btn--danger btn--small"
                type="button"
                data-delete-position="${p.id}"
                data-position-label="${escAttr(p.coinSymbol)}"
              >Löschen</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderOrders(pageData) {
  const items = Array.isArray(pageData && pageData.items) ? pageData.items : [];
  state.ordersPage = Number(pageData && pageData.page) || state.ordersPage;
  state.ordersPageSize = Number(pageData && pageData.pageSize) || state.ordersPageSize;
  state.ordersTotal = Number(pageData && pageData.total) || 0;
  state.ordersTotalPages = Number(pageData && pageData.totalPages) || 0;

  if (!items.length) {
    el.ordersTable.innerHTML = '<div class="empty">Keine Orders.</div>';
  } else {
    el.ordersTable.innerHTML = `
      <table class="responsive-table responsive-table--orders">
        <thead><tr><th>Zeit</th><th>Coin</th><th>Seite</th><th>Vol.</th><th>Preis</th><th>Status</th><th>Dry</th><th>Grund</th></tr></thead>
        <tbody>
          ${items.map((o) => `
            <tr class="${o.side === "buy" ? "row-buy" : "row-sell"}">
              <td data-label="Zeit">${fmt(o.created_at)}</td>
              <td data-label="Coin"><strong>${escHtml(o.coin_symbol)}</strong></td>
              <td data-label="Seite">${escHtml(o.side)}</td>
              <td data-label="Vol." class="num">${fmtNum(o.volume, 8)}</td>
              <td data-label="Preis" class="num">${fmtNum(o.price_estimate, 4)}</td>
              <td data-label="Status">${escHtml(o.status)}</td>
              <td data-label="Dry">${o.dry_run ? "✓" : "–"}</td>
              <td data-label="Grund">${escHtml(o.signal_reason || "–")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  renderOrdersPager();
}

function renderOrdersPager() {
  if (!el.ordersPager) return;

  const page = state.ordersPage;
  const totalPages = state.ordersTotalPages;
  const total = state.ordersTotal;

  if (!totalPages || total <= 0) {
    el.ordersPager.innerHTML = '<div class="orders-pager__empty">Keine Seiten vorhanden.</div>';
    return;
  }

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  el.ordersPager.innerHTML = `
    <div class="orders-pager__meta">
      Seite ${escHtml(String(page))} von ${escHtml(String(totalPages))} · ${escHtml(String(total))} Orders
    </div>
    <div class="orders-pager__actions">
      <button class="btn btn--ghost btn--small" type="button" data-orders-page-nav="prev" ${prevDisabled ? "disabled" : ""}>Zurück</button>
      <button class="btn btn--ghost btn--small" type="button" data-orders-page-nav="next" ${nextDisabled ? "disabled" : ""}>Weiter</button>
    </div>
  `;
}

async function loadOrdersPage(page) {
  const response = await api(`${API_BASE}/orders?page=${page}&limit=${state.ordersPageSize}`);
  renderOrders(response);
  return response;
}

function renderCycleRuns(items, summary, series) {
  if (!el.cycleRunsTable || !el.cycleRunsTrend) return;

  const runs = Array.isArray(items) ? items : [];
  el.cycleRunsCount.textContent = runs.length ? `(${runs.length})` : "";

  renderCycleRunsTrend(series);
  renderCycleRunsSummary(summary, runs.length);

  if (!runs.length) {
    el.cycleRunsTable.innerHTML = '<div class="empty">Keine Zyklusdaten.</div>';
    return;
  }

  el.cycleRunsTable.innerHTML = `
    <table class="responsive-table responsive-table--cycles">
      <thead>
        <tr>
          <th>Zeit</th>
          <th>Modus</th>
          <th>Status</th>
          <th>B / S</th>
          <th>Skip</th>
          <th>Top Skip</th>
          <th>Blocker</th>
        </tr>
      </thead>
      <tbody>
        ${runs.map((run) => {
          const result = run.result || {};
          const skipStats = result.riskSkipStats || { total: 0, reasons: [], blockers: [] };
          const topReason = Array.isArray(skipStats.reasons) && skipStats.reasons.length ? skipStats.reasons[0] : null;
          const topBlocker = Array.isArray(skipStats.blockers) && skipStats.blockers.length ? skipStats.blockers[0] : null;
          return `
            <tr class="${run.skipped ? "row-skip" : "row-run"}">
              <td data-label="Zeit">${fmt(run.createdAt)}</td>
              <td data-label="Modus">${escHtml(run.mode || "long")} ${run.dryRun ? '<span class="badge badge--warn">DRY</span>' : ""}</td>
              <td data-label="Status">${run.skipped ? escHtml(run.skipReason || "skip") : "ok"}</td>
              <td data-label="B / S" class="num">${fmtNum(result.buys || 0, 0)} / ${fmtNum(result.sells || 0, 0)}</td>
              <td data-label="Skip" class="num">${fmtNum(skipStats.total || 0, 0)}</td>
              <td data-label="Top Skip">${topReason ? `${escHtml(topReason.key)} (${fmtNum(topReason.count || 0, 0)})` : "–"}</td>
              <td data-label="Blocker">${topBlocker ? `${escHtml(topBlocker.key)} (${fmtNum(topBlocker.count || 0, 0)})` : "–"}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderCycleRunsTrend(series) {
  const points = series && Array.isArray(series.points) ? series.points : [];
  if (!points.length) {
    el.cycleRunsTrend.innerHTML = '<div class="empty">Keine Trenddaten.</div>';
    return;
  }

  const width = 640;
  const height = 140;
  const paddingX = 18;
  const paddingY = 16;
  const maxValue = Math.max(1, Number(series.max_executed || 0), Number(series.max_blocked || 0));
  const innerWidth = width - paddingX * 2;
  const xStep = points.length > 1 ? innerWidth / (points.length - 1) : 0;
  const executedPoints = points.map((point, index) => pointToCoords(point.executed, index, maxValue, xStep, paddingX, height, paddingY));
  const blockedPoints = points.map((point, index) => pointToCoords(point.blocked, index, maxValue, xStep, paddingX, height, paddingY));
  const first = series.first_point || points[0];
  const last = series.last_point || points[points.length - 1];

  el.cycleRunsTrend.innerHTML = `
    <div class="cycle-trend-panel">
      <div class="cycle-trend-panel__header">
        <div>
          <p class="cycle-trend-panel__eyebrow">Trend</p>
          <h3>Letzte ${escHtml(String(points.length))} Zyklen</h3>
        </div>
        <div class="cycle-trend-panel__meta">
          <span>Aktiv ${escHtml(formatTrendDelta(first && first.executed, last && last.executed))}</span>
          <span>Blockiert ${escHtml(formatTrendDelta(first && first.blocked, last && last.blocked))}</span>
        </div>
      </div>
      <div class="cycle-trend-legend">
        <span><i class="cycle-trend-legend__swatch cycle-trend-legend__swatch--executed"></i>Aktivität</span>
        <span><i class="cycle-trend-legend__swatch cycle-trend-legend__swatch--blocked"></i>Blockiert</span>
      </div>
      <svg class="cycle-trend-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Trader-Zyklus Trend">
        <line class="cycle-trend-chart__baseline" x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}"></line>
        ${buildPolylinePath(executedPoints, "cycle-trend-chart__line cycle-trend-chart__line--executed")}
        ${buildPolylinePath(blockedPoints, "cycle-trend-chart__line cycle-trend-chart__line--blocked")}
      </svg>
    </div>
  `;
}

function renderCycleRunsSummary(summary, runCount) {
  if (!el.cycleRunsSummary) return;

  if (!runCount) {
    el.cycleRunsSummary.innerHTML = '<div class="cycle-run-chip"><span>Runs</span><strong>0</strong></div>';
    return;
  }

  const overview = summary || {};
  const chips = [
    ["Runs", overview.total_runs ?? runCount],
    ["Buys", overview.total_buys ?? 0],
    ["Skipped", overview.total_skipped_buys ?? 0],
    ["Risk-Skips", overview.total_risk_skips ?? 0],
    ["Top Grund", (overview.top_risk_skip_reason && overview.top_risk_skip_reason.key) || "–"],
    ["Top Blocker", (overview.top_risk_skip_blocker && overview.top_risk_skip_blocker.key) || "–"]
  ];

  el.cycleRunsSummary.innerHTML = chips
    .map(([label, value]) => `
      <div class="cycle-run-chip">
        <span>${escHtml(label)}</span>
        <strong>${escHtml(String(value))}</strong>
      </div>
    `)
    .join("");
}

function pointToCoords(value, index, maxValue, xStep, paddingX, height, paddingY) {
  const x = paddingX + (xStep * index);
  const clampedValue = Math.max(0, Number(value || 0));
  const y = height - paddingY - ((clampedValue / maxValue) * (height - paddingY * 2));
  return { x, y };
}

function buildPolylinePath(points, className) {
  if (!Array.isArray(points) || !points.length) return "";
  return `<path class="${className}" d="${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")}"></path>`;
}

function formatTrendDelta(fromValue, toValue) {
  if (fromValue === null || fromValue === undefined || toValue === null || toValue === undefined) {
    return "–";
  }
  const delta = Number(toValue) - Number(fromValue);
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}`;
}

function showLogin() {
  el.app.hidden = true;
  el.loginScreen.hidden = false;
  if (el.loginError) el.loginError.hidden = false;
}

function showApp() {
  el.loginScreen.hidden = true;
  el.app.hidden = false;
}

el.btnLogout.addEventListener("click", () => {
  window.location.href = "https://schnueddels.de/auth/account.php";
});

el.configForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  el.cfgStatus.textContent = "Speichere ...";
  try {
    await api(`${API_BASE}/config`, {
      method: "PATCH",
      body: JSON.stringify({
        dryRun: el.cfgDryrun.checked,
        paused: el.cfgPaused.checked,
        mode: el.cfgMode ? el.cfgMode.value : "long",
        partialExitPercent: el.cfgPartialExit ? parseInt(el.cfgPartialExit.value, 10) : 0,
        budgetEur: parseFloat(el.cfgBudget.value),
        maxPerCoinEur: parseFloat(el.cfgMaxcoin.value),
        stopLossPercent: parseFloat(el.cfgStoploss.value)
      })
    });
    el.cfgStatus.textContent = "Gespeichert.";
    loadDashboard();
  } catch {
    el.cfgStatus.textContent = "Fehler beim Speichern.";
  }
});

el.btnRun.addEventListener("click", async () => {
  el.runOutput.textContent = "Zyklus läuft ...";
  try {
    const result = await api(`${API_BASE}/run`, { method: "POST" });
    el.runOutput.textContent = JSON.stringify(result, null, 2);
    loadDashboard();
  } catch (error) {
    el.runOutput.textContent = `Fehler: ${error.message}`;
  }
});

el.btnStop.addEventListener("click", async () => {
  if (!confirm("Trader wirklich sofort pausieren?")) return;
  try {
    await api(`${API_BASE}/stop`, { method: "POST" });
    el.runOutput.textContent = "Trader pausiert.";
    loadDashboard();
  } catch (error) {
    el.runOutput.textContent = `Fehler: ${error.message}`;
  }
});

el.positionsTable.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-position]");
  if (!button) return;

  const id = Number.parseInt(button.dataset.deletePosition, 10);
  const label = button.dataset.positionLabel || "diese Position";
  if (!Number.isInteger(id) || !confirm(`Offene Position ${label} aus dem Trader entfernen?`)) return;

  button.disabled = true;
  try {
    await api(`${API_BASE}/positions/${id}`, { method: "DELETE" });
    el.runOutput.textContent = `Position ${label} entfernt.`;
    loadDashboard();
  } catch (error) {
    button.disabled = false;
    el.runOutput.textContent = `Fehler: ${error.message}`;
  }
});

let activeLogSrc = "out";
let logInterval = null;

async function fetchLogs() {
  try {
    const data = await api(`${API_BASE}/logs`);
    const lines = data[activeLogSrc] || [];
    if (!lines.length) {
      el.logOutput.innerHTML = '<span class="muted">Keine Einträge.</span>';
    } else {
      el.logOutput.innerHTML = lines.map((entry) =>
        `<span class="${entry.src === "err" ? "log-err" : ""}">${escHtml(entry.line)}</span>`
      ).join("\n");
    }
    el.logMeta.textContent = `Stand: ${new Date().toLocaleTimeString("de-DE")}`;
    el.logOutput.scrollTop = el.logOutput.scrollHeight;
  } catch {
    el.logOutput.textContent = "Fehler beim Laden der Logs.";
  }
}

function startLogInterval() {
  stopLogInterval();
  logInterval = setInterval(fetchLogs, 10000);
}

function stopLogInterval() {
  if (logInterval) { clearInterval(logInterval); logInterval = null; }
}

el.logTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeLogSrc = tab.dataset.log;
    el.logTabs.forEach((t) => t.classList.toggle("is-active", t === tab));
    fetchLogs();
  });
});

el.logRefresh.addEventListener("click", fetchLogs);

el.logClearOut.addEventListener("click", async () => {
  if (!confirm("Zyklus stdout wirklich leeren?")) return;
  try {
    await api(`${API_BASE}/logs/clear`, { method: "POST", body: JSON.stringify({ stream: "out" }) });
    await fetchLogs();
  } catch (error) {
    el.logOutput.textContent = `Fehler beim Leeren: ${error.message}`;
  }
});

el.logClearErr.addEventListener("click", async () => {
  if (!confirm("Fehlerlog wirklich leeren?")) return;
  try {
    await api(`${API_BASE}/logs/clear`, { method: "POST", body: JSON.stringify({ stream: "err" }) });
    await fetchLogs();
  } catch (error) {
    el.logOutput.textContent = `Fehler beim Leeren: ${error.message}`;
  }
});

if (el.ordersPager) {
  el.ordersPager.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-orders-page-nav]");
    if (!button || button.disabled) return;

    const nextPage = button.dataset.ordersPageNav === "next" ? state.ordersPage + 1 : state.ordersPage - 1;
    if (nextPage < 1 || (state.ordersTotalPages && nextPage > state.ordersTotalPages)) return;

    button.disabled = true;
    try {
      await loadOrdersPage(nextPage);
    } catch (error) {
      el.runOutput.textContent = `Fehler: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  });
}

el.logAuto.addEventListener("change", () => {
  if (el.logAuto.checked) { startLogInterval(); } else { stopLogInterval(); }
});

async function bootstrap() {
  showApp();
  try {
    await loadDashboard();
    await fetchLogs();
    startLogInterval();
  } catch {
    showLogin();
  }
}

bootstrap();
