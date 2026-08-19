import csv
import io
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional

import psycopg
from psycopg.rows import dict_row


EXCLUDED_VALUE_STATUSES = {"Cancelado", "Recusado"}


class ReportingUnavailable(RuntimeError):
    pass


def _serialize(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _is_preorder(order: Dict) -> bool:
    return any(item.get("order_type") == "Encomenda" for item in (order.get("items") or []))


def _item_label(item: Dict) -> str:
    return str(item.get("display_name") or item.get("dish_name") or "Prato")


class SalesReporting:
    def __init__(self, database_url: Optional[str]):
        self.database_url = database_url

    @property
    def enabled(self) -> bool:
        return bool(self.database_url)

    def _connect(self):
        if not self.database_url:
            raise ReportingUnavailable("Banco de relatórios não configurado.")
        return psycopg.connect(self.database_url, row_factory=dict_row)

    @staticmethod
    def normalize_days(days: int) -> int:
        return max(1, min(int(days), 365))

    def list_orders(self, days: int = 30) -> List[Dict]:
        if not self.enabled:
            return []
        days = self.normalize_days(days)
        start = datetime.now(timezone.utc) - timedelta(days=days)
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, status, created_at, updated_at, customer_name, phone,
                       delivery_method, address, payment_method, notes, items,
                       total, stock_reserved
                FROM orders
                WHERE created_at >= %s
                ORDER BY created_at DESC
                """,
                (start,),
            )
            rows = []
            for row in cur.fetchall():
                data = dict(row)
                data["created_at"] = _serialize(data.get("created_at"))
                data["updated_at"] = _serialize(data.get("updated_at"))
                data["total"] = float(data.get("total") or 0)
                rows.append(data)
            return rows

    @staticmethod
    def aggregate(orders: Iterable[Dict], days: int = 30) -> Dict:
        orders = list(orders)
        valid_orders = [order for order in orders if order.get("status") not in EXCLUDED_VALUE_STATUSES]
        completed = [order for order in orders if order.get("status") == "Concluído"]
        gross_value = round(sum(float(order.get("total") or 0) for order in valid_orders), 2)
        average_ticket = round(gross_value / len(valid_orders), 2) if valid_orders else 0.0

        status_counts = Counter(str(order.get("status") or "Sem status") for order in orders)
        payment_counts = Counter(str(order.get("payment_method") or "Não informado") for order in valid_orders)
        preorder_count = sum(1 for order in orders if _is_preorder(order))

        products: Dict[str, Dict] = defaultdict(lambda: {"quantity": 0, "value": 0.0})
        daily: Dict[str, Dict] = defaultdict(lambda: {"orders": 0, "value": 0.0})

        for order in valid_orders:
            created = str(order.get("created_at") or "")
            day = created[:10] if len(created) >= 10 else "sem-data"
            daily[day]["orders"] += 1
            daily[day]["value"] += float(order.get("total") or 0)

            for item in order.get("items") or []:
                label = _item_label(item)
                quantity = max(0, int(item.get("quantity") or 0))
                subtotal = float(item.get("subtotal") or 0)
                products[label]["quantity"] += quantity
                products[label]["value"] += subtotal

        top_products = sorted(
            [
                {"name": name, "quantity": data["quantity"], "value": round(data["value"], 2)}
                for name, data in products.items()
            ],
            key=lambda item: (item["quantity"], item["value"], item["name"]),
            reverse=True,
        )[:10]

        daily_rows = [
            {"date": day, "orders": data["orders"], "value": round(data["value"], 2)}
            for day, data in sorted(daily.items())
            if day != "sem-data"
        ]

        return {
            "period_days": int(days),
            "summary": {
                "orders": len(orders),
                "valid_orders": len(valid_orders),
                "completed": len(completed),
                "preorders": preorder_count,
                "cancelled_or_rejected": len(orders) - len(valid_orders),
                "gross_value": gross_value,
                "average_ticket": average_ticket,
            },
            "status_counts": [
                {"status": key, "count": value}
                for key, value in sorted(status_counts.items(), key=lambda item: (-item[1], item[0]))
            ],
            "payment_counts": [
                {"payment_method": key, "count": value}
                for key, value in sorted(payment_counts.items(), key=lambda item: (-item[1], item[0]))
            ],
            "top_products": top_products,
            "daily": daily_rows,
        }

    def analytics(self, days: int = 30) -> Dict:
        days = self.normalize_days(days)
        return self.aggregate(self.list_orders(days), days=days)

    def order_history(self, order_id: int) -> List[Dict]:
        if not self.enabled:
            return []
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT to_regclass('public.order_status_history') AS table_name")
            row = cur.fetchone()
            if not row or not row["table_name"]:
                return []
            cur.execute(
                """
                SELECT id, order_id, old_status, new_status, source, changed_at
                FROM order_status_history
                WHERE order_id = %s
                ORDER BY changed_at ASC, id ASC
                """,
                (order_id,),
            )
            return [
                {
                    **dict(item),
                    "changed_at": _serialize(item.get("changed_at")),
                }
                for item in cur.fetchall()
            ]

    @staticmethod
    def csv_bytes(orders: Iterable[Dict]) -> bytes:
        buffer = io.StringIO(newline="")
        writer = csv.writer(buffer, delimiter=";")
        writer.writerow(
            [
                "Pedido",
                "Data",
                "Status",
                "Cliente",
                "Telefone",
                "Pagamento",
                "Tipo",
                "Itens",
                "Total",
                "Observação",
            ]
        )
        for order in orders:
            item_text = " | ".join(
                f"{int(item.get('quantity') or 0)}x {_item_label(item)}"
                + (f" ({item.get('option_label')})" if item.get("option_label") else "")
                for item in (order.get("items") or [])
            )
            writer.writerow(
                [
                    order.get("id", ""),
                    order.get("created_at", ""),
                    order.get("status", ""),
                    order.get("customer_name", ""),
                    order.get("phone", ""),
                    order.get("payment_method", ""),
                    "Encomenda" if _is_preorder(order) else "Pedido do dia",
                    item_text,
                    f"{float(order.get('total') or 0):.2f}".replace(".", ","),
                    order.get("notes", ""),
                ]
            )
        return ("\ufeff" + buffer.getvalue()).encode("utf-8")
