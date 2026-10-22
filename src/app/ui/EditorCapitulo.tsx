import { useCallback, useMemo, useState } from 'react'
import { entrarEn, porObjetivo, vecino } from '../editor-dom'
import { objetivoTitulo, type Donde, type Foco } from '../estado'
import { crearId } from '../ids'
import { textoDeTramos, type Capitulo, type Extra, type Tramo } from '../modelo'
import { etiquetaReconocida } from '../revision'
import { useAjustar, useDespacho, useMedios, useTextos } from './contexto'
import { AvisosDeImagen, BarraFormato, EditorBloques } from './EditorBloques'
import { Menu } from './Menu'
import { PAGINA, SOLO_TEXTO, TODO_PERMITIDO } from './permitidos'
import { TextoEditable } from './TextoEditable'

const ETIQUETAS = ['Prólogo', 'Epílogo', 'Interludio']

/** El titulo de un capitulo o de una pagina extra: una linea con cursiva y negrita. */
function Titulo({
  donde,
  tramos,
  foco,
  marcador,
}: {
  donde: Donde
  tramos: readonly Tramo[]
  foco: Foco | null
  marcador: string
}) {
  const despachar = useDespacho()
  const objetivo = objetivoTitulo(donde.id)
  const onCambio = useCallback(
    (t: readonly Tramo[]) => despachar({ tipo: 'titulo', donde, tramos: t, ahora: Date.now() }),
    [despachar, donde],
  )
  // Intro en el titulo baja al texto, no parte el titulo.
  const onIntro = useCallback(() => {
    const el = porObjetivo(objetivo)
    const destino = el ? vecino(el, 1) : null
    if (destino) entrarEn(destino, 'arriba', null)
  }, [objetivo])
  const onDeshacer = useCallback(() => despachar({ tipo: 'deshacer' }), [despachar])
  const onRehacer = useCallback(() => despachar({ tipo: 'rehacer' }), [despachar])
  const onFoco = useCallback(() => despachar({ tipo: 'activarBloque', bloque: null }), [despachar])
  return (
    <TextoEditable
      tramos={tramos}
      objetivo={objetivo}
      foco={foco?.objetivo === objetivo ? foco : null}
      etiqueta={marcador}
      marcador={marcador}
      className="texto-titulo"
      unaLinea
      onCambio={onCambio}
      onIntro={onIntro}
      onFoco={onFoco}
      onDeshacer={onDeshacer}
      onRehacer={onRehacer}
    />
  )
}

