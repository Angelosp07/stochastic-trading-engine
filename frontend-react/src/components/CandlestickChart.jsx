import React, { useEffect, useMemo, useRef, useState } from "react";
import useChartState from "../hooks/useChartState.js";
import { clearCanvas, drawGrid, drawLine, drawText } from "../utils/drawUtils.js";
import { computeSma } from "../utils/indicators.js";
import { fromPriceInt } from "../utils/candleUtils.js";

const COLORS = {
  background: "#0b1222",
  grid: "rgba(72, 93, 133, 0.25)",
  bullish: "#00d3b8",
  bearish: "#ff4b6e",
  text: "#e9efff",
  muted: "#8292b3",
  panel: "#111a2e"
};

const PADDING = { top: 20, right: 40, bottom: 32, left: 60 };
const ZOOM_STEP = 4;

const formatPrice = (value) => value.toFixed(2);

export default function CandlestickChart({ data, width, height, timeframe, smaPeriod }) {
  const canvasRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [lastX, setLastX] = useState(0);

  const { window, zoom, pan, setWindowToEnd } = useChartState(data.length, 120);

  const visibleData = useMemo(() => data.slice(window.start, window.end), [data, window]);
  const renderData = useMemo(
    () =>
      visibleData.map((candle) => ({
        ...candle,
        open: fromPriceInt(candle.open),
        high: fromPriceInt(candle.high),
        low: fromPriceInt(candle.low),
        close: fromPriceInt(candle.close)
      })),
    [visibleData]
  );

  // --- Price/volume axis calculations ---
  const prices = useMemo(
    () => renderData.flatMap((candle) => [candle.high, candle.low]),
    [renderData]
  );
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 1;
  const priceRange = Math.max(maxPrice - minPrice, Number.EPSILON);

  const volumes = useMemo(() => renderData.map((c) => c.volume ?? 0), [renderData]);
  const maxVolume = Math.max(...volumes, 1);

  const chartTop = PADDING.top;
  const chartHeight = height - PADDING.top - PADDING.bottom - 60;
  const volumeHeight = 60;

  const candleWidth = Math.max(
    4,
    (width - PADDING.left - PADDING.right) / renderData.length - 2
  );

  const indexToX = (index) =>
    PADDING.left + index * (candleWidth + 2) + candleWidth / 2;

  const priceToY = (price) => {
    const scaled = (price - minPrice) / priceRange;
    const y = chartTop + chartHeight - scaled * chartHeight;
    return Math.min(chartTop + chartHeight, Math.max(chartTop, y));
  };

  const volumeToY = (vol) => {
    const scaled = vol / maxVolume;
    return height - PADDING.bottom - scaled * volumeHeight;
  };

  const smaLine = useMemo(() => {
    const closes = renderData.map((candle) => candle.close);
    const sma = computeSma(closes, smaPeriod);
    return sma.map((value, idx) => ({
      x: indexToX(idx),
      y: value ? priceToY(value) : null
    }));
  }, [renderData, smaPeriod]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clearCanvas(ctx, width, height, COLORS.background);

    // Draw grid
    drawGrid(ctx, width, height - volumeHeight, PADDING, COLORS.grid);

    // Draw price axis labels
    ctx.save();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px Inter, sans-serif";
    for (let i = 0; i <= 5; i++) {
      const price = minPrice + (priceRange * (5 - i)) / 5;
      const y = priceToY(price);
      ctx.fillText(formatPrice(price), width - PADDING.right + 8, y + 4);
    }
    ctx.restore();

    // Draw time axis labels
    ctx.save();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px Inter, sans-serif";
    const labelStep = Math.max(1, Math.floor(renderData.length / 8));
    for (let i = 0; i < renderData.length; i += labelStep) {
      const candle = renderData[i];
      const x = indexToX(i);
      const date = new Date(candle.timestamp);
      const label = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      ctx.fillText(label, x - 18, height - PADDING.bottom + 16);
    }
    ctx.restore();

    if (!renderData.length) {
      drawText(ctx, "Waiting for candle data...", PADDING.left, height / 2, COLORS.muted);
      return;
    }

    // Draw volume bars
    renderData.forEach((candle, idx) => {
      const x = indexToX(idx);
      const y = volumeToY(candle.volume ?? 0);
      const color = candle.close >= candle.open ? COLORS.bullish : COLORS.bearish;
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = color;
      ctx.fillRect(
        x - candleWidth / 2,
        y,
        candleWidth,
        height - PADDING.bottom - y
      );
      ctx.restore();
    });

    // Draw candles
    renderData.forEach((candle, idx) => {
      const x = indexToX(idx);
      const openY = priceToY(candle.open);
      const closeY = priceToY(candle.close);
      const highY = priceToY(candle.high);
      const lowY = priceToY(candle.low);
      const color = candle.close >= candle.open ? COLORS.bullish : COLORS.bearish;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      ctx.fillStyle = color;
      const bodyHeight = Math.max(2, Math.abs(openY - closeY));
      const bodyTop = Math.min(openY, closeY);
      ctx.fillRect(
        x - candleWidth / 2,
        bodyTop,
        candleWidth,
        bodyHeight
      );
    });

    // Draw SMA
    const smaPoints = smaLine.filter((pt) => pt.y !== null);
    drawLine(ctx, smaPoints, "#f59e0b", 1.5);

    // Draw crosshair and tooltip
    if (hoverIndex !== null && renderData[hoverIndex]) {
      const hoverCandle = renderData[hoverIndex];
      ctx.strokeStyle = "rgba(140, 160, 196, 0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(indexToX(hoverIndex), PADDING.top);
      ctx.lineTo(indexToX(hoverIndex), height - PADDING.bottom);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(PADDING.left, priceToY(hoverCandle.close));
      ctx.lineTo(width - PADDING.right, priceToY(hoverCandle.close));
      ctx.stroke();

      // Tooltip
      const tooltip = `${new Date(hoverCandle.timestamp).toLocaleString()} | O ${formatPrice(
        hoverCandle.open
      )} H ${formatPrice(hoverCandle.high)} L ${formatPrice(hoverCandle.low)} C ${formatPrice(
        hoverCandle.close
      )} V ${hoverCandle.volume ?? 0}`;
      ctx.save();
      ctx.font = "13px Inter, sans-serif";
      ctx.fillStyle = COLORS.panel;
      ctx.globalAlpha = 0.95;
      const tw = ctx.measureText(tooltip).width + 16;
      ctx.fillRect(20, 20, tw, 28);
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.text;
      ctx.fillText(tooltip, 28, 40);
      ctx.restore();
    }

    drawText(ctx, `${timeframe.toUpperCase()} · ${renderData.length} candles`, PADDING.left, height - 10, COLORS.muted);
  }, [renderData, hoverIndex, hoverPos, smaLine, timeframe, width, height]);

  useEffect(() => {
    setWindowToEnd();
  }, [timeframe]);

  const handleMouseMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setHoverPos({ x, y });

    const index = Math.floor((x - PADDING.left) / (candleWidth + 2));
    if (index >= 0 && index < visibleData.length) {
      setHoverIndex(index);
    } else {
      setHoverIndex(null);
    }

    if (dragging) {
      const delta = x - lastX;
      const candlesShift = Math.round(-delta / (candleWidth + 2));
      if (candlesShift !== 0) {
        pan(candlesShift);
        setLastX(x);
      }
    }
  };

  const handleWheel = (event) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const localIndex = Math.floor((x - PADDING.left) / (candleWidth + 2));
    const inRange = localIndex >= 0 && localIndex < visibleData.length;
    const anchorGlobalIndex = inRange
      ? window.start + localIndex
      : window.start + Math.floor(visibleData.length / 2);
    zoom(event.deltaY > 0 ? ZOOM_STEP : -ZOOM_STEP, anchorGlobalIndex);
  };

  const handleMouseDown = (event) => {
    setDragging(true);
    const rect = event.currentTarget.getBoundingClientRect();
    setLastX(event.clientX - rect.left);
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  const handleMouseLeave = () => {
    setDragging(false);
    setHoverIndex(null);
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
      style={{ width: "100%", height: "auto", display: "block" }}
    />
  );
}
