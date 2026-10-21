/**
 * Los contextos de la interfaz. Son pocos a proposito: el estado viaja por
 * props desde arriba, y por contexto solo va lo que es estable (despachar) o
 * lo que cambia con el proyecto (las imagenes).
 */
import { createContext, useContext, type Dispatch } from 'react'
import type { Accion } from '../estado'
import type { Imagen } from '../modelo'
import type { Repositorio } from '../repositorio'

export const DespachoCtx = createContext<Dispatch<Accion>>(() => undefined)
export const useDespacho = (): Dispatch<Accion> => useContext(DespachoCtx)

export interface Rechazo {
  readonly nombre: string
  readonly motivo: string
}

export interface Medios {
  readonly repo: Repositorio | null
  readonly imagenes: ReadonlyMap<string, Imagen>
  /**
   * Sube imagenes al proyecto abierto: inspecciona sus bytes, las guarda y las
   * registra. Las que no sirven se dicen (y no se suben).
   */
  readonly subir: (archivos: readonly File[]) => Promise<readonly Imagen[]>
}

export const MediosCtx = createContext<Medios>({
  repo: null,
  imagenes: new Map(),
  subir: async () => [],
})
export const useMedios = (): Medios => useContext(MediosCtx)

export interface Aviso {
  readonly id: number
  readonly texto: string
  readonly tipo: 'info' | 'error'
  readonly deshacer?: boolean
}

/** Mensajes breves abajo de la pantalla («Borraste el capítulo. Deshacer»). */
export const AvisosCtx = createContext<(texto: string, opciones?: { tipo?: 'info' | 'error'; deshacer?: boolean }) => void>(
  () => undefined,
)
export const useAvisar = () => useContext(AvisosCtx)

/** «⌘» en Mac y iPad, «Ctrl» en el resto. */
export const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/u.test(navigator.platform || navigator.userAgent)
    ? '⌘'
    : 'Ctrl'

/** Si el evento de teclado lleva la tecla de comando de la plataforma. */
export const conMod = (e: { metaKey: boolean; ctrlKey: boolean }): boolean => (MOD === '⌘' ? e.metaKey : e.ctrlKey)
