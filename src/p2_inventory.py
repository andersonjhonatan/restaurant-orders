import math
from typing import Dict, List

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

import src.app as legacy_app
import src.p1_security as p1
from src.services.inventory_management import (
    InvalidInventoryAdjustment,
    InventoryItemNotFound,
    InventoryManagement,
    InventoryManagementUnavailable,
    RecipeNotConfigured,
)


app = p1.app
inventory_management = InventoryManagement(legacy_app.DATABASE_URL)


class InventoryAdjustmentInput(BaseModel):
    ingredient: str = Field(min_length=1, max_length=120)
    delta: int = Field(ge=-100000, le=100000)
    reason: str = Field(min_length=2, max_length=60)
    note: str = Field(default="", max_length=240)


class InventoryThresholdInput(BaseModel):
    threshold: int = Field(ge=0, le=100000)


class RecipeItemInput(BaseModel):
    ingredient: str = Field(min_length=1, max_length=120)
    amount: int = Field(ge=1, le=100000)


class RecipeInput(BaseModel):
    items: List[RecipeItemInput] = Field(min_items=1, max_items=80)
    option_factors: Dict[str, int] = Field(default_factory=dict)


def _base_builder():
    builder = legacy_app.menu_builder
    return getattr(builder, "base_builder", builder)


def _base_recipes() -> Dict[str, Dict[str, int]]:
    recipes = {}
    for dish in _base_builder().menu_data.dishes:
        recipes[dish.name] = {
            ingredient.name: int(amount)
            for ingredient, amount in dish.recipe.items()
        }
    return recipes


def _seed_base_recipes() -> None:
    try:
        inventory_management.seed_recipes(_base_recipes())
    except Exception:
        # O fallback legado mantém o cardápio funcional até a migração existir.
        pass


def _inventory_error(exc: Exception):
    if isinstance(exc, InventoryItemNotFound):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, RecipeNotConfigured):
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if isinstance(exc, InvalidInventoryAdjustment):
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if isinstance(exc, InventoryManagementUnavailable):
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    raise HTTPException(status_code=422, detail=str(exc)) from exc


