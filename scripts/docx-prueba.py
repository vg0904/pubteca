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


def salto_de_pagina():
    """Como separa capitulos la mayoria de los escritores en un documento unico.

    OJO: mammoth lo DESCARTA por completo; no queda ni rastro en su HTML. Es el
    hueco mas importante del importador y esta anotado en el plan.
    """
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'


def salto_de_linea():
    """Mayus+Intro: un salto DENTRO del parrafo. Asi se escriben los poemas y
    las cartas, y a veces la cabecera en dos lineas en un solo parrafo."""
    return "<w:r><w:br/></w:r>"


def llamada(n):
    """La llamada a una nota al pie, en el texto."""
    return (
        '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr>'
        f'<w:footnoteReference w:id="{n}"/></w:r>'
    )


def notas_xml(notas):
    """word/footnotes.xml, con los dos separadores que Word pone siempre."""
    cuerpo = (
        '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>'
        '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>'
    )
    for n, parrafos in notas.items():
        cuerpo += f'<w:footnote w:id="{n}">' + "".join(parrafo([run(t)]) for t in parrafos) + "</w:footnote>"
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f"<w:footnotes {NS}>{cuerpo}</w:footnotes>"
    )


def tabla():
    celda = '<w:tc><w:p><w:r><w:t>celda</w:t></w:r></w:p></w:tc>'
    return f"<w:tbl><w:tr>{celda}{celda}</w:tr></w:tbl>"


def documento(cuerpo):
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f"<w:document {NS}><w:body>{cuerpo}</w:body></w:document>"
    )


