/**
 * EL REGISTRO DE DIVERGENCIAS.
 *
 * Todo sitio donde Pubteca se aparta a proposito de generar_epub.py esta aqui,
 * con su motivo. El oraculo (tests/casos-texto.json) sigue siendo la verdad
 * sobre lo que hace el Python; este archivo dice en que no lo imitamos y por
 * que, y los tests de paridad lo consultan.
 *
 * Si manana alguien se pregunta «¿por que esto no coincide con el script?», la
 * respuesta tiene que estar en este archivo o es un bug.
 */
import type { Tupla } from './oraculo'

export interface DivergenciaValor {
  readonly motivo: string
  readonly python: string
  readonly nuestro: string
}

export interface DivergenciaCapitulo {
  readonly motivo: string
  readonly titulo: string | null
  readonly bloques: Tupla[]
  readonly tramos: Tupla[]
}

const MOTIVO_ESCAPE =
  'Escapar un marcador de BLOQUE no lo desactivaba. El Python clasifica la linea sobre su ' +
  'version desescapada, asi que el marcador se reconocia igual, pero el contenido salia de la ' +
  'linea original y encima quedaba basura impresa. El escritor seguia la documentacion, ' +
  'escapaba, y acababa con una barra invertida o una almohadilla en su libro. Ademas la ' +
  'interfaz grafica NECESITA que el escape funcione: su modelo de bloques se serializa a este ' +
  'dialecto, y un parrafo que empiece por «>», «#» o «* * *» tiene que poder escaparse o se ' +
  'convertiria en otro tipo de bloque al volver a leerlo.'

/** Pares entrada -> salida donde nuestro resultado es distinto a proposito. */
export const VALORES: Record<string, Map<string, DivergenciaValor>> = {
  en_linea: new Map([
    [
      '\\>',
      {
        motivo:
          'El Python escapa el HTML ANTES de buscar los escapes, asi que al llegar a «\\>» el ' +
          'caracter tras la barra ya es «&» (de «&gt;») y no esta en la clase de escapables: la ' +
          'barra se queda VISIBLE en el libro. Guardar los escapes primero lo arregla. Es el ' +
          'unico caso que cambia, porque «>» es el unico caracter que esta a la vez en la clase ' +
          'de escapables y en los que se convierten en entidad HTML.',
        python: '\\&gt;',
        nuestro: '&gt;',
      },
    ],
  ]),
}

/** Capitulos del oraculo que ahora se parsean distinto. */
export const CAPITULOS: Map<string, DivergenciaCapitulo> = new Map([
  [
    'escapes',
    {
      motivo: MOTIVO_ESCAPE,
      titulo: 'Capítulo 14: Escapes',
      bloques: [
        ['p', 'Texto con *asteriscos* y [corchetes].'],
        ['p', '&gt; no es verso.'],
      ],
      tramos: [
        [
          'texto',
          [
            '<p class="primero">Texto con *asteriscos* y [corchetes].</p>',
            '<p>&gt; no es verso.</p>',
          ],
        ],
      ],
    },
  ],
  [
    'escapar_verso',
    {
      motivo: MOTIVO_ESCAPE,
      titulo: 'T',
      bloques: [['p', '&gt; cita']],
      tramos: [['texto', ['<p class="primero">&gt; cita</p>']]],
    },
  ],
  [
    'escapar_ilus',
    {
      motivo: MOTIVO_ESCAPE,
      titulo: 'T',
      bloques: [['p', '[ilustración: x | y]']],
      tramos: [['texto', ['<p class="primero">[ilustración: x | y]</p>']]],
    },
  ],
  [
    'escapar_sub',
    {
      motivo: MOTIVO_ESCAPE,
      titulo: 'T',
      bloques: [['p', '# no subtitulo']],
      tramos: [['texto', ['<p class="primero"># no subtitulo</p>']]],
    },
  ],
  [
    'escapar_escena',
    {
      motivo: MOTIVO_ESCAPE,
      titulo: 'T',
      bloques: [['p', '* * *']],
      tramos: [['texto', ['<p class="primero">* * *</p>']]],
    },
  ],
])

/**
 * Las divergencias que no se expresan como un par entrada -> salida del
 * oraculo, sino como comportamiento. Cada una tiene su propio test; esta lista
 * existe para que el registro este completo en un solo sitio.
 */
export const DE_COMPORTAMIENTO = [
  {
    nombre: 'Cap. 3: El bosque',
    motivo:
      'El Python volvia a partir el titulo crudo por el PRIMER separador, que en «Cap. 3» es el ' +
      'punto de la abreviatura, y el titulo salia como «3: El bosque». Ahora se aplica la misma ' +
      'regex al titulo crudo: sale el titulo correcto y se conserva su markdown.',
    donde: 'src/core/libro.ts (capitulos)',
  },
  {
    nombre: 'PNG truncado',
    motivo:
      'struct.unpack(">IIBB", b[16:26]) no comprueba el limite, asi que un PNG copiado a medias ' +
      'lanzaba struct.error sin capturar y el generador abortaba con un traceback: el autor no ' +
      'recibia un libro, recibia un error de Python. Ahora devuelve tipo null y acaba en el ' +
      'mismo mensaje de error que cualquier otro archivo que no es una imagen.',
    donde: 'src/core/imagen-inspeccion.ts',
  },
  {
    nombre: 'Imagenes huerfanas por stem',
    motivo:
      'Se comparaban por stem en minusculas CRUZANDO carpetas, asi que un ilustraciones/logo.png ' +
      'sin marcar quedaba tapado por el portada/logo.png que si entro, y el aviso no salia. El ' +
      'sintoma era la AUSENCIA de un aviso, que es dificilisimo de notar. Ahora se compara por ruta.',
    donde: 'src/core/construir.ts',
  },
  {
    nombre: 'Libro sin capitulos',
    motivo:
      'Sin ningun capitulo con texto, el Python emitia el error y generaba IGUAL un EPUB sin ' +
      'cuerpo que ninguna tienda acepta. Ahora bloquea: mas vale no dar archivo que darlo roto.',
    donde: 'src/core/construir.ts',
  },
  {
    nombre: 'Recurso referenciado y ausente',
    motivo:
      'Comprobacion NUEVA, no la hacia el Python. Al empaquetar se verifica que ninguna pagina ' +
      'incluida referencie un recurso ausente del paquete de su tienda. Pasa si el autor usa la ' +
      'misma imagen como logo y como ilustracion, y en la interfaz grafica sera MAS facil caer ' +
      'en eso porque sera un clic.',
    donde: 'src/core/construir.ts',
  },
  {
    nombre: 'n_ilus muerto',
    motivo:
      'seccion_con_titulo declaraba un n_ilus que solo contaba las ilustraciones del cuerpo, ' +
      'pero devolvia k, que cuenta todas. La variable muerta se borro y se devuelve el total, ' +
      'que es lo que el reporte ya usaba. Sin cambio de salida.',
    donde: 'src/core/libro.ts',
  },
] as const
