import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'
import { archivosDeZip, leerCopia, type Copia } from '../src/app/abrir-copia'
import { NOMBRE_JSON, zipDeCopia } from '../src/app/copia'
import { exportar } from '../src/app/exportar'
import {
  DATOS_POR_DEFECTO,
  VERSION_PROYECTO,
  type Bloque,
  type Capitulo,
  type Extra,
  type Imagen,
  type Proyecto,
  type Tramo,
} from '../src/app/modelo'

/**
 * H7: la copia (.zip) se vuelve a abrir. Es la red de seguridad que la
 * interfaz promete, y hasta ahora solo se podia hacer.
 */

const FIXTURES = join(import.meta.dirname, 'fixtures')
const leer = (ruta: string): Uint8Array => new Uint8Array(readFileSync(join(FIXTURES, ruta)))

let n = 0
const nuevoId = (prefijo: string): string => `${prefijo}-nuevo-${++n}`
beforeEach(() => {
  n = 0
})

const t = (texto: string, ...marcas: Tramo['marcas'][number][]): Tramo => ({ texto, marcas })
const par = (id: string, ...tramos: Tramo[]): Bloque => ({ id, tipo: 'parrafo', tramos })
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex').slice(0, 12)

/** Un libro que usa TODO lo que el modelo sabe guardar. */
function libroRico(): { p: Proyecto; imagenes: Map<string, Imagen>; bytes: Map<string, Uint8Array> } {
  const archivos: [string, string, 'png' | 'jpeg'][] = [
    ['i-portada', 'imagenes/portada.png', 'png'],
    ['i-contra', 'imagenes/jpeg-rgb.jpg', 'jpeg'],
    ['i-logo', 'imagenes/logo.png', 'png'],
    ['i-logob', 'imagenes/trns.png', 'png'],
    ['i-lam1', 'imagenes/color-01.png', 'png'],
    ['i-lam2', 'imagenes/color-02.png', 'png'],
    ['i-abre', 'imagenes/horizontal.png', 'png'],
    ['i-dibujo', 'imagenes/buena.png', 'png'],
    ['i-adorno', 'imagenes/pequena.png', 'png'],
  ]
  const bytes = new Map(archivos.map(([id, ruta]) => [id, leer(ruta)]))
  const imagenes = new Map<string, Imagen>(
    archivos.map(([id, ruta, tipo]) => [id, { id, nombreOriginal: `subida-${ruta.split('/')[1]}`, tipo, bytes: 1, ancho: 1, alto: 1 }]),
  )
  const capitulos: Capitulo[] = [
    {
      id: 'c1',
      etiqueta: 'Capítulo 1',
      titulo: [t('El '), t('faro', 'cursiva')],
      aperturas: [{ imagenId: 'i-abre', alt: 'El faro al amanecer' }],
      bloques: [
        par('b1', t('Texto con '), t('cursiva', 'cursiva'), t(', '), t('negrita', 'negrita'), t(' y '), t('las dos', 'cursiva', 'negrita'), t('.')),
        { id: 'b2', tipo: 'escena' },
        { id: 'b3', tipo: 'subtitulo', tramos: [t('Una parte')] },
        { id: 'b4', tipo: 'versos', estrofas: [[t('primer verso'), t('segundo', 'cursiva')], [t('otra estrofa')]] },
        { id: 'b5', tipo: 'ilustracion', imagenId: 'i-dibujo', alt: 'La cabaña', decorativa: false },
        // Lo que el dialecto NO puede guardar: que es decorativa.
        { id: 'b6', tipo: 'ilustracion', imagenId: 'i-adorno', alt: '', decorativa: true },
        par('b7', t('5 * 3 y snake_case y > no verso')),
      ],
    },
    { id: 'c2', etiqueta: 'Prólogo', titulo: [], aperturas: [], bloques: [par('b8', t('Antes de todo.'))] },
    { id: 'c3', etiqueta: '', titulo: [t('Un título suelto')], aperturas: [], bloques: [par('b9', t('Fin.'))] },
  ]
  const extras: Extra[] = [
    { id: 'e1', donde: 'inicio', tipo: 'dedicatoria', titulo: [], bloques: [par('b10', t('A quien dejó la luz encendida.'))], nombreArchivo: 'dedicatoria' },
    { id: 'e2', donde: 'inicio', tipo: 'epigrafe', titulo: [], bloques: [par('b11', t('Una cita.'))], nombreArchivo: 'epigrafe' },
    { id: 'e3', donde: 'inicio', tipo: 'conTitulo', titulo: [t('Nota')], bloques: [par('b12', t('Una nota.'))], nombreArchivo: '01-nota' },
    {
      id: 'e4',
      donde: 'final',
      tipo: 'conTitulo',
      titulo: [t('Agradecimientos')],
      bloques: [par('b13', t('Gracias.')), { id: 'b14', tipo: 'ilustracion', imagenId: 'i-dibujo', alt: 'otra vez', decorativa: false }],
      nombreArchivo: '01-agradecimientos',
    },
  ]
  const p: Proyecto = {
    id: 'libro-original',
    version: VERSION_PROYECTO,
    datos: {
      ...DATOS_POR_DEFECTO,
      titulo: 'El faro de Ibar',
      subtitulo: 'una novela',
      autor: 'Ana Ruiz',
      sello: 'Ediciones Pubteca',
      idioma: 'en',
      descripcion: 'Marta llega a un faro.',
      isbn: '978-84-376-0494-7',
      fechaPublicacion: '2026-03-15',
      derechos: '© {año} {autor}. Licencia propia.',
      incluirContraportada: false,
      separadorDeEscena: '❦',
      portadilla: 'pagina',
    },
    capitulos,
    extras,
    laminas: ['i-lam1', 'i-lam2'],
    portada: { portada: 'i-portada', contraportada: 'i-contra', logo: 'i-logo', logoBlanco: 'i-logob' },
    ultimaCopia: 1,
    // Un ajuste propio para Kindle: va POR ID DE IMAGEN, y los ids se
    // regeneran al abrir, asi que es lo que mas facil se pierde de la copia.
    kindlePorImagen: { 'i-dibujo': { calidad: 55, grises: true, ladoLargo: 1200 } },
    descargado: { uid: 'urn:isbn:9788437604947', titulo: 'El faro de Ibar', autor: 'Ana Ruiz', cuando: 1700000000000 },
  }
  return { p, imagenes, bytes }
}

