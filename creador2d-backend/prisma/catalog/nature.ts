import { BlockCategory, LayerKind } from '../../src/enums';
import { ALL, FLAGS, SIDE, TOP_DOWN, type BlockSeed } from './types';

/**
 * ---------------------------------------------------------------------------
 *  Vegetacion y fluidos
 * ---------------------------------------------------------------------------
 *  Los arboles se modelan en dos piezas: tronco (capa WALL, solido, ancla del
 *  Y-sort) y copa (capa OVERLAY, por encima del personaje). Esa separacion es
 *  lo que permite que un personaje pase por detras de la copa y por delante del
 *  tronco, que es el efecto 2.5D que se busca.
 *
 *  Las enredaderas son bloques normales de capa OVERLAY sin colision, para
 *  poder vestir muros, plataformas y suelos sin alterar la fisica.
 * ---------------------------------------------------------------------------
 */

interface TreeKind {
  key: string;
  name: string;
  biome: string;
  trunk: string[];
  canopy: string[];
  accent: string;
  /** Altura del tronco en tiles. */
  height: number;
  tags: string[];
}

const TREES: TreeKind[] = [
  {
    key: 'oak',
    name: 'Roble',
    biome: 'forest',
    trunk: ['#5a3d24', '#6b4a2c'],
    canopy: ['#25491f', '#315f28'],
    accent: '#417a34',
    height: 2,
    tags: ['arbol', 'bosque'],
  },
  {
    key: 'pine',
    name: 'Pino',
    biome: 'tundra',
    trunk: ['#4a3520', '#5a4128'],
    canopy: ['#1d3a24', '#27492e'],
    accent: '#356038',
    height: 3,
    tags: ['arbol', 'conifera'],
  },
  {
    key: 'palm',
    name: 'Palmera',
    biome: 'jungle',
    trunk: ['#7a5c38', '#8c6c44'],
    canopy: ['#2f6b34', '#3c8341'],
    accent: '#54a052',
    height: 3,
    tags: ['arbol', 'palmera', 'tropical'],
  },
  {
    key: 'banana',
    name: 'Platanera',
    biome: 'jungle',
    trunk: ['#5f6b32', '#6f7c3c'],
    canopy: ['#3d7a2e', '#4e9139'],
    accent: '#6ab04c',
    height: 2,
    tags: ['planta', 'platano', 'tropical'],
  },
  {
    key: 'coffee',
    name: 'Cafeto',
    biome: 'jungle',
    trunk: ['#4d3a24', '#5c462c'],
    canopy: ['#2d5c2a', '#3a7034'],
    accent: '#8c2f2f',
    height: 1,
    tags: ['planta', 'cafe', 'tropical'],
  },
  {
    key: 'dead',
    name: 'Arbol seco',
    biome: 'swamp',
    trunk: ['#4a4136', '#5a5044'],
    accent: '#6b6052',
    canopy: ['#4a4136', '#5a5044'],
    height: 2,
    tags: ['arbol', 'seco', 'ruina'],
  },
  {
    key: 'cactus',
    name: 'Cactus',
    biome: 'desert',
    trunk: ['#2f6b45', '#3a8253'],
    canopy: ['#3a8253', '#4b9d66'],
    accent: '#c9d97a',
    height: 2,
    tags: ['planta', 'desierto'],
  },
];

