# Stochastic Trading Backend

A demo trading platform backend that simulates asset prices using stochastic processes (Brownian motion and birth-death processes). It supports user management, order placement and cancellation, an order book, and price streaming via REST API and WebSocket.

This project is intended as a **Fintech hackathon demo**. For simplicity and due to the short timeframe, trades occur against random walks rather than reflecting real demand and supply dynamics.

---

## Features

- **Price simulation engine**
  - Brownian motion (general market noise)
  - Birth-death process (discrete market events)
- **User management**
  - Create users with starting balances
  - Track asset holdings and positions
- **Order management**
  - Place buy and sell orders
  - Cancel orders and refund reserved funds or restore assets
- **Trade execution**
  - Matching engine for buy and sell orders
  - Automatic updates to user balances and asset holdings
- **API**
  - REST endpoints for users, orders, prices, and price history
  - WebSocket for live price streaming
- **Storage**
  - SQLite database for users, orders, positions, and price history

---

## 🗂️ Project Structure

```
stochastic-trading-engine/               
├── app/
│   ├── api/             # API routes
│   │   ├── routes/
│   │   │   ├── positions.py
│   │   │   ├── orders.py
│   │   │   ├── price.py
│   │   │   └── user.py
│   │   └──  websocket.py        
│   │
│   ├── engine/             # Price simulation engine
│   │   ├── processes/
│   │   │   ├── birth_death.py
│   │   │   ├── brownian.py
│   │   │   └── jump.py
│   │   ├── price_engine.py
│   │   └── scheduler.py
│   │
│   ├── storage/            # Repositories and DB clients
│   │   ├── db.py
│   │   ├── position_repository.py
│   │   ├── price_repository.py
│   │   ├── order_repository.py
│   │   └── user_repository.py
│   │
│   ├── config.py
│   ├── main.py
│   └── run.py
│
├── storage/               
├── test/
│   ├── db_tests/            
│   │   ├── price_test.py
│   │   └── user_test.py
│   └── test_ws.html
├── docker-compose.yml
├── Dockerfile
├── postman.json
├── README.md
├── .gitignor
└── requirements.txt
```

---

## 🚀 Docker Set Up


```bash
# Build image
docker build -t price-sim .

# Run container
docker run -p 8000:8000 price-sim
```


Server will run at: `http://localhost:8000`

---

## 🧪 API Endpoints

### Users
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST   | `/users/` | `{ "username": str, "balance": float }` | Create a new user with initial balance |
| GET    | `/users/{user_id}` | None | Retrieve user information including balance |
| POST   | `/users/{user_id}/balance/update` | `{ "delta_balance": float }` | Increment or decrement user balance |
| POST   | `/users/{user_id}/balance/set` | `{ "balance": float }` | Set user balance directly |

### Orders
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST   | `/orders/` | `{ "user_id": int, "asset_id": int, "side": "bid"/"ask", "price": float, "quantity": float }` | Place a buy or sell order |
| GET    | `/orders/{order_id}` | None | Get details of a specific order |
| GET    | `/orders/side/bid` | None | Get all open buy orders |
| GET    | `/orders/side/ask` | None | Get all open sell orders |
| POST   | `/orders/{order_id}/cancel` | None | Cancel an open order and refund funds or restore assets |

### Prices
| Method | Endpoint | Query | Description |
|--------|----------|-------|-------------|
| GET    | `/prices/last/{asset_id}` | `n=int` | Get last `n` price points for an asset |
| GET    | `/prices/all/{asset_id}` | None | Get all historical prices for an asset |

### Positions
| Method | Endpoint | Query | Description |
|--------|----------|-------|-------------|
| GET    | `/positions` | `user_id=int&asset_id=int` | Get a specific asset quantity for a user |
| GET    | `/positions/user/{user_id}` | None | Get all positions for a user |

### WebSocket
| Endpoint | Description |
|----------|-------------|
| `/ws/price` | Stream live prices for one or multiple assets at a configurable interval |
---

## 💾 Database

### SQLite Tables
- `users` → `id`, `username`, `balance`, `created_at`  
- `positions` → `user_id`, `asset_id`, `quantity`  
- `orders` → `id`, `user_id`, `asset_id`, `side`, `price`, `quantity`, `status`, `timestamp`  
- `price_history` → `id`, `asset_id`, `price`, `timestamp`  
- `assets` → `id`, `symbol`, `name`

---

## 📝 Postman Collection

Import the `Trading Engine API` collection (JSON file) into Postman for testing all endpoints.  


---

## 🔧 Notes

- The backend is **development** stage