function copiaDe(p: Proyecto, imagenes: Map<string, Imagen>, bytes: Map<string, Uint8Array>): Uint8Array {
  return zipDeCopia(exportar(p, imagenes, bytes), p, imagenes, new Date('2026-10-22T10:00:00Z'))
}

function abrir(zip: Uint8Array | Map<string, Uint8Array>): Copia {
  const archivos = zip instanceof Map ? zip : archivosDeZip(zip)
  if (!archivos) throw new Error('no es un zip')
  const r = leerCopia(archivos, nuevoId)
  if (!r.ok) throw new Error(`no abre: ${r.error}`)
  return r.copia
}

/**
 * Un proyecto sin ids: los ids se regeneran al abrir. Las imagenes se
 * comparan por su CONTENIDO (el sha256 de sus bytes), que es lo que importa.
 */
function sinIds(p: Proyecto, bytesDe: (id: string) => Uint8Array | undefined): unknown {
  const img = (id: string): string => {
    const b = bytesDe(id)
    return b ? sha(b) : 'FALTA'
  }
  const bloque = (b: Bloque): unknown => (b.tipo === 'ilustracion' ? { ...b, id: undefined, imagenId: img(b.imagenId) } : { ...b, id: undefined })
  return {
    datos: p.datos,
    capitulos: p.capitulos.map((c) => ({ ...c, id: undefined, aperturas: c.aperturas.map((a) => ({ ...a, imagenId: img(a.imagenId) })), bloques: c.bloques.map(bloque) })),
    extras: p.extras.map((x) => ({ ...x, id: undefined, bloques: x.bloques.map(bloque) })),
    laminas: p.laminas.map(img),
    portada: Object.fromEntries(Object.entries(p.portada).map(([rol, id]) => [rol, img(id)])),
    kindlePorImagen: Object.fromEntries(Object.entries(p.kindlePorImagen ?? {}).map(([id, v]) => [img(id), v])),
    descargado: p.descargado,
  }
}

