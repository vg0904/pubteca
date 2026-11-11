/**
 * Lo que hay que imprimir, leido del MISMO proyecto del motor que da los dos
 * EPUB (libro.txt, capitulos/, extras/, portada/, ilustraciones/).
 *
 * Es el camino de siempre (ver app/exportar.ts): la app no le pasa al
 * impreso su modelo, le pasa los archivos que ya entiende el EPUB. Asi lo que
 * sale en papel es lo que sale en la pantalla, y el script de Node imprime
 * cualquier carpeta del generador sin la app.
 *
 * Las reglas de lectura son las de `core/libro.ts` (que capitulo se salta,
 * como se parte «Capitulo 3: El faro», como se clasifica un extra por su
 * nombre), y por eso se usan sus mismas piezas: `parsear`, `RE_TITULO`,
 * `ordenarNatural`. Si una cambia alli, cambia aqui.
 */
import { anio as calcularAnio, leerConfig } from '../config'
import { EXT_EXTRA, EXT_IMG, EXT_TEXTO } from '../libro'
import { Diagnosticos } from '../mensajes'
import { parsear, RE_TITULO, type Bloque } from '../parser'
import { buscarEn, type Proyecto } from '../proyecto'
import { enLinea, ordenarNatural, textoPlano, valorDigitos } from '../texto'

export interface CapituloImpreso {
  /** «Capítulo 3», o null. */
  readonly numero: string | null
  /** En HTML en linea. Puede ir vacio (un capitulo que solo tiene numero). */
  readonly titulo: string
  /** El titulo en texto plano: la cabecera de sus paginas impares y su entrada del indice. */
  readonly plano: string
  readonly antes: readonly { readonly nombre: string; readonly alt: string }[]
  readonly bloques: readonly Bloque[]
}

export interface ExtraImpresoLeido {
  /** El nombre de su archivo en `extras/`: es lo que lo identifica en el core. */
  readonly id: string
  readonly tipo: 'dedicatoria' | 'epigrafe' | 'conTitulo'
  /** Donde va en el EPUB. El impreso puede llevarlo a otro sitio. */
  readonly donde: 'inicio' | 'final'
  /** En HTML en linea; null en la dedicatoria y el epigrafe. */
  readonly titulo: string | null
  readonly plano: string
  readonly antes: readonly { readonly nombre: string; readonly alt: string }[]
  readonly bloques: readonly Bloque[]
}

export type Portadilla =
  | { readonly modo: 'texto' }
  /** El logo del titulo, con el subtitulo, el autor y el sello debajo. */
  | { readonly modo: 'logo'; readonly imagen: string }
  /** Un diseño de portadilla que ocupa la pagina y ya lo trae todo. */
  | { readonly modo: 'pagina'; readonly imagen: string }

export interface Contenido {
  readonly titulo: string
  readonly subtitulo: string
  readonly autor: string
  readonly sello: string
  readonly idioma: string
  readonly separador: string
  /** La linea de derechos con sus marcas ya sustituidas ({año}, {autor}, {titulo}). */
  readonly derechos: string
  readonly anio: string
  readonly portadilla: Portadilla
  /** Las laminas a color, en orden: nombres de imagen. */
  readonly laminas: readonly string[]
  readonly capitulos: readonly CapituloImpreso[]
  readonly extras: readonly ExtraImpresoLeido[]
  /** Cuantos audios y videos hay: en papel no van, y se dice. */
  readonly medios: number
}

/** El nombre con que se pide una imagen: sin extension y en minusculas, como la busca el motor. */
export function claveImagen(nombre: string): string {
  return nombre
    .trim()
    .replace(/\.(png|jpe?g)$/iu, '')
    .toLowerCase()
}

const utf8 = (b: Uint8Array): string => new TextDecoder('utf-8').decode(b)
const sinAcentosMin = (s: string): string => s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')

/** Las ilustraciones de un parseado, con su nombre ya como clave de imagen. */
function conClaves(bloques: readonly Bloque[]): Bloque[] {
  return bloques.map((b) => (b.tipo === 'ilus' ? { ...b, nombre: claveImagen(b.nombre) } : b))
}

