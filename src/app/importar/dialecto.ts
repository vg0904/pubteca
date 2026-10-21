/**
 * Dialecto de Markdown -> modelo de la app.
 *
 * Es la via de entrada para los `.md`, los `.txt` y el texto pegado, y tambien
 * la de vuelta al importar un `.zip` de proyecto o una carpeta del
 * generar_epub.py de referencia.
 *
 * Reutiliza el parser DEL MOTOR en vez de duplicar la clasificacion de
 * bloques: asi es imposible que la app entienda el dialecto de una forma y el
 * EPUB de otra.
 */
import { parsear, RE_TITULO } from '../../core/parser'
import { enLinea, textoPlano } from '../../core/texto'
import type { Bloque, Capitulo, Tramo } from '../modelo'
import { limpiarTexto } from '../tramos'
import { tramosDeHtml } from './html-en-linea'

export interface ResumenImportacion {
  readonly capitulos: number
  readonly parrafos: number
  readonly enfasis: number
  readonly versos: number
  readonly subtitulos: number
  readonly escenas: number
  readonly ilustraciones: number
}

let contador = 0
const nuevoId = (prefijo: string): string => `${prefijo}-${++contador}`

/** Reinicia el contador de ids. Solo para los tests. */
export function reiniciarIds(): void {
  contador = 0
}

/**
 * Agrupa los bloques del motor en los del modelo.
 *
 * La diferencia esta en los versos: el motor los emite sueltos, uno por linea,
 * con un `estrofa` entre medias; el modelo los junta en un solo bloque con sus
 * estrofas, que es como el escritor los ve y los edita.
 */
function bloquesDelMotor(bloques: ReturnType<typeof parsear>['bloques']): Bloque[] {
  const salida: Bloque[] = []
  let estrofas: Tramo[][] | null = null

  const cerrarVersos = (): void => {
    if (estrofas) {
      const limpias = estrofas.filter((e) => e.length > 0)
      if (limpias.length > 0) {
        salida.push({ id: nuevoId('b'), tipo: 'versos', estrofas: limpias })
      }
      estrofas = null
    }
  }

  for (const b of bloques) {
    if (b.tipo !== 'verso' && b.tipo !== 'estrofa') cerrarVersos()
    switch (b.tipo) {
      case 'verso': {
        if (!estrofas) estrofas = [[]]
        // Un verso es una linea entera, asi que sus tramos se unen en uno.
        ;(estrofas[estrofas.length - 1] as Tramo[]).push(unirTramos(tramosDeHtml(b.html)))
        break
      }
      case 'estrofa':
        if (!estrofas) estrofas = [[]]
        estrofas.push([])
        break
      case 'escena':
        salida.push({ id: nuevoId('b'), tipo: 'escena' })
        break
      case 'sub':
        salida.push({ id: nuevoId('b'), tipo: 'subtitulo', tramos: tramosDeHtml(b.html) })
        break
      case 'ilus':
        salida.push({
          id: nuevoId('b'),
          tipo: 'ilustracion',
          imagenId: b.nombre,
          alt: limpiarTexto(b.alt),
          decorativa: false,
        })
        break
      case 'p':
        salida.push({ id: nuevoId('b'), tipo: 'parrafo', tramos: tramosDeHtml(b.html) })
        break
    }
  }
  cerrarVersos()
  return salida
}

/**
 * Un verso del modelo es UN tramo (una linea), asi que si el verso lleva
 * enfasis parcial hay que quedarse con la version mas fiel posible: se conserva
 * el enfasis cuando es uniforme, y si no se deja el texto llano.
 *
 * Es la unica simplificacion del modelo frente al motor, y es deliberada: en la
 * interfaz un verso es una linea con su formato, no una secuencia de tramos.
 */
function unirTramos(tramos: readonly Tramo[]): Tramo {
  if (tramos.length === 1) return tramos[0] as Tramo
  const texto = tramos.map((t) => t.texto).join('')
  const primeras = tramos[0]?.marcas ?? []
  const uniforme =
    tramos.length > 0 &&
    tramos.every(
      (t) => t.marcas.length === primeras.length && t.marcas.every((m) => primeras.includes(m)),
    )
  return { texto, marcas: uniforme ? [...primeras] : [] }
}

/** Separa la etiqueta del titulo, igual que hace el motor al construir. */
export function partirCabecera(titulo: string): { etiqueta: string; titulo: string } {
  const mPlano = RE_TITULO.exec(textoPlano(titulo))
  if (mPlano && mPlano[2]) {
    const mCrudo = RE_TITULO.exec(titulo)
    return { etiqueta: mPlano[1] as string, titulo: (mCrudo?.[2] ?? mPlano[2]).trim() }
  }
  return { etiqueta: '', titulo }
}

/** Un archivo del dialecto -> un capitulo del modelo. */
export function capituloDesdeDialecto(texto: string): Capitulo | null {
  const r = parsear(texto)
  if (r.titulo === null) return null
  const cabecera = partirCabecera(r.titulo)
  return {
    id: nuevoId('cap'),
    etiqueta: cabecera.etiqueta,
    // `parsear` devuelve el titulo en markdown CRUDO (el motor le aplica
    // enLinea despues, al construir la cabecera), asi que para invertirlo hay
    // que pasarlo primero por enLinea.
    titulo: tramosDeHtml(enLinea(cabecera.titulo)),
    // Los tramos ya llegan limpios (enLinea quita lo que XML no admite); las
    // descripciones no pasan por ahi.
    aperturas: r.antes.map((a) => ({ imagenId: a.nombre, alt: limpiarTexto(a.alt) })),
    bloques: bloquesDelMotor(r.bloques),
  }
}

/** Cuenta lo que entro, para la pantalla de confirmacion de la importacion. */
export function resumir(capitulos: readonly Capitulo[]): ResumenImportacion {
  let parrafos = 0
  let enfasis = 0
  let versos = 0
  let subtitulos = 0
  let escenas = 0
  let ilustraciones = capitulos.reduce((n, c) => n + c.aperturas.length, 0)

  const contarEnfasis = (tramos: readonly Tramo[]): number =>
    tramos.filter((t) => t.marcas.length > 0).length

  for (const c of capitulos) {
    enfasis += contarEnfasis(c.titulo)
    for (const b of c.bloques) {
      switch (b.tipo) {
        case 'parrafo':
          parrafos += 1
          enfasis += contarEnfasis(b.tramos)
          break
        case 'subtitulo':
          subtitulos += 1
          enfasis += contarEnfasis(b.tramos)
          break
        case 'escena':
          escenas += 1
          break
        case 'versos':
          for (const e of b.estrofas) {
            versos += e.length
            enfasis += contarEnfasis(e)
          }
          break
        case 'ilustracion':
          ilustraciones += 1
          break
      }
    }
  }
  return { capitulos: capitulos.length, parrafos, enfasis, versos, subtitulos, escenas, ilustraciones }
}
