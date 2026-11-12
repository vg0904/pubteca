/**
 * El PDF de la cubierta: una sola pagina, la hoja entera con su sangrado.
 *
 * Usa las piezas del escritor del interior (objetos, fuentes en subconjunto
 * con ToUnicode, el /ID por hash, el reloj inyectado) y les añade lo que la
 * cubierta necesita: varias letras, texto girado (el lomo), rectangulos (la
 * caja y las barras del codigo) y una imagen en COLOR, la del fondo.
 *
 * Dos formas, segun el color que elija el autor (M10):
 *   - RGB: el fondo en sRGB tal cual, para que la imprenta (o KDP) lo
 *     convierta. No es PDF/X-1a.
 *   - CMYK: el fondo ya separado con el perfil de imprenta (color.ts), y el
 *     PDF entero PDF/X-1a:2001, como el interior: su OutputIntent (FOGRA39,
 *     los datos del perfil), /Trapped y la version en el Info.
 * En las dos, lo demas sigue la regla del interior: el texto y las barras en
 * negro de una tinta (gris), sin transparencias (los velos van cocidos en la
 * imagen), sin anotaciones.
 */
import { zlibSync } from 'fflate'
import type { CubiertaCompuesta, FuentesCubierta, LetraCubierta } from './cubierta'
import { ascii, cadena, CONDICIONES, fechaPdf, incrustar, num, Objetos, tj } from './pdf'
import type { Fuente } from './sfnt'
import type { Cara } from './tipos'

/** La imagen del fondo: un JPEG tal cual (lo que da el lienzo del navegador), pixeles RGB, o CMYK ya separado. */
export type FondoCubierta =
  | { readonly jpeg: Uint8Array; readonly ancho: number; readonly alto: number }
  | { readonly rgb: Uint8Array; readonly ancho: number; readonly alto: number }
  /** C, M, Y, K de 8 bits por pixel (255 es el 100 % de tinta): el PDF sale PDF/X-1a. */
  | { readonly cmyk: Uint8Array; readonly ancho: number; readonly alto: number }
  /** Lo mismo, ya pasado por `comprimirCmyk` (lo hace el hilo de la app: tarda segundos). */
  | { readonly cmykComprimido: Uint8Array; readonly ancho: number; readonly alto: number }

export interface OpcionesCubierta {
  readonly fuentes: FuentesCubierta
  readonly fondo?: FondoCubierta
  readonly titulo: string
  readonly autor: string
  readonly fecha: Date
  /** Con el fondo en CMYK: la condicion de impresion del OutputIntent (la del perfil con que se separo). */
  readonly condicion?: keyof typeof CONDICIONES
}

const fuenteDe = (f: FuentesCubierta, letra: LetraCubierta, cara: Cara): Fuente => (letra === 'libro' ? f.libro[cara] : f[letra])

