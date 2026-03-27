export const PRICE_SCALE = 10_000;

export function toPriceInt(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * PRICE_SCALE);
}

export function fromPriceInt(value) {
  if (!Number.isFinite(value)) return null;
  return value / PRICE_SCALE;
}

export function aggregateToCandles(points, bucketMs) {
  if (!points.length) return [];
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
  const candles = [];
  let bucketStart = Math.floor(sorted[0].timestamp / bucketMs) * bucketMs;
  let bucket = [];
  let lastClose = null;

  const pushSynthetic = (startTime, close) => {
    candles.push({
      timestamp: startTime,
      open: close,
      high: close,
      low: close,
      close,
      volume: 0,
      isFinal: true
    });
  };

  const flush = () => {
    if (!bucket.length) return;
    const open = bucket[0].priceInt;
    const close = bucket[bucket.length - 1].priceInt;
    const high = Math.max(...bucket.map((p) => p.priceInt));
    const low = Math.min(...bucket.map((p) => p.priceInt));
    const volume = bucket.reduce((sum, p) => sum + (p.size ?? 0), 0);
    candles.push({
      timestamp: bucketStart,
      open,
      high,
      low,
      close,
      volume,
      isFinal: true
    });
    lastClose = close;
  };

  sorted.forEach((point) => {
    const tsBucket = Math.floor(point.timestamp / bucketMs) * bucketMs;
    if (tsBucket !== bucketStart) {
      flush();
      if (lastClose !== null) {
        for (let gap = bucketStart + bucketMs; gap < tsBucket; gap += bucketMs) {
          pushSynthetic(gap, lastClose);
        }
      }
      bucketStart = tsBucket;
      bucket = [];
    }
    const priceInt = point.priceInt ?? toPriceInt(point.price);
    if (!Number.isFinite(priceInt)) return;
    if (priceInt <= 0) return;
    bucket.push({
      timestamp: point.timestamp,
      priceInt,
      size: point.size ?? 0
    });
  });

  flush();
  if (candles.length) {
    candles[candles.length - 1] = {
      ...candles[candles.length - 1],
      isFinal: false
    };
  }
  return candles;
}

export function updateLastCandle(candles, timestamp, priceInt, bucketMs, size = 0) {
  if (!candles.length) {
    return [
      {
        timestamp: Math.floor(timestamp / bucketMs) * bucketMs,
        open: priceInt,
        high: priceInt,
        low: priceInt,
        close: priceInt,
        volume: size,
        isFinal: false
      }
    ];
  }

  const last = candles[candles.length - 1];
  const bucketStart = Math.floor(timestamp / bucketMs) * bucketMs;
  if (bucketStart === last.timestamp) {
    const updated = {
      ...last,
      high: Math.max(last.high, priceInt),
      low: Math.min(last.low, priceInt),
      close: priceInt,
      volume: (last.volume ?? 0) + (size ?? 0),
      isFinal: false
    };
    return [...candles.slice(0, -1), updated];
  }

  const finalized = { ...last, isFinal: true };
  const next = {
    timestamp: bucketStart,
    open: priceInt,
    high: priceInt,
    low: priceInt,
    close: priceInt,
    volume: size,
    isFinal: false
  };
  return [...candles.slice(0, -1), finalized, next];
}
