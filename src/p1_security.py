import os
import re
from typing import List, Optional

from fastapi import HTTPException, Request, status
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, validator

import src.app as legacy_app
from src.services.admin_auth import (
    AdminAuth,
    AdminAuthError,
    AdminInvalidCredentials,
    AdminRateLimited,
)
from src.services.product_catalog import (
    CatalogUnavailable,
    ManagedMenuBuilder,
    ProductAlreadyExists,
    ProductCatalog,
    ProductNotFound,
    canonical_dish_name,
)


app = legacy_app.app

ADMIN_COOKIE = "sabor_admin_session"
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "vanuza")
ADMIN_SECRET = os.getenv("ADMIN_PASSWORD") or legacy_app.ADMIN_TOKEN
ADMIN_SESSION_HOURS = int(os.getenv("ADMIN_SESSION_HOURS", "8"))
ADMIN_LOGIN_MAX_ATTEMPTS = int(os.getenv("ADMIN_LOGIN_MAX_ATTEMPTS", "5"))
ADMIN_LOGIN_WINDOW = int(os.getenv("ADMIN_LOGIN_WINDOW", "900"))
VERCEL_ENV = os.getenv("VERCEL_ENV", "")
APP_ENV = os.getenv("APP_ENV", "")
IS_PRODUCTION = VERCEL_ENV == "production" or APP_ENV == "production"
STATIC_LOGO_PATH = legacy_app.FRONTEND_DIR / "assets" / "logo-sabor-da-casa.webp"

# O endpoint legado continua esperando um segredo interno. Ele nunca é aceito
# diretamente do navegador: o middleware abaixo remove o header recebido e só
# o injeta após validar uma sessão HttpOnly.
if ADMIN_SECRET:
    legacy_app.ADMIN_TOKEN = ADMIN_SECRET

admin_auth = AdminAuth(
    legacy_app.DATABASE_URL,
    username=ADMIN_USERNAME,
    password=ADMIN_SECRET,
    session_hours=ADMIN_SESSION_HOURS,
    max_attempts=ADMIN_LOGIN_MAX_ATTEMPTS,
    attempt_window_seconds=ADMIN_LOGIN_WINDOW,
)

# P2: o cardápio público passa a ler a apresentação/preços do catálogo
# persistido. Receitas e estoque continuam delegados ao builder legado até o
# bloco específico de inventário do P2.
product_catalog = ProductCatalog(legacy_app.DATABASE_URL)
if not isinstance(legacy_app.menu_builder, ManagedMenuBuilder):
    legacy_app.menu_builder = ManagedMenuBuilder(legacy_app.menu_builder, product_catalog)


class AdminLoginInput(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=4, max_length=200)


class ProductOptionInput(BaseModel):
    id: str = Field(min_length=1, max_length=60, regex=r"^[a-z0-9][a-z0-9_-]*$")
    label: str = Field(min_length=1, max_length=80)
    serves: str = Field(default="", max_length=100)
    price: float = Field(gt=0, le=10000)


class ProductInput(BaseModel):
    dish_name: str = Field(min_length=2, max_length=120)
    display_name: str = Field(min_length=2, max_length=120)
    category: str = Field(min_length=2, max_length=80)
    order_type: str = Field(regex=r"^(Hoje|Encomenda)$")
    description: str = Field(default="", max_length=700)
    serves: str = Field(default="", max_length=100)
    preparation: str = Field(default="", max_length=100)
    lead_time: str = Field(default="", max_length=100)
    badge: str = Field(default="", max_length=80)
    featured: bool = False
    image_url: str = Field(default="", max_length=1200)
    ingredients: List[str] = Field(default_factory=list)
    restrictions: List[str] = Field(default_factory=list)
    highlights: List[str] = Field(default_factory=list)
    accompaniments: List[str] = Field(default_factory=list)
    options: List[ProductOptionInput]
    active: bool = True
    sort_order: int = Field(default=0, ge=0, le=100000)
    available_days: List[int] = Field(default_factory=lambda: list(range(7)))
    available_start: str = Field(default="", max_length=5)
    available_end: str = Field(default="", max_length=5)

    @validator("dish_name")
    def normalize_name(cls, value):
        normalized = canonical_dish_name(value)
        if len(normalized) < 2:
            raise ValueError("Informe um identificador válido para o prato.")
        return normalized

    @validator("ingredients", "restrictions", "highlights", "accompaniments", pre=True)
    def clean_text_lists(cls, value):
        if value is None:
            return []
        return [str(item).strip() for item in value if str(item).strip()][:40]

    @validator("available_days")
    def validate_days(cls, value):
        days = sorted(set(value or list(range(7))))
        if any(day < 0 or day > 6 for day in days):
            raise ValueError("Os dias de disponibilidade devem ficar entre 0 e 6.")
        return days

    @validator("available_start", "available_end")
    def validate_time(cls, value):
        value = value.strip()
        if value and not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
            raise ValueError("Informe horários no formato HH:MM.")
        return value

    @validator("options")
    def validate_options(cls, value):
        if not value:
            raise ValueError("Cadastre pelo menos uma opção de preço.")
        ids = [item.id for item in value]
        if len(ids) != len(set(ids)):
            raise ValueError("As opções de preço precisam de identificadores diferentes.")
        return value


