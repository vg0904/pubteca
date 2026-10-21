import { describe, expect, it } from 'vitest'
import { exportar } from '../src/app/exportar'
import {
  ESTADO_INICIAL,
  VENTANA_DESHACER,
  buscarBloque,
  etiquetaSiguiente,
  nombresDeExtras,
  numeracionDesordenada,
  objetivoTitulo,
  objetivoVerso,
  reducir,
  renumerar,
  type Accion,
  type Donde,
  type Estado,
} from '../src/app/estado'
import type { Bloque, Capitulo, Extra, Marca, Proyecto, Tramo } from '../src/app/modelo'
import { construir } from '../src/core/construir'

/**
 * EL REDUCTOR. La interfaz no tiene oraculo: no hay un Python que diga que
 * tiene que pasar al pulsar Intro en mitad de un parrafo. Estos tests son ese
 * oraculo, escrito a proposito, y corren en node sin navegador.
 */

const t = (texto: string, ...marcas: Marca[]): Tramo => ({ texto, marcas })
const par = (id: string, ...tramos: Tramo[]): Bloque => ({ id, tipo: 'parrafo', tramos })

function con(...acciones: Accion[]): Estado {
  return acciones.reduce(reducir, ESTADO_INICIAL)
}

/** Un libro nuevo con un capitulo `c1` y su parrafo `b1`. */
function libroNuevo(): Estado {
  return con({ tipo: 'nuevoProyecto', id: 'p1', capitulo: 'c1', bloque: 'b1' })
}

const C1: Donde = { tipo: 'capitulo', id: 'c1' }

function bloques(e: Estado, cap = 'c1'): readonly Bloque[] {
  return e.proyecto?.capitulos.find((c) => c.id === cap)?.bloques ?? []
}

function escribir(e: Estado, bloque: string, tramos: Tramo[], ahora = 0): Estado {
  return reducir(e, { tipo: 'texto', donde: C1, bloque, tramos, ahora })
}

/** Un capitulo `c1` con los bloques dados. */
function libroCon(...bs: Bloque[]): Estado {
  const e = libroNuevo()
  const p = e.proyecto as Proyecto
  const cap = p.capitulos[0] as Capitulo
  return reducir(e, {
    tipo: 'abrir',
    proyecto: { ...p, capitulos: [{ ...cap, titulo: [t('Uno')], bloques: bs }] },
    imagenes: [],
  })
}

describe('libro nuevo: se entra escribiendo, no rellenando un formulario', () => {
  it('abre un capitulo vacio con el cursor en el titulo', () => {
    const e = libroNuevo()
    expect(e.pantalla).toBe('libro')
    expect(e.capituloActivo).toBe('c1')
    expect(e.foco).toMatchObject({ objetivo: objetivoTitulo('c1'), posicion: 'inicio' })
  })

  it('no pide los datos del libro: el titulo esta vacio y no bloquea entrar', () => {
    const e = libroNuevo()
    expect(e.proyecto?.datos.titulo).toBe('')
    expect(bloques(e)).toEqual([par('b1')])
  })
})

describe('Intro parte el parrafo', () => {
  it('lo de antes del cursor se queda, lo de despues va a un parrafo nuevo con el cursor', () => {
    let e = libroCon(par('b1', t('Hola '), t('mundo', 'cursiva')))
    e = reducir(e, { tipo: 'partir', donde: C1, bloque: 'b1', offset: 7, nuevoId: 'b2' })
    expect(bloques(e)).toEqual([par('b1', t('Hola '), t('mu', 'cursiva')), par('b2', t('ndo', 'cursiva'))])
    expect(e.foco).toMatchObject({ objetivo: 'b2', posicion: 'inicio' })
  })

  it('Intro al final de un subtitulo sigue en un parrafo, no en otro subtitulo', () => {
    let e = libroCon({ id: 's', tipo: 'subtitulo', tramos: [t('Parte')] })
    e = reducir(e, { tipo: 'partir', donde: C1, bloque: 's', offset: 5, nuevoId: 'n' })
    expect(bloques(e)[1]).toMatchObject({ id: 'n', tipo: 'parrafo' })
  })

  it('cada foco pedido es nuevo aunque apunte al mismo sitio', () => {
    let e = libroCon(par('b1', t('ab')))
    e = reducir(e, { tipo: 'partir', donde: C1, bloque: 'b1', offset: 1, nuevoId: 'b2' })
    const s1 = e.foco?.seq
    e = reducir(e, { tipo: 'unirConAnterior', donde: C1, bloque: 'b2' })
    e = reducir(e, { tipo: 'partir', donde: C1, bloque: 'b1', offset: 1, nuevoId: 'b2' })
    expect(e.foco?.seq).toBeGreaterThan(s1 as number)
  })
})