const bytesDeCopia = (c: Copia) => (id: string) => c.imagenes.find((i) => i.id === id)?.bytes

describe('la copia de Pubteca se abre SIN perdidas', () => {
  it('IDA Y VUELTA: el libro abierto es el mismo libro', () => {
    const { p, imagenes, bytes } = libroRico()
    const c = abrir(copiaDe(p, imagenes, bytes))
    expect(c.origen).toBe('pubteca')
    expect(c.avisos).toEqual([])
    expect(sinIds(c.proyecto, bytesDeCopia(c))).toEqual(sinIds(p, (id) => bytes.get(id)))
  })

  it('incluido lo que el dialecto de carpetas no sabe guardar', () => {
    const { p, imagenes, bytes } = libroRico()
    const c = abrir(copiaDe(p, imagenes, bytes))
    const b6 = c.proyecto.capitulos[0]?.bloques[5]
    expect(b6?.tipo === 'ilustracion' && b6.decorativa).toBe(true)
    // El nombre con que el autor subio cada imagen.
    expect(c.imagenes.map((i) => i.nombreOriginal).sort()).toEqual([...imagenes.values()].map((i) => i.nombreOriginal).sort())
    // Con que titulo y autor se descargo: es lo que avisa de un cambio de identidad.
    expect(c.proyecto.descargado).toEqual(p.descargado)
    // Y cuando se hizo la copia.
    expect(c.proyecto.ultimaCopia).toBe(Date.parse('2026-10-22T10:00:00Z'))
  })

  it('el diseño de la portadilla vuelve por los dos caminos de la copia', () => {
    // Va en proyecto.json Y en libro.txt, y los dos tienen que decir lo mismo:
    // si no, `coincideConSusArchivos` creeria que la copia se edito fuera.
    const { p, imagenes, bytes } = libroRico()
    const c = abrir(copiaDe(p, imagenes, bytes))
    expect(c.proyecto.datos.portadilla).toBe('pagina')
    expect(c.avisos).toEqual([])
  })

  it('el ajuste propio de Kindle vuelve, y apuntando a la imagen NUEVA', () => {
    // Va por id de imagen y los ids se regeneran al abrir: si no se tradujeran,
    // el ajuste quedaria apuntando a una imagen que ya no existe y el autor
    // perderia en silencio lo que configuro.
    const { p, imagenes, bytes } = libroRico()
    const c = abrir(copiaDe(p, imagenes, bytes))
    const propios = Object.entries(c.proyecto.kindlePorImagen ?? {})
    expect(propios).toHaveLength(1)
    const [idNuevo, ajuste] = propios[0] as [string, unknown]
    expect(ajuste).toEqual({ calidad: 55, grises: true, ladoLargo: 1200 })
    // Es un id de ESTA copia, y es el del mismo dibujo.
    expect(imagenes.has(idNuevo)).toBe(false)
    expect(sha(bytesDeCopia(c)(idNuevo) as Uint8Array)).toBe(sha(bytes.get('i-dibujo') as Uint8Array))
  })

  it('es un libro NUEVO: ningun id de imagen se comparte con el original', () => {
    // El almacen guarda las imagenes por id: compartirlo con el original, que
    // puede seguir en este navegador, le quitaria las suyas.
    const { p, imagenes, bytes } = libroRico()
    const c = abrir(copiaDe(p, imagenes, bytes))
    expect(c.proyecto.id).not.toBe(p.id)
    for (const i of c.imagenes) expect(imagenes.has(i.id)).toBe(false)
    // Una imagen usada en dos sitios sigue siendo UNA.
    expect(c.imagenes).toHaveLength(9)
    // Y todos los ids de bloques, capitulos y extras son nuevos y no se
    // repiten: un json editado a mano podria traerlos repetidos, y el editor
    // los necesita unicos.
    const ids = [
      ...c.proyecto.capitulos.flatMap((x) => [x.id, ...x.bloques.map((b) => b.id)]),
      ...c.proyecto.extras.flatMap((x) => [x.id, ...x.bloques.map((b) => b.id)]),
    ]
    expect(new Set(ids).size).toBe(ids.length)
    const viejos = new Set([...p.capitulos.flatMap((x) => [x.id, ...x.bloques.map((b) => b.id)]), ...p.extras.flatMap((x) => [x.id, ...x.bloques.map((b) => b.id)])])
    expect(ids.filter((id) => viejos.has(id))).toEqual([])
  })

  it('los archivos de la copia los sigue entendiendo el generar_epub.py', () => {
    // El json va al lado: libro.txt, capitulos/ y demas no cambian.
    const { p, imagenes, bytes } = libroRico()
    const archivos = archivosDeZip(copiaDe(p, imagenes, bytes)) as Map<string, Uint8Array>
    expect([...archivos.keys()].filter((r) => !r.includes('/')).sort()).toEqual(['LEEME.txt', 'libro.txt', NOMBRE_JSON])
    expect([...archivos.keys()].some((r) => r.startsWith('capitulos/cap01.md'))).toBe(true)
  })
})

