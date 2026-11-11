/**
 * Paginar: de los bloques de cada capitulo a paginas con sus operaciones de
 * dibujo. Todo cae en una reticula de lineas base (la interlinea): las dos
 * caras de cada hoja tienen sus lineas a la misma altura, y a contraluz no se
 * transparentan entre lineas.
 *
 * Las reglas de oficio que se cumplen aqui, cada una con su test:
 *   - un capitulo abre en pagina impar; si hace falta, se deja una par en blanco;
 *   - ningun parrafo deja su primera linea sola al pie de una pagina (huerfana)
 *     ni su ultima sola en lo alto de la siguiente (viuda): como minimo dos y
 *     dos. Si no cabe, la pagina sale una linea mas corta;
 *   - una pagina impar no acaba en guion: el lector tendria que pasar la hoja
 *     a media palabra. Se recompone el parrafo prohibiendo ese guion, y si no
 *     se puede, la pagina sale una linea mas corta;
 *   - un cambio de escena nunca se pierde en el corte de pagina: con un
 *     adorno siempre lo lleva, y con una linea en blanco, si cae arriba o al
 *     pie de pagina, se pinta el adorno (una linea en blanco ahi no se ve, y
 *     el lector no sabria que cambio la escena);
 *   - un subtitulo nunca queda solo al pie: va con lo que le sigue.
 */
import type { Bloque } from '../parser'
import { Componedor, trozosDeHtml, type Linea, type Parrafo } from './parrafo'
import type { AvisoImpreso, Cara, Fuentes, Op, PaginaCompuesta, Renglon, TipoPagina } from './tipos'

/** El tamaño de corte y los margenes, en puntos. */
export interface Formato {
  readonly ancho: number
  readonly alto: number
  /** El del lomo (medianil). */
  readonly interior: number
  readonly exterior: number
  readonly superior: number
  readonly inferior: number
}

export interface OpcionesImpreso {
  readonly formato: Formato
  readonly cuerpo: number
  readonly interlinea: number
  /** Sangria de los parrafos, en em. */
  readonly sangria: number
  readonly partir: boolean
  readonly idioma: string
  /** Como se marca un cambio de escena: con su adorno, o con una linea en blanco. */
  readonly escena: 'adorno' | 'blanco'
  readonly adorno: string
  readonly capituloEnImpar: boolean
  /** Las cabeceras de pagina: el titulo del libro en las pares y el del capitulo en las impares. */
  readonly cabeceras: boolean
  readonly tituloLibro: string
  /** Lineas minimas de un parrafo a cada lado de un corte de pagina. */
  readonly huerfanas?: number
  readonly viudas?: number
  /** El numero fisico de la primera pagina (impar = recto) y el folio que lleva. */
  readonly primeraPagina?: number
  readonly folioInicial?: number
}

export interface SeccionImpresa {
  /** «Capítulo 1», o null. */
  readonly numero: string | null
  /** El titulo en HTML en linea, como lo da el parser; null si no lleva (una dedicatoria). */
  readonly titulo: string | null
  /** La cabecera de las paginas impares; por defecto, el titulo. */
  readonly cabecera?: string | null
  readonly bloques: readonly Bloque[]
  /** Ilustraciones marcadas antes del titulo: van en su pagina, delante de la apertura. */
  readonly antes?: readonly { readonly nombre: string; readonly alt: string }[]
  /** Si abre en impar; por defecto, `capituloEnImpar`. */
  readonly enImpar?: boolean
}

export interface ImagenImpresa {
  readonly id: string
  /** Sus medidas en pixeles: solo cuenta la proporcion. */
  readonly ancho: number
  readonly alto: number
}

export interface LibroCompuesto {
  readonly paginas: readonly PaginaCompuesta[]
  readonly avisos: readonly AvisoImpreso[]
  /** Lineas por pagina de la reticula. */
  readonly lineas: number
}

export const ADORNO_DE_RESERVA = '* * *'

// ---------------------------------------------------------------------------
// Unidades y renglones
// ---------------------------------------------------------------------------

