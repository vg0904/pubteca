/**
 * Orquestacion. Port de generar_epub.py 958-1005 (Libro.construir).
 *
 * Es el unico sitio donde se decide el orden de construccion y las diferencias
 * entre las dos tiendas. No toca el disco ni el DOM: recibe un Proyecto y
 * devuelve los bytes de los dos EPUB.
 */
import { leerConfig } from './config'
import { cssLibro } from './css'
import { buscarFuentes, type Fuente } from './fuentes'
import { identificador } from './identificador'
import type { Registro } from './imagenes'
import { Libro, type Pagina } from './libro'
import { Diagnosticos } from './mensajes'
import { ncx } from './ncx'
import { marcaDeTiempo, opf } from './opf'
import type { Proyecto } from './proyecto'
import { nombreSeguro } from './texto'
import { CONTAINER, OPCIONES_APPLE, escribirEpub, type EntradaZip } from './zip'

export type Tienda = 'Kindle' | 'AppleBooks'

export interface Resultado {
  readonly tienda: Tienda
  readonly nombreArchivo: string
  readonly bytes: Uint8Array
  readonly imagenes: readonly Registro[]
}

export interface Construccion {
  readonly resultados: readonly Resultado[]
  readonly laminas: number
  readonly uid: string
  readonly libro: Libro
  readonly fuentes: readonly Fuente[]
  readonly diagnosticos: Diagnosticos
  /**
   * Motivo por el que NO se genero nada, o null si se genero.
   *
   * DIVERGENCIA: el Python, sin ningun capitulo valido, emite el error y
   * GENERA IGUAL un EPUB sin cuerpo, que ninguna tienda acepta. Aqui se
   * bloquea: mas vale no dar archivo que dar uno roto.
   */
  readonly bloqueado: string | null
}

export interface OpcionesConstruir {
  /** Se inyecta: el core no lee el reloj, o los golden tests no son reproducibles. */
  readonly ahora: Date
}

