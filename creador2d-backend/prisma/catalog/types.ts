import { BlockCategory, LayerKind, PlacementMode, WorldType } from '../../src/enums';

/**
 * Banderas de colision. Se repiten aqui en lugar de importarlas de `src/` para
 * que la semilla no dependa del arbol de la aplicacion: `prisma db seed` debe
 * poder ejecutarse sin compilar el backend entero.
 */
export const FLAGS = {
  NONE: 0,
  SOLID: 1,
  WATER: 2,
  STAIRS: 4,
  PIT: 8,
  ONE_WAY: 16,
  DAMAGE: 32,
  LADDER: 64,
  TRIGGER: 128,
} as const;

export const TOP_DOWN: WorldType[] = [
  WorldType.TOP_DOWN_CENITAL,
  WorldType.TOP_DOWN_THREE_QUARTER,
];

export const SIDE: WorldType[] = [
  WorldType.COUNTRYSIDE_RUNNER,
  WorldType.SIDE_PLATFORMER,
];

export const ALL: WorldType[] = [...TOP_DOWN, ...SIDE];

/**
 * Patrones que sabe rasterizar el generador procedural del editor.
 * Deben coincidir con los de `modules/creador2d/core/procedural.ts`.
 */
export type Pattern =
  | 'solid'
  | 'noise'
  | 'bricks'
  | 'planks'
  | 'checker'
  | 'stripes'
  | 'dots'
  | 'organic'
  | 'liquid'
  | 'spikes'
  | 'ladder'
  | 'canopy'
  | 'slab'
  // Ampliaciones para el catalogo extendido
  | 'cracked'
  | 'rubble'
  | 'column'
  | 'grassTuft'
  | 'grassEdge'
  | 'vine'
  | 'cobble'
  | 'thatch'
  | 'metal'
  | 'glass'
  | 'fabric'
  | 'wood'
  | 'roofTile'
  | 'window'
  | 'flame'
  | 'statue'
  | 'railing'
  | 'wheel'
  | 'signpost'
  // Siluetas de objeto: dibujan la forma sobre fondo transparente en vez de
  // rellenar la celda con un material. Ver `core/shapes.ts` en el editor.
  | 'barrel'
  | 'crate'
  | 'bed'
  | 'table'
  | 'roundTable'
  | 'chair'
  | 'stool'
  | 'chest'
  | 'wardrobe'
  | 'shelf'
  | 'bookshelf'
  | 'painting'
  | 'mirror'
  | 'rug'
  | 'tv'
  | 'radio'
  | 'deskLamp'
  | 'cauldron'
  | 'torch'
  | 'streetLamp'
  | 'candle'
  | 'bucket'
  | 'wellStone'
  | 'signArrow'
  | 'cone'
  | 'barrier'
  | 'scaffold'
  | 'car'
  | 'bus'
  | 'train'
  | 'cart'
  | 'coin'
  | 'gem'
  | 'trap';

export interface Visual {
  pattern: Pattern;
  colors: string[];
  accent?: string;
  detail?: number;
  /** Capa de detalle superpuesta: grietas, musgo, escombros. */
  overlay?: 'cracks' | 'moss' | 'rubble' | 'snow' | 'wet' | 'soot';
}

export interface BlockSeed {
  key: string;
  name: string;
  description?: string;
  worldTypes: WorldType[];
  layer: LayerKind;
  category: BlockCategory;
  placement?: PlacementMode;
  collisionFlags: number;
  biome: string;
  visual: Visual;
  tags?: string[];
  variant?: number;
  animated?: boolean;
  entrance?: boolean;
  ySortOffset?: number;
  heightInTiles?: number;
  breakable?: boolean;
  craftable?: boolean;
  recipe?: Array<{ key: string; qty: number }>;
  dropQuantity?: number;
  /** Tamano al soltarlo, en fracciones de baldosa. Ver `BlockDefinition`. */
  defaultScale?: number;
}

/** Paletas base reutilizadas por las familias de bloques. */
export const PALETTES = {
  stone: ['#4c4f57', '#5c606a'],
  brick: ['#8a4a32', '#9c563a'],
  wood: ['#7a5330', '#8a5f38'],
  metal: ['#4a4f59', '#586070'],
  sandstone: ['#b09a68', '#c2ab78'],
  marble: ['#c8ccd4', '#dde1e8'],
  obsidian: ['#22242b', '#2f323b'],
  ice: ['#a9cfe4', '#c6e2f0'],
  grass: ['#3f6d3a', '#4a8040'],
  dirt: ['#6b4a2f', '#7d5836'],
} as const;

/** Aclara u oscurece un color hexadecimal. Utilidad para derivar variantes. */
export function shade(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const num = parseInt(value, 16);

  const clamp = (channel: number) => Math.max(0, Math.min(255, Math.round(channel)));
  const r = clamp(((num >> 16) & 0xff) * (1 + amount));
  const g = clamp(((num >> 8) & 0xff) * (1 + amount));
  const b = clamp((num & 0xff) * (1 + amount));

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