/** Lo que ocupa la columna de un capitulo, antes de cortarlo en paginas. */
type Unidad =
  | {
      readonly k: 'texto'
      readonly clase: 'parrafo' | 'verso' | 'sub'
      readonly bloque: number
      /** El grupo que no debe quedar con una linea sola a un lado del corte: el parrafo, o la estrofa. */
      readonly grupo: number
      readonly x0: number
      readonly cuerpo: number
      parrafo: Parrafo
      readonly sinGuion: Set<number>
    }
  | { readonly k: 'blanco' }
  | { readonly k: 'escena'; readonly bloque: number }
  | { readonly k: 'ilus'; readonly bloque: number; readonly imagen: ImagenImpresa }

/** Un renglon de la reticula, antes de saber en que pagina cae. */
interface Slot {
  readonly k: 'linea' | 'blanco' | 'escena'
  readonly unidad: number
  /** Para una linea: cual de su parrafo. */
  readonly linea: number
  readonly grupo: number
  /** Que linea es dentro de su grupo, y cuantas tiene el grupo. */
  readonly enGrupo: number
  readonly deGrupo: number
  /** Si se puede cortar la pagina justo despues de este renglon. */
  readonly romper: boolean
}

// ---------------------------------------------------------------------------
// El paginador
// ---------------------------------------------------------------------------

export function componerLibro(
  secciones: readonly SeccionImpresa[],
  fuentes: Fuentes,
  o: OpcionesImpreso,
  imagen: (nombre: string) => ImagenImpresa | null = () => null,
): LibroCompuesto {
  return new Paginador(fuentes, o, imagen).componer(secciones)
}

class Paginador {
  private readonly c: Componedor
  private readonly o: OpcionesImpreso
  private readonly imagen: (nombre: string) => ImagenImpresa | null
  private readonly medida: number
  private readonly lineas: number
  private readonly huerfanas: number
  private readonly viudas: number
  private readonly adorno: string
  private readonly paginas: PaginaCompuesta[] = []
  private readonly avisos: AvisoImpreso[] = []
  private numero: number

  constructor(fuentes: Fuentes, o: OpcionesImpreso, imagen: (nombre: string) => ImagenImpresa | null) {
    this.c = new Componedor(fuentes, o.idioma)
    this.o = o
    this.imagen = imagen
    const f = o.formato
    this.medida = f.ancho - f.interior - f.exterior
    this.lineas = Math.max(1, Math.floor((f.alto - f.superior - f.inferior - o.cuerpo) / o.interlinea) + 1)
    this.huerfanas = o.huerfanas ?? 2
    this.viudas = o.viudas ?? 2
    this.numero = o.primeraPagina ?? 1
    // El adorno, si la fuente lo tiene; si no, tres asteriscos, y se dice.
    const pedido = o.adorno.trim() || ADORNO_DE_RESERVA
    const falta = [...pedido].some((ch) => !/\s/u.test(ch) && !fuentes.regular.tiene(ch.codePointAt(0) as number))
    this.adorno = falta ? ADORNO_DE_RESERVA : pedido
    if (falta) this.avisos.push({ codigo: 'adornoSinGlifo', adorno: pedido, usado: ADORNO_DE_RESERVA })
    if (o.partir && !this.c.particion) this.avisos.push({ codigo: 'sinParticion', idioma: o.idioma })
  }

  componer(secciones: readonly SeccionImpresa[]): LibroCompuesto {
    secciones.forEach((s, i) => this.seccion(s, i))
    if (this.c.faltan.size > 0) this.avisos.unshift({ codigo: 'faltanGlifos', caracteres: [...this.c.faltan].join('') })
    return { paginas: this.paginas, avisos: this.avisos, lineas: this.lineas }
  }

  // --- La reticula -----------------------------------------------------------

  private base(i: number): number {
    return this.o.formato.superior + this.o.cuerpo + i * this.o.interlinea
  }

  private izquierda(numero: number): number {
    return numero % 2 === 1 ? this.o.formato.interior : this.o.formato.exterior
  }

  private folio(numero: number): string {
    return String((this.o.folioInicial ?? this.o.primeraPagina ?? 1) + numero - (this.o.primeraPagina ?? 1))
  }

  private emitir(tipo: TipoPagina, seccion: number, ops: Op[], renglones: Renglon[], folio: boolean): void {
    this.paginas.push({ numero: this.numero, folio: folio ? this.folio(this.numero) : null, tipo, seccion, ops, renglones })
    this.numero++
  }

  private blanca(): void {
    this.emitir('blanca', -1, [], [], false)
  }

