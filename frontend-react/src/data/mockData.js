export function generateMockCandles(count = 200) {
  const candles = [];
  let lastClose = 100;
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i += 1) {
    const timestamp = now - (count - i) * 60;
    const open = lastClose;
    const change = (Math.random() - 0.5) * 2;
    const close = Math.max(10, open + change);
    const high = Math.max(open, close) + Math.random();
    const low = Math.min(open, close) - Math.random();
    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 1000) + 100
    });
    lastClose = close;
  }

  return candles;
}
