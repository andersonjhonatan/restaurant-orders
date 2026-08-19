from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"

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


def main() -> None:
    css = build_css()
    js = build_js()
    (FRONTEND / "site.bundle.css").write_text(css, encoding="utf-8")
    (FRONTEND / "site.bundle.js").write_text(js, encoding="utf-8")
    print(f"generated site.bundle.css ({len(css.encode('utf-8'))} bytes)")
    print(f"generated site.bundle.js ({len(js.encode('utf-8'))} bytes)")


if __name__ == "__main__":
    main()
