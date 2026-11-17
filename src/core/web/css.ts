/**
 * La hoja de estilo del libro web: `libro/libro.css`.
 *
 * Es la del EPUB de Kindle (sin letra propia, sin colores: ver `css.ts`) mas lo
 * que cambia cuando el libro se lee de corrido en una pagina web. La usan los
 * dos caminos de lectura: el lector la carga dentro de su sombra, y cada parte
 * suelta (`cap01.html`) la enlaza como una pagina corriente.
 *
 * Sigue sin fijar ni color ni fondo, por lo mismo que en el EPUB: los temas
 * los pone el lector, y una pagina suelta sigue el modo claro u oscuro del
 * sistema con su `<meta name="color-scheme">` (en el <body> no basta: los
 * colores de la pagina los decide la raiz).
 */
import { cssLibro } from '../css'
import { pilaDe, type LetraWeb } from './letras'

export const CSS_WEB = `
/* ---- Libro web ---------------------------------------------------------
   Lo que cambia al leer el libro de corrido en una página web. */

/* Las ilustraciones van dentro del texto, no en una página propia.
   A lo ancho de la columna y con la altura que dicen sus atributos width y
   height: así su sitio está reservado antes de que lleguen, y nada salta (ni
   el texto al desplazar, ni la cuenta de páginas al pasarlas). object-fit
   evita que se deformen cuando las frena el alto máximo. */
div.ilustracion, div.portada { height: auto; margin: 2.2em 0; }
div.ilustracion img, div.portada img { width: 100%; height: auto; max-height: 92vh; object-fit: contain; }

/* En el EPUB el título baja para abrir página; aquí la página no se corta. */
div.cabecera { margin-top: 1.2em; }
div.derechos, div.dedicatoria { margin-top: 2em; }

/* Dónde se consigue el libro: la última parte. */
div.enlaces { text-align: center; margin: 2em 0 3em 0; }
div.enlaces p { text-indent: 0; text-align: center; margin: 0 0 1.4em 0; -webkit-hyphens: none; hyphens: none; }
div.enlaces a.enlace-libro {
  display: inline-block; margin: 0.35em; padding: 0.7em 1.5em;
  border: 1px solid currentColor; border-radius: 2em;
  color: inherit; text-decoration: none;
}

/* Una parte abierta suelta (cap01.html), sin el lector. */
body.pubteca-pagina {
  max-width: 34em; margin: 0 auto; padding: 1.5em 1.25em 4em 1.25em;
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  font-size: 1.125rem; line-height: 1.65;
}
nav.pubteca-pie {
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.8em 1.5em;
  margin: 3.5em 0 0 0; padding: 1.2em 0 0 0; border-top: 1px solid;
  font-size: 0.85em;
}
nav.pubteca-pie a { color: inherit; }
`

/**
 * La hoja completa. En el lector, la letra la pone el lector (y la elige quien
 * lee). Aqui solo va la del libro por defecto, para las partes abiertas
 * sueltas: sus caras y su `font-family`.
 *
 * Dentro del lector estas `@font-face` no sirven (Chrome no las lee dentro de
 * una sombra): el lector registra las caras en el documento con `FontFace`.
 */
export function cssWeb(letra?: LetraWeb): string {
  const hoja = cssLibro([], '') + CSS_WEB
  if (!letra) return hoja
  const caras = letra.familia
    ? letra.caras.map(
        (c) =>
          `@font-face {\n  font-family: "${letra.familia}";\n  font-style: ${c.estilo};\n  font-weight: ${c.peso};\n` +
          `  font-display: swap;\n  src: url("${c.src}") format("woff");\n}`,
      )
    : []
  return `${hoja}\n/* La letra del libro: ${letra.nombre}. */\n${caras.join('\n')}${caras.length > 0 ? '\n' : ''}body.pubteca-pagina { font-family: ${pilaDe(letra)}; }\n`
}
