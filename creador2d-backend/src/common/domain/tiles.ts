/**
 * ---------------------------------------------------------------------------
 *  Nucleo matematico compartido del Creador 2D.
 * ---------------------------------------------------------------------------
 *  Este archivo es la FUENTE DE VERDAD de la geometria del mundo. Su logica se
 *  replica byte a byte en:
 *    - modules/creador2d/core/grid.ts        (editor web)
 *    - creador2d-plugins/unity/Creador2DGrid.cs
 *    - creador2d-plugins/godot/creador2d_grid.gd
 *    - creador2d-plugins/unreal/Creador2DGrid.h
 *
 *  Regla de oro del snapping magnetico: la conversion pixel -> tile SIEMPRE se
 *  hace con division entera hacia abajo (floor), nunca con `Math.round` ni con
 *  truncamiento (`| 0`). El truncamiento parte en dos el comportamiento en el
 *  semieje negativo (los tiles -0.5 y +0.5 caerian ambos en 0) y provoca
 *  fisuras de un pixel al desplazar la camara a coordenadas negativas.
 * ---------------------------------------------------------------------------
 */

/** Capas de la cuadricula, en orden de dibujado. */
export const LAYER_ORDER = ['GROUND', 'PIT', 'WALL', 'OVERLAY'] as const;
export type LayerName = (typeof LAYER_ORDER)[number];

/** Celda vacia dentro del array denso de una capa. */
export const EMPTY_CELL = -1;

/** Tamanos de chunk admitidos (lado en tiles). */
export const ALLOWED_CHUNK_SIZES = [16, 32] as const;
export type ChunkSize = (typeof ALLOWED_CHUNK_SIZES)[number];

/**
 * Banderas binarias de la matriz logica de colisiones. Un byte por celda, de
 * modo que un chunk de 32x32 ocupa exactamente 1024 bytes.
 */
export const COLLISION_FLAGS = {
  NONE: 0,
  /** Bloquea el movimiento en las cuatro direcciones. */
  SOLID: 1 << 0,
  /** Agua: nado / ralentizacion, atravesable segun el motor. */
  WATER: 1 << 1,
  /** Escaleras: permite cambiar de altura logica. */
  STAIRS: 1 << 2,
  /** Foso o vacio: caida. */
  PIT: 1 << 3,
  /** Plataforma de un solo sentido (se atraviesa desde abajo). */
  ONE_WAY: 1 << 4,
  /** Zona de dano (pinchos, lava). */
  DAMAGE: 1 << 5,
  /** Escalera vertical trepable. */
  LADDER: 1 << 6,
  /** Disparador logico sin colision fisica. */
  TRIGGER: 1 << 7,
} as const;

export type CollisionFlagName = keyof typeof COLLISION_FLAGS;

/** Devuelve los nombres de las banderas activas en una mascara. */
export function describeCollision(mask: number): CollisionFlagName[] {
  return (Object.keys(COLLISION_FLAGS) as CollisionFlagName[]).filter(
    (name) => name !== 'NONE' && (mask & COLLISION_FLAGS[name]) !== 0,
  );
}

/**
 * Division entera hacia abajo. Correcta para operandos negativos, a diferencia
 * del operador `/` combinado con truncamiento.
 *
 *   floorDiv(-1, 32) === -1     (el pixel -1 pertenece al tile -1)
 *   Math.trunc(-1 / 32) === 0   (incorrecto: crearia una fisura en x = 0)
 */
export function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

/** Modulo siempre positivo, complemento de `floorDiv`. */
export function floorMod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/**
 * Snapping magnetico: convierte una coordenada en pixeles del mundo a la
 * coordenada de tile que la contiene.
 */
export function pixelToTile(pixel: number, tileSize: number): number {
  return floorDiv(pixel, tileSize);
}

/** Esquina superior izquierda, en pixeles, del tile indicado. */
export function tileToPixel(tile: number, tileSize: number): number {
  return tile * tileSize;
}

/** Coordenada de chunk que contiene al tile dado. */
export function tileToChunk(tile: number, chunkSize: number): number {
  return floorDiv(tile, chunkSize);
}

