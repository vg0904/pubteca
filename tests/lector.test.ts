// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// El lector (`src/lector/lector.js`), en un DOM de pruebas: carga el
// manifiesto, monta la portada, abre las partes por su enlace, por sus
// metodos y por la direccion, recuerda por donde iba y los ajustes, y no
// ejecuta nada de lo que carga. Como se ve (el tema, la barra pegada, el
// movil) se probo a mano en Chromium: ver el PR.

const LECTOR = readFileSync(join(import.meta.dirname, '..', 'src', 'lector', 'lector.js'), 'utf8')

interface Lector extends HTMLElement {
  readonly libro: { titulo: string } | null
  readonly parte: string
  readonly modo: string
  readonly pagina: number
  readonly paginas: number
  irA(id: string): void
  siguiente(): void
  anterior(): void
  adelante(): void
  atras(): void
}

const MANIFIESTO = {
  formato: 'pubteca-web',
  version: 1,
  id: 'urn:uuid:prueba',
  titulo: 'El <b>faro</b>',
  subtitulo: '',
  autor: 'Ana',
  sello: '',
  idioma: 'es',
  descripcion: 'Una prueba.',
  portada: { src: 'imagenes/portada.png', ancho: 10, alto: 16 },
  estilo: 'libro.css',
  muestra: true,
  partes: [
    { id: 'cap01', clase: 'capitulo', titulo: 'Capítulo 1', archivo: 'cap01.html', indice: true },
    { id: 'cap02', clase: 'capitulo', titulo: 'Capítulo 2', archivo: 'cap02.html', indice: true },
    { id: 'derechos', clase: 'derechos', titulo: 'Derechos', archivo: 'derechos.html', indice: false },
  ],
  lectura: { modo: 'desplazar', letra: 'literata' },
  letras: [
    { id: 'literata', nombre: 'Literata', familia: 'Pubteca Literata', respaldo: 'Georgia, serif', caras: [{ src: 'letras/Literata-Regular.woff', peso: '400', estilo: 'normal' }], licencia: 'letras/OFL-Literata.txt' },
    { id: 'eb-garamond', nombre: 'EB Garamond', familia: 'Pubteca EB Garamond', respaldo: 'Georgia, serif', caras: [], licencia: null },
    { id: 'sistema', nombre: 'Del sistema', familia: null, respaldo: 'system-ui, sans-serif', caras: [], licencia: null },
  ],
  textos: {
    portada: 'Portada',
    indice: 'Índice',
    empezar: 'Empezar a leer',
    continuar: 'Seguir leyendo',
    anterior: 'Anterior',
    siguiente: 'Siguiente',
    muestra: 'Muestra',
    temaOscuro: 'Oscuro',
    tema: 'Tema',
    modo: 'Lectura',
    desplazar: 'Desplazar',
    paginas: 'Páginas',
    interlineado: 'Interlineado',
    compacto: 'Compacto',
    normal: 'Normal',
    amplio: 'Amplio',
    alineacion: 'Alineación',
    izquierda: 'Izquierda',
    justificado: 'Justificado',
    paginaAnterior: 'Página anterior',
    paginaSiguiente: 'Página siguiente',
  },
}

const pagina = (id: string, cuerpo: string): string =>
  `<!doctype html><html><head><link rel="stylesheet" href="libro.css"></head><body><main id="${id}">${cuerpo}</main><nav class="pubteca-pie"><a href="x.html">pie</a></nav></body></html>`

const PARTES: Record<string, string> = {
  'http://localhost:3000/libro/cap01.html': pagina('cap01', '<p>Marta bajó del autobús.</p><div class="ilustracion"><img src="imagenes/cap01-01.png" alt="dibujo"></div><script>window.__colado = true</script><img src="x" onerror="window.__colado = true"><a href="javascript:alert(1)">mal</a>'),
  'http://localhost:3000/libro/cap02.html': pagina('cap02', '<p>El camino al faro.</p>'),
  'http://localhost:3000/libro/derechos.html': pagina('derechos', '<p>© 2026 Ana</p>'),
}

const pedidos: string[] = []

