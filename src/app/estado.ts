/**
 * El estado de la app, como reductor PURO.
 *
 * La interfaz no tiene oraculo: no hay un Python contra el que comparar lo que
 * pasa al pulsar Intro en mitad de un parrafo. Lo que sostiene la calidad es
 * que TODA la logica viva aqui, sin React y sin navegador, y que se pruebe en
 * node. Los componentes solo pintan el estado y despachan acciones.
 *
 * Reglas:
 *   - Nada de reloj ni azar dentro: los ids nuevos y la hora llegan en la
 *     accion. Asi el reductor es determinista y React puede llamarlo dos
 *     veces (StrictMode lo hace) sin efectos raros.
 *   - El foco tambien es estado: despues de partir un parrafo el cursor tiene
 *     que ir al nuevo, y eso se decide aqui y se prueba aqui. El editor solo
 *     lo aplica.
 *   - Deshacer guarda instantaneas del proyecto, que es inmutable, asi que
 *     cuestan poco. Lo que se escribe seguido en el mismo sitio se deshace de
 *     una vez.
 */
import { nombreSeguro } from '../core/texto'
import { textosLibro } from '../core/textos-libro'
import { reducirImportacion, type AccionImportacion, type Importacion } from './importacion'
import {
  DATOS_POR_DEFECTO,
  VERSION_PROYECTO,
  textoDeTramos,
  type Bloque,
  type Capitulo,
  type DatosLibro,
  type DondeExtra,
  type Extra,
  type Imagen,
  type Proyecto,
  type RolPortada,
  type TipoExtra,
  type Tramo,
} from './modelo'
import { canonicos, igualesTramos, limpiarTexto, longitud, partir, plano, prefijoComun, recortar, sustituir, unir } from './tramos'
import type { PosVerso } from './versos'

export type Pantalla = 'inicio' | 'importar' | 'libro'
export type Seccion = 'capitulos' | 'portada' | 'extras' | 'descargar'

/** El contenedor de una lista de bloques: un capitulo o un extra. */
export type Donde =
  | { readonly tipo: 'capitulo'; readonly id: string }
  | { readonly tipo: 'extra'; readonly id: string }

export type Posicion = number | 'inicio' | 'fin'

/**
 * A donde va el cursor despues de una accion.
 *
 * `objetivo` es el id de un bloque, `titulo:<id del contenedor>` para el
 * titulo, o `verso:<id del bloque>:<estrofa>:<verso>` para un verso.
 */
export interface Foco {
  readonly objetivo: string
  readonly posicion: Posicion
  /** Cambia en cada peticion: pedir dos veces el mismo sitio tambien mueve el cursor. */
  readonly seq: number
}

export const objetivoTitulo = (id: string): string => `titulo:${id}`
export const objetivoVerso = (bloque: string, p: { estrofa: number; verso: number }): string =>
  `verso:${bloque}:${p.estrofa}:${p.verso}`

interface Instantanea {
  readonly proyecto: Proyecto
  readonly seccion: Seccion
  readonly capituloActivo: string | null
  readonly extraActivo: string | null
  /** Que se toco: para devolver ahi el cursor al deshacer. */
  readonly objetivo: string | null
  readonly ahora: number
}

export interface Estado {
  readonly pantalla: Pantalla
  readonly proyecto: Proyecto | null
  /** Los metadatos de las imagenes del proyecto. Los bytes viven en el almacen. */
  readonly imagenes: ReadonlyMap<string, Imagen>
  readonly seccion: Seccion
  readonly capituloActivo: string | null
  readonly extraActivo: string | null
  /** El bloque sobre el que actua la barra de formato. */
  readonly bloqueActivo: string | null
  readonly foco: Foco | null
  readonly importacion: Importacion | null
  readonly pasado: readonly Instantanea[]
  readonly futuro: readonly Instantanea[]
  /** El grupo de la ultima edicion, para juntar lo que se escribe seguido. */
  readonly ultimoGrupo: string | null
  readonly seq: number
}

/** Cuanto tiempo se juntan las pulsaciones seguidas en un solo «deshacer». */
export const VENTANA_DESHACER = 1500
/** Cuantos pasos se pueden deshacer. */
export const LIMITE_DESHACER = 200

export const ESTADO_INICIAL: Estado = {
  pantalla: 'inicio',
  proyecto: null,
  imagenes: new Map(),
  seccion: 'capitulos',
  capituloActivo: null,
  extraActivo: null,
  bloqueActivo: null,
  foco: null,
  importacion: null,
  pasado: [],
  futuro: [],
  ultimoGrupo: null,
  seq: 0,
}

