import { useMemo, useState } from 'react'
import { ui } from '../../i18n/es'
import { reporte, TARIFA_POR_MB } from '../../core/reporte'
import { agrupar, cuentas, type Grupo } from '../avisos'
import { descargar } from '../copia'
import type { Estado } from '../estado'
import { dolares, tamano } from '../formato'
import { generarLibros, type Generado } from '../generar'
import type { DatosLibro, Proyecto } from '../modelo'
import { bloquea, cambioDeIdentidad, nombresLegibles, revisar, type Problema } from '../revision'
import { useAvisar, useDespacho, useMedios } from './contexto'

/** Solo los idiomas en que el libro sabe escribir sus propios textos. */
const IDIOMAS = Object.entries(ui.descargar.idiomas)

type CampoTexto = Exclude<keyof DatosLibro, 'incluirContraportada'>

function Campo({
  campo,
  datos,
  ayuda,
  tipo = 'text',
  requerido = false,
}: {
  campo: CampoTexto
  datos: DatosLibro
  ayuda?: string
  tipo?: 'text' | 'date'
  requerido?: boolean
}) {
  const despachar = useDespacho()
  const etiqueta = ui.descargar.campos[campo as keyof typeof ui.descargar.campos] ?? campo
  return (
    <label className={`campo${requerido && !datos[campo].trim() ? ' falta' : ''}`}>
      <span>
        {etiqueta}
        {requerido && ' *'}
      </span>
      <input
        type={tipo}
        value={datos[campo]}
        required={requerido}
        onChange={(e) => despachar({ tipo: 'dato', campo, valor: e.target.value, ahora: Date.now() })}
      />
      {ayuda && <small>{ayuda}</small>}
    </label>
  )
}

/** Un renglon de la revision, con icono Y palabra: nunca solo color. */
function Nivel({ nivel }: { nivel: 'bloquea' | 'error' | 'aviso' | 'nota' }) {
  return (
    <span className={`nivel nivel-${nivel}`}>
      <span aria-hidden="true">{ui.niveles[nivel].icono}</span> {ui.niveles[nivel].palabra}
    </span>
  )
}

