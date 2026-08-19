import json
import re
from copy import deepcopy
from datetime import datetime
from typing import Dict, Iterable, List, Optional
from zoneinfo import ZoneInfo

import psycopg
from psycopg.rows import dict_row


LOCAL_TZ = ZoneInfo("America/Recife")
JSON_FIELDS = {
    "ingredients",
    "restrictions",
    "highlights",
    "accompaniments",
    "options",
    "available_days",
}


class CatalogUnavailable(RuntimeError):
    pass


class ProductAlreadyExists(ValueError):
    pass


class ProductNotFound(ValueError):
    pass


def canonical_dish_name(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().casefold())


def _json_value(value):
    return json.dumps(value, ensure_ascii=False)


def _normalize_product(product: Dict, sort_order: int = 0) -> Dict:
    options = deepcopy(product.get("options") or [])
    if not options:
        price = float(product.get("price") or product.get("base_price") or 0)
        options = [
            {
                "id": "padrao",
                "label": "Porção padrão",
                "serves": product.get("serves") or "Porção padrão",
                "price": price,
            }
        ]

    normalized = {
        "dish_name": canonical_dish_name(product.get("dish_name", "")),
        "display_name": str(product.get("display_name") or product.get("dish_name") or "").strip(),
        "category": str(product.get("category") or "Cardápio").strip(),
        "order_type": str(product.get("order_type") or "Hoje").strip(),
        "description": str(product.get("description") or "").strip(),
        "serves": str(product.get("serves") or "").strip(),
        "preparation": str(product.get("preparation") or "").strip(),
        "lead_time": str(product.get("lead_time") or "").strip(),
        "badge": str(product.get("badge") or "").strip(),
        "featured": bool(product.get("featured", False)),
        "image_url": str(product.get("image_url") or "").strip(),
        "ingredients": [str(item).strip() for item in product.get("ingredients", []) if str(item).strip()],
        "restrictions": [str(item).strip() for item in product.get("restrictions", []) if str(item).strip()],
        "highlights": [str(item).strip() for item in product.get("highlights", []) if str(item).strip()],
        "accompaniments": [str(item).strip() for item in product.get("accompaniments", []) if str(item).strip()],
        "options": options,
        "active": bool(product.get("active", True)),
        "sort_order": int(product.get("sort_order", sort_order) or 0),
        "available_days": sorted({int(day) for day in product.get("available_days", list(range(7))) if 0 <= int(day) <= 6}),
        "available_start": str(product.get("available_start") or "").strip(),
        "available_end": str(product.get("available_end") or "").strip(),
    }
    if not normalized["available_days"]:
        normalized["available_days"] = list(range(7))
    return normalized


def _is_available(product: Dict, now: Optional[datetime] = None) -> bool:
    if not product.get("active", True):
        return False

    current = now or datetime.now(LOCAL_TZ)
    days = product.get("available_days") or list(range(7))
    if current.weekday() not in {int(day) for day in days}:
        return False

    start = str(product.get("available_start") or "").strip()
    end = str(product.get("available_end") or "").strip()
    if not start or not end:
        return True

    current_value = current.strftime("%H:%M")
    if start <= end:
        return start <= current_value <= end
    return current_value >= start or current_value <= end