describe('si los archivos se cambiaron fuera de Pubteca, mandan los archivos', () => {
  it('EDITADA CON EL GENERADOR: se abre lo que dicen los archivos, y se dice', () => {
    // Abrir el json en silencio le devolveria al autor un libro de ANTES de sus
    // cambios.
    const { p, imagenes, bytes } = libroRico()
    const archivos = archivosDeZip(copiaDe(p, imagenes, bytes)) as Map<string, Uint8Array>
    const cap = new TextDecoder().decode(archivos.get('capitulos/cap03.md'))
    archivos.set('capitulos/cap03.md', strToU8(`${cap}\nUn parrafo escrito despues, a mano.\n`))
    const c = abrir(archivos)
    expect(c.origen).toBe('carpetas')
    expect(c.avisos[0]?.clave).toBe('editadaFuera')
    const ultimo = c.proyecto.capitulos[2]?.bloques.at(-1)
    expect(ultimo?.tipo === 'parrafo' && ultimo.tramos[0]?.texto).toBe('Un parrafo escrito despues, a mano.')
    // Lo que no depende del texto se conserva del json.
    expect(c.proyecto.descargado).toEqual(p.descargado)
  })

  it('cambiar libro.txt a mano tambien cuenta', () => {
    const { p, imagenes, bytes } = libroRico()
    const archivos = archivosDeZip(copiaDe(p, imagenes, bytes)) as Map<string, Uint8Array>
    const libro = new TextDecoder().decode(archivos.get('libro.txt')).replace('titulo: El faro de Ibar', 'titulo: El faro')
    archivos.set('libro.txt', strToU8(libro))
    const c = abrir(archivos)
    expect(c.avisos[0]?.clave).toBe('editadaFuera')
    expect(c.proyecto.datos.titulo).toBe('El faro')
  })
})

describe('una copia de una version anterior de Pubteca, sin proyecto.json', () => {
  it('recupera todo el texto, y dice lo que no puede recuperar', () => {
    const { p, imagenes, bytes } = libroRico()
    const archivos = archivosDeZip(copiaDe(p, imagenes, bytes)) as Map<string, Uint8Array>
    archivos.delete(NOMBRE_JSON)
    const c = abrir(archivos)
    expect(c.origen).toBe('carpetas')
    expect(c.avisos.map((a) => a.clave)).toEqual(['copiaAntigua'])
    // Todo el texto, la estructura y las imagenes en su sitio...
    const original = sinIds(p, (id) => bytes.get(id)) as Record<string, unknown>
    const abierto = sinIds(c.proyecto, bytesDeCopia(c)) as Record<string, unknown>
    expect(abierto['capitulos']).toEqual(
      // ...salvo lo que el dialecto no guarda: que una ilustracion es
      // decorativa, y que «Prologo» era la ETIQUETA de un capitulo sin titulo
      // (se escribe como la linea «Prologo», y vuelve como titulo). El libro
      // sale igual en los dos casos; con proyecto.json no pasa.
      (original['capitulos'] as { etiqueta: string; titulo: Tramo[]; bloques: { decorativa?: boolean }[] }[]).map((cap) => ({
        ...cap,
        ...(cap.etiqueta && cap.titulo.length === 0 ? { etiqueta: '', titulo: [t(cap.etiqueta)] } : {}),
        bloques: cap.bloques.map((b) => (b.decorativa ? { ...b, decorativa: false } : b)),
      })),
    )
    expect(abierto['extras']).toEqual(original['extras'])
    expect(abierto['laminas']).toEqual(original['laminas'])
    expect(abierto['portada']).toEqual(original['portada'])
    expect(abierto['datos']).toEqual(original['datos'])
  })
})

