import src.p2_inventory as p2


def test_stock_requirement_uses_selected_option_factor(monkeypatch):
    menu = p2.legacy_app.menu_builder.get_main_menu()
    product = next(item for item in menu if item.get("options"))
    selected = product["options"][-1]["id"]

    monkeypatch.setattr(p2, "_managed_dish_recipe", lambda _dish: {"ingrediente-teste": 3})
    monkeypatch.setattr(
        p2,
        "_option_factor",
        lambda dish_name, option_id: 4 if dish_name == product["dish_name"] and option_id == selected else 1,
    )

    requirements = p2._managed_stock_requirements(
        [{"dish_name": product["dish_name"], "option": selected, "quantity": 2}]
    )

    assert requirements == {"ingrediente-teste": 24}