  // --- Una seccion -----------------------------------------------------------

  private seccion(s: SeccionImpresa, si: number): void {
    const enImpar = s.enImpar ?? this.o.capituloEnImpar
    for (const a of s.antes ?? []) {
      const img = this.imagen(a.nombre)
      if (img) this.paginaDeIlustracion(img, si)
      else this.avisos.push({ codigo: 'ilustracionPerdida', nombre: a.nombre })
    }
    if (enImpar && this.numero % 2 === 0) this.blanca()

    const unidades = this.unidades(s.bloques)
    let slots = this.slots(unidades)
    const plano = (html: string): string =>
      trozosDeHtml(html)
        .map((t) => t.texto)
        .join('')
    const cabecera = s.cabecera ?? (s.titulo !== null ? plano(s.titulo) : null)

    // La apertura: el titulo cae a un tercio de la pagina.
    const apertura = this.apertura(s, si)
    let cursor = 0
    let primera = true
    const flotantes = unidades.map((u, i) => ({ u, i })).filter((x) => x.u.k === 'ilus')
    let pendientes = 0

    while (cursor < slots.length || primera) {
      const desde = primera ? apertura.lineas : 0
      const cap = this.lineas - desde
      // Lo que quede en blanco arriba de la pagina no se ve: fuera (nunca un cambio de escena).
      if (!primera) while (cursor < slots.length && (slots[cursor] as Slot).k === 'blanco') cursor++
      if (cursor >= slots.length && !primera) break

      let fin = this.corte(slots, cursor, cap)
      // Una impar no acaba en guion.
      for (let intento = 0; this.numero % 2 === 1 && intento < 8; intento++) {
        const ultimo = slots[fin]
        if (!ultimo || ultimo.k !== 'linea' || fin === slots.length - 1) break
        const u = unidades[ultimo.unidad]
        if (!u || u.k !== 'texto' || !u.parrafo.lineas[ultimo.linea]?.guion) break
        // Se recompone desde la primera linea de ese parrafo en esta pagina:
        // las de antes ya estan impresas en la anterior.
        const primeraAqui = ultimo.linea - (fin - Math.max(cursor, fin - ultimo.linea))
        u.sinGuion.add(ultimo.linea)
        const nuevo = u.parrafo.recomponer(primeraAqui, u.sinGuion)
        if (nuevo) {
          u.parrafo = nuevo
          slots = this.slots(unidades)
          fin = this.corte(slots, cursor, cap)
          continue
        }
        u.sinGuion.delete(ultimo.linea)
        // Sin recomponer: la pagina, una linea mas corta (si se puede cortar ahi sin dejar viudas).
        let atras = -1
        for (let j = fin - 1; j >= cursor; j--) {
          const sj = slots[j] as Slot
          if (!sj.romper) continue
          const uj = unidades[sj.unidad]
          if (sj.k === 'linea' && uj?.k === 'texto' && uj.parrafo.lineas[sj.linea]?.guion) continue
          atras = j
          break
        }
        if (atras >= 0) fin = atras
        else this.avisos.push({ codigo: 'guionEnImpar', pagina: this.numero })
        break
      }

      const enPagina = slots.slice(cursor, fin + 1)
      const ops: Op[] = primera ? [...apertura.ops] : []
      const renglones: Renglon[] = primera ? [...apertura.renglones] : []
      const izq = this.izquierda(this.numero)
      enPagina.forEach((sl, k) => {
        const fila = desde + k
        const u = unidades[sl.unidad] as Unidad
        if (sl.k === 'linea' && u.k === 'texto') {
          const l = u.parrafo.lineas[sl.linea] as Linea
          this.pintarLinea(ops, l, izq + u.x0, this.base(fila), u.cuerpo)
          if (l.desbordada) this.avisos.push({ codigo: 'lineaDesbordada', pagina: this.numero, texto: l.texto })
          renglones.push({ clase: u.clase, texto: l.texto, guion: l.guion, seccion: si, bloque: u.bloque, linea: sl.enGrupo, de: sl.deGrupo, y: this.base(fila) })
        } else if (sl.k === 'escena' && u.k === 'escena') {
          if (this.o.escena === 'adorno') {
            // Dos renglones; el adorno, centrado entre la linea de antes y la de despues.
            if (sl.linea !== 0) return
            const xh = (this.c.fuentes.regular.alturaX * this.o.cuerpo) / this.c.fuentes.regular.upm
            const y = (this.base(fila - 1) + this.base(fila + 2) - xh) / 2 + xh / 2
            this.pintarAdorno(ops, izq, y)
            renglones.push({ clase: 'escena', texto: this.adorno, guion: false, seccion: si, bloque: u.bloque, linea: 0, de: 1, y })
          } else {
            // Una linea en blanco; arriba o al pie de la pagina no se veria: adorno.
            const enBorde = k === 0 || k === enPagina.length - 1
            if (enBorde) this.pintarAdorno(ops, izq, this.base(fila))
            renglones.push({ clase: 'escena', texto: enBorde ? this.adorno : '', guion: false, seccion: si, bloque: u.bloque, linea: 0, de: 1, y: this.base(fila) })
          }
        }
      })
      const tipo: TipoPagina = primera && apertura.titulada ? 'apertura' : 'texto'
      if (tipo === 'texto' && this.o.cabeceras) this.pintarCabecera(ops, this.numero % 2 === 0 ? this.o.tituloLibro : cabecera)
      if (tipo === 'apertura') this.pintarFolioAlPie(ops)
      this.emitir(tipo, si, ops, renglones, true)
      cursor = fin + 1
      primera = false

      // Las ilustraciones ancladas en lo que ya salio: cada una en su pagina, detras.
      while (pendientes < flotantes.length) {
        const fl = flotantes[pendientes] as { u: Unidad; i: number }
        // Va detras de la pagina donde cae el renglon que la precede.
        const ancla = slots.findIndex((x) => x.unidad > fl.i)
        if (ancla === -1 ? cursor < slots.length : ancla > cursor) break
        if (fl.u.k === 'ilus') this.paginaDeIlustracion(fl.u.imagen, si)
        pendientes++
      }
    }
  }

