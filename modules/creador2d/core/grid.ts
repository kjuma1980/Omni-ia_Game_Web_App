/**
 * ---------------------------------------------------------------------------
 *  Nucleo matematico del editor 2D / 2.5D  (espejo de creador2d-backend)
 * ---------------------------------------------------------------------------
 *  Copia exacta de la logica de `creador2d-backend/src/common/domain/tiles.ts`.
 *  Cliente y servidor deben calcular identicamente la posicion de cada tile:
 *  si divergieran, el editor pintaria en una celda y el backend escribiria en
 *  otra.
 *
 *  REGLA DEL IMAN (grid snapping): la conversion pixel -> tile se hace SIEMPRE
 *  con division entera hacia abajo. Nunca `Math.round`, nunca `| 0`, nunca
 *  `Math.trunc`. El truncamiento rompe el semieje negativo (los pixeles -1 y +1
 *  caerian ambos en el tile 0) y eso produce fisuras de un tile al desplazar la
 *  camara a coordenadas negativas del lienzo infinito.
 * ---------------------------------------------------------------------------
 */

export const LAYER_ORDER = ['GROUND', 'PIT', 'WALL', 'OVERLAY'] as const;
export type LayerName = (typeof LAYER_ORDER)[number];

export const LAYER_LABEL: Record<LayerName, string> = {
  GROUND: 'Suelo',
  PIT: 'Fosos',
  WALL: 'Muros',
  OVERLAY: 'Superior',
};

export const EMPTY_CELL = -1;

export const ALLOWED_CHUNK_SIZES = [16, 32] as const;
export type ChunkSize = (typeof ALLOWED_CHUNK_SIZES)[number];

export const COLLISION_FLAGS = {
  NONE: 0,
  SOLID: 1 << 0,
  WATER: 1 << 1,
  STAIRS: 1 << 2,
  PIT: 1 << 3,
  ONE_WAY: 1 << 4,
  DAMAGE: 1 << 5,
  LADDER: 1 << 6,
  TRIGGER: 1 << 7,
} as const;

export type CollisionFlagName = keyof typeof COLLISION_FLAGS;

/** Color con el que se pinta cada bandera en la vista de depuracion. */
export const COLLISION_COLOR: Record<CollisionFlagName, string> = {
  NONE: 'transparent',
  SOLID: 'rgba(239, 68, 68, 0.45)',
  WATER: 'rgba(56, 189, 248, 0.40)',
  STAIRS: 'rgba(250, 204, 21, 0.40)',
  PIT: 'rgba(15, 23, 42, 0.55)',
  ONE_WAY: 'rgba(34, 197, 94, 0.40)',
  DAMAGE: 'rgba(249, 115, 22, 0.45)',
  LADDER: 'rgba(168, 85, 247, 0.40)',
  TRIGGER: 'rgba(236, 72, 153, 0.35)',
};

export function describeCollision(mask: number): CollisionFlagName[] {
  return (Object.keys(COLLISION_FLAGS) as CollisionFlagName[]).filter(
    (name) => name !== 'NONE' && (mask & COLLISION_FLAGS[name]) !== 0,
  );
}

/** Division entera hacia abajo; correcta para operandos negativos. */
export function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

/** Modulo siempre positivo, complemento de `floorDiv`. */
export function floorMod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/** Snapping magnetico: pixel del mundo -> coordenada de tile que lo contiene. */
export function pixelToTile(pixel: number, tileSize: number): number {
  return floorDiv(pixel, tileSize);
}

/** Esquina superior izquierda del tile, en pixeles del mundo. */
export function tileToPixel(tile: number, tileSize: number): number {
  return tile * tileSize;
}

export function tileToChunk(tile: number, chunkSize: number): number {
  return floorDiv(tile, chunkSize);
}

export function tileToLocal(tile: number, chunkSize: number): number {
  return floorMod(tile, chunkSize);
}

export function localIndex(localX: number, localY: number, chunkSize: number): number {
  return localY * chunkSize + localX;
}

export function chunkKey(cx: number, cy: number): string {
  return `${cx}:${cy}`;
}

export function parseChunkKey(key: string): { cx: number; cy: number } {
  const [cx, cy] = key.split(':');
  return { cx: Number(cx), cy: Number(cy) };
}

/**
 * Origen de ordenacion en Y para el sorting 2.5D: el borde INFERIOR del
 * elemento, no su centro. Un actor situado mas abajo en pantalla (mayor Y) se
 * dibuja despues y por tanto tapa a lo que esta detras.
 */
export function ySortOrigin(
  tileY: number,
  tileSize: number,
  heightInTiles: number,
  ySortOffset: number,
): number {
  return (tileY + heightInTiles) * tileSize + ySortOffset;
}

export interface ChunkPayload {
  cx: number;
  cy: number;
  revision: number;
  palette: string[];
  layers: Record<LayerName, number[]>;
  collision: number[];
}

export function createEmptyChunk(cx: number, cy: number, chunkSize: number): ChunkPayload {
  const cells = chunkSize * chunkSize;
  const layers = {} as Record<LayerName, number[]>;

  for (const layer of LAYER_ORDER) {
    layers[layer] = new Array<number>(cells).fill(EMPTY_CELL);
  }

  return {
    cx,
    cy,
    revision: 0,
    palette: [],
    layers,
    collision: new Array<number>(cells).fill(COLLISION_FLAGS.NONE),
  };
}

export function internBlockKey(palette: string[], key: string): number {
  const existing = palette.indexOf(key);
  if (existing !== -1) {
    return existing;
  }
  palette.push(key);
  return palette.length - 1;
}

/** Los 9 chunks (3x3) que el editor mantiene residentes en memoria. */
export function neighbourChunks(cx: number, cy: number): Array<{ cx: number; cy: number }> {
  const result: Array<{ cx: number; cy: number }> = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      result.push({ cx: cx + dx, cy: cy + dy });
    }
  }
  return result;
}

/** Lee la clave de bloque de una celda concreta dentro de un chunk. */
export function readCell(
  chunk: ChunkPayload,
  layer: LayerName,
  localX: number,
  localY: number,
  chunkSize: number,
): string | null {
  const index = localIndex(localX, localY, chunkSize);
  const paletteIndex = chunk.layers[layer]?.[index];

  if (paletteIndex === undefined || paletteIndex === EMPTY_CELL) {
    return null;
  }

  return chunk.palette[paletteIndex] ?? null;
}
