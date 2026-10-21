"""
Logotipni tayyorlash.

Oq fonni faqat CHEKKADAN flood-fill bilan olib tashlaydi — logotip ichidagi
och rangli joylar saqlanib qoladi. So'ng chetlarni yumshatadi, kesadi va
optimallashtiradi.

Foydalanish:
    python scripts/prepare-logo.py brand-source/fapplogo2.png
"""

from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "brand" / "fapplogo2.png"
MAX_SIZE = 768

# Fon "oq" deb hisoblanadigan chegara (min kanal)
WHITE_MIN = 236


def flood_transparent(image: Image.Image) -> Image.Image:
    """Chetdan boshlab, bir-biriga tutashgan oq piksellarni shaffof qiladi."""
    image = image.convert("RGBA")
    width, height = image.size
    pixels = image.load()

    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def is_white(x: int, y: int) -> bool:
        r, g, b, _ = pixels[x, y]
        return min(r, g, b) >= WHITE_MIN

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if visited[index]:
            continue
        visited[index] = 1

        if not is_white(x, y):
            continue

        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)

        if x > 0:
            queue.append((x - 1, y))
        if x < width - 1:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y < height - 1:
            queue.append((x, y + 1))

    # Chetlarni yumshatish (jaggedlikni yo'qotish uchun alpha'ni blur qilamiz)
    alpha = image.getchannel("A").filter(ImageFilter.GaussianBlur(0.6))
    image.putalpha(alpha)
    return image


def trim(image: Image.Image) -> Image.Image:
    bbox = image.getbbox()
    if not bbox:
        return image

    cropped = image.crop(bbox)
    side = max(cropped.size)
    pad = int(side * 0.03)

    canvas = Image.new("RGBA", (side + pad * 2, side + pad * 2), (0, 0, 0, 0))
    canvas.paste(
        cropped,
        ((side - cropped.width) // 2 + pad, (side - cropped.height) // 2 + pad),
    )
    return canvas


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    source = Path(sys.argv[1])
    if not source.is_absolute():
        source = ROOT / source
    if not source.exists():
        print(f"Fayl topilmadi: {source}")
        return 1

    image = Image.open(source)
    print(f"Kirish: {source.name} — {image.size[0]}x{image.size[1]} {image.mode}")

    image = trim(flood_transparent(image))

    if max(image.size) > MAX_SIZE:
        image.thumbnail((MAX_SIZE, MAX_SIZE), Image.LANCZOS)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, "PNG", optimize=True)

    size_kb = OUT.stat().st_size / 1024
    print(f"Tayyor: {OUT.relative_to(ROOT)} — {image.size[0]}x{image.size[1]}, {size_kb:.0f} KB")

    # Tashqi belgi (og-image / PWA) uchun 512px nusxa
    social = ROOT / "public" / "brand" / "fapplogo2-512.png"
    copy = image.copy()
    copy.thumbnail((512, 512), Image.LANCZOS)
    copy.save(social, "PNG", optimize=True)
    print(f"Qo'shimcha: {social.relative_to(ROOT)} — {copy.size[0]}x{copy.size[1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
