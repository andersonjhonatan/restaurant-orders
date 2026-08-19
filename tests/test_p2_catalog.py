from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from src.services.product_catalog import (
    ProductAlreadyExists,
    ProductCatalog,
    ProductNotFound,
)


RECIFE = ZoneInfo("America/Recife")


def product(name="lasanha teste", price=30.0, **overrides):
    data = {
        "dish_name": name,
        "display_name": name.title(),
        "category": "Lasanhas",
        "order_type": "Hoje",
        "description": "Prato de teste",
        "serves": "1 pessoa",
        "preparation": "Disponível hoje",
        "lead_time": "Pronta entrega",
        "badge": "Teste",
        "featured": False,
        "image_url": "",
        "ingredients": ["massa", "queijo"],
        "restrictions": ["LACTOSE"],
        "highlights": ["Caseiro"],
        "accompaniments": [],
        "options": [{"id": "individual", "label": "Individual", "serves": "1 pessoa", "price": price}],
        "active": True,
        "sort_order": 0,
        "available_days": [0, 1, 2, 3, 4, 5, 6],
        "available_start": "",
        "available_end": "",
    }
    data.update(overrides)
    return data


def test_seed_and_edit_price_reflect_immediately_in_public_menu():
    catalog = ProductCatalog(None)
    seed = [product(price=30.0)]

    catalog.seed_products(seed)
    stored = catalog.get_product("lasanha teste")
    stored["options"][0]["price"] = 42.9
    catalog.update_product("lasanha teste", stored)

    public = catalog.public_menu(seed)
    assert len(public) == 1
    assert public[0]["price"] == 42.9
    assert public[0]["options"][0]["price"] == 42.9


def test_archive_removes_product_from_public_menu_without_deleting_it():
    catalog = ProductCatalog(None)
    seed = [product()]
    catalog.seed_products(seed)

    archived = catalog.set_active("lasanha teste", False)
    assert archived["active"] is False
    assert catalog.public_menu(seed) == []
    assert catalog.get_product("lasanha teste")["active"] is False


def test_availability_days_and_time_window_control_public_visibility():
    catalog = ProductCatalog(None)
    monday_product = product(
        available_days=[0],
        available_start="11:00",
        available_end="14:00",
    )
    catalog.seed_products([monday_product])

    monday_lunch = datetime(2026, 8, 17, 12, 0, tzinfo=RECIFE)
    monday_evening = datetime(2026, 8, 17, 18, 0, tzinfo=RECIFE)
    tuesday_lunch = datetime(2026, 8, 18, 12, 0, tzinfo=RECIFE)

    assert len(catalog.public_menu([monday_product], now=monday_lunch)) == 1
    assert catalog.public_menu([monday_product], now=monday_evening) == []
    assert catalog.public_menu([monday_product], now=tuesday_lunch) == []


def test_create_duplicate_and_reorder_catalog():
    catalog = ProductCatalog(None)
    first = product("prato um", 20)
    second = product("prato dois", 25)

    catalog.create_product(first)
    catalog.create_product(second)

    with pytest.raises(ProductAlreadyExists):
        catalog.create_product(first)

    ordered = catalog.reorder(["prato dois", "prato um"])
    assert [item["dish_name"] for item in ordered] == ["prato dois", "prato um"]
    assert [item["sort_order"] for item in ordered] == [0, 10]


def test_unknown_product_cannot_be_updated_or_archived():
    catalog = ProductCatalog(None)
    with pytest.raises(ProductNotFound):
        catalog.update_product("inexistente", product("inexistente"))
    with pytest.raises(ProductNotFound):
        catalog.set_active("inexistente", False)
