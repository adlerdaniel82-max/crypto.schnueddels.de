const TIMEFRAME_ORDER = ["5m", "15m", "1h", "4h", "1d"];
const TOP_MARKET_SYMBOLS = new Set([
  "BTC/EUR",
  "ETH/EUR",
  "XRP/EUR",
  "BNB/EUR",
  "SOL/EUR",
  "TRX/EUR",
  "DOGE/EUR",
  "ADA/EUR",
  "BCH/EUR",
  "LINK/EUR",
  "XMR/EUR",
  "XLM/EUR",
  "LTC/EUR",
  "AVAX/EUR",
  "HBAR/EUR",
  "SUI/EUR",
  "SHIB/EUR",
  "TON/EUR",
  "DOT/EUR",
  "UNI/EUR"
]);

const state = {
  overview: null,
  coins: [],
  settings: [],
  backtests: null,
  visibleCoins: [],
  selectedSymbol: null,
  selectedTimeframe: "4h",
  matrixFilter: "all",
  matrixSort: "relevance",
  tradeMode: localStorage.getItem("tradeMode") || "long",
  paperAuthorized: false,
  paperStatus: null,
  adminAuthorized: false,
  adminCoins: [],
  adminKrakenPairs: [],
  adminLoaded: false,
  chartCache: {},
  portfolioSnapshot: null,
  portfolioLoading: false,
  adminTraderCycleRuns: [],
  adminTraderCycleRunsSummary: null,
  adminTraderCycleRunsSeries: null,
  adminTraderCycleRunsError: null
};

const SIGNAL_LABELS = {
  buy: "Kaufen",
  watch: "Beobachten",
  avoid: "Verkaufen",
  sell: "Verkaufen",
  waiting: "Beobachten"
};

const BUY_BLOCKER_LABELS = {
  trend: "Trend",
  rsi: "RSI",
  macd: "MACD",
  volume: "Volumen",
  higher_tf_trend: "1d Trend"
};

const elements = {
  backendStatus: document.getElementById("backend-status"),
  statsGrid: document.getElementById("stats-grid"),
  overviewStrip: document.getElementById("overview-strip"),
  backtestsOverlay: document.getElementById("backtests-overlay"),
  backtestsOverlayOpen: document.getElementById("backtests-overlay-open"),
  backtestsOverlayClose: document.getElementById("backtests-overlay-close"),
  backtestsOverlayBackdrop: document.getElementById("backtests-overlay-backdrop"),
  backtestsMeta: document.getElementById("backtests-meta"),
  backtestsSummary: document.getElementById("backtests-summary"),
  backtestsDetail: document.getElementById("backtests-detail"),
  sourcesOverlay: document.getElementById("sources-overlay"),
  sourcesOverlayOpen: document.getElementById("sources-overlay-open"),
  sourcesOverlayClose: document.getElementById("sources-overlay-close"),
  sourcesOverlayBackdrop: document.getElementById("sources-overlay-backdrop"),
  settingsOverlay: document.getElementById("settings-overlay"),
  settingsOverlayOpen: document.getElementById("settings-overlay-open"),
  settingsOverlayClose: document.getElementById("settings-overlay-close"),
  settingsOverlayBackdrop: document.getElementById("settings-overlay-backdrop"),
  settingsList: document.getElementById("settings-list"),
  settingsMeta: document.getElementById("settings-meta"),
  strategyList: document.getElementById("strategy-list"),
  signalTableBody: document.getElementById("signal-table-body"),
  signalDetail: document.getElementById("signal-detail"),
  rationaleMeta: document.getElementById("rationale-meta"),
  lastSync: document.getElementById("last-sync"),
  refreshButton: document.getElementById("refresh-button"),
  paperOverlay: document.getElementById("paper-overlay"),
  paperOverlayOpen: document.getElementById("paper-overlay-open"),
  paperOverlayClose: document.getElementById("paper-overlay-close"),
  paperOverlayBackdrop: document.getElementById("paper-overlay-backdrop"),
  paperMeta: document.getElementById("paper-meta"),
  paperStatus: document.getElementById("paper-status"),
  paperSummary: document.getElementById("paper-summary"),
  paperExchangeMeta: document.getElementById("paper-exchange-meta"),
  paperExchangeSummary: document.getElementById("paper-exchange-summary"),
  paperDepositForm: document.getElementById("paper-deposit-form"),
  paperWithdrawForm: document.getElementById("paper-withdraw-form"),
  paperBuyForm: document.getElementById("paper-buy-form"),
  paperBuySymbol: document.getElementById("paper-buy-symbol"),
  paperResetButton: document.getElementById("paper-reset-button"),
  paperPositions: document.getElementById("paper-positions"),
  paperOrders: document.getElementById("paper-orders"),
  adminOverlay: document.getElementById("admin-overlay"),
  adminOverlayOpen: document.getElementById("admin-overlay-open"),
  adminOverlayClose: document.getElementById("admin-overlay-close"),
  adminOverlayBackdrop: document.getElementById("admin-overlay-backdrop"),
  adminStatus: document.getElementById("admin-status"),
  adminCoinForm: document.getElementById("admin-coin-form"),
  adminCoinPreview: document.getElementById("admin-coin-preview"),
  adminPairSuggestions: document.getElementById("admin-pair-suggestions"),
  adminCoinsList: document.getElementById("admin-coins-list"),
  matrixFilter: document.getElementById("matrix-filter"),
  matrixGroupSummary: document.getElementById("matrix-group-summary"),
  matrixSort: document.getElementById("matrix-sort"),
  timeframeSwitch: document.getElementById("timeframe-switch"),
  matrixMeta: document.getElementById("matrix-meta"),
  portfolioOverlay: document.getElementById("portfolio-overlay"),
  portfolioOverlayOpen: document.getElementById("portfolio-overlay-open"),
  portfolioOverlayClose: document.getElementById("portfolio-overlay-close"),
  portfolioOverlayBackdrop: document.getElementById("portfolio-overlay-backdrop"),
  portfolioFetchButton: document.getElementById("portfolio-fetch-button"),
  portfolioStatus: document.getElementById("portfolio-status"),
  portfolioBalances: document.getElementById("portfolio-balances"),
  portfolioOrders: document.getElementById("portfolio-orders"),
  portfolioMeta: document.getElementById("portfolio-meta"),
  portfolioCycleMeta: document.getElementById("portfolio-cycle-meta"),
  portfolioCycleTrend: document.getElementById("portfolio-cycle-trend"),
  portfolioCycleSummary: document.getElementById("portfolio-cycle-summary"),
  portfolioCycleRuns: document.getElementById("portfolio-cycle-runs")
};

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  }).format(Number(value));
}

function formatPrice(value) {
  if (value === null || value === undefined) {
    return "-";
  }

  const numericValue = Number(value);
  const absoluteValue = Math.abs(numericValue);
  let digits = 2;

  if (absoluteValue > 0 && absoluteValue < 0.01) {
    digits = 6;
  } else if (absoluteValue < 0.1) {
    digits = 5;
  } else if (absoluteValue < 1) {
    digits = 4;
  }

  return `${formatNumber(numericValue, digits)} EUR`;
}

function formatPercent(value) {
  if (value === null || value === undefined) {
    return "-";
  }

  return `${formatNumber(value, 2)} %`;
}

function formatCompactPercent(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return `${formatNumber(value, 1)} %`;
}

