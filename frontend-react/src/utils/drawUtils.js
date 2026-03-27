export function clearCanvas(ctx, width, height, background = "#0e1117") {
  ctx.save();
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function drawGrid(ctx, width, height, padding, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  const rows = 5;
  const cols = 8;
  for (let i = 0; i <= rows; i += 1) {
    const y = padding.top + ((height - padding.top - padding.bottom) / rows) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }
  for (let i = 0; i <= cols; i += 1) {
    const x = padding.left + ((width - padding.left - padding.right) / cols) * i;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, height - padding.bottom);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawText(ctx, text, x, y, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = "12px Inter, sans-serif";
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawLine(ctx, points, strokeStyle, lineWidth = 1) {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((pt) => ctx.lineTo(pt.x, pt.y));
  ctx.stroke();
  ctx.restore();
}
