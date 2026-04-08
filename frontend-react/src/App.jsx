import React, { useEffect, useMemo, useRef, useState } from "react";
import CandlestickChart from "./components/CandlestickChart.jsx";
import useLiveCandles from "./hooks/useLiveCandles.js";
import { fromPriceInt } from "./utils/candleUtils.js";

const API_BASE = "http://localhost:8000";
const TRADING_FEE_RATE = 0.001;
const PRICE_STREAM_INTERVAL_SECONDS = 0.5;
const ACCOUNT_SYNC_INTERVAL_MS = 20_000;

const timeframes = [
  { label: "5s", value: "5s" },
  { label: "10s", value: "10s" },
  { label: "30s", value: "30s" },
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "30m", value: "30m" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
  { label: "1M", value: "1M" }
];

const navItems = [
  { key: "dashboard", label: "Dashboard", icon: "⌂" },
  { key: "markets", label: "Markets", icon: "◎" },
  { key: "portfolio", label: "Portfolio", icon: "◔" },
  { key: "watchlist", label: "Watchlist", icon: "☆" },
  { key: "copy", label: "Copy Traders", icon: "⇄" },
  { key: "feed", label: "News / Feed", icon: "☰" },
  { key: "settings", label: "Settings", icon: "⚙" }
];

const assetTabs = [
  { key: "overview", label: "Overview" },
  { key: "chart", label: "Chart" },
  { key: "financials", label: "Financials" }
];

