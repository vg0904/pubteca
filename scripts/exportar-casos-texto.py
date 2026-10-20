#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extrae de generar_epub.py el comportamiento real de sus funciones de texto.

El port a TypeScript se prueba contra ESTO, no contra expectativas escritas a
mano: escribirlas a mano seria adivinar justo lo que hay que medir.

Uso:
    python3 scripts/exportar-casos-texto.py [ruta/a/generar_epub.py]

Escribe tests/casos-texto.json. No lee ni toca ningun libro real: todas las
entradas son sinteticas y estan aqui a la vista.
"""

import hashlib
import importlib.util
import json
import sys
import tempfile
import uuid
from pathlib import Path

AQUI = Path(__file__).resolve().parent
POR_DEFECTO = AQUI.parent.parent / "Generador EPUB" / "generar_epub.py"
SALIDA = AQUI.parent / "tests" / "casos-texto.json"


def cargar(ruta):
    """Importa generar_epub.py por ruta, sin tocar sys.path."""
    spec = importlib.util.spec_from_file_location("generar_epub_ref", ruta)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # main() esta tras if __name__, no se ejecuta
    return mod


# ---------------------------------------------------------------------------
# Entradas. Cada lista cubre a proposito las trampas Python -> JavaScript.
# ---------------------------------------------------------------------------

ESC = [
    "", "sin nada", "a&b<c>\"d'e", "&amp;", "<script>", "D'Artagnan", "l'ete",
    "«comillas»", "a & b", ">>>", 'dijo "hola"', "100% & 50<", "\u00d1andu",
]

SIN_ACENTOS = [
    "", "Nandu", "\u00d1and\u00fa A\u00f1o", "El Bosque: Cap\u00edtulo 1",
    "\u65e5\u672c\u8a9e", "\u00f8", "\u00df", "cafe\u0301",  # e + combining acute
    "\u00c1\u00c9\u00cd\u00d3\u00da", "l\u2019\u00e9t\u00e9", "Stra\u00dfe",
    "\u0130stanbul",  # I con punto: toLowerCase da dos code points en JS
    "\u0627\u0644\u0639\u0631\u0628\u064a\u0629",  # arabe SIN marcas: control
    # DISCRIMINANTES: marcas Mn fuera de U+0300-U+036F. Si el port usa el idiom
    # habitual de JS (/[\u0300-\u036f]/g) estas sobreviven y la salida cambia.
    "\u0645\u064e\u0631\u0652\u062d\u064e\u0628\u064b\u0627",  # arabe con harakat (Mn en U+064B..)
    "\u05d0\u05b8\u05d1",            # hebreo con qamats (Mn U+05B8)
    "\u0915\u0941\u0932",            # devanagari con vocal u (Mn U+0941)
    "a\u20dd",                        # circulo envolvente (Mn U+20DD)
    "e\u1ab0",                        # marca del bloque U+1AB0
    "\u0e01\u0e31",                   # tailandes con mai han akat (Mn U+0E31)
]

NOMBRE_SEGURO = [
    "", "   ", "---", "cap01", "Cap\u00edtulo 3", "mi ilustraci\u00f3n 1",
    "\u65e5\u672c\u8a9e", "a--b", "a___b", "A.B.C", "-borde-", "__", "ya-ok",
    "\u00d1and\u00fa A\u00f1o", "foto (1).png", "100%", "a/b\\c", "\u2014guion",
    "a\u20ddb", "e\u1ab0f", "cap\u03010\u03011",  # Mn fuera del bloque latino
]

# orden_natural: se exporta el ORDEN resultante, que es lo que importa
ORDENES = [
    ["01.md", "cap01.md", "cap1.md", "cap02.md", "cap10.md", "capa.md"],
    ["cap10.md", "cap9.md", "cap1.md", "cap100.md"],
    ["color-2.png", "color-10.png", "color-1.png"],
    ["cap01-01.png", "cap01-1.png", "cap1-01.png"],
    ["B.md", "a.md", "C.md", "b.md"],
    ["cap\u0663.md", "cap3.md", "cap1.md"],  # digito arabo-indico: \d es Unicode en Python
    ["cap01.jpg", "cap01.png", "cap01.jpeg"],
    # DISCRIMINANTE: Python compara por PUNTO DE CODIGO; el `<` de JS compara
    # por unidad UTF-16, y para un caracter astral invierte el resultado.
    ["\U0001F600x.md", "\ue000x.md"],
    ["\U0001F600.md", "\uffa0.md", "z.md"],
]

DESESCAPAR = [
    "", "sin escapes", "\\*no cursiva\\*", "\\[ilustraci\u00f3n: x\\]", "\\\\",
    "\\>", "\\#", "\\_", "a\\|b", "\\~", "\\-", "\\.", "\\!", "\\(\\)",
    "\\q",  # q no esta en la clase: la barra se queda
]

EN_LINEA = [
    "", "texto llano",
    "*cursiva*", "**negrita**", "***ambas***", "_cursiva_", "__negrita__",
    "a *b* c *d* e", "**a** y **b**",
    "*no cierra", "** espacio **", "*a*b*c*",
    "a&b<c>\"d'e",
    "\\*no cursiva\\*", "\\[ilustraci\u00f3n: x\\]", "\\\\", "\\>",
    # LA TRAMPA: \w es Unicode en Python y ASCII en JS
    "cami\u00f1\u00f3_x_fin", "ni\u00f1o_x_fin", "dijo _hola_ y",
    # DISCRIMINANTES de \w Unicode (cierre al final de la cadena o ante signo):
    "caf\u00e9_x_", "\u00f1_x_", "\u00e1_x_.", "caf\u00e9__x__", "\u00f1__x__",
    "_x_\u00f1", "_x_caf\u00e9", "__x__\u00f1",
    "A_x_", "a__x__",  # control ASCII: aqui los dos idiomas coinciden
    "\u65e5_x_", "_x_\u65e5",  # ideogramas: \w en Python los incluye
    "5_x_", "_x_5",  # digitos: \w en los dos
    "a_b_c", "caf\u00e9_x_fin", "fin_de_linea_", "_inicio", "snake_case_aqui",
    "ni\u00f1o__x__fin", "ABC__x__DEF",
    # $ en el contenido: un replace con string lo leeria como grupo
    "*a$1b*", "**$&**", "\\*$`\\*",
    "<em>ya tag</em>", "5 * 3 * 2",
    "***a** b*", "*a **b** c*",
]

TEXTO_PLANO = [
    "", "Cap\u00edtulo 1: *El faro*", "**Pr\u00f3logo**", "***T***",
    "_a_ y __b__", "sin marcas", "\\*literal\\*", "a *b* c",
]

LIMPIAR_TITULO = [
    "", "Cap\u00edtulo 1", "# Cap\u00edtulo 1", "## Cap\u00edtulo 1",
    "**Cap\u00edtulo 1: Inicio**", "# **Cap\u00edtulo 1: Inicio**",
    "***T***", "*a* y *b*",  # BUG conocido: desenvuelve lo que no envuelve todo
    "_a_", "__a__", "#   espacios  ", "*a**b*",
]

SI = ["si", "s\u00ed", "SI", "s", "yes", "true", "1", "no", "", "0", "false", "nope"]

TITULOS = [
    "Cap\u00edtulo 3: El bosque", "Capitulo 3: El bosque", "Cap\u00edtulo 3. El bosque",
    "Cap\u00edtulo 3 - El bosque", "Cap\u00edtulo 3 \u2013 El bosque", "Cap\u00edtulo 3 \u2014 El bosque",
    "Cap. 3: El bosque",  # BUG conocido: produce el titulo "3: El bosque"
    "Cap\u00edtulo 3", "Pr\u00f3logo", "Prologo", "Ep\u00edlogo", "Interludio",
    "PR\u00d3LOGO: antes", "Cap\u00edtulo XIV: Nombres", "Cap\u00edtulo tres: Letras",
    "El faro", "Cap\u00edtulo: sin numero", "Interludio - uno",
]

ESCENAS = ["* * *", "***", "---", "___", "\u2042", "- - -", "*  *  *",
           "**", "--", "* * * *", "texto", "\u2042\u2042", "~", "\u25c6"]

ILUSTRACIONES = [
    "[ilustraci\u00f3n: cap03-01 | La protagonista frente a la caba\u00f1a]",
    "[ilustracion: cap03-01 | sin acento]",
    "[ilustraci\u00f3n: cap03-01]",
    "[ilustraci\u00f3n: cap03-01 |]",
    "[ ilustraci\u00f3n : cap03-01 | con espacios ]",
    "[ILUSTRACI\u00d3N: CAP03-01 | mayusculas]",
    "[ilustraci\u00f3n: cap03-01.png | con extension]",
    "[ilustraci\u00f3n: cap03-01 | con | barra]",
    "texto [ilustraci\u00f3n: x | y] en medio",
    "[ilustraci\u00f3n:]",
]

# Capitulos sinteticos completos: prueban parsear() + secuencia() juntos
CAPITULOS = {
    "basico": "Cap\u00edtulo 1: El faro\nPrimer parrafo.\nSegundo parrafo.\n",
    "con_escena": (
        "Cap\u00edtulo 2: Noche\nAntes del corte.\n* * *\nDespues del corte.\n"
        "Otro parrafo.\n"
    ),
    "con_ilustracion": (
        "Cap\u00edtulo 3: Bosque\nTexto antes.\n"
        "[ilustraci\u00f3n: cap03-01 | la caba\u00f1a]\nTexto despues.\n"
    ),
    "ilus_antes_del_titulo": (
        "[ilustraci\u00f3n: cap04-00 | lamina de apertura]\n"
        "Cap\u00edtulo 4: Apertura\nTexto.\n"
    ),
    "con_versos": (
        "Cap\u00edtulo 5: Canto\nHabla.\n> primer verso\n> segundo verso\n>\n"
        "> otra estrofa\nVuelve la prosa.\n"
    ),
    "con_subtitulo": "Cap\u00edtulo 6: Partes\n# Una parte\nTexto de la parte.\n",
    "mezcla": (
        "Cap\u00edtulo 7: Todo\nUno.\n* * *\nDos.\n"
        "[ilustraci\u00f3n: cap07-01 | algo]\nTres.\n# Sub\nCuatro.\n"
        "> verso\nCinco.\n[ilustraci\u00f3n: cap07-02 | otra]\nSeis.\n"
    ),
    "lineas_vacias": "Cap\u00edtulo 8: Huecos\n\n\nUno.\n\n\n\nDos.\n\n",
    "crlf_y_formfeed": "Cap\u00edtulo 9: Saltos\r\nUno.\r\n\x0cDos.\r\n",
    "ancho_cero": "Cap\u00edtulo 10: Invisible\nUno\u200bdos.\n",
    "espacios_markdown": "Cap\u00edtulo 11: Dos espacios\nUno.  \nDos.  \n",
    "solo_titulo": "Cap\u00edtulo 12: Vacio\n",
    "sin_titulo_reconocible": "El faro\nTexto.\n",
    "titulo_con_markdown": "**Cap\u00edtulo 13: *Negrita***\nTexto.\n",
    "escapes": (
        "Cap\u00edtulo 14: Escapes\nTexto con \\*asteriscos\\* y \\[corchetes\\].\n"
        "\\> no es verso.\n"
    ),
    "versos_pegados": "Cap\u00edtulo 15: Versos\n> a\n> b\n> c\n",
    # BUG: escapar un marcador de BLOQUE no lo desactiva. La deteccion se hace
    # sobre la linea desescapada, asi que el marcador se reconoce igual; y el
    # contenido se toma de la linea ORIGINAL, asi que ademas queda basura
    # visible (una barra invertida, una almohadilla).
    "escapar_verso": "T\n\\> cita\n",
    "escapar_ilus": "T\n\\[ilustraci\u00f3n: x | y\\]\n",
    "escapar_sub": "T\n\\# no subtitulo\n",
    "escapar_escena": "T\n\\* \\* \\*\n",
    "ilus_consecutivas": (
        "Cap\u00edtulo 16: Galeria\nTexto.\n[ilustraci\u00f3n: a | 1]\n"
        "[ilustraci\u00f3n: b | 2]\nFin.\n"
    ),
}

CONFIGS = {
    "completo": (
        "titulo: El faro\nsubtitulo: una novela\nautor: Ana Ruiz\n"
        "sello: Ediciones Prueba\nidioma: es\ndescripcion: Sinopsis.\n"
        "isbn: 978-84-00-00000-0\nfecha_publicacion: 2026-12-01\n"
        "derechos: \u00a9 {a\u00f1o} {autor}. Todos los derechos reservados.\n"
        "incluir_contraportada: si\nseparador_de_escena: * * *\nfuente: Baskerville\n"
    ),
    "minimo": "titulo: Solo titulo\n",
    "vacio": "",
    "con_comentarios": "# comentario\ntitulo: Con comentarios\n# otro\nautor: Nadie\n",
    "sin_dos_puntos": "titulo: Bien\nesta linea no tiene separador\nautor: Ana\n",
    "clave_con_acentos": "t\u00edtulo: Acentuado\nfecha publicacion: 2026\n",
    "valor_con_dos_puntos": "titulo: Dos: puntos\ndescripcion: a: b: c\n",
    "espacios": "  titulo  :   Espaciado   \n",
    "duplicada": "titulo: primero\ntitulo: segundo\n",
    "bom": "\ufefftitulo: Con BOM\n",
}


def exportar(mod):
    casos = {}

    import html as _html
    casos["esc"] = [[s, mod.esc(s)] for s in ESC]
    casos["esc_inline"] = [[s, _html.escape(s, quote=False)] for s in ESC]
    casos["sin_acentos"] = [[s, mod.sin_acentos(s)] for s in SIN_ACENTOS]
    casos["nombre_seguro"] = [[s, mod.nombre_seguro(s)] for s in NOMBRE_SEGURO]
    casos["desescapar"] = [[s, mod.desescapar(s)] for s in DESESCAPAR]
    casos["en_linea"] = [[s, mod.en_linea(s)] for s in EN_LINEA]
    casos["texto_plano"] = [[s, mod.texto_plano(s)] for s in TEXTO_PLANO]
    casos["limpiar_titulo"] = [[s, mod.limpiar_titulo(s)] for s in LIMPIAR_TITULO]
    casos["si"] = [[s, mod.si(s)] for s in SI]

    casos["orden_natural"] = [
        {"entrada": lista,
         "salida": [p.name for p in sorted((Path(n) for n in lista), key=mod.orden_natural)],
         "claves": [[str(x) for x in mod.orden_natural(Path(n))] for n in lista]}
        for lista in ORDENES
    ]

    casos["RE_TITULO"] = []
    for t in TITULOS:
        m = mod.RE_TITULO.match(mod.texto_plano(t))
        entrada = {"entrada": t, "casa": bool(m)}
        if m:
            entrada["grupo1"] = m.group(1)
            entrada["grupo2"] = m.group(2)
            # Lo que capitulos() hace DESPUES del match (incluido su bug)
            if m.group(2):
                crudo = __import__("re").split(r"\s*[:.\-\u2013\u2014]\s*", t, maxsplit=1)
                entrada["num_final"] = m.group(1)
                entrada["titulo_final"] = crudo[1] if len(crudo) == 2 else m.group(2).strip()
        casos["RE_TITULO"].append(entrada)

    casos["RE_ESCENA"] = [[s, bool(mod.RE_ESCENA.match(mod.desescapar(s)))] for s in ESCENAS]

    casos["RE_ILUS"] = []
    for s in ILUSTRACIONES:
        m = mod.RE_ILUS.match(mod.desescapar(s))
        casos["RE_ILUS"].append({
            "entrada": s, "casa": bool(m),
            "nombre": m.group(1) if m else None,
            "alt": (m.group(2) or "").strip() if m else None,
        })

    # parsear() + secuencia() sobre capitulos completos
    casos["capitulos"] = []
    with tempfile.TemporaryDirectory() as tmp:
        for nombre, texto in CAPITULOS.items():
            f = Path(tmp) / f"{nombre}.md"
            f.write_text(texto, encoding="utf-8")
            titulo, antes, bloques = mod.parsear(f)
            tramos = mod.secuencia(bloques, "* * *")
            casos["capitulos"].append({
                "nombre": nombre,
                "entrada": texto,
                "lineas_de": mod.lineas_de(f),
                "titulo": titulo,
                "antes": [list(a) for a in antes],
                "bloques": [list(b) for b in bloques],
                "tramos": [["texto", t[1]] if t[0] == "texto" else list(t) for t in tramos],
            })
        # leer_config() necesita el archivo llamado libro.txt
        casos["configs"] = []
        for nombre, texto in CONFIGS.items():
            d = Path(tmp) / nombre
            d.mkdir()
            (d / "libro.txt").write_text(texto, encoding="utf-8")
            del mod.AVISOS[:]
            salida = mod.leer_config(d)
            casos["configs"].append({
                "nombre": nombre, "entrada": texto, "salida": salida,
                "avisos": list(mod.AVISOS),
            })
            del mod.AVISOS[:]
        # libro.txt ausente: tambien avisa
        vacio = Path(tmp) / "_sin_libro_txt"
        vacio.mkdir()
        del mod.AVISOS[:]
        salida = mod.leer_config(vacio)
        casos["configs"].append({
            "nombre": "sin_archivo", "entrada": None, "salida": salida,
            "avisos": list(mod.AVISOS),
        })
        del mod.AVISOS[:]

    # uuid5: si cambia, el libro cambia de identidad para las tiendas
    semillas = [("El faro", "Ana Ruiz"), ("", ""), ("Mi libro", ""),
                ("\u00d1and\u00fa", "Jos\u00e9 P\u00e9rez"), ("A|B", "C|D")]
    casos["uuid5"] = [
        {"titulo": t, "autor": a,
         "nombre": f"generador-epub:{t}|{a}",
         "uuid": str(uuid.uuid5(uuid.NAMESPACE_URL, f"generador-epub:{t}|{a}")),
         "urn": "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, f"generador-epub:{t}|{a}"))}
        for t, a in semillas
    ]

    # --- plantillas XHTML ---
    casos["xhtml"] = []
    for titulo, cuerpo, idioma, clase in [
        ("Cap\u00edtulo 1", "<p>uno</p>", "es", ""),
        ("Portada", '<div class="portada"><img src="../x.png" alt="y"/></div>', "es", "pagina-imagen"),
        ("T\u00edtulo & <raro>", "<p>a</p>", "es", ""),
        ("Con \"comillas\" y 'apostrofe'", "<p>a</p>", "en", ""),
        ("", "", "es", ""),
        ("Multi", "<p>a</p>\n<p>b</p>", "es", "una dos"),
        # DISCRIMINANTE: el Python NO escapa el idioma en xhtml() aunque si lo
        # escape en el OPF y el NCX. Sin un idioma que necesite escaparse, esa
        # asimetria no queda protegida por ningun test.
        ("T", "<p>a</p>", 'es"&<x', ""),
    ]:
        casos["xhtml"].append({
            "titulo": titulo, "cuerpo": cuerpo, "idioma": idioma, "clase_body": clase,
            "salida": mod.xhtml(titulo, cuerpo, idioma, clase),
        })

    casos["pagina_imagen"] = []
    for href, alt, clase in [
        ("imagenes/cap01-01.png", "La caba\u00f1a de noche", "ilustracion"),
        ("imagenes/portada.jpg", "Portada de El faro", "portada"),
        ("imagenes/x.png", 'alt con "comillas" & <raro>', "ilustracion"),
        ("imagenes/x.png", "", "ilustracion"),
    ]:
        casos["pagina_imagen"].append({
            "href": href, "alt": alt, "clase": clase,
            "salida": mod.pagina_imagen({"href": href}, alt, clase),
        })

    # --- fuentes: buscar_fuentes() sobre nombres sinteticos ---
    casos["fuentes"] = []
    with tempfile.TemporaryDirectory() as tf:
        pruebas = {
            "libre_baskerville": ["LibreBaskerville-Regular.ttf", "LibreBaskerville-Italic.ttf",
                                  "LibreBaskerville-Bold.ttf", "OFL.txt"],
            "las_cuatro": ["Fam-Regular.ttf", "Fam-Italic.ttf", "Fam-Bold.ttf", "Fam-BoldItalic.otf"],
            "nombre_mal": ["SinEstilo.ttf", "Fam-Negrita.ttf", "Fam-Regular.ttf"],
            "camel_y_guiones": ["MiFuenteBonita-Regular.ttf", "Dos-Palabras-Bold.ttf"],
            "subrayado": ["Fam-bold_italic.ttf", "Fam-BOLD.ttf"],
            "vacia": [],
            "acentos": ["Fuente\u00d1-Regular.ttf"],
        }
        for nombre, archivos in pruebas.items():
            d = Path(tf) / nombre
            (d / "fuentes").mkdir(parents=True)
            for a in archivos:
                (d / "fuentes" / a).write_bytes(b"\0\1\0\0")
            del mod.AVISOS[:]
            fuentes = mod.buscar_fuentes(d)
            casos["fuentes"].append({
                "nombre": nombre, "archivos": archivos,
                "salida": [{k: v for k, v in f.items() if k != "origen"} for f in fuentes],
                "avisos": list(mod.AVISOS),
            })
            del mod.AVISOS[:]

        # --- css_libro() con distintas configuraciones de fuente ---
        casos["css_libro"] = []
        d = Path(tf) / "las_cuatro"
        cuatro = mod.buscar_fuentes(d)
        for nombre, fuentes, preferida in [
            ("sin_fuentes_sin_preferida", [], ""),
            ("solo_preferida", [], "Baskerville"),
            ("solo_incluidas", cuatro, ""),
            ("preferida_e_incluidas", cuatro, "Baskerville"),
            ("una_sola", cuatro[:1], "Baskerville"),
        ]:
            casos["css_libro"].append({
                "nombre": nombre,
                "familias": [f["familia"] for f in fuentes],
                "preferida": preferida,
                "salida": mod.css_libro(fuentes, preferida),
            })

    # --- imagenes: inspeccion de bytes y validacion, por cada rol ---
    carpeta_img = AQUI.parent / "tests" / "fixtures" / "imagenes"
    # truncado.png cuelga al Python (struct.error sin capturar): se salta aqui
    # a proposito y se prueba solo en TypeScript.
    FRAGILES = {"truncado.png"}
    casos["imagenes"] = []
    if carpeta_img.is_dir():
        for f in sorted(carpeta_img.iterdir()):
            if not f.is_file() or f.name.startswith(".") or f.name in FRAGILES:
                continue
            info = mod.inspeccionar_imagen(f)
            entrada = {
                "archivo": f.name,
                "bytes": info["bytes"],
                "tipo": info["tipo"],
                "ancho": info["ancho"],
                "alto": info["alto"],
                "alfa": info["alfa"],
                "cmyk": info["cmyk"],
                "p3": info["p3"],
                "media_type": mod.media_type(info["tipo"]) if info["tipo"] else None,
                "revisiones": {},
            }
            for rol, kwargs in [
                ("ilustracion", {}),
                ("portada", {"es_portada": True}),
                ("logo", {"es_logo": True}),
            ]:
                del mod.AVISOS[:]
                del mod.NOTAS[:]
                del mod.ERRORES[:]
                if info["tipo"] is not None:
                    mod.revisar_imagen(f"ilustraciones/{f.name}", info, **kwargs)
                entrada["revisiones"][rol] = {
                    "avisos": list(mod.AVISOS),
                    "notas": list(mod.NOTAS),
                    "errores": list(mod.ERRORES),
                }
                del mod.AVISOS[:]
                del mod.NOTAS[:]
                del mod.ERRORES[:]
            casos["imagenes"].append(entrada)

    # --- formato numerico: Python redondea AL PAR, toFixed hacia arriba ---
    valores = []
    # empates exactos: los dyadicos que acaban en .25 y .75 son los unicos
    # valores donde el redondeo al par se nota a una o dos decimales
    for k in range(1, 161):
        valores += [k / 4, k / 8, k / 16]
    # proporciones alto/ancho plausibles de una ilustracion
    for w in range(800, 2601, 97):
        for h in range(800, 2601, 311):
            valores.append(h / w)
    # megabytes y megapixeles plausibles
    for n in range(0, 15_000_001, 311_111):
        valores.append(n / 1e6)
    valores += [0.0, 1.0, 1e-9, 123456.789, 0.05, 2.675, 1.005]
    vistos = set()
    casos["formato"] = []
    for v in valores:
        if v in vistos:
            continue
        vistos.add(v)
        casos["formato"].append({
            "valor": v,
            "f0": f"{v:.0f}", "f1": f"{v:.1f}", "f2": f"{v:.2f}", "f3": f"{v:.3f}",
        })

    casos["CSS"] = mod.CSS
    casos["CONFIG_DEFAULT"] = mod.CONFIG_DEFAULT
    casos["VERSION"] = mod.VERSION
    return casos


def main():
    ruta = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else POR_DEFECTO
    if not ruta.exists():
        print(f"No encontre {ruta}", file=sys.stderr)
        return 1
    mod = cargar(ruta)
    casos = exportar(mod)
    digest = hashlib.sha256(ruta.read_bytes()).hexdigest()[:16]
    doc = {
        "_aviso": "Generado por scripts/exportar-casos-texto.py. No editar a mano.",
        "_fuente": ruta.name,
        "_sha256_fuente": digest,
        "_version_generador": casos.pop("VERSION"),
        **casos,
    }
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    total = sum(len(v) for v in doc.values() if isinstance(v, list))
    print(f"{SALIDA.relative_to(SALIDA.parent.parent)}: {total} casos desde {ruta.name} ({digest})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
