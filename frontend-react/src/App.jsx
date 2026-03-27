import React, { useEffect, useMemo, useState } from "react";
import CandlestickChart from "./components/CandlestickChart.jsx";
import useLiveCandles from "./hooks/useLiveCandles.js";
import { fromPriceInt } from "./utils/candleUtils.js";

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

export default function App() {
  const [timeframe, setTimeframe] = useState("5m");
  const [smaPeriod, setSmaPeriod] = useState(20);
  const [assets, setAssets] = useState([]);
  const [assetId, setAssetId] = useState("1");
  const [page, setPage] = useState("dashboard");
  const [assetTab, setAssetTab] = useState("overview");
  const [watchlist, setWatchlist] = useState(["CMD1", "CMD2"]);
  const [prices, setPrices] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState("");

  const { candles, status, error, refreshHistory } = useLiveCandles({ assetId, timeframe });

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

  useEffect(() => {
    const loadAssets = async () => {
      try {
        const res = await fetch("http://localhost:8000/assets/");
        if (!res.ok) throw new Error(`Failed to load assets (${res.status})`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setAssets(list);
        if (list.length) {
          setAssetId(String(list[0].id));
        }
      } catch (err) {
        setAssets([]);
      }
    };
    loadAssets();
  }, []);

  useEffect(() => {
    if (!assets.length) return;
    const fetchLatest = async () => {
      const updates = {};
      await Promise.all(
        assets.map(async (asset) => {
          const res = await fetch(`http://localhost:8000/prices/last/${asset.id}?n=1`);
          if (!res.ok) return;
          const data = await res.json();
          if (Array.isArray(data) && data.length) {
            updates[asset.symbol] = Number(data[0].price);
          }
        })
      );
      setPrices(updates);
    };
    fetchLatest();
    const interval = setInterval(fetchLatest, 1000);
    return () => clearInterval(interval);
  }, [assets]);

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
      const res = await fetch(`http://localhost:8000/prices/generate/${assetId}`, {
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
          clear_existing: true
        })
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || `Generation failed (${res.status})`);
      }
      const out = await res.json();
      await refreshHistory();
      setGenerateMessage(`Generated ${out.generated?.toLocaleString?.() || out.generated} points.`);
      setAssetTab("chart");
    } catch (err) {
      setGenerateMessage(err.message || "Failed to generate demo history.");
    } finally {
      setIsGenerating(false);
    }
  };

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
          <div className="topbar-left">Stochastic Candlestick MVP</div>
          <input className="search" placeholder="Search" />
          <div className="top-actions">
            <button className="ghost">✦</button>
            <button className="ghost">🔔</button>
            <button className="primary">Trade</button>
            <div className="profile">⋮</div>
          </div>
        </header>

        <main className="content">
          {page === "dashboard" && (
            <section className="page">
              <h2>Dashboard</h2>
              <div className="grid-3">
                <div className="card">
                  <h3>Portfolio Summary</h3>
                  <div className="stat-row">
                    <span>Total Balance</span>
                    <strong>$120,450</strong>
                  </div>
                  <div className="stat-row">
                    <span>Daily P/L</span>
                    <strong className="positive">+$1,420</strong>
                  </div>
                  <div className="stat-row">
                    <span>Total Return</span>
                    <strong className="positive">+12.4%</strong>
                  </div>
                </div>
                <div className="card">
                  <h3>Market Movers</h3>
                  <div className="table">
                    {assets.slice(0, 4).map((asset) => (
                      <div key={asset.id} className="cell">
                        <span>{asset.symbol}</span>
                        <strong>{prices[asset.symbol]?.toFixed(2) || "—"}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card">
                  <h3>Social Feed Preview</h3>
                  <div className="feed-item">@lucas · “Tech rally continues.”</div>
                  <div className="feed-item">@hana · “Crypto momentum is strong.”</div>
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
                <div className="pill-list">
                  {watchlist.map((symbol) => (
                    <span key={symbol} className="pill">{symbol}</span>
                  ))}
                </div>
              </div>
            </section>
          )}

          {page === "portfolio" && (
            <section className="page">
              <h2>Portfolio</h2>
              <div className="card">
                <p>Portfolio analytics will appear here.</p>
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
                  <button className="secondary demo-btn" onClick={handleGenerateDemoHistory} disabled={isGenerating}>
                    {isGenerating ? "Generating..." : "Generate Demo History"}
                  </button>
                  <button className="primary">Trade</button>
                </div>
              </div>

              {generateMessage ? <div className="status demo-status">{generateMessage}</div> : null}

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
                      <div className="pill-list">
                        <span className="pill">-10%</span>
                        <span className="pill">-5%</span>
                        <span className="pill">+5%</span>
                        <span className="pill">+10%</span>
                        <span className="pill">Custom</span>
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
                    </div>
                    <div className="chart-tools-icons">
                      <button className="ghost">✎</button>
                      <button className="ghost">⌖</button>
                      <button className="ghost">📈</button>
                      <button className="ghost">⚙</button>
                    </div>
                  </div>
                  {status === "error" ? (
                    <div className="status">{error}</div>
                  ) : (
                    <div className="status">Status: {status}</div>
                  )}
                  <CandlestickChart
                    data={candles}
                    width={1600}
                    height={860}
                    timeframe={timeframe}
                    smaPeriod={smaPeriod}
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
