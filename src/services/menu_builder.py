from typing import Dict, List

from src.services.inventory_control import InventoryMapping
from src.services.menu_data import MenuData

DATA_PATH = "data/menu_base_data.csv"
INVENTORY_PATH = "data/inventory_base_data.csv"


class MenuBuilder:
    def __init__(self, data_path=DATA_PATH, inventory_path=INVENTORY_PATH):
        self.menu_data = MenuData(data_path)
        self.inventory = InventoryMapping(inventory_path)

    def make_order(self, dish_name: str) -> None:
        try:
            curr_dish = [
                dish
                for dish in self.menu_data.dishes
                if dish.name == dish_name
            ][0]
        except IndexError:
            raise ValueError("Dish does not exist")

        self.inventory.consume_recipe(curr_dish.recipe)

    def get_main_menu(self, restriction=None) -> List[Dict]:
        menu = []

        for dish in sorted(self.menu_data.dishes, key=lambda item: item.name):
            restrictions = dish.get_restrictions()

            if restriction is not None and restriction in restrictions:
                continue

            if not self.inventory.check_recipe_availability(dish.recipe):
                continue

            menu.append(
                {
                    "dish_name": dish.name,
                    "ingredients": sorted(
                        ingredient.name for ingredient in dish.get_ingredients()
                    ),
                    "price": dish.price,
                    "restrictions": sorted(
                        item.value for item in restrictions
                    ),
                }
            )

        return menu
