/**
 * Leer un PDF de los que escribe Pubteca, para comprobarlo: el golden del
 * interior, la lista de PDF/X-1a y el script de CI.
 *
 * No es un lector de PDF general: entiende la sintaxis que escribe
 * `src/core/impreso/pdf.ts` (objetos sin comprimir, una tabla xref clasica) y
 * se queja de todo lo demas. Pero lo comprueba de verdad: que cada entrada de
 * la xref apunte a su objeto, que cada /Length sea el del flujo, y que cada
 * flujo comprimido sea zlib valido (la trampa del FlateDecode crudo).
 */
import { createHash } from 'node:crypto'
import { unzlibSync } from 'fflate'

export type Valor =
  | { readonly t: 'nombre'; readonly v: string }
  | { readonly t: 'numero'; readonly v: number }
  | { readonly t: 'cadena'; readonly v: Uint8Array; readonly hex: boolean }
  | { readonly t: 'ref'; readonly v: number }
  | { readonly t: 'bool'; readonly v: boolean }
  | { readonly t: 'nulo' }
  | { readonly t: 'lista'; readonly v: readonly Valor[] }
  | { readonly t: 'dic'; readonly v: ReadonlyMap<string, Valor> }

export interface Objeto {
  readonly n: number
  readonly dic: Valor
  /** Los bytes del flujo, ya descomprimidos (si es un flujo). */
  readonly flujo?: Uint8Array
  /** Los bytes del flujo tal cual estan en el archivo. */
  readonly crudo?: Uint8Array
}

export interface PdfLeido {
  readonly version: string
  readonly objetos: ReadonlyMap<number, Objeto>
  readonly trailer: ReadonlyMap<string, Valor>
}

const BLANCO = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20])
const DELIM = new Set([...'()<>[]{}/%'].map((c) => c.charCodeAt(0)))

