/**
 * El cuadro para ajustar una imagen: que trozo se ve, a que tamano sale y en
 * que formato.
 *
 * Es la respuesta al aviso, no otra pantalla: desde la tarjeta de una
 * ilustracion o desde el propio aviso («Arreglar»), se abre encima, se ajusta
 * y se vuelve. Un aviso que manda al autor a otro programa es un aviso que no
 * se arregla.
 *
 * Todo lo que decide esta en `imagen-ajuste.ts` y se prueba en node; aqui solo
 * esta el gesto. El marco se mueve arrastrando Y con las flechas del teclado:
 * en un iPad con teclado, y para quien no puede arrastrar, no puede haber un
 * gesto que sea la unica forma de hacer algo.
 *
 * Se usa `<dialog>` del navegador a proposito: trae gratis el foco atrapado,
 * Escape para cerrar y el fondo inerte, que a mano se hacen mal.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ASPECTOS,
  conSufijo,
  ASPECTO_RECOMENDADO,
  ZOOM_MAXIMO,
  ZOOM_MINIMO,
  centroDe,
  conProporcion,
  moverRecorte,
  necesitaAlfa,
  quedaCorta,
  recorteDesde,
  reparoDe,
  sinCambios,
  tamanoRecomendado,
  type Ajuste,
  type ClaveAspecto,
  type Formato,
} from '../imagen-ajuste'
import { ajustarImagen } from '../imagen-canvas'
import type { Imagen } from '../modelo'
import { useAvisar, useMedios, useTextos } from './contexto'

/** El lado mayor de la ventana de encuadre, en pixeles de pantalla. */
const VISTA = 300

/** Lo que mueven las flechas del teclado, en pixeles de la imagen. */
const PASO_TECLADO = 20

export interface Ajustada {
  readonly imagen: Imagen
}

