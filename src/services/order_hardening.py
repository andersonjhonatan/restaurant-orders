import json
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional


class RateLimitExceeded(Exception):
    pass


class StockUnavailable(Exception):
    def __init__(self, ingredient: str) -> None:
        super().__init__(ingredient)
        self.ingredient = ingredient


class OrderHardening:
    """Proteções de produção para pedidos armazenados em PostgreSQL."""

    def __init__(self, database_url: Optional[str]) -> None:
        self.database_url = database_url

    @property
    def enabled(self) -> bool:
        return bool(self.database_url)

    def _connect(self):
        import psycopg
        from psycopg.rows import dict_row

        return psycopg.connect(self.database_url, row_factory=dict_row)

    @staticmethod
    def _serialize(order: Dict) -> Dict:
        data = dict(order)
        for field in ("created_at", "updated_at"):
            if data.get(field) and hasattr(data[field], "isoformat"):
                data[field] = data[field].isoformat()
        if data.get("total") is not None:
            data["total"] = float(data["total"])
        return data

    @staticmethod
    def _lock_and_validate_inventory(cursor, requirements: Dict[str, int]) -> None:
        ingredients = sorted(requirements)
        if not ingredients:
            return
        cursor.execute(
            """
            SELECT ingredient, available_amount
            FROM inventory
            WHERE ingredient = ANY(%s)
            ORDER BY ingredient
            FOR UPDATE
            """,
            (ingredients,),
        )
        available = {
            row["ingredient"]: int(row["available_amount"])
            for row in cursor.fetchall()
        }
        for ingredient, required in requirements.items():
            if available.get(ingredient, 0) < required:
                raise StockUnavailable(ingredient)

    @staticmethod
    def _consume_inventory(cursor, requirements: Dict[str, int]) -> None:
        for ingredient, required in requirements.items():
            cursor.execute(
                """
                UPDATE inventory
                SET available_amount = available_amount - %s,
                    updated_at = NOW()
                WHERE ingredient = %s
                """,
                (required, ingredient),
            )

    def get_inventory(self) -> Dict[str, int]:
        if not self.enabled:
            return {}
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT ingredient, available_amount FROM inventory")
                return {
                    row["ingredient"]: int(row["available_amount"])
                    for row in cursor.fetchall()
                }

    def find_by_idempotency(self, key: str) -> Optional[Dict]:
        if not self.enabled or not key:
            return None
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT * FROM orders WHERE idempotency_key = %s LIMIT 1",
                    (key,),
                )
                order = cursor.fetchone()
        return self._serialize(order) if order else None

    def find_recent_duplicate(
        self, fingerprint: str, seconds: int = 60
    ) -> Optional[Dict]:
        if not self.enabled or not fingerprint:
            return None
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=seconds)
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT * FROM orders
                    WHERE request_fingerprint = %s AND created_at >= %s
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (fingerprint, cutoff),
                )
                order = cursor.fetchone()
        return self._serialize(order) if order else None

    def check_rate_limit(
        self,
        client_hash: str,
        max_requests: int = 8,
        window_seconds: int = 60,
    ) -> None:
        if not self.enabled:
            return

        cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT pg_advisory_xact_lock(hashtext(%s))",
                    (client_hash,),
                )
                cursor.execute(
                    """
                    DELETE FROM order_request_events
                    WHERE created_at < NOW() - INTERVAL '10 minutes'
                    """
                )
                cursor.execute(
                    """
                    SELECT COUNT(*) AS total
                    FROM order_request_events
                    WHERE client_hash = %s AND created_at >= %s
                    """,
                    (client_hash, cutoff),
                )
                total = int(cursor.fetchone()["total"])
                if total >= max_requests:
                    raise RateLimitExceeded()
                cursor.execute(
                    "INSERT INTO order_request_events (client_hash) VALUES (%s)",
                    (client_hash,),
                )
            conn.commit()

    def create_order(
        self,
        payload: Dict,
        stock_requirements: Dict[str, int],
        *,
        reserve_stock: bool,
        idempotency_key: str,
        request_fingerprint: str,
        client_hash: str,
    ) -> Dict:
        if not self.enabled:
            raise RuntimeError("PostgreSQL hardening is not enabled")

        with self._connect() as conn:
            with conn.cursor() as cursor:
                if idempotency_key:
                    cursor.execute(
                        "SELECT * FROM orders WHERE idempotency_key = %s LIMIT 1",
                        (idempotency_key,),
                    )
                    existing = cursor.fetchone()
                    if existing:
                        return self._serialize(existing)

                if reserve_stock:
                    self._lock_and_validate_inventory(cursor, stock_requirements)
                    self._consume_inventory(cursor, stock_requirements)

                cursor.execute(
                    """
                    INSERT INTO orders (
                        status, customer_name, phone, delivery_method, address,
                        payment_method, notes, items, total, idempotency_key,
                        request_fingerprint, client_hash, stock_reserved
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s,
                        %s, %s, %s, %s
                    )
                    RETURNING *
                    """,
                    (
                        payload["status"],
                        payload["customer_name"],
                        payload["phone"],
                        payload["delivery_method"],
                        payload.get("address", ""),
                        payload["payment_method"],
                        payload.get("notes", ""),
                        json.dumps(payload["items"], ensure_ascii=False),
                        payload["total"],
                        idempotency_key or None,
                        request_fingerprint,
                        client_hash,
                        reserve_stock,
                    ),
                )
                order = cursor.fetchone()
            conn.commit()
        return self._serialize(order)

    def reserve_existing_order(
        self, order_id: int, requirements: Dict[str, int]
    ) -> None:
        if not self.enabled:
            return
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT stock_reserved FROM orders WHERE id = %s FOR UPDATE",
                    (order_id,),
                )
                order = cursor.fetchone()
                if not order or order["stock_reserved"]:
                    return
                self._lock_and_validate_inventory(cursor, requirements)
                self._consume_inventory(cursor, requirements)
                cursor.execute(
                    "UPDATE orders SET stock_reserved = TRUE WHERE id = %s",
                    (order_id,),
                )
            conn.commit()

    def release_existing_order(
        self, order_id: int, requirements: Dict[str, int]
    ) -> None:
        if not self.enabled:
            return
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT stock_reserved FROM orders WHERE id = %s FOR UPDATE",
                    (order_id,),
                )
                order = cursor.fetchone()
                if not order or not order["stock_reserved"]:
                    return
                for ingredient, amount in requirements.items():
                    cursor.execute(
                        """
                        UPDATE inventory
                        SET available_amount = LEAST(initial_amount, available_amount + %s),
                            updated_at = NOW()
                        WHERE ingredient = %s
                        """,
                        (amount, ingredient),
                    )
                cursor.execute(
                    "UPDATE orders SET stock_reserved = FALSE WHERE id = %s",
                    (order_id,),
                )
            conn.commit()
