from src.services.sales_reporting import SalesReporting


def sample_orders():
    return [
        {
            "id": 1,
            "status": "Concluído",
            "created_at": "2026-08-18T12:00:00+00:00",
            "customer_name": "Cliente A",
            "phone": "87999999999",
            "payment_method": "Pix",
            "total": 100.0,
            "notes": "",
            "items": [
                {"display_name": "Lasanha", "quantity": 2, "subtotal": 80.0, "order_type": "Hoje"},
                {"display_name": "Feijoada", "quantity": 1, "subtotal": 20.0, "order_type": "Hoje"},
            ],
        },
        {
            "id": 2,
            "status": "Aguardando aprovação",
            "created_at": "2026-08-18T15:00:00+00:00",
            "customer_name": "Cliente B",
            "phone": "87988888888",
            "payment_method": "Cartão",
            "total": 60.0,
            "notes": "aniversário",
            "items": [
                {"display_name": "Lasanha", "quantity": 1, "subtotal": 60.0, "order_type": "Encomenda"},
            ],
        },
        {
            "id": 3,
            "status": "Cancelado",
            "created_at": "2026-08-19T11:00:00+00:00",
            "customer_name": "Cliente C",
            "phone": "87977777777",
            "payment_method": "Pix",
            "total": 200.0,
            "notes": "",
            "items": [{"display_name": "Assado", "quantity": 2, "subtotal": 200.0, "order_type": "Hoje"}],
        },
    ]


def test_analytics_excludes_cancelled_value_and_calculates_ticket():
    result = SalesReporting.aggregate(sample_orders(), days=30)
    summary = result["summary"]

    assert summary["orders"] == 3
    assert summary["valid_orders"] == 2
    assert summary["completed"] == 1
    assert summary["preorders"] == 1
    assert summary["cancelled_or_rejected"] == 1
    assert summary["gross_value"] == 160.0
    assert summary["average_ticket"] == 80.0


def test_top_products_and_daily_use_only_valid_orders():
    result = SalesReporting.aggregate(sample_orders(), days=30)

    assert result["top_products"][0]["name"] == "Lasanha"
    assert result["top_products"][0]["quantity"] == 3
    assert all(item["name"] != "Assado" for item in result["top_products"])
    assert result["daily"] == [{"date": "2026-08-18", "orders": 2, "value": 160.0}]


def test_csv_export_has_bom_headers_and_customer_data():
    content = SalesReporting.csv_bytes(sample_orders()).decode("utf-8")

    assert content.startswith("\ufeffPedido;Data;Status;Cliente")
    assert "Cliente A" in content
    assert "Lasanha" in content
    assert "Pedido do dia" in content
    assert "Encomenda" in content