/** Las ilustraciones que abren el capitulo, antes de la cabecera. */
function Aperturas({ capitulo }: { capitulo: Capitulo }) {
  const ui = useTextos()
  const ajustar = useAjustar()
  const despachar = useDespacho()
  const { repo, imagenes } = useMedios()
  if (capitulo.aperturas.length === 0) return null
  return (
    <div className="aperturas">
      <p className="rotulo">{ui.editor.aperturas}</p>
      {capitulo.aperturas.map((a, i) => {
        const imagen = imagenes.get(a.imagenId)
        const url = imagen ? repo?.url(a.imagenId) : undefined
        return (
          <div className="apertura" key={`${a.imagenId}-${i}`}>
            <p className="pagina-propia" aria-hidden="true">
              {ui.ilustracion.paginaPropia}
            </p>
            <div className="ilus-cuerpo">
              <div className="ilus-miniatura">
                {url ? <img src={url} alt="" /> : <p className="ilus-falta">{ui.ilustracion.falta(a.imagenId)}</p>}
              </div>
              <div className="ilus-campos">
                <label className="campo">
                  <span>{ui.ilustracion.alt}</span>
                  <textarea
                    rows={2}
                    value={a.alt}
                    placeholder={ui.ilustracion.altAyuda}
                    onChange={(e) =>
                      despachar({ tipo: 'aperturaAlt', capitulo: capitulo.id, indice: i, alt: e.target.value, ahora: Date.now() })
                    }
                  />
                </label>
                {imagen && <AvisosDeImagen imagen={imagen} rol="ilustracion" />}
              </div>
              <Menu
                etiqueta={ui.ilustracion.menu}
                opciones={[
                  imagen !== undefined && { etiqueta: ui.ajustar.abrir, accion: () => ajustar(imagen) },
                  {
                    etiqueta: ui.ilustracion.devolver,
                    accion: () => despachar({ tipo: 'deApertura', capitulo: capitulo.id, indice: i, nuevoId: crearId('b') }),
                  },
                  {
                    etiqueta: ui.ilustracion.quitar,
                    peligro: true,
                    accion: () => despachar({ tipo: 'quitarApertura', capitulo: capitulo.id, indice: i }),
                  },
                ]}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function EditorCapitulo({
  capitulo,
  foco,
  separador,
  bloqueActivo,
}: {
  capitulo: Capitulo
  foco: Foco | null
  separador: string
  bloqueActivo: string | null
}) {
  const ui = useTextos()
  const despachar = useDespacho()
  const donde = useMemo<Donde>(() => ({ tipo: 'capitulo', id: capitulo.id }), [capitulo.id])
  const [encima, setEncima] = useState(false)
  const reconocida = etiquetaReconocida(capitulo.etiqueta)
  const sinTitulo = !capitulo.etiqueta.trim() && !textoDeTramos(capitulo.titulo).trim()

  // Soltar una ilustracion sobre la cabecera = abrir el capitulo con ella.
  const soltar = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('text/x-pubteca-bloque')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setEncima(true)
    },
    onDragLeave: () => setEncima(false),
    onDrop: (e: React.DragEvent) => {
      const bloque = e.dataTransfer.getData('text/x-pubteca-bloque')
      setEncima(false)
      if (!bloque) return
      e.preventDefault()
      despachar({ tipo: 'aApertura', capitulo: capitulo.id, bloque })
    },
  }

  return (
    <article className="editor" data-editor="" aria-label={textoDeTramos(capitulo.titulo) || capitulo.etiqueta}>
      <Aperturas capitulo={capitulo} />
      <header className={`cabecera${encima ? ' encima' : ''}`} {...soltar}>
        {encima && <p className="cabecera-soltar">{ui.editor.soltarApertura}</p>}
        <input
          className="etiqueta"
          list="etiquetas-capitulo"
          value={capitulo.etiqueta}
          placeholder={ui.editor.etiqueta}
          aria-label={ui.editor.etiqueta}
          title={ui.editor.etiquetaAyuda}
          data-navegable=""
          onChange={(e) => despachar({ tipo: 'etiqueta', capitulo: capitulo.id, texto: e.target.value, ahora: Date.now() })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'ArrowDown') {
              const destino = vecino(e.currentTarget, 1)
              if (destino) {
                e.preventDefault()
                entrarEn(destino, 'arriba', null)
              }
            }
          }}
        />
        <datalist id="etiquetas-capitulo">
          {ETIQUETAS.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        {!reconocida && <p className="aviso-linea">{ui.editor.etiquetaNoReconocida(capitulo.etiqueta)}</p>}
        <Titulo donde={donde} tramos={capitulo.titulo} foco={foco} marcador={ui.editor.titulo} />
        {sinTitulo && <p className="aviso-linea">{ui.editor.sinTitulo}</p>}
      </header>
      <BarraFormato donde={donde} bloques={capitulo.bloques} activo={bloqueActivo} permitidos={TODO_PERMITIDO} />
      <EditorBloques donde={donde} bloques={capitulo.bloques} foco={foco} separador={separador} />
    </article>
  )
}

export function EditorExtra({
  extra,
  foco,
  separador,
  bloqueActivo,
}: {
  extra: Extra
  foco: Foco | null
  separador: string
  bloqueActivo: string | null
}) {
  const ui = useTextos()
  const donde = useMemo<Donde>(() => ({ tipo: 'extra', id: extra.id }), [extra.id])
  const permitidos = extra.tipo === 'conTitulo' ? PAGINA : SOLO_TEXTO
  return (
    <article className={`editor editor-extra extra-${extra.tipo}`} data-editor="">
      {extra.tipo === 'conTitulo' ? (
        <header className="cabecera">
          <Titulo donde={donde} tramos={extra.titulo} foco={foco} marcador={ui.editor.tituloPagina} />
          {/* Se avisa cuando ya hay texto: recien creada, la pagina aun no tiene nada que perder. */}
          {!textoDeTramos(extra.titulo).trim() && extra.bloques.some((b) => b.tipo !== 'parrafo' || b.tramos.length > 0) && (
            <p className="aviso-linea">{ui.problemas.paginaSinTitulo}</p>
          )}
        </header>
      ) : (
        <p className="ayuda">{extra.tipo === 'dedicatoria' ? ui.extras.dedicatoriaAyuda : ui.extras.epigrafeAyuda}</p>
      )}
      <BarraFormato donde={donde} bloques={extra.bloques} activo={bloqueActivo} permitidos={permitidos} />
      <EditorBloques donde={donde} bloques={extra.bloques} foco={foco} separador={separador} permitidos={permitidos} />
    </article>
  )
}
