import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ui } from '../../i18n/es'
import { entrarEn, vecino } from '../editor-dom'
import { objetivoVerso, type Donde, type Foco } from '../estado'
import { crearId } from '../ids'
import type { Bloque, Imagen, Tramo } from '../modelo'
import { avisosDeImagen } from '../revision'
import {
  alternarMarcaVerso,
  borrarAlInicio,
  escribirVerso,
  intro,
  pegarLineas,
  versosVacios,
  type Estrofas,
} from '../versos'
import { conMod, MOD, useDespacho, useMedios } from './contexto'
import { elegirArchivos, esArrastreDeArchivos, imagenesDe } from './archivos'
import { focoPendiente } from './foco'
import { Menu } from './Menu'
import { TODO_PERMITIDO, type Permitidos } from './permitidos'
import { TextoEditable } from './TextoEditable'

const ahora = (): number => Date.now()

/** El foco solo le llega al bloque al que va: asi los demas no se repintan. */
function focoPara(foco: Foco | null, id: string): Foco | null {
  if (!foco) return null
  return foco.objetivo === id || foco.objetivo.startsWith(`verso:${id}:`) ? foco : null
}

// ---------------------------------------------------------------------------
// Parrafo y subtitulo
// ---------------------------------------------------------------------------

const BloqueTexto = memo(function BloqueTexto({
  donde,
  bloque,
  foco,
  primero,
}: {
  donde: Donde
  bloque: Extract<Bloque, { tipo: 'parrafo' | 'subtitulo' }>
  foco: Foco | null
  primero: boolean
}) {
  const despachar = useDespacho()
  const id = bloque.id
  const onCambio = useCallback(
    (tramos: readonly Tramo[], formato?: boolean) =>
      despachar({ tipo: 'texto', donde, bloque: id, tramos, ahora: ahora(), ...(formato ? { formato } : {}) }),
    [despachar, donde, id],
  )
  const onIntro = useCallback(
    (offset: number) => despachar({ tipo: 'partir', donde, bloque: id, offset, nuevoId: crearId('b') }),
    [despachar, donde, id],
  )
  const onBorrarAlInicio = useCallback(() => despachar({ tipo: 'unirConAnterior', donde, bloque: id }), [despachar, donde, id])
  const onSuprimirAlFinal = useCallback(() => despachar({ tipo: 'unirConSiguiente', donde, bloque: id }), [despachar, donde, id])
  const onPegar = useCallback(
    (inicio: number, fin: number, bloques: readonly Bloque[]) =>
      despachar({ tipo: 'pegar', donde, bloque: id, inicio, fin, bloques, nuevoId: crearId('b') }),
    [despachar, donde, id],
  )
  const onFoco = useCallback(() => despachar({ tipo: 'activarBloque', bloque: id }), [despachar, id])
  const onDeshacer = useCallback(() => despachar({ tipo: 'deshacer' }), [despachar])
  const onRehacer = useCallback(() => despachar({ tipo: 'rehacer' }), [despachar])

  return (
    <div className={`bloque bloque-${bloque.tipo}${primero ? ' primero' : ''}`} data-bloque={id}>
      <TextoEditable
        tramos={bloque.tramos}
        objetivo={id}
        foco={foco}
        etiqueta={bloque.tipo === 'subtitulo' ? ui.editor.tipos.subtitulo : ui.editor.tipos.parrafo}
        marcador={ui.editor.parrafo}
        className={bloque.tipo === 'subtitulo' ? 'texto-subtitulo' : 'texto-parrafo'}
        onCambio={onCambio}
        onIntro={onIntro}
        onBorrarAlInicio={onBorrarAlInicio}
        onSuprimirAlFinal={onSuprimirAlFinal}
        onPegar={onPegar}
        onFoco={onFoco}
        onDeshacer={onDeshacer}
        onRehacer={onRehacer}
      />
    </div>
  )
})

// ---------------------------------------------------------------------------
// Bloques que no son texto: se enfocan como una tarjeta
// ---------------------------------------------------------------------------

/** Aplica a un elemento no editable el foco que pida el reductor. */
function useFocoDeTarjeta(foco: Foco | null): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (foco && ref.current && focoPendiente(foco)) {
      ref.current.focus({ preventScroll: true })
      ref.current.scrollIntoView({ block: 'nearest' })
    }
  }, [foco])
  return ref
}