class ProductActiveInput(BaseModel):
    active: bool


class ProductOrderInput(BaseModel):
    dish_names: List[str] = Field(min_items=1, max_items=200)


def _session_token(request: Request) -> str:
    return request.cookies.get(ADMIN_COOKIE, "")


def _user_agent(request: Request) -> str:
    return request.headers.get("user-agent", "")[:500]


def _require_ajax_admin_request(request: Request) -> None:
    if request.headers.get("x-admin-request") != "1":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requisição administrativa inválida.",
        )


def _require_admin_session(request: Request, mutation: bool = False) -> str:
    if mutation:
        _require_ajax_admin_request(request)
    username = admin_auth.validate(_session_token(request), user_agent=_user_agent(request))
    if not username:
        raise HTTPException(
            status_code=401,
            detail="Sessão administrativa inválida ou expirada.",
        )
    return username


def _base_catalog_seed():
    builder = legacy_app.menu_builder
    base_builder = builder.base_builder if isinstance(builder, ManagedMenuBuilder) else builder
    return base_builder.get_main_menu(restriction=None)


def _catalog_error(exc: Exception):
    if isinstance(exc, ProductNotFound):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, ProductAlreadyExists):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if isinstance(exc, CatalogUnavailable):
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    raise HTTPException(status_code=422, detail=str(exc)) from exc


def _security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), "
        "accelerometer=(), gyroscope=(), magnetometer=()"
    )
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
    response.headers["Content-Security-Policy"] = "; ".join(
        [
            "default-src 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            "frame-ancestors 'none'",
            "frame-src 'none'",
            "form-action 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            "img-src 'self' data: https://images.unsplash.com https://raw.githubusercontent.com",
            "connect-src 'self'",
            "manifest-src 'self'",
        ]
        + (["upgrade-insecure-requests"] if IS_PRODUCTION else [])
    )
    if IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = (
            "max-age=63072000; includeSubDomains; preload"
        )
    response.headers["X-Sabor-Security"] = "p1"
    return response


def _static_logo_response():
    return _security_headers(
        FileResponse(
            STATIC_LOGO_PATH,
            media_type="image/webp",
            headers={
                "Cache-Control": "public, max-age=31536000, immutable",
                "X-Sabor-Logo": "static-approved",
            },
        )
    )


@app.middleware("http")
async def p1_security_middleware(request: Request, call_next):
    path = request.url.path

    if path in {"/brand/logo", "/favicon.ico", "/favicon.svg", "/favicon.png"}:
        return _static_logo_response()

    if IS_PRODUCTION and path in {"/docs", "/redoc", "/openapi.json"}:
        return _security_headers(
            JSONResponse(
                status_code=404,
                content={"detail": "Not Found"},
                headers={"Cache-Control": "no-store"},
            )
        )

    # Nunca aceita o segredo administrativo vindo do cliente.
    headers = [
        (key, value)
        for key, value in request.scope.get("headers", [])
        if key.lower() != b"x-admin-token"
    ]

    admin_protected = (
        (request.method == "GET" and path == "/api/orders")
        or (request.method == "PATCH" and path.startswith("/api/orders/"))
    )

    if admin_protected:
        if request.method != "GET" and request.headers.get("x-admin-request") != "1":
            return _security_headers(
                JSONResponse(
                    status_code=403,
                    content={"detail": "Requisição administrativa inválida."},
                    headers={"Cache-Control": "no-store"},
                )
            )

        token = _session_token(request)
        username = admin_auth.validate(token, user_agent=_user_agent(request))
        if username and ADMIN_SECRET:
            headers.append((b"x-admin-token", ADMIN_SECRET.encode("utf-8")))

    request.scope["headers"] = headers
    response = await call_next(request)

    if path.startswith("/api/admin/") or admin_protected or path == "/admin":
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"
    return _security_headers(response)


