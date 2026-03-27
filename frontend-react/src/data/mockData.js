import { toPriceInt } from "../utils/candleUtils.js";

export function generateMockCandles(count = 200) {
  const candles = [];
  let lastClose = 100;
  const targetCount = Math.max(0, Number.isFinite(count) ? Math.floor(count) : 200);
  const nowMs = Date.now();
  const stepMs = 60_000;

  for (let i = 0; i < targetCount; i += 1) {
    const timestamp = nowMs - (targetCount - 1 - i) * stepMs;
    const open = lastClose;
    const change = (Math.random() - 0.5) * 2;
    const close = Math.max(10, open + change);
    const high = Math.max(open, close) + Math.random();
    const low = Math.min(open, close) - Math.random();
    candles.push({
      timestamp,
      open: toPriceInt(open),
      high: toPriceInt(high),
      low: toPriceInt(low),
      close: toPriceInt(close),
      volume: Math.floor(Math.random() * 1000) + 100,
      isFinal: i !== targetCount - 1
    });
    lastClose = close;
  }

  return candles;
}
