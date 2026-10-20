#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera los .docx de prueba en tests/fixtures/docx/.

Son documentos de Word VALIDOS, construidos a mano con zipfile y OOXML, porque
el importador tiene que probarse contra un .docx de verdad y no contra un HTML
simulado. Todo el contenido es inventado.

Uso: python3 scripts/docx-prueba.py
"""

import sys
import zipfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SALIDA = AQUI.parent / "tests" / "fixtures" / "docx"
IMAGEN = AQUI.parent / "tests" / "fixtures" / "imagenes" / "buena.png"

NS = (
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
)

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"""

STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/></w:style>
</w:styles>
"""


def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def run(texto, negrita=False, cursiva=False, subrayado=False, tachado=False):
    props = ""
    if negrita or cursiva or subrayado or tachado:
        props = "<w:rPr>"
        if negrita:
            props += "<w:b/>"
        if cursiva:
            props += "<w:i/>"
        if subrayado:
            props += '<w:u w:val="single"/>'
        if tachado:
            props += "<w:strike/>"
        props += "</w:rPr>"
    # xml:space preserve para que Word no se coma los espacios de los extremos
    return f'<w:r>{props}<w:t xml:space="preserve">{esc(texto)}</w:t></w:r>'


def parrafo(runs, estilo=None):
    props = f'<w:pPr><w:pStyle w:val="{estilo}"/></w:pPr>' if estilo else ""
    return f"<w:p>{props}{''.join(runs)}</w:p>"


def imagen_parrafo(rid, nombre="Imagen 1"):
    return (
        "<w:p><w:r><w:drawing>"
        '<wp:inline distT="0" distB="0" distL="0" distR="0">'
        '<wp:extent cx="3048000" cy="4572000"/>'
        f'<wp:docPr id="1" name="{nombre}" descr="La cabana de noche"/>'
        "<a:graphic><a:graphicData "
        'uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        "<pic:pic><pic:nvPicPr>"
        f'<pic:cNvPr id="0" name="{nombre}" descr="La cabana de noche"/>'
        "<pic:cNvPicPr/></pic:nvPicPr>"
        f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3048000" cy="4572000"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
        "</pic:pic></a:graphicData></a:graphic></wp:inline>"
        "</w:drawing></w:r></w:p>"
    )


def tabla():
    celda = '<w:tc><w:p><w:r><w:t>celda</w:t></w:r></w:p></w:tc>'
    return f"<w:tbl><w:tr>{celda}{celda}</w:tr></w:tbl>"


def documento(cuerpo):
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f"<w:document {NS}><w:body>{cuerpo}</w:body></w:document>"
    )


def rels_documento(con_imagen):
    extra = ""
    if con_imagen:
        extra = (
            '<Relationship Id="rId9" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
            'Target="media/image1.png"/>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId2" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
        'Target="styles.xml"/>'
        f"{extra}</Relationships>"
    )


def escribir(nombre, cuerpo, con_imagen=False):
    destino = SALIDA / nombre
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", documento(cuerpo))
        z.writestr("word/styles.xml", STYLES)
        z.writestr("word/_rels/document.xml.rels", rels_documento(con_imagen))
        if con_imagen:
            z.writestr("word/media/image1.png", IMAGEN.read_bytes())
    print(f"  {nombre:28} {destino.stat().st_size:>8,} bytes")


DOCUMENTOS = {
    # Un capitulo completo y tipico
    "capitulo-completo.docx": (
        [
            parrafo([run("Cap\u00edtulo 1: La luz que no tocaba")], "Heading1"),
            parrafo([
                run("Marta baj\u00f3 del autob\u00fas con la bolsa al hombro. El faro estaba "),
                run("encendido", cursiva=True),
                run(", y eso era imposible."),
            ]),
            parrafo([run("")]),  # parrafo vacio: se descarta
            parrafo([
                run("Llevaba "),
                run("cuarenta a\u00f1os", negrita=True),
                run(" apagado, seg\u00fan el folleto."),
            ]),
            parrafo([run("Un tramo "), run("en los dos", negrita=True, cursiva=True), run(" estilos.")]),
            parrafo([run("Una parte")], "Heading2"),
            parrafo([run("Texto de la parte.")]),
            imagen_parrafo("rId9"),
            parrafo([run("Texto despu\u00e9s de la ilustraci\u00f3n.")]),
        ],
        True,
    ),
    # Lo que hay que descartar informando: tabla, subrayado, tachado
    "con-cosas-que-descartar.docx": (
        [
            parrafo([run("Cap\u00edtulo 2: Descartes")], "Heading1"),
            parrafo([run("Texto normal.")]),
            parrafo([run("subrayado", subrayado=True), run(" y "), run("tachado", tachado=True)]),
            tabla(),
            parrafo([run("Final.")]),
        ],
        False,
    ),
    # Un manuscrito entero en UN solo archivo, con varios capitulos
    "manuscrito-completo.docx": (
        [
            parrafo([run("Cap\u00edtulo 1: Primero")], "Heading1"),
            parrafo([run("Texto del primero.")]),
            parrafo([run("Cap\u00edtulo 2: Segundo")], "Heading1"),
            parrafo([run("Texto del segundo.")]),
            parrafo([run("Pr\u00f3logo")], "Heading1"),
            parrafo([run("Texto del prologo.")]),
        ],
        False,
    ),
    # Sin encabezado de estilo: la primera linea es el titulo
    "sin-estilo-de-titulo.docx": (
        [
            parrafo([run("Cap\u00edtulo 3: Sin estilo")]),
            parrafo([run("Primer parrafo.")]),
        ],
        False,
    ),
    # Texto que choca con el dialecto de Markdown
    "texto-conflictivo.docx": (
        [
            parrafo([run("Cap\u00edtulo 4: Conflictos")], "Heading1"),
            parrafo([run("5 * 3 * 2 y snake_case_aqui")]),
            parrafo([run("> esto no es un verso")]),
            parrafo([run("# esto no es un subtitulo")]),
            parrafo([run("* * *")]),
            parrafo([run("a & b < c > d")]),
            parrafo([run("C:\\Users\\ana")]),
            parrafo([run("[ilustraci\u00f3n: falsa | no soy una marca]")]),
        ],
        False,
    ),
    # Vacio
    "vacio.docx": ([], False),
}


def main():
    if not IMAGEN.exists():
        print(f"Falta {IMAGEN}; corre primero scripts/imagenes-prueba.py", file=sys.stderr)
        return 1
    SALIDA.mkdir(parents=True, exist_ok=True)
    for nombre, (cuerpo, con_imagen) in DOCUMENTOS.items():
        escribir(nombre, "".join(cuerpo), con_imagen)
    print(f"{len(DOCUMENTOS)} documentos en {SALIDA.relative_to(SALIDA.parent.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
