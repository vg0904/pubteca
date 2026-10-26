/**
 * Abrir una copia (.zip) en la app.
 *
 * Es la red de seguridad que la interfaz promete: el navegador puede borrar lo
 * que guarda, y la copia es lo que el autor tiene en su disco. Hasta ahora se
 * podia hacer pero no volver a abrir.
 *
 * Abre tres cosas, y las tres son reales:
 *   1. una copia de Pubteca con `proyecto.json`: se recupera el modelo entero;
 *   2. una copia de una version anterior de Pubteca, sin `proyecto.json`;
 *   3. la carpeta de un libro del generar_epub.py, comprimida en un .zip.
 * Las dos ultimas se leen como las lee el motor: libro.txt, capitulos/,
 * extras/, ilustraciones/ y portada/, con SUS reglas (las de `Imagenes`,
 * `buscarEn`, el orden natural y el enrutado de los extras), reutilizando su
 * codigo en vez de copiarlo.
 *
 * Si la copia trae `proyecto.json` pero sus archivos de texto ya no dicen lo
 * mismo (el autor los edito con el generador, fuera de Pubteca), mandan los
 * archivos: son lo ultimo que escribio. Abrir el json en silencio le
 * devolveria un libro de antes de sus cambios.
 *
 * Todo lo que no se pudo recuperar se dice. Nada se pierde en silencio.
 *
 * El libro abierto es SIEMPRE un libro nuevo, con ids nuevos para todo: si el
 * original sigue en este navegador, compartir ids de imagen con el le quitaria
 * sus imagenes (el almacen las guarda por id).
 */
import { unzipSync } from 'fflate'
import { CONFIG_DEFAULT, leerConfig, si } from '../core/config'
import { inspeccionarImagen, type InfoImagen } from '../core/imagen-inspeccion'
import { Imagenes } from '../core/imagenes'
import { EXT_EXTRA, EXT_IMG, EXT_TEXTO } from '../core/libro'
import { Diagnosticos } from '../core/mensajes'
import { archivo, buscarEn, type Archivo, type Proyecto as ProyectoMotor } from '../core/proyecto'
import { ordenarNatural, sinAcentos, valorDigitos } from '../core/texto'
import { IDIOMAS_DEL_LIBRO } from '../core/textos-libro'
import { NOMBRE_JSON } from './copia'
import { nombresDeExtras, ordenarExtras } from './estado'
import { exportar } from './exportar'
import { capituloDesdeDialecto, extraDesdeDialecto } from './importar/dialecto'
import { KINDLE_PROPIO_POR_DEFECTO, type KindlePropio } from './imagen-ajuste'
import {
  DATOS_POR_DEFECTO,
  disenoPortadilla,
  ENTREGA_KINDLE_POR_DEFECTO,
  VERSION_PROYECTO,
  type Bloque,
  type Capitulo,
  type DatosLibro,
  type EntregaKindle,
  type Extra,
  type Imagen,
  type Proyecto,
  type RolPortada,
  type Tramo,
} from './modelo'
import { canonicos, limpiarTexto } from './tramos'

export interface ImagenDeCopia {
  readonly id: string
  readonly nombreOriginal: string
  readonly bytes: Uint8Array
  readonly info: InfoImagen
}

export type ClaveAvisoCopia =
  /** Una ilustracion pide una imagen que no esta en la copia. */
  | 'faltaImagen'
  /** Un archivo de imagen que no es PNG ni JPG, o esta roto. */
  | 'imagenIlegible'
  /** Una imagen de ilustraciones/ que ningun capitulo usa: no se sabe donde va. */
  | 'imagenSinUsar'
  | 'capituloVacio'
  | 'idioma'
  | 'fecha'
  | 'sinLibroTxt'
  /** Bloques o capitulos de proyecto.json que no se entendieron. */
  | 'descartados'
  | 'dedicatoriaDeMas'
  | 'epigrafeDeMas'
  | 'copiaAntigua'
  | 'editadaFuera'
  | 'fuentesPropias'

export interface AvisoCopia {
  readonly clave: ClaveAvisoCopia
  /** El nombre, el valor o la cantidad a la que se refiere. */
  readonly detalle: string
}

export interface Copia {
  /** `pubteca`: se abrio el modelo entero. `carpetas`: se leyo como lo lee el motor. */
  readonly origen: 'pubteca' | 'carpetas'
  readonly proyecto: Proyecto
  readonly imagenes: readonly ImagenDeCopia[]
  readonly avisos: readonly AvisoCopia[]
  /** Cuando se hizo la copia, si se sabe. */
  readonly creada: number | null
}

