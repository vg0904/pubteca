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

/** El div de una imagen a pagina completa, en UNA sola linea. */
export function paginaImagen(href: string, alt: string, clase = 'ilustracion'): string {
  return `<div class="${clase}"><img src="../${href}" alt="${esc(alt)}"/></div>`
}
