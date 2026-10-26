/**
 * Lo que la app comprueba ANTES de llamar al motor, y como nombra las cosas
 * para que el autor las reconozca.
 *
 * Casi nada bloquea. Solo lo que haria un libro roto o distinto de lo que el
 * autor ve en pantalla: sin titulo, sin texto, o un capitulo sin cabecera (el
 * motor tomaria su primer parrafo como titulo). Todo lo demas avisa y deja
 * generar, igual que el generador original.
 */
import { identificador } from '../core/identificador'
import { revisarImagen, type RolImagen } from '../core/imagen-validacion'
import { Diagnosticos } from '../core/mensajes'
import { agrupar, tiendasDe, type Grupo, type Nivel, type Tienda } from './avisos'
import { arreglableEnLote } from './imagen-ajuste'
import { partirCabecera } from './importar/dialecto'
import { capituloConTexto } from './estado'
import { textoDeTramos, type Capitulo, type Extra, type Imagen, type Proyecto } from './modelo'

export type ClaveProblema =
  | 'sinTitulo'
  | 'sinTexto'
  | 'capituloSinTitulo'
  | 'paginaSinTitulo'
  | 'faltaImagen'
  | 'capituloVacio'

export interface Problema {
  readonly clave: ClaveProblema
  /** `bloquea` impide generar; `error` y `aviso` no. */
  readonly nivel: 'bloquea' | 'error' | 'aviso'
  /** Donde ir para arreglarlo. */
  readonly ir?: { readonly capitulo: string } | { readonly extra: string } | { readonly seccion: 'portada' }
  /** A que se refiere, con el nombre que ve el autor. */
  readonly que: string
}

/** Como se llama un capitulo en la interfaz: su etiqueta y su titulo, o su numero. */
export function nombreDeCapitulo(c: Capitulo, indice: number): string {
  const titulo = textoDeTramos(c.titulo).trim()
  if (c.etiqueta && titulo) return `${c.etiqueta}: ${titulo}`
  return c.etiqueta || titulo || `Capítulo sin título (${indice + 1}.º)`
}

export function nombreDeExtra(x: Extra): string {
  if (x.tipo === 'dedicatoria') return 'Dedicatoria'
  if (x.tipo === 'epigrafe') return 'Epígrafe'
  return textoDeTramos(x.titulo).trim() || 'Página sin título'
}

/**
 * Si la etiqueta la reconoce el libro como etiqueta.
 *
 * El motor solo separa «Capitulo N», «Cap. N», «Prologo», «Epilogo» e
 * «Interludio». Cualquier otra cosa («Parte uno») sale pegada al titulo, y la
 * interfaz lo tiene que decir en vez de ensenar una cabecera que no existira.
 */
export function etiquetaReconocida(etiqueta: string): boolean {
  if (etiqueta.trim() === '') return true
  return partirCabecera(`${etiqueta}: x`).etiqueta === etiqueta
}

function imagenesUsadas(p: Proyecto): { id: string; ir: Problema['ir']; que: string }[] {
  const usadas: { id: string; ir: Problema['ir']; que: string }[] = []
  for (const [i, c] of p.capitulos.entries()) {
    const nombre = nombreDeCapitulo(c, i)
    for (const a of c.aperturas) usadas.push({ id: a.imagenId, ir: { capitulo: c.id }, que: nombre })
    for (const b of c.bloques) {
      if (b.tipo === 'ilustracion') usadas.push({ id: b.imagenId, ir: { capitulo: c.id }, que: nombre })
    }
  }
  for (const x of p.extras) {
    for (const b of x.bloques) {
      if (b.tipo === 'ilustracion') usadas.push({ id: b.imagenId, ir: { extra: x.id }, que: nombreDeExtra(x) })
    }
  }
  for (const id of [...p.laminas, ...Object.values(p.portada)]) {
    usadas.push({ id, ir: { seccion: 'portada' }, que: 'Portada y láminas' })
  }
  return usadas
}

export function revisar(p: Proyecto, imagenes: ReadonlyMap<string, Imagen>): Problema[] {
  const r: Problema[] = []
  if (p.datos.titulo.trim() === '') r.push({ clave: 'sinTitulo', nivel: 'bloquea', que: 'El libro' })
  if (!p.capitulos.some(capituloConTexto)) r.push({ clave: 'sinTexto', nivel: 'bloquea', que: 'El libro' })

  for (const [i, c] of p.capitulos.entries()) {
    if (!capituloConTexto(c)) {
      r.push({ clave: 'capituloVacio', nivel: 'aviso', ir: { capitulo: c.id }, que: nombreDeCapitulo(c, i) })
    } else if (!c.etiqueta.trim() && !textoDeTramos(c.titulo).trim()) {
      r.push({ clave: 'capituloSinTitulo', nivel: 'bloquea', ir: { capitulo: c.id }, que: nombreDeCapitulo(c, i) })
    }
  }
  for (const x of p.extras) {
    if (x.tipo === 'conTitulo' && !textoDeTramos(x.titulo).trim()) {
      r.push({ clave: 'paginaSinTitulo', nivel: 'bloquea', ir: { extra: x.id }, que: nombreDeExtra(x) })
    }
  }

  const vistas = new Set<string>()
  for (const u of imagenesUsadas(p)) {
    if (imagenes.has(u.id)) continue
    const clave = `${u.que}|${u.id}`
    if (vistas.has(clave)) continue
    vistas.add(clave)
    r.push({ clave: 'faltaImagen', nivel: 'error', ...(u.ir ? { ir: u.ir } : {}), que: u.que })
  }
  return r
}

