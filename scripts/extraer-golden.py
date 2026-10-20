#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extrae el golden de un libro de prueba generado por generar_epub.py.

El contrato del golden test NO es un hash del .epub: eso es inalcanzable,
porque pako y zlib producen flujos deflate distintos para el mismo contenido.
Lo que se compara es:

  1. la LISTA de entradas y su orden exacto,
  2. el mimetype como entrada 0, STORE, 20 bytes, sin campos extra,
  3. el contenido DESCOMPRIMIDO, byte a byte, de cada entrada de texto,
  4. el sha256 de cada entrada binaria (las imagenes y fuentes deben viajar
     SIN recodificar).

El unico dato no determinista de la salida es `dcterms:modified`. En vez de
normalizarlo, se guarda en el manifiesto para que el test le inyecte ese mismo
instante al reloj del core y la comparacion siga siendo exacta.

Uso: python3 scripts/extraer-golden.py [carpeta-del-libro]
"""

import hashlib
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent

TEXTO = (".xhtml", ".opf", ".ncx", ".css", ".xml", "mimetype")
TIENDAS = {"Kindle": "kindle", "AppleBooks": "apple"}


def es_texto(nombre: str) -> bool:
    return nombre == "mimetype" or nombre.endswith(TEXTO)


def extraer(epub: Path, destino: Path) -> dict:
    if destino.exists():
        shutil.rmtree(destino)
    destino.mkdir(parents=True)

    entradas = []
    modificado = None
    with zipfile.ZipFile(epub) as z:
        for i, info in enumerate(z.infolist()):
            datos = z.read(info.filename)
            entrada = {
                "ruta": info.filename,
                "metodo": "STORE" if info.compress_type == 0 else "DEFLATE",
                "extra": len(info.extra),
                "tamano": info.file_size,
                "sha256": hashlib.sha256(datos).hexdigest(),
                "texto": es_texto(info.filename),
            }
            if entrada["texto"]:
                t = datos.decode("utf-8")
                m = re.search(r'property="dcterms:modified">([^<]+)<', t)
                if m:
                    modificado = m.group(1)
                salida = destino / info.filename
                salida.parent.mkdir(parents=True, exist_ok=True)
                salida.write_text(t, encoding="utf-8")
            entradas.append(entrada)

    return {
        "epub": epub.name,
        "bytes": epub.stat().st_size,
        "dcterms_modified": modificado,
        "entradas": entradas,
    }


def main():
    libro = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else RAIZ / "tests" / "fixtures" / "libro-prueba"
    salida_epub = libro / "salida"
    golden = RAIZ / "tests" / "golden" / libro.name
    golden.mkdir(parents=True, exist_ok=True)

    manifiesto = {
        "_aviso": "Generado por scripts/extraer-golden.py. No editar a mano.",
        "_libro": libro.name,
        "tiendas": {},
    }

    for sufijo, carpeta in TIENDAS.items():
        encontrados = list(salida_epub.glob(f"*_{sufijo}.epub"))
        if not encontrados:
            print(f"  falta el EPUB de {sufijo}", file=sys.stderr)
            return 1
        datos = extraer(encontrados[0], golden / carpeta)
        manifiesto["tiendas"][carpeta] = datos
        texto = sum(1 for e in datos["entradas"] if e["texto"])
        print(f"  {carpeta:7} {len(datos['entradas']):>3} entradas "
              f"({texto} de texto, {len(datos['entradas']) - texto} binarias)  "
              f"{datos['bytes']:>8,} bytes")

    reporte = salida_epub / "reporte.txt"
    if reporte.exists():
        (golden / "reporte.txt").write_text(reporte.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"  reporte.txt copiado")

    (golden / "manifiesto.json").write_text(
        json.dumps(manifiesto, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    mods = {t["dcterms_modified"] for t in manifiesto["tiendas"].values()}
    print(f"  dcterms:modified = {mods}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
