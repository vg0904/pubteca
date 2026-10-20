/**
 * Lo que un bloque del modelo SIGNIFICA, expresado en el lenguaje del motor.
 *
 * Sirve para dos cosas: la vista previa (que puede renderizar sin pasar por el
 * texto) y el test de ida y vuelta, que compara esto con lo que el motor
 * produce al leer el texto serializado. Si las dos cosas coinciden, el
 * serializador no pierde nada.
 */
import type { Bloque as BloqueCore } from '../core/parser'
import { escInline } from '../core/texto'
import { normalizarLinea, type Bloque, type Tramo } from './modelo'

/**
 * Tramos -> el mismo XHTML en linea que produce `enLinea` del motor.
 *
 * El espacio de los extremos queda FUERA de la etiqueta, igual que hace el
 * serializador, porque las regex del motor no aceptan un delimitador seguido
 * de espacio. Y es lo tipograficamente correcto.
 */
export function htmlDeTramos(tramos: readonly Tramo[]): string {
  return normalizarLinea(tramos)
    .map((t) => {
      const cursiva = t.marcas.includes('cursiva')
      const negrita = t.marcas.includes('negrita')
      if (!cursiva && !negrita) return escInline(t.texto)

      const m = /^(\s*)([\s\S]*?)(\s*)$/u.exec(t.texto)
      const antes = escInline(m?.[1] ?? '')
      const nucleo = m?.[2] ?? ''
      const despues = escInline(m?.[3] ?? '')
      if (nucleo === '') return escInline(t.texto)

      const dentro = escInline(nucleo)
      const envuelto =
        cursiva && negrita
          ? `<strong><em>${dentro}</em></strong>`
          : negrita
            ? `<strong>${dentro}</strong>`
            : `<em>${dentro}</em>`
      return `${antes}${envuelto}${despues}`
    })
    .join('')
}

/** Un bloque del modelo -> los bloques del motor que significa. */
export function bloquesDelModelo(bloques: readonly Bloque[]): BloqueCore[] {
  const salida: BloqueCore[] = []
  for (const b of bloques) {
    switch (b.tipo) {
      case 'parrafo':
        salida.push({ tipo: 'p', html: htmlDeTramos(b.tramos) })
        break
      case 'subtitulo':
        salida.push({ tipo: 'sub', html: htmlDeTramos(b.tramos) })
        break
      case 'escena':
        salida.push({ tipo: 'escena' })
        break
      case 'versos':
        for (const [i, estrofa] of b.estrofas.entries()) {
          if (i > 0) salida.push({ tipo: 'estrofa' })
          for (const verso of estrofa) {
            const html = htmlDeTramos([verso])
            // Un verso vacio no existe en el dialecto: «>» a solas es un
            // cambio de estrofa. Se omite igual que en el serializador.
            if (html !== '') salida.push({ tipo: 'verso', html })
          }
        }
        break
      case 'ilustracion':
        // La marca recorta la descripcion al leerla, y «]» la cerraria antes
        // de tiempo: el serializador avisa y lo quita.
        salida.push({ tipo: 'ilus', nombre: b.imagenId, alt: b.alt.replace(/\]/g, '').trim() })
        break
    }
  }
  return salida
}