export type Accion =
  // ciclo de vida
  | { readonly tipo: 'nuevoProyecto'; readonly id: string; readonly capitulo: string; readonly bloque: string }
  | { readonly tipo: 'abrir'; readonly proyecto: Proyecto; readonly imagenes: readonly Imagen[] }
  | { readonly tipo: 'cerrar' }
  | { readonly tipo: 'irA'; readonly seccion: Seccion }
  | { readonly tipo: 'abrirCapitulo'; readonly id: string }
  | { readonly tipo: 'abrirExtra'; readonly id: string }
  | { readonly tipo: 'activarBloque'; readonly bloque: string | null }
  // importar
  | { readonly tipo: 'empezarImportacion'; readonly importacion: Importacion }
  | { readonly tipo: 'importacion'; readonly accion: AccionImportacion }
  | { readonly tipo: 'cancelarImportacion' }
  | {
      readonly tipo: 'incorporar'
      /** Para crear el proyecto si se importo desde la pantalla de inicio. */
      readonly idProyecto: string
      readonly capitulos: readonly Capitulo[]
      readonly extras: readonly Extra[]
      readonly imagenes: readonly Imagen[]
    }
  // capitulos
  | { readonly tipo: 'nuevoCapitulo'; readonly id: string; readonly bloque: string; readonly despuesDe?: string }
  | { readonly tipo: 'borrarCapitulo'; readonly id: string }
  | { readonly tipo: 'moverCapitulo'; readonly id: string; readonly a: number }
  | { readonly tipo: 'etiqueta'; readonly capitulo: string; readonly texto: string; readonly ahora: number }
  | { readonly tipo: 'titulo'; readonly donde: Donde; readonly tramos: readonly Tramo[]; readonly ahora: number }
  | { readonly tipo: 'renumerar' }
  // bloques
  | {
      readonly tipo: 'texto'
      readonly donde: Donde
      readonly bloque: string
      readonly tramos: readonly Tramo[]
      readonly ahora: number
      /** Poner o quitar cursiva o negrita: se deshace solo, no con lo escrito. */
      readonly formato?: boolean
    }
  | { readonly tipo: 'partir'; readonly donde: Donde; readonly bloque: string; readonly offset: number; readonly nuevoId: string }
  | { readonly tipo: 'unirConAnterior'; readonly donde: Donde; readonly bloque: string }
  | { readonly tipo: 'unirConSiguiente'; readonly donde: Donde; readonly bloque: string }
  | { readonly tipo: 'insertar'; readonly donde: Donde; readonly indice: number; readonly bloque: Bloque }
  | {
      readonly tipo: 'pegar'
      readonly donde: Donde
      readonly bloque: string
      readonly inicio: number
      readonly fin: number
      /** Lo pegado, ya convertido en parrafos y cambios de escena. */
      readonly bloques: readonly Bloque[]
      readonly nuevoId: string
    }
  | { readonly tipo: 'borrarBloque'; readonly donde: Donde; readonly bloque: string }
  | { readonly tipo: 'moverBloque'; readonly donde: Donde; readonly bloque: string; readonly delta: -1 | 1 }
  | {
      readonly tipo: 'convertir'
      readonly donde: Donde
      readonly bloque: string
      readonly a: 'parrafo' | 'subtitulo' | 'versos'
      /** Ids para los parrafos que salen al deshacer unos versos en varios. */
      readonly ids: readonly string[]
    }
  | {
      readonly tipo: 'versos'
      readonly donde: Donde
      readonly bloque: string
      readonly estrofas: readonly (readonly Tramo[])[]
      readonly foco?: PosVerso
      readonly ahora: number
    }
  | { readonly tipo: 'salirDeVersos'; readonly donde: Donde; readonly bloque: string; readonly estrofas: readonly (readonly Tramo[])[]; readonly nuevoId: string }
  | {
      readonly tipo: 'ilustracion'
      readonly donde: Donde
      readonly bloque: string
      readonly cambios: { readonly alt?: string; readonly decorativa?: boolean; readonly imagenId?: string }
      readonly ahora: number
    }
  | { readonly tipo: 'aApertura'; readonly capitulo: string; readonly bloque: string }
  | { readonly tipo: 'deApertura'; readonly capitulo: string; readonly indice: number; readonly nuevoId: string }
  | { readonly tipo: 'quitarApertura'; readonly capitulo: string; readonly indice: number }
  | { readonly tipo: 'aperturaAlt'; readonly capitulo: string; readonly indice: number; readonly alt: string; readonly ahora: number }
  // imagenes, portada y laminas
  | { readonly tipo: 'registrarImagenes'; readonly imagenes: readonly Imagen[] }
  | { readonly tipo: 'portada'; readonly cambios: Readonly<Partial<Record<RolPortada, string | null>>> }
  | { readonly tipo: 'anadirLamina'; readonly imagenId: string }
  | { readonly tipo: 'quitarLamina'; readonly indice: number }
  | { readonly tipo: 'moverLamina'; readonly indice: number; readonly delta: -1 | 1 }
  // extras
  | { readonly tipo: 'nuevoExtra'; readonly id: string; readonly clase: TipoExtra; readonly donde: DondeExtra; readonly bloque: string }
  | { readonly tipo: 'borrarExtra'; readonly id: string }
  | { readonly tipo: 'moverExtra'; readonly id: string; readonly delta: -1 | 1 }
  | { readonly tipo: 'dondeExtra'; readonly id: string; readonly donde: DondeExtra }
  // datos del libro
  | { readonly tipo: 'dato'; readonly campo: keyof DatosLibro; readonly valor: string | boolean; readonly ahora: number }
  | { readonly tipo: 'descargado'; readonly uid: string; readonly cuando: number }
  | { readonly tipo: 'copiaGuardada'; readonly cuando: number }
  // historia
  | { readonly tipo: 'deshacer' }
  | { readonly tipo: 'rehacer' }

// ---------------------------------------------------------------------------
// Utilidades sobre el proyecto
// ---------------------------------------------------------------------------

const parrafoVacio = (id: string): Bloque => ({ id, tipo: 'parrafo', tramos: [] })

export const esBloqueDeTexto = (
  b: Bloque | undefined,
): b is Extract<Bloque, { tipo: 'parrafo' | 'subtitulo' }> =>
  b !== undefined && (b.tipo === 'parrafo' || b.tipo === 'subtitulo')

/** Si un capitulo tiene algo escrito. Uno vacio se reemplaza al importar. */
export function capituloConTexto(c: Capitulo): boolean {
  if (textoDeTramos(c.titulo).trim() !== '' || c.aperturas.length > 0) return true
  return c.bloques.some((b) =>
    esBloqueDeTexto(b)
      ? textoDeTramos(b.tramos).trim() !== ''
      : b.tipo === 'versos'
        ? b.estrofas.some((e) => e.some((v) => v.texto.trim() !== ''))
        : true,
  )
}

export function proyectoVacio(id: string, capitulo: string, bloque: string): Proyecto {
  return {
    id,
    version: VERSION_PROYECTO,
    datos: DATOS_POR_DEFECTO,
    capitulos: [{ id: capitulo, etiqueta: 'Capítulo 1', titulo: [], aperturas: [], bloques: [parrafoVacio(bloque)] }],
    extras: [],
    laminas: [],
    portada: {},
  }
}

function bloquesDe(p: Proyecto, donde: Donde): readonly Bloque[] | undefined {
  return donde.tipo === 'capitulo'
    ? p.capitulos.find((c) => c.id === donde.id)?.bloques
    : p.extras.find((x) => x.id === donde.id)?.bloques
}

