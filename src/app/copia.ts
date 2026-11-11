/**
 * La copia de seguridad: un .zip con la estructura de carpetas del generador,
 * MAS un `proyecto.json`.
 *
 * Las carpetas son el mismo `exportar()` que alimenta al motor, empaquetado tal
 * cual: libro.txt, capitulos/, ilustraciones/, portada/, extras/ y fuentes/.
 * Asi la copia es formato abierto: se lee con cualquier editor de texto, y el
 * generar_epub.py de referencia la convierte en los mismos dos EPUB.
 *
 * `proyecto.json` es el modelo de la app entero, y es lo que hace la copia SIN
 * PERDIDAS: el dialecto de las carpetas no puede guardar que una ilustracion es
 * decorativa, el nombre con que el autor subio cada imagen, ni con que titulo y
 * autor se descargo el libro por ultima vez (que es lo que avisa de un cambio
 * de identidad ante las tiendas). Al abrir la copia se usa el json, salvo que
 * los archivos de texto se hayan cambiado fuera de Pubteca: ver abrir-copia.ts.
 */
import { zipSync, type Zippable } from 'fflate'
import { esFicha, type Archivo } from '../core/proyecto'
import { nombreSeguro } from '../core/texto'
import { escribirZipSegmentado, unirSegmentos, type EntradaSegmentada, type Segmento } from '../core/zip'
import type { Exportado } from './exportar'
import { versionNecesaria, type Imagen, type Medio, type Proyecto } from './modelo'

/** Lo que va en proyecto.json. */
export interface ProyectoJson {
  readonly formato: 'pubteca'
  /**
   * La version del MODELO, la MINIMA que el libro necesita: la misma regla que
   * en IndexedDB (ver `VERSION_PROYECTO`).
   */
  readonly version: number
  /** Cuando se hizo la copia, en ISO 8601. */
  readonly creada: string
  readonly proyecto: Proyecto
  /** id de imagen -> donde estan sus bytes en el .zip y como la llamo el autor. */
  readonly imagenes: Readonly<Record<string, { readonly ruta: string; readonly nombreOriginal: string }>>
  /**
   * id de audio o video -> donde esta en el .zip y lo que no se puede volver a
   * sacar de sus bytes sin leerlos. Solo si el libro tiene medios: la copia de
   * un libro sin ellos es la de siempre.
   */
  readonly medios?: Readonly<Record<string, MedioDeJson>>
}

export interface MedioDeJson {
  readonly ruta: string
  readonly nombreOriginal: string
  readonly tipo: Medio['tipo']
  readonly segundos: number
  readonly hz?: number
  readonly canales?: number
  readonly ancho?: number
  readonly alto?: number
}

export const NOMBRE_JSON = 'proyecto.json'

const LEEME = `Copia de seguridad de Pubteca

Esta carpeta es tu libro entero, en archivos de texto y tus imagenes:

  libro.txt        los datos del libro (titulo, autor...)
  capitulos/       un archivo por capitulo, en el orden del libro
  extras/          dedicatoria, epigrafe y paginas del principio y del final
  ilustraciones/   los dibujos de cada capitulo
  portada/         portada, contraportada y logo
  fuentes/         la letra del EPUB de Apple Books (licencia OFL)

  proyecto.json    todo lo anterior tal como lo guarda Pubteca

Guarda este .zip fuera del navegador (en tu disco, en la nube o en un correo a
ti mismo): el navegador puede borrar lo que guarda si pasas tiempo sin abrir
Pubteca.

Para volver a abrirlo: en Pubteca, «Abrir copia (.zip)», en la pantalla de
inicio. Se abre como un libro nuevo, asi que no pisa nada.
`

const LEEME_MEDIOS = `
  medios/          el audio y el video (solo van en el EPUB de Apple Books),
                   y el poster de cada video, con el mismo nombre
`

/**
 * La copia en segmentos: con un hueco por cada audio o video, como el EPUB
 * (ver `escribirZipSegmentado`). La app la arma con `blobDeSegmentos`, y los
 * videos no pasan por memoria.
 *
 * Un libro SIN medios da exactamente la copia de siempre, en un solo trozo.
 */
