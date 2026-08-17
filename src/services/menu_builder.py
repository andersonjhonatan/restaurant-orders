from typing import Dict, List

from src.services.inventory_control import InventoryMapping
from src.services.menu_data import MenuData

DATA_PATH = "data/menu_base_data.csv"
INVENTORY_PATH = "data/inventory_base_data.csv"

MENU_PRESENTATION = {
    "lasanha presunto": {
        "display_name": "Lasanha de Presunto e Queijo",
        "category": "Lasanhas",
        "order_type": "Hoje",
        "description": "Camadas generosas de massa, molho caseiro, presunto e queijo gratinado.",
        "serves": "A partir de 1 pessoa",
        "preparation": "Disponível hoje",
        "lead_time": "Pronta entrega",
        "badge": "Mais pedida",
        "featured": True,
        "highlights": ["Molho caseiro", "Queijo gratinado", "Receita da Vanuza"],
        "accompaniments": ["Molho caseiro", "Queijo gratinado"],
        "options": [
            {"id": "individual", "label": "Individual", "serves": "1 a 2 pessoas", "price": 25.90},
            {"id": "familia", "label": "Tamanho família", "serves": "4 pessoas", "price": 68.90},
        ],
        "image_url": "https://images.unsplash.com/photo-1640063414338-af9faa0c2485?auto=format&fit=crop&w=1400&q=86",
    },
    "lasanha berinjela": {
        "display_name": "Lasanha de Berinjela",
        "category": "Lasanhas",
        "order_type": "Hoje",
        "description": "Berinjela macia, molho de tomate bem temperado e queijo gratinado.",
        "serves": "A partir de 1 pessoa",
        "preparation": "Disponível hoje",
        "lead_time": "Pronta entrega",
        "badge": "Sem carne",
        "featured": False,
        "highlights": ["Leve", "Molho de tomate", "Queijo gratinado"],
        "accompaniments": ["Molho da casa", "Ervas frescas"],
        "options": [
            {"id": "individual", "label": "Individual", "serves": "1 a 2 pessoas", "price": 27.00},
            {"id": "familia", "label": "Tamanho família", "serves": "4 pessoas", "price": 72.90},
        ],
        "image_url": "https://images.unsplash.com/photo-1760390952710-b0e010ec4e50?auto=format&fit=crop&w=1400&q=86",
    },
    "lasanha bolonhesa": {
        "display_name": "Lasanha à Bolonhesa",
        "category": "Lasanhas",
        "order_type": "Encomenda",
        "description": "Molho bolonhesa bem apurado, massa de forno e queijo derretido para compartilhar.",
        "serves": "De 4 a 6 pessoas",
        "preparation": "Sob encomenda",
        "lead_time": "24h de antecedência",
        "badge": "Tamanho família",
        "featured": True,
        "highlights": ["Carne bem temperada", "Queijo derretido", "Ideal para almoço"],
        "accompaniments": ["Molho bolonhesa", "Queijo gratinado"],
        "options": [
            {"id": "media", "label": "Média", "serves": "4 pessoas", "price": 79.90},
            {"id": "grande", "label": "Grande", "serves": "6 pessoas", "price": 109.90},
        ],
        "image_url": "https://images.unsplash.com/photo-1640063414338-af9faa0c2485?auto=format&fit=crop&w=1400&q=86",
    },
    "feijoada completa": {
        "display_name": "Feijoada Completa",
        "category": "Encomendas",
        "order_type": "Encomenda",
        "description": "Feijoada caprichada com acompanhamentos para um almoço completo em família.",
        "serves": "De 2 a 6 pessoas",
        "preparation": "Sob encomenda",
        "lead_time": "24h de antecedência",
        "badge": "Fim de semana",
        "featured": True,
        "highlights": ["Feijão preto", "Carnes selecionadas", "Acompanhamentos completos"],
        "accompaniments": ["Arroz", "Couve", "Farofa", "Vinagrete"],
        "options": [
            {"id": "2-pessoas", "label": "Para 2 pessoas", "serves": "2 pessoas", "price": 39.90},
            {"id": "4-pessoas", "label": "Para 4 pessoas", "serves": "4 pessoas", "price": 74.90},
            {"id": "6-pessoas", "label": "Para 6 pessoas", "serves": "6 pessoas", "price": 104.90},
        ],
        "image_url": "https://images.unsplash.com/photo-1664741662725-bd131742b7b7?auto=format&fit=crop&w=1400&q=86",
    },
    "escondidinho carne de sol": {
        "display_name": "Escondidinho de Carne de Sol",
        "category": "Encomendas",
        "order_type": "Encomenda",
        "description": "Carne de sol bem temperada, purê cremoso de macaxeira e cobertura gratinada.",
        "serves": "De 2 a 5 pessoas",
        "preparation": "Sob encomenda",
        "lead_time": "24h de antecedência",
        "badge": "Especial da casa",
        "featured": False,
        "highlights": ["Carne de sol", "Macaxeira cremosa", "Queijo gratinado"],
        "accompaniments": ["Queijo gratinado", "Cebolinha"],
        "options": [
            {"id": "medio", "label": "Médio", "serves": "2 a 3 pessoas", "price": 46.90},
            {"id": "familia", "label": "Família", "serves": "4 a 5 pessoas", "price": 89.90},
        ],
        "image_url": "https://images.unsplash.com/photo-1689860892307-7db54ab276ba?auto=format&fit=crop&w=1400&q=86",
    },
    "frango assado batatas": {
        "display_name": "Frango Assado com Batatas",
        "category": "Assados",
        "order_type": "Encomenda",
        "description": "Frango douradinho, temperado com ervas e assado com batatas macias.",
        "serves": "De 3 a 5 pessoas",
        "preparation": "Sob encomenda",
        "lead_time": "24h de antecedência",
        "badge": "Almoço em família",
        "featured": False,
        "highlights": ["Frango inteiro", "Batatas assadas", "Tempero da casa"],
        "accompaniments": ["Batatas", "Molho do assado"],
        "options": [
            {"id": "assado", "label": "Frango assado", "serves": "3 a 4 pessoas", "price": 54.90},
            {"id": "almoco-completo", "label": "Almoço completo", "serves": "4 a 5 pessoas", "price": 89.90},
        ],
        "image_url": "https://images.unsplash.com/photo-1456404823214-a69ef7a1fae5?auto=format&fit=crop&w=1400&q=86",
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
            options = presentation.get(
                "options",
                [
                    {
                        "id": "padrao",
                        "label": "Porção padrão",
                        "serves": presentation.get("serves", "Porção individual"),
                        "price": dish.price,
                    }
                ],
            )

            menu.append(
                {
                    "dish_name": dish.name,
                    "display_name": presentation.get(
                        "display_name", dish.name.title()
                    ),
                    "ingredients": ingredients,
                    "price": min(float(option["price"]) for option in options),
                    "base_price": dish.price,
                    "restrictions": sorted(
                        item.value for item in restrictions
                    ),
                    "category": presentation.get("category", "Cardápio"),
                    "order_type": presentation.get("order_type", "Hoje"),
                    "description": presentation.get(
                        "description",
                        "Prato preparado com cuidado e ingredientes selecionados.",
                    ),
                    "serves": presentation.get("serves", "Porção individual"),
                    "preparation": presentation.get(
                        "preparation", "Consulte disponibilidade"
                    ),
                    "lead_time": presentation.get(
                        "lead_time", "Consulte disponibilidade"
                    ),
                    "badge": presentation.get("badge", "Feito em casa"),
                    "featured": presentation.get("featured", False),
                    "highlights": presentation.get("highlights", []),
                    "accompaniments": presentation.get("accompaniments", []),
                    "options": options,
                    "image_url": presentation.get("image_url", ""),
                }
            )

        return menu
