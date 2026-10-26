/**
 * Ajustar una imagen: el encuadre, el tamano y la prediccion del peso.
 *
 * Todo lo que decide esta en funciones puras, asi que se prueba sin navegador.
 * Lo que toca el lienzo (`ajustarImagen`) se prueba en el navegador real; de
 * ahi solo se prueban aqui sus piezas puras: `aGrises`, `escalones` y
 * `recorteValido`.
 */
import { describe, expect, it } from 'vitest'
import { MAX_PIXELES } from '../src/core/imagen-validacion'
import {
  ASPECTOS,
  ASPECTO_RECOMENDADO,
  LADO_LARGO_MINIMO,
  LADO_LARGO_RECOMENDADO,
  ladoLargo,
  rangoDeResolucion,
  tamanoPorResolucion,
  bppJpeg,
  bppMedido,
  bppPng,
  conProporcion,
  limitarPixeles,
  centroDe,
  moverRecorte,
  necesitaAlfa,
  pesoTotalEstimado,
  quedaCorta,
  razonDe,
  recorteCentrado,
  recorteCompleto,
  recorteDesde,
  reparoDe,
  sinCambios,
  tamanoRecomendado,
  ZOOM_MAXIMO,
  ZOOM_MINIMO,
  type Ajuste,
} from '../src/app/imagen-ajuste'
import { aGrises, escalones, mediaDe, recorteValido } from '../src/app/imagen-canvas'

const ajuste = (x: Partial<Ajuste> = {}): Ajuste => ({
  recorte: { x: 0, y: 0, ancho: 1600, alto: 2400 },
  ancho: 1600,
  alto: 2400,
  formato: 'png',
  calidad: 80,
  grises: false,
  conservarAlfa: false,
  ...x,
})

describe('proporciones', () => {
  it('la recomendada es 2:3, que es la que mejor cabe en un lector', () => {
    expect(ASPECTO_RECOMENDADO).toBe('2:3')
    expect(ASPECTOS).toContain('2:3')
  })

  it('cada clave da su razon ancho/alto', () => {
    expect(razonDe('2:3', 999, 999)).toBeCloseTo(2 / 3)
    expect(razonDe('3:4', 999, 999)).toBeCloseTo(3 / 4)
    expect(razonDe('1:1', 999, 999)).toBe(1)
    expect(razonDe('3:2', 999, 999)).toBeCloseTo(3 / 2)
    expect(razonDe('4:3', 999, 999)).toBeCloseTo(4 / 3)
  })

  it('«original» es la de la imagen', () => {
    expect(razonDe('original', 800, 1200)).toBeCloseTo(2 / 3)
  })

  it('una imagen de alto cero no rompe «original»', () => {
    expect(razonDe('original', 800, 0)).toBeNull()
  })
})

