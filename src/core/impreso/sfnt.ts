/**
 * Leer una fuente TrueType (sfnt con contornos `glyf`): lo justo para componer
 * un libro y para incrustarla en el PDF.
 *
 * Sincrono y sin dependencias, como el resto del core: recibe los bytes y
 * responde. Lee:
 *   - `cmap` (formatos 4 y 12): que glifo tiene cada caracter;
 *   - `hmtx`: cuanto avanza cada glifo;
 *   - `GPOS` (tipo 2, pares, y su extension 9): el kerning;
 *   - `GSUB` (tipo 4, ligaduras, y su extension 7), solo la caracteristica
 *     `liga`: fi, fl, ff... Un libro sin ligaduras se nota;
 *   - `OS/2.fsType`: si la licencia deja incrustarla (ver `incrustable`).
 *
 * Todo en unidades de la fuente (`upm` por em): quien compone multiplica por
 * cuerpo / upm.
 */

/** Un glifo ya formado: su id, lo que avanza (kerning con el siguiente incluido) y el texto que representa. */
export interface Glifo {
  readonly id: number
  readonly avance: number
  /** El texto de este glifo: una letra, o dos o tres si es una ligadura. */
  readonly texto: string
}

/** Un trozo de texto formado con esta fuente. */
export interface Forma {
  readonly glifos: readonly Glifo[]
  /** La suma de los avances, en unidades de la fuente. */
  readonly ancho: number
  /** Los caracteres que esta fuente no tiene: salen como el glifo vacio. */
  readonly faltan: readonly string[]
}

interface Tabla {
  readonly off: number
  readonly len: number
}

/** Una ligadura: si tras el primer glifo vienen `resto`, se sustituyen todos por `glifo`. */
interface Ligadura {
  readonly glifo: number
  readonly resto: readonly number[]
}

export class Fuente {
  readonly bytes: Uint8Array
  readonly upm: number
  readonly ascendente: number
  readonly descendente: number
  readonly alturaMayusculas: number
  readonly alturaX: number
  readonly anguloCursiva: number
  readonly caja: readonly [number, number, number, number]
  readonly fsType: number
  readonly nombre: string
  readonly numGlifos: number
  readonly locaLarga: boolean
  readonly tablas: ReadonlyMap<string, Tabla>

  private readonly dv: DataView
  private readonly nHMetrics: number
  private readonly mapa = new Map<number, number>()
  private readonly pares: ((a: number, b: number) => number | undefined)[] = []
  private readonly ligaduras = new Map<number, Ligadura[]>()
  private readonly cacheKern = new Map<number, number>()
  private readonly contornos = new Map<number, string>()

  constructor(bytes: Uint8Array) {
    // Copia propia: un Buffer de Node comparte memoria, y su slice() no copia
    // (lo encontro el prototipo de la fase 0).
    this.bytes = new Uint8Array(bytes)
    const dv = (this.dv = new DataView(this.bytes.buffer))
    if (this.bytes.length < 12) throw new Error('No es una fuente: demasiado corta.')
    const version = dv.getUint32(0)
    if (version !== 0x00010000 && version !== 0x74727565) {
      throw new Error(version === 0x4f54544f ? 'Es una fuente OpenType con contornos CFF (.otf): de momento solo TrueType.' : 'No es una fuente TrueType.')
    }
    const tablas = new Map<string, Tabla>()
    for (let i = 0, n = dv.getUint16(4); i < n; i++) {
      const o = 12 + i * 16
      tablas.set(String.fromCharCode(...this.bytes.subarray(o, o + 4)), { off: dv.getUint32(o + 8), len: dv.getUint32(o + 12) })
    }
    this.tablas = tablas
    const t = (n: string): Tabla => {
      const x = tablas.get(n)
      if (!x) throw new Error(`A la fuente le falta la tabla ${n}.`)
      return x
    }
    for (const n of ['glyf', 'loca']) t(n)

    const head = t('head').off
    this.upm = dv.getUint16(head + 18)
    this.caja = [dv.getInt16(head + 36), dv.getInt16(head + 38), dv.getInt16(head + 40), dv.getInt16(head + 42)]
    this.locaLarga = dv.getInt16(head + 50) === 1
    const hhea = t('hhea').off
    this.ascendente = dv.getInt16(hhea + 4)
    this.descendente = dv.getInt16(hhea + 6)
    this.nHMetrics = dv.getUint16(hhea + 34)
    this.numGlifos = dv.getUint16(t('maxp').off + 4)
    const os2 = t('OS/2')
    this.fsType = dv.getUint16(os2.off + 8)
    // sxHeight y sCapHeight existen desde la version 2 de OS/2.
    const v2 = dv.getUint16(os2.off) >= 2 && os2.len >= 90
    this.alturaX = v2 ? dv.getInt16(os2.off + 86) : Math.round(this.upm * 0.5)
    this.alturaMayusculas = v2 ? dv.getInt16(os2.off + 88) : Math.round(this.upm * 0.7)
    this.anguloCursiva = tablas.has('post') ? dv.getInt32(t('post').off + 4) / 65536 : 0
    this.nombre = this.nombrePostScript()
    // Sin cmap (un subconjunto incrustado no la lleva) no hay caracteres, pero si glifos.
    if (tablas.has('cmap')) this.leerCmap(t('cmap').off)
    if (tablas.has('GPOS')) this.leerGpos(t('GPOS').off)
    if (tablas.has('GSUB')) this.leerGsub(t('GSUB').off)
  }

