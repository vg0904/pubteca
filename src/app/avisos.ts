/**
 * Los diagnosticos del motor, AGRUPADOS por tipo.
 *
 * El motor dice cada problema imagen por imagen, que es lo correcto para el
 * reporte.txt y para los golden tests. Pero treinta ilustraciones exportadas de
 * Procreate dan unas cuarenta lineas (transparencia, P3 y peso de cada una), y
 * esa pared es la principal causa de abandono: el autor no sabe por donde
 * empezar y cierra. Agrupadas son tres renglones, cada uno con la consecuencia
 * para el lector y la lista de las afectadas.
 *
 * El texto del motor no se toca: se reconoce por patron y se conserva entero
 * en `mensajes`, para quien quiera el detalle. Un mensaje que no se reconoce
 * no se pierde: forma su propio grupo.
 */

export type Nivel = 'error' | 'aviso' | 'nota'

export type ClaveGrupo =
  | 'noEsImagen'
  | 'faltaImagen'
  | 'recursoAusente'
  | 'transparencia'
  | 'cmyk'
  | 'p3'
  | 'pixeles'
  | 'portadaLadoCorto'
  | 'portadaBaja'
  | 'resolucion'
  | 'horizontal'
  | 'proporcion'
  | 'peso'
  | 'logoOpaco'
  | 'sinLogoBlanco'
  | 'sinPortada'
  | 'capituloVacio'
  | 'sinDescripcion'
  | 'otro'

export interface Grupo {
  readonly clave: ClaveGrupo
  readonly nivel: Nivel
  /** Lo afectado, sin repetir y en el orden en que aparecio. */
  readonly elementos: readonly string[]
  /** Los mensajes originales del motor, enteros. */
  readonly mensajes: readonly string[]
}

/**
 * Patrones sobre el texto del motor. El orden importa: el primero que encaja
 * gana, y «pixeles» tiene que ir antes que «resolucion» porque los dos hablan
 * de medidas.
 */
const PATRONES: readonly { readonly clave: ClaveGrupo; readonly re: RegExp }[] = [
  { clave: 'noEsImagen', re: /: no es un PNG ni un JPG de verdad/u },
  { clave: 'faltaImagen', re: /: la marca pide «/u },
  { clave: 'recursoAusente', re: /: una página del EPUB de .+ la muestra, pero el archivo no entró/u },
  { clave: 'transparencia', re: /: tiene transparencia\./u },
  { clave: 'cmyk', re: /: está en CMYK/u },
  { clave: 'p3', re: /: usa el perfil Display P3/u },
  { clave: 'pixeles', re: /millones de píxeles/u },
  { clave: 'portadaLadoCorto', re: /: el lado corto mide \d+ px/u },
  { clave: 'portadaBaja', re: /px de alto; KDP recomienda/u },
  { clave: 'resolucion', re: /; lo recomendado es (?:2400×1600|1600×2400)/u },
  { clave: 'horizontal', re: /: es horizontal; en pantallas verticales/u },
  { clave: 'proporcion', re: /: proporción 1:/u },
  { clave: 'peso', re: /: pesa [\d.]+ MB; considera comprimirla/u },
  { clave: 'logoOpaco', re: /: no tiene fondo transparente; en Apple Books/u },
  { clave: 'sinLogoBlanco', re: /^No hay portada\/logo-blanco/u },
  { clave: 'sinPortada', re: /^No encontré portada\/portada/u },
  { clave: 'capituloVacio', re: /: está vacío, lo salté\./u },
  { clave: 'sinDescripcion', re: /^Ilustraciones sin descripción/u },
]

/** Lo afectado por un mensaje: lo que va antes de «: », o la lista de la nota de descripciones. */
function elementosDe(clave: ClaveGrupo, mensaje: string): string[] {
  if (clave === 'sinDescripcion') {
    const lista = mensaje.slice(mensaje.indexOf('): ') + 3)
    return lista.split('; ').filter((x) => x !== '')
  }
  if (clave === 'sinLogoBlanco' || clave === 'sinPortada' || clave === 'otro') return []
  const i = mensaje.indexOf(': ')
  return i === -1 ? [] : [mensaje.slice(0, i)]
}

/** Los mensajes del motor, en el hilo que sea: solo se leen. */
export interface MensajesMotor {
  readonly errores: readonly string[]
  readonly avisos: readonly string[]
  readonly notas: readonly string[]
}

