/**
 * El plan del libro impreso: que paginas lleva, en que orden y como se
 * numeran; y la composicion entera, con los margenes que pide el destino.
 *
 * El orden es el de la tradicion (referencia B1: Chicago y la hispana, que
 * coinciden en lo que aqui importa):
 *
 *   anteportada (impar, solo el titulo) · laminas a color, en grises, desde
 *   la par de enfrente (la primera queda de frontispicio) · portada (impar) ·
 *   creditos (al dorso) · paginas extra del principio, cada una en impar, con
 *   el indice delante de la primera que tenga titulo · capitulos (el 1, siempre
 *   en impar y con el folio 1) · paginas extra del final · colofon (en la
 *   ultima impar) · y una blanca al final si hace falta para que el numero sea
 *   par (o para que la ultima vaya en blanco, que lo pide IngramSpark).
 *
 * La cubierta NO va dentro: las tiendas la piden en su propio archivo.
 *
 * Los margenes se suben solos hasta lo que pide el destino, y el medianil de
 * KDP depende del numero de paginas, que depende del medianil: se compone, se
 * cuenta y se vuelve a componer hasta que el tramo no cambia; si oscilara,
 * gana el medianil mayor (que siempre es valido). Ver `componerImpreso`.
 */
import { esc } from '../texto'
import { textosLibro } from '../textos-libro'
import { CAIDAS, interlineaDe, isbnValido, ordenDeExtras, type ConfigImpreso, type Margenes } from './config'
import type { Contenido, ExtraImpresoLeido } from './contenido'
import { familia } from './familias'
import { BLANCAS_SEGUIDAS, CORTES, PT_POR_MM, dependeDePaginas, rangoDePaginas, tramoKdp, ultimaEnBlanco, zonaSegura } from './formatos'
import { componerLibro, type Folios, type Formato, type ImagenImpresa, type OpcionesImpreso, type Rotulo, type SeccionImpresa } from './paginar'
import type { AvisoImpreso, Fuentes, PaginaCompuesta } from './tipos'

export type ClasePieza = 'anteportada' | 'lamina' | 'portada' | 'creditos' | 'dedicatoria' | 'epigrafe' | 'extra' | 'indice' | 'capitulo' | 'colofon'

/** Lo que es cada seccion del plan, para nombrar sus paginas en la vista previa. */
export interface Pieza {
  readonly clase: ClasePieza
  /** El titulo (capitulo, extra) o el numero de lamina, en texto plano; vacio si no tiene. */
  readonly titulo: string
  /** «Capítulo 3», si lo lleva. */
  readonly numero?: string
  /** El extra del que sale, por su id. */
  readonly extra?: string
}

export interface Impreso {
  readonly paginas: readonly PaginaCompuesta[]
  /** Una por seccion: `paginas[i].seccion` es su indice (-1 en una blanca). */
  readonly piezas: readonly Pieza[]
  readonly avisos: readonly AvisoImpreso[]
  /** El corte y los margenes con que se compuso, en puntos. */
  readonly formato: Formato
  /** Los margenes con que se compuso, en mm (los elegidos, o subidos hasta el minimo). */
  readonly margenes: Margenes
  /** El medianil minimo del destino para este numero de paginas, en mm (0 si no hay regla). */
  readonly medianilMinimo: number
  readonly lineasPorPagina: number
  /** La media de caracteres de las lineas llenas del texto (no las ultimas de parrafo). */
  readonly caracteres: number
  /** Cuantas veces se compuso el libro entero para dar con el medianil. */
  readonly vueltas: number
}

/** El corte en puntos. */
export function medidasDeCorte(c: ConfigImpreso): { readonly ancho: number; readonly alto: number } {
  if (c.corte === 'personalizado') return { ancho: c.personalizado.ancho * PT_POR_MM, alto: c.personalizado.alto * PT_POR_MM }
  const corte = CORTES.find((x) => x.id === c.corte) ?? (CORTES.find((x) => x.id === '6x9') as (typeof CORTES)[number])
  return { ancho: corte.ancho * 72, alto: corte.alto * 72 }
}

export { interlineaDe }

const ESPACIO_FOLIO_ROMANO = 'xxviii'
const ESPACIO_FOLIO = '888'

/**
 * Las secciones del libro, en orden, con lo que es cada una. `folios` trae el
 * folio de la apertura de cada seccion, de una composicion anterior: con el se
 * rellena el indice (sin el, el indice sale con su sitio reservado y vacio).
 */