def rels_documento(con_imagen, con_notas=False):
    extra = ""
    if con_notas:
        extra += (
            '<Relationship Id="rId8" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" '
            'Target="footnotes.xml"/>'
        )
    if con_imagen:
        extra += (
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


# Fecha fija dentro del zip. Sin esto, zipfile pone la hora actual y los .docx
# salen distintos byte a byte en cada ejecucion: regenerar uno ensuciaba el
# diff de los ocho.
FECHA = (2020, 1, 1, 0, 0, 0)


def escribir(nombre, cuerpo, con_imagen=False, notas=None):
    destino = SALIDA / nombre

    def meter(z, ruta, datos):
        info = zipfile.ZipInfo(ruta, date_time=FECHA)
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, datos)

    tipos = CONTENT_TYPES
    if notas:
        tipos = tipos.replace(
            "</Types>",
            '  <Override PartName="/word/footnotes.xml" ContentType="application/'
            'vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>\n</Types>',
        )
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
        meter(z, "[Content_Types].xml", tipos)
        meter(z, "_rels/.rels", RELS)
        meter(z, "word/document.xml", documento(cuerpo))
        meter(z, "word/styles.xml", STYLES)
        meter(z, "word/_rels/document.xml.rels", rels_documento(con_imagen, bool(notas)))
        if notas:
            meter(z, "word/footnotes.xml", notas_xml(notas))
        if con_imagen:
            meter(z, "word/media/image1.png", IMAGEN.read_bytes())
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
    # EL CASO REAL: un manuscrito entero en un archivo, separado como lo
    # separa un escritor de verdad. Documenta los limites de la deteccion.
    "manuscrito-realista.docx": (
        [
            # Separado por SALTO DE PAGINA, con el titulo en mayusculas y sin estilo
            parrafo([run("CAP\u00cdTULO UNO")]),
            parrafo([run("Texto del primero.")]),
            salto_de_pagina(),
            parrafo([run("CAP\u00cdTULO DOS")]),
            parrafo([run("Texto del segundo.")]),
            salto_de_pagina(),
            # Con numero romano
            parrafo([run("Cap\u00edtulo III")]),
            parrafo([run("Texto del tercero.")]),
            salto_de_pagina(),
            # Solo el numero, sin la palabra
            parrafo([run("4")]),
            parrafo([run("Texto del cuarto.")]),
            salto_de_pagina(),
            # Un titulo sin la palabra «capitulo»
            parrafo([run("La luz que no tocaba")]),
            parrafo([run("Texto del quinto.")]),
        ],
        False,
    ),
    # La forma mas comun en un manuscrito de Word: la etiqueta en una linea y
    # el titulo en la SIGUIENTE. Sin tratarlo, el titulo acababa siendo el
    # primer parrafo del capitulo.
    "manuscrito-dos-lineas.docx": (
        [
            parrafo([run("CAP\u00cdTULO UNO")]),
            parrafo([run("El despertar")]),
            parrafo([run("Texto del primero.")]),
            salto_de_pagina(),
            # Detras de la etiqueta va un dialogo, que NO es el titulo
            parrafo([run("CAP\u00cdTULO DOS")]),
            parrafo([run("\u2014No puedo \u2014dijo ella.")]),
            parrafo([run("Texto del segundo.")]),
            salto_de_pagina(),
            # Detras de la etiqueta va prosa que acaba en punto: tampoco
            parrafo([run("Pr\u00f3logo")]),
            parrafo([run("Llovia sobre el puerto.")]),
            salto_de_pagina(),
            # Y aqui si: etiqueta y titulo, los dos en su linea
            parrafo([run("Cap\u00edtulo 4")]),
            parrafo([run("La casa de los Arriaga")]),
            parrafo([run("Texto del cuarto.")]),
        ],
        False,
    ),
    # Una lamina a pagina completa entre dos capitulos: el salto que la precede
    # NO es un capitulo nuevo.
    "manuscrito-con-lamina.docx": (
        [
            parrafo([run("Cap\u00edtulo 1: El puerto")], "Heading1"),
            parrafo([run("Texto del primero.")]),
            salto_de_pagina(),
            imagen_parrafo("rId9"),
            # Prosa detras de la lamina, y SIN salto: si el salto de antes de la
            # lamina se arrastrara hasta aqui, partiria el capitulo por la mitad
            parrafo([run("Sigue el primero.")]),
            salto_de_pagina(),
            parrafo([run("Cap\u00edtulo 2: La bahia")], "Heading1"),
            parrafo([run("Texto del segundo.")]),
        ],
        True,
    ),
    # Saltos de linea sueltos (Mayus+Intro). Antes se tiraban y pegaban las
    # palabras: «Era de noche» + salto + «y llovia» daba «Era de nochey llovia».
    "saltos-de-linea.docx": (
        [
            parrafo([run("Cap\u00edtulo 1: Cartas")], "Heading1"),
            parrafo([run("Era de noche"), salto_de_linea(), run("y llov\u00eda sobre el puerto.")]),
            # Un poema: con el estilo de cita, cada linea es un verso
            parrafo(
                [run("Las barcas duermen"), salto_de_linea(), run("la sal no duerme"), salto_de_linea(), run("el faro cuenta")],
                "Quote",
            ),
            parrafo([run("Firmado:"), salto_de_linea(), run("Marta Ibar")]),
            salto_de_pagina(),
            # La cabecera en dos lineas, pero en UN parrafo
            parrafo([run("CAP\u00cdTULO DOS"), salto_de_linea(), run("El regreso")]),
            parrafo([run("Texto del segundo.")]),
        ],
        False,
    ),
    # Notas al pie de verdad, con su word/footnotes.xml. Antes salian DOS veces
    # al final, con un «↑» suelto.
    "notas-al-pie.docx": (
        [
            parrafo([run("Cap\u00edtulo 1: El archivo")], "Heading1"),
            parrafo([run("El legajo"), llamada(1), run(" estaba en el s\u00f3tano.")]),
            parrafo([run("Nadie lo hab\u00eda abierto"), llamada(2), run(".")]),
        ],
        False,
        {1: ["Un legajo es un atado de papeles."], 2: ["Desde 1931.", "Seg\u00fan el inventario."]},
    ),
    # Vacio
    "vacio.docx": ([], False),
}


def main():
    if not IMAGEN.exists():
        print(f"Falta {IMAGEN}; corre primero scripts/imagenes-prueba.py", file=sys.stderr)
        return 1
    SALIDA.mkdir(parents=True, exist_ok=True)
    for nombre, (cuerpo, con_imagen, *notas) in DOCUMENTOS.items():
        escribir(nombre, "".join(cuerpo), con_imagen, notas[0] if notas else None)
    print(f"{len(DOCUMENTOS)} documentos en {SALIDA.relative_to(SALIDA.parent.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
