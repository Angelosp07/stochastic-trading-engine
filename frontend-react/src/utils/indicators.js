export function computeSma(data, period) {
  if (!data.length || period <= 0) return [];
  const result = [];
  for (let i = 0; i < data.length; i += 1) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    const slice = data.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, val) => acc + val, 0);
    result.push(sum / period);
  }
  return result;
}

export function computeEma(data, period) {
  if (!data.length || period <= 0) return [];
  const result = [];
  const alpha = 2 / (period + 1);
  let prev = null;
  for (let index = 0; index < data.length; index += 1) {
    const value = data[index];
    if (!Number.isFinite(value)) {
      result.push(null);
      continue;
    }
    if (prev === null) {
      prev = value;
    } else {
      prev = (value * alpha) + (prev * (1 - alpha));
    }
    result.push(prev);
  }
  return result;
}

export function computeRsi(data, period = 14) {
  if (!data.length || period <= 1) return [];
  const result = new Array(data.length).fill(null);
  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period && index < data.length; index += 1) {
    const diff = data[index] - data[index - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  if (data.length <= period) return result;

  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

  for (let index = period + 1; index < data.length; index += 1) {
    const diff = data[index] - data[index - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    result[index] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
  }

  return result;
}

export function computeMacd(data, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = computeEma(data, fast);
  const emaSlow = computeEma(data, slow);
  const macdLine = data.map((_, index) => {
    const fastValue = emaFast[index];
    const slowValue = emaSlow[index];
    if (!Number.isFinite(fastValue) || !Number.isFinite(slowValue)) return null;
    return fastValue - slowValue;
  });

  const compactMacd = macdLine.map((value) => (value === null ? 0 : value));
  const signalLine = computeEma(compactMacd, signalPeriod).map((value, index) => (
    macdLine[index] === null ? null : value
  ));

  const histogram = macdLine.map((value, index) => {
    if (value === null || signalLine[index] === null) return null;
    return value - signalLine[index];
  });

  return { macdLine, signalLine, histogram };
}