function treeBlocks(): BlockSeed[] {
  const blocks: BlockSeed[] = [];

  for (const [index, tree] of TREES.entries()) {
    blocks.push({
      key: `trunk_${tree.key}`,
      name: `Tronco de ${tree.name.toLowerCase()}`,
      description: 'Base solida del arbol; combinar con la copa en la capa superior.',
      worldTypes: ALL,
      layer: LayerKind.WALL,
      category: BlockCategory.VEGETATION,
      collisionFlags: FLAGS.SOLID,
      biome: tree.biome,
      visual: { pattern: 'organic', colors: tree.trunk, accent: tree.accent, detail: 0.45 },
      tags: [...tree.tags, 'tronco'],
      variant: index + 1,
      heightInTiles: tree.height,
      ySortOffset: -2,
      dropQuantity: 3,
    });

    blocks.push({
      key: `canopy_${tree.key}`,
      name: `Copa de ${tree.name.toLowerCase()}`,
      description: 'Se dibuja por encima de los personajes.',
      worldTypes: ALL,
      layer: LayerKind.OVERLAY,
      category: BlockCategory.VEGETATION,
      collisionFlags: FLAGS.NONE,
      biome: tree.biome,
      visual: { pattern: 'canopy', colors: tree.canopy, accent: tree.accent, detail: 0.6 },
      tags: [...tree.tags, 'copa', 'follaje'],
      variant: index + 1,
    });
  }

  return blocks;
}

/** Enredaderas y follaje que viste muros, plataformas y suelos. */
const VINES: BlockSeed[] = [
  {
    key: 'vine_hanging',
    name: 'Enredadera colgante',
    description: 'Cuelga desde el borde de una plataforma o un muro.',
    worldTypes: ALL,
    layer: LayerKind.OVERLAY,
    category: BlockCategory.VEGETATION,
    collisionFlags: FLAGS.NONE,
    biome: 'jungle',
    visual: { pattern: 'vine', colors: ['#2f5f2b', '#3d7535'], accent: '#54a052', detail: 0.6 },
    tags: ['enredadera', 'colgante', 'adorno'],
    variant: 1,
  },
  {
    key: 'vine_wall',
    name: 'Enredadera de muro',
    description: 'Cubre la cara de un muro sin alterar su colision.',
    worldTypes: ALL,
    layer: LayerKind.OVERLAY,
    category: BlockCategory.VEGETATION,
    collisionFlags: FLAGS.NONE,
    biome: 'forest',
    visual: { pattern: 'vine', colors: ['#28502a', '#356536'], accent: '#4a8a45', detail: 0.7 },
    tags: ['enredadera', 'muro', 'adorno'],
    variant: 2,
  },
  {
    key: 'vine_flower',
    name: 'Enredadera florida',
    worldTypes: ALL,
    layer: LayerKind.OVERLAY,
    category: BlockCategory.VEGETATION,
    collisionFlags: FLAGS.NONE,
    biome: 'jungle',
    visual: { pattern: 'vine', colors: ['#2f5f2b', '#3d7535'], accent: '#d96ba0', detail: 0.65 },
    tags: ['enredadera', 'flor', 'adorno'],
    variant: 3,
  },
  {
    key: 'vine_climbable',
    name: 'Liana trepable',
    description: 'Enredadera con colision de escalera: el personaje puede subir.',
    worldTypes: SIDE,
    layer: LayerKind.WALL,
    category: BlockCategory.VEGETATION,
    collisionFlags: FLAGS.LADDER,
    biome: 'jungle',
    visual: { pattern: 'vine', colors: ['#3a6b2f', '#4a8039'], accent: '#63a34d', detail: 0.6 },
    tags: ['enredadera', 'trepar', 'liana'],
    variant: 4,
  },
  {
    key: 'bush',
    name: 'Arbusto',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.VEGETATION,
    collisionFlags: FLAGS.NONE,
    biome: 'forest',
    visual: { pattern: 'canopy', colors: ['#2f5a2b', '#3d7035'], accent: '#4d8a41', detail: 0.55 },
    tags: ['arbusto', 'adorno'],
  },
  {
    key: 'fern',
    name: 'Helecho',
    worldTypes: ALL,
    layer: LayerKind.PIT,
    category: BlockCategory.VEGETATION,
    collisionFlags: FLAGS.NONE,
    biome: 'jungle',
    visual: { pattern: 'grassTuft', colors: ['#2d5c2a', '#3a7034'], accent: '#54a052', detail: 0.7 },
    tags: ['helecho', 'planta', 'adorno'],
  },
  {
    key: 'mushroom',
    name: 'Setas',
    worldTypes: ALL,
    layer: LayerKind.PIT,
    category: BlockCategory.VEGETATION,
    collisionFlags: FLAGS.NONE,
    biome: 'cave',
    visual: { pattern: 'organic', colors: ['#8c4a4a', '#a35a5a'], accent: '#e0d5c0', detail: 0.6 },
    tags: ['seta', 'cueva', 'adorno'],
  },
  {
    key: 'rock',
    name: 'Roca',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.VEGETATION,
    collisionFlags: FLAGS.SOLID,
    biome: 'mountain',
    visual: { pattern: 'organic', colors: ['#5f6672', '#727a86'], accent: '#8b929d', detail: 0.5 },
    tags: ['roca', 'natural'],
    dropQuantity: 2,
  },
];