export function seccionesDelPlan(
  contenido: Contenido,
  c: ConfigImpreso,
  folios: ReadonlyMap<number, string> = new Map(),
): { readonly secciones: SeccionImpresa[]; readonly piezas: Pieza[] } {
  const t = textosLibro(contenido.idioma)
  const secciones: SeccionImpresa[] = []
  const piezas: Pieza[] = []
  const poner = (s: SeccionImpresa, p: Pieza): number => {
    secciones.push(s)
    piezas.push(p)
    return secciones.length - 1
  }
  const romanos = c.preliminares === 'romanos'
  const foliosPrelim: Folios = romanos ? 'romanos' : 'ninguno'
  const porId = new Map(contenido.extras.map((x) => [x.id, x]))
  const orden = ordenDeExtras(c, contenido.extras).filter((e) => e.incluir)
  const extrasDe = (donde: 'inicio' | 'final'): ExtraImpresoLeido[] =>
    orden.filter((e) => e.donde === donde).flatMap((e) => (porId.get(e.id) ? [porId.get(e.id) as ExtraImpresoLeido] : []))

  // Anteportada: solo el titulo, a la altura de la caida.
  if (c.anteportada) poner({ k: 'rotulos', enImpar: true, arriba: [{ html: esc(contenido.titulo), escala: 1.4 }] }, { clase: 'anteportada', titulo: contenido.titulo })

  // Laminas: desde la par de enfrente de la portada (la primera, de frontispicio).
  if (c.laminas === 'grises') {
    contenido.laminas.forEach((imagen, i) => poner({ k: 'imagen', imagen, enImpar: false }, { clase: 'lamina', titulo: t.laminaColor(i + 1) }))
  }

  // Portada: la portadilla del EPUB (texto, logo o pagina entera).
  const p = contenido.portadilla
  const bajoTitulo: Rotulo[] = [
    ...(contenido.subtitulo ? [{ html: esc(contenido.subtitulo), cara: 'cursiva' as const, escala: 1.15, antes: 1 }] : []),
    ...(contenido.autor ? [{ html: esc(contenido.autor), escala: 1.15, espaciado: 0.12, antes: 3 }] : []),
  ]
  const sello: Rotulo[] = contenido.sello ? [{ html: esc(contenido.sello), escala: 0.8, espaciado: 0.25 }] : []
  if (p.modo === 'pagina') poner({ k: 'imagen', imagen: p.imagen, enImpar: true }, { clase: 'portada', titulo: contenido.titulo })
  else
    poner(
      {
        k: 'rotulos',
        enImpar: true,
        desde: 0.16,
        ...(p.modo === 'logo' ? { logo: { imagen: p.imagen, ancho: 0.88 } } : {}),
        arriba: [...(p.modo === 'logo' ? [] : [{ html: esc(contenido.titulo), escala: 2 }]), ...bajoTitulo],
        abajo: sello,
      },
      { clase: 'portada', titulo: contenido.titulo },
    )

  // Creditos, al dorso de la portada: con el ISBN DEL IMPRESO y sin «Edición digital».
  const creditos: Rotulo[] = [
    { html: `<em>${esc(contenido.titulo)}</em>` },
    ...(contenido.derechos ? [{ html: esc(contenido.derechos) }] : []),
    ...(c.isbn ? [{ html: esc(`ISBN: ${c.isbn}`) }] : []),
    ...(contenido.sello ? [{ html: esc(t.publicadoPor(contenido.sello)) }] : []),
    { html: esc(t.edicionImpresa(contenido.anio)) },
  ].map((r) => ({ ...r, escala: 0.85, alinear: 'izquierda' as const }))
  poner({ k: 'rotulos', enImpar: false, arriba: [], abajo: creditos }, { clase: 'creditos', titulo: '' })

  const extra = (x: ExtraImpresoLeido, alFinal: boolean): number => {
    if (x.tipo !== 'conTitulo') {
      return poner({ numero: null, titulo: null, bloques: x.bloques, estilo: 'dedicatoria', enImpar: true }, { clase: x.tipo, titulo: '', extra: x.id })
    }
    const f: Folios = alFinal ? 'arabigos' : foliosPrelim
    return poner(
      {
        numero: null,
        titulo: x.titulo,
        cabecera: x.plano,
        bloques: x.bloques,
        antes: x.antes,
        ...(alFinal ? {} : { enImpar: true }),
        folios: f,
        ...(f === 'ninguno' ? { cabeceras: false } : {}),
      },
      { clase: 'extra', titulo: x.plano, extra: x.id },
    )
  }

  // El indice va delante de la primera pagina extra con titulo (tras la
  // dedicatoria y el epigrafe), y lista lo que viene detras y lleva folio.
  const enIndice: number[] = []
  let indice = -1
  const ponerIndice = (): void => {
    indice = poner({ k: 'indice', titulo: esc(t.indice), entradas: [], reserva: romanos ? ESPACIO_FOLIO_ROMANO : ESPACIO_FOLIO, enImpar: true, folios: foliosPrelim, ...(romanos ? {} : { cabeceras: false }) }, { clase: 'indice', titulo: t.indice })
  }
  for (const x of extrasDe('inicio')) {
    if (c.indice && indice === -1 && x.tipo === 'conTitulo') ponerIndice()
    const i = extra(x, false)
    if (indice !== -1 && x.tipo === 'conTitulo' && romanos) enIndice.push(i)
  }
  if (c.indice && indice === -1) ponerIndice()

  contenido.capitulos.forEach((cap, i) => {
    const s = poner(
      {
        numero: cap.numero,
        titulo: cap.titulo,
        cabecera: cap.plano || cap.numero,
        bloques: cap.bloques,
        antes: cap.antes,
        folios: 'arabigos',
        // El primero abre siempre en impar y lleva el folio 1.
        ...(i === 0 ? { enImpar: true, reiniciar: true } : {}),
      },
      { clase: 'capitulo', titulo: cap.plano, ...(cap.numero ? { numero: cap.numero } : {}) },
    )
    enIndice.push(s)
  })
  for (const x of extrasDe('final')) {
    const i = extra(x, true)
    if (x.tipo === 'conTitulo') enIndice.push(i)
  }

  if (c.colofon) {
    poner(
      { k: 'rotulos', enImpar: true, desde: 0.6, arriba: [{ html: esc(t.colofon(familia(c.fuente).nombre)), cara: 'cursiva', escala: 0.9 }] },
      { clase: 'colofon', titulo: '' },
    )
  }

  if (indice !== -1) {
    const entradas = enIndice.map((s) => {
      const pz = piezas[s] as Pieza
      const html = pz.numero && pz.titulo ? `${esc(pz.numero)}. ${esc(pz.titulo)}` : esc(pz.numero ?? pz.titulo)
      return { html, folio: folios.get(s) ?? '' }
    })
    secciones[indice] = { ...(secciones[indice] as Extract<SeccionImpresa, { k: 'indice' }>), entradas }
  }
  return { secciones, piezas }
}

