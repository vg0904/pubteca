/**
 * El cuadro para ajustar una imagen: que trozo se ve, a que tamano sale y en
 * que formato.
 *
 * DOS PESTAÑAS, una por tienda, pero NO dos imagenes. El encuadre es decision
 * de autor y es UNA sola: el dibujo es el mismo en Apple Books y en Kindle, y
 * un recorte distinto por tienda seria otro libro, no otra entrega. Lo que si
 * cambia entre tiendas es cuanto puede pesar, porque Amazon cobra la entrega
 * por MB y Apple no cobra por el tamaño del archivo.
 *
 * Por eso la pestaña de Apple Books ajusta la imagen (y es la que se guarda), y
 * la de Kindle solo guarda AJUSTES —calidad, gris y lado largo—, que se aplican
 * al generar, en `entrega.ts`, donde ya se hacia la version de Kindle. Asi el
 * almacen sigue con un blob por imagen, la copia (.zip) con un archivo por
 * imagen, y deshacer sigue siendo un id.
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
  KINDLE_PROPIO_POR_DEFECTO,
  ZOOM_MAXIMO,
  ZOOM_MINIMO,
  centroDe,
  conProporcion,
  ladoLargo,
  moverRecorte,
  necesitaAlfa,
  quedaCorta,
  rangoDeResolucion,
  recorteDesde,
  reparoDe,
  sinCambios,
  tamanoPorResolucion,
  tamanoRecomendado,
  type Ajuste,
  type ClaveAspecto,
  type Formato,
  type KindlePropio,
} from '../imagen-ajuste'
import { ajustarImagen } from '../imagen-canvas'
import type { EntregaKindle, Imagen } from '../modelo'
import { TIENDAS, type Tienda } from '../avisos'
import { useAvisar, useDespacho, useMedios, useTextos } from './contexto'

/** El lado mayor de la ventana de encuadre, en pixeles de pantalla. */
const VISTA = 300

/** Lo que mueven las flechas del teclado, en pixeles de la imagen. */
const PASO_TECLADO = 20

export interface Ajustada {
  readonly imagen: Imagen
}

