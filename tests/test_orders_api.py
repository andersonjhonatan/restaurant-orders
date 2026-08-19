from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

import src.app as app_module
from src.services.order_hardening import OrderHardening
from src.services.order_store import OrderStore


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "order_store", OrderStore(str(tmp_path / "orders.json")))
    monkeypatch.setattr(app_module, "order_hardening", OrderHardening(None))
    return TestClient(app_module.app)


def valid_today_payload():
    return {
        "customer_name": "Cliente Teste",
        "phone": "(87) 99999-9999",
        "delivery_method": "Retirada",
        "payment_method": "Pix",
        "notes": "",
        "requested_date": "",
        "requested_time": "",
        "items": [
            {
                "dish_name": "lasanha presunto",
                "option": "individual",
                "quantity": 1,
            }
        ],
    }


def test_rejects_invalid_brazilian_phone(client):
    payload = valid_today_payload()
    payload["phone"] = "123"
    response = client.post("/api/orders", json=payload)
    assert response.status_code == 422
    assert "telefone brasileiro" in response.json()["detail"]


def test_rejects_invalid_payment_method(client):
    payload = valid_today_payload()
    payload["payment_method"] = "Criptomoeda"
    response = client.post("/api/orders", json=payload)
    assert response.status_code == 422
    assert "forma de pagamento" in response.json()["detail"]


def test_rejects_more_than_total_item_limit(client):
    payload = valid_today_payload()
    payload["items"] = [
        {"dish_name": "lasanha presunto", "option": "individual", "quantity": 20},
        {"dish_name": "lasanha berinjela", "option": "individual", "quantity": 20},
    ]
    response = client.post("/api/orders", json=payload)
    assert response.status_code == 422
    assert "no máximo" in response.json()["detail"]


def test_server_recalculates_price(client):
    payload = valid_today_payload()
    payload["total"] = 0.01
    response = client.post("/api/orders", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["order"]["total"] == 25.9
    assert data["order"]["items"][0]["unit_price"] == 25.9


def test_rejects_preorder_in_the_past(client):
    payload = valid_today_payload()
    payload["items"] = [
        {"dish_name": "feijoada completa", "option": "2-pessoas", "quantity": 1}
    ]
    yesterday = datetime.now(app_module.LOCAL_TZ) - timedelta(days=1)
    payload["requested_date"] = yesterday.strftime("%Y-%m-%d")
    payload["requested_time"] = "12:00"
    response = client.post("/api/orders", json=payload)
    assert response.status_code == 422
    assert "antecedência" in response.json()["detail"]


def test_rejects_preorder_outside_allowed_hours(client):
    payload = valid_today_payload()
    payload["items"] = [
        {"dish_name": "feijoada completa", "option": "2-pessoas", "quantity": 1}
    ]
    future = datetime.now(app_module.LOCAL_TZ) + timedelta(days=3)
    payload["requested_date"] = future.strftime("%Y-%m-%d")
    payload["requested_time"] = "23:00"
    response = client.post("/api/orders", json=payload)
    assert response.status_code == 422
    assert "horário entre" in response.json()["detail"]


def test_rejects_invalid_idempotency_key(client):
    response = client.post(
        "/api/orders",
        json=valid_today_payload(),
        headers={"Idempotency-Key": "abc"},
    )
    assert response.status_code == 422
    assert "Identificador" in response.json()["detail"]
