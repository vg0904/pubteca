#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera los iconos de la app a partir de recursos/icono.png (1024 x 1024).

Si el icono cambia, se sustituye ese archivo y se vuelve a correr esto. Usa
`sips`, que viene con macOS, para redimensionar, y la biblioteca estandar de
Python para lo demas: no hace falta instalar nada.

  public/favicon-32.png         la pestana del navegador
  public/icono-192.png          favicon grande, y el logo dentro de la app
  public/apple-touch-icon.png   «Anadir a pantalla de inicio» en el iPhone y el iPad

El de iOS va SIN esquinas transparentes: iOS recorta sus propias esquinas
redondeadas, y lo transparente del original asomaria en negro. Cada pixel
transparente (o a medias, en el borde suavizado) se rellena con el color del
fondo a esa misma altura, asi que el degradado del original sigue intacto.

Uso: python3 scripts/iconos.py
"""

import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

AQUI = Path(__file__).resolve().parent
ORIGINAL = AQUI.parent / "recursos" / "icono.png"
PUBLICO = AQUI.parent / "public"


def redimensionar(lado, destino):
    subprocess.run(
        ["sips", "-s", "format", "png", "-z", str(lado), str(lado), str(ORIGINAL), "--out", str(destino)],
        check=True,
        capture_output=True,
    )


def leer_rgba(ruta):
    """Un PNG RGBA de 8 bits -> (ancho, alto, filas de bytes RGBA)."""
    b = ruta.read_bytes()
    i, idat, ihdr = 8, b"", None
    while i < len(b):
        n = struct.unpack(">I", b[i : i + 4])[0]
        tipo, datos = b[i + 4 : i + 8], b[i + 8 : i + 8 + n]
        if tipo == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", datos)
        elif tipo == b"IDAT":
            idat += datos
        i += 12 + n
    ancho, alto, profundidad, color = ihdr[:4]
    if (profundidad, color) != (8, 6):
        sys.exit(f"{ruta.name}: se esperaba RGBA de 8 bits y es profundidad {profundidad}, color {color}")
    crudo, filas, previa, p, bpp = zlib.decompress(idat), [], bytearray(ancho * 4), 0, 4
    for _ in range(alto):
        filtro, fila = crudo[p], bytearray(crudo[p + 1 : p + 1 + ancho * 4])
        p += 1 + ancho * 4
        for x in range(len(fila)):
            a = fila[x - bpp] if x >= bpp else 0
            arriba = previa[x]
            c = previa[x - bpp] if x >= bpp else 0
            if filtro == 1:
                fila[x] = (fila[x] + a) & 255
            elif filtro == 2:
                fila[x] = (fila[x] + arriba) & 255
            elif filtro == 3:
                fila[x] = (fila[x] + (a + arriba) // 2) & 255
            elif filtro == 4:
                pa, pb, pc = abs(arriba - c), abs(a - c), abs(a + arriba - 2 * c)
                fila[x] = (fila[x] + (a if pa <= pb and pa <= pc else arriba if pb <= pc else c)) & 255
        filas.append(fila)
        previa = fila
    return ancho, alto, filas


def escribir_rgb(ruta, ancho, alto, filas):
    def trozo(tipo, datos):
        return struct.pack(">I", len(datos)) + tipo + datos + struct.pack(">I", zlib.crc32(tipo + datos))

    crudo = b"".join(b"\x00" + bytes(f) for f in filas)
    ruta.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + trozo(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0))
        + trozo(b"IDAT", zlib.compress(crudo, 9))
        + trozo(b"IEND", b"")
    )


def a_sangre(origen, destino):
    """Rellena lo transparente con el color del fondo a esa altura."""
    ancho, alto, filas = leer_rgba(origen)
    salida, fondo = [], None
    for fila in filas:
        # El fondo de esta altura: el primer pixel opaco desde el borde. El
        # dibujo nunca toca los bordes, asi que siempre es fondo.
        for x in range(ancho):
            if fila[x * 4 + 3] == 255:
                fondo = fila[x * 4 : x * 4 + 3]
                break
        rgb = bytearray()
        for x in range(ancho):
            r, g, b, a = fila[x * 4 : x * 4 + 4]
            rgb += bytes(round((c * a + f * (255 - a)) / 255) for c, f in zip((r, g, b), fondo))
        salida.append(rgb)
    escribir_rgb(destino, ancho, alto, salida)


def main():
    if not ORIGINAL.exists():
        sys.exit(f"Falta {ORIGINAL}")
    PUBLICO.mkdir(exist_ok=True)
    redimensionar(32, PUBLICO / "favicon-32.png")
    redimensionar(192, PUBLICO / "icono-192.png")
    with tempfile.TemporaryDirectory() as tmp:
        intermedio = Path(tmp) / "180.png"
        redimensionar(180, intermedio)
        a_sangre(intermedio, PUBLICO / "apple-touch-icon.png")
    for n in ("favicon-32.png", "icono-192.png", "apple-touch-icon.png"):
        print(f"  {n:22} {(PUBLICO / n).stat().st_size:>7,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
