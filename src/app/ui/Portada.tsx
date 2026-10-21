import { useState, type ReactNode } from 'react'
import { ui } from '../../i18n/es'
import { tamano } from '../formato'
import type { Imagen, Proyecto, RolPortada } from '../modelo'
import { logoEnBlanco } from '../subir'
import { useAvisar, useDespacho, useMedios } from './contexto'
import { AvisosDeImagen } from './EditorBloques'
import { elegirArchivos, esArrastreDeArchivos, imagenesDe } from './archivos'
import { Menu } from './Menu'

/** Una ranura para una imagen: elegir, soltar, cambiar y quitar. */
function Ranura({
  titulo,
  ayuda,
  imagenId,
  rolAvisos,
  alElegir,
  alQuitar,
  oscura = false,
  children,
}: {
  titulo: string
  ayuda: ReactNode
  imagenId: string | undefined
  rolAvisos: 'portada' | 'logo'
  alElegir: (archivos: File[]) => void
  alQuitar: () => void
  oscura?: boolean
  children?: ReactNode
}) {
  const { repo, imagenes } = useMedios()
  const [encima, setEncima] = useState(false)
  const imagen: Imagen | undefined = imagenId ? imagenes.get(imagenId) : undefined
  const url = imagenId && imagen ? repo?.url(imagenId) : undefined
  const elegir = async (): Promise<void> => alElegir(await elegirArchivos('image/png,image/jpeg', false))
  return (
    <section
      className={`ranura${encima ? ' encima' : ''}`}
      onDragOver={(e) => {
        if (!esArrastreDeArchivos(e)) return
        e.preventDefault()
        setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        if (!esArrastreDeArchivos(e)) return
        e.preventDefault()
        setEncima(false)
        const archivos = imagenesDe(e.dataTransfer.files).slice(0, 1)
        if (archivos.length > 0) alElegir(archivos)
      }}
    >
      <h2>{titulo}</h2>
      <p className="ayuda">{ayuda}</p>
      <div className="ranura-cuerpo">
        <div className={`ranura-imagen${oscura ? ' oscura' : ''}`}>
          {url ? <img src={url} alt="" /> : <span className="ranura-vacia">{ui.portada.soltar}</span>}
        </div>
        <div className="ranura-datos">
          {imagen && (
            <p className="medidas">
              {imagen.nombreOriginal} · {ui.portada.medidas(imagen.ancho, imagen.alto, tamano(imagen.bytes))}
            </p>
          )}
          {imagen && <AvisosDeImagen imagen={imagen} rol={rolAvisos} />}
          <div className="botones">
            <button type="button" onClick={() => void elegir()}>
              {imagen ? ui.portada.cambiar : ui.portada.elegir}
            </button>
            {imagen && (
              <button type="button" className="peligro" onClick={alQuitar}>
                {ui.portada.quitar}
              </button>
            )}
          </div>
          {children}
        </div>
      </div>
    </section>
  )
}