describe('encuadre', () => {
  it('el recorte completo lo coge todo', () => {
    expect(recorteCompleto(300, 400)).toEqual({ x: 0, y: 0, ancho: 300, alto: 400 })
  })

  it('en una imagen cuadrada, 2:3 recorta a los lados y queda centrado', () => {
    const r = recorteCentrado(1200, 1200, '2:3')
    expect(r).toEqual({ x: 200, y: 0, ancho: 800, alto: 1200 })
    expect(r.ancho / r.alto).toBeCloseTo(2 / 3)
  })

  it('en una imagen muy alta, 2:3 recorta arriba y abajo', () => {
    const r = recorteCentrado(900, 3000, '2:3')
    expect(r.ancho).toBe(900)
    expect(r.alto).toBe(1350)
    expect(r.y).toBe((3000 - 1350) / 2)
  })

  it('en una horizontal, 3:2 recorta a los lados', () => {
    const r = recorteCentrado(4000, 2000, '3:2')
    expect(r).toEqual({ x: 500, y: 0, ancho: 3000, alto: 2000 })
  })

  it('el recorte nunca se sale de la imagen, en ninguna proporcion', () => {
    for (const [ancho, alto] of [
      [1, 1],
      [10, 3000],
      [3000, 10],
      [1600, 2400],
      [2401, 1599],
    ] as const) {
      for (const clave of ASPECTOS) {
        const r = recorteCentrado(ancho, alto, clave)
        expect(r.x, `${clave} ${ancho}x${alto}`).toBeGreaterThanOrEqual(0)
        expect(r.y).toBeGreaterThanOrEqual(0)
        expect(r.x + r.ancho).toBeLessThanOrEqual(ancho)
        expect(r.y + r.alto).toBeLessThanOrEqual(alto)
        expect(r.ancho).toBeGreaterThan(0)
        expect(r.alto).toBeGreaterThan(0)
      }
    }
  })

  it('«original» coge la imagen entera', () => {
    expect(recorteCentrado(1234, 567, 'original')).toEqual({ x: 0, y: 0, ancho: 1234, alto: 567 })
  })

  it('el zoom encoge el marco y le deja el centro donde estaba', () => {
    const centro = { x: 600, y: 900 }
    const a = recorteDesde(1200, 1800, '2:3', 1, centro)
    const b = recorteDesde(1200, 1800, '2:3', 2, centro)
    expect(a).toEqual({ x: 0, y: 0, ancho: 1200, alto: 1800 })
    expect(b.ancho).toBe(600)
    expect(b.alto).toBe(900)
    expect(centroDe(b)).toEqual(centro)
  })

  it('cambiar de proporcion conserva el centro que el autor habia encuadrado', () => {
    const r = recorteDesde(2000, 2000, '2:3', 2, { x: 500, y: 1400 })
    const otra = recorteDesde(2000, 2000, '3:4', 2, centroDe(r))
    // Hasta medio pixel: el marco se mide en pixeles enteros, asi que un marco
    // de ancho par y otro de ancho impar no pueden tener el mismo centro exacto.
    expect(Math.abs(centroDe(otra).x - centroDe(r).x)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(centroDe(otra).y - centroDe(r).y)).toBeLessThanOrEqual(0.5)
    expect(otra.ancho / otra.alto).toBeCloseTo(3 / 4, 2)
  })

  it('el marco con zoom nunca se sale, ni pegado a una esquina', () => {
    for (const clave of ASPECTOS) {
      for (const z of [1, 1.5, 2, 4, 99, 0]) {
        for (const centro of [{ x: 0, y: 0 }, { x: 2000, y: 3000 }, { x: 1000, y: 1500 }]) {
          const r = recorteDesde(2000, 3000, clave, z, centro)
          expect(r.x, `${clave} z=${z}`).toBeGreaterThanOrEqual(0)
          expect(r.y).toBeGreaterThanOrEqual(0)
          expect(r.x + r.ancho).toBeLessThanOrEqual(2000)
          expect(r.y + r.alto).toBeLessThanOrEqual(3000)
          expect(r.ancho).toBeGreaterThan(0)
          expect(r.alto).toBeGreaterThan(0)
        }
      }
    }
  })

  it('el zoom se queda dentro de sus topes', () => {
    const centro = { x: 1000, y: 1500 }
    expect(recorteDesde(2000, 3000, '2:3', 0.1, centro)).toEqual(recorteDesde(2000, 3000, '2:3', ZOOM_MINIMO, centro))
    expect(recorteDesde(2000, 3000, '2:3', 999, centro)).toEqual(recorteDesde(2000, 3000, '2:3', ZOOM_MAXIMO, centro))
  })

  it('mover el recorte lo frena en los bordes', () => {
    const r = { x: 100, y: 100, ancho: 400, alto: 600 }
    expect(moverRecorte(r, 50, 50, 1000, 1000)).toMatchObject({ x: 150, y: 150 })
    // Contra el borde de arriba a la izquierda.
    expect(moverRecorte(r, -500, -500, 1000, 1000)).toMatchObject({ x: 0, y: 0 })
    // Contra el de abajo a la derecha: x no pasa de ancho - ancho del recorte.
    expect(moverRecorte(r, 5000, 5000, 1000, 1000)).toMatchObject({ x: 600, y: 400 })
  })

  it('mover no cambia el tamano del recorte', () => {
    const r = { x: 10, y: 10, ancho: 400, alto: 600 }
    const m = moverRecorte(r, 999, -999, 1000, 1000)
    expect(m.ancho).toBe(400)
    expect(m.alto).toBe(600)
  })
})

