import { useEffect, useRef, useState } from 'react'
import type { Donde } from '../estado'
import { crearId } from '../ids'
import { clasificar, frecuenciaDelLibro, nombreDeCodec, type Capacidades, type InfoMedio, type Paso, type Plan } from '../medios/clasificar'
import type { PlanConvertible } from '../medios/convertir'
import { guardarConvertido } from '../medios/guardar'
import { ErrorConversion, convertirEnSuHilo, type Tarea } from '../medios/hilo'
import { analizar, medirNegro } from '../medios/inspeccionar'
import type { Bloque, Proyecto } from '../modelo'
import { useDespacho, useMedios, useTextos } from './contexto'

/**
 * Añadir un audio o un video: que es, que se le va a hacer, y hacerlo.
 *
 * NADA se aplica sin confirmar (la regla del proyecto): primero se lee el
 * archivo y se enseña el plan, con cada paso y su porque; el autor acepta, y
 * entonces se convierte en su hilo, con progreso y cancelable, y con el perro
 * guardian de `hilo.ts`. Si este navegador no puede, se dice por que y que
 * hacer, en vez de intentarlo y fallar.
 *
 * Siempre pasa por la conversion, aunque el archivo ya valga: como minimo se le
 * quitan los metadatos (un video del telefono lleva donde se grabo), y eso es
 * cambiar de caja, que no recodifica nada y tarda un instante.
 */

type Fase =
  | { readonly f: 'leyendo' }
  | { readonly f: 'plan'; readonly info: InfoMedio | null; readonly plan: Plan }
  | { readonly f: 'convirtiendo'; readonly porcentaje: number }
  | { readonly f: 'guardando' }
  | { readonly f: 'error'; readonly mensaje: string }

const NADA: Capacidades = { decodificaVideo: false, decodificaAudio: false, codificaAvc: false, codificaAac: false }