function formatDateTime(value) {
  if (!value) {
    return "n/v";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(parsed);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    },
    method: options.method || "GET",
    body: options.body
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const message = payload && payload.error ? payload.error : `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function signalClass(signal) {
  return `signal-${signal || "waiting"}`;
}

function signalLabel(signal) {
  return SIGNAL_LABELS[signal] || SIGNAL_LABELS.waiting;
}

function blockerLabel(key) {
  return BUY_BLOCKER_LABELS[key] || key;
}

function getEntryGateState(coin) {
  const isShort = state.tradeMode === "short";
  const primaryTf = isShort ? "4h" : "1d";
  const entryTf = isShort ? "1h" : "4h";

  const primary = getCoinSnapshot(coin, primaryTf);
  const entry = getCoinSnapshot(coin, entryTf);

  if (primary && primary.signal_type === "buy" && entry && entry.signal_type === "buy") {
    return { label: "Entry frei", tone: "buy", key: "entry_ready", rank: 4 };
  }

  if (primary && primary.signal_type === "buy") {
    return {
      label: isShort ? "Auf 1h warten" : "Auf 4h warten",
      tone: "watch",
      key: "entry_waiting",
      rank: 3
    };
  }

  return {
    label: isShort ? "Durch 4h blockiert" : "Durch 1d blockiert",
    tone: "waiting",
    key: "blocked",
    rank: 1
  };
}

function getSignalRank(signalType) {
  const rank = {
    buy: 4,
    watch: 3,
    waiting: 2,
    avoid: 1,
    sell: 0
  };

  return rank[signalType || "waiting"] ?? 2;
}

function getCoinPriorityScore(coin) {
  const isShort = state.tradeMode === "short";
  const primary = getCoinSnapshot(coin, isShort ? "4h" : "1d");
  const entry = getCoinSnapshot(coin, isShort ? "1h" : "4h");
  const selected = getCoinSnapshot(coin, state.selectedTimeframe);
  const gate = getEntryGateState(coin);

  return (
    (gate.rank * 1000) +
    (getSignalRank(primary && primary.signal_type) * 100) +
    (getSignalRank(entry && entry.signal_type) * 10) +
    getSignalRank(selected && selected.signal_type)
  );
}

function getFilteredSortedCoins() {
  const filtered = state.coins.filter((coin) => {
    const primary = getCoinSnapshot(coin, "1d");
    const gate = getEntryGateState(coin);

    if (state.matrixFilter === "top_market") {
      return TOP_MARKET_SYMBOLS.has(coin.symbol);
    }

    if (state.matrixFilter === "entry_ready") {
      return gate.key === "entry_ready";
    }

    if (state.matrixFilter === "primary_buy") {
      const primaryTf = state.tradeMode === "short" ? "4h" : "1d";
      return (getCoinSnapshot(coin, primaryTf) || {}).signal_type === "buy";
    }

    if (state.matrixFilter === "entry_waiting") {
      return gate.key === "entry_waiting";
    }

    if (state.matrixFilter === "blocked") {
      return gate.key === "blocked";
    }

    return true;
  });

  return filtered.sort((left, right) => {
    if (state.matrixSort === "symbol") {
      return String(left.symbol).localeCompare(String(right.symbol), "de");
    }

    if (state.matrixSort === "price_desc") {
      const leftPrice = Number((getCoinSnapshot(left, state.selectedTimeframe) || {}).close_price || 0);
      const rightPrice = Number((getCoinSnapshot(right, state.selectedTimeframe) || {}).close_price || 0);
      return rightPrice - leftPrice;
    }

    if (state.matrixSort === "signal") {
      const leftSignal = getSignalRank((getCoinSnapshot(left, state.selectedTimeframe) || {}).signal_type);
      const rightSignal = getSignalRank((getCoinSnapshot(right, state.selectedTimeframe) || {}).signal_type);
      if (rightSignal !== leftSignal) {
        return rightSignal - leftSignal;
      }
    }

    const priorityDiff = getCoinPriorityScore(right) - getCoinPriorityScore(left);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return String(left.symbol).localeCompare(String(right.symbol), "de");
  });
}

function getRiskLevels(snapshot) {
  if (!snapshot || snapshot.close_price === null || snapshot.close_price === undefined) {
    return null;
  }

  const closePrice = Number(snapshot.close_price);
  const stopLossPercent = Number(snapshot.stop_loss_percent);
  const takeProfitPercent = Number(snapshot.take_profit_percent);

  if (!Number.isFinite(closePrice)) {
    return null;
  }

  return {
    stopLossPercent: Number.isFinite(stopLossPercent) ? stopLossPercent : null,
    takeProfitPercent: Number.isFinite(takeProfitPercent) ? takeProfitPercent : null,
    stopPrice: Number.isFinite(stopLossPercent) ? closePrice * (1 - (stopLossPercent / 100)) : null,
    takeProfitPrice: Number.isFinite(takeProfitPercent) ? closePrice * (1 + (takeProfitPercent / 100)) : null,
    rewardRiskRatio: Number.isFinite(stopLossPercent) && stopLossPercent > 0 && Number.isFinite(takeProfitPercent)
      ? takeProfitPercent / stopLossPercent
      : null
  };
}

function getMatrixGroupCounts() {
  const counts = { all: state.coins.length, top_market: 0, entry_ready: 0, primary_buy: 0, entry_waiting: 0, blocked: 0 };
  const primaryTf = state.tradeMode === "short" ? "4h" : "1d";

  state.coins.forEach((coin) => {
    const primary = getCoinSnapshot(coin, primaryTf);
    const gate = getEntryGateState(coin);

    if (TOP_MARKET_SYMBOLS.has(coin.symbol)) counts.top_market += 1;
    if (primary && primary.signal_type === "buy") counts.primary_buy += 1;
    if (Object.prototype.hasOwnProperty.call(counts, gate.key)) counts[gate.key] += 1;
  });

  return counts;
}

function renderMatrixGroupSummary() {
  if (!elements.matrixGroupSummary) {
    return;
  }

  const counts = getMatrixGroupCounts();
  const isShort = state.tradeMode === "short";
  const items = [
    { key: "all", label: "Alle", tone: "neutral" },
    { key: "top_market", label: "Top 20", tone: "main" },
    { key: "entry_ready", label: isShort ? "4h + 1h Buy" : "1d + 4h Buy", tone: "buy" },
    { key: "primary_buy", label: isShort ? "4h Buy" : "1d Buy", tone: "main" },
    { key: "entry_waiting", label: isShort ? "Auf 1h warten" : "Auf 4h warten", tone: "watch" },
    { key: "blocked", label: isShort ? "Durch 4h blockiert" : "Durch 1d blockiert", tone: "blocked" }
  ];

  elements.matrixGroupSummary.innerHTML = items
    .map((item) => `
      <button
        class="matrix-group-chip matrix-group-chip--${escapeHtml(item.tone)} ${state.matrixFilter === item.key ? "is-active" : ""}"
        type="button"
        data-matrix-filter-chip="${escapeHtml(item.key)}"
      >
        <span class="matrix-group-chip__label">${escapeHtml(item.label)}</span>
        <strong class="matrix-group-chip__value">${escapeHtml(String(counts[item.key] || 0))}</strong>
      </button>
    `)
    .join("");

  elements.matrixGroupSummary.querySelectorAll("[data-matrix-filter-chip]").forEach((button) => {
    button.addEventListener("click", () => {
      state.matrixFilter = button.dataset.matrixFilterChip;
      if (elements.matrixFilter) {
        elements.matrixFilter.value = state.matrixFilter;
      }
      renderDashboard();
    });
  });
}

function adminHeaders() {
  return {
    "Content-Type": "application/json"
  };
}

function getAdminFormField(name) {
  return elements.adminCoinForm ? elements.adminCoinForm.querySelector(`[name="${name}"]`) : null;
}

function adminPairLabel(pair) {
  return `${pair.symbol} - ${pair.name}`;
}

function buildTimeframeOptions(selectedValue) {
  return TIMEFRAME_ORDER.map((timeframe) => `
    <option value="${escapeHtml(timeframe)}" ${timeframe === selectedValue ? "selected" : ""}>
      ${escapeHtml(timeframe)}
    </option>
  `).join("");
}

function normalizeSearchValue(value) {
  return String(value || "").trim().toUpperCase();
}

function getFilteredAdminPairs() {
  const searchField = getAdminFormField("coin_search");
  const query = normalizeSearchValue(searchField ? searchField.value : "");

  if (!query) {
    return state.adminKrakenPairs;
  }

  return state.adminKrakenPairs.filter((pair) => {
    const haystack = [
      pair.symbol,
      pair.name,
      pair.base_asset,
      pair.altname,
      pair.wsname
    ].map(normalizeSearchValue).join(" ");

    return haystack.includes(query);
  });
}

function findAdminPairBySearch(value) {
  const query = normalizeSearchValue(value);
  if (!query) {
    return null;
  }

  const exact = state.adminKrakenPairs.find((pair) => {
    const labels = [
      adminPairLabel(pair),
      pair.symbol,
      pair.name,
      pair.base_asset,
      pair.altname,
      pair.wsname
    ].map(normalizeSearchValue);

    return labels.includes(query);
  });

  if (exact) {
    return exact;
  }

  const filtered = getFilteredAdminPairs();
  return filtered.length === 1 ? filtered[0] : null;
}

function setAdminStatus(message, type = "") {
  elements.adminStatus.textContent = message;
  elements.adminStatus.className = `admin-inline-status${type ? ` is-${type}` : ""}`;
}

function openSettingsOverlay() {
  if (!elements.settingsOverlay) {
    return;
  }

  elements.settingsOverlay.hidden = false;
  document.body.classList.add("overlay-open");
}

function closeSettingsOverlay() {
  if (!elements.settingsOverlay) {
    return;
  }

  elements.settingsOverlay.hidden = true;
  document.body.classList.remove("overlay-open");
}

function openSourcesOverlay() {
  if (!elements.sourcesOverlay) {
    return;
  }

  elements.sourcesOverlay.hidden = false;
  document.body.classList.add("overlay-open");
}

function closeSourcesOverlay() {
  if (!elements.sourcesOverlay) {
    return;
  }

  elements.sourcesOverlay.hidden = true;
  document.body.classList.remove("overlay-open");
}

async function openBacktestsOverlay() {
  if (!elements.backtestsOverlay) {
    return;
  }

  elements.backtestsOverlay.hidden = false;
  document.body.classList.add("overlay-open");

  if (!state.backtests) {
    await loadBacktests();
    return;
  }

  renderBacktests();
}

function closeBacktestsOverlay() {
  if (!elements.backtestsOverlay) {
    return;
  }

  elements.backtestsOverlay.hidden = true;
  document.body.classList.remove("overlay-open");
}

async function openAdminOverlay() {
  if (!elements.adminOverlay) {
    return;
  }

  elements.adminOverlay.hidden = false;
  document.body.classList.add("overlay-open");

  if (!state.adminLoaded) {
    await loadAdminCoins();
  }
}

function closeAdminOverlay() {
  if (!elements.adminOverlay) {
    return;
  }

  elements.adminOverlay.hidden = true;
  document.body.classList.remove("overlay-open");
}

function openPaperOverlay() {
  if (!elements.paperOverlay) return;
  elements.paperOverlay.hidden = false;
  document.body.classList.add("overlay-open");
  loadPaperStatus();
}

function closePaperOverlay() {
  if (!elements.paperOverlay) return;
  elements.paperOverlay.hidden = true;
  document.body.classList.remove("overlay-open");
}

function openPortfolioOverlay() {
  if (!elements.portfolioOverlay) return;
  elements.portfolioOverlay.hidden = false;
  document.body.classList.add("overlay-open");
  loadPortfolioLatest();
}

function closePortfolioOverlay() {
  if (!elements.portfolioOverlay) return;
  elements.portfolioOverlay.hidden = true;
  document.body.classList.remove("overlay-open");
}

async function loadPortfolioLatest() {
  try {
    const [portfolioResponse, cycleRunsResponse] = await Promise.allSettled([
      fetchJson("/api/admin/portfolio/latest", {
        headers: adminHeaders()
      }),
      fetchJson("/api/admin/trader/cycle-runs?limit=10&seriesLimit=50", {
        headers: adminHeaders()
      })
    ]);
    if (portfolioResponse.status === "fulfilled") {
      state.portfolioSnapshot = portfolioResponse.value.snapshot || null;
    } else {
      throw portfolioResponse.reason;
    }

    if (cycleRunsResponse.status === "fulfilled") {
      state.adminTraderCycleRuns = Array.isArray(cycleRunsResponse.value.items) ? cycleRunsResponse.value.items : [];
      state.adminTraderCycleRunsSummary = cycleRunsResponse.value.summary || null;
      state.adminTraderCycleRunsSeries = cycleRunsResponse.value.series || null;
      state.adminTraderCycleRunsError = null;
    } else {
      state.adminTraderCycleRuns = [];
      state.adminTraderCycleRunsSummary = null;
      state.adminTraderCycleRunsSeries = null;
      state.adminTraderCycleRunsError = cycleRunsResponse.reason && cycleRunsResponse.reason.message ? cycleRunsResponse.reason.message : "cycle_runs_error";
    }
    renderPortfolio();
  } catch (error) {
    state.adminTraderCycleRuns = [];
    state.adminTraderCycleRunsSummary = null;
    state.adminTraderCycleRunsSeries = null;
    state.adminTraderCycleRunsError = error.message;
    setPortfolioStatus(
      error.message === "auth_required"
        ? "Master-Login erforderlich."
        : "Portfolio konnte nicht geladen werden.",
      "error"
    );
  }
}

async function fetchPortfolioNow() {
  if (state.portfolioLoading) return;
  state.portfolioLoading = true;
  setPortfolioStatus("Kontostand wird von Kraken abgerufen ...", "ok");

  try {
    const response = await fetchJson("/api/admin/portfolio/fetch", {
      method: "POST",
      headers: adminHeaders()
    });
    state.portfolioSnapshot = response.snapshot || null;
    setPortfolioStatus("Kontostand aktualisiert.", "ok");
    await loadTraderCycleRuns();
    renderPortfolio();
    renderDashboard();
  } catch (error) {
    const message = error.message === "kraken_api_not_configured"
      ? "Kraken API-Key nicht konfiguriert."
      : error.message === "auth_required"
        ? "Master-Login erforderlich."
        : `Fehler beim Abruf: ${error.message}`;
    setPortfolioStatus(message, "error");
  } finally {
    state.portfolioLoading = false;
  }
}

function setPortfolioStatus(message, type) {
  if (!elements.portfolioStatus) return;
  elements.portfolioStatus.textContent = message;
  elements.portfolioStatus.className = `admin-inline-status ${type === "error" ? "admin-inline-status--error" : ""}`;
}

async function loadPaperStatus() {
  try {
    const response = await fetchJson("/api/paper/status");
    state.paperAuthorized = true;
    state.paperStatus = response;
    renderAccessButtons();
    renderPaperPortfolio();
    renderDashboard();
  } catch (error) {
    state.paperAuthorized = false;
    state.paperStatus = null;
    renderAccessButtons();
    setPaperStatus(error.message === "auth_required" ? "Login erforderlich." : "Paper-Trading nicht erreichbar.", "error");
  }
}

function setPaperStatus(message, type = "") {
  if (!elements.paperStatus) return;
  elements.paperStatus.textContent = message;
  elements.paperStatus.className = `admin-inline-status ${type === "error" ? "admin-inline-status--error" : ""}`;
}

function renderPaperPortfolio() {
  const status = state.paperStatus;

  if (elements.paperMeta) {
    elements.paperMeta.textContent = status ? "1000 EUR Startgeld pro User" : "Noch nicht geladen";
  }

  renderPaperBuyOptions();

  if (!status) {
    if (elements.paperSummary) elements.paperSummary.innerHTML = '<div class="empty-state">Login erforderlich.</div>';
    if (elements.paperExchangeSummary) elements.paperExchangeSummary.innerHTML = '<div class="empty-state">Login erforderlich.</div>';
    if (elements.paperPositions) elements.paperPositions.innerHTML = '<div class="empty-state">Keine offenen Positionen.</div>';
    if (elements.paperOrders) elements.paperOrders.innerHTML = '<div class="empty-state">Noch keine Orders.</div>';
    return;
  }

  setPaperStatus("Paper-Trading bereit.", "ok");
  const summaryItems = [
    { label: "Cash", value: formatPrice(status.cashEur) },
    { label: "Positionen", value: formatPrice(status.marketValueEur) },
    { label: "Gesamtwert", value: formatPrice(status.equityEur) }
  ];
  elements.paperSummary.innerHTML = summaryItems.map((item) => `
    <div class="cycle-summary-chip">
      <span class="cycle-summary-chip__label">${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
    </div>
  `).join("");

  renderPaperExchange(status.exchange || {});
  renderPaperPositions(status.positions || []);
  renderPaperOrders(status.orders || []);
}

function renderPaperExchange(exchange) {
  if (!elements.paperExchangeSummary) return;
  const withdrawableEur = Number(exchange.withdrawableEur || 0);
  const withdrawableTaler = Number(exchange.withdrawableTaler || 0);
  const protectedCashEur = Number(exchange.protectedCashEur || 0);
  const realizedLossEur = Number(exchange.realizedLossEur || 0);

  if (elements.paperExchangeMeta) {
    elements.paperExchangeMeta.textContent = protectedCashEur > 0
      ? "Startgeld-Schutz aktiv"
      : "Startgeld-Schutz aufgehoben";
  }

  const items = [
    { label: "Auszahlbar", value: formatPrice(withdrawableEur) },
    { label: "Taler daraus", value: `${formatNumber(withdrawableTaler, 0)} Taler` },
    { label: "Geschuetzt", value: formatPrice(protectedCashEur) },
    { label: "Verlusthistorie", value: formatPrice(realizedLossEur) }
  ];

  elements.paperExchangeSummary.innerHTML = items.map((item) => `
    <div class="cycle-summary-chip">
      <span class="cycle-summary-chip__label">${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
    </div>
  `).join("");
}

function renderPaperBuyOptions() {
  if (!elements.paperBuySymbol) return;
  const selectedSymbol = state.selectedSymbol || (state.coins[0] && state.coins[0].symbol) || "";
  elements.paperBuySymbol.innerHTML = state.coins.map((coin) => `
    <option value="${escapeHtml(coin.symbol)}" ${coin.symbol === selectedSymbol ? "selected" : ""}>
      ${escapeHtml(coin.symbol)} - ${escapeHtml(coin.name)}
    </option>
  `).join("");
}

function renderPaperPositions(positions) {
  if (!elements.paperPositions) return;

  if (!positions.length) {
    elements.paperPositions.innerHTML = '<div class="empty-state">Keine offenen Positionen.</div>';
    return;
  }

  elements.paperPositions.innerHTML = `
    <table class="portfolio-table">
      <thead>
        <tr><th>Coin</th><th>Menge</th><th>Einstieg</th><th>Wert</th><th>PnL</th><th></th></tr>
      </thead>
      <tbody>
        ${positions.map((position) => `
          <tr>
            <td><strong>${escapeHtml(position.coinSymbol)}</strong></td>
            <td class="portfolio-table__num">${escapeHtml(formatNumber(position.volume, 8))}</td>
            <td class="portfolio-table__num">${escapeHtml(formatPrice(position.entryPriceEur))}</td>
            <td class="portfolio-table__num">${escapeHtml(formatPrice(position.marketValueEur))}</td>
            <td class="portfolio-table__num">${escapeHtml(formatPrice(position.totalPnlEur))}</td>
            <td><button class="text-button text-button--small" type="button" data-paper-sell="${escapeHtml(String(position.id))}">Verkaufen</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  elements.paperPositions.querySelectorAll("[data-paper-sell]").forEach((button) => {
    button.addEventListener("click", async () => {
      await sellPaperPosition(button.dataset.paperSell);
    });
  });
}

function renderPaperOrders(orders) {
  if (!elements.paperOrders) return;

  if (!orders.length) {
    elements.paperOrders.innerHTML = '<div class="empty-state">Noch keine Orders.</div>';
    return;
  }

  elements.paperOrders.innerHTML = `
    <table class="portfolio-table">
      <thead>
        <tr><th>Zeit</th><th>Coin</th><th>Seite</th><th>Betrag</th><th>PnL</th></tr>
      </thead>
      <tbody>
        ${orders.map((order) => `
          <tr>
            <td>${escapeHtml(formatDateTime(order.createdAt))}</td>
            <td><strong>${escapeHtml(order.coinSymbol)}</strong></td>
            <td>${escapeHtml(order.side === "buy" ? "Kauf" : "Verkauf")}</td>
            <td class="portfolio-table__num">${escapeHtml(formatPrice(order.grossEur))}</td>
            <td class="portfolio-table__num">${escapeHtml(order.realizedPnlEur == null ? "–" : formatPrice(order.realizedPnlEur))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function buyPaperPosition(event) {
  event.preventDefault();
  if (!elements.paperBuyForm) return;
  const formData = new FormData(elements.paperBuyForm);
  const symbol = String(formData.get("symbol") || "").trim();
  const amountEur = Number(formData.get("amount_eur"));

  try {
    setPaperStatus("Kauf wird simuliert ...", "ok");
    state.paperStatus = await fetchJson("/api/paper/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, amountEur })
    });
    renderPaperPortfolio();
    renderDashboard();
  } catch (error) {
    setPaperStatus(`Kauf abgelehnt: ${error.message}`, "error");
  }
}

async function sellPaperPosition(positionId) {
  try {
    setPaperStatus("Verkauf wird simuliert ...", "ok");
    state.paperStatus = await fetchJson("/api/paper/sell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId: Number(positionId) })
    });
    renderPaperPortfolio();
    renderDashboard();
  } catch (error) {
    setPaperStatus(`Verkauf abgelehnt: ${error.message}`, "error");
  }
}

async function depositPaperTalers(event) {
  event.preventDefault();
  if (!elements.paperDepositForm) return;
  const formData = new FormData(elements.paperDepositForm);
  const talerAmount = Number(formData.get("taler_amount"));

  try {
    setPaperStatus("Taler werden in Spielgeld getauscht ...", "ok");
    state.paperStatus = await fetchJson("/api/paper/deposit-talers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ talerAmount })
    });
    renderPaperPortfolio();
    renderDashboard();
    setPaperStatus(`${formatNumber(talerAmount, 0)} Taler wurden gutgeschrieben.`, "ok");
  } catch (error) {
    setPaperStatus(`Tausch abgelehnt: ${error.message}`, "error");
  }
}

async function withdrawPaperTalers(event) {
  event.preventDefault();
  if (!elements.paperWithdrawForm) return;
  const formData = new FormData(elements.paperWithdrawForm);
  const amountEur = Number(formData.get("amount_eur"));

  try {
    setPaperStatus("Spielgeld wird in Free-Earn-Taler getauscht ...", "ok");
    state.paperStatus = await fetchJson("/api/paper/withdraw-talers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountEur })
    });
    renderPaperPortfolio();
    renderDashboard();
    const talerAmount = Number(state.paperStatus?.exchange?.talerAmount || amountEur / 10);
    setPaperStatus(`${formatPrice(amountEur)} wurden als ${formatNumber(talerAmount, 0)} Free-Earn-Taler ausgezahlt.`, "ok");
  } catch (error) {
    setPaperStatus(`Auszahlung abgelehnt: ${error.message}`, "error");
  }
}

async function resetPaperPortfolio() {
  if (!window.confirm("Paper-Trading wirklich auf 1000 EUR zuruecksetzen?")) return;
  try {
    state.paperStatus = await fetchJson("/api/paper/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    renderPaperPortfolio();
    renderDashboard();
  } catch (error) {
    setPaperStatus(`Reset fehlgeschlagen: ${error.message}`, "error");
  }
}

function renderPortfolio() {
  const snapshot = state.portfolioSnapshot;

  if (elements.portfolioMeta) {
    elements.portfolioMeta.textContent = snapshot
      ? `Stand: ${formatDateTime(snapshot.fetchedAt)}`
      : "Noch kein Abruf";
  }

  if (!snapshot) {
    if (elements.portfolioBalances) {
      elements.portfolioBalances.innerHTML = '<div class="empty-state">Noch kein Abruf.</div>';
    }
    if (elements.portfolioOrders) {
      elements.portfolioOrders.innerHTML = '<div class="empty-state">Keine offenen Orders.</div>';
    }
  }

  if (snapshot) {
    renderPortfolioBalances(snapshot.balances);
    renderPortfolioOrders(snapshot.openOrders);
  }
  renderTraderCycleRuns(state.adminTraderCycleRuns, state.adminTraderCycleRunsSummary, state.adminTraderCycleRunsSeries);
}

async function loadTraderCycleRuns() {
  try {
    const response = await fetchJson("/api/admin/trader/cycle-runs?limit=10&seriesLimit=50", {
      headers: adminHeaders()
    });
    state.adminTraderCycleRuns = Array.isArray(response.items) ? response.items : [];
    state.adminTraderCycleRunsSummary = response.summary || null;
    state.adminTraderCycleRunsSeries = response.series || null;
    state.adminTraderCycleRunsError = null;
  } catch (error) {
    state.adminTraderCycleRuns = [];
    state.adminTraderCycleRunsSummary = null;
    state.adminTraderCycleRunsSeries = null;
    state.adminTraderCycleRunsError = error.message;
  }
}

function renderPortfolioBalances(balances) {
  if (!elements.portfolioBalances) return;

  const entries = Object.entries(balances || {})
    .map(([asset, amount]) => ({ asset: normalizeKrakenAsset(asset), amount: Number(amount) }))
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => a.asset.localeCompare(b.asset));

  if (!entries.length) {
    elements.portfolioBalances.innerHTML = '<div class="empty-state">Keine Positionen.</div>';
    return;
  }

  elements.portfolioBalances.innerHTML = `
    <table class="portfolio-table">
      <thead>
        <tr><th>Asset</th><th>Menge</th></tr>
      </thead>
      <tbody>
        ${entries.map((entry) => `
          <tr>
            <td><strong>${escapeHtml(entry.asset)}</strong></td>
            <td class="portfolio-table__num">${escapeHtml(formatNumber(entry.amount, 6))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderPortfolioOrders(orders) {
  if (!elements.portfolioOrders) return;

  if (!orders || !orders.length) {
    elements.portfolioOrders.innerHTML = '<div class="empty-state">Keine offenen Orders.</div>';
    return;
  }

  elements.portfolioOrders.innerHTML = `
    <table class="portfolio-table">
      <thead>
        <tr><th>Paar</th><th>Richtung</th><th>Typ</th><th>Preis</th><th>Menge</th><th>Eroeffnet</th></tr>
      </thead>
      <tbody>
        ${orders.map((order) => `
          <tr>
            <td><strong>${escapeHtml(order.pair || "-")}</strong></td>
            <td>${escapeHtml(order.type || "-")}</td>
            <td>${escapeHtml(order.ordertype || "-")}</td>
            <td class="portfolio-table__num">${escapeHtml(order.price || "-")}</td>
            <td class="portfolio-table__num">${escapeHtml(order.volume || "-")}</td>
            <td>${escapeHtml(formatDateTime(order.opened_at) || "-")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderTraderCycleRuns(items, summary, series) {
  if (!elements.portfolioCycleRuns || !elements.portfolioCycleSummary || !elements.portfolioCycleTrend) return;

  const runs = Array.isArray(items) ? items : [];
  const overview = summary || {};
  const trend = renderCycleTrend(series);

  if (!runs.length) {
    elements.portfolioCycleTrend.innerHTML = trend.fallback;
    elements.portfolioCycleSummary.innerHTML = `
      <div class="cycle-summary-chip">
        <span class="cycle-summary-chip__label">Zyklen</span>
        <strong>0</strong>
      </div>
    `;
    elements.portfolioCycleRuns.innerHTML = '<div class="empty-state">Noch keine Zyklusdaten.</div>';
    if (elements.portfolioCycleMeta) {
      elements.portfolioCycleMeta.textContent = state.adminTraderCycleRunsError ? "Trader-Zyklen nicht erreichbar" : "Keine Zyklusdaten";
    }
    return;
  }

  if (elements.portfolioCycleMeta) {
    elements.portfolioCycleMeta.textContent = series && series.total_runs ? `${series.total_runs} Läufe im Trend` : `${runs.length} Läufe geladen`;
  }

  elements.portfolioCycleTrend.innerHTML = trend.markup;

  const summaryItems = [
    { label: "Zyklen", value: overview.total_runs ?? runs.length },
    { label: "Buys", value: overview.total_buys ?? 0 },
    { label: "Skipped", value: overview.total_skipped_buys ?? 0 },
    { label: "Risk-Skips", value: overview.total_risk_skips ?? 0 }
  ];

  elements.portfolioCycleSummary.innerHTML = `
    <div class="cycle-summary-grid">
      ${summaryItems.map((item) => `
        <div class="cycle-summary-chip">
          <span class="cycle-summary-chip__label">${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(String(item.value))}</strong>
        </div>
      `).join("")}
      <div class="cycle-summary-chip">
        <span class="cycle-summary-chip__label">Top-Grund</span>
        <strong>${escapeHtml((overview.top_risk_skip_reason && overview.top_risk_skip_reason.key) || "–")}</strong>
      </div>
      <div class="cycle-summary-chip">
        <span class="cycle-summary-chip__label">Top-Blocker</span>
        <strong>${escapeHtml((overview.top_risk_skip_blocker && overview.top_risk_skip_blocker.key) || "–")}</strong>
      </div>
    </div>
  `;

  elements.portfolioCycleRuns.innerHTML = `
    <table class="portfolio-table">
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
              <td>${escapeHtml(formatDateTime(run.createdAt))}</td>
              <td>${escapeHtml(run.mode || "long")} ${run.dryRun ? '<span class="badge badge--warn">DRY</span>' : ""}</td>
              <td>${run.skipped ? escapeHtml(run.skipReason || "skip") : "ok"}</td>
              <td class="portfolio-table__num">${escapeHtml(String(result.buys || 0))} / ${escapeHtml(String(result.sells || 0))}</td>
              <td class="portfolio-table__num">${escapeHtml(String(skipStats.total || 0))}</td>
              <td>${topReason ? `${escapeHtml(topReason.key)} (${escapeHtml(String(topReason.count || 0))})` : "–"}</td>
              <td>${topBlocker ? `${escapeHtml(topBlocker.key)} (${escapeHtml(String(topBlocker.count || 0))})` : "–"}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderCycleTrend(series) {
  const points = series && Array.isArray(series.points) ? series.points : [];
  if (!points.length) {
    return {
      fallback: '<div class="empty-state">Keine Trenddaten.</div>',
      markup: ""
    };
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
  const executedPath = buildPolylinePath(executedPoints, "cycle-trend-chart__line cycle-trend-chart__line--executed");
  const blockedPath = buildPolylinePath(blockedPoints, "cycle-trend-chart__line cycle-trend-chart__line--blocked");
  const lastExecuted = executedPoints[executedPoints.length - 1];
  const lastBlocked = blockedPoints[blockedPoints.length - 1];
  const first = series.first_point || points[0];
  const last = series.last_point || points[points.length - 1];

  return {
    fallback: "",
    markup: `
      <div class="cycle-trend-panel">
        <div class="cycle-trend-panel__header">
          <div>
            <p class="cycle-trend-panel__eyebrow">Trend</p>
            <h5>Letzte ${escapeHtml(String(points.length))} Zyklen</h5>
          </div>
          <div class="cycle-trend-panel__meta">
            <span>Aktiv ${escapeHtml(formatTrendDelta(first && first.executed, last && last.executed))}</span>
            <span>Blockiert ${escapeHtml(formatTrendDelta(first && first.blocked, last && last.blocked))}</span>
          </div>
        </div>
        <div class="cycle-trend-legend">
          <span><i class="cycle-trend-legend__swatch cycle-trend-legend__swatch--executed"></i>Aktivität</span>
          <span><i class="cycle-trend-legend__swatch cycle-trend-legend__swatch--blocked"></i>Blockiert</span>
        </div>
        <svg class="cycle-trend-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Trader-Zyklus Trend">
          <line class="cycle-trend-chart__baseline" x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}"></line>
          ${executedPath}
          ${blockedPath}
          ${lastExecuted ? `<circle class="cycle-trend-chart__dot cycle-trend-chart__dot--executed" cx="${lastExecuted.x.toFixed(2)}" cy="${lastExecuted.y.toFixed(2)}" r="3.5"></circle>` : ""}
          ${lastBlocked ? `<circle class="cycle-trend-chart__dot cycle-trend-chart__dot--blocked" cx="${lastBlocked.x.toFixed(2)}" cy="${lastBlocked.y.toFixed(2)}" r="3.5"></circle>` : ""}
        </svg>
        <div class="cycle-trend-panel__footer">
          <span>Start ${escapeHtml(formatTrendValue(first && first.executed))} / ${escapeHtml(formatTrendValue(first && first.blocked))}</span>
          <span>Ende ${escapeHtml(formatTrendValue(last && last.executed))} / ${escapeHtml(formatTrendValue(last && last.blocked))}</span>
          <span>Δ ${escapeHtml(formatTrendDelta(first && first.executed, last && last.executed))}</span>
        </div>
      </div>
    `
  };
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

function formatTrendValue(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "–";
  }
  return String(Number(value));
}

function formatTrendDelta(fromValue, toValue) {
  if (fromValue === null || fromValue === undefined || toValue === null || toValue === undefined) {
    return "–";
  }
  const delta = Number(toValue) - Number(fromValue);
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}`;
}

function normalizeKrakenAsset(asset) {
  const MAP = {
    XXBT: "BTC", XETH: "ETH", XLTC: "LTC", XXRP: "XRP",
    XXLM: "XLM", XZEC: "ZEC", XXMR: "XMR", XREP: "REP",
    ZEUR: "EUR", ZUSD: "USD", ZGBP: "GBP"
  };
  return MAP[asset] || asset;
}

function getCoinPortfolioAmount(coin) {
  const paperPositions = state.paperStatus && Array.isArray(state.paperStatus.positions)
    ? state.paperStatus.positions
    : [];
  const paperAmount = paperPositions
    .filter((position) => position.coinSymbol === coin.symbol)
    .reduce((sum, position) => sum + Number(position.volume || 0), 0);
  if (paperAmount > 0) return paperAmount;

  const snapshot = state.portfolioSnapshot;
  if (!snapshot || !snapshot.balances) return null;

  const balances = snapshot.balances;
  const base = (coin.base_asset || "").toUpperCase();

  const candidates = [base, `X${base}`, `Z${base}`];
  for (const key of candidates) {
    const amount = Number(balances[key]);
    if (amount > 0) return amount;
  }
  return null;
}

function getSelectedCoin() {
  if (state.selectedSymbol) {
    return state.coins.find((coin) => coin.symbol === state.selectedSymbol) || null;
  }

  return state.visibleCoins[0] || state.coins[0] || null;
}

function getAvailableTimeframes() {
  const fromSettings = [...new Set(state.settings.map((setting) => setting.timeframe))];
  const ordered = TIMEFRAME_ORDER.filter((timeframe) => fromSettings.includes(timeframe));
  const preferredOrder = ["4h", "1d", "1h", "15m", "5m"];
  const preferred = preferredOrder.filter((timeframe) => ordered.includes(timeframe));
  return preferred.length ? preferred : ["4h"];
}

function getCoinSnapshot(coin, timeframe = state.selectedTimeframe) {
  if (!coin || !coin.timeframes) {
    return null;
  }

  return coin.timeframes[timeframe] || null;
}

function getChartCacheKey(symbol, timeframe) {
  return `${symbol}::${timeframe}`;
}

function getStrategySetting(timeframe) {
  return state.settings.find((setting) => setting.timeframe === timeframe) || null;
}

function calculateEmaSeries(values, period) {
  const safePeriod = Math.max(1, Number(period) || 1);
  const multiplier = 2 / (safePeriod + 1);
  let ema = null;

  return values.map((value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return null;
    }

    ema = ema === null ? numericValue : ((numericValue - ema) * multiplier) + ema;
    return ema;
  });
}

function getSignalCounts(timeframe) {
  const counts = {
    buy: 0,
    watch: 0,
    avoid: 0,
    sell: 0,
    waiting: 0
  };

  state.coins.forEach((coin) => {
    const snapshot = getCoinSnapshot(coin, timeframe);
    const signalType = snapshot && snapshot.signal_type ? snapshot.signal_type : "waiting";
    counts[signalType] += 1;
  });

  return counts;
}

function getDisplaySignalCounts(timeframe) {
  const counts = getSignalCounts(timeframe);

  return {
    buy: counts.buy,
    watch: counts.watch + counts.waiting,
    sell: counts.sell + counts.avoid
  };
}

function getLatestSignalTime(timeframe) {
  const times = state.coins
    .map((coin) => {
      const snapshot = getCoinSnapshot(coin, timeframe);
      return snapshot ? snapshot.signal_created_at : null;
    })
    .filter(Boolean)
    .sort();

  return times[times.length - 1] || null;
}

function renderTimeframeSwitch() {
  const timeframes = getAvailableTimeframes();
  elements.timeframeSwitch.innerHTML = timeframes
    .map((timeframe) => `
      <button
        class="timeframe-switch__button ${timeframe === state.selectedTimeframe ? "is-active" : ""}"
        type="button"
        data-timeframe="${escapeHtml(timeframe)}"
      >
        ${escapeHtml(timeframe)}
      </button>
    `)
    .join("");

  elements.timeframeSwitch.querySelectorAll("[data-timeframe]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTimeframe = button.dataset.timeframe;
      renderDashboard();
      if (elements.backtestsOverlay && !elements.backtestsOverlay.hidden && state.backtests) {
        renderBacktests();
      }
    });
  });
}

function renderStats() {
  const counts = getDisplaySignalCounts(state.selectedTimeframe);
  const items = [
    ["Coins", state.coins.length],
    ["Kaufen", counts.buy],
    ["Beobachten", counts.watch],
    ["Verkaufen", counts.sell]
  ];

  elements.statsGrid.innerHTML = items
    .map(
      ([label, value]) => `
        <span class="stats-pill">
          <span class="stats-pill__label">${escapeHtml(label)}</span>
          <strong class="stats-pill__value">${escapeHtml(String(value))}</strong>
        </span>
      `
    )
    .join("");
}

function renderOverviewStrip() {
  const counts = getDisplaySignalCounts(state.selectedTimeframe);
  const items = [
    ["Beobachten", counts.watch],
    ["Kaufen", counts.buy],
    ["Verkaufen", counts.sell]
  ];

  elements.overviewStrip.innerHTML = items
    .map(
      ([label, value]) => `
        <article class="stat-card">
          <div class="stat-card__label">${escapeHtml(label)}</div>
          <div class="stat-card__value">${escapeHtml(String(value))}</div>
        </article>
      `
    )
    .join("");

  const latestSignalTime = getLatestSignalTime(state.selectedTimeframe);
  elements.lastSync.textContent = latestSignalTime
    ? `Letztes ${state.selectedTimeframe}-Signal ${formatDateTime(latestSignalTime)}`
    : `Noch kein ${state.selectedTimeframe}-Signal`;

  elements.strategyList.innerHTML = `
    <article class="strategy-item strategy-item--compact">
      <strong>EMA20/50</strong>
      <p>Trendfilter</p>
    </article>
    <article class="strategy-item strategy-item--compact">
      <strong>RSI 45-65</strong>
      <p>Einstiegskorridor</p>
    </article>
    <article class="strategy-item strategy-item--compact">
      <strong>${escapeHtml(state.selectedTimeframe)}</strong>
      <p>Ansicht</p>
    </article>
  `;
}

function renderSettings() {
  elements.settingsMeta.textContent = `${state.settings.length} Profile`;

  if (!state.settings.length) {
    elements.settingsList.innerHTML = '<div class="empty-state">Keine Strategieprofile vorhanden.</div>';
    return;
  }

  elements.settingsList.innerHTML = state.settings
    .map(
      (setting) => `
        <article class="setting-card">
          <div class="setting-card__header">
            <strong>${escapeHtml(setting.label)}</strong>
            <span class="detail-chip">${escapeHtml(setting.timeframe)}</span>
          </div>
          <p>${escapeHtml(setting.notes || "Regelprofil fuer diesen Zeithorizont.")}</p>
          <div class="setting-card__values">
            <div class="setting-chip">RSI ${escapeHtml(String(setting.rsi_min))} - ${escapeHtml(String(setting.rsi_max))}</div>
            <div class="setting-chip">Stop ${escapeHtml(String(setting.stop_loss_percent))}%</div>
            <div class="setting-chip">EMA ${escapeHtml(String(setting.fast_ema_period))}/${escapeHtml(String(setting.slow_ema_period))}</div>
            <div class="setting-chip">Vol ${escapeHtml(String(setting.volume_factor_min))}x</div>
          </div>
        </article>
      `
    )
    .join("");
}

function getBacktestStrategy(timeframe = state.selectedTimeframe) {
  if (!state.backtests || !Array.isArray(state.backtests.items)) {
    return null;
  }

  return state.backtests.items.find((item) => item.timeframe === timeframe) || state.backtests.items[0] || null;
}

function renderBacktests() {
  if (!elements.backtestsSummary || !elements.backtestsDetail || !elements.backtestsMeta) {
    return;
  }

  if (!state.backtests || !Array.isArray(state.backtests.items) || !state.backtests.items.length) {
    elements.backtestsMeta.textContent = "Keine Backtest-Daten";
    elements.backtestsSummary.innerHTML = '<div class="empty-state">Keine Backtests verfuegbar.</div>';
    elements.backtestsDetail.innerHTML = '<div class="empty-state empty-state--block">Es konnten keine Backtest-Daten berechnet werden.</div>';
    return;
  }

  const active = getBacktestStrategy();
  const lookback = Number(state.backtests.lookback_candles || 0);
  const generatedAt = state.backtests.generated_at ? formatDateTime(state.backtests.generated_at) : "n/v";
  elements.backtestsMeta.textContent = `${lookback} Candles je Profil · ${generatedAt}`;

  elements.backtestsSummary.innerHTML = state.backtests.items
    .map((item) => `
      <button
        class="backtest-card ${item.timeframe === (active && active.timeframe) ? "is-active" : ""}"
        type="button"
        data-backtest-timeframe="${escapeHtml(item.timeframe)}"
      >
        <div class="backtest-card__header">
          <strong>${escapeHtml(item.label)}</strong>
          <span class="detail-chip">${escapeHtml(item.timeframe)}</span>
        </div>
        <div class="backtest-card__metrics">
          <span>Trades ${escapeHtml(String(item.trades_count || 0))}</span>
          <span>Win ${escapeHtml(formatPercent(item.win_rate_percent))}</span>
          <span>Total ${escapeHtml(formatPercent(item.average_total_return_percent))}</span>
          <span>DD ${escapeHtml(formatPercent(item.average_max_drawdown_percent))}</span>
          <span>Blocker ${escapeHtml(blockerLabel(item.top_blocker || "-"))}</span>
        </div>
      </button>
    `)
    .join("");

  elements.backtestsSummary.querySelectorAll("[data-backtest-timeframe]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTimeframe = button.dataset.backtestTimeframe;
      renderDashboard();
      renderBacktests();
    });
  });

  if (!active) {
    elements.backtestsDetail.innerHTML = '<div class="empty-state empty-state--block">Kein Profil zum gewaehlten Timeframe gefunden.</div>';
    return;
  }

  const rows = Array.isArray(active.items) ? active.items.slice() : [];
  rows.sort((left, right) => {
    const rightValue = Number.isFinite(Number(right.total_return_percent)) ? Number(right.total_return_percent) : -Infinity;
    const leftValue = Number.isFinite(Number(left.total_return_percent)) ? Number(left.total_return_percent) : -Infinity;
    return rightValue - leftValue;
  });

  elements.backtestsDetail.innerHTML = `
    <div class="backtest-detail__header">
      <div>
        <strong>${escapeHtml(active.label)}</strong>
        <p>${escapeHtml(active.notes || "Regelprofil fuer diesen Horizont.")}</p>
      </div>
      <div class="backtest-detail__meta">
        <span class="detail-chip">Coins ${escapeHtml(String(active.coins_tested || 0))}</span>
        <span class="detail-chip">Mit Trades ${escapeHtml(String(active.coins_with_trades || 0))}</span>
        <span class="detail-chip">Avg Trade ${escapeHtml(formatPercent(active.average_trade_percent))}</span>
      </div>
    </div>
    <div class="backtest-blockers">
      ${(Array.isArray(active.blocker_stats) && active.blocker_stats.length ? active.blocker_stats : [{ key: "-", count: 0, share_percent: null }]).map((item) => `
        <article class="backtest-blocker">
          <strong>${escapeHtml(blockerLabel(item.key || "-"))}</strong>
          <span>${escapeHtml(String(item.count || 0))} blockierte Fenster</span>
          <span>${escapeHtml(formatPercent(item.share_percent))}</span>
        </article>
      `).join("")}
    </div>
    <div class="table-shell">
      <table class="signal-table backtest-table">
        <thead>
          <tr>
            <th>Coin</th>
            <th>Trades</th>
            <th>Win</th>
            <th>Avg Trade</th>
            <th>Total</th>
            <th>Max DD</th>
            <th>Hold</th>
            <th>Top Blocker</th>
            <th>Letzter Exit</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => `
            <tr>
              <td>
                <strong>${escapeHtml(item.symbol)}</strong><br>
                <span class="table-subline">${escapeHtml(item.name)}</span>
              </td>
              <td>${escapeHtml(String(item.trades_count || 0))}</td>
              <td>${escapeHtml(formatPercent(item.win_rate_percent))}</td>
              <td>${escapeHtml(formatPercent(item.average_return_percent))}</td>
              <td>${escapeHtml(formatPercent(item.total_return_percent))}</td>
              <td>${escapeHtml(formatPercent(item.max_drawdown_percent))}</td>
              <td>${item.average_hold_candles === null ? "-" : `${escapeHtml(formatNumber(item.average_hold_candles, 1))} Kerzen`}</td>
              <td>${escapeHtml(blockerLabel(item.top_blocker || "-"))}</td>
              <td>${item.last_trade_at ? `${escapeHtml(formatDateTime(item.last_trade_at))}<br><span class="table-subline">${escapeHtml(item.last_exit_reason || "-")}</span>` : "-"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function loadBacktests() {
  if (!elements.backtestsMeta || !elements.backtestsSummary || !elements.backtestsDetail) {
    return;
  }

  elements.backtestsMeta.textContent = "Backtest wird berechnet ...";
  elements.backtestsSummary.innerHTML = '<div class="empty-state">Backtest wird berechnet.</div>';
  elements.backtestsDetail.innerHTML = '<div class="empty-state empty-state--block">Bitte kurz warten.</div>';

  try {
    state.backtests = await fetchJson("/api/backtests?lookback=720");
    renderBacktests();
  } catch (error) {
    state.backtests = null;
    elements.backtestsMeta.textContent = "Backtest nicht erreichbar";
    elements.backtestsSummary.innerHTML = '<div class="empty-state">Backtest konnte nicht geladen werden.</div>';
    elements.backtestsDetail.innerHTML = '<div class="empty-state empty-state--block">API oder Berechnung hat nicht geantwortet.</div>';
  }
}

function renderTable() {
  const visibleCoins = getFilteredSortedCoins();
  state.visibleCoins = visibleCoins;
  elements.matrixMeta.textContent = `${visibleCoins.length} von ${state.coins.length} Coins / ${state.selectedTimeframe}`;
  renderMatrixGroupSummary();

  if (!state.coins.length) {
    elements.signalTableBody.innerHTML = `
      <tr><td colspan="7" class="empty-state">Keine Marktdaten geladen.</td></tr>
    `;
    return;
  }

  if (!visibleCoins.length) {
    state.selectedSymbol = null;
    elements.signalTableBody.innerHTML = `
      <tr><td colspan="7" class="empty-state">Kein Coin passt zum aktuellen Filter.</td></tr>
    `;
    return;
  }

  if (!visibleCoins.find((coin) => coin.symbol === state.selectedSymbol)) {
    state.selectedSymbol = visibleCoins[0] ? visibleCoins[0].symbol : state.selectedSymbol;
  }

  elements.signalTableBody.innerHTML = visibleCoins
    .map((coin) => {
      const snapshot = getCoinSnapshot(coin);
      const isShortMode = state.tradeMode === "short";
      const primaryTf = isShortMode ? "4h" : "1d";
      const entryTf = isShortMode ? "1h" : "4h";
      const primarySnapshot = getCoinSnapshot(coin, primaryTf);
      const entrySnapshot = getCoinSnapshot(coin, entryTf);
      const entryGate = getEntryGateState(coin);
      const riskSnapshot = entrySnapshot || snapshot;
      const riskLevels = getRiskLevels(riskSnapshot);
      const activeClass = coin.symbol === state.selectedSymbol ? "is-active" : "";
      const portfolioAmount = getCoinPortfolioAmount(coin);
      const portfolioBadge = portfolioAmount !== null
        ? `<span class="portfolio-badge" title="${escapeHtml(formatNumber(portfolioAmount, 6))} ${escapeHtml(coin.base_asset)} im Bestand">&#9670;</span>`
        : "";
      return `
        <tr class="${activeClass} matrix-row matrix-row--${escapeHtml(entryGate.key)}" data-symbol="${escapeHtml(coin.symbol)}">
          <td>
            <div class="coin-cell">
              <div class="coin-cell__identity">
                <strong>${escapeHtml(coin.symbol)}</strong>${portfolioBadge}<br>
                <small>${escapeHtml(coin.name)}</small>
              </div>
              <div class="coin-cell__signals">
                <span class="coin-chip coin-chip--main">
                  <span class="coin-chip__label">${escapeHtml(primaryTf)}</span>
                  <span class="signal-badge signal-badge--inline ${signalClass(primarySnapshot && primarySnapshot.signal_type)}">${escapeHtml(signalLabel(primarySnapshot && primarySnapshot.signal_type))}</span>
                </span>
                <span class="coin-chip">
                  <span class="coin-chip__label">${escapeHtml(entryTf)}</span>
                  <span class="signal-badge signal-badge--inline ${signalClass(entrySnapshot && entrySnapshot.signal_type)}">${escapeHtml(signalLabel(entrySnapshot && entrySnapshot.signal_type))}</span>
                </span>
                <span class="coin-entry-state coin-entry-state--${escapeHtml(entryGate.tone)}">${escapeHtml(entryGate.label)}</span>
              </div>
              <div class="coin-riskline">
                <span class="coin-riskline__label">${escapeHtml((entrySnapshot && entrySnapshot.close_price !== null && entrySnapshot.close_price !== undefined) ? `${entryTf} Risiko` : `${state.selectedTimeframe} Risiko`)}</span>
                <span class="coin-riskline__item">
                  Stop ${escapeHtml(formatPrice(riskLevels && riskLevels.stopPrice))}
                  <small>${escapeHtml(formatCompactPercent(riskLevels && riskLevels.stopLossPercent))}</small>
                </span>
                <span class="coin-riskline__item">
                  Ziel ${escapeHtml(formatPrice(riskLevels && riskLevels.takeProfitPrice))}
                  <small>${escapeHtml(formatCompactPercent(riskLevels && riskLevels.takeProfitPercent))}</small>
                </span>
                <span class="coin-riskline__item">
                  C/R <strong>${escapeHtml(formatNumber(riskLevels && riskLevels.rewardRiskRatio, 2))}</strong>
                </span>
              </div>
            </div>
          </td>
          <td><span class="signal-badge ${signalClass(snapshot && snapshot.signal_type)}">${escapeHtml(signalLabel(snapshot && snapshot.signal_type))}</span></td>
          <td>${escapeHtml(formatPrice(snapshot && snapshot.close_price))}</td>
          <td>${escapeHtml(formatNumber(snapshot && snapshot.rsi_value, 1))}</td>
          <td>${escapeHtml(formatPrice(snapshot && snapshot.ema_fast))}</td>
          <td>${escapeHtml(formatPrice(snapshot && snapshot.ema_slow))}</td>
          <td>${escapeHtml(formatNumber(snapshot && snapshot.volume_ratio, 2))}x</td>
        </tr>
      `;
    })
    .join("");

  elements.signalTableBody.querySelectorAll("[data-symbol]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedSymbol = row.dataset.symbol;
      renderDashboard();
    });
  });
}

function renderDetail() {
  const coin = getSelectedCoin();
  if (!coin) {
    elements.rationaleMeta.textContent = "Noch keine Auswahl";
    elements.signalDetail.innerHTML = '<div class="empty-state empty-state--block">Waehle einen Coin aus.</div>';
    return;
  }

  const current = getCoinSnapshot(coin);
  const timeframes = getAvailableTimeframes();
  const reasons = current && Array.isArray(current.reasons) && current.reasons.length
    ? current.reasons
    : ["Noch keine Begruendung gespeichert."];

  const showDualChart = state.selectedTimeframe !== "1d";
  const chartMarkup = showDualChart
    ? renderChartPanel(coin, "1d", true) + renderChartPanel(coin, state.selectedTimeframe, true)
    : renderChartPanel(coin, "1d", false);

  elements.rationaleMeta.textContent = `${coin.symbol} / ${state.selectedTimeframe}`;
  elements.signalDetail.innerHTML = `
    <article class="signal-detail__panel">
      <div class="signal-detail__header">
        <div>
          <p class="eyebrow">Signalprofil</p>
          <h3 class="signal-detail__title">${escapeHtml(coin.name)} <span class="section-meta">${escapeHtml(coin.symbol)}</span></h3>
        </div>
        <span class="signal-badge ${signalClass(current && current.signal_type)}">${escapeHtml(signalLabel(current && current.signal_type))}</span>
      </div>
      <div class="timeframe-grid">
        ${timeframes.map((timeframe) => {
          const snapshot = getCoinSnapshot(coin, timeframe);
          return `
            <button class="timeframe-card ${timeframe === state.selectedTimeframe ? "is-active" : ""}" type="button" data-detail-timeframe="${escapeHtml(timeframe)}">
              <div class="timeframe-card__head">
                <span class="timeframe-card__label">${escapeHtml(timeframe)}</span>
                <span class="signal-badge ${signalClass(snapshot && snapshot.signal_type)}">${escapeHtml(signalLabel(snapshot && snapshot.signal_type))}</span>
              </div>
              <div class="timeframe-card__price">${escapeHtml(formatPrice(snapshot && snapshot.close_price))}</div>
              <div class="timeframe-card__time">${escapeHtml(formatDateTime(snapshot && snapshot.signal_created_at))}</div>
            </button>
          `;
        }).join("")}
      </div>
      ${chartMarkup}
      <p>${escapeHtml((current && current.summary) || "Bewertung aus Trend, Momentum und Volumen.")}</p>
      <div class="metric-grid">
        <div class="detail-metric">
          <span>Letzter Preis</span>
          <strong>${escapeHtml(formatPrice(current && current.close_price))}</strong>
        </div>
        <div class="detail-metric">
          <span>RSI</span>
          <strong>${escapeHtml(formatNumber(current && current.rsi_value, 2))}</strong>
        </div>
        <div class="detail-metric">
          <span>MACD</span>
          <strong>${escapeHtml(formatNumber(current && current.macd_value, 4))}</strong>
        </div>
        <div class="detail-metric">
          <span>Volumen</span>
          <strong>${escapeHtml(formatNumber(current && current.volume_ratio, 2))}x</strong>
        </div>
      </div>
      <div>
        <p class="eyebrow">Regelgruende</p>
        <ul class="detail-reasons">
          ${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
        </ul>
      </div>
      <div class="metric-grid">
        <div class="detail-metric">
          <span>Aktualisiert</span>
          <strong>${escapeHtml(formatDateTime(current && current.signal_created_at))}</strong>
        </div>
        <div class="detail-metric">
          <span>Stop-Loss</span>
          <strong>${escapeHtml(formatPercent(current && current.stop_loss_percent))}</strong>
        </div>
      </div>
    </article>
  `;

  elements.signalDetail.querySelectorAll("[data-detail-timeframe]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTimeframe = button.dataset.detailTimeframe;
      renderDashboard();
    });
  });
}

function renderChartPanel(coin, timeframe, compact = false) {
  const cacheKey = getChartCacheKey(coin.symbol, timeframe);
  const chartState = state.chartCache[cacheKey];
  const strategy = getStrategySetting(timeframe);
  const fastPeriod = Number(strategy && strategy.fast_ema_period) || 20;
  const slowPeriod = Number(strategy && strategy.slow_ema_period) || 50;
  const panelClass = compact ? "chart-panel chart-panel--compact" : "chart-panel";

  if (!chartState) {
    loadChartData(coin.symbol, timeframe);
  }

  const snapshot = getCoinSnapshot(coin, timeframe);

  if (!chartState || chartState.status === "loading") {
    return `
      <section class="${panelClass}">
        <div class="chart-panel__header">
          <h4 class="chart-panel__title">Preisverlauf ${escapeHtml(timeframe)}</h4>
          <span class="chart-panel__subtle">Lade Kerzen ...</span>
        </div>
        <div class="chart-legend">
          <span class="chart-legend__item"><span class="chart-legend__line chart-legend__line--ema-fast"></span>EMA${escapeHtml(String(fastPeriod))}</span>
          <span class="chart-legend__item"><span class="chart-legend__line chart-legend__line--ema-slow"></span>EMA${escapeHtml(String(slowPeriod))}</span>
        </div>
        <div class="chart-empty">Kerzen werden geladen.</div>
      </section>
    `;
  }

  if (chartState.status === "error") {
    return `
      <section class="${panelClass}">
        <div class="chart-panel__header">
          <h4 class="chart-panel__title">Preisverlauf ${escapeHtml(timeframe)}</h4>
          <span class="chart-panel__subtle">Fehler</span>
        </div>
        <div class="chart-legend">
          <span class="chart-legend__item"><span class="chart-legend__line chart-legend__line--ema-fast"></span>EMA${escapeHtml(String(fastPeriod))}</span>
          <span class="chart-legend__item"><span class="chart-legend__line chart-legend__line--ema-slow"></span>EMA${escapeHtml(String(slowPeriod))}</span>
        </div>
        <div class="chart-empty">Chartdaten konnten nicht geladen werden.</div>
      </section>
    `;
  }

  const items = chartState.items || [];
  const prices = items.map((item) => Number(item.close_price));
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const latest = prices.length ? prices[prices.length - 1] : null;

  return `
    <section class="${panelClass}">
      <div class="chart-panel__header">
        <h4 class="chart-panel__title">Preisverlauf ${escapeHtml(timeframe)}</h4>
        <span class="chart-panel__subtle">Letzte ${items.length} Kerzen</span>
      </div>
      <div class="chart-legend">
        <span class="chart-legend__item"><span class="chart-legend__line chart-legend__line--ema-fast"></span>EMA${escapeHtml(String(fastPeriod))}</span>
        <span class="chart-legend__item"><span class="chart-legend__line chart-legend__line--ema-slow"></span>EMA${escapeHtml(String(slowPeriod))}</span>
      </div>
      ${items.length ? `
        <div class="chart-stack">
          ${buildCandlestickChartSvg(items, timeframe)}
          ${buildVolumeChartSvg(items)}
        </div>
      ` : '<div class="chart-empty">Keine Chartdaten verfuegbar.</div>'}
      <div class="chart-panel__meta">
        <span class="chart-panel__subtle">Tief ${escapeHtml(formatPrice(min))}</span>
        <span class="chart-panel__subtle">Aktuell ${escapeHtml(formatPrice(latest || (snapshot && snapshot.close_price)))}</span>
        <span class="chart-panel__subtle">Hoch ${escapeHtml(formatPrice(max))}</span>
      </div>
    </section>
  `;
}

function buildCandlestickChartSvg(items, timeframe) {
  const width = 720;
  const height = 200;
  const paddingX = 18;
  const paddingY = 18;
  const lows = items.map((item) => Number(item.low_price));
  const highs = items.map((item) => Number(item.high_price));
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const range = max - min || 1;
  const plotWidth = width - paddingX * 2;
  const candleSlot = plotWidth / Math.max(items.length, 1);
  const candleBodyWidth = Math.max(3, Math.min(10, candleSlot * 0.55));
  const strategy = getStrategySetting(timeframe);
  const fastPeriod = Number(strategy && strategy.fast_ema_period) || 20;
  const slowPeriod = Number(strategy && strategy.slow_ema_period) || 50;
  const closes = items.map((item) => Number(item.close_price));
  const emaFast = calculateEmaSeries(closes, fastPeriod);
  const emaSlow = calculateEmaSeries(closes, slowPeriod);
  const gridLines = [0.25, 0.5, 0.75]
    .map((ratio) => {
      const y = paddingY + ratio * (height - paddingY * 2);
      return `<line class="price-chart__grid" x1="${paddingX}" y1="${y}" x2="${width - paddingX}" y2="${y}"></line>`;
    })
    .join("");
  const buildIndicatorPath = (series, className) => {
    const points = series.map((value, index) => {
      if (!Number.isFinite(value)) {
        return null;
      }

      const x = paddingX + candleSlot * index + candleSlot / 2;
      const y = height - paddingY - ((value - min) / range) * (height - paddingY * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).filter(Boolean);

    if (!points.length) {
      return "";
    }

    return `<polyline class="${className}" points="${points.join(" ")}"></polyline>`;
  };
  const candles = items.map((item, index) => {
    const x = paddingX + candleSlot * index + candleSlot / 2;
    const open = Number(item.open_price);
    const close = Number(item.close_price);
    const high = Number(item.high_price);
    const low = Number(item.low_price);
    const isUp = close >= open;
    const openY = height - paddingY - ((open - min) / range) * (height - paddingY * 2);
    const closeY = height - paddingY - ((close - min) / range) * (height - paddingY * 2);
    const highY = height - paddingY - ((high - min) / range) * (height - paddingY * 2);
    const lowY = height - paddingY - ((low - min) / range) * (height - paddingY * 2);
    const bodyY = Math.min(openY, closeY);
    const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));

    return `
      <g class="price-chart__candle ${isUp ? "is-up" : "is-down"}">
        <line class="price-chart__wick" x1="${x.toFixed(2)}" y1="${highY.toFixed(2)}" x2="${x.toFixed(2)}" y2="${lowY.toFixed(2)}"></line>
        <rect
          class="price-chart__body"
          x="${(x - candleBodyWidth / 2).toFixed(2)}"
          y="${bodyY.toFixed(2)}"
          width="${candleBodyWidth.toFixed(2)}"
          height="${bodyHeight.toFixed(2)}"
          rx="1"
          ry="1"
        ></rect>
      </g>
    `;
  }).join("");
  const latest = items[items.length - 1] || null;
  const latestClose = latest ? Number(latest.close_price) : null;
  const latestY = latestClose === null
    ? null
    : height - paddingY - ((latestClose - min) / range) * (height - paddingY * 2);
  const latestLabel = latestClose === null ? "" : `
    <line class="price-chart__last-guide" x1="${paddingX}" y1="${latestY.toFixed(2)}" x2="${width - paddingX}" y2="${latestY.toFixed(2)}"></line>
  `;
  const emaFastLine = buildIndicatorPath(emaFast, "price-chart__ema price-chart__ema--fast");
  const emaSlowLine = buildIndicatorPath(emaSlow, "price-chart__ema price-chart__ema--slow");

  return `
    <svg class="price-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Preisverlauf">
      ${gridLines}
      ${emaSlowLine}
      ${emaFastLine}
      ${latestLabel}
      ${candles}
    </svg>
  `;
}

function buildVolumeChartSvg(items) {
  const width = 720;
  const height = 72;
  const paddingX = 18;
  const paddingY = 8;
  const volumes = items.map((item) => Number(item.volume) || 0);
  const maxVolume = Math.max(...volumes, 1);
  const plotWidth = width - paddingX * 2;
  const slotWidth = plotWidth / Math.max(items.length, 1);
  const barWidth = Math.max(2, Math.min(10, slotWidth * 0.55));
  const bars = items.map((item, index) => {
    const x = paddingX + slotWidth * index + slotWidth / 2;
    const open = Number(item.open_price);
    const close = Number(item.close_price);
    const volume = Number(item.volume) || 0;
    const isUp = close >= open;
    const barHeight = Math.max(1, (volume / maxVolume) * (height - paddingY * 2));
    const y = height - paddingY - barHeight;

    return `
      <rect
        class="volume-chart__bar ${isUp ? "is-up" : "is-down"}"
        x="${(x - barWidth / 2).toFixed(2)}"
        y="${y.toFixed(2)}"
        width="${barWidth.toFixed(2)}"
        height="${barHeight.toFixed(2)}"
        rx="1"
        ry="1"
      ></rect>
    `;
  }).join("");

  return `
    <svg class="volume-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Volumenverlauf">
      <line class="volume-chart__baseline" x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}"></line>
      ${bars}
    </svg>
  `;
}

async function loadChartData(symbol, timeframe) {
  const cacheKey = getChartCacheKey(symbol, timeframe);
  if (state.chartCache[cacheKey] && state.chartCache[cacheKey].status === "loading") {
    return;
  }

  state.chartCache[cacheKey] = {
    status: "loading",
    items: []
  };

  try {
    const payload = await fetchJson(`/api/coins/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=48`);
    const items = Array.isArray(payload.items) ? payload.items.slice().reverse() : [];

    state.chartCache[cacheKey] = {
      status: "loaded",
      items
    };
  } catch (error) {
    state.chartCache[cacheKey] = {
      status: "error",
      items: []
    };
  }

  const selected = getSelectedCoin();
  const isDualChartTimeframe = state.selectedTimeframe !== "1d"
    ? (timeframe === state.selectedTimeframe || timeframe === "1d")
    : timeframe === "1d";
  if (selected && selected.symbol === symbol && isDualChartTimeframe) {
    renderDetail();
  }
}

function renderAdminCoins() {
  elements.adminCoinForm.hidden = !state.adminAuthorized;

  if (!state.adminAuthorized) {
    elements.adminCoinsList.innerHTML = `
      <div class="empty-state">
        Master-Zugriff nur mit Schnueddel-Auth.
        <br>
        <a href="https://schnueddels.de/auth/?redirect=${encodeURIComponent(window.location.href)}">Zum Login</a>
      </div>
    `;
    return;
  }

  if (!state.adminCoins.length) {
    elements.adminCoinsList.innerHTML = '<div class="empty-state">Keine Coins geladen.</div>';
    return;
  }

  elements.adminCoinsList.innerHTML = state.adminCoins
    .map((coin) => `
      <article class="admin-coin-card">
        <div class="admin-coin-card__header">
          <strong>${escapeHtml(coin.symbol)}</strong>
          <span class="admin-state-pill ${coin.is_active ? "is-active" : "is-inactive"}">
            ${coin.is_active ? "aktiv" : "inaktiv"}
          </span>
        </div>
        <div class="admin-coin-card__meta">
          <span>${escapeHtml(coin.name)}</span>
          <span>${escapeHtml(coin.exchange_symbol)}</span>
          <span>Standard ${escapeHtml(coin.default_timeframe || "4h")}</span>
          <span>Position ${escapeHtml(String(coin.sort_order))}</span>
        </div>
        <div class="admin-coin-card__actions">
          <span class="section-meta">
            ${coin.signal_type ? `Letztes Signal: ${escapeHtml(signalLabel(coin.signal_type))}` : "Noch kein Signal"}
          </span>
          <label class="admin-state-field">
            <span>Status</span>
            <select data-admin-state="${escapeHtml(String(coin.id))}">
              <option value="1" ${coin.is_active ? "selected" : ""}>Aktiv</option>
              <option value="0" ${coin.is_active ? "" : "selected"}>Inaktiv</option>
            </select>
          </label>
          <label class="admin-state-field">
            <span>Standard-Timeframe</span>
            <select data-admin-timeframe="${escapeHtml(String(coin.id))}">
              ${buildTimeframeOptions(coin.default_timeframe || "4h")}
            </select>
          </label>
          <label class="admin-state-field">
            <span>Regelprofile</span>
            <select data-admin-strategy="${escapeHtml(String(coin.id))}">
              <option value="">(Standard)</option>
              ${state.settings.map((s) => `
                <option value="${escapeHtml(s.setting_key)}" ${coin.strategy_key === s.setting_key ? "selected" : ""}>
                  ${escapeHtml(s.label)} (${escapeHtml(s.timeframe)})
                </option>
              `).join("")}
            </select>
          </label>
          <label class="admin-state-field admin-state-field--narrow">
            <span>Sortierung</span>
            <input
              data-admin-sort="${escapeHtml(String(coin.id))}"
              type="number"
              min="1"
              max="9999"
              step="1"
              value="${escapeHtml(String(coin.sort_order || 100))}"
            >
          </label>
          <button class="text-button text-button--small" type="button" data-admin-save="${escapeHtml(String(coin.id))}">
            Speichern
          </button>
          <button class="text-button text-button--danger" type="button" data-admin-delete="${escapeHtml(String(coin.id))}">
            Entfernen
          </button>
        </div>
      </article>
    `)
    .join("");

  elements.adminCoinsList.querySelectorAll("[data-admin-state]").forEach((select) => {
    select.addEventListener("change", async () => {
      const coinId = select.dataset.adminState;
      const nextState = select.value === "1";
      await toggleCoinState(coinId, nextState);
    });
  });

  elements.adminCoinsList.querySelectorAll("[data-admin-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const coinId = button.dataset.adminDelete;
      const coin = state.adminCoins.find((item) => String(item.id) === String(coinId));
      const label = coin ? coin.symbol : "diesen Coin";
      if (!window.confirm(`${label} wirklich entfernen? Kursdaten und Signale werden geloescht.`)) {
        return;
      }

      await deleteAdminCoin(coinId);
    });
  });

  elements.adminCoinsList.querySelectorAll("[data-admin-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      const coinId = button.dataset.adminSave;
      const timeframeField = elements.adminCoinsList.querySelector(`[data-admin-timeframe="${coinId}"]`);
      const sortField = elements.adminCoinsList.querySelector(`[data-admin-sort="${coinId}"]`);
      const strategyField = elements.adminCoinsList.querySelector(`[data-admin-strategy="${coinId}"]`);

      await updateAdminCoinSettings(coinId, {
        default_timeframe: timeframeField ? timeframeField.value : "4h",
        sort_order: sortField ? Number(sortField.value) : 100,
        strategy_key: strategyField ? (strategyField.value || null) : null
      });
    });
  });
}