/** El folio de la primera pagina de cada seccion que lo lleva (la apertura). */
export function foliosDeSecciones(paginas: readonly PaginaCompuesta[]): Map<number, string> {
  const r = new Map<number, string>()
  for (const p of paginas) if (p.seccion >= 0 && p.folio !== null && !r.has(p.seccion)) r.set(p.seccion, p.folio)
  return r
}

/** Que lados hubo que subir y por que, y los margenes resultantes. */
interface Medidas {
  readonly formato: Formato
  readonly margenes: Margenes
  readonly subidos: Extract<AvisoImpreso, { codigo: 'margenSubido' }>[]
  readonly medianil: number
}

/**
 * Los margenes con que se compone, para un numero de paginas supuesto.
 *
 * Cada lado es el que eligio el autor, o el minimo del destino si es mayor.
 * Y como el minimo cuenta para TODO lo impreso (IngramSpark lo dice: «folios
 * incluidos»), arriba y abajo se suben tambien lo que haga falta para que la
 * cabecera y el folio al pie, que viven en el margen, queden dentro.
 */
function medidas(c: ConfigImpreso, fuentes: Fuentes, paginas: number): Medidas {
  const { ancho, alto } = medidasDeCorte(c)
  const zona = zonaSegura(c.destino, paginas)
  const cuerpo = c.cuerpo
  const il = interlineaDe(c)
  const pequeno = cuerpo * 0.9
  const asc = Math.max(fuentes.regular.ascendente / fuentes.regular.upm, fuentes.cursiva.ascendente / fuentes.cursiva.upm) * pequeno
  const desc = (Math.abs(fuentes.regular.descendente) / fuentes.regular.upm) * pequeno
  const m = c.margenes
  const subidos: Medidas['subidos'] = []
  const lado = (l: keyof Margenes, ...candidatos: readonly [number, Extract<AvisoImpreso, { codigo: 'margenSubido' }>['porque']][]): number => {
    const elegido = m[l] * PT_POR_MM
    let usado = elegido
    let porque: Extract<AvisoImpreso, { codigo: 'margenSubido' }>['porque'] = 'destino'
    for (const [v, p] of candidatos) {
      if (v > usado + 1e-6) {
        usado = v
        porque = p
      }
    }
    const mm = (pt: number): number => Math.round((pt / PT_POR_MM) * 10) / 10
    if (usado > elegido + 1e-6) subidos.push({ codigo: 'margenSubido', lado: l, elegido: m[l], usado: mm(usado), porque })
    return usado
  }
  const hayCabecera = c.cabecera !== 'ninguna' || c.folio === 'arriba'
  const interior = lado('interior', [zona.interior, dependeDePaginas(c.destino) ? 'medianil' : 'destino'])
  const exterior = lado('exterior', [zona.exterior, 'destino'])
  // La cabecera se apoya dos interlineas por encima de la primera linea base.
  const porCabecera: [number, 'cabecera'][] = hayCabecera ? [[zona.superior - cuerpo + 2 * il + asc, 'cabecera']] : []
  const superior = lado('superior', [zona.superior, 'destino'], ...porCabecera)
  // El folio al pie de las aperturas, dos interlineas por debajo de la ultima.
  const inferior = lado('inferior', [zona.inferior, 'destino'], [zona.inferior + 2 * il + desc, 'folio'])
  const mm = (pt: number): number => pt / PT_POR_MM
  return {
    formato: { ancho, alto, interior, exterior, superior, inferior },
    margenes: { interior: mm(interior), exterior: mm(exterior), superior: mm(superior), inferior: mm(inferior) },
    subidos,
    medianil: mm(zona.interior),
  }
}