  /**
   * Si la licencia de la fuente deja incrustarla en un PDF (OS/2.fsType).
   * 0x0002 sola es «licencia restringida»: no se puede incrustar sin permiso.
   * 0x0200 es «solo mapas de bits»: sin contornos no hay nada que incrustar.
   * 0x0100 prohibe el SUBCONJUNTO: se puede, pero entera.
   */
  incrustable(): { readonly puede: boolean; readonly subconjunto: boolean } {
    const f = this.fsType
    const restringida = (f & 0x000f) === 0x0002
    return { puede: !restringida && (f & 0x0200) === 0, subconjunto: (f & 0x0100) === 0 }
  }

  private nombrePostScript(): string {
    const nt = this.tablas.get('name')
    if (!nt) return 'Fuente'
    const dv = this.dv
    const o = nt.off
    const cadenas = o + dv.getUint16(o + 4)
    for (let i = 0, n = dv.getUint16(o + 2); i < n; i++) {
      const r = o + 6 + i * 12
      if (dv.getUint16(r + 6) !== 6) continue
      const plataforma = dv.getUint16(r)
      const largo = dv.getUint16(r + 8)
      const p = cadenas + dv.getUint16(r + 10)
      let s = ''
      if (plataforma === 3 || plataforma === 0) for (let k = 0; k + 1 < largo; k += 2) s += String.fromCharCode(dv.getUint16(p + k))
      else for (let k = 0; k < largo; k++) s += String.fromCharCode(this.bytes[p + k] as number)
      // Un nombre PostScript es ASCII sin espacios: lo que no, fuera.
      const limpio = s.replace(/[^\x21-\x7e]/gu, '').replace(/[[\](){}<>/%]/gu, '')
      if (limpio) return limpio
    }
    return 'Fuente'
  }

