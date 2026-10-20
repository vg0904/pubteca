/**
 * La hoja de estilo del libro. Port de generar_epub.py 471-593.
 *
 * REGLAS APRENDIDAS QUE NO SE PUEDEN ROMPER (brief, seccion 4):
 *
 * - La fuente se define SOLO en `body`. No se fija font-size, line-height ni
 *   color, para que el lector pueda cambiar el tamano de letra y el modo
 *   oscuro funcione. KDP advierte que forzar fuentes puede impedir que el
 *   lector las cambie.
 * - `text-align` explicito en CADA elemento centrado, y `text-indent: 0` igual.
 *   Apple Books NO heredo el centrado del div al h1 y la portadilla salio
 *   descentrada. Un refactor "limpio" que quite la redundancia reintroduce el
 *   bug, y Chrome NO lo muestra porque Chrome si hereda. Hay un test.
 * - Ningun color ni fondo. KDP advierte que un fondo forzado vuelve el texto
 *   invisible al invertir colores. Los temas claro/sepia/oscuro de la vista
 *   previa viven en otra hoja, que nunca entra al EPUB.
 *
 * La constante va TAL CUAL. No reformatear: los golden tests comparan el
 * archivo completo, y hay un test que la compara con la salida del Python.
 */

/** Marcador que se sustituye por las caras @font-face. */
const MARCA_FUENTES = '/*FUENTES*/'

/** Marcador de la declaracion font-family. Lleva el espacio inicial a proposito. */
const MARCA_FAMILIA = ' font-family: __FAMILIA__;'

