from src.models.ingredient import Ingredient, Restriction
from src.services.inventory_control import InventoryMapping
from src.services.menu_builder import MenuBuilder
from src.services.order_store import OrderStore


def test_menu_builder_returns_available_dishes_and_respects_restrictions():
    builder = MenuBuilder()
    menu = builder.get_main_menu()

    names = {item["dish_name"] for item in menu}
    assert "lasanha presunto" in names
    assert "lasanha berinjela" in names

    without_meat = builder.get_main_menu(Restriction.ANIMAL_MEAT)
    without_meat_names = {item["dish_name"] for item in without_meat}
    assert "lasanha presunto" not in without_meat_names
    assert "lasanha berinjela" in without_meat_names


def test_inventory_checks_and_consumes_recipe(tmp_path):
    inventory_file = tmp_path / "inventory.csv"
    inventory_file.write_text(
        "ingredient,initial_amount\ntomate,10\n",
        encoding="utf-8",
    )
    inventory = InventoryMapping(str(inventory_file))
    recipe = {Ingredient("tomate"): 4}

    assert inventory.check_recipe_availability(recipe) is True
    inventory.consume_recipe(recipe)
    assert inventory.inventory[Ingredient("tomate")] == 6


def test_order_store_persists_and_updates_status(tmp_path):
    orders_file = tmp_path / "orders.json"
    store = OrderStore(str(orders_file))

    created = store.create_order(
        {
            "customer_name": "Cliente Teste",
            "phone": "87999999999",
            "items": [],
            "total": 0.0,
        }
    )

    assert created["id"] == 1
    assert created["status"] == "Novo"
    assert store.list_orders()[0]["customer_name"] == "Cliente Teste"

    updated = store.update_status(1, "Em preparo")
    assert updated["status"] == "Em preparo"
