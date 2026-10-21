/**
 * Ensamblado del libro. Port de generar_epub.py 600-822 (clase Libro).
 *
 * Es el modulo que fija los nombres de archivo, los ids, los epub:type y el
 * orden de las paginas. Cada regla de aqui se compara contra la salida real
 * del Python en el golden test.
 */
import { CONFIG_DEFAULT, anio as calcularAnio, si, type Config } from './config'
import { Imagenes, type Registro } from './imagenes'
import type { Diagnosticos } from './mensajes'
import { nav, type EntradaIndice } from './nav'
import { RE_SEPARADOR_TITULO, RE_TITULO, parsear, type Bloque } from './parser'
import { paginaImagen, xhtml } from './plantillas'
import { buscarEn, type Archivo, type Proyecto } from './proyecto'
import { secuencia } from './secuencia'
import { enLinea, esc, nombreSeguro, ordenarNatural, textoPlano, valorDigitos } from './texto'
import { textosLibro, type TextosLibro } from './textos-libro'

export type Seccion = 'portada' | 'inicio' | 'capitulos' | 'final'

export interface Pagina {
  readonly id: string
  readonly href: string
  readonly seccion: Seccion
  readonly contenido: string
  /** Solo cuando la version de Kindle necesita un cuerpo distinto (la portadilla). */
  readonly contenidoKindle?: string
}

export interface ResumenCapitulo {
  readonly archivo: string
  readonly titulo: string
  readonly parrafos: number
  readonly ilustraciones: number
}

const EXT_TEXTO = ['.md', '.txt', '.markdown']
const EXT_EXTRA = ['.md', '.txt']
const EXT_IMG = ['.png', '.jpg', '.jpeg']

export class Libro {
  readonly cfg: Config
  readonly idioma: string
  /** Lo que el libro dice por su cuenta («Indice», «Edicion digital»...), en su idioma. */
  readonly t: TextosLibro
  readonly imagenes: Imagenes
  readonly paginas: Pagina[] = []
  readonly indice: EntradaIndice[] = []
  readonly resumenCaps: ResumenCapitulo[] = []
  inicioLectura: string | null = null

  private readonly proyecto: Proyecto
  private readonly dg: Diagnosticos
  private readonly anioActual: number

  constructor(proyecto: Proyecto, cfg: Config, dg: Diagnosticos, anioActual: number) {
    this.proyecto = proyecto
    this.cfg = cfg
    this.dg = dg
    this.anioActual = anioActual
    this.idioma = cfg.idioma || 'es'
    this.t = textosLibro(this.idioma)
    this.imagenes = new Imagenes(proyecto.ilustraciones, dg)
  }

  // -- utilidades ----------------------------------------------------------

  private agregar(
    nombre: string,
    titulo: string,
    cuerpo: string,
    seccion: Seccion,
    claseBody = '',
    cuerpoKindle?: string,
  ): string {
    const href = `texto/${nombre}.xhtml`
    const pagina: Pagina = {
      id: `p-${nombre}`,
      href,
      seccion,
      contenido: xhtml(titulo, cuerpo, this.idioma, claseBody),
      ...(cuerpoKindle === undefined
        ? {}
        : { contenidoKindle: xhtml(titulo, cuerpoKindle, this.idioma, claseBody) }),
    }
    this.paginas.push(pagina)
    return href
  }

  private paginaDeIlustracion(
    nombre: string,
    img: Registro,
    alt: string,
    titulo: string,
    seccion: Seccion,
  ): string {
    return this.agregar(nombre, titulo, paginaImagen(img.href, alt), seccion, 'pagina-imagen')
  }

  anio(): string {
    return calcularAnio(this.cfg, this.anioActual)
  }

  /** El alt de una ilustracion, anotando las que se quedaron sin descripcion. */
  private alt(alt: string, nombre: string, donde: string): string {
    if (alt) return alt
    this.imagenes.sinDescripcion.push(`${donde} → ${nombre}`)
    return this.t.ilustracion
  }

  // -- partes del libro ----------------------------------------------------