  /** El ultimo renglon de la pagina que empieza en `cursor` con sitio para `cap`. */
  private corte(slots: readonly Slot[], cursor: number, cap: number): number {
    if (cursor + cap >= slots.length) return slots.length - 1
    for (let j = cursor + cap - 1; j >= cursor; j--) if ((slots[j] as Slot).romper) return j
    // Ningun corte permitido cabe: se corta por donde se llena (no deberia pasar).
    return cursor + cap - 1
  }

  // --- De bloques a unidades, y de unidades a renglones ------------------------

  private unidades(bloques: readonly Bloque[]): Unidad[] {
    const o = this.o
    const u: Unidad[] = []
    let grupo = 0
    let primero = true
    let enPoema = false
    let estrofa = -1
    const sangria = o.sangria * o.cuerpo
    const margenVerso = 1.6 * o.cuerpo
    const hayAlgo = (): boolean => u.some((x) => x.k !== 'ilus')
    bloques.forEach((b, bi) => {
      const esVerso = b.tipo === 'verso' || b.tipo === 'estrofa'
      if (enPoema && !esVerso && b.tipo !== 'ilus' && b.tipo !== 'medio') {
        u.push({ k: 'blanco' })
        enPoema = false
      }
      switch (b.tipo) {
        case 'p': {
          const parrafo = this.c.parrafo(trozosDeHtml(b.html), { cuerpo: o.cuerpo, ancho: this.medida, modo: 'justificado', partir: o.partir, sangria: primero ? 0 : sangria })
          u.push({ k: 'texto', clase: 'parrafo', bloque: bi, grupo: ++grupo, x0: 0, cuerpo: o.cuerpo, parrafo, sinGuion: new Set() })
          primero = false
          break
        }
        case 'sub': {
          if (hayAlgo()) u.push({ k: 'blanco' })
          const parrafo = this.c.parrafo(trozosDeHtml(b.html, 'negrita'), { cuerpo: o.cuerpo, ancho: this.medida, modo: 'centrado', partir: false })
          u.push({ k: 'texto', clase: 'sub', bloque: bi, grupo: ++grupo, x0: 0, cuerpo: o.cuerpo, parrafo, sinGuion: new Set() })
          primero = true
          break
        }
        case 'escena':
          u.push({ k: 'escena', bloque: bi })
          primero = true
          break
        case 'estrofa':
          if (enPoema) {
            u.push({ k: 'blanco' })
            estrofa = ++grupo
          }
          break
        case 'verso': {
          if (!enPoema) {
            if (hayAlgo()) u.push({ k: 'blanco' })
            enPoema = true
            estrofa = ++grupo
          }
          const parrafo = this.c.parrafo(trozosDeHtml(b.html, 'cursiva'), { cuerpo: o.cuerpo, ancho: this.medida - margenVerso, modo: 'bandera', partir: false, colgante: margenVerso })
          u.push({ k: 'texto', clase: 'verso', bloque: bi, grupo: estrofa, x0: margenVerso, cuerpo: o.cuerpo, parrafo, sinGuion: new Set() })
          primero = true
          break
        }
        case 'ilus': {
          const img = this.imagen(b.nombre)
          if (img) u.push({ k: 'ilus', bloque: bi, imagen: img })
          else this.avisos.push({ codigo: 'ilustracionPerdida', nombre: b.nombre })
          break
        }
        case 'medio':
          // Audio y video solo existen en el EPUB de Apple Books.
          break
      }
    })
    return u
  }

