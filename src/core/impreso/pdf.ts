/**
 * Escribir el PDF del interior: PDF/X-1a:2001, que es lo que piden KDP e
 * IngramSpark para imprimir.
 *
 * Recibe las paginas que compone `paginar.ts` (listas de operaciones) y las
 * pinta tal cual: el PDF no decide nada de la composicion. Lo que si decide:
 *
 *   - PDF 1.3, sin transparencias, sin anotaciones, sin cifrado y solo en
 *     gris (el texto en `0 g`, las imagenes en DeviceGray);
 *   - las fuentes incrustadas en subconjunto (Type0 + CIDFontType2 con
 *     Identity-H), con su ToUnicode para que el texto se pueda copiar y
 *     buscar; el prefijo de seis mayusculas sale de un hash de los glifos;
 *   - las cajas: MediaBox y BleedBox con el sangrado, TrimBox en el corte;
 *   - el OutputIntent por nombre de una condicion registrada, sin incrustar el
 *     perfil (PDF/X-1a lo permite para las del registro de ICC);
 *   - Trapped, GTS_PDFXVersion y las fechas en el Info.
 *
 * DETERMINISTA: el reloj se inyecta, el /ID es un hash del contenido y la
 * compresion de fflate da siempre los mismos bytes. Dos generaciones con la
 * misma fecha coinciden byte a byte.
 *
 * TRAMPA: `FlateDecode` es zlib (cabecera y adler32), no DEFLATE crudo. El
 * `deflateSync` de fflate es crudo; aqui va `zlibSync`.
 */
import { zlibSync } from 'fflate'
import { sha1 } from '../identificador'
import type { Fuente, Glifo } from './sfnt'
import { subconjunto } from './subconjunto'
import type { Cara, Fuentes, PaginaCompuesta } from './tipos'

/** Una imagen ya preparada por la app: un byte de gris por pixel, de arriba abajo. */
export interface ImagenGris {
  readonly ancho: number
  readonly alto: number
  readonly pixeles: Uint8Array
}

/**
 * El sangrado de cada lado, en puntos. En el interior de KDP con sangrado va
 * por fuera, arriba y abajo, nunca por el lomo: el interior a 0.
 */
export interface Sangrado {
  readonly interior: number
  readonly exterior: number
  readonly superior: number
  readonly inferior: number
}

/** Condiciones de impresion del registro de ICC (se nombran, no se incrusta su perfil). */
export const CONDICIONES = {
  'CGATS TR 001': 'U.S. Web Coated (SWOP) v2',
  FOGRA39: 'Coated FOGRA39 (ISO 12647-2:2004)',
} as const

export type CondicionSalida = keyof typeof CONDICIONES

export interface OpcionesPdf {
  /** El tamaño de corte, en puntos. */
  readonly ancho: number
  readonly alto: number
  readonly sangrado?: Sangrado
  readonly fuentes: Fuentes
  readonly imagenes?: (id: string) => ImagenGris | null
  readonly titulo: string
  readonly autor: string
  /** El reloj, inyectado: el core no lo lee. */
  readonly fecha: Date
  readonly condicion?: CondicionSalida
}

const CARAS: readonly Cara[] = ['regular', 'cursiva', 'negrita', 'negritaCursiva']
const SIN_SANGRADO: Sangrado = { interior: 0, exterior: 0, superior: 0, inferior: 0 }

// ---------------------------------------------------------------------------
// Sintaxis
// ---------------------------------------------------------------------------

/** Un numero en el PDF: tres decimales como mucho, sin exponente ni «-0». */
export function num(v: number): string {
  // PDF 1.3 (apendice C): un real no pasa de ±32767. Ninguna medida de un libro se acerca.
  if (!Number.isFinite(v) || Math.abs(v) > 32767) throw new Error(`Numero no valido en el PDF: ${v}`)
  const r = Math.round(v * 1000) / 1000
  if (r === 0) return '0'
  const s = r.toFixed(3).replace(/\.?0+$/u, '')
  return s
}

/** Todo lo que se escribe como texto del PDF es ASCII; lo demas va en hexadecimal. */
function ascii(s: string): Uint8Array {
  const r = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c > 0x7e) throw new Error(`Caracter no ASCII en la sintaxis del PDF: ${s.slice(Math.max(0, i - 10), i + 10)}`)
    r[i] = c
  }
  return r
}

function hex4(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, '0')
}