  portada(): Registro | null {
    const p = buscarEn(this.proyecto.portada, 'portada', EXT_IMG)
    if (p === undefined) {
      this.dg.aviso(
        'No encontré portada/portada.png ni .jpg. El EPUB de Apple Books saldrá sin portada interna.',
      )
      return null
    }
    const img = this.imagenes.registrar(p, `portada/${p.nombre}`, { rol: 'portada' })
    if (img) {
      this.agregar(
        'portada',
        this.t.portada,
        paginaImagen(img.href, this.t.portadaDe(this.cfg.titulo), 'portada'),
        'portada',
        'pagina-imagen',
      )
    }
    return img
  }

  laminasColor(): number {
    const claves = [...this.imagenes.disponibles.keys()]
      .filter((k) => /^color-\p{Nd}+$/u.test(k))
      .map((k) => ({ k, n: valorDigitos(k.slice(k.indexOf('-') + 1)) }))
      .sort((a, b) => a.n - b.n)
      .map((x) => x.k)

    for (const [i, k] of claves.entries()) {
      const img = this.imagenes.buscar(k, 'láminas a color')
      if (img) {
        const n = i + 1
        const etiqueta = this.t.laminaColor(n)
        this.paginaDeIlustracion(
          `lamina-${String(n).padStart(2, '0')}`,
          img,
          etiqueta,
          etiqueta,
          'inicio',
        )
      }
    }
    return claves.length
  }

  portadilla(): void {
    const c = this.cfg
    const alt = esc(c.titulo)
    const logo = buscarEn(this.proyecto.portada, 'logo', EXT_IMG)
    const logoB = buscarEn(this.proyecto.portada, 'logo-blanco', EXT_IMG)

    const img = logo
      ? this.imagenes.registrar(logo, `portada/${logo.nombre}`, { rol: 'logo', soloApple: true })
      : null
    const imgB =
      img && logoB
        ? this.imagenes.registrar(logoB, `portada/${logoB.nombre}`, { rol: 'logo', soloApple: true })
        : null

    // Kindle: el titulo va como TEXTO, asi se adapta solo al modo oscuro.
    // Kindle no soporta prefers-color-scheme y pinta de blanco los fondos
    // transparentes, asi que un logo en imagen no le sirve.
    const tituloKindle = `<h1 class="titulo-libro">${alt}</h1>`
    let tituloApple: string
    if (img && imgB) {
      tituloApple =
        `<h1 class="titulo-libro con-logo">` +
        `<img class="logo logo-claro" src="../${img.href}" alt="${alt}"/>` +
        `<img class="logo logo-oscuro" src="../${imgB.href}" alt="${alt}"/></h1>`
    } else if (img) {
      this.dg.nota(
        'No hay portada/logo-blanco.png: en Apple Books con modo oscuro el logo negro casi no se verá.',
      )
      tituloApple =
        `<h1 class="titulo-libro con-logo">` +
        `<img class="logo" src="../${img.href}" alt="${alt}"/></h1>`
    } else {
      tituloApple = tituloKindle
    }

    const resto: string[] = []
    if (c.subtitulo) resto.push(`<p class="subtitulo-libro">${esc(c.subtitulo)}</p>`)
    if (c.autor) resto.push(`<p class="autor-libro">${esc(c.autor)}</p>`)
    if (c.sello) resto.push(`<p class="sello">${esc(c.sello)}</p>`)

    const cuerpo = (tituloHtml: string): string =>
      '<section epub:type="titlepage">\n<div class="portadilla">\n' +
      [tituloHtml, ...resto].join('\n') +
      '\n</div>\n</section>'

    this.agregar(
      'portadilla',
      c.titulo,
      cuerpo(tituloApple),
      'inicio',
      '',
      tituloKindle !== tituloApple ? cuerpo(tituloKindle) : undefined,
    )
  }

  derechos(): void {
    const c = this.cfg
    const lineas = [`<p><em>${esc(c.titulo)}</em></p>`]
    if (c.derechos) {
      const txt = c.derechos
        .replaceAll('{año}', this.anio())
        .replaceAll('{anio}', this.anio())
        .replaceAll('{autor}', c.autor)
        .replaceAll('{titulo}', c.titulo)
      lineas.push(`<p>${esc(txt)}</p>`)
    }
    if (c.isbn) lineas.push(`<p>ISBN: ${esc(c.isbn)}</p>`)
    if (c.sello) lineas.push(`<p>${esc(this.t.publicadoPor(c.sello))}</p>`)
    lineas.push(`<p>${esc(this.t.edicionDigital(this.anio()))}</p>`)
    this.agregar(
      'derechos',
      this.t.derechos,
      '<section epub:type="copyright-page">\n<div class="derechos">\n' +
        lineas.join('\n') +
        '\n</div>\n</section>',
      'inicio',
    )
  }

