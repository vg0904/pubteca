import { ui } from '../../i18n/es'
import type { Copia } from '../abrir-copia'

/**
 * Lo que trae una copia, ANTES de abrirla. Nada se aplica sin confirmar, y lo
 * que no se pudo recuperar tal cual se dice aqui, a la vista, no en un aviso que
 * desaparece a los siete segundos.
 */
export function ConfirmarCopia({
  copia,
  ocupado,
  alAbrir,
  alCancelar,
}: {
  copia: Copia
  ocupado: boolean
  alAbrir: () => void
  alCancelar: () => void
}) {
  const p = copia.proyecto
  const fecha = copia.creada !== null ? new Date(copia.creada).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  return (
    <section className="confirmar-copia" role="dialog" aria-label={ui.copia.titulo}>
      <h2>{ui.copia.titulo}</h2>
      <p className="copia-libro">
        <strong>{p.datos.titulo || ui.inicio.sinTitulo}</strong>
        {p.datos.autor && <span> · {p.datos.autor}</span>}
      </p>
      <p>{ui.copia.resumen(p.capitulos.length, p.extras.length, copia.imagenes.length)}</p>
      {fecha && <p className="ayuda">{ui.copia.hecha(fecha)}</p>}
      {copia.origen === 'carpetas' && <p className="ayuda">{ui.copia.deCarpetas}</p>}
      {copia.avisos.length > 0 && (
        <div className="alerta nivel-aviso">
          <p>{ui.copia.hayAvisos}</p>
          <ul>
            {copia.avisos.map((a, i) => (
              <li key={i}>{ui.copia.avisos[a.clave](a.detalle)}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="botones">
        <button type="button" className="boton-principal" onClick={alAbrir} disabled={ocupado}>
          {ui.copia.abrirLibro}
        </button>
        <button type="button" className="boton-secundario" onClick={alCancelar} disabled={ocupado}>
          {ui.copia.cancelar}
        </button>
      </div>
    </section>
  )
}
