import json
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Dict, List, Optional


class OrderStore:
    """Persistência de pedidos com PostgreSQL em produção e JSON local como fallback."""

    VALID_STATUSES = {
        "Aguardando aprovação",
        "Aceito",
        "Recusado",
        "Em preparo",
        "Pronto para retirada",
        "Concluído",
        "Cancelado",
        # Mantidos para compatibilidade com pedidos antigos.
        "Novo",
        "Confirmado",
        "Saiu para entrega",
    }

    def __init__(self, path: str, database_url: Optional[str] = None) -> None:
        self.path = Path(path)
        self.lock = Lock()
        self.database_url = database_url or os.getenv("DATABASE_URL")

        if self.database_url:
            self.backend = "postgres"
            self._ensure_database_schema()
        else:
            self.backend = "json"
            self.path.parent.mkdir(parents=True, exist_ok=True)
            if not self.path.exists():
                self.path.write_text("[]", encoding="utf-8")

    def _connect(self):
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise RuntimeError(
                "psycopg não está instalado para usar PostgreSQL."
            ) from exc

        return psycopg.connect(self.database_url, row_factory=dict_row)

    def _ensure_database_schema(self) -> None:
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS orders (
                        id BIGSERIAL PRIMARY KEY,
                        status TEXT NOT NULL DEFAULT 'Aguardando aprovação',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ,
                        customer_name TEXT NOT NULL,
                        phone TEXT NOT NULL,
                        delivery_method TEXT NOT NULL,
                        address TEXT NOT NULL DEFAULT '',
                        payment_method TEXT NOT NULL,
                        notes TEXT NOT NULL DEFAULT '',
                        items JSONB NOT NULL,
                        total NUMERIC(10,2) NOT NULL CHECK (total >= 0)
                    )
                    """
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS idx_orders_created_at "
                    "ON orders (created_at DESC)"
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status)"
                )
            conn.commit()

    def _serialize_database_order(self, order: Dict) -> Dict:
        serialized = dict(order)
        if serialized.get("created_at"):
            serialized["created_at"] = serialized["created_at"].isoformat()
        if serialized.get("updated_at"):
            serialized["updated_at"] = serialized["updated_at"].isoformat()
        if serialized.get("total") is not None:
            serialized["total"] = float(serialized["total"])
        return serialized

    def _read(self) -> List[Dict]:
        try:
            return json.loads(self.path.read_text(encoding="utf-8") or "[]")
        except (json.JSONDecodeError, OSError):
            return []

    def _write(self, orders: List[Dict]) -> None:
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(orders, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        temporary.replace(self.path)

    def list_orders(self) -> List[Dict]:
        if self.backend == "postgres":
            with self._connect() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("SELECT * FROM orders ORDER BY created_at DESC")
                    return [
                        self._serialize_database_order(order)
                        for order in cursor.fetchall()
                    ]

        with self.lock:
            return list(reversed(self._read()))

    def create_order(self, payload: Dict) -> Dict:
        order_status = payload.get("status", "Aguardando aprovação")
        if order_status not in self.VALID_STATUSES:
            order_status = "Aguardando aprovação"

        if self.backend == "postgres":
            with self._connect() as conn:
                with conn.cursor() as cursor:
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
                            total
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                        RETURNING *
                        """,
                        (
                            order_status,
                            payload["customer_name"],
                            payload["phone"],
                            payload["delivery_method"],
                            payload.get("address", ""),
                            payload["payment_method"],
                            payload.get("notes", ""),
                            json.dumps(payload["items"], ensure_ascii=False),
                            payload["total"],
                        ),
                    )
                    order = cursor.fetchone()
                conn.commit()
            return self._serialize_database_order(order)

        with self.lock:
            orders = self._read()
            next_id = max((order.get("id", 0) for order in orders), default=0) + 1
            order = {
                "id": next_id,
                "status": order_status,
                "created_at": datetime.now(timezone.utc).isoformat(),
                **{key: value for key, value in payload.items() if key != "status"},
            }
            orders.append(order)
            self._write(orders)
            return order

    def update_status(self, order_id: int, new_status: str) -> Dict:
        if new_status not in self.VALID_STATUSES:
            raise ValueError("Invalid order status")

        if self.backend == "postgres":
            with self._connect() as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        """
                        UPDATE orders
                        SET status = %s, updated_at = NOW()
                        WHERE id = %s
                        RETURNING *
                        """,
                        (new_status, order_id),
                    )
                    order = cursor.fetchone()
                conn.commit()

            if order is None:
                raise KeyError("Order not found")
            return self._serialize_database_order(order)

        with self.lock:
            orders = self._read()
            for order in orders:
                if order.get("id") == order_id:
                    order["status"] = new_status
                    order["updated_at"] = datetime.now(timezone.utc).isoformat()
                    self._write(orders)
                    return order

        raise KeyError("Order not found")
