from csv import DictReader
from pathlib import Path

from src.models.dish import Dish
from src.models.ingredient import Ingredient


class MenuData:
    """Carrega o cardápio a partir do CSV e agrupa os ingredientes por prato."""

    def __init__(self, source_path: str) -> None:
        self.source_path = Path(source_path)
        self.dishes = set()
        self._load_dishes()

    def _load_dishes(self) -> None:
        with self.source_path.open(encoding="utf-8") as source_file:
            for row in DictReader(source_file):
                candidate = Dish(row["dish"], float(row["price"]))
                dish = next(
                    (current for current in self.dishes if current == candidate),
                    None,
                )

                if dish is None:
                    dish = candidate
                    self.dishes.add(dish)

                dish.add_ingredient_dependency(
                    Ingredient(row["ingredient"]),
                    int(row["recipe_amount"]),
                )
