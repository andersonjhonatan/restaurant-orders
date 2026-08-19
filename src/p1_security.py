import os
from typing import Optional

from fastapi import HTTPException, Request, status
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

import src.app as legacy_app
from src.services.admin_auth import (
    AdminAuth,
    AdminAuthError,
    AdminInvalidCredentials,
    AdminRateLimited,
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


class AdminLoginInput(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=4, max_length=200)


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

    # A marca aprovada é servida diretamente do arquivo que foi validado
    # byte a byte contra a versão anterior. Evita reprocessamento com Pillow
    # em cada nova instância serverless e mantém a URL pública compatível.
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


@app.get("/privacidade", include_in_schema=False)
def privacy_page():
    return legacy_app._page_with_transparent_brand("privacy.html")
