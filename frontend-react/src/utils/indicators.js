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
