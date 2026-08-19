from pathlib import Path

from fastapi.testclient import TestClient

import src.app as legacy_app
import src.p1_security as security
from src.services.admin_auth import AdminAuth


def client_with_auth(monkeypatch):
    auth = AdminAuth(None, username="vanuza", password="segredo", session_hours=8)
    monkeypatch.setattr(security, "admin_auth", auth)
    monkeypatch.setattr(security, "ADMIN_SECRET", "segredo")
    monkeypatch.setattr(legacy_app, "ADMIN_TOKEN", "segredo")
    return TestClient(security.app)


def test_security_headers_and_privacy_page(monkeypatch):
    client = client_with_auth(monkeypatch)

    health = client.get("/health")
    assert health.status_code == 200
    assert health.headers["x-content-type-options"] == "nosniff"
    assert health.headers["x-frame-options"] == "DENY"
    assert health.headers["x-sabor-security"] == "p1"
    assert "frame-ancestors 'none'" in health.headers["content-security-policy"]

    privacy = client.get("/privacidade")
    assert privacy.status_code == 200
    assert "Como cuidamos dos seus dados" in privacy.text


def test_static_logo_is_exact_approved_logo(monkeypatch):
    client = client_with_auth(monkeypatch)
    static_file = Path("frontend/assets/logo-sabor-da-casa.webp").read_bytes()
    legacy_bytes = legacy_app._brand_logo_bytes()

    assert static_file == legacy_bytes
    assert len(static_file) == 48882

    response = client.get("/brand/logo?v=logo-vanuza-23")
    assert response.status_code == 200
    assert response.content == static_file
    assert response.headers["content-type"].startswith("image/webp")
    assert response.headers["x-sabor-logo"] == "static-approved"
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_direct_admin_secret_header_is_not_accepted(monkeypatch):
    client = client_with_auth(monkeypatch)

    response = client.get("/api/orders", headers={"X-Admin-Token": "segredo"})
    assert response.status_code == 401


def test_admin_session_cookie_flow(monkeypatch):
    client = client_with_auth(monkeypatch)

    login = client.post(
        "/api/admin/login",
        json={"username": "vanuza", "password": "segredo"},
        headers={"X-Admin-Request": "1"},
    )
    assert login.status_code == 200
    assert login.json()["authenticated"] is True
    assert "sabor_admin_session=" in login.headers.get("set-cookie", "")
    assert "HttpOnly" in login.headers.get("set-cookie", "")

    session = client.get("/api/admin/session")
    assert session.status_code == 200
    assert session.json()["username"] == "vanuza"

    orders = client.get("/api/orders")
    assert orders.status_code == 200
    assert isinstance(orders.json(), list)

    logout = client.post(
        "/api/admin/logout",
        json={},
        headers={"X-Admin-Request": "1"},
    )
    assert logout.status_code == 200

    expired = client.get("/api/admin/session")
    assert expired.status_code == 401


def test_admin_login_requires_same_site_ajax_marker(monkeypatch):
    client = client_with_auth(monkeypatch)

    response = client.post(
        "/api/admin/login",
        json={"username": "vanuza", "password": "segredo"},
    )
    assert response.status_code == 403
