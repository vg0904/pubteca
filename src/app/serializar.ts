/**
 * Modelo -> dialecto de Markdown.
 *
 * El modelo de la app es la verdad; este dialecto es el formato con el que se
 * alimenta al motor y con el que se escribe el .zip del proyecto (que ademas
 * es la entrada que entiende el generar_epub.py de referencia, asi que el
 * autor no queda encerrado en la app).
 *
 * Por eso tiene que ser SIN PERDIDAS, y hay un test de ida y vuelta que lo
 * demuestra: serializar un modelo, pasarlo por el parser del motor, y
 * comprobar que sale exactamente lo que el modelo significaba.
 *
 * Donde el dialecto no puede representar algo, NO se corrompe en silencio: se
 * devuelve un aviso para que la interfaz lo diga.
 */
import { RE_ESCENA, RE_TITULO } from '../core/parser'
import { enLinea } from '../core/texto'
import { htmlDeTramos } from './html'
import {
  normalizarLinea,
  textoDeTramos,
  type Bloque,
  type Capitulo,
  type Extra,
  type Tramo,
} from './modelo'

export interface Aviso {
  readonly que: string
  readonly porque: string
  readonly sugerencia: string
}

export interface Serializado {
  readonly texto: string
  readonly avisos: readonly Aviso[]
}

/**
 * Escapa lo que el motor interpretaria dentro de una linea de texto.
 *
 * `guion` escapa tambien los «-». No se hace siempre porque llenaria de barras
 * los .md del .zip, que un humano puede querer leer; se activa solo como
 * candidato cuando hace falta (ver `candidatos`).
 */
function escaparEnLinea(s: string, guion = false): string {
  // El orden importa: la barra invertida primero, o se escaparian las barras
  // que acabamos de meter.
  let r = s.replace(/\\/g, '\\\\').replace(/([*_])/g, '\\$1')
  if (guion) r = r.replace(/-/g, '\\-')
  return r
}

/**
 * Escapa el primer caracter de la linea si el motor lo leeria como marcador de
 * bloque. Funciona porque arreglamos el bug nº7: en el Python escapar un
 * marcador de bloque no lo desactivaba.
 */
function protegerInicio(linea: string): string {
  const primero = linea[0]
  if (primero === undefined) return linea
  if (primero === '>' || primero === '#' || primero === '[') {
    return `\\${primero}${linea.slice(1)}`
  }
  return linea
}

/**
 * Los cuatro juegos de delimitadores que el motor entiende.
 *
 * Hacen falta variantes porque los delimitadores de dos tramos seguidos se
 * pegan y se vuelven ambiguos: una cursiva seguida de una negrita da
 * «*a***b**», y el motor lee eso como `<em>a<strong></em>b</strong>`, HTML mal
 * anidado. Con «_a_**b**» no hay ambiguedad. Lo encontro el test de propiedad.
 */
const JUEGOS = [
  { cursiva: '*', negrita: '**', ambas: '***' },
  { cursiva: '_', negrita: '**', ambas: '***' },
  { cursiva: '*', negrita: '__', ambas: '***' },
  { cursiva: '_', negrita: '__', ambas: '***' },
] as const

type Juego = (typeof JUEGOS)[number]

function conJuego(tramos: readonly Tramo[], j: Juego, guion: boolean): string {
  return normalizarLinea(tramos)
    .map((t) => {
      const cursiva = t.marcas.includes('cursiva')
      const negrita = t.marcas.includes('negrita')
      if (!cursiva && !negrita) return escaparEnLinea(t.texto, guion)

      // Las regex del motor exigen (?=\S) tras el delimitador y (?<=\S) antes
      // del de cierre, asi que «* texto *» NO se convierte en cursiva. El
      // espacio tiene que quedar FUERA de los delimitadores, que ademas es lo
      // tipograficamente correcto.
      const m = /^(\s*)([\s\S]*?)(\s*)$/u.exec(t.texto)
      const antes = m?.[1] ?? ''
      const nucleo = m?.[2] ?? ''
      const despues = m?.[3] ?? ''
      if (nucleo === '') return escaparEnLinea(t.texto, guion)

      const d = cursiva && negrita ? j.ambas : negrita ? j.negrita : j.cursiva
      return (
        escaparEnLinea(antes, guion) +
        d +
        escaparEnLinea(nucleo, guion) +
        d +
        escaparEnLinea(despues, guion)
      )
    })
    .join('')
}