  private slots(unidades: readonly Unidad[]): Slot[] {
    // Cuantas lineas tiene cada grupo (un parrafo, o una estrofa entera).
    const total = new Map<number, number>()
    for (const u of unidades) if (u.k === 'texto') total.set(u.grupo, (total.get(u.grupo) ?? 0) + u.parrafo.lineas.length)
    const r: { k: Slot['k']; unidad: number; linea: number; grupo: number; enGrupo: number; deGrupo: number; clase: string }[] = []
    const visto = new Map<number, number>()
    unidades.forEach((u, ui) => {
      if (u.k === 'texto') {
        u.parrafo.lineas.forEach((_l, li) => {
          const n = visto.get(u.grupo) ?? 0
          visto.set(u.grupo, n + 1)
          r.push({ k: 'linea', unidad: ui, linea: li, grupo: u.grupo, enGrupo: n, deGrupo: total.get(u.grupo) ?? 1, clase: u.clase })
        })
      } else if (u.k === 'blanco') {
        r.push({ k: 'blanco', unidad: ui, linea: 0, grupo: -1, enGrupo: 0, deGrupo: 1, clase: 'blanco' })
      } else if (u.k === 'escena') {
        const n = this.o.escena === 'adorno' ? 2 : 1
        for (let i = 0; i < n; i++) r.push({ k: 'escena', unidad: ui, linea: i, grupo: -1, enGrupo: i, deGrupo: n, clase: 'escena' })
      }
    })
    return r.map((s, i) => {
      const sig = r[i + 1]
      let romper = true
      if (s.clase === 'sub') romper = false
      // El adorno ocupa dos renglones y no se parte; al pie de la pagina si
      // puede ir, que se ve (si fuera una linea en blanco, se pinta el adorno).
      else if (s.k === 'escena') romper = !(sig?.k === 'escena' && sig.unidad === s.unidad)
      else if (s.k === 'linea' && sig?.k === 'linea' && sig.grupo === s.grupo) {
        const antes = s.enGrupo + 1
        const despues = s.deGrupo - antes
        romper = antes >= this.huerfanas && despues >= this.viudas
        // Un verso largo no se parte entre paginas.
        if (sig.unidad === s.unidad && s.clase === 'verso') romper = false
      }
      return { k: s.k, unidad: s.unidad, linea: s.linea, grupo: s.grupo, enGrupo: s.enGrupo, deGrupo: s.deGrupo, romper }
    })
  }

  // --- Apertura, cabeceras, folios, adornos, ilustraciones ----------------------

