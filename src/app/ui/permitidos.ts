/** Que bloques admite cada contenedor. La dedicatoria solo lleva parrafos y versos. */
export interface Permitidos {
  readonly subtitulo: boolean
  readonly escena: boolean
  readonly versos: boolean
  readonly ilustracion: boolean
}

export const TODO_PERMITIDO: Permitidos = { subtitulo: true, escena: true, versos: true, ilustracion: true }

/** Una dedicatoria y un epigrafe solo llevan parrafos y versos: el motor ignora lo demas. */
export const SOLO_TEXTO: Permitidos = { subtitulo: false, escena: false, versos: true, ilustracion: false }

/** Las paginas con titulo admiten texto y escenas; las ilustraciones van en los capitulos. */
export const PAGINA: Permitidos = { subtitulo: true, escena: true, versos: true, ilustracion: false }
