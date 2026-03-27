import React, { useEffect, useMemo, useState } from "react";
import CandlestickChart from "./components/CandlestickChart.jsx";
import useLiveCandles from "./hooks/useLiveCandles.js";

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
  { key: "dashboard", label: "Dashboard" },
  { key: "markets", label: "Markets" },
  { key: "portfolio", label: "Portfolio" },
  { key: "watchlist", label: "Watchlist" },
  { key: "copy", label: "Copy Traders" },
  { key: "feed", label: "News / Feed" },
  { key: "settings", label: "Settings" }
];

export default function App() {
  const [timeframe, setTimeframe] = useState("5m");
  const [smaPeriod, setSmaPeriod] = useState(20);
  const [assets, setAssets] = useState([]);
  const [assetId, setAssetId] = useState("1");
  const [page, setPage] = useState("dashboard");
  const [watchlist, setWatchlist] = useState(["CMD1", "CMD2"]);
  const [prices, setPrices] = useState({});

  const { candles, status, error } = useLiveCandles({ assetId, timeframe });

  const selectedAsset = useMemo(
    () => assets.find((asset) => String(asset.id) === String(assetId)),
    [assets, assetId]
  );

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
    setPage("asset");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">ST</div>
          <div>
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
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <input className="search" placeholder="Search assets or traders" />
          <div className="top-actions">
            <button className="ghost">Notifications</button>
            <button className="secondary">Deposit</button>
            <button className="primary">Trade</button>
            <div className="profile">A. Angelos</div>
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
              <div className="asset-header">
                <div>
                  <h2>{selectedAsset ? `${selectedAsset.symbol} · ${selectedAsset.name}` : "Asset"}</h2>
                  <p>{prices[selectedAsset?.symbol]?.toFixed(2) || "—"}</p>
                </div>
                <div className="controls">
                  <label>
                    Asset
                    <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                      {assets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.symbol} · {asset.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Timeframe
                    <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                      {timeframes.map((tf) => (
                        <option key={tf.value} value={tf.value}>
                          {tf.label}
                        </option>
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
              </div>

              <div className="card">
                {status === "error" ? (
                  <div className="status">{error}</div>
                ) : (
                  <div className="status">Status: {status}</div>
                )}
                <CandlestickChart
                  data={candles}
                  width={1000}
                  height={520}
                  timeframe={timeframe}
                  smaPeriod={smaPeriod}
                />
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