/** Flechas arriba y abajo en una tarjeta: al bloque de al lado. */
function navegarConFlechas(e: React.KeyboardEvent<HTMLElement>): boolean {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false
  const destino = vecino(e.currentTarget, e.key === 'ArrowUp' ? -1 : 1)
  if (!destino) return false
  e.preventDefault()
  entrarEn(destino, e.key === 'ArrowUp' ? 'abajo' : 'arriba', null)
  return true
}

const BloqueEscena = memo(function BloqueEscena({
  donde,
  bloque,
  foco,
  indice,
  separador,
}: {
  donde: Donde
  bloque: Bloque
  foco: Foco | null
  indice: number
  separador: string
}) {
  const despachar = useDespacho()
  const ref = useFocoDeTarjeta(foco)
  const teclas = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (navegarConFlechas(e)) return
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      despachar({ tipo: 'borrarBloque', donde, bloque: bloque.id })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      despachar({ tipo: 'insertar', donde, indice: indice + 1, bloque: { id: crearId('b'), tipo: 'parrafo', tramos: [] } })
    } else if (conMod(e) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      despachar({ tipo: e.shiftKey ? 'rehacer' : 'deshacer' })
    }
  }
  return (
    <div
      ref={ref}
      className="bloque bloque-escena"
      tabIndex={0}
      role="group"
      aria-label={`${ui.editor.escena}. ${ui.editor.escenaAyuda}`}
      data-navegable=""
      data-objetivo={bloque.id}
      data-bloque={bloque.id}
      onKeyDown={teclas}
      onFocus={() => despachar({ tipo: 'activarBloque', bloque: bloque.id })}
    >
      <span aria-hidden="true">{separador.trim() || '* * *'}</span>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Versos
// ---------------------------------------------------------------------------

/** Un textarea que crece con su contenido (field-sizing no existe en Safari 16). */
function useAltoAutomatico(valor: string): React.RefObject<HTMLTextAreaElement | null> {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [valor])
  return ref
}

function Verso({
  donde,
  bloque,
  estrofas,
  e,
  v,
  foco,
}: {
  donde: Donde
  bloque: string
  estrofas: Estrofas
  e: number
  v: number
  foco: Foco | null
}) {
  const despachar = useDespacho()
  const verso = estrofas[e]?.[v] as Tramo
  const ref = useAltoAutomatico(verso.texto)
  const objetivo = objetivoVerso(bloque, { estrofa: e, verso: v })

  useLayoutEffect(() => {
    const el = ref.current
    if (!foco || !el || foco.objetivo !== objetivo || !focoPendiente(foco)) return
    el.focus({ preventScroll: true })
    const n = foco.posicion === 'inicio' ? 0 : foco.posicion === 'fin' ? el.value.length : foco.posicion
    el.setSelectionRange(n, n)
    el.scrollIntoView({ block: 'nearest' })
  }, [foco, objetivo, ref])

  const cambiar = (nuevas: Tramo[][], pos?: { estrofa: number; verso: number; offset: number }): void => {
    despachar({ tipo: 'versos', donde, bloque, estrofas: nuevas, ...(pos ? { foco: pos } : {}), ahora: ahora() })
  }

  const teclas = (ev: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const el = ev.currentTarget
    if (ev.nativeEvent.isComposing) return
    const inicio = el.selectionStart
    const fin = el.selectionEnd
    if (conMod(ev) && !ev.altKey) {
      const k = ev.key.toLowerCase()
      if (k === 'i' || k === 'b') {
        ev.preventDefault()
        cambiar(alternarMarcaVerso(estrofas, e, v, k === 'i' ? 'cursiva' : 'negrita'), { estrofa: e, verso: v, offset: inicio })
        return
      }
      if (k === 'z') {
        ev.preventDefault()
        despachar({ tipo: ev.shiftKey ? 'rehacer' : 'deshacer' })
        return
      }
    }
    if (ev.key === 'Enter') {
      ev.preventDefault()
      const r = intro(estrofas, { estrofa: e, verso: v, offset: inicio })
      if ('salir' in r) despachar({ tipo: 'salirDeVersos', donde, bloque, estrofas: r.salir, nuevoId: crearId('b') })
      else cambiar(r.estrofas, r.foco)
      return
    }
    if (ev.key === 'Backspace' && inicio === 0 && fin === 0) {
      const r = borrarAlInicio(estrofas, { estrofa: e, verso: v, offset: 0 })
      ev.preventDefault()
      if (r) cambiar(r.estrofas, r.foco)
      else if (versosVacios(estrofas)) despachar({ tipo: 'borrarBloque', donde, bloque })
      else {
        const destino = vecino(el, -1)
        if (destino) entrarEn(destino, 'abajo', null)
      }
      return
    }
    if ((ev.key === 'ArrowUp' && inicio === 0) || (ev.key === 'ArrowDown' && fin === el.value.length)) {
      const destino = vecino(el, ev.key === 'ArrowUp' ? -1 : 1)
      if (destino) {
        ev.preventDefault()
        entrarEn(destino, ev.key === 'ArrowUp' ? 'abajo' : 'arriba', null)
      }
    }
  }

  const pegar = (ev: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const texto = ev.clipboardData.getData('text/plain')
    if (!/[\r\n]/u.test(texto)) return
    ev.preventDefault()
    const el = ev.currentTarget
    const r = pegarLineas(estrofas, { estrofa: e, verso: v, offset: el.selectionStart }, el.selectionEnd, texto.split(/\r\n|\r|\n/u))
    cambiar(r.estrofas, r.foco)
  }

  const clases = ['verso', verso.marcas.includes('cursiva') ? 'cursiva' : '', verso.marcas.includes('negrita') ? 'negrita' : '']
  return (
    <textarea
      ref={ref}
      rows={1}
      className={clases.join(' ')}
      value={verso.texto}
      aria-label={ui.editor.verso(e + 1, v + 1)}
      data-navegable=""
      data-objetivo={objetivo}
      spellCheck
      onChange={(ev) => cambiar(escribirVerso(estrofas, e, v, ev.target.value))}
      onKeyDown={teclas}
      onPaste={pegar}
      onFocus={() => despachar({ tipo: 'activarBloque', bloque })}
    />
  )
}

