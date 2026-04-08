import { useCallback, useEffect, useRef, useState } from "react";
import {
  aggregateToCandles,
  toPriceInt,
  updateLastCandle
} from "../utils/candleUtils.js";

const STREAM_INTERVAL_SECONDS = 0.05;
const STALE_THRESHOLD_MS = 3_000;
const RECONNECT_BASE_MS = 250;
const RECONNECT_MAX_MS = 5_000;

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

export default function useLiveCandles({ assetId, timeframe, symbol }) {
  const [candles, setCandles] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [streamState, setStreamState] = useState("idle");
  const [isStale, setIsStale] = useState(false);
  const [lastTickAt, setLastTickAt] = useState(null);
  const wsRef = useRef(null);
  const lastTickRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

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
    if (!assetId || !symbol) return;
    let disposed = false;

    const clearReconnect = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const connect = () => {
      if (disposed) return;

      setStreamState(reconnectAttemptsRef.current === 0 ? "connecting" : "reconnecting");
      const wsUrl = `ws://localhost:8000/ws/price?symbol=${encodeURIComponent(symbol)}&interval=${STREAM_INTERVAL_SECONDS}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setStreamState("live");
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const price = payload.price ?? payload[symbol];
          if (!Number.isFinite(Number(price))) return;
          if (Number(price) <= 0) return;
          if (!payload.timestamp) return;
          const timestamp = new Date(payload.timestamp).getTime();
          if (!Number.isFinite(timestamp)) return;
          if (lastTickRef.current !== null && timestamp < lastTickRef.current) return;

          lastTickRef.current = timestamp;
          setLastTickAt(timestamp);
          setIsStale(false);
          setStreamState("live");

          const priceInt = toPriceInt(Number(price));
          if (!Number.isFinite(priceInt)) return;
          setCandles((prev) => updateLastCandle(prev, timestamp, priceInt, bucketMs, 0));
        } catch {
          // ignore malformed payloads
        }
      };

      ws.onerror = () => {
        setStreamState("error");
      };

      ws.onclose = () => {
        if (disposed) return;
        reconnectAttemptsRef.current += 1;
        const delay = Math.min(
          RECONNECT_BASE_MS * 2 ** reconnectAttemptsRef.current,
          RECONNECT_MAX_MS
        );
        setStreamState("reconnecting");
        clearReconnect();
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      clearReconnect();
      if (wsRef.current) {
        wsRef.current.close();
      }
      setStreamState("idle");
    };
  }, [assetId, bucketMs, symbol]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!lastTickRef.current) return;
      const stale = Date.now() - lastTickRef.current > STALE_THRESHOLD_MS;
      setIsStale(stale);
      if (stale && (streamState === "live" || streamState === "reconnecting")) {
        setStreamState("stale");
      }
    }, 750);
    return () => clearInterval(timer);
  }, [streamState]);

  return {
    candles,
    status,
    error,
    refreshHistory: fetchHistory,
    streamState,
    isStale,
    lastTickAt,
    streamIntervalSeconds: STREAM_INTERVAL_SECONDS
  };
}