beforeAll(() => {
  new Function(LECTOR)()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      pedidos.push(String(url))
      if (String(url).endsWith('libro.json')) return new Response(JSON.stringify(MANIFIESTO))
      const html = PARTES[String(url)]
      return html ? new Response(html) : new Response('', { status: 404 })
    }),
  )
})

afterEach(() => {
  document.body.replaceChildren()
  localStorage.clear()
  history.replaceState(null, '', '/')
  pedidos.length = 0
})

function esperar(el: HTMLElement, evento: string): Promise<CustomEvent> {
  return new Promise((listo) => el.addEventListener(evento, (e) => listo(e as CustomEvent), { once: true }))
}

/** Un lector con el manifiesto dentro (como index.html) o pedido por fetch. */
async function montar(atributos = '', dentro = true, manifiesto: object = MANIFIESTO): Promise<Lector> {
  const caja = document.createElement('div')
  caja.innerHTML = `<pubteca-lector src="libro/libro.json" ${atributos}>${dentro ? `<script type="application/json">${JSON.stringify(manifiesto)}</script>` : ''}</pubteca-lector>`
  const el = caja.firstElementChild as Lector
  const listo = esperar(el, 'pubteca-parte')
  document.body.append(el)
  await listo
  return el
}

const sombra = (el: Lector): ShadowRoot => el.shadowRoot as ShadowRoot
const contenido = (el: Lector): HTMLElement => sombra(el).querySelector('.contenido') as HTMLElement

async function ir(el: Lector, hacer: () => void): Promise<CustomEvent> {
  const e = esperar(el, 'pubteca-parte')
  hacer()
  return e
}