export function AjustarImagen({
  imagen,
  alHecho,
  alCerrar,
}: {
  imagen: Imagen
  /** Llega la imagen nueva; quien abrio el cuadro decide donde ponerla. */
  alHecho: (nueva: Imagen) => void
  alCerrar: () => void
}) {
  const ui = useTextos()
  const avisar = useAvisar()
  const { repo, subir } = useMedios()
  const marco = useRef<HTMLDialogElement>(null)
  const url = repo?.url(imagen.id)

  const [aspecto, setAspecto] = useState<ClaveAspecto>(ASPECTO_RECOMENDADO)
  const [zoom, setZoom] = useState(ZOOM_MINIMO)
  const [recorte, setRecorte] = useState(() =>
    recorteDesde(imagen.ancho, imagen.alto, ASPECTO_RECOMENDADO, ZOOM_MINIMO, {
      x: imagen.ancho / 2,
      y: imagen.alto / 2,
    }),
  )
  const [formato, setFormato] = useState<Formato>(imagen.tipo)
  const [calidad, setCalidad] = useState(85)
  const [grises, setGrises] = useState(false)
  // null = el recomendado para el recorte de ahora. Asi cambiar de proporcion
  // no deja un tamano que ya no pega con lo encuadrado.
  const [tamanoPedido, setTamanoPedido] = useState<{ ancho: number; alto: number } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const recomendado = useMemo(() => tamanoRecomendado(recorte), [recorte])
  const destino = tamanoPedido ?? recomendado

  const ajuste: Ajuste = {
    recorte,
    ancho: destino.ancho,
    alto: destino.alto,
    formato,
    calidad,
    grises,
    conservarAlfa: necesitaAlfa(formato, imagen.alfa ?? false),
  }
  const reparo = reparoDe(ajuste)
  const nada = sinCambios(ajuste, imagen)

  /**
   * El peso NO se estima: se codifica la imagen de verdad y se miran sus bytes.
   *
   * Una tabla de bytes por pixel se equivoca por mucho con un dibujo plano —
   * en la primera version esta misma imagen salia como «5,8 MB» cuando pesa 17
   * kB —, y un numero asi en la pantalla que decide el tamano del libro es peor
   * que no dar ninguno. Aqui es UNA imagen, asi que codificarla cuesta poco.
   * (En la pantalla de descarga son todas, y ahi se mide sobre una muestra.)
   */
  const clave = `${recorte.x},${recorte.y},${recorte.ancho},${recorte.alto}|${destino.ancho}x${destino.alto}|${formato}|${calidad}|${grises}`
  const [medida, setMedida] = useState<{ clave: string; bytes: number } | null>(null)
  const peso = medida?.clave === clave ? medida.bytes : null

  useEffect(() => {
    const origen = repo?.blob(imagen.id)
    if (!origen || peso !== null) return undefined
    let vivo = true
    const t = setTimeout(() => {
      void (async () => {
        try {
          const r = await ajustarImagen(origen, ajuste)
          if (vivo) setMedida({ clave, bytes: r.blob.size })
        } catch {
          // Sin medida no se ensena ningun numero, que es mejor que uno falso.
        }
      })()
    }, 250)
    return () => {
      vivo = false
      clearTimeout(t)
    }
    // `ajuste` se reconstruye en cada render pero su CONTENIDO es `clave`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, peso, repo, imagen.id])

  // `showModal` no se puede llamar en el JSX: el elemento todavia no existe.
  useEffect(() => {
    const d = marco.current
    if (d && !d.open) d.showModal()
  }, [])

  const encuadrar = (clave: ClaveAspecto, z: number): void => {
    setAspecto(clave)
    setZoom(z)
    setRecorte(recorteDesde(imagen.ancho, imagen.alto, clave, z, centroDe(recorte)))
    setTamanoPedido(null)
  }

  // -- arrastrar el marco ------------------------------------------------------
  // La escala de la vista: cuantos pixeles de pantalla mide un pixel de la
  // imagen. Se arrastra el DIBUJO, asi que el marco va al contrario.
  const escala = Math.min(VISTA / Math.max(1, recorte.ancho), VISTA / Math.max(1, recorte.alto))
  const vistaAncho = Math.max(1, Math.round(recorte.ancho * escala))
  const vistaAlto = Math.max(1, Math.round(recorte.alto * escala))

  const arrastre = useRef<{ x: number; y: number; recorte: typeof recorte } | null>(null)

  const alBajar = (e: React.PointerEvent): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    arrastre.current = { x: e.clientX, y: e.clientY, recorte }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const alMover = (e: React.PointerEvent): void => {
    const a = arrastre.current
    if (!a) return
    e.preventDefault()
    setRecorte(
      moverRecorte(a.recorte, -(e.clientX - a.x) / escala, -(e.clientY - a.y) / escala, imagen.ancho, imagen.alto),
    )
  }
  const alSoltar = (): void => {
    arrastre.current = null
  }

  const conTeclado = (e: React.KeyboardEvent): void => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
    if (!d) return
    e.preventDefault()
    const paso = e.shiftKey ? PASO_TECLADO * 5 : PASO_TECLADO
    setRecorte(moverRecorte(recorte, (d[0] as number) * paso, (d[1] as number) * paso, imagen.ancho, imagen.alto))
  }

  // -- aplicar -----------------------------------------------------------------
  const aplicar = async (): Promise<void> => {
    if (!repo || ocupado) return
    setOcupado(true)
    try {
      const origen = repo.blob(imagen.id)
      if (!origen) throw new Error(ui.ajustar.error)
      const salida = await ajustarImagen(origen, ajuste)
      // Se sube por el mismo camino que cualquier imagen: la inspeccion de
      // bytes vuelve a correr sobre el resultado, asi que lo que el modelo diga
      // de la imagen nueva sale de sus bytes de verdad y no de lo que se pidio.
      const nombre = conSufijo(imagen.nombreOriginal, salida.tipo)
      const [nueva] = await subir([new File([salida.blob], nombre, { type: salida.blob.type })])
      if (!nueva) return
      alHecho(nueva)
      avisar(ui.ajustar.hecho, { deshacer: true })
      alCerrar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : ui.ajustar.error, { tipo: 'error' })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <dialog
      ref={marco}
      className="ajustar"
      aria-label={ui.ajustar.titulo}
      onCancel={(e) => {
        e.preventDefault()
        alCerrar()
      }}
    >
      <header>
        <h2>{ui.ajustar.titulo}</h2>
        <button type="button" className="cerrar" aria-label={ui.cerrar} onClick={alCerrar}>
          ×
        </button>
      </header>
      <p className="ayuda">{ui.ajustar.original(imagen.ancho, imagen.alto, ui.formato.tamano(imagen.bytes))}</p>

      <div className="ajustar-cuerpo">
        <div className="ajustar-vista">
          {/* El marco es el hueco; dentro se arrastra la imagen entera. */}
          <div
            className="encuadre"
            style={{ width: `${vistaAncho}px`, height: `${vistaAlto}px` }}
            role="application"
            aria-label={ui.ajustar.encuadre}
            tabIndex={0}
            onPointerDown={alBajar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={alSoltar}
            onKeyDown={conTeclado}
          >
            {url ? (
              <img
                src={url}
                alt=""
                draggable={false}
                style={{
                  width: `${imagen.ancho * escala}px`,
                  height: `${imagen.alto * escala}px`,
                  marginLeft: `${-recorte.x * escala}px`,
                  marginTop: `${-recorte.y * escala}px`,
                }}
              />
            ) : (
              <p className="ayuda">{ui.ilustracion.falta(imagen.nombreOriginal)}</p>
            )}
          </div>
          <p className="ayuda">{ui.ajustar.encuadreAyuda}</p>
        </div>

        <div className="ajustar-mandos">
          <fieldset>
            <legend>{ui.ajustar.proporcion}</legend>
            <div className="aspectos">
              {ASPECTOS.map((clave) => (
                <button
                  key={clave}
                  type="button"
                  className={`boton-aspecto${clave === aspecto ? ' activo' : ''}`}
                  aria-pressed={clave === aspecto}
                  onClick={() => encuadrar(clave, zoom)}
                >
                  {ui.ajustar.aspectos[clave] ?? clave}
                </button>
              ))}
            </div>
            <p className="ayuda">{ui.ajustar.proporcionAyuda}</p>
          </fieldset>

          <label className="campo">
            <span>{ui.ajustar.zoom}</span>
            <input
              type="range"
              min={ZOOM_MINIMO}
              max={ZOOM_MAXIMO}
              step={0.05}
              value={zoom}
              onChange={(e) => encuadrar(aspecto, Number(e.target.value))}
            />
            <small>{ui.ajustar.zoomAyuda}</small>
          </label>

          <fieldset>
            <legend>{ui.ajustar.tamano}</legend>
            <div className="medidas">
              <label className="campo">
                <span>{ui.ajustar.ancho}</span>
                <input
                  type="number"
                  min={1}
                  value={destino.ancho}
                  onChange={(e) => setTamanoPedido(conProporcion(recorte, 'ancho', Number(e.target.value)))}
                />
              </label>
              <span aria-hidden="true">×</span>
              <label className="campo">
                <span>{ui.ajustar.alto}</span>
                <input
                  type="number"
                  min={1}
                  value={destino.alto}
                  onChange={(e) => setTamanoPedido(conProporcion(recorte, 'alto', Number(e.target.value)))}
                />
              </label>
              <span className="unidad">{ui.ajustar.px}</span>
            </div>
            <p className="ayuda">{ui.ajustar.sugerido(recomendado.ancho, recomendado.alto)}</p>
            {tamanoPedido !== null && (
              <button type="button" className="enlace" onClick={() => setTamanoPedido(null)}>
                {ui.ajustar.usarSugerido}
              </button>
            )}
          </fieldset>

          <fieldset>
            <legend>{ui.ajustar.formato}</legend>
            <div className="formatos">
              {(['png', 'jpeg'] as const).map((f) => (
                <label key={f} className="opcion">
                  <input type="radio" name="formato" checked={formato === f} onChange={() => setFormato(f)} />
                  {ui.ajustar.formatos[f] ?? f}
                </label>
              ))}
            </div>
            {formato === 'jpeg' && (
              <label className="campo">
                <span>
                  {ui.ajustar.calidad} · {calidad}
                </span>
                <input type="range" min={40} max={95} step={1} value={calidad} onChange={(e) => setCalidad(Number(e.target.value))} />
              </label>
            )}
            <label className="opcion">
              <input type="checkbox" checked={grises} onChange={(e) => setGrises(e.target.checked)} />
              {ui.ajustar.grises}
            </label>
            <p className="ayuda">{ui.ajustar.formatoAyuda}</p>
          </fieldset>
        </div>
      </div>

      <p className="ajustar-resultado">
        {peso === null
          ? ui.ajustar.midiendo(destino.ancho, destino.alto)
          : ui.ajustar.resultado(destino.ancho, destino.alto, ui.formato.tamano(peso))}
      </p>
      {reparo && <p className="alerta nivel-aviso">{ui.ajustar[reparo]}</p>}
      {!reparo && quedaCorta(destino.ancho, destino.alto) && (
        <p className="alerta nivel-nota">{ui.grupos.resolucion.consejo}</p>
      )}
      {formato === 'jpeg' && imagen.alfa && <p className="alerta nivel-nota">{ui.descargar.imagenes.transparencia}</p>}

      <p className="ayuda">{ui.ajustar.ayuda}</p>
      <div className="botones">
        <button type="button" className="boton-principal" disabled={ocupado || nada || !url} onClick={() => void aplicar()}>
          {ocupado ? ui.ajustar.aplicando : ui.ajustar.aplicar}
        </button>
        <button type="button" className="boton-secundario" onClick={alCerrar}>
          {ui.ajustar.cancelar}
        </button>
        {nada && <span className="ayuda">{ui.ajustar.sinCambios}</span>}
      </div>
    </dialog>
  )
}
