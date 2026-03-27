const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const livePricesEl = document.getElementById("livePrices");
const chartCanvas = document.getElementById("priceChart");
const allocationCanvas = document.getElementById("allocationChart");

const statLast = document.getElementById("statLast");
const statLastTime = document.getElementById("statLastTime");
const statChange = document.getElementById("statChange");
const statChangePct = document.getElementById("statChangePct");
const statRange = document.getElementById("statRange");
const statVol = document.getElementById("statVol");
const statOrders = document.getElementById("statOrders");
const rsiValue = document.getElementById("rsiValue");
const momentumValue = document.getElementById("momentumValue");
const equityValue = document.getElementById("equityValue");
const pnlValue = document.getElementById("pnlValue");
const lastApi = document.getElementById("lastApi");
const feedStatus = document.getElementById("feedStatus");
const alertCount = document.getElementById("alertCount");

const toggleSma = document.getElementById("toggleSma");
const toggleEma = document.getElementById("toggleEma");
const toggleRsi = document.getElementById("toggleRsi");

const watchSymbol = document.getElementById("watchSymbol");
const watchList = document.getElementById("watchList");
const watchListPreview = document.getElementById("watchListPreview");
const alertSymbol = document.getElementById("alertSymbol");
const alertCondition = document.getElementById("alertCondition");
const alertPrice = document.getElementById("alertPrice");
const alertList = document.getElementById("alertList");
const tradeTape = document.getElementById("tradeTape");
const orderBookBids = document.getElementById("orderBookBids");
const orderBookAsks = document.getElementById("orderBookAsks");
const chartSymbol = document.getElementById("chartSymbol");
const chartTimeframe = document.getElementById("chartTimeframe");
const marketList = document.getElementById("marketList");
const marketTableBody = document.getElementById("marketTableBody");
const marketSearch = document.getElementById("marketSearch");
const notifBtn = document.getElementById("notifBtn");
const notifPanel = document.getElementById("notifPanel");
const toastEl = document.getElementById("toast");
const assetName = document.getElementById("assetName");
const assetPrice = document.getElementById("assetPrice");
const assetChange = document.getElementById("assetChange");
const sidebar = document.getElementById("sidebar");
const toggleSidebar = document.getElementById("toggleSidebar");
const pageButtons = Array.from(document.querySelectorAll(".nav-item[data-page]"));
const pages = Array.from(document.querySelectorAll(".page[data-page]"));

const state = {
  ws: null,
  chart: null,
  chartType: "line",
  lastHistory: [],
  allocationChart: null,
  watchlist: [],
  alerts: [],
  alertHits: 0,
  lastPrices: {},
  autoRefreshId: null,
  assets: [],
};

const apiBase = () =>
  document.getElementById("apiBase").value.replace(/\/$/, "");

const setStatus = (text, ok = true) => {
  statusEl.textContent = text;
  statusEl.style.color = ok ? "var(--accent)" : "var(--danger)";
  statusEl.style.background = ok ? "#eef2ff" : "#fee2e2";
};

const setElText = (el, value) => {
  if (el) el.textContent = value;
};

const setActivePage = (pageName) => {
  pageButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === pageName);
  });
  pages.forEach((page) => {
    page.classList.toggle("active", page.dataset.page === pageName);
  });
};

const initNavigation = () => {
  pageButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActivePage(btn.dataset.page));
  });
  setActivePage("dashboard");
};

const showToast = (message) => {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("active");
  setTimeout(() => toastEl.classList.remove("active"), 2500);
};

const log = (message) => {
  const timestamp = new Date().toLocaleTimeString();
  if (logEl) {
    logEl.textContent = `[${timestamp}] ${message}\n` + logEl.textContent;
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
};

const toJson = (value) => JSON.stringify(value, null, 2);

const SAMPLE_INTERVAL_SECONDS = 0.5;
const MAX_POINTS = 2000;
const timeframeToPoints = (timeframe) => {
  const map = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
    "1w": 604800,
    "1M": 2592000,
  };
  const seconds = map[timeframe] || 300;
  const points = Math.max(5, Math.round(seconds / SAMPLE_INTERVAL_SECONDS));
  return Math.min(points, MAX_POINTS);
};