function renderAdminPairOptions() {
  const pairSelect = getAdminFormField("kraken_pair");
  if (!pairSelect) {
    return;
  }

  const selectedValue = pairSelect.value;
  const existingSymbols = new Set(state.adminCoins.map((coin) => coin.symbol));
  const filteredPairs = getFilteredAdminPairs();

  if (elements.adminPairSuggestions) {
    elements.adminPairSuggestions.innerHTML = filteredPairs
      .slice(0, 40)
      .map((pair) => `<option value="${escapeHtml(adminPairLabel(pair))}"></option>`)
      .join("");
  }

  if (!state.adminAuthorized) {
    pairSelect.innerHTML = '<option value="">Master-Login erforderlich</option>';
    pairSelect.disabled = true;
    renderAdminSelectedPair();
    return;
  }

  if (!state.adminKrakenPairs.length || !filteredPairs.length) {
    pairSelect.innerHTML = `<option value="">${state.adminKrakenPairs.length ? "Keine Treffer" : "Keine Kraken-Coins geladen"}</option>`;
    pairSelect.disabled = true;
    renderAdminSelectedPair();
    return;
  }

  pairSelect.disabled = false;
  pairSelect.innerHTML = [
    '<option value="">Coin waehlen ...</option>',
    ...filteredPairs.map((pair) => {
      const disabled = existingSymbols.has(pair.symbol) ? " disabled" : "";
      const suffix = disabled ? " (bereits angelegt)" : "";
      return `
        <option value="${escapeHtml(pair.altname)}"${pair.altname === selectedValue ? " selected" : ""}${disabled}>
          ${escapeHtml(pair.symbol)} - ${escapeHtml(pair.name)}${suffix}
        </option>
      `;
    })
  ].join("");

  if (pairSelect.value !== selectedValue) {
    pairSelect.value = "";
  }

  renderAdminSelectedPair();
}

