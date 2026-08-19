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
