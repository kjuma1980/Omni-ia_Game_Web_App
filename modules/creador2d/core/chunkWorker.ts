/**
 * ---------------------------------------------------------------------------
 *  Web Worker de preparacion de chunks
 * ---------------------------------------------------------------------------
 *  Convertir un chunk (arrays densos + paleta) en una lista de dibujo ordenada
 *  cuesta, para un chunk de 32x32 en cuatro capas, 4.096 lecturas mas una
 *  ordenacion. Multiplicado por los 9 chunks residentes y repetido cada vez que
 *  la camara cruza una frontera, eso bloquearia el hilo principal y produciria
 *  tirones al desplazarse por el lienzo infinito.
 *
 *  Este worker hace ese trabajo fuera del hilo de UI y devuelve el plan de
 *  dibujo ya listo para que el renderizador solo tenga que hacer drawImage.
 * ---------------------------------------------------------------------------
 */

import {
  EMPTY_CELL,
  LAYER_ORDER,
  type ChunkPayload,
  type LayerName,
} from './grid';

export interface BlockMeta {
  layer: LayerName;
  heightInTiles: number;
  ySortOffset: number;
}

export interface DrawItem {
  key: string;
  /** Coordenadas locales dentro del chunk. */
  lx: number;
  ly: number;
  /** Ancla de ordenacion 2.5D, en pixeles del mundo. */
  sortY: number;
  heightInTiles: number;
}

export interface ChunkDrawPlan {
  cx: number;
  cy: number;
  revision: number;
  ground: DrawItem[];
  pit: DrawItem[];
  /** Muros dinamicos, ordenados por Y cuando el mundo es 2.5D. */
  wall: DrawItem[];
  overlay: DrawItem[];
}

export interface PrepareRequest {
  type: 'PREPARE';
  requestId: number;
  chunk: ChunkPayload;
  chunkSize: number;
  tileSize: number;
  /** Metadatos por clave de bloque; solo lo que el orden necesita. */
  blockMeta: Record<string, BlockMeta>;
  /** El Y-sort solo se aplica en perspectivas 3/4 y laterales. */
  ySort: boolean;
}

export interface PrepareResponse {
  type: 'PREPARED';
  requestId: number;
  plan: ChunkDrawPlan;
}

const DEFAULT_META: BlockMeta = { layer: 'GROUND', heightInTiles: 1, ySortOffset: 0 };

function buildPlan(request: PrepareRequest): ChunkDrawPlan {
  const { chunk, chunkSize, tileSize, blockMeta, ySort } = request;
  const baseTileY = chunk.cy * chunkSize;

  const plan: ChunkDrawPlan = {
    cx: chunk.cx,
    cy: chunk.cy,
    revision: chunk.revision,
    ground: [],
    pit: [],
    wall: [],
    overlay: [],
  };

  for (const layer of LAYER_ORDER) {
    const cells = chunk.layers[layer];
    if (!cells) {
      continue;
    }

    const bucket =
      layer === 'GROUND'
        ? plan.ground
        : layer === 'PIT'
          ? plan.pit
          : layer === 'WALL'
            ? plan.wall
            : plan.overlay;

    for (let index = 0; index < cells.length; index += 1) {
      const paletteIndex = cells[index];
      if (paletteIndex === EMPTY_CELL) {
        continue;
      }

      const key = chunk.palette[paletteIndex];
      if (!key) {
        continue;
      }

      const meta = blockMeta[key] ?? DEFAULT_META;
      const lx = index % chunkSize;
      const ly = Math.floor(index / chunkSize);

      bucket.push({
        key,
        lx,
        ly,
        // El ancla es el borde inferior del elemento, no su centro.
        sortY: (baseTileY + ly + meta.heightInTiles) * tileSize + meta.ySortOffset,
        heightInTiles: meta.heightInTiles,
      });
    }
  }

  if (ySort) {
    plan.wall.sort((a, b) => a.sortY - b.sortY || a.lx - b.lx);
  }

  return plan;
}

self.addEventListener('message', (event: MessageEvent<PrepareRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'PREPARE') {
    return;
  }

  const response: PrepareResponse = {
    type: 'PREPARED',
    requestId: request.requestId,
    plan: buildPlan(request),
  };

  (self as unknown as Worker).postMessage(response);
});

export {};