  private apertura(s: SeccionImpresa, si: number): { lineas: number; ops: Op[]; renglones: Renglon[]; titulada: boolean } {
    const o = this.o
    const ops: Op[] = []
    const renglones: Renglon[] = []
    if (s.titulo === null && s.numero === null) return { lineas: 0, ops, renglones, titulada: false }
    const izq = this.izquierda(this.numero)
    let fila = Math.round(this.lineas * 0.28)
    if (s.numero) {
      const cuerpo = o.cuerpo * 0.8
      const p = this.c.parrafo([{ texto: s.numero.toLocaleUpperCase(o.idioma), cara: 'regular' }], { cuerpo, ancho: this.medida, modo: 'centrado', partir: false, espaciado: 0.25 })
      for (const l of p.lineas) {
        this.pintarLinea(ops, l, izq, this.base(fila), cuerpo)
        renglones.push({ clase: 'numero', texto: l.texto, guion: false, seccion: si, bloque: -1, linea: 0, de: 1, y: this.base(fila) })
        fila++
      }
      fila++
    }
    if (s.titulo) {
      const cuerpo = o.cuerpo * 1.6
      const paso = cuerpo * 1.25
      const p = this.c.parrafo(trozosDeHtml(s.titulo), { cuerpo, ancho: this.medida, modo: 'centrado', partir: false })
      const y0 = this.base(fila)
      p.lineas.forEach((l, i) => {
        this.pintarLinea(ops, l, izq, y0 + i * paso, cuerpo)
        renglones.push({ clase: 'titulo', texto: l.texto, guion: false, seccion: si, bloque: -1, linea: i, de: p.lineas.length, y: y0 + i * paso })
      })
      fila += Math.ceil(((p.lineas.length - 1) * paso) / o.interlinea) + 1
    }
    // Dos lineas en blanco entre el titulo y el texto.
    fila += 2
    return { lineas: Math.min(fila, this.lineas - 1), ops, renglones, titulada: true }
  }

  private pintarLinea(ops: Op[], l: Linea, x: number, y: number, cuerpo: number): void {
    for (const p of l.piezas) ops.push({ op: 'texto', cara: p.cara, cuerpo, x: x + l.desde + p.x, y, glifos: p.glifos })
  }

  private pintarAdorno(ops: Op[], izq: number, y: number): void {
    const p = this.c.parrafo([{ texto: this.adorno, cara: 'regular' }], { cuerpo: this.o.cuerpo, ancho: this.medida, modo: 'centrado', partir: false })
    for (const l of p.lineas) this.pintarLinea(ops, l, izq, y, this.o.cuerpo)
  }

  private pintarCabecera(ops: Op[], texto: string | null): void {
    const o = this.o
    const cuerpo = o.cuerpo * 0.9
    const y = this.base(0) - 2 * o.interlinea
    const izq = this.izquierda(this.numero)
    if (texto) {
      // Si no cabe en dos tercios de la medida, se acorta por palabras con «…».
      let t = texto.trim()
      while (t.includes(' ') && this.c.medir(t, 'cursiva', cuerpo) > this.medida * 0.66) t = t.replace(/\s+\S+$/u, '').replace(/[\s,.;:]+$/u, '') + '…'
      const limpio = t.replace(/…+$/u, '…')
      const p = this.c.parrafo([{ texto: limpio, cara: 'cursiva' }], { cuerpo, ancho: this.medida, modo: 'centrado', partir: false })
      const l = p.lineas[0]
      if (l) this.pintarLinea(ops, l, izq, y, cuerpo)
    }
    // El folio, en la esquina de fuera.
    const folio = this.folio(this.numero)
    const w = this.c.medir(folio, 'regular', cuerpo)
    const x = this.numero % 2 === 1 ? izq + this.medida - w : izq
    this.pintarTexto(ops, folio, 'regular', cuerpo, x, y)
  }

  private pintarFolioAlPie(ops: Op[]): void {
    const cuerpo = this.o.cuerpo * 0.9
    const folio = this.folio(this.numero)
    const w = this.c.medir(folio, 'regular', cuerpo)
    this.pintarTexto(ops, folio, 'regular', cuerpo, this.izquierda(this.numero) + (this.medida - w) / 2, this.base(this.lineas - 1) + 2 * this.o.interlinea)
  }

  private pintarTexto(ops: Op[], texto: string, cara: Cara, cuerpo: number, x: number, y: number): void {
    ops.push({ op: 'texto', cara, cuerpo, x, y, glifos: this.c.fuentes[cara].formar(texto).glifos })
  }

  private paginaDeIlustracion(img: ImagenImpresa, si: number): void {
    const f = this.o.formato
    const alto = f.alto - f.superior - f.inferior
    const escala = Math.min(this.medida / img.ancho, alto / img.alto)
    const w = img.ancho * escala
    const h = img.alto * escala
    const x = this.izquierda(this.numero) + (this.medida - w) / 2
    const y = f.superior + (alto - h) / 2
    this.emitir('ilustracion', si, [{ op: 'imagen', id: img.id, x, y, ancho: w, alto: h }], [], false)
  }
}