export type ErrorCopia = 'noEsZip' | 'noEsCopia' | 'danada' | 'versionFutura'

export type LecturaCopia = { readonly ok: true; readonly copia: Copia } | { readonly ok: false; readonly error: ErrorCopia }

type NuevoId = (prefijo: string) => string

const CARPETAS = ['capitulos', 'ilustraciones', 'portada', 'extras', 'fuentes'] as const

// ---------------------------------------------------------------------------
// El zip
// ---------------------------------------------------------------------------

/**
 * Los archivos de un .zip, por ruta.
 *
 * Tolerante con lo que mete el sistema al comprimir: el Finder guarda todo
 * dentro de una carpeta («Mi libro/capitulos/...») y añade `__MACOSX/` y
 * `.DS_Store`; los nombres con acentos pueden venir descompuestos (NFD), y
 * entonces «lámina» no coincidiria con lo que pide la marca del texto.
 */
export function archivosDeZip(bytes: Uint8Array): Map<string, Uint8Array> | null {
  let crudo: Record<string, Uint8Array>
  try {
    crudo = unzipSync(bytes)
  } catch {
    return null
  }
  const entradas = Object.entries(crudo)
    .map(([ruta, datos]) => [ruta.replace(/\\/gu, '/').normalize('NFC'), datos] as const)
    .filter(([ruta]) => !ruta.endsWith('/'))
    // Fuera lo oculto: `.DS_Store`, y tambien todo `__MACOSX/`, que solo trae
    // archivos `._nombre`.
    .filter(([ruta]) => !ruta.split('/').some((trozo) => trozo.startsWith('.')))

  // Una carpeta que lo envuelve todo se quita, salvo que sea una de las del
  // libro (un zip que solo trae capitulos/).
  const primeros = new Set(entradas.map(([ruta]) => (ruta.includes('/') ? ruta.slice(0, ruta.indexOf('/')) : '')))
  const [unica] = primeros
  const envoltorio =
    primeros.size === 1 && unica && !(CARPETAS as readonly string[]).includes(unica.toLowerCase()) ? `${unica}/` : ''
  return new Map(entradas.map(([ruta, datos]) => [ruta.slice(envoltorio.length), datos]))
}

/** Los archivos directamente dentro de una carpeta del libro, como el proyecto del motor los quiere. */
function carpeta(archivos: ReadonlyMap<string, Uint8Array>, nombre: string): Archivo[] {
  const salida: Archivo[] = []
  for (const [ruta, datos] of archivos) {
    const trozos = ruta.split('/')
    if (trozos.length !== 2 || (trozos[0] as string).toLowerCase() !== nombre) continue
    salida.push(archivo(`${nombre}/${trozos[1] as string}`, datos))
  }
  return salida.sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0))
}

function raiz(archivos: ReadonlyMap<string, Uint8Array>, nombre: string): Uint8Array | undefined {
  for (const [ruta, datos] of archivos) if (ruta.toLowerCase() === nombre) return datos
  return undefined
}

const utf8 = (b: Uint8Array): string => new TextDecoder('utf-8').decode(b)

/** El proyecto del motor (el mismo que lee el generar_epub.py) a partir de los archivos. */
export function proyectoMotorDe(archivos: ReadonlyMap<string, Uint8Array>): ProyectoMotor {
  const libro = raiz(archivos, 'libro.txt')
  return {
    libroTxt: libro ? utf8(libro) : undefined,
    capitulos: carpeta(archivos, 'capitulos'),
    ilustraciones: carpeta(archivos, 'ilustraciones'),
    portada: carpeta(archivos, 'portada'),
    extras: carpeta(archivos, 'extras'),
    fuentes: carpeta(archivos, 'fuentes'),
  }
}

// ---------------------------------------------------------------------------
// Datos del libro
// ---------------------------------------------------------------------------

/** El codigo de un idioma que el libro sabe escribir, o null. */
function idiomaConocido(valor: string): string | null {
  const principal = valor.trim().toLowerCase().split(/[-_]/u)[0] ?? ''
  return IDIOMAS_DEL_LIBRO.includes(principal) ? principal : null
}

/** Una fecha que acepta el EPUB y el campo de fecha de la interfaz. */
const RE_FECHA = /^\d{4}(-\d{2}(-\d{2})?)?$/u

