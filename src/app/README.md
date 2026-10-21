# app

La capa de navegador: React, canvas, IndexedDB, File API, mammoth.

Nada de aqui puede importarse desde `src/core/`. La flecha va siempre
`app -> core`, nunca al reves.

## Como esta organizada

- **Logica pura, sin React y sin navegador** (se prueba en node): `estado.ts`
  (el reductor de toda la interfaz, con deshacer y el foco), `tramos.ts`,
  `versos.ts`, `importacion.ts` (la pantalla de importar), `avisos.ts`,
  `revision.ts`, mas lo de H4 (`modelo`, `serializar`, `exportar`, `html`).
  Si una decision de la interfaz se puede tomar aqui, se toma aqui.
- **Navegador**: `editor-dom.ts` (contenteditable <-> tramos), `pegar.ts`,
  `subir.ts` (bytes ANTES que canvas), `repositorio.ts` (los Blob de las
  imagenes), `generar.ts`, `copia.ts`, `almacen.ts`.
- **Componentes** en `ui/`. Solo pintan el estado y despachan acciones. El
  editor de texto (`ui/TextoEditable.tsx`) no deja que React gestione sus
  hijos: mientras el autor escribe, el DOM manda.