describe('Borrar al principio de un parrafo', () => {
  it('lo une con el anterior y deja el cursor en la costura', () => {
    let e = libroCon(par('a', t('Uno ')), par('b', t('dos', 'negrita')))
    e = reducir(e, { tipo: 'unirConAnterior', donde: C1, bloque: 'b' })
    expect(bloques(e)).toEqual([par('a', t('Uno '), t('dos', 'negrita'))])
    expect(e.foco).toMatchObject({ objetivo: 'a', posicion: 4 })
  })

  it('en el primer parrafo sube al titulo y no borra nada', () => {
    let e = libroCon(par('a', t('Uno')))
    const antes = e.proyecto
    e = reducir(e, { tipo: 'unirConAnterior', donde: C1, bloque: 'a' })
    expect(e.proyecto).toBe(antes)
    expect(e.foco).toMatchObject({ objetivo: objetivoTitulo('c1'), posicion: 'fin' })
  })

  it('detras de un cambio de escena, lo quita', () => {
    let e = libroCon(par('a', t('Uno')), { id: 'x', tipo: 'escena' }, par('b', t('Dos')))
    e = reducir(e, { tipo: 'unirConAnterior', donde: C1, bloque: 'b' })
    expect(bloques(e).map((b) => b.id)).toEqual(['a', 'b'])
  })

  it('detras de una ilustracion NO la borra: solo lleva el cursor a ella', () => {
    // Perder un dibujo por pulsar una tecla de mas es caro.
    let e = libroCon(par('a', t('Uno')), { id: 'i', tipo: 'ilustracion', imagenId: 'img', alt: '', decorativa: false }, par('b', t('Dos')))
    e = reducir(e, { tipo: 'unirConAnterior', donde: C1, bloque: 'b' })
    expect(bloques(e).map((b) => b.id)).toEqual(['a', 'i', 'b'])
    expect(e.foco).toMatchObject({ objetivo: 'i' })
  })

  it('un parrafo vacio detras de una ilustracion si se va', () => {
    let e = libroCon({ id: 'i', tipo: 'ilustracion', imagenId: 'img', alt: '', decorativa: false }, par('b'))
    e = reducir(e, { tipo: 'unirConAnterior', donde: C1, bloque: 'b' })
    expect(bloques(e).map((b) => b.id)).toEqual(['i'])
  })

  it('Suprimir al final une el siguiente', () => {
    let e = libroCon(par('a', t('Uno')), par('b', t('dos')))
    e = reducir(e, { tipo: 'unirConSiguiente', donde: C1, bloque: 'a' })
    expect(bloques(e)).toEqual([par('a', t('Unodos'))])
    expect(e.foco).toMatchObject({ objetivo: 'a', posicion: 3 })
  })
})

