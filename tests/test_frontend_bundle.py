from pathlib import Path

from tools.build_frontend_bundle import (
    NEW_CSS_TAG,
    NEW_JS_TAG,
    OLD_CSS_TAGS,
    OLD_JS_TAGS,
    build_css,
    build_js,
    bundled_index,
)


def test_css_bundle_preserves_current_cascade_order():
    css = build_css()
    positions = [
        css.index("/* source: styles.css */"),
        css.index("/* source: brand-refine-base.css */"),
        css.index("/* source: brand-refine.css */"),
        css.index("/* source: cart-actions.css */"),
        css.index("/* source: p1-enhancements.css */"),
    ]
    assert positions == sorted(positions)
    assert "/static/brand-refine-base.css?v=logo-vanuza-23" not in css
    assert "@media (prefers-reduced-motion: reduce)" in css


def test_js_bundle_preserves_execution_order():
    js = build_js()
    positions = [
        js.index("/* source: order-hardening.js */"),
        js.index("/* source: app.js */"),
        js.index("/* source: cart-actions.js */"),
        js.index("/* source: p1-enhancements.js */"),
    ]
    assert positions == sorted(positions)
    assert 'headers.set("Idempotency-Key", pendingKey)' in js
    assert 'const state = {' in js
    assert 'clearCartButton' in js
    assert 'prefers-reduced-motion' not in js


def test_index_switch_replaces_only_asset_tags():
    current = Path("frontend/index.html").read_text(encoding="utf-8")
    switched = bundled_index(current)

    assert NEW_CSS_TAG in switched
    assert NEW_JS_TAG in switched
    assert OLD_CSS_TAGS not in switched
    assert OLD_JS_TAGS not in switched
    assert switched.count("site.bundle.css") == 1
    assert switched.count("site.bundle.js") == 1

    # A operação deve ser idempotente e não reescrever o restante do HTML.
    assert bundled_index(switched) == switched