export function AjustarImagen({
  imagen,
  kindleGeneral,
  kindlePropio,
  alHecho,
  alCerrar,
}: {
  imagen: Imagen
  /** Lo que la pantalla de descarga tiene puesto para TODAS las imagenes. */
  kindleGeneral: EntregaKindle
  /** El ajuste propio de ESTA imagen, si el autor le dio uno. */
  kindlePropio: KindlePropio | undefined
  /** Llega la imagen nueva; quien abrio el cuadro decide donde ponerla. */
  alHecho: (nueva: Imagen) => void
  alCerrar: () => void
}) {
  const ui = useTextos()
  const avisar = useAvisar()
  const despachar = useDespacho()
  const { repo, subir } = useMedios()
  const marco = useRef<HTMLDialogElement>(null)
  const url = repo?.url(imagen.id)

  const [tienda, setTienda] = useState<Tienda>('apple')
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
  const rango = useMemo(() => rangoDeResolucion(recorte), [recorte])

  // El ajuste de Kindle no es estado local: vive en el proyecto, asi que se
  // guarda solo con el autoguardado y entra en «Deshacer» como todo lo demas.
  const propio = kindlePropio
  const kindleAhora: KindlePropio = propio ?? {
    ...KINDLE_PROPIO_POR_DEFECTO,
    calidad: kindleGeneral.calidad,
    grises: kindleGeneral.grises,
  }
  const cambiarKindle = (cambios: Partial<KindlePropio> | null): void =>
    despachar({ tipo: 'kindleDeImagen', imagen: imagen.id, cambios, ahora: Date.now() })

  // Lo que le queda a Kindle se mide sobre la imagen GUARDADA, no sobre el
  // encuadre a medias de la otra pestaña: hasta que no se aplique, la imagen
  // que se va a entregar es la de ahora. Por eso su deslizador tiene SU rango,
  // el de la imagen entera, y no el del recorte de la pestaña de al lado.
  const enteraKindle = { x: 0, y: 0, ancho: imagen.ancho, alto: imagen.alto }
  const rangoKindle = useMemo(
    () => rangoDeResolucion({ x: 0, y: 0, ancho: imagen.ancho, alto: imagen.alto }),
    [imagen.ancho, imagen.alto],
  )
  const kindleTamano =
    kindleAhora.ladoLargo > 0 ? tamanoPorResolucion(enteraKindle, kindleAhora.ladoLargo) : { ancho: imagen.ancho, alto: imagen.alto }

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

      {/* Una pestaña por tienda. El encuadre es el mismo en las dos y se ve
          siempre al lado: lo que cambia de pestaña a pestaña es cuanto pesa. */}
      <div className="ajustar-pestanas" role="tablist" aria-label={ui.ajustar.pestanas}>
        {TIENDAS.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            id={`ajustar-pestana-${x}`}
            aria-selected={x === tienda}
            aria-controls={`ajustar-panel-${x}`}
            className={`pestana${x === tienda ? ' activa' : ''}`}
            onClick={() => setTienda(x)}
          >
            {ui.tiendas[x]}
            {x === 'kindle' && propio && <span className="pestana-marca">{ui.ajustar.kindle.marca}</span>}
          </button>
        ))}
      </div>

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

        <div
          className="ajustar-mandos"
          role="tabpanel"
          id="ajustar-panel-apple"
          aria-labelledby="ajustar-pestana-apple"
          hidden={tienda !== 'apple'}
        >
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
            {/* El deslizador mueve los dos lados a la vez por el LADO LARGO:
                la proporcion la manda el encuadre, no los campos. Su tope es el
                trozo encuadrado, asi que no puede llegar a emborronar. */}
            <label className="campo">
              <span>{ui.ajustar.resolucion}</span>
              <input
                type="range"
                min={rango.min}
                max={rango.max}
                step={10}
                value={Math.min(rango.max, Math.max(rango.min, ladoLargo(destino.ancho, destino.alto)))}
                onChange={(e) => setTamanoPedido(tamanoPorResolucion(recorte, Number(e.target.value)))}
              />
            </label>
            <div className="ajustar-sugerido">
              <p className="ayuda">{ui.ajustar.sugerido(recomendado.ancho, recomendado.alto)}</p>
              {/* Siempre, no solo cuando hay un tamaño a mano: hasta ahora la
                  recomendacion se decia en texto y no habia forma de pedirla. */}
              <button
                type="button"
                className="enlace"
                disabled={destino.ancho === recomendado.ancho && destino.alto === recomendado.alto}
                onClick={() => setTamanoPedido(null)}
              >
                {ui.ajustar.usarSugerido}
              </button>
            </div>
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

        {/* Kindle: NO se ajusta otra imagen, se dice que hacerle a esta al
            entregarla. Por eso aqui no hay ni proporcion ni encuadre: eso ya
            esta decidido a la izquierda, y vale para las dos tiendas. */}
        <div
          className="ajustar-mandos"
          role="tabpanel"
          id="ajustar-panel-kindle"
          aria-labelledby="ajustar-pestana-kindle"
          hidden={tienda !== 'kindle'}
        >
          <p className="ayuda">{ui.ajustar.kindle.ayuda}</p>
          <label className="opcion">
            <input
              type="checkbox"
              checked={propio !== undefined}
              onChange={(e) => cambiarKindle(e.target.checked ? {} : null)}
            />
            {ui.ajustar.kindle.propio}
          </label>
          {propio === undefined ? (
            <p className="ayuda">
              {kindleGeneral.comprimir
                ? ui.ajustar.kindle.general(kindleGeneral.calidad, kindleGeneral.grises)
                : ui.ajustar.kindle.sinComprimir}
            </p>
          ) : (
            <fieldset>
              <legend>{ui.ajustar.kindle.titulo}</legend>
              <label className="campo">
                <span>{ui.ajustar.resolucion}</span>
                <input
                  type="range"
                  min={rangoKindle.min}
                  max={rangoKindle.max}
                  step={10}
                  value={
                    kindleAhora.ladoLargo > 0
                      ? Math.min(rangoKindle.max, Math.max(rangoKindle.min, kindleAhora.ladoLargo))
                      : rangoKindle.max
                  }
                  onChange={(e) => cambiarKindle({ ladoLargo: Number(e.target.value) })}
                />
                <small>{ui.ajustar.kindle.resolucionAyuda(kindleTamano.ancho, kindleTamano.alto)}</small>
              </label>
              <label className="campo">
                <span>
                  {ui.ajustar.calidad} · {kindleAhora.calidad}
                </span>
                <input
                  type="range"
                  min={40}
                  max={95}
                  step={1}
                  value={kindleAhora.calidad}
                  onChange={(e) => cambiarKindle({ calidad: Number(e.target.value) })}
                />
              </label>
              <label className="opcion">
                <input
                  type="checkbox"
                  checked={kindleAhora.grises}
                  onChange={(e) => cambiarKindle({ grises: e.target.checked })}
                />
                {ui.descargar.imagenes.grises}
              </label>
              <p className="ayuda">{ui.descargar.imagenes.grisesAyuda}</p>
              <button type="button" className="enlace" onClick={() => cambiarKindle(null)}>
                {ui.ajustar.kindle.volverAlGeneral}
              </button>
            </fieldset>
          )}
        </div>
      </div>

      {tienda === 'apple' ? (
        <>
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
        </>
      ) : (
        /* En Kindle no se guarda ninguna imagen: el ajuste ya queda guardado al
           tocarlo, y la version se codifica al preparar los EPUB. */
        <p className="ajustar-resultado">{ui.ajustar.kindle.cuando}</p>
      )}
      <div className="botones">
        {tienda === 'apple' ? (
          <button type="button" className="boton-principal" disabled={ocupado || nada || !url} onClick={() => void aplicar()}>
            {ocupado ? ui.ajustar.aplicando : ui.ajustar.aplicar}
          </button>
        ) : (
          <button type="button" className="boton-principal" onClick={alCerrar}>
            {ui.ajustar.listo}
          </button>
        )}
        <button type="button" className="boton-secundario" onClick={alCerrar}>
          {ui.ajustar.cancelar}
        </button>
        {tienda === 'apple' && nada && <span className="ayuda">{ui.ajustar.sinCambios}</span>}
      </div>
    </dialog>
  )
}
