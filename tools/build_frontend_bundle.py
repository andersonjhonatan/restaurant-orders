from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
INDEX = FRONTEND / "index.html"

CSS_PARTS = [
    "styles.css",
    "brand-refine-base.css",
    "brand-refine.css",
    "cart-actions.css",
    "p1-enhancements.css",
]
JS_PARTS = [
    "order-hardening.js",
    "app.js",
    "cart-actions.js",
    "p1-enhancements.js",
]

OLD_CSS_TAGS = """  <link rel=\"stylesheet\" href=\"/static/styles.css?v=restore-menu-18\" />
  <link rel=\"stylesheet\" href=\"/static/brand-refine.css?v=cart-icons-26\" />
  <link rel=\"stylesheet\" href=\"/static/cart-actions.css?v=cart-actions-31\" />
  <link rel=\"stylesheet\" href=\"/static/p1-enhancements.css?v=p1-security-1\" />"""
NEW_CSS_TAG = '  <link rel="stylesheet" href="/static/site.bundle.css?v=p1-bundle-1" />'

OLD_JS_TAGS = """  <script src=\"/static/order-hardening.js?v=p0-hardening-1\" defer></script>
  <script src=\"/static/app.js?v=restore-menu-18\" defer></script>
  <script src=\"/static/cart-actions.js?v=cart-actions-31\" defer></script>
  <script src=\"/static/p1-enhancements.js?v=p1-security-1\" defer></script>"""
NEW_JS_TAG = '  <script src="/static/site.bundle.js?v=p1-bundle-1" defer></script>'


def read_text(name: str) -> str:
    return (FRONTEND / name).read_text(encoding="utf-8").strip()


def build_css() -> str:
    parts = []
    for name in CSS_PARTS:
        content = read_text(name)
        if name == "brand-refine.css":
            content = re.sub(
                r'^\s*@import\s+url\(["\']?/static/brand-refine-base\.css[^)]*\);\s*',
                "",
                content,
                count=1,
                flags=re.IGNORECASE,
            )
        parts.append(f"/* source: {name} */\n{content}")
    return "\n\n".join(parts) + "\n"


def build_js() -> str:
    parts = []
    for name in JS_PARTS:
        content = read_text(name)
        parts.append(f"/* source: {name} */\n{content}\n;")
    return "\n\n".join(parts) + "\n"


def bundled_index(source: str) -> str:
    css_old = OLD_CSS_TAGS in source
    css_new = NEW_CSS_TAG in source
    js_old = OLD_JS_TAGS in source
    js_new = NEW_JS_TAG in source

    if css_old and css_new:
        raise RuntimeError("index.html contains old and bundled CSS tags at the same time")
    if js_old and js_new:
        raise RuntimeError("index.html contains old and bundled JS tags at the same time")

    if css_old:
        source = source.replace(OLD_CSS_TAGS, NEW_CSS_TAG, 1)
    elif not css_new:
        raise RuntimeError("expected CSS tags were not found in index.html")

    if js_old:
        source = source.replace(OLD_JS_TAGS, NEW_JS_TAG, 1)
    elif not js_new:
        raise RuntimeError("expected JS tags were not found in index.html")

    return source


def main() -> None:
    css = build_css()
    js = build_js()
    (FRONTEND / "site.bundle.css").write_text(css, encoding="utf-8")
    (FRONTEND / "site.bundle.js").write_text(js, encoding="utf-8")

    index_source = INDEX.read_text(encoding="utf-8")
    INDEX.write_text(bundled_index(index_source), encoding="utf-8")

    print(f"generated site.bundle.css ({len(css.encode('utf-8'))} bytes)")
    print(f"generated site.bundle.js ({len(js.encode('utf-8'))} bytes)")
    print("index.html uses deterministic frontend bundles")


if __name__ == "__main__":
    main()