def _option_factor(dish_name: str, option_id: str) -> int:
    if not legacy_app.DATABASE_URL or not option_id:
        return 1
    try:
        if not inventory_management._table_exists("menu_product_option_factors"):
            return 1
        with inventory_management._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT factor
                FROM menu_product_option_factors
                WHERE dish_name = %s AND option_id = %s
                """,
                (dish_name, option_id),
            )
            row = cur.fetchone()
            return max(1, int(row["factor"])) if row else 1
    except Exception:
        return 1


def _save_option_factors(dish_name: str, factors: Dict[str, int]) -> None:
    if not legacy_app.DATABASE_URL:
        return
    if not inventory_management._table_exists("menu_product_option_factors"):
        raise InventoryManagementUnavailable("A migração dos fatores de estoque ainda não foi aplicada.")
    clean = {
        str(option_id).strip(): max(1, min(int(factor), 50))
        for option_id, factor in factors.items()
        if str(option_id).strip()
    }
    with inventory_management._connect() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM menu_product_option_factors WHERE dish_name = %s", (dish_name,))
        for option_id, factor in clean.items():
            cur.execute(
                """
                INSERT INTO menu_product_option_factors (dish_name, option_id, factor)
                VALUES (%s, %s, %s)
                """,
                (dish_name, option_id, factor),
            )


def _seed_option_factors() -> None:
    if not legacy_app.DATABASE_URL:
        return
    try:
        if not inventory_management._table_exists("menu_product_option_factors"):
            return
        base_menu = _base_builder().get_main_menu(restriction=None)
        with inventory_management._connect() as conn, conn.cursor() as cur:
            for product in base_menu:
                base_price = max(float(product.get("base_price") or product.get("price") or 1), 0.01)
                for option in product.get("options") or []:
                    factor = max(1, math.ceil(float(option.get("price") or base_price) / base_price))
                    cur.execute(
                        """
                        INSERT INTO menu_product_option_factors (dish_name, option_id, factor)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (dish_name, option_id) DO NOTHING
                        """,
                        (product["dish_name"], option["id"], factor),
                    )
    except Exception:
        pass


_seed_base_recipes()
_seed_option_factors()

# A partir daqui, toda verificação/baixa de estoque usa a receita persistida.
_legacy_dish_recipe = legacy_app._dish_recipe


def _managed_dish_recipe(dish_name: str) -> Dict[str, int]:
    recipe = inventory_management.get_recipe(dish_name)
    return recipe or _legacy_dish_recipe(dish_name)


def _managed_stock_requirements(items: List[Dict]) -> Dict[str, int]:
    requirements: Dict[str, int] = {}
    menu_by_name = {item["dish_name"]: item for item in legacy_app.menu_builder.get_main_menu()}
    for item in items:
        dish_name = item["dish_name"]
        dish = menu_by_name.get(dish_name)
        if not dish:
            continue
        option_id = str(item.get("option") or "")
        factor = _option_factor(dish_name, option_id)
        multiplier = int(item.get("quantity", 1)) * factor
        for ingredient, amount in _managed_dish_recipe(dish_name).items():
            requirements[ingredient] = requirements.get(ingredient, 0) + int(amount) * multiplier
    return requirements


legacy_app._dish_recipe = _managed_dish_recipe
legacy_app._stock_requirements = _managed_stock_requirements

# Evita prato ativo sem receita, preservando o P0 de estoque transacional.
_original_create_product = p1.product_catalog.create_product
_original_update_product = p1.product_catalog.update_product
_original_set_active = p1.product_catalog.set_active


def _safe_create_product(payload: Dict):
    data = dict(payload)
    if data.get("active") and not inventory_management.recipe_ready(data.get("dish_name", "")):
        data["active"] = False
    return _original_create_product(data)


def _safe_update_product(dish_name: str, payload: Dict):
    data = dict(payload)
    if data.get("active") and not inventory_management.recipe_ready(dish_name):
        raise RecipeNotConfigured("Configure a receita de estoque antes de ativar este prato.")
    return _original_update_product(dish_name, data)


def _safe_set_active(dish_name: str, active: bool):
    if active and not inventory_management.recipe_ready(dish_name):
        raise RecipeNotConfigured("Configure a receita de estoque antes de ativar este prato.")
    return _original_set_active(dish_name, active)


p1.product_catalog.create_product = _safe_create_product
p1.product_catalog.update_product = _safe_update_product
p1.product_catalog.set_active = _safe_set_active


@app.get("/api/admin/inventory", include_in_schema=False)
def admin_inventory(request: Request):
    p1._require_admin_session(request)
    try:
        items = inventory_management.list_inventory()
        movements = inventory_management.recent_movements(limit=30)
        low = [item for item in items if int(item.get("available_amount", 0)) <= int(item.get("low_stock_threshold", 0))]
        return {
            "items": items,
            "movements": movements,
            "summary": {
                "total": len(items),
                "low_stock": len(low),
                "unavailable": len([item for item in items if int(item.get("available_amount", 0)) <= 0]),
            },
        }
    except Exception as exc:
        _inventory_error(exc)


@app.post("/api/admin/inventory/adjust", include_in_schema=False)
def admin_adjust_inventory(payload: InventoryAdjustmentInput, request: Request):
    username = p1._require_admin_session(request, mutation=True)
    try:
        item = inventory_management.adjust_inventory(
            payload.ingredient,
            payload.delta,
            reason=payload.reason,
            note=payload.note,
            created_by=username,
        )
        return {"item": item}
    except Exception as exc:
        _inventory_error(exc)


@app.patch("/api/admin/inventory/{ingredient}/threshold", include_in_schema=False)
def admin_inventory_threshold(ingredient: str, payload: InventoryThresholdInput, request: Request):
    p1._require_admin_session(request, mutation=True)
    try:
        item = inventory_management.set_threshold(ingredient, payload.threshold)
        return {"item": item}
    except Exception as exc:
        _inventory_error(exc)


@app.get("/api/admin/products/{dish_name}/recipe", include_in_schema=False)
def admin_product_recipe(dish_name: str, request: Request):
    p1._require_admin_session(request)
    try:
        recipe = inventory_management.get_recipe(dish_name)
        product = p1.product_catalog.get_product(dish_name, p1._base_catalog_seed())
        factors = {
            option["id"]: _option_factor(dish_name, option["id"])
            for option in product.get("options") or []
        }
        return {"dish_name": dish_name, "recipe": recipe, "option_factors": factors}
    except Exception as exc:
        _inventory_error(exc)


@app.put("/api/admin/products/{dish_name}/recipe", include_in_schema=False)
def admin_save_product_recipe(dish_name: str, payload: RecipeInput, request: Request):
    p1._require_admin_session(request, mutation=True)
    try:
        p1.product_catalog.get_product(dish_name, p1._base_catalog_seed())
        recipe = inventory_management.save_recipe(
            dish_name,
            {item.ingredient: item.amount for item in payload.items},
        )
        _save_option_factors(dish_name, payload.option_factors)
        return {"dish_name": dish_name, "recipe": recipe, "option_factors": payload.option_factors}
    except Exception as exc:
        _inventory_error(exc)
