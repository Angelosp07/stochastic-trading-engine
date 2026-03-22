import redis
import os
import json
import uuid  # for generating unique order IDs

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)

ORDER_BOOK_KEY = "order_book"

def add_order(order_type, price, quantity, user_id):
    order_id = str(uuid.uuid4())
    order = {"id": order_id, "price": price, "quantity": quantity, "user_id": user_id}
    r.rpush(f"{ORDER_BOOK_KEY}:{order_type}", json.dumps(order))
    return order_id

def get_orders(order_type):
    orders = r.lrange(f"{ORDER_BOOK_KEY}:{order_type}", 0, -1)
    return [json.loads(o) for o in orders]

def get_order_from_redis(order_id):
    for side in ["bid", "ask"]:
        orders = r.lrange(f"{ORDER_BOOK_KEY}:{side}", 0, -1)
        for o_str in orders:
            o = json.loads(o_str)
            if o["id"] == order_id:
                o["side"] = side  # attach side for convenience
                return o
    return None

def remove_order_from_redis(order_id):
    for side in ["bid", "ask"]:
        orders = r.lrange(f"{ORDER_BOOK_KEY}:{side}", 0, -1)
        for o_str in orders:
            o = json.loads(o_str)
            if o["id"] == order_id:
                r.lrem(f"{ORDER_BOOK_KEY}:{side}", 1, o_str)
                return True
    return False

def clear_order_book():
    r.delete(f"{ORDER_BOOK_KEY}:bid")
    r.delete(f"{ORDER_BOOK_KEY}:ask")

def net_demand():
    bids = get_orders("bid")
    asks = get_orders("ask")
    total_buy = sum(o["quantity"] for o in bids)
    total_sell = sum(o["quantity"] for o in asks)
    return total_buy - total_sell

def print_order_book():
    print("BIDS:")
    for o in get_orders("bid"):
        print(o)
    print("ASKS:")
    for o in get_orders("ask"):
        print(o)