/** Coordenada local (0..chunkSize-1) del tile dentro de su chunk. */
export function tileToLocal(tile: number, chunkSize: number): number {
  return floorMod(tile, chunkSize);
}

/** Indice lineal de una celda dentro de los arrays densos del chunk. */
export function localIndex(localX: number, localY: number, chunkSize: number): number {
  return localY * chunkSize + localX;
}

/** Clave estable de un chunk, usada en mapas en memoria y en salas de socket. */
export function chunkKey(cx: number, cy: number): string {
  return `${cx}:${cy}`;
}

/**
 * Origen de ordenacion en Y para el sorting 2.5D. El ancla no es el centro del
 * sprite sino su borde inferior, desplazado por `ySortOffset`: asi un actor
 * situado delante de un muro (mayor Y) se dibuja despues y lo tapa.
 */
export function ySortOrigin(
  tileY: number,
  tileSize: number,
  heightInTiles: number,
  ySortOffset: number,
): number {
  return (tileY + heightInTiles) * tileSize + ySortOffset;
}

/** Estructura serializada de un chunk tal y como viaja por HTTP/WebSocket. */
export interface ChunkPayload {
  cx: number;
  cy: number;
  revision: number;
  /** Claves de bloque referenciadas por los indices densos. */
  palette: string[];
  /** Indices hacia `palette` por capa; -1 = vacio. */
  layers: Record<LayerName, number[]>;
  /** Matriz logica de colisiones: un entero 0-255 por celda. */
  collision: number[];
}

/** Crea un chunk vacio con todos los arrays ya dimensionados. */
export function createEmptyChunk(cx: number, cy: number, chunkSize: number): ChunkPayload {
  const cells = chunkSize * chunkSize;
  const layers = {} as Record<LayerName, number[]>;

  for (const layer of LAYER_ORDER) {
    layers[layer] = new Array<number>(cells).fill(EMPTY_CELL);
  }

  return {
    cx,
    cy,
    revision: 1,
    palette: [],
    layers,
    collision: new Array<number>(cells).fill(COLLISION_FLAGS.NONE),
  };
}

/**
 * Inserta una clave en la paleta local del chunk y devuelve su indice.
 * La paleta mantiene los arrays densos como enteros pequenos en lugar de
 * cadenas repetidas, lo que reduce el JSON de un chunk 32x32 lleno de ~90 KB
 * a ~9 KB.
 */
export function internBlockKey(palette: string[], key: string): number {
  const existing = palette.indexOf(key);
  if (existing !== -1) {
    return existing;
  }
  palette.push(key);
  return palette.length - 1;
}

/**
 * Elimina de la paleta las claves que ya no referencia ninguna capa y
 * reindexa los arrays densos. Evita que la paleta crezca sin limite cuando el
 * usuario pinta y borra repetidamente.
 */
export function compactPalette(chunk: ChunkPayload): ChunkPayload {
  const used = new Set<number>();

  for (const layer of LAYER_ORDER) {
    for (const index of chunk.layers[layer]) {
      if (index !== EMPTY_CELL) {
        used.add(index);
      }
    }
  }

  if (used.size === chunk.palette.length) {
    return chunk;
  }

  const remap = new Map<number, number>();
  const nextPalette: string[] = [];

  chunk.palette.forEach((key, oldIndex) => {
    if (used.has(oldIndex)) {
      remap.set(oldIndex, nextPalette.length);
      nextPalette.push(key);
    }
  });

  for (const layer of LAYER_ORDER) {
    const cells = chunk.layers[layer];
    for (let i = 0; i < cells.length; i += 1) {
      const current = cells[i];
      if (current !== EMPTY_CELL) {
        cells[i] = remap.get(current) ?? EMPTY_CELL;
      }
    }
  }

  chunk.palette = nextPalette;
  return chunk;
}

/**
 * Los 9 chunks (3x3) que rodean a la camara de edicion. El editor mantiene
 * cargados exactamente estos y descarta el resto.
 */
export function neighbourChunks(cx: number, cy: number): Array<{ cx: number; cy: number }> {
  const result: Array<{ cx: number; cy: number }> = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      result.push({ cx: cx + dx, cy: cy + dy });
    }
  }
  return result;
}
