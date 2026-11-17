/**
 * El libro para la web: un .zip que se sube tal cual a cualquier hosting, o se
 * integra en un sitio que ya existe.
 *
 *   index.html          el libro, listo para abrirse
 *   lector.js           el lector: el elemento <pubteca-lector>
 *   LEEME.md            como publicarlo e integrarlo (para una persona o una IA)
 *   libro/libro.json    el manifiesto: datos, partes en orden, textos del lector
 *   libro/libro.css     la hoja de estilo del libro
 *   libro/cap01.html    una pagina por parte, que tambien se lee suelta
 *   libro/imagenes/     las ilustraciones
 *
 * Sale del MISMO `Libro` que los EPUB (el mismo parser, las mismas reglas, los
 * mismos avisos), con tres diferencias, las tres porque una pagina web no es
 * una pagina de libro:
 *
 *   - Un capitulo es UNA parte. El EPUB lo parte en varias paginas para que
 *     cada ilustracion vaya en la suya; aqui se vuelven a juntar y el dibujo
 *     va dentro del texto.
 *   - No hay portada ni portadilla como partes: el lector las monta con los
 *     datos del manifiesto. Los derechos van al final, que es donde una web
 *     los lleva.
 *   - Sin audio ni video, de momento: se usa el cuerpo que recibe Kindle.
 *
 * No se convierte el EPUB en el navegador del visitante: tendria que bajarse
 * el libro entero, con todas sus ilustraciones, antes de ver la primera linea.
 * Aqui cada parte se carga cuando toca.
 */
import { leerConfig } from '../config'
import { armar } from '../construir'
import { identificador } from '../identificador'
import type { Registro } from '../imagenes'
import { Libro, type Pagina } from '../libro'
import { Diagnosticos } from '../mensajes'
import { cuerpoDe } from '../plantillas'
import type { Proyecto } from '../proyecto'
import { esc, nombreSeguro } from '../texto'
import { escribirZip, type EntradaZip } from '../zip'
import { CONFIG_WEB_POR_DEFECTO, enlacesValidos, type ConfigWeb, type EnlaceWeb, type ModoLectura } from './config'
import { cssWeb } from './css'
import { archivosDeLetra, familiasWeb, letraDelSistema, letraWeb, LETRA_SISTEMA, type LetraWeb } from './letras'
import { aWoff } from './woff'
import { textosWeb, type TextosLector, type TextosWeb } from './textos'

/** La version del formato de `libro.json`. Subirla es romper a quien ya integro un libro. */
export const VERSION_WEB = 1

export type ClaseParte = 'laminas' | 'dedicatoria' | 'epigrafe' | 'extra' | 'capitulo' | 'derechos' | 'contraportada' | 'enlaces'

/** Una parte del libro web: lo que se lee de un tiron. */
export interface ParteWeb {
  /** Estable entre exportaciones: es el ancla de sus enlaces (`#cap03`). */
  readonly id: string
  readonly clase: ClaseParte
  readonly titulo: string
  /** Su pagina, relativa a `libro.json`. */
  readonly archivo: string
  /** Si sale en el indice. La dedicatoria o los derechos se leen, pero no se anuncian. */
  readonly indice: boolean
}

/** `libro/libro.json`. Es el contrato con el lector y con quien integre el libro. */
export interface ManifiestoWeb {
  readonly formato: 'pubteca-web'
  readonly version: number
  /** El mismo identificador que el EPUB. Con el recuerda el lector por donde iba cada visitante. */
  readonly id: string
  readonly titulo: string
  readonly subtitulo: string
  readonly autor: string
  readonly sello: string
  readonly idioma: string
  readonly descripcion: string
  readonly portada: { readonly src: string; readonly ancho: number; readonly alto: number } | null
  readonly estilo: string
  /** true si no estan todos los capitulos. */
  readonly muestra: boolean
  readonly partes: readonly ParteWeb[]
  /** Como se abre: el modo y la letra que eligio el autor. Quien lee puede cambiarlos. */
  readonly lectura: { readonly modo: ModoLectura; readonly letra: string }
  /** Las letras que se pueden elegir, en su orden. La ultima es la del aparato. */
  readonly letras: readonly LetraWeb[]
  readonly textos: TextosLector
}