export function agrupar(dg: MensajesMotor): Grupo[] {
  const grupos: { clave: ClaveGrupo; nivel: Nivel; elementos: string[]; mensajes: string[] }[] = []
  const niveles: [Nivel, readonly string[]][] = [
    ['error', dg.errores],
    ['aviso', dg.avisos],
    ['nota', dg.notas],
  ]
  for (const [nivel, lista] of niveles) {
    for (const mensaje of lista) {
      const clave = PATRONES.find((p) => p.re.test(mensaje))?.clave ?? 'otro'
      const existente =
        clave === 'otro' ? undefined : grupos.find((g) => g.clave === clave && g.nivel === nivel)
      const g = existente ?? { clave, nivel, elementos: [], mensajes: [] }
      if (!existente) grupos.push(g)
      g.mensajes.push(mensaje)
      for (const el of elementosDe(clave, mensaje)) if (!g.elementos.includes(el)) g.elementos.push(el)
    }
  }
  return grupos
}

// ---------------------------------------------------------------------------
// A que tienda le importa cada aviso
// ---------------------------------------------------------------------------

/**
 * Las dos tiendas para las que Pubteca prepara el libro.
 *
 * No es lo mismo que `LibroGenerado['tienda']` del motor: alli es el nombre
 * del archivo que sale, aqui es a quien le afecta un aviso.
 */
export type Tienda = 'apple' | 'kindle'

export const TIENDAS: readonly Tienda[] = ['apple', 'kindle']

const AMBAS: readonly Tienda[] = ['apple', 'kindle']

/**
 * A quien le importa cada aviso.
 *
 * El motivo de que esto exista: la tarjeta de una imagen los enseñaba todos
 * juntos, y el autor no tenia forma de saber que «Kindle las pinta de blanco»
 * y «Apple Books admite 5,6 millones de pixeles» son cosas de tiendas
 * distintas, ni que su imagen ya esta bien para una aunque le falte algo para
 * la otra.
 *
 * La tienda sale del motivo que el motor da, no de una opinion:
 *
 * - `transparencia`: el aviso dice «Kindle la convierte en blanco». En Apple
 *   Books la transparencia se respeta.
 * - `peso`: la tarifa de entrega por MB es de Amazon. Apple Books no cobra por
 *   el tamaño del archivo (admite hasta 2 GB).
 * - `pixeles` y `portadaLadoCorto`: los dos limites son de Apple Books.
 * - `portadaBaja`: los 2500 px de alto los recomienda KDP.
 * - `logoOpaco` y `sinLogoBlanco`: el logo solo viaja en el EPUB de Apple
 *   Books; en Kindle el titulo va en texto. Ver `entrega.ts`.
 * - `sinPortada`: la portada interna solo existe en el EPUB de Apple Books; en
 *   KDP se sube aparte.
 * - El resto (colores, tamaño, proporcion, descripciones, lo que no entra al
 *   libro) se ve igual de mal en las dos.
 */
const TIENDAS_POR_GRUPO: Readonly<Record<ClaveGrupo, readonly Tienda[]>> = {
  noEsImagen: AMBAS,
  faltaImagen: AMBAS,
  recursoAusente: AMBAS,
  transparencia: ['kindle'],
  cmyk: AMBAS,
  p3: AMBAS,
  pixeles: ['apple'],
  portadaLadoCorto: ['apple'],
  portadaBaja: ['kindle'],
  resolucion: AMBAS,
  horizontal: AMBAS,
  proporcion: AMBAS,
  peso: ['kindle'],
  logoOpaco: ['apple'],
  sinLogoBlanco: ['apple'],
  sinPortada: ['apple'],
  capituloVacio: AMBAS,
  sinDescripcion: AMBAS,
  otro: AMBAS,
}

/** A que tiendas le importa este aviso. Uno que no se reconoce afecta a las dos. */
export function tiendasDe(clave: ClaveGrupo): readonly Tienda[] {
  return TIENDAS_POR_GRUPO[clave] ?? AMBAS
}

/**
 * Los avisos repartidos por tienda, en el mismo orden en que llegaron.
 *
 * Un aviso que afecta a las dos sale en las dos listas a proposito: cada
 * columna tiene que contestar entera a «¿que le falta a esta tienda?». Si lo
 * compartido se sacara a un tercer monton, el autor tendria que juntar dos
 * sitios en la cabeza para saber si su imagen esta lista para Kindle.
 */
export function porTienda(grupos: readonly Grupo[]): Record<Tienda, Grupo[]> {
  const r: Record<Tienda, Grupo[]> = { apple: [], kindle: [] }
  for (const g of grupos) for (const t of tiendasDe(g.clave)) r[t].push(g)
  return r
}

/** Cuantas lineas eran y cuantos grupos son. Para decirle al autor que no es tanto. */
export function cuentas(grupos: readonly Grupo[]): { mensajes: number; grupos: number } {
  return { mensajes: grupos.reduce((n, g) => n + g.mensajes.length, 0), grupos: grupos.length }
}