/**
 * libro.txt -> los datos del libro.
 *
 * Dos valores se comprueban, porque el motor los usa tal cual: el idioma va SIN
 * escapar en los XHTML (un valor raro romperia el EPUB, y la interfaz solo
 * ofrece los que tienen textos), y la fecha va al `dc:date` del OPF, donde una
 * fecha que no es fecha es un aviso de EPUBCheck.
 */
function datosDeLibroTxt(texto: string | undefined, avisos: AvisoCopia[]): DatosLibro {
  if (texto === undefined) {
    avisos.push({ clave: 'sinLibroTxt', detalle: '' })
    return DATOS_POR_DEFECTO
  }
  const cfg = leerConfig(texto, new Diagnosticos())
  // leerConfig rellena «Sin titulo» si falta: aqui un titulo que falta es uno
  // vacio, que la interfaz pide al descargar.
  const tieneTitulo = /^\s*t[ií]tulo\s*:/imu.test(texto)
  const idioma = idiomaConocido(cfg.idioma)
  if (!idioma) avisos.push({ clave: 'idioma', detalle: cfg.idioma })
  const fecha = cfg.fecha_publicacion.trim()
  if (fecha && !RE_FECHA.test(fecha)) avisos.push({ clave: 'fecha', detalle: fecha })
  const t = (s: string): string => limpiarTexto(s).trim()
  return {
    titulo: tieneTitulo || cfg.titulo !== CONFIG_DEFAULT.titulo ? t(cfg.titulo) : '',
    subtitulo: t(cfg.subtitulo),
    autor: t(cfg.autor),
    sello: t(cfg.sello),
    idioma: idioma ?? 'es',
    descripcion: t(cfg.descripcion),
    isbn: t(cfg.isbn),
    fechaPublicacion: fecha && RE_FECHA.test(fecha) ? fecha : '',
    derechos: t(cfg.derechos),
    incluirContraportada: si(cfg.incluir_contraportada),
    separadorDeEscena: t(cfg.separador_de_escena) || DATOS_POR_DEFECTO.separadorDeEscena,
    fuente: t(cfg.fuente) || DATOS_POR_DEFECTO.fuente,
    // Cualquier otra cosa es un logo, que es lo que se asumia antes de que
    // esto existiera: una copia vieja no cambia de aspecto al abrirse.
    portadilla: disenoPortadilla(t(cfg['portadilla'] ?? '')),
  }
}

// ---------------------------------------------------------------------------
// Imagenes
// ---------------------------------------------------------------------------

/** Las imagenes que se van a guardar, con su id nuevo. Una por archivo. */
class Recogida {
  readonly imagenes: ImagenDeCopia[] = []
  private readonly porRuta = new Map<string, string>()
  private readonly nuevoId: NuevoId
  private readonly avisos: AvisoCopia[]

  constructor(nuevoId: NuevoId, avisos: AvisoCopia[]) {
    this.nuevoId = nuevoId
    this.avisos = avisos
  }

  /** El id de la imagen de ese archivo, o null si no se puede usar (y se dice). */
  id(a: Archivo, nombreOriginal = a.nombre): string | null {
    const ya = this.porRuta.get(a.ruta)
    if (ya !== undefined) return ya || null
    const info = inspeccionarImagen(a.bytes)
    if (info.tipo === null || info.truncada) {
      this.avisos.push({ clave: 'imagenIlegible', detalle: a.ruta })
      this.porRuta.set(a.ruta, '')
      return null
    }
    const id = this.nuevoId('img')
    this.porRuta.set(a.ruta, id)
    this.imagenes.push({ id, nombreOriginal, bytes: a.bytes, info })
    return id
  }
}

// ---------------------------------------------------------------------------
// Leer las carpetas, como el motor
// ---------------------------------------------------------------------------

function extraDe(a: Archivo): { tipo: Extra['tipo']; donde: Extra['donde'] } {
  const n = sinAcentos(a.stem.toLowerCase())
  if (n.includes('dedicatoria')) return { tipo: 'dedicatoria', donde: 'inicio' }
  if (n.includes('epigrafe')) return { tipo: 'epigrafe', donde: 'inicio' }
  return { tipo: 'conTitulo', donde: n.startsWith('inicio') ? 'inicio' : 'final' }
}

