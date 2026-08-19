from fastapi.testclient import TestClient

import src.p2_analytics as analytics


def test_analytics_routes_require_admin_session():
    client = TestClient(analytics.app)

    metrics = client.get("/api/admin/analytics?days=30")
    history = client.get("/api/admin/orders/1/history")
    export = client.get("/api/admin/reports/orders.csv?days=30")

    assert metrics.status_code == 401
    assert history.status_code == 401
    assert export.status_code == 401


def test_admin_page_loads_analytics_assets_without_removing_existing_p2_assets():
    client = TestClient(analytics.app)
    response = client.get("/admin")

    assert response.status_code == 200
    assert "/static/p2-inventory-admin.js?v=p2-inventory-1" in response.text
    assert "/static/p2-analytics-admin.css?v=p2-analytics-1" in response.text
    assert "/static/p2-analytics-admin.js?v=p2-analytics-1" in response.text
    assert response.headers["x-sabor-security"] == "p1"
    assert response.headers["cache-control"] == "no-store, max-age=0"


def test_vercel_entrypoint_uses_analytics_runtime():
    source = open("api/index.py", encoding="utf-8").read()
    assert "from src.p2_analytics import app as real_app" in source