function conBloques(p: Proyecto, donde: Donde, f: (bloques: readonly Bloque[]) => readonly Bloque[]): Proyecto {
  if (donde.tipo === 'capitulo') {
    return {
      ...p,
      capitulos: p.capitulos.map((c) => (c.id === donde.id ? { ...c, bloques: f(c.bloques) } : c)),
    }
  }
  return {
    ...p,
    extras: p.extras.map((x) => (x.id === donde.id ? { ...x, bloques: f(x.bloques) } : x)),
  }
}

function conCapitulo(p: Proyecto, id: string, f: (c: Capitulo) => Capitulo): Proyecto {
  return { ...p, capitulos: p.capitulos.map((c) => (c.id === id ? f(c) : c)) }
}

/** Donde esta un bloque, en todo el proyecto. Los ids son unicos en el proyecto. */
export function buscarBloque(
  p: Proyecto,
  id: string,
): { donde: Donde; indice: number; bloque: Bloque } | null {
  for (const c of p.capitulos) {
    const i = c.bloques.findIndex((b) => b.id === id)
    if (i !== -1) return { donde: { tipo: 'capitulo', id: c.id }, indice: i, bloque: c.bloques[i] as Bloque }
  }
  for (const x of p.extras) {
    const i = x.bloques.findIndex((b) => b.id === id)
    if (i !== -1) return { donde: { tipo: 'extra', id: x.id }, indice: i, bloque: x.bloques[i] as Bloque }
  }
  return null
}

/** El texto plano de lo que senala un objetivo de foco, para colocar el cursor al deshacer. */
function textoDeObjetivo(p: Proyecto, objetivo: string): string | null {
  if (objetivo.startsWith('titulo:')) {
    const id = objetivo.slice('titulo:'.length)
    const c = p.capitulos.find((x) => x.id === id) ?? p.extras.find((x) => x.id === id)
    return c ? textoDeTramos(c.titulo) : null
  }
  const b = buscarBloque(p, objetivo)?.bloque
  if (!b) return null
  return esBloqueDeTexto(b) ? textoDeTramos(b.tramos) : ''
}

const RE_NUMERADA = /^(cap[ií]tulo|cap\.)(\s+)(\p{Nd}+)$/iu

/**
 * Pone en orden los numeros de las etiquetas «Capitulo N». Solo toca las que
 * son exactamente eso: «Prologo», «Interludio» o una etiqueta con letra se
 * quedan como estan, y no cuentan.
 */
export function renumerar(capitulos: readonly Capitulo[]): Capitulo[] {
  let n = 0
  return capitulos.map((c) => {
    const m = RE_NUMERADA.exec(c.etiqueta)
    if (!m) return c
    n += 1
    const etiqueta = `${m[1]}${m[2]}${n}`
    return etiqueta === c.etiqueta ? c : { ...c, etiqueta }
  })
}

/** Si al reordenar los «Capitulo N» se quedaron fuera de orden. */
export function numeracionDesordenada(capitulos: readonly Capitulo[]): boolean {
  return renumerar(capitulos).some((c, i) => c !== capitulos[i])
}

/** La etiqueta de un capitulo nuevo: el siguiente numero, si el libro numera. */
export function etiquetaSiguiente(capitulos: readonly Capitulo[]): string {
  if (capitulos.length === 0) return 'Capítulo 1'
  let max = 0
  let palabra = ''
  for (const c of capitulos) {
    const m = RE_NUMERADA.exec(c.etiqueta)
    if (m) {
      max = Math.max(max, Number.parseInt(m[3] as string, 10))
      palabra = `${m[1]}${m[2]}`
    }
  }
  return palabra ? `${palabra}${max + 1}` : ''
}

/**
 * El nombre de archivo de cada extra.
 *
 * El motor ENRUTA los extras por el nombre y los ORDENA por el nombre, asi que
 * el nombre no es un detalle:
 *   - lleva el numero de orden delante, o «Sobre el autor» saldria antes que
 *     «Agradecimientos» solo por el alfabeto;
 *   - no puede contener «dedicatoria» ni «epigrafe», o una pagina titulada
 *     «Epigrafes y citas» se convertiria en el epigrafe del libro.
 */
export function nombresDeExtras(extras: readonly Extra[]): Extra[] {
  let inicio = 0
  let final = 0
  return extras.map((x) => {
    if (x.tipo === 'dedicatoria' || x.tipo === 'epigrafe') {
      const nombreArchivo = x.tipo
      return x.nombreArchivo === nombreArchivo && x.donde === 'inicio' ? x : { ...x, donde: 'inicio', nombreArchivo }
    }
    const n = x.donde === 'inicio' ? ++inicio : ++final
    const slug =
      nombreSeguro(textoDeTramos(x.titulo))
        .replace(/\./g, '')
        .replace(/dedicatoria|epigrafe/g, 'pagina')
        .replace(/^-+|-+$/g, '') || 'pagina'
    const nombreArchivo = `${String(n).padStart(2, '0')}-${slug === 'archivo' ? 'pagina' : slug}`
    return x.nombreArchivo === nombreArchivo ? x : { ...x, nombreArchivo }
  })
}

/** Los extras en el orden en que salen en el libro: inicio, luego final. */
export function ordenarExtras(extras: readonly Extra[]): Extra[] {
  const peso = (x: Extra): number => (x.tipo === 'dedicatoria' ? 0 : x.tipo === 'epigrafe' ? 1 : x.donde === 'inicio' ? 2 : 3)
  return [...extras].map((x, i) => ({ x, i })).sort((a, b) => peso(a.x) - peso(b.x) || a.i - b.i).map((e) => e.x)
}

function conExtras(p: Proyecto, extras: readonly Extra[]): Proyecto {
  return { ...p, extras: nombresDeExtras(ordenarExtras(extras)) }
}

/** Una verso del modelo: un tramo con el texto limpio y las marcas canonicas. */
function versoCanonico(v: Tramo): Tramo {
  return {
    texto: limpiarTexto(v.texto),
    marcas: (['cursiva', 'negrita'] as const).filter((m) => v.marcas.includes(m)),
  }
}

/** Unos tramos convertidos en UN verso: se conserva el enfasis si es uniforme. */
function comoVerso(tramos: readonly Tramo[]): Tramo {
  const t = canonicos(tramos)
  const primeras = t[0]?.marcas ?? []
  const uniforme = t.every((x) => x.marcas.length === primeras.length && x.marcas.every((m) => primeras.includes(m)))
  return { texto: plano(t), marcas: uniforme ? [...primeras] : [] }
}