  extras(cuando: 'inicio' | 'final'): void {
    const porNombre = new Map(this.proyecto.extras.map((a) => [a.nombre, a]))
    for (const nombre of ordenarNatural([...porNombre.keys()])) {
      const p = porNombre.get(nombre) as Archivo
      if (!EXT_EXTRA.includes(p.suffix.toLowerCase())) continue

      const n = this.sinAcentosMin(p.stem)
      const esDedicatoria = n.includes('dedicatoria')
      const esEpigrafe = n.includes('epigrafe')
      const alInicio = n.startsWith('inicio') || esDedicatoria || esEpigrafe
      if (alInicio !== (cuando === 'inicio')) continue

      const base = `extra-${nombreSeguro(p.stem)}`
      const texto = new TextDecoder('utf-8').decode(p.bytes)

      if (esDedicatoria || esEpigrafe) {
        const { bloques } = parsear(texto, false)
        const parr = bloques
          .filter((b): b is Extract<Bloque, { html: string }> => b.tipo === 'p' || b.tipo === 'verso')
          .map((b) => `<p>${b.html}</p>`)
          .join('\n')
        const tipo = esDedicatoria ? 'dedication' : 'epigraph'
        this.agregar(
          base,
          esDedicatoria ? this.t.dedicatoria : this.t.epigrafe,
          `<section epub:type="${tipo}">\n<div class="dedicatoria">\n${parr}\n</div>\n</section>`,
          cuando,
        )
        continue
      }

      const { titulo, antes, bloques } = parsear(texto)
      this.seccionConTitulo(
        base,
        titulo || p.stem,
        null,
        antes,
        bloques,
        `extras/${p.nombre}`,
        cuando,
        cuando === 'final' ? 'backmatter' : 'frontmatter',
      )
    }
  }

  /** `sin_acentos(stem.lower())`, que es como el Python clasifica los extras. */
  private sinAcentosMin(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
  }

  seccionConTitulo(
    base: string,
    tituloCrudo: string,
    num: string | null,
    antes: readonly { nombre: string; alt: string }[],
    bloques: readonly Bloque[],
    donde: string,
    seccion: Seccion,
    epubType: string,
  ): { primera: string; ilustraciones: number } {
    const tituloTxt = textoPlano(tituloCrudo)
    let primera: string | null = null
    let k = 0

    // Ilustraciones marcadas ANTES del titulo: van antes de la cabecera, para
    // que un capitulo pueda abrir con un dibujo.
    for (const a of antes) {
      const img = this.imagenes.buscar(a.nombre, donde)
      if (img) {
        k += 1
        const h = this.paginaDeIlustracion(
          `${base}-ilus${String(k).padStart(2, '0')}`,
          img,
          this.alt(a.alt, a.nombre, donde),
          this.t.ilustracionDe(tituloTxt),
          seccion,
        )
        primera = primera ?? h
      }
    }

    const hid = `h-${base}`
    let cab = '<div class="cabecera">\n'
    if (num) cab += `<p class="num-capitulo">${esc(num)}</p>\n`
    cab += `<h1 class="titulo-capitulo" id="${hid}">${enLinea(tituloCrudo)}</h1>\n</div>`

    const tramos = secuencia(bloques, this.cfg.separador_de_escena || '* * *')
    const abrir =
      epubType === 'chapter'
        ? `<section epub:type="${epubType}" role="doc-chapter" aria-labelledby="${hid}">`
        : `<section epub:type="${epubType}" aria-labelledby="${hid}">`

    let i = 0
    let cuerpo = cab
    const primerTramo = tramos[0]
    if (primerTramo && primerTramo.tipo === 'texto') {
      cuerpo += '\n' + primerTramo.lineas.join('\n')
      i = 1
    }

    const h = this.agregar(base, tituloTxt, `${abrir}\n${cuerpo}\n</section>`, seccion)
    primera = primera ?? h

    let parte = 1
    for (const t of tramos.slice(i)) {
      if (t.tipo === 'ilus') {
        const img = this.imagenes.buscar(t.nombre, donde)
        if (img) {
          k += 1
          this.paginaDeIlustracion(
            `${base}-ilus${String(k).padStart(2, '0')}`,
            img,
            this.alt(t.alt, t.nombre, donde),
            this.t.ilustracionDe(tituloTxt),
            seccion,
          )
        }
      } else {
        parte += 1
        this.agregar(
          `${base}-${parte}`,
          tituloTxt,
          '<div class="continuacion">\n' + t.lineas.join('\n') + '\n</div>',
          seccion,
        )
      }
    }

    this.indice.push({ texto: num ? `${num}: ${tituloTxt}` : tituloTxt, href: primera })
    // El Python declara aqui un n_ilus que solo cuenta las del cuerpo, pero
    // devuelve k (que cuenta todas). La variable muerta se ha borrado y se
    // devuelve el total, que es lo que el reporte usa.
    return { primera, ilustraciones: k }
  }