describe('el lector', () => {
  it('se define una vez y monta la portada con los datos del manifiesto, siempre como texto', async () => {
    expect(customElements.get('pubteca-lector')).toBeDefined()
    const el = await montar()
    expect(el.parte).toBe('inicio')
    expect(el.libro?.titulo).toBe('El <b>faro</b>')
    const portada = contenido(el)
    expect(portada.querySelector('h1')?.textContent).toBe('El <b>faro</b>')
    expect(portada.querySelector('h1 b')).toBeNull()
    expect(portada.querySelector('img.cubierta')?.getAttribute('src')).toBe('http://localhost:3000/libro/imagenes/portada.png')
    expect(portada.querySelector('.insignia')?.textContent).toBe('Muestra')
    expect([...portada.querySelectorAll('.acciones button')].map((b) => b.textContent)).toEqual(['Empezar a leer'])
    // En el indice, solo lo que se anuncia: los derechos se leen pero no salen.
    expect([...portada.querySelectorAll('nav a')].map((a) => a.textContent)).toEqual(['Capítulo 1', 'Capítulo 2'])
    expect(sombra(el).querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe('http://localhost:3000/libro/libro.css')
  })

  it('sin el manifiesto dentro, lo pide a `src`', async () => {
    const el = await montar('', false)
    expect(pedidos[0]).toBe('http://localhost:3000/libro/libro.json')
    expect(el.libro?.titulo).toBe('El <b>faro</b>')
  })

  it('abre una parte: su <main>, con las rutas completas y sin nada que se ejecute', async () => {
    const el = await montar()
    const e = await ir(el, () => el.irA('cap01'))
    expect(e.detail).toMatchObject({ id: 'cap01', titulo: 'Capítulo 1', posicion: 1, total: 3 })
    const c = contenido(el)
    expect(c.textContent).toContain('Marta bajó del autobús.')
    expect(c.querySelector('.ilustracion img')?.getAttribute('src')).toBe('http://localhost:3000/libro/imagenes/cap01-01.png')
    // Ni el pie de la pagina suelta ni sus scripts.
    expect(c.querySelector('.pubteca-pie')).toBeNull()
    expect(c.querySelector('script')).toBeNull()
    expect(c.querySelector('[onerror]')).toBeNull()
    expect([...c.querySelectorAll('a')].some((a) => a.getAttribute('href')?.startsWith('javascript'))).toBe(false)
    expect((window as unknown as { __colado?: boolean }).__colado).toBeUndefined()
    expect(location.hash).toBe('#cap01')
  })

  it('siguiente, anterior, y los botones del pie dicen a donde van', async () => {
    const el = await montar()
    await ir(el, () => el.irA('cap01'))
    await ir(el, () => el.siguiente())
    expect(el.parte).toBe('cap02')
    const pasos = [...sombra(el).querySelectorAll('.pie .paso span')].map((s) => s.textContent)
    expect(pasos).toEqual(['Capítulo 1', 'Derechos'])
    await ir(el, () => el.anterior())
    expect(el.parte).toBe('cap01')
    await ir(el, () => el.anterior())
    expect(el.parte).toBe('inicio')
  })

  it('un enlace del indice abre su parte sin recargar', async () => {
    const el = await montar()
    const enlace = [...contenido(el).querySelectorAll('nav a')].find((a) => a.textContent === 'Capítulo 2') as HTMLAnchorElement
    expect(enlace.getAttribute('href')).toBe('#cap02')
    await ir(el, () => enlace.click())
    expect(el.parte).toBe('cap02')
  })

  it('abre la parte que pide la direccion, y una que no es del libro se ignora', async () => {
    history.replaceState(null, '', '/#cap02')
    expect((await montar()).parte).toBe('cap02')
    document.body.replaceChildren()
    history.replaceState(null, '', '/#contacto')
    expect((await montar()).parte).toBe('inicio')
  })

  it('con `sin-hash` no lee ni escribe la direccion; con `parte`, abre por ahi', async () => {
    history.replaceState(null, '', '/#cap02')
    const el = await montar('sin-hash parte="derechos"')
    expect(el.parte).toBe('derechos')
    await ir(el, () => el.irA('cap01'))
    expect(location.hash).toBe('#cap02')
  })

  it('recuerda por donde iba: al volver, la portada ofrece seguir leyendo', async () => {
    const el = await montar()
    await ir(el, () => el.irA('cap02'))
    el.remove()
    history.replaceState(null, '', '/')
    const otro = await montar()
    expect([...contenido(otro).querySelectorAll('.acciones button')].map((b) => b.textContent)).toEqual(['Seguir leyendo', 'Empezar a leer'])
    await ir(otro, () => (contenido(otro).querySelector('.acciones button') as HTMLButtonElement).click())
    expect(otro.parte).toBe('cap02')
  })

  it('con `sin-memoria` no guarda nada', async () => {
    const el = await montar('sin-memoria')
    await ir(el, () => el.irA('cap02'))
    expect(localStorage.length).toBe(0)
  })

  it('el tema: el del atributo hasta que quien lee elige otro, y entonces el suyo, guardado', async () => {
    const el = await montar('tema="sepia"')
    const lector = sombra(el).querySelector('.lector') as HTMLElement
    expect(lector.getAttribute('data-tema')).toBe('sepia')
    ;(sombra(el).querySelector('.opcion[data-grupo="tema"][data-valor="oscuro"]') as HTMLButtonElement).click()
    expect(lector.getAttribute('data-tema')).toBe('oscuro')
    expect(JSON.parse(localStorage.getItem('pubteca-lector:ajustes') as string)).toMatchObject({ tema: 'oscuro' })
    el.setAttribute('tema', 'claro')
    expect(lector.getAttribute('data-tema')).toBe('oscuro')
  })

  it('el tamaño de letra sube y baja hasta su tope', async () => {
    const el = await montar()
    const mayor = sombra(el).querySelector('.opcion[data-valor="mayor"]') as HTMLButtonElement
    for (let i = 0; i < 10; i++) mayor.click()
    expect(mayor.disabled).toBe(true)
    expect((sombra(el).querySelector('.lector') as HTMLElement).style.getPropertyValue('--_escala')).toBe('1.6')
  })

  it('una parte que no carga se dice, y se puede reintentar', async () => {
    const el = await montar()
    const original = PARTES['http://localhost:3000/libro/cap02.html'] as string
    delete PARTES['http://localhost:3000/libro/cap02.html']
    await ir(el, () => el.irA('cap02'))
    const reintentar = contenido(el).querySelector('.estado button') as HTMLButtonElement
    expect(reintentar).not.toBeNull()
    PARTES['http://localhost:3000/libro/cap02.html'] = original
    await ir(el, () => reintentar.click())
    expect(contenido(el).textContent).toContain('El camino al faro.')
  })

  it('un manifiesto que no es de Pubteca no se abre, y lo dice', async () => {
    const caja = document.createElement('div')
    caja.innerHTML = '<pubteca-lector src="otra.json"><script type="application/json">{"formato":"otro"}</script></pubteca-lector>'
    document.body.append(caja)
    await vi.waitFor(() => expect(caja.querySelector('pubteca-lector')?.shadowRoot?.querySelector('.estado')?.textContent).toMatch(/No se pudo cargar/u))
  })
})

// Pasar paginas. jsdom no maqueta (todo mide 0), asi que cada parte es una
// sola pagina: aqui se prueba lo que hace el lector con las paginas que hay;
// que las cuente bien y que los dedos las pasen se probo en Chromium.
describe('el lector, pasando paginas', () => {
  const lector = (el: Lector): HTMLElement => sombra(el).querySelector('.lector') as HTMLElement
  const opcion = (el: Lector, grupo: string, valor: string): HTMLButtonElement => sombra(el).querySelector(`.opcion[data-grupo="${grupo}"][data-valor="${valor}"]`) as HTMLButtonElement

  it('se abre en el modo que dice el libro, y el atributo manda sobre el libro', async () => {
    expect((await montar('', true, { ...MANIFIESTO, lectura: { modo: 'paginas', letra: 'literata' } })).modo).toBe('paginas')
    document.body.replaceChildren()
    expect((await montar('modo="paginas"')).modo).toBe('paginas')
    expect(lector(document.querySelector('pubteca-lector') as Lector).getAttribute('data-modo')).toBe('paginas')
  })

  it('adelante: al acabar la ultima pagina de una parte, la siguiente; atras: la anterior, por su final', async () => {
    const el = await montar('modo="paginas"')
    await ir(el, () => el.adelante())
    expect(el.parte).toBe('cap01')
    expect([el.pagina, el.paginas]).toEqual([1, 1])
    await ir(el, () => el.adelante())
    expect(el.parte).toBe('cap02')
    await ir(el, () => el.atras())
    expect(el.parte).toBe('cap01')
  })

  it('las teclas: flechas, avance de pagina y espacio (con mayusculas, atras)', async () => {
    const el = await montar('modo="paginas" pagina')
    const tecla = (key: string, shiftKey = false): Promise<CustomEvent> => ir(el, () => document.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })))
    await tecla('ArrowRight')
    expect(el.parte).toBe('cap01')
    await tecla(' ')
    expect(el.parte).toBe('cap02')
    await tecla('PageUp')
    expect(el.parte).toBe('cap01')
    await tecla(' ', true)
    expect(el.parte).toBe('inicio')
  })

  it('desplazando, el espacio y las paginas son del navegador', async () => {
    const el = await montar('pagina')
    await ir(el, () => el.irA('cap01'))
    const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    document.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
    expect(el.parte).toBe('cap01')
  })

  it('el paginador dice donde se esta y no deja ir mas alla del principio', async () => {
    const el = await montar('modo="paginas"')
    const s = sombra(el)
    expect(s.querySelector('.paginador .donde')?.textContent).toBe('El <b>faro</b> · 1 / 1')
    const [atras, adelante] = [...s.querySelectorAll('.paginador button')] as HTMLButtonElement[]
    expect(atras?.disabled).toBe(true)
    expect(adelante?.getAttribute('aria-label')).toBe('Página siguiente')
    await ir(el, () => adelante?.click())
    expect(s.querySelector('.paginador .donde')?.textContent).toBe('Capítulo 1 · 1 / 1')
    expect(atras?.disabled).toBe(false)
  })

  it('cambiar de modo en los ajustes se guarda y manda sobre el libro', async () => {
    const el = await montar('modo="paginas"')
    opcion(el, 'modo', 'desplazar').click()
    expect(el.modo).toBe('desplazar')
    expect(JSON.parse(localStorage.getItem('pubteca-lector:ajustes') as string)).toMatchObject({ modo: 'desplazar' })
    el.setAttribute('modo', 'paginas')
    expect(el.modo).toBe('desplazar')
  })

  it('las letras se ofrecen por su nombre, cada una escrita en la suya', async () => {
    const el = await montar()
    const letras = [...sombra(el).querySelectorAll('.opcion[data-grupo="letra"]')] as HTMLButtonElement[]
    expect(letras.map((b) => b.textContent)).toEqual(['Literata', 'EB Garamond', 'Del sistema'])
    expect(letras[0]?.style.fontFamily).toContain('Pubteca Literata')
    expect(letras[0]?.getAttribute('aria-pressed')).toBe('true')
    letras[1]?.click()
    expect(lector(el).style.getPropertyValue('--_letra')).toBe('"Pubteca EB Garamond", Georgia, serif')
    expect(letras[1]?.getAttribute('aria-pressed')).toBe('true')
  })

  it('el atributo `letra` elige la del libro; una que no existe se ignora', async () => {
    expect(lector(await montar('letra="sistema"')).style.getPropertyValue('--_letra')).toBe('system-ui, sans-serif')
    document.body.replaceChildren()
    expect(lector(await montar('letra="papyrus"')).style.getPropertyValue('--_letra')).toContain('Pubteca Literata')
  })

  it('un libro.json de antes, sin letras, ofrece una serif y no se rompe', async () => {
    const { letras: _fuera, lectura: _tambien, ...viejo } = MANIFIESTO
    const el = await montar('', true, viejo)
    expect([...sombra(el).querySelectorAll('.opcion[data-grupo="letra"]')].map((b) => b.textContent)).toEqual(['Serif'])
    expect(el.modo).toBe('desplazar')
  })

  it('interlineado y alineacion', async () => {
    const el = await montar()
    opcion(el, 'interlineado', 'amplio').click()
    expect(lector(el).style.getPropertyValue('--_interlineado')).toBe('1.9')
    opcion(el, 'interlineado', 'normal').click()
    expect(lector(el).style.getPropertyValue('--_interlineado')).toBe('')
    opcion(el, 'alineacion', 'justificado').click()
    expect(lector(el).getAttribute('data-alinear')).toBe('justificado')
    expect(JSON.parse(localStorage.getItem('pubteca-lector:ajustes') as string)).toMatchObject({ interlineado: 'normal', alineacion: 'justificado' })
  })

  it('unos ajustes guardados raros se ignoran campo a campo', async () => {
    localStorage.setItem('pubteca-lector:ajustes', JSON.stringify({ modo: 'carrusel', interlineado: 'enorme', alineacion: 'derecha', escala: 99, tema: 'sepia' }))
    const el = await montar()
    expect(el.modo).toBe('desplazar')
    expect(lector(el).getAttribute('data-alinear')).toBe('izquierda')
    expect(lector(el).getAttribute('data-tema')).toBe('sepia')
  })

  it('el evento pubteca-pagina dice parte, pagina y cuantas hay', async () => {
    const el = await montar('modo="paginas"')
    const e = new Promise<CustomEvent>((listo) => el.addEventListener('pubteca-pagina', (x) => listo(x as CustomEvent), { once: true }))
    el.irA('cap02')
    expect((await e).detail).toEqual({ parte: 'cap02', pagina: 1, paginas: 1 })
  })
})