// ---------------------------------------------------------------------------
// El reductor
// ---------------------------------------------------------------------------

function pedirFoco(e: Estado, objetivo: string, posicion: Posicion): Pick<Estado, 'foco' | 'seq'> {
  return { foco: { objetivo, posicion, seq: e.seq + 1 }, seq: e.seq + 1 }
}

interface Opciones {
  /** Las ediciones con el mismo grupo dentro de la ventana se deshacen juntas. */
  readonly grupo?: string
  readonly ahora?: number
  /** Que se toco, para devolver ahi el cursor al deshacer. */
  readonly objetivo?: string | null
}

/** Aplica un cambio al proyecto guardando la instantanea para deshacer. */
function cambiar(e: Estado, proyecto: Proyecto, o: Opciones = {}): Estado {
  if (!e.proyecto || proyecto === e.proyecto) return e
  const grupo = o.grupo ?? null
  const ahora = o.ahora ?? 0
  const tope = e.pasado[e.pasado.length - 1]
  const juntar =
    grupo !== null && e.ultimoGrupo === grupo && tope !== undefined && ahora - tope.ahora < VENTANA_DESHACER
  const pasado = juntar
    ? e.pasado
    : [
        ...e.pasado,
        {
          proyecto: e.proyecto,
          seccion: e.seccion,
          capituloActivo: e.capituloActivo,
          extraActivo: e.extraActivo,
          objetivo: o.objetivo ?? null,
          ahora,
        },
      ].slice(-LIMITE_DESHACER)
  return { ...e, proyecto, pasado, futuro: [], ultimoGrupo: grupo }
}

/**
 * Lo que NO se deshace: son hechos del mundo, no ediciones. Deshacer una
 * errata no puede olvidar que el libro ya se descargo o que hay copia.
 */
function conservarHechos(restaurado: Proyecto, actual: Proyecto): Proyecto {
  return { ...restaurado, ultimaCopia: actual.ultimaCopia, descargado: actual.descargado }
}

function viajar(e: Estado, desde: 'pasado' | 'futuro'): Estado {
  const pila = e[desde]
  const snap = pila[pila.length - 1]
  if (!snap || !e.proyecto) return e
  const actual: Instantanea = {
    proyecto: e.proyecto,
    seccion: e.seccion,
    capituloActivo: e.capituloActivo,
    extraActivo: e.extraActivo,
    objetivo: snap.objetivo,
    ahora: snap.ahora,
  }
  const proyecto = conservarHechos(snap.proyecto, e.proyecto)
  let foco: Pick<Estado, 'foco' | 'seq'> = { foco: null, seq: e.seq }
  if (snap.objetivo) {
    const antes = textoDeObjetivo(e.proyecto, snap.objetivo)
    const despues = textoDeObjetivo(proyecto, snap.objetivo)
    if (despues !== null) foco = pedirFoco(e, snap.objetivo, prefijoComun(antes ?? '', despues))
  }
  const otra = desde === 'pasado' ? 'futuro' : 'pasado'
  return {
    ...e,
    proyecto,
    seccion: snap.seccion,
    capituloActivo: snap.capituloActivo,
    extraActivo: snap.extraActivo,
    [desde]: pila.slice(0, -1),
    [otra]: [...e[otra], actual],
    ultimoGrupo: null,
    ...foco,
  }
}

/** Abre el proyecto en el editor, con la historia limpia. */
function abrirEn(e: Estado, proyecto: Proyecto, imagenes: ReadonlyMap<string, Imagen>): Estado {
  return {
    ...e,
    pantalla: 'libro',
    proyecto,
    imagenes,
    seccion: 'capitulos',
    capituloActivo: proyecto.capitulos[0]?.id ?? null,
    extraActivo: null,
    bloqueActivo: null,
    importacion: null,
    pasado: [],
    futuro: [],
    ultimoGrupo: null,
  }
}