describe('tamano final', () => {
  it('el lado largo va a 2400 px, que es el 1600x2400 recomendado', () => {
    expect(tamanoRecomendado({ x: 0, y: 0, ancho: 4000, alto: 6000 })).toEqual({ ancho: 1600, alto: 2400 })
    expect(LADO_LARGO_RECOMENDADO).toBe(2400)
  })

  it('nunca agranda: una imagen pequena se queda como esta', () => {
    expect(tamanoRecomendado({ x: 0, y: 0, ancho: 600, alto: 900 })).toEqual({ ancho: 600, alto: 900 })
  })

  /**
   * Es el caso que de verdad muerde: una cuadrada a 2400x2400 son 5,76
   * millones de pixeles y Apple Books admite 5,6. Sin el tope, el ajuste
   * «arreglaria» la imagen dejandola con el mismo aviso que tenia.
   */
  it('una cuadrada se queda por debajo del tope de Apple Books', () => {
    const t = tamanoRecomendado({ x: 0, y: 0, ancho: 4000, alto: 4000 })
    expect(t.ancho * t.alto).toBeLessThanOrEqual(MAX_PIXELES)
    expect(t.ancho).toBe(t.alto)
    expect(t.ancho).toBeLessThan(2400)
  })

  it('ninguna proporcion se pasa del tope', () => {
    for (const clave of ASPECTOS) {
      const r = recorteCentrado(6000, 6000, clave)
      const t = tamanoRecomendado(r)
      expect(t.ancho * t.alto, clave).toBeLessThanOrEqual(MAX_PIXELES)
    }
  })

  it('el recomendado conserva la proporcion del recorte', () => {
    const r = recorteCentrado(3000, 4500, '2:3')
    const t = tamanoRecomendado(r)
    expect(t.ancho / t.alto).toBeCloseTo(r.ancho / r.alto, 2)
  })

  it('limitarPixeles baja por debajo del tope, nunca justo por encima', () => {
    const t = limitarPixeles(3000, 3000, 1_000_000)
    expect(t.ancho * t.alto).toBeLessThanOrEqual(1_000_000)
    expect(t.ancho).toBe(t.alto)
  })

  it('limitarPixeles no toca lo que ya cabe', () => {
    expect(limitarPixeles(100, 100, 1_000_000)).toEqual({ ancho: 100, alto: 100 })
  })

  it('cambiar un lado arrastra el otro con la proporcion del recorte', () => {
    const r = { x: 0, y: 0, ancho: 1000, alto: 1500 }
    expect(conProporcion(r, 'ancho', 800)).toEqual({ ancho: 800, alto: 1200 })
    expect(conProporcion(r, 'alto', 1200)).toEqual({ ancho: 800, alto: 1200 })
  })

  it('un lado de cero o negativo se queda en 1 px, no en 0', () => {
    expect(conProporcion({ x: 0, y: 0, ancho: 10, alto: 10 }, 'ancho', 0).ancho).toBe(1)
    expect(conProporcion({ x: 0, y: 0, ancho: 10, alto: 10 }, 'ancho', -5).ancho).toBe(1)
  })

  it('«queda corta» avisa por debajo del minimo de una ilustracion', () => {
    expect(quedaCorta(1600, 2400)).toBe(false)
    expect(quedaCorta(1200, 1800)).toBe(false)
    expect(quedaCorta(1199, 1800)).toBe(true)
    expect(quedaCorta(1200, 1799)).toBe(true)
  })
})

