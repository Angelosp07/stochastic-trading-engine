# PRD: Ticker Detail Tabs (`Overview` / `Chart` / `Financials`)

## Goal

When a user clicks any ticker from `Markets List` or `Assets Table`, open a ticker detail page that mirrors a modern broker flow with three tabs:

- `Overview`
- `Chart`
- `Financials`

## Entry Behavior

- Trigger: click ticker row/button in markets views.
- Actions:
  1. Set selected asset (`assetId`)
  2. Set page to `asset`
  3. Reset tab to `overview`

## Tab Behavior

### 1) Overview

Purpose: fast decision snapshot.

Displays:

- Last price
- Change % vs previous close candle
- 24-candle high/low range
- 24-candle volume
- Symbol/name/timeframe/data point count

Data source:

- `candles` stream + history (`useLiveCandles`)
- fallback header price from latest `/prices/last` polling

### 2) Chart

Purpose: full technical charting workflow.

Displays:

- Existing controls (`Asset`, `Timeframe`, `SMA`)
- Live chart status (`ready/error/loading`)
- `CandlestickChart` component

Interaction:

- Zoom, pan, crosshair, volume bars, SMA, hover tooltip
- Live candle updates in-place until interval rollover

### 3) Financials

Purpose: derived quantitative card view.

Displays:

- Average close (24)
- High/low (24)
- Volume (24)
- Close vs previous close %
- Stream status
- SMA period
- Candle count

## UX Requirements

- Keep dark visual language consistent with app.
- Tabs are pill-like with active highlight.
- Positive metrics use green, negative metrics use red.
- Tab switch should be instant and preserve selected asset/timeframe.

## Technical Notes

- `assetTab` state controls tab rendering.
- Metrics are computed via `useMemo` for performance.
- Candle values converted from fixed precision ints with `fromPriceInt`.

## Acceptance Criteria

1. Clicking any ticker opens `asset` page and lands on `Overview` tab.
2. Switching tabs changes content without reloading page.
3. `Chart` tab still renders and updates live candlesticks.
4. `Financials` numbers match the currently selected asset/timeframe.
5. Build completes successfully with `npm run build`.