const streamLabel = (state, stale) => {
  if (stale) return "Stale";
  if (state === "live") return "Live";
  if (state === "reconnecting") return "Reconnecting";
  if (state === "connecting") return "Connecting";
  if (state === "error") return "Error";
  return "Idle";
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const raw = localStorage.getItem("stochastic_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
  const [authMode, setAuthMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [timeframe, setTimeframe] = useState("5m");
  const [smaPeriod, setSmaPeriod] = useState(20);
  const [assets, setAssets] = useState([]);
  const [assetId, setAssetId] = useState("");
  const [page, setPage] = useState("dashboard");
  const [assetTab, setAssetTab] = useState("overview");
  const [watchlist, setWatchlist] = useState([]);
  const [positions, setPositions] = useState([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [prices, setPrices] = useState({});
  const [pricesStreamState, setPricesStreamState] = useState("idle");
  const [pricesStreamStale, setPricesStreamStale] = useState(false);
  const [lastPricesTickAt, setLastPricesTickAt] = useState(null);
  const [tradeQuantity, setTradeQuantity] = useState("1");
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeMessage, setTradeMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState("");
  const [positionsDetailed, setPositionsDetailed] = useState([]);
  const [portfolioSummary, setPortfolioSummary] = useState(null);
  const [orderHistory, setOrderHistory] = useState([]);
  const [fillHistory, setFillHistory] = useState([]);
  const [accountActivity, setAccountActivity] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [alertAssetId, setAlertAssetId] = useState("");
  const [alertCondition, setAlertCondition] = useState("above");
  const [alertTargetPrice, setAlertTargetPrice] = useState("");
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsMessage, setAlertsMessage] = useState("");
  const [watchlistMessage, setWatchlistMessage] = useState("");
  const [closePreviewByAsset, setClosePreviewByAsset] = useState({});
  const [showEma, setShowEma] = useState(false);
  const [showRsi, setShowRsi] = useState(false);
  const [showMacd, setShowMacd] = useState(false);
  const [drawTool, setDrawTool] = useState("none");
  const [drawResetToken, setDrawResetToken] = useState(0);
  const [drawUndoToken, setDrawUndoToken] = useState(0);
  const [priceFlashBySymbol, setPriceFlashBySymbol] = useState({});
  const [holdingsFlash, setHoldingsFlash] = useState("");
  const [equityFlash, setEquityFlash] = useState("");
  const [lastAccountSyncAt, setLastAccountSyncAt] = useState(null);
  const [accountSyncState, setAccountSyncState] = useState("idle");
  const previousPricesRef = useRef({});
  const previousHoldingsRef = useRef(null);
  const previousEquityRef = useRef(null);
  const accountSyncInFlightRef = useRef(false);

  const {
    candles,
    status,
    error,
    refreshHistory,
    streamState: chartStreamState,
    isStale: chartStreamStale,
    streamIntervalSeconds
  } = useLiveCandles({
    assetId,
    timeframe,
    symbol: assets.find((asset) => String(asset.id) === String(assetId))?.symbol
  });

  const persistUser = (user) => {
    setCurrentUser(user);
    localStorage.setItem("stochastic_user", JSON.stringify(user));
  };

  const drawEnabled = drawTool !== "none";

  const refreshAccountData = async (userId, options = {}) => {
    const { silent = false } = options;
    if (!userId) return;
    if (accountSyncInFlightRef.current) return;
    accountSyncInFlightRef.current = true;
    if (!silent) {
      setAccountSyncState("syncing");
    }
    try {
      const [
        userRes,
        positionsRes,
        positionsDetailedRes,
        portfolioSummaryRes,
        watchlistRes,
        ordersRes,
        fillsRes,
        activityRes,
        alertsRes
      ] = await Promise.all([
        fetch(`${API_BASE}/users/${userId}`),
        fetch(`${API_BASE}/positions/user/${userId}`),
        fetch(`${API_BASE}/positions/user/${userId}/detailed`),
        fetch(`${API_BASE}/positions/user/${userId}/summary`),
        fetch(`${API_BASE}/users/${userId}/watchlist`),
        fetch(`${API_BASE}/orders/user/${userId}?limit=100`),
        fetch(`${API_BASE}/orders/fills/${userId}?limit=200`),
        fetch(`${API_BASE}/orders/account-activity/${userId}`),
        fetch(`${API_BASE}/users/${userId}/alerts`)
      ]);

      if (userRes.ok) {
        const userData = await userRes.json();
        persistUser(userData);
      }

      if (positionsRes.ok) {
        const positionsData = await positionsRes.json();
        setPositions(Array.isArray(positionsData) ? positionsData : []);
      }

      if (positionsDetailedRes.ok) {
        const positionsDetailedData = await positionsDetailedRes.json();
        setPositionsDetailed(Array.isArray(positionsDetailedData) ? positionsDetailedData : []);
      }

      if (portfolioSummaryRes.ok) {
        const summaryData = await portfolioSummaryRes.json();
        setPortfolioSummary(summaryData || null);
      }

      if (watchlistRes.ok) {
        const watchlistData = await watchlistRes.json();
        setWatchlist(Array.isArray(watchlistData) ? watchlistData : []);
      } else {
        setWatchlist([]);
      }

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setOrderHistory(Array.isArray(ordersData) ? ordersData : []);
      } else {
        setOrderHistory([]);
      }

      if (fillsRes.ok) {
        const fillsData = await fillsRes.json();
        setFillHistory(Array.isArray(fillsData) ? fillsData : []);
      } else {
        setFillHistory([]);
      }

      if (activityRes.ok) {
        const activityData = await activityRes.json();
        setAccountActivity(activityData || null);
      } else {
        setAccountActivity(null);
      }

      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlerts(Array.isArray(alertsData) ? alertsData : []);
      } else {
        setAlerts([]);
      }
      setLastAccountSyncAt(Date.now());
      setAccountSyncState("live");
    } catch {
      // keep last known data snapshot on transient failures
      setAccountSyncState("error");
    } finally {
      accountSyncInFlightRef.current = false;
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    if (authLoading) return;
    setAuthError("");

    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setAuthError("Please enter username and password.");
      return;
    }

    setAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Login failed.");
      }
      persistUser(data);
      setUsername("");
      setPassword("");
      await refreshAccountData(data.id);
    } catch (err) {
      setAuthError(err.message || "Login failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    if (authLoading) return;
    setAuthError("");

    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setAuthError("Please enter username and password.");
      return;
    }

    setAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername, password, balance: 100000 })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Signup failed.");
      }
      persistUser(data);
      setUsername("");
      setPassword("");
      await refreshAccountData(data.id);
    } catch (err) {
      setAuthError(err.message || "Signup failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    if (authLoading) return;
    setAuthError("");
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/demo-login`, {
        method: "POST"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Demo login failed.");
      }
      persistUser(data);
      await refreshAccountData(data.id);
    } catch (err) {
      setAuthError(err.message || "Demo login failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("stochastic_user");
    setCurrentUser(null);
    setUsername("");
    setPassword("");
    setAuthError("");
    setWatchlist([]);
    setPositions([]);
    setPositionsDetailed([]);
    setPortfolioSummary(null);
    setOrderHistory([]);
    setFillHistory([]);
    setAccountActivity(null);
    setAlerts([]);
    setClosePreviewByAsset({});
  };

  const handleCreateAlert = async () => {
    if (!currentUser?.id || !alertAssetId || alertsLoading) return;
    setAlertsMessage("");
    const target = Number(alertTargetPrice);
    if (!Number.isFinite(target) || target <= 0) {
      setAlertsMessage("Enter a valid alert target price.");
      return;
    }
    setAlertsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${currentUser.id}/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: Number(alertAssetId),
          condition: alertCondition,
          target_price: target
        })
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error(data?.detail || "Failed to create alert");
      }
      setAlerts(Array.isArray(data) ? data : []);
      setAlertTargetPrice("");
      setAlertsMessage("Alert created.");
    } catch (err) {
      setAlertsMessage(err.message || "Failed to create alert.");
    } finally {
      setAlertsLoading(false);
    }
  };

  const handleDeleteAlert = async (alertId) => {
    if (!currentUser?.id || alertsLoading) return;
    setAlertsMessage("");
    setAlertsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${currentUser.id}/alerts/${alertId}`, {
        method: "DELETE"
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error(data?.detail || "Failed to delete alert");
      }
      setAlerts(Array.isArray(data) ? data : []);
      setAlertsMessage("Alert removed.");
    } catch (err) {
      setAlertsMessage(err.message || "Failed to delete alert.");
    } finally {
      setAlertsLoading(false);
    }
  };

  const handleReactivateAlert = async (alertId) => {
    if (!currentUser?.id || alertsLoading) return;
    setAlertsMessage("");
    setAlertsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${currentUser.id}/alerts/${alertId}/reactivate`, {
        method: "POST"
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error(data?.detail || "Failed to reactivate alert");
      }
      setAlerts(Array.isArray(data) ? data : []);
      setAlertsMessage("Alert reactivated.");
    } catch (err) {
      setAlertsMessage(err.message || "Failed to reactivate alert.");
    } finally {
      setAlertsLoading(false);
    }
  };

  const handleAddToWatchlist = async () => {
    if (!currentUser?.id || !assetId || watchlistLoading) return;
    setWatchlistMessage("");
    const alreadyInWatchlist = watchlist.some((asset) => String(asset.id) === String(assetId));
    if (alreadyInWatchlist) {
      setWatchlistMessage("Asset already in watchlist.");
      return;
    }
    setWatchlistLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${currentUser.id}/watchlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: Number(assetId) })
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error(data?.detail || "Failed to update watchlist");
      }
      setWatchlist(Array.isArray(data) ? data : []);
      setWatchlistMessage("Added to watchlist.");
    } catch (err) {
      setWatchlistMessage(err.message || "Failed to update watchlist.");
    } finally {
      setWatchlistLoading(false);
    }
  };

  const handleRemoveFromWatchlist = async (removeAssetId) => {
    if (!currentUser?.id || watchlistLoading) return;
    setWatchlistMessage("");
    setWatchlistLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${currentUser.id}/watchlist/${removeAssetId}`, {
        method: "DELETE"
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error(data?.detail || "Failed to update watchlist");
      }
      setWatchlist(Array.isArray(data) ? data : []);
      setWatchlistMessage("Removed from watchlist.");
    } catch (err) {
      setWatchlistMessage(err.message || "Failed to update watchlist.");
    } finally {
      setWatchlistLoading(false);
    }
  };

  const selectedAsset = useMemo(
    () => assets.find((asset) => String(asset.id) === String(assetId)),
    [assets, assetId]
  );

  const normalizedCandles = useMemo(
    () =>
      candles
        .map((candle) => ({
          open: fromPriceInt(candle.open),
          high: fromPriceInt(candle.high),
          low: fromPriceInt(candle.low),
          close: fromPriceInt(candle.close),
          volume: Number(candle.volume ?? 0)
        }))
        .filter(
          (candle) =>
            Number.isFinite(candle.open) &&
            Number.isFinite(candle.high) &&
            Number.isFinite(candle.low) &&
            Number.isFinite(candle.close)
        ),
    [candles]
  );

  const latestClose = useMemo(() => {
    if (!normalizedCandles.length) return null;
    return normalizedCandles[normalizedCandles.length - 1].close;
  }, [normalizedCandles]);

  const previousClose = useMemo(() => {
    if (normalizedCandles.length < 2) return null;
    return normalizedCandles[normalizedCandles.length - 2].close;
  }, [normalizedCandles]);

  const headerPrice = useMemo(() => {
    const fromTicker = Number(prices[selectedAsset?.symbol]);
    if (Number.isFinite(fromTicker)) return fromTicker;
    return latestClose;
  }, [latestClose, prices, selectedAsset]);

  const priceChangePct = useMemo(() => {
    if (!Number.isFinite(latestClose) || !Number.isFinite(previousClose) || previousClose === 0) {
      return null;
    }
    return ((latestClose - previousClose) / previousClose) * 100;
  }, [latestClose, previousClose]);

  const last24 = useMemo(() => normalizedCandles.slice(-24), [normalizedCandles]);

  const high24 = useMemo(() => {
    if (!last24.length) return null;
    return Math.max(...last24.map((candle) => candle.high));
  }, [last24]);

  const low24 = useMemo(() => {
    if (!last24.length) return null;
    return Math.min(...last24.map((candle) => candle.low));
  }, [last24]);

  const volume24 = useMemo(
    () => last24.reduce((sum, candle) => sum + candle.volume, 0),
    [last24]
  );

  const average24 = useMemo(() => {
    if (!last24.length) return null;
    return last24.reduce((sum, candle) => sum + candle.close, 0) / last24.length;
  }, [last24]);

  const portfolioPositionsBase = useMemo(() => {
    if (positionsDetailed.length) {
      return positionsDetailed;
    }
    return positions
      .map((position) => ({
        user_id: currentUser?.id,
        asset_id: position.asset_id,
        symbol: position.symbol,
        name: position.name,
        quantity: Number(position.quantity || 0),
        avg_entry_price: 0,
        market_price: Number(prices[position.symbol]),
        market_value: 0,
        cost_basis: 0,
        unrealized_pnl: 0,
        unrealized_pnl_pct: 0,
        realized_pnl: 0
      }))
      .filter((position) => Number(position.quantity || 0) > 0);
  }, [positionsDetailed, positions, prices, currentUser?.id]);

  const livePositionsDetailed = useMemo(
    () =>
      portfolioPositionsBase
        .map((position) => {
        const fallbackPrice = Number(position.market_price);
        const streamPrice = Number(prices[position.symbol]);
        const marketPrice = Number.isFinite(streamPrice) && streamPrice > 0
          ? streamPrice
          : Number.isFinite(fallbackPrice) && fallbackPrice > 0
            ? fallbackPrice
            : null;
        const quantity = Number(position.quantity || 0);
        const costBasis = Number(position.cost_basis || 0);
        const marketValue = quantity * (Number.isFinite(marketPrice) ? marketPrice : 0);
        const unrealizedPnl = marketValue - costBasis;
        const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
        return {
          ...position,
          market_price: marketPrice,
          market_value: marketValue,
          unrealized_pnl: unrealizedPnl,
          unrealized_pnl_pct: unrealizedPnlPct
        };
      })
      .filter((position) => Number(position.quantity || 0) > 0),
    [portfolioPositionsBase, prices]
  );

  const totalCostBasis = useMemo(
    () => livePositionsDetailed.reduce((sum, position) => sum + Number(position.cost_basis || 0), 0),
    [livePositionsDetailed]
  );

  const holdingsValue = useMemo(
    () => livePositionsDetailed.reduce((sum, position) => sum + Number(position.market_value || 0), 0),
    [livePositionsDetailed]
  );

  const totalEquity = useMemo(
    () => Number(currentUser?.balance || 0) + holdingsValue,
    [currentUser, holdingsValue]
  );

  const totalUnrealizedPnl = useMemo(
    () => livePositionsDetailed.reduce((sum, position) => sum + Number(position.unrealized_pnl || 0), 0),
    [livePositionsDetailed]
  );
  const totalRealizedPnl = Number(portfolioSummary?.total_realized_pnl || 0);
  const totalReturnPct =
    totalCostBasis > 0 ? ((totalUnrealizedPnl + totalRealizedPnl) / totalCostBasis) * 100 : 0;
  const combinedPnl = totalUnrealizedPnl + totalRealizedPnl;

  const topHoldings = useMemo(
    () => [...livePositionsDetailed].sort((a, b) => Number(b.market_value || 0) - Number(a.market_value || 0)),
    [livePositionsDetailed]
  );

  const portfolioAllocation = useMemo(() => {
    if (!holdingsValue) return [];
    return topHoldings.map((position) => ({
      ...position,
      allocationPct: (Number(position.market_value || 0) / holdingsValue) * 100
    }));
  }, [topHoldings, holdingsValue]);

  const watchlistPulse = useMemo(
    () =>
      watchlist.map((asset) => {
        const price = Number(prices[asset.symbol]);
        const inPortfolio = livePositionsDetailed.some(
          (position) => String(position.asset_id) === String(asset.id)
        );
        return {
          ...asset,
          price: Number.isFinite(price) ? price : null,
          inPortfolio,
          flashState: priceFlashBySymbol[asset.symbol] || ""
        };
      }),
    [watchlist, prices, livePositionsDetailed, priceFlashBySymbol]
  );

  const marketBoard = useMemo(
    () =>
      assets.slice(0, 8).map((asset) => {
        const price = Number(prices[asset.symbol]);
        return {
          ...asset,
          price: Number.isFinite(price) ? price : null,
          flashState: priceFlashBySymbol[asset.symbol] || ""
        };
      }),
    [assets, prices, priceFlashBySymbol]
  );

  const recentFills = useMemo(() => fillHistory.slice(0, 5), [fillHistory]);
  const activeAlerts = useMemo(() => alerts.filter((alert) => alert.is_active), [alerts]);
  const lastAccountSyncLabel = useMemo(
    () =>
      lastAccountSyncAt
        ? new Date(lastAccountSyncAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          })
        : "—",
    [lastAccountSyncAt]
  );

  const tradeQuantityNumber = Number(tradeQuantity);
  const hasValidTradeQuantity = Number.isFinite(tradeQuantityNumber) && tradeQuantityNumber > 0;
  const selectedPositionQuantity = Number(
    livePositionsDetailed.find((position) => String(position.asset_id) === String(assetId))?.quantity || 0
  );
  const safeHeaderPrice = Number.isFinite(Number(headerPrice)) && Number(headerPrice) > 0 ? Number(headerPrice) : null;
  const buyUnitCost = safeHeaderPrice ? safeHeaderPrice * (1 + TRADING_FEE_RATE) : null;
  const maxBuyQuantity =
    buyUnitCost && Number(currentUser?.balance || 0) > 0
      ? Number(currentUser.balance || 0) / buyUnitCost
      : 0;

  const estimatedNotional = hasValidTradeQuantity && safeHeaderPrice ? tradeQuantityNumber * safeHeaderPrice : 0;
  const estimatedFee = estimatedNotional * TRADING_FEE_RATE;
  const estimatedTotalBuyCost = estimatedNotional + estimatedFee;

  const setTradeQuantityValue = (value) => {
    if (!Number.isFinite(value) || value <= 0) return;
    setTradeQuantity(value.toFixed(4));
  };

  useEffect(() => {
    if (!currentUser?.id) return;
    refreshAccountData(currentUser.id);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const timer = setInterval(() => {
      refreshAccountData(currentUser.id, { silent: true });
    }, ACCOUNT_SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!assetId) return;
    setAlertAssetId(assetId);
  }, [assetId]);

  useEffect(() => {
    if (!currentUser) {
      setAssets([]);
      setPrices({});
      setAssetId("");
      return;
    }

    const loadAssets = async () => {
      try {
        const res = await fetch(`${API_BASE}/assets/`);
        if (!res.ok) throw new Error(`Failed to load assets (${res.status})`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setAssets(list);
        if (list.length && !assetId) {
          setAssetId(String(list[0].id));
        }
      } catch (err) {
        setAssets([]);
      }
    };
    loadAssets();
  }, [currentUser, assetId]);

  useEffect(() => {
    if (!currentUser || !assets.length) return;
    let disposed = false;
    let reconnectTimer = null;
    let attempts = 0;
    let socket = null;

    const fetchSnapshot = async () => {
      const updates = {};
      await Promise.all(
        assets.map(async (asset) => {
          const res = await fetch(`${API_BASE}/prices/last/${asset.id}?n=1`);
          if (!res.ok) return;
          const data = await res.json();
          if (Array.isArray(data) && data.length) {
            updates[asset.symbol] = Number(data[0].price);
          }
        })
      );
      if (Object.keys(updates).length) {
        setPrices((prev) => ({ ...prev, ...updates }));
      }
    };

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      if (disposed) return;

      setPricesStreamState(attempts === 0 ? "connecting" : "reconnecting");
      socket = new WebSocket(`ws://localhost:8000/ws/price?interval=${PRICE_STREAM_INTERVAL_SECONDS}`);

      socket.onopen = () => {
        attempts = 0;
        setPricesStreamState("live");
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const timestamp = payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now();
          const updates = Object.entries(payload)
            .filter(([symbol, value]) => symbol !== "timestamp" && Number.isFinite(Number(value)))
            .reduce((acc, [symbol, value]) => {
              acc[symbol] = Number(value);
              return acc;
            }, {});

          if (!Object.keys(updates).length) return;
          setPrices((prev) => ({ ...prev, ...updates }));
          setLastPricesTickAt(timestamp);
          setPricesStreamStale(false);
          setPricesStreamState("live");
        } catch {
          // ignore malformed stream payload
        }
      };

      socket.onerror = () => {
        setPricesStreamState("error");
      };

      socket.onclose = () => {
        if (disposed) return;
        attempts += 1;
        setPricesStreamState("reconnecting");
        const delay = Math.min(300 * 2 ** attempts, 5000);
        clearReconnect();
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    fetchSnapshot();
    connect();

    return () => {
      disposed = true;
      clearReconnect();
      if (socket) {
        socket.close();
      }
    };
  }, [assets, currentUser]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!lastPricesTickAt) return;
      const stale = Date.now() - lastPricesTickAt > 3_000;
      setPricesStreamStale(stale);
      if (stale && pricesStreamState === "live") {
        setPricesStreamState("stale");
      }
    }, 1_000);
    return () => clearInterval(timer);
  }, [lastPricesTickAt, pricesStreamState]);

  useEffect(() => {
    const previous = previousPricesRef.current;
    const nextFlash = {};
    for (const [symbol, valueRaw] of Object.entries(prices)) {
      const value = Number(valueRaw);
      if (!Number.isFinite(value)) continue;
      const prevValue = Number(previous[symbol]);
      if (Number.isFinite(prevValue) && value !== prevValue) {
        nextFlash[symbol] = value > prevValue ? "flash-up" : "flash-down";
      }
      previous[symbol] = value;
    }

    const symbols = Object.keys(nextFlash);
    if (!symbols.length) return;
    setPriceFlashBySymbol((prev) => ({ ...prev, ...nextFlash }));
    const timer = setTimeout(() => {
      setPriceFlashBySymbol((prev) => {
        const copy = { ...prev };
        symbols.forEach((symbol) => delete copy[symbol]);
        return copy;
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [prices]);

  useEffect(() => {
    const previous = previousHoldingsRef.current;
    if (!Number.isFinite(previous)) {
      previousHoldingsRef.current = holdingsValue;
      return;
    }
    if (holdingsValue === previous) return;
    setHoldingsFlash(holdingsValue > previous ? "flash-up" : "flash-down");
    previousHoldingsRef.current = holdingsValue;
    const timer = setTimeout(() => setHoldingsFlash(""), 450);
    return () => clearTimeout(timer);
  }, [holdingsValue]);

  useEffect(() => {
    const previous = previousEquityRef.current;
    if (!Number.isFinite(previous)) {
      previousEquityRef.current = totalEquity;
      return;
    }
    if (totalEquity === previous) return;
    setEquityFlash(totalEquity > previous ? "flash-up" : "flash-down");
    previousEquityRef.current = totalEquity;
    const timer = setTimeout(() => setEquityFlash(""), 450);
    return () => clearTimeout(timer);
  }, [totalEquity]);

  const handleMarketClick = (asset) => {
    setAssetId(String(asset.id));
    setAssetTab("overview");
    setPage("asset");
  };

  const handleGenerateDemoHistory = async () => {
    if (!assetId || isGenerating) return;
    setIsGenerating(true);
    setGenerateMessage("Generating realistic history...");
    try {
      const res = await fetch(`${API_BASE}/prices/generate/${assetId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          n: 60000,
          interval_seconds: 1,
          start_price: Number.isFinite(headerPrice) ? Number(headerPrice) : 100,
          drift: 0.0002,
          sigma: 0.018,
          mean_reversion: 0.02,
          long_run_price: Number.isFinite(headerPrice) ? Number(headerPrice) : 100,
          jump_probability: 0.0015,
          jump_scale: 0.025,
          seed: 42,
          clear_existing: false,
          continue_from_latest: true
        })
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || `Generation failed (${res.status})`);
      }
      const out = await res.json();
      await refreshHistory();
      setGenerateMessage(`Generated +${out.generated?.toLocaleString?.() || out.generated} continuous points.`);
      setAssetTab("chart");
    } catch (err) {
      setGenerateMessage(err.message || "Failed to generate demo history.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMarketTrade = async (side) => {
    if (!currentUser?.id || !assetId || tradeLoading) return;
    const quantity = Number(tradeQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setTradeMessage("Enter a valid quantity greater than zero.");
      return;
    }

    if (!Number.isFinite(Number(headerPrice)) || Number(headerPrice) <= 0) {
      setTradeMessage("Live price unavailable. Please wait a moment and retry.");
      return;
    }

    if (side === "buy" && quantity > maxBuyQuantity + 1e-9) {
      setTradeMessage(`Insufficient balance for this buy quantity. Max ≈ ${maxBuyQuantity.toFixed(4)}.`);
      return;
    }

    if (side === "sell" && quantity > selectedPositionQuantity + 1e-9) {
      setTradeMessage(`You only hold ${selectedPositionQuantity.toFixed(4)} ${selectedAsset?.symbol || "units"}.`);
      return;
    }

    setTradeLoading(true);
    setTradeMessage("");
    try {
      const res = await fetch(`${API_BASE}/orders/market`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUser.id,
          asset_id: Number(assetId),
          side,
          quantity
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Trade failed.");
      }

      await refreshAccountData(currentUser.id);
      setTradeMessage(
        `${side === "buy" ? "Bought" : "Sold"} ${Number(data.quantity).toFixed(4)} ${data.symbol} @ ${Number(data.execution_price ?? data.price).toFixed(2)}. Fee: $${Number(data.fee || 0).toFixed(2)}. Cash: $${Number(data.new_balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      );
      setPage("portfolio");
    } catch (err) {
      setTradeMessage(err.message || "Trade failed.");
    } finally {
      setTradeLoading(false);
    }
  };

  const handleClosePosition = async (assetToCloseId, symbol, quantity, portion = 1) => {
    if (!currentUser?.id || tradeLoading) return;
    const qty = Number(quantity) * Number(portion);
    if (!Number.isFinite(qty) || qty <= 0) {
      setTradeMessage("Invalid close quantity.");
      return;
    }
    setTradeLoading(true);
    setTradeMessage("");
    try {
      const res = await fetch(`${API_BASE}/orders/close-position`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUser.id,
          asset_id: Number(assetToCloseId),
          quantity: qty
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Close position failed.");
      }

      await refreshAccountData(currentUser.id);
      setTradeMessage(
        `Closed ${Number(data.quantity).toFixed(4)} ${symbol} @ ${Number(data.execution_price ?? data.price).toFixed(2)}. Fee: $${Number(data.fee || 0).toFixed(2)}. Cash: $${Number(data.new_balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      );
    } catch (err) {
      setTradeMessage(err.message || "Close position failed.");
    } finally {
      setTradeLoading(false);
    }
  };

  const handlePreviewClosePosition = async (assetToCloseId, portion = 1) => {
    if (!currentUser?.id) return;
    try {
      const res = await fetch(
        `${API_BASE}/orders/close-preview/${currentUser.id}/${assetToCloseId}?portion=${portion}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Failed to preview close");
      }
      setClosePreviewByAsset((prev) => ({ ...prev, [assetToCloseId]: data }));
    } catch (err) {
      setTradeMessage(err.message || "Failed to preview close.");
    }
  };

  const buildCloseAllPreview = async () => {
    if (!currentUser?.id || !livePositionsDetailed.length) {
      return { estimated_fees: 0, estimated_proceeds: 0, quantity_to_close: 0 };
    }
    const previews = await Promise.all(
      livePositionsDetailed.map(async (position) => {
        const res = await fetch(
          `${API_BASE}/orders/close-preview/${currentUser.id}/${position.asset_id}?portion=1`
        );
        if (!res.ok) return null;
        return res.json().catch(() => null);
      })
    );

    return previews.filter(Boolean).reduce(
      (acc, item) => ({
        estimated_fees: acc.estimated_fees + Number(item.estimated_fees || 0),
        estimated_proceeds: acc.estimated_proceeds + Number(item.estimated_proceeds || 0),
        quantity_to_close: acc.quantity_to_close + Number(item.quantity_to_close || 0)
      }),
      { estimated_fees: 0, estimated_proceeds: 0, quantity_to_close: 0 }
    );
  };

  const handleCloseAllPositions = async () => {
    if (!currentUser?.id || tradeLoading) return;

    try {
      const preview = await buildCloseAllPreview();
      if (preview.quantity_to_close > 0) {
        const ok = window.confirm(
          `Close all positions (~${preview.quantity_to_close.toFixed(4)} units)?\nEstimated proceeds: $${preview.estimated_proceeds.toLocaleString(undefined, { maximumFractionDigits: 2 })}\nEstimated fees: $${preview.estimated_fees.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        );
        if (!ok) return;
      }
    } catch {
      // continue with close even if preview fails
    }

    setTradeLoading(true);
    setTradeMessage("");
    try {
      const res = await fetch(`${API_BASE}/orders/close-all-positions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUser.id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Close all positions failed.");
      }

      await refreshAccountData(currentUser.id);
      setTradeMessage(
        `Closed ${Number(data.closed_positions)} positions (${Number(data.total_quantity).toFixed(4)} shares total). Cash: $${Number(data.new_balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      );
    } catch (err) {
      setTradeMessage(err.message || "Close all positions failed.");
    } finally {
      setTradeLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="login-page">
        <form className="login-card" onSubmit={authMode === "login" ? handleLogin : handleSignup}>
          <div className="logo login-logo">ST</div>
          <h1>{authMode === "login" ? "Welcome Back" : "Create Account"}</h1>
          <p>
            {authMode === "login"
              ? "Sign in with your SQL user to access the trading dashboard."
              : "Create a new account and start trading immediately."}
          </p>
          <label>
            Username
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="e.g. Martin"
              autoFocus
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
            />
          </label>
          {authError ? <div className="auth-error">{authError}</div> : null}
          <div className="login-actions">
            <button className="primary" type="submit" disabled={authLoading}>
              {authLoading ? "Please wait..." : authMode === "login" ? "Login" : "Sign Up"}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={handleDemoLogin}
              disabled={authLoading}
            >
              Demo Login
            </button>
          </div>
          <button
            className="auth-switch"
            type="button"
            onClick={() => {
              setAuthMode((prev) => (prev === "login" ? "signup" : "login"));
              setAuthError("");
            }}
          >
            {authMode === "login" ? "Need an account? Sign up" : "Already have an account? Login"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">ST</div>
          <div className="brand-copy">
            <h1>Stochastic</h1>
            <span>Social Trading</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${page === item.key ? "active" : ""}`}
              onClick={() => setPage(item.key)}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            Stochastic Candlestick MVP
            <span className={`stream-pill ${pricesStreamStale ? "stale" : pricesStreamState}`}>
              Market: {streamLabel(pricesStreamState, pricesStreamStale)}
            </span>
          </div>
          <input className="search" placeholder="Search" />
          <div className="top-actions">
            <button className="ghost">✦</button>
            <button className="ghost">🔔</button>
            <button className="primary">Trade</button>
            <div className="profile-name">${Number(currentUser.balance || 0).toLocaleString()}</div>
            <div className="profile-name">{currentUser.username}</div>
            <button className="ghost" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <main className="content">
          {page === "dashboard" && (
            <section className="page">
              <h2>Dashboard</h2>
              <div className="dashboard-hero card">
                <div>
                  <h3>Welcome back, {currentUser.username}</h3>
                  <p className="muted-block">
                    {combinedPnl >= 0 ? "Your strategy is in profit today." : "Market is choppy — manage risk carefully."}
                  </p>
                  <div className="dashboard-quick-actions">
                    <button className="primary" onClick={() => setPage("asset")}>Open Trading Terminal</button>
                    <button className="secondary" onClick={() => setPage("portfolio")}>View Portfolio</button>
                    <button className="ghost" onClick={() => setPage("watchlist")}>Manage Watchlist</button>
                  </div>
                </div>
                <div className="dashboard-hero-pill">
                  <span>Stream</span>
                  <strong>{streamLabel(pricesStreamState, pricesStreamStale)}</strong>
                  <small>Last tick: {lastPricesTickAt ? new Date(lastPricesTickAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</small>
                </div>
                <div className={`dashboard-hero-pill account-sync ${accountSyncState}`}>
                  <span>Account Sync</span>
                  <strong>{accountSyncState === "syncing" ? "Syncing" : accountSyncState === "error" ? "Delayed" : "Live"}</strong>
                  <small>Last sync: {lastAccountSyncLabel}</small>
                </div>
              </div>

              <div className="dashboard-kpis">
                <div className="card dashboard-kpi-card">
                  <span>Total Equity</span>
                  <strong className={equityFlash}>${totalEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                  <small className={combinedPnl < 0 ? "negative" : "positive"}>
                    {combinedPnl >= 0 ? "+" : ""}${combinedPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })} P&L
                  </small>
                </div>
                <div className="card dashboard-kpi-card">
                  <span>Holdings Value</span>
                  <strong className={holdingsFlash}>${holdingsValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                  <small>{livePositionsDetailed.length} active positions</small>
                </div>
                <div className="card dashboard-kpi-card">
                  <span>Total Return</span>
                  <strong className={totalReturnPct < 0 ? "negative" : "positive"}>{totalReturnPct.toFixed(2)}%</strong>
                  <small>Realized: ${totalRealizedPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}</small>
                </div>
                <div className="card dashboard-kpi-card">
                  <span>Watchlist</span>
                  <strong>{watchlistPulse.length}</strong>
                  <small>{activeAlerts.length} active alerts</small>
                </div>
              </div>

              <div className="dashboard-main-grid">
                <div className="card">
                  <h3>Portfolio Allocation</h3>
                  {!portfolioAllocation.length ? (
                    <div className="muted-block">No active positions yet.</div>
                  ) : (
                    <div className="allocation-list">
                      {portfolioAllocation.slice(0, 6).map((position) => (
                        <div key={`alloc-${position.asset_id}`} className="allocation-row">
                          <div className="allocation-head">
                            <span>{position.symbol}</span>
                            <strong>{position.allocationPct.toFixed(1)}%</strong>
                          </div>
                          <div className="allocation-bar-track">
                            <div className="allocation-bar-fill" style={{ width: `${Math.max(2, position.allocationPct)}%` }} />
                          </div>
                          <div className="allocation-meta">
                            <span>${Number(position.market_value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            <span className={Number(position.unrealized_pnl || 0) < 0 ? "negative" : "positive"}>
                              {Number(position.unrealized_pnl || 0) >= 0 ? "+" : ""}${Number(position.unrealized_pnl || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card">
                  <h3>Watchlist Pulse</h3>
                  {!watchlistPulse.length ? (
                    <div className="muted-block">Add assets to your watchlist for quick monitoring.</div>
                  ) : (
                    <div className="table">
                      {watchlistPulse.slice(0, 6).map((asset) => (
                        <button key={`pulse-${asset.id}`} className="cell cell-button" onClick={() => handleMarketClick(asset)}>
                          <span>{asset.symbol}{asset.inPortfolio ? " · In Portfolio" : ""}</span>
                          <strong className={asset.flashState}>{Number.isFinite(asset.price) ? asset.price.toFixed(2) : "—"}</strong>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="dashboard-bottom-grid">
                <div className="card">
                  <h3>Market Board</h3>
                  <table className="asset-table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Name</th>
                        <th>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketBoard.map((asset) => (
                        <tr key={`board-${asset.id}`} onClick={() => handleMarketClick(asset)}>
                          <td>{asset.symbol}</td>
                          <td>{asset.name}</td>
                          <td className={asset.flashState}>{Number.isFinite(asset.price) ? asset.price.toFixed(2) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="card">
                  <h3>Recent Activity</h3>
                  <div className="dashboard-sync-note">Data sync: {accountSyncState === "syncing" ? "refreshing" : accountSyncState === "error" ? "delayed" : "live"} · Last: {lastAccountSyncLabel}</div>
                  {recentFills.length ? (
                    <div className="table">
                      {recentFills.map((fill) => (
                        <div key={`dash-fill-${fill.id}`} className="cell">
                          <span>{fill.symbol} · {fill.side.toUpperCase()} · {Number(fill.quantity).toFixed(3)}</span>
                          <strong>{Number(fill.execution_price).toFixed(2)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="muted-block">No fills yet. Start by placing your first trade.</div>
                  )}

                  {accountActivity ? (
                    <div className="dashboard-mini-stats">
                      <div className="stat-row"><span>Today's Fills</span><strong>{accountActivity.today_fills}</strong></div>
                      <div className="stat-row"><span>Today's Fees</span><strong>${Number(accountActivity.today_fees || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
                      <div className="stat-row"><span>Open Orders</span><strong>{accountActivity.open_orders}</strong></div>
                    </div>
                  ) : null}
                </div>

                <div className="card">
                  <h3>Alerts Center</h3>
                  {!activeAlerts.length ? (
                    <div className="muted-block">No active alerts yet. Configure alerts from an asset overview tab.</div>
                  ) : (
                    <div className="table">
                      {activeAlerts.slice(0, 6).map((alert) => (
                        <div key={`dash-alert-${alert.id}`} className="cell">
                          <span>{alert.symbol} {alert.condition} {Number(alert.target_price).toFixed(2)}</span>
                          <strong>{Number.isFinite(Number(alert.current_price)) ? Number(alert.current_price).toFixed(2) : "—"}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {page === "markets" && (
            <section className="page">
              <h2>Markets</h2>
              <div className="grid-2">
                <div className="card">
                  <h3>Markets List</h3>
                  <div className="market-list">
                    {assets.map((asset) => (
                      <button
                        key={asset.id}
                        className="market-item"
                        onClick={() => handleMarketClick(asset)}
                      >
                        <span>{asset.symbol}</span>
                        <small>{asset.name}</small>
                        <strong>{prices[asset.symbol]?.toFixed(2) || "—"}</strong>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="card">
                  <h3>Assets Table</h3>
                  <table className="asset-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Price</th>
                        <th>% Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assets.map((asset) => (
                        <tr key={asset.id} onClick={() => handleMarketClick(asset)}>
                          <td>{asset.symbol} · {asset.name}</td>
                          <td>{prices[asset.symbol]?.toFixed(2) || "—"}</td>
                          <td>—</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {page === "watchlist" && (
            <section className="page">
              <h2>Watchlist</h2>
              <div className="card">
                <div className="watchlist-actions">
                  <button className="secondary" onClick={handleAddToWatchlist} disabled={watchlistLoading || !assetId}>
                    {watchlistLoading ? "Updating..." : "Add Selected Asset"}
                  </button>
                </div>
                {watchlistMessage ? <div className="status">{watchlistMessage}</div> : null}
                <table className="asset-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Name</th>
                      <th>Live Price</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!watchlist.length ? (
                      <tr><td colSpan={5}>No watchlist assets yet.</td></tr>
                    ) : (
                      watchlist.map((asset) => {
                        const inPortfolio = livePositionsDetailed.some((position) => String(position.asset_id) === String(asset.id));
                        const livePrice = Number(prices[asset.symbol]);
                        return (
                          <tr key={asset.id}>
                            <td>{asset.symbol}</td>
                            <td>{asset.name}</td>
                            <td>{Number.isFinite(livePrice) ? livePrice.toFixed(2) : "—"}</td>
                            <td>{inPortfolio ? "In Portfolio" : "Watching"}</td>
                            <td>
                              <button className="ghost" onClick={() => handleMarketClick(asset)}>Open</button>
                              <button className="ghost" onClick={() => handleRemoveFromWatchlist(asset.id)}>Remove</button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="grid-2">
                <div className="card">
                  <h3>Active Alerts</h3>
                  {alertsMessage ? <div className="status">{alertsMessage}</div> : null}
                  <div className="table">
                    {alerts.filter((alert) => alert.is_active).length ? (
                      alerts
                        .filter((alert) => alert.is_active)
                        .map((alert) => (
                          <div key={`active-${alert.id}`} className="cell">
                            <span>{alert.symbol} {alert.condition} {Number(alert.target_price).toFixed(2)}</span>
                            <button className="ghost" onClick={() => handleDeleteAlert(alert.id)}>Delete</button>
                          </div>
                        ))
                    ) : (
                      <div className="muted-block">No active alerts.</div>
                    )}
                  </div>
                </div>
                <div className="card">
                  <h3>Triggered Alerts</h3>
                  <div className="table">
                    {alerts.filter((alert) => !alert.is_active).length ? (
                      alerts
                        .filter((alert) => !alert.is_active)
                        .map((alert) => (
                          <div key={`triggered-${alert.id}`} className="cell">
                            <span>{alert.symbol} hit {Number(alert.target_price).toFixed(2)}</span>
                            <button className="ghost" onClick={() => handleReactivateAlert(alert.id)}>Reactivate</button>
                          </div>
                        ))
                    ) : (
                      <div className="muted-block">No triggered alerts.</div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {page === "portfolio" && (
            <section className="page">
              <h2>Portfolio</h2>
              <div className="card">
                <div className="watchlist-actions">
                  <button className="secondary" onClick={handleCloseAllPositions} disabled={tradeLoading || !livePositionsDetailed.length}>
                    {tradeLoading ? "Working..." : "Close All Positions"}
                  </button>
                </div>
                {tradeMessage ? <div className="status">{tradeMessage}</div> : null}
                <div className="stat-row">
                  <span>Cash Balance</span>
                  <strong>${Number(currentUser.balance || 0).toLocaleString()}</strong>
                </div>
                <div className="stat-row">
                  <span>Open Positions</span>
                  <strong>{livePositionsDetailed.length}</strong>
                </div>
                <div className="stat-row">
                  <span>Total Equity</span>
                  <strong>${totalEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                </div>
                <div className="stat-row">
                  <span>Total Return</span>
                  <strong className={totalReturnPct < 0 ? "negative" : "positive"}>{totalReturnPct.toFixed(2)}%</strong>
                </div>
                <table className="asset-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Name</th>
                      <th>Quantity</th>
                      <th>Avg Entry</th>
                      <th>Live Price</th>
                      <th>Unrealized P&L</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!livePositionsDetailed.length ? (
                      <tr>
                        <td colSpan={7}>No holdings yet.</td>
                      </tr>
                    ) : (
                      livePositionsDetailed.map((position) => (
                        <tr key={`${position.user_id}-${position.asset_id}`}>
                          <td>{position.symbol}</td>
                          <td>{position.name}</td>
                          <td>{Number(position.quantity).toFixed(4)}</td>
                          <td>{Number(position.avg_entry_price || 0).toFixed(2)}</td>
                          <td>{Number.isFinite(Number(position.market_price)) ? Number(position.market_price).toFixed(2) : "—"}</td>
                          <td className={Number(position.unrealized_pnl || 0) < 0 ? "negative" : "positive"}>
                            ${Number(position.unrealized_pnl || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td>
                            <button
                              className="secondary"
                              onClick={() => handleClosePosition(position.asset_id, position.symbol, position.quantity, 1)}
                              disabled={tradeLoading}
                            >
                              {tradeLoading ? "Working..." : "Close 100%"}
                            </button>
                            <button
                              className="ghost"
                              onClick={() => handleClosePosition(position.asset_id, position.symbol, position.quantity, 0.5)}
                              disabled={tradeLoading}
                            >
                              50%
                            </button>
                            <button
                              className="ghost"
                              onClick={() => handleClosePosition(position.asset_id, position.symbol, position.quantity, 0.25)}
                              disabled={tradeLoading}
                            >
                              25%
                            </button>
                            <button
                              className="ghost"
                              onClick={() => handlePreviewClosePosition(position.asset_id, 1)}
                              disabled={tradeLoading}
                            >
                              Preview
                            </button>
                            {closePreviewByAsset[position.asset_id] ? (
                              <div className="muted-block">
                                Est. proceeds: ${Number(closePreviewByAsset[position.asset_id].estimated_proceeds || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="grid-2">
                <div className="card">
                  <h3>My Orders</h3>
                  <table className="asset-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Symbol</th>
                        <th>Side</th>
                        <th>Qty</th>
                        <th>Price</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!orderHistory.length ? (
                        <tr><td colSpan={6}>No orders yet.</td></tr>
                      ) : (
                        orderHistory.slice(0, 12).map((order) => (
                          <tr key={order.id}>
                            <td>{new Date(order.timestamp).toLocaleString()}</td>
                            <td>{order.symbol}</td>
                            <td className={order.side === "sell" ? "negative" : "positive"}>{order.side}</td>
                            <td>{Number(order.quantity).toFixed(4)}</td>
                            <td>{Number(order.price).toFixed(2)}</td>
                            <td>{order.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="card">
                  <h3>Trade History</h3>
                  <table className="asset-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Symbol</th>
                        <th>Side</th>
                        <th>Qty</th>
                        <th>Exec</th>
                        <th>Fee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!fillHistory.length ? (
                        <tr><td colSpan={6}>No fills yet.</td></tr>
                      ) : (
                        fillHistory.slice(0, 12).map((fill) => (
                          <tr key={fill.id}>
                            <td>{new Date(fill.timestamp).toLocaleString()}</td>
                            <td>{fill.symbol}</td>
                            <td className={fill.side === "sell" ? "negative" : "positive"}>{fill.side}</td>
                            <td>{Number(fill.quantity).toFixed(4)}</td>
                            <td>{Number(fill.execution_price).toFixed(2)}</td>
                            <td>{Number(fill.fee).toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <h3>Account Activity</h3>
                {accountActivity ? (
                  <>
                    <div className="stat-row"><span>Today Fills</span><strong>{accountActivity.today_fills}</strong></div>
                    <div className="stat-row"><span>Today Notional</span><strong>${Number(accountActivity.today_notional || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
                    <div className="stat-row"><span>Today Fees</span><strong>${Number(accountActivity.today_fees || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
                    <div className="stat-row"><span>Open Orders</span><strong>{accountActivity.open_orders}</strong></div>
                  </>
                ) : (
                  <div className="muted-block">No activity available.</div>
                )}
              </div>
            </section>
          )}

          {page === "copy" && (
            <section className="page">
              <h2>Copy Traders</h2>
              <div className="grid-3">
                <div className="card trader-card">
                  <h3>Trader Alpha</h3>
                  <p>Return 18% · Risk 4</p>
                  <button className="primary">Copy Trader</button>
                </div>
                <div className="card trader-card">
                  <h3>Trader Nova</h3>
                  <p>Return 24% · Risk 6</p>
                  <button className="primary">Copy Trader</button>
                </div>
                <div className="card trader-card">
                  <h3>Trader Pulse</h3>
                  <p>Return 12% · Risk 3</p>
                  <button className="primary">Copy Trader</button>
                </div>
              </div>
            </section>
          )}

          {page === "feed" && (
            <section className="page">
              <h2>News & Feed</h2>
              <div className="card">
                <div className="feed-item">@lucas · +12% monthly return · “Tech rally continues.”</div>
                <div className="feed-item">@hana · +8% monthly return · “Crypto momentum is strong.”</div>
              </div>
            </section>
          )}

          {page === "settings" && (
            <section className="page">
              <h2>Settings</h2>
              <div className="card">
                <label>Username<input type="text" defaultValue="angelos" /></label>
                <label>Email<input type="email" defaultValue="angelos@example.com" /></label>
                <button className="primary">Save</button>
              </div>
            </section>
          )}

          {page === "asset" && (
            <section className="page">
              <div className="instrument-strip card">
                <div>
                  <div className="asset-breadcrumbs">Discover · Crypto · Coins · {selectedAsset?.symbol || "—"}</div>
                  <h2>{selectedAsset ? `${selectedAsset.symbol} · ${selectedAsset.name}` : "Asset"}</h2>
                  <p>
                    {Number.isFinite(headerPrice) ? headerPrice.toFixed(2) : "—"}
                    {" · "}
                    <span className={Number.isFinite(priceChangePct) && priceChangePct < 0 ? "negative" : "positive"}>
                      {Number.isFinite(priceChangePct)
                        ? `${priceChangePct > 0 ? "+" : ""}${priceChangePct.toFixed(2)}%`
                        : "—"}
                    </span>
                  </p>
                </div>
                <div className="asset-header-actions">
                  <label>
                    Asset
                    <select
                      value={assetId}
                      onChange={(e) => {
                        setAssetId(e.target.value);
                        setAssetTab("overview");
                      }}
                    >
                      {assets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.symbol} · {asset.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Qty
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={tradeQuantity}
                      onChange={(event) => setTradeQuantity(event.target.value)}
                      placeholder="Enter shares"
                    />
                  </label>
                  <div className="trade-helper-box">
                    <div className="trade-helper-row">
                      <span>Cash</span>
                      <strong>${Number(currentUser.balance || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="trade-helper-row">
                      <span>Max Buy Qty</span>
                      <strong>{maxBuyQuantity > 0 ? maxBuyQuantity.toFixed(4) : "—"}</strong>
                    </div>
                    <div className="trade-quick-actions">
                      <button className="ghost" type="button" onClick={() => setTradeQuantityValue(1)}>1</button>
                      <button className="ghost" type="button" onClick={() => setTradeQuantityValue(5)}>5</button>
                      <button className="ghost" type="button" onClick={() => setTradeQuantityValue(10)}>10</button>
                      <button className="ghost" type="button" onClick={() => setTradeQuantityValue(maxBuyQuantity * 0.25)}>25%</button>
                      <button className="ghost" type="button" onClick={() => setTradeQuantityValue(maxBuyQuantity * 0.5)}>50%</button>
                      <button className="ghost" type="button" onClick={() => setTradeQuantityValue(maxBuyQuantity)}>Max</button>
                    </div>
                    <div className="trade-helper-row">
                      <span>Est. Buy Total</span>
                      <strong>${estimatedTotalBuyCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="trade-helper-row">
                      <span>Est. Fee</span>
                      <strong>${estimatedFee.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                    </div>
                  </div>
                  <button
                    className="primary"
                    onClick={() => handleMarketTrade("buy")}
                    disabled={tradeLoading || !hasValidTradeQuantity || !safeHeaderPrice}
                  >
                    {tradeLoading ? "Working..." : "Buy Market"}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => handleMarketTrade("sell")}
                    disabled={tradeLoading || !hasValidTradeQuantity || tradeQuantityNumber > selectedPositionQuantity || selectedPositionQuantity <= 0}
                  >
                    {tradeLoading ? "Working..." : `Sell (${selectedPositionQuantity.toFixed(2)} avail)`}
                  </button>
                  <button className="secondary demo-btn" onClick={handleGenerateDemoHistory} disabled={isGenerating}>
                    {isGenerating ? "Generating..." : "Generate Demo History"}
                  </button>
                </div>
              </div>

              {generateMessage ? <div className="status demo-status">{generateMessage}</div> : null}
              {tradeMessage ? <div className="status demo-status">{tradeMessage}</div> : null}

              <div className="asset-tabs-row">
                <div className="asset-tabs">
                  {assetTabs.map((tab) => (
                    <button
                      key={tab.key}
                      className={`asset-tab ${assetTab === tab.key ? "active" : ""}`}
                      onClick={() => setAssetTab(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {assetTab === "overview" && (
                <div className="asset-detail-layout">
                  <div className="left-column">
                    <div className="card performance-card">
                      <h3>Performance</h3>
                      <div className="overview-metrics-grid">
                        <div className="metric-item"><span>Last Price</span><strong>{Number.isFinite(latestClose) ? latestClose.toFixed(2) : "—"}</strong></div>
                        <div className="metric-item"><span>Change</span><strong className={Number.isFinite(priceChangePct) && priceChangePct < 0 ? "negative" : "positive"}>{Number.isFinite(priceChangePct) ? `${priceChangePct > 0 ? "+" : ""}${priceChangePct.toFixed(2)}%` : "—"}</strong></div>
                        <div className="metric-item"><span>High (24)</span><strong>{Number.isFinite(high24) ? high24.toFixed(2) : "—"}</strong></div>
                        <div className="metric-item"><span>Low (24)</span><strong>{Number.isFinite(low24) ? low24.toFixed(2) : "—"}</strong></div>
                        <div className="metric-item"><span>Volume (24)</span><strong>{Number.isFinite(volume24) ? volume24.toLocaleString() : "—"}</strong></div>
                        <div className="metric-item"><span>Avg Close (24)</span><strong>{Number.isFinite(average24) ? average24.toFixed(2) : "—"}</strong></div>
                      </div>
                    </div>
                    <div className="card">
                      <h3>Set Price Alert</h3>
                      {alertsMessage ? <div className="status">{alertsMessage}</div> : null}
                      <div className="controls compact">
                        <label>
                          Asset
                          <select value={alertAssetId} onChange={(event) => setAlertAssetId(event.target.value)}>
                            {assets.map((asset) => (
                              <option key={asset.id} value={asset.id}>{asset.symbol}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Condition
                          <select value={alertCondition} onChange={(event) => setAlertCondition(event.target.value)}>
                            <option value="above">Above</option>
                            <option value="below">Below</option>
                          </select>
                        </label>
                        <label>
                          Target
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={alertTargetPrice}
                            onChange={(event) => setAlertTargetPrice(event.target.value)}
                            placeholder="e.g. 150.00"
                          />
                        </label>
                        <button className="secondary" onClick={handleCreateAlert} disabled={alertsLoading}>
                          {alertsLoading ? "Saving..." : "Create"}
                        </button>
                      </div>
                      <div className="pill-list">
                        {!alerts.length ? <span className="muted-block">No alerts yet.</span> : null}
                        {alerts
                          .filter((alert) => String(alert.asset_id) === String(selectedAsset?.id || alertAssetId))
                          .map((alert) => (
                            <div className="watchlist-pill" key={alert.id}>
                              <span>
                                {alert.symbol} {alert.condition} {Number(alert.target_price).toFixed(2)}
                                {Number.isFinite(Number(alert.current_price))
                                  ? ` (now ${Number(alert.current_price).toFixed(2)})`
                                  : ""}
                                {!alert.is_active ? " · Triggered" : ""}
                              </span>
                              {!alert.is_active ? (
                                <button className="ghost" onClick={() => handleReactivateAlert(alert.id)}>↺</button>
                              ) : (
                                <button className="ghost" onClick={() => handleDeleteAlert(alert.id)}>✕</button>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                  <div className="right-column">
                    <div className="card">
                      <h3>Investors Trading {selectedAsset?.symbol || "Asset"}</h3>
                      <div className="feed-item">Patricia Malagón · +115.2% · 297 copiers</div>
                      <div className="feed-item">Jia Wen Chuah · +129.6% · 272 copiers</div>
                      <div className="feed-item">Stefano Ceragioli · +91.4% · 185 copiers</div>
                    </div>
                    <div className="card">
                      <h3>People Also Bought</h3>
                      <div className="stat-row"><span>NVDA</span><strong className="negative">-0.92%</strong></div>
                      <div className="stat-row"><span>ETH</span><strong className="negative">-3.83%</strong></div>
                      <div className="stat-row"><span>ADA</span><strong className="negative">-3.01%</strong></div>
                      <div className="stat-row"><span>DOGE</span><strong className="negative">-2.07%</strong></div>
                    </div>
                  </div>
                </div>
              )}

              {assetTab === "chart" && (
                <div className="card chart-shell chart-shell-large">
                  <div className="chart-toolbar">
                    <div className="controls compact">
                      <label>
                        Timeframe
                        <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                          {timeframes.map((tf) => (
                            <option key={tf.value} value={tf.value}>{tf.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        SMA
                        <input
                          type="number"
                          min="5"
                          max="50"
                          value={smaPeriod}
                          onChange={(e) => setSmaPeriod(Number(e.target.value))}
                        />
                      </label>
                      <button className={`secondary ${showEma ? "active" : ""}`} onClick={() => setShowEma((prev) => !prev)}>
                        EMA
                      </button>
                      <button className={`secondary ${showRsi ? "active" : ""}`} onClick={() => setShowRsi((prev) => !prev)}>
                        RSI
                      </button>
                      <button className={`secondary ${showMacd ? "active" : ""}`} onClick={() => setShowMacd((prev) => !prev)}>
                        MACD
                      </button>
                    </div>
                    <span className={`stream-pill ${chartStreamStale ? "stale" : chartStreamState}`}>
                      Chart: {streamLabel(chartStreamState, chartStreamStale)}
                    </span>
                    <div className="chart-tools-icons">
                      <button
                        className={`ghost ${drawTool === "none" ? "active" : ""}`}
                        title="Pan and zoom"
                        onClick={() => setDrawTool("none")}
                      >
                        Pan
                      </button>
                      <button
                        className={`ghost ${drawTool === "freehand" ? "active" : ""}`}
                        title="Freehand drawing"
                        onClick={() => setDrawTool("freehand")}
                      >
                        Freehand
                      </button>
                      <button
                        className={`ghost ${drawTool === "line" ? "active" : ""}`}
                        title="Straight line drawing"
                        onClick={() => setDrawTool("line")}
                      >
                        Line
                      </button>
                      <button
                        className={`ghost ${drawTool === "hRay" ? "active" : ""}`}
                        title="Horizontal ray tool"
                        onClick={() => setDrawTool("hRay")}
                      >
                        H-Ray
                      </button>
                      <button
                        className={`ghost ${drawTool === "vRay" ? "active" : ""}`}
                        title="Vertical ray tool"
                        onClick={() => setDrawTool("vRay")}
                      >
                        V-Ray
                      </button>
                      <button className="ghost" title="Undo last drawing" onClick={() => setDrawUndoToken((prev) => prev + 1)}>
                        Undo
                      </button>
                      <button className="ghost" title="Clear drawings" onClick={() => setDrawResetToken((prev) => prev + 1)}>
                        Clear
                      </button>
                    </div>
                  </div>
                  {status === "error" ? (
                    <div className="status">{error}</div>
                  ) : (
                    <div className="status">
                      History: {status} · Stream: {streamLabel(chartStreamState, chartStreamStale)} · Interval: {Math.round(streamIntervalSeconds * 1000)}ms · Tool: {drawTool === "none" ? "Pan/Zoom" : drawTool === "line" ? "Line" : drawTool === "hRay" ? "Horizontal Ray" : drawTool === "vRay" ? "Vertical Ray" : "Freehand"}
                    </div>
                  )}
                  <div className="chart-help">
                    <span><strong>Pan:</strong> drag chart + mouse wheel zoom</span>
                    <span><strong>Freehand:</strong> click and drag to sketch</span>
                    <span><strong>Line:</strong> click-drag-release to draw straight lines</span>
                    <span><strong>Rays:</strong> click-drag for horizontal/vertical ray</span>
                    <span><strong>Undo:</strong> remove last drawing only</span>
                    <span><strong>Clear:</strong> remove all drawings</span>
                  </div>
                  <CandlestickChart
                    data={candles}
                    width={1600}
                    height={860}
                    timeframe={timeframe}
                    smaPeriod={smaPeriod}
                    showEma={showEma}
                    showRsi={showRsi}
                    showMacd={showMacd}
                    drawEnabled={drawEnabled}
                    drawMode={drawTool}
                    drawResetToken={drawResetToken}
                    drawUndoToken={drawUndoToken}
                  />
                </div>
              )}

              {assetTab === "financials" && (
                <div className="asset-detail-layout">
                  <div className="left-column">
                    <div className="card">
                      <h3>Overview</h3>
                      <div className="stat-row"><span>Market Cap</span><strong>1.33T</strong></div>
                      <div className="stat-row"><span>Today's Range</span><strong>{Number.isFinite(low24) ? low24.toFixed(2) : "—"} - {Number.isFinite(high24) ? high24.toFixed(2) : "—"}</strong></div>
                      <div className="stat-row"><span>52W Proxy Range</span><strong>{Number.isFinite(low24) ? (low24 * 0.85).toFixed(2) : "—"} - {Number.isFinite(high24) ? (high24 * 1.1).toFixed(2) : "—"}</strong></div>
                      <div className="stat-row"><span>Volume (24H proxy)</span><strong>{Number.isFinite(volume24) ? volume24.toLocaleString() : "—"}</strong></div>
                    </div>
                    <div className="card">
                      <h3>Financial Summary</h3>
                      <p className="muted-block">This panel mirrors a finance tab layout with key market and derived statistics while live candles keep calculations aligned to current data.</p>
                    </div>
                  </div>
                  <div className="right-column">
                    <div className="card">
                      <h3>Derived Metrics</h3>
                      <div className="stat-row"><span>Close vs Prev Close</span><strong className={Number.isFinite(priceChangePct) && priceChangePct < 0 ? "negative" : "positive"}>{Number.isFinite(priceChangePct) ? `${priceChangePct > 0 ? "+" : ""}${priceChangePct.toFixed(2)}%` : "—"}</strong></div>
                      <div className="stat-row"><span>Average Close (24)</span><strong>{Number.isFinite(average24) ? average24.toFixed(2) : "—"}</strong></div>
                      <div className="stat-row"><span>SMA Period</span><strong>{smaPeriod}</strong></div>
                      <div className="stat-row"><span>Candles Loaded</span><strong>{candles.length}</strong></div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