/** Los archivos de una carpeta del disco, como los traeria un .zip de ella. */
function carpetaComoZip(raiz: string, envoltorio = ''): Map<string, Uint8Array> {
  const salida = new Map<string, Uint8Array>()
  const recorrer = (dir: string): void => {
    for (const e of readdirSync(dir)) {
      const ruta = join(dir, e)
      if (statSync(ruta).isDirectory()) recorrer(ruta)
      else salida.set(envoltorio + relative(raiz, ruta).split('\\').join('/'), new Uint8Array(readFileSync(ruta)))
    }
  }
  recorrer(raiz)
  return salida
}

describe('la carpeta de un libro del generar_epub.py, comprimida', () => {
  const LIBRO = join(FIXTURES, 'libro-prueba')

  it('se lee como la lee el motor', () => {
    const c = abrir(archivosDeZip(zipSync(Object.fromEntries(carpetaComoZip(LIBRO)))) as Map<string, Uint8Array>)
    expect(c.origen).toBe('carpetas')
    const p = c.proyecto
    expect(p.datos).toMatchObject({ titulo: 'El faro de Ibar', autor: 'Ana Ruiz Mendoza', sello: 'Ediciones Pubteca', fechaPublicacion: '2026-03-15', incluirContraportada: true })
    // En el orden natural de los archivos, con el hueco del capitulo 3 tal cual.
    expect(p.capitulos.map((x) => `${x.etiqueta}|${x.titulo.map((y) => y.texto).join('')}`)).toEqual([
      'Capítulo 1|La luz que no tocaba',
      'Capítulo 2|Lo que decía el cuaderno',
      'Capítulo 4|El turno',
      '|Epílogo',
    ])
    expect(p.extras.map((x) => `${x.tipo}:${x.donde}:${x.titulo.map((y) => y.texto).join('')}`)).toEqual([
      'dedicatoria:inicio:',
      'conTitulo:inicio:Nota sobre esta edición',
      'conTitulo:final:Agradecimientos',
    ])
    expect(p.laminas).toHaveLength(2)
    expect(Object.keys(p.portada).sort()).toEqual(['contraportada', 'logo', 'logoBlanco', 'portada'])
    // cap02-00 abre el capitulo 2 con un dibujo.
    expect(p.capitulos[1]?.aperturas).toHaveLength(1)
    // La imagen que ningun capitulo usa no entra, y se dice: el motor tambien la deja fuera.
    expect(c.avisos).toContainEqual({ clave: 'imagenSinUsar', detalle: 'ilustraciones/cap09-99.png' })
  })

  it('comprimida con el Finder: dentro de una carpeta, con __MACOSX y .DS_Store', () => {
    const archivos = carpetaComoZip(LIBRO, 'El faro/')
    archivos.set('__MACOSX/El faro/capitulos/._cap01.md', new Uint8Array([0, 5, 22, 7]))
    archivos.set('El faro/.DS_Store', new Uint8Array([0]))
    archivos.set('El faro/capitulos/.DS_Store', new Uint8Array([0]))
    const c = abrir(zipSync(Object.fromEntries(archivos)))
    expect(c.proyecto.capitulos).toHaveLength(abrir(carpetaComoZip(LIBRO)).proyecto.capitulos.length)
  })

  it('un nombre de archivo con acentos descompuestos (NFD) casa con la marca del texto', () => {
    // El Finder guarda «lámina» como «la» + acento + «mina».
    const nombreNfd = 'ilustraciones/la\u0301mina.png'
    const archivos = new Map<string, Uint8Array>([
      ['capitulos/cap01.md', strToU8('Capítulo 1: T\n\n[ilustración: lámina | un dibujo]\n')],
      [nombreNfd, leer('imagenes/buena.png')],
    ])
    const c = abrir(zipSync(Object.fromEntries(archivos)))
    expect(c.avisos.filter((a) => a.clave === 'faltaImagen')).toEqual([])
    expect(c.imagenes).toHaveLength(1)
  })
})

