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
import { deflateSync, inflateSync, strToU8, zipSync, type Zippable } from 'fflate'
import { crc32 } from './crc32'

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

/** Las imagenes: lo unico que puede venir ya comprimido, ademas de los medios. */
const IMAGEN = /\.(png|jpe?g|gif)$/iu

/**
 * Audio y video van SIEMPRE sin comprimir. Ya vienen comprimidos (AAC, H.264),
 * deflate no les quita nada, y pasar cientos de MB por el compresor congela la
 * generacion. Y sin comprimir, un lector puede leer el video directamente del
 * zip sin descomprimirlo entero.
 */
const MEDIO = /\.(m4v|m4a|mp4)$/iu

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
    const comprimir = MEDIO.test(a.ruta) ? false : !IMAGEN.test(a.ruta) || mereceComprimir(a.datos)
    entradas[a.ruta] = [a.datos, { level: comprimir ? 6 : 0, mtime }]
  }

  return zipSync(entradas, { mtime })
}

// ---------------------------------------------------------------------------
// El zip en segmentos: con huecos donde van el audio y el video
// ---------------------------------------------------------------------------

/**
 * Donde van los bytes de un audio o un video que el motor no tiene. `medio` es
 * su ruta en el proyecto (`medios/cap01-v01.m4v`): quien llama sabe de donde
 * sacarlos.
 */
export interface Hueco {
  readonly medio: string
  readonly tamano: number
}

/** Un trozo del archivo: bytes ya escritos, o un hueco que rellena quien llama. */
export type Segmento = Uint8Array | Hueco

export function esHueco(s: Segmento): s is Hueco {
  return !(s instanceof Uint8Array)
}

/** Una entrada cuyos bytes no estan aqui: solo su tamaño y su CRC-32. */
export interface EntradaHueco {
  readonly ruta: string
  readonly hueco: { readonly medio: string; readonly tamano: number; readonly crc32: number }
}

export type EntradaSegmentada = EntradaZip | EntradaHueco

export function esEntradaHueco(e: EntradaSegmentada): e is EntradaHueco {
  return 'hueco' in e
}

/** El limite del zip sin ZIP64: tamaños y desplazamientos de 32 bits. */
const LIMITE_ZIP = 0xffffffff

/** Fecha y hora de MS-DOS, en hora LOCAL: lo mismo que escribe fflate. */
function horaDos(fecha: Date): number {
  return (
    (((fecha.getFullYear() - 1980) << 25) |
      ((fecha.getMonth() + 1) << 21) |
      (fecha.getDate() << 16) |
      (fecha.getHours() << 11) |
      (fecha.getMinutes() << 5) |
      (fecha.getSeconds() >> 1)) >>>
    0
  )
}

/**
 * Escribe un zip como lista de segmentos: los bytes de todo lo que el motor
 * tiene, y un HUECO por cada entrada de la que solo sabe el tamaño y el CRC.
 *
 * Por que: un EPUB de Apple Books con 400 MB de video no puede montarse como
 * un solo Uint8Array en un iPad. Asi el motor sigue sincrono y puro (decide el
 * orden, las cabeceras y el directorio central), y la app arma el archivo con
 * `new Blob([trozo, videoDelAlmacen, trozo...])`, que no copia nada: el video
 * se lee del disco al descargarlo.
 *
 * Las entradas con hueco van SIEMPRE sin comprimir (STORE): sus bytes no
 * pasan por aqui, y ademas ya vienen comprimidos. La cabecera local de cada
 * una cierra el segmento anterior, asi que la lectura (`archivosDeSegmentos`)
 * nunca tiene que partir una entrada entre dos trozos.
 *
 * Sin ZIP64: un EPUB de Apple Books no puede pasar de 2 GB, y la app lo
 * bloquea antes. Si aun asi se pasa de 4 GiB, se lanza un error en vez de
 * escribir un zip corrupto.
 */