  private leerCmap(o: number): void {
    const dv = this.dv
    let mejor: { formato: number; sub: number } | null = null
    for (let i = 0, n = dv.getUint16(o + 2); i < n; i++) {
      const pid = dv.getUint16(o + 4 + i * 8)
      const eid = dv.getUint16(o + 6 + i * 8)
      const sub = o + dv.getUint32(o + 8 + i * 8)
      const formato = dv.getUint16(sub)
      if (formato === 12 && (pid === 0 || (pid === 3 && eid === 10))) mejor = { formato, sub }
      else if (formato === 4 && !mejor && (pid === 0 || (pid === 3 && eid === 1))) mejor = { formato, sub }
    }
    if (!mejor) throw new Error('La fuente no tiene un mapa de caracteres Unicode.')
    const { formato, sub } = mejor
    if (formato === 12) {
      for (let g = 0, n = dv.getUint32(sub + 12); g < n; g++) {
        const p = sub + 16 + g * 12
        const a = dv.getUint32(p)
        const z = dv.getUint32(p + 4)
        const id = dv.getUint32(p + 8)
        for (let c = a; c <= z; c++) this.mapa.set(c, id + c - a)
      }
      return
    }
    const n = dv.getUint16(sub + 6) / 2
    const fines = sub + 14
    const inicios = fines + n * 2 + 2
    const deltas = inicios + n * 2
    const rangos = deltas + n * 2
    for (let i = 0; i < n; i++) {
      const z = dv.getUint16(fines + i * 2)
      const a = dv.getUint16(inicios + i * 2)
      const d = dv.getInt16(deltas + i * 2)
      const r = dv.getUint16(rangos + i * 2)
      for (let c = a; c <= z && c !== 0xffff; c++) {
        let id = r === 0 ? (c + d) & 0xffff : dv.getUint16(rangos + i * 2 + r + (c - a) * 2)
        if (r !== 0 && id !== 0) id = (id + d) & 0xffff
        if (id) this.mapa.set(c, id)
      }
    }
  }

  private cobertura(o: number): Map<number, number> {
    const dv = this.dv
    const m = new Map<number, number>()
    if (dv.getUint16(o) === 1) {
      for (let i = 0, n = dv.getUint16(o + 2); i < n; i++) m.set(dv.getUint16(o + 4 + i * 2), i)
    } else {
      for (let i = 0, n = dv.getUint16(o + 2); i < n; i++) {
        const p = o + 4 + i * 6
        const a = dv.getUint16(p)
        const z = dv.getUint16(p + 2)
        const k = dv.getUint16(p + 4)
        for (let g = a; g <= z; g++) m.set(g, k + g - a)
      }
    }
    return m
  }

  private clases(o: number): Map<number, number> {
    const dv = this.dv
    const m = new Map<number, number>()
    if (dv.getUint16(o) === 1) {
      const a = dv.getUint16(o + 2)
      for (let i = 0, n = dv.getUint16(o + 4); i < n; i++) m.set(a + i, dv.getUint16(o + 6 + i * 2))
    } else {
      for (let i = 0, n = dv.getUint16(o + 2); i < n; i++) {
        const p = o + 4 + i * 6
        for (let g = dv.getUint16(p), z = dv.getUint16(p + 2); g <= z; g++) m.set(g, dv.getUint16(p + 4))
      }
    }
    return m
  }

  /** Los indices de los lookups de una caracteristica, de cualquier script e idioma. */
  private lookupsDe(o: number, etiqueta: string): number[] {
    const dv = this.dv
    const feat = o + dv.getUint16(o + 6)
    const indices = new Set<number>()
    for (let i = 0, n = dv.getUint16(feat); i < n; i++) {
      const r = feat + 2 + i * 6
      if (String.fromCharCode(...this.bytes.subarray(r, r + 4)) !== etiqueta) continue
      const tabla = feat + dv.getUint16(r + 4)
      for (let k = 0, c = dv.getUint16(tabla + 2); k < c; k++) indices.add(dv.getUint16(tabla + 4 + k * 2))
    }
    return [...indices].sort((a, b) => a - b)
  }

  /** Las subtablas de un lookup, ya resueltas las extensiones. */
  private subtablas(lista: number, indice: number, extension: number): { tipo: number; off: number }[] {
    const dv = this.dv
    const lt = lista + dv.getUint16(lista + 2 + indice * 2)
    const tipo = dv.getUint16(lt)
    const r: { tipo: number; off: number }[] = []
    for (let s = 0, n = dv.getUint16(lt + 4); s < n; s++) {
      const st = lt + dv.getUint16(lt + 6 + s * 2)
      if (tipo === extension) r.push({ tipo: dv.getUint16(st + 2), off: st + dv.getUint32(st + 4) })
      else r.push({ tipo, off: st })
    }
    return r
  }

