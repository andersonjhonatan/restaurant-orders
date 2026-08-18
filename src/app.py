import base64
import hmac
import os
import re
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import List, Optional
from urllib.parse import quote

from fastapi import FastAPI, Header, HTTPException, Query, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel, Field

from src.models.ingredient import Restriction
from src.services.menu_builder import MenuBuilder
from src.services.order_store import OrderStore

RESTAURANT_NAME = "Sabor da Casa"
OWNER_NAME = "Vanuza"
WHATSAPP = "87 98839-5085"
WHATSAPP_URL = "https://wa.me/5587988395085"
SLOGAN = "Da minha cozinha para sua família"
PICKUP_ADDRESS = "Rua Joaquim Deodato, 276"
PICKUP_REFERENCE = "Vizinho à casa de Deca Cabeleireiro"
LOGO_URL = "https://raw.githubusercontent.com/andersonjhonatan/restaurant-orders/main/assets/logo-sabor-da-casa.svg"
BASE_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = BASE_DIR / "frontend"
ORDERS_PATH = BASE_DIR / "data" / "orders.json"
LOGO_PARTS_DIR = BASE_DIR / "assets" / "logo_parts"
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN")
BRAND_CACHE_VERSION = "logo-vanuza-23"


class OrderItemInput(BaseModel):
    dish_name: str
    quantity: int = Field(default=1, ge=1, le=20)
    option: Optional[str] = None


class OrderInput(BaseModel):
    customer_name: str
    phone: str
    delivery_method: str = "Retirada"
    address: str = ""
    payment_method: str = "Pix"
    notes: str = ""
    requested_date: str = ""
    requested_time: str = ""
    items: List[OrderItemInput]


class StatusInput(BaseModel):
    status: str


app = FastAPI(
    title=RESTAURANT_NAME,
    description=(
        "Sistema de cardápio do dia, encomendas e pedidos do Sabor da Casa, administrado por Vanuza."
    ),
    version="2.5.0",
    contact={"name": OWNER_NAME, "url": WHATSAPP_URL},
)
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

menu_builder = MenuBuilder()
order_store = OrderStore(str(ORDERS_PATH))
restriction_options = {k: {"value": k} for k in Restriction._member_names_}


def _raw_brand_logo_bytes() -> bytes:
    encoded = "".join(
        (LOGO_PARTS_DIR / f"new-logo-{index:02d}.txt")
        .read_text(encoding="utf-8")
        .strip()
        for index in range(1, 5)
    )
    return base64.b64decode(encoded)


@lru_cache(maxsize=1)
def _brand_logo_bytes() -> bytes:
    """Remove o fundo preto do arquivo da marca e devolve WebP com alpha."""
    source = _raw_brand_logo_bytes()
    with Image.open(BytesIO(source)) as logo:
        image = logo.convert("RGBA")
        transparent_pixels = []

        for red, green, blue, alpha in image.getdata():
            brightest = max(red, green, blue)
            if brightest <= 32:
                transparent_pixels.append((red, green, blue, 0))
            elif brightest < 52:
                edge_alpha = int(alpha * ((brightest - 32) / 20))
                transparent_pixels.append((red, green, blue, edge_alpha))
            else:
                transparent_pixels.append((red, green, blue, alpha))

        image.putdata(transparent_pixels)
        output = BytesIO()
        image.save(output, format="WEBP", lossless=True, method=4)
        return output.getvalue()


def _page_with_transparent_brand(filename: str) -> HTMLResponse:
    html = (FRONTEND_DIR / filename).read_text(encoding="utf-8")
    brand_override = f"""
    <style id="transparent-brand-fix">
      .header-brand-placeholder,
      .footer-brand::before,
      .admin-header .brand::before,
      .admin-login::before {{
        background-image: url('/brand/logo?v={BRAND_CACHE_VERSION}') !important;
        background-color: transparent !important;
      }}
    </style>
    <link rel="icon" type="image/webp" href="/brand/logo?v={BRAND_CACHE_VERSION}" />
    """
    html = html.replace("</head>", f"{brand_override}</head>")
    return HTMLResponse(
        html,
        headers={"Cache-Control": "no-store, max-age=0"},
    )


def require_admin(x_admin_token: Optional[str]) -> None:
    if not ADMIN_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Configure a variável de ambiente ADMIN_TOKEN para habilitar o painel.",
        )
    if not x_admin_token or not hmac.compare_digest(x_admin_token, ADMIN_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token administrativo inválido.",
        )


