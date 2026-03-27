import { useCallback, useEffect, useRef, useState } from "react";
import {
  aggregateToCandles,
  toPriceInt,
  updateLastCandle
} from "../utils/candleUtils.js";

const timeframeToMs = {
  "5s": 5_000,
  "10s": 10_000,
  "30s": 30_000,
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
  "1M": 2_592_000_000
};

export default function useLiveCandles({ assetId, timeframe }) {
  const [candles, setCandles] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const lastTickRef = useRef(null);

  const bucketMs = timeframeToMs[timeframe] || 300_000;

  const fetchHistory = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(`http://localhost:8000/prices/last/${assetId}?n=800`);
      if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
      const data = await res.json();
      const points = (Array.isArray(data) ? data : [])
        .map((row) => ({
          price: Number(row.price),
          timestamp: new Date(row.timestamp).getTime(),
          size: 0
        }))
        .filter((row) => Number.isFinite(row.price) && Number.isFinite(row.timestamp));
      const aggregated = aggregateToCandles(points, bucketMs);
      setCandles((prev) => {
        if (!prev.length) return aggregated;
        if (!aggregated.length) return prev;
        const prevLast = prev[prev.length - 1];
        const nextLast = aggregated[aggregated.length - 1];

        if (prevLast.timestamp === nextLast.timestamp) {
          const merged = {
            ...nextLast,
            high: Math.max(nextLast.high, prevLast.high),
            low: Math.min(nextLast.low, prevLast.low),
            close: prevLast.close,
            volume: Math.max(nextLast.volume ?? 0, prevLast.volume ?? 0),
            isFinal: false
          };
          return [...aggregated.slice(0, -1), merged];
        }

        if (prevLast.timestamp > nextLast.timestamp) {
          return [...aggregated, prevLast];
        }

        return aggregated;
      });
      setStatus("ready");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }, [assetId, bucketMs]);

  useEffect(() => {
    if (!assetId) return;
    fetchHistory();
  }, [assetId, timeframe, fetchHistory]);

  useEffect(() => {
    if (!assetId) return;
    const wsUrl = `ws://localhost:8000/ws/price?symbol=CMD${assetId}&interval=0.1`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const price = payload.price ?? payload[`CMD${assetId}`];
        if (!Number.isFinite(Number(price))) return;
        if (Number(price) <= 0) return;
        if (!payload.timestamp) return;
        const timestamp = new Date(payload.timestamp).getTime();
        if (!Number.isFinite(timestamp)) return;
        if (lastTickRef.current !== null && timestamp < lastTickRef.current) return;
        lastTickRef.current = timestamp;
        const priceInt = toPriceInt(Number(price));
        if (!Number.isFinite(priceInt)) return;
        console.debug("[stream]", payload.timestamp, `CMD${assetId}`, Number(price));
        setCandles((prev) => updateLastCandle(prev, timestamp, priceInt, bucketMs, 0));
      } catch {
        // ignore
      }
    };

    return () => {
      ws.close();
    };
  }, [assetId, bucketMs]);

  return {
    candles,
    status,
    error,
    refreshHistory: fetchHistory
  };
}