export const bloquea = (problemas: readonly Problema[]): boolean => problemas.some((x) => x.nivel === 'bloquea')

/**
 * Si el libro ya se descargo con OTRA identidad.
 *
 * Sin ISBN, el identificador del EPUB sale de titulo|autor. Si el autor ya
 * publico y luego corrige el titulo, para Amazon y Apple es otro libro: las
 * resenas y las compras se quedan en el viejo. No se prohibe (antes de
 * publicar, corregir es lo normal), pero se avisa.
 */
export function cambioDeIdentidad(p: Proyecto): { antes: { titulo: string; autor: string } } | null {
  const d = p.descargado
  if (!d) return null
  const ahora = identificador(p.datos.titulo, p.datos.autor, p.datos.isbn)
  return ahora === d.uid ? null : { antes: { titulo: d.titulo, autor: d.autor } }
}

/**
 * Nombres legibles para lo que el motor llama por su ruta.
 *
 * El motor dice «ilustraciones/cap03-02.png»; el autor subio
 * «dibujo-tormenta.png» y lo ve en el capitulo «La tormenta». `nombres` es el
 * id -> nombre de archivo que decidio exportar().
 */
export function nombresLegibles(
  p: Proyecto,
  imagenes: ReadonlyMap<string, Imagen>,
  nombres: ReadonlyMap<string, string>,
): Map<string, string> {
  const r = new Map<string, string>()
  const original = (id: string): string => {
    const n = imagenes.get(id)?.nombreOriginal
    return n ? ` (${n})` : ''
  }
  const roles: Record<string, string> = {
    portada: 'La portada',
    contraportada: 'La contraportada',
    logo: 'El logo',
    logoBlanco: 'El logo para modo oscuro',
  }
  for (const [rol, id] of Object.entries(p.portada)) {
    const nombre = nombres.get(id)
    if (nombre) r.set(`portada/${nombre}`, `${roles[rol] ?? rol}${original(id)}`)
  }
  for (const [i, id] of p.laminas.entries()) {
    const nombre = nombres.get(id)
    if (nombre) r.set(`ilustraciones/${nombre}`, `Lámina a color ${i + 1}${original(id)}`)
  }
  for (const [i, c] of p.capitulos.entries()) {
    const nn = String(i + 1).padStart(2, '0')
    const cap = nombreDeCapitulo(c, i)
    r.set(`capitulos/cap${nn}.md`, cap)
    const ids = [...c.aperturas.map((a) => a.imagenId), ...c.bloques.flatMap((b) => (b.tipo === 'ilustracion' ? [b.imagenId] : []))]
    for (const [k, id] of ids.entries()) {
      const nombre = nombres.get(id)
      const legible = `${cap} · ilustración ${k + 1}${original(id)}`
      if (nombre) r.set(`ilustraciones/${nombre}`, legible)
      // La nota de descripciones dice «capitulos/cap03.md → cap03-02».
      if (nombre) r.set(`capitulos/cap${nn}.md → ${nombre.replace(/\.(png|jpg)$/u, '')}`, legible)
    }
  }
  return r
}

/**
 * Los avisos de UNA imagen, para su tarjeta: los mismos que dara el motor al
 * generar, con el mismo codigo (`revisarImagen`), solo que antes.
 */
export function avisosDeImagen(imagen: Imagen, rol: RolImagen): Grupo[] {
  const dg = new Diagnosticos()
  revisarImagen(
    imagen.nombreOriginal,
    {
      bytes: imagen.bytes,
      tipo: imagen.tipo,
      ancho: imagen.ancho,
      alto: imagen.alto,
      alfa: imagen.alfa ?? false,
      cmyk: imagen.cmyk ?? false,
      p3: imagen.p3 ?? false,
      impostor: null,
      truncada: false,
    },
    rol,
    dg,
  )
  return agrupar(dg)
}

// ---------------------------------------------------------------------------
// Lo que queda por hacerle a las imagenes antes de descargar
// ---------------------------------------------------------------------------