const timeframeToBucketSeconds = (timeframe) => {
  const map = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
    "1w": 604800,
    "1M": 2592000,
  };
  return map[timeframe] || 300;
};

const timeframeToRefreshMs = (timeframe) => {
  const map = {
    "1m": 3000,
    "5m": 5000,
    "15m": 8000,
    "30m": 10000,
    "1h": 15000,
    "4h": 20000,
    "1d": 30000,
    "1w": 45000,
    "1M": 60000,
  };
  return map[timeframe] || 5000;
};

const formatNumber = (value) =>
  Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

const formatTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString();
};

const normalizeHistory = (history) => {
  if (!Array.isArray(history) || history.length < 2) return history;
  const first = new Date(history[0].timestamp).getTime();
  const last = new Date(history[history.length - 1].timestamp).getTime();
  if (Number.isNaN(first) || Number.isNaN(last)) return history;
  return first <= last ? history : [...history].reverse();
};

const fetchJson = async (path, options = {}) => {
  const response = await fetch(`${apiBase()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  setElText(lastApi, new Date().toLocaleTimeString());

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return response.json();
};

const renderLivePrices = (payload) => {
  livePricesEl.innerHTML = "";
  const entries = Array.isArray(payload)
    ? payload
    : typeof payload === "object"
      ? Object.entries(payload).map(([symbol, price]) => ({ symbol, price }))
      : [];

  if (!entries.length) {
    livePricesEl.innerHTML = "<div class='cell'>No data</div>";
    return;
  }

  entries.forEach((item) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.innerHTML = `<span>${item.symbol}</span><strong>${Number(item.price).toFixed(4)}</strong>`;
    livePricesEl.appendChild(cell);
    state.lastPrices[item.symbol] = Number(item.price);
  });
  updateMarketTable(state.assets);
};

const updateStatsFromHistory = (history) => {
  const ordered = normalizeHistory(history);
  if (!ordered.length) {
    setElText(statLast, "—");
    setElText(statLastTime, "Awaiting data");
    setElText(statChange, "—");
    setElText(statChangePct, "0%");
    setElText(statRange, "—");
    setElText(statVol, "Volatility");
    setElText(rsiValue, "—");
    setElText(momentumValue, "—");
    return;
  }

  const prices = ordered.map((item) => Number(item.price));
  const last = prices[prices.length - 1];
  const first = prices[0];
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const change = last - first;
  const pct = first === 0 ? 0 : (change / first) * 100;

  setElText(statLast, formatNumber(last));
  setElText(statLastTime, formatTime(ordered[ordered.length - 1].timestamp));
  setElText(statChange, `${change >= 0 ? "+" : ""}${formatNumber(change)}`);
  setElText(statChangePct, `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`);
  if (statChangePct) {
    statChangePct.style.color = pct >= 0 ? "var(--success)" : "var(--danger)";
  }
  setElText(statRange, `${formatNumber(high)} / ${formatNumber(low)}`);

  const mean = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  const variance =
    prices.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    prices.length;
  const volatility = Math.sqrt(variance);
  setElText(statVol, `Volatility ${formatNumber(volatility)}`);
  setElText(momentumValue, `${formatNumber(change)}`);
};

const computeSma = (values, period) => {
  if (values.length < period) return [];
  return values.map((_, idx) => {
    if (idx < period - 1) return null;
    const slice = values.slice(idx - period + 1, idx + 1);
    return slice.reduce((sum, v) => sum + v, 0) / period;
  });
};

const computeEma = (values, period) => {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const ema = [];
  values.forEach((value, idx) => {
    if (idx === 0) {
      ema.push(value);
    } else {
      ema.push(value * k + ema[idx - 1] * (1 - k));
    }
  });
  return ema;
};

const buildCandles = (history, timeframe) => {
  const ordered = normalizeHistory(history);
  if (!ordered.length) return { labels: [], candles: [], closes: [] };
  const bucketSeconds = timeframeToBucketSeconds(timeframe);
  const pointsPerCandle = Math.max(
    2,
    Math.round(bucketSeconds / SAMPLE_INTERVAL_SECONDS)
  );

  const candles = [];
  const labels = [];
  const closes = [];

  for (let i = 0; i < ordered.length; i += pointsPerCandle) {
    const slice = ordered.slice(i, i + pointsPerCandle);
    if (!slice.length) continue;
    const prices = slice.map((item) => Number(item.price));
    const open = prices[0];
    const close = prices[prices.length - 1];
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const label = formatTime(slice[slice.length - 1].timestamp);

    labels.push(label);
    candles.push({ x: label, o: open, h: high, l: low, c: close });
    closes.push(close);
  }

  return { labels, candles, closes };
};

const hasCandlestickSupport = () => {
  try {
    return (
      typeof Chart !== "undefined" &&
      Chart.registry &&
      typeof Chart.registry.getController === "function" &&
      Chart.registry.getController("candlestick")
    );
  } catch (error) {
    return false;
  }
};

const computeRsi = (values, period) => {
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

const initChart = () => {
  if (!chartCanvas || state.chart) return;
  const candlestickReady = hasCandlestickSupport();
  state.chartType = candlestickReady ? "candlestick" : "line";
  const primaryDataset = candlestickReady
    ? {
        label: "Candles",
        data: [],
        color: {
          up: "#16a34a",
          down: "#ef4444",
          unchanged: "#94a3b8",
        },
      }
    : {
        label: "Price",
        data: [],
        borderColor: "#38bdf8",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.25,
        fill: true,
        backgroundColor: "rgba(56, 189, 248, 0.12)",
      };

  state.chart = new Chart(chartCanvas, {
    type: state.chartType,
    data: {
      labels: [],
      datasets: [
        primaryDataset,
        {
          label: "SMA",
          data: [],
          borderColor: "#fbbf24",
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.25,
          type: "line",
        },
        {
          label: "EMA",
          data: [],
          borderColor: "#a78bfa",
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.25,
          type: "line",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "category",
          ticks: { color: "#94a3b8", maxTicksLimit: 8 },
          grid: { color: "rgba(148, 163, 184, 0.1)" },
        },
        y: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148, 163, 184, 0.1)" },
        },
      },
      plugins: {
        legend: { labels: { color: "#e2e8f0" } },
        zoom: {
          pan: {
            enabled: true,
            mode: "x",
          },
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true,
            },
            mode: "x",
          },
        },
      },
    },
  });
};

const initAllocationChart = () => {
  if (!allocationCanvas || state.allocationChart) return;
  state.allocationChart = new Chart(allocationCanvas, {
    type: "doughnut",
    data: {
      labels: [],
      datasets: [
        {
          data: [],
          backgroundColor: [
            "#38bdf8",
            "#a78bfa",
            "#facc15",
            "#f97316",
            "#22c55e",
            "#e879f9",
          ],
          borderWidth: 0,
        },
      ],
    },
    options: {
      plugins: {
        legend: { labels: { color: "#e2e8f0" } },
      },
    },
  });
};

const updateChart = (history) => {
  if (!state.chart) return;
  const ordered = normalizeHistory(history);
  const timeframe = chartTimeframe?.value || "5m";
  const { labels, candles, closes } = buildCandles(ordered, timeframe);
  const sma = computeSma(closes, 14);
  const ema = computeEma(closes, 14);
  const rsi = computeRsi(closes, 14);
  state.chart.data.labels = labels;
  state.chart.data.datasets[0].data =
    state.chartType === "candlestick" ? candles : closes;
  state.chart.data.datasets[1].data = toggleSma?.checked ? sma : [];
  state.chart.data.datasets[2].data = toggleEma?.checked ? ema : [];
  state.chart.update();
  setElText(rsiValue, rsi ? rsi.toFixed(2) : "—");
};

const fetchChartHistory = async (mode = "last") => {
  try {
    const assetId = chartSymbol?.value || document.getElementById("priceAssetId").value;
    const n = timeframeToPoints(chartTimeframe?.value || "5m");
    const path = mode === "all" ? `/prices/all/${assetId}` : `/prices/last/${assetId}?n=${n}`;
    const data = await fetchJson(path);
    const ordered = normalizeHistory(data);
    const displayData = [...ordered].reverse();
    document.getElementById("priceHistory").textContent = toJson(displayData);
    state.lastHistory = ordered;
    updateStatsFromHistory(ordered);
    updateChart(ordered);
  } catch (error) {
    log(error.message);
  }
};

const startAutoRefresh = () => {
  if (state.autoRefreshId) {
    clearInterval(state.autoRefreshId);
  }
  const timeframe = chartTimeframe?.value || "5m";
  const refreshMs = timeframeToRefreshMs(timeframe);
  state.autoRefreshId = setInterval(() => {
    fetchChartHistory("last");
  }, refreshMs);
};

const loadAssets = async () => {
  try {
    const assets = await fetchJson("/assets/");
    state.assets = assets;
    if (chartSymbol) {
      chartSymbol.innerHTML = "";
      assets.forEach((asset) => {
        const option = document.createElement("option");
        option.value = asset.id;
        option.textContent = `${asset.symbol} · ${asset.name}`;
        chartSymbol.appendChild(option);
      });
    }
    renderMarketList(assets);
    updateMarketTable(assets);
    if (assets.length) {
      if (chartSymbol) chartSymbol.value = assets[0].id;
      const priceAssetInput = document.getElementById("priceAssetId");
      if (priceAssetInput) {
        priceAssetInput.value = assets[0].id;
      }
      updateAssetHeader(assets[0]);
      setActivePage("asset-detail");
      await fetchChartHistory("last");
    }
  } catch (error) {
    log(error.message);
  }
};

const renderMarketList = (assets) => {
  if (!marketList) return;
  marketList.innerHTML = "";
  if (!assets.length) {
    marketList.innerHTML = "<div class='muted'>No assets available</div>";
    return;
  }
  assets.forEach((asset) => {
    const item = document.createElement("div");
    item.className = "market-item";
    item.innerHTML = `<span class="symbol">${asset.symbol}</span><span class="name">${asset.name}</span>`;
    item.addEventListener("click", () => {
      if (chartSymbol) chartSymbol.value = asset.id;
      const priceAssetInput = document.getElementById("priceAssetId");
      if (priceAssetInput) priceAssetInput.value = asset.id;
      updateAssetHeader(asset);
      setActivePage("asset-detail");
      fetchChartHistory("last");
      startAutoRefresh();
    });
    marketList.appendChild(item);
  });
};

const updateMarketTable = (assets) => {
  if (!marketTableBody) return;
  const query = marketSearch?.value?.toLowerCase() || "";
  const filtered = assets.filter((asset) =>
    `${asset.symbol} ${asset.name}`.toLowerCase().includes(query)
  );
  marketTableBody.innerHTML = "";
  filtered.forEach((asset) => {
    const row = document.createElement("tr");
    const last = state.lastPrices[asset.symbol] || 0;
    row.innerHTML = `
      <td>${asset.symbol} · ${asset.name}</td>
      <td>${last ? formatNumber(last) : "—"}</td>
      <td>—</td>
      <td>—</td>
    `;
    row.addEventListener("click", () => {
      if (chartSymbol) chartSymbol.value = asset.id;
      const priceAssetInput = document.getElementById("priceAssetId");
      if (priceAssetInput) priceAssetInput.value = asset.id;
      updateAssetHeader(asset);
      setActivePage("asset-detail");
      fetchChartHistory("last");
    });
    marketTableBody.appendChild(row);
  });
};

const updateAssetHeader = (asset) => {
  if (!asset) return;
  if (assetName) assetName.textContent = `${asset.symbol} · ${asset.name}`;
  const price = state.lastPrices[asset.symbol];
  if (assetPrice) assetPrice.textContent = price ? formatNumber(price) : "—";
  if (assetChange) assetChange.textContent = "0%";
};

const getAssetById = (assetId) =>
  state.assets.find((asset) => String(asset.id) === String(assetId));

const connectWebSocket = () => {
  if (state.ws) {
    state.ws.close();
  }

  const interval = document.getElementById("wsInterval").value || 0.5;
  const symbol = document.getElementById("wsSymbol").value.trim();
  const wsUrl = new URL(apiBase().replace(/^http/, "ws") + "/ws/price");

  if (symbol) {
    wsUrl.searchParams.set("symbol", symbol);
  }
  wsUrl.searchParams.set("interval", interval);

  const ws = new WebSocket(wsUrl.toString());
  state.ws = ws;

  ws.onopen = () => {
    setStatus("WebSocket connected", true);
    log("WebSocket connected");
    setElText(feedStatus, "Live");
  };

  ws.onclose = () => {
    setStatus("WebSocket disconnected", false);
    log("WebSocket disconnected");
    setElText(feedStatus, "Offline");
  };

  ws.onerror = () => {
    setStatus("WebSocket error", false);
    log("WebSocket error");
    setElText(feedStatus, "Error");
  };

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.error) {
        log(`WebSocket error: ${payload.error}`);
        return;
      }
      renderLivePrices(payload);
      if (!Array.isArray(payload)) {
        const first = Object.entries(payload)[0];
        if (first) {
          setElText(statLast, formatNumber(first[1]));
          setElText(statLastTime, "Live");
          checkAlerts(first[0], Number(first[1]));
        }
      }
    } catch (error) {
      log(`WebSocket parse error: ${error.message}`);
    }
  };
};

const disconnectWebSocket = () => {
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
};

const saveState = () => {
  localStorage.setItem("watchlist", JSON.stringify(state.watchlist));
  localStorage.setItem("alerts", JSON.stringify(state.alerts));
};

const loadState = () => {
  const watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
  const alerts = JSON.parse(localStorage.getItem("alerts") || "[]");
  state.watchlist = watchlist;
  state.alerts = alerts;
};

const renderWatchlist = () => {
  const render = (container) => {
    if (!container) return;
    container.innerHTML = "";
    if (!state.watchlist.length) {
      container.innerHTML = "<span class='muted'>No symbols yet</span>";
      return;
    }
    state.watchlist.forEach((symbol) => {
      const item = document.createElement("div");
      item.className = "pill-item";
      item.textContent = symbol;
      container.appendChild(item);
    });
  };
  render(watchList);
  render(watchListPreview);
};

const renderAlerts = () => {
  if (!alertList) return;
  alertList.innerHTML = "";
  if (!state.alerts.length) {
    alertList.innerHTML = "<span class='muted'>No alerts</span>";
    return;
  }
  state.alerts.forEach((alert) => {
    const item = document.createElement("div");
    item.className = "alert-item";
    item.innerHTML = `<span>${alert.symbol} ${alert.condition} ${alert.price}</span><span>${alert.triggered ? "Triggered" : "Active"}</span>`;
    alertList.appendChild(item);
  });
};

const checkAlerts = (symbol, price) => {
  let triggered = false;
  state.alerts = state.alerts.map((alert) => {
    if (alert.triggered || alert.symbol !== symbol) return alert;
    const conditionMet =
      alert.condition === ">=" ? price >= alert.price : price <= alert.price;
    if (conditionMet) {
      triggered = true;
      return { ...alert, triggered: true };
    }
    return alert;
  });
  if (triggered) {
    state.alertHits += 1;
    setElText(alertCount, String(state.alertHits));
    log(`Alert triggered for ${symbol}`);
    renderAlerts();
    saveState();
  }
};

const renderOrderBook = (bids, asks) => {
  const buildRows = (orders, side) => {
    const grouped = orders.reduce((acc, order) => {
      const price = Number(order.price).toFixed(2);
      const qty = Number(order.quantity || 0);
      acc[price] = (acc[price] || 0) + qty;
      return acc;
    }, {});
    const entries = Object.entries(grouped).map(([price, qty]) => ({
      price: Number(price),
      qty,
    }));
    entries.sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price));
    return entries.slice(0, 8);
  };

  const render = (container, rows) => {
    container.innerHTML = "";
    if (!rows.length) {
      container.innerHTML = "<div class='muted'>No orders</div>";
      return;
    }
    rows.forEach((row) => {
      const div = document.createElement("div");
      div.className = "order-row";
      div.innerHTML = `<span>${formatNumber(row.price)}</span><span>${formatNumber(row.qty)}</span><span>${formatNumber(row.price * row.qty)}</span>`;
      container.appendChild(div);
    });
  };

  render(orderBookBids, buildRows(bids, "bid"));
  render(orderBookAsks, buildRows(asks, "ask"));
};

const renderTradeTape = (orders) => {
  tradeTape.innerHTML = "";
  if (!orders.length) {
    tradeTape.innerHTML = "<div class='muted'>No recent orders</div>";
    return;
  }
  orders.slice(0, 20).forEach((order) => {
    const item = document.createElement("div");
    item.className = "tape-item";
    const side = order.side || order._side || "";
    item.innerHTML = `<span>${formatTime(order.timestamp)}</span><span>${side.toUpperCase()}</span><strong>${formatNumber(order.price)}</strong><span>${formatNumber(order.quantity)}</span>`;
    tradeTape.appendChild(item);
  });
};

const updatePortfolio = (positions) => {
  if (!Array.isArray(positions) || !positions.length) {
    equityValue.textContent = "—";
    pnlValue.textContent = "—";
    if (state.allocationChart) {
      state.allocationChart.data.labels = [];
      state.allocationChart.data.datasets[0].data = [];
      state.allocationChart.update();
    }
    return;
  }

  const labels = positions.map((pos) => `Asset ${pos.asset_id}`);
  const values = positions.map((pos) => {
    const lastPrice = state.lastPrices[`CMD${pos.asset_id}`] || state.lastPrices[pos.asset_id];
    return Number(pos.quantity || 0) * Number(lastPrice || 0);
  });
  const equity = values.reduce((sum, v) => sum + v, 0);

  equityValue.textContent = formatNumber(equity || 0);
  pnlValue.textContent = "—";

  if (state.allocationChart) {
    state.allocationChart.data.labels = labels;
    state.allocationChart.data.datasets[0].data = values;
    state.allocationChart.update();
  }
};

const handleClick = (id, handler) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", handler);
};

handleClick("connectWs", connectWebSocket);
handleClick("disconnectWs", disconnectWebSocket);

handleClick("fetchLast", async () => {
  await fetchChartHistory("last");
});

handleClick("fetchAll", async () => {
  await fetchChartHistory("all");
});

handleClick("fetchLastHistory", async () => {
  await fetchChartHistory("last");
});

handleClick("fetchAllHistory", async () => {
  await fetchChartHistory("all");
});

handleClick("createUser", async () => {
  try {
    const payload = {
      username: document.getElementById("username").value || "trader",
      balance: Number(document.getElementById("userBalance").value || 0),
    };
    const data = await fetchJson("/users/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    document.getElementById("userOutput").textContent = toJson(data);
    log(`User created: ${data.id || data.user_id || "ok"}`);
  } catch (error) {
    log(error.message);
  }
});

handleClick("getUser", async () => {
  try {
    const userId = document.getElementById("getUserId").value;
    const data = await fetchJson(`/users/${userId}`);
    document.getElementById("userOutput").textContent = toJson(data);
  } catch (error) {
    log(error.message);
  }
});

handleClick("createOrder", async () => {
  try {
    const payload = {
      user_id: Number(document.getElementById("orderUserId").value),
      asset_id: Number(document.getElementById("orderAssetId").value),
      side: document.getElementById("orderSide").value,
      price: Number(document.getElementById("orderPrice").value),
      quantity: Number(document.getElementById("orderQty").value),
    };
    const data = await fetchJson("/orders/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    log(`Order created: ${data.id || data.order_id || "ok"}`);
    showToast("Trade executed");
  } catch (error) {
    log(error.message);
    showToast("Trade failed");
  }
});

handleClick("cancelOrder", async () => {
  try {
    const orderId = document.getElementById("cancelOrderId").value;
    const data = await fetchJson(`/orders/${orderId}/cancel`, {
      method: "POST",
    });
    log(`Order cancelled: ${toJson(data)}`);
  } catch (error) {
    log(error.message);
  }
});

handleClick("refreshOrders", async () => {
  try {
    const bids = await fetchJson("/orders/side/bid");
    const asks = await fetchJson("/orders/side/ask");
    document.getElementById("bidsOutput").textContent = toJson(bids);
    document.getElementById("asksOutput").textContent = toJson(asks);
    const bidCount = Array.isArray(bids) ? bids.length : bids?.orders?.length || 0;
    const askCount = Array.isArray(asks) ? asks.length : asks?.orders?.length || 0;
    setElText(statOrders, `${bidCount} / ${askCount}`);
    const bidsWithSide = (Array.isArray(bids) ? bids : []).map((order) => ({
      ...order,
      side: "bid",
    }));
    const asksWithSide = (Array.isArray(asks) ? asks : []).map((order) => ({
      ...order,
      side: "ask",
    }));
    renderOrderBook(bidsWithSide, asksWithSide);
    renderTradeTape([...bidsWithSide, ...asksWithSide].sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || "")));
  } catch (error) {
    log(error.message);
  }
});

handleClick("getPosition", async () => {
  try {
    const userId = document.getElementById("posUserId").value;
    const assetId = document.getElementById("posAssetId").value;
    const data = await fetchJson(`/positions?user_id=${userId}&asset_id=${assetId}`);
    document.getElementById("positionsOutput").textContent = toJson(data);
  } catch (error) {
    log(error.message);
  }
});

handleClick("getUserPositions", async () => {
  try {
    const userId = document.getElementById("posUserId").value;
    const data = await fetchJson(`/positions/user/${userId}`);
    document.getElementById("positionsOutput").textContent = toJson(data);
    updatePortfolio(data);
  } catch (error) {
    log(error.message);
  }
});

handleClick("addWatch", () => {
  const symbol = watchSymbol.value.trim().toUpperCase();
  if (!symbol) return;
  if (!state.watchlist.includes(symbol)) {
    state.watchlist.push(symbol);
    saveState();
    renderWatchlist();
  }
  watchSymbol.value = "";
});

handleClick("clearWatch", () => {
  state.watchlist = [];
  saveState();
  renderWatchlist();
});

handleClick("addAlert", () => {
  const symbol = alertSymbol.value.trim().toUpperCase();
  const condition = alertCondition.value;
  const price = Number(alertPrice.value);
  if (!symbol || Number.isNaN(price)) return;
  state.alerts.push({ symbol, condition, price, triggered: false });
  saveState();
  renderAlerts();
  alertSymbol.value = "";
});

handleClick("clearAlerts", () => {
  state.alerts = [];
  saveState();
  renderAlerts();
});

toggleSma?.addEventListener("change", () => updateChart(state.lastHistory));
toggleEma?.addEventListener("change", () => updateChart(state.lastHistory));
toggleRsi?.addEventListener("change", () => updateChart(state.lastHistory));
chartSymbol?.addEventListener("change", () => {
  const asset = state.assets.find(
    (item) => String(item.id) === String(chartSymbol.value)
  );
  updateAssetHeader(asset);
  fetchChartHistory("last");
  startAutoRefresh();
});
chartTimeframe?.addEventListener("change", () => {
  fetchChartHistory("last");
  startAutoRefresh();
});

marketSearch?.addEventListener("input", () => updateMarketTable(state.assets));

notifBtn?.addEventListener("click", () => {
  notifPanel?.classList.toggle("active");
});

toggleSidebar?.addEventListener("click", () => {
  sidebar?.classList.toggle("collapsed");
});

document.querySelectorAll("[data-open]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const modalId = btn.getAttribute("data-open");
    document.getElementById(modalId)?.classList.add("active");
  });
});

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const modalId = btn.getAttribute("data-close");
    document.getElementById(modalId)?.classList.remove("active");
  });
});

initChart();
initAllocationChart();
loadState();
renderWatchlist();
renderAlerts();
initNavigation();
loadAssets();
setStatus("Ready", true);
renderLivePrices([]);
startAutoRefresh();
