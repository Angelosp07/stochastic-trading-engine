import { useCallback, useMemo, useState } from "react";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default function useChartState(dataLength, initialWindow = 120) {
  const [visibleCount, setVisibleCount] = useState(initialWindow);
  const [offset, setOffset] = useState(0);

  const maxOffset = Math.max(0, dataLength - visibleCount);

  const window = useMemo(() => {
    const safeOffset = clamp(offset, 0, maxOffset);
    return {
      start: safeOffset,
      end: safeOffset + visibleCount
    };
  }, [offset, visibleCount, maxOffset]);

  const zoom = useCallback(
    (delta) => {
      const nextCount = clamp(visibleCount + delta, 20, Math.max(40, dataLength));
      setVisibleCount(nextCount);
      setOffset((prev) => clamp(prev, 0, Math.max(0, dataLength - nextCount)));
    },
    [dataLength, visibleCount]
  );

  const pan = useCallback(
    (delta) => {
      setOffset((prev) => clamp(prev + delta, 0, maxOffset));
    },
    [maxOffset]
  );

  const setWindowToEnd = useCallback(() => {
    setOffset(Math.max(0, dataLength - visibleCount));
  }, [dataLength, visibleCount]);

  return { window, visibleCount, zoom, pan, setWindowToEnd };
}