/**
 * Las ocho formas de escribir la misma linea: cuatro juegos de delimitadores x
 * escapar o no los guiones.
 *
 * `suelta` distingue un parrafo (que empieza la linea y necesita las
 * protecciones de bloque) del contenido de un verso o de un subtitulo, que va
 * detras de «> » o «# » y por tanto NO puede leerse como otro tipo de bloque.
 * Aplicarle las protecciones ahi lo corrompia: un verso en cursiva con el texto
 * «-» se serializaba «> \*-*» y salia literal.
 */
function candidatos(tramos: readonly Tramo[], suelta: boolean): string[] {
  const salida: string[] = []
  for (const guion of [false, true]) {
    for (const j of JUEGOS) {
      let linea = conJuego(tramos, j, guion)
      if (suelta) linea = protegerInicio(linea)
      salida.push(linea)
    }
  }
  return salida
}

/**
 * Una linea de texto del dialecto, VERIFICADA.
 *
 * En vez de razonar sobre cada interaccion de las cinco regex de enfasis del
 * motor y de sus marcadores de bloque, se serializa y se COMPRUEBA: se pasa el
 * candidato por el `enLinea` del motor y se compara con lo que el modelo
 * significa. El primero que coincide, y que ademas no se lea como un cambio de
 * escena, es el que se escribe.
 *
 * La verificacion cubre la linea COMPLETA, protecciones incluidas. Hacerlo
 * antes de las protecciones era un bug: escapar el primer caracter para romper
 * un falso cambio de escena destrozaba el delimitador de enfasis que habia
 * justo ahi.
 *
 * Si ningun candidato sirve, se avisa en vez de escribir algo que al releerlo
 * saldria distinto.
 */
function lineaDeTexto(
  tramos: readonly Tramo[],
  contexto: string,
  avisos: Aviso[],
  suelta = true,
): string {
  const objetivo = htmlDeTramos(tramos)
  const opciones = candidatos(tramos, suelta)

  for (const linea of opciones) {
    if (suelta && RE_ESCENA.test(linea)) continue
    if (enLinea(linea) === objetivo) return linea
  }

  // Ninguno sobrevive. Se distingue el motivo para que el aviso sea util.
  const soloEscena = opciones.every((l) => RE_ESCENA.test(l) || enLinea(l) !== objetivo)
  const comoEscena = opciones.some((l) => RE_ESCENA.test(l) && enLinea(l) === objetivo)
  if (soloEscena && comoEscena) {
    avisos.push({
      que: `${contexto}: «${textoDeTramos(tramos)}»`,
      porque:
        'Este texto está hecho solo de símbolos que el formato del libro usa para marcar un ' +
        'cambio de escena, y no se pueden escapar.',
      sugerencia: 'Añade una palabra o un punto, o conviértelo en un cambio de escena.',
    })
  } else {
    avisos.push({
      que: `${contexto}: «${textoDeTramos(tramos)}»`,
      porque:
        'La combinación de cursivas y negritas de este texto no se puede guardar sin que cambie ' +
        'al volver a leerla.',
      sugerencia: 'Separa las partes en cursiva y en negrita con alguna palabra o signo.',
    })
  }
  return opciones[0] as string
}

/** Para contextos sin aviso propio (el titulo ya tiene el suyo). */
function serializarTramos(tramos: readonly Tramo[]): string {
  const objetivo = htmlDeTramos(tramos)
  for (const linea of candidatos(tramos, false)) {
    if (enLinea(linea) === objetivo) return linea
  }
  return candidatos(tramos, false)[0] as string
}

/**
 * Traduce el id interno de una imagen al nombre con el que se escribe en el
 * .zip (capXX-YY.png, color-NN.png). Por defecto deja el id, que es lo que
 * usan los tests de ida y vuelta.
 */
export type NombreDeImagen = (imagenId: string) => string

const ID_TAL_CUAL: NombreDeImagen = (id) => id

/** Serializa un bloque a sus lineas del dialecto. */
function lineasDeBloque(
  b: Bloque,
  separador: string,
  avisos: Aviso[],
  nombreDeImagen: NombreDeImagen,
): string[] {
  switch (b.tipo) {
    case 'parrafo':
      return [lineaDeTexto(b.tramos, 'Párrafo', avisos)]
    case 'subtitulo':
      return [`# ${lineaDeTexto(b.tramos, 'Subtítulo', avisos, false)}`]
    case 'escena':
      return [separador]
    case 'versos': {
      // Un verso vacio no se puede representar: «>» a solas es un cambio de
      // estrofa para el motor, no un verso en blanco. Se omite, igual que hace
      // bloquesDelModelo, asi que los dos lados coinciden.
      const lineas: string[] = []
      for (const [i, estrofa] of b.estrofas.entries()) {
        if (i > 0) lineas.push('>')
        for (const verso of estrofa) {
          const texto = lineaDeTexto([verso], 'Verso', avisos, false)
          if (texto !== '') lineas.push(`> ${texto}`)
        }
      }
      return lineas
    }
    case 'ilustracion': {
      // El nombre de archivo se genera al exportar; aqui va el id, que la capa
      // de exportacion traduce. Ver app/exportar.ts.
      //
      // La marca RECORTA la descripcion y la DESESCAPA al leerla, asi que aqui
      // se recorta y se escapan las barras invertidas. Y no puede llevar «]»,
      // que cerraria la marca antes de tiempo.
      if (b.alt.includes(']')) {
        avisos.push({
          que: `Descripción de una ilustración: «${b.alt}»`,
          porque: 'La descripción no puede llevar un corchete de cierre «]»: cerraría la marca.',
          sugerencia: 'Quita el corchete de la descripción.',
        })
      }
      const alt = b.alt.replace(/\]/g, '').trim().replace(/\\/g, '\\\\')
      return [`[ilustración: ${nombreDeImagen(b.imagenId)} | ${alt}]`]
    }
  }
}