const BloqueVersos = memo(function BloqueVersos({
  donde,
  bloque,
  foco,
}: {
  donde: Donde
  bloque: Extract<Bloque, { tipo: 'versos' }>
  foco: Foco | null
}) {
  return (
    <div className="bloque bloque-versos" data-bloque={bloque.id}>
      {bloque.estrofas.map((estrofa, e) => (
        <div className="estrofa" key={e}>
          {estrofa.map((_, v) => (
            <Verso key={v} donde={donde} bloque={bloque.id} estrofas={bloque.estrofas} e={e} v={v} foco={foco} />
          ))}
        </div>
      ))}
      <p className="ayuda-bloque">{ui.editor.versosAyuda}</p>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Ilustracion
// ---------------------------------------------------------------------------

/** Los avisos de una imagen, en una linea cada uno, con icono Y palabra. */
export function AvisosDeImagen({ imagen, rol }: { imagen: Imagen; rol: 'ilustracion' | 'portada' | 'logo' }) {
  const grupos = avisosDeImagen(imagen, rol)
  if (grupos.length === 0) return null
  return (
    <ul className="avisos-imagen">
      {grupos.map((g) => (
        <li key={g.clave + g.mensajes[0]} className={`nivel-${g.nivel}`}>
          <span className="nivel-icono" aria-hidden="true">
            {ui.niveles[g.nivel].icono}
          </span>
          <span className="sr">{ui.niveles[g.nivel].palabra}: </span>
          {g.clave === 'otro' ? g.mensajes[0] : ui.grupos[g.clave].titulo}
        </li>
      ))}
    </ul>
  )
}

const BloqueIlustracion = memo(function BloqueIlustracion({
  donde,
  bloque,
  foco,
  indice,
  total,
}: {
  donde: Donde
  bloque: Extract<Bloque, { tipo: 'ilustracion' }>
  foco: Foco | null
  indice: number
  total: number
}) {
  const despachar = useDespacho()
  const { repo, imagenes, subir } = useMedios()
  const ref = useFocoDeTarjeta(foco)
  const imagen = imagenes.get(bloque.imagenId)
  const url = imagen ? repo?.url(bloque.imagenId) : undefined

  const cambiarImagen = async (): Promise<void> => {
    const archivos = await elegirArchivos('image/png,image/jpeg', false)
    const [nueva] = await subir(archivos)
    if (nueva) despachar({ tipo: 'ilustracion', donde, bloque: bloque.id, cambios: { imagenId: nueva.id }, ahora: ahora() })
  }

  const teclasTarjeta = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget) return
    if (navegarConFlechas(e)) return
    if (e.key === 'Enter') {
      e.preventDefault()
      despachar({ tipo: 'insertar', donde, indice: indice + 1, bloque: { id: crearId('b'), tipo: 'parrafo', tramos: [] } })
    }
  }

  const teclasAlt = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const el = e.currentTarget
    if ((e.key === 'ArrowUp' && el.selectionStart === 0) || (e.key === 'ArrowDown' && el.selectionEnd === el.value.length)) {
      const destino = vecino(ref.current ?? el, e.key === 'ArrowUp' ? -1 : 1)
      if (destino) {
        e.preventDefault()
        entrarEn(destino, e.key === 'ArrowUp' ? 'abajo' : 'arriba', null)
      }
    } else if (e.key === 'Enter') {
      // La descripcion es una linea: Intro sigue escribiendo debajo.
      e.preventDefault()
      despachar({ tipo: 'insertar', donde, indice: indice + 1, bloque: { id: crearId('b'), tipo: 'parrafo', tramos: [] } })
    }
  }
  const altRef = useAltoAutomatico(bloque.alt)

  return (
    <div
      ref={ref}
      className="bloque bloque-ilustracion"
      data-bloque={bloque.id}
      data-navegable=""
      data-objetivo={bloque.id}
      tabIndex={-1}
      draggable={donde.tipo === 'capitulo'}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/x-pubteca-bloque', bloque.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onKeyDown={teclasTarjeta}
      onFocus={() => despachar({ tipo: 'activarBloque', bloque: bloque.id })}
    >
      <p className="pagina-propia" aria-hidden="true">
        {ui.ilustracion.paginaPropia}
      </p>
      <div className="ilus-cuerpo">
        <div className="ilus-miniatura">
          {url ? (
            <img src={url} alt="" />
          ) : (
            <div className="ilus-falta">
              <p>{ui.ilustracion.falta(bloque.imagenId)}</p>
              <button type="button" onClick={() => void cambiarImagen()}>
                {ui.ilustracion.elegir}
              </button>
            </div>
          )}
        </div>
        <div className="ilus-campos">
          <label className="campo">
            <span>{ui.ilustracion.alt}</span>
            <textarea
              ref={altRef}
              rows={1}
              value={bloque.alt}
              disabled={bloque.decorativa}
              placeholder={bloque.decorativa ? '' : ui.ilustracion.altAyuda}
              onChange={(e) =>
                despachar({ tipo: 'ilustracion', donde, bloque: bloque.id, cambios: { alt: e.target.value }, ahora: ahora() })
              }
              onKeyDown={teclasAlt}
            />
          </label>
          <label className="casilla">
            <input
              type="checkbox"
              checked={bloque.decorativa}
              onChange={(e) =>
                despachar({
                  tipo: 'ilustracion',
                  donde,
                  bloque: bloque.id,
                  cambios: { decorativa: e.target.checked, ...(e.target.checked ? { alt: '' } : {}) },
                  ahora: ahora(),
                })
              }
            />
            {ui.ilustracion.decorativa}
          </label>
          {imagen && <AvisosDeImagen imagen={imagen} rol="ilustracion" />}
          {donde.tipo === 'capitulo' && <p className="ayuda-bloque">{ui.ilustracion.arrastrar}</p>}
        </div>
        <Menu
          etiqueta={ui.ilustracion.menu}
          opciones={[
            { etiqueta: url ? ui.ilustracion.cambiar : ui.ilustracion.elegir, accion: () => void cambiarImagen() },
            donde.tipo === 'capitulo' && {
              etiqueta: ui.ilustracion.abrirCapitulo,
              accion: () => despachar({ tipo: 'aApertura', capitulo: donde.id, bloque: bloque.id }),
            },
            { etiqueta: ui.ilustracion.subir, desactivada: indice === 0, accion: () => despachar({ tipo: 'moverBloque', donde, bloque: bloque.id, delta: -1 }) },
            {
              etiqueta: ui.ilustracion.bajar,
              desactivada: indice === total - 1,
              accion: () => despachar({ tipo: 'moverBloque', donde, bloque: bloque.id, delta: 1 }),
            },
            { etiqueta: ui.ilustracion.quitar, peligro: true, accion: () => despachar({ tipo: 'borrarBloque', donde, bloque: bloque.id }) },
          ]}
        />
      </div>
      <p className="pagina-propia" aria-hidden="true">
        {ui.ilustracion.paginaPropia}
      </p>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Huecos de insercion
// ---------------------------------------------------------------------------

type Insertable = 'parrafo' | 'subtitulo' | 'escena' | 'versos' | 'ilustracion'

function nuevoBloque(tipo: Exclude<Insertable, 'ilustracion'>): Bloque {
  const id = crearId('b')
  switch (tipo) {
    case 'parrafo':
    case 'subtitulo':
      return { id, tipo, tramos: [] }
    case 'escena':
      return { id, tipo: 'escena' }
    case 'versos':
      return { id, tipo: 'versos', estrofas: [[{ texto: '', marcas: [] }]] }
  }
}

function useInsertar(donde: Donde, indice: number): (tipo: Insertable, archivos?: readonly File[]) => Promise<void> {
  const despachar = useDespacho()
  const { subir } = useMedios()
  return async (tipo, archivos) => {
    if (tipo !== 'ilustracion') {
      despachar({ tipo: 'insertar', donde, indice, bloque: nuevoBloque(tipo) })
      return
    }
    const elegidos = archivos ?? (await elegirArchivos('image/png,image/jpeg', true))
    const subidas = await subir(elegidos)
    for (const [k, img] of subidas.entries()) {
      despachar({
        tipo: 'insertar',
        donde,
        indice: indice + k,
        bloque: { id: crearId('b'), tipo: 'ilustracion', imagenId: img.id, alt: '', decorativa: false },
      })
    }
  }
}

function opcionesDeInsertar(permitidos: Permitidos, insertar: (t: Insertable) => Promise<void>) {
  const t = ui.editor.insertables
  return [
    { etiqueta: t.parrafo, accion: () => void insertar('parrafo') },
    permitidos.subtitulo && { etiqueta: t.subtitulo, accion: () => void insertar('subtitulo') },
    permitidos.escena && { etiqueta: t.escena, accion: () => void insertar('escena') },
    permitidos.versos && { etiqueta: t.versos, accion: () => void insertar('versos') },
    permitidos.ilustracion && { etiqueta: t.ilustracion, accion: () => void insertar('ilustracion') },
  ]
}

/** Recibe imagenes soltadas encima: es el «arrastrar la imagen al hueco». */
function useSoltarImagenes(permitido: boolean, alSoltar: (archivos: File[]) => void) {
  const [encima, setEncima] = useState(false)
  if (!permitido) return { encima: false, props: {} }
  return {
    encima,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!esArrastreDeArchivos(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setEncima(true)
      },
      onDragLeave: () => setEncima(false),
      onDrop: (e: React.DragEvent) => {
        if (!esArrastreDeArchivos(e)) return
        e.preventDefault()
        setEncima(false)
        const archivos = imagenesDe(e.dataTransfer.files)
        if (archivos.length > 0) alSoltar(archivos)
      },
    },
  }
}

const Hueco = memo(function Hueco({ donde, indice, permitidos }: { donde: Donde; indice: number; permitidos: Permitidos }) {
  const insertar = useInsertar(donde, indice)
  const soltar = useSoltarImagenes(permitidos.ilustracion, (archivos) => void insertar('ilustracion', archivos))
  return (
    <div className={`hueco${soltar.encima ? ' encima' : ''}`} {...soltar.props}>
      <Menu className="hueco-menu" etiqueta={ui.editor.insertar} icono="+" opciones={opcionesDeInsertar(permitidos, insertar)} />
      {soltar.encima && <span className="hueco-soltar">{ui.editor.soltarImagen}</span>}
    </div>
  )
})

function AlFinal({ donde, indice, permitidos }: { donde: Donde; indice: number; permitidos: Permitidos }) {
  const insertar = useInsertar(donde, indice)
  const soltar = useSoltarImagenes(permitidos.ilustracion, (archivos) => void insertar('ilustracion', archivos))
  const t = ui.editor.insertables
  return (
    <div className={`al-final${soltar.encima ? ' encima' : ''}`} {...soltar.props}>
      <span>{ui.editor.insertarAlFinal}</span>
      <button type="button" onClick={() => void insertar('parrafo')}>{t.parrafo}</button>
      {permitidos.subtitulo && <button type="button" onClick={() => void insertar('subtitulo')}>{t.subtitulo}</button>}
      {permitidos.escena && <button type="button" onClick={() => void insertar('escena')}>{t.escena}</button>}
      {permitidos.versos && <button type="button" onClick={() => void insertar('versos')}>{t.versos}</button>}
      {permitidos.ilustracion && <button type="button" onClick={() => void insertar('ilustracion')}>{t.ilustracion}</button>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Barra de formato
// ---------------------------------------------------------------------------

/** Si el foco esta en un verso, cual: para aplicarle la cursiva entera. */
function versoEnfocado(): { bloque: string; estrofa: number; verso: number } | null {
  const el = document.activeElement as HTMLElement | null
  const o = el?.dataset['objetivo']
  const m = o ? /^verso:(.+):(\d+):(\d+)$/u.exec(o) : null
  return m ? { bloque: m[1] as string, estrofa: Number(m[2]), verso: Number(m[3]) } : null
}

export function BarraFormato({
  donde,
  bloques,
  activo,
  permitidos,
}: {
  donde: Donde
  bloques: readonly Bloque[]
  activo: string | null
  permitidos: Permitidos
}) {
  const despachar = useDespacho()
  const [estado, setEstado] = useState({ cursiva: false, negrita: false })
  const indice = bloques.findIndex((b) => b.id === activo)
  const bloque = bloques[indice]

  // El estado de los botones sigue a la seleccion, como en un procesador de texto.
  useEffect(() => {
    const leerEstado = (): void => {
      const el = document.activeElement as HTMLElement | null
      if (el?.isContentEditable) {
        setEstado({ cursiva: document.queryCommandState('italic'), negrita: document.queryCommandState('bold') })
      } else {
        const v = versoEnfocado()
        const b = v ? bloques.find((x) => x.id === v.bloque) : undefined
        const t = b?.tipo === 'versos' ? b.estrofas[v!.estrofa]?.[v!.verso] : undefined
        setEstado({ cursiva: Boolean(t?.marcas.includes('cursiva')), negrita: Boolean(t?.marcas.includes('negrita')) })
      }
    }
    document.addEventListener('selectionchange', leerEstado)
    leerEstado()
    return () => document.removeEventListener('selectionchange', leerEstado)
  }, [bloques])

  const marcar = (marca: 'cursiva' | 'negrita'): void => {
    const el = document.activeElement as HTMLElement | null
    if (el?.isContentEditable) {
      document.execCommand(marca === 'cursiva' ? 'italic' : 'bold')
      return
    }
    const v = versoEnfocado()
    const b = v ? bloques.find((x) => x.id === v.bloque) : undefined
    if (v && b?.tipo === 'versos') {
      despachar({
        tipo: 'versos',
        donde,
        bloque: b.id,
        estrofas: alternarMarcaVerso(b.estrofas, v.estrofa, v.verso, marca),
        foco: { estrofa: v.estrofa, verso: v.verso, offset: (el as HTMLTextAreaElement).selectionStart },
        ahora: ahora(),
      })
    }
  }

  // Que el clic en la barra no le quite el foco al texto: asi el boton de
  // cursiva actua sobre la seleccion, tambien en el iPad.
  const sinRobarFoco = (e: React.PointerEvent | React.MouseEvent): void => e.preventDefault()
  const deTexto = bloque?.tipo === 'parrafo' || bloque?.tipo === 'subtitulo' || bloque?.tipo === 'versos'
  const tipoActual = bloque?.tipo === 'parrafo' || bloque?.tipo === 'subtitulo' || bloque?.tipo === 'versos' ? bloque.tipo : ''

  return (
    <div className="barra-formato" role="toolbar" aria-label={ui.editor.tipo}>
      <select
        aria-label={ui.editor.tipo}
        value={tipoActual}
        disabled={!deTexto}
        onChange={(e) => {
          if (!bloque) return
          despachar({
            tipo: 'convertir',
            donde,
            bloque: bloque.id,
            a: e.target.value as 'parrafo' | 'subtitulo' | 'versos',
            ids: Array.from({ length: 64 }, () => crearId('b')),
          })
        }}
      >
        {!deTexto && <option value="">—</option>}
        <option value="parrafo">{ui.editor.tipos.parrafo}</option>
        {permitidos.subtitulo && <option value="subtitulo">{ui.editor.tipos.subtitulo}</option>}
        {permitidos.versos && <option value="versos">{ui.editor.tipos.versos}</option>}
      </select>
      <button
        type="button"
        className="boton-marca cursiva"
        aria-pressed={estado.cursiva}
        title={`${ui.editor.cursiva} (${MOD}+I)`}
        disabled={!deTexto}
        onPointerDown={sinRobarFoco}
        onMouseDown={sinRobarFoco}
        onClick={() => marcar('cursiva')}
      >
        <span aria-hidden="true">C</span>
        <span className="sr">{ui.editor.cursiva}</span>
      </button>
      <button
        type="button"
        className="boton-marca negrita"
        aria-pressed={estado.negrita}
        title={`${ui.editor.negrita} (${MOD}+B)`}
        disabled={!deTexto}
        onPointerDown={sinRobarFoco}
        onMouseDown={sinRobarFoco}
        onClick={() => marcar('negrita')}
      >
        <span aria-hidden="true">N</span>
        <span className="sr">{ui.editor.negrita}</span>
      </button>
      <span className="separador" />
      <button
        type="button"
        title={ui.editor.subirBloque}
        aria-label={ui.editor.subirBloque}
        disabled={!bloque || indice === 0}
        onPointerDown={sinRobarFoco}
        onClick={() => bloque && despachar({ tipo: 'moverBloque', donde, bloque: bloque.id, delta: -1 })}
      >
        ↑
      </button>
      <button
        type="button"
        title={ui.editor.bajarBloque}
        aria-label={ui.editor.bajarBloque}
        disabled={!bloque || indice === bloques.length - 1}
        onPointerDown={sinRobarFoco}
        onClick={() => bloque && despachar({ tipo: 'moverBloque', donde, bloque: bloque.id, delta: 1 })}
      >
        ↓
      </button>
      <button
        type="button"
        className="peligro"
        title={ui.editor.borrarBloque}
        aria-label={ui.editor.borrarBloque}
        disabled={!bloque}
        onClick={() => bloque && despachar({ tipo: 'borrarBloque', donde, bloque: bloque.id })}
      >
        ✕
      </button>
      <span className="atajos">{ui.editor.atajos(MOD)}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// La lista
// ---------------------------------------------------------------------------

export function EditorBloques({
  donde,
  bloques,
  foco,
  separador,
  permitidos = TODO_PERMITIDO,
}: {
  donde: Donde
  bloques: readonly Bloque[]
  foco: Foco | null
  separador: string
  permitidos?: Permitidos
}) {
  // El primer parrafo tras la cabecera, un cambio de escena, un subtitulo o
  // unos versos va sin sangria, igual que lo decide secuencia() en el motor.
  // Una ilustracion NO lo reinicia: el texto sigue el mismo hilo.
  const sinSangria = bloques.reduce<{ previo: boolean; marcas: boolean[] }>(
    (acc, b) => ({
      previo: b.tipo === 'parrafo' ? false : b.tipo === 'ilustracion' ? acc.previo : true,
      marcas: [...acc.marcas, b.tipo === 'parrafo' && acc.previo],
    }),
    { previo: true, marcas: [] },
  ).marcas
  return (
    <div className="bloques">
      {bloques.map((b, i) => (
        <div className="fila-bloque" key={b.id}>
          <Hueco donde={donde} indice={i} permitidos={permitidos} />
          {b.tipo === 'parrafo' || b.tipo === 'subtitulo' ? (
            <BloqueTexto donde={donde} bloque={b} foco={focoPara(foco, b.id)} primero={sinSangria[i] ?? false} />
          ) : b.tipo === 'escena' ? (
            <BloqueEscena donde={donde} bloque={b} foco={focoPara(foco, b.id)} indice={i} separador={separador} />
          ) : b.tipo === 'versos' ? (
            <BloqueVersos donde={donde} bloque={b} foco={focoPara(foco, b.id)} />
          ) : (
            <BloqueIlustracion donde={donde} bloque={b} foco={focoPara(foco, b.id)} indice={i} total={bloques.length} />
          )}
        </div>
      ))}
      <Hueco donde={donde} indice={bloques.length} permitidos={permitidos} />
      <AlFinal donde={donde} indice={bloques.length} permitidos={permitidos} />
    </div>
  )
}
