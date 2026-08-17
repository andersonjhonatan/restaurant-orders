import hmac
import os
from pathlib import Path
from typing import List, Optional
from urllib.parse import quote

from fastapi import FastAPI, Header, HTTPException, Query, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from src.models.ingredient import Restriction
from src.services.menu_builder import MenuBuilder
from src.services.order_store import OrderStore

RESTAURANT_NAME = "Sabor da Casa"
OWNER_NAME = "Vanuza"
WHATSAPP = "87 98839-5085"
WHATSAPP_URL = "https://wa.me/5587988395085"
SLOGAN = "Da minha cozinha para sua família"
BASE_DIR = Path(__file__).resolve().parents[1]
LOGO_PATH = BASE_DIR / "assets" / "logo-sabor-da-casa.svg"
FRONTEND_DIR = BASE_DIR / "frontend"
ORDERS_PATH = BASE_DIR / "data" / "orders.json"
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "vanuza-demo")


class OrderItemInput(BaseModel):
    dish_name: str
    quantity: int = Field(default=1, ge=1, le=20)


class OrderInput(BaseModel):
    customer_name: str
    phone: str
    delivery_method: str = "Entrega"
    address: str = ""
    payment_method: str = "Pix"
    notes: str = ""
    items: List[OrderItemInput]


class StatusInput(BaseModel):
    status: str


app = FastAPI(
    title=RESTAURANT_NAME,
    description=(
        "Sistema de cardápio e pedidos do Sabor da Casa, administrado por Vanuza."
    ),
    version="2.0.0",
    contact={"name": OWNER_NAME, "url": WHATSAPP_URL},
)
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

menu_builder = MenuBuilder()
order_store = OrderStore(str(ORDERS_PATH))
restriction_options = {k: {"value": k} for k in Restriction._member_names_}


def require_admin(x_admin_token: Optional[str]) -> None:
    if not x_admin_token or not hmac.compare_digest(x_admin_token, ADMIN_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token administrativo inválido.",
        )


def build_whatsapp_message(order: dict) -> str:
    lines = [
        f"Olá, Vanuza! Quero confirmar o pedido #{order['id']} do Sabor da Casa.",
        "",
        f"Cliente: {order['customer_name']}",
        f"Telefone: {order['phone']}",
        f"Recebimento: {order['delivery_method']}",
    ]

    if order.get("address"):
        lines.append(f"Endereço: {order['address']}")

    lines.extend(["", "Itens:"])
    for item in order["items"]:
        lines.append(
            f"- {item['quantity']}x {item['dish_name']} "
            f"(R$ {item['subtotal']:.2f})"
        )

    lines.extend(
        [
            "",
            f"Total: R$ {order['total']:.2f}",
            f"Pagamento: {order['payment_method']}",
        ]
    )

    if order.get("notes"):
        lines.append(f"Observação: {order['notes']}")

    return "\n".join(lines)


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/admin", include_in_schema=False)
def admin_page():
    return FileResponse(FRONTEND_DIR / "admin.html")


@app.get("/brand/logo", include_in_schema=False)
def get_restaurant_logo():
    return FileResponse(LOGO_PATH, media_type="image/svg+xml")


@app.get("/info", tags=["restaurante"])
@app.get("/api/info", tags=["restaurante"])
def get_restaurant_info():
    return {
        "name": RESTAURANT_NAME,
        "owner": OWNER_NAME,
        "slogan": SLOGAN,
        "whatsapp": WHATSAPP,
        "whatsapp_url": WHATSAPP_URL,
        "logo": "/brand/logo",
    }


@app.get("/menu", tags=["menu"])
@app.get("/api/menu", tags=["menu"])
def get_menu(
    restriction: str = Query(default="", examples=restriction_options)
):
    return menu_builder.get_main_menu(
        restriction=Restriction._member_map_.get(restriction)
    )


@app.post("/order", tags=["compatibilidade"], status_code=status.HTTP_201_CREATED)
def make_dish_order(dish_name: str):
    """Mantém compatibilidade com o endpoint original do projeto."""
    try:
        menu_builder.make_order(dish_name)
    except ValueError as err:
        if str(err) == "Dish does not exist":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(err),
            )
        raise HTTPException(
            status_code=status.HTTP_406_NOT_ACCEPTABLE,
            detail="O prato não pode ser preparado por falta de ingredientes.",
        )

    return {"message": "Pedido registrado", "dish_name": dish_name}


@app.post("/api/orders", tags=["pedidos"], status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderInput):
    customer_name = payload.customer_name.strip()
    phone = payload.phone.strip()
    delivery_method = payload.delivery_method.strip()
    address = payload.address.strip()
    payment_method = payload.payment_method.strip()
    notes = payload.notes.strip()

    if len(customer_name) < 2:
        raise HTTPException(status_code=422, detail="Informe seu nome.")
    if len(phone) < 8:
        raise HTTPException(status_code=422, detail="Informe um telefone válido.")
    if delivery_method not in {"Entrega", "Retirada"}:
        raise HTTPException(status_code=422, detail="Forma de recebimento inválida.")
    if delivery_method == "Entrega" and len(address) < 4:
        raise HTTPException(status_code=422, detail="Informe o endereço de entrega.")
    if not payload.items:
        raise HTTPException(status_code=422, detail="Adicione ao menos um prato.")

    available_menu = {
        item["dish_name"]: item for item in menu_builder.get_main_menu()
    }
    normalized_items = []
    total = 0.0

    for requested in payload.items:
        dish = available_menu.get(requested.dish_name)
        if dish is None:
            raise HTTPException(
                status_code=409,
                detail=f"O prato '{requested.dish_name}' não está disponível no momento.",
            )

        unit_price = float(dish["price"])
        subtotal = round(unit_price * requested.quantity, 2)
        total += subtotal
        normalized_items.append(
            {
                "dish_name": dish["dish_name"],
                "quantity": requested.quantity,
                "unit_price": unit_price,
                "subtotal": subtotal,
            }
        )

    order = order_store.create_order(
        {
            "customer_name": customer_name,
            "phone": phone,
            "delivery_method": delivery_method,
            "address": address if delivery_method == "Entrega" else "",
            "payment_method": payment_method,
            "notes": notes[:240],
            "items": normalized_items,
            "total": round(total, 2),
        }
    )

    message = build_whatsapp_message(order)
    return {
        "order": order,
        "whatsapp_url": f"{WHATSAPP_URL}?text={quote(message)}",
    }


@app.get("/api/orders", tags=["admin"])
def list_orders(x_admin_token: Optional[str] = Header(default=None)):
    require_admin(x_admin_token)
    return order_store.list_orders()


@app.patch("/api/orders/{order_id}/status", tags=["admin"])
def update_order_status(
    order_id: int,
    payload: StatusInput,
    x_admin_token: Optional[str] = Header(default=None),
):
    require_admin(x_admin_token)

    try:
        return order_store.update_status(order_id, payload.status)
    except ValueError:
        raise HTTPException(status_code=422, detail="Status de pedido inválido.")
    except KeyError:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")


@app.get("/health", tags=["infra"])
def health_check():
    return {"status": "ok", "service": RESTAURANT_NAME}
