/**
 * «Libro para la web»: el libro, o una muestra, en un .zip que se sube a un
 * sitio web o se integra en uno que ya existe.
 *
 * La pantalla decide tres cosas (que se publica, donde se consigue el libro
 * entero, si se aligeran las imagenes) y prepara el .zip. Lo que decide se
 * guarda con el libro (`Proyecto.web`); el .zip, no: se prepara cada vez, como
 * los EPUB, y se marca viejo en cuanto el libro cambia.
 *
 * Se carga con `import()` al entrar, como el impreso y la cubierta.
 */
import { useEffect, useMemo, useState, type Dispatch } from 'react'
import { MAX_ENLACES, type ConfigWeb, type EnlaceWeb, type ModoLectura } from '../../core/web/config'
import { archivosDeLetra, familiasWeb, LETRA_SISTEMA, RESPALDO_SERIF, RESPALDO_SISTEMA } from '../../core/web/letras'
import { agrupar } from '../avisos'
import { descargar } from '../copia'
import type { Accion, Estado } from '../estado'
import type { Proyecto } from '../modelo'
import { bloquea, revisar } from '../revision'
import { generarWeb, type WebGenerada } from '../web/generar'
import { capitulosPublicados, configWeb, estadoDeEnlace, partesElegibles } from '../web/preparar'
import { useAvisar, useDespacho, useLengua, useMedios, useTextos } from './contexto'

/** Lo que cambia el .zip: con cualquiera de esto distinto, el preparado ya no es el libro. */
function huella(p: Proyecto): readonly unknown[] {
  return [p.datos, p.capitulos, p.extras, p.laminas, p.portada, p.web]
}
const mismaHuella = (a: readonly unknown[], b: readonly unknown[]): boolean => a.every((x, i) => x === b[i])

/**
 * Cada nombre de letra se escribe en su letra: se registra su cara normal (la
 * misma del impreso, de `public/fuentes/impreso/`) la primera vez que se entra.
 */
let letrasRegistradas = false
function registrarMuestras(): void {
  if (letrasRegistradas || typeof FontFace !== 'function' || !document.fonts) return
  letrasRegistradas = true
  for (const f of familiasWeb()) {
    const regular = archivosDeLetra(f).caras[0]
    if (!regular) continue
    const cara = new FontFace(`Pubteca ${f.nombre}`, `url("${import.meta.env.BASE_URL}fuentes/impreso/${regular.ttf}")`, { display: 'swap' })
    document.fonts.add(cara)
    cara.load().catch(() => undefined)
  }
}

/** Un cambio de las opciones, con su hora (la que agrupa el deshacer). Solo se llama desde un evento. */
function cambiarWeb(despachar: Dispatch<Accion>, cambios: Partial<ConfigWeb>): void {
  despachar({ tipo: 'web', cambios, ahora: Date.now() })
}