function renderAdminSelectedPair() {
  const pairSelect = getAdminFormField("kraken_pair");
  const selectedPair = pairSelect
    ? state.adminKrakenPairs.find((pair) => pair.altname === pairSelect.value)
    : null;

  const nameInput = getAdminFormField("name");
  const baseInput = getAdminFormField("base_asset");
  const exchangeInput = getAdminFormField("exchange_symbol");
  const searchInput = getAdminFormField("coin_search");

  if (nameInput) {
    nameInput.value = selectedPair ? selectedPair.name : "";
  }

  if (baseInput) {
    baseInput.value = selectedPair ? selectedPair.base_asset : "";
  }

  if (exchangeInput) {
    exchangeInput.value = selectedPair ? selectedPair.altname : "";
  }

  if (!elements.adminCoinPreview) {
    return;
  }

  elements.adminCoinPreview.textContent = selectedPair
    ? `${selectedPair.name} wird als ${selectedPair.symbol} mit Kraken-Symbol ${selectedPair.altname} angelegt. Signale laufen fuer 5m, 15m und 1h.`
    : searchInput && searchInput.value
      ? "Kein eindeutiger Coin gewaehlt."
      : "Freitextsuche nutzen oder aus Dropdown wählen.";
}

async function loadAdminKrakenPairs() {
  if (!state.adminAuthorized) {
    state.adminKrakenPairs = [];
    renderAdminPairOptions();
    return;
  }

  const quoteField = getAdminFormField("quote_asset");
  const quoteAsset = quoteField ? quoteField.value : "EUR";
  const pairSelect = getAdminFormField("kraken_pair");

  if (pairSelect) {
    pairSelect.disabled = true;
    pairSelect.innerHTML = '<option value="">Kraken-Coins werden geladen ...</option>';
  }

  try {
    const response = await fetchJson(`/api/admin/coins/kraken-pairs?quote_asset=${encodeURIComponent(quoteAsset)}`, {
      headers: adminHeaders()
    });
    state.adminKrakenPairs = Array.isArray(response.items) ? response.items : [];
    renderAdminPairOptions();
  } catch (error) {
    state.adminKrakenPairs = [];
    if (pairSelect) {
      pairSelect.innerHTML = '<option value="">Kraken-Liste nicht erreichbar</option>';
      pairSelect.disabled = true;
    }
    renderAdminSelectedPair();
  }
}

