import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ui } from '../../i18n/es'
import {
  abrirAlmacen,
  borrarProyecto,
  guardarProyecto,
  leerProyecto,
  listarProyectos,
  pedirPersistencia,
  type Almacen,
  type ResumenProyecto,
} from '../almacen'
import { descargar, nombreDeCopia, zipDeCopia } from '../copia'
import { ESTADO_INICIAL, reducir } from '../estado'
import { exportar } from '../exportar'
import { bytesDelProyecto, cargarFuentes } from '../generar'
import { Guardador } from '../guardado'
import { crearId } from '../ids'
import { desdeDialecto, desdeParrafos, desdePropuesta, resultadoImportacion, type ImagenImportada } from '../importacion'
import { importarDocx } from '../importar/docx'
import type { Imagen, Proyecto } from '../modelo'
import { lineasDeHtml, lineasDeTexto } from '../pegar'
import { Repositorio } from '../repositorio'
import { decodifica, inspeccionarArchivo } from '../subir'
import { elegirArchivos } from './archivos'
import { AvisosCtx, conMod, DespachoCtx, MediosCtx, type Aviso, type Medios } from './contexto'
import { PantallaImportar } from './Importar'
import { ACEPTA_MANUSCRITO, PantallaInicio } from './Inicio'
import { PantallaLibro, type EstadoGuardado } from './Libro'

/** Cuanto se espera tras la ultima tecla para guardar. */
const ESPERA_GUARDAR = 700
/** Si la copia tarda mas que esto, Safari ya no deja descargarla sin otro clic. */
const ESPERA_COPIA = 800

const EXT_TEXTO = /\.(md|markdown|txt)$/iu
const EXT_IMAGEN = /\.(png|jpe?g)$/iu

function stem(nombre: string): string {
  return nombre.replace(/\.[^.]+$/u, '')
}