export interface OpcionesWeb {
  /** Se inyecta, como en los EPUB: con el mismo reloj, el mismo zip byte a byte. */
  readonly ahora: Date
  /** El lector (`src/lector/lector.js`), ya leido: el core no carga nada. */
  readonly lector: string
  /** Aqui `omitidos` son rutas del proyecto: `capitulos/cap03.md`. */
  readonly config?: ConfigWeb
  /**
   * El LEEME (`src/lector/LEEME.es.md` o `.en.md`), ya leido. Va en el idioma
   * de quien usa Pubteca, que no es el del libro.
   */
  readonly leeme: string
  /**
   * Los archivos de las letras, por su nombre (`Literata-Regular.ttf`,
   * `OFL-Literata.txt`): los de `public/fuentes/impreso/`. Una familia sin sus
   * cuatro caras y su licencia no se ofrece. Sin ninguna, solo la del aparato.
   */
  readonly letras?: ReadonlyMap<string, Uint8Array>
}

export interface LibroWeb {
  readonly nombreArchivo: string
  /** El .zip. Vacio si `bloqueado`. */
  readonly bytes: Uint8Array
  /** Lo que lleva el .zip, en orden. */
  readonly archivos: readonly EntradaZip[]
  readonly manifiesto: ManifiestoWeb | null
  readonly diagnosticos: Diagnosticos
  /**
   * Los audios y videos de lo publicado, que NO van en el libro web. Es un
   * dato y no un aviso para que quien lo enseñe lo diga en su idioma.
   */
  readonly sinMedios: { readonly videos: number; readonly audios: number }
  /** Por que no se genero nada, o null. */
  readonly bloqueado: string | null
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

/**
 * Los avisos que hablan de una tienda («Kindle la convierte en blanco», «en
 * Apple Books con modo oscuro…») no son de este libro: aqui no hay tienda.
 * Los ERRORES pasan todos: una imagen que no se pudo leer falta en los tres.
 */
const DE_TIENDA = /\b(Kindle|KDP|Apple Books|EPUB)\b/u

/**
 * El cuerpo de unas paginas del EPUB, de corrido y en HTML.
 *
 * Tres cambios, y ninguno puede tocar el texto del autor: ahi las comillas van
 * escapadas, asi que ni `epub:type="` ni `src="` aparecen fuera de una etiqueta.
 */
function aWeb(paginas: readonly Pagina[], imagenes: ReadonlyMap<string, Registro>, usadas: Set<string>): string {
  return (
    paginas
      // Una pagina que solo tenia audio o video no existe sin ellos.
      .filter((p) => !p.soloApple)
      .map((p) => cuerpoDe(p.contenidoKindle ?? p.contenido))
      .join('\n')
      // HTML no tiene espacios de nombres: `epub:type` no significa nada aqui.
      .replace(/ epub:type="[^"]*"/gu, '')
      // Las imagenes: junto a la pagina y no una carpeta mas arriba, con su
      // tamaño (la pagina no salta al cargarlas) y sin bajarse hasta que
      // el lector se acerca. Sin `decoding`: su valor es una palabra que el
      // test de frontera prohibe en el core, y `loading` es lo que importa.
      .replace(/<img\b([^>]*?)\ssrc="\.\.\/(imagenes\/[^"]+)"/gu, (_m, antes: string, href: string) => {
        usadas.add(href)
        const info = imagenes.get(href)?.info
        const medidas = info && info.ancho > 0 && info.alto > 0 ? ` width="${info.ancho}" height="${info.alto}"` : ''
        return `<img${antes} src="${href}"${medidas} loading="lazy"`
      })
  )
}