async function loadAdminCoins() {
  try {
    const response = await fetchJson("/api/admin/coins", {
      headers: adminHeaders()
    });

    state.adminAuthorized = true;
    state.adminCoins = Array.isArray(response.items) ? response.items : [];
    state.adminLoaded = true;
    setAdminStatus("Master-Zugriff ueber Schnueddel-Auth verbunden.", "ok");
    renderAdminCoins();
    await loadAdminKrakenPairs();
  } catch (error) {
    state.adminAuthorized = false;
    state.adminCoins = [];
    state.adminLoaded = true;
    const message = error.message === "auth_required"
      ? "Bitte mit Schnueddel-Login anmelden."
      : error.message === "admin_access_required" || error.message === "master_access_required"
        ? "Schnueddel-Login vorhanden, aber ohne Master-Rechte."
        : error.message === "auth_unavailable"
          ? "Zentrale Auth aktuell nicht erreichbar."
          : "Master-Bereich konnte nicht geladen werden.";
    setAdminStatus(message, "error");
    renderAdminCoins();
    renderAdminPairOptions();
  }
}

async function toggleCoinState(coinId, isActive) {
  try {
    await updateAdminCoinSettings(coinId, {
      is_active: isActive
    }, `Coin ${isActive ? "aktiviert" : "deaktiviert"}.`);
  } catch (error) {
    const message = error.message === "auth_required"
      ? "Bitte mit Schnueddel-Login anmelden."
      : error.message === "admin_access_required" || error.message === "master_access_required"
        ? "Keine Schnueddel-Master-Rechte fuer diese Aktion."
        : "Statuswechsel fehlgeschlagen.";
    setAdminStatus(message, "error");
  }
}

