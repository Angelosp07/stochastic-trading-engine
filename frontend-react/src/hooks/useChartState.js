import { useCallback, useEffect, useMemo, useState } from "react";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default function useChartState(dataLength, initialWindow = 120) {
  const [visibleCount, setVisibleCount] = useState(initialWindow);
  const [offset, setOffset] = useState(0);
  const [autoFollow, setAutoFollow] = useState(true);

  const maxOffset = Math.max(0, dataLength - visibleCount);

  const window = useMemo(() => {
    const safeOffset = clamp(offset, 0, maxOffset);
    return {
      start: safeOffset,
      end: safeOffset + visibleCount
    };
  }, [offset, visibleCount, maxOffset]);

  useEffect(() => {
    if (!autoFollow) return;
    setOffset(Math.max(0, dataLength - visibleCount));
  }, [autoFollow, dataLength, visibleCount]);

  const zoom = useCallback(
    (delta, anchorGlobalIndex = null) => {
      const currentCount = Math.min(visibleCount, Math.max(1, dataLength));
      const nextCount = clamp(currentCount + delta, 20, Math.max(40, dataLength));
      const maxNextOffset = Math.max(0, dataLength - nextCount);

      setVisibleCount(nextCount);
      setOffset((prev) => {
        const prevSafe = clamp(prev, 0, Math.max(0, dataLength - currentCount));
        if (!Number.isFinite(anchorGlobalIndex)) {
          return clamp(prevSafe, 0, maxNextOffset);
        }
        const ratio = currentCount > 0 ? (anchorGlobalIndex - prevSafe) / currentCount : 0.5;
        const safeRatio = clamp(ratio, 0, 1);
        const anchoredOffset = Math.round(anchorGlobalIndex - safeRatio * nextCount);
        return clamp(anchoredOffset, 0, maxNextOffset);
      });
      setAutoFollow(false);
    },
    [dataLength, visibleCount]
  );

  const pan = useCallback(
    (delta) => {
      setOffset((prev) => clamp(prev + delta, 0, maxOffset));
      if (delta !== 0) setAutoFollow(false);
    },
    [maxOffset]
  );

  const setWindowToEnd = useCallback(() => {
    setAutoFollow(true);
    setOffset(Math.max(0, dataLength - visibleCount));
  }, [dataLength, visibleCount]);

  return { window, visibleCount, zoom, pan, setWindowToEnd };
}