export function segmentosDeCopia(
  e: Exportado,
  proyecto: Proyecto,
  imagenes: ReadonlyMap<string, Imagen>,
  ahora: Date,
  medios: ReadonlyMap<string, Medio> = new Map(),
): Segmento[] {
  const p = e.proyecto
  const version = versionNecesaria(proyecto)
  const deMedios = [...e.rutasMedios].flatMap(([id, ruta]): [string, MedioDeJson][] => {
    const m = medios.get(id)
    if (!m) return []
    const { hz, canales, ancho, alto } = m
    return [
      [
        id,
        {
          ruta,
          nombreOriginal: m.nombreOriginal,
          tipo: m.tipo,
          segundos: m.segundos,
          ...(hz !== undefined ? { hz } : {}),
          ...(canales !== undefined ? { canales } : {}),
          ...(ancho !== undefined ? { ancho } : {}),
          ...(alto !== undefined ? { alto } : {}),
        },
      ],
    ]
  })
  const json: ProyectoJson = {
    formato: 'pubteca',
    version,
    creada: ahora.toISOString(),
    proyecto: { ...proyecto, version },
    imagenes: Object.fromEntries(
      [...e.rutas].map(([id, ruta]) => [id, { ruta, nombreOriginal: imagenes.get(id)?.nombreOriginal ?? ruta }]),
    ),
    ...(deMedios.length > 0 ? { medios: Object.fromEntries(deMedios) } : {}),
  }
  const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)
  const conMedios = (p.medios ?? []).length > 0
  const textos: [string, Uint8Array][] = [
    ['LEEME.txt', utf8(conMedios ? LEEME.replace('  proyecto.json', `${LEEME_MEDIOS.slice(1)}\n  proyecto.json`) : LEEME)],
    [NOMBRE_JSON, utf8(JSON.stringify(json, null, 1))],
    ...(p.libroTxt !== undefined ? [['libro.txt', utf8(p.libroTxt)] as [string, Uint8Array]] : []),
    ...[...p.capitulos, ...p.extras].map((a): [string, Uint8Array] => [a.ruta, a.bytes]),
  ]
  // Las imagenes y las fuentes ya vienen comprimidas: guardarlas tal cual es
  // mas rapido y no cambia nada.
  const binarios = [...p.ilustraciones, ...p.portada, ...p.fuentes]

  if (!conMedios) {
    const entradas: Zippable = {}
    for (const [ruta, datos] of textos) entradas[ruta] = [datos, { level: 6 }]
    for (const a of binarios) entradas[a.ruta] = [a.bytes, { level: 0 }]
    return [zipSync(entradas)]
  }

  const entradas: EntradaSegmentada[] = [
    ...textos.map(([ruta, datos]) => ({ ruta, datos })),
    ...binarios.map((a) => ({ ruta: a.ruta, datos: a.bytes })),
    ...(p.medios ?? []).map((a): EntradaSegmentada =>
      esFicha(a) ? { ruta: a.ruta, hueco: { medio: a.ruta, tamano: a.tamano, crc32: a.crc32 } } : { ruta: a.ruta, datos: a.bytes },
    ),
  ]
  const deTexto = new Set(textos.map(([ruta]) => ruta))
  return escribirZipSegmentado(entradas, ahora, (x) => (deTexto.has(x.ruta) ? 6 : 0))
}

/**
 * La copia entera en memoria. Solo si el motor tiene los bytes de todos los
 * medios (Node, los tests); la app usa `segmentosDeCopia`.
 */
export function zipDeCopia(e: Exportado, proyecto: Proyecto, imagenes: ReadonlyMap<string, Imagen>, ahora: Date, medios: ReadonlyMap<string, Medio> = new Map()): Uint8Array {
  const segmentos = segmentosDeCopia(e, proyecto, imagenes, ahora, medios)
  const conBytes = new Map((e.proyecto.medios ?? []).flatMap((a) => (esFicha(a) ? [] : [[a.ruta, a] as [string, Archivo]])))
  return unirSegmentos(segmentos, (ruta) => {
    const a = conBytes.get(ruta)
    if (!a) throw new Error(`${ruta}: la copia necesita sus bytes.`)
    return a.bytes
  })
}

export function nombreDeCopia(titulo: string, ahora: Date): string {
  const base = titulo.trim() ? nombreSeguro(titulo) : 'libro'
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${base}-copia-${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}.zip`
}

/**
 * Descarga unos bytes con un <a download>. Safari descarta las descargas que
 * perdieron la activacion del usuario, asi que hay que llamarla dentro del clic
 * (o muy poco despues): los EPUB se generan antes y se descargan en otro clic.
 */
export function descargar(datos: Uint8Array | Blob, nombre: string, tipo: string): void {
  // Un Blob va tal cual: puede estar hecho de videos que viven en disco, y
  // copiarlo aqui los cargaria en memoria.
  const blob = datos instanceof Blob ? datos : new Blob([datos as Uint8Array<ArrayBuffer>], { type: tipo })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
