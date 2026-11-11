#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prepara lo que necesita el libro impreso: las fuentes y los patrones de particion.

  public/fuentes/impreso/   las cuatro caras (regular, cursiva, negrita y
                            negrita cursiva) de cada familia de la lista,
                            estaticas, con el OFL de cada una
                            (`OFL-<Familia>.txt`)
  src/core/impreso/patrones/es.ts, en.ts
                            los patrones de particion de hyph-utf8, como datos

Todo se descarga de un commit FIJO y se comprueba su sha256: si el origen
cambia, el script se para en vez de meter otra cosa en el repo.

Las fuentes se publican variables (peso y, algunas, tamaño optico). Aqui se
sacan las cuatro caras estaticas (400 y 700; a 11 pt de tamaño optico si la
familia lo tiene, que es el del texto de un libro) y se recortan a los
alfabetos latinos y la puntuacion: de casi 1 MB a unos 100 kB por cara. Se
conservan el kerning y las ligaduras, que el compositor usa, y las versalitas
y las cifras de texto. La lista de familias tiene su espejo en
src/core/impreso/familias.ts (nombre, archivos y cuerpo recomendado).

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
from urllib.parse import quote

RAIZ = Path(__file__).resolve().parent.parent
FUENTES = RAIZ / "public" / "fuentes" / "impreso"
PATRONES = RAIZ / "src" / "core" / "impreso" / "patrones"

GOOGLE = "https://raw.githubusercontent.com/google/fonts/08dc85da6bca7ae308a6f1d38d0b137465646071/ofl/"

# Cada familia: el prefijo de sus archivos, su carpeta en google/fonts, la
# romana y la cursiva variables con su sha256, el OFL, y los ejes que se fijan
# ademas del peso (el tamaño optico, si lo tiene).
FAMILIAS = [
    {
        "prefijo": "SourceSerif4", "carpeta": "sourceserif4", "ejes": {"opsz": 11},
        "romana": ("SourceSerif4[opsz,wght].ttf", "97b2d4da6e3cb494b5a1e66ae176914d852ccabef49e0c02c0df25f3e39aca0b"),
        "cursiva": ("SourceSerif4-Italic[opsz,wght].ttf", "15fbc7e4679489a501998c3669272637a6646388ef7e4bd77eebb5bf967a1f42"),
        "ofl": "5f94c3fd3a23131a417ab5a0c8452de57e70c3cfb9f604d88241f7065ebf9fd9",
    },
    {
        "prefijo": "EBGaramond", "carpeta": "ebgaramond", "ejes": {},
        "romana": ("EBGaramond[wght].ttf", "684fcc0db2239b43497341d596d68422ea60ef7522cf2e857071ad84e4ade2a4"),
        "cursiva": ("EBGaramond-Italic[wght].ttf", "b76b365299331ddff5f8077648ef3b6fbb67f3bd15bebb955a42c6e57904aed0"),
        "ofl": "0985066662eb755ed3683ae5482a81a9195b49ce3f7e165cc2388b3dbece7dd7",
    },
    {
        # Literata solo nombra 7, 12, 36 y 72 en su STAT: 12 es su texto.
        "prefijo": "Literata", "carpeta": "literata", "ejes": {"opsz": 12},
        "romana": ("Literata[opsz,wght].ttf", "b41138c9373112f32abb589cc22e8674b06ed4048b0c513be922bdd26f274440"),
        "cursiva": ("Literata-Italic[opsz,wght].ttf", "d483dfaeba9cbf4ce71d32a52ee65df82f7e35b15fff8d1011cdb242d1fcd465"),
        "ofl": "8742963604cd89dc81437811a850018fc03b2bfad686d7422c8235967c87614e",
    },
    {
        "prefijo": "CrimsonPro", "carpeta": "crimsonpro", "ejes": {},
        "romana": ("CrimsonPro[wght].ttf", "16aa9fb7300a93637da51fac03a071b2ff08b6bbf65f99c794c25f040b58af6a"),
        "cursiva": ("CrimsonPro-Italic[wght].ttf", "a74dc11dcf2fbb1452064e42395a40a907ca630b49cff86012223785e52b2559"),
        "ofl": "1820869bd5baa1c2d88fa87c89eea532cf9442d841008acab720654b7f82823d",
    },
    {
        "prefijo": "Alegreya", "carpeta": "alegreya", "ejes": {},
        "romana": ("Alegreya[wght].ttf", "ba5564634b93a8f8ba57b48cd4f1ae7417d2b4656fbac779028679b00de3cf12"),
        "cursiva": ("Alegreya-Italic[wght].ttf", "fa915eec76227935dc5fb678953c94b71287c360928013cfdb441dfe52f5a391"),
        "ofl": "f6f60d5d4cf4f4b1fc4e41353c897a2f5a16e6396c0cd8fa8bdfd2f4586a9a68",
    },
    {
        "prefijo": "LibreBaskerville", "carpeta": "librebaskerville", "ejes": {},
        "romana": ("LibreBaskerville[wght].ttf", "05a95421961341c5b2556285e8415df9db27dab4f4abe22b446b3c6a8b916c5d"),
        "cursiva": ("LibreBaskerville-Italic[wght].ttf", "223959683dc73ec4437bd61fabaa4b3f22209e22855ffd3aee36ba61a5116e97"),
        "ofl": "3624eddd4c8f8a908130a417ae7cd089c9da69899c4e0ca1a5217d0a6fae16fd",
    },
]