  private leerGpos(o: number): void {
    const dv = this.dv
    const lista = o + dv.getUint16(o + 8)
    const bits = (v: number): number => {
      let n = 0
      for (let x = v; x; x >>= 1) n += x & 1
      return n
    }
    // El avance horizontal es el tercer campo del ValueRecord (tras XPlacement e YPlacement).
    const avanceX = (formato: number, p: number): number => (formato & 4 ? dv.getInt16(p + bits(formato & 3) * 2) : 0)
    for (const li of this.lookupsDe(o, 'kern')) {
      for (const { tipo, off: st } of this.subtablas(lista, li, 9)) {
        if (tipo !== 2) continue
        const formato = dv.getUint16(st)
        const cob = this.cobertura(st + dv.getUint16(st + 2))
        const v1 = dv.getUint16(st + 4)
        const v2 = dv.getUint16(st + 6)
        const tam = (bits(v1) + bits(v2)) * 2
        if (formato === 1) {
          const conjuntos: Map<number, number>[] = []
          for (let i = 0, c = dv.getUint16(st + 8); i < c; i++) {
            const ps = st + dv.getUint16(st + 10 + i * 2)
            const m = new Map<number, number>()
            for (let k = 0, pc = dv.getUint16(ps); k < pc; k++) {
              const p = ps + 2 + k * (2 + tam)
              m.set(dv.getUint16(p), avanceX(v1, p + 2))
            }
            conjuntos.push(m)
          }
          this.pares.push((a, b) => {
            const i = cob.get(a)
            return i === undefined ? undefined : conjuntos[i]?.get(b)
          })
        } else if (formato === 2) {
          const c1 = this.clases(st + dv.getUint16(st + 8))
          const c2 = this.clases(st + dv.getUint16(st + 10))
          const n2 = dv.getUint16(st + 14)
          const base = st + 16
          this.pares.push((a, b) => (cob.has(a) ? avanceX(v1, base + ((c1.get(a) ?? 0) * n2 + (c2.get(b) ?? 0)) * tam) : undefined))
        }
      }
    }
  }

  private leerGsub(o: number): void {
    const dv = this.dv
    const lista = o + dv.getUint16(o + 8)
    for (const li of this.lookupsDe(o, 'liga')) {
      for (const { tipo, off: st } of this.subtablas(lista, li, 7)) {
        if (tipo !== 4 || dv.getUint16(st) !== 1) continue
        const cob = this.cobertura(st + dv.getUint16(st + 2))
        for (const [primero, i] of cob) {
          const conjunto = st + dv.getUint16(st + 6 + i * 2)
          const lista2 = this.ligaduras.get(primero) ?? []
          for (let k = 0, n = dv.getUint16(conjunto); k < n; k++) {
            const l = conjunto + dv.getUint16(conjunto + 2 + k * 2)
            const componentes = dv.getUint16(l + 2)
            const resto: number[] = []
            for (let c = 1; c < componentes; c++) resto.push(dv.getUint16(l + 4 + (c - 1) * 2))
            lista2.push({ glifo: dv.getUint16(l), resto })
          }
          // Las mas largas primero: «ffi» antes que «ff».
          lista2.sort((a, b) => b.resto.length - a.resto.length)
          this.ligaduras.set(primero, lista2)
        }
      }
    }
  }

  /** El glifo de un caracter (0, el vacio, si no lo tiene). */
  glifo(punto: number): number {
    return this.mapa.get(punto) ?? 0
  }

  tiene(punto: number): boolean {
    return this.mapa.has(punto)
  }

  avance(glifo: number): number {
    const i = Math.min(glifo, this.nHMetrics - 1)
    return this.dv.getUint16((this.tablas.get('hmtx') as Tabla).off + i * 4)
  }

  /** El kerning entre dos glifos, en unidades de la fuente. */
  kern(a: number, b: number): number {
    const clave = a * 65536 + b
    const ya = this.cacheKern.get(clave)
    if (ya !== undefined) return ya
    let v = 0
    for (const f of this.pares) {
      const x = f(a, b)
      if (x !== undefined) {
        v = x
        break
      }
    }
    this.cacheKern.set(clave, v)
    return v
  }