class Lector {
  readonly b: Uint8Array
  p: number
  constructor(b: Uint8Array, p = 0) {
    this.b = b
    this.p = p
  }
  saltar(): void {
    while (this.p < this.b.length) {
      const c = this.b[this.p] as number
      if (BLANCO.has(c)) this.p++
      else if (c === 0x25) while (this.p < this.b.length && this.b[this.p] !== 0x0a) this.p++
      else break
    }
  }
  palabra(): string {
    const ini = this.p
    while (this.p < this.b.length && !BLANCO.has(this.b[this.p] as number) && !DELIM.has(this.b[this.p] as number)) this.p++
    return String.fromCharCode(...this.b.subarray(ini, this.p))
  }
  mira(s: string): boolean {
    for (let i = 0; i < s.length; i++) if (this.b[this.p + i] !== s.charCodeAt(i)) return false
    return true
  }
  valor(): Valor {
    this.saltar()
    const c = String.fromCharCode(this.b[this.p] as number)
    if (this.mira('<<')) {
      this.p += 2
      const m = new Map<string, Valor>()
      for (;;) {
        this.saltar()
        if (this.mira('>>')) {
          this.p += 2
          return { t: 'dic', v: m }
        }
        const k = this.valor()
        if (k.t !== 'nombre') throw new Error(`Clave de diccionario que no es un nombre en ${this.p}`)
        m.set(k.v, this.valor())
      }
    }
    if (c === '[') {
      this.p++
      const l: Valor[] = []
      for (;;) {
        this.saltar()
        if (this.mira(']')) {
          this.p++
          return { t: 'lista', v: l }
        }
        l.push(this.valor())
      }
    }
    if (c === '/') {
      this.p++
      return { t: 'nombre', v: this.palabra().replace(/#([0-9A-Fa-f]{2})/gu, (_m, h: string) => String.fromCharCode(parseInt(h, 16))) }
    }
    if (c === '(') {
      this.p++
      const r: number[] = []
      let nivel = 1
      for (;;) {
        const x = this.b[this.p++] as number
        if (x === 0x5c) {
          const e = this.b[this.p++] as number
          const tabla: Record<number, number> = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12 }
          r.push(tabla[e] ?? e)
        } else if (x === 0x28) {
          nivel++
          r.push(x)
        } else if (x === 0x29) {
          if (--nivel === 0) break
          r.push(x)
        } else r.push(x)
      }
      return { t: 'cadena', v: new Uint8Array(r), hex: false }
    }
    if (c === '<') {
      this.p++
      const ini = this.p
      while (this.b[this.p] !== 0x3e) this.p++
      const h = String.fromCharCode(...this.b.subarray(ini, this.p)).replace(/\s/gu, '')
      this.p++
      const r = new Uint8Array(h.length / 2)
      for (let i = 0; i < r.length; i++) r[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
      return { t: 'cadena', v: r, hex: true }
    }
    const w = this.palabra()
    if (w === 'true' || w === 'false') return { t: 'bool', v: w === 'true' }
    if (w === 'null') return { t: 'nulo' }
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/u.test(w)) throw new Error(`Valor no esperado «${w}» en ${this.p}`)
    // ¿Es una referencia «n 0 R»?
    const guardado = this.p
    this.saltar()
    const g = this.palabra()
    this.saltar()
    if (/^\d+$/u.test(w) && g === '0' && this.mira('R')) {
      this.p++
      return { t: 'ref', v: Number(w) }
    }
    this.p = guardado
    return { t: 'numero', v: Number(w) }
  }
}

export function leerPdf(b: Uint8Array): PdfLeido {
  const cabecera = String.fromCharCode(...b.subarray(0, 9))
  const m = /^%PDF-(\d\.\d)/u.exec(cabecera)
  if (!m) throw new Error('No empieza por %PDF-')
  const texto = String.fromCharCode(...b.subarray(Math.max(0, b.length - 64)))
  const sx = /startxref\s+(\d+)\s+%%EOF\s*$/u.exec(texto)
  if (!sx) throw new Error('Sin startxref al final')
  const lx = new Lector(b, Number(sx[1]))
  if (lx.palabra() !== 'xref') throw new Error('startxref no apunta a la tabla xref')
  lx.saltar()
  const primero = Number(lx.palabra())
  lx.saltar()
  const cuantos = Number(lx.palabra())
  if (primero !== 0) throw new Error('La xref no empieza en el objeto 0')
  const posiciones: number[] = []
  for (let i = 0; i < cuantos; i++) {
    lx.saltar()
    const ini = lx.p
    const linea = String.fromCharCode(...b.subarray(ini, ini + 20))
    if (!/^\d{10} \d{5} [nf] \n$/u.test(linea)) throw new Error(`Entrada de xref de mas de 20 bytes o mal formada: «${linea}»`)
    posiciones.push(Number(linea.slice(0, 10)))
    lx.p = ini + 20
  }
  lx.saltar()
  if (lx.palabra() !== 'trailer') throw new Error('Sin trailer')
  const trailer = lx.valor()
  if (trailer.t !== 'dic') throw new Error('El trailer no es un diccionario')

  const objetos = new Map<number, Objeto>()
  for (let n = 1; n < cuantos; n++) {
    const l = new Lector(b, posiciones[n] as number)
    const cab = `${n} 0 obj`
    if (!l.mira(cab)) throw new Error(`La xref del objeto ${n} apunta a otra cosa (${posiciones[n]})`)
    l.p += cab.length
    const dic = l.valor()
    l.saltar()
    let flujo: Uint8Array | undefined
    let crudo: Uint8Array | undefined
    if (l.mira('stream')) {
      l.p += 'stream'.length
      if (b[l.p] === 0x0d) l.p++
      if (b[l.p] !== 0x0a) throw new Error(`Objeto ${n}: «stream» sin salto de linea`)
      l.p++
      if (dic.t !== 'dic') throw new Error(`Objeto ${n}: flujo sin diccionario`)
      const largo = dic.v.get('Length')
      if (largo?.t !== 'numero') throw new Error(`Objeto ${n}: flujo sin /Length directo`)
      crudo = b.subarray(l.p, l.p + largo.v)
      l.p += largo.v
      l.saltar()
      if (!l.mira('endstream')) throw new Error(`Objeto ${n}: el /Length no acaba en endstream`)
      l.p += 'endstream'.length
      const filtro = dic.v.get('Filter')
      flujo = filtro?.t === 'nombre' && filtro.v === 'FlateDecode' ? unzlibSync(crudo) : crudo
    }
    l.saltar()
    if (!l.mira('endobj')) throw new Error(`Objeto ${n} sin endobj`)
    objetos.set(n, { n, dic, flujo, crudo })
  }
  return { version: m[1] as string, objetos, trailer: trailer.v }
}

// ---------------------------------------------------------------------------
// Recorrer
// ---------------------------------------------------------------------------

export function dic(v: Valor | undefined): ReadonlyMap<string, Valor> {
  if (v?.t !== 'dic') throw new Error('Se esperaba un diccionario')
  return v.v
}

export function lista(v: Valor | undefined): readonly Valor[] {
  if (v?.t !== 'lista') throw new Error('Se esperaba una lista')
  return v.v
}

export function numero(v: Valor | undefined): number {
  if (v?.t !== 'numero') throw new Error('Se esperaba un numero')
  return v.v
}

export function nombreDe(v: Valor | undefined): string {
  if (v?.t !== 'nombre') throw new Error('Se esperaba un nombre')
  return v.v
}

export function resolver(pdf: PdfLeido, v: Valor | undefined): Valor | undefined {
  return v?.t === 'ref' ? pdf.objetos.get(v.v)?.dic : v
}

export function texto(v: Valor | undefined): string {
  if (v?.t !== 'cadena') return ''
  const b = v.v
  if (b[0] === 0xfe && b[1] === 0xff) {
    let s = ''
    for (let i = 2; i + 1 < b.length; i += 2) s += String.fromCharCode(((b[i] as number) << 8) | (b[i + 1] as number))
    return s
  }
  return String.fromCharCode(...b)
}

export function paginas(pdf: PdfLeido): ReadonlyMap<string, Valor>[] {
  const raiz = dic(resolver(pdf, pdf.trailer.get('Root')))
  const r: ReadonlyMap<string, Valor>[] = []
  const recorrer = (v: Valor | undefined): void => {
    const d = dic(resolver(pdf, v))
    const tipo = d.get('Type')
    if (tipo?.t === 'nombre' && tipo.v === 'Page') r.push(d)
    else for (const k of (d.get('Kids') as { v: readonly Valor[] }).v) recorrer(k)
  }
  recorrer(raiz.get('Pages'))
  return r
}

// ---------------------------------------------------------------------------
// El volcado para el golden: estructura y contenido descomprimido
// ---------------------------------------------------------------------------

function escribirValor(v: Valor): string {
  switch (v.t) {
    case 'nombre':
      return `/${v.v}`
    case 'numero':
      return String(v.v)
    case 'cadena':
      return v.v.every((c) => c >= 0x20 && c < 0x7f) && !v.hex ? `(${String.fromCharCode(...v.v)})` : `<${[...v.v].map((c) => c.toString(16).padStart(2, '0')).join('')}>`
    case 'ref':
      return `${v.v} 0 R`
    case 'bool':
      return String(v.v)
    case 'nulo':
      return 'null'
    case 'lista':
      return `[${v.v.map(escribirValor).join(' ')}]`
    case 'dic':
      return `<< ${[...v.v].map(([k, x]) => `/${k} ${escribirValor(x)}`).join(' ')} >>`
  }
}

/**
 * El PDF en texto, objeto a objeto. Sin lo que depende del compresor (el
 * /Length de cada flujo, el /ID): dos compresores que den bytes distintos
 * para el mismo contenido dan el mismo volcado. Los flujos de texto (las
 * paginas, la ToUnicode) salen enteros; los binarios (fuentes, imagenes), su
 * tamaño y su sha256.
 */
export function volcar(pdf: PdfLeido): string {
  const l: string[] = [`%PDF-${pdf.version}`]
  for (const [n, o] of pdf.objetos) {
    const d = o.dic.t === 'dic' ? new Map([...o.dic.v].filter(([k]) => k !== 'Length')) : null
    l.push(`${n} 0 obj ${d ? escribirValor({ t: 'dic', v: d }) : escribirValor(o.dic)}`)
    if (o.flujo) {
      const esTexto = o.flujo.every((c) => c === 0x0a || (c >= 0x20 && c < 0x7f))
      if (esTexto) l.push(...String.fromCharCode(...o.flujo).replace(/\n$/u, '').split('\n').map((x) => `  ${x}`))
      else l.push(`  [${o.flujo.length} bytes, sha256 ${createHash('sha256').update(o.flujo).digest('hex')}]`)
    }
  }
  const t = new Map([...pdf.trailer].filter(([k]) => k !== 'ID'))
  l.push(`trailer ${escribirValor({ t: 'dic', v: t })}`)
  return l.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Nuestra lista de PDF/X-1a
// ---------------------------------------------------------------------------

/**
 * Lo que comprobamos de PDF/X-1a:2001 (ISO 15930-1). No es un validador
 * certificado (no hay uno libre: ver plan.md); es la lista de lo que puede
 * fallar en lo que escribimos. Devuelve los fallos; vacio es que pasa.
 */
export function comprobarPdfx(pdf: PdfLeido): string[] {
  const fallos: string[] = []
  const nombreDe = (v: Valor | undefined): string | null => (v?.t === 'nombre' ? v.v : null)
  if (pdf.version !== '1.3') fallos.push(`version ${pdf.version}: PDF/X-1a:2001 pide 1.3`)
  if (pdf.trailer.has('Encrypt')) fallos.push('cifrado')
  const id = pdf.trailer.get('ID')
  if (id?.t !== 'lista' || id.v.length !== 2) fallos.push('sin /ID en el trailer')

  const info = dic(resolver(pdf, pdf.trailer.get('Info')))
  for (const k of ['Title', 'CreationDate', 'ModDate']) if (!texto(info.get(k))) fallos.push(`Info sin /${k}`)
  const trapped = nombreDe(info.get('Trapped'))
  if (trapped !== 'True' && trapped !== 'False') fallos.push('Info sin /Trapped True o False')
  if (texto(info.get('GTS_PDFXVersion')) !== 'PDF/X-1:2001') fallos.push('Info sin /GTS_PDFXVersion (PDF/X-1:2001)')
  if (texto(info.get('GTS_PDFXConformance')) !== 'PDF/X-1a:2001') fallos.push('Info sin /GTS_PDFXConformance (PDF/X-1a:2001)')

  const raiz = dic(resolver(pdf, pdf.trailer.get('Root')))
  const intentos = resolver(pdf, raiz.get('OutputIntents'))
  const intento = intentos?.t === 'lista' && intentos.v.length === 1 ? dic(resolver(pdf, intentos.v[0])) : null
  if (!intento) fallos.push('sin un OutputIntent')
  else {
    if (nombreDe(intento.get('S')) !== 'GTS_PDFX') fallos.push('OutputIntent sin /S /GTS_PDFX')
    if (!texto(intento.get('OutputConditionIdentifier'))) fallos.push('OutputIntent sin OutputConditionIdentifier')
    if (!intento.has('DestOutputProfile') && texto(intento.get('RegistryName')) !== 'http://www.color.org') {
      fallos.push('OutputIntent sin perfil y sin condicion registrada')
    }
  }
  for (const k of ['AcroForm', 'OpenAction', 'AA', 'Names']) if (raiz.has(k)) fallos.push(`catalogo con /${k}`)

  const caja = (v: Valor | undefined): number[] | null => (v?.t === 'lista' ? v.v.map((x) => (x.t === 'numero' ? x.v : NaN)) : null)
  const dentro = (a: number[], b: number[]): boolean => a[0]! >= b[0]! - 1e-6 && a[1]! >= b[1]! - 1e-6 && a[2]! <= b[2]! + 1e-6 && a[3]! <= b[3]! + 1e-6
  paginas(pdf).forEach((p, i) => {
    const media = caja(p.get('MediaBox'))
    const trim = caja(p.get('TrimBox'))
    const bleed = caja(p.get('BleedBox')) ?? media
    if (!media) fallos.push(`pagina ${i + 1} sin MediaBox`)
    if (!trim) fallos.push(`pagina ${i + 1} sin TrimBox`)
    if (media && trim && bleed && !(dentro(trim, bleed) && dentro(bleed, media))) fallos.push(`pagina ${i + 1}: TrimBox fuera de BleedBox o de MediaBox`)
    if (p.has('Annots')) fallos.push(`pagina ${i + 1} con anotaciones`)
    if (p.has('Group')) fallos.push(`pagina ${i + 1} con grupo de transparencia`)
  })

  for (const o of pdf.objetos.values()) {
    if (o.dic.t !== 'dic') continue
    const d = o.dic.v
    const tipo = nombreDe(d.get('Type'))
    const sub = nombreDe(d.get('Subtype'))
    // Transparencia, de cualquier forma.
    if (d.has('SMask') || d.has('SMaskInData')) fallos.push(`objeto ${o.n} con mascara suave`)
    for (const k of ['CA', 'ca']) {
      const a = d.get(k)
      if (a?.t === 'numero' && a.v !== 1) fallos.push(`objeto ${o.n} con /${k} ${a.v}`)
    }
    const bm = nombreDe(d.get('BM'))
    if (bm && bm !== 'Normal' && bm !== 'Compatible') fallos.push(`objeto ${o.n} con fusion /${bm}`)
    if (sub === 'Image') {
      const cs = nombreDe(d.get('ColorSpace'))
      if (cs !== 'DeviceGray' && cs !== 'DeviceCMYK') fallos.push(`imagen ${o.n} en ${cs ?? 'un espacio de color no permitido'}`)
      if (nombreDe(d.get('Filter')) === 'JPXDecode') fallos.push(`imagen ${o.n} en JPEG 2000`)
    }
    if (tipo === 'Font' && (sub === 'TrueType' || sub === 'Type1' || sub === 'CIDFontType2' || sub === 'CIDFontType0')) {
      const desc = dic(resolver(pdf, d.get('FontDescriptor')))
      if (!desc.has('FontFile') && !desc.has('FontFile2') && !desc.has('FontFile3')) fallos.push(`fuente ${o.n} sin incrustar`)
    }
    if (nombreDe(d.get('S')) === 'JavaScript' || d.has('JS')) fallos.push(`objeto ${o.n} con JavaScript`)
  }

  // Color en las paginas: solo gris (g, G) o CMYK (k, K).
  for (const p of paginas(pdf)) {
    const c = pdf.objetos.get((p.get('Contents') as { v: number }).v)
    const s = c?.flujo ? String.fromCharCode(...c.flujo) : ''
    const sin = s.replace(/\[[^\]]*\]\s*TJ/gu, '').replace(/<[0-9A-F]*>/gu, '')
    for (const op of ['rg', 'RG', 'sc', 'SC', 'scn', 'SCN', 'cs', 'CS', 'gs', 'sh']) {
      if (new RegExp(`(^|\\s)${op}(\\s|$)`, 'u').test(sin)) fallos.push(`pagina con el operador ${op}`)
    }
  }
  return [...new Set(fallos)]
}

// ---------------------------------------------------------------------------
// Lo que pinta cada pagina (lo usan los tests del PDF y del plan)
// ---------------------------------------------------------------------------

/** Los bytes de un objeto por su referencia. */
export function objeto(p: PdfLeido, v: Valor | undefined): { dic: ReadonlyMap<string, Valor>; flujo?: Uint8Array } {
  if (v?.t !== 'ref') throw new Error('se esperaba una referencia')
  const o = p.objetos.get(v.v)
  if (!o) throw new Error(`no existe el objeto ${v.v}`)
  return { dic: dic(o.dic), flujo: o.flujo }
}

/** Las fuentes del PDF: su nombre de recurso, su Type0, su CIDFont, su programa y su ToUnicode. */
export function fuentesDelPdf(p: PdfLeido) {
  const recursos = dic(resolver(p, paginas(p)[0]?.get('Resources')))
  const r: { recurso: string; base: string; programa: Uint8Array; anchos: Map<number, number>; aUnicode: Map<number, string> }[] = []
  for (const [recurso, ref] of dic(recursos.get('Font'))) {
    const t0 = objeto(p, ref).dic
    const cid = dic(resolver(p, lista(t0.get('DescendantFonts'))[0]))
    const desc = dic(resolver(p, cid.get('FontDescriptor')))
    const programa = objeto(p, desc.get('FontFile2')).flujo as Uint8Array
    const anchos = new Map<number, number>()
    const w = lista(cid.get('W'))
    for (let i = 0; i < w.length; i += 2) {
      const primero = numero(w[i])
      lista(w[i + 1]).forEach((x, k) => anchos.set(primero + k, numero(x)))
    }
    const cmap = String.fromCharCode(...(objeto(p, t0.get('ToUnicode')).flujo as Uint8Array))
    const aUnicode = new Map<number, string>()
    for (const m of cmap.matchAll(/<([0-9A-F]{4})> <([0-9A-F]+)>/gu)) {
      const u = m[2] as string
      let s = ''
      for (let i = 0; i < u.length; i += 4) s += String.fromCharCode(parseInt(u.slice(i, i + 4), 16))
      aUnicode.set(parseInt(m[1] as string, 16), s)
    }
    r.push({ recurso, base: nombreDe(t0.get('BaseFont')), programa, anchos, aUnicode })
  }
  return r
}

/**
 * Lo que pinta cada pagina: cada Tm con su texto (por la ToUnicode) y cuanto
 * avanza (por /W y TJ), y cuantas imagenes dibuja (`Do`).
 */
export function textosPintados(p: PdfLeido) {
  const fs = new Map(fuentesDelPdf(p).map((f) => [f.recurso, f]))
  return paginas(p).map((pag) => {
    const s = String.fromCharCode(...(objeto(p, pag.get('Contents')).flujo as Uint8Array))
    const r: { x: number; y: number; texto: string; avance: number }[] = []
    let fuente = ''
    let cuerpo = 0
    let x = 0
    let y = 0
    for (const linea of s.split('\n')) {
      let m = /^\/(\S+) (\S+) Tf$/u.exec(linea)
      if (m) {
        fuente = m[1] as string
        cuerpo = Number(m[2])
        continue
      }
      // La matriz del texto: de ella, el origen (x, y). La cubierta gira el del lomo.
      m = /^\S+ \S+ \S+ \S+ (\S+) (\S+) Tm$/u.exec(linea)
      if (m) {
        x = Number(m[1])
        y = Number(m[2])
        continue
      }
      m = /^\[(.*)\] TJ$/u.exec(linea)
      if (!m) continue
      const f = fs.get(fuente)
      if (!f) throw new Error(`fuente ${fuente} sin definir`)
      let t = ''
      let avance = 0
      for (const trozo of (m[1] as string).matchAll(/<([0-9A-F]*)>|(-?[\d.]+)/gu)) {
        if (trozo[2] !== undefined) {
          avance -= (Number(trozo[2]) / 1000) * cuerpo
          continue
        }
        const h = trozo[1] as string
        for (let i = 0; i < h.length; i += 4) {
          const g = parseInt(h.slice(i, i + 4), 16)
          t += f.aUnicode.get(g) ?? ''
          avance += ((f.anchos.get(g) ?? NaN) / 1000) * cuerpo
        }
      }
      r.push({ x, y, texto: t, avance })
    }
    return Object.assign(r, { imagenes: (s.match(/ Do\b/gu) ?? []).length })
  })
}
