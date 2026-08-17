import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Dict, List


class OrderStore:
    """Persistência JSON simples para o MVP de pedidos."""

    VALID_STATUSES = {
        "Novo",
        "Confirmado",
        "Em preparo",
        "Saiu para entrega",
        "Concluído",
        "Cancelado",
    }

    def __init__(self, path: str) -> None:
        self.path = Path(path)
        self.lock = Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text("[]", encoding="utf-8")

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
        with self.lock:
            return list(reversed(self._read()))

    def create_order(self, payload: Dict) -> Dict:
        with self.lock:
            orders = self._read()
            next_id = max((order.get("id", 0) for order in orders), default=0) + 1
            order = {
                "id": next_id,
                "status": "Novo",
                "created_at": datetime.now(timezone.utc).isoformat(),
                **payload,
            }
            orders.append(order)
            self._write(orders)
            return order

    def update_status(self, order_id: int, new_status: str) -> Dict:
        if new_status not in self.VALID_STATUSES:
            raise ValueError("Invalid order status")

        with self.lock:
            orders = self._read()
            for order in orders:
                if order.get("id") == order_id:
                    order["status"] = new_status
                    order["updated_at"] = datetime.now(timezone.utc).isoformat()
                    self._write(orders)
                    return order

        raise KeyError("Order not found")