  /**
   * Forma un texto: caracteres a glifos, ligaduras y kerning. El avance de
   * cada glifo lleva ya el kerning con el siguiente; `siguiente` es el primer
   * glifo de lo que viene despues, si se sabe, para el kerning de la junta.
   */
  formar(texto: string, siguiente?: number): Forma {
    const puntos = [...texto]
    const faltan: string[] = []
    let ids: { id: number; texto: string }[] = puntos.map((c) => {
      const cp = c.codePointAt(0) as number
      const id = this.glifo(cp)
      if (id === 0 && !faltan.includes(c)) faltan.push(c)
      return { id, texto: c }
    })
    // Ligaduras: de izquierda a derecha, la mas larga que encaje.
    if (this.ligaduras.size > 0) {
      const r: { id: number; texto: string }[] = []
      for (let i = 0; i < ids.length; ) {
        const g = ids[i] as { id: number; texto: string }
        const candidatas = this.ligaduras.get(g.id)
        const l = candidatas?.find((x) => x.resto.every((c, k) => ids[i + 1 + k]?.id === c))
        if (l) {
          r.push({ id: l.glifo, texto: ids.slice(i, i + 1 + l.resto.length).map((x) => x.texto).join('') })
          i += 1 + l.resto.length
        } else {
          r.push(g)
          i += 1
        }
      }
      ids = r
    }
    let ancho = 0
    const glifos = ids.map((g, i) => {
      const otro = ids[i + 1]?.id ?? siguiente
      const avance = this.avance(g.id) + (otro !== undefined ? this.kern(g.id, otro) : 0)
      ancho += avance
      return { id: g.id, avance, texto: g.texto }
    })
    return { glifos, ancho, faltan }
  }

  /**
   * El contorno de un glifo como trazado SVG (`M`, `L`, `Q`, `Z`), en
   * unidades de la fuente y con la y hacia ARRIBA, como en la fuente. Con el
   * pinta la vista previa de la app los mismos glifos que lleva el PDF: lo que
   * se ve es lo que se imprime, sin depender de que el navegador cargue la
   * letra. Vacio para un glifo sin contornos (el espacio).
   */
  contorno(g: number): string {
    let c = this.contornos.get(g)
    if (c === undefined) {
      c = trazado(this.puntos(g, 0))
      this.contornos.set(g, c)
    }
    return c
  }

  /** Los contornos de un glifo; los de un compuesto, con cada pieza ya movida y escalada. */
  private puntos(g: number, profundidad: number): Punto[][] {
    const loca = this.tablas.get('loca')
    const glyf = this.tablas.get('glyf')
    if (!loca || !glyf || profundidad > 8 || g < 0 || g >= this.numGlifos) return []
    const dv = this.dv
    const pos = (i: number): number => (this.locaLarga ? dv.getUint32(loca.off + i * 4) : dv.getUint16(loca.off + i * 2) * 2)
    const a = glyf.off + pos(g)
    if (glyf.off + pos(g + 1) <= a) return []
    const n = dv.getInt16(a)
    if (n >= 0) return this.simple(a, n)
    const r: Punto[][] = []
    const f2 = (o: number): number => dv.getInt16(o) / 16384
    let p = a + 10
    for (;;) {
      const banderas = dv.getUint16(p)
      const pieza = dv.getUint16(p + 2)
      p += 4
      let dx = 0
      let dy = 0
      // ARGS_ARE_XY_VALUES: un desplazamiento. Sin ella son puntos que casar (raro): se dejan en su sitio.
      const xy = (banderas & 0x0002) !== 0
      if (banderas & 0x0001) {
        if (xy) [dx, dy] = [dv.getInt16(p), dv.getInt16(p + 2)]
        p += 4
      } else {
        if (xy) [dx, dy] = [dv.getInt8(p), dv.getInt8(p + 1)]
        p += 2
      }
      let [xx, yx, xy2, yy] = [1, 0, 0, 1]
      if (banderas & 0x0008) {
        xx = yy = f2(p)
        p += 2
      } else if (banderas & 0x0040) {
        ;[xx, yy] = [f2(p), f2(p + 2)]
        p += 4
      } else if (banderas & 0x0080) {
        ;[xx, yx, xy2, yy] = [f2(p), f2(p + 2), f2(p + 4), f2(p + 6)]
        p += 8
      }
      for (const contorno of this.puntos(pieza, profundidad + 1)) {
        r.push(contorno.map((q) => ({ x: xx * q.x + xy2 * q.y + dx, y: yx * q.x + yy * q.y + dy, sobre: q.sobre })))
      }
      if (!(banderas & 0x0020)) break
    }
    return r
  }

