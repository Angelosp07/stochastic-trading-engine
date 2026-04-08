import { useCallback, useEffect, useMemo, useState } from "react";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default function useChartState(dataLength, initialWindow = 120) {
  const [visibleCount, setVisibleCount] = useState(initialWindow);
  const [offset, setOffset] = useState(0);
  const [autoFollow, setAutoFollow] = useState(true);

  const safeDataLength = Math.max(0, dataLength);
  const minVisible = safeDataLength > 0 ? Math.min(20, safeDataLength) : 1;
  const maxVisible = Math.max(1, safeDataLength);
  const effectiveVisibleCount = clamp(visibleCount, minVisible, maxVisible);
  const maxOffset = Math.max(0, safeDataLength - effectiveVisibleCount);

  const window = useMemo(() => {
    const safeOffset = clamp(offset, 0, maxOffset);
    return {
      start: safeOffset,
      end: Math.min(safeDataLength, safeOffset + effectiveVisibleCount)
    };
  }, [offset, maxOffset, safeDataLength, effectiveVisibleCount]);

  useEffect(() => {
    setOffset((prev) => clamp(prev, 0, Math.max(0, safeDataLength - effectiveVisibleCount)));
  }, [safeDataLength, effectiveVisibleCount]);

  useEffect(() => {
    if (!autoFollow) return;
    setOffset(Math.max(0, safeDataLength - effectiveVisibleCount));
  }, [autoFollow, safeDataLength, effectiveVisibleCount]);

  const zoom = useCallback(
    (delta, anchorGlobalIndex = null) => {
      const currentCount = effectiveVisibleCount;
      const nextCount = clamp(currentCount + delta, minVisible, maxVisible);
      const maxNextOffset = Math.max(0, safeDataLength - nextCount);

      setVisibleCount(nextCount);
      setOffset((prev) => {
        const prevSafe = clamp(prev, 0, Math.max(0, safeDataLength - currentCount));
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
    [effectiveVisibleCount, maxVisible, minVisible, safeDataLength]
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
    setOffset(Math.max(0, safeDataLength - effectiveVisibleCount));
  }, [safeDataLength, effectiveVisibleCount]);

  return { window, visibleCount: effectiveVisibleCount, zoom, pan, setWindowToEnd };
}
