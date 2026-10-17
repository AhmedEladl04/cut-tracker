"""Generate the app icons (barbell on dark background) without any image library.

Run:  python scripts/make_icons.py
Writes public/icons/*.png. Pure standard library: shapes are rasterised with 4x4
supersampling and written as PNG with zlib.
"""
import os
import struct
import zlib

BG = (14, 17, 22)
FG = (79, 156, 255)
ACCENT = (47, 191, 113)

# Shapes in unit coordinates (0..1): (x0, y0, x1, y1, corner_radius, colour)
SHAPES = [
    (0.10, 0.475, 0.90, 0.525, 0.02, FG),   # bar
    (0.22, 0.28, 0.31, 0.72, 0.03, FG),     # inner plates
    (0.69, 0.28, 0.78, 0.72, 0.03, FG),
    (0.14, 0.35, 0.21, 0.65, 0.025, FG),    # outer plates
    (0.79, 0.35, 0.86, 0.65, 0.025, FG),
    (0.40, 0.70, 0.60, 0.74, 0.02, ACCENT), # little "progress" line under the bar
]


def inside(x, y, s):
    x0, y0, x1, y1, r, _ = s
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def render(size, scale=1.0):
    """scale < 1 shrinks the artwork toward the centre (maskable icons need a safe zone)."""
    ss = 4
    rows = []
    for py in range(size):
        row = bytearray([0])  # PNG filter type 0
        for px in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    x = ((px + (sx + 0.5) / ss) / size - 0.5) / scale + 0.5
                    y = ((py + (sy + 0.5) / ss) / size - 0.5) / scale + 0.5
                    col = BG
                    for s in SHAPES:
                        if inside(x, y, s):
                            col = s[5]
                    acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2]
            n = ss * ss
            row += bytes((acc[0] // n, acc[1] // n, acc[2] // n))
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path, size, raw):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
    os.makedirs(out, exist_ok=True)
    for name, size, scale in [
        ("icon-192.png", 192, 1.0),
        ("icon-512.png", 512, 1.0),
        ("apple-touch-icon.png", 180, 0.9),
        ("icon-maskable-512.png", 512, 0.75),
        ("favicon-32.png", 32, 1.0),
    ]:
        write_png(os.path.join(out, name), size, render(size, scale))
        print("wrote", name)