/** Un texto en UTF-16BE: lo que se usa en el Info (con BOM) y en la ToUnicode (sin el). */
function utf16(s: string): string {
  let r = ''
  for (let i = 0; i < s.length; i++) r += hex4(s.charCodeAt(i))
  return r
}

/** Una cadena de texto del Info: literal si es ASCII imprimible, si no UTF-16BE con BOM. */
export function cadena(s: string): string {
  if (/^[\x20-\x7e]*$/u.test(s)) return `(${s.replace(/[\\()]/gu, (c) => `\\${c}`)})`
  return `<FEFF${utf16(s)}>`
}

/** Un nombre del PDF: lo que no sea letra, cifra o un par de signos va como #xx. */
export function nombre(s: string): string {
  return s.replace(/[^A-Za-z0-9+\-_.]/gu, (c) => `#${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)
}

function fechaPdf(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}+00'00'`
}

function concatenar(partes: readonly Uint8Array[]): Uint8Array {
  let n = 0
  for (const p of partes) n += p.length
  const r = new Uint8Array(n)
  let o = 0
  for (const p of partes) {
    r.set(p, o)
    o += p.length
  }
  return r
}

class Objetos {
  private readonly cuerpos: (Uint8Array | null)[] = []

  reservar(): number {
    this.cuerpos.push(null)
    return this.cuerpos.length
  }

  poner(n: number, cuerpo: string | Uint8Array): number {
    this.cuerpos[n - 1] = typeof cuerpo === 'string' ? ascii(cuerpo) : cuerpo
    return n
  }

  nuevo(cuerpo: string | Uint8Array): number {
    return this.poner(this.reservar(), cuerpo)
  }

  flujo(dic: string, datos: Uint8Array, comprimir = true): number {
    const d = comprimir ? zlibSync(datos, { level: 9 }) : datos
    const filtro = comprimir ? ' /Filter /FlateDecode' : ''
    return this.nuevo(concatenar([ascii(`<<${dic}${filtro} /Length ${d.length} >>\nstream\n`), d, ascii('\nendstream')]))
  }

  bytes(raiz: number, info: number): Uint8Array {
    const partes: Uint8Array[] = [ascii('%PDF-1.3\n'), new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])]
    let n = partes.reduce((s, p) => s + p.length, 0)
    const posiciones: number[] = []
    this.cuerpos.forEach((c, i) => {
      if (!c) throw new Error(`El objeto ${i + 1} quedo reservado sin escribir.`)
      const b = concatenar([ascii(`${i + 1} 0 obj\n`), c, ascii('\nendobj\n')])
      posiciones.push(n)
      n += b.length
      partes.push(b)
    })
    // El /ID, un hash de todo lo de antes: el mismo contenido, el mismo /ID.
    const id = [...sha1(concatenar(partes)).subarray(0, 16)].map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join('')
    let x = `xref\n0 ${this.cuerpos.length + 1}\n0000000000 65535 f \n`
    for (const p of posiciones) x += `${String(p).padStart(10, '0')} 00000 n \n`
    x += `trailer\n<< /Size ${this.cuerpos.length + 1} /Root ${raiz} 0 R /Info ${info} 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${n}\n%%EOF\n`
    partes.push(ascii(x))
    return concatenar(partes)
  }
}

// ---------------------------------------------------------------------------
// Fuentes
// ---------------------------------------------------------------------------

/** El prefijo de un subconjunto: seis mayusculas sacadas de un hash (pdffonts solo dice «sub» con seis). */
export function prefijo(nombrePs: string, glifos: readonly number[]): string {
  const h = sha1(ascii(`${nombrePs}:${glifos.join(',')}`))
  let r = ''
  for (let i = 0; i < 6; i++) r += String.fromCharCode(65 + ((h[i] as number) % 26))
  return r
}

/** El ancho de un glifo como lo escribe el PDF (milesimas de em, tres decimales). */
function anchoPdf(f: Fuente, g: number): number {
  return Math.round(((f.avance(g) * 1000) / f.upm) * 1000) / 1000
}

