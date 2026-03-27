# React Candlestick MVP

This is a standalone React app (Vite) that implements a canvas-based candlestick chart with zoom, pan, crosshair, and SMA per the PRD.

## Run

Start the backend first (from repo root):

```bash
python -m app.main
```

```bash
cd frontend-react
npm install
npm run dev
```

Open the URL printed by Vite (default: `http://localhost:5174`).

## Notes

- The React app fetches assets and prices from the existing backend.
- WebSocket updates use `ws://localhost:8000/ws/price` for live candles.