/**
 * El papel con el que cada imagen entra al libro.
 *
 * Importa porque `revisarImagen` revisa distinto segun el papel: un logo no se
 * mira por CMYK ni por peso, y una portada tiene sus propios minimos. Revisar
 * la portada como si fuera una ilustracion le sacaria avisos que el motor no
 * va a dar.
 *
 * Una imagen usada en dos papeles se queda con el PRIMERO de esta lista, que
 * es el orden en que el motor la registra.
 */
export function rolesDeImagenes(p: Proyecto): Map<string, RolImagen> {
  const r = new Map<string, RolImagen>()
  const poner = (id: string, rol: RolImagen): void => {
    if (!r.has(id)) r.set(id, rol)
  }
  if (p.portada.portada !== undefined) poner(p.portada.portada, 'portada')
  if (p.portada.contraportada !== undefined) poner(p.portada.contraportada, 'portada')
  if (p.portada.logo !== undefined) poner(p.portada.logo, 'logo')
  if (p.portada.logoBlanco !== undefined) poner(p.portada.logoBlanco, 'logo')
  for (const id of p.laminas) poner(id, 'ilustracion')
  for (const c of p.capitulos) {
    for (const a of c.aperturas) poner(a.imagenId, 'ilustracion')
    for (const b of c.bloques) if (b.tipo === 'ilustracion') poner(b.imagenId, 'ilustracion')
  }
  for (const x of p.extras) {
    for (const b of x.bloques) if (b.tipo === 'ilustracion') poner(b.imagenId, 'ilustracion')
  }
  return r
}

/** Un grupo de avisos de imagen con las imagenes que lo tienen. */
export interface Pendiente {
  readonly clave: Grupo['clave']
  readonly nivel: Nivel
  /** A que tiendas les importa. */
  readonly tiendas: readonly Tienda[]
  /** Los ids de las afectadas, en el orden del libro y sin repetir. */
  readonly imagenes: readonly string[]
  /** Si «Arreglarlas todas» puede con esto sin tocar el dibujo. */
  readonly enLote: boolean
}

/**
 * Lo que les queda por hacer a las imagenes del libro, agrupado.
 *
 * Es lo que la pantalla de descarga recuerda ANTES de preparar los EPUB. No
 * bloquea nada: un libro con imagenes grandes se publica igual, solo que mas
 * caro de entregar y peor de ver. Lo que no se puede es descubrirlo despues de
 * subirlo a KDP.
 *
 * Es el mismo codigo que la tarjeta de cada imagen (`avisosDeImagen`, que a su
 * vez es el del motor), solo que de todas a la vez: asi no hay dos opiniones
 * sobre si una imagen esta bien.
 */
export function pendientesDeImagenes(
  p: Proyecto,
  imagenes: ReadonlyMap<string, Imagen>,
): Pendiente[] {
  const grupos = new Map<Grupo['clave'], { nivel: Nivel; imagenes: string[] }>()
  for (const [id, rol] of rolesDeImagenes(p)) {
    const imagen = imagenes.get(id)
    if (!imagen) continue
    for (const g of avisosDeImagen(imagen, rol)) {
      // «otro» no se agrupa ni se sabe arreglar: no es de esta pantalla.
      if (g.clave === 'otro') continue
      const ya = grupos.get(g.clave) ?? { nivel: g.nivel, imagenes: [] }
      if (!grupos.has(g.clave)) grupos.set(g.clave, ya)
      if (!ya.imagenes.includes(id)) ya.imagenes.push(id)
    }
  }
  return [...grupos].map(([clave, x]) => ({
    clave,
    nivel: x.nivel,
    tiendas: tiendasDe(clave),
    imagenes: x.imagenes,
    enLote: arreglableEnLote(clave),
  }))
}

/** Las imagenes que «Arreglarlas todas» va a tocar, sin repetir. */
export function imagenesDelLote(pendientes: readonly Pendiente[]): string[] {
  const ids: string[] = []
  for (const x of pendientes) {
    if (!x.enLote) continue
    for (const id of x.imagenes) if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * Lo que queda pendiente SOLO para Kindle.
 *
 * Son los que «Comprimirlas en JPEG para Kindle» contesta por si sola, y la
 * casilla esta en esta misma pantalla: la transparencia (el JPEG no la guarda,
 * que es lo que Kindle hace de todos modos) y el peso (la tarifa de Amazon se
 * cobra por MB, y comprimir es justo eso).
 *
 * Lo que ademas le pasa a Apple Books NO esta aqui: comprimir para Kindle no
 * arregla un color en P3 ni una imagen borrosa en el otro EPUB.
 */
export function pendientesDeKindle(pendientes: readonly Pendiente[]): Pendiente[] {
  return pendientes.filter((x) => x.tiendas.length === 1 && x.tiendas[0] === 'kindle')
}
