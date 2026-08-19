import base64
from io import BytesIO
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PARTS_DIR = ROOT / "assets" / "logo_parts"
OUTPUT = ROOT / "frontend" / "assets" / "logo-sabor-da-casa.webp"


def build_logo_bytes() -> bytes:
    encoded = "".join(
        (PARTS_DIR / f"new-logo-{index:02d}.txt")
        .read_text(encoding="utf-8")
        .strip()
        for index in range(1, 5)
    )
    source = base64.b64decode(encoded)

    with Image.open(BytesIO(source)) as logo:
        image = logo.convert("RGBA")
        transparent_pixels = []
        for red, green, blue, alpha in image.getdata():
            brightest = max(red, green, blue)
            if brightest <= 32:
                transparent_pixels.append((red, green, blue, 0))
            elif brightest < 52:
                edge_alpha = int(alpha * ((brightest - 32) / 20))
                transparent_pixels.append((red, green, blue, edge_alpha))
            else:
                transparent_pixels.append((red, green, blue, alpha))

        image.putdata(transparent_pixels)
        output = BytesIO()
        image.save(output, format="WEBP", lossless=True, method=4)
        return output.getvalue()


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    data = build_logo_bytes()
    OUTPUT.write_bytes(data)
    print(f"generated {OUTPUT.relative_to(ROOT)} ({len(data)} bytes)")


if __name__ == "__main__":
    main()