function Problemas({ problemas }: { problemas: readonly Problema[] }) {
  const despachar = useDespacho()
  if (problemas.length === 0) return <p className="todo-bien">{ui.descargar.todoBien}</p>
  return (
    <ul className="revision">
      {problemas.map((x, i) => (
        <li key={i} className={`nivel-${x.nivel}`}>
          <Nivel nivel={x.nivel} />
          <span className="revision-texto">
            {ui.problemas[x.clave]} {x.ir && <em>{x.que}</em>}
          </span>
          {x.ir && (
            <button
              type="button"
              className="boton-secundario"
              onClick={() => {
                const ir = x.ir
                if (!ir) return
                if ('capitulo' in ir) despachar({ tipo: 'abrirCapitulo', id: ir.capitulo })
                else if ('extra' in ir) despachar({ tipo: 'abrirExtra', id: ir.extra })
                else despachar({ tipo: 'irA', seccion: ir.seccion })
              }}
            >
              {ui.descargar.ir}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function Grupos({ grupos, nombres }: { grupos: readonly Grupo[]; nombres: ReadonlyMap<string, string> }) {
  const c = cuentas(grupos)
  return (
    <div className="grupos">
      {c.mensajes > c.grupos && <p className="ayuda">{ui.descargar.resultadoResumen(c.mensajes, c.grupos)}</p>}
      <ul className="revision">
        {grupos.map((g, i) => {
          const t = ui.grupos[g.clave]
          return (
            <li key={i} className={`nivel-${g.nivel}`}>
              <Nivel nivel={g.nivel} />
              <div className="revision-texto">
                <p>
                  <strong>{g.clave === 'otro' ? g.mensajes[0] : t.titulo}</strong>
                  {g.elementos.length > 0 && ` · ${ui.descargar.afectadas(g.elementos.length)}`}
                </p>
                {t.consejo && <p className="ayuda">{t.consejo}</p>}
                {g.elementos.length > 0 && (
                  <details>
                    <summary>{g.elementos.slice(0, 3).map((e) => nombres.get(e) ?? e).join(' · ')}{g.elementos.length > 3 ? ' …' : ''}</summary>
                    <ul className="afectadas">
                      {g.elementos.map((e) => (
                        <li key={e}>{nombres.get(e) ?? e}</li>
                      ))}
                    </ul>
                    <p className="rotulo">{ui.descargar.verDetalle}</p>
                    <ul className="originales">
                      {g.mensajes.map((m, k) => (
                        <li key={k}>{m}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Lo que identifica el contenido del libro, sin los hechos (descargado, copia). */
function huella(p: Proyecto): readonly unknown[] {
  return [p.datos, p.capitulos, p.extras, p.laminas, p.portada]
}
const mismaHuella = (a: readonly unknown[], b: readonly unknown[]): boolean => a.every((x, i) => x === b[i])

export function PantallaDescargar({ estado }: { estado: Estado }) {
  const despachar = useDespacho()
  const avisar = useAvisar()
  const { repo } = useMedios()
  const p = estado.proyecto as Proyecto
  const [generado, setGenerado] = useState<{ g: Generado; huella: readonly unknown[]; ahora: Date } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const problemas = useMemo(() => revisar(p, estado.imagenes), [p, estado.imagenes])
  const identidad = cambioDeIdentidad(p)
  const viejo = generado !== null && !mismaHuella(generado.huella, huella(p))

  const generar = async (): Promise<void> => {
    if (!repo) return
    setOcupado(true)
    try {
      const ahora = new Date()
      const g = await generarLibros(p, estado.imagenes, repo, ahora)
      setGenerado({ g, huella: huella(p), ahora })
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), { tipo: 'error' })
    } finally {
      setOcupado(false)
    }
  }

  const c = generado?.g.construccion
  const grupos = useMemo(() => (c ? agrupar(c.diagnosticos) : []), [c])
  const nombres = useMemo(
    () => (generado ? nombresLegibles(p, estado.imagenes, generado.g.exportado.nombres) : new Map<string, string>()),
    [generado, p, estado.imagenes],
  )

  const bajar = (tienda: 'Kindle' | 'AppleBooks'): void => {
    const r = c?.resultados.find((x) => x.tienda === tienda)
    if (!r || !c) return
    // Dentro del clic: Safari descarta las descargas sin activacion del usuario.
    descargar(r.bytes, r.nombreArchivo, 'application/epub+zip')
    despachar({ tipo: 'descargado', uid: c.uid, cuando: Date.now() })
  }

  const kindle = c?.resultados.find((r) => r.tienda === 'Kindle')
  const apple = c?.resultados.find((r) => r.tienda === 'AppleBooks')

  return (
    <div className="pantalla pantalla-descargar">
      <h1>{ui.descargar.titulo}</h1>

      <section className="datos">
        <h2>{ui.descargar.datos}</h2>
        <p className="ayuda">{ui.descargar.datosAyuda}</p>
        <div className="rejilla-campos">
          <Campo campo="titulo" datos={p.datos} requerido />
          <Campo campo="autor" datos={p.datos} />
          <Campo campo="subtitulo" datos={p.datos} />
          <Campo campo="sello" datos={p.datos} />
          <Campo campo="isbn" datos={p.datos} ayuda={ui.descargar.campos.isbnAyuda} />
          <Campo campo="fechaPublicacion" datos={p.datos} tipo="date" />
          <label className="campo">
            <span>{ui.descargar.campos.idioma}</span>
            <select
              value={p.datos.idioma}
              onChange={(e) => despachar({ tipo: 'dato', campo: 'idioma', valor: e.target.value, ahora: Date.now() })}
            >
              {IDIOMAS.map(([cod, nombre]) => (
                <option key={cod} value={cod}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>
          <Campo campo="derechos" datos={p.datos} ayuda={ui.descargar.campos.derechosAyuda} />
        </div>
        <label className="campo ancho">
          <span>{ui.descargar.campos.descripcion}</span>
          <textarea
            rows={3}
            value={p.datos.descripcion}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
            onChange={(e) => despachar({ tipo: 'dato', campo: 'descripcion', valor: e.target.value, ahora: Date.now() })}
          />
        </label>
        {identidad && (
          <p className="alerta nivel-aviso">
            <Nivel nivel="aviso" /> {ui.descargar.identidad(identidad.antes.titulo, identidad.antes.autor)}
          </p>
        )}
      </section>

      <section>
        <h2>{ui.descargar.revision}</h2>
        <Problemas problemas={problemas} />
        <button type="button" className="boton-principal" disabled={ocupado || bloquea(problemas) || !repo} onClick={() => void generar()}>
          {ocupado ? ui.descargar.generando : generado ? ui.descargar.regenerar : ui.descargar.generar}
        </button>
        {bloquea(problemas) && <p className="ayuda">{ui.descargar.bloqueado}</p>}
        {ocupado && <div className="progreso" role="progressbar" aria-label={ui.descargar.generando} />}
      </section>

      {c && (
        <section className="resultado">
          {c.bloqueado ? (
            <p className="alerta nivel-bloquea">
              <Nivel nivel="bloquea" /> {c.bloqueado}
            </p>
          ) : (
            <>
              {viejo ? <p className="alerta nivel-aviso">{ui.descargar.desactualizado}</p> : <p>{ui.descargar.listos}</p>}
              <div className="descargas">
                {kindle && (
                  <button type="button" className="boton-descarga" disabled={viejo} onClick={() => bajar('Kindle')}>
                    <strong>{ui.descargar.kindle}</strong>
                    <span>
                      {tamano(kindle.bytes.length)} · {ui.descargar.tarifa(dolares((kindle.bytes.length / 1e6) * TARIFA_POR_MB))}
                    </span>
                  </button>
                )}
                {apple && (
                  <button type="button" className="boton-descarga" disabled={viejo} onClick={() => bajar('AppleBooks')}>
                    <strong>{ui.descargar.apple}</strong>
                    <span>{tamano(apple.bytes.length)}</span>
                  </button>
                )}
              </div>
              <p className="ayuda">{ui.descargar.tarifaAyuda}</p>
              {generado?.g.sinFuentes && <p className="alerta nivel-nota">{ui.descargar.sinFuentes}</p>}
            </>
          )}
          {(grupos.length > 0 || (generado?.g.exportado.avisos.length ?? 0) > 0) && (
            <>
              <h2>{ui.descargar.resultado}</h2>
              <Grupos grupos={grupos} nombres={nombres} />
              {generado && generado.g.exportado.avisos.length > 0 && (
                <ul className="revision">
                  {generado.g.exportado.avisos.map((a, i) => (
                    <li key={i} className="nivel-aviso">
                      <Nivel nivel="aviso" />
                      <div className="revision-texto">
                        <p>
                          <strong>{a.que}</strong>
                        </p>
                        <p>{a.porque}</p>
                        <p className="ayuda">{a.sugerencia}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {generado && (
            <button
              type="button"
              className="enlace"
              onClick={() =>
                descargar(new TextEncoder().encode(reporte(generado.g.construccion, generado.ahora)), 'reporte.txt', 'text/plain;charset=utf-8')
              }
            >
              {ui.descargar.reporte}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
