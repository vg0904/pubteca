/**
 * XHTML en linea -> tramos del modelo. Es el inverso exacto de
 * `htmlDeTramos` (app/html.ts) y de `enLinea` (core/texto.ts).
 *
 * El subconjunto es diminuto y conocido, porque lo genera el propio motor:
 * texto con las entidades `&amp;`, `&lt;` y `&gt;`, y las etiquetas `<em>`,
 * `<strong>` y `<strong><em>`. Nada de DOM: esto corre igual en Node y en el
 * navegador, y nunca se construye HTML a partir de la entrada.
 */
import { normalizarLinea, type Marca, type Tramo } from '../modelo'

/** Deshace el escapado de `escInline`. El `&amp;` va el ULTIMO. */
function desescaparHtml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

const ETIQUETAS: Record<string, Marca> = { em: 'cursiva', strong: 'negrita' }

export function tramosDeHtml(html: string): Tramo[] {
  const salida: Tramo[] = []
  const pila: Marca[] = []
  let i = 0
  let texto = ''

  const volcar = (): void => {
    if (texto !== '') {
      salida.push({ texto: desescaparHtml(texto), marcas: [...pila] })
      texto = ''
    }
  }

  while (i < html.length) {
    if (html[i] === '<') {
      const cierre = html.indexOf('>', i)
      if (cierre === -1) {
        // Un «<» suelto no puede venir del motor (lo escaparia), pero si llega
        // se trata como texto en vez de perderlo.
        texto += html.slice(i)
        break
      }
      const etiqueta = html.slice(i + 1, cierre)
      const esCierre = etiqueta.startsWith('/')
      const nombre = (esCierre ? etiqueta.slice(1) : etiqueta).toLowerCase()
      const marca = ETIQUETAS[nombre]
      if (marca) {
        volcar()
        if (esCierre) {
          const pos = pila.lastIndexOf(marca)
          if (pos !== -1) pila.splice(pos, 1)
        } else {
          pila.push(marca)
        }
      } else {
        texto += html.slice(i, cierre + 1)
      }
      i = cierre + 1
      continue
    }
    texto += html[i]
    i += 1
  }
  volcar()
  // normalizarLinea canoniza el orden de las marcas y une los tramos
  // adyacentes equivalentes, para que el resultado se compare igual que
  // cualquier otro tramo del modelo.
  return normalizarLinea(salida)
}
