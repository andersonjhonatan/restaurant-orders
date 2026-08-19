from fastapi import HTTPException, Query, Request
from fastapi.responses import HTMLResponse, Response

import src.app as legacy_app
import src.p1_security as p1
import src.p2_inventory as p2_inventory
from src.services.sales_reporting import ReportingUnavailable, SalesReporting


app = p2_inventory.app
sales_reporting = SalesReporting(legacy_app.DATABASE_URL)


def _reporting_error(exc: Exception):
    if isinstance(exc, ReportingUnavailable):
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    raise HTTPException(status_code=500, detail="Não foi possível gerar o relatório agora.") from exc


def _analytics_admin_page():
    base = legacy_app._page_with_transparent_brand("admin.html")
    html = base.body.decode("utf-8")
    css_tag = '<link rel="stylesheet" href="/static/p2-analytics-admin.css?v=p2-analytics-1" />'
    js_tag = '<script src="/static/p2-analytics-admin.js?v=p2-analytics-1" defer></script>'
    if css_tag not in html:
        html = html.replace("</head>", f"  {css_tag}\n</head>", 1)
    if js_tag not in html:
        html = html.replace("</body>", f"  {js_tag}\n</body>", 1)
    response = HTMLResponse(html, headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"})
    return p1._security_headers(response)


@app.middleware("http")
async def p2_analytics_admin_page_middleware(request: Request, call_next):
    # Só modifica a página do painel para carregar a camada de relatórios.
    # Checkout, home, cardápio e APIs existentes seguem pelo fluxo P0/P1/P2 normal.
    if request.url.path == "/admin" and request.method == "GET":
        return _analytics_admin_page()
    return await call_next(request)


@app.get("/api/admin/analytics", include_in_schema=False)
def admin_analytics(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
):
    p1._require_admin_session(request)
    try:
        return sales_reporting.analytics(days)
    except Exception as exc:
        _reporting_error(exc)


@app.get("/api/admin/orders/{order_id}/history", include_in_schema=False)
def admin_order_history(order_id: int, request: Request):
    p1._require_admin_session(request)
    current = next(
        (order for order in legacy_app.order_store.list_orders() if order.get("id") == order_id),
        None,
    )
    if not current:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
    try:
        history = sales_reporting.order_history(order_id)
        if not history:
            history = [
                {
                    "order_id": order_id,
                    "old_status": None,
                    "new_status": current.get("status"),
                    "source": "estado atual",
                    "changed_at": current.get("updated_at") or current.get("created_at"),
                }
            ]
        return {"order_id": order_id, "history": history}
    except Exception as exc:
        _reporting_error(exc)


@app.get("/api/admin/reports/orders.csv", include_in_schema=False)
def admin_orders_csv(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
):
    p1._require_admin_session(request)
    try:
        orders = sales_reporting.list_orders(days)
        content = sales_reporting.csv_bytes(orders)
        return Response(
            content=content,
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="sabor-da-casa-pedidos-{days}d.csv"',
                "Cache-Control": "no-store",
            },
        )
    except Exception as exc:
        _reporting_error(exc)
