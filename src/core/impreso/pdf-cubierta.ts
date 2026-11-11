/**
 * El PDF de la cubierta: una sola pagina, la hoja entera con su sangrado.
 *
 * Usa las piezas del escritor del interior (objetos, fuentes en subconjunto
 * con ToUnicode, el /ID por hash, el reloj inyectado) y les añade lo que la
 * cubierta necesita: varias letras, texto girado (el lomo), rectangulos (la
 * caja y las barras del codigo) y una imagen en COLOR, la del fondo.
 *
 * NO es PDF/X-1a: el fondo va en sRGB tal cual (plan.md, decision 11: «sRGB
 * tal cual, con aviso de que la imprenta convierte»). Lo demas si sigue la
 * regla del interior: el texto y las barras en negro de una tinta (gris), sin
 * transparencias (los velos van cocidos en la imagen), sin anotaciones.
 */
import { zlibSync } from 'fflate'
import type { CubiertaCompuesta, FuentesCubierta, LetraCubierta } from './cubierta'
import { ascii, cadena, fechaPdf, incrustar, num, Objetos, tj } from './pdf'
import type { Fuente } from './sfnt'
import type { Cara } from './tipos'

/** La imagen del fondo: un JPEG tal cual (lo que da el lienzo del navegador), o pixeles RGB. */
export type FondoCubierta =
  | { readonly jpeg: Uint8Array; readonly ancho: number; readonly alto: number }
  | { readonly rgb: Uint8Array; readonly ancho: number; readonly alto: number }

export interface OpcionesCubierta {
  readonly fuentes: FuentesCubierta
  readonly fondo?: FondoCubierta
  readonly titulo: string
  readonly autor: string
  readonly fecha: Date
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
  if (o.fondo) {
    const f = o.fondo
    const n =
      'jpeg' in f
        ? obj.nuevo(concatenarFlujo(` /Type /XObject /Subtype /Image /Width ${f.ancho} /Height ${f.alto} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, f.jpeg))
        : (() => {
            if (f.rgb.length !== f.ancho * f.alto * 3) throw new Error(`El fondo no mide ${f.ancho} × ${f.alto} pixeles RGB.`)
            return obj.nuevo(concatenarFlujo(` /Type /XObject /Subtype /Image /Width ${f.ancho} /Height ${f.alto} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`, zlibSync(f.rgb, { level: 9 })))
          })()
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
  const catalogo = obj.nuevo(`<< /Type /Catalog /Pages ${arbol} 0 R >>`)
  const fecha = fechaPdf(o.fecha)
  const info = obj.nuevo(
    `<< /Title ${cadena(o.titulo)} /Author ${cadena(o.autor)} /Creator (Pubteca) /Producer (Pubteca) /CreationDate (${fecha}) /ModDate (${fecha}) /Trapped /False >>`,
  )
  return obj.bytes(catalogo, info)
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
