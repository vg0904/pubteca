import type { Foco } from '../estado'
import { crearId } from '../ids'
import type { DondeExtra, Extra, Proyecto, TipoExtra } from '../modelo'
import { nombreDeExtra } from '../revision'
import { useAvisar, useDespacho, useTextos } from './contexto'
import { EditorExtra } from './EditorCapitulo'
import { Menu } from './Menu'

function Grupo({ titulo, extras, activo, todos }: { titulo: string; extras: readonly Extra[]; activo: string | null; todos: readonly Extra[] }) {
  const ui = useTextos()
  const despachar = useDespacho()
  const avisar = useAvisar()
  if (extras.length === 0) return null
  return (
    <div className="grupo-extras">
      <p className="rotulo">{titulo}</p>
      <ul>
        {extras.map((x) => {
          const i = todos.indexOf(x)
          const antes = todos[i - 1]
          const despues = todos[i + 1]
          const mismoGrupo = (y: Extra | undefined): boolean => y?.tipo === 'conTitulo' && x.tipo === 'conTitulo' && y.donde === x.donde
          return (
            <li key={x.id} className={x.id === activo ? 'activo' : ''}>
              <button type="button" className="extra-nombre" onClick={() => despachar({ tipo: 'abrirExtra', id: x.id })}>
                {nombreDeExtra(x)}
              </button>
              <Menu
                etiqueta={ui.capitulos.menu(nombreDeExtra(x))}
                opciones={[
                  x.tipo === 'conTitulo' && {
                    etiqueta: ui.extras.subir,
                    desactivada: !mismoGrupo(antes),
                    accion: () => despachar({ tipo: 'moverExtra', id: x.id, delta: -1 }),
                  },
                  x.tipo === 'conTitulo' && {
                    etiqueta: ui.extras.bajar,
                    desactivada: !mismoGrupo(despues),
                    accion: () => despachar({ tipo: 'moverExtra', id: x.id, delta: 1 }),
                  },
                  x.tipo === 'conTitulo' && {
                    etiqueta: x.donde === 'inicio' ? ui.extras.moverAlFinal : ui.extras.moverAlPrincipio,
                    accion: () => despachar({ tipo: 'dondeExtra', id: x.id, donde: x.donde === 'inicio' ? 'final' : 'inicio' }),
                  },
                  {
                    etiqueta: ui.extras.borrar,
                    peligro: true,
                    accion: () => {
                      despachar({ tipo: 'borrarExtra', id: x.id })
                      avisar(ui.capitulos.borrado(nombreDeExtra(x)), { deshacer: true })
                    },
                  },
                ]}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function PantallaExtras({
  proyecto,
  extra,
  foco,
  separador,
  bloqueActivo,
}: {
  proyecto: Proyecto
  extra: Extra | null
  foco: Foco | null
  separador: string
  bloqueActivo: string | null
}) {
  const ui = useTextos()
  const despachar = useDespacho()
  const extras = proyecto.extras
  const hay = (t: TipoExtra): boolean => extras.some((x) => x.tipo === t)
  const nuevo = (clase: TipoExtra, donde: DondeExtra): void =>
    despachar({ tipo: 'nuevoExtra', id: crearId('extra'), clase, donde, bloque: crearId('b') })

  return (
    <div className="pantalla pantalla-extras">
      <div className="extras-lista">
        <h1>{ui.extras.titulo}</h1>
        <p className="ayuda">{ui.extras.ayuda}</p>
        <Grupo
          titulo={ui.extras.alPrincipio}
          extras={extras.filter((x) => x.donde === 'inicio')}
          activo={extra?.id ?? null}
          todos={extras}
        />
        <Grupo titulo={ui.extras.alFinal} extras={extras.filter((x) => x.donde === 'final')} activo={extra?.id ?? null} todos={extras} />
        {extras.length === 0 && <p className="ayuda">{ui.extras.vacio}</p>}
        <div className="extras-anadir">
          <button type="button" disabled={hay('dedicatoria')} title={hay('dedicatoria') ? ui.extras.yaHay : undefined} onClick={() => nuevo('dedicatoria', 'inicio')}>
            {ui.extras.anadirDedicatoria}
          </button>
          <button type="button" disabled={hay('epigrafe')} title={hay('epigrafe') ? ui.extras.yaHay : undefined} onClick={() => nuevo('epigrafe', 'inicio')}>
            {ui.extras.anadirEpigrafe}
          </button>
          <button type="button" onClick={() => nuevo('conTitulo', 'inicio')}>
            {ui.extras.anadirInicio}
          </button>
          <button type="button" onClick={() => nuevo('conTitulo', 'final')}>
            {ui.extras.anadirFinal}
          </button>
        </div>
      </div>
      {extra && (
        <div className="extras-editor">
          <p className="rotulo">{extra.tipo === 'conTitulo' ? (extra.donde === 'inicio' ? ui.extras.inicio : ui.extras.final) : nombreDeExtra(extra)}</p>
          <EditorExtra key={extra.id} extra={extra} foco={foco} separador={separador} bloqueActivo={bloqueActivo} />
        </div>
      )}
    </div>
  )
}
