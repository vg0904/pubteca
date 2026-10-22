import { useEffect, useState } from 'react'
import {
  capituloActual,
  extraActual,
  numeracionDesordenada,
  puedeDeshacer,
  puedeRehacer,
  type Estado,
  type Seccion,
} from '../estado'
import { diasEntre } from '../formato'
import { crearId } from '../ids'
import type { Capitulo, Proyecto } from '../modelo'
import { nombreDeCapitulo } from '../revision'
import { useAvisar, useDespacho, useTextos } from './contexto'
import { EditorCapitulo } from './EditorCapitulo'
import { Menu } from './Menu'
import { PantallaDescargar } from './Descargar'
import { PantallaExtras } from './Extras'
import { PantallaPortada } from './Portada'
import { SelectorIdioma } from './SelectorIdioma'

export type EstadoGuardado = 'guardado' | 'guardando' | 'error' | 'sinAlmacen' | 'conflicto'

/** Dias a partir de los cuales la copia se marca en ambar. */
const DIAS_COPIA_VIEJA = 7

function BarraSuperior({
  proyecto,
  guardado,
  deshacer,
  rehacer,
  alGuardarCopia,
  copia,
}: {
  proyecto: Proyecto
  guardado: EstadoGuardado
  deshacer: boolean
  rehacer: boolean
  alGuardarCopia: () => void
  copia: 'lista' | 'preparando' | null
}) {
  const ui = useTextos()
  const despachar = useDespacho()
  // La hora de cuando se abrio el libro. Una copia guardada despues cuenta
  // como «hoy» (diasEntre no baja de cero).
  const [ahora] = useState(() => Date.now())
  const ultima = proyecto.ultimaCopia
  const vieja = ultima === undefined || diasEntre(ultima, ahora) >= DIAS_COPIA_VIEJA
  return (
    <header className="barra">
      <button type="button" className="marca" onClick={() => despachar({ tipo: 'cerrar' })} title={ui.barra.inicio}>
        <img className="logo-app" src={`${import.meta.env.BASE_URL}icono-192.png`} alt="" width={22} height={22} />
        {ui.nombre}
      </button>
      <span className="barra-titulo">{proyecto.datos.titulo || ui.inicio.sinTitulo}</span>
      <span className={`estado-guardado estado-${guardado}`} role="status">
        {guardado === 'guardando'
          ? ui.barra.guardando
          : guardado === 'error'
            ? ui.barra.errorGuardar
            : guardado === 'sinAlmacen'
              ? ui.inicio.privado
              : guardado === 'conflicto'
                ? ui.barra.noSeGuarda
                : ui.barra.guardado}
      </span>
      <span className="barra-espacio" />
      <SelectorIdioma />
      <span className="deshacer-rehacer">
        <button type="button" className="boton-icono" disabled={!deshacer} title={ui.barra.deshacer} aria-label={ui.barra.deshacer} onClick={() => despachar({ tipo: 'deshacer' })}>
          ↶
        </button>
        <button type="button" className="boton-icono" disabled={!rehacer} title={ui.barra.rehacer} aria-label={ui.barra.rehacer} onClick={() => despachar({ tipo: 'rehacer' })}>
          ↷
        </button>
      </span>
      <div className={`copia${vieja ? ' vieja' : ''}`}>
        <button type="button" className="boton-copia" onClick={alGuardarCopia} disabled={copia === 'preparando'}>
          {copia === 'preparando' ? ui.barra.preparandoCopia : ui.barra.copia}
        </button>
        <span className="copia-cuando" title={vieja ? ui.barra.copiaVieja : undefined}>
          {ultima === undefined ? ui.barra.copiaNunca : ui.barra.copiaHace(ui.formato.haceDias(diasEntre(ultima, ahora)))}
        </span>
      </div>
    </header>
  )
}