export function escribirZipSegmentado(
  entradas: readonly EntradaSegmentada[],
  fecha: Date,
  nivel: (e: EntradaZip) => number,
): Segmento[] {
  const segmentos: Segmento[] = []
  let trozos: Uint8Array[] = []
  let enTrozos = 0
  let desplazamiento = 0
  const central: Uint8Array[] = []
  const dos = horaDos(fecha)
  const codificar = new TextEncoder()

  const poner = (b: Uint8Array): void => {
    trozos.push(b)
    enTrozos += b.length
    desplazamiento += b.length
  }
  const cerrarTrozo = (): void => {
    if (enTrozos === 0) return
    const b = new Uint8Array(enTrozos)
    let i = 0
    for (const t of trozos) {
      b.set(t, i)
      i += t.length
    }
    segmentos.push(b)
    trozos = []
    enTrozos = 0
  }

  for (const e of entradas) {
    const nombre = codificar.encode(e.ruta)
    // Bit 11: el nombre va en UTF-8. Solo si hace falta, como fflate.
    const banderas = nombre.length !== e.ruta.length ? 0x800 : 0
    let metodo = 0
    let crc: number
    let tamano: number
    let datos: Uint8Array | null
    if (esEntradaHueco(e)) {
      crc = e.hueco.crc32
      tamano = e.hueco.tamano
      datos = null
    } else {
      crc = crc32(e.datos)
      tamano = e.datos.length
      const n = nivel(e)
      datos = n > 0 ? deflateSync(e.datos, { level: n as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }) : e.datos
      metodo = n > 0 ? 8 : 0
    }
    const comprimido = datos ? datos.length : tamano
    const local = new Uint8Array(30 + nombre.length)
    const dl = new DataView(local.buffer)
    dl.setUint32(0, 0x04034b50, true)
    dl.setUint16(4, 20, true)
    dl.setUint16(6, banderas, true)
    dl.setUint16(8, metodo, true)
    dl.setUint32(10, dos, true)
    dl.setUint32(14, crc, true)
    dl.setUint32(18, comprimido, true)
    dl.setUint32(22, tamano, true)
    dl.setUint16(26, nombre.length, true)
    dl.setUint16(28, 0, true)
    local.set(nombre, 30)

    const cd = new Uint8Array(46 + nombre.length)
    const dc = new DataView(cd.buffer)
    dc.setUint32(0, 0x02014b50, true)
    dc.setUint16(4, 20, true)
    dc.setUint16(6, 20, true)
    dc.setUint16(8, banderas, true)
    dc.setUint16(10, metodo, true)
    dc.setUint32(12, dos, true)
    dc.setUint32(16, crc, true)
    dc.setUint32(20, comprimido, true)
    dc.setUint32(24, tamano, true)
    dc.setUint16(28, nombre.length, true)
    dc.setUint32(42, desplazamiento, true)
    cd.set(nombre, 46)
    central.push(cd)

    poner(local)
    if (datos) {
      poner(datos)
    } else if (esEntradaHueco(e)) {
      cerrarTrozo()
      segmentos.push({ medio: e.hueco.medio, tamano })
      desplazamiento += tamano
    }
    if (desplazamiento > LIMITE_ZIP) throw new Error('El archivo pasa de 4 GB: un EPUB no puede ser tan grande.')
  }

  const inicioCentral = desplazamiento
  for (const cd of central) poner(cd)
  const fin = new Uint8Array(22)
  const df = new DataView(fin.buffer)
  df.setUint32(0, 0x06054b50, true)
  df.setUint16(8, entradas.length, true)
  df.setUint16(10, entradas.length, true)
  df.setUint32(12, desplazamiento - inicioCentral, true)
  df.setUint32(16, inicioCentral, true)
  poner(fin)
  cerrarTrozo()
  return segmentos
}

/**
 * El EPUB en segmentos: el mismo orden y las mismas reglas que `escribirEpub`
 * (el mimetype primero y sin comprimir, las imagenes solo si merece la pena),
 * con un hueco por cada audio o video. Los medios no necesitan regla aqui: van
 * siempre como hueco, y un hueco va siempre sin comprimir.
 */
export function escribirEpubSegmentado(archivos: readonly EntradaSegmentada[], fecha: Date): Segmento[] {
  return escribirZipSegmentado(
    [{ ruta: 'mimetype', datos: strToU8(MIMETYPE) }, ...archivos],
    fecha,
    (e) => (e.ruta === 'mimetype' ? 0 : !IMAGEN.test(e.ruta) || mereceComprimir(e.datos) ? 6 : 0),
  )
}