describe('pegar', () => {
  it('un parrafo pegado en mitad de otro se mete dentro, sin partir', () => {
    let e = libroCon(par('a', t('Hola mundo')))
    e = reducir(e, { tipo: 'pegar', donde: C1, bloque: 'a', inicio: 5, fin: 5, bloques: [par('x', t('gran ', 'cursiva'))], nuevoId: 'n' })
    expect(bloques(e)).toEqual([par('a', t('Hola '), t('gran ', 'cursiva'), t('mundo'))])
    expect(e.foco).toMatchObject({ objetivo: 'a', posicion: 10 })
  })

  it('varios parrafos: el primero se une a lo de antes y el ultimo a lo de despues', () => {
    let e = libroCon(par('a', t('AB')))
    e = reducir(e, {
      tipo: 'pegar',
      donde: C1,
      bloque: 'a',
      inicio: 1,
      fin: 1,
      bloques: [par('x', t('uno')), par('y', t('dos')), par('z', t('tres'))],
      nuevoId: 'n',
    })
    expect(bloques(e).map((b) => (b.tipo === 'parrafo' ? b.tramos.map((x) => x.texto).join('') : b.tipo))).toEqual([
      'Auno',
      'dos',
      'tresB',
    ])
    expect(e.foco).toMatchObject({ objetivo: 'n', posicion: 4 })
  })

  it('un cambio de escena pegado se queda como cambio de escena', () => {
    let e = libroCon(par('a', t('AB')))
    e = reducir(e, {
      tipo: 'pegar',
      donde: C1,
      bloque: 'a',
      inicio: 2,
      fin: 2,
      bloques: [par('x', t('fin.')), { id: 'esc', tipo: 'escena' }, par('z', t('Luego'))],
      nuevoId: 'n',
    })
    expect(bloques(e).map((b) => b.tipo)).toEqual(['parrafo', 'escena', 'parrafo'])
  })

  it('pegar sustituye lo seleccionado', () => {
    let e = libroCon(par('a', t('Hola mundo')))
    e = reducir(e, { tipo: 'pegar', donde: C1, bloque: 'a', inicio: 5, fin: 10, bloques: [par('x', t('Ana'))], nuevoId: 'n' })
    expect(bloques(e)).toEqual([par('a', t('Hola Ana'))])
  })
})

