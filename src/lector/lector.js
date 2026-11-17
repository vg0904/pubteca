/*!
 * El lector de Pubteca: el elemento <pubteca-lector>.
 * Un solo archivo, sin dependencias. Licencia MIT.
 *
 *   <script src="lector.js" defer></script>
 *   <pubteca-lector src="libro/libro.json"></pubteca-lector>
 *
 * Atributos, variables CSS, eventos y metodos: LEEME.md.
 */
(() => {
  'use strict'

  if (typeof window === 'undefined' || !window.customElements || customElements.get('pubteca-lector')) return

  /** La portada del libro en el lector. No es una parte de `libro.json`: la monta el lector. */
  const INICIO = 'inicio'
  const CLAVE_AJUSTES = 'pubteca-lector:ajustes'
  const CLAVE_LIBRO = 'pubteca-lector:libro:'
  const TEMAS = ['auto', 'claro', 'sepia', 'oscuro']
  const MODOS = ['desplazar', 'paginas']
  const ALINEACIONES = ['izquierda', 'justificado']
  /** El interlineado de cada opcion. `normal` es el del sitio (o 1,65). */
  const INTERLINEADOS = { compacto: '1.45', normal: null, amplio: '1.9' }
  /** Los tamaños de letra que se pueden elegir, sobre el tamaño base. */
  const ESCALAS = [0.8, 0.9, 1, 1.12, 1.25, 1.4, 1.6]
  const ESCALA_NORMAL = 2
  /** El hueco entre una pagina y la siguiente, en px. No se ve: lo tapa la ventana. */
  const HUECO = 48
  /** La letra del sitio, si pone `--pubteca-fuente`. */
  const LETRA_SITIO = 'sitio'
  const RESPALDO_SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif'

  const ESTILO = `
:host { display: block; scroll-margin-top: var(--pubteca-arriba, 0px); }
:host([hidden]) { display: none; }
:host([pagina]) { min-height: 100vh; min-height: 100dvh; }
*, *::before, *::after { box-sizing: border-box; }

/* Nada de lo que el sitio le ponga a su texto entra aqui: se empieza de cero.
   Las variables --pubteca-* si entran, que es como se personaliza. */
.lector {
  all: initial;
  --fondo: var(--pubteca-claro-fondo, #ffffff);
  --texto: var(--pubteca-claro-texto, #1b1b1b);
  --acento: var(--pubteca-acento, var(--texto));
  --interfaz: var(--pubteca-fuente-interfaz, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif);
  --letra: var(--pubteca-fuente, ${RESPALDO_SERIF});
  --_escala: 1;
  color-scheme: light;
  display: flex; flex-direction: column; min-height: inherit;
  background: var(--fondo); color: var(--texto);
  font-family: var(--interfaz); font-size: 1rem; line-height: 1.4;
  -webkit-text-size-adjust: 100%; text-size-adjust: 100%;
}
.lector[data-tema="sepia"] {
  --fondo: var(--pubteca-sepia-fondo, #f5eddc);
  --texto: var(--pubteca-sepia-texto, #4a3a28);
}
.lector[data-tema="oscuro"] {
  --fondo: var(--pubteca-oscuro-fondo, #121212);
  --texto: var(--pubteca-oscuro-texto, #e4dfd6);
  color-scheme: dark;
}

button {
  font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; }
[hidden] { display: none !important; }

/* La barra: indice, titulo, por donde va y ajustes. Se queda arriba al bajar. */
.barra {
  position: sticky; top: var(--pubteca-arriba, 0px); z-index: 2;
  display: flex; align-items: center; gap: 0.25rem; padding: 0.3rem 0.5rem;
  background: var(--fondo); border-bottom: 1px solid rgba(128, 128, 128, 0.3);
}
.icono {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  min-width: 2.75rem; min-height: 2.75rem; border-radius: 0.5rem; font-size: 1.05rem;
}
.icono:hover:not(:disabled), .titulo-barra:hover { background: rgba(128, 128, 128, 0.15); }
.icono:disabled { opacity: 0.25; cursor: default; }
.titulo-barra {
  flex: 1; min-width: 0; padding: 0.55rem 0.5rem; border-radius: 0.5rem;
  text-align: start; font-size: 0.95rem;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.posicion {
  flex: none; padding: 0 0.4rem; font-size: 0.8rem; opacity: 0.7;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.progreso {
  position: absolute; left: 0; right: 0; bottom: -1px; height: 2px;
  background: var(--acento); transform: scaleX(0); transform-origin: left center;
}

/* La hoja: lo que se lee. */
.hoja {
  flex: 1; display: block; outline: none;
  font-family: var(--_letra, var(--letra));
  font-size: calc(var(--_escala) * var(--pubteca-tamano, 1.125rem));
  line-height: var(--_interlineado, var(--pubteca-interlineado, 1.65));
}
.ventana { display: contents; }
.contenido {
  max-width: var(--pubteca-ancho, 34em); margin: 0 auto; padding: 1.5em 1.25rem 2.5em 1.25rem;
  overflow-wrap: break-word;
}
.contenido a { color: inherit; }
.contenido img { max-width: 100%; height: auto; }
/* Justificado: solo la prosa. Lo centrado (escenas, dedicatoria...) y los
   versos siguen como estan: por eso la especificidad es la de un «p». */
:where(.lector[data-alinear="justificado"] .contenido) p:where(:not(.versos p)) { text-align: justify; }
.estado {
  margin: 0; padding: 4em 0; text-align: center; text-indent: 0;
  font-family: var(--interfaz); font-size: 0.95rem; opacity: 0.75;
}
.estado .boton { margin-top: 1.2em; opacity: 1; }
.aviso {
  margin: 0 0 1.5em 0; padding: 0.7em 1em; text-indent: 0;
  border: 1px solid rgba(128, 128, 128, 0.4); border-radius: 0.5rem;
  font-family: var(--interfaz); font-size: 0.85rem; line-height: 1.4;
}
.marco { display: block; width: 100%; height: 80vh; border: 0; background: #ffffff; }

/* ---- Pasar paginas ------------------------------------------------------
   El texto se reparte en columnas del tamaño de la ventana, una al lado de la
   otra, y pasar pagina es mover la tira. La ventana tapa todo lo demas. */
.lector[data-modo="paginas"] { height: var(--pubteca-alto, 85vh); min-height: 0; }
:host([pagina]) .lector[data-modo="paginas"] { height: 100vh; height: 100dvh; }
.lector[data-modo="paginas"] .barra { position: relative; top: 0; }
.lector[data-modo="paginas"] .hoja {
  flex: 1 1 auto; min-height: 0; position: relative; overflow: hidden;
  /* Lo vertical (y el zoom) es del navegador; lo horizontal, de pasar pagina. */
  touch-action: pan-y pinch-zoom;
}
.lector[data-modo="paginas"] .ventana {
  display: block; position: absolute; top: 1.4rem; bottom: 0.9rem; left: 0; right: 0;
  width: min(calc(100% - 2.5rem), var(--pubteca-ancho, 34em)); margin: 0 auto; overflow: hidden;
}
.lector[data-modo="paginas"] .contenido {
  max-width: none; width: 100%; height: 100%; margin: 0; padding: 0;
  column-gap: ${HUECO}px; column-fill: auto; orphans: 2; widows: 2;
}
.contenido.animar { transition: transform 0.32s cubic-bezier(0.2, 0.7, 0.3, 1); }
@media (prefers-reduced-motion: reduce) { .contenido.animar { transition: none; } }
/* Nada puede ser mas alto que una pagina: se partiria. */
.lector[data-modo="paginas"] .contenido div.ilustracion,
.lector[data-modo="paginas"] .contenido div.portada { margin: 0 0 1em 0; break-inside: avoid; }
.lector[data-modo="paginas"] .contenido div.ilustracion img,
.lector[data-modo="paginas"] .contenido div.portada img,
.lector[data-modo="paginas"] .contenido img { max-height: calc(var(--_alto, 70vh) - 1.5em); max-width: 100%; }
/* La cubierta, el titulo y el boton de empezar caben en la primera pagina. */
/* La cabecera de un capitulo no se parte, y tras un dibujo de apertura el
   capitulo empieza en pagina nueva, como en el libro. */
.lector[data-modo="paginas"] .contenido div.cabecera { break-inside: avoid; }
.lector[data-modo="paginas"] .contenido div.ilustracion + section { break-before: column; }
.lector[data-modo="paginas"] .inicio .cubierta { max-height: calc(var(--_alto, 70vh) - 16em); margin-bottom: 1em; }
.lector[data-modo="paginas"] .inicio .acciones { margin-top: 1.2em; }
.lector[data-modo="paginas"] .marco { height: calc(var(--_alto, 70vh) - 6em); }
.lector[data-modo="paginas"] .estado { padding: 2em 0; }
.lector[data-modo="paginas"] .pie { display: none; }

/* Abajo: anterior, donde va, siguiente. */
.paginador { display: none; }
.lector[data-modo="paginas"] .paginador {
  display: flex; align-items: center; gap: 0.25rem; padding: 0.15rem 0.5rem;
  border-top: 1px solid rgba(128, 128, 128, 0.3); background: var(--fondo);
}
.paginador .donde {
  flex: 1; min-width: 0; text-align: center; font-size: 0.8rem; opacity: 0.75;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums;
}
/* En una pantalla ancha, ademas, flechas grandes a los lados. */
.flecha-lado { display: none; }
@media (hover: hover) and (min-width: 48rem) {
  .lector[data-modo="paginas"] .flecha-lado {
    display: flex; align-items: center; justify-content: center;
    position: absolute; top: 50%; z-index: 1; width: 3rem; height: 6rem; margin-top: -3rem;
    border-radius: 0.75rem; font-size: 1.6rem; opacity: 0.4;
  }
  .lector[data-modo="paginas"] .flecha-lado:hover:not(:disabled) { opacity: 1; background: rgba(128, 128, 128, 0.12); }
  .lector[data-modo="paginas"] .flecha-lado:disabled { opacity: 0.12; cursor: default; }
  .flecha-lado.izquierda { left: 0.5rem; }
  .flecha-lado.derecha { right: 0.5rem; }
}

/* La portada del lector. */
.inicio { text-align: center; }
.inicio .cubierta {
  display: block; margin: 0.5em auto 1.6em auto;
  width: auto; height: auto; max-width: min(100%, 20em); max-height: 70vh;
  box-shadow: 0 0.4em 1.6em rgba(0, 0, 0, 0.25);
}
.inicio h1 { margin: 0 0 0.3em 0; font-size: 1.9em; font-weight: normal; line-height: 1.2; text-align: center; }
.inicio p { text-indent: 0; text-align: center; -webkit-hyphens: manual; hyphens: manual; }
.inicio .subtitulo { margin: 0 0 0.6em 0; font-size: 1.1em; font-style: italic; }
.inicio .autor { margin: 1em 0 0 0; letter-spacing: 0.1em; }
.inicio .insignia {
  display: inline-block; margin: 1.2em 0 0 0; padding: 0.25em 0.9em;
  border: 1px solid currentColor; border-radius: 2em;
  font-family: var(--interfaz); font-size: 0.7em; letter-spacing: 0.15em; text-transform: uppercase;
}
.inicio .descripcion { max-width: 30em; margin: 1.6em auto 0 auto; font-size: 0.95em; }
.acciones {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 0.6rem; margin: 2em 0 0 0;
  font-family: var(--interfaz);
}
.boton {
  display: inline-block; padding: 0.75em 1.6em; border: 1px solid var(--acento); border-radius: 2em;
  font-family: var(--interfaz); font-size: 0.95rem; line-height: 1.2;
}
.boton.principal { background: var(--acento); color: var(--fondo); }
.inicio nav { max-width: 26em; margin: 3em auto 0 auto; text-align: start; font-family: var(--interfaz); font-size: 0.95rem; line-height: 1.4; }

.lista-indice { list-style: none; margin: 0; padding: 0; }
.lista-indice li { margin: 0; text-indent: 0; break-inside: avoid; }
.lista-indice a {
  display: block; padding: 0.7em 0.5em; color: inherit; text-decoration: none;
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
}
.lista-indice a:hover { background: rgba(128, 128, 128, 0.12); }
.lista-indice a[aria-current] { font-weight: 600; }

/* Anterior y siguiente, al acabar cada parte. */
.pie {
  display: flex; gap: 0.75rem; max-width: var(--pubteca-ancho, 34em); margin: 0 auto;
  padding: 0 1.25rem 3em 1.25rem; font-family: var(--interfaz); line-height: 1.35;
}
.paso {
  flex: 1 1 0; min-width: 0; padding: 0.8em 1em; text-align: start; font-size: 0.9rem;
  border: 1px solid rgba(128, 128, 128, 0.4); border-radius: 0.75rem;
}
.paso:hover { background: rgba(128, 128, 128, 0.12); }
.paso.siguiente { text-align: end; }
.paso small { display: block; font-size: 0.8em; opacity: 0.7; }
.paso span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.paso[hidden] { display: block !important; visibility: hidden; }

/* El indice y los ajustes. */
dialog.panel {
  position: fixed; margin: 0; padding: 0; border: 0; max-width: none; max-height: none;
  background: var(--fondo); color: var(--texto);
  font-family: var(--interfaz); font-size: 1rem; line-height: 1.4;
  box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.3);
}
dialog.panel::backdrop { background: rgba(0, 0, 0, 0.4); }
dialog.indice { inset: 0 auto 0 0; width: min(22rem, 88vw); height: 100%; overflow-y: auto; }
dialog.ajustes {
  inset: 3.5rem 0.75rem auto auto; width: min(21rem, calc(100vw - 1.5rem));
  max-height: calc(100vh - 4.5rem); max-height: calc(100dvh - 4.5rem); overflow-y: auto; border-radius: 0.9rem;
}
.panel-cabeza {
  position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between;
  padding: 0.5rem 0.5rem 0.5rem 1.1rem; background: var(--fondo);
}
.panel-cabeza h2 { margin: 0; font-size: 1rem; font-weight: 600; }
dialog.indice .lista-indice { padding: 0 0.7rem 1.5rem 0.7rem; }
fieldset { min-width: 0; margin: 0; padding: 0.4rem 1.1rem 1rem 1.1rem; border: 0; }
legend { margin: 0 0 0.5rem 0; padding: 0; font-size: 0.8rem; opacity: 0.7; }
.opciones { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.opcion {
  flex: 1 1 40%; padding: 0.55em 0.6em; text-align: center; white-space: nowrap; font-size: 0.9rem;
  border: 1px solid rgba(128, 128, 128, 0.45); border-radius: 0.6rem;
}
.opciones.de-letra .opcion { font-size: 1.02rem; padding: 0.5em 0.4em; white-space: normal; line-height: 1.2; }
.opciones.de-tres .opcion { flex-basis: 28%; }
.opcion[aria-pressed="true"] { border-color: var(--acento); box-shadow: inset 0 0 0 1px var(--acento); font-weight: 600; }
.opcion:disabled { opacity: 0.4; cursor: default; }
`

  const DIBUJO_INDICE =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  const DIBUJO_CERRAR =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  const DIBUJO_IZQUIERDA =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  const DIBUJO_DERECHA =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'

  /**
   * La hoja de estilo, una para todos los lectores de la pagina. Adoptada y no
   * en un <style>: asi tambien vale en un sitio con una politica de seguridad
   * (CSP) que no deja estilos en linea.
   */
  let hojaCompartida = null
  function hojaDeEstilo() {
    if (hojaCompartida === null) {
      try {
        hojaCompartida = new CSSStyleSheet()
        hojaCompartida.replaceSync(ESTILO)
      } catch {
        hojaCompartida = false
      }
    }
    return hojaCompartida || null
  }

  /** Las caras ya registradas en el documento, por su direccion: una vez por pagina, aunque haya varios lectores. */
  const caras = new Map()

  /**
   * Registra las caras de una letra en el documento y devuelve las de una
   * (o todas). Van al DOCUMENTO y no a la sombra: Chrome no lee las
   * `@font-face` de dentro de una sombra.
   */
  function registrarCaras(letra, base, soloRegular) {
    if (!letra.familia || typeof FontFace !== 'function' || !document.fonts) return []
    const elegidas = soloRegular ? letra.caras.filter((c) => c.peso === '400' && c.estilo === 'normal') : letra.caras
    return elegidas.map((c) => {
      const url = new URL(c.src, base).href
      let f = caras.get(url)
      if (!f) {
        f = new FontFace(letra.familia, `url("${url}") format("woff")`, { weight: c.peso, style: c.estilo, display: 'swap' })
        document.fonts.add(f)
        caras.set(url, f)
      }
      return f
    })
  }

  /** Un elemento con sus atributos y sus hijos. El texto entra siempre como texto, nunca como HTML. */
  function h(etiqueta, atributos, ...hijos) {
    const el = document.createElement(etiqueta)
    for (const [k, v] of Object.entries(atributos || {})) {
      if (v === false || v === null || v === undefined) continue
      if (k === 'alPulsar') el.addEventListener('click', v)
      else el.setAttribute(k, v === true ? '' : String(v))
    }
    el.append(...hijos.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false))
    return el
  }

  /** Un dibujo de los de arriba. Son constantes de este archivo, no texto del libro. */
  function dibujo(svg) {
    const t = document.createElement('template')
    t.innerHTML = svg
    return t.content.firstChild
  }

  const entre0y1 = (n) => Math.min(1, Math.max(0, n))

  /** Un clic que el navegador debe atender por su cuenta: con Ctrl o Cmd se abre en otra pestaña. */
  const clicConTecla = (e) => e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey

  /** Sin eventos de la rueda durante este tiempo, el gesto termino (ms). La inercia manda uno cada 16 ms. */
  const PAUSA_GESTO = 220
  /** Cuanto hay que deslizar para pasar pagina (px). */
  const UMBRAL_GESTO = 40

  /**
   * Si los dedos vuelven a empujar: la fuerza sube tres veces seguidas y ya
   * dobla la mas floja de las ultimas. La inercia nunca sube asi: solo frena.
   */
  function acelera(fuerzas, fuerza) {
    if (fuerzas.length < 3) return false
    const [a, b, c] = fuerzas.slice(-3)
    return a < b && b < c && c < fuerza && fuerza >= 2 * Math.max(1, Math.min(...fuerzas))
  }

  /** Lo que se toca para usarlo: tocarlo no pasa pagina. */
  const INTERACTIVO = 'a, button, input, select, textarea, label, summary, video, audio, iframe, [contenteditable], [role="button"]'

  /** El primer nombre de una lista de `font-family`: «Literata» de `"Literata", Georgia, serif`. */
  function primerNombre(pila) {
    const primero = (pila.split(',')[0] || '').trim().replace(/^["']|["']$/gu, '')
    return primero ? primero.charAt(0).toUpperCase() + primero.slice(1) : ''
  }

  class PubtecaLector extends HTMLElement {
    static get observedAttributes() {
      return ['src', 'tema', 'modo', 'letra']
    }

    constructor() {
      super()
      this._sombra = this.attachShadow({ mode: 'open' })
      /** `libro.json`, o null mientras no se ha cargado. */
      this._libro = null
      this._t = {}
      /** La direccion de `libro.json`: de ella cuelgan las partes y las imagenes. */
      this._base = ''
      this._orden = [INICIO]
      this._actual = INICIO
      /** Cada carga y cada cambio de parte toman un turno: lo que llega tarde, de un turno viejo, se tira. */
      this._turnoLibro = 0
      this._turnoParte = 0
      /** id de parte -> promesa con su HTML. */
      this._cache = new Map()
      /** Lo que eligio quien lee. null: lo que diga el sitio o el libro. */
      this._ajustes = { tema: null, escala: ESCALA_NORMAL, letra: null, modo: null, interlineado: 'normal', alineacion: 'izquierda' }
      /** Por donde iba: { parte, y }, con `y` de 0 a 1 dentro de la parte. */
      this._guardado = null
      this._reloj = 0
      this._midiendo = false
      this._montado = false
      this._tituloDeLaPagina = ''
      /** El modo que hay ahora en pantalla. */
      this._modoActual = 'desplazar'
      /** En modo paginas: la pagina, cuantas hay y lo que mide una. */
      this._pagina = 0
      this._paginas = 1
      this._ancho = 0
      this._maquetaPendiente = false
      /** Un dedo (o un raton) que ha empezado a tocar la hoja. */
      this._gesto = null
      this._tragarClic = false
      /** El gesto del trackpad en curso: cuanto lleva, si ya paso su pagina, y sus ultimas fuerzas. */
      this._rueda = { acumulado: 0, ultimo: -Infinity, usado: false, frenando: false, fuerzas: [] }
      this._ultimaPagina = ''

      this._alDesplazar = () => {
        if (this._midiendo) return
        this._midiendo = true
        requestAnimationFrame(() => {
          this._midiendo = false
          this._medir()
        })
      }
      this._alTeclear = (e) => this._tecla(e)
      this._alCambiarDireccion = () => this._desdeLaDireccion()
      this._alCambiarEsquema = () => this._aplicarAjustes()
      this._alCargarLetras = () => this._programarMaqueta()
      this._esquema = null
      this._observador = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this._programarMaqueta()) : null
    }

    connectedCallback() {
      if (!this._montado) {
        this._montar()
        this._montado = true
        this._tituloDeLaPagina = document.title
      }
      this._leerAjustes()
      this._aplicarAjustes()
      // `scroll` no sube por el arbol, pero si se puede capturar: asi vale
      // tambien si quien se desplaza no es la ventana sino una caja del sitio.
      document.addEventListener('scroll', this._alDesplazar, { capture: true, passive: true })
      document.addEventListener('keydown', this._alTeclear)
      window.addEventListener('popstate', this._alCambiarDireccion)
      window.addEventListener('hashchange', this._alCambiarDireccion)
      this._esquema = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
      if (this._esquema && this._esquema.addEventListener) this._esquema.addEventListener('change', this._alCambiarEsquema)
      if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', this._alCargarLetras)
      if (this._observador) this._observador.observe(this._hoja)
      this._cargar()
    }

    disconnectedCallback() {
      document.removeEventListener('scroll', this._alDesplazar, { capture: true })
      document.removeEventListener('keydown', this._alTeclear)
      window.removeEventListener('popstate', this._alCambiarDireccion)
      window.removeEventListener('hashchange', this._alCambiarDireccion)
      if (this._esquema && this._esquema.removeEventListener) this._esquema.removeEventListener('change', this._alCambiarEsquema)
      if (document.fonts && document.fonts.removeEventListener) document.fonts.removeEventListener('loadingdone', this._alCargarLetras)
      if (this._observador) this._observador.disconnect()
      this._escribirPosicion()
      this._turnoLibro++
      this._turnoParte++
    }

    attributeChangedCallback(nombre, antes, ahora) {
      if (!this._montado || !this.isConnected || antes === ahora) return
      if (nombre === 'src') this._cargar()
      else this._aplicarAjustes()
    }

    // -- lo que puede usar el sitio -----------------------------------------

    /** `libro.json` tal como se cargo, o null. */
    get libro() {
      return this._libro
    }

    /** El id de la parte abierta; `inicio` es la portada. */
    get parte() {
      return this._actual
    }

    /** `desplazar` o `paginas`: como se esta leyendo. */
    get modo() {
      return this._modoActual
    }

    /** En modo paginas, la pagina de la parte (desde 1) y cuantas tiene. */
    get pagina() {
      return this._pagina + 1
    }

    get paginas() {
      return this._paginas
    }

    /** Abre una parte por su id. */
    irA(id) {
      this._mostrar(String(id))
    }

    /** La parte siguiente. */
    siguiente() {
      const i = this._orden.indexOf(this._actual)
      if (i >= 0 && i < this._orden.length - 1) this._mostrar(this._orden[i + 1])
    }

    /** La parte anterior. */
    anterior() {
      const i = this._orden.indexOf(this._actual)
      if (i > 0) this._mostrar(this._orden[i - 1])
    }

    /** Adelante: una pagina en modo paginas (y al acabar, la parte siguiente); una parte, desplazando. */
    adelante() {
      if (this._modoActual !== 'paginas') return this.siguiente()
      if (this._pagina < this._paginas - 1) this._irAPagina(this._pagina + 1, true)
      else this.siguiente()
    }

    /** Atras: una pagina en modo paginas (y al llegar al principio, el final de la anterior); una parte, desplazando. */
    atras() {
      if (this._modoActual !== 'paginas') return this.anterior()
      if (this._pagina > 0) return this._irAPagina(this._pagina - 1, true)
      const i = this._orden.indexOf(this._actual)
      if (i > 0) this._mostrar(this._orden[i - 1], { y: 1 })
    }

    // -- el esqueleto --------------------------------------------------------

    _montar() {
      this._enlaceCss = h('link', { rel: 'stylesheet' })
      this._bIndice = h('button', { type: 'button', class: 'icono', alPulsar: () => this._abrir(this._panelIndice) }, dibujo(DIBUJO_INDICE))
      this._bTitulo = h('button', { type: 'button', class: 'titulo-barra', alPulsar: () => this._mostrar(INICIO) })
      this._posicion = h('span', { class: 'posicion' })
      this._bAjustes = h('button', { type: 'button', class: 'icono', alPulsar: () => this._abrirAjustes() }, 'Aa')
      this._progreso = h('div', { class: 'progreso', part: 'progreso' })
      this._barra = h('header', { class: 'barra', part: 'barra', hidden: true }, this._bIndice, this._bTitulo, this._posicion, this._bAjustes, this._progreso)

      this._contenido = h('div', { class: 'contenido', part: 'contenido' })
      this._ventana = h('div', { class: 'ventana' }, this._contenido)
      this._bAnterior = h('button', { type: 'button', class: 'paso anterior', alPulsar: () => this.anterior() })
      this._bSiguiente = h('button', { type: 'button', class: 'paso siguiente', alPulsar: () => this.siguiente() })
      this._pie = h('nav', { class: 'pie', part: 'pie', hidden: true }, this._bAnterior, this._bSiguiente)
      this._ladoIzquierdo = h('button', { type: 'button', class: 'flecha-lado izquierda', tabindex: '-1', alPulsar: () => this.atras() }, dibujo(DIBUJO_IZQUIERDA))
      this._ladoDerecho = h('button', { type: 'button', class: 'flecha-lado derecha', tabindex: '-1', alPulsar: () => this.adelante() }, dibujo(DIBUJO_DERECHA))
      this._hoja = h('main', { class: 'hoja', part: 'hoja', tabindex: '-1' }, this._ventana, this._pie, this._ladoIzquierdo, this._ladoDerecho)

      this._bAtras = h('button', { type: 'button', class: 'icono', alPulsar: () => this.atras() }, dibujo(DIBUJO_IZQUIERDA))
      this._donde = h('span', { class: 'donde' })
      this._bAdelante = h('button', { type: 'button', class: 'icono', alPulsar: () => this.adelante() }, dibujo(DIBUJO_DERECHA))
      this._paginador = h('nav', { class: 'paginador', part: 'paginador' }, this._bAtras, this._donde, this._bAdelante)

      this._listaIndice = h('ol', { class: 'lista-indice' })
      this._tituloIndice = h('h2', null)
      this._cerrarIndice = h('button', { type: 'button', class: 'icono', alPulsar: () => this._cerrar() }, dibujo(DIBUJO_CERRAR))
      this._panelIndice = h('dialog', { class: 'panel indice', part: 'panel' }, h('div', { class: 'panel-cabeza' }, this._tituloIndice, this._cerrarIndice), this._listaIndice)

      this._tituloAjustes = h('h2', null)
      this._cerrarAjustes = h('button', { type: 'button', class: 'icono', alPulsar: () => this._cerrar() }, dibujo(DIBUJO_CERRAR))
      this._cuerpoAjustes = h('div', null)
      this._panelAjustes = h('dialog', { class: 'panel ajustes', part: 'panel' }, h('div', { class: 'panel-cabeza' }, this._tituloAjustes, this._cerrarAjustes), this._cuerpoAjustes)

      // Un clic fuera del panel (en el velo) lo cierra: el velo es el propio <dialog>.
      for (const panel of [this._panelIndice, this._panelAjustes]) {
        panel.addEventListener('click', (e) => {
          if (e.target === panel) this._cerrar()
        })
      }

      this._escucharGestos()

      this._lector = h('div', { class: 'lector', part: 'lector' }, this._barra, this._hoja, this._paginador, this._panelIndice, this._panelAjustes)
      const hoja = hojaDeEstilo()
      if (hoja && 'adoptedStyleSheets' in this._sombra) {
        this._sombra.adoptedStyleSheets = [hoja]
        this._sombra.append(this._enlaceCss, this._lector)
      } else {
        this._sombra.append(h('style', null, ESTILO), this._enlaceCss, this._lector)
      }
    }

    _abrir(panel) {
      if (typeof panel.showModal === 'function') panel.showModal()
      else panel.setAttribute('open', '')
    }

    _abrirAjustes() {
      // Cada nombre de letra se escribe en su letra: se trae su cara normal.
      if (this._libro) for (const l of this._letras()) registrarCaras(l, this._base, true).forEach((f) => f.load().catch(() => {}))
      this._abrir(this._panelAjustes)
    }

    _cerrar() {
      for (const panel of [this._panelIndice, this._panelAjustes]) {
        if (typeof panel.close === 'function' && panel.open) panel.close()
        else panel.removeAttribute('open')
      }
    }

    // -- cargar el libro -----------------------------------------------------

    async _cargar() {
      const turno = ++this._turnoLibro
      this._turnoParte++
      this._libro = null
      this._cache.clear()
      this._barra.hidden = true
      this._pie.hidden = true
      const src = this.getAttribute('src')
      if (!src) {
        this._contenido.replaceChildren()
        return
      }
      this._base = new URL(src, document.baseURI).href
      this._contenido.replaceChildren(h('p', { class: 'estado' }, '…'))
      try {
        // Si el script del lector va en el <head> sin `defer`, este elemento
        // se estrena antes de que el navegador haya leido lo que lleva dentro.
        if (document.readyState === 'loading') await new Promise((listo) => document.addEventListener('DOMContentLoaded', listo, { once: true }))
        if (turno !== this._turnoLibro) return
        // index.html trae el manifiesto dentro, para abrirse sin servidor.
        const dentro = Array.from(this.children).find((x) => x.localName === 'script' && x.getAttribute('type') === 'application/json')
        let libro
        if (dentro) libro = JSON.parse(dentro.textContent || '')
        else {
          const r = await fetch(this._base)
          if (!r.ok) throw new Error(String(r.status))
          libro = await r.json()
        }
        if (turno !== this._turnoLibro) return
        if (!libro || libro.formato !== 'pubteca-web' || !Array.isArray(libro.partes)) throw new Error('formato')
        this._libro = libro
      } catch {
        if (turno !== this._turnoLibro) return
        // Sin libro no hay textos en su idioma: el mensaje va en dos.
        this._contenido.replaceChildren(
          h(
            'p',
            { class: 'estado' },
            'No se pudo cargar el libro · The book could not be loaded',
            h('br', null),
            h('button', { type: 'button', class: 'boton', alPulsar: () => this._cargar() }, '↻'),
          ),
        )
        return
      }
      this._alTenerLibro()
    }

    _alTenerLibro() {
      const l = this._libro
      this._t = l.textos || {}
      this._orden = [INICIO, ...l.partes.map((p) => p.id)]
      if (l.idioma) this._lector.setAttribute('lang', l.idioma)
      if (l.estilo) this._enlaceCss.setAttribute('href', new URL(l.estilo, this._base).href)
      this._guardado = this._leerPosicion()
      this._rotular()
      this._pintarIndice()
      this._pintarAjustes()
      this._barra.hidden = false

      const pedida = this.getAttribute('parte')
      const inicial = this._idDeLaDireccion() || (pedida && this._orden.includes(pedida) ? pedida : INICIO)
      this.dispatchEvent(new CustomEvent('pubteca-listo', { bubbles: true, composed: true, detail: { libro: l } }))
      this._mostrar(inicial, { historial: false, desplazar: false })
    }

    _rotular() {
      const t = this._t
      const rotulo = (boton, texto) => {
        boton.setAttribute('aria-label', texto || '')
        boton.title = texto || ''
      }
      rotulo(this._bIndice, t.indice)
      rotulo(this._bAjustes, t.ajustes)
      rotulo(this._bAtras, t.paginaAnterior || t.anterior)
      rotulo(this._bAdelante, t.paginaSiguiente || t.siguiente)
      rotulo(this._ladoIzquierdo, t.paginaAnterior || t.anterior)
      rotulo(this._ladoDerecho, t.paginaSiguiente || t.siguiente)
      this._bTitulo.textContent = this._libro.titulo || ''
      this._tituloIndice.textContent = t.indice || ''
      this._tituloAjustes.textContent = t.ajustes || ''
      this._cerrarIndice.setAttribute('aria-label', t.cerrar || '')
      this._cerrarAjustes.setAttribute('aria-label', t.cerrar || '')
      this._hoja.setAttribute('aria-label', this._libro.titulo || '')
    }

    /** Un enlace a una parte. Es un enlace de verdad (se puede copiar, abrir en otra pestaña), que el lector atiende sin recargar. */
    _enlace(id, texto) {
      return h(
        'a',
        {
          href: `#${encodeURIComponent(id)}`,
          'data-parte': id,
          alPulsar: (e) => {
            if (clicConTecla(e)) return
            e.preventDefault()
            this._cerrar()
            this._mostrar(id)
          },
        },
        texto,
      )
    }

    _enIndice() {
      return this._libro.partes.filter((p) => p.indice)
    }

    _pintarIndice() {
      this._listaIndice.replaceChildren(
        h('li', null, this._enlace(INICIO, this._t.portada || this._libro.titulo)),
        ...this._enIndice().map((p) => h('li', null, this._enlace(p.id, p.titulo))),
      )
    }

    _pintarAjustes() {
      const t = this._t
      const opcion = (grupo, valor, texto, atributos) =>
        h('button', { type: 'button', class: 'opcion', 'data-grupo': grupo, 'data-valor': valor, alPulsar: () => this._elegir(grupo, valor), ...atributos }, texto)
      const grupo = (titulo, clase, ...opciones) => h('fieldset', null, h('legend', null, titulo || ''), h('div', { class: `opciones${clase ? ` ${clase}` : ''}` }, opciones))
      const temas = { auto: t.temaAuto, claro: t.temaClaro, sepia: t.temaSepia, oscuro: t.temaOscuro }
      const letras = this._letras().map((l) => {
        const b = opcion('letra', l.id, l.nombre)
        // Por CSSOM y no con un atributo `style`: lo deja pasar una CSP estricta.
        b.style.fontFamily = l.pila
        return b
      })
      this._cuerpoAjustes.replaceChildren(
        grupo(t.modo, '', opcion('modo', 'desplazar', t.desplazar || '↕'), opcion('modo', 'paginas', t.paginas || '↔')),
        grupo(t.tema, '', TEMAS.map((x) => opcion('tema', x, temas[x] || x))),
        grupo(t.tamano, '', opcion('escala', 'menor', 'A−', { 'aria-label': t.menor || '' }), opcion('escala', 'mayor', 'A+', { 'aria-label': t.mayor || '' })),
        grupo(t.letra, 'de-letra', letras),
        grupo(t.interlineado, 'de-tres', Object.keys(INTERLINEADOS).map((x) => opcion('interlineado', x, t[x] || x))),
        grupo(t.alineacion, '', opcion('alineacion', 'izquierda', t.izquierda || '≡'), opcion('alineacion', 'justificado', t.justificado || '☰')),
      )
      this._aplicarAjustes()
    }

    // -- las letras -----------------------------------------------------------

    /**
     * Las letras que se pueden elegir: la del sitio si pone `--pubteca-fuente`
     * (con su nombre), y las del libro. Un `libro.json` sin `letras` (de antes)
     * ofrece una serif del sistema.
     */
    _letras() {
      const del = (l) => ({ ...l, pila: l.familia ? `"${l.familia}", ${l.respaldo || 'serif'}` : l.respaldo || RESPALDO_SERIF })
      const delLibro = this._libro && Array.isArray(this._libro.letras) ? this._libro.letras.filter((l) => l && typeof l.id === 'string' && typeof l.nombre === 'string').map(del) : []
      const letras = delLibro.length > 0 ? delLibro : [del({ id: 'serif', nombre: 'Serif', familia: null, respaldo: RESPALDO_SERIF, caras: [] })]
      let sitio = ''
      try {
        sitio = getComputedStyle(this).getPropertyValue('--pubteca-fuente').trim()
      } catch {
        // Sin estilos calculados no hay letra del sitio.
      }
      const nombre = sitio && primerNombre(sitio)
      return nombre ? [{ id: LETRA_SITIO, nombre, familia: null, caras: [], pila: sitio }, ...letras] : letras
    }

    /** La letra que se pinta: la de quien lee; si no, la del atributo, la del sitio, la del libro o la primera. */
    _letra() {
      const letras = this._letras()
      const ids = letras.map((l) => l.id)
      const pedidas = [this._ajustes.letra, this.getAttribute('letra'), ids.includes(LETRA_SITIO) ? LETRA_SITIO : null, this._libro && this._libro.lectura && this._libro.lectura.letra]
      const id = pedidas.find((x) => x && ids.includes(x)) || ids[0]
      return letras.find((l) => l.id === id) || null
    }

    // -- los ajustes de quien lee ---------------------------------------------

    _memoria() {
      if (this.hasAttribute('sin-memoria')) return null
      try {
        return window.localStorage
      } catch {
        return null
      }
    }

    _leerAjustes() {
      try {
        const g = JSON.parse((this._memoria() && this._memoria().getItem(CLAVE_AJUSTES)) || 'null')
        if (!g || typeof g !== 'object') return
        const a = this._ajustes
        if (TEMAS.includes(g.tema)) a.tema = g.tema
        if (Number.isInteger(g.escala) && g.escala >= 0 && g.escala < ESCALAS.length) a.escala = g.escala
        if (typeof g.letra === 'string' && g.letra) a.letra = g.letra
        if (MODOS.includes(g.modo)) a.modo = g.modo
        if (Object.prototype.hasOwnProperty.call(INTERLINEADOS, g.interlineado)) a.interlineado = g.interlineado
        if (ALINEACIONES.includes(g.alineacion)) a.alineacion = g.alineacion
      } catch {
        // Unos ajustes que no se leen son los de fabrica.
      }
    }

    _elegir(grupo, valor) {
      const a = this._ajustes
      if (grupo === 'escala') a.escala = Math.min(ESCALAS.length - 1, Math.max(0, a.escala + (valor === 'mayor' ? 1 : -1)))
      else a[grupo] = valor
      try {
        const m = this._memoria()
        if (m) m.setItem(CLAVE_AJUSTES, JSON.stringify(a))
      } catch {
        // Sin sitio donde guardar, el ajuste vale para esta visita.
      }
      // Desplazando, cambiar la letra mueve el texto: se vuelve al mismo punto
      // de la parte. Pasando paginas, eso lo hace la maqueta.
      const y = this._modoActual === 'desplazar' && grupo !== 'tema' && grupo !== 'modo' ? this._fraccion() : null
      this._aplicarAjustes()
      if (y !== null && this._actual !== INICIO) this._irAFraccion(y)
    }

    /** El tema elegido: el de quien lee, si eligio; si no, el del atributo; si no, el del sistema. */
    _tema() {
      const delSitio = this.getAttribute('tema')
      return this._ajustes.tema || (TEMAS.includes(delSitio) ? delSitio : 'auto')
    }

    /** El modo: el de quien lee; si no, el del atributo; si no, el del libro; si no, desplazar. */
    _modo() {
      const delSitio = this.getAttribute('modo')
      const delLibro = this._libro && this._libro.lectura && this._libro.lectura.modo
      return this._ajustes.modo || (MODOS.includes(delSitio) ? delSitio : MODOS.includes(delLibro) ? delLibro : 'desplazar')
    }

    _aplicarAjustes() {
      if (!this._montado) return
      const elegido = this._tema()
      const real = elegido === 'auto' ? (this._esquema && this._esquema.matches ? 'oscuro' : 'claro') : elegido
      const letra = this._libro ? this._letra() : null
      const modo = this._modo()
      // Lo que se iba leyendo, medido ANTES de cambiar de modo.
      const y = modo !== this._modoActual ? this._fraccion() : null

      const l = this._lector
      l.setAttribute('data-tema', real)
      l.setAttribute('data-modo', modo)
      l.setAttribute('data-alinear', this._ajustes.alineacion)
      l.style.setProperty('--_escala', String(ESCALAS[this._ajustes.escala]))
      const interlineado = INTERLINEADOS[this._ajustes.interlineado]
      if (interlineado) l.style.setProperty('--_interlineado', interlineado)
      else l.style.removeProperty('--_interlineado')
      if (letra) {
        l.style.setProperty('--_letra', letra.pila)
        Promise.all(registrarCaras(letra, this._base, false).map((f) => f.load()))
          .then(() => this._programarMaqueta())
          .catch(() => {})
      }

      const pulsado = { tema: elegido, modo, letra: letra && letra.id, interlineado: this._ajustes.interlineado, alineacion: this._ajustes.alineacion }
      for (const b of this._cuerpoAjustes.querySelectorAll('.opcion')) {
        const grupo = b.getAttribute('data-grupo')
        const valor = b.getAttribute('data-valor')
        if (grupo === 'escala') b.disabled = valor === 'mayor' ? this._ajustes.escala >= ESCALAS.length - 1 : this._ajustes.escala <= 0
        else b.setAttribute('aria-pressed', String(valor === pulsado[grupo]))
      }
      // A pagina completa, lo que asoma alrededor (al rebotar en un movil, la
      // barra del navegador) va del color del tema.
      if (this.hasAttribute('pagina')) {
        const fondo = getComputedStyle(l).backgroundColor
        if (fondo) document.documentElement.style.backgroundColor = fondo
        document.documentElement.style.colorScheme = real === 'oscuro' ? 'dark' : 'light'
      }

      if (y !== null) this._entrarEnModo(modo, y)
      else this._programarMaqueta()
    }

    // -- pasar paginas ----------------------------------------------------------

    /** Cambia de modo sin perder por donde se iba. */
    _entrarEnModo(modo, y) {
      this._modoActual = modo
      if (modo === 'paginas') {
        if (this.hasAttribute('pagina')) window.scrollTo(0, 0)
        this._maquetar(false)
        this._irAPagina(Math.floor(y * this._paginas), false)
      } else {
        this._contenido.classList.remove('animar')
        for (const p of ['transform', 'column-width']) this._contenido.style.removeProperty(p)
        this._ventana.style.removeProperty('width')
        this._pagina = 0
        this._paginas = 1
        if (this._actual !== INICIO) {
          if (typeof this.scrollIntoView === 'function') this.scrollIntoView({ block: 'start' })
          this._irAFraccion(y)
        }
        this._medir()
      }
      this._alDia()
    }

    /** Una maqueta en el siguiente fotograma: muchos cambios seguidos, una sola. */
    _programarMaqueta() {
      if (this._modoActual !== 'paginas' || this._maquetaPendiente) return
      this._maquetaPendiente = true
      requestAnimationFrame(() => {
        this._maquetaPendiente = false
        if (this._modoActual === 'paginas') this._maquetar(true)
      })
    }

    /**
     * Mide la ventana y cuenta las paginas. Con `conservar`, se queda en el
     * mismo punto de la parte (al girar el telefono, al cambiar la letra).
     */
    _maquetar(conservar) {
      if (this._modoActual !== 'paginas') return
      const fraccion = this._paginas > 0 ? this._pagina / this._paginas : 0
      const v = this._ventana
      v.style.removeProperty('width')
      const r = v.getBoundingClientRect()
      // Pixeles enteros: con decimales, cien paginas mas alla asomaria un filo de la siguiente.
      const ancho = Math.floor(r.width)
      const alto = Math.floor(r.height)
      if (ancho <= 0 || alto <= 0) return
      v.style.width = `${ancho}px`
      this._ancho = ancho
      this._contenido.style.columnWidth = `${ancho}px`
      this._lector.style.setProperty('--_alto', `${alto}px`)
      this._paginas = Math.max(1, Math.round((this._contenido.scrollWidth + HUECO) / (ancho + HUECO)))
      this._irAPagina(conservar ? Math.floor(fraccion * this._paginas + 1e-6) : this._pagina, false, conservar)
    }

    _hayAtras() {
      return this._pagina > 0 || this._orden.indexOf(this._actual) > 0
    }

    _hayAdelante() {
      return this._pagina < this._paginas - 1 || this._orden.indexOf(this._actual) < this._orden.length - 1
    }

    _desplazamiento(pagina) {
      return -pagina * (this._ancho + HUECO)
    }

    _irAPagina(n, animar, guardar = true) {
      if (this._modoActual !== 'paginas') return
      const pagina = Math.max(0, Math.min(this._paginas - 1, n))
      const cambia = pagina !== this._pagina
      this._pagina = pagina
      this._contenido.classList.toggle('animar', Boolean(animar))
      this._contenido.style.transform = `translate3d(${this._desplazamiento(pagina)}px, 0, 0)`
      this._alDiaPaginas()
      if (guardar && this._actual !== INICIO) {
        this._guardado = { parte: this._actual, y: pagina / this._paginas }
        if (!this._reloj) this._reloj = setTimeout(() => this._escribirPosicion(), 600)
      }
      // Solo cuando cambia algo: maquetar otra vez la misma pagina no es pasar pagina.
      const clave = `${this._actual}|${pagina}|${this._paginas}`
      if (cambia || clave !== this._ultimaPagina) {
        this._ultimaPagina = clave
        this.dispatchEvent(new CustomEvent('pubteca-pagina', { bubbles: true, composed: true, detail: { parte: this._actual, pagina: pagina + 1, paginas: this._paginas } }))
      }
    }

    _alDiaPaginas() {
      const parte = this._parte(this._actual)
      const titulo = parte ? parte.titulo : this._libro ? this._libro.titulo : ''
      this._donde.textContent = `${titulo} · ${this._pagina + 1} / ${this._paginas}`
      const atras = !this._hayAtras()
      const adelante = !this._hayAdelante()
      this._bAtras.disabled = atras
      this._ladoIzquierdo.disabled = atras
      this._bAdelante.disabled = adelante
      this._ladoDerecho.disabled = adelante
      if (this._modoActual === 'paginas') this._progreso.style.transform = `scaleX(${(this._pagina + 1) / this._paginas})`
    }

    /** Los dedos, el raton y la rueda sobre la hoja. Solo hacen algo en modo paginas. */
    _escucharGestos() {
      const hoja = this._hoja
      hoja.addEventListener('pointerdown', (e) => {
        if (this._modoActual !== 'paginas' || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
        const origen = e.composedPath()[0]
        if (origen && origen.closest && origen.closest(INTERACTIVO)) return
        this._gesto = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, tipo: e.pointerType, arrastre: false }
      })
      hoja.addEventListener('pointermove', (e) => {
        const g = this._gesto
        if (!g || e.pointerId !== g.id) return
        const dx = e.clientX - g.x
        const dy = e.clientY - g.y
        if (!g.arrastre) {
          // Con el raton, arrastrar es seleccionar texto: no pasa pagina.
          if (g.tipo === 'mouse') return
          if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
            g.arrastre = true
            this._contenido.classList.remove('animar')
            try {
              hoja.setPointerCapture(e.pointerId)
            } catch {
              // Sin captura, el gesto sigue mientras el dedo este encima.
            }
          } else if (Math.abs(dy) > 10) {
            this._gesto = null
            return
          } else return
        }
        // La pagina sigue al dedo; en el principio o el final del libro, con resistencia.
        const tope = (dx > 0 && !this._hayAtras()) || (dx < 0 && !this._hayAdelante())
        this._contenido.style.transform = `translate3d(${this._desplazamiento(this._pagina) + (tope ? dx / 3 : dx)}px, 0, 0)`
      })
      const soltar = (e, cancelado) => {
        const g = this._gesto
        if (!g || e.pointerId !== g.id) return
        this._gesto = null
        const dx = e.clientX - g.x
        const dy = e.clientY - g.y
        if (g.arrastre) {
          this._tragarClic = true
          setTimeout(() => {
            this._tragarClic = false
          }, 0)
          const rapido = Math.abs(dx) / Math.max(1, e.timeStamp - g.t) > 0.35 && Math.abs(dx) > 20
          if (!cancelado && (Math.abs(dx) > Math.min(80, this._ancho * 0.18) || rapido)) {
            if (dx < 0 && this._hayAdelante()) {
              if (this._pagina >= this._paginas - 1) this._irAPagina(this._pagina, false)
              return this.adelante()
            }
            if (dx > 0 && this._hayAtras()) {
              if (this._pagina === 0) this._irAPagina(this._pagina, false)
              return this.atras()
            }
          }
          return this._irAPagina(this._pagina, true)
        }
        if (cancelado || Math.abs(dx) > 10 || Math.abs(dy) > 10 || e.timeStamp - g.t > 500) return
        const seleccion = (this._sombra.getSelection && this._sombra.getSelection()) || document.getSelection()
        if (seleccion && !seleccion.isCollapsed) return
        if (g.tipo === 'mouse') {
          // Con el raton, solo en los margenes: dentro del texto, un clic es para seleccionar.
          const v = this._ventana.getBoundingClientRect()
          if (e.clientX < v.left) this.atras()
          else if (e.clientX > v.right) this.adelante()
          return
        }
        // Con el dedo, como en un lector de libros: un toque a la izquierda o a la derecha.
        const r = hoja.getBoundingClientRect()
        const x = (e.clientX - r.left) / r.width
        if (x < 0.3) this.atras()
        else if (x > 0.7) this.adelante()
      }
      hoja.addEventListener('pointerup', (e) => soltar(e, false))
      hoja.addEventListener('pointercancel', (e) => soltar(e, true))
      // El clic que sigue a un arrastre no es un clic: no abre el enlace sobre el que acabo.
      hoja.addEventListener(
        'click',
        (e) => {
          if (!this._tragarClic) return
          this._tragarClic = false
          e.preventDefault()
          e.stopPropagation()
        },
        true,
      )
      // El trackpad: deslizar en horizontal pasa pagina. A pagina completa, la rueda tambien.
      //
      // UN GESTO, UNA PAGINA, por fuerte que sea. Al soltar los dedos, el
      // sistema sigue mandando eventos que se van frenando (la inercia) durante
      // mas de un segundo, y cuanto mas fuerte el gesto, mas dura. Contarlos
      // como gestos nuevos pasaba varias paginas de un solo deslizamiento. Asi
      // que toda la racha es un gesto, y un gesto nuevo empieza tras una pausa
      // o cuando los dedos vuelven a acelerar en medio de la inercia (la
      // inercia solo frena): dos deslizamientos seguidos pasan dos paginas.
      hoja.addEventListener(
        'wheel',
        (e) => {
          if (this._modoActual !== 'paginas' || e.ctrlKey) return
          const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
          if (!horizontal && !this.hasAttribute('pagina')) return
          e.preventDefault()
          const delta = horizontal ? e.deltaX : e.deltaY
          const fuerza = Math.abs(delta)
          const r = this._rueda
          // Acelerar solo cuenta despues de haber frenado: mientras los dedos
          // aun empujan, justo tras pasar la pagina, la fuerza tambien sube.
          if (e.timeStamp - r.ultimo > PAUSA_GESTO || (r.usado && r.frenando && acelera(r.fuerzas, fuerza))) {
            r.acumulado = 0
            r.usado = false
            r.frenando = false
            r.fuerzas = []
          }
          if (r.usado && r.fuerzas.length > 0 && fuerza < (r.fuerzas.at(-1) ?? 0)) r.frenando = true
          r.ultimo = e.timeStamp
          r.fuerzas.push(fuerza)
          if (r.fuerzas.length > 4) r.fuerzas.shift()
          if (r.usado) return
          r.acumulado += delta
          if (Math.abs(r.acumulado) < UMBRAL_GESTO) return
          r.usado = true
          if (r.acumulado > 0) this.adelante()
          else this.atras()
        },
        { passive: false },
      )
      // Si algo hace que la ventana se desplace (el tabulador sobre un enlace de
      // otra pagina, buscar en la pagina), se deshace y se va a esa pagina.
      this._ventana.addEventListener('scroll', () => {
        const v = this._ventana
        if (v.scrollLeft === 0 && v.scrollTop === 0) return
        const delta = Math.round(v.scrollLeft / (this._ancho + HUECO))
        v.scrollLeft = 0
        v.scrollTop = 0
        if (delta) this._irAPagina(this._pagina + delta, false)
      })
      this._contenido.addEventListener('focusin', (e) => {
        if (this._modoActual !== 'paginas') return
        requestAnimationFrame(() => {
          const objetivo = e.target
          if (!objetivo || !objetivo.getBoundingClientRect) return
          this._ventana.scrollLeft = 0
          const x = objetivo.getBoundingClientRect().left - this._ventana.getBoundingClientRect().left
          const delta = Math.floor(x / (this._ancho + HUECO))
          if (delta) this._irAPagina(this._pagina + delta, false)
        })
      })
      // Una imagen sin medidas cambia la maqueta al llegar.
      this._contenido.addEventListener('load', () => this._programarMaqueta(), true)
    }

    // -- por donde iba ---------------------------------------------------------

    _leerPosicion() {
      try {
        const m = this._memoria()
        const g = JSON.parse((m && m.getItem(CLAVE_LIBRO + this._libro.id)) || 'null')
        if (g && typeof g.parte === 'string' && this._orden.includes(g.parte) && g.parte !== INICIO) {
          return { parte: g.parte, y: typeof g.y === 'number' ? entre0y1(g.y) : 0 }
        }
      } catch {
        // Lo mismo que los ajustes.
      }
      return null
    }

    _escribirPosicion() {
      clearTimeout(this._reloj)
      this._reloj = 0
      if (!this._libro || !this._guardado) return
      try {
        const m = this._memoria()
        if (m) m.setItem(CLAVE_LIBRO + this._libro.id, JSON.stringify(this._guardado))
      } catch {
        // Sin sitio donde guardar, no se recuerda.
      }
    }

    /** Por donde va dentro de la parte, de 0 a 1: la pagina, o lo que queda ya por encima de la barra. */
    _fraccion() {
      if (this._modoActual === 'paginas') return this._paginas > 0 ? this._pagina / this._paginas : 0
      const r = this._contenido.getBoundingClientRect()
      return r.height > 0 ? entre0y1((this._barra.getBoundingClientRect().bottom - r.top) / r.height) : 0
    }

    _irAFraccion(y) {
      if (this._modoActual === 'paginas') return this._irAPagina(Math.floor(y * this._paginas), false)
      const r = this._contenido.getBoundingClientRect()
      const cuanto = r.top + y * r.height - this._barra.getBoundingClientRect().bottom
      if (Math.abs(cuanto) > 1) window.scrollBy(0, cuanto)
    }

    _medir() {
      if (!this._libro || !this.isConnected || this._modoActual === 'paginas') return
      const r = this._contenido.getBoundingClientRect()
      const alto = window.innerHeight || document.documentElement.clientHeight
      const leido = this._actual !== INICIO && r.height > 0 ? entre0y1((alto - r.top) / r.height) : 0
      this._progreso.style.transform = `scaleX(${leido})`
      if (this._actual === INICIO) return
      this._guardado = { parte: this._actual, y: this._fraccion() }
      if (!this._reloj) this._reloj = setTimeout(() => this._escribirPosicion(), 600)
    }

    // -- la direccion de la pagina --------------------------------------------

    /** La parte que pide la direccion (`#cap03`), o null si no pide ninguna de este libro. */
    _idDeLaDireccion() {
      if (this.hasAttribute('sin-hash')) return null
      let id = ''
      try {
        id = decodeURIComponent(window.location.hash.slice(1))
      } catch {
        return null
      }
      return id && this._orden.includes(id) ? id : null
    }

    _desdeLaDireccion() {
      if (!this._libro || this.hasAttribute('sin-hash')) return
      // Un ancla que no es de este libro (`#contacto`) es del sitio: no se toca nada.
      const id = window.location.hash.length > 1 ? this._idDeLaDireccion() : INICIO
      if (id && id !== this._actual) this._mostrar(id, { historial: false })
    }

    // -- mostrar una parte -------------------------------------------------------

    _parte(id) {
      return this._libro ? this._libro.partes.find((p) => p.id === id) || null : null
    }

    async _mostrar(id, opciones) {
      if (!this._libro) return
      const { historial = true, desplazar = true, y = 0 } = opciones || {}
      const destino = this._orden.includes(id) ? id : INICIO
      const turno = ++this._turnoParte
      this._escribirPosicion()
      this._actual = destino

      if (historial && !this.hasAttribute('sin-hash')) {
        const direccion = destino === INICIO ? window.location.pathname + window.location.search : `#${encodeURIComponent(destino)}`
        try {
          window.history.pushState(null, '', direccion)
        } catch {
          // Un documento sin historial (un srcdoc): se lee igual.
        }
      }
      this._alDia()

      if (destino === INICIO) {
        this._pintarInicio()
      } else {
        const parte = this._parte(destino)
        // «Cargando» solo si tarda: con la parte ya traida, no llega a verse.
        const espera = setTimeout(() => {
          if (turno === this._turnoParte) this._contenido.replaceChildren(h('p', { class: 'estado' }, this._t.cargando || '…'))
        }, 250)
        try {
          const nodos = await this._traer(parte)
          clearTimeout(espera)
          if (turno !== this._turnoParte) return
          this._contenido.replaceChildren(...nodos)
        } catch {
          clearTimeout(espera)
          if (turno !== this._turnoParte) return
          if (window.location.protocol === 'file:') this._enMarco(parte)
          else this._fallo(destino)
        }
        this._contenido.setAttribute('data-clase', parte.clase || '')
      }
      if (destino === INICIO) this._contenido.removeAttribute('data-clase')

      if (this._modoActual === 'paginas') {
        // Pasando paginas, las imagenes de la parte se traen ya: no estan en
        // pantalla hasta pasar la pagina, y el navegador las dejaria para luego.
        for (const img of this._contenido.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager'
        this._paginas = 1
        this._pagina = 0
        this._maquetar(false)
        this._irAPagina(Math.floor(y * this._paginas), false, false)
        if (desplazar) this._hoja.focus({ preventScroll: true })
      } else if (desplazar) {
        // Un navegador sin scrollIntoView (o un entorno de pruebas) se lee igual.
        if (typeof this.scrollIntoView === 'function') this.scrollIntoView({ block: 'start' })
        if (y > 0) this._irAFraccion(y)
        this._hoja.focus({ preventScroll: true })
      }
      if (destino !== INICIO) {
        this._guardado = { parte: destino, y: this._modoActual === 'paginas' ? this._pagina / this._paginas : y }
        this._escribirPosicion()
      }
      this._medir()
      this._adelantar(destino)
      const parte = this._parte(destino)
      this.dispatchEvent(
        new CustomEvent('pubteca-parte', {
          bubbles: true,
          composed: true,
          detail: { id: destino, titulo: parte ? parte.titulo : this._libro.titulo, posicion: this._orden.indexOf(destino), total: this._libro.partes.length },
        }),
      )
    }

    /** La barra, el pie y el indice, al dia con la parte abierta. */
    _alDia() {
      if (!this._libro) return
      const t = this._t
      const i = this._orden.indexOf(this._actual)
      const total = this._libro.partes.length
      const enInicio = this._actual === INICIO
      // Pasando paginas, por donde va lo dice el paginador de abajo.
      this._posicion.textContent = enInicio || this._modoActual === 'paginas' ? '' : `${i} / ${total}`
      this._pie.hidden = enInicio
      const paso = (boton, id, rotulo) => {
        boton.hidden = !id
        if (!id) return
        const parte = this._parte(id)
        boton.replaceChildren(h('small', null, rotulo || ''), h('span', null, parte ? parte.titulo : t.portada || this._libro.titulo))
      }
      paso(this._bAnterior, i > 0 ? this._orden[i - 1] : null, `← ${t.anterior || ''}`)
      paso(this._bSiguiente, i < this._orden.length - 1 ? this._orden[i + 1] : null, `${t.siguiente || ''} →`)
      for (const a of this._sombra.querySelectorAll('a[data-parte]')) {
        if (a.getAttribute('data-parte') === this._actual) a.setAttribute('aria-current', 'page')
        else a.removeAttribute('aria-current')
      }
      if (this.hasAttribute('pagina')) {
        const parte = this._parte(this._actual)
        document.title = parte ? `${parte.titulo} · ${this._libro.titulo}` : this._tituloDeLaPagina
      }
      this._alDiaPaginas()
    }

    _pintarInicio() {
      const l = this._libro
      const t = this._t
      const primera = l.partes[0] ? l.partes[0].id : null
      const g = this._guardado
      const empezado = g && this._orden.includes(g.parte) && (g.parte !== primera || g.y > 0.02)
      const hijos = []
      if (l.portada && l.portada.src) {
        hijos.push(
          h('img', {
            class: 'cubierta',
            part: 'cubierta',
            src: new URL(l.portada.src, this._base).href,
            width: l.portada.ancho || null,
            height: l.portada.alto || null,
            alt: `${t.portada || ''}: ${l.titulo || ''}`,
          }),
        )
      }
      hijos.push(h('h1', null, l.titulo || ''))
      if (l.subtitulo) hijos.push(h('p', { class: 'subtitulo' }, l.subtitulo))
      if (l.autor) hijos.push(h('p', { class: 'autor' }, l.autor))
      if (l.muestra) hijos.push(h('p', { class: 'insignia' }, t.muestra || ''))
      // El boton, antes de la descripcion: pasando paginas, tiene que caber en la primera.
      if (primera) {
        hijos.push(
          h(
            'div',
            { class: 'acciones' },
            empezado && h('button', { type: 'button', class: 'boton principal', alPulsar: () => this._mostrar(g.parte, { y: g.y }) }, t.continuar || ''),
            h('button', { type: 'button', class: empezado ? 'boton' : 'boton principal', alPulsar: () => this._mostrar(primera) }, t.empezar || ''),
          ),
        )
      }
      if (l.descripcion) hijos.push(h('p', { class: 'descripcion' }, l.descripcion))
      const enIndice = this._enIndice()
      if (enIndice.length > 1) {
        hijos.push(h('nav', { 'aria-label': t.indice || '' }, h('ol', { class: 'lista-indice' }, enIndice.map((p) => h('li', null, this._enlace(p.id, p.titulo))))))
      }
      this._contenido.replaceChildren(h('div', { class: 'inicio' }, hijos))
    }

    /** El HTML de una parte, ya como nodos de esta pagina. */
    async _traer(parte) {
      const url = new URL(parte.archivo, this._base).href
      let pedido = this._cache.get(parte.id)
      if (!pedido) {
        pedido = fetch(url).then((r) => {
          if (!r.ok) throw new Error(String(r.status))
          return r.text()
        })
        this._cache.set(parte.id, pedido)
        // Un fallo no se guarda: «Reintentar» tiene que volver a pedirla.
        pedido.catch(() => this._cache.delete(parte.id))
      }
      const doc = new DOMParser().parseFromString(await pedido, 'text/html')
      const raiz = doc.querySelector('main') || doc.body
      // Lo que llega se lee, no se ejecuta. Pubteca nunca escribe nada de esto,
      // pero las partes son archivos que cualquiera puede editar, y un
      // `onerror` se dispara al insertar la imagen en esta pagina.
      for (const s of raiz.querySelectorAll('script, iframe, object, embed')) s.remove()
      for (const el of raiz.querySelectorAll('*')) {
        for (const a of Array.from(el.attributes)) {
          if (/^on/iu.test(a.name) || (/^(href|src|xlink:href|action|formaction)$/iu.test(a.name) && /^\s*javascript:/iu.test(a.value))) el.removeAttribute(a.name)
        }
      }
      // Las rutas de la parte son relativas a SU archivo, y aqui se pinta en
      // otra pagina: se dejan completas.
      const completar = (selector, atributo) => {
        for (const el of raiz.querySelectorAll(selector)) {
          const v = el.getAttribute(atributo)
          if (!v || v.startsWith('#')) continue
          try {
            el.setAttribute(atributo, new URL(v, url).href)
          } catch {
            // Una direccion que no se entiende se queda como estaba.
          }
        }
      }
      completar('[src]', 'src')
      completar('[poster]', 'poster')
      completar('a[href]', 'href')
      return Array.from(raiz.childNodes).map((n) => document.importNode(n, true))
    }

    /** Trae ya la parte siguiente: al pasar de capitulo no se espera. */
    _adelantar(id) {
      const i = this._orden.indexOf(id)
      const siguiente = this._orden[i + 1]
      if (!siguiente || window.location.protocol === 'file:') return
      this._traer(this._parte(siguiente)).catch(() => {})
    }

    _fallo(id) {
      this._contenido.replaceChildren(
        h('p', { class: 'estado' }, this._t.error || '', h('br', null), h('button', { type: 'button', class: 'boton', alPulsar: () => this._mostrar(id, { historial: false }) }, this._t.reintentar || '↻')),
      )
    }

    /**
     * Sin servidor (index.html abierto con doble clic) el navegador no deja
     * pedir las partes, pero si enseñarlas: cada una es una pagina entera.
     */
    _enMarco(parte) {
      this._contenido.replaceChildren(
        h('p', { class: 'aviso' }, this._t.sinServidor || ''),
        h('iframe', { class: 'marco', src: new URL(parte.archivo, this._base).href, title: parte.titulo }),
      )
    }

    // -- el teclado --------------------------------------------------------------

    _tecla(e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      if (!this._libro || this._panelIndice.open || this._panelAjustes.open) return
      // Las teclas son del lector cuando el lector es la pagina, o cuando se esta en el.
      if (!this.hasAttribute('pagina') && !this.matches(':focus-within')) return
      const origen = e.composedPath ? e.composedPath()[0] : e.target
      if (origen && origen.closest && origen.closest('input, textarea, select, video, audio, [contenteditable]')) return
      // Sobre un boton, el espacio es pulsarlo.
      if (e.key === ' ' && origen && origen.closest && origen.closest('button, a')) return
      const paginas = this._modoActual === 'paginas'
      let accion = null
      if (e.key === 'ArrowRight' && !e.shiftKey) accion = 'adelante'
      else if (e.key === 'ArrowLeft' && !e.shiftKey) accion = 'atras'
      else if (paginas && e.key === 'PageDown') accion = 'adelante'
      else if (paginas && e.key === 'PageUp') accion = 'atras'
      else if (paginas && e.key === ' ') accion = e.shiftKey ? 'atras' : 'adelante'
      if (!accion) return
      e.preventDefault()
      this[accion]()
    }
  }

  customElements.define('pubteca-lector', PubtecaLector)
})()
