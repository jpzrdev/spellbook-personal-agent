"""Gera os ícones PNG do PWA a partir do mesmo desenho de public/icone.svg (sem dependências de imagem).

Uso (de hud/): ..\\bridge\\.venv\\Scripts\\python scripts\\gerar_icones.py
Desenha em 4x e reduz (antisserrilhado), grava PNG com zlib.
"""

import struct
import zlib
from pathlib import Path

import numpy as np

PERGAMINHO = (0xD6, 0xD4, 0xCF)
CEU_CENTRO = np.array((0x3D, 0x52, 0x78), np.float32)
CEU_BORDA = np.array((0x1F, 0x2B, 0x40), np.float32)
ANEL = (0x18, 0x21, 0x2F)
ESTRELA_CEU = (0xF4, 0xF2, 0xEC)
MARFIM = (0xF7, 0xF0, 0xE0)
CHAPEU = (0x8C, 0x8A, 0x80)
ABA = (0x6F, 0x6D, 0x65)
PELE = (0xE9, 0xC9, 0xA1)
OLHOS = (0x2A, 0x2A, 0x22)
OCRE = (0xE0, 0xA4, 0x2A)
SOBRANCELHA = (0xD8, 0xD4, 0xC8)
NARIZ = (0xDC, 0xB8, 0x8E)

SS = 4  # superamostragem


def desenhar(tam: int, maskable: bool) -> np.ndarray:
    n = tam * SS
    # Coordenadas no espaço do SVG (512×512); no maskable o desenho encolhe 80% e centraliza.
    escala = n / 512
    margem = 0.1 * n if maskable else 0
    s = (n - 2 * margem) / 512
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    u, v = (x - margem) / s, (y - margem) / s  # pixel → coordenada do SVG
    img = np.zeros((n, n, 4), np.float32)

    def pintar(mascara, cor):
        img[mascara] = (*cor, 255)

    if maskable:
        img[...] = (*PERGAMINHO, 255)
    else:
        # Fundo: retângulo arredondado (rx 112).
        r = 112
        cx, cy = np.clip(u, r, 512 - r), np.clip(v, r, 512 - r)
        pintar(((u - cx) ** 2 + (v - cy) ** 2 <= r * r) & (u >= 0) & (u <= 512) & (v >= 0) & (v <= 512), PERGAMINHO)

    d2 = (u - 256) ** 2 + (v - 256) ** 2
    pintar(d2 <= 201**2, ANEL)
    # Céu noturno: gradiente radial do canto superior esquerdo (como o radialGradient do SVG).
    ceu = d2 <= 191**2
    t = np.clip(np.sqrt((u - 0.35 * 512 * 0.766 - 60) ** 2 + (v - 0.3 * 512 * 0.766 - 60) ** 2) / (0.8 * 392), 0, 1)
    cor = CEU_CENTRO * (1 - t[..., None]) + CEU_BORDA * t[..., None]
    img[ceu, :3] = cor[ceu]
    img[ceu, 3] = 255
    for ex, ey, er in ((150, 170, 6), (370, 150, 5), (395, 330, 4), (125, 320, 4)):
        estrela = (u - ex) ** 2 + (v - ey) ** 2 <= er * er
        img[estrela, :3] = img[estrela, :3] * 0.2 + np.array(ESTRELA_CEU, np.float32) * 0.8

    # Mago: grupo com translate(72 60.5) scale(11.5), na ordem de pintura do SVG.
    gu, gv = (u - 72) / 11.5, (v - 60.5) / 11.5

    def poligono(pts):
        """Ponto dentro do polígono (regra par-ímpar), vetorizado."""
        dentro = np.zeros((n, n), bool)
        for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
            cruza = ((y1 > gv) != (y2 > gv)) & (gu < (x2 - x1) * (gv - y1) / (y2 - y1 + 1e-9) + x1)
            dentro ^= cruza
        return dentro

    def elipse(cx, cy, rx, ry):
        return ((gu - cx) / rx) ** 2 + ((gv - cy) / ry) ** 2 <= 1

    pintar(poligono([(11, 14.8), (16.8, 5), (19.6, 4.6), (18.5, 6.6), (21, 14.8)]), CHAPEU)
    pintar(elipse(16, 14.9, 7.8, 1.7), ABA)
    pintar(elipse(16, 17.6, 4.6, 2.8), PELE)
    pintar(elipse(14.3, 17.1, 0.6, 0.6) | elipse(17.7, 17.1, 0.6, 0.6), OLHOS)
    pintar(elipse(14.1, 16.1, 1.4, 0.5) | elipse(17.9, 16.1, 1.4, 0.5), SOBRANCELHA)
    pintar(poligono([(11.2, 18.4), (20.8, 18.4), (19.5, 23.5), (16, 29.5), (12.5, 23.5)]), MARFIM)
    pintar(elipse(16, 19, 4.9, 1.5), MARFIM)
    pintar(elipse(16, 18.4, 0.9, 0.8), NARIZ)
    pintar(poligono([(16, 9.4), (16.45, 10.45), (17.5, 10.9), (16.45, 11.35), (16, 12.4), (15.55, 11.35), (14.5, 10.9), (15.55, 10.45)]), OCRE)

    # Reduz 4x (média) → antisserrilhado.
    img = img.reshape(tam, SS, tam, SS, 4).mean(axis=(1, 3))
    return np.clip(img + 0.5, 0, 255).astype(np.uint8)


def gravar_png(caminho: Path, rgba: np.ndarray) -> None:
    h, w, _ = rgba.shape
    bruto = b"".join(b"\x00" + rgba[i].tobytes() for i in range(h))

    def bloco(tipo: bytes, dados: bytes) -> bytes:
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += bloco(b"IDAT", zlib.compress(bruto, 9)) + bloco(b"IEND", b"")
    caminho.write_bytes(png)


if __name__ == "__main__":
    publico = Path(__file__).resolve().parents[1] / "public"
    for nome, tam, maskable in (
        ("icone-192.png", 192, False),
        ("icone-512.png", 512, False),
        ("icone-maskable-512.png", 512, True),
        ("apple-touch-icon.png", 180, True),
    ):
        gravar_png(publico / nome, desenhar(tam, maskable))
        print("ok", nome)