// El trackpad. Un deslizamiento con dos dedos llega como una racha de eventos
// que el sistema sigue mandando, cada vez mas flojos, durante mas de un
// segundo (la inercia). Antes cada 450 ms de inercia pasaban otra pagina: un
// solo gesto fuerte llegaba al final del libro. Cada evento lleva su hora a
// mano: el lector la lee de `timeStamp`, y asi no depende del reloj del test.
describe('el trackpad: un gesto, una pagina', () => {
  let reloj = 1_000_000

  /** Los dedos empujan (sube) y la inercia va frenando, un evento cada 16 ms. */
  function gesto(fuerza: number, signo = 1, ruido = 0): number[] {
    let semilla = 11
    const azar = (): number => (semilla = (semilla * 16807) % 2147483647) / 2147483647
    const d: number[] = []
    for (let i = 1; i <= 8; i++) d.push((fuerza * i) / 8)
    for (let x = fuerza; x > 0.5; x *= 0.94) d.push(x * (1 + (azar() - 0.5) * 2 * ruido))
    return d.map((v) => v * signo)
  }

  function enviar(el: Lector, deltas: readonly number[], vertical = false, ctrlKey = false): WheelEvent[] {
    const hoja = sombra(el).querySelector('.hoja') as HTMLElement
    return deltas.map((d) => {
      const e = new WheelEvent('wheel', { deltaX: vertical ? 0 : d, deltaY: vertical ? d : 0, ctrlKey, bubbles: true, cancelable: true, composed: true })
      reloj += 16
      Object.defineProperty(e, 'timeStamp', { value: reloj })
      hoja.dispatchEvent(e)
      return e
    })
  }

  /**
   * Donde queda el lector tras el gesto. jsdom no maqueta, asi que cada parte
   * es una pagina: pasar pagina es cambiar de parte. Se mira `parte`, que
   * cambia en el acto, y no el evento: si el segundo gesto llega antes de que
   * cargue la primera parte, esa ya no se anuncia.
   */
  function trasElGesto(el: Lector, deltas: readonly number[], vertical = false, ctrlKey = false): string {
    reloj += 5000
    enviar(el, deltas, vertical, ctrlKey)
    return el.parte
  }

  it('por fuerte que sea, y aunque la inercia tiemble, pasa una sola', async () => {
    for (const [fuerza, ruido] of [
      [15, 0],
      [60, 0],
      [150, 0],
      [80, 0.3],
    ] as const) {
      document.body.replaceChildren()
      history.replaceState(null, '', '/')
      const el = await montar('modo="paginas"')
      expect(trasElGesto(el, gesto(fuerza, 1, ruido)), `fuerza ${fuerza}`).toBe('cap01')
    }
  })

  it('dos gestos son dos paginas, separados por una pausa', async () => {
    const el = await montar('modo="paginas"')
    expect(trasElGesto(el, gesto(80))).toBe('cap01')
    expect(trasElGesto(el, gesto(80))).toBe('cap02')
  })

  it('y tambien si el segundo empieza en plena inercia del primero: los dedos vuelven a acelerar', async () => {
    const el = await montar('modo="paginas"')
    // El primero, cortado a media inercia, y sin pausa el segundo.
    expect(trasElGesto(el, [...gesto(80).slice(0, 30), ...gesto(80)])).toBe('cap02')
  })

  it('hacia atras, igual: una', async () => {
    const el = await montar('modo="paginas"')
    await ir(el, () => el.irA('derechos'))
    expect(trasElGesto(el, gesto(150, -1))).toBe('cap02')
  })

  it('desplazando, la rueda es del navegador; pasando paginas incrustado, la vertical tambien', async () => {
    const desplazando = await montar()
    reloj += 5000
    expect(enviar(desplazando, gesto(80)).some((e) => e.defaultPrevented)).toBe(false)
    document.body.replaceChildren()
    const incrustado = await montar('modo="paginas"')
    reloj += 5000
    expect(enviar(incrustado, gesto(80), true).some((e) => e.defaultPrevented)).toBe(false)
    expect(incrustado.parte).toBe('inicio')
  })

  it('a pagina completa, la rueda vertical pasa pagina, una por gesto; con Ctrl (el zoom) no', async () => {
    const el = await montar('modo="paginas" pagina')
    expect(trasElGesto(el, gesto(120), true, true)).toBe('inicio')
    expect(trasElGesto(el, gesto(120), true)).toBe('cap01')
  })

  it('con el dedo tambien: un deslizamiento rapido y largo pasa una sola', async () => {
    const el = await montar('modo="paginas"')
    const hoja = sombra(el).querySelector('.hoja') as HTMLElement
    const dedo = (tipo: string, x: number, t: number): void => {
      const e = new PointerEvent(tipo, { pointerId: 3, pointerType: 'touch', isPrimary: true, clientX: x, clientY: 300, button: 0, bubbles: true, composed: true })
      Object.defineProperty(e, 'timeStamp', { value: t })
      hoja.dispatchEvent(e)
    }
    // 600 px en 80 ms, de derecha a izquierda: un latigazo.
    dedo('pointerdown', 700, 0)
    for (let i = 1; i <= 5; i++) dedo('pointermove', 700 - i * 120, i * 16)
    dedo('pointerup', 100, 80)
    expect(el.parte).toBe('cap01')
  })
})