/** La primera linea de un capitulo: la cabecera. */
function lineaDeTitulo(cap: Capitulo, avisos: Aviso[]): string {
  const titulo = serializarTramos(cap.titulo)
  const plano = textoDeTramos(cap.titulo)

  // Si el titulo entero va envuelto en un solo delimitador, limpiarTitulo lo
  // desenvolveria al releerlo y se perderia el enfasis.
  const envuelto = /^(\*\*\*|\*\*|\*|__|_)(.+)\1$/u.test(titulo)
  if (envuelto) {
    avisos.push({
      que: `Título del capítulo «${plano}»`,
      porque: 'Un título con el énfasis aplicado a TODO el texto se pierde al guardarlo.',
      sugerencia: 'Deja alguna palabra del título sin cursiva ni negrita, o quita el énfasis.',
    })
  }

  // Una etiqueta sin titulo («Capitulo 3» a secas) se escribe sola. Con el
  // separador detras, «Capitulo 3: » se leia como un titulo que ACABA en dos
  // puntos, y el libro decia «Capitulo 3:» en la cabecera y en el indice.
  if (cap.etiqueta) return plano.trim() === '' ? cap.etiqueta : `${cap.etiqueta}: ${titulo}`

  if (plano.trim() === '') {
    avisos.push({
      que: 'Un capítulo sin título',
      porque: 'Sin título ni etiqueta, el libro tomaría su primer párrafo como título.',
      sugerencia: 'Ponle un título, o una etiqueta como «Capítulo 3».',
    })
  }

  // Sin etiqueta, pero si el titulo solo ya parece una cabecera de capitulo, al
  // releerlo se partiria en etiqueta + titulo.
  if (RE_TITULO.test(plano)) {
    avisos.push({
      que: `Título del capítulo «${plano}»`,
      porque:
        'El título, sin etiqueta, parece ya una cabecera de capítulo, así que al volver a ' +
        'leerlo se partiría en dos.',
      sugerencia: 'Pon la parte de «Capítulo N» en el campo de etiqueta.',
    })
  }
  return titulo
}

/** Un capitulo completo, listo para `capitulos/capNN.md`. */
export function serializarCapitulo(
  cap: Capitulo,
  separador: string,
  nombreDeImagen: NombreDeImagen = ID_TAL_CUAL,
): Serializado {
  const avisos: Aviso[] = []
  const lineas: string[] = []

  // Las ilustraciones de apertura van ANTES de la cabecera.
  for (const a of cap.aperturas) {
    lineas.push(`[ilustración: ${nombreDeImagen(a.imagenId)} | ${a.alt.replace(/\]/g, '').trim()}]`)
  }
  lineas.push(lineaDeTitulo(cap, avisos))
  lineas.push('')

  for (const b of cap.bloques) {
    lineas.push(...lineasDeBloque(b, separador, avisos, nombreDeImagen))
    lineas.push('')
  }

  return { texto: lineas.join('\n').replace(/\n+$/u, '\n'), avisos }
}

/** Un extra, listo para `extras/<nombre>.md`. */
export function serializarExtra(
  extra: Extra,
  separador: string,
  nombreDeImagen: NombreDeImagen = ID_TAL_CUAL,
): Serializado {
  const avisos: Aviso[] = []
  const lineas: string[] = []

  if (extra.tipo === 'conTitulo') {
    lineas.push(serializarTramos(extra.titulo))
    lineas.push('')
  }
  for (const b of extra.bloques) {
    lineas.push(...lineasDeBloque(b, separador, avisos, nombreDeImagen))
    lineas.push('')
  }

  return { texto: lineas.join('\n').replace(/\n+$/u, '\n'), avisos }
}
