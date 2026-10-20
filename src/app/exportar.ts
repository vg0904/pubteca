/**
 * Modelo de la app -> `Proyecto` del motor.
 *
 * Es el puente, y es deliberadamente el UNICO camino: la vista previa, los dos
 * EPUB y el `.zip` del proyecto salen todos de aqui. Asi lo que el autor ve en
 * la app es lo que hay en el archivo que descarga, y lo que hay en el .zip es
 * lo que entiende el generar_epub.py de referencia.
 *
 * Aqui se decide tambien el NOMBRE de archivo de cada imagen. En el modelo las
 * imagenes se referencian por id, nunca por nombre: eso es lo que vuelve
 * imposibles dos errores completos del reporte original (una marca que pide un
 * archivo que no existe, y una imagen huerfana en ilustraciones/).
 */
import { nombreSeguro } from '../core/texto'
import { archivo, type Archivo, type Proyecto as ProyectoMotor } from '../core/proyecto'
import type { Imagen, Proyecto, RolPortada } from './modelo'
import { serializarCapitulo, serializarExtra, type Aviso } from './serializar'

/** Los bytes de cada imagen del proyecto, por id. */
export type Bytes = ReadonlyMap<string, Uint8Array>

export interface Exportado {
  readonly proyecto: ProyectoMotor
  /** Lo que no se pudo representar al serializar. La interfaz lo muestra. */
  readonly avisos: readonly Aviso[]
  /** id de imagen -> nombre con el que entro al proyecto. Para la vista previa. */
  readonly nombres: ReadonlyMap<string, string>
}

const EXT: Record<Imagen['tipo'], string> = { png: '.png', jpeg: '.jpg' }

function extensionDe(imagenes: ReadonlyMap<string, Imagen>, id: string): string {
  return EXT[imagenes.get(id)?.tipo ?? 'png']
}

/**
 * libro.txt, en el mismo formato `clave: valor` que lee el motor.
 *
 * Se escriben TODAS las claves, incluso las vacias, para que el archivo sirva
 * de plantilla si el autor lo abre a mano en el .zip.
 */
function libroTxt(p: Proyecto): string {
  const d = p.datos
  return [
    '# Datos del libro. Los rellena la app; se pueden editar a mano.',
    '',
    `titulo: ${d.titulo}`,
    `subtitulo: ${d.subtitulo}`,
    `autor: ${d.autor}`,
    `sello: ${d.sello}`,
    `idioma: ${d.idioma}`,
    '',
    `descripcion: ${d.descripcion}`,
    '',
    `isbn: ${d.isbn}`,
    `fecha_publicacion: ${d.fechaPublicacion}`,
    '',
    `derechos: ${d.derechos}`,
    '',
    `incluir_contraportada: ${d.incluirContraportada ? 'si' : 'no'}`,
    `separador_de_escena: ${d.separadorDeEscena}`,
    `fuente: ${d.fuente}`,
    '',
  ].join('\n')
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

/**
 * Arma el proyecto que el motor sabe leer.
 *
 * Los nombres de archivo se generan aqui, no los elige el autor:
 *   - las ilustraciones de un capitulo, `capNN-KK` segun su posicion, contando
 *     primero las laminas de apertura;
 *   - las laminas a color del inicio, `color-NN`;
 *   - la portada y el logo, por su rol.
 */
export function exportar(
  p: Proyecto,
  imagenes: ReadonlyMap<string, Imagen>,
  bytes: Bytes,
  fuentes: readonly Archivo[] = [],
): Exportado {
  const avisos: Aviso[] = []
  const nombres = new Map<string, string>()
  const ilustraciones: Archivo[] = []

  const registrar = (id: string, base: string): string => {
    const yaEsta = nombres.get(id)
    if (yaEsta) return yaEsta
    const nombre = `${base}${extensionDe(imagenes, id)}`
    nombres.set(id, nombre)
    const datos = bytes.get(id)
    if (datos) ilustraciones.push(archivo(`ilustraciones/${nombre}`, datos))
    return nombre
  }

  // Laminas a color: van solas al inicio del libro, sin marcarse en el texto.
  for (const [i, id] of p.laminas.entries()) {
    registrar(id, `color-${String(i + 1).padStart(2, '0')}`)
  }

  const capitulos: Archivo[] = []
  for (const [i, cap] of p.capitulos.entries()) {
    const nn = String(i + 1).padStart(2, '0')
    let k = 0
    // Las aperturas van primero: en el texto aparecen antes de la cabecera.
    for (const a of cap.aperturas) {
      k += 1
      registrar(a.imagenId, `cap${nn}-${String(k).padStart(2, '0')}`)
    }
    for (const b of cap.bloques) {
      if (b.tipo !== 'ilustracion') continue
      k += 1
      registrar(b.imagenId, `cap${nn}-${String(k).padStart(2, '0')}`)
    }

    const s = serializarCapitulo(cap, p.datos.separadorDeEscena, (id) => {
      const nombre = nombres.get(id)
      // Sin extension: la marca la acepta con o sin ella, y asi el .md se lee
      // igual que lo escribiria un autor a mano.
      return nombre ? nombre.replace(/\.(png|jpg)$/u, '') : id
    })
    avisos.push(...s.avisos)
    capitulos.push(archivo(`capitulos/cap${nn}.md`, utf8(s.texto)))
  }

  const extras: Archivo[] = []
  for (const extra of p.extras) {
    const s = serializarExtra(extra, p.datos.separadorDeEscena, (id) => nombres.get(id) ?? id)
    avisos.push(...s.avisos)
    // El nombre decide a donde va: el motor enruta por el nombre del archivo.
    const base = nombreSeguro(extra.nombreArchivo) || 'extra'
    const nombre =
      extra.tipo === 'dedicatoria'
        ? 'dedicatoria'
        : extra.tipo === 'epigrafe'
          ? 'epigrafe'
          : extra.donde === 'inicio'
            ? `inicio-${base}`
            : base
    extras.push(archivo(`extras/${nombre}.md`, utf8(s.texto)))
  }

  const ROLES: Record<RolPortada, string> = {
    portada: 'portada',
    contraportada: 'contraportada',
    logo: 'logo',
    logoBlanco: 'logo-blanco',
  }
  const portada: Archivo[] = []
  for (const [rol, base] of Object.entries(ROLES) as [RolPortada, string][]) {
    const id = p.portada[rol]
    if (!id) continue
    const datos = bytes.get(id)
    if (!datos) continue
    const nombre = `${base}${extensionDe(imagenes, id)}`
    nombres.set(id, nombre)
    portada.push(archivo(`portada/${nombre}`, datos))
  }

  return {
    proyecto: {
      libroTxt: libroTxt(p),
      capitulos,
      ilustraciones,
      portada,
      extras,
      fuentes: [...fuentes],
    },
    avisos,
    nombres,
  }
}
