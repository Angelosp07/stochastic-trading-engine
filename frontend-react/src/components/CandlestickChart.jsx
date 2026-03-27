import React, { useEffect, useMemo, useRef, useState } from "react";
import useChartState from "../hooks/useChartState.js";
import { clearCanvas, drawGrid, drawLine, drawText } from "../utils/drawUtils.js";
import { computeSma } from "../utils/indicators.js";
import { fromPriceInt } from "../utils/candleUtils.js";

const COLORS = {
  background: "#0e1117",
  grid: "rgba(148, 163, 184, 0.18)",
  bullish: "#26a69a",
  bearish: "#ef5350",
  text: "#e6edf3",
  muted: "#8b949e"
};

const PADDING = { top: 20, right: 40, bottom: 32, left: 60 };

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
  const prices = useMemo(
    () => renderData.flatMap((candle) => [candle.high, candle.low]),
    [renderData]
  );

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  const candleWidth = Math.max(
    4,
    (width - PADDING.left - PADDING.right) / visibleData.length - 2
  );

  const indexToX = (index) =>
    PADDING.left + index * (candleWidth + 2) + candleWidth / 2;

  const priceToY = (price) => {
    const scaled = (price - minPrice) / priceRange;
    return height - PADDING.bottom - scaled * (height - PADDING.top - PADDING.bottom);
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
    drawGrid(ctx, width, height, PADDING, COLORS.grid);

    if (!renderData.length) {
      drawText(ctx, "Waiting for candle data...", PADDING.left, height / 2, COLORS.muted);
      return;
    }

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

    const smaPoints = smaLine.filter((pt) => pt.y !== null);
    drawLine(ctx, smaPoints, "#f59e0b", 1.5);

    if (hoverIndex !== null && renderData[hoverIndex]) {
      const hoverCandle = renderData[hoverIndex];
      ctx.strokeStyle = "rgba(148, 163, 184, 0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hoverPos.x, PADDING.top);
      ctx.lineTo(hoverPos.x, height - PADDING.bottom);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(PADDING.left, hoverPos.y);
      ctx.lineTo(width - PADDING.right, hoverPos.y);
      ctx.stroke();

      drawText(
        ctx,
        `${new Date(hoverCandle.timestamp).toLocaleString()} | O ${formatPrice(
          hoverCandle.open
        )} H ${formatPrice(hoverCandle.high)} L ${formatPrice(hoverCandle.low)} C ${formatPrice(
          hoverCandle.close
        )}`,
        PADDING.left,
        PADDING.top - 6,
        COLORS.text
      );
    }

    drawText(ctx, `${timeframe.toUpperCase()} · ${visibleData.length} candles`, PADDING.left, height - 10, COLORS.muted);
  }, [renderData, hoverIndex, hoverPos, smaLine, timeframe]);

  useEffect(() => {
    setWindowToEnd();
  }, [data.length]);

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
    zoom(event.deltaY > 0 ? 10 : -10);
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
