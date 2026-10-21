import { memo, useEffect, useLayoutEffect, useRef } from 'react'
import {
  enPrimeraLinea,
  enUltimaLinea,
  entrarEn,
  leer,
  longitudDe,
  pintar,
  ponerCursor,
  seleccionEn,
  vecino,
  xDelCursor,
} from '../editor-dom'
import type { Foco } from '../estado'
import type { Bloque, Tramo } from '../modelo'
import { bloquesDePegado } from '../pegar'
import { crearId } from '../ids'
import { canonicos, igualesTramos, longitud, sustituir } from '../tramos'
import { conMod } from './contexto'
import { focoPendiente } from './foco'

/**
 * Lo que el navegador NO puede hacer por su cuenta en un bloque: todo lo que
 * crearia formato que el libro no sabe representar. La cursiva y la negrita
 * si pasan (Cmd+I, Cmd+B y el menu B/I del iPad), y se leen del DOM despues.
 */
const PROHIBIDOS = new Set([
  'formatUnderline',
  'formatStrikeThrough',
  'formatSuperscript',
  'formatSubscript',
  'formatJustifyFull',
  'formatJustifyCenter',
  'formatJustifyRight',
  'formatJustifyLeft',
  'formatIndent',
  'formatOutdent',
  'formatSetBlockTextDirection',
  'formatSetInlineTextDirection',
  'formatBackColor',
  'formatFontColor',
  'formatFontName',
  'insertLink',
  'insertOrderedList',
  'insertUnorderedList',
  'insertHorizontalRule',
  'insertFromDrop',
])

const BORRAR_ATRAS = new Set(['deleteContentBackward', 'deleteWordBackward', 'deleteSoftLineBackward', 'deleteHardLineBackward'])
const BORRAR_ADELANTE = new Set(['deleteContentForward', 'deleteWordForward', 'deleteSoftLineForward', 'deleteHardLineForward'])

export interface PropsTexto {
  readonly tramos: readonly Tramo[]
  /** La clave con la que el reductor pide el foco para este elemento. */
  readonly objetivo: string
  readonly foco: Foco | null
  readonly etiqueta: string
  readonly marcador?: string
  readonly className?: string
  /** Una sola linea: el titulo. Pegar varios parrafos los junta. */
  readonly unaLinea?: boolean
  /** `formato`: el cambio es poner o quitar cursiva o negrita, no escribir. */
  readonly onCambio: (tramos: readonly Tramo[], formato?: boolean) => void
  readonly onIntro?: (offset: number) => void
  readonly onBorrarAlInicio?: () => void
  readonly onSuprimirAlFinal?: () => void
  readonly onPegar?: (inicio: number, fin: number, bloques: readonly Bloque[]) => void
  readonly onFoco?: () => void
  readonly onDeshacer: () => void
  readonly onRehacer: () => void
}

/**
 * Un bloque de texto editable: parrafo, subtitulo o titulo.
 *
 * React NO gestiona sus hijos. Mientras el autor escribe, el DOM es la verdad
 * y se lee en cada `input`; el modelo solo se pinta en el DOM cuando cambia
 * por fuera (deshacer, pegar, partir). Repintar mientras se escribe moveria el
 * cursor y rompería el acento que se escribe en dos pulsaciones.
 */