  /** Un glifo simple: sus puntos con las banderas, las x y las y en deltas. */
  private simple(a: number, n: number): Punto[][] {
    const dv = this.dv
    const fines: number[] = []
    for (let i = 0; i < n; i++) fines.push(dv.getUint16(a + 10 + i * 2))
    const total = n > 0 ? (fines[n - 1] as number) + 1 : 0
    let p = a + 10 + n * 2
    p += 2 + dv.getUint16(p)
    const banderas: number[] = []
    while (banderas.length < total) {
      const f = dv.getUint8(p++)
      banderas.push(f)
      if (f & 0x08) for (let rep = dv.getUint8(p++); rep > 0; rep--) banderas.push(f)
    }
    const coordenadas = (corta: number, misma: number): number[] => {
      const r: number[] = []
      let v = 0
      for (const f of banderas) {
        if (f & corta) {
          const d = dv.getUint8(p++)
          v += f & misma ? d : -d
        } else if (!(f & misma)) {
          v += dv.getInt16(p)
          p += 2
        }
        r.push(v)
      }
      return r
    }
    const xs = coordenadas(0x02, 0x10)
    const ys = coordenadas(0x04, 0x20)
    const r: Punto[][] = []
    let desde = 0
    for (const fin of fines) {
      const c: Punto[] = []
      for (let i = desde; i <= fin; i++) c.push({ x: xs[i] as number, y: ys[i] as number, sobre: ((banderas[i] as number) & 0x01) !== 0 })
      r.push(c)
      desde = fin + 1
    }
    return r
  }
}

interface Punto {
  readonly x: number
  readonly y: number
  /** Sobre la curva; si no, es el punto de control de una cuadratica. */
  readonly sobre: boolean
}

const n2 = (v: number): string => String(Math.round(v * 100) / 100)

/**
 * Los contornos de TrueType a trazado SVG. Dos puntos de control seguidos
 * llevan entre medias un punto sobre la curva que no se escribe (el punto
 * medio); un contorno puede empezar fuera de la curva.
 */
function trazado(contornos: readonly Punto[][]): string {
  let d = ''
  for (const c of contornos) {
    if (c.length === 0) continue
    const i0 = c.findIndex((q) => q.sobre)
    const medio = (a: Punto, b: Punto): Punto => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, sobre: true })
    // Se empieza en un punto sobre la curva; si no hay ninguno, en el medio de los dos primeros.
    const pts = i0 >= 0 ? [...c.slice(i0), ...c.slice(0, i0)] : c
    const inicio = i0 >= 0 ? (pts[0] as Punto) : medio(c[0] as Punto, (c[1] ?? c[0]) as Punto)
    d += `M${n2(inicio.x)} ${n2(inicio.y)}`
    let control: Punto | null = null
    // Sin puntos sobre la curva se arranca en el medio del 0 y el 1: los
    // controles van del 1 en adelante, y el 0 cierra la vuelta.
    const resto = i0 >= 0 ? pts.slice(1) : [...c.slice(1), c[0] as Punto]
    for (const q of [...resto, inicio]) {
      if (q.sobre) {
        d += control ? `Q${n2(control.x)} ${n2(control.y)} ${n2(q.x)} ${n2(q.y)}` : `L${n2(q.x)} ${n2(q.y)}`
        control = null
      } else {
        if (control) {
          const m = medio(control, q)
          d += `Q${n2(control.x)} ${n2(control.y)} ${n2(m.x)} ${n2(m.y)}`
        }
        control = q
      }
    }
    d += 'Z'
  }
  return d
}
