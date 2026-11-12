/**
 * La portada del ebook: la portada de la cubierta con su texto, por su corte
 * (sin sangrado), a 2560 px de alto, como pide KDP para la portada del ebook;
 * en JPEG, que es lo que acepta su campo.
 *
 * Dos usos (decision 12):
 *   - «Usar tambien en el EPUB»: al generar, el EPUB de Apple Books lleva esta
 *     portada en vez del dibujo limpio (el de Kindle no lleva portada dentro:
 *     KDP pone la que se sube aparte). Se compone EN ESE MOMENTO desde el dibujo
 *     limpio y las opciones de la cubierta: nunca se queda vieja, y el dibujo
 *     de «Portada y laminas» (del que sale la cubierta impresa) no se toca.
 *   - descargarla desde «Cubierta» para subirla a KDP como portada del ebook.
 *
 * Necesita lienzo: solo corre en el navegador. Se carga con import() desde
 * la generacion, solo si el autor lo pidio.
 */
import { componerCubierta, type CubiertaCompuesta, type RolCubierta } from '../../core/impreso/cubierta'
import type { Imagen, Proyecto } from '../modelo'
import type { Repositorio } from '../repositorio'
import { configDe } from '../impreso/preparar'
import { fuentesDeCubierta } from './fuentes'
import { medirDibujo } from './medir'
import { pintarCubierta, trazosDeCubierta, type ParaPintarCubierta, type PincelCubierta } from './pintar'
import { configCubiertaDe, datosDeCubierta, ROLES_CUBIERTA, type Medicion } from './preparar'

export const ALTO_EBOOK = 2560
/** El id con que la portada compuesta entra en la exportacion (nunca se guarda). */
export const ID_PORTADA_EBOOK = 'portada-del-ebook'

/** Lo que mide la portada del ebook en pixeles, y los pixeles por punto. */
export function medidasDelEbook(c: CubiertaCompuesta): { readonly ancho: number; readonly alto: number; readonly escala: number } {
  const r = c.medidas.portada
  const escala = ALTO_EBOOK / r.alto
  return { ancho: Math.round(r.ancho * escala), alto: ALTO_EBOOK, escala }
}

/** Pinta la portada por su corte: las capas y el texto, sin guias ni muestras. */
export function pintarEbook(ctx: PincelCubierta, c: CubiertaCompuesta, p: ParaPintarCubierta): void {
  pintarCubierta(ctx, c, medidasDelEbook(c).escala, p, { capas: true, texto: true, region: c.medidas.portada })
}

/** La portada del ebook en JPEG, de una cubierta ya compuesta y lo necesario para pintarla. */
export async function jpegDelEbook(c: CubiertaCompuesta, p: ParaPintarCubierta): Promise<{ bytes: Uint8Array; ancho: number; alto: number }> {
  const { ancho, alto } = medidasDelEbook(c)
  const l = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(ancho, alto) : Object.assign(document.createElement('canvas'), { width: ancho, height: alto })
  const ctx = l.getContext('2d') as CanvasRenderingContext2D | null
  if (!ctx) throw new Error('Este navegador no deja dibujar la portada.')
  pintarEbook(ctx, c, p)
  const blob =
    'convertToBlob' in l
      ? await l.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
      : await new Promise<Blob>((res, rej) => l.toBlob((b) => (b ? res(b) : rej(new Error('El navegador no pudo codificar la portada.'))), 'image/jpeg', 0.9))
  return { bytes: new Uint8Array(await blob.arrayBuffer()), ancho, alto }
}

/**
 * Al generar: compone la cubierta del libro tal como esta y pinta su portada.
 * Las paginas no cambian nada de la portada (solo el lomo), asi que no hace
 * falta componer el interior.
 */
export async function portadaDelEbook(p: Proyecto, imagenes: ReadonlyMap<string, Imagen>, repo: Repositorio): Promise<{ imagen: Imagen; bytes: Uint8Array }> {
  const fuentes = await fuentesDeCubierta(configDe(p).fuente)
  const mapa = new Map<RolCubierta, ImageBitmap>()
  const medidas: Partial<Record<'portada' | 'contraportada', Medicion>> = {}
  try {
    for (const rol of ROLES_CUBIERTA) {
      const id = p.portada[rol]
      const blob = id ? repo.blob(id) : undefined
      if (!blob) continue
      mapa.set(rol, await createImageBitmap(blob))
      if (rol === 'portada') medidas.portada = await medirDibujo(blob)
    }
    const c = componerCubierta(datosDeCubierta(p, imagenes, 0, medidas), configCubiertaDe(p), fuentes)
    const hecha = await jpegDelEbook(c, { fuentes, trazo: trazosDeCubierta(fuentes), imagen: (rol) => mapa.get(rol) ?? null })
    return {
      imagen: { id: ID_PORTADA_EBOOK, nombreOriginal: 'portada-del-ebook.jpg', tipo: 'jpeg', bytes: hecha.bytes.length, ancho: hecha.ancho, alto: hecha.alto, alfa: false },
      bytes: hecha.bytes,
    }
  } finally {
    for (const b of mapa.values()) b.close()
  }
}