  capitulos(): void {
    const porNombre = new Map(
      this.proyecto.capitulos
        .filter((p) => EXT_TEXTO.includes(p.suffix.toLowerCase()))
        .map((a) => [a.nombre, a]),
    )
    const archivos = ordenarNatural([...porNombre.keys()]).map((n) => porNombre.get(n) as Archivo)

    if (archivos.length === 0) {
      this.dg.error('No hay capítulos en capitulos/ (se esperan archivos .md o .txt).')
      return
    }

    const nums: number[] = []
    for (const p of archivos) {
      const m = /\p{Nd}+/u.exec(p.stem)
      if (m) nums.push(valorDigitos(m[0]))
    }
    if (nums.length > 0) {
      const min = Math.min(...nums)
      const max = Math.max(...nums)
      const tiene = new Set(nums)
      const faltan: number[] = []
      for (let n = min; n <= max; n++) if (!tiene.has(n)) faltan.push(n)
      if (faltan.length > 0) {
        this.dg.nota(
          'Faltan capítulos en la numeración: ' +
            faltan.map((n) => `cap${String(n).padStart(2, '0')}`).join(', ') +
            '.',
        )
      }
    }

    for (const p of archivos) {
      const texto = new TextDecoder('utf-8').decode(p.bytes)
      const { titulo, antes, bloques } = parsear(texto)
      if (!titulo) {
        this.dg.aviso(`capitulos/${p.nombre}: está vacío, lo salté.`)
        continue
      }

      let num: string | null = null
      let tit = titulo
      const mPlano = RE_TITULO.exec(textoPlano(titulo))
      if (mPlano && mPlano[2]) {
        num = mPlano[1] as string
        // DIVERGENCIA: el Python vuelve a partir el titulo crudo por el PRIMER
        // separador, que con «Cap. 3: El bosque» es el punto de «Cap.», y el
        // titulo sale como «3: El bosque». Aqui se aplica la misma regex al
        // titulo crudo, que da el titulo correcto Y conserva su markdown.
        const mCrudo = RE_TITULO.exec(titulo)
        tit = (mCrudo?.[2] ?? mPlano[2]).trim()
      }

      const base = nombreSeguro(p.stem)
      const { primera, ilustraciones } = this.seccionConTitulo(
        base,
        tit,
        num,
        antes,
        bloques,
        `capitulos/${p.nombre}`,
        'capitulos',
        'chapter',
      )
      this.inicioLectura = this.inicioLectura ?? primera
      this.resumenCaps.push({
        archivo: p.nombre,
        titulo: textoPlano(titulo),
        parrafos: bloques.filter((b) => b.tipo === 'p').length,
        ilustraciones,
      })
    }
  }

  contraportada(): void {
    if (!si(this.cfg.incluir_contraportada ?? 'si')) return
    const p = buscarEn(this.proyecto.portada, 'contraportada', EXT_IMG)
    if (p === undefined) return
    const img = this.imagenes.registrar(p, `portada/${p.nombre}`, { rol: 'portada' })
    if (img) {
      this.paginaDeIlustracion(
        'contraportada',
        img,
        this.t.contraportadaDe(this.cfg.titulo),
        this.t.contraportada,
        'final',
      )
    }
  }

  nav(conPortada: boolean): string {
    return nav(this.indice, this.idioma, conPortada, this.inicioLectura)
  }
}

export { CONFIG_DEFAULT, RE_SEPARADOR_TITULO }
