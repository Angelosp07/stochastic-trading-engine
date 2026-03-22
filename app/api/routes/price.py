from fastapi import APIRouter, Request

router = APIRouter()

@router.get("/price")
def get_price(request: Request):
    engine = request.app.state.engine
    return {"price": engine.price}