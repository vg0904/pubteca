import { useRef, useState } from 'react'
import type { Copia } from '../abrir-copia'
import type { ResumenProyecto } from '../almacen'
import { diasEntre } from '../formato'
import { ConfirmarCopia } from './AbrirCopia'
import { esArrastreDeArchivos } from './archivos'
import { useTextos } from './contexto'
import { SelectorIdioma } from './SelectorIdioma'

export const ACEPTA_MANUSCRITO = '.docx,.md,.markdown,.txt,image/png,image/jpeg,.zip'

/** El cuadro para pegar texto: el HTML del portapapeles trae la cursiva. */
export function PegarTexto({ alUsar, alCancelar }: { alUsar: (texto: string, html: string) => void; alCancelar: () => void }) {
  const ui = useTextos()
  const [texto, setTexto] = useState('')
  const html = useRef<{ texto: string; html: string } | null>(null)
  return (
    <div className="pegar" role="dialog" aria-label={ui.importar.pegar}>
      <p className="ayuda">{ui.importar.pegarAyuda}</p>
      <textarea
        autoFocus
        rows={10}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onPaste={(e) => {
          const h = e.clipboardData.getData('text/html')
          const t = e.clipboardData.getData('text/plain')
          if (h) html.current = { texto: t, html: h }
        }}
      />
      <div className="botones">
        <button
          type="button"
          className="boton-principal"
          disabled={texto.trim() === ''}
          onClick={() => {
            // El HTML solo vale si el autor no toco el texto despues de pegarlo.
            const h = html.current && html.current.texto.trim() === texto.trim() ? html.current.html : ''
            alUsar(texto, h)
          }}
        >
          {ui.importar.pegarListo}
        </button>
        <button type="button" className="boton-secundario" onClick={alCancelar}>
          {ui.importar.cancelar}
        </button>
      </div>
    </div>
  )
}

export function PantallaInicio({
  proyectos,
  sinAlmacen,
  ocupado,
  alNuevo,
  alImportar,
  alSoltar,
  alPegar,
  alAbrir,
  alBorrar,
  alAbrirCopia,
  copia,
  alConfirmarCopia,
  alCancelarCopia,
}: {
  proyectos: readonly ResumenProyecto[]
  sinAlmacen: string | null
  ocupado: string | null
  alNuevo: () => void
  alImportar: () => void
  alSoltar: (archivos: File[]) => void
  alPegar: (texto: string, html: string) => void
  alAbrir: (id: string) => void
  alBorrar: (p: ResumenProyecto) => void
  alAbrirCopia: () => void
  /** La copia leida que espera confirmacion. */
  copia: Copia | null
  alConfirmarCopia: () => void
  alCancelarCopia: () => void
}) {
  const ui = useTextos()
  const [encima, setEncima] = useState(false)
  const [pegando, setPegando] = useState(false)
  // La hora de cuando se abrio la pantalla basta para «modificado hace N días».
  const [ahora] = useState(() => Date.now())
  return (
    <main className="inicio">
      <SelectorIdioma className="idioma-inicio" />
      <header>
        <h1>
          <img className="logo-app" src={`${import.meta.env.BASE_URL}icono-192.png`} alt="" width={56} height={56} />
          {ui.nombre}
        </h1>
        <p className="lema">{ui.lema}</p>
        <p>{ui.descripcion}</p>
      </header>

      {sinAlmacen && <p className="alerta nivel-error">{sinAlmacen}</p>}

      <div className="inicio-acciones">
        <button type="button" className="tarjeta-accion principal" onClick={alNuevo} disabled={ocupado !== null}>
          <strong>{ui.inicio.nuevo}</strong>
          <span>{ui.inicio.nuevoDetalle}</span>
        </button>
        <div
          className={`tarjeta-accion soltar${encima ? ' encima' : ''}`}
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
            alSoltar(Array.from(e.dataTransfer.files))
          }}
        >
          <strong>{ui.inicio.importar}</strong>
          <span>{ui.inicio.importarDetalle}</span>
          <div className="botones">
            <button type="button" className="boton-principal" onClick={alImportar} disabled={ocupado !== null}>
              {ocupado ?? ui.importar.elegir}
            </button>
            <button type="button" className="boton-secundario" onClick={() => setPegando(true)} disabled={ocupado !== null}>
              {ui.importar.pegar}
            </button>
          </div>
          <span className="ayuda">{ui.importar.soltar}</span>
        </div>
      </div>

      <div className="abrir-copia">
        <button type="button" className="boton-secundario" onClick={alAbrirCopia} disabled={ocupado !== null}>
          {ui.copia.abrir}
        </button>
        <span className="ayuda">{ui.copia.abrirDetalle}</span>
      </div>

      {copia && <ConfirmarCopia copia={copia} ocupado={ocupado !== null} alAbrir={alConfirmarCopia} alCancelar={alCancelarCopia} />}

      {pegando && (
        <PegarTexto
          alUsar={(t, h) => {
            setPegando(false)
            alPegar(t, h)
          }}
          alCancelar={() => setPegando(false)}
        />
      )}

      <p className="privacidad">{ui.privacidad}</p>
      <p className="honestidad">{ui.inicio.honestidad}</p>

      {proyectos.length > 0 && (
        <section className="tus-libros">
          <h2>{ui.inicio.tusLibros}</h2>
          <ul>
            {proyectos.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{p.titulo || ui.inicio.sinTitulo}</strong>
                  <span className="ayuda">
                    {ui.inicio.capitulos(p.capitulos)} · {ui.inicio.modificado(ui.formato.haceDias(diasEntre(p.modificado, ahora)))}
                  </span>
                </div>
                <button type="button" className="boton-principal" onClick={() => alAbrir(p.id)} disabled={ocupado !== null}>
                  {ui.inicio.continuar}
                </button>
                <button type="button" className="boton-secundario peligro" onClick={() => alBorrar(p)}>
                  {ui.inicio.borrar}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