/** Lo que el modelo pondria como titulo de un extra: su nombre de archivo, sin el prefijo de orden. */
function tituloDeArchivo(stem: string): string {
  return stem.replace(/^inicio-?/iu, '').replace(/^\d+-/u, '').replace(/[-_]+/gu, ' ').trim() || stem
}

/** Un proyecto recuperado y las imagenes que hay que guardar con el. */
interface Recuperado {
  readonly proyecto: Proyecto
  readonly imagenes: readonly ImagenDeCopia[]
}

function desdeCarpetas(archivos: ReadonlyMap<string, Uint8Array>, nuevoId: NuevoId, avisos: AvisoCopia[]): Recuperado {
  const pm = proyectoMotorDe(archivos)
  const datos = datosDeLibroTxt(pm.libroTxt, avisos)
  const recogida = new Recogida(nuevoId, avisos)

  // Las imagenes disponibles, con las MISMAS reglas que el motor: el primero
  // en orden natural gana, y lo que no es PNG ni JPG no cuenta.
  const dg = new Diagnosticos()
  const disponibles = new Imagenes(pm.ilustraciones, dg).disponibles
  for (const m of dg.avisos) {
    const ruta = /^(ilustraciones\/\S+):/u.exec(m)?.[1]
    if (ruta) avisos.push({ clave: 'imagenIlegible', detalle: ruta })
  }
  const usadas = new Set<string>()
  /** Lo que pide una marca -> id de imagen. Si no esta, un id sin imagen: la revision lo enseña. */
  const resolver = (nombre: string, donde: string): string => {
    const a = disponibles.get(nombre.trim().toLowerCase().replace(/\.(png|jpe?g)$/u, ''))
    if (a) {
      usadas.add(a.ruta)
      const id = recogida.id(a)
      if (id) return id
    } else {
      avisos.push({ clave: 'faltaImagen', detalle: `${donde} → ${nombre}` })
    }
    return nuevoId('img')
  }
  const conImagenes = (b: Bloque, donde: string): Bloque =>
    b.tipo === 'ilustracion' ? { ...b, id: nuevoId('b'), imagenId: resolver(b.imagenId, donde) } : { ...b, id: nuevoId('b') }

  // Capitulos: en orden natural del nombre, como el motor.
  const porNombre = new Map(pm.capitulos.filter((a) => EXT_TEXTO.includes(a.suffix.toLowerCase())).map((a) => [a.nombre, a]))
  const capitulos: Capitulo[] = []
  for (const nombre of ordenarNatural([...porNombre.keys()])) {
    const a = porNombre.get(nombre) as Archivo
    const cap = capituloDesdeDialecto(utf8(a.bytes))
    if (!cap) {
      avisos.push({ clave: 'capituloVacio', detalle: a.ruta })
      continue
    }
    capitulos.push({
      ...cap,
      id: nuevoId('cap'),
      aperturas: cap.aperturas.map((x) => ({ imagenId: resolver(x.imagenId, a.ruta), alt: x.alt })),
      bloques: cap.bloques.map((b) => conImagenes(b, a.ruta)),
    })
  }

  // Extras: enrutados por el nombre, como el motor. Solo puede haber UNA
  // dedicatoria y UN epigrafe en el modelo; los de mas pasan a paginas del
  // principio, con su texto entero, y se dice.
  const extras: Extra[] = []
  const porNombreExtra = new Map(pm.extras.filter((a) => EXT_EXTRA.includes(a.suffix.toLowerCase())).map((a) => [a.nombre, a]))
  for (const nombre of ordenarNatural([...porNombreExtra.keys()])) {
    const a = porNombreExtra.get(nombre) as Archivo
    const { tipo, donde } = extraDe(a)
    // Se lee como lo que ES, y despues, si es una segunda dedicatoria, pasa a
    // pagina con titulo: leida como pagina con titulo, su primera linea seria
    // el titulo y la pagina se quedaria vacia.
    const leido = extraDesdeDialecto(utf8(a.bytes), tipo, tituloDeArchivo(a.stem))
    const sobra = tipo !== 'conTitulo' && extras.some((x) => x.tipo === tipo)
    if (sobra) avisos.push({ clave: tipo === 'dedicatoria' ? 'dedicatoriaDeMas' : 'epigrafeDeMas', detalle: a.ruta })
    const rotulo = tituloDeArchivo(a.stem)
    extras.push({
      id: nuevoId('extra'),
      donde: sobra ? 'inicio' : donde,
      tipo: sobra ? 'conTitulo' : tipo,
      titulo: sobra ? [{ texto: rotulo.charAt(0).toUpperCase() + rotulo.slice(1), marcas: [] }] : leido.titulo,
      bloques: leido.bloques.map((b) => conImagenes(b, a.ruta)),
      nombreArchivo: '',
    })
  }

  // Laminas a color: ilustraciones/color-NN, en orden de su numero.
  const laminas = [...disponibles.keys()]
    .filter((k) => /^color-\p{Nd}+$/u.test(k))
    .sort((x, y) => valorDigitos(x.slice(6)) - valorDigitos(y.slice(6)))
    .flatMap((k) => {
      const a = disponibles.get(k) as Archivo
      usadas.add(a.ruta)
      const id = recogida.id(a)
      return id ? [id] : []
    })

  // Portada, contraportada y logos, por su nombre.
  const portada: Partial<Record<RolPortada, string>> = {}
  const roles: [RolPortada, string][] = [['portada', 'portada'], ['contraportada', 'contraportada'], ['logo', 'logo'], ['logoBlanco', 'logo-blanco']]
  for (const [rol, base] of roles) {
    const a = buscarEn(pm.portada, base, EXT_IMG)
    const id = a ? recogida.id(a) : null
    if (id) portada[rol] = id
  }
  for (const a of pm.portada) {
    if (!EXT_IMG.includes(a.suffix.toLowerCase())) avisos.push({ clave: 'imagenIlegible', detalle: a.ruta })
  }

  // Lo de ilustraciones/ que nadie usa: el motor lo deja fuera y avisa.
  for (const a of disponibles.values()) {
    if (!usadas.has(a.ruta)) avisos.push({ clave: 'imagenSinUsar', detalle: a.ruta })
  }
  // Fuentes propias: Pubteca lleva la suya.
  if (pm.fuentes.some((f) => /\.(ttf|otf)$/iu.test(f.nombre) && !/^LibreBaskerville-/u.test(f.nombre))) {
    avisos.push({ clave: 'fuentesPropias', detalle: '' })
  }

  const proyecto: Proyecto = {
    id: nuevoId('libro'),
    version: VERSION_PROYECTO,
    datos,
    capitulos,
    extras: nombresDeExtras(ordenarExtras(extras)),
    laminas,
    portada,
  }
  return { proyecto, imagenes: recogida.imagenes }
}