function ListaCapitulos({ capitulos, activo, seccion }: { capitulos: readonly Capitulo[]; activo: string | null; seccion: Seccion }) {
  const ui = useTextos()
  const despachar = useDespacho()
  const avisar = useAvisar()
  const [arrastrado, setArrastrado] = useState<string | null>(null)
  const [destino, setDestino] = useState<number | null>(null)

  const mover = (id: string, a: number): void => despachar({ tipo: 'moverCapitulo', id, a })
  const borrar = (c: Capitulo, i: number): void => {
    despachar({ tipo: 'borrarCapitulo', id: c.id })
    avisar(ui.capitulos.borrado(nombreDeCapitulo(c, i)), { deshacer: true })
  }

  const soltar = (e: React.DragEvent): void => {
    const id = e.dataTransfer.getData('text/x-pubteca-capitulo')
    e.preventDefault()
    const desde = capitulos.findIndex((c) => c.id === id)
    if (desde !== -1 && destino !== null) mover(id, destino > desde ? destino - 1 : destino)
    setArrastrado(null)
    setDestino(null)
  }

  return (
    <ol className="lista-capitulos" onDrop={soltar} onDragOver={(e) => arrastrado && e.preventDefault()}>
      {capitulos.map((c, i) => {
        const nombre = nombreDeCapitulo(c, i)
        return (
          <li
            key={c.id}
            className={[
              c.id === activo && seccion === 'capitulos' ? 'activo' : '',
              c.id === arrastrado ? 'arrastrado' : '',
              destino === i ? 'destino-antes' : '',
              destino === i + 1 && i === capitulos.length - 1 ? 'destino-despues' : '',
            ].join(' ')}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/x-pubteca-capitulo', c.id)
              e.dataTransfer.effectAllowed = 'move'
              setArrastrado(c.id)
            }}
            onDragEnd={() => {
              setArrastrado(null)
              setDestino(null)
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('text/x-pubteca-capitulo')) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              setDestino(e.clientY < r.top + r.height / 2 ? i : i + 1)
            }}
          >
            <span className="asa" aria-hidden="true" title={ui.capitulos.arrastrar}>
              ⠿
            </span>
            <button
              type="button"
              className="capitulo-nombre"
              aria-current={c.id === activo && seccion === 'capitulos' ? 'page' : undefined}
              onClick={() => despachar({ tipo: 'abrirCapitulo', id: c.id })}
            >
              {c.etiqueta && <span className="capitulo-etiqueta">{c.etiqueta}</span>}
              <span className="capitulo-titulo">{c.titulo.map((t) => t.texto).join('') || (c.etiqueta ? '' : nombre)}</span>
            </button>
            <Menu
              etiqueta={ui.capitulos.menu(nombre)}
              opciones={[
                { etiqueta: ui.capitulos.subir, desactivada: i === 0, accion: () => mover(c.id, i - 1) },
                { etiqueta: ui.capitulos.bajar, desactivada: i === capitulos.length - 1, accion: () => mover(c.id, i + 1) },
                { etiqueta: ui.capitulos.alPrincipio, desactivada: i === 0, accion: () => mover(c.id, 0) },
                { etiqueta: ui.capitulos.alFinal, desactivada: i === capitulos.length - 1, accion: () => mover(c.id, capitulos.length - 1) },
                { etiqueta: ui.capitulos.borrar, peligro: true, accion: () => borrar(c, i) },
              ]}
            />
          </li>
        )
      })}
    </ol>
  )
}