class ProductCatalog:
    """Catálogo administrável com fallback em memória para dev/testes.

    Em produção, a tabela é criada por migração controlada. Enquanto a migração
    ainda não existir, o catálogo público pode continuar usando o menu-base sem
    derrubar o site.
    """

    def __init__(self, database_url: Optional[str]):
        self.database_url = database_url
        self._memory: Dict[str, Dict] = {}

    @property
    def database_enabled(self) -> bool:
        return bool(self.database_url)

    def _connect(self):
        if not self.database_url:
            raise CatalogUnavailable("Banco do catálogo não configurado.")
        return psycopg.connect(self.database_url, row_factory=dict_row)

    def _table_exists(self) -> bool:
        if not self.database_enabled:
            return False
        try:
            with self._connect() as conn, conn.cursor() as cur:
                cur.execute("SELECT to_regclass('public.menu_products') AS table_name")
                row = cur.fetchone()
                return bool(row and row["table_name"])
        except Exception:
            return False

    def seed_products(self, products: Iterable[Dict]) -> None:
        normalized = [_normalize_product(item, index * 10) for index, item in enumerate(products)]
        normalized = [item for item in normalized if item["dish_name"]]

        if not self.database_enabled:
            for item in normalized:
                self._memory.setdefault(item["dish_name"], deepcopy(item))
            return

        if not self._table_exists():
            return

        sql = """
            INSERT INTO menu_products (
                dish_name, display_name, category, order_type, description,
                serves, preparation, lead_time, badge, featured, image_url,
                ingredients, restrictions, highlights, accompaniments, options,
                active, sort_order, available_days, available_start, available_end
            ) VALUES (
                %(dish_name)s, %(display_name)s, %(category)s, %(order_type)s,
                %(description)s, %(serves)s, %(preparation)s, %(lead_time)s,
                %(badge)s, %(featured)s, %(image_url)s, %(ingredients)s::jsonb,
                %(restrictions)s::jsonb, %(highlights)s::jsonb,
                %(accompaniments)s::jsonb, %(options)s::jsonb, %(active)s,
                %(sort_order)s, %(available_days)s::jsonb, %(available_start)s,
                %(available_end)s
            ) ON CONFLICT (dish_name) DO NOTHING
        """
        try:
            with self._connect() as conn, conn.cursor() as cur:
                for item in normalized:
                    params = dict(item)
                    for field in JSON_FIELDS:
                        params[field] = _json_value(params[field])
                    cur.execute(sql, params)
        except Exception as exc:
            raise CatalogUnavailable("Não foi possível inicializar o catálogo.") from exc

    def _rows(self) -> List[Dict]:
        if not self.database_enabled:
            return [deepcopy(item) for item in self._memory.values()]
        if not self._table_exists():
            raise CatalogUnavailable("A migração do catálogo ainda não foi aplicada.")

        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT dish_name, display_name, category, order_type, description,
                       serves, preparation, lead_time, badge, featured, image_url,
                       ingredients, restrictions, highlights, accompaniments,
                       options, active, sort_order, available_days,
                       available_start, available_end, created_at, updated_at
                FROM menu_products
                ORDER BY sort_order ASC, display_name ASC
                """
            )
            return [dict(row) for row in cur.fetchall()]

    def list_admin_products(self, seed_products: Iterable[Dict] = ()) -> List[Dict]:
        self.seed_products(seed_products)
        rows = self._rows()
        return sorted(rows, key=lambda item: (int(item.get("sort_order") or 0), item.get("display_name", "").casefold()))

    def public_menu(
        self,
        base_menu: Iterable[Dict],
        restriction=None,
        now: Optional[datetime] = None,
    ) -> List[Dict]:
        base = [deepcopy(item) for item in base_menu]
        self.seed_products(base)

        try:
            rows = self._rows()
        except CatalogUnavailable:
            rows = [_normalize_product(item, index * 10) for index, item in enumerate(base)]

        base_by_name = {canonical_dish_name(item.get("dish_name", "")): item for item in base}
        selected_restriction = getattr(restriction, "value", None)
        result = []

        for row in rows:
            product = {**deepcopy(base_by_name.get(row["dish_name"], {})), **deepcopy(row)}
            if not _is_available(product, now=now):
                continue
            if selected_restriction and selected_restriction in set(product.get("restrictions") or []):
                continue

            options = product.get("options") or []
            if not options:
                continue
            product["price"] = min(float(option.get("price") or 0) for option in options)
            product["base_price"] = float(product.get("base_price") or product["price"])
            for transient in ("created_at", "updated_at", "active", "sort_order", "available_days", "available_start", "available_end"):
                product.pop(transient, None)
            result.append(product)

        return result

    def get_product(self, dish_name: str, seed_products: Iterable[Dict] = ()) -> Dict:
        target = canonical_dish_name(dish_name)
        products = self.list_admin_products(seed_products)
        product = next((item for item in products if item["dish_name"] == target), None)
        if not product:
            raise ProductNotFound("Prato não encontrado.")
        return product

    def create_product(self, payload: Dict) -> Dict:
        product = _normalize_product(payload)
        if not product["dish_name"]:
            raise ValueError("Informe o identificador do prato.")

        if not self.database_enabled:
            if product["dish_name"] in self._memory:
                raise ProductAlreadyExists("Já existe um prato com esse identificador.")
            self._memory[product["dish_name"]] = deepcopy(product)
            return deepcopy(product)

        if not self._table_exists():
            raise CatalogUnavailable("A migração do catálogo ainda não foi aplicada.")

        try:
            with self._connect() as conn, conn.cursor() as cur:
                params = dict(product)
                for field in JSON_FIELDS:
                    params[field] = _json_value(params[field])
                cur.execute(
                    """
                    INSERT INTO menu_products (
                        dish_name, display_name, category, order_type, description,
                        serves, preparation, lead_time, badge, featured, image_url,
                        ingredients, restrictions, highlights, accompaniments, options,
                        active, sort_order, available_days, available_start, available_end
                    ) VALUES (
                        %(dish_name)s, %(display_name)s, %(category)s, %(order_type)s,
                        %(description)s, %(serves)s, %(preparation)s, %(lead_time)s,
                        %(badge)s, %(featured)s, %(image_url)s, %(ingredients)s::jsonb,
                        %(restrictions)s::jsonb, %(highlights)s::jsonb,
                        %(accompaniments)s::jsonb, %(options)s::jsonb, %(active)s,
                        %(sort_order)s, %(available_days)s::jsonb, %(available_start)s,
                        %(available_end)s
                    )
                    RETURNING *
                    """,
                    params,
                )
                return dict(cur.fetchone())
        except psycopg.errors.UniqueViolation as exc:
            raise ProductAlreadyExists("Já existe um prato com esse identificador.") from exc

    def update_product(self, dish_name: str, payload: Dict) -> Dict:
        target = canonical_dish_name(dish_name)
        product = _normalize_product({**payload, "dish_name": target})

        if not self.database_enabled:
            if target not in self._memory:
                raise ProductNotFound("Prato não encontrado.")
            self._memory[target] = deepcopy(product)
            return deepcopy(product)

        if not self._table_exists():
            raise CatalogUnavailable("A migração do catálogo ainda não foi aplicada.")

        params = dict(product)
        for field in JSON_FIELDS:
            params[field] = _json_value(params[field])
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE menu_products SET
                    display_name=%(display_name)s,
                    category=%(category)s,
                    order_type=%(order_type)s,
                    description=%(description)s,
                    serves=%(serves)s,
                    preparation=%(preparation)s,
                    lead_time=%(lead_time)s,
                    badge=%(badge)s,
                    featured=%(featured)s,
                    image_url=%(image_url)s,
                    ingredients=%(ingredients)s::jsonb,
                    restrictions=%(restrictions)s::jsonb,
                    highlights=%(highlights)s::jsonb,
                    accompaniments=%(accompaniments)s::jsonb,
                    options=%(options)s::jsonb,
                    active=%(active)s,
                    sort_order=%(sort_order)s,
                    available_days=%(available_days)s::jsonb,
                    available_start=%(available_start)s,
                    available_end=%(available_end)s,
                    updated_at=now()
                WHERE dish_name=%(dish_name)s
                RETURNING *
                """,
                params,
            )
            row = cur.fetchone()
            if not row:
                raise ProductNotFound("Prato não encontrado.")
            return dict(row)

    def set_active(self, dish_name: str, active: bool) -> Dict:
        target = canonical_dish_name(dish_name)
        if not self.database_enabled:
            if target not in self._memory:
                raise ProductNotFound("Prato não encontrado.")
            self._memory[target]["active"] = bool(active)
            return deepcopy(self._memory[target])

        if not self._table_exists():
            raise CatalogUnavailable("A migração do catálogo ainda não foi aplicada.")
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE menu_products SET active=%s, updated_at=now() WHERE dish_name=%s RETURNING *",
                (bool(active), target),
            )
            row = cur.fetchone()
            if not row:
                raise ProductNotFound("Prato não encontrado.")
            return dict(row)

    def reorder(self, dish_names: List[str]) -> List[Dict]:
        names = [canonical_dish_name(name) for name in dish_names]
        if len(names) != len(set(names)):
            raise ValueError("A ordem contém pratos repetidos.")

        if not self.database_enabled:
            missing = [name for name in names if name not in self._memory]
            if missing:
                raise ProductNotFound("Um dos pratos não foi encontrado.")
            for index, name in enumerate(names):
                self._memory[name]["sort_order"] = index * 10
            return self.list_admin_products()

        if not self._table_exists():
            raise CatalogUnavailable("A migração do catálogo ainda não foi aplicada.")
        with self._connect() as conn, conn.cursor() as cur:
            for index, name in enumerate(names):
                cur.execute(
                    "UPDATE menu_products SET sort_order=%s, updated_at=now() WHERE dish_name=%s",
                    (index * 10, name),
                )
                if cur.rowcount != 1:
                    raise ProductNotFound("Um dos pratos não foi encontrado.")
        return self.list_admin_products()


class ManagedMenuBuilder:
    def __init__(self, base_builder, catalog: ProductCatalog):
        self.base_builder = base_builder
        self.catalog = catalog
        self.menu_data = base_builder.menu_data
        self.inventory = base_builder.inventory

    def make_order(self, dish_name: str) -> None:
        return self.base_builder.make_order(dish_name)

    def get_main_menu(self, restriction=None) -> List[Dict]:
        base = self.base_builder.get_main_menu(restriction=None)
        return self.catalog.public_menu(base, restriction=restriction)