describe('reparos antes de aplicar', () => {
  it('pasarse del tope de Apple Books se dice', () => {
    expect(reparoDe(ajuste({ recorte: { x: 0, y: 0, ancho: 4000, alto: 4000 }, ancho: 3000, alto: 3000 }))).toBe('tope')
  })

  it('pedir mas pixeles de los que hay se dice: agrandar emborrona', () => {
    expect(reparoDe(ajuste({ recorte: { x: 0, y: 0, ancho: 800, alto: 1200 }, ancho: 1600, alto: 2400 }))).toBe('subira')
  })

  it('un ajuste sensato no tiene reparos', () => {
    expect(reparoDe(ajuste({ recorte: { x: 0, y: 0, ancho: 3200, alto: 4800 }, ancho: 1600, alto: 2400 }))).toBeNull()
  })

  it('el tope manda sobre el agrandado: es el que impide publicar', () => {
    expect(reparoDe(ajuste({ recorte: { x: 0, y: 0, ancho: 10, alto: 10 }, ancho: 3000, alto: 3000 }))).toBe('tope')
  })

  it('«sin cambios» reconoce el ajuste que no hace nada', () => {
    const imagen = { ancho: 1600, alto: 2400, tipo: 'png' } as const
    expect(sinCambios(ajuste(), imagen)).toBe(true)
    expect(sinCambios(ajuste({ ancho: 800, alto: 1200 }), imagen)).toBe(false)
    expect(sinCambios(ajuste({ formato: 'jpeg' }), imagen)).toBe(false)
    expect(sinCambios(ajuste({ grises: true }), imagen)).toBe(false)
    expect(sinCambios(ajuste({ recorte: { x: 10, y: 0, ancho: 1590, alto: 2400 } }), imagen)).toBe(false)
  })
})

describe('el canal alfa de la imagen que sale', () => {
  /**
   * Un lienzo normal escribe siempre un PNG RGBA, y el motor avisa de
   * transparencia por el tipo de color del PNG. Sin esto, ajustar una
   * ilustracion opaca para quitarle un aviso le ponia otro encima que era
   * mentira; se vio en el navegador antes de que llegara a nadie.
   */
  it('un PNG opaco sale opaco: no se le inventa un canal alfa', () => {
    expect(necesitaAlfa('png', false)).toBe(false)
  })

  it('un PNG con canal alfa lo conserva: ahi puede estar el logo del autor', () => {
    expect(necesitaAlfa('png', true)).toBe(true)
  })

  it('un JPEG nunca lleva alfa, venga de donde venga', () => {
    expect(necesitaAlfa('jpeg', true)).toBe(false)
    expect(necesitaAlfa('jpeg', false)).toBe(false)
  })
})

describe('prediccion del peso', () => {
  it('mas calidad, mas peso', () => {
    const valores = [40, 60, 75, 85, 95].map((q) => bppJpeg(q, false))
    for (let i = 1; i < valores.length; i += 1) {
      expect(valores[i] as number).toBeGreaterThan(valores[i - 1] as number)
    }
  })

  it('en grises pesa menos, en los dos formatos', () => {
    expect(bppJpeg(80, true)).toBeLessThan(bppJpeg(80, false))
    expect(bppPng(true)).toBeLessThan(bppPng(false))
  })

  it('un JPEG pesa menos que un PNG a calidad normal', () => {
    expect(bppJpeg(80, false)).toBeLessThan(bppPng(false))
  })

  it('los bytes por pixel estimados quedan en un rango creible', () => {
    for (const q of [40, 60, 80, 95]) {
      expect(bppJpeg(q, false)).toBeGreaterThan(0.05)
      expect(bppJpeg(q, false)).toBeLessThan(1)
    }
  })

  it('una medida de verdad sale del total, no del promedio de promedios', () => {
    // Una imagen chica que comprime fatal no puede pesar lo mismo en el total
    // que una grande que comprime bien.
    expect(
      bppMedido([
        { bytes: 100, pixeles: 100 },
        { bytes: 100, pixeles: 900 },
      ]),
    ).toBeCloseTo(200 / 1000)
  })

  it('sin muestras utiles no hay medida', () => {
    expect(bppMedido([])).toBeNull()
    expect(bppMedido([{ bytes: 0, pixeles: 100 }])).toBeNull()
    expect(bppMedido([{ bytes: 100, pixeles: 0 }])).toBeNull()
  })

  it('el peso sale de los pixeles por los bytes por pixel', () => {
    expect(pesoTotalEstimado([{ ancho: 1000, alto: 1000 }], 0.25)).toBe(250_000)
    expect(pesoTotalEstimado([{ ancho: 0, alto: 1000 }], 0.25)).toBe(0)
  })

  it('el total suma los pixeles de todas', () => {
    expect(pesoTotalEstimado([{ ancho: 100, alto: 100 }, { ancho: 200, alto: 100 }], 0.5)).toBe(15_000)
    expect(pesoTotalEstimado([], 0.5)).toBe(0)
  })
})

