/**
 * Las letras del impreso, traidas de `public/fuentes/impreso/` la primera vez
 * que hacen falta y guardadas para la sesion. Quien no abre «Libro impreso»
 * no las descarga nunca.
 *
 * Dos usos: sus bytes van al hilo que compone (y que escribe el PDF), y la
 * pagina las lee tambien, para pintar la vista previa con los contornos de los
 * mismos glifos (ver lienzo.ts).
 */
import { archivosDe, familia } from '../../core/impreso/familias'
import { Fuente } from '../../core/impreso/sfnt'
import type { Cara, Fuentes } from '../../core/impreso/tipos'

const CARAS: readonly Cara[] = ['regular', 'cursiva', 'negrita', 'negritaCursiva']

const bytes = new Map<string, Promise<Record<Cara, ArrayBuffer>>>()
const leidas = new Map<string, Fuentes>()

/** Los bytes de las cuatro caras. Si falla (sin conexion), se olvida para poder reintentar. */
export function bytesDeFamilia(id: string): Promise<Record<Cara, ArrayBuffer>> {
  const f = familia(id)
  let p = bytes.get(f.id)
  if (!p) {
    const archivos = archivosDe(f)
    p = Promise.all(
      CARAS.map(async (c) => {
        const r = await fetch(`${import.meta.env.BASE_URL}fuentes/impreso/${archivos[c]}`)
        if (!r.ok) throw new Error(`${archivos[c]}: ${r.status}`)
        return [c, await r.arrayBuffer()] as const
      }),
    ).then((pares) => Object.fromEntries(pares) as Record<Cara, ArrayBuffer>)
    p.catch(() => bytes.delete(f.id))
    bytes.set(f.id, p)
  }
  return p
}

/** Las cuatro caras leidas, para pintar. */
export async function fuentesDeFamilia(id: string): Promise<Fuentes> {
  const f = familia(id)
  const ya = leidas.get(f.id)
  if (ya) return ya
  const b = await bytesDeFamilia(f.id)
  const r = Object.fromEntries(CARAS.map((c) => [c, new Fuente(new Uint8Array(b[c]))])) as Record<Cara, Fuente>
  leidas.set(f.id, r)
  return r
}
