"""Generates the PWA's PNG icons from the same drawing as public/icon.svg (no image dependencies).

Usage (from hud/): ..\\bridge\\.venv\\Scripts\\python scripts\\generate_icons.py
Draws at 4x and downsamples (anti-aliasing), writes PNG with zlib.
"""

import struct
import zlib
from pathlib import Path

import numpy as np

SURFACE = (0xD6, 0xD4, 0xCF)
SKY_CENTER = np.array((0x3D, 0x52, 0x78), np.float32)
SKY_EDGE = np.array((0x1F, 0x2B, 0x40), np.float32)
RING = (0x18, 0x21, 0x2F)
SKY_STAR = (0xF4, 0xF2, 0xEC)
IVORY = (0xF7, 0xF0, 0xE0)
HAT = (0x8C, 0x8A, 0x80)
BRIM = (0x6F, 0x6D, 0x65)
SKIN = (0xE9, 0xC9, 0xA1)
EYES = (0x2A, 0x2A, 0x22)
GOLD = (0xE0, 0xA4, 0x2A)
BROW = (0xD8, 0xD4, 0xC8)
NOSE = (0xDC, 0xB8, 0x8E)

SS = 4  # supersampling


def draw(size: int, maskable: bool) -> np.ndarray:
    n = size * SS
    # Coordinates in the SVG space (512×512); for maskable the drawing shrinks to 80% and is centered.
    margin = 0.1 * n if maskable else 0
    s = (n - 2 * margin) / 512
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    u, v = (x - margin) / s, (y - margin) / s  # pixel → SVG coordinate
    img = np.zeros((n, n, 4), np.float32)

    def paint(mask, color):
        img[mask] = (*color, 255)

    if maskable:
        img[...] = (*SURFACE, 255)
    else:
        # Background: rounded rectangle (rx 112).
        r = 112
        cx, cy = np.clip(u, r, 512 - r), np.clip(v, r, 512 - r)
        paint(((u - cx) ** 2 + (v - cy) ** 2 <= r * r) & (u >= 0) & (u <= 512) & (v >= 0) & (v <= 512), SURFACE)

    d2 = (u - 256) ** 2 + (v - 256) ** 2
    paint(d2 <= 201**2, RING)
    # Night sky: a radial gradient from the top-left corner (like the SVG's radialGradient).
    sky = d2 <= 191**2
    t = np.clip(np.sqrt((u - 0.35 * 512 * 0.766 - 60) ** 2 + (v - 0.3 * 512 * 0.766 - 60) ** 2) / (0.8 * 392), 0, 1)
    color = SKY_CENTER * (1 - t[..., None]) + SKY_EDGE * t[..., None]
    img[sky, :3] = color[sky]
    img[sky, 3] = 255
    for ex, ey, er in ((150, 170, 6), (370, 150, 5), (395, 330, 4), (125, 320, 4)):
        star = (u - ex) ** 2 + (v - ey) ** 2 <= er * er
        img[star, :3] = img[star, :3] * 0.2 + np.array(SKY_STAR, np.float32) * 0.8

    # Wizard: a group with translate(72 60.5) scale(11.5), in the SVG's paint order.
    gu, gv = (u - 72) / 11.5, (v - 60.5) / 11.5

    def polygon(pts):
        """Point inside the polygon (even-odd rule), vectorized."""
        inside = np.zeros((n, n), bool)
        for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
            crosses = ((y1 > gv) != (y2 > gv)) & (gu < (x2 - x1) * (gv - y1) / (y2 - y1 + 1e-9) + x1)
            inside ^= crosses
        return inside

    def ellipse(cx, cy, rx, ry):
        return ((gu - cx) / rx) ** 2 + ((gv - cy) / ry) ** 2 <= 1

    paint(polygon([(11, 14.8), (16.8, 5), (19.6, 4.6), (18.5, 6.6), (21, 14.8)]), HAT)
    paint(ellipse(16, 14.9, 7.8, 1.7), BRIM)
    paint(ellipse(16, 17.6, 4.6, 2.8), SKIN)
    paint(ellipse(14.3, 17.1, 0.6, 0.6) | ellipse(17.7, 17.1, 0.6, 0.6), EYES)
    paint(ellipse(14.1, 16.1, 1.4, 0.5) | ellipse(17.9, 16.1, 1.4, 0.5), BROW)
    paint(polygon([(11.2, 18.4), (20.8, 18.4), (19.5, 23.5), (16, 29.5), (12.5, 23.5)]), IVORY)
    paint(ellipse(16, 19, 4.9, 1.5), IVORY)
    paint(ellipse(16, 18.4, 0.9, 0.8), NOSE)
    paint(polygon([(16, 9.4), (16.45, 10.45), (17.5, 10.9), (16.45, 11.35), (16, 12.4), (15.55, 11.35), (14.5, 10.9), (15.55, 10.45)]), GOLD)

    # Downsample 4x (mean) → anti-aliasing.
    img = img.reshape(size, SS, size, SS, 4).mean(axis=(1, 3))
    return np.clip(img + 0.5, 0, 255).astype(np.uint8)


def write_png(path: Path, rgba: np.ndarray) -> None:
    h, w, _ = rgba.shape
    raw = b"".join(b"\x00" + rgba[i].tobytes() for i in range(h))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


if __name__ == "__main__":
    public = Path(__file__).resolve().parents[1] / "public"
    for name, size, maskable in (
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
        ("apple-touch-icon.png", 180, True),
    ):
        write_png(public / name, draw(size, maskable))
        print("ok", name)