async function updateAdminCoinSettings(coinId, payload, successMessage = "Coin-Einstellungen gespeichert.") {
  try {
    await fetchJson(`/api/admin/coins/${coinId}`, {
      method: "PATCH",
      headers: adminHeaders(),
      body: JSON.stringify(payload)
    });

    setAdminStatus(successMessage, "ok");
    await Promise.all([loadData(), loadAdminCoins()]);
  } catch (error) {
    const message = error.message === "auth_required"
      ? "Bitte mit Schnueddel-Login anmelden."
      : error.message === "admin_access_required" || error.message === "master_access_required"
        ? "Keine Schnueddel-Master-Rechte fuer diese Aktion."
        : error.message === "invalid_sort_order"
          ? "Sortierung muss zwischen 1 und 9999 liegen."
          : error.message === "invalid_default_timeframe"
            ? "Ungueltiger Standard-Timeframe."
            : error.message === "invalid_update_payload"
              ? "Keine aenderbaren Werte uebergeben."
              : "Coin-Einstellungen konnten nicht gespeichert werden.";
    setAdminStatus(message, "error");
    throw error;
  }
}

async function deleteAdminCoin(coinId) {
  try {
    await fetchJson(`/api/admin/coins/${coinId}`, {
      method: "DELETE",
      headers: adminHeaders()
    });

    setAdminStatus("Coin entfernt.", "ok");
    await Promise.all([loadData(), loadAdminCoins()]);
  } catch (error) {
    const message = error.message === "auth_required"
      ? "Bitte mit Schnueddel-Login anmelden."
      : error.message === "admin_access_required" || error.message === "master_access_required"
        ? "Keine Schnueddel-Master-Rechte fuer diese Aktion."
        : "Coin konnte nicht entfernt werden.";
    setAdminStatus(message, "error");
  }
}