export function escribirCubierta(c: CubiertaCompuesta, o: OpcionesCubierta): Uint8Array {
  const obj = new Objetos()
  const m = c.medidas

  // Que glifos usa cada letra (y cada cara de la del libro).
  const usados = new Map<string, { f: Fuente; cara: Cara; glifos: Map<number, string> }>()
  for (const op of c.ops) {
    if (op.op !== 'texto') continue
    const clave = op.letra === 'libro' ? `libro-${op.cara}` : op.letra
    let u = usados.get(clave)
    if (!u) usados.set(clave, (u = { f: fuenteDe(o.fuentes, op.letra, op.cara), cara: op.letra === 'libro' ? op.cara : 'regular', glifos: new Map() }))
    for (const g of op.glifos) if (!u.glifos.has(g.id) || (!u.glifos.get(g.id) && g.texto)) u.glifos.set(g.id, g.texto)
  }
  const recurso = new Map<string, string>()
  const fuentes: string[] = []
  for (const [clave, u] of [...usados].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const id = incrustar(obj, u.f, u.cara, u.glifos)
    const r = `F${recurso.size + 1}`
    recurso.set(clave, r)
    fuentes.push(`/${r} ${id} 0 R`)
  }

  let imagen = ''
  const enCmyk = o.fondo !== undefined && ('cmyk' in o.fondo || 'cmykComprimido' in o.fondo)
  if (o.fondo) {
    const f = o.fondo
    const dic = ` /Type /XObject /Subtype /Image /Width ${f.ancho} /Height ${f.alto} /BitsPerComponent 8`
    let n: number
    if ('jpeg' in f) n = obj.nuevo(concatenarFlujo(`${dic} /ColorSpace /DeviceRGB /Filter /DCTDecode`, f.jpeg))
    else if ('rgb' in f) {
      if (f.rgb.length !== f.ancho * f.alto * 3) throw new Error(`El fondo no mide ${f.ancho} × ${f.alto} pixeles RGB.`)
      n = obj.nuevo(concatenarFlujo(`${dic} /ColorSpace /DeviceRGB /Filter /FlateDecode`, zlibSync(f.rgb, { level: 9 })))
    } else {
      const datos = 'cmyk' in f ? comprimirCmyk(f.cmyk, f.ancho, f.alto) : f.cmykComprimido
      n = obj.nuevo(
        concatenarFlujo(`${dic} /ColorSpace /DeviceCMYK /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 4 /BitsPerComponent 8 /Columns ${f.ancho} >>`, datos),
      )
    }
    imagen = `/Fondo ${n} 0 R`
  }
  const recursos = obj.nuevo(
    `<< /ProcSet [/PDF /Text${imagen ? ' /ImageC' : ''}]` + (fuentes.length ? ` /Font << ${fuentes.join(' ')} >>` : '') + (imagen ? ` /XObject << ${imagen} >>` : '') + ' >>',
  )

  // De arriba-abajo (como compone la cubierta) a abajo-arriba (como mide el PDF).
  const y = (v: number): number => m.alto - v
  const cmds: string[] = []
  if (imagen) cmds.push(`q ${num(m.ancho)} 0 0 ${num(m.alto)} 0 0 cm /Fondo Do Q`)
  let gris = -1
  const tinta = (g: number): void => {
    if (g !== gris) cmds.push(`${num(g)} g`)
    gris = g
  }
  for (const op of c.ops) {
    if (op.op === 'rect') {
      tinta(op.gris)
      cmds.push(`${num(op.x)} ${num(y(op.y + op.alto))} ${num(op.ancho)} ${num(op.alto)} re f`)
      continue
    }
    tinta(op.gris)
    const f = fuenteDe(o.fuentes, op.letra, op.cara)
    const r = recurso.get(op.letra === 'libro' ? `libro-${op.cara}` : op.letra) as string
    // La matriz: la direccion de la linea base y la de «arriba» de las letras.
    const [a, b, cc, d] = op.giro === 90 ? [0, -1, 1, 0] : op.giro === -90 ? [0, 1, -1, 0] : [1, 0, 0, 1]
    cmds.push('BT', `/${r} ${num(op.cuerpo)} Tf`, `${a} ${b} ${cc} ${d} ${num(op.x)} ${num(y(op.y))} Tm`, `[${tj(f, op.glifos)}] TJ`, 'ET')
  }
  const contenido = obj.nuevo(concatenarFlujo('', zlibSync(ascii(cmds.join('\n') + '\n'), { level: 9 }), true))
  const caja = (a: number, b: number, cc: number, d: number): string => `[${[a, b, cc, d].map(num).join(' ')}]`
  const arbol = obj.reservar()
  const pagina = obj.nuevo(
    `<< /Type /Page /Parent ${arbol} 0 R /MediaBox ${caja(0, 0, m.ancho, m.alto)} /BleedBox ${caja(0, 0, m.ancho, m.alto)}` +
      ` /TrimBox ${caja(m.sangrado, m.sangrado, m.ancho - m.sangrado, m.alto - m.sangrado)} /Resources ${recursos} 0 R /Contents ${contenido} 0 R >>`,
  )
  obj.poner(arbol, `<< /Type /Pages /Count 1 /Kids [${pagina} 0 R] >>`)
  const fecha = fechaPdf(o.fecha)
  if (!enCmyk) {
    const catalogo = obj.nuevo(`<< /Type /Catalog /Pages ${arbol} 0 R >>`)
    const info = obj.nuevo(
      `<< /Title ${cadena(o.titulo)} /Author ${cadena(o.autor)} /Creator (Pubteca) /Producer (Pubteca) /CreationDate (${fecha}) /ModDate (${fecha}) /Trapped /False >>`,
    )
    return obj.bytes(catalogo, info)
  }
  // En CMYK, PDF/X-1a:2001, como el interior.
  const condicion = o.condicion ?? 'FOGRA39'
  const intento = obj.nuevo(
    `<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier ${cadena(condicion)}` + ` /RegistryName (http://www.color.org) /Info ${cadena(CONDICIONES[condicion])} >>`,
  )
  const catalogo = obj.nuevo(`<< /Type /Catalog /Pages ${arbol} 0 R /OutputIntents [${intento} 0 R] >>`)
  const info = obj.nuevo(
    `<< /Title ${cadena(o.titulo)} /Author ${cadena(o.autor)} /Creator (Pubteca) /Producer (Pubteca)` +
      ` /CreationDate (${fecha}) /ModDate (${fecha}) /Trapped /False` +
      ` /GTS_PDFXVersion (PDF/X-1:2001) /GTS_PDFXConformance (PDF/X-1a:2001) >>`,
  )
  return obj.bytes(catalogo, info)
}

