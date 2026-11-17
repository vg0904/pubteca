/**
 * Plantillas XHTML. Port de generar_epub.py 448-468.
 *
 * Tiene que producir el string BYTE A BYTE, saltos de linea y newline final
 * incluidos: los golden tests comparan los archivos completos.
 */
import { esc } from './texto'

/**
 * La pagina XHTML completa.
 *
 * Nota: el `idioma` se interpola SIN esc(), igual que en el Python. En el OPF y
 * en el NCX si va escapado. Se conserva la asimetria; si algun dia se corrige,
 * hay que hacerlo en los dos sitios a la vez y regenerar los golden.
 */
export function xhtml(titulo: string, cuerpo: string, idioma: string, claseBody = ''): string {
  const clase = claseBody ? ` class="${claseBody}"` : ''
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${idioma}" xml:lang="${idioma}">
<head>
<meta charset="utf-8"/>
<title>${esc(titulo)}</title>
<link rel="stylesheet" type="text/css" href="../estilos/estilo.css"/>
</head>
<body${clase}>
${cuerpo}
</body>
</html>
`
}

/**
 * Lo contrario de `xhtml`: el cuerpo de una pagina que salio de ahi.
 *
 * El libro web lo usa para volver a juntar las paginas de un capitulo. Vive al
 * lado de la plantilla para que cambien juntas; un test comprueba la ida y la
 * vuelta.
 */
export function cuerpoDe(pagina: string): string {
  const abre = pagina.indexOf('<body')
  const desde = pagina.indexOf('>\n', abre)
  const hasta = pagina.lastIndexOf('\n</body>')
  return abre < 0 || desde < 0 || hasta < desde ? '' : pagina.slice(desde + 2, hasta)
}

/** El div de una imagen a pagina completa, en UNA sola linea. */
export function paginaImagen(href: string, alt: string, clase = 'ilustracion'): string {
  return `<div class="${clase}"><img src="../${href}" alt="${esc(alt)}"/></div>`
}
