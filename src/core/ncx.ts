/**
 * toc.ncx, el indice del EPUB 2. Port de generar_epub.py 936-954.
 *
 * Se genera a proposito, aunque EPUB 3 no lo necesite, por compatibilidad con
 * lectores viejos. EPUBCheck 5.4 lo senala con OBS_001 («OPF 2 NCX navigation
 * is outdated»), pero ese mensaje es de severidad USAGE: solo sale con el flag
 * -u, que por eso NO se pasa en CI.
 */
import { esc } from './texto'
import type { EntradaIndice } from './nav'

export function ncx(
  indice: readonly EntradaIndice[],
  titulo: string,
  idioma: string,
  uid: string,
): string {
  const puntos = indice.map(
    (e, i) =>
      `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(e.texto)}</text></navLabel>` +
      `<content src="${e.href}"/></navPoint>`,
  )

  // El Python une los puntos con \n prefijando CUATRO espacios a cada uno y
  // luego aplica trim al conjunto, asi que el primero se queda sin sus cuatro
  // espacios (los aporta la plantilla) y el resto si los lleva.
  const cuerpo = puntos.map((p) => `    ${p}`).join('\n').trim()

  return `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${esc(idioma)}">
  <head>
    <meta name="dtb:uid" content="${esc(uid)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${esc(titulo)}</text></docTitle>
  <navMap>
    ${cuerpo}
  </navMap>
</ncx>
`
}
