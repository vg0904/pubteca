#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prepara lo que necesita el libro impreso: la fuente y los patrones de particion.

  public/fuentes/impreso/   las cuatro caras de Source Serif 4 (regular,
                            cursiva, negrita y negrita cursiva), estaticas,
                            con su OFL.txt
  src/core/impreso/patrones/es.ts, en.ts
                            los patrones de particion de hyph-utf8, como datos

Todo se descarga de un commit FIJO y se comprueba su sha256: si el origen
cambia, el script se para en vez de meter otra cosa en el repo.

La fuente se publica variable (peso y tamaño optico). Aqui se sacan las
cuatro caras estaticas a 11 pt de tamaño optico, que es el del texto de un
libro, y se recortan a los alfabetos latinos y la puntuacion: de 1,2 MB a
unos 100 kB por cara. Se conservan el kerning y las ligaduras, que el
compositor usa, y las versalitas y las cifras de texto, para despues.

Necesita fontTools solo para regenerarlos (los archivos se commitean):
  python3 -m venv /tmp/v && /tmp/v/bin/pip install fonttools==4.68.0
  /tmp/v/bin/python -I scripts/impreso-recursos.py
"""

import hashlib
import io
import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FUENTES = RAIZ / "public" / "fuentes" / "impreso"
PATRONES = RAIZ / "src" / "core" / "impreso" / "patrones"

GOOGLE = "https://raw.githubusercontent.com/google/fonts/08dc85da6bca7ae308a6f1d38d0b137465646071/ofl/sourceserif4/"
DESCARGAS = {
    "romana": (GOOGLE + "SourceSerif4%5Bopsz%2Cwght%5D.ttf", "97b2d4da6e3cb494b5a1e66ae176914d852ccabef49e0c02c0df25f3e39aca0b"),
    "cursiva": (GOOGLE + "SourceSerif4-Italic%5Bopsz%2Cwght%5D.ttf", "15fbc7e4679489a501998c3669272637a6646388ef7e4bd77eebb5bf967a1f42"),
    "ofl": (GOOGLE + "OFL.txt", "5f94c3fd3a23131a417ab5a0c8452de57e70c3cfb9f604d88241f7065ebf9fd9"),
    "es": ("https://raw.githubusercontent.com/hyphenation/tex-hyphen/673f7b33e664b141432ba6d78d2caa686ea5317f/"
           "hyph-utf8/tex/generic/hyph-utf8/patterns/tex/hyph-es.tex",
           "6a2e5f39a991a23d1cd8a23dbd0f6fe96a9f07561a6695f4f3320f47030e236c"),
    "en": ("https://raw.githubusercontent.com/hyphenation/tex-hyphen/dce23b4eb2df218ec6893b851562316d7cf37355/"
           "hyph-utf8/tex/generic/hyph-utf8/patterns/tex/hyph-en-us.tex",
           "f4ffcd96c5cbc886bdad23f95dcae8edc3cd3620eae62f7946eceda97c4e68f8"),
}

# Los alfabetos latinos, la puntuacion (rayas, comillas, puntos suspensivos),
# las ligaduras y los simbolos con que se suele marcar un cambio de escena.
UNICODES = (
    list(range(0x20, 0x7F)) + list(range(0xA0, 0x250)) + list(range(0x2B0, 0x370))
    + list(range(0x1E00, 0x1F00)) + list(range(0x2000, 0x2070)) + list(range(0x20A0, 0x20C0))
    + list(range(0x2100, 0x2150)) + list(range(0x2190, 0x2200)) + list(range(0x25A0, 0x2600))
    + list(range(0x2700, 0x27C0)) + list(range(0xFB00, 0xFB07))
)
CARACTERISTICAS = ["kern", "liga", "clig", "onum", "lnum", "pnum", "tnum", "smcp", "c2sc", "ccmp", "locl", "mark", "mkmk"]
CARAS = [("Regular", "romana", 400), ("Italic", "cursiva", 400), ("Bold", "romana", 700), ("BoldItalic", "cursiva", 700)]
OPSZ = 11


def descargar(clave: str) -> bytes:
    # Con curl y no con urllib: el Python de python.org en macOS no trae
    # certificados, y curl los tiene en macOS y en Linux.
    url, esperado = DESCARGAS[clave]
    datos = subprocess.run(["curl", "-sSfL", "--max-time", "120", url], check=True, capture_output=True).stdout
    real = hashlib.sha256(datos).hexdigest()
    if real != esperado:
        sys.exit(f"{clave}: el sha256 no coincide ({real}). El origen cambio: no se sigue.")
    return datos


def fuentes() -> None:
    try:
        from fontTools.ttLib import TTFont
        from fontTools.varLib.instancer import instantiateVariableFont
        from fontTools import subset
    except ImportError:
        sys.exit("Hace falta fontTools para regenerar las fuentes (ver el docstring).")
    FUENTES.mkdir(parents=True, exist_ok=True)
    variables = {k: descargar(k) for k in ("romana", "cursiva")}
    for nombre, origen, peso in CARAS:
        f = TTFont(io.BytesIO(variables[origen]))
        inst = instantiateVariableFont(f, {"wght": peso, "opsz": OPSZ}, inplace=False, updateFontNames=True)
        opciones = subset.Options()
        opciones.layout_features = CARACTERISTICAS
        opciones.hinting = False
        opciones.name_IDs = ["*"]
        opciones.name_languages = ["*"]
        opciones.notdef_outline = True
        sub = subset.Subsetter(opciones)
        sub.populate(unicodes=UNICODES)
        sub.subset(inst)
        salida = FUENTES / f"SourceSerif4-{nombre}.ttf"
        # Sin la hora de hoy en la cabecera: regenerarla da los mismos bytes.
        inst.recalcTimestamp = False
        inst["head"].modified = f["head"].modified
        inst.save(salida)
        print(f"  {salida.relative_to(RAIZ)}  {salida.stat().st_size} bytes")
    (FUENTES / "OFL.txt").write_bytes(descargar("ofl"))


def patrones() -> None:
    PATRONES.mkdir(parents=True, exist_ok=True)
    for idioma, comentario in (("es", "español"), ("en", "inglés de Estados Unidos")):
        tex = descargar(idioma).decode("utf-8")
        cabecera = "\n".join(l[1:].rstrip() if l.startswith("%") else l for l in tex.split("\\patterns{")[0].splitlines())
        # Sobre la cabecera ya sin los «%» de TeX.
        izq = re.search(r"typesetting:\s*\n\s*left:\s*(\d+)\s*\n\s*right:\s*(\d+)", cabecera)
        cuerpo = re.sub(r"%.*", "", tex.split("\\patterns{")[1].split("}")[0])
        lista = " ".join(cuerpo.split())
        excepciones = ""
        if "\\hyphenation{" in tex:
            excepciones = " ".join(re.sub(r"%.*", "", tex.split("\\hyphenation{")[1].split("}")[0]).split())
        ts = f"""/**
 * Patrones de particion silabica del {comentario}, de hyph-utf8.
 *
 * GENERADO por scripts/impreso-recursos.py desde un commit fijo y comprobado:
 * no se edita a mano. Su licencia y su autoria van aqui debajo, como piden.
 *
{chr(10).join(' * ' + l if l else ' *' for l in cabecera.strip().splitlines())}
 */

/** Cuantas letras como minimo quedan a cada lado del guion. */
export const MINIMOS = {{ izquierda: {izq.group(1) if izq else 2}, derecha: {izq.group(2) if izq else 2} }}

export const PATRONES = '{lista}'

/** Palabras con su particion escrita a mano (las que los patrones fallan). */
export const EXCEPCIONES = '{excepciones}'
"""
        destino = PATRONES / f"{idioma}.ts"
        destino.write_text(ts, encoding="utf-8")
        print(f"  {destino.relative_to(RAIZ)}  {destino.stat().st_size} bytes")


def main() -> int:
    patrones()
    fuentes()
    return 0


if __name__ == "__main__":
    sys.exit(main())