interface Construida extends ParteWeb {
  readonly cuerpo: string
}

/** La pagina de una parte: se lee suelta, y el lector saca de ella su <main>. */
function paginaDeParte(p: Construida, i: number, todas: readonly Construida[], m: Pick<ManifiestoWeb, 'titulo' | 'autor' | 'idioma'>, t: TextosWeb): string {
  const antes = todas[i - 1]
  const despues = todas[i + 1]
  const enlace = (x: Construida | undefined, rel: string, texto: string): string =>
    x ? `<a rel="${rel}" href="${esc(x.archivo)}">${esc(texto)}: ${esc(x.titulo)}</a>` : '<span></span>'
  return `<!doctype html>
<html lang="${esc(m.idioma)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(p.titulo === m.titulo ? p.titulo : `${p.titulo} · ${m.titulo}`)}</title>
${m.autor ? `<meta name="author" content="${esc(m.autor)}">\n` : ''}<meta name="generator" content="Pubteca">
<link rel="stylesheet" href="libro.css">
</head>
<body class="pubteca-pagina">
<main id="${esc(p.id)}" class="pubteca-parte" data-clase="${p.clase}">
${p.cuerpo}
</main>
<nav class="pubteca-pie">
${enlace(antes, 'prev', t.anterior)}
<a href="../index.html#${esc(p.id)}">${esc(m.titulo)}</a>
${enlace(despues, 'next', t.siguiente)}
</nav>
</body>
</html>
`
}

/** La ultima parte: donde se consigue el libro, o que aqui acaba la muestra. */
function cuerpoDeEnlaces(muestra: boolean, enlaces: readonly EnlaceWeb[], t: TextosWeb): string {
  const lineas: string[] = []
  if (muestra) lineas.push(`<p>${esc(t.finMuestra)}</p>`)
  if (enlaces.length > 0) {
    lineas.push(`<p>${esc(muestra ? t.completoEn : t.tambienEn)}</p>`)
    // En otra pestaña: dentro de un <iframe>, una tienda no se deja abrir.
    lineas.push(`<p>${enlaces.map((e) => `<a class="enlace-libro" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.etiqueta)}</a>`).join('\n')}</p>`)
  }
  return (
    '<section aria-labelledby="h-enlaces">\n<div class="cabecera">\n' +
    `<h1 class="titulo-capitulo" id="h-enlaces">${esc(muestra ? t.sigueLeyendo : t.consigue)}</h1>\n</div>\n` +
    `<div class="enlaces">\n${lineas.join('\n')}\n</div>\n</section>`
  )
}

/**
 * `index.html`: el lector a pagina completa.
 *
 * Lleva una copia del manifiesto dentro para poder abrirse con doble clic: sin
 * servidor el navegador no deja pedir `libro.json`. Y dentro de <noscript>, el
 * indice con enlaces a cada parte suelta: lo que ve quien no tiene JavaScript.
 */
function paginaIndice(m: ManifiestoWeb): string {
  const titulo = m.autor ? `${m.titulo} · ${m.autor}` : m.titulo
  // «</» no puede aparecer dentro de un <script>, ni «<!--»: se escriben como
  // escapes de JSON, que significan lo mismo.
  const json = JSON.stringify(m).replace(/</gu, '\\u003c')
  const indice = m.partes.map((p) => `<li><a href="libro/${esc(p.archivo)}">${esc(p.titulo)}</a></li>`).join('\n')
  return `<!doctype html>
<html lang="${esc(m.idioma)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
${m.descripcion ? `<meta name="description" content="${esc(m.descripcion)}">\n` : ''}${m.autor ? `<meta name="author" content="${esc(m.autor)}">\n` : ''}<meta property="og:type" content="book">
<meta property="og:title" content="${esc(m.titulo)}">
${m.descripcion ? `<meta property="og:description" content="${esc(m.descripcion)}">\n` : ''}<meta name="generator" content="Pubteca">
<style>html, body { margin: 0; }</style>
<script src="lector.js" defer></script>
</head>
<body>
<pubteca-lector src="libro/libro.json" pagina>
<script type="application/json">${json}</script>
<noscript>
<h1>${esc(m.titulo)}</h1>
${m.autor ? `<p>${esc(m.autor)}</p>\n` : ''}<ol>
${indice}
</ol>
</noscript>
</pubteca-lector>
</body>
</html>
`
}