/**
 * Fluidos animados. Cinco texturas de agua y cinco de lava; el sentido de la
 * corriente y las burbujas se configuran por mundo en `FluidSetting`, no aqui:
 * el mismo bloque de agua puede correr a la derecha en un mundo y estar quieto
 * en otro.
 */
interface FluidKind {
  key: string;
  name: string;
  biome: string;
  colors: string[];
  accent: string;
  flags: number;
  tags: string[];
}

const WATERS: FluidKind[] = [
  { key: 'water', name: 'Agua', biome: 'grassland', colors: ['#20527d', '#2d6b9c'], accent: '#4d90c4', flags: FLAGS.WATER, tags: ['agua', 'dulce'] },
  { key: 'water_deep', name: 'Agua profunda', biome: 'grassland', colors: ['#14324f', '#1c4670'], accent: '#2f6b9c', flags: FLAGS.WATER, tags: ['agua', 'profunda'] },
  { key: 'water_shallow', name: 'Agua somera', biome: 'grassland', colors: ['#3d7ba8', '#57a0c9'], accent: '#8fcbe6', flags: FLAGS.WATER, tags: ['agua', 'somera'] },
  { key: 'water_swamp', name: 'Agua turbia', biome: 'swamp', colors: ['#3b4a2f', '#4c5d3a'], accent: '#68794c', flags: FLAGS.WATER, tags: ['agua', 'pantano'] },
  { key: 'water_ice', name: 'Agua helada', biome: 'tundra', colors: ['#4f7f9c', '#6fa0bb'], accent: '#b6dcec', flags: FLAGS.WATER, tags: ['agua', 'frio'] },
];

const LAVAS: FluidKind[] = [
  { key: 'lava', name: 'Lava', biome: 'volcanic', colors: ['#8c2408', '#c4470d'], accent: '#f08a1e', flags: FLAGS.DAMAGE | FLAGS.PIT, tags: ['lava', 'peligro'] },
  { key: 'lava_hot', name: 'Lava incandescente', biome: 'volcanic', colors: ['#b03408', '#e05c10'], accent: '#ffc44d', flags: FLAGS.DAMAGE | FLAGS.PIT, tags: ['lava', 'peligro', 'brillante'] },
  { key: 'lava_crust', name: 'Lava con costra', biome: 'volcanic', colors: ['#4a2a1e', '#7a3a14'], accent: '#e07a1e', flags: FLAGS.DAMAGE | FLAGS.PIT, tags: ['lava', 'costra'] },
  { key: 'lava_slow', name: 'Lava espesa', biome: 'volcanic', colors: ['#7a2408', '#a53c0c'], accent: '#d97218', flags: FLAGS.DAMAGE | FLAGS.PIT, tags: ['lava', 'espesa'] },
  { key: 'lava_blue', name: 'Fuego azul', biome: 'volcanic', colors: ['#0e3a6b', '#1a5a9c'], accent: '#5fc8f0', flags: FLAGS.DAMAGE | FLAGS.PIT, tags: ['lava', 'azul', 'magico'] },
];