describe('deshacer', () => {
  it('lo escrito seguido en el mismo parrafo se deshace de una vez', () => {
    let e = libroCon(par('a'))
    e = escribir(e, 'a', [t('H')], 1000)
    e = escribir(e, 'a', [t('Ho')], 1100)
    e = escribir(e, 'a', [t('Hol')], 1200)
    e = reducir(e, { tipo: 'deshacer' })
    expect(bloques(e)).toEqual([par('a')])
  })

  it('pasada la ventana, es otro paso', () => {
    let e = libroCon(par('a'))
    e = escribir(e, 'a', [t('H')], 1000)
    e = escribir(e, 'a', [t('Hola')], 1000 + VENTANA_DESHACER + 1)
    e = reducir(e, { tipo: 'deshacer' })
    expect(bloques(e)).toEqual([par('a', t('H'))])
  })

  it('escribir en otro parrafo es otro paso, aunque sea enseguida', () => {
    let e = libroCon(par('a'), par('b'))
    e = escribir(e, 'a', [t('x')], 1000)
    e = escribir(e, 'b', [t('y')], 1001)
    e = reducir(e, { tipo: 'deshacer' })
    expect(bloques(e)).toEqual([par('a', t('x')), par('b')])
  })

  it('despues de deshacer, escribir no se junta con un paso viejo', () => {
    // Sin romper el grupo al deshacer, el paso intermedio se perdia: deshacer
    // dos veces saltaba directamente al principio.
    let e = libroCon(par('a'))
    e = escribir(e, 'a', [t('x')], 1000)
    e = escribir(e, 'a', [t('xy')], 1000 + VENTANA_DESHACER + 1)
    e = reducir(e, { tipo: 'deshacer' })
    e = escribir(e, 'a', [t('xz')], 1000 + VENTANA_DESHACER + 2)
    e = reducir(e, { tipo: 'deshacer' })
    expect(bloques(e)).toEqual([par('a', t('x'))])
  })

  it('deshacer devuelve el cursor a donde estaba el cambio', () => {
    let e = libroCon(par('a', t('Hola mundo')))
    e = reducir(e, { tipo: 'partir', donde: C1, bloque: 'a', offset: 4, nuevoId: 'b' })
    e = reducir(e, { tipo: 'deshacer' })
    expect(bloques(e)).toEqual([par('a', t('Hola mundo'))])
    expect(e.foco).toMatchObject({ objetivo: 'a', posicion: 4 })
  })

  it('rehacer vuelve a aplicar, y un cambio nuevo borra lo que se podia rehacer', () => {
    let e = libroCon(par('a'))
    e = escribir(e, 'a', [t('x')], 0)
    e = reducir(e, { tipo: 'deshacer' })
    e = reducir(e, { tipo: 'rehacer' })
    expect(bloques(e)).toEqual([par('a', t('x'))])
    e = reducir(e, { tipo: 'deshacer' })
    e = escribir(e, 'a', [t('z')], 99999)
    expect(e.futuro).toEqual([])
  })

  it('deshacer NO olvida que el libro ya se descargo ni la ultima copia', () => {
    let e = libroCon(par('a'))
    e = escribir(e, 'a', [t('x')], 0)
    e = reducir(e, { tipo: 'descargado', uid: 'urn:uuid:1', cuando: 5 })
    e = reducir(e, { tipo: 'copiaGuardada', cuando: 7 })
    e = reducir(e, { tipo: 'deshacer' })
    expect(e.proyecto?.descargado?.uid).toBe('urn:uuid:1')
    expect(e.proyecto?.ultimaCopia).toBe(7)
  })

  it('escribir lo mismo que ya habia no crea un paso', () => {
    let e = libroCon(par('a', t('x')))
    e = escribir(e, 'a', [t('x')], 0)
    expect(e.pasado).toEqual([])
  })

  it('el texto que entra se limpia de saltos de linea', () => {
    let e = libroCon(par('a'))
    e = escribir(e, 'a', [t('uno\ndos')], 0)
    expect(bloques(e)).toEqual([par('a', t('uno dos'))])
  })
})

describe('bloques', () => {
  it('convertir unos versos en parrafos no pierde ni un verso', () => {
    let e = libroCon({ id: 'v', tipo: 'versos', estrofas: [[t('uno'), t('dos')], [t('tres', 'cursiva')]] })
    e = reducir(e, { tipo: 'convertir', donde: C1, bloque: 'v', a: 'parrafo', ids: ['v2', 'v3'] })
    expect(bloques(e)).toEqual([par('v', t('uno')), par('v2', t('dos')), par('v3', t('tres', 'cursiva'))])
  })

  it('un parrafo con cursiva parcial pasa a verso sin esa cursiva: el modelo no la puede guardar', () => {
    let e = libroCon(par('a', t('uno '), t('dos', 'cursiva')))
    e = reducir(e, { tipo: 'convertir', donde: C1, bloque: 'a', a: 'versos', ids: [] })
    expect(bloques(e)).toEqual([{ id: 'a', tipo: 'versos', estrofas: [[t('uno dos')]] }])
    expect(e.foco?.objetivo).toBe(objetivoVerso('a', { estrofa: 0, verso: 0 }))
  })

  it('borrar el unico bloque deja un parrafo vacio donde escribir', () => {
    let e = libroCon({ id: 'x', tipo: 'escena' })
    e = reducir(e, { tipo: 'borrarBloque', donde: C1, bloque: 'x' })
    expect(bloques(e)).toEqual([par('x')])
  })

  it('mover un bloque lo intercambia con el vecino, y en el borde no hace nada', () => {
    let e = libroCon(par('a'), par('b'))
    e = reducir(e, { tipo: 'moverBloque', donde: C1, bloque: 'a', delta: 1 })
    expect(bloques(e).map((b) => b.id)).toEqual(['b', 'a'])
    const antes = e.proyecto
    e = reducir(e, { tipo: 'moverBloque', donde: C1, bloque: 'a', delta: 1 })
    expect(e.proyecto).toBe(antes)
  })

  it('una ilustracion pasa a abrir el capitulo, y vuelve', () => {
    let e = libroCon(par('a'), { id: 'i', tipo: 'ilustracion', imagenId: 'img', alt: 'un faro', decorativa: false })
    e = reducir(e, { tipo: 'aApertura', capitulo: 'c1', bloque: 'i' })
    const cap = e.proyecto?.capitulos[0] as Capitulo
    expect(cap.aperturas).toEqual([{ imagenId: 'img', alt: 'un faro' }])
    expect(cap.bloques.map((b) => b.id)).toEqual(['a'])
    e = reducir(e, { tipo: 'deApertura', capitulo: 'c1', indice: 0, nuevoId: 'i2' })
    expect(bloques(e)[0]).toMatchObject({ id: 'i2', tipo: 'ilustracion', imagenId: 'img' })
  })

  it('buscarBloque encuentra un bloque en cualquier capitulo o extra', () => {
    const e = libroCon(par('a'))
    expect(buscarBloque(e.proyecto as Proyecto, 'a')?.donde).toEqual(C1)
    expect(buscarBloque(e.proyecto as Proyecto, 'nada')).toBeNull()
  })
})