export function PantallaLibro({
  estado,
  guardado,
  alGuardarCopia,
  copia,
  alImportar,
}: {
  estado: Estado
  guardado: EstadoGuardado
  alGuardarCopia: () => void
  copia: 'lista' | 'preparando' | null
  alImportar: () => void
}) {
  const ui = useTextos()
  const despachar = useDespacho()
  const p = estado.proyecto as Proyecto
  const capitulo = capituloActual(estado)
  const extra = extraActual(estado)
  const separador = p.datos.separadorDeEscena || '* * *'
  const secciones: Seccion[] = ['capitulos', 'portada', 'extras', 'descargar']

  // Al cambiar de capitulo o de seccion se empieza por arriba, como al pasar
  // de pagina; si no, se hereda el desplazamiento del anterior.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [estado.seccion, estado.capituloActivo, estado.extraActivo])

  // En pantallas estrechas el indice se pliega: con dieciseis capitulos, el
  // texto quedaba una pantalla entera por debajo. Se abre «en» un sitio, y al
  // ir a otro se cierra solo (no hace falta un efecto que lo cierre).
  const aqui = `${estado.seccion}|${estado.capituloActivo}|${estado.extraActivo}`
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null)
  const navAbierta = abiertoEn === aqui
  const indice = capitulo ? p.capitulos.indexOf(capitulo) : -1
  const dondeEstoy =
    estado.seccion === 'capitulos' && capitulo ? nombreDeCapitulo(capitulo, indice) : ui.secciones[estado.seccion]

  return (
    <div className="libro">
      <BarraSuperior
        proyecto={p}
        guardado={guardado}
        deshacer={puedeDeshacer(estado)}
        rehacer={puedeRehacer(estado)}
        alGuardarCopia={alGuardarCopia}
        copia={copia}
      />
      <div className="libro-cuerpo">
        <nav className="lateral" aria-label={ui.nombre}>
          <button
            type="button"
            className="lateral-alternar"
            aria-expanded={navAbierta}
            onClick={() => setAbiertoEn(navAbierta ? null : aqui)}
          >
            <span className="rotulo">{ui.secciones.indice}</span>
            <span className="donde">{dondeEstoy}</span>
            <span aria-hidden="true">{navAbierta ? '▴' : '▾'}</span>
          </button>
          <ul className={`secciones${navAbierta ? ' abierta' : ''}`}>
            {secciones.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  className={estado.seccion === s ? 'activo' : ''}
                  aria-current={estado.seccion === s ? 'page' : undefined}
                  onClick={() => despachar({ tipo: 'irA', seccion: s })}
                >
                  {ui.secciones[s]}
                </button>
                {s === 'capitulos' && (
                  <>
                    <ListaCapitulos capitulos={p.capitulos} activo={estado.capituloActivo} seccion={estado.seccion} />
                    {numeracionDesordenada(p.capitulos) && (
                      <div className="alerta nivel-aviso compacta">
                        <p>{ui.capitulos.desordenada}</p>
                        <button type="button" onClick={() => despachar({ tipo: 'renumerar' })}>
                          {ui.capitulos.renumerar}
                        </button>
                      </div>
                    )}
                    <div className="lateral-acciones">
                      <button
                        type="button"
                        onClick={() =>
                          despachar({ tipo: 'nuevoCapitulo', id: crearId('cap'), bloque: crearId('b'), ...(capitulo ? { despuesDe: capitulo.id } : {}) })
                        }
                      >
                        + {ui.capitulos.nuevo}
                      </button>
                      <button type="button" className="enlace" onClick={alImportar}>
                        {ui.capitulos.importarMas}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <main className="principal">
          {estado.seccion === 'capitulos' &&
            (capitulo ? (
              <EditorCapitulo
                key={capitulo.id}
                capitulo={capitulo}
                foco={estado.foco}
                separador={separador}
                bloqueActivo={estado.bloqueActivo}
              />
            ) : (
              <div className="vacio">
                <p>{ui.capitulos.vacio}</p>
                <button
                  type="button"
                  className="boton-principal"
                  onClick={() => despachar({ tipo: 'nuevoCapitulo', id: crearId('cap'), bloque: crearId('b') })}
                >
                  + {ui.capitulos.nuevo}
                </button>
              </div>
            ))}
          {estado.seccion === 'portada' && <PantallaPortada proyecto={p} />}
          {estado.seccion === 'extras' && (
            <PantallaExtras proyecto={p} extra={extra} foco={estado.foco} separador={separador} bloqueActivo={estado.bloqueActivo} />
          )}
          {estado.seccion === 'descargar' && <PantallaDescargar estado={estado} />}
        </main>
      </div>
    </div>
  )
}