/** El fondo CMYK como va en el PDF: los filtros de PNG por fila y zlib. Un dibujo pesa la mitad o menos que comprimido a pelo. */
export function comprimirCmyk(cmyk: Uint8Array, ancho: number, alto: number): Uint8Array {
  if (cmyk.length !== ancho * alto * 4) throw new Error(`El fondo no mide ${ancho} × ${alto} pixeles CMYK.`)
  return zlibSync(predictorPng(cmyk, ancho, alto, 4), { level: 6 })
}

/**
 * Los filtros de PNG por fila (Predictor 15 de FlateDecode): cada fila lleva
 * delante el filtro que deja los numeros mas pequeños (None, Sub, Up, Average
 * o Paeth), la heuristica de libpng. Sin perdida.
 */
export function predictorPng(datos: Uint8Array, ancho: number, alto: number, canales: number): Uint8Array {
  const fila = ancho * canales
  const r = new Uint8Array(alto * (fila + 1))
  const prueba = new Uint8Array(fila)
  const mejor = new Uint8Array(fila)
  for (let y = 0; y < alto; y++) {
    const a = y * fila
    const arriba = y > 0 ? a - fila : -1
    let menor = Infinity
    let tipo = 0
    for (let t = 0; t < 5; t++) {
      let suma = 0
      for (let i = 0; i < fila; i++) {
        const x = datos[a + i] as number
        const izq = i >= canales ? (datos[a + i - canales] as number) : 0
        const sup = arriba >= 0 ? (datos[arriba + i] as number) : 0
        const diag = arriba >= 0 && i >= canales ? (datos[arriba + i - canales] as number) : 0
        let p: number
        if (t === 0) p = 0
        else if (t === 1) p = izq
        else if (t === 2) p = sup
        else if (t === 3) p = (izq + sup) >> 1
        else {
          const q = izq + sup - diag
          const pa = Math.abs(q - izq)
          const pb = Math.abs(q - sup)
          const pc = Math.abs(q - diag)
          p = pa <= pb && pa <= pc ? izq : pb <= pc ? sup : diag
        }
        const v = (x - p) & 0xff
        prueba[i] = v
        suma += v < 128 ? v : 256 - v
        if (suma >= menor) break
      }
      if (suma < menor) {
        menor = suma
        tipo = t
        mejor.set(prueba)
      }
    }
    const o = y * (fila + 1)
    r[o] = tipo
    r.set(mejor, o + 1)
  }
  return r
}

/** Un flujo ya filtrado, con su diccionario. */
function concatenarFlujo(dic: string, datos: Uint8Array, flate = false): Uint8Array {
  const cabecera = ascii(`<<${dic}${flate ? ' /Filter /FlateDecode' : ''} /Length ${datos.length} >>\nstream\n`)
  const fin = ascii('\nendstream')
  const r = new Uint8Array(cabecera.length + datos.length + fin.length)
  r.set(cabecera, 0)
  r.set(datos, cabecera.length)
  r.set(fin, cabecera.length + datos.length)
  return r
}
