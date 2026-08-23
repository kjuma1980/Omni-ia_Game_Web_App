import { BlockCategory, LayerKind } from '../../src/enums';
import { ALL, FLAGS, type BlockSeed } from './types';

import { TERRAIN_BLOCKS } from './terrain';
import { WALL_BLOCKS } from './walls';
import { NATURE_BLOCKS } from './nature';
import { PROP_BLOCKS } from './props';
import { RUNNER_BLOCKS } from './runner';

export * from './types';
export { FLUID_KEYS, LAVA_KEYS } from './nature';

/** Bloques fabricables: no aparecen en la paleta base, se obtienen crafteando. */
const CRAFTED: BlockSeed[] = [
  {
    key: 'plank',
    name: 'Tablon reforzado',
    description: 'Se fabrica con troncos; util para plataformas y suelos.',
    worldTypes: ALL,
    layer: LayerKind.GROUND,
    category: BlockCategory.TERRAIN,
    collisionFlags: FLAGS.SOLID,
    biome: 'crafted',
    visual: { pattern: 'planks', colors: ['#9c6d40', '#ad7b4a'], accent: '#c68f57', detail: 0.3 },
    tags: ['fabricado', 'madera'],
    craftable: true,
    recipe: [{ key: 'trunk_oak', qty: 2 }],
  },
  {
    key: 'stone_brick',
    name: 'Sillar tallado',
    description: 'Se fabrica con roca; muro decorativo resistente.',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.WALL,
    collisionFlags: FLAGS.SOLID,
    biome: 'crafted',
    visual: { pattern: 'bricks', colors: ['#6a7078', '#7a828b'], accent: '#929aa4', detail: 0.35 },
    tags: ['fabricado', 'piedra'],
    craftable: true,
    recipe: [{ key: 'rock', qty: 3 }],
  },
  {
    key: 'lantern',
    name: 'Farol',
    description: 'Se fabrica con tablon y roca; marca puntos de interes.',
    worldTypes: ALL,
    layer: LayerKind.OVERLAY,
    category: BlockCategory.LIGHT,
    collisionFlags: FLAGS.TRIGGER,
    biome: 'crafted',
    visual: { pattern: 'flame', colors: ['#3b3428', '#4a4132'], accent: '#f2c94c', detail: 0.5 },
    tags: ['fabricado', 'luz'],
    animated: true,
    craftable: true,
    recipe: [
      { key: 'plank', qty: 1 },
      { key: 'rock', qty: 1 },
    ],
  },
];

/**
 * Bloques del catalogo original que la reorganizacion por familias habria
 * dejado fuera. Se conservan porque son utiles por si mismos, no por
 * compatibilidad: un sendero, un pajar o un follaje frontal siguen haciendo
 * falta.
 */
const CLASSIC: BlockSeed[] = [
  {
    key: 'path',
    name: 'Sendero',
    worldTypes: ALL,
    layer: LayerKind.GROUND,
    category: BlockCategory.TERRAIN,
    collisionFlags: FLAGS.NONE,
    biome: 'grassland',
    visual: { pattern: 'dots', colors: ['#9a8a6d', '#a89877'], accent: '#b8a887', detail: 0.35 },
    tags: ['camino', 'natural'],
  },
  {
    key: 'haystack',
    name: 'Pajar',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.PROP,
    collisionFlags: FLAGS.SOLID,
    biome: 'countryside',
    visual: { pattern: 'organic', colors: ['#b09a4a', '#c4ad58'], accent: '#d8c46c', detail: 0.5 },
    tags: ['pajar', 'campo'],
  },
  {
    key: 'pipe',
    name: 'Conducto',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.PROP,
    collisionFlags: FLAGS.SOLID,
    biome: 'industrial',
    visual: { pattern: 'stripes', colors: ['#2f6b45', '#3a8253'], accent: '#4b9d66', detail: 0.3 },
    tags: ['conducto', 'industrial'],
    heightInTiles: 2,
  },
  {
    key: 'foliage_front',
    name: 'Follaje frontal',
    description: 'Vegetacion que pasa por delante del personaje.',
    worldTypes: ALL,
    layer: LayerKind.OVERLAY,
    category: BlockCategory.VEGETATION,
    collisionFlags: FLAGS.NONE,
    biome: 'forest',
    visual: { pattern: 'canopy', colors: ['#2a5124', '#37682e'], accent: '#48853a', detail: 0.55 },
    tags: ['follaje', 'frontal', 'adorno'],
  },
  {
    key: 'roof',
    name: 'Tejado',
    worldTypes: ALL,
    layer: LayerKind.OVERLAY,
    category: BlockCategory.STRUCTURE,
    collisionFlags: FLAGS.NONE,
    biome: 'village',
    visual: { pattern: 'roofTile', colors: ['#7d3b2c', '#8f4634'], accent: '#a55440', detail: 0.35 },
    tags: ['tejado', 'edificio'],
  },
];

/** Catalogo completo que consume la semilla. */
export const CATALOG: BlockSeed[] = [
  ...TERRAIN_BLOCKS,
  ...WALL_BLOCKS,
  ...NATURE_BLOCKS,
  ...PROP_BLOCKS,
  ...RUNNER_BLOCKS,
  ...CLASSIC,
  ...CRAFTED,
];

/**
 * Renombrados de la reorganizacion por familias. Los chunks ya guardados
 * conservan la clave antigua en su paleta, y una clave que ya no existe en el
 * catalogo se dibuja como vacia y deja de aportar colision. La semilla reescribe
 * las paletas afectadas en lugar de dejar mundos silenciosamente rotos.
 */
export const RENAMED_KEYS: Record<string, string> = {
  stone_wall: 'wall_stone',
  tree_trunk: 'trunk_oak',
  tree_canopy: 'canopy_oak',
  wood_crate: 'crate',
  door: 'door_wood',
  // Las calles pasaron de ser dos bloques sueltos a un juego de piezas por
  // material (carril, linea, borde, arcen, paso, obras).
  road: 'road_dirt_lane',
  road_dirt: 'road_dirt_lane',
  road_lane: 'road_asphalt_lane',
  // El camion se fusiono con la familia de autobuses al pasar los vehiculos a
  // silueta vertical: un camion es un cuerpo largo, no un turismo.
  car_truck: 'truck_cargo',
};

/**
 * Salvaguarda: dos bloques con la misma clave se pisarian en la base de datos y
 * el ultimo ganaria en silencio. Es un error facil de cometer al ampliar el
 * catalogo por familias, asi que se detecta al sembrar y no en produccion.
 */
export function assertUniqueKeys(blocks: BlockSeed[]): void {
  const seen = new Map<string, number>();

  for (const block of blocks) {
    seen.set(block.key, (seen.get(block.key) ?? 0) + 1);
  }

  const duplicates = Array.from(seen.entries())
    .filter(([, count]) => count > 1)
    .map(([key, count]) => `${key} (x${count})`);

  if (duplicates.length > 0) {
    throw new Error(`Claves de bloque duplicadas en el catalogo: ${duplicates.join(', ')}`);
  }
}

/** Resumen por categoria, util para el registro de la semilla. */
export function summarize(blocks: BlockSeed[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const block of blocks) {
    counts[block.category] = (counts[block.category] ?? 0) + 1;
  }
  return counts;
}