export function contenidoDe(p: Proyecto, anioActual: number): Contenido {
  const cfg = leerConfig(p.libroTxt, new Diagnosticos())
  const anio = calcularAnio(cfg, anioActual)
  let medios = 0
  const contar = (bloques: readonly Bloque[]): void => {
    medios += bloques.filter((b) => b.tipo === 'medio').length
  }

  const capitulos: CapituloImpreso[] = []
  const porNombre = new Map(p.capitulos.filter((a) => EXT_TEXTO.includes(a.suffix.toLowerCase())).map((a) => [a.nombre, a]))
  for (const nombre of ordenarNatural([...porNombre.keys()])) {
    const a = porNombre.get(nombre)
    if (!a) continue
    const { titulo, antes, bloques } = parsear(utf8(a.bytes))
    if (!titulo) continue
    let numero: string | null = null
    let tit = titulo
    const mPlano = RE_TITULO.exec(textoPlano(titulo))
    if (mPlano && mPlano[2]) {
      numero = mPlano[1] as string
      tit = (RE_TITULO.exec(titulo)?.[2] ?? mPlano[2]).trim()
    }
    contar(bloques)
    capitulos.push({
      numero,
      titulo: enLinea(tit),
      plano: textoPlano(tit),
      antes: antes.map((x) => ({ nombre: claveImagen(x.nombre), alt: x.alt })),
      bloques: conClaves(bloques),
    })
  }

  const extras: ExtraImpresoLeido[] = []
  const deExtras = new Map(p.extras.map((a) => [a.nombre, a]))
  for (const nombre of ordenarNatural([...deExtras.keys()])) {
    const a = deExtras.get(nombre)
    if (!a || !EXT_EXTRA.includes(a.suffix.toLowerCase())) continue
    const n = sinAcentosMin(a.stem)
    const tipo = n.includes('dedicatoria') ? 'dedicatoria' : n.includes('epigrafe') ? 'epigrafe' : 'conTitulo'
    const donde = n.startsWith('inicio') || tipo !== 'conTitulo' ? 'inicio' : 'final'
    if (tipo !== 'conTitulo') {
      const { bloques } = parsear(utf8(a.bytes), false)
      contar(bloques)
      extras.push({ id: a.nombre, tipo, donde, titulo: null, plano: '', antes: [], bloques: conClaves(bloques) })
      continue
    }
    const { titulo, antes, bloques } = parsear(utf8(a.bytes))
    const t = titulo || a.stem
    contar(bloques)
    extras.push({
      id: a.nombre,
      tipo,
      donde,
      titulo: enLinea(t),
      plano: textoPlano(t),
      antes: antes.map((x) => ({ nombre: claveImagen(x.nombre), alt: x.alt })),
      bloques: conClaves(bloques),
    })
  }

  const logo = buscarEn(p.portada, 'logo', EXT_IMG)
  const aPagina = (cfg['portadilla'] ?? '').trim().toLowerCase() === 'pagina'
  const portadilla: Portadilla = logo ? { modo: aPagina ? 'pagina' : 'logo', imagen: claveImagen(logo.stem) } : { modo: 'texto' }

  const laminas = p.ilustraciones
    .map((a) => claveImagen(a.stem))
    .filter((k) => /^color-\p{Nd}+$/u.test(k))
    .sort((x, y) => valorDigitos(x.slice(6)) - valorDigitos(y.slice(6)))

  const derechos = (cfg.derechos ?? '')
    .replaceAll('{año}', anio)
    .replaceAll('{anio}', anio)
    .replaceAll('{autor}', cfg.autor)
    .replaceAll('{titulo}', cfg.titulo)

  return {
    titulo: cfg.titulo,
    subtitulo: cfg.subtitulo,
    autor: cfg.autor,
    sello: cfg.sello,
    idioma: cfg.idioma || 'es',
    separador: cfg.separador_de_escena || '* * *',
    derechos,
    anio,
    portadilla,
    laminas: [...new Set(laminas)],
    capitulos,
    extras,
    medios,
  }
}