export function PantallaPortada({ proyecto }: { proyecto: Proyecto }) {
  const despachar = useDespacho()
  const avisar = useAvisar()
  const { subir, repo, imagenes } = useMedios()
  const p = proyecto.portada

  const poner = async (rol: RolPortada, archivos: File[]): Promise<void> => {
    const [img] = await subir(archivos)
    if (img) despachar({ tipo: 'portada', cambios: { [rol]: img.id } })
  }

  /** El logo en negro, y su version blanca hecha con canvas DESPUES de inspeccionar los bytes. */
  const ponerLogo = async (archivos: File[]): Promise<void> => {
    const [logo] = await subir(archivos)
    if (!logo) return
    const blob = repo?.blob(logo.id)
    if (!logo.alfa || !blob) {
      despachar({ tipo: 'portada', cambios: { logo: logo.id, logoBlanco: null } })
      return
    }
    try {
      const blanco = await logoEnBlanco(blob)
      const nombre = logo.nombreOriginal.replace(/\.(png|jpe?g)$/iu, '') + '-blanco.png'
      const [img] = await subir([new File([blanco], nombre, { type: 'image/png' })])
      despachar({ tipo: 'portada', cambios: { logo: logo.id, logoBlanco: img?.id ?? null } })
    } catch (e) {
      despachar({ tipo: 'portada', cambios: { logo: logo.id, logoBlanco: null } })
      avisar(e instanceof Error ? e.message : String(e), { tipo: 'error' })
    }
  }

  const logo = p.logo ? imagenes.get(p.logo) : undefined

  return (
    <div className="pantalla pantalla-portada">
      <h1>{ui.portada.titulo}</h1>

      <Ranura
        titulo={ui.portada.portada}
        ayuda={<strong>{ui.portada.portadaAyuda}</strong>}
        imagenId={p.portada}
        rolAvisos="portada"
        alElegir={(a) => void poner('portada', a)}
        alQuitar={() => despachar({ tipo: 'portada', cambios: { portada: null } })}
      />

      <Ranura
        titulo={ui.portada.contraportada}
        ayuda={ui.portada.contraportadaAyuda}
        imagenId={p.contraportada}
        rolAvisos="portada"
        alElegir={(a) => void poner('contraportada', a)}
        alQuitar={() => despachar({ tipo: 'portada', cambios: { contraportada: null } })}
      >
        <label className="casilla">
          <input
            type="checkbox"
            checked={proyecto.datos.incluirContraportada}
            onChange={(e) => despachar({ tipo: 'dato', campo: 'incluirContraportada', valor: e.target.checked, ahora: Date.now() })}
          />
          {ui.portada.incluirContraportada}
        </label>
      </Ranura>

      <Ranura
        titulo={ui.portada.logo}
        ayuda={ui.portada.logoAyuda}
        imagenId={p.logo}
        rolAvisos="logo"
        alElegir={(a) => void ponerLogo(a)}
        alQuitar={() => despachar({ tipo: 'portada', cambios: { logo: null } })}
      >
        {logo && !logo.alfa && <p className="alerta nivel-aviso compacta">{ui.portada.logoOpaco}</p>}
        {logo && p.logoBlanco && (
          <div className="logo-oscuro">
            <p className="rotulo">{ui.portada.logoBlanco}</p>
            <div className="ranura-imagen oscura">
              {repo?.url(p.logoBlanco) && <img src={repo.url(p.logoBlanco)} alt="" />}
            </div>
          </div>
        )}
        {logo && (
          <button
            type="button"
            className="enlace"
            onClick={async () => {
              const [img] = await subir(await elegirArchivos('image/png', false))
              if (img) despachar({ tipo: 'portada', cambios: { logoBlanco: img.id } })
            }}
          >
            {ui.portada.otroLogoBlanco}
          </button>
        )}
      </Ranura>

      <section className="ranura">
        <h2>{ui.portada.laminas}</h2>
        <p className="ayuda">{ui.portada.laminasAyuda}</p>
        <ol className="laminas">
          {proyecto.laminas.map((id, i) => {
            const img = imagenes.get(id)
            const url = img ? repo?.url(id) : undefined
            return (
              <li key={`${id}-${i}`}>
                <div className="ranura-imagen">{url && <img src={url} alt="" />}</div>
                <p className="medidas">{img?.nombreOriginal}</p>
                {img && <AvisosDeImagen imagen={img} rol="ilustracion" />}
                <Menu
                  etiqueta={ui.menu}
                  opciones={[
                    { etiqueta: ui.extras.subir, desactivada: i === 0, accion: () => despachar({ tipo: 'moverLamina', indice: i, delta: -1 }) },
                    {
                      etiqueta: ui.extras.bajar,
                      desactivada: i === proyecto.laminas.length - 1,
                      accion: () => despachar({ tipo: 'moverLamina', indice: i, delta: 1 }),
                    },
                    { etiqueta: ui.portada.quitar, peligro: true, accion: () => despachar({ tipo: 'quitarLamina', indice: i }) },
                  ]}
                />
              </li>
            )
          })}
        </ol>
        <button
          type="button"
          onClick={async () => {
            for (const img of await subir(await elegirArchivos('image/png,image/jpeg', true))) {
              despachar({ tipo: 'anadirLamina', imagenId: img.id })
            }
          }}
        >
          {ui.portada.anadirLamina}
        </button>
      </section>
    </div>
  )
}
