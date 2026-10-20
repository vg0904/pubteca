#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera las imagenes sinteticas de prueba en tests/fixtures/imagenes/.

Son INVENTADAS: ni una sale de un libro real. Cada una existe para ejercitar
una rama concreta de inspeccionar_imagen() y revisar_imagen() del Python.

Los PNG son validos de verdad (firma, IHDR, IDAT con zlib, IEND y CRC
correctos). Los JPEG son solo CABECERAS sinteticas: llevan SOI, los segmentos
que el inspector lee (APP2, SOF0) y EOI, pero no datos de imagen, porque
construir un JPEG decodificable a mano no aporta nada al inspector y si mucho
ruido. Estan marcados como tal y no se usan para generar EPUB de verdad.

Uso: python3 scripts/imagenes-prueba.py
"""

import struct
import sys
import zlib
from pathlib import Path

SALIDA = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "imagenes"

CANALES = {0: 1, 2: 3, 4: 2, 6: 4}


def chunk(tipo: bytes, datos: bytes) -> bytes:
    return (struct.pack(">I", len(datos)) + tipo + datos
            + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF))


def png(ancho, alto, tipo_color=2, extra=(), filas_ruido=0):
    """PNG valido. `filas_ruido` mete datos incompresibles para subir el peso."""
    canales = CANALES[tipo_color]
    semilla = 0x12345
    filas = []
    for y in range(alto):
        if y < filas_ruido:
            fila = bytearray([0])
            for _ in range(ancho * canales):
                semilla = (semilla * 1103515245 + 12345) & 0x7FFFFFFF
                fila.append((semilla >> 8) & 0xFF)
            filas.append(bytes(fila))
        else:
            filas.append(b"\0" + bytes([200]) * (ancho * canales))
    idat = zlib.compress(b"".join(filas), 9)
    out = b"\x89PNG\r\n\x1a\n"
    out += chunk(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, tipo_color, 0, 0, 0))
    for t, d in extra:
        out += chunk(t, d)
    out += chunk(b"IDAT", idat)
    out += chunk(b"IEND", b"")
    return out


def iccp(nombre: bytes, perfil: bytes, corrupto=False) -> tuple:
    """Chunk iCCP: nombre + \\0 + byte de metodo + flujo zlib del perfil.

    El Python hace zlib.decompress(resto[1:]), es decir salta el byte de metodo.
    """
    cuerpo = nombre + b"\0" + b"\0" + (b"no soy zlib" if corrupto else zlib.compress(perfil, 9))
    return (b"iCCP", cuerpo)


def trns() -> tuple:
    # Para tipo de color 2: tres uint16 con el color transparente.
    return (b"tRNS", struct.pack(">HHH", 255, 255, 255))


def jpeg_con_dht(ancho, alto):
    """SOI + APP0 + SOF0 + DHT + EOI, en el orden de un JPEG real.

    El DHT va DESPUES del SOF0, que es donde lo pone cualquier codificador. Si
    alguien mete 0xC4 (que es DHT, no SOF) en el conjunto de marcadores SOF,
    este segmento sobreescribe las dimensiones con basura (1281x1). Sin esta
    imagen, ese error no lo detecta ningun test.
    """
    base = jpeg(ancho, alto)
    cuenta = bytes([0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0])
    carga = bytes([0x00]) + cuenta + bytes(range(12))
    dht = b"\xff\xc4" + struct.pack(">H", len(carga) + 2) + carga
    return base[:-2] + dht + b"\xff\xd9"


def png_de_tamano_exacto(ancho, alto, objetivo):
    """PNG con un chunk de relleno para que el archivo pese EXACTAMENTE
    `objetivo` bytes.

    Sirve para un empate de redondeo: 1.250.000 bytes son 1,25 MB, y Python
    redondea al par («1.2 MB») mientras toFixed redondea hacia arriba
    («1.3 MB»). Sin esta imagen, usar toFixed en el mensaje no lo detecta
    ningun test. El chunk se llama en minusculas, asi que es auxiliar y
    cualquier lector lo ignora.
    """
    base = png(ancho, alto)
    hueco = objetivo - len(base) - 12  # 12 = largo + tipo + CRC
    if hueco < 0:
        raise ValueError("la imagen base ya pasa del objetivo")
    relleno = chunk(b"puBt", b"\0" * hueco)
    corte = base.index(b"IDAT") - 4
    return base[:corte] + relleno + base[corte:]


def jpeg(ancho, alto, componentes=3, app2=None):
    """Solo cabeceras: SOI + (APP2) + SOF0 + EOI. No es decodificable."""
    out = b"\xff\xd8\xff\xe0" + struct.pack(">H", 16) + b"JFIF\0\x01\x01\0\0\x01\0\x01\0\0"
    if app2 is not None:
        carga = b"ICC_PROFILE\0" + app2
        out += b"\xff\xe2" + struct.pack(">H", len(carga) + 2) + carga
    sof = struct.pack(">BHHB", 8, alto, ancho, componentes)
    for i in range(componentes):
        sof += bytes([i + 1, 0x11, 0])
    out += b"\xff\xc0" + struct.pack(">H", len(sof) + 2) + sof
    out += b"\xff\xd9"
    return out


P3 = b"Display P3"
P3_16 = "Display P3".encode("utf-16-be")
DCI = b"DCI-P3"
PERFIL_BASE = b"\0\0\x02\x0cADBEmntrRGB XYZ " + b"\0" * 64


IMAGENES = {
    # --- ilustraciones que cumplen ---
    "buena.png": lambda: png(1600, 2400),
    "gris.png": lambda: png(1600, 2400, tipo_color=0),

    # --- cada aviso de revisar_imagen, aislado ---
    "alfa.png": lambda: png(1600, 2400, tipo_color=6),
    "trns.png": lambda: png(1600, 2400, extra=[trns()]),
    "grande.png": lambda: png(3000, 2000),                 # 6 MP > 5.6 MP
    "pequena.png": lambda: png(800, 1200),                 # < 1200x1800
    "horizontal.png": lambda: png(2400, 1600),
    "horizontal-chica.png": lambda: png(1400, 1000),
    "proporcion.png": lambda: png(1600, 1700),             # 1:1.06
    "pesada.png": lambda: png(1600, 2400, tipo_color=0, filas_ruido=440),
    # DISCRIMINANTE: 1.250.000 bytes = 1,25 MB, un empate de redondeo exacto.
    "peso-empate.png": lambda: png_de_tamano_exacto(1600, 2400, 1_250_000),

    # --- Display P3 por sus cuatro vias ---
    "p3-nombre.png": lambda: png(1600, 2400, extra=[iccp(P3, PERFIL_BASE)]),
    "p3-perfil.png": lambda: png(1600, 2400, extra=[iccp(b"ICC", PERFIL_BASE + P3)]),
    "p3-utf16.png": lambda: png(1600, 2400, extra=[iccp(b"ICC", PERFIL_BASE + P3_16)]),
    "dcip3.png": lambda: png(1600, 2400, extra=[iccp(b"ICC", PERFIL_BASE + DCI)]),
    "iccp-corrupto.png": lambda: png(1600, 2400, extra=[iccp(b"ICC", b"", corrupto=True)]),
    "iccp-corrupto-nombre-p3.png": lambda: png(1600, 2400, extra=[iccp(P3, b"", corrupto=True)]),
    "srgb-explicito.png": lambda: png(1600, 2400, extra=[iccp(b"sRGB IEC61966-2.1", PERFIL_BASE)]),

    # --- portadas ---
    "portada.png": lambda: png(1600, 2560),
    "portada-lado-corto.png": lambda: png(1000, 1600),     # lado corto < 1400
    "portada-baja.png": lambda: png(1500, 2400),           # alto < 2500

    # --- logos ---
    "logo.png": lambda: png(1800, 600, tipo_color=6),
    "logo-opaco.png": lambda: png(1800, 600),
    "logo-enorme.png": lambda: png(3000, 2000, tipo_color=6),

    # --- laminas a color ---
    "color-01.png": lambda: png(1600, 2400),
    "color-02.png": lambda: png(1600, 2400),

    # --- JPEG (solo cabeceras, ver el docstring) ---
    "jpeg-rgb.jpg": lambda: jpeg(1600, 2400),
    "jpeg-cmyk.jpg": lambda: jpeg(1600, 2400, componentes=4),
    "jpeg-p3.jpg": lambda: jpeg(1600, 2400, app2=PERFIL_BASE + P3),
    "jpeg-p3-utf16.jpg": lambda: jpeg(1600, 2400, app2=PERFIL_BASE + P3_16),
    "jpeg-progresivo.jpg": lambda: (jpeg(1600, 2400).replace(b"\xff\xc0", b"\xff\xc2", 1)),
    # DISCRIMINANTE: el DHT va despues del SOF0, como en un JPEG real.
    "jpeg-con-dht.jpg": lambda: jpeg_con_dht(1600, 2400),

    # --- lo que NO es un PNG ni un JPG, con la extension mintiendo ---
    "webp-renombrado.png": lambda: b"RIFF\x24\0\0\0WEBPVP8 ",
    "heic-renombrado.png": lambda: b"\0\0\0\x18ftypheic\0\0\0\0mif1heic",
    "tiff-renombrado.png": lambda: b"II*\0\x08\0\0\0",
    "gif-renombrado.png": lambda: b"GIF89a\x01\0\x01\0",
    "texto-renombrado.png": lambda: "no soy una imagen\n".encode("utf-8"),
    "vacio.png": lambda: b"",
}

# Esta CUELGA al Python: struct.unpack(">IIBB", b[16:26]) lanza struct.error
# sin captura y el generador aborta con un traceback. Se genera igual, pero el
# exportador la salta y solo se prueba en TypeScript.
FRAGILES = {
    "truncado.png": lambda: b"\x89PNG\r\n\x1a\n" + b"\0" * 8,
}


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    total = 0
    for nombre, hacer in {**IMAGENES, **FRAGILES}.items():
        datos = hacer()
        (SALIDA / nombre).write_bytes(datos)
        total += len(datos)
        print(f"  {nombre:32} {len(datos):>9,} bytes")
    print(f"{len(IMAGENES) + len(FRAGILES)} imagenes, {total / 1e6:.2f} MB en total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