// ---------------------------------------------------------------------------
// Leer proyecto.json
// ---------------------------------------------------------------------------

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Unos tramos, o null si no lo son. Pasan por el mismo filtro que todo texto que entra al modelo. */
function tramosDe(x: unknown): Tramo[] | null {
  if (!Array.isArray(x)) return null
  const salida: Tramo[] = []
  for (const t of x) {
    if (!esObjeto(t) || typeof t['texto'] !== 'string' || !Array.isArray(t['marcas'])) return null
    salida.push({ texto: t['texto'], marcas: t['marcas'].filter((m): m is 'cursiva' | 'negrita' => m === 'cursiva' || m === 'negrita') })
  }
  return canonicos(salida)
}

/**
 * Valida proyecto.json pieza a pieza.
 *
 * Una copia puede haberse editado a mano o haberse dañado, y lo que entra aqui
 * acaba en el editor: un bloque con una forma inesperada no puede tirar la app.
 * Lo que no se entiende se descarta y se cuenta; si no se entiende ni la
 * estructura, la copia esta dañada. Todos los ids se regeneran.
 */
function proyectoDeJson(
  x: unknown,
  nuevoId: NuevoId,
  imagenId: (viejo: string) => string,
  avisos: AvisoCopia[],
): Proyecto | null {
  if (!esObjeto(x) || !Array.isArray(x['capitulos'])) return null
  let descartados = 0
  const texto = (v: unknown): string => (typeof v === 'string' ? limpiarTexto(v) : '')

  const bloque = (b: unknown): Bloque | null => {
    if (!esObjeto(b)) return null
    const id = nuevoId('b')
    switch (b['tipo']) {
      case 'parrafo':
      case 'subtitulo': {
        const tramos = tramosDe(b['tramos'])
        return tramos ? { id, tipo: b['tipo'], tramos } : null
      }
      case 'escena':
        return { id, tipo: 'escena' }
      case 'versos': {
        if (!Array.isArray(b['estrofas'])) return null
        const estrofas: Tramo[][] = []
        for (const e of b['estrofas']) {
          if (!Array.isArray(e)) return null
          const versos: Tramo[] = []
          for (const v of e) {
            const t = tramosDe([v])
            if (!t) return null
            versos.push(t[0] ?? { texto: '', marcas: [] })
          }
          estrofas.push(versos)
        }
        return { id, tipo: 'versos', estrofas }
      }
      case 'ilustracion':
        if (typeof b['imagenId'] !== 'string') return null
        return { id, tipo: 'ilustracion', imagenId: imagenId(b['imagenId']), alt: texto(b['alt']), decorativa: b['decorativa'] === true }
      default:
        return null
    }
  }
  const bloques = (v: unknown): Bloque[] =>
    (Array.isArray(v) ? v : []).flatMap((b) => {
      const r = bloque(b)
      if (!r) descartados += 1
      return r ? [r] : []
    })

  const capitulos: Capitulo[] = []
  for (const c of x['capitulos']) {
    if (!esObjeto(c)) {
      descartados += 1
      continue
    }
    capitulos.push({
      id: nuevoId('cap'),
      etiqueta: texto(c['etiqueta']),
      titulo: tramosDe(c['titulo']) ?? [],
      aperturas: (Array.isArray(c['aperturas']) ? c['aperturas'] : []).flatMap((a) =>
        esObjeto(a) && typeof a['imagenId'] === 'string' ? [{ imagenId: imagenId(a['imagenId']), alt: texto(a['alt']) }] : [],
      ),
      bloques: bloques(c['bloques']),
    })
  }

  const extras: Extra[] = []
  for (const e of Array.isArray(x['extras']) ? x['extras'] : []) {
    const tipo = esObjeto(e) ? e['tipo'] : null
    if (!esObjeto(e) || (tipo !== 'dedicatoria' && tipo !== 'epigrafe' && tipo !== 'conTitulo')) {
      descartados += 1
      continue
    }
    extras.push({
      id: nuevoId('extra'),
      donde: e['donde'] === 'inicio' ? 'inicio' : 'final',
      tipo,
      titulo: tramosDe(e['titulo']) ?? [],
      bloques: bloques(e['bloques']),
      nombreArchivo: '',
    })
  }

  // Los datos, campo a campo: uno que falta o que no es del tipo que toca toma
  // el valor por defecto (una copia de una version anterior puede no tenerlo).
  const d = esObjeto(x['datos']) ? x['datos'] : {}
  const datos = Object.fromEntries(
    Object.entries(DATOS_POR_DEFECTO).map(([k, def]) => {
      const v = d[k]
      if (typeof def === 'boolean') return [k, typeof v === 'boolean' ? v : def]
      return [k, typeof v === 'string' ? limpiarTexto(v) : def]
    }),
  ) as unknown as DatosLibro
  const idioma = idiomaConocido(datos.idioma)
  if (!idioma) avisos.push({ clave: 'idioma', detalle: datos.idioma })
  // El bucle de arriba copia los campos de texto tal cual; este solo admite sus
  // dos valores, como el idioma, porque el motor lo usa para decidir la pagina.
  const portadilla = disenoPortadilla(datos.portadilla)

  const portada: Partial<Record<RolPortada, string>> = {}
  if (esObjeto(x['portada'])) {
    for (const rol of ['portada', 'contraportada', 'logo', 'logoBlanco'] as const) {
      const v = x['portada'][rol]
      if (typeof v === 'string') portada[rol] = imagenId(v)
    }
  }
  const des = x['descargado']
  const descargado =
    esObjeto(des) && typeof des['uid'] === 'string' && typeof des['titulo'] === 'string' && typeof des['autor'] === 'string' && typeof des['cuando'] === 'number'
      ? { uid: des['uid'], titulo: des['titulo'], autor: des['autor'], cuando: des['cuando'] }
      : undefined

  if (descartados > 0) avisos.push({ clave: 'descartados', detalle: String(descartados) })
  return {
    id: nuevoId('libro'),
    version: VERSION_PROYECTO,
    datos: { ...datos, idioma: idioma ?? 'es', portadilla },
    capitulos,
    extras: nombresDeExtras(ordenarExtras(extras)),
    laminas: (Array.isArray(x['laminas']) ? x['laminas'] : []).flatMap((v) => (typeof v === 'string' ? [imagenId(v)] : [])),
    portada,
    kindle: entregaDe(x['kindle']),
    kindlePorImagen: kindlePorImagenDe(x['kindlePorImagen'], imagenId),
    ...(descargado ? { descargado } : {}),
  }
}

