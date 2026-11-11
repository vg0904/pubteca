/**
 * El motor del impreso: componer el libro y escribir su PDF, con el core.
 *
 * Corre en su hilo (impreso.worker.ts): un libro de 300 paginas se compone en
 * menos de un segundo, pero cada cambio de un deslizador lo recompone, y en el
 * hilo de la pagina la congelaria. Si el navegador no abre el hilo, corre aqui
 * mismo (ver hilo.ts); el resultado es el mismo.
 *
 * Guarda la ultima composicion: el PDF se escribe de ESA, la que el autor
 * esta viendo en el plan, sin volver a componer.
 */
import type { ConfigImpreso } from '../../core/impreso/config'
import type { Contenido } from '../../core/impreso/contenido'
import type { ImagenImpresa } from '../../core/impreso/paginar'
import { escribirPdf, type ImagenGris } from '../../core/impreso/pdf'
import { componerImpreso, type Impreso } from '../../core/impreso/plan'
import { Fuente } from '../../core/impreso/sfnt'
import type { Cara, Fuentes } from '../../core/impreso/tipos'

export interface PedidoComponer {
  readonly tipo: 'componer'
  /** Crece con cada pedido: lo que vuelve con un id viejo ya no le interesa a nadie. */
  readonly id: number
  readonly contenido: Contenido
  readonly config: ConfigImpreso
  readonly imagenes: Readonly<Record<string, ImagenImpresa>>
  /** La familia y los bytes de sus cuatro caras. */
  readonly fuente: { readonly id: string; readonly caras: Readonly<Record<Cara, ArrayBuffer>> }
}

export interface PedidoPdf {
  readonly tipo: 'pdf'
  /** La composicion de la que sale: si ya no es la ultima, se recompone con lo que trae. */
  readonly componer: PedidoComponer
  readonly pixeles: Readonly<Record<string, ImagenGris>>
  readonly titulo: string
  readonly autor: string
  /** Cuando, en ms: el reloj se inyecta (el core no lo lee). */
  readonly fecha: number
}

export type PedidoImpreso = PedidoComponer | PedidoPdf

export type RespuestaImpreso =
  | { readonly tipo: 'componer'; readonly id: number; readonly impreso: Impreso }
  | { readonly tipo: 'pdf'; readonly id: number; readonly pdf: Uint8Array }
  | { readonly tipo: 'error'; readonly id: number; readonly error: string }

const CARAS: readonly Cara[] = ['regular', 'cursiva', 'negrita', 'negritaCursiva']

export class MotorImpreso {
  private familia: { id: string; fuentes: Fuentes } | null = null
  private ultima: { id: number; impreso: Impreso } | null = null

  private fuentes(f: PedidoComponer['fuente']): Fuentes {
    if (this.familia?.id !== f.id) {
      const caras = Object.fromEntries(CARAS.map((c) => [c, new Fuente(new Uint8Array(f.caras[c]))])) as Record<Cara, Fuente>
      this.familia = { id: f.id, fuentes: caras }
    }
    return this.familia.fuentes
  }

  private componer(p: PedidoComponer): Impreso {
    if (this.ultima?.id === p.id) return this.ultima.impreso
    const impreso = componerImpreso(p.contenido, p.config, this.fuentes(p.fuente), (nombre) => p.imagenes[nombre] ?? null)
    this.ultima = { id: p.id, impreso }
    return impreso
  }

  atender(p: PedidoImpreso): RespuestaImpreso {
    const id = p.tipo === 'componer' ? p.id : p.componer.id
    try {
      if (p.tipo === 'componer') return { tipo: 'componer', id, impreso: this.componer(p) }
      const impreso = this.componer(p.componer)
      const pdf = escribirPdf(impreso.paginas, {
        ancho: impreso.formato.ancho,
        alto: impreso.formato.alto,
        fuentes: this.fuentes(p.componer.fuente),
        imagenes: (clave) => p.pixeles[clave] ?? null,
        titulo: p.titulo,
        autor: p.autor,
        fecha: new Date(p.fecha),
      })
      return { tipo: 'pdf', id, pdf }
    } catch (e) {
      return { tipo: 'error', id, error: e instanceof Error ? e.message : String(e) }
    }
  }
}
