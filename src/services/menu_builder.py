from typing import Dict, List

from src.services.inventory_control import InventoryMapping
from src.services.menu_data import MenuData

DATA_PATH = "data/menu_base_data.csv"
INVENTORY_PATH = "data/inventory_base_data.csv"

MENU_PRESENTATION = {
    "lasanha presunto": {
        "display_name": "Lasanha de Presunto e Queijo",
        "category": "Lasanhas",
        "description": "Camadas bem servidas de massa, molho caseiro, presunto e bastante queijo gratinado.",
        "serves": "Serve 1 a 2 pessoas",
        "preparation": "Pedido sob encomenda",
        "badge": "Mais pedida",
        "image_url": "https://images.unsplash.com/photo-1640063414338-af9faa0c2485?auto=format&fit=crop&w=1200&q=82",
    },
    "lasanha berinjela": {
        "display_name": "Lasanha de Berinjela",
        "category": "Lasanhas",
        "description": "Uma opção leve e muito saborosa, com berinjela, molho de tomate e queijo gratinado.",
        "serves": "Serve 1 a 2 pessoas",
        "preparation": "Pedido sob encomenda",
        "badge": "Sem carne",
        "image_url": "https://images.unsplash.com/photo-1760390952710-b0e010ec4e50?auto=format&fit=crop&w=1200&q=82",
    },
    "lasanha bolonhesa": {
        "display_name": "Lasanha à Bolonhesa",
        "category": "Lasanhas",
        "description": "Lasanha de forno com molho bolonhesa, queijo derretido e aquele sabor de almoço em família.",
        "serves": "Serve 2 a 3 pessoas",
        "preparation": "Encomendar com antecedência",
        "badge": "Tamanho família",
        "image_url": "https://images.unsplash.com/photo-1640063414338-af9faa0c2485?auto=format&fit=crop&w=1200&q=82",
    },
    "feijoada completa": {
        "display_name": "Feijoada Completa",
        "category": "Encomendas",
        "description": "Feijoada caprichada para compartilhar, acompanhada de arroz, couve, farofa e vinagrete.",
        "serves": "Serve 2 pessoas",
        "preparation": "Encomendar com antecedência",
        "badge": "Fim de semana",
        "image_url": "https://images.unsplash.com/photo-1664741662725-bd131742b7b7?auto=format&fit=crop&w=1200&q=82",
    },
    "escondidinho carne de sol": {
        "display_name": "Escondidinho de Carne de Sol",
        "category": "Encomendas",
        "description": "Carne de sol bem temperada, coberta com purê cremoso e finalizada com queijo gratinado.",
        "serves": "Serve 2 a 3 pessoas",
        "preparation": "Encomendar com antecedência",
        "badge": "Especial da casa",
        "image_url": "https://images.unsplash.com/photo-1689860892307-7db54ab276ba?auto=format&fit=crop&w=1200&q=82",
    },
    "frango assado batatas": {
        "display_name": "Frango Assado com Batatas",
        "category": "Assados",
        "description": "Frango assado douradinho, temperado com ervas e servido com batatas macias e saborosas.",
        "serves": "Serve 3 a 4 pessoas",
        "preparation": "Encomendar com antecedência",
        "badge": "Almoço em família",
        "image_url": "https://images.unsplash.com/photo-1456404823214-a69ef7a1fae5?auto=format&fit=crop&w=1200&q=82",
    },
}


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

            presentation = MENU_PRESENTATION.get(dish.name, {})
            ingredients = sorted(
                ingredient.name for ingredient in dish.get_ingredients()
            )

            menu.append(
                {
                    "dish_name": dish.name,
                    "display_name": presentation.get(
                        "display_name", dish.name.title()
                    ),
                    "ingredients": ingredients,
                    "price": dish.price,
                    "restrictions": sorted(
                        item.value for item in restrictions
                    ),
                    "category": presentation.get("category", "Cardápio"),
                    "description": presentation.get(
                        "description",
                        "Prato preparado com cuidado e ingredientes selecionados.",
                    ),
                    "serves": presentation.get("serves", "Porção individual"),
                    "preparation": presentation.get(
                        "preparation", "Consulte disponibilidade"
                    ),
                    "badge": presentation.get("badge", "Feito em casa"),
                    "image_url": presentation.get("image_url", ""),
                }
            )

        return menu