/**
 * Como se entregan las imagenes a Kindle, tal como venga en la copia.
 *
 * Campo a campo, como los datos del libro: una copia de antes de que esto
 * existiera no lo trae, y una editada a mano puede traer cualquier cosa. La
 * calidad se recorta al rango que entiende el codificador en vez de rechazar
 * la copia: un numero raro no puede costarle el libro al autor.
 */
export function entregaDe(x: unknown): EntregaKindle {
  if (!esObjeto(x)) return ENTREGA_KINDLE_POR_DEFECTO
  const calidad = x['calidad']
  return {
    comprimir: x['comprimir'] === true,
    calidad:
      typeof calidad === 'number' && Number.isFinite(calidad)
        ? Math.max(1, Math.min(100, Math.round(calidad)))
        : ENTREGA_KINDLE_POR_DEFECTO.calidad,
    grises: x['grises'] === true,
  }
}

/**
 * Los ajustes propios de Kindle, imagen por imagen, tal como vengan.
 *
 * Mismo criterio que `entregaDe`: nada aqui puede costarle el libro al autor,
 * asi que una entrada que no se entiende se deja fuera y esa imagen vuelve a
 * seguir el ajuste general. Los ids se pasan por `imagenId` como los demas,
 * para que apunten a las imagenes de ESTA copia; una entrada cuya imagen ya no
 * esta se queda, inofensiva: nadie la mira.
 */
