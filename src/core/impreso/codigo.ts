/**
 * El codigo de barras de un ISBN compuesto en su caja: la caja blanca, el ISBN
 * legible encima, las 95 barras del EAN-13 y sus cifras debajo. Lo usan tres:
 * la contraportada (en su caja de 50,8 × 30,5 mm), la muestra que la pantalla
 * pinta cuando la caja queda libre, y el codigo suelto en SVG o PNG para quien
 * monta la cubierta en otro programa.
 *
 * Medidas de la norma (ISO/IEC 15420, GS1):
 *   - modulo al 90 %: 0,297 mm (el 100 % es 0,33; se admite del 80 al 200);
 *   - barras de las cifras de 22,85 mm al 100 %; las de guarda, 5 modulos mas;
 *   - zona de silencio en blanco: 11 modulos a la izquierda y 7 a la derecha.
 *     Las barras van centradas en la caja, que deja mucho mas (unos 11 mm por
 *     lado); la primera cifra va dentro de la zona de la izquierda, debajo de
 *     las barras de las cifras, como manda la norma.
 */
import type { Caja, FuentesCubierta, Gris, OpCubierta } from './cubierta'
import { barrasEan13 } from './ean13'
import { PT_POR_MM } from './formatos'
import { Componedor } from './parrafo'

const MM = PT_POR_MM

export const MODULO = 0.33 * 0.9 * MM
export const ALTO_BARRAS = 22.85 * 0.9 * MM
export const SILENCIO = { izquierda: 11, derecha: 7 } as const

export interface QueCodigo {
  /** Las 13 cifras que se dibujan. */
  readonly cifras: string
  /** La linea de encima: «ISBN 978-…», o el rotulo de la muestra. */
  readonly arriba: string
  /** Las cifras debajo de las barras (la muestra no las lleva). */
  readonly conCifras: boolean
  /** La tinta de las barras y del texto: 0 es negro; la muestra va en gris. */
  readonly gris: Gris
}

/** Donde empiezan las barras: centradas en la caja. */
export const izquierdaDeBarras = (caja: Caja): number => caja.x + (caja.ancho - 95 * MODULO) / 2

/** Las operaciones del codigo en su caja, en el orden en que se pintan. */
export function componerCodigo(caja: Caja, q: QueCodigo, f: FuentesCubierta): OpCubierta[] {
  const ops: OpCubierta[] = [{ op: 'rect', x: caja.x, y: caja.y, ancho: caja.ancho, alto: caja.alto, gris: 1 }]
  const fu = f.jost
  const izq = izquierdaDeBarras(caja)

  // La linea de encima, centrada en la caja. Lo que sube se mide con la caja de cada glifo.
  const cuerpo = 7.5
  const paso = cuerpo * 1.15
  const comp = new Componedor({ regular: fu, cursiva: fu, negrita: fu, negritaCursiva: fu }, 'und')
  const par = comp.parrafo([{ texto: q.arriba, cara: 'regular' }], { cuerpo, ancho: caja.ancho, modo: 'centrado', partir: false, espaciado: 0 })
  let sube = 0
  for (const l of par.lineas) for (const pz of l.piezas) for (const g of pz.glifos) sube = Math.max(sube, ((fu.limites(g.id)?.[3] ?? 0) * cuerpo) / fu.upm)
  const primera = caja.y + 2.5 * MM + sube
  par.lineas.forEach((l, i) => {
    for (const pz of l.piezas) ops.push({ op: 'texto', letra: 'jost', cara: pz.cara, cuerpo, x: caja.x + l.desde + pz.x, y: primera + i * paso, glifos: pz.glifos, gris: q.gris, giro: 0 })
  })
  const yBarras = primera + Math.max(0, par.lineas.length - 1) * paso + 1.2 * MM

  for (const b of barrasEan13(q.cifras)) {
    ops.push({ op: 'rect', x: izq + b.desde * MODULO, y: yBarras, ancho: b.ancho * MODULO, alto: ALTO_BARRAS + (b.guarda ? 5 * MODULO : 0), gris: q.gris })
  }
  if (!q.conCifras) return ops

  // Las cifras: la primera fuera, en la zona de silencio; luego seis y seis entre las guardas.
  const yCifras = yBarras + ALTO_BARRAS + 3 * MM
  const cifra = (t: string, centro: number): void => {
    const forma = fu.formar(t)
    const w = (forma.ancho * 8.5) / fu.upm
    ops.push({ op: 'texto', letra: 'jost', cara: 'regular', cuerpo: 8.5, x: centro - w / 2, y: yCifras, glifos: forma.glifos, gris: q.gris, giro: 0 })
  }
  cifra(q.cifras[0] as string, izq - 4 * MODULO)
  for (let i = 0; i < 6; i++) cifra(q.cifras[1 + i] as string, izq + (3 + 7 * i + 3.5) * MODULO)
  for (let i = 0; i < 6; i++) cifra(q.cifras[7 + i] as string, izq + (50 + 7 * i + 3.5) * MODULO)
  return ops
}

const num = (x: number): string => {
  const r = Math.round(x * 1000) / 1000
  return Object.is(r, -0) ? '0' : String(r)
}

const escala = (x: number): string => {
  const r = Math.round(x * 1e7) / 1e7
  return Object.is(r, -0) ? '0' : String(r)
}

const color = (g: Gris): string => {
  const v = Math.round(Math.min(1, Math.max(0, g)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${v}${v}${v}`
}

const escapar = (t: string): string => t.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')

/**
 * El codigo suelto en SVG: la caja (con su zona de silencio) en milimetros,
 * las barras como rectangulos y el texto como los contornos de sus glifos, sin
 * fuentes: se ve igual en cualquier programa. Dentro, puntos; el origen, la
 * esquina de la caja.
 */
export function svgDelCodigo(ops: readonly OpCubierta[], caja: Caja, f: FuentesCubierta, titulo: string): string {
  const partes: string[] = []
  for (const op of ops) {
    if (op.op === 'rect') {
      partes.push(`<rect x="${num(op.x - caja.x)}" y="${num(op.y - caja.y)}" width="${num(op.ancho)}" height="${num(op.alto)}" fill="${color(op.gris)}"/>`)
      continue
    }
    const fu = op.letra === 'libro' ? f.libro[op.cara] : f[op.letra]
    const k = op.cuerpo / fu.upm
    let a = 0
    for (const g of op.glifos) {
      const d = fu.contorno(g.id)
      if (d) {
        // La fuente mide con la y hacia arriba; como en el lienzo, cada giro con su matriz.
        const x = op.x - caja.x
        const y = op.y - caja.y
        const m = op.giro === 90 ? [0, k, k, 0, x, y + a] : op.giro === -90 ? [0, -k, -k, 0, x, y - a] : [k, 0, 0, -k, x + a, y]
        // La escala (unidades de la fuente a puntos) es pequeña: va con siete decimales; el origen, con tres.
        partes.push(`<path transform="matrix(${m.map((v, i) => (i < 4 ? escala(v) : num(v))).join(' ')})" fill="${color(op.gris)}" d="${d}"/>`)
      }
      a += g.avance * k
    }
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(caja.ancho / MM)}mm" height="${num(caja.alto / MM)}mm" viewBox="0 0 ${num(caja.ancho)} ${num(caja.alto)}">`,
    `<title>${escapar(titulo)}</title>`,
    ...partes,
    '</svg>',
    '',
  ].join('\n')
}
