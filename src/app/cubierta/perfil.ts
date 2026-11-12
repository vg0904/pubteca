/**
 * El perfil CMYK de la cubierta: ISO Coated v2 300 % de basICColor (datos
 * FOGRA39, licencia zlib/libpng, ver public/perfiles/). Pesa 1 MB: se trae la
 * primera vez que hace falta (elegir CMYK) y se queda en memoria.
 */
import { leerPerfil, type Perfil } from '../../core/impreso/icc'

export const ARCHIVO_PERFIL = 'perfiles/ISOcoated_v2_300_bas.icc'
/** La condicion de impresion del perfil, la del OutputIntent del PDF/X-1a. */
export const CONDICION_PERFIL = 'FOGRA39' as const

let enCache: Promise<{ bytes: Uint8Array; perfil: Perfil }> | null = null

export function perfilCmyk(base: string = import.meta.env.BASE_URL): Promise<{ bytes: Uint8Array; perfil: Perfil }> {
  enCache ??= (async () => {
    const r = await fetch(`${base}${ARCHIVO_PERFIL}`)
    if (!r.ok) throw new Error(`${ARCHIVO_PERFIL}: ${r.status}`)
    const bytes = new Uint8Array(await r.arrayBuffer())
    return { bytes, perfil: leerPerfil(bytes) }
  })().catch((e: unknown) => {
    enCache = null
    throw e
  })
  return enCache
}