/** Cuanto pesa el archivo entero, huecos incluidos. */
export function tamanoDe(segmentos: readonly Segmento[]): number {
  return segmentos.reduce((n, s) => n + (esHueco(s) ? s.tamano : s.length), 0)
}

/**
 * El archivo entero en memoria, rellenando cada hueco con `medio`. Para Node
 * y los tests; en el navegador se arma un Blob, que no copia.
 */
export function unirSegmentos(segmentos: readonly Segmento[], medio: (ruta: string) => Uint8Array): Uint8Array {
  const partes = segmentos.map((s) => {
    if (!esHueco(s)) return s
    const b = medio(s.medio)
    if (b.length !== s.tamano) throw new Error(`${s.medio}: mide ${b.length} bytes y el EPUB espera ${s.tamano}.`)
    return b
  })
  const salida = new Uint8Array(partes.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of partes) {
    salida.set(p, i)
    i += p.length
  }
  return salida
}

/**
 * Los archivos de un zip en segmentos, sin tocar los huecos.
 *
 * Es lo que necesita la vista previa: el texto, las imagenes y las fuentes,
 * pero no los videos (esos se reproducen desde el almacen). Lee el directorio
 * central del ultimo segmento y saca cada entrada del segmento donde esta; las
 * que caen en un hueco se devuelven en `huecos`, con su ruta en el proyecto.
 */
export function archivosDeSegmentos(segmentos: readonly Segmento[]): {
  archivos: Map<string, Uint8Array>
  huecos: Map<string, string>
} {
  // Donde empieza cada segmento dentro del archivo entero.
  const inicios: number[] = []
  let n = 0
  for (const s of segmentos) {
    inicios.push(n)
    n += esHueco(s) ? s.tamano : s.length
  }
  const ultimo = segmentos[segmentos.length - 1]
  if (!ultimo || esHueco(ultimo)) throw new Error('El zip no termina en su directorio central.')
  const du = new DataView(ultimo.buffer, ultimo.byteOffset, ultimo.byteLength)
  let eocd = ultimo.length - 22
  while (eocd >= 0 && du.getUint32(eocd, true) !== 0x06054b50) eocd -= 1
  if (eocd < 0) throw new Error('El zip no tiene directorio central.')
  const entradas = du.getUint16(eocd + 10, true)
  let p = du.getUint32(eocd + 16, true) - (inicios[inicios.length - 1] as number)

  const archivos = new Map<string, Uint8Array>()
  const huecos = new Map<string, string>()
  const decodificar = new TextDecoder('utf-8')
  for (let k = 0; k < entradas; k++) {
    const metodo = du.getUint16(p + 10, true)
    const comprimido = du.getUint32(p + 20, true)
    const largoNombre = du.getUint16(p + 28, true)
    const largoExtra = du.getUint16(p + 30, true)
    const largoComentario = du.getUint16(p + 32, true)
    const local = du.getUint32(p + 42, true)
    const ruta = decodificar.decode(ultimo.subarray(p + 46, p + 46 + largoNombre))
    p += 46 + largoNombre + largoExtra + largoComentario

    // El segmento que contiene la cabecera local.
    let i = inicios.length - 1
    while (i > 0 && (inicios[i] as number) > local) i -= 1
    const s = segmentos[i] as Segmento
    if (esHueco(s)) throw new Error(`${ruta}: la cabecera cae dentro de un hueco.`)
    const o = local - (inicios[i] as number)
    const dl = new DataView(s.buffer, s.byteOffset, s.byteLength)
    const datos = o + 30 + dl.getUint16(o + 26, true) + dl.getUint16(o + 28, true)
    if (datos >= s.length) {
      // Los datos empiezan en el segmento siguiente: es un hueco.
      const h = segmentos[i + 1]
      if (h && esHueco(h)) huecos.set(ruta, h.medio)
      continue
    }
    const crudo = s.subarray(datos, datos + comprimido)
    archivos.set(ruta, metodo === 8 ? inflateSync(crudo) : crudo)
  }
  return { archivos, huecos }
}