export function PrepararMedio({
  archivo,
  donde,
  indice,
  proyecto,
  alCerrar,
}: {
  archivo: File
  donde: Donde
  indice: number
  proyecto: Proyecto
  alCerrar: () => void
}) {
  const ui = useTextos()
  const t = ui.medio.preparar
  const despachar = useDespacho()
  const { repo } = useMedios()
  const marco = useRef<HTMLDialogElement>(null)
  const tarea = useRef<Tarea | null>(null)
  const [fase, setFase] = useState<Fase>({ f: 'leyendo' })

  useEffect(() => {
    const d = marco.current
    if (d && !d.open) d.showModal()
  }, [])

  // Leer el archivo y hacer el plan. Al cerrar a medias, no se pinta nada.
  useEffect(() => {
    let vivo = true
    void (async () => {
      const a = await analizar(archivo)
      let info = a?.info ?? null
      if (info?.video && a?.puede.decodificaVideo) {
        const negro = await medirNegro(archivo)
        if (negro) info = { ...info, negro }
      }
      const plan = clasificar(info, a?.puede ?? NADA, repo ? frecuenciaDelLibro(proyecto, repo.medios()) : null)
      if (vivo) setFase({ f: 'plan', info, plan })
    })().catch((e: unknown) => {
      if (vivo) setFase({ f: 'error', mensaje: t.fallo(e instanceof Error ? e.message : String(e)) })
    })
    return () => {
      vivo = false
    }
    // Una sola vez por archivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivo])

  // Cerrar a medias mata la conversion.
  useEffect(() => () => tarea.current?.cancelar(), [])

  const cerrar = (): void => {
    tarea.current?.cancelar()
    alCerrar()
  }

  const confirmar = async (plan: PlanConvertible): Promise<void> => {
    if (!repo) return
    try {
      setFase({ f: 'convirtiendo', porcentaje: 0 })
      tarea.current = convertirEnSuHilo(archivo, plan, (p) => setFase({ f: 'convirtiendo', porcentaje: Math.min(99, Math.round(p * 100)) }))
      const { datos } = await tarea.current.hecho
      tarea.current = null
      setFase({ f: 'guardando' })
      const g = await guardarConvertido(repo, datos, archivo.name, Date.now())
      if (g.poster) despachar({ tipo: 'registrarImagenes', imagenes: [g.poster] })
      const bloque: Bloque =
        g.medio.tipo === 'm4v'
          ? { id: crearId('b'), tipo: 'video', medioId: g.medio.id, posterId: g.poster?.id ?? null, alt: '', decorativa: false }
          : { id: crearId('b'), tipo: 'audio', medioId: g.medio.id, alt: '', decorativa: false }
      despachar({ tipo: 'insertar', donde, indice, bloque })
      alCerrar()
    } catch (e) {
      tarea.current = null
      if (e instanceof ErrorConversion && e.causa === 'cancelado') return
      const mensaje = e instanceof ErrorConversion && e.causa === 'parado' ? t.parado : t.fallo(e instanceof Error ? e.message : String(e))
      setFase({ f: 'error', mensaje })
    }
  }

  const medidas = (a: number, b: number): string => `${a}×${b}`
  const textoDePaso = (p: Paso, info: InfoMedio | null, todos: readonly Paso[]): string[] => {
    switch (p.tipo) {
      case 'contenedor':
        // «Sin recodificar» solo si de verdad no se recodifica nada.
        return [t.pasos.contenedor(ui.medio.contenedores[p.de] ?? p.de, todos.every((x) => x.tipo === 'contenedor'))]
      case 'video': {
        const codec = nombreDeCodec(info?.video?.codec ?? null)
        const motivo = p.motivo === 'codec' ? t.pasos.videoCodec(codec) : p.motivo === 'hdr' ? t.pasos.videoHdr : t.pasos.videoNegro
        return p.antes ? [motivo, t.pasos.reducir(medidas(p.antes.ancho, p.antes.alto), medidas(p.ancho, p.alto))] : [motivo]
      }
      case 'audio':
        return [
          p.motivo === 'codec'
            ? t.pasos.audioCodec(nombreDeCodec(info?.audio?.codec ?? null))
            : p.motivo === 'frecuencia'
              ? t.pasos.audioFrecuencia(ui.formato.frecuencia(info?.audio?.hz ?? 0), ui.formato.frecuencia(p.hz))
              : t.pasos.audioCanales(info?.audio?.canales ?? 0),
        ]
    }
  }

  return (
    <dialog
      ref={marco}
      className="ajustar preparar-medio"
      aria-label={t.titulo(archivo.name)}
      onCancel={(e) => {
        e.preventDefault()
        if (fase.f !== 'guardando') cerrar()
      }}
    >
      <header>
        <h2>{t.titulo(archivo.name)}</h2>
        <button type="button" className="cerrar" aria-label={ui.cerrar} onClick={cerrar} disabled={fase.f === 'guardando'}>
          ×
        </button>
      </header>

      {fase.f === 'leyendo' && <p className="ayuda">{t.leyendo}</p>}

      {fase.f === 'plan' && (
        <>
          {fase.info && (
            <p>
              {fase.info.video
                ? t.esVideo(
                    nombreDeCodec(fase.info.video.codec),
                    fase.info.video.ancho,
                    fase.info.video.alto,
                    ui.formato.duracion(fase.info.segundos),
                    ui.formato.tamano(fase.info.bytes),
                    fase.info.video.hdr,
                  )
                : fase.info.audio
                  ? t.esAudio(
                      nombreDeCodec(fase.info.audio.codec),
                      ui.formato.frecuencia(fase.info.audio.hz),
                      fase.info.audio.canales,
                      ui.formato.duracion(fase.info.segundos),
                      ui.formato.tamano(fase.info.bytes),
                    )
                  : null}
            </p>
          )}
          {fase.plan.clase === 'imposible' ? (
            <div className="alerta nivel-error" role="alert">
              <p>{t.imposible[fase.plan.motivo].porque}</p>
              <p>{t.imposible[fase.plan.motivo].consejo}</p>
            </div>
          ) : (
            <>
              <p>{fase.plan.clase === 'valido' ? t.yaValido : t.plan}</p>
              <ul className="plan-medio">
                {fase.plan.pasos.flatMap((p, _i, todos) => textoDePaso(p, fase.info, todos)).map((x) => (
                  <li key={x}>{x}</li>
                ))}
                <li>{t.pasos.metadatos}</li>
                {fase.plan.tipo === 'm4v' && <li>{t.pasos.poster}</li>}
              </ul>
              <p className="ayuda">{t.soloApple}</p>
            </>
          )}
          <div className="botones">
            {fase.plan.clase !== 'imposible' && (
              <button type="button" className="boton-principal" disabled={!repo} onClick={() => void confirmar(fase.plan as PlanConvertible)}>
                {fase.plan.clase === 'valido' ? t.anadir : t.convertir}
              </button>
            )}
            <button type="button" className="boton-secundario" onClick={cerrar}>
              {fase.plan.clase === 'imposible' ? t.cerrar : t.cancelar}
            </button>
          </div>
        </>
      )}

      {fase.f === 'convirtiendo' && (
        <>
          <p>{t.convirtiendo(fase.porcentaje)}</p>
          <progress max={100} value={fase.porcentaje} aria-label={t.convirtiendo(fase.porcentaje)} />
          <p className="ayuda">{t.noCerrar}</p>
          <div className="botones">
            <button type="button" className="boton-secundario" onClick={cerrar}>
              {t.cancelar}
            </button>
          </div>
        </>
      )}

      {fase.f === 'guardando' && <p>{t.guardando}</p>}

      {fase.f === 'error' && (
        <>
          <p className="alerta nivel-error" role="alert">
            {fase.mensaje}
          </p>
          <div className="botones">
            <button type="button" className="boton-secundario" onClick={cerrar}>
              {t.cerrar}
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
