from pathlib import Path


def test_admin_exposes_inventory_tab_and_assets():
    html = Path("frontend/admin.html").read_text(encoding="utf-8")

    assert 'data-admin-tab="inventory"' in html
    assert 'id="inventoryPanel"' in html
    assert 'id="inventoryAdjustDialog"' in html
    assert 'id="recipeDialog"' in html
    assert "/static/p2-inventory-admin.css?v=p2-inventory-1" in html
    assert "/static/p2-inventory-admin.js?v=p2-inventory-1" in html


def test_inventory_admin_script_uses_protected_routes_and_keeps_stock_non_negative_workflow():
    script = Path("frontend/p2-inventory-admin.js").read_text(encoding="utf-8")

    assert 'api("/api/admin/inventory"' in script
    assert 'api("/api/admin/inventory/adjust"' in script
    assert '/threshold`' in script
    assert '/recipe`' in script
    assert 'data-factor-id' in script
    assert 'state.activeTab === "inventory"' in script


def test_inventory_runtime_is_the_vercel_entrypoint():
    entrypoint = Path("api/index.py").read_text(encoding="utf-8")
    runtime = Path("src/p2_inventory.py").read_text(encoding="utf-8")

    assert "from src.p2_inventory import app as real_app" in entrypoint
    assert 'item.get("option")' in runtime
    assert "legacy_app._stock_requirements = _managed_stock_requirements" in runtime
