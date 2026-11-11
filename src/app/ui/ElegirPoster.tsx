import { useEffect, useRef, useState } from 'react'
import type { Donde } from '../estado'
import { guardarPoster } from '../medios/guardar'
import { fotograma, momentoPorDefecto, posterDeImagen } from '../medios/poster'
import type { BloqueMedio } from '../modelo'
import { elegirArchivos } from './archivos'
import { useAvisar, useDespacho, useMedios, useTextos } from './contexto'

/**
 * Elegir el poster de un video: un fotograma, con un deslizador, o una imagen
 * subida. Apple lo exige del MISMO tamaño y proporcion que el video, asi que
 * el fotograma sale a su tamaño en pantalla y la imagen se recorta a el.
 */
export function ElegirPoster({ bloque, donde, alCerrar }: { bloque: Extract<BloqueMedio, { tipo: 'video' }>; donde: Donde; alCerrar: () => void }) {
  const ui = useTextos()
  const t = ui.medio.elegirPosterDialogo
  const despachar = useDespacho()
  const avisar = useAvisar()
  const { repo } = useMedios()
  const marco = useRef<HTMLDialogElement>(null)
  const medio = repo?.medios().get(bloque.medioId)
  const blob = repo?.blobMedio(bloque.medioId)
  const segundos = medio?.segundos ?? 0
  const [momento, setMomento] = useState(() => momentoPorDefecto(segundos))
  const [vista, setVista] = useState<{ url: string; jpeg: Blob } | null>(null)
  // Ocupado desde el principio: lo primero que se hace es sacar un fotograma.
  const [ocupado, setOcupado] = useState(true)
  const elegir = (segundos: number): void => {
    if (segundos === momento) return
    setOcupado(true)
    setMomento(segundos)
  }

  useEffect(() => {
    const d = marco.current
    if (d && !d.open) d.showModal()
  }, [])

  // El fotograma del momento elegido; se pide al soltar el deslizador, no en
  // cada pixel, que decodificar cuesta.
  useEffect(() => {
    if (!blob) return
    let vivo = true
    let url = ''
    void fotograma(blob, momento)
      .then((f) => {
        if (!vivo) return
        url = URL.createObjectURL(f.jpeg)
        setVista({ url, jpeg: f.jpeg })
      })
      .catch(() => undefined)
      .finally(() => vivo && setOcupado(false))
    return () => {
      vivo = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [blob, momento])

  const usar = async (jpeg: Blob): Promise<void> => {
    if (!repo) return
    try {
      const base = medio?.nombreOriginal.replace(/\.[^.]+$/u, '') ?? 'video'
      const img = await guardarPoster(repo, jpeg, `${base} (póster).jpg`)
      despachar({ tipo: 'registrarImagenes', imagenes: [img] })
      despachar({ tipo: 'medio', donde, bloque: bloque.id, cambios: { posterId: img.id }, ahora: Date.now() })
      alCerrar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), { tipo: 'error' })
    }
  }

  const subir = async (): Promise<void> => {
    const [f] = await elegirArchivos('image/png,image/jpeg', false)
    if (!f || !medio?.ancho || !medio.alto) return
    try {
      await usar(await posterDeImagen(f, medio.ancho, medio.alto))
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), { tipo: 'error' })
    }
  }

  return (
    <dialog
      ref={marco}
      className="ajustar elegir-poster"
      aria-label={t.titulo}
      onCancel={(e) => {
        e.preventDefault()
        alCerrar()
      }}
    >
      <header>
        <h2>{t.titulo}</h2>
        <button type="button" className="cerrar" aria-label={ui.cerrar} onClick={alCerrar}>
          ×
        </button>
      </header>
      <p className="ayuda">{t.ayuda}</p>
      <div className="poster-vista">{vista ? <img src={vista.url} alt="" /> : <p className="ayuda">{t.cargando}</p>}</div>
      <label className="campo">
        <span>
          {t.momento}: {ui.formato.duracion(momento)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, segundos - 0.05)}
          step={0.05}
          defaultValue={momento}
          // Al soltar, no al moverlo: cada fotograma hay que decodificarlo.
          onPointerUp={(e) => elegir(Number(e.currentTarget.value))}
          onKeyUp={(e) => elegir(Number(e.currentTarget.value))}
        />
      </label>
      <div className="botones">
        <button type="button" className="boton-principal" disabled={!vista || ocupado} onClick={() => vista && void usar(vista.jpeg)}>
          {t.usar}
        </button>
        <button type="button" className="boton-secundario" disabled={!medio?.ancho} onClick={() => void subir()}>
          {t.subir}
        </button>
      </div>
      <p className="ayuda">{t.subirAyuda}</p>
    </dialog>
  )
}
