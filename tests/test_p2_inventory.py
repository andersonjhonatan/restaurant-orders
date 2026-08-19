import pytest

from src.services.inventory_management import (
    InvalidInventoryAdjustment,
    InventoryItemNotFound,
    InventoryManagement,
)


def memory_inventory():
    service = InventoryManagement(None)
    service._memory_inventory = {
        "queijo": {
            "ingredient": "queijo",
            "initial_amount": 100,
            "available_amount": 50,
            "low_stock_threshold": 10,
        },
        "massa": {
            "ingredient": "massa",
            "initial_amount": 80,
            "available_amount": 30,
            "low_stock_threshold": 8,
        },
    }
    return service


def test_adjust_inventory_records_new_balance_and_never_goes_negative():
    service = memory_inventory()

    updated = service.adjust_inventory(
        "queijo",
        20,
        reason="Reposição",
        note="Compra da manhã",
        created_by="vanuza",
    )
    assert updated["available_amount"] == 70
    assert service.recent_movements(1)[0]["delta"] == 20

    with pytest.raises(InvalidInventoryAdjustment):
        service.adjust_inventory("massa", -31, reason="Perda")


def test_threshold_can_be_changed_without_changing_available_stock():
    service = memory_inventory()
    updated = service.set_threshold("massa", 15)
    assert updated["low_stock_threshold"] == 15
    assert updated["available_amount"] == 30


def test_recipe_requires_existing_inventory_ingredients():
    service = memory_inventory()

    recipe = service.save_recipe("lasanha teste", {"massa": 10, "queijo": 5})
    assert recipe == {"massa": 10, "queijo": 5}
    assert service.recipe_ready("lasanha teste") is True

    with pytest.raises(InventoryItemNotFound):
        service.save_recipe("prato inválido", {"ingrediente inexistente": 1})


def test_zero_adjustment_is_rejected():
    service = memory_inventory()
    with pytest.raises(InvalidInventoryAdjustment):
        service.adjust_inventory("queijo", 0, reason="Ajuste")
