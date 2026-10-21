/**
 * Elegir y soltar archivos.
 *
 * Elegir abre el selector del sistema con un <input type="file"> creado al
 * vuelo. Tiene que llamarse DENTRO del clic del autor: Safari no abre el
 * selector fuera de una activacion del usuario.
 */
export function elegirArchivos(acepta: string, varios: boolean): Promise<File[]> {
  return new Promise((resolver) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = acepta
    input.multiple = varios
    input.style.display = 'none'
    input.addEventListener('change', () => {
      resolver(Array.from(input.files ?? []))
      input.remove()
    })
    // Si el autor cierra el selector sin elegir, no hay evento en todos los
    // navegadores: la promesa se queda sin resolver y no pasa nada.
    input.addEventListener('cancel', () => {
      resolver([])
      input.remove()
    })
    document.body.appendChild(input)
    input.click()
  })
}

export function esArrastreDeArchivos(e: { dataTransfer: DataTransfer | null }): boolean {
  return Boolean(e.dataTransfer?.types.includes('Files'))
}

const EXT_IMAGEN = /\.(png|jpe?g)$/iu

/**
 * Las imagenes de una lista de archivos. Se mira tambien la extension: el
 * `type` llega vacio para algunos archivos en Safari. Lo que no lo sea se
 * deja pasar igual, y es la inspeccion de bytes la que dice que es de verdad
 * (un .heic renombrado a .jpg, por ejemplo).
 */
export function imagenesDe(lista: FileList | readonly File[]): File[] {
  return Array.from(lista).filter((f) => f.type.startsWith('image/') || EXT_IMAGEN.test(f.name))
}
