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
import { zipSync, strToU8, type Zippable } from 'fflate'

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
    entradas[a.ruta] = [a.datos, { level: 6, mtime }]
  }

  return zipSync(entradas, { mtime })
}
