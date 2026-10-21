import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export interface Opcion {
  readonly etiqueta: string
  readonly accion: () => void
  readonly desactivada?: boolean
  readonly peligro?: boolean
}

/**
 * Un menu desplegable accesible: se abre con el boton, se recorre con las
 * flechas y se cierra con Escape devolviendo el foco al boton.
 *
 * Es la otra mitad de cada arrastrar y soltar: en un iPad sin raton, o con el
 * teclado, arrastrar no existe, y toda accion de arrastre tiene que poder
 * hacerse desde un menu.
 */
export function Menu({
  etiqueta,
  opciones,
  icono = '⋯',
  className = '',
}: {
  etiqueta: string
  opciones: readonly (Opcion | null | false)[]
  icono?: ReactNode
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const id = useId()
  const visibles = opciones.filter((o): o is Opcion => Boolean(o))

  useEffect(() => {
    if (!abierto) return
    lista.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const fuera = (e: PointerEvent): void => {
      const t = e.target as Node
      if (!lista.current?.contains(t) && !boton.current?.contains(t)) setAbierto(false)
    }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierto])

  const cerrar = (devolverFoco: boolean): void => {
    setAbierto(false)
    if (devolverFoco) boton.current?.focus()
  }

  const teclas = (e: React.KeyboardEvent): void => {
    const items = Array.from(lista.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cerrar(true)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(i + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(i - 1 + items.length) % items.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      items[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      items[items.length - 1]?.focus()
    } else if (e.key === 'Tab') {
      cerrar(false)
    }
  }

  return (
    <div className={`menu ${className}`}>
      <button
        ref={boton}
        type="button"
        className="menu-boton"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        aria-label={etiqueta}
        title={etiqueta}
        onClick={() => setAbierto((a) => !a)}
      >
        {icono}
      </button>
      {abierto && (
        <ul ref={lista} id={id} role="menu" className="menu-lista" onKeyDown={teclas}>
          {visibles.map((o) => (
            <li role="none" key={o.etiqueta}>
              <button
                type="button"
                role="menuitem"
                disabled={o.desactivada}
                className={o.peligro ? 'peligro' : undefined}
                onClick={() => {
                  cerrar(true)
                  o.accion()
                }}
              >
                {o.etiqueta}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