interface Vuelta {
  readonly paginas: readonly PaginaCompuesta[]
  readonly piezas: Pieza[]
  readonly avisos: readonly AvisoImpreso[]
  readonly lineas: number
  readonly m: Medidas
}

/**
 * Compone el libro entero con unas medidas: una vez, o dos si lleva indice
 * (la segunda con los folios de la primera; el indice reserva el sitio del
 * folio mas ancho, asi que sus lineas no cambian y lo demas tampoco). Al final,
 * las blancas que pida el destino.
 */
function vuelta(contenido: Contenido, c: ConfigImpreso, fuentes: Fuentes, imagen: (nombre: string) => ImagenImpresa | null, m: Medidas): Vuelta {
  const o: OpcionesImpreso = {
    formato: m.formato,
    cuerpo: c.cuerpo,
    interlinea: interlineaDe(c),
    sangria: c.sangria,
    partir: c.alineacion === 'justificado',
    idioma: contenido.idioma,
    escena: c.escena,
    adorno: contenido.separador,
    capituloEnImpar: c.capituloEnImpar,
    cabeceras: c.cabecera !== 'ninguna',
    tituloLibro: contenido.titulo,
    cabeceraPar: c.cabecera === 'autor' && contenido.autor ? contenido.autor : contenido.titulo,
    folio: c.folio,
    alineacion: c.alineacion,
    caida: CAIDAS[c.caida],
  }
  let plan = seccionesDelPlan(contenido, c)
  let r = componerLibro(plan.secciones, fuentes, o, imagen)
  if (c.indice) {
    plan = seccionesDelPlan(contenido, c, foliosDeSecciones(r.paginas))
    r = componerLibro(plan.secciones, fuentes, o, imagen)
  }
  const paginas = [...r.paginas]
  const blanca = (): void => {
    paginas.push({ numero: paginas.length + 1, folio: null, tipo: 'blanca', seccion: -1, ops: [], renglones: [] })
  }
  if (ultimaEnBlanco(c.destino) && paginas[paginas.length - 1]?.tipo !== 'blanca') blanca()
  if (paginas.length % 2 === 1) blanca()
  return { paginas, piezas: plan.piezas, avisos: r.avisos, lineas: r.lineas, m }
}

/**
 * Da con el medianil cuando depende del numero de paginas, que depende del
 * medianil (trampa 9 del plan).
 *
 * Se empieza suponiendo 0 paginas (el tramo mas bajo), se compone, se cuenta,
 * y si el numero cae en otro tramo se vuelve a componer suponiendo ese. Si el
 * nuevo tramo da las mismas medidas (`clave`: el margen del autor ya pasa del
 * minimo de los dos), no hace falta otra vuelta. Si oscila (vuelve a un tramo
 * ya compuesto), gana el tramo mayor: su medianil cubre de sobra lo que salio
 * con el.
 */