function fluidBlocks(): BlockSeed[] {
  return [...WATERS, ...LAVAS].map((fluid, index) => ({
    key: fluid.key,
    name: fluid.name,
    worldTypes: ALL,
    layer: LayerKind.PIT,
    category: BlockCategory.FLUID,
    collisionFlags: fluid.flags,
    biome: fluid.biome,
    visual: { pattern: 'liquid' as const, colors: fluid.colors, accent: fluid.accent, detail: 0.55 },
    tags: fluid.tags,
    variant: (index % 5) + 1,
    // El motor lo anima; la direccion la fija `FluidSetting` por mundo.
    animated: true,
    breakable: false,
  }));
}

/** Elementos de cueva: paredes de roca, estalactitas y minerales. */
const CAVE_BLOCKS: BlockSeed[] = [
  {
    key: 'cave_wall',
    name: 'Pared de cueva',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.WALL,
    collisionFlags: FLAGS.SOLID,
    biome: 'cave',
    visual: { pattern: 'organic', colors: ['#3a3a42', '#48484f'], accent: '#585860', detail: 0.55 },
    tags: ['cueva', 'roca'],
    ySortOffset: -4,
  },
  {
    key: 'cave_floor',
    name: 'Suelo de cueva',
    worldTypes: ALL,
    layer: LayerKind.GROUND,
    category: BlockCategory.TERRAIN,
    collisionFlags: FLAGS.NONE,
    biome: 'cave',
    visual: { pattern: 'noise', colors: ['#33333a', '#3f3f47'], accent: '#4c4c55', detail: 0.5 },
    tags: ['cueva', 'suelo'],
  },
  {
    key: 'stalactite',
    name: 'Estalactita',
    worldTypes: ALL,
    layer: LayerKind.OVERLAY,
    category: BlockCategory.DECOR,
    collisionFlags: FLAGS.NONE,
    biome: 'cave',
    visual: { pattern: 'spikes', colors: ['#4a4a52', '#5a5a63'], accent: '#6e6e78', detail: 0.4 },
    tags: ['cueva', 'estalactita', 'adorno'],
  },
  {
    key: 'ore_gold',
    name: 'Veta de oro',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.WALL,
    collisionFlags: FLAGS.SOLID,
    biome: 'cave',
    visual: { pattern: 'dots', colors: ['#3a3a42', '#48484f'], accent: '#e0b83a', detail: 0.6 },
    tags: ['cueva', 'mineral', 'oro'],
    dropQuantity: 2,
  },
  {
    key: 'ore_crystal',
    name: 'Cristales',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.WALL,
    collisionFlags: FLAGS.SOLID,
    biome: 'cave',
    visual: { pattern: 'spikes', colors: ['#3a3a42', '#48484f'], accent: '#7fd8e8', detail: 0.6 },
    tags: ['cueva', 'mineral', 'cristal'],
    dropQuantity: 2,
  },
  {
    key: 'cave_entrance',
    name: 'Boca de cueva',
    description: 'Entrada a un interior. Enlazable con un mundo interior propio.',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.ENTRANCE,
    collisionFlags: FLAGS.TRIGGER,
    biome: 'cave',
    visual: { pattern: 'organic', colors: ['#1a1a20', '#26262d'], accent: '#3a3a42', detail: 0.4 },
    tags: ['cueva', 'entrada', 'interior'],
    entrance: true,
    heightInTiles: 2,
    breakable: false,
  },
];

export const NATURE_BLOCKS: BlockSeed[] = [
  ...treeBlocks(),
  ...VINES,
  ...fluidBlocks(),
  ...CAVE_BLOCKS,
];

export const FLUID_KEYS = [...WATERS, ...LAVAS].map((fluid) => fluid.key);
export const LAVA_KEYS = LAVAS.map((fluid) => fluid.key);
export { TOP_DOWN };
