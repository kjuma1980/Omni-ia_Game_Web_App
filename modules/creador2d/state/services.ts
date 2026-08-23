import { Creador2DClient } from '../api/client';
import { ChunkStore } from '../core/chunkStore';
import { EditHistory } from '../core/history';
import { WorldRenderer } from '../core/renderer';

/**
 * Servicios de larga vida del editor.
 *
 * Deliberadamente FUERA del store reactivo: el almacen de chunks, el
 * renderizador y el historial mutan decenas de veces por segundo mientras el
 * usuario arrastra el raton. Si vivieran en el estado de React, cada trazo
 * provocaria una cascada de renders y el editor iria a tirones. React solo
 * recibe el estado que de verdad afecta a la interfaz.
 */
class EditorServices {
  readonly client = new Creador2DClient();
  readonly chunkStore = new ChunkStore();
  readonly history = new EditHistory();
  readonly renderer: WorldRenderer;

  constructor() {
    this.renderer = new WorldRenderer(this.chunkStore);
    // Cada plan nuevo invalida la lista global de muros ordenada por Y.
    this.chunkStore.onPlanReady(() => this.renderer.invalidate());
  }
}

let instance: EditorServices | null = null;

export function getServices(): EditorServices {
  if (!instance) {
    instance = new EditorServices();
  }
  return instance;
}

export type { EditorServices };