describe('capitulos: reordenar y numerar', () => {
  const cap = (id: string, etiqueta: string): Capitulo => ({ id, etiqueta, titulo: [t(id)], aperturas: [], bloques: [] })

  it('renumerar solo toca los «Capitulo N» y respeta el prologo', () => {
    const r = renumerar([cap('p', 'Prólogo'), cap('b', 'Capítulo 2'), cap('a', 'Capítulo 1'), cap('e', 'Epílogo')])
    expect(r.map((c) => c.etiqueta)).toEqual(['Prólogo', 'Capítulo 1', 'Capítulo 2', 'Epílogo'])
  })

  it('renumerar conserva la palabra y las mayusculas del autor', () => {
    expect(renumerar([cap('a', 'CAPÍTULO 7')]).map((c) => c.etiqueta)).toEqual(['CAPÍTULO 1'])
  })

  it('numeracionDesordenada lo detecta al mover', () => {
    expect(numeracionDesordenada([cap('a', 'Capítulo 1'), cap('b', 'Capítulo 2')])).toBe(false)
    expect(numeracionDesordenada([cap('b', 'Capítulo 2'), cap('a', 'Capítulo 1')])).toBe(true)
    expect(numeracionDesordenada([cap('a', 'Capítulo uno'), cap('b', 'Prólogo')])).toBe(false)
  })

  it('un capitulo nuevo lleva el siguiente numero', () => {
    expect(etiquetaSiguiente([])).toBe('Capítulo 1')
    expect(etiquetaSiguiente([cap('a', 'Capítulo 1'), cap('b', 'Capítulo 2'), cap('e', 'Epílogo')])).toBe('Capítulo 3')
    expect(etiquetaSiguiente([cap('a', '')])).toBe('')
  })

  it('moverCapitulo lo lleva a la posicion pedida', () => {
    let e = libroNuevo()
    e = reducir(e, { tipo: 'nuevoCapitulo', id: 'c2', bloque: 'x2' })
    e = reducir(e, { tipo: 'nuevoCapitulo', id: 'c3', bloque: 'x3' })
    e = reducir(e, { tipo: 'moverCapitulo', id: 'c3', a: 0 })
    expect(e.proyecto?.capitulos.map((c) => c.id)).toEqual(['c3', 'c1', 'c2'])
    expect(e.proyecto?.capitulos.map((c) => c.etiqueta)).toEqual(['Capítulo 3', 'Capítulo 1', 'Capítulo 2'])
    e = reducir(e, { tipo: 'renumerar' })
    expect(e.proyecto?.capitulos.map((c) => c.etiqueta)).toEqual(['Capítulo 1', 'Capítulo 2', 'Capítulo 3'])
  })

  it('borrar el capitulo abierto abre el vecino', () => {
    let e = libroNuevo()
    e = reducir(e, { tipo: 'nuevoCapitulo', id: 'c2', bloque: 'x2' })
    e = reducir(e, { tipo: 'borrarCapitulo', id: 'c2' })
    expect(e.capituloActivo).toBe('c1')
  })
})

