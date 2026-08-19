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
    """Proteções de produção para pedidos armazenados em PostgreSQL.

    Mantém o fluxo local/JSON compatível: quando DATABASE_URL não existe,
    estas proteções de banco ficam desabilitadas e o OrderStore continua sendo
    usado normalmente pelo aplicativo.
    """

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

    def get_inventory(self) -> Dict[str, int]:
        if not self.enabled:
            return {}
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT ingredient, available_amount FROM inventory"
                )
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
                # Serializa as tentativas do mesmo cliente para evitar corrida.
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

    def create_order_with_stock(
        self,
        payload: Dict,
        stock_requirements: Dict[str, int],
        *,
        idempotency_key: str,
        request_fingerprint: str,
        client_hash: str,
    ) -> Dict:
        if not self.enabled:
            raise RuntimeError("PostgreSQL hardening is not enabled")

        with self._connect() as conn:
            with conn.cursor() as cursor:
                # Idempotência é verificada novamente dentro da transação.
                if idempotency_key:
                    cursor.execute(
                        "SELECT * FROM orders WHERE idempotency_key = %s LIMIT 1",
                        (idempotency_key,),
                    )
                    existing = cursor.fetchone()
                    if existing:
                        return self._serialize(existing)

                ingredients = sorted(stock_requirements)
                locked_inventory: Dict[str, int] = {}
                if ingredients:
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
                    locked_inventory = {
                        row["ingredient"]: int(row["available_amount"])
                        for row in cursor.fetchall()
                    }

                for ingredient, required in stock_requirements.items():
                    if locked_inventory.get(ingredient, 0) < required:
                        raise StockUnavailable(ingredient)

                for ingredient, required in stock_requirements.items():
                    cursor.execute(
                        """
                        UPDATE inventory
                        SET available_amount = available_amount - %s,
                            updated_at = NOW()
                        WHERE ingredient = %s
                        """,
                        (required, ingredient),
                    )

                cursor.execute(
                    """
                    INSERT INTO orders (
                        status,
                        customer_name,
                        phone,
                        delivery_method,
                        address,
                        payment_method,
                        notes,
                        items,
                        total,
                        idempotency_key,
                        request_fingerprint,
                        client_hash,
                        stock_reserved
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s,
                        %s, %s, %s, TRUE
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
                    ),
                )
                order = cursor.fetchone()
            conn.commit()

        return self._serialize(order)