export function reducir(e: Estado, a: Accion): Estado {
  const p = e.proyecto

  switch (a.tipo) {
    // -- ciclo de vida -----------------------------------------------------
    case 'nuevoProyecto': {
      const nuevo = abrirEn(e, proyectoVacio(a.id, a.capitulo, a.bloque), new Map())
      // Entrada directa a un capitulo vacio con el cursor puesto: los datos
      // del libro se piden al descargar, no al empezar.
      return { ...nuevo, ...pedirFoco(e, objetivoTitulo(a.capitulo), 'inicio') }
    }
    case 'abrir':
      return abrirEn(e, a.proyecto, new Map(a.imagenes.map((i) => [i.id, i])))
    case 'cerrar':
      return { ...ESTADO_INICIAL, seq: e.seq }
    case 'irA':
      return { ...e, seccion: a.seccion, bloqueActivo: null }
    case 'abrirCapitulo':
      return p?.capitulos.some((c) => c.id === a.id)
        ? { ...e, seccion: 'capitulos', capituloActivo: a.id, bloqueActivo: null }
        : e
    case 'abrirExtra':
      return p?.extras.some((x) => x.id === a.id)
        ? { ...e, seccion: 'extras', extraActivo: a.id, bloqueActivo: null }
        : e
    case 'activarBloque':
      return e.bloqueActivo === a.bloque ? e : { ...e, bloqueActivo: a.bloque }

    // -- importar ----------------------------------------------------------
    case 'empezarImportacion':
      return { ...e, pantalla: 'importar', importacion: a.importacion }
    case 'importacion':
      return e.importacion ? { ...e, importacion: reducirImportacion(e.importacion, a.accion) } : e
    case 'cancelarImportacion':
      return { ...e, pantalla: p ? 'libro' : 'inicio', importacion: null }
    case 'incorporar': {
      const imagenes = new Map(e.imagenes)
      for (const i of a.imagenes) imagenes.set(i.id, i)
      const primero = a.capitulos[0]?.id ?? null
      if (!p) {
        const base = proyectoVacio(a.idProyecto, '', '')
        const nuevo = conExtras({ ...base, capitulos: [...a.capitulos] }, a.extras)
        return { ...abrirEn(e, nuevo, imagenes), capituloActivo: primero }
      }
      // Si el libro solo tiene capitulos vacios (el «Libro nuevo» recien
      // creado), lo importado los reemplaza en vez de quedar detras.
      const capitulos = p.capitulos.some(capituloConTexto) ? [...p.capitulos, ...a.capitulos] : [...a.capitulos]
      const hayDedicatoria = p.extras.some((x) => x.tipo === 'dedicatoria')
      const hayEpigrafe = p.extras.some((x) => x.tipo === 'epigrafe')
      const extras = [
        ...p.extras,
        ...a.extras.filter(
          (x) => !(x.tipo === 'dedicatoria' && hayDedicatoria) && !(x.tipo === 'epigrafe' && hayEpigrafe),
        ),
      ]
      const tras = cambiar(e, conExtras({ ...p, capitulos }, extras))
      return {
        ...tras,
        pantalla: 'libro',
        importacion: null,
        imagenes,
        seccion: 'capitulos',
        capituloActivo: primero ?? e.capituloActivo,
        ultimoGrupo: null,
      }
    }
    case 'registrarImagenes': {
      const imagenes = new Map(e.imagenes)
      for (const i of a.imagenes) imagenes.set(i.id, i)
      return { ...e, imagenes }
    }
  }

  // Todo lo que sigue edita un proyecto abierto.
  if (!p) return e

  switch (a.tipo) {
    // -- capitulos ---------------------------------------------------------
    case 'nuevoCapitulo': {
      const nuevo: Capitulo = {
        id: a.id,
        etiqueta: etiquetaSiguiente(p.capitulos),
        titulo: [],
        aperturas: [],
        bloques: [parrafoVacio(a.bloque)],
      }
      const i = a.despuesDe ? p.capitulos.findIndex((c) => c.id === a.despuesDe) : -1
      const capitulos = [...p.capitulos]
      capitulos.splice(i === -1 ? capitulos.length : i + 1, 0, nuevo)
      return {
        ...cambiar(e, { ...p, capitulos }),
        seccion: 'capitulos',
        capituloActivo: a.id,
        ...pedirFoco(e, objetivoTitulo(a.id), 'inicio'),
      }
    }
    case 'borrarCapitulo': {
      const i = p.capitulos.findIndex((c) => c.id === a.id)
      if (i === -1) return e
      const capitulos = p.capitulos.filter((c) => c.id !== a.id)
      const vecino = capitulos[Math.min(i, capitulos.length - 1)]?.id ?? null
      return {
        ...cambiar(e, { ...p, capitulos }),
        capituloActivo: e.capituloActivo === a.id ? vecino : e.capituloActivo,
      }
    }
    case 'moverCapitulo': {
      const i = p.capitulos.findIndex((c) => c.id === a.id)
      if (i === -1) return e
      const destino = Math.max(0, Math.min(a.a, p.capitulos.length - 1))
      if (destino === i) return e
      const capitulos = [...p.capitulos]
      const [c] = capitulos.splice(i, 1)
      capitulos.splice(destino, 0, c as Capitulo)
      return cambiar(e, { ...p, capitulos })
    }
    case 'etiqueta': {
      const texto = limpiarTexto(a.texto)
      return cambiar(e, conCapitulo(p, a.capitulo, (c) => ({ ...c, etiqueta: texto })), {
        grupo: `etiqueta:${a.capitulo}`,
        ahora: a.ahora,
      })
    }
    case 'titulo': {
      const tramos = canonicos(a.tramos)
      const objetivo = objetivoTitulo(a.donde.id)
      const o = { grupo: objetivo, ahora: a.ahora, objetivo }
      if (a.donde.tipo === 'capitulo') {
        return cambiar(e, conCapitulo(p, a.donde.id, (c) => ({ ...c, titulo: tramos })), o)
      }
      const id = a.donde.id
      return cambiar(e, conExtras(p, p.extras.map((x) => (x.id === id ? { ...x, titulo: tramos } : x))), o)
    }
    case 'renumerar':
      return cambiar(e, { ...p, capitulos: renumerar(p.capitulos) })

    // -- bloques -----------------------------------------------------------
    case 'texto': {
      const tramos = canonicos(a.tramos)
      const actual = buscarBloque(p, a.bloque)?.bloque
      if (esBloqueDeTexto(actual) && igualesTramos(actual.tramos, tramos)) return e
      return cambiar(
        e,
        conBloques(p, a.donde, (bs) =>
          bs.map((b) => (b.id === a.bloque && esBloqueDeTexto(b) ? { ...b, tramos } : b)),
        ),
        a.formato
          ? { objetivo: a.bloque }
          : { grupo: `texto:${a.bloque}`, ahora: a.ahora, objetivo: a.bloque },
      )
    }

    case 'partir': {
      const bs = bloquesDe(p, a.donde)
      const i = bs?.findIndex((b) => b.id === a.bloque) ?? -1
      const b = bs?.[i]
      if (!bs || !esBloqueDeTexto(b)) return e
      const [antes, despues] = partir(b.tramos, a.offset)
      // Intro al final de un subtitulo sigue en un parrafo: lo que viene detras
      // de un subtitulo es texto, no otro subtitulo.
      const tipo = b.tipo === 'subtitulo' && despues.length === 0 ? 'parrafo' : b.tipo
      const nuevo: Bloque = { id: a.nuevoId, tipo, tramos: despues }
      const lista = [...bs]
      lista.splice(i, 1, { ...b, tramos: antes }, nuevo)
      return {
        ...cambiar(e, conBloques(p, a.donde, () => lista), { objetivo: a.bloque }),
        bloqueActivo: a.nuevoId,
        ...pedirFoco(e, a.nuevoId, 'inicio'),
      }
    }

    case 'unirConAnterior': {
      const bs = bloquesDe(p, a.donde)
      const i = bs?.findIndex((b) => b.id === a.bloque) ?? -1
      const b = bs?.[i]
      if (!bs || !b || i === -1) return e
      if (i === 0) {
        // Al principio del capitulo: se sube al titulo, sin borrar nada.
        return { ...e, ...pedirFoco(e, objetivoTitulo(a.donde.id), 'fin') }
      }
      const previo = bs[i - 1] as Bloque
      const vacio = !esBloqueDeTexto(b) || longitud(b.tramos) === 0
      if (esBloqueDeTexto(previo) && esBloqueDeTexto(b)) {
        const lista = [...bs]
        lista.splice(i - 1, 2, { ...previo, tramos: unir(previo.tramos, b.tramos) })
        return {
          ...cambiar(e, conBloques(p, a.donde, () => lista), { objetivo: previo.id }),
          bloqueActivo: previo.id,
          ...pedirFoco(e, previo.id, longitud(previo.tramos)),
        }
      }
      if (previo.tipo === 'escena') {
        // Borrar justo detras de un cambio de escena lo quita: es la tecla
        // que el autor espera, y se puede deshacer.
        const lista = bs.filter((x) => x.id !== previo.id)
        return {
          ...cambiar(e, conBloques(p, a.donde, () => lista), { objetivo: b.id }),
          ...pedirFoco(e, b.id, 'inicio'),
        }
      }
      // Detras de una ilustracion o de unos versos: un parrafo vacio se va, y
      // uno con texto deja el cursor en el bloque de antes. Una ilustracion
      // NUNCA se borra con la tecla de borrar: perderla por un descuido es caro.
      if (vacio && esBloqueDeTexto(b)) {
        const lista = bs.filter((x) => x.id !== b.id)
        return {
          ...cambiar(e, conBloques(p, a.donde, () => lista)),
          bloqueActivo: previo.id,
          ...pedirFoco(e, previo.id, 'fin'),
        }
      }
      return { ...e, bloqueActivo: previo.id, ...pedirFoco(e, previo.id, 'fin') }
    }

    case 'unirConSiguiente': {
      const bs = bloquesDe(p, a.donde)
      const i = bs?.findIndex((b) => b.id === a.bloque) ?? -1
      const b = bs?.[i]
      const siguiente = bs?.[i + 1]
      if (!bs || !esBloqueDeTexto(b) || !siguiente) return e
      if (esBloqueDeTexto(siguiente)) {
        const lista = [...bs]
        lista.splice(i, 2, { ...b, tramos: unir(b.tramos, siguiente.tramos) })
        return {
          ...cambiar(e, conBloques(p, a.donde, () => lista), { objetivo: b.id }),
          ...pedirFoco(e, b.id, longitud(b.tramos)),
        }
      }
      if (siguiente.tipo === 'escena') {
        return {
          ...cambiar(e, conBloques(p, a.donde, (l) => l.filter((x) => x.id !== siguiente.id)), { objetivo: b.id }),
          ...pedirFoco(e, b.id, longitud(b.tramos)),
        }
      }
      return e
    }

    case 'insertar': {
      const bs = bloquesDe(p, a.donde)
      if (!bs) return e
      const lista = [...bs]
      lista.splice(Math.max(0, Math.min(a.indice, lista.length)), 0, a.bloque)
      const objetivo = a.bloque.tipo === 'versos' ? objetivoVerso(a.bloque.id, { estrofa: 0, verso: 0 }) : a.bloque.id
      return {
        ...cambiar(e, conBloques(p, a.donde, () => lista)),
        bloqueActivo: a.bloque.id,
        ...pedirFoco(e, objetivo, 'inicio'),
      }
    }

    case 'pegar': {
      const bs = bloquesDe(p, a.donde)
      const i = bs?.findIndex((b) => b.id === a.bloque) ?? -1
      const b = bs?.[i]
      if (!bs || !esBloqueDeTexto(b) || a.bloques.length === 0) return e
      const pegado = [...a.bloques]
      const primero = pegado[0] as Bloque
      // Un solo parrafo: se pega dentro, sin partir nada.
      if (pegado.length === 1 && primero.tipo === 'parrafo') {
        const tramos = sustituir(b.tramos, a.inicio, a.fin, primero.tramos)
        const lista = bs.map((x) => (x.id === b.id ? { ...b, tramos } : x))
        return {
          ...cambiar(e, conBloques(p, a.donde, () => lista), { objetivo: b.id }),
          ...pedirFoco(e, b.id, Math.min(a.inicio, a.fin) + longitud(canonicos(primero.tramos))),
        }
      }
      // Varios: lo de antes del cursor se queda con el primer parrafo pegado,
      // y lo de despues se va con el ultimo.
      const total = longitud(b.tramos)
      let antes = recortar(b.tramos, 0, a.inicio)
      const despues = recortar(b.tramos, a.fin, total)
      if (primero.tipo === 'parrafo') {
        antes = unir(antes, canonicos(primero.tramos))
        pegado.shift()
      }
      const ultimo = pegado[pegado.length - 1]
      let cola: Bloque = { id: a.nuevoId, tipo: 'parrafo', tramos: despues }
      let offset = 0
      if (ultimo && ultimo.tipo === 'parrafo') {
        pegado.pop()
        const t = canonicos(ultimo.tramos)
        cola = { id: a.nuevoId, tipo: 'parrafo', tramos: unir(t, despues) }
        offset = longitud(t)
      }
      const lista = [...bs]
      lista.splice(i, 1, { ...b, tramos: antes }, ...pegado, cola)
      return {
        ...cambiar(e, conBloques(p, a.donde, () => lista), { objetivo: b.id }),
        bloqueActivo: cola.id,
        ...pedirFoco(e, cola.id, offset),
      }
    }

    case 'borrarBloque': {
      const bs = bloquesDe(p, a.donde)
      const i = bs?.findIndex((b) => b.id === a.bloque) ?? -1
      if (!bs || i === -1) return e
      let lista = bs.filter((b) => b.id !== a.bloque)
      // Nunca se queda sin donde escribir: un capitulo sin bloques no tiene
      // cursor posible.
      if (lista.length === 0) {
        if (esBloqueDeTexto(bs[0]) && longitud(bs[0].tramos) === 0) return e
        lista = [parrafoVacio(a.bloque)]
        return {
          ...cambiar(e, conBloques(p, a.donde, () => lista)),
          ...pedirFoco(e, a.bloque, 'inicio'),
        }
      }
      const vecino = lista[Math.max(0, i - 1)] as Bloque
      const objetivo = vecino.tipo === 'versos' ? objetivoVerso(vecino.id, ultimoVerso(vecino)) : vecino.id
      return {
        ...cambiar(e, conBloques(p, a.donde, () => lista)),
        bloqueActivo: vecino.id,
        ...pedirFoco(e, objetivo, i === 0 ? 'inicio' : 'fin'),
      }
    }

    case 'moverBloque': {
      const bs = bloquesDe(p, a.donde)
      const i = bs?.findIndex((b) => b.id === a.bloque) ?? -1
      const j = i + a.delta
      if (!bs || i === -1 || j < 0 || j >= bs.length) return e
      const lista = [...bs]
      ;[lista[i], lista[j]] = [lista[j] as Bloque, lista[i] as Bloque]
      return cambiar(e, conBloques(p, a.donde, () => lista))
    }

    case 'convertir': {
      const bs = bloquesDe(p, a.donde)
      const i = bs?.findIndex((b) => b.id === a.bloque) ?? -1
      const b = bs?.[i]
      if (!bs || !b) return e
      let nuevos: Bloque[]
      if (esBloqueDeTexto(b)) {
        if (a.a === 'versos') {
          nuevos = [{ id: b.id, tipo: 'versos', estrofas: [[comoVerso(b.tramos)]] }]
        } else if (a.a !== b.tipo) {
          nuevos = [{ id: b.id, tipo: a.a, tramos: b.tramos }]
        } else {
          return e
        }
      } else if (b.tipo === 'versos' && a.a !== 'versos') {
        // Cada verso pasa a ser un parrafo: no se pierde ni una linea.
        const versos = b.estrofas.flat().filter((v) => v.texto.trim() !== '')
        const tipo = a.a
        nuevos = (versos.length > 0 ? versos : [{ texto: '', marcas: [] }]).map((v, k) => ({
          id: k === 0 ? b.id : (a.ids[k - 1] ?? `${b.id}-${k}`),
          tipo,
          tramos: canonicos([v]),
        }))
      } else {
        return e
      }
      const lista = [...bs]
      lista.splice(i, 1, ...nuevos)
      const objetivo =
        a.a === 'versos' ? objetivoVerso(b.id, { estrofa: 0, verso: 0 }) : b.id
      return {
        ...cambiar(e, conBloques(p, a.donde, () => lista)),
        ...pedirFoco(e, objetivo, 'fin'),
      }
    }

    case 'versos': {
      const estrofas = a.estrofas.map((x) => x.map(versoCanonico))
      const siguiente = cambiar(
        e,
        conBloques(p, a.donde, (bs) =>
          bs.map((b) => (b.id === a.bloque && b.tipo === 'versos' ? { ...b, estrofas } : b)),
        ),
        // Las teclas que cambian la forma (Intro, borrar) no se juntan con lo
        // que se escribe: cada una se deshace por separado.
        a.foco ? { objetivo: a.bloque } : { grupo: `versos:${a.bloque}`, ahora: a.ahora, objetivo: a.bloque },
      )
      return a.foco
        ? { ...siguiente, ...pedirFoco(e, objetivoVerso(a.bloque, a.foco), a.foco.offset) }
        : siguiente
    }

    case 'salirDeVersos': {
      const bs = bloquesDe(p, a.donde)
      const i = bs?.findIndex((b) => b.id === a.bloque) ?? -1
      const b = bs?.[i]
      if (!bs || !b || b.tipo !== 'versos') return e
      const lista = [...bs]
      lista.splice(i, 1, { ...b, estrofas: a.estrofas.map((x) => x.map(versoCanonico)) }, parrafoVacio(a.nuevoId))
      return {
        ...cambiar(e, conBloques(p, a.donde, () => lista)),
        bloqueActivo: a.nuevoId,
        ...pedirFoco(e, a.nuevoId, 'inicio'),
      }
    }

    case 'ilustracion': {
      const c = a.cambios
      const cambios = {
        ...(c.alt !== undefined ? { alt: limpiarTexto(c.alt) } : {}),
        ...(c.decorativa !== undefined ? { decorativa: c.decorativa } : {}),
        ...(c.imagenId !== undefined ? { imagenId: c.imagenId } : {}),
      }
      return cambiar(
        e,
        conBloques(p, a.donde, (bs) =>
          bs.map((b) => (b.id === a.bloque && b.tipo === 'ilustracion' ? { ...b, ...cambios } : b)),
        ),
        c.alt !== undefined && c.imagenId === undefined ? { grupo: `alt:${a.bloque}`, ahora: a.ahora } : {},
      )
    }

    case 'aApertura': {
      const cap = p.capitulos.find((c) => c.id === a.capitulo)
      const b = cap?.bloques.find((x) => x.id === a.bloque)
      if (!cap || !b || b.tipo !== 'ilustracion') return e
      return cambiar(
        e,
        conCapitulo(p, a.capitulo, (c) => ({
          ...c,
          aperturas: [...c.aperturas, { imagenId: b.imagenId, alt: b.alt }],
          bloques: c.bloques.length > 1 ? c.bloques.filter((x) => x.id !== b.id) : [parrafoVacio(b.id)],
        })),
      )
    }
    case 'deApertura': {
      const cap = p.capitulos.find((c) => c.id === a.capitulo)
      const ap = cap?.aperturas[a.indice]
      if (!cap || !ap) return e
      const bloque: Bloque = { id: a.nuevoId, tipo: 'ilustracion', imagenId: ap.imagenId, alt: ap.alt, decorativa: false }
      return cambiar(
        e,
        conCapitulo(p, a.capitulo, (c) => ({
          ...c,
          aperturas: c.aperturas.filter((_, k) => k !== a.indice),
          bloques: [bloque, ...c.bloques],
        })),
      )
    }
    case 'quitarApertura':
      return cambiar(
        e,
        conCapitulo(p, a.capitulo, (c) => ({ ...c, aperturas: c.aperturas.filter((_, k) => k !== a.indice) })),
      )
    case 'aperturaAlt': {
      const alt = limpiarTexto(a.alt)
      return cambiar(
        e,
        conCapitulo(p, a.capitulo, (c) => ({
          ...c,
          aperturas: c.aperturas.map((x, k) => (k === a.indice ? { ...x, alt } : x)),
        })),
        { grupo: `apertura:${a.capitulo}:${a.indice}`, ahora: a.ahora },
      )
    }

    // -- portada y laminas ---------------------------------------------------
    case 'portada': {
      const portada: Partial<Record<RolPortada, string>> = { ...p.portada }
      for (const [rol, id] of Object.entries(a.cambios) as [RolPortada, string | null][]) {
        if (id === null) delete portada[rol]
        else portada[rol] = id
      }
      // Sin logo no hay version blanca que valga.
      if (!portada.logo) delete portada.logoBlanco
      return cambiar(e, { ...p, portada })
    }
    case 'anadirLamina':
      return p.laminas.includes(a.imagenId) ? e : cambiar(e, { ...p, laminas: [...p.laminas, a.imagenId] })
    case 'quitarLamina':
      return cambiar(e, { ...p, laminas: p.laminas.filter((_, k) => k !== a.indice) })
    case 'moverLamina': {
      const j = a.indice + a.delta
      if (j < 0 || j >= p.laminas.length || !p.laminas[a.indice]) return e
      const laminas = [...p.laminas]
      ;[laminas[a.indice], laminas[j]] = [laminas[j] as string, laminas[a.indice] as string]
      return cambiar(e, { ...p, laminas })
    }

    // -- extras --------------------------------------------------------------
    case 'nuevoExtra': {
      // Solo puede haber UNA dedicatoria y UN epigrafe: el motor los encuentra
      // por el nombre del archivo, y el segundo pisaria al primero.
      if ((a.clase === 'dedicatoria' || a.clase === 'epigrafe') && p.extras.some((x) => x.tipo === a.clase)) {
        const existente = p.extras.find((x) => x.tipo === a.clase) as Extra
        return { ...e, seccion: 'extras', extraActivo: existente.id }
      }
      const extra: Extra = {
        id: a.id,
        donde: a.clase === 'conTitulo' ? a.donde : 'inicio',
        tipo: a.clase,
        titulo: [],
        bloques: [parrafoVacio(a.bloque)],
        nombreArchivo: '',
      }
      return {
        ...cambiar(e, conExtras(p, [...p.extras, extra])),
        seccion: 'extras',
        extraActivo: a.id,
        ...pedirFoco(e, a.clase === 'conTitulo' ? objetivoTitulo(a.id) : a.bloque, 'inicio'),
      }
    }
    case 'borrarExtra': {
      const i = p.extras.findIndex((x) => x.id === a.id)
      if (i === -1) return e
      const extras = p.extras.filter((x) => x.id !== a.id)
      return {
        ...cambiar(e, conExtras(p, extras)),
        extraActivo: e.extraActivo === a.id ? (extras[Math.min(i, extras.length - 1)]?.id ?? null) : e.extraActivo,
      }
    }
    case 'moverExtra': {
      const i = p.extras.findIndex((x) => x.id === a.id)
      const x = p.extras[i]
      const j = i + a.delta
      const otro = p.extras[j]
      // Solo se mueve dentro de su grupo: la dedicatoria y el epigrafe van en
      // su sitio fijo, y una pagina del final no pasa al principio por moverla.
      if (!x || !otro || x.tipo !== 'conTitulo' || otro.tipo !== 'conTitulo' || otro.donde !== x.donde) return e
      const extras = [...p.extras]
      ;[extras[i], extras[j]] = [otro, x]
      return cambiar(e, conExtras(p, extras))
    }
    case 'dondeExtra':
      return cambiar(
        e,
        conExtras(p, p.extras.map((x) => (x.id === a.id && x.tipo === 'conTitulo' ? { ...x, donde: a.donde } : x))),
      )

    // -- datos ----------------------------------------------------------------
    case 'dato': {
      // libro.txt es de una linea por clave: un salto de linea en la
      // descripcion partiria el archivo.
      const valor = typeof a.valor === 'string' ? limpiarTexto(a.valor) : a.valor
      const actual = p.datos[a.campo]
      if (typeof actual !== typeof valor || actual === valor) return e
      let datos: DatosLibro = { ...p.datos, [a.campo]: valor }
      // La linea de derechos que se propone va en el idioma del libro. Si el
      // autor no la ha tocado, cambia con el idioma; si la escribio el, no.
      if (a.campo === 'idioma' && typeof valor === 'string' && p.datos.derechos === textosLibro(p.datos.idioma).derechosPorDefecto) {
        datos = { ...datos, derechos: textosLibro(valor).derechosPorDefecto }
      }
      return cambiar(e, { ...p, datos }, { grupo: `dato:${a.campo}`, ahora: a.ahora })
    }
    case 'descargado':
      return {
        ...e,
        proyecto: { ...p, descargado: { uid: a.uid, titulo: p.datos.titulo, autor: p.datos.autor, cuando: a.cuando } },
      }
    case 'copiaGuardada':
      return { ...e, proyecto: { ...p, ultimaCopia: a.cuando } }

    // -- historia ---------------------------------------------------------------
    case 'deshacer':
      return viajar(e, 'pasado')
    case 'rehacer':
      return viajar(e, 'futuro')
  }
  return e
}

/** El ultimo verso de un bloque de versos, para dejar ahi el cursor. */
function ultimoVerso(b: Extract<Bloque, { tipo: 'versos' }>): { estrofa: number; verso: number } {
  const estrofa = Math.max(0, b.estrofas.length - 1)
  return { estrofa, verso: Math.max(0, (b.estrofas[estrofa]?.length ?? 1) - 1) }
}

// ---------------------------------------------------------------------------
// Selectores
// ---------------------------------------------------------------------------

export function capituloActual(e: Estado): Capitulo | null {
  return e.proyecto?.capitulos.find((c) => c.id === e.capituloActivo) ?? null
}

export function extraActual(e: Estado): Extra | null {
  return e.proyecto?.extras.find((x) => x.id === e.extraActivo) ?? null
}

export const puedeDeshacer = (e: Estado): boolean => e.pasado.length > 0
export const puedeRehacer = (e: Estado): boolean => e.futuro.length > 0
