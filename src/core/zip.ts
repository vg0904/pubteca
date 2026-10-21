/**
 * Empaquetado del EPUB. Port de generar_epub.py 1008-1038.
 *
 * Aqui es donde EPUBCheck es mas quisquilloso, y con razon: el formato EPUB
 * exige que el `mimetype` sea la PRIMERA entrada del ZIP, sin comprimir y sin
 * campos extra. Dos mensajes concretos:
 *
 *   PKG-006  el mimetype falta o no es el primer archivo
 *   PKG-005  el mimetype tiene un campo extra
 *
 * fflate sirve porque con `{level: 0}` escribe metodo de compresion 0 (STORE de
 * verdad, no un deflate con bloques stored) y su escritor de cabeceras no
 * anade ningun campo extra automatico. Verificado en su codigo fuente.
 *
 * OJO con la otra API de la misma biblioteca: las clases ZipDeflate y
 * AsyncZipDeflate fijan compression = 8 IGNORANDO el level, asi que para STORE
 * en streaming habria que usar ZipPassThrough. Aqui se usa zipSync, que si
 * respeta el level.
 */
import { deflateSync, strToU8, zipSync, type Zippable } from 'fflate'

export const MIMETYPE = 'application/epub+zip'

export const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`

/** Lo que pide Apple Books para que use las fuentes incluidas. */
export const OPCIONES_APPLE = `<?xml version="1.0" encoding="UTF-8"?>
<display_options>
  <platform name="*">
    <option name="specified-fonts">true</option>
  </platform>
</display_options>
`

/** Las imagenes: lo unico que puede venir ya comprimido. */
const IMAGEN = /\.(png|jpe?g|gif)$/iu

/** Cuanto de la imagen se prueba a comprimir para decidir. */
const MUESTRA = 64 * 1024

/**
 * Hasta aqui una imagen se comprime siempre, como en el Python: cuesta unos
 * milisegundos, y en una imagen pequeña lo que se gana suele estar en los
 * metadatos del principio (medido: la portada JPEG de un libro real, de 155 KB,
 * baja un 16 % con deflate y su centro no se comprime nada).
 */
const SIEMPRE_HASTA = 256 * 1024

/**
 * Si merece la pena pasar una imagen por deflate.
 *
 * DIVERGENCIA: el Python comprime todo. Un PNG de Procreate o un JPEG ya
 * vienen comprimidos, y deflate no les quita casi nada y cuesta mucho: medido
 * con 40 ilustraciones (173 MB), el motor bloqueaba la pagina 7,7 s en un Mac
 * y los dos EPUB salian del mismo tamaño que las imagenes. Pero no TODAS
 * vienen bien comprimidas (algunas herramientas exportan PNG casi sin
 * comprimir, y las del libro de prueba son colores planos), y guardarlas tal
 * cual haria el libro mas pesado. Asi que las pequeñas se comprimen siempre, y
 * en las grandes se prueba con un trozo del centro: si deflate le quita al
 * menos un 10 %, la imagen entera se comprime.
 *
 * El contenido de cada archivo es identico en los dos casos; solo cambia como
 * va dentro del zip, y el formato EPUB admite las dos formas para todo salvo el
 * mimetype, que va SIEMPRE sin comprimir.
 */
export function mereceComprimir(datos: Uint8Array): boolean {
  if (datos.length <= SIEMPRE_HASTA) return true
  // Del CENTRO del archivo: el trozo tiene que ser de la imagen, no de sus
  // metadatos, y un JPEG puede llevar delante decenas de KB de perfil de color
  // o de EXIF, que si se comprimen bien.
  const desde = Math.max(0, Math.floor((datos.length - MUESTRA) / 2))
  const trozo = datos.subarray(desde, desde + MUESTRA)
  if (trozo.length === 0) return false
  return deflateSync(trozo, { level: 1 }).length < trozo.length * 0.9
}

export interface EntradaZip {
  readonly ruta: string
  readonly datos: Uint8Array
}

/**
 * Arma el .epub.
 *
 * `fecha` se inyecta: el core no lee el reloj. Con una fecha fija, dos
 * generaciones del mismo libro dan archivos identicos byte a byte, lo que
 * hace mucho mas facil comparar y depurar.
 */
export function escribirEpub(archivos: readonly EntradaZip[], fecha: Date): Uint8Array {
  const mtime = fecha.getTime()
  const entradas: Zippable = {}

  // El mimetype PRIMERO y sin comprimir. El orden de claves de un objeto JS es
  // el de insercion para claves no numericas, y ninguna ruta del EPUB lo es.
  entradas['mimetype'] = [strToU8(MIMETYPE), { level: 0, mtime }]
  for (const a of archivos) {
    const comprimir = !IMAGEN.test(a.ruta) || mereceComprimir(a.datos)
    entradas[a.ruta] = [a.datos, { level: comprimir ? 6 : 0, mtime }]
  }

  return zipSync(entradas, { mtime })
}