describe('extras: el nombre de archivo decide a donde van y en que orden', () => {
  const extra = (id: string, tipo: Extra['tipo'], titulo: string, donde: Extra['donde'] = 'final'): Extra => ({
    id,
    donde,
    tipo,
    titulo: [t(titulo)],
    bloques: [par(`${id}-b`, t('texto'))],
    nombreArchivo: '',
  })

  it('el orden de la app sobrevive al orden alfabetico del motor', () => {
    const nombres = nombresDeExtras([extra('s', 'conTitulo', 'Sobre el autor'), extra('a', 'conTitulo', 'Agradecimientos')])
    expect(nombres.map((x) => x.nombreArchivo)).toEqual(['01-sobre-el-autor', '02-agradecimientos'])
  })

  it('una pagina titulada «Epígrafes y citas» no se convierte en el epigrafe', () => {
    const [x] = nombresDeExtras([extra('e', 'conTitulo', 'Epígrafes y citas')])
    expect(x?.nombreArchivo).not.toMatch(/epigrafe|dedicatoria/)
  })

  it('de punta a punta: el motor coloca las paginas donde y como dice la app', () => {
    let e = libroCon(par('a', t('Texto del capitulo.')))
    e = reducir(e, { tipo: 'nuevoExtra', id: 'x1', clase: 'conTitulo', donde: 'final', bloque: 'x1b' })
    e = reducir(e, { tipo: 'titulo', donde: { tipo: 'extra', id: 'x1' }, tramos: [t('Sobre el autor')], ahora: 0 })
    e = reducir(e, { tipo: 'nuevoExtra', id: 'x2', clase: 'conTitulo', donde: 'final', bloque: 'x2b' })
    e = reducir(e, { tipo: 'titulo', donde: { tipo: 'extra', id: 'x2' }, tramos: [t('Agradecimientos')], ahora: 0 })
    e = reducir(e, { tipo: 'nuevoExtra', id: 'x3', clase: 'conTitulo', donde: 'inicio', bloque: 'x3b' })
    e = reducir(e, { tipo: 'titulo', donde: { tipo: 'extra', id: 'x3' }, tramos: [t('Dedicatoria de la edición')], ahora: 0 })
    e = reducir(e, { tipo: 'nuevoExtra', id: 'x4', clase: 'dedicatoria', donde: 'inicio', bloque: 'x4b' })
    for (const [id, bloque] of [['x1', 'x1b'], ['x2', 'x2b'], ['x3', 'x3b'], ['x4', 'x4b']] as const) {
      e = reducir(e, { tipo: 'texto', donde: { tipo: 'extra', id }, bloque, tramos: [t(`texto de ${id}`)], ahora: 0 })
    }
    const p = e.proyecto as Proyecto
    const exp = exportar({ ...p, datos: { ...p.datos, titulo: 'Prueba' } }, new Map(), new Map())
    const c = construir(exp.proyecto, { ahora: new Date('2026-01-01T00:00:00Z') })
    const paginas = c.libro.paginas.map((x) => `${x.seccion}:${x.contenido.match(/<title>([^<]*)<\/title>/)?.[1]}`)
    // La dedicatoria va primero, luego la pagina del inicio (cuyo titulo dice
    // «Dedicatoria» y NO por eso es la dedicatoria), y al final las dos en el
    // orden de la app, no en el del alfabeto.
    expect(paginas.filter((x) => !x.includes('Prueba') && !x.includes('Derechos'))).toEqual([
      'inicio:Dedicatoria',
      'inicio:Dedicatoria de la edición',
      'capitulos:Uno',
      'final:Sobre el autor',
      'final:Agradecimientos',
    ])
  })

  it('solo puede haber una dedicatoria: la segunda abre la que ya hay', () => {
    let e = libroNuevo()
    e = reducir(e, { tipo: 'nuevoExtra', id: 'd1', clase: 'dedicatoria', donde: 'inicio', bloque: 'b' })
    e = reducir(e, { tipo: 'nuevoExtra', id: 'd2', clase: 'dedicatoria', donde: 'inicio', bloque: 'b2' })
    expect(e.proyecto?.extras.map((x) => x.id)).toEqual(['d1'])
    expect(e.extraActivo).toBe('d1')
  })

  it('una pagina del final no pasa al principio por moverla', () => {
    let e = libroNuevo()
    e = reducir(e, { tipo: 'nuevoExtra', id: 'i', clase: 'conTitulo', donde: 'inicio', bloque: 'b' })
    e = reducir(e, { tipo: 'nuevoExtra', id: 'f', clase: 'conTitulo', donde: 'final', bloque: 'b2' })
    const antes = e.proyecto
    e = reducir(e, { tipo: 'moverExtra', id: 'f', delta: -1 })
    expect(e.proyecto).toBe(antes)
  })
})