describe('las piezas puras del lienzo', () => {
  it('grises usa la luminancia, no el promedio de los tres canales', () => {
    // Verde puro es MUCHO mas claro que azul puro, y con un promedio los dos
    // saldrian iguales (85): un dibujo a dos colores quedaria plano.
    const verde = aGrises([0, 255, 0, 255])
    const azul = aGrises([0, 0, 255, 255])
    expect(verde[0]).toBe(182)
    expect(azul[0]).toBe(18)
    expect(verde[0]).not.toBe(azul[0])
  })

  it('grises deja los tres canales iguales y conserva el alfa', () => {
    const g = aGrises([10, 200, 90, 128, 255, 255, 255, 0])
    expect(g[0]).toBe(g[1])
    expect(g[1]).toBe(g[2])
    expect(g[3]).toBe(128)
    expect(g[7]).toBe(0)
  })

  it('el blanco y el negro no se mueven', () => {
    expect(Array.from(aGrises([255, 255, 255, 255]))).toEqual([255, 255, 255, 255])
    expect(Array.from(aGrises([0, 0, 0, 255]))).toEqual([0, 0, 0, 255])
  })

  it('reducir poco se hace de una vez', () => {
    expect(escalones({ ancho: 2000, alto: 3000 }, { ancho: 1600, alto: 2400 })).toEqual([
      { ancho: 1600, alto: 2400 },
    ])
  })

  it('reducir mucho se hace por pasos de como mucho la mitad', () => {
    const pasos = escalones({ ancho: 4000, alto: 6000 }, { ancho: 500, alto: 750 })
    expect(pasos.length).toBe(3)
    let previo = { ancho: 4000, alto: 6000 }
    for (const p of pasos) {
      expect(previo.ancho / p.ancho).toBeLessThanOrEqual(2.001)
      previo = p
    }
  })

  it('el ultimo paso es exactamente el tamano pedido', () => {
    for (const [a, b] of [
      [4000, 137],
      [3999, 1000],
      [10, 9],
      [1, 1],
    ] as const) {
      const pasos = escalones({ ancho: a, alto: a }, { ancho: b, alto: b })
      expect(pasos[pasos.length - 1]).toEqual({ ancho: b, alto: b })
    }
  })

  it('agrandar se hace de una vez: no hay nada que promediar', () => {
    expect(escalones({ ancho: 100, alto: 100 }, { ancho: 1000, alto: 1000 })).toEqual([
      { ancho: 1000, alto: 1000 },
    ])
  })

  it('ningun paso intermedio se queda en cero', () => {
    for (const p of escalones({ ancho: 5000, alto: 3 }, { ancho: 10, alto: 1 })) {
      expect(p.ancho).toBeGreaterThan(0)
      expect(p.alto).toBeGreaterThan(0)
    }
  })

  it('un recorte que se sale de la imagen se recorta a lo que hay', () => {
    expect(recorteValido({ x: 50, y: 50, ancho: 500, alto: 500 }, 100, 100)).toEqual({
      x: 50,
      y: 50,
      ancho: 50,
      alto: 50,
    })
  })

  it('un recorte con coordenadas negativas empieza en el origen', () => {
    expect(recorteValido({ x: -10, y: -10, ancho: 50, alto: 50 }, 100, 100)).toEqual({
      x: 0,
      y: 0,
      ancho: 50,
      alto: 50,
    })
  })

  it('un recorte fuera del todo deja al menos un pixel', () => {
    const r = recorteValido({ x: 999, y: 999, ancho: 10, alto: 10 }, 100, 100)
    expect(r.ancho).toBeGreaterThanOrEqual(1)
    expect(r.alto).toBeGreaterThanOrEqual(1)
    expect(r.x + r.ancho).toBeLessThanOrEqual(100)
  })

  it('cada formato tiene su tipo MIME', () => {
    expect(mediaDe('png')).toBe('image/png')
    expect(mediaDe('jpeg')).toBe('image/jpeg')
  })
})