export function construir(proyecto: Proyecto, opciones: OpcionesConstruir): Construccion {
  const dg = new Diagnosticos()
  const cfg = leerConfig(proyecto.libroTxt, dg)
  const fuentes = buscarFuentes(proyecto.fuentes, dg)
  const libro = new Libro(proyecto, cfg, dg, opciones.ahora.getFullYear())

  // Orden inamovible: es el orden del libro.
  const portadaImg = libro.portada()
  const laminas = libro.laminasColor()
  libro.portadilla()
  libro.derechos()
  libro.extras('inicio')
  libro.capitulos()
  libro.extras('final')
  libro.contraportada()

  // Imagenes huerfanas: estan en ilustraciones/ pero nadie las marco.
  //
  // DIVERGENCIA: el Python compara por STEM en minusculas cruzando carpetas, asi
  // que un ilustraciones/logo.png sin marcar queda tapado por el portada/logo.png
  // que si entro, y el aviso no sale. El sintoma es la AUSENCIA de un aviso, que
  // es dificilisimo de detectar. Aqui se compara por ruta.
  const rutasUsadas = new Set([...libro.imagenes.usadas.values()].map((u) => u.origen.ruta))
  for (const [, p] of libro.imagenes.disponibles) {
    if (!rutasUsadas.has(p.ruta)) {
      dg.aviso(
        `ilustraciones/${p.nombre}: no está marcada en ningún capítulo, así que no entró al libro.`,
      )
    }
  }

  if (libro.imagenes.sinDescripcion.length > 0) {
    dg.nota(
      'Ilustraciones sin descripción (la leen los lectores de pantalla): ' +
        libro.imagenes.sinDescripcion.join('; '),
    )
  }

  const hayCapitulos = libro.resumenCaps.length > 0
  if (!hayCapitulos) {
    return {
      resultados: [],
      laminas,
      uid: '',
      libro,
      fuentes,
      diagnosticos: dg,
      bloqueado:
        'El libro no tiene ningún capítulo con texto, así que no se puede generar un EPUB válido.',
    }
  }

  const uid = identificador(cfg.titulo, cfg.autor, cfg.isbn)
  const base = nombreSeguro(cfg.titulo).replaceAll('-', '_') || 'libro'
  const ahora = marcaDeTiempo(opciones.ahora)
  const todasConAlt = libro.imagenes.sinDescripcion.length === 0

  // Apple Books: Baskerville del sistema mas la fuente incluida de respaldo.
  // Kindle: SIN fuente, el lector usa la suya. Asi el archivo pesa menos y
  // baja la tarifa de entrega.
  const cssApple = cssLibro(fuentes, (cfg.fuente ?? '').trim())
  const cssKindle = cssLibro([], '')

  const resultados: Resultado[] = []
  for (const [tienda, esApple] of [
    ['Kindle', false],
    ['AppleBooks', true],
  ] as const) {
    const paginas: Pagina[] = libro.paginas.filter((p) => esApple || p.seccion !== 'portada')
    const imgs = [...libro.imagenes.usadas.values()].filter(
      (u) => esApple || (u !== portadaImg && !u.soloApple),
    )

    const archivos: EntradaZip[] = [{ ruta: 'META-INF/container.xml', datos: utf8(CONTAINER) }]
    if (esApple && fuentes.length > 0) {
      archivos.push({
        ruta: 'META-INF/com.apple.ibooks.display-options.xml',
        datos: utf8(OPCIONES_APPLE),
      })
    }

    archivos.push(
      {
        ruta: 'OEBPS/content.opf',
        datos: utf8(
          opf({
            cfg,
            idioma: libro.idioma,
            paginas,
            imagenes: imgs,
            fuentes,
            portadaImg,
            conPortada: esApple,
            uid,
            inicioLectura: libro.inicioLectura,
            todasConAlt,
            ahora,
          }),
        ),
      },
      { ruta: 'OEBPS/toc.ncx', datos: utf8(ncx(libro.indice, cfg.titulo, libro.idioma, uid)) },
      {
        ruta: 'OEBPS/texto/nav.xhtml',
        datos: utf8(libro.nav(esApple && portadaImg !== null)),
      },
      { ruta: 'OEBPS/estilos/estilo.css', datos: utf8(esApple ? cssApple : cssKindle) },
    )

    for (const p of paginas) {
      archivos.push({
        ruta: `OEBPS/${p.href}`,
        datos: utf8(esApple ? p.contenido : (p.contenidoKindle ?? p.contenido)),
      })
    }
    for (const u of imgs) {
      archivos.push({ ruta: `OEBPS/${u.href}`, datos: u.origen.bytes })
    }
    if (esApple) {
      for (const f of fuentes) {
        archivos.push({ ruta: `OEBPS/${f.href}`, datos: f.origen.bytes })
      }
    }

    comprobarReferencias(archivos, dg, tienda)

    resultados.push({
      tienda,
      nombreArchivo: `${base}_${tienda}.epub`,
      bytes: escribirEpub(archivos, opciones.ahora),
      imagenes: imgs,
    })
  }

  return { resultados, laminas, uid, libro, fuentes, diagnosticos: dg, bloqueado: null }
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

/**
 * Comprueba que ninguna pagina incluida referencie un recurso que no esta en
 * el paquete de su tienda.
 *
 * DIVERGENCIA que tapa un agujero real: `registrar` devuelve el registro
 * cacheado sin actualizar sus banderas, asi que si el autor usa portada/logo.png
 * TAMBIEN como ilustracion de un capitulo, el registro se queda con soloApple y
 * en Kindle la imagen se excluye del ZIP mientras la pagina que la muestra si
 * entra: un recurso ausente, y EPUBCheck lo rechaza. En la interfaz grafica va
 * a ser MAS facil caer en eso, porque reutilizar una imagen sera un clic.
 */
function comprobarReferencias(
  archivos: readonly EntradaZip[],
  dg: Diagnosticos,
  tienda: Tienda,
): void {
  const presentes = new Set(archivos.map((a) => a.ruta.replace(/^OEBPS\//u, '')))
  const faltan = new Set<string>()
  const decodificador = new TextDecoder('utf-8')
  // Se escanea lo que REALMENTE se empaqueta para esta tienda, no el cuerpo de
  // Apple: la portadilla de Kindle lleva el titulo como texto y no referencia
  // ningun logo, asi que mirar el cuerpo equivocado da falsos positivos.
  for (const a of archivos) {
    if (!a.ruta.endsWith('.xhtml')) continue
    for (const m of decodificador.decode(a.datos).matchAll(/<img[^>]+src="\.\.\/([^"]+)"/gu)) {
      const ruta = m[1] as string
      if (!presentes.has(ruta)) faltan.add(ruta)
    }
  }
  for (const ruta of faltan) {
    dg.error(
      `${ruta}: una página del EPUB de ${tienda} la muestra, pero el archivo no entró al paquete. ` +
        `Suele pasar al usar la misma imagen como logo y como ilustración.`,
    )
  }
}