describe('datos del libro', () => {
  it('un salto de linea en la descripcion no puede partir libro.txt', () => {
    let e = libroNuevo()
    e = reducir(e, { tipo: 'dato', campo: 'descripcion', valor: 'Una novela.\nsubtitulo: trampa', ahora: 0 })
    const exp = exportar(e.proyecto as Proyecto, new Map(), new Map())
    expect(exp.proyecto.libroTxt).toContain('descripcion: Una novela. subtitulo: trampa')
    expect(exp.proyecto.libroTxt).not.toMatch(/^subtitulo: trampa/m)
  })
})

describe('importar dentro de un libro', () => {
  const capImportado = (id: string): Capitulo => ({
    id,
    etiqueta: 'Capítulo 1',
    titulo: [t('Importado')],
    aperturas: [],
    bloques: [par(`${id}-b`, t('texto'))],
  })

  it('en un libro recien creado, lo importado REEMPLAZA el capitulo vacio', () => {
    let e = libroNuevo()
    e = reducir(e, { tipo: 'incorporar', idProyecto: 'x', capitulos: [capImportado('k1')], extras: [], imagenes: [] })
    expect(e.proyecto?.capitulos.map((c) => c.id)).toEqual(['k1'])
    expect(e.capituloActivo).toBe('k1')
  })

  it('en un libro con texto, lo importado va DETRAS y se puede deshacer', () => {
    let e = libroCon(par('a', t('ya escrito')))
    e = reducir(e, { tipo: 'incorporar', idProyecto: 'x', capitulos: [capImportado('k1')], extras: [], imagenes: [] })
    expect(e.proyecto?.capitulos.map((c) => c.id)).toEqual(['c1', 'k1'])
    e = reducir(e, { tipo: 'deshacer' })
    expect(e.proyecto?.capitulos.map((c) => c.id)).toEqual(['c1'])
  })

  it('desde la pantalla de inicio, crea el proyecto', () => {
    const e = con({ tipo: 'incorporar', idProyecto: 'nuevo', capitulos: [capImportado('k1')], extras: [], imagenes: [] })
    expect(e.proyecto?.id).toBe('nuevo')
    expect(e.pantalla).toBe('libro')
  })

  it('cancelar vuelve a donde se estaba', () => {
    const imp = { tipo: 'empezarImportacion', importacion: {} } as unknown as Accion
    expect(con(imp, { tipo: 'cancelarImportacion' }).pantalla).toBe('inicio')
    expect(reducir(reducir(libroNuevo(), imp), { tipo: 'cancelarImportacion' }).pantalla).toBe('libro')
  })
})