def _customer_whatsapp_number(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("55") and len(digits) >= 12:
        return digits
    return f"55{digits}" if digits else ""


def _is_preorder(order: dict) -> bool:
    return any(
        item.get("order_type") == "Encomenda"
        for item in order.get("items", [])
    )


def build_customer_status_message(order: dict, new_status: str) -> str:
    customer = order.get("customer_name", "cliente")
    order_id = order.get("id", "")
    schedule = order.get("notes", "")

    if new_status == "Aceito":
        lines = [
            f"Olá, {customer}! Aqui é a Vanuza, do Sabor da Casa. 😊",
            "",
            f"Sua encomenda #{order_id} foi aceita e vou conseguir preparar seu pedido.",
        ]
        if schedule:
            lines.append(f"Data/horário solicitado: {schedule}")
        lines.extend(
            [
                "",
                "A retirada será em:",
                PICKUP_ADDRESS,
                PICKUP_REFERENCE,
                "",
                "Qualquer ajuste, pode falar comigo por aqui.",
            ]
        )
        return "\n".join(lines)

    if new_status == "Recusado":
        lines = [
            f"Olá, {customer}! Aqui é a Vanuza, do Sabor da Casa.",
            "",
            f"Infelizmente não vou conseguir atender a encomenda #{order_id} na data/horário pedido.",
        ]
        if schedule:
            lines.append(f"Solicitação: {schedule}")
        lines.extend(
            [
                "",
                "Se você quiser, podemos combinar outra data por aqui. 💛",
            ]
        )
        return "\n".join(lines)

    if new_status == "Pronto para retirada":
        return "\n".join(
            [
                f"Olá, {customer}! Seu pedido #{order_id} do Sabor da Casa está pronto para retirada. 😊",
                "",
                PICKUP_ADDRESS,
                PICKUP_REFERENCE,
            ]
        )

    return ""


def build_customer_whatsapp_url(order: dict, new_status: str) -> str:
    number = _customer_whatsapp_number(order.get("phone", ""))
    message = build_customer_status_message(order, new_status)
    if not number or not message:
        return ""
    return f"https://wa.me/{number}?text={quote(message)}"


@app.get("/", include_in_schema=False)
def home():
    return _page_with_transparent_brand("index.html")


@app.get("/admin", include_in_schema=False)
def admin_page():
    return _page_with_transparent_brand("admin.html")


@app.get("/brand/logo", include_in_schema=False)
def get_restaurant_logo():
    try:
        return Response(
            content=_brand_logo_bytes(),
            media_type="image/webp",
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )
    except (OSError, ValueError):
        return RedirectResponse(LOGO_URL, status_code=307)


@app.get("/favicon.ico", include_in_schema=False)
@app.get("/favicon.svg", include_in_schema=False)
@app.get("/favicon.png", include_in_schema=False)
def favicon():
    return get_restaurant_logo()


@app.get("/info", tags=["restaurante"])
@app.get("/api/info", tags=["restaurante"])
def get_restaurant_info():
    return {
        "name": RESTAURANT_NAME,
        "owner": OWNER_NAME,
        "slogan": SLOGAN,
        "whatsapp": WHATSAPP,
        "whatsapp_url": WHATSAPP_URL,
        "logo": f"/brand/logo?v={BRAND_CACHE_VERSION}",
        "service": "Retirada",
        "pickup_address": PICKUP_ADDRESS,
        "pickup_reference": PICKUP_REFERENCE,
        "today_menu_requires_approval": False,
        "preorder_requires_approval": True,
    }


@app.get("/menu", tags=["menu"])
@app.get("/api/menu", tags=["menu"])
def get_menu(restriction: str = Query(default="", examples=restriction_options)):
    return menu_builder.get_main_menu(
        restriction=Restriction._member_map_.get(restriction)
    )


@app.post("/order", tags=["compatibilidade"], status_code=status.HTTP_201_CREATED)
def make_dish_order(dish_name: str):
    try:
        menu_builder.make_order(dish_name)
    except ValueError as err:
        if str(err) == "Dish does not exist":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))
        raise HTTPException(
            status_code=status.HTTP_406_NOT_ACCEPTABLE,
            detail="O prato não pode ser preparado por falta de ingredientes.",
        )
    return {"message": "Pedido registrado", "dish_name": dish_name}


