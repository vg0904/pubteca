/**
 * Las letras de la cubierta, de `public/fuentes/cubierta/`, la primera vez
 * que hacen falta; mas las cuatro caras de la letra del libro (la sinopsis va
 * en ella). Quien no abre la cubierta no las descarga nunca.
 */
import { ARCHIVOS_CUBIERTA, type FuentesCubierta, type LetraPropia } from '../../core/impreso/cubierta'
import { Fuente } from '../../core/impreso/sfnt'
import { fuentesDeFamilia } from '../impreso/fuentes'

let propias: Promise<Record<LetraPropia, Fuente>> | null = null

function letrasPropias(): Promise<Record<LetraPropia, Fuente>> {
  propias ??= Promise.all(
    (Object.entries(ARCHIVOS_CUBIERTA) as [LetraPropia, string][]).map(async ([letra, archivo]) => {
      const r = await fetch(`${import.meta.env.BASE_URL}fuentes/cubierta/${archivo}`)
      if (!r.ok) throw new Error(`${archivo}: ${r.status}`)
      return [letra, new Fuente(new Uint8Array(await r.arrayBuffer()))] as const
    }),
  ).then((pares) => Object.fromEntries(pares) as Record<LetraPropia, Fuente>)
  propias.catch(() => {
    propias = null
  })
  return propias
}

export async function fuentesDeCubierta(familiaDelLibro: string): Promise<FuentesCubierta> {
  const [p, libro] = await Promise.all([letrasPropias(), fuentesDeFamilia(familiaDelLibro)])
  return { ...p, libro }
}