describe('libro.txt: lo que el motor usaria tal cual se comprueba', () => {
  const conLibro = (libro: string): Copia =>
    abrir(new Map([['libro.txt', strToU8(libro)], ['capitulos/cap01.md', strToU8('Capítulo 1: T\n\nTexto.\n')]]))

  it('un idioma sin textos propios pasa a español, y se dice', () => {
    // El motor lo escribe SIN escapar en cada XHTML.
    const c = conLibro('titulo: T\nidioma: ja\n')
    expect(c.proyecto.datos.idioma).toBe('es')
    expect(c.avisos).toContainEqual({ clave: 'idioma', detalle: 'ja' })
  })

  it('una variante regional se queda en su idioma', () => {
    expect(conLibro('titulo: T\nidioma: en-GB\n').proyecto.datos.idioma).toBe('en')
  })

  it('una fecha que no es fecha se quita, y se dice', () => {
    // Iria al dc:date del OPF, y EPUBCheck avisa.
    const c = conLibro('titulo: T\nfecha_publicacion: marzo de 2026\n')
    expect(c.proyecto.datos.fechaPublicacion).toBe('')
    expect(c.avisos).toContainEqual({ clave: 'fecha', detalle: 'marzo de 2026' })
    expect(conLibro('titulo: T\nfecha_publicacion: 2026\n').proyecto.datos.fechaPublicacion).toBe('2026')
  })

  it('un titulo que falta es un titulo vacio, no «Sin titulo»', () => {
    expect(conLibro('autor: A\n').proyecto.datos.titulo).toBe('')
  })

  it('la portadilla: solo «pagina» cuenta, lo demas es un logo', () => {
    // Cualquier otra cosa es un logo, que es lo que se asumia antes de que esto
    // existiera: una copia vieja no cambia de aspecto al abrirse.
    expect(conLibro('titulo: T\nportadilla: pagina\n').proyecto.datos.portadilla).toBe('pagina')
    expect(conLibro('titulo: T\nportadilla: logo\n').proyecto.datos.portadilla).toBe('logo')
    expect(conLibro('titulo: T\nportadilla: lo que sea\n').proyecto.datos.portadilla).toBe('logo')
    expect(conLibro('titulo: T\n').proyecto.datos.portadilla).toBe('logo')
  })

  it('sin libro.txt se abre igual, y se dice', () => {
    const c = abrir(new Map([['capitulos/cap01.md', strToU8('Capítulo 1: T\n\nTexto.\n')]]))
    expect(c.avisos).toContainEqual({ clave: 'sinLibroTxt', detalle: '' })
  })

  it('dos dedicatorias: la segunda pasa a pagina del principio con su texto entero', () => {
    const c = abrir(
      new Map([
        ['capitulos/cap01.md', strToU8('Capítulo 1: T\n\nTexto.\n')],
        ['extras/dedicatoria.md', strToU8('A mi madre.\n')],
        ['extras/dedicatoria-2.md', strToU8('Y a mi padre.\n')],
      ]),
    )
    // En orden natural «dedicatoria-2» va ANTES que «dedicatoria» (el guion
    // antes que el punto), igual que en el motor: esa es la que se queda.
    expect(c.proyecto.extras.map((x) => x.tipo)).toEqual(['dedicatoria', 'conTitulo'])
    expect(c.avisos).toContainEqual({ clave: 'dedicatoriaDeMas', detalle: 'extras/dedicatoria.md' })
    const textos = c.proyecto.extras.map((x) => x.bloques.map((b) => (b.tipo === 'parrafo' ? b.tramos[0]?.texto : '')).join(''))
    expect(textos.sort()).toEqual(['A mi madre.', 'Y a mi padre.'])
    expect(c.proyecto.extras[1]?.titulo).toEqual([t('Dedicatoria')])
  })
})