async function refreshMarketData() {
  setAdminStatus("Marktdaten und Signale werden aktualisiert ...", "ok");
  await fetchJson("/api/admin/coins/refresh-market", {
    method: "POST",
    headers: adminHeaders()
  });
}

function renderDashboard() {
  renderTimeframeSwitch();
  renderStats();
  renderOverviewStrip();
  renderSettings();
  renderTable();
  renderDetail();
}

function renderAccessButtons() {
  if (elements.paperOverlayOpen) {
    elements.paperOverlayOpen.hidden = !state.paperAuthorized;
  }
  if (elements.portfolioOverlayOpen) {
    elements.portfolioOverlayOpen.hidden = !state.adminAuthorized;
  }
  if (elements.adminOverlayOpen) {
    elements.adminOverlayOpen.hidden = !state.adminAuthorized;
  }
}

function renderAdminButtons() {
  renderAccessButtons();
}

async function loadData() {
  elements.backendStatus.textContent = "Lade API ...";
  elements.backendStatus.className = "status-badge";

  try {
    const [health, overview, coins, settings] = await Promise.all([
      fetchJson("/api/health"),
      fetchJson("/api/overview"),
      fetchJson("/api/coins"),
      fetchJson("/api/settings")
    ]);

    state.overview = overview;
    state.coins = Array.isArray(coins.items) ? coins.items : [];
    state.settings = Array.isArray(settings.items) ? settings.items : [];
    state.backtests = null;
    state.chartCache = {};

    const availableTimeframes = getAvailableTimeframes();
    if (!availableTimeframes.includes(state.selectedTimeframe)) {
      state.selectedTimeframe = availableTimeframes[0];
    }

    if (!state.coins.find((coin) => coin.symbol === state.selectedSymbol)) {
      state.selectedSymbol = state.coins[0] ? state.coins[0].symbol : null;
    }

    elements.backendStatus.textContent = health.status === "ok" ? "Backend online" : "Backend bereit";
    elements.backendStatus.className = "status-badge is-ok";

    fetchJson("/api/admin/portfolio/session").then(() => {
      state.adminAuthorized = true;
      renderAccessButtons();
    }).catch(() => {
      state.adminAuthorized = false;
      renderAccessButtons();
    });

    loadPaperStatus();

    renderDashboard();
  } catch (error) {
    console.error(error);
    elements.backendStatus.textContent = "API nicht erreichbar";
    elements.backendStatus.className = "status-badge is-error";
    elements.statsGrid.innerHTML = '<div class="empty-state">Backend oder Reverse Proxy fehlt noch.</div>';
    elements.signalTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">API nicht erreichbar.</td></tr>';
    elements.signalDetail.innerHTML = '<div class="empty-state empty-state--block">Sobald das Backend laeuft, erscheinen hier Signalgruende.</div>';
    elements.timeframeSwitch.innerHTML = "";
  }
}

