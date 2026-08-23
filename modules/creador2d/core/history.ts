import type { LayerName } from './grid';
import type { EditOperation } from '../types';
import type { ChunkStore } from './chunkStore';

export interface HistoryEntry {
  label: string;
  /** Operaciones que se enviaron al backend. */
  forward: EditOperation[];
  /** Operaciones que restauran el estado anterior celda a celda. */
  backward: EditOperation[];
}

const MAX_HISTORY = 100;

/**
 * Historial de edicion.
 *
 * Deshacer no puede ser "la operacion contraria" a ciegas: romper un bloque que
 * no estaba no debe recrear nada, y colocar sobre una celda ocupada debe
 * devolver el bloque anterior, no vaciarla. Por eso, antes de aplicar un lote
 * se fotografia el contenido real de cada celda afectada y se construye a
 * partir de ahi el lote inverso.
 */
export class EditHistory {
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];

  /** Construye el lote inverso leyendo el estado actual antes de modificarlo. */
  static buildInverse(store: ChunkStore, operations: EditOperation[]): EditOperation[] {
    const inverse: EditOperation[] = [];
    const seen = new Set<string>();

    const capture = (layer: LayerName, tileX: number, tileY: number) => {
      const cellKey = `${layer}:${tileX}:${tileY}`;
      if (seen.has(cellKey)) {
        return;
      }
      seen.add(cellKey);

      const previous = store.blockAt(tileX, tileY, layer);

      if (previous) {
        inverse.push({ op: 'PLACE', layer, tileX, tileY, blockKey: previous });
      } else {
        inverse.push({ op: 'BREAK', layer, tileX, tileY });
      }
    };

    for (const operation of operations) {
      switch (operation.op) {
        case 'PLACE':
        case 'BREAK':
          capture(operation.layer, operation.tileX, operation.tileY);
          break;

        case 'FILL':
        case 'CLEAR':
          for (let dy = 0; dy < operation.height; dy += 1) {
            for (let dx = 0; dx < operation.width; dx += 1) {
              capture(operation.layer, operation.tileX + dx, operation.tileY + dy);
            }
          }
          break;
      }
    }

    return inverse;
  }

  push(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    // Cualquier accion nueva invalida la rama de rehacer.
    this.redoStack.length = 0;
  }

  undo(): HistoryEntry | null {
    const entry = this.undoStack.pop();
    if (!entry) {
      return null;
    }
    this.redoStack.push(entry);
    return entry;
  }

  redo(): HistoryEntry | null {
    const entry = this.redoStack.pop();
    if (!entry) {
      return null;
    }
    this.undoStack.push(entry);
    return entry;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get depth(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }
}