export const CSS = `@charset "utf-8";
/* Estilo del libro.
   La fuente se define solo en body, así el lector puede cambiarla si quiere.
   No fija tamaño, interlineado ni colores, para respetar los ajustes
   de cada lector (tamaño de letra, modo oscuro). */

/*FUENTES*/

body { margin: 0; padding: 0; widows: 2; orphans: 2; font-family: __FAMILIA__; }

p {
  margin: 0;
  text-indent: 1.4em;
  -webkit-hyphens: auto;
  hyphens: auto;
  adobe-hyphenate: auto;
}
p.primero { text-indent: 0; }

/* Cabecera de capítulo */
div.cabecera { margin: 2.5em 0 2.2em 0; text-align: center; page-break-after: avoid; break-after: avoid; }
p.num-capitulo {
  text-indent: 0; text-align: center;
  font-size: 0.8em; letter-spacing: 0.25em; text-transform: uppercase;
  margin: 0 0 0.9em 0;
  -webkit-hyphens: none; hyphens: none;
}
h1.titulo-capitulo {
  font-size: 1.6em; font-weight: normal; line-height: 1.25;
  text-align: center; margin: 0;
  -webkit-hyphens: none; hyphens: none;
  page-break-after: avoid; break-after: avoid;
}
h2.subtitulo {
  font-size: 1.1em; font-weight: bold; text-align: center;
  margin: 1.6em 0 1em 0;
  page-break-after: avoid; break-after: avoid;
}

/* Cambio de escena */
p.escena { text-indent: 0; text-align: center; margin: 1.1em 0; }

/* Canciones, poemas, cartas (líneas que empiezan con > ) */
div.versos { margin: 1em 0 1em 1.6em; }
div.versos p { text-indent: 0; font-style: italic; -webkit-hyphens: none; hyphens: none; }
div.versos p.estrofa { margin-top: 0.9em; }

/* Páginas de ilustración y portada */
body.pagina-imagen { margin: 0; padding: 0; text-align: center; }
div.ilustracion, div.portada {
  margin: 0; padding: 0; text-align: center; text-indent: 0;
  page-break-inside: avoid; break-inside: avoid;
}
div.ilustracion img, div.portada img {
  display: block; margin: 0 auto;
  width: auto; height: auto;
  max-width: 100%;
  max-height: 100%;
  max-height: 95vh;
}

/* Portadilla (todo con alineación explícita: Apple Books no siempre la hereda) */
div.portadilla { text-align: center; text-indent: 0; margin: 4em 0 0 0; margin-top: 14vh; padding: 0; }
h1.titulo-libro {
  text-align: center; text-indent: 0;
  font-size: 2em; font-weight: normal; line-height: 1.2;
  margin: 0 0 0.5em 0; padding: 0;
  -webkit-hyphens: none; hyphens: none;
}
h1.con-logo { font-size: 1em; line-height: 1; margin: 0; }
img.logo {
  display: block; margin: 0 auto; padding: 0;
  width: 88%; max-width: 88%; height: auto;
}
img.logo-oscuro { display: none; }
@media (prefers-color-scheme: dark) {
  img.logo-claro { display: none; }
  img.logo-oscuro { display: block; }
}
:root[__ibooks_internal_theme*="Night"] img.logo-claro,
:root[__ibooks_internal_theme*="Gray"] img.logo-claro { display: none; }
:root[__ibooks_internal_theme*="Night"] img.logo-oscuro,
:root[__ibooks_internal_theme*="Gray"] img.logo-oscuro { display: block; }
div.portadilla p { text-indent: 0; text-align: center; -webkit-hyphens: none; hyphens: none; }
p.subtitulo-libro { font-size: 1.15em; font-style: italic; margin: 0; }
p.autor-libro { font-size: 1.15em; letter-spacing: 0.12em; margin: 3em 0 0 0; }
p.sello { font-size: 0.8em; letter-spacing: 0.25em; margin: 5em 0 0 0; }

/* Página de derechos */
div.derechos { margin-top: 4em; }
div.derechos p { text-indent: 0; font-size: 0.85em; margin: 0 0 0.7em 0; -webkit-hyphens: none; hyphens: none; }

/* Dedicatoria */
div.dedicatoria { margin-top: 5em; text-align: center; }
div.dedicatoria p { text-indent: 0; text-align: center; font-style: italic; margin: 0 0 0.6em 0; }

/* Índice */
nav#toc h1 {
  font-size: 1.6em; font-weight: normal; text-align: center; text-indent: 0;
  margin: 2.5em 0 1.6em 0;
}
ol.indice { list-style-type: none; margin: 0; padding: 0; }
ol.indice li { margin: 0 0 0.8em 0; text-align: left; text-indent: 0; }
ol.indice a { text-decoration: none; }
`

/** Una cara de fuente para el @font-face y para el manifiesto. */
export interface CaraFuente {
  readonly familia: string
  readonly style: string
  readonly weight: string
  readonly href: string
}

/**
 * `css_libro()`: mete las caras @font-face y la declaracion font-family.
 *
 * `preferida` es la fuente del sistema que se pide primero (Baskerville ya
 * viene en iPhone, iPad y Mac). Las familias incluidas se deduplican
 * CONSERVANDO EL ORDEN, como hace `dict.fromkeys` en el Python.
 *
 * Sin ninguna familia, la declaracion desaparece entera y el lector usa la
 * fuente que tenga elegida: asi va la version de Kindle, que ademas pesa menos
 * y baja la tarifa de entrega.
 */
export function cssLibro(fuentes: readonly CaraFuente[], preferida: string): string {
  const caras = fuentes.map(
    (f) =>
      `@font-face {\n  font-family: "${f.familia}";\n  font-style: ${f.style};\n` +
      `  font-weight: ${f.weight};\n  src: url("../${f.href}");\n}`,
  )

  const familias: string[] = []
  if (preferida) familias.push(`"${preferida}"`)
  for (const fam of new Set(fuentes.map((f) => f.familia))) familias.push(`"${fam}"`)

  const declaracion = familias.length > 0 ? ` font-family: ${[...familias, 'serif'].join(', ')};` : ''

  return CSS.replace(MARCA_FUENTES, caras.join('\n\n')).replace(MARCA_FAMILIA, declaracion)
}