elements.refreshButton.addEventListener("click", async () => {
  await loadData();
});

if (elements.matrixFilter) {
  elements.matrixFilter.addEventListener("change", () => {
    state.matrixFilter = elements.matrixFilter.value;
    renderDashboard();
  });
}

if (elements.matrixSort) {
  elements.matrixSort.addEventListener("change", () => {
    state.matrixSort = elements.matrixSort.value;
    renderDashboard();
  });
}

if (elements.adminOverlayOpen) {
  elements.adminOverlayOpen.addEventListener("click", async () => {
    await openAdminOverlay();
  });
}

if (elements.paperOverlayOpen) {
  elements.paperOverlayOpen.addEventListener("click", openPaperOverlay);
}

if (elements.paperOverlayClose) {
  elements.paperOverlayClose.addEventListener("click", closePaperOverlay);
}

if (elements.paperOverlayBackdrop) {
  elements.paperOverlayBackdrop.addEventListener("click", closePaperOverlay);
}

if (elements.paperBuyForm) {
  elements.paperBuyForm.addEventListener("submit", buyPaperPosition);
}

if (elements.paperDepositForm) {
  elements.paperDepositForm.addEventListener("submit", depositPaperTalers);
}

if (elements.paperWithdrawForm) {
  elements.paperWithdrawForm.addEventListener("submit", withdrawPaperTalers);
}

if (elements.paperResetButton) {
  elements.paperResetButton.addEventListener("click", resetPaperPortfolio);
}

if (elements.adminOverlayClose) {
  elements.adminOverlayClose.addEventListener("click", () => {
    closeAdminOverlay();
  });
}

if (elements.adminOverlayBackdrop) {
  elements.adminOverlayBackdrop.addEventListener("click", () => {
    closeAdminOverlay();
  });
}

if (elements.settingsOverlayOpen) {
  elements.settingsOverlayOpen.addEventListener("click", () => {
    openSettingsOverlay();
  });
}

if (elements.backtestsOverlayOpen) {
  elements.backtestsOverlayOpen.addEventListener("click", async () => {
    await openBacktestsOverlay();
  });
}

if (elements.backtestsOverlayClose) {
  elements.backtestsOverlayClose.addEventListener("click", () => {
    closeBacktestsOverlay();
  });
}

if (elements.backtestsOverlayBackdrop) {
  elements.backtestsOverlayBackdrop.addEventListener("click", () => {
    closeBacktestsOverlay();
  });
}

if (elements.portfolioOverlayOpen) {
  elements.portfolioOverlayOpen.addEventListener("click", openPortfolioOverlay);
}

if (elements.portfolioOverlayClose) {
  elements.portfolioOverlayClose.addEventListener("click", closePortfolioOverlay);
}

if (elements.portfolioOverlayBackdrop) {
  elements.portfolioOverlayBackdrop.addEventListener("click", closePortfolioOverlay);
}

if (elements.portfolioFetchButton) {
  elements.portfolioFetchButton.addEventListener("click", fetchPortfolioNow);
}

if (elements.settingsOverlayClose) {
  elements.settingsOverlayClose.addEventListener("click", () => {
    closeSettingsOverlay();
  });
}

if (elements.settingsOverlayBackdrop) {
  elements.settingsOverlayBackdrop.addEventListener("click", () => {
    closeSettingsOverlay();
  });
}

if (elements.sourcesOverlayOpen) {
  elements.sourcesOverlayOpen.addEventListener("click", () => {
    openSourcesOverlay();
  });
}

if (elements.sourcesOverlayClose) {
  elements.sourcesOverlayClose.addEventListener("click", () => {
    closeSourcesOverlay();
  });
}

if (elements.sourcesOverlayBackdrop) {
  elements.sourcesOverlayBackdrop.addEventListener("click", () => {
    closeSourcesOverlay();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (elements.settingsOverlay && !elements.settingsOverlay.hidden) {
      closeSettingsOverlay();
    }

    if (elements.sourcesOverlay && !elements.sourcesOverlay.hidden) {
      closeSourcesOverlay();
    }

    if (elements.backtestsOverlay && !elements.backtestsOverlay.hidden) {
      closeBacktestsOverlay();
    }

    if (elements.adminOverlay && !elements.adminOverlay.hidden) {
      closeAdminOverlay();
    }

    if (elements.paperOverlay && !elements.paperOverlay.hidden) {
      closePaperOverlay();
    }
  }
});

elements.adminCoinForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.adminAuthorized) {
    setAdminStatus("Bitte zuerst mit Schnueddel-Master-Rechten anmelden.", "error");
    return;
  }

  const formData = new FormData(elements.adminCoinForm);
  const payload = {
    name: formData.get("name"),
    base_asset: formData.get("base_asset"),
    quote_asset: formData.get("quote_asset"),
    exchange_symbol: formData.get("exchange_symbol"),
    default_timeframe: formData.get("default_timeframe"),
    sort_order: Number(formData.get("sort_order"))
  };

  if (!payload.name || !payload.base_asset || !payload.exchange_symbol) {
    setAdminStatus("Bitte zuerst einen Kraken-Coin auswaehlen.", "error");
    return;
  }

  try {
    await fetchJson("/api/admin/coins", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify(payload)
    });

    setAdminStatus("Coin angelegt. Marktdaten werden geladen ...", "ok");
    await refreshMarketData();
    elements.adminCoinForm.reset();
    elements.adminCoinForm.querySelector('[name="quote_asset"]').value = "EUR";
    elements.adminCoinForm.querySelector('[name="default_timeframe"]').value = "4h";
    elements.adminCoinForm.querySelector('[name="sort_order"]').value = "100";
    renderAdminSelectedPair();
    await Promise.all([loadData(), loadAdminCoins()]);
    setAdminStatus("Coin angelegt und Marktdaten aktualisiert.", "ok");
  } catch (error) {
    const messageMap = {
      auth_required: "Bitte mit Schnueddel-Login anmelden.",
      admin_access_required: "Keine Schnueddel-Master-Rechte fuer diese Aktion.",
      master_access_required: "Keine Schnueddel-Master-Rechte fuer diese Aktion.",
      auth_unavailable: "Zentrale Auth aktuell nicht erreichbar.",
      coin_already_exists: "Coin existiert bereits.",
      kraken_exchange_symbol_unknown: "Kraken-Symbol unbekannt. Bitte offizielles REST-Symbol oder Altname verwenden.",
      kraken_pair_mismatch: "Kraken-Symbol passt nicht zu Basis/Quote.",
      kraken_pair_unavailable: "Dieses Paar ist bei Kraken aktuell nicht verfuegbar.",
      kraken_pair_not_online: "Dieses Kraken-Paar ist aktuell nicht online.",
      kraken_unreachable: "Kraken ist aktuell nicht erreichbar.",
      kraken_timeout: "Kraken-Antwort hat zu lange gedauert.",
      kraken_api_error: "Kraken-Validierung fehlgeschlagen."
    };
    const message = messageMap[error.message] || "Coin konnte nicht angelegt werden.";
    setAdminStatus(message, "error");
  }
});

const adminQuoteField = getAdminFormField("quote_asset");
if (adminQuoteField) {
  adminQuoteField.addEventListener("change", async () => {
    const searchField = getAdminFormField("coin_search");
    if (searchField) {
      searchField.value = "";
    }

    await loadAdminKrakenPairs();
  });
}

const adminPairField = getAdminFormField("kraken_pair");
if (adminPairField) {
  adminPairField.addEventListener("change", () => {
    const selectedPair = state.adminKrakenPairs.find((pair) => pair.altname === adminPairField.value);
    const searchField = getAdminFormField("coin_search");
    if (searchField && selectedPair) {
      searchField.value = adminPairLabel(selectedPair);
    }

    renderAdminSelectedPair();
  });
}

const adminSearchField = getAdminFormField("coin_search");
if (adminSearchField) {
  adminSearchField.addEventListener("input", () => {
    renderAdminPairOptions();
    const pairSelect = getAdminFormField("kraken_pair");
    const exactPair = findAdminPairBySearch(adminSearchField.value);
    if (pairSelect && exactPair) {
      pairSelect.value = exactPair.altname;
      renderAdminSelectedPair();
    }
  });

  adminSearchField.addEventListener("change", () => {
    renderAdminPairOptions();
    const pairSelect = getAdminFormField("kraken_pair");
    const exactPair = findAdminPairBySearch(adminSearchField.value);
    if (pairSelect && exactPair) {
      pairSelect.value = exactPair.altname;
      adminSearchField.value = adminPairLabel(exactPair);
      renderAdminSelectedPair();
    }
  });
}

function updateFilterSelectLabels() {
  const sel = elements.matrixFilter;
  if (!sel) return;
  const isShort = state.tradeMode === "short";
  const map = {
    entry_ready: isShort ? "4h + 1h Buy" : "1d + 4h Buy",
    primary_buy: isShort ? "4h Buy" : "1d Buy",
    entry_waiting: isShort ? "Auf 1h warten" : "Auf 4h warten",
    blocked: isShort ? "Durch 4h blockiert" : "Durch 1d blockiert"
  };
  Array.from(sel.options).forEach((opt) => {
    if (map[opt.value]) opt.textContent = map[opt.value];
  });
}

const tradeModeToggle = document.getElementById("trade-mode-toggle");
if (tradeModeToggle) {
  tradeModeToggle.textContent = state.tradeMode === "short" ? "SHORT" : "LONG";
  tradeModeToggle.classList.toggle("is-short", state.tradeMode === "short");
  updateFilterSelectLabels();

  tradeModeToggle.addEventListener("click", () => {
    state.tradeMode = state.tradeMode === "short" ? "long" : "short";
    localStorage.setItem("tradeMode", state.tradeMode);
    tradeModeToggle.textContent = state.tradeMode === "short" ? "SHORT" : "LONG";
    tradeModeToggle.classList.toggle("is-short", state.tradeMode === "short");
    updateFilterSelectLabels();
    renderMatrixGroupSummary();
    renderDashboard();
  });
}

init();

async function init() {
  await loadData();
}