@app.post("/api/admin/login", include_in_schema=False)
def admin_login(payload: AdminLoginInput, request: Request):
    _require_ajax_admin_request(request)
    client_hash = legacy_app._client_hash(request)
    try:
        token = admin_auth.login(
            payload.username,
            payload.password,
            client_hash=client_hash,
            user_agent=_user_agent(request),
        )
    except AdminRateLimited as exc:
        raise HTTPException(
            status_code=429,
            detail="Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.",
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc
    except AdminInvalidCredentials as exc:
        raise HTTPException(
            status_code=401,
            detail="Usuário ou senha inválidos.",
        ) from exc
    except AdminAuthError as exc:
        raise HTTPException(
            status_code=503,
            detail="A autenticação administrativa ainda não foi configurada no servidor.",
        ) from exc

    response = JSONResponse(
        {"authenticated": True, "username": ADMIN_USERNAME},
        headers={"Cache-Control": "no-store"},
    )
    response.set_cookie(
        key=ADMIN_COOKIE,
        value=token,
        max_age=ADMIN_SESSION_HOURS * 3600,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="strict",
        path="/",
    )
    return response


@app.get("/api/admin/session", include_in_schema=False)
def admin_session(request: Request):
    username: Optional[str] = admin_auth.validate(
        _session_token(request), user_agent=_user_agent(request)
    )
    if not username:
        raise HTTPException(status_code=401, detail="Sessão administrativa inválida ou expirada.")
    return JSONResponse(
        {"authenticated": True, "username": username},
        headers={"Cache-Control": "no-store"},
    )


@app.post("/api/admin/logout", include_in_schema=False)
def admin_logout(request: Request):
    _require_ajax_admin_request(request)
    admin_auth.logout(_session_token(request))
    response = JSONResponse(
        {"authenticated": False}, headers={"Cache-Control": "no-store"}
    )
    response.delete_cookie(
        ADMIN_COOKIE,
        path="/",
        secure=IS_PRODUCTION,
        httponly=True,
        samesite="strict",
    )
    return response


@app.get("/api/admin/products", include_in_schema=False)
def admin_products(request: Request):
    _require_admin_session(request)
    try:
        products = product_catalog.list_admin_products(_base_catalog_seed())
        return {"products": products, "count": len(products)}
    except Exception as exc:
        _catalog_error(exc)


@app.post("/api/admin/products", include_in_schema=False, status_code=201)
def admin_create_product(payload: ProductInput, request: Request):
    _require_admin_session(request, mutation=True)
    try:
        product = product_catalog.create_product(payload.dict())
        return {"product": product}
    except Exception as exc:
        _catalog_error(exc)


@app.put("/api/admin/products/{dish_name}", include_in_schema=False)
def admin_update_product(dish_name: str, payload: ProductInput, request: Request):
    _require_admin_session(request, mutation=True)
    target = canonical_dish_name(dish_name)
    if payload.dish_name != target:
        raise HTTPException(
            status_code=422,
            detail="O identificador interno do prato não pode ser alterado durante a edição.",
        )
    try:
        product = product_catalog.update_product(target, payload.dict())
        return {"product": product}
    except Exception as exc:
        _catalog_error(exc)


@app.patch("/api/admin/products/{dish_name}/active", include_in_schema=False)
def admin_set_product_active(dish_name: str, payload: ProductActiveInput, request: Request):
    _require_admin_session(request, mutation=True)
    try:
        product = product_catalog.set_active(dish_name, payload.active)
        return {"product": product}
    except Exception as exc:
        _catalog_error(exc)


@app.post("/api/admin/products/reorder", include_in_schema=False)
def admin_reorder_products(payload: ProductOrderInput, request: Request):
    _require_admin_session(request, mutation=True)
    try:
        products = product_catalog.reorder(payload.dish_names)
        return {"products": products}
    except Exception as exc:
        _catalog_error(exc)


@app.get("/privacidade", include_in_schema=False)
def privacy_page():
    return legacy_app._page_with_transparent_brand("privacy.html")
