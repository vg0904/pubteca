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
import { archivo, ficha, type Archivo, type Ficha, type Proyecto as ProyectoMotor } from '../core/proyecto'
import type { Imagen, Medio, Proyecto, RolPortada } from './modelo'
import { serializarCapitulo, serializarExtra, type Aviso } from './serializar'

/**
 * Los bytes de cada imagen y de cada audio o video del proyecto, por id. Los
 * ids de imagenes y de medios no se pisan: los dos salen de `crearId`.
 */
export type Bytes = ReadonlyMap<string, Uint8Array>

export interface Exportado {
  readonly proyecto: ProyectoMotor
  /** Lo que no se pudo representar al serializar. La interfaz lo muestra. */
  readonly avisos: readonly Aviso[]
  /** id de imagen -> nombre con el que entro al proyecto. Para la vista previa. */
  readonly nombres: ReadonlyMap<string, string>
  /**
   * id de imagen -> la ruta donde estan sus bytes en el proyecto del motor
   * (`ilustraciones/cap01-02.png`, `portada/logo.png`). Si una imagen va en dos
   * sitios, la primera. Es lo que la copia (.zip) apunta en proyecto.json para
   * poder devolver cada imagen a su sitio al abrirla.
   */
  readonly rutas: ReadonlyMap<string, string>
  /** id de audio o video -> su ruta en el proyecto del motor (`medios/cap03-v01.m4v`). */
  readonly rutasMedios: ReadonlyMap<string, string>
  /**
   * id de extra -> el nombre de su archivo en `extras/` (`dedicatoria.md`).
   * El impreso los ordena por id, y el core los conoce por ese nombre.
   */
  readonly archivosExtras: ReadonlyMap<string, string>
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
    // El motor solo la mira si vale «pagina»; no esta en CONFIG_DEFAULT porque
    // el Python no la conoce, y leerConfig conserva igual lo que no es suyo.
    `portadilla: ${d.portadilla}`,
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
  medios: ReadonlyMap<string, Medio> = new Map(),
): Exportado {
  const avisos: Aviso[] = []
  const nombres = new Map<string, string>()
  const rutas = new Map<string, string>()
  const ilustraciones: Archivo[] = []
  // Audio, video y sus posters: carpeta medios/, que el Python no tiene. Solo
  // entra al proyecto del motor si hay algo, asi que un libro sin medios se
  // exporta exactamente igual que antes.
  const nombresMedios = new Map<string, string>()
  const rutasMedios = new Map<string, string>()
  const archivosMedios: (Archivo | Ficha)[] = []

  const registrar = (id: string, base: string): string => {
    const yaEsta = nombres.get(id)
    if (yaEsta) return yaEsta
    const nombre = `${base}${extensionDe(imagenes, id)}`
    nombres.set(id, nombre)
    const datos = bytes.get(id)
    if (datos) {
      ilustraciones.push(archivo(`ilustraciones/${nombre}`, datos))
      rutas.set(id, `ilustraciones/${nombre}`)
    }
    return nombre
  }

  // Laminas a color: van solas al inicio del libro, sin marcarse en el texto.
  for (const [i, id] of p.laminas.entries()) {
    registrar(id, `color-${String(i + 1).padStart(2, '0')}`)
  }

  /**
   * Un audio o un video: `capNN-vKK.m4v`, `capNN-aKK.m4a`, y el poster del
   * video al lado con el MISMO nombre, que es como el motor lo encuentra.
   * Devuelve el nombre sin extension, que es lo que lleva la marca.
   */
  const registrarMedio = (id: string, base: string, tipo: 'video' | 'audio', posterId: string | null): string => {
    const yaEsta = nombresMedios.get(id)
    if (yaEsta) return yaEsta
    nombresMedios.set(id, base)
    const m = medios.get(id)
    const ext = `.${m?.tipo ?? (tipo === 'video' ? 'm4v' : 'm4a')}`
    const ruta = `medios/${base}${ext}`
    // Con sus bytes si estan (Node, los tests, un audio pequeño); si no, su
    // FICHA: el motor no necesita mas, y el video no sale del almacen.
    const datos = bytes.get(id)
    if (datos) {
      archivosMedios.push(archivo(ruta, datos))
      rutasMedios.set(id, ruta)
    } else if (m) {
      archivosMedios.push(ficha(ruta, m.bytes, m.crc32))
      rutasMedios.set(id, ruta)
    }
    if (tipo === 'video' && posterId !== null) {
      const poster = bytes.get(posterId)
      if (poster) {
        const rutaPoster = `medios/${base}${extensionDe(imagenes, posterId)}`
        archivosMedios.push(archivo(rutaPoster, poster))
        if (!rutas.has(posterId)) rutas.set(posterId, rutaPoster)
      }
    }
    return base
  }

  const capitulos: Archivo[] = []
  for (const [i, cap] of p.capitulos.entries()) {
    const nn = String(i + 1).padStart(2, '0')
    let k = 0
    let kv = 0
    let ka = 0
    for (const b of cap.bloques) {
      if (b.tipo === 'video') registrarMedio(b.medioId, `cap${nn}-v${String(++kv).padStart(2, '0')}`, 'video', b.posterId)
      if (b.tipo === 'audio') registrarMedio(b.medioId, `cap${nn}-a${String(++ka).padStart(2, '0')}`, 'audio', null)
    }
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

    const s = serializarCapitulo(
      cap,
      p.datos.separadorDeEscena,
      (id) => {
        const nombre = nombres.get(id)
        // Sin extension: la marca la acepta con o sin ella, y asi el .md se lee
        // igual que lo escribiria un autor a mano.
        return nombre ? nombre.replace(/\.(png|jpg)$/u, '') : id
      },
      (id) => nombresMedios.get(id) ?? id,
    )
    avisos.push(...s.avisos)
    capitulos.push(archivo(`capitulos/cap${nn}.md`, utf8(s.texto)))
  }

  const extras: Archivo[] = []
  const archivosExtras = new Map<string, string>()
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
    archivosExtras.set(extra.id, `${nombre}.md`)
  }

  const ROLES: Record<RolPortada, string> = {
    portada: 'portada',
    contraportada: 'contraportada',
    logo: 'logo',
    logoBlanco: 'logo-blanco',
    // Solo para la cubierta impresa; el EPUB no los busca, pero la copia (.zip) si los guarda.
    sello: 'sello',
    selloBlanco: 'sello-blanco',
    isotipo: 'isotipo',
    isotipoBlanco: 'isotipo-blanco',
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
    if (!rutas.has(id)) rutas.set(id, `portada/${nombre}`)
  }

  return {
    proyecto: {
      libroTxt: libroTxt(p),
      capitulos,
      ilustraciones,
      portada,
      extras,
      fuentes: [...fuentes],
      ...(archivosMedios.length > 0 ? { medios: archivosMedios } : {}),
    },
    avisos,
    nombres,
    rutas,
    rutasMedios,
    archivosExtras,
  }
}