export default function App() {
  const [estado, despachar] = useReducer(reducir, ESTADO_INICIAL)
  const [db, setDb] = useState<Almacen | null>(null)
  const [sinAlmacen, setSinAlmacen] = useState<string | null>(null)
  const [proyectos, setProyectos] = useState<ResumenProyecto[]>([])
  const [repo, setRepo] = useState<Repositorio | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [copia, setCopia] = useState<'preparando' | 'lista' | null>(null)
  const copiaLista = useRef<{ bytes: Uint8Array; nombre: string } | null>(null)
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const siguienteAviso = useRef(0)

  // -- avisos breves ---------------------------------------------------------
  const avisar = useCallback((texto: string, opciones: { tipo?: 'info' | 'error'; deshacer?: boolean } = {}) => {
    const id = ++siguienteAviso.current
    setAvisos((a) => [...a.slice(-2), { id, texto, tipo: opciones.tipo ?? 'info', ...(opciones.deshacer ? { deshacer: true } : {}) }])
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), opciones.tipo === 'error' ? 12_000 : 7_000)
  }, [])

  // -- autoguardado -----------------------------------------------------------
  // El estado de guardado se DERIVA: lo guardado es el ultimo proyecto que
  // llego a IndexedDB, y si el actual es otro objeto, hay cambios en camino.
  // La logica (la cola, un pendiente por libro, los conflictos) esta en
  // guardado.ts, con sus tests.
  const [guardadoHasta, setGuardadoHasta] = useState<Proyecto | null>(null)
  const [errorGuardar, setErrorGuardar] = useState(false)
  /**
   * El libro que se dejo de guardar porque otra pestaña lo cambio. Escribir
   * encima borraria esos cambios sin avisar; ver guardarProyecto.
   */
  const [conflicto, setConflicto] = useState<string | null>(null)
  /** Nace con el almacen: ver el efecto que lo abre. */
  const [guardador, setGuardador] = useState<Guardador | null>(null)

  // -- almacen ----------------------------------------------------------------
  useEffect(() => {
    abrirAlmacen()
      .then(async (d) => {
        setDb(d)
        setGuardador(
          new Guardador({
            guardar: (p, cuando, esperado) => guardarProyecto(d, p, cuando, esperado),
            ahora: Date.now,
            espera: ESPERA_GUARDAR,
            alGuardar: (p) => {
              setGuardadoHasta(p)
              setErrorGuardar(false)
            },
            alConflicto: setConflicto,
            alError: (e) => {
              setErrorGuardar(true)
              avisar(e instanceof Error ? e.message : String(e), { tipo: 'error' })
            },
          }),
        )
        setProyectos(await listarProyectos(d))
      })
      .catch((e: unknown) => {
        setSinAlmacen(e instanceof Error ? e.message : ui.inicio.privado)
      })
  }, [avisar])

  /** Guarda ya todo lo pendiente; se puede esperar antes de leer de IndexedDB. */
  const guardarYa = useCallback(async () => {
    await guardador?.ya()
  }, [guardador])

  useEffect(() => {
    if (estado.proyecto && estado.proyecto !== guardadoHasta) guardador?.programar(estado.proyecto)
  }, [estado.proyecto, guardador, guardadoHasta])

  // Al volver al inicio se refresca la lista, DESPUES de guardar lo pendiente:
  // si no, el libro del que se acaba de salir saldria con su fecha vieja.
  useEffect(() => {
    if (estado.pantalla === 'inicio' && db) void guardarYa().then(() => listarProyectos(db)).then(setProyectos)
  }, [estado.pantalla, db, guardarYa])

  const guardado: EstadoGuardado = sinAlmacen
    ? 'sinAlmacen'
    : conflicto !== null && conflicto === estado.proyecto?.id
      ? 'conflicto'
      : errorGuardar
      ? 'error'
      : estado.proyecto === guardadoHasta
        ? 'guardado'
        : 'guardando'

  // Al ocultar la pestana (cerrar el portatil, cambiar de app en el iPad) se
  // guarda sin esperar: puede que no haya un despues.
  useEffect(() => {
    const oculta = (): void => {
      if (document.visibilityState === 'hidden') void guardarYa()
    }
    const sale = (): void => void guardarYa()
    document.addEventListener('visibilitychange', oculta)
    window.addEventListener('pagehide', sale)
    return () => {
      document.removeEventListener('visibilitychange', oculta)
      window.removeEventListener('pagehide', sale)
    }
  }, [guardarYa])

  // -- repositorio de imagenes ------------------------------------------------
  // Se cambia en los mismos gestos que abren o crean un libro, nunca en un
  // efecto: asi el repositorio que se carga al abrir es el que se usa.
  const cambiarRepo = useCallback((nuevo: Repositorio | null) => {
    setRepo((viejo) => {
      if (viejo && viejo !== nuevo) viejo.liberar()
      return nuevo
    })
  }, [])

  const subir = useCallback(
    async (archivos: readonly File[]): Promise<readonly Imagen[]> => {
      if (!repo) return []
      const subidas: Imagen[] = []
      for (const f of archivos) {
        // Los bytes ANTES que ningun canvas: ver subir.ts.
        const lectura = await inspeccionarArchivo(f)
        if (!lectura.ok) {
          avisar(`${f.name}: ${ui.imagen.rechazada[lectura.motivo]}`, { tipo: 'error' })
          continue
        }
        if (!(await decodifica(f))) {
          avisar(`${f.name}: ${ui.imagen.rechazada.ilegible}`, { tipo: 'error' })
          continue
        }
        try {
          subidas.push(await repo.anadir(crearId('img'), f.name, f, lectura.info, lectura.tipo))
        } catch (e) {
          avisar(e instanceof Error ? e.message : String(e), { tipo: 'error' })
        }
      }
      if (subidas.length > 0) despachar({ tipo: 'registrarImagenes', imagenes: subidas })
      return subidas
    },
    [repo, avisar],
  )

  const medios = useMemo<Medios>(() => ({ repo, imagenes: estado.imagenes, subir }), [repo, estado.imagenes, subir])

  // -- abrir, crear, borrar ---------------------------------------------------
  const nuevo = useCallback(() => {
    void pedirPersistencia()
    const id = crearId('libro')
    guardador?.conocer(id, null)
    cambiarRepo(new Repositorio(db, id))
    despachar({ tipo: 'nuevoProyecto', id, capitulo: crearId('cap'), bloque: crearId('b') })
  }, [db, cambiarRepo, guardador])

  const abrir = useCallback(
    async (id: string) => {
      setOcupado(ui.inicio.cargando)
      try {
        // Lo que quede por guardar se guarda ANTES de leer: si el autor sale y
        // vuelve a entrar enseguida, se leeria la version de antes y lo ultimo
        // que escribio se perderia al seguir editando.
        await guardarYa()
        const p = db ? await leerProyecto(db, id) : null
        if (!p) return
        const { repo: r, imagenes } = await Repositorio.abrir(db, id)
        cambiarRepo(r)
        // Recien leido de IndexedDB: no hay nada que volver a guardar.
        guardador?.conocer(id, p.modificado)
        setGuardadoHasta(p)
        setConflicto(null)
        despachar({ tipo: 'abrir', proyecto: p, imagenes })
      } catch (e) {
        avisar(e instanceof Error ? e.message : String(e), { tipo: 'error' })
      } finally {
        setOcupado(null)
      }
    },
    [db, avisar, cambiarRepo, guardarYa, guardador],
  )

  const borrar = useCallback(
    async (p: ResumenProyecto) => {
      if (!db || !window.confirm(ui.inicio.confirmarBorrar(p.titulo || ui.inicio.sinTitulo))) return
      await borrarProyecto(db, p.id)
      setProyectos(await listarProyectos(db))
    },
    [db],
  )

  // -- importar ---------------------------------------------------------------
  const tieneDedicatoria = Boolean(estado.proyecto?.extras.some((x) => x.tipo === 'dedicatoria'))

  const empezarConArchivos = useCallback(
    async (archivos: readonly File[]) => {
      if (archivos.length === 0) return
      const docx = archivos.filter((f) => /\.docx$/iu.test(f.name))
      const textos = archivos.filter((f) => EXT_TEXTO.test(f.name))
      const imagenes = archivos.filter((f) => EXT_IMAGEN.test(f.name) || f.type.startsWith('image/'))
      const otros = archivos.filter((f) => !docx.includes(f) && !textos.includes(f) && !imagenes.includes(f))
      for (const f of otros) avisar(ui.importar.noEntiendo(f.name), { tipo: 'error' })
      setOcupado(ui.importar.leyendo)
      try {
        if (docx.length > 0) {
          if (docx.length > 1) avisar(ui.importar.variosDocx, { tipo: 'error' })
          if (textos.length > 0 || imagenes.length > 0) avisar(ui.importar.docxYOtros)
          const f = docx[0] as File
          const propuesta = await importarDocx(await f.arrayBuffer(), { nombreArchivo: stem(f.name), nuevoId: crearId })
          despachar({ tipo: 'empezarImportacion', importacion: desdePropuesta(propuesta, f.name, tieneDedicatoria) })
          return
        }
        if (textos.length === 0) {
          if (imagenes.length > 0) avisar(ui.importar.noEntiendo(imagenes[0]?.name ?? ''), { tipo: 'error' })
          return
        }
        const leidos = await Promise.all(textos.map(async (f) => ({ nombre: f.name, texto: await f.text() })))
        const imgs: ImagenImportada[] = []
        for (const f of imagenes) {
          const lectura = await inspeccionarArchivo(f)
          const bytes = new Uint8Array(await f.arrayBuffer())
          if (lectura.ok) imgs.push({ id: crearId('img'), nombreOriginal: f.name, bytes, info: lectura.info })
          else avisar(`${f.name}: ${ui.imagen.rechazada[lectura.motivo]}`, { tipo: 'error' })
        }
        despachar({ tipo: 'empezarImportacion', importacion: desdeDialecto(leidos, imgs, crearId) })
      } catch (e) {
        avisar(ui.importar.error(archivos[0]?.name ?? '', e instanceof Error ? e.message : String(e)), { tipo: 'error' })
      } finally {
        setOcupado(null)
      }
    },
    [avisar, tieneDedicatoria],
  )

  const elegirManuscrito = useCallback(async () => {
    await empezarConArchivos(await elegirArchivos(ACEPTA_MANUSCRITO, true))
  }, [empezarConArchivos])

  const empezarConTexto = useCallback(
    (texto: string, html: string) => {
      const lineas = html ? lineasDeHtml(html) : lineasDeTexto(texto)
      despachar({
        tipo: 'empezarImportacion',
        importacion: desdeParrafos(lineas.length > 0 ? lineas : lineasDeTexto(texto), 'Texto pegado', crearId, tieneDedicatoria),
      })
    },
    [tieneDedicatoria],
  )

  const confirmarImportacion = useCallback(async () => {
    const imp = estado.importacion
    if (!imp) return
    setImportando(true)
    try {
      const r = resultadoImportacion(imp, crearId)
      const idP = estado.proyecto?.id ?? crearId('libro')
      const destino = repo && repo.proyectoId === idP ? repo : new Repositorio(db, idP)
      const imagenes: Imagen[] = []
      for (const i of r.imagenes) {
        if (i.info.tipo === null) continue
        const ext = i.info.tipo === 'png' ? '.png' : '.jpg'
        const nombre = EXT_IMAGEN.test(i.nombreOriginal) ? i.nombreOriginal : `${i.nombreOriginal}${ext}`
        imagenes.push(await destino.anadir(i.id, nombre, new Blob([i.bytes as Uint8Array<ArrayBuffer>]), i.info, i.info.tipo))
      }
      if (!estado.proyecto) {
        void pedirPersistencia()
        guardador?.conocer(idP, null)
      }
      cambiarRepo(destino)
      despachar({ tipo: 'incorporar', idProyecto: idP, capitulos: r.capitulos, extras: r.extras, imagenes })
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), { tipo: 'error' })
    } finally {
      setImportando(false)
    }
  }, [estado.importacion, estado.proyecto, repo, db, avisar, cambiarRepo, guardador])

  // -- copia (.zip) -----------------------------------------------------------
  const guardarCopia = useCallback(async () => {
    const p = estado.proyecto
    if (!p || !repo) return
    // Si la copia ya estaba hecha y el autor pulsa para bajarla, se baja YA,
    // dentro de este clic.
    if (copia === 'lista' && copiaLista.current) {
      descargar(copiaLista.current.bytes, copiaLista.current.nombre, 'application/zip')
      copiaLista.current = null
      setCopia(null)
      despachar({ tipo: 'copiaGuardada', cuando: Date.now() })
      return
    }
    setCopia('preparando')
    const empezo = performance.now()
    try {
      const [bytes, fuentes] = await Promise.all([bytesDelProyecto(p, repo), cargarFuentes()])
      const zip = zipDeCopia(exportar(p, estado.imagenes, bytes, fuentes))
      const nombre = nombreDeCopia(p.datos.titulo, new Date())
      if (performance.now() - empezo < ESPERA_COPIA) {
        descargar(zip, nombre, 'application/zip')
        setCopia(null)
        despachar({ tipo: 'copiaGuardada', cuando: Date.now() })
      } else {
        // Safari ya no deja descargar sin otro clic: se deja lista.
        copiaLista.current = { bytes: zip, nombre }
        setCopia('lista')
        avisar(ui.barra.copiaLista)
      }
    } catch (e) {
      setCopia(null)
      avisar(e instanceof Error ? e.message : String(e), { tipo: 'error' })
    }
  }, [estado.proyecto, estado.imagenes, repo, copia, avisar])

  // -- deshacer fuera de los campos de texto ------------------------------------
  useEffect(() => {
    const teclas = (e: KeyboardEvent): void => {
      if (!conMod(e) || e.key.toLowerCase() !== 'z' || e.defaultPrevented) return
      const el = e.target as HTMLElement | null
      // Un input o un textarea tienen su propio deshacer; los bloques, el suyo.
      if (el && (el.isContentEditable || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
      if (estado.pantalla !== 'libro') return
      e.preventDefault()
      despachar({ tipo: e.shiftKey ? 'rehacer' : 'deshacer' })
    }
    document.addEventListener('keydown', teclas)
    return () => document.removeEventListener('keydown', teclas)
  }, [estado.pantalla])

  return (
    <DespachoCtx.Provider value={despachar}>
      <MediosCtx.Provider value={medios}>
        <AvisosCtx.Provider value={avisar}>
          {estado.pantalla === 'inicio' && (
            <PantallaInicio
              proyectos={proyectos}
              sinAlmacen={sinAlmacen}
              ocupado={ocupado}
              alNuevo={nuevo}
              alImportar={() => void elegirManuscrito()}
              alSoltar={(a) => void empezarConArchivos(a)}
              alPegar={empezarConTexto}
              alAbrir={(id) => void abrir(id)}
              alBorrar={(p) => void borrar(p)}
            />
          )}
          {estado.pantalla === 'importar' && estado.importacion && (
            <PantallaImportar
              imp={estado.importacion}
              tieneDedicatoria={tieneDedicatoria}
              ocupado={importando}
              alConfirmar={() => void confirmarImportacion()}
            />
          )}
          {estado.pantalla === 'libro' && estado.proyecto && conflicto === estado.proyecto.id && (
            <div className="alerta nivel-error conflicto" role="alert">
              <p>
                <strong>{ui.barra.conflicto}</strong> {ui.barra.conflictoDetalle}
              </p>
              <button type="button" onClick={() => estado.proyecto && void abrir(estado.proyecto.id)}>
                {ui.barra.recargar}
              </button>
            </div>
          )}
          {estado.pantalla === 'libro' && estado.proyecto && (
            <PantallaLibro
              estado={estado}
              guardado={guardado}
              alGuardarCopia={() => void guardarCopia()}
              copia={copia}
              alImportar={() => void elegirManuscrito()}
            />
          )}
          <div className="avisos" aria-live="polite">
            {avisos.map((a) => (
              <div key={a.id} className={`aviso-breve aviso-${a.tipo}`} role={a.tipo === 'error' ? 'alert' : 'status'}>
                <span>{a.texto}</span>
                {a.deshacer && (
                  <button
                    type="button"
                    onClick={() => {
                      despachar({ tipo: 'deshacer' })
                      setAvisos((x) => x.filter((y) => y.id !== a.id))
                    }}
                  >
                    {ui.deshacer}
                  </button>
                )}
                {copia === 'lista' && a.texto === ui.barra.copiaLista && (
                  <button type="button" onClick={() => void guardarCopia()}>
                    {ui.barra.descargarCopia}
                  </button>
                )}
                <button type="button" className="cerrar" aria-label={ui.cerrar} onClick={() => setAvisos((x) => x.filter((y) => y.id !== a.id))}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </AvisosCtx.Provider>
      </MediosCtx.Provider>
    </DespachoCtx.Provider>
  )
}