export function buscarMedianil<V extends { readonly paginas: number }>(
  tramoDe: (paginas: number) => number,
  clave: (supuestas: number) => string,
  componer: (supuestas: number) => V,
): { readonly final: V; readonly vueltas: number } {
  const porTramo = new Map<number, V>()
  let supuestas = 0
  let vueltas = 0
  const mayor = (): V => porTramo.get(Math.max(...porTramo.keys())) as V
  for (let i = 0; i < 6; i++) {
    const t = tramoDe(supuestas)
    if (porTramo.has(t)) return { final: mayor(), vueltas }
    const k = clave(supuestas)
    const v = componer(supuestas)
    vueltas++
    porTramo.set(t, v)
    if (tramoDe(v.paginas) === t || clave(v.paginas) === k) return { final: v, vueltas }
    supuestas = v.paginas
  }
  return { final: mayor(), vueltas }
}

const claveDe = (f: Formato): string => [f.ancho, f.alto, f.interior, f.exterior, f.superior, f.inferior].join('|')

/**
 * El libro impreso entero: el plan compuesto con los margenes del destino.
 * Con KDP, el medianil sale del numero real de paginas: ver `buscarMedianil`.
 */
export function componerImpreso(
  contenido: Contenido,
  c: ConfigImpreso,
  fuentes: Fuentes,
  imagen: (nombre: string) => ImagenImpresa | null = () => null,
): Impreso {
  const porPaginas = dependeDePaginas(c.destino)
  const { final: hecha, vueltas } = buscarMedianil(
    (n) => (porPaginas ? tramoKdp(n) : 0),
    (n) => claveDe(medidas(c, fuentes, n).formato),
    (n) => {
      const v = vuelta(contenido, c, fuentes, imagen, medidas(c, fuentes, n))
      return { paginas: v.paginas.length, v }
    },
  )
  const final = hecha.v

  const n = final.paginas.length
  const m = medidas(c, fuentes, n)
  const avisos: AvisoImpreso[] = [...final.avisos, ...final.m.subidos]
  const rango = rangoDePaginas(c.destino, c.papel)
  if (rango && (n < rango.min || n > rango.max)) avisos.push({ codigo: 'paginasFueraDeRango', paginas: n, min: rango.min, max: rango.max })

  // Caracteres por linea: los de las lineas llenas del texto corrido.
  let letras = 0
  let llenas = 0
  for (const p of final.paginas) {
    if (p.tipo !== 'texto' && p.tipo !== 'apertura') continue
    for (const r of p.renglones) {
      if (r.clase !== 'parrafo' || r.linea >= r.de - 1) continue
      letras += [...r.texto].length
      llenas++
    }
  }
  const caracteres = llenas > 0 ? Math.round(letras / llenas) : 0
  if (llenas > 0 && (caracteres < 45 || caracteres > 75)) avisos.push({ codigo: 'medidaFuera', caracteres })
  if (contenido.medios > 0) avisos.push({ codigo: 'mediosFuera', medios: contenido.medios })
  if (c.laminas === 'omitir' && contenido.laminas.length > 0) avisos.push({ codigo: 'laminasOmitidas', laminas: contenido.laminas.length })
  if (c.isbn && !isbnValido(c.isbn)) avisos.push({ codigo: 'isbnNoValido', isbn: c.isbn })
  if (!c.isbn) avisos.push({ codigo: 'sinIsbn' })
  for (const b of blancasSeguidas(final.paginas)) avisos.push(b)

  return {
    paginas: final.paginas,
    piezas: final.piezas,
    avisos,
    formato: final.m.formato,
    margenes: final.m.margenes,
    medianilMinimo: m.medianil,
    lineasPorPagina: final.lineas,
    caracteres,
    vueltas,
  }
}

/** Las rachas de blancas que pasan de lo que admite KDP (4 dentro, 10 al final). */
export function blancasSeguidas(paginas: readonly PaginaCompuesta[]): Extract<AvisoImpreso, { codigo: 'blancasSeguidas' }>[] {
  const r: Extract<AvisoImpreso, { codigo: 'blancasSeguidas' }>[] = []
  let desde = -1
  const cerrar = (hasta: number, alFinal: boolean): void => {
    const cuantas = hasta - desde
    if (desde >= 0 && cuantas > (alFinal ? BLANCAS_SEGUIDAS.final : BLANCAS_SEGUIDAS.dentro)) r.push({ codigo: 'blancasSeguidas', desde: (paginas[desde] as PaginaCompuesta).numero, cuantas })
    desde = -1
  }
  paginas.forEach((p, i) => {
    if (p.tipo === 'blanca') {
      if (desde < 0) desde = i
    } else cerrar(i, false)
  })
  cerrar(paginas.length, true)
  return r
}
