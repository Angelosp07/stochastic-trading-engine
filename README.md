# Stochastic Trading Backend

A demo trading platform backend that simulates asset prices using stochastic processes (Brownian motion and birth-death processes). Supports user management, order placement/cancellation, order book, and price streaming through REST API and WebSocket.

This project is intended as a **working demo** and can be extended to a full trading platform.

---

## Features

- **Price simulation engine**
  - Composed of:
    - Brownian motion (general noise)
    - Birth-death process (market events)
- **User management**
  - Create users with balances
  - Track asset holdings
- **Order management**
  - Place buy/sell orders
  - Cancel orders and release reserved funds/assets
  - Redis-based order book
- **Trade execution**
  - Matching engine for buy/sell orders
  - Automatic fund/asset updates
- **API**
  - REST endpoints for users, orders, price, and history
  - WebSocket for live price streaming
- **Persistent storage**
  - SQLite for users, orders, positions, price history
  - Redis for live order book

---

## 🗂️ Project Structure

```
stochastic-trading-engine/               
├── app/
│   ├── api/routes/         # FastAPI endpoints
│   │   ├── history.py
│   │   ├── orders.py
│   │   ├── price.py
│   │   └── user.py
│   └── websocket.py        # WebSocket handler
│
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
│   │   ├── redis_client.py
│   │   └── user_repository.py
│   │
│   ├── config.py
│   ├── main.py
│   └── run.py
│
├── storage/               
├── test/
│   └── test_ws.html
├── docker-compose.yml
├── Dockerfile
├── postman.json
├── README.md
├── .gitignor
└── requirements.txt
```

---

## ⚡ Requirements

```text
fastapi==0.135.1
uvicorn[standard]==0.42.0
redis==5.3.0
```

---

## 🚀 Running the Backend

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Start Redis

```bash
docker run --name trading-redis -p 6379:6379 -d redis
```

### 3. Run FastAPI server

```bash
uvicorn app.main:app --reload
```

Server will run at: `http://localhost:8000`

---

## 🧪 API Endpoints

### Users
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST   | `/users` | `{ "username": str, "balance": float }` | Create a new user |

### Orders
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST   | `/order` | `{ "side": "bid"/"ask", "price": float, "quantity": float, "user_id": int }` | Place buy/sell order |
| POST   | `/order/cancel/{order_id}` | None | Cancel order and release funds/assets |

### Prices
| Method | Endpoint | Query | Description |
|--------|----------|-------|-------------|
| GET    | `/price` | None | Get current simulated price |
| GET    | `/history` | `n=50` | Get last `n` price points |

### WebSocket
| Endpoint | Description |
|----------|-------------|
| `/ws/price` | Streams live prices every 0.1s |

---

## 💾 Database

### SQLite
- `users` → `id`, `username`, `balance`
- `positions` → `user_id`, `quantity`
- `orders` → `id`, `user_id`, `side`, `price`, `quantity`, `status`
- `price_history` → timestamped price data

### Redis
- `order_book:bid` → list of bid orders
- `order_book:ask` → list of ask orders

---

## 📝 Postman Collection

Import the `Trading Backend Full API` collection (JSON file) into Postman for testing all endpoints.  
Supports folders for Users, Orders, and Prices.

---

## 🔧 Notes

- Orders automatically **reserve funds/assets**.
- Cancelled orders release reservations.
- The backend is **demo-ready**, can be extended with:
  - Matching engine with partial fills
  - Multiple assets
  - Authentication / JWT
  - Frontend integration

---

## 👨‍💻 Author

Demo project by [Your Name].  
Designed as a learning project for stochastic price simulation, trading mechanics, and backend architecture.

