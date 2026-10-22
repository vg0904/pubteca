/**
 * Los contextos de la interfaz. Son pocos a proposito: el estado viaja por
 * props desde arriba, y por contexto solo va lo que es estable (despachar) o
 * lo que cambia con el proyecto (las imagenes).
 */
import { createContext, useContext, type Dispatch } from 'react'
import { ui as es } from '../../i18n/es'
import { IDIOMA_POR_DEFECTO, type Idioma, type Ui } from '../../i18n'
import type { Accion } from '../estado'
import type { Imagen } from '../modelo'
import type { Repositorio } from '../repositorio'

/**
 * Los textos de la interfaz, en el idioma elegido.
 *
 * Van por contexto y NO por un `import` directo a `i18n/es`, que es como
 * estaban: un modulo importado se resuelve una vez y no hay forma de cambiar
 * de idioma sin recargar. Con el contexto, cambiar el idioma vuelve a pintar
 * la interfaz entera y nada se queda a medias.
 *
 * Por el mismo motivo, `ui` no se puede leer en el cuerpo de un modulo (un
 * `const X = ui.algo` arriba del archivo se congelaria en el idioma inicial):
 * se lee con este hook, dentro del componente. Lo vigila tests/i18n.test.ts.
 */
export const TextosCtx = createContext<Ui>(es)
export const useTextos = (): Ui => useContext(TextosCtx)

/** Que idioma habla la interfaz y como cambiarlo. Lo sirve App. */
export interface Lengua {
  readonly idioma: Idioma
  readonly cambiar: (i: Idioma) => void
}

export const LenguaCtx = createContext<Lengua>({ idioma: IDIOMA_POR_DEFECTO, cambiar: () => undefined })
export const useLengua = (): Lengua => useContext(LenguaCtx)

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

/**
 * Abre el cuadro de ajustar una imagen.
 *
 * Va por contexto porque se llama desde cuatro sitios (la tarjeta de una
 * ilustracion, la apertura de un capitulo, la portada y las laminas) y el
 * cuadro lo pinta App una sola vez. Quien lo abre no dice donde esta la
 * imagen: la accion `sustituirImagen` la cambia en todo el proyecto.
 */
export const AjustarCtx = createContext<(imagen: Imagen) => void>(() => undefined)
export const useAjustar = (): ((imagen: Imagen) => void) => useContext(AjustarCtx)

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