export function kindlePorImagenDe(x: unknown, imagenId: (v: string) => string): Record<string, KindlePropio> {
  if (!esObjeto(x)) return {}
  const r: Record<string, KindlePropio> = {}
  for (const [id, v] of Object.entries(x)) {
    if (!esObjeto(v)) continue
    const calidad = v['calidad']
    const lado = v['ladoLargo']
    r[imagenId(id)] = {
      calidad:
        typeof calidad === 'number' && Number.isFinite(calidad)
          ? Math.max(1, Math.min(100, Math.round(calidad)))
          : KINDLE_PROPIO_POR_DEFECTO.calidad,
      grises: v['grises'] === true,
      ladoLargo:
        typeof lado === 'number' && Number.isFinite(lado) && lado > 0 ? Math.round(lado) : KINDLE_PROPIO_POR_DEFECTO.ladoLargo,
    }
  }
  return r
}

/**
 * Si los archivos de texto de la copia dicen lo mismo que el json.
 *
 * Se vuelve a exportar el proyecto recuperado y se compara con lo que trae la
 * copia: libro.txt, capitulos/ y extras/. Si alguno cambio, la copia se edito
 * fuera de Pubteca (con el generador, por ejemplo) despues de hacerla.
 */
function coincideConSusArchivos(
  p: Proyecto,
  imagenes: readonly ImagenDeCopia[],
  archivos: ReadonlyMap<string, Uint8Array>,
): boolean {
  const meta = new Map<string, Imagen>(
    imagenes.map((i) => [i.id, { id: i.id, nombreOriginal: i.nombreOriginal, tipo: i.info.tipo === 'jpeg' ? 'jpeg' : 'png', bytes: i.bytes.length, ancho: i.info.ancho, alto: i.info.alto }]),
  )
  const e = exportar(p, meta, new Map(imagenes.map((i) => [i.id, i.bytes])))
  const textos = new Map<string, string>()
  for (const a of [...e.proyecto.capitulos, ...e.proyecto.extras]) textos.set(a.ruta, utf8(a.bytes))
  if (e.proyecto.libroTxt !== undefined) textos.set('libro.txt', e.proyecto.libroTxt)
  const enLaCopia = new Map<string, string>()
  for (const [ruta, datos] of archivos) {
    const r = ruta.toLowerCase()
    if (r === 'libro.txt' || /^(capitulos|extras)\/[^/]+$/u.test(r)) enLaCopia.set(ruta, utf8(datos))
  }
  // Sin ningun archivo de texto no hay nada que pueda haberse editado fuera:
  // manda el json.
  if (enLaCopia.size === 0) return true
  if (enLaCopia.size !== textos.size) return false
  for (const [ruta, t] of textos) if (enLaCopia.get(ruta) !== t) return false
  return true
}