DESCARGAS = {
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


def bajar(url: str, esperado: str, que: str) -> bytes:
    # Con curl y no con urllib: el Python de python.org en macOS no trae
    # certificados, y curl los tiene en macOS y en Linux.
    datos = subprocess.run(["curl", "-sSfL", "--max-time", "120", url], check=True, capture_output=True).stdout
    real = hashlib.sha256(datos).hexdigest()
    if real != esperado:
        sys.exit(f"{que}: el sha256 no coincide ({real}). El origen cambio: no se sigue.")
    return datos


def descargar(clave: str) -> bytes:
    url, esperado = DESCARGAS[clave]
    return bajar(url, esperado, clave)


def de_google(carpeta: str, archivo: str, esperado: str) -> bytes:
    return bajar(GOOGLE + carpeta + "/" + quote(archivo), esperado, f"{carpeta}/{archivo}")


def fuentes() -> None:
    try:
        from fontTools.ttLib import TTFont
        from fontTools.varLib.instancer import instantiateVariableFont
        from fontTools import subset
    except ImportError:
        sys.exit("Hace falta fontTools para regenerar las fuentes (ver el docstring).")
    FUENTES.mkdir(parents=True, exist_ok=True)
    for fam in FAMILIAS:
        variables = {k: de_google(fam["carpeta"], *fam[k]) for k in ("romana", "cursiva")}
        for nombre, origen, peso in CARAS:
            f = TTFont(io.BytesIO(variables[origen]))
            inst = instantiateVariableFont(f, {"wght": peso, **fam["ejes"]}, inplace=False, updateFontNames=True)
            opciones = subset.Options()
            opciones.layout_features = CARACTERISTICAS
            opciones.hinting = False
            opciones.name_IDs = ["*"]
            opciones.name_languages = ["*"]
            opciones.notdef_outline = True
            sub = subset.Subsetter(opciones)
            sub.populate(unicodes=UNICODES)
            sub.subset(inst)
            salida = FUENTES / f"{fam['prefijo']}-{nombre}.ttf"
            # Sin la hora de hoy en la cabecera: regenerarla da los mismos bytes.
            inst.recalcTimestamp = False
            inst["head"].modified = f["head"].modified
            inst.save(salida)
            print(f"  {salida.relative_to(RAIZ)}  {salida.stat().st_size} bytes")
        (FUENTES / f"OFL-{fam['prefijo']}.txt").write_bytes(de_google(fam["carpeta"], "OFL.txt", fam["ofl"]))


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