export function construirWeb(proyecto: Proyecto, opciones: OpcionesWeb): LibroWeb {
  const dg = new Diagnosticos()
  const cfg = leerConfig(proyecto.libroTxt, dg)
  const config = opciones.config ?? CONFIG_WEB_POR_DEFECTO
  const fuera = new Set(config.omitidos)

  // Lo omitido se quita ANTES de armar el libro: asi sus ilustraciones no
  // entran al zip y sus nombres de archivo no cambian (cap04 sigue siendo
  // cap04 aunque falte cap03, y sus enlaces siguen valiendo).
  const publicado: Proyecto = {
    ...proyecto,
    capitulos: proyecto.capitulos.filter((a) => !fuera.has(a.ruta)),
    extras: proyecto.extras.filter((a) => !fuera.has(a.ruta)),
  }
  const muestra = publicado.capitulos.length < proyecto.capitulos.length
  const base = nombreSeguro(cfg.titulo).replaceAll('-', '_') || 'libro'
  const nombreArchivo = `${base}_web.zip`

  // Los diagnosticos del `Libro` van aparte: «faltan capitulos en la
  // numeracion» es verdad en una muestra, y es justo lo que el autor pidio.
  const delLibro = new Diagnosticos()
  const libro = new Libro(publicado, cfg, delLibro, opciones.ahora.getFullYear())
  const armado = armar(libro)
  const deLaWeb = (m: string): boolean => !DE_TIENDA.test(m) && !(muestra && m.startsWith('Faltan capítulos en la numeración'))
  dg.errores.push(...delLibro.errores)
  dg.avisos.push(...delLibro.avisos.filter(deLaWeb))
  dg.notas.push(...delLibro.notas.filter(deLaWeb))

  if (libro.resumenCaps.length === 0) {
    return {
      nombreArchivo,
      bytes: new Uint8Array(0),
      archivos: [],
      manifiesto: null,
      diagnosticos: dg,
      sinMedios: { videos: 0, audios: 0 },
      bloqueado: 'No hay ningún capítulo con texto que publicar, así que no se puede generar el libro web.',
    }
  }

  const t = textosWeb(libro.idioma)
  const imagenes = new Map([...libro.imagenes.usadas.values()].map((r) => [r.href, r]))
  const usadas = new Set<string>()
  const enlaces = enlacesValidos(config)

  // Las partes, en el orden de lectura de una web.
  const ids = new Set<string>()
  const partes: Construida[] = []
  const poner = (idPedido: string, clase: ClaseParte, titulo: string, indice: boolean, cuerpo: string): void => {
    // Un capitulo puede llamarse como una parte fija («derechos.md»).
    let id = idPedido
    for (let n = 2; ids.has(id); n++) id = `${idPedido}-${n}`
    ids.add(id)
    partes.push({ id, clase, titulo, archivo: `${id}.html`, indice, cuerpo })
  }
  const web = (paginas: readonly Pagina[]): string => aWeb(paginas, imagenes, usadas)

  if (armado.paginas.laminas.length > 0) poner('laminas', 'laminas', t.laminas, false, web(armado.paginas.laminas))
  for (const s of libro.secciones) {
    poner(s.base, s.clase, s.titulo, s.clase === 'capitulo' || s.clase === 'extra', web(s.paginas))
  }
  poner('derechos', 'derechos', libro.t.derechos, false, web(armado.paginas.derechos))
  if (armado.paginas.contraportada.length > 0) {
    poner('contraportada', 'contraportada', libro.t.contraportada, false, web(armado.paginas.contraportada))
  }
  if (muestra || enlaces.length > 0) {
    poner('sigue-leyendo', 'enlaces', muestra ? t.sigueLeyendo : t.consigue, true, cuerpoDeEnlaces(muestra, enlaces, t))
  }

  const portada = armado.portadaImg
  if (portada) usadas.add(portada.href)

  // Las letras: las que llegaron enteras, en WOFF, con su licencia al lado.
  const deLetras: EntradaZip[] = []
  const letras: LetraWeb[] = []
  for (const f of familiasWeb()) {
    const { caras, licencia } = archivosDeLetra(f)
    const ttfs = caras.map((c) => opciones.letras?.get(c.ttf))
    const ofl = opciones.letras?.get(licencia)
    if (!ofl || ttfs.some((b) => !b)) continue
    let woffs: Uint8Array[]
    try {
      woffs = ttfs.map((b) => aWoff(b as Uint8Array))
    } catch {
      dg.aviso(`La letra ${f.nombre} no se pudo preparar para la web, así que no se ofrece.`)
      continue
    }
    const l = letraWeb(f)
    l.caras.forEach((c, i) => deLetras.push({ ruta: `libro/${c.src}`, datos: woffs[i] as Uint8Array }))
    deLetras.push({ ruta: `libro/${l.licencia}`, datos: ofl })
    letras.push(l)
  }
  letras.push(letraDelSistema(t.sistema))
  // La que eligio el autor, si llego; si no, la primera que haya.
  const letra = (letras.find((l) => l.id === config.letra) ?? letras[0] ?? letraDelSistema(t.sistema)).id
  if (config.letra !== LETRA_SISTEMA && letra !== config.letra) {
    dg.aviso('La letra elegida no se pudo incluir; el libro web se abre con otra.')
  }

  const manifiesto: ManifiestoWeb = {
    formato: 'pubteca-web',
    version: VERSION_WEB,
    id: identificador(cfg.titulo, cfg.autor, cfg.isbn),
    titulo: cfg.titulo,
    subtitulo: cfg.subtitulo,
    autor: cfg.autor,
    sello: cfg.sello,
    idioma: libro.idioma,
    descripcion: cfg.descripcion,
    portada: portada ? { src: portada.href, ancho: portada.info.ancho, alto: portada.info.alto } : null,
    estilo: 'libro.css',
    muestra,
    partes: partes.map(({ cuerpo: _cuerpo, ...p }) => p),
    lectura: { modo: config.modo, letra },
    letras,
    textos: t.lector,
  }

  const archivos: EntradaZip[] = [
    { ruta: 'index.html', datos: utf8(paginaIndice(manifiesto)) },
    { ruta: 'lector.js', datos: utf8(opciones.lector) },
    { ruta: 'LEEME.md', datos: utf8(opciones.leeme) },
    { ruta: 'libro/libro.json', datos: utf8(`${JSON.stringify(manifiesto, null, 2)}\n`) },
    { ruta: 'libro/libro.css', datos: utf8(cssWeb(letras.find((l) => l.id === letra))) },
    ...partes.map((p, i) => ({ ruta: `libro/${p.archivo}`, datos: utf8(paginaDeParte(p, i, partes, manifiesto, t)) })),
    // Solo las imagenes que alguna parte publicada enseña: ni el logo de la
    // portadilla ni los posters de los videos.
    ...[...imagenes.values()].filter((r) => usadas.has(r.href)).map((r) => ({ ruta: `libro/${r.href}`, datos: r.origen.bytes })),
    ...deLetras,
  ]

  return { nombreArchivo, bytes: escribirZip(archivos, opciones.ahora), archivos, manifiesto, diagnosticos: dg, sinMedios: libro.medios.cuenta(), bloqueado: null }
}