function desdeJson(
  json: Record<string, unknown>,
  archivos: ReadonlyMap<string, Uint8Array>,
  nuevoId: NuevoId,
  avisos: AvisoCopia[],
): Recuperado | null {
  const recogida = new Recogida(nuevoId, avisos)
  const imagenesJson = esObjeto(json['imagenes']) ? json['imagenes'] : {}
  const mapa = new Map<string, string>()
  const imagenId = (viejo: string): string => {
    const ya = mapa.get(viejo)
    if (ya) return ya
    const info = imagenesJson[viejo]
    const ruta = esObjeto(info) && typeof info['ruta'] === 'string' ? info['ruta'] : null
    const bytes = ruta ? archivos.get(ruta) : undefined
    const nombre = esObjeto(info) && typeof info['nombreOriginal'] === 'string' ? limpiarTexto(info['nombreOriginal']) : viejo
    let id: string | null = null
    if (ruta && bytes) id = recogida.id(archivo(ruta, bytes), nombre)
    else avisos.push({ clave: 'faltaImagen', detalle: nombre })
    // Sin imagen se queda con un id que no apunta a nada: la revision ensena
    // donde falta, con su boton «Ir».
    const nuevo = id ?? nuevoId('img')
    mapa.set(viejo, nuevo)
    return nuevo
  }
  const proyecto = proyectoDeJson(json['proyecto'], nuevoId, imagenId, avisos)
  return proyecto ? { proyecto, imagenes: recogida.imagenes } : null
}

// ---------------------------------------------------------------------------
// La entrada
// ---------------------------------------------------------------------------

/** Lee una copia ya descomprimida. Ver archivosDeZip. */
export function leerCopia(archivos: ReadonlyMap<string, Uint8Array>, nuevoId: NuevoId): LecturaCopia {
  const bytesJson = raiz(archivos, NOMBRE_JSON)
  // Cada lectura con sus avisos: si el json resulta desfasado y se leen las
  // carpetas, los avisos de haber leido el json ya no valen.
  const leerCarpetas = (): LecturaCopia => {
    const avisos: AvisoCopia[] = []
    const tieneLibro = carpeta(archivos, 'capitulos').some((a) => EXT_TEXTO.includes(a.suffix.toLowerCase()))
    if (!tieneLibro) return { ok: false, error: 'noEsCopia' }
    const leeme = raiz(archivos, 'leeme.txt')
    if (leeme && utf8(leeme).startsWith('Copia de seguridad de Pubteca') && !bytesJson) {
      avisos.push({ clave: 'copiaAntigua', detalle: '' })
    }
    const r = desdeCarpetas(archivos, nuevoId, avisos)
    return { ok: true, copia: { origen: 'carpetas', ...r, avisos, creada: null } }
  }

  if (!bytesJson) return leerCarpetas()

  let json: unknown
  try {
    json = JSON.parse(utf8(bytesJson))
  } catch {
    return { ok: false, error: 'danada' }
  }
  if (!esObjeto(json) || json['formato'] !== 'pubteca') return { ok: false, error: 'danada' }
  if (typeof json['version'] === 'number' && json['version'] > VERSION_PROYECTO) return { ok: false, error: 'versionFutura' }
  const creadaIso = typeof json['creada'] === 'string' ? Date.parse(json['creada']) : Number.NaN
  const creada = Number.isNaN(creadaIso) ? null : creadaIso

  const avisos: AvisoCopia[] = []
  const recuperado = desdeJson(json, archivos, nuevoId, avisos)
  if (!recuperado) return { ok: false, error: 'danada' }
  const { imagenes } = recuperado
  const proyecto: Proyecto = { ...recuperado.proyecto, ...(creada !== null ? { ultimaCopia: creada } : {}) }

  if (!coincideConSusArchivos(proyecto, imagenes, archivos)) {
    // Mandan los archivos: son lo ultimo que escribio el autor.
    const r = leerCarpetas()
    if (!r.ok) return r
    const { proyecto: dePapel } = r.copia
    return {
      ok: true,
      copia: {
        ...r.copia,
        // Lo que el dialecto no guarda y el json si, y no depende del texto.
        proyecto: { ...dePapel, ...(proyecto.descargado ? { descargado: proyecto.descargado } : {}), ...(creada !== null ? { ultimaCopia: creada } : {}) },
        avisos: [{ clave: 'editadaFuera', detalle: '' }, ...r.copia.avisos],
        creada,
      },
    }
  }
  return { ok: true, copia: { origen: 'pubteca', proyecto, imagenes, avisos, creada } }
}