export default function PantallaWeb({ estado }: { estado: Estado }) {
  const ui = useTextos()
  const t = ui.web
  const despachar = useDespacho()
  const avisar = useAvisar()
  const { idioma } = useLengua()
  const { repo } = useMedios()
  const p = estado.proyecto as Proyecto
  const c = configWeb(p)
  const [ocupado, setOcupado] = useState(false)
  const [generado, setGenerado] = useState<{ g: WebGenerada; huella: readonly unknown[] } | null>(null)

  useEffect(registrarMuestras, [])
  const letras = useMemo(
    () => [
      ...familiasWeb().map((f) => ({ id: f.id, nombre: f.nombre, pila: `"Pubteca ${f.nombre}", ${RESPALDO_SERIF}` })),
      { id: LETRA_SISTEMA, nombre: t.lectura.sistema, pila: RESPALDO_SISTEMA },
    ],
    [t.lectura.sistema],
  )
  const modos: readonly { id: ModoLectura; titulo: string; texto: string }[] = [
    { id: 'desplazar', titulo: t.lectura.desplazar, texto: t.lectura.desplazarTexto },
    { id: 'paginas', titulo: t.lectura.paginas, texto: t.lectura.paginasTexto },
  ]

  const partes = useMemo(() => partesElegibles(p), [p])
  const { publicados, total } = capitulosPublicados(p)
  const problemas = useMemo(() => revisar(p, estado.imagenes, repo?.medios() ?? new Map()), [p, estado.imagenes, repo])
  const noSePuede = bloquea(problemas)
  const viejo = generado !== null && !mismaHuella(generado.huella, huella(p))

  const cambiar = (cambios: Partial<ConfigWeb>): void => cambiarWeb(despachar, cambios)
  const publicar = (id: string, si: boolean): void => cambiar({ omitidos: si ? c.omitidos.filter((x) => x !== id) : [...c.omitidos, id] })
  const enlace = (i: number, cambios: Partial<EnlaceWeb>): void => cambiar({ enlaces: c.enlaces.map((e, k) => (k === i ? { ...e, ...cambios } : e)) })

  const preparar = async (): Promise<void> => {
    if (!repo) return
    setOcupado(true)
    try {
      const g = await generarWeb(p, estado.imagenes, repo, new Date(), idioma)
      setGenerado({ g, huella: huella(p) })
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), { tipo: 'error' })
    } finally {
      setOcupado(false)
    }
  }

  const r = generado?.g.respuesta
  const grupos = useMemo(() => (r ? agrupar(r.diagnosticos) : []), [r])

  return (
    <div className="pantalla pantalla-web">
      <h1>{t.titulo}</h1>
      <p className="ayuda">{t.que}</p>

      <section className="por-tienda">
        <h2>{t.publicar.titulo}</h2>
        <p className="ayuda">{t.publicar.ayuda}</p>
        <ul className="web-partes">
          {partes.map((x) => (
            <li key={x.id}>
              <label className="casilla">
                <input type="checkbox" checked={x.publicada} onChange={(e) => publicar(x.id, e.target.checked)} />
                <span>
                  {x.nombre}
                  {x.clase === 'extra' && <span className="ayuda"> · {t.publicar.extra}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
        {publicados === 0 ? (
          <p className="alerta nivel-bloquea">{t.publicar.ninguno}</p>
        ) : (
          <p>
            <strong>{publicados < total ? t.publicar.muestra(publicados, total) : t.publicar.entero}</strong>{' '}
            <span className="ayuda">{t.publicar.siempre}</span>
          </p>
        )}
        {c.omitidos.length > 0 && (
          <button type="button" className="boton-secundario" onClick={() => cambiar({ omitidos: [] })}>
            {t.publicar.todo}
          </button>
        )}
      </section>

      <section className="por-tienda">
        <h2>{t.enlaces.titulo}</h2>
        <p className="ayuda">{t.enlaces.ayuda}</p>
        {c.enlaces.map((e, i) => (
          <div key={i} className="web-enlace">
            <label className="campo">
              <span>{t.enlaces.etiqueta}</span>
              <input type="text" value={e.etiqueta} placeholder={t.enlaces.etiquetaEjemplo} onChange={(ev) => enlace(i, { etiqueta: ev.target.value })} />
            </label>
            <label className={`campo${estadoDeEnlace(e) === 'mal' ? ' falta' : ''}`}>
              <span>{t.enlaces.url}</span>
              <input
                type="url"
                inputMode="url"
                autoCapitalize="off"
                spellCheck={false}
                value={e.url}
                placeholder={t.enlaces.urlEjemplo}
                onChange={(ev) => enlace(i, { url: ev.target.value })}
              />
              {estadoDeEnlace(e) === 'mal' && <small>{t.enlaces.mal}</small>}
            </label>
            <button
              type="button"
              className="boton-secundario web-quitar"
              aria-label={t.enlaces.quitar(i + 1)}
              title={t.enlaces.quitar(i + 1)}
              onClick={() => cambiar({ enlaces: c.enlaces.filter((_, k) => k !== i) })}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ))}
        {c.enlaces.length < MAX_ENLACES && (
          <button type="button" className="boton-secundario" onClick={() => cambiar({ enlaces: [...c.enlaces, { etiqueta: '', url: '' }] })}>
            + {t.enlaces.anadir}
          </button>
        )}
      </section>

      <section className="por-tienda">
        <h2>{t.lectura.titulo}</h2>
        <p className="ayuda">{t.lectura.ayuda}</p>
        <fieldset className="web-grupo">
          <legend>{t.lectura.modo}</legend>
          <div className="web-modos">
            {modos.map((m) => (
              <label key={m.id} className={`web-modo${c.modo === m.id ? ' elegido' : ''}`}>
                <input type="radio" name="web-modo" checked={c.modo === m.id} onChange={() => cambiar({ modo: m.id })} />
                <strong>{m.titulo}</strong>
                <span className="ayuda">{m.texto}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="web-grupo">
          <legend>{t.lectura.letra}</legend>
          <div className="web-letras">
            {letras.map((l) => (
              <label key={l.id} className={`web-letra${c.letra === l.id ? ' elegido' : ''}`}>
                <input type="radio" name="web-letra" checked={c.letra === l.id} onChange={() => cambiar({ letra: l.id })} />
                <span className="web-letra-nombre" style={{ fontFamily: l.pila }}>
                  {l.nombre}
                </span>
                <span className="web-letra-muestra" style={{ fontFamily: l.pila }} aria-hidden="true">
                  Aa Bb 123 «¿?»
                </span>
              </label>
            ))}
          </div>
          <p className="ayuda">{c.letra === LETRA_SISTEMA ? t.lectura.sistemaTexto : t.lectura.letraAyuda}</p>
        </fieldset>
      </section>

      <section className="por-tienda">
        <h2>{t.imagenes.titulo}</h2>
        <label className="casilla">
          <input type="checkbox" checked={c.aligerar} onChange={(e) => cambiar({ aligerar: e.target.checked })} />
          {t.imagenes.aligerar}
        </label>
        <p className="ayuda">{t.imagenes.ayuda}</p>
      </section>

      <section>
        <p className="alerta nivel-nota">{t.copiar}</p>
        <button type="button" className="boton-principal" disabled={ocupado || noSePuede || publicados === 0 || !repo} onClick={() => void preparar()}>
          {ocupado ? t.preparando : generado ? t.otraVez : t.preparar}
        </button>
        {noSePuede && (
          <p className="ayuda">
            {t.bloqueado}{' '}
            <button type="button" className="enlace" onClick={() => despachar({ tipo: 'irA', seccion: 'descargar' })}>
              {t.irADescargar}
            </button>
          </p>
        )}
        {ocupado && <div className="progreso" role="progressbar" aria-label={t.preparando} />}
      </section>

      {r && generado && (
        <section className="resultado">
          {r.bloqueado || !r.bytes ? (
            <p className="alerta nivel-bloquea">{r.bloqueado}</p>
          ) : (
            <>
              {viejo ? <p className="alerta nivel-aviso">{t.desactualizado}</p> : <p>{t.listo}</p>}
              <div className="descargas">
                <button
                  type="button"
                  className="boton-descarga"
                  disabled={viejo}
                  // Dentro del clic: Safari descarta las descargas sin activacion del usuario.
                  onClick={() => r.bytes && descargar(r.bytes, r.nombreArchivo, 'application/zip')}
                >
                  <strong>{t.descargar}</strong>
                  <span>{t.detalle(ui.formato.tamano(r.bytes.length), r.partes, r.imagenes, r.letras)}</span>
                </button>
              </div>
              {r.muestra && <p className="ayuda">{t.esMuestra}</p>}
              {r.letras === 0 && <p className="alerta nivel-aviso">{t.sinLetras}</p>}
              {generado.g.imagenes && (
                <p className="ayuda">{t.imagenes.aligeradas(ui.formato.tamano(generado.g.imagenes.antes), ui.formato.tamano(generado.g.imagenes.ahora))}</p>
              )}
              {r.sinMedios.videos + r.sinMedios.audios > 0 && <p className="alerta nivel-nota">{t.sinMedios(r.sinMedios.videos, r.sinMedios.audios)}</p>}
            </>
          )}
          {grupos.length > 0 && (
            <ul className="revision">
              {grupos.map((g, i) => (
                <li key={i} className={`nivel-${g.nivel}`}>
                  <span className={`nivel nivel-${g.nivel}`}>
                    <span aria-hidden="true">{ui.niveles[g.nivel].icono}</span> {ui.niveles[g.nivel].palabra}
                  </span>
                  <span className="revision-texto">
                    <strong>{g.clave === 'otro' ? g.mensajes[0] : ui.grupos[g.clave].titulo}</strong>
                    {g.elementos.length > 0 && ` · ${ui.descargar.afectadas(g.elementos.length)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {r.bytes && (
            <>
              <h2>{t.como.titulo}</h2>
              <ol className="web-como">
                {([t.como.tal, t.como.incrustado, t.como.integrado] as const).map((x) => (
                  <li key={x.titulo}>
                    <strong>{x.titulo}.</strong> {x.texto}
                  </li>
                ))}
              </ol>
              <p className="ayuda">{t.como.probar}</p>
            </>
          )}
        </section>
      )}
    </div>
  )
}
