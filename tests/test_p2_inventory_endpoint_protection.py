from fastapi.testclient import TestClient

import src.p2_inventory as p2


def test_inventory_routes_require_admin_session():
    client = TestClient(p2.app)

    inventory = client.get("/api/admin/inventory")
    recipe = client.get("/api/admin/products/lasanha%20bolonhesa/recipe")

    assert inventory.status_code == 401
    assert recipe.status_code == 401
