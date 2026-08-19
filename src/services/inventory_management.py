from copy import deepcopy
from typing import Dict, List, Optional

import psycopg
from psycopg.rows import dict_row


class InventoryManagementUnavailable(RuntimeError):
    pass


class InventoryItemNotFound(ValueError):
    pass


class InvalidInventoryAdjustment(ValueError):
    pass


class RecipeNotConfigured(ValueError):
    pass


class InventoryManagement:
    def __init__(self, database_url: Optional[str]):
        self.database_url = database_url
        self._memory_inventory: Dict[str, Dict] = {}
        self._memory_recipes: Dict[str, Dict[str, int]] = {}
        self._memory_movements: List[Dict] = []

    @property
    def database_enabled(self) -> bool:
        return bool(self.database_url)

    def _connect(self):
        if not self.database_url:
            raise InventoryManagementUnavailable("Banco de estoque não configurado.")
        return psycopg.connect(self.database_url, row_factory=dict_row)

    def _table_exists(self, name: str) -> bool:
        if not self.database_enabled:
            return False
        try:
            with self._connect() as conn, conn.cursor() as cur:
                cur.execute("SELECT to_regclass(%s) AS table_name", (f"public.{name}",))
                row = cur.fetchone()
                return bool(row and row["table_name"])
        except Exception:
            return False

    @property
    def enabled(self) -> bool:
        return self.database_enabled and self._table_exists("menu_product_recipes")

    def seed_recipes(self, recipes: Dict[str, Dict[str, int]]) -> None:
        clean = {
            str(dish).strip().casefold(): {
                str(ingredient).strip().casefold(): int(amount)
                for ingredient, amount in recipe.items()
                if str(ingredient).strip() and int(amount) > 0
            }
            for dish, recipe in recipes.items()
            if str(dish).strip()
        }

        if not self.database_enabled:
            for dish, recipe in clean.items():
                self._memory_recipes.setdefault(dish, deepcopy(recipe))
            return
        if not self._table_exists("menu_product_recipes"):
            return

        with self._connect() as conn, conn.cursor() as cur:
            for dish, recipe in clean.items():
                for ingredient, amount in recipe.items():
                    cur.execute(
                        """
                        INSERT INTO menu_product_recipes (dish_name, ingredient, amount)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (dish_name, ingredient) DO NOTHING
                        """,
                        (dish, ingredient, amount),
                    )

    def list_inventory(self) -> List[Dict]:
        if not self.database_enabled:
            return sorted(
                [deepcopy(item) for item in self._memory_inventory.values()],
                key=lambda item: item["ingredient"],
            )
        if not self._table_exists("inventory"):
            raise InventoryManagementUnavailable("Estoque ainda não foi configurado.")

        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT ingredient, initial_amount, available_amount,
                       COALESCE(low_stock_threshold, 0) AS low_stock_threshold,
                       updated_at
                FROM inventory
                ORDER BY ingredient
                """
            )
            return [dict(row) for row in cur.fetchall()]

    def adjust_inventory(
        self,
        ingredient: str,
        delta: int,
        *,
        reason: str,
        note: str = "",
        created_by: str = "admin",
    ) -> Dict:
        name = str(ingredient or "").strip().casefold()
        delta = int(delta)
        if not name:
            raise InventoryItemNotFound("Ingrediente não encontrado.")
        if delta == 0:
            raise InvalidInventoryAdjustment("Informe uma quantidade diferente de zero.")
        if abs(delta) > 100000:
            raise InvalidInventoryAdjustment("Ajuste de estoque muito grande.")

        if not self.database_enabled:
            item = self._memory_inventory.get(name)
            if not item:
                raise InventoryItemNotFound("Ingrediente não encontrado.")
            next_amount = int(item["available_amount"]) + delta
            if next_amount < 0:
                raise InvalidInventoryAdjustment("O estoque não pode ficar negativo.")
            item["available_amount"] = next_amount
            item["initial_amount"] = max(int(item["initial_amount"]), next_amount)
            movement = {
                "ingredient": name,
                "delta": delta,
                "balance_after": next_amount,
                "reason": reason,
                "note": note,
                "created_by": created_by,
            }
            self._memory_movements.append(movement)
            return deepcopy(item)

        if not self._table_exists("inventory_movements"):
            raise InventoryManagementUnavailable("A migração de estoque do P2 ainda não foi aplicada.")

        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT ingredient, initial_amount, available_amount,
                       COALESCE(low_stock_threshold, 0) AS low_stock_threshold
                FROM inventory
                WHERE ingredient = %s
                FOR UPDATE
                """,
                (name,),
            )
            item = cur.fetchone()
            if not item:
                raise InventoryItemNotFound("Ingrediente não encontrado.")
            next_amount = int(item["available_amount"]) + delta
            if next_amount < 0:
                raise InvalidInventoryAdjustment("O estoque não pode ficar negativo.")

            cur.execute(
                """
                UPDATE inventory
                SET available_amount = %s,
                    initial_amount = GREATEST(initial_amount, %s),
                    updated_at = NOW()
                WHERE ingredient = %s
                RETURNING ingredient, initial_amount, available_amount,
                          COALESCE(low_stock_threshold, 0) AS low_stock_threshold,
                          updated_at
                """,
                (next_amount, next_amount, name),
            )
            updated = dict(cur.fetchone())
            cur.execute(
                """
                INSERT INTO inventory_movements (
                    ingredient, delta, balance_after, reason, note, created_by
                ) VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (name, delta, next_amount, reason[:60], note[:240], created_by[:80]),
            )
        return updated

    def set_threshold(self, ingredient: str, threshold: int) -> Dict:
        name = str(ingredient or "").strip().casefold()
        threshold = int(threshold)
        if threshold < 0 or threshold > 100000:
            raise InvalidInventoryAdjustment("Limite de estoque baixo inválido.")

        if not self.database_enabled:
            item = self._memory_inventory.get(name)
            if not item:
                raise InventoryItemNotFound("Ingrediente não encontrado.")
            item["low_stock_threshold"] = threshold
            return deepcopy(item)

        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE inventory
                SET low_stock_threshold = %s, updated_at = NOW()
                WHERE ingredient = %s
                RETURNING ingredient, initial_amount, available_amount,
                          low_stock_threshold, updated_at
                """,
                (threshold, name),
            )
            row = cur.fetchone()
            if not row:
                raise InventoryItemNotFound("Ingrediente não encontrado.")
            return dict(row)

    def recent_movements(self, limit: int = 50) -> List[Dict]:
        safe_limit = max(1, min(int(limit), 200))
        if not self.database_enabled:
            return list(reversed(self._memory_movements[-safe_limit:]))
        if not self._table_exists("inventory_movements"):
            return []
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, ingredient, delta, balance_after, reason, note,
                       created_by, created_at
                FROM inventory_movements
                ORDER BY created_at DESC, id DESC
                LIMIT %s
                """,
                (safe_limit,),
            )
            return [dict(row) for row in cur.fetchall()]

    def get_recipe(self, dish_name: str) -> Dict[str, int]:
        dish = str(dish_name or "").strip().casefold()
        if not dish:
            return {}
        if not self.database_enabled:
            return deepcopy(self._memory_recipes.get(dish, {}))
        if not self._table_exists("menu_product_recipes"):
            return {}
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT ingredient, amount
                FROM menu_product_recipes
                WHERE dish_name = %s
                ORDER BY ingredient
                """,
                (dish,),
            )
            return {row["ingredient"]: int(row["amount"]) for row in cur.fetchall()}

    def save_recipe(self, dish_name: str, recipe: Dict[str, int]) -> Dict[str, int]:
        dish = str(dish_name or "").strip().casefold()
        clean = {
            str(ingredient).strip().casefold(): int(amount)
            for ingredient, amount in recipe.items()
            if str(ingredient).strip() and int(amount) > 0
        }
        if not dish:
            raise RecipeNotConfigured("Prato não encontrado.")
        if not clean:
            raise RecipeNotConfigured("Cadastre pelo menos um ingrediente para ativar o prato.")

        if not self.database_enabled:
            missing = [name for name in clean if name not in self._memory_inventory]
            if missing:
                raise InventoryItemNotFound(f"Ingrediente não encontrado: {missing[0]}")
            self._memory_recipes[dish] = deepcopy(clean)
            return deepcopy(clean)

        if not self._table_exists("menu_product_recipes"):
            raise InventoryManagementUnavailable("A migração de receitas do P2 ainda não foi aplicada.")

        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT ingredient FROM inventory WHERE ingredient = ANY(%s)",
                (list(clean),),
            )
            existing = {row["ingredient"] for row in cur.fetchall()}
            missing = [name for name in clean if name not in existing]
            if missing:
                raise InventoryItemNotFound(f"Ingrediente não encontrado: {missing[0]}")

            cur.execute("DELETE FROM menu_product_recipes WHERE dish_name = %s", (dish,))
            for ingredient, amount in clean.items():
                cur.execute(
                    """
                    INSERT INTO menu_product_recipes (dish_name, ingredient, amount)
                    VALUES (%s, %s, %s)
                    """,
                    (dish, ingredient, amount),
                )
        return clean

    def recipe_ready(self, dish_name: str) -> bool:
        return bool(self.get_recipe(dish_name))
