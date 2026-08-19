from fastapi.testclient import TestClient

import src.p1_security as security


def test_swagger_and_openapi_are_hidden_in_production(monkeypatch):
    monkeypatch.setattr(security, "IS_PRODUCTION", True)
    client = TestClient(security.app)

    for path in ("/docs", "/redoc", "/openapi.json"):
        response = client.get(path)
        assert response.status_code == 404
        assert response.headers["x-sabor-security"] == "p1"
