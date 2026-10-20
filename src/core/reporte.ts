/**
 * El reporte en texto. Port de generar_epub.py 1045-1091 (main).
 *
 * En la webapp alimenta el panel de revision, y se puede descargar como
 * reporte.txt igual que hoy. Los anchos de campo son parte del contrato: el
 * golden test compara el texto completo.
 */
import type { Construccion } from './construir'
import { MARCA } from './mensajes'
import { formatoFijo } from './numero'

export const VERSION = '1.0'

/** Tarifa de entrega de Amazon con regalia del 70 %: 0,15 USD por MB en EE. UU. */
export const TARIFA_POR_MB = 0.15

/** `{:%Y-%m-%d %H:%M}` sobre la hora LOCAL, como hace el Python. */
function fechaLocal(d: Date): string {
  const p = (n: number, ancho = 2): string => String(n).padStart(ancho, '0')
  return (
    `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}`
  )
}

export function reporte(c: Construccion, ahora: Date): string {
  const { libro, fuentes, diagnosticos: dg } = c
  const cfg = libro.cfg
  const r: string[] = []

  r.push(`Generador de EPUB ${VERSION} · ${fechaLocal(ahora)}`)
  r.push(`Libro: ${cfg.titulo}` + (cfg.autor ? ` — ${cfg.autor}` : ''))

  // Familias deduplicadas conservando el orden, como dict.fromkeys.
  const familias = [...new Set(fuentes.map((f) => f.familia))]
  if (cfg.fuente || familias.length > 0) {
    const partes = [...(cfg.fuente ? [cfg.fuente] : []), ...familias.map((f) => `${f} (incluida)`)]
    r.push(
      `Fuente en Apple Books: ${partes.join(' → ')} · En Kindle: la que elija el lector`,
    )
  }

  r.push('')
  r.push('Capítulos:')
  for (const cap of libro.resumenCaps) {
    const extra = cap.ilustraciones
      ? `, ${cap.ilustraciones} ` + (cap.ilustraciones === 1 ? 'ilustración' : 'ilustraciones')
      : ''
    r.push(
      `  · ${cap.archivo.padEnd(12)} ${cap.titulo}  (${cap.parrafos} párrafos${extra})`,
    )
  }
  if (c.laminas) r.push(`Láminas a color al inicio: ${c.laminas}`)

  r.push('')
  r.push('Archivos generados (en salida/):')
  for (const res of c.resultados) {
    const mb = res.bytes.length / 1e6
    let linea = `  · ${res.nombreArchivo.padEnd(40)} ${formatoFijo(mb, 2).padStart(5)} MB`
    if (res.tienda === 'Kindle') {
      linea +=
        `  → tarifa de entrega estimada ≈ $${formatoFijo(mb * TARIFA_POR_MB, 2)}` +
        ' USD por venta (70 %, EE. UU.)'
    }
    r.push(linea)
  }

  for (const [titulo, lista, marca] of [
    ['Errores', dg.errores, MARCA.error],
    ['Avisos', dg.avisos, MARCA.aviso],
    ['Notas', dg.notas, MARCA.nota],
  ] as const) {
    if (lista.length > 0) {
      r.push('')
      r.push(`${titulo}:`)
      for (const m of lista) r.push(`  ${marca} ${m}`)
    }
  }

  r.push('')
  if (dg.errores.length > 0) {
    r.push('Resultado: generado, pero con errores que conviene corregir antes de publicar.')
  } else if (dg.avisos.length > 0) {
    r.push('Resultado: listo, con algunos avisos que revisar.')
  } else {
    r.push('Resultado: listo, sin problemas.')
  }
  r.push('Para revisarlo como en un Kindle, abre el EPUB de Kindle en Kindle Previewer 3.')

  return r.join('\n') + '\n'
}