@app.post("/api/orders", tags=["pedidos"], status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderInput):
    customer_name = payload.customer_name.strip()
    phone = payload.phone.strip()
    delivery_method = payload.delivery_method.strip() or "Retirada"
    payment_method = payload.payment_method.strip()
    notes = payload.notes.strip()
    requested_date = payload.requested_date.strip()
    requested_time = payload.requested_time.strip()

    if len(customer_name) < 2:
        raise HTTPException(status_code=422, detail="Informe seu nome.")
    if len(phone) < 8:
        raise HTTPException(status_code=422, detail="Informe um telefone válido.")
    if delivery_method != "Retirada":
        raise HTTPException(
            status_code=422,
            detail="O Sabor da Casa trabalha somente com retirada no local.",
        )
    if not payload.items:
        raise HTTPException(status_code=422, detail="Adicione ao menos um prato.")

    available_menu = {item["dish_name"]: item for item in menu_builder.get_main_menu()}
    normalized_items = []
    total = 0.0
    order_types = set()

    for requested in payload.items:
        dish = available_menu.get(requested.dish_name)
        if dish is None:
            raise HTTPException(
                status_code=409,
                detail=f"O prato '{requested.dish_name}' não está disponível no momento.",
            )

        options = dish.get("options") or []
        selected_option = None
        if requested.option:
            selected_option = next(
                (option for option in options if option["id"] == requested.option), None
            )
            if selected_option is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"Escolha de tamanho inválida para {dish['display_name']}.",
                )
        elif options:
            selected_option = options[0]

        unit_price = float(selected_option["price"] if selected_option else dish["price"])
        subtotal = round(unit_price * requested.quantity, 2)
        total += subtotal
        order_type = dish.get("order_type", "Hoje")
        order_types.add(order_type)
        normalized_items.append(
            {
                "dish_name": dish["dish_name"],
                "display_name": dish.get("display_name", dish["dish_name"]),
                "option": selected_option["id"] if selected_option else "",
                "option_label": selected_option["label"] if selected_option else "",
                "serves": selected_option.get("serves", "") if selected_option else "",
                "order_type": order_type,
                "quantity": requested.quantity,
                "unit_price": unit_price,
                "subtotal": subtotal,
            }
        )

    if len(order_types) != 1:
        raise HTTPException(
            status_code=422,
            detail="Finalize o cardápio do dia e as encomendas em pedidos separados.",
        )

    order_type = next(iter(order_types))
    is_preorder = order_type == "Encomenda"

    if is_preorder:
        if not requested_date:
            raise HTTPException(
                status_code=422,
                detail="Escolha a data desejada para a encomenda.",
            )
        if not requested_time:
            raise HTTPException(
                status_code=422,
                detail="Escolha o horário desejado para a encomenda.",
            )

    note_parts = []
    if is_preorder:
        note_parts.append(f"Encomenda desejada para {requested_date} às {requested_time}")
    if notes:
        note_parts.append(notes[:200])

    initial_status = "Aguardando aprovação" if is_preorder else "Confirmado"
    order = order_store.create_order(
        {
            "status": initial_status,
            "customer_name": customer_name,
            "phone": phone,
            "delivery_method": "Retirada",
            "address": "",
            "payment_method": payment_method,
            "notes": " | ".join(note_parts)[:240],
            "items": normalized_items,
            "total": round(total, 2),
        }
    )

    if is_preorder:
        message = "Encomenda enviada para a Vanuza. Aguarde a confirmação pelo WhatsApp."
    else:
        message = "Pedido confirmado para retirada hoje no Sabor da Casa."

    return {
        "order": order,
        "order_type": order_type,
        "approval_required": is_preorder,
        "message": message,
        "pickup_address": PICKUP_ADDRESS,
        "pickup_reference": PICKUP_REFERENCE,
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

    current = next(
        (order for order in order_store.list_orders() if order.get("id") == order_id),
        None,
    )
    if current is None:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")

    if _is_preorder(current):
        allowed_statuses = {
            "Aguardando aprovação",
            "Aceito",
            "Recusado",
            "Em preparo",
            "Pronto para retirada",
            "Concluído",
            "Cancelado",
        }
    else:
        allowed_statuses = {
            "Confirmado",
            "Em preparo",
            "Pronto para retirada",
            "Concluído",
            "Cancelado",
        }

    if payload.status not in allowed_statuses:
        raise HTTPException(
            status_code=422,
            detail="Esse status não é válido para este tipo de pedido.",
        )

    try:
        updated = order_store.update_status(order_id, payload.status)
        return {
            "order": updated,
            "customer_whatsapp_url": build_customer_whatsapp_url(updated, payload.status),
        }
    except ValueError:
        raise HTTPException(status_code=422, detail="Status de pedido inválido.")
    except KeyError:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")


@app.get("/health", tags=["infra"])
def health_check():
    return {"status": "ok", "service": RESTAURANT_NAME, "ui": "order-flow-14"}