export const TextoEditable = memo(function TextoEditable(p: PropsTexto) {
  const ref = useRef<HTMLDivElement>(null)
  /** Lo que se despacho al reductor y aun no ha vuelto como props. */
  const cola = useRef<(readonly Tramo[])[]>([])
  /** Lo que hay pintado ahora mismo. */
  const pintado = useRef<readonly Tramo[] | null>(null)
  const componiendo = useRef(false)
  // Las ultimas props, para los manejadores nativos que se instalan una vez.
  const props = useRef(p)
  useLayoutEffect(() => {
    props.current = p
  })

  const marcarVacio = (el: HTMLElement): void => {
    el.dataset['vacio'] = longitudDe(el) === 0 ? 'true' : 'false'
  }

  // Pintar el modelo solo cuando viene de FUERA.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const i = cola.current.findIndex((t) => igualesTramos(t, p.tramos))
    if (i !== -1) {
      // Es algo que escribio el propio autor y acaba de volver: no se toca.
      cola.current.splice(0, i + 1)
      pintado.current = p.tramos
      return
    }
    if (pintado.current && igualesTramos(pintado.current, p.tramos)) return
    const enfocado = el.ownerDocument.activeElement === el
    const sel = enfocado ? seleccionEn(el) : null
    pintar(el, p.tramos)
    pintado.current = p.tramos
    cola.current = []
    marcarVacio(el)
    if (sel) ponerCursor(el, Math.min(sel.inicio, longitud(p.tramos)))
  }, [p.tramos])

  // Aplicar el foco que pida el reductor, una sola vez: al volver a un
  // capitulo no se puede repetir el foco viejo y saltar al titulo.
  useLayoutEffect(() => {
    const f = p.foco
    const el = ref.current
    if (!f || !el || f.objetivo !== p.objetivo || !focoPendiente(f)) return
    el.focus({ preventScroll: true })
    ponerCursor(el, f.posicion)
    el.scrollIntoView({ block: 'nearest' })
  }, [p.foco, p.objetivo])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const emitir = (formato = false): void => {
      const t = leer(el)
      marcarVacio(el)
      const ultimo = cola.current[cola.current.length - 1] ?? pintado.current
      if (ultimo && igualesTramos(ultimo, t)) return
      cola.current.push(t)
      props.current.onCambio(t, formato)
    }

    const antesDeEntrar = (ev: InputEvent): void => {
      const tipo = ev.inputType
      const q = props.current
      if (PROHIBIDOS.has(tipo)) {
        ev.preventDefault()
        return
      }
      if (tipo === 'historyUndo' || tipo === 'historyRedo') {
        ev.preventDefault()
        if (tipo === 'historyUndo') q.onDeshacer()
        else q.onRehacer()
        return
      }
      if (tipo === 'insertParagraph' || tipo === 'insertLineBreak') {
        ev.preventDefault()
        const s = seleccionEn(el)
        if (!s) return
        if (s.fin > s.inicio) {
          // Intro con texto seleccionado: primero se borra la seleccion.
          const t = sustituir(leer(el), s.inicio, s.fin, [])
          pintar(el, t)
          ponerCursor(el, s.inicio)
          emitir()
        }
        q.onIntro?.(s.inicio)
        return
      }
      if (BORRAR_ATRAS.has(tipo) && q.onBorrarAlInicio) {
        const s = seleccionEn(el)
        if (s && s.inicio === 0 && s.fin === 0) {
          ev.preventDefault()
          q.onBorrarAlInicio()
        }
        return
      }
      if (BORRAR_ADELANTE.has(tipo) && q.onSuprimirAlFinal) {
        const s = seleccionEn(el)
        const total = longitudDe(el)
        if (s && s.inicio === total && s.fin === total) {
          ev.preventDefault()
          q.onSuprimirAlFinal()
        }
      }
    }

    const alEntrar = (ev: Event): void => {
      if (componiendo.current || (ev as InputEvent).isComposing) return
      emitir((ev as InputEvent).inputType?.startsWith('format') ?? false)
    }
    const alComponer = (): void => {
      componiendo.current = true
    }
    const alTerminarDeComponer = (): void => {
      componiendo.current = false
      emitir()
    }

    const alPegar = (ev: ClipboardEvent): void => {
      ev.preventDefault()
      const datos = ev.clipboardData
      if (!datos) return
      const bloques = bloquesDePegado(datos.getData('text/html'), datos.getData('text/plain'), () => crearId('b'))
      if (bloques.length === 0) return
      const total = longitudDe(el)
      const s = seleccionEn(el) ?? { inicio: total, fin: total }
      const q = props.current
      if (q.unaLinea || !q.onPegar) {
        // En el titulo todo va a una linea: los parrafos se juntan con un espacio.
        const linea = bloques.flatMap((b, i) =>
          b.tipo === 'parrafo' ? [...(i > 0 ? [{ texto: ' ', marcas: [] }] : []), ...b.tramos] : [],
        )
        const pegado = canonicos(linea)
        const t = sustituir(leer(el), s.inicio, s.fin, pegado)
        pintar(el, t)
        ponerCursor(el, s.inicio + longitud(pegado))
        emitir()
        return
      }
      // El DOM puede ir por delante de lo despachado: se manda antes.
      emitir()
      q.onPegar(s.inicio, s.fin, bloques)
    }

    const alSoltar = (ev: DragEvent): void => {
      // Soltar texto dentro de un bloque lo moveria con su HTML. Las imagenes
      // las recoge el hueco de insercion, no el texto.
      if (ev.dataTransfer?.types.includes('Files')) return
      ev.preventDefault()
    }

    el.addEventListener('beforeinput', antesDeEntrar)
    el.addEventListener('input', alEntrar)
    el.addEventListener('compositionstart', alComponer)
    el.addEventListener('compositionend', alTerminarDeComponer)
    el.addEventListener('paste', alPegar)
    el.addEventListener('drop', alSoltar)
    return () => {
      el.removeEventListener('beforeinput', antesDeEntrar)
      el.removeEventListener('input', alEntrar)
      el.removeEventListener('compositionstart', alComponer)
      el.removeEventListener('compositionend', alTerminarDeComponer)
      el.removeEventListener('paste', alPegar)
      el.removeEventListener('drop', alSoltar)
    }
  }, [])

  const teclas = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const el = ref.current
    if (!el || e.nativeEvent.isComposing) return
    const q = props.current
    if (conMod(e) && !e.altKey) {
      const k = e.key.toLowerCase()
      if (k === 'z') {
        e.preventDefault()
        if (e.shiftKey) q.onRehacer()
        else q.onDeshacer()
        return
      }
      if (k === 'y' && !e.shiftKey) {
        e.preventDefault()
        q.onRehacer()
        return
      }
      if (k === 'b' || k === 'i') {
        // execCommand esta en desuso pero es lo unico que da el «estilo de
        // escritura» con el cursor quieto (Cmd+I y seguir escribiendo en
        // cursiva) sin pelearse con el teclado del iPad. El resultado se lee
        // del DOM como cualquier otra edicion.
        e.preventDefault()
        document.execCommand(k === 'b' ? 'bold' : 'italic')
        return
      }
      if (k === 'u') {
        e.preventDefault()
        return
      }
    }
    if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return
    const s = seleccionEn(el)
    // Las flechas solo saltan de bloque con el cursor quieto: con texto
    // seleccionado, el autor esta ampliando la seleccion.
    if (!s || s.inicio !== s.fin) return
    if (e.key === 'ArrowUp' && enPrimeraLinea(el)) {
      const destino = vecino(el, -1)
      if (destino) {
        e.preventDefault()
        entrarEn(destino, 'abajo', xDelCursor(el))
      }
    } else if (e.key === 'ArrowDown' && enUltimaLinea(el)) {
      const destino = vecino(el, 1)
      if (destino) {
        e.preventDefault()
        entrarEn(destino, 'arriba', xDelCursor(el))
      }
    } else if (e.key === 'ArrowLeft' && s.inicio === 0) {
      const destino = vecino(el, -1)
      if (destino) {
        e.preventDefault()
        entrarEn(destino, 'abajo', null)
        if (destino.isContentEditable) ponerCursor(destino, 'fin')
      }
    } else if (e.key === 'ArrowRight' && s.inicio === longitudDe(el)) {
      const destino = vecino(el, 1)
      if (destino) {
        e.preventDefault()
        entrarEn(destino, 'arriba', null)
        if (destino.isContentEditable) ponerCursor(destino, 'inicio')
      }
    }
  }

  return (
    <div
      ref={ref}
      className={`editable ${p.className ?? ''}`}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={!p.unaLinea}
      aria-label={p.etiqueta}
      data-marcador={p.marcador}
      data-navegable=""
      data-objetivo={p.objetivo}
      spellCheck
      onKeyDown={teclas}
      onFocus={p.onFoco}
    />
  )
})
