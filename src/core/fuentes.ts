/**
 * Fuentes incluidas en el EPUB. Port de generar_epub.py 287-313.
 *
 * Solo entran en la version de Apple Books. Kindle va SIN fuente: el lector
 * usa la que tenga elegida, el archivo pesa menos y baja la tarifa de entrega.
 */
import type { Diagnosticos } from './mensajes'
import type { Archivo } from './proyecto'
import { nombreSeguro } from './texto'

/** `ESTILOS_FUENTE`: sufijo del nombre -> (font-style, font-weight). */
const ESTILOS: Record<string, { style: string; weight: string }> = {
  regular: { style: 'normal', weight: 'normal' },
  italic: { style: 'italic', weight: 'normal' },
  bold: { style: 'normal', weight: 'bold' },
  bolditalic: { style: 'italic', weight: 'bold' },
}

const EXT_FUENTE = ['.ttf', '.otf']

export interface Fuente {
  readonly familia: string
  readonly style: string
  readonly weight: string
  readonly href: string
  readonly id: string
  readonly media: string
  readonly origen: Archivo
}

/**
 * Lee `fuentes/` buscando `Familia-Regular.ttf`, `-Italic`, `-Bold`,
 * `-BoldItalic` (.ttf u .otf).
 *
 * Detalles del Python que hay que conservar:
 *
 * - Recorre en orden ALFABETICO por nombre de archivo (`sorted(iterdir())`),
 *   no en orden natural. Por eso Bold sale antes que Italic y que Regular, y
 *   ese es el orden de las caras @font-face y del manifiesto.
 * - Lo que no sea .ttf ni .otf se ignora SIN avisar (el OFL.txt que acompana a
 *   la fuente, el .DS_Store).
 * - El estilo se parte por el ULTIMO guion, asi que `Dos-Palabras-Bold` da la
 *   familia `Dos-Palabras`.
 * - El estilo admite guion bajo (`-bold_italic`) y mayusculas (`-BOLD`), pero
 *   el href conserva el guion bajo del nombre original.
 * - La familia NO pasa por sinAcentos, asi que `FuenteN-Regular.ttf` con N con
 *   tilde declara la familia con tilde mientras el archivo va en ASCII.
 */
export function buscarFuentes(archivos: readonly Archivo[], dg: Diagnosticos): Fuente[] {
  const fuentes: Fuente[] = []
  const ordenados = [...archivos].sort((a, b) =>
    a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0,
  )

  for (const p of ordenados) {
    const ext = p.suffix.toLowerCase()
    if (!EXT_FUENTE.includes(ext)) continue

    const guion = p.stem.lastIndexOf('-')
    const familiaCruda = guion === -1 ? '' : p.stem.slice(0, guion)
    const estilo = (guion === -1 ? p.stem : p.stem.slice(guion + 1))
      .toLowerCase()
      .replace(/_/g, '')
    const def = ESTILOS[estilo]

    if (!familiaCruda || !def) {
      dg.aviso(
        `fuentes/${p.nombre}: el nombre debe terminar en -Regular, -Italic, -Bold o -BoldItalic; la ignoré.`,
      )
      continue
    }

    // LibreBaskerville -> Libre Baskerville, pero Dos-Palabras se queda igual.
    const familia = familiaCruda.replace(/(?<=[a-z])(?=[A-Z])/gu, ' ')
    const base = nombreSeguro(p.stem)

    fuentes.push({
      familia,
      style: def.style,
      weight: def.weight,
      href: `fuentes/${base}${ext}`,
      id: `fuente-${base}`,
      media: ext === '.otf' ? 'font/otf' : 'font/ttf',
      origen: p,
    })
  }

  return fuentes
}