/**
 * El deslizador de resolucion. Antes la recomendacion solo se decia en texto
 * («Recomendado: 1391 x 2087 px») y no habia forma de pedirla ni de bajar el
 * tamaño sin escribir dos numeros a mano.
 */
describe('el deslizador de resolucion', () => {
  const r = (ancho: number, alto: number) => ({ x: 0, y: 0, ancho, alto })

  it('el tope es el trozo encuadrado: el deslizador no puede emborronar', () => {
    // reparoDe marca como error pedir mas pixeles de los encuadrados, asi que
    // el deslizador no debe poder llegar ahi.
    expect(rangoDeResolucion(r(1600, 2400)).max).toBe(2400)
    expect(rangoDeResolucion(r(3000, 1000)).max).toBe(3000)
  })

  it('con una imagen diminuta el rango no se da la vuelta', () => {
    const g = rangoDeResolucion(r(120, 90))
    expect(g.min).toBeLessThanOrEqual(g.max)
    expect(g.max).toBe(LADO_LARGO_MINIMO)
  })

  it('mueve los dos lados a la vez, con la proporcion del encuadre', () => {
    expect(tamanoPorResolucion(r(1600, 2400), 1200)).toEqual({ ancho: 800, alto: 1200 })
    expect(tamanoPorResolucion(r(2400, 1600), 1200)).toEqual({ ancho: 1200, alto: 800 })
  })

  it('se queda dentro del rango aunque le pidas cualquier cosa', () => {
    const encuadre = r(1600, 2400)
    const { min, max } = rangoDeResolucion(encuadre)
    for (const pedido of [-50, 0, 10, 999_999]) {
      const m = tamanoPorResolucion(encuadre, pedido)
      const largo = ladoLargo(m.ancho, m.alto)
      expect(largo).toBeGreaterThanOrEqual(min)
      expect(largo).toBeLessThanOrEqual(max)
    }
  })

  it('nunca pasa del tope de Apple Books, ni en el maximo', () => {
    // Un encuadre cuadrado de 2400 son 5,76 millones y Apple admite 5,6.
    const encuadre = r(2400, 2400)
    const m = tamanoPorResolucion(encuadre, rangoDeResolucion(encuadre).max)
    expect(m.ancho * m.alto).toBeLessThanOrEqual(MAX_PIXELES)
  })

  it('con un recorte vacio no revienta', () => {
    expect(tamanoPorResolucion(r(0, 0), 1200)).toEqual({ ancho: 0, alto: 0 })
  })

  it('el lado largo es el mayor, venga como venga', () => {
    expect(ladoLargo(10, 30)).toBe(30)
    expect(ladoLargo(30, 10)).toBe(30)
    expect(ladoLargo(LADO_LARGO_RECOMENDADO, 10)).toBe(LADO_LARGO_RECOMENDADO)
  })
})