describe('lo que no se puede abrir lo dice, y no revienta', () => {
  it('algo que no es un zip', () => {
    expect(archivosDeZip(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull()
  })

  it('un zip que no es un libro', () => {
    const r = leerCopia(new Map([['fotos/playa.jpg', leer('imagenes/jpeg-rgb.jpg')]]), nuevoId)
    expect(r).toEqual({ ok: false, error: 'noEsCopia' })
  })

  it('un proyecto.json roto', () => {
    expect(leerCopia(new Map([[NOMBRE_JSON, strToU8('{ esto no es json')]]), nuevoId)).toEqual({ ok: false, error: 'danada' })
    expect(leerCopia(new Map([[NOMBRE_JSON, strToU8('{"formato":"otro"}')]]), nuevoId)).toEqual({ ok: false, error: 'danada' })
  })

  it('una copia de una version MAS NUEVA de Pubteca no se lee a medias', () => {
    const json = { formato: 'pubteca', version: VERSION_PROYECTO + 1, proyecto: { capitulos: [] } }
    expect(leerCopia(new Map([[NOMBRE_JSON, strToU8(JSON.stringify(json))]]), nuevoId)).toEqual({ ok: false, error: 'versionFutura' })
  })

  it('un json editado a mano: lo que no se entiende se descarta y se cuenta, lo demas se abre', () => {
    const json = {
      formato: 'pubteca',
      version: 1,
      proyecto: {
        datos: { titulo: 'Con \u0001 control', idioma: 'es' },
        capitulos: [
          { etiqueta: 'Capítulo 1', titulo: [{ texto: 'T', marcas: ['cursiva', 'subrayado'] }], bloques: [{ tipo: 'tabla' }, { tipo: 'parrafo', tramos: [{ texto: 'vale', marcas: [] }] }, { tipo: 'parrafo', tramos: 'no' }] },
          'esto no es un capitulo',
        ],
        extras: [{ tipo: 'raro' }],
      },
    }
    const r = leerCopia(new Map([[NOMBRE_JSON, strToU8(JSON.stringify(json))]]), nuevoId)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Sin archivos de texto que comparar, manda el json.
    const p = r.copia.proyecto
    expect(p.datos.titulo).toBe('Con  control')
    expect(p.capitulos).toHaveLength(1)
    expect(p.capitulos[0]?.titulo).toEqual([t('T', 'cursiva')])
    expect(p.capitulos[0]?.bloques.map((b) => b.tipo)).toEqual(['parrafo'])
    expect(p.extras).toEqual([])
    // La tabla, el parrafo con tramos que no son tramos, el capitulo que no es
    // un capitulo y el extra de tipo raro. La marca «subrayado» se quita sin
    // contar: el tramo se queda.
    expect(r.copia.avisos).toContainEqual({ clave: 'descartados', detalle: '4' })
  })
})

describe('el cambio de escena sobrevive a un separador que no es una marca', () => {
  it('«§» se pinta en el libro, pero en el archivo va una marca que el motor reconoce', () => {
    // Si se escribia «§», al volver a leer el archivo era un parrafo con «§».
    const { p, imagenes, bytes } = libroRico()
    const conParrafo = { ...p, datos: { ...p.datos, separadorDeEscena: '§' } }
    const c = abrir(copiaDe(conParrafo, imagenes, bytes))
    expect(c.proyecto.capitulos[0]?.bloques[1]?.tipo).toBe('escena')
    expect(c.proyecto.datos.separadorDeEscena).toBe('§')
    const md = new TextDecoder().decode(exportar(conParrafo, imagenes, bytes).proyecto.capitulos[0]?.bytes)
    expect(md).toContain('\n* * *\n')
  })
})