function incrustar(o: Objetos, f: Fuente, cara: Cara, usados: ReadonlyMap<number, string>): number {
  const permiso = f.incrustable()
  if (!permiso.puede) {
    throw new Error(`La licencia de la fuente ${f.nombre} no deja incrustarla en un PDF (fsType ${f.fsType}): elige otra.`)
  }
  const gids = [...usados.keys()].sort((a, b) => a - b)
  const programa = permiso.subconjunto ? subconjunto(f, gids) : f.bytes
  const etiqueta = permiso.subconjunto ? `${prefijo(f.nombre, gids)}+${f.nombre}` : f.nombre
  const k = 1000 / f.upm
  const archivo = o.flujo(` /Length1 ${programa.length}`, programa)
  const cursiva = cara === 'cursiva' || cara === 'negritaCursiva' || f.anguloCursiva !== 0
  const negrita = cara === 'negrita' || cara === 'negritaCursiva'
  const descriptor = o.nuevo(
    `<< /Type /FontDescriptor /FontName /${nombre(etiqueta)} /Flags ${4 | (cursiva ? 64 : 0)}` +
      ` /FontBBox [${f.caja.map((v) => num(v * k)).join(' ')}] /ItalicAngle ${num(f.anguloCursiva)}` +
      ` /Ascent ${num(f.ascendente * k)} /Descent ${num(f.descendente * k)} /CapHeight ${num(f.alturaMayusculas * k)}` +
      ` /XHeight ${num(f.alturaX * k)} /StemV ${negrita ? 140 : 80} /FontFile2 ${archivo} 0 R >>`,
  )
  // /W: los anchos de los glifos usados, en tramos de ids seguidos.
  const w: string[] = []
  for (let i = 0; i < gids.length; ) {
    let j = i
    while (j + 1 < gids.length && gids[j + 1] === (gids[j] as number) + 1) j++
    w.push(`${gids[i]} [${gids.slice(i, j + 1).map((g) => num(anchoPdf(f, g))).join(' ')}]`)
    i = j + 1
  }
  const cid = o.nuevo(
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${nombre(etiqueta)}` +
      ` /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >>` +
      ` /FontDescriptor ${descriptor} 0 R /DW 1000 /W [${w.join(' ')}] /CIDToGIDMap /Identity >>`,
  )
  // ToUnicode: de cada glifo a su texto («fi» para la ligadura), para copiar y buscar.
  const filas = gids.filter((g) => g !== 0 && usados.get(g)).map((g) => `<${hex4(g)}> <${utf16(usados.get(g) as string)}>`)
  let cmap =
    '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n' +
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n' +
    '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n'
  for (let i = 0; i < filas.length; i += 100) cmap += `${Math.min(100, filas.length - i)} beginbfchar\n${filas.slice(i, i + 100).join('\n')}\nendbfchar\n`
  cmap += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n'
  const tu = o.flujo('', ascii(cmap))
  return o.nuevo(`<< /Type /Font /Subtype /Type0 /BaseFont /${nombre(etiqueta)} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>`)
}

/** Los glifos de una operacion como argumento de TJ: ids en hexadecimal y, entre medias, lo que el kerning cambia el avance. */
function tj(f: Fuente, glifos: readonly Glifo[]): string {
  let r = ''
  let corrido = ''
  for (const g of glifos) {
    corrido += hex4(g.id)
    const ajuste = Math.round((anchoPdf(f, g.id) - (g.avance * 1000) / f.upm) * 1000) / 1000
    if (ajuste !== 0) {
      r += `<${corrido}> ${num(ajuste)} `
      corrido = ''
    }
  }
  if (corrido) r += `<${corrido}>`
  return r.trim()
}

// ---------------------------------------------------------------------------
// El documento
// ---------------------------------------------------------------------------

export function escribirPdf(paginas: readonly PaginaCompuesta[], o: OpcionesPdf): Uint8Array {
  const obj = new Objetos()
  const s = o.sangrado ?? SIN_SANGRADO

  // Que glifos usa cada cara (y que texto lleva cada uno), y que imagenes.
  const usados = new Map<Cara, Map<number, string>>()
  const imagenes: string[] = []
  for (const p of paginas) {
    for (const op of p.ops) {
      if (op.op === 'imagen') {
        if (!imagenes.includes(op.id)) imagenes.push(op.id)
        continue
      }
      let m = usados.get(op.cara)
      if (!m) usados.set(op.cara, (m = new Map()))
      for (const g of op.glifos) if (!m.has(g.id) || (!m.get(g.id) && g.texto)) m.set(g.id, g.texto)
    }
  }

  // Recursos comunes a todas las paginas.
  const recursoFuente = new Map<Cara, string>()
  const fuentes: string[] = []
  for (const cara of CARAS) {
    const m = usados.get(cara)
    if (!m) continue
    const id = incrustar(obj, o.fuentes[cara], cara, m)
    const nombreRecurso = `F${recursoFuente.size + 1}`
    recursoFuente.set(cara, nombreRecurso)
    fuentes.push(`/${nombreRecurso} ${id} 0 R`)
  }
  const recursoImagen = new Map<string, string>()
  const xobjetos: string[] = []
  for (const id of imagenes) {
    const img = o.imagenes?.(id)
    if (!img) throw new Error(`Falta la imagen «${id}» para el PDF.`)
    if (img.pixeles.length !== img.ancho * img.alto) throw new Error(`La imagen «${id}» no mide ${img.ancho} × ${img.alto} pixeles de gris.`)
    const n = obj.flujo(` /Type /XObject /Subtype /Image /Width ${img.ancho} /Height ${img.alto} /ColorSpace /DeviceGray /BitsPerComponent 8`, img.pixeles)
    const nombreRecurso = `Im${recursoImagen.size + 1}`
    recursoImagen.set(id, nombreRecurso)
    xobjetos.push(`/${nombreRecurso} ${n} 0 R`)
  }
  const recursos = obj.nuevo(
    `<< /ProcSet [/PDF /Text${imagenes.length ? ' /ImageB' : ''}]` +
      (fuentes.length ? ` /Font << ${fuentes.join(' ')} >>` : '') +
      (xobjetos.length ? ` /XObject << ${xobjetos.join(' ')} >>` : '') +
      ' >>',
  )

  const arbol = obj.reservar()
  const hijos: number[] = []
  for (const p of paginas) {
    // El interior va del lado del lomo: a la izquierda en las impares.
    const izq = p.numero % 2 === 1 ? s.interior : s.exterior
    const der = p.numero % 2 === 1 ? s.exterior : s.interior
    const ancho = o.ancho + izq + der
    const alto = o.alto + s.superior + s.inferior
    // De arriba-abajo (como compone paginar) a abajo-arriba (como mide el PDF).
    const x = (v: number): string => num(v + izq)
    const y = (v: number): string => num(s.inferior + o.alto - v)
    const c: string[] = ['0 g']
    let enTexto = false
    let actual = ''
    for (const op of p.ops) {
      if (op.op === 'texto') {
        if (!enTexto) {
          c.push('BT')
          enTexto = true
          actual = ''
        }
        const f = recursoFuente.get(op.cara) as string
        const tf = `/${f} ${num(op.cuerpo)} Tf`
        if (tf !== actual) c.push(tf)
        actual = tf
        c.push(`1 0 0 1 ${x(op.x)} ${y(op.y)} Tm`)
        c.push(`[${tj(o.fuentes[op.cara], op.glifos)}] TJ`)
      } else {
        if (enTexto) c.push('ET')
        enTexto = false
        c.push(`q ${num(op.ancho)} 0 0 ${num(op.alto)} ${x(op.x)} ${y(op.y + op.alto)} cm /${recursoImagen.get(op.id) as string} Do Q`)
      }
    }
    if (enTexto) c.push('ET')
    const contenido = obj.flujo('', ascii(c.join('\n') + '\n'))
    const caja = (a: number, b: number, cc: number, d: number): string => `[${[a, b, cc, d].map(num).join(' ')}]`
    hijos.push(
      obj.nuevo(
        `<< /Type /Page /Parent ${arbol} 0 R /MediaBox ${caja(0, 0, ancho, alto)} /BleedBox ${caja(0, 0, ancho, alto)}` +
          ` /TrimBox ${caja(izq, s.inferior, izq + o.ancho, s.inferior + o.alto)} /Resources ${recursos} 0 R /Contents ${contenido} 0 R >>`,
      ),
    )
  }
  obj.poner(arbol, `<< /Type /Pages /Count ${hijos.length} /Kids [${hijos.map((h) => `${h} 0 R`).join(' ')}] >>`)

  const condicion = o.condicion ?? 'CGATS TR 001'
  const intento = obj.nuevo(
    `<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier ${cadena(condicion)}` +
      ` /RegistryName (http://www.color.org) /Info ${cadena(CONDICIONES[condicion])} >>`,
  )
  const catalogo = obj.nuevo(`<< /Type /Catalog /Pages ${arbol} 0 R /OutputIntents [${intento} 0 R] >>`)
  const fecha = fechaPdf(o.fecha)
  const info = obj.nuevo(
    `<< /Title ${cadena(o.titulo)} /Author ${cadena(o.autor)} /Creator (Pubteca) /Producer (Pubteca)` +
      ` /CreationDate (${fecha}) /ModDate (${fecha}) /Trapped /False` +
      ` /GTS_PDFXVersion (PDF/X-1:2001) /GTS_PDFXConformance (PDF/X-1a:2001) >>`,
  )
  return obj.bytes(catalogo, info)
}
