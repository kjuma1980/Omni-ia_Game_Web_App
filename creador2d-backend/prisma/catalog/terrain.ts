import { BlockCategory, LayerKind } from '../../src/enums';
import { ALL, FLAGS, SIDE, TOP_DOWN, type BlockSeed } from './types';

/**
 * ---------------------------------------------------------------------------
 *  Suelos y terreno
 * ---------------------------------------------------------------------------
 *  Diez familias de suelo, cada una con su variante agrietada, para que un
 *  mundo no tenga que ser perfecto: las grietas y el desgaste son lo que hace
 *  que un escenario parezca habitado.
 *
 *  `grass_edge` y `grass_on_dirt` resuelven el caso concreto de "una capita de
 *  grass delgadita encima de la tierra": el primero es una franja de hierba
 *  para el borde superior, el segundo un bloque de tierra que ya la lleva.
 * ---------------------------------------------------------------------------
 */

interface FloorFamily {
  key: string;
  name: string;
  biome: string;
  colors: string[];
  accent: string;
  pattern: 'noise' | 'dots' | 'slab' | 'planks' | 'cobble' | 'checker' | 'organic';
  detail: number;
  /** Los suelos laterales son solidos; los cenitales, transitables. */
  solidOnSide?: boolean;
  tags: string[];
}

const FLOOR_FAMILIES: FloorFamily[] = [
  {
    key: 'dirt',
    name: 'Tierra',
    biome: 'grassland',
    colors: ['#6b4a2f', '#7d5836'],
    accent: '#8d6640',
    pattern: 'noise',
    detail: 0.4,
    tags: ['tierra', 'natural'],
  },
  {
    key: 'grass',
    name: 'Hierba',
    biome: 'grassland',
    colors: ['#3f6d3a', '#4a8040'],
    accent: '#5c9a4d',
    pattern: 'noise',
    detail: 0.35,
    tags: ['hierba', 'natural'],
  },
  {
    key: 'fine_grass',
    name: 'Hierba fina',
    biome: 'grassland',
    colors: ['#4d8544', '#5c9a4d'],
    accent: '#74b562',
    pattern: 'dots',
    detail: 0.55,
    tags: ['hierba', 'fina', 'natural'],
  },
  {
    key: 'sand',
    name: 'Arena',
    biome: 'desert',
    colors: ['#c8ab6b', '#d6bc7e'],
    accent: '#e2ce97',
    pattern: 'dots',
    detail: 0.25,
    tags: ['arena', 'natural'],
  },
  {
    key: 'snow',
    name: 'Nieve',
    biome: 'tundra',
    colors: ['#dfe8ef', '#eef4f8'],
    accent: '#ffffff',
    pattern: 'noise',
    detail: 0.2,
    tags: ['nieve', 'frio'],
  },
  {
    key: 'stone_floor',
    name: 'Losa de piedra',
    biome: 'dungeon',
    colors: ['#5c5f68', '#6b6f79'],
    accent: '#7d818c',
    pattern: 'slab',
    detail: 0.3,
    tags: ['piedra', 'construido'],
  },
  {
    key: 'cobblestone',
    name: 'Adoquin',
    biome: 'village',
    colors: ['#6a6d76', '#7a7e88'],
    accent: '#8d919b',
    pattern: 'cobble',
    detail: 0.45,
    tags: ['piedra', 'construido', 'camino'],
  },
  {
    key: 'cement',
    name: 'Cemento',
    biome: 'city',
    colors: ['#8b8f95', '#9aa0a6'],
    accent: '#aab0b6',
    pattern: 'slab',
    detail: 0.18,
    tags: ['urbano', 'construido'],
  },
  {
    key: 'wood_floor',
    name: 'Suelo de madera',
    biome: 'interior',
    colors: ['#7a5330', '#8a5f38'],
    accent: '#a3743f',
    pattern: 'planks',
    detail: 0.3,
    tags: ['madera', 'interior'],
  },
  {
    key: 'wet_soil',
    name: 'Tierra humeda',
    biome: 'swamp',
    colors: ['#4a3a28', '#5a4732'],
    accent: '#6b5a3f',
    pattern: 'organic',
    detail: 0.5,
    tags: ['humedo', 'lodo', 'natural'],
  },
  {
    key: 'gravel',
    name: 'Grava',
    biome: 'mountain',
    colors: ['#6f7178', '#7f8188'],
    accent: '#909298',
    pattern: 'dots',
    detail: 0.6,
    tags: ['piedra', 'natural'],
  },
  {
    key: 'ash_ground',
    name: 'Ceniza',
    biome: 'volcanic',
    colors: ['#3a3536', '#494243'],
    accent: '#5b5253',
    pattern: 'noise',
    detail: 0.45,
    tags: ['ceniza', 'volcanico'],
  },
];

function floorBlocks(): BlockSeed[] {
  const blocks: BlockSeed[] = [];

  for (const family of FLOOR_FAMILIES) {
    // --- Version intacta ---
    blocks.push({
      key: family.key,
      name: family.name,
      worldTypes: ALL,
      layer: LayerKind.GROUND,
      category: BlockCategory.TERRAIN,
      // En vista lateral el suelo sostiene al personaje; en cenital se pisa.
      collisionFlags: FLAGS.NONE,
      biome: family.biome,
      visual: {
        pattern: family.pattern,
        colors: family.colors,
        accent: family.accent,
        detail: family.detail,
      },
      tags: family.tags,
      variant: 1,
    });

    // --- Version agrietada ---
    blocks.push({
      key: `${family.key}_cracked`,
      name: `${family.name} agrietada`,
      description: 'Variante desgastada para romper la uniformidad del suelo.',
      worldTypes: ALL,
      layer: LayerKind.GROUND,
      category: BlockCategory.TERRAIN,
      collisionFlags: FLAGS.NONE,
      biome: family.biome,
      visual: {
        pattern: 'cracked',
        colors: family.colors,
        accent: family.accent,
        detail: Math.min(1, family.detail + 0.2),
        overlay: 'cracks',
      },
      tags: [...family.tags, 'agrietado', 'ruina'],
      variant: 2,
    });
  }

  return blocks;
}

/**
 * Bloques solidos de terreno para vista lateral: en un plataformas el suelo es
 * una pared sobre la que se camina, no una superficie que se pisa.
 */
function sideTerrainBlocks(): BlockSeed[] {
  const solids: Array<{ key: string; name: string; biome: string; colors: string[]; accent: string }> = [
    { key: 'ground_block', name: 'Bloque de terreno', biome: 'grassland', colors: ['#5c3f27', '#6d4b2e'], accent: '#3f6d3a' },
    { key: 'brick_block', name: 'Bloque de ladrillo', biome: 'castle', colors: ['#8a4a32', '#9c563a'], accent: '#b06646' },
    { key: 'metal_floor', name: 'Placa metalica', biome: 'industrial', colors: ['#4a4f59', '#586070'], accent: '#79839a' },
    { key: 'stone_block', name: 'Bloque de piedra', biome: 'mountain', colors: ['#5a5d65', '#6a6e77'], accent: '#7c818b' },
    { key: 'ice_block', name: 'Bloque de hielo', biome: 'tundra', colors: ['#a9cfe4', '#c6e2f0'], accent: '#e6f4fb' },
  ];

  const blocks: BlockSeed[] = [];

  for (const [index, solid] of solids.entries()) {
    blocks.push({
      key: solid.key,
      name: solid.name,
      worldTypes: SIDE,
      layer: LayerKind.GROUND,
      category: BlockCategory.TERRAIN,
      collisionFlags: FLAGS.SOLID,
      biome: solid.biome,
      visual: { pattern: 'bricks', colors: solid.colors, accent: solid.accent, detail: 0.35 },
      tags: ['solido', 'lateral'],
      variant: index + 1,
    });

    blocks.push({
      key: `${solid.key}_cracked`,
      name: `${solid.name} agrietado`,
      worldTypes: SIDE,
      layer: LayerKind.GROUND,
      category: BlockCategory.TERRAIN,
      collisionFlags: FLAGS.SOLID,
      biome: solid.biome,
      visual: {
        pattern: 'cracked',
        colors: solid.colors,
        accent: solid.accent,
        detail: 0.5,
        overlay: 'cracks',
      },
      tags: ['solido', 'lateral', 'agrietado', 'ruina'],
      variant: index + 1,
    });
  }

  return blocks;
}

/**
 * Remates de hierba. Resuelven la peticion de "una capita de grass delgadita"
 * sobre otro suelo: `grass_edge` es solo la franja superior (capa PIT, que se
 * dibuja encima del suelo) y `grass_on_dirt` es el bloque ya combinado.
 */
const GRASS_TOPPERS: BlockSeed[] = [
  {
    key: 'grass_edge',
    name: 'Remate de hierba',
    description: 'Franja fina de hierba para colocar sobre cualquier suelo.',
    worldTypes: ALL,
    layer: LayerKind.PIT,
    category: BlockCategory.TERRAIN,
    collisionFlags: FLAGS.NONE,
    biome: 'grassland',
    visual: {
      pattern: 'grassEdge',
      colors: ['#4a8040', '#5c9a4d'],
      accent: '#74b562',
      detail: 0.6,
    },
    tags: ['hierba', 'remate', 'fina'],
  },
  {
    key: 'grass_on_dirt',
    name: 'Tierra con hierba',
    description: 'Tierra con una capa fina de hierba encima, en un solo bloque.',
    worldTypes: ALL,
    layer: LayerKind.GROUND,
    category: BlockCategory.TERRAIN,
    collisionFlags: FLAGS.NONE,
    biome: 'grassland',
    visual: {
      pattern: 'grassEdge',
      colors: ['#6b4a2f', '#7d5836'],
      accent: '#5c9a4d',
      detail: 0.5,
    },
    tags: ['hierba', 'tierra', 'combinado'],
  },
  {
    key: 'grass_on_stone',
    name: 'Piedra con hierba',
    worldTypes: ALL,
    layer: LayerKind.GROUND,
    category: BlockCategory.TERRAIN,
    collisionFlags: FLAGS.NONE,
    biome: 'mountain',
    visual: {
      pattern: 'grassEdge',
      colors: ['#5c5f68', '#6b6f79'],
      accent: '#5c9a4d',
      detail: 0.5,
    },
    tags: ['hierba', 'piedra', 'combinado'],
  },
  {
    key: 'grass_tuft',
    name: 'Mata de hierba',
    description: 'Adorno suelto para romper la uniformidad del suelo.',
    worldTypes: ALL,
    layer: LayerKind.PIT,
    category: BlockCategory.VEGETATION,
    collisionFlags: FLAGS.NONE,
    biome: 'grassland',
    visual: {
      pattern: 'grassTuft',
      colors: ['#3f6d3a', '#4d8544'],
      accent: '#74b562',
      detail: 0.7,
    },
    tags: ['hierba', 'adorno'],
  },
];

/** Fosos, escaleras y desniveles. */
const PITS_AND_STEPS: BlockSeed[] = [
  {
    key: 'chasm',
    name: 'Abismo',
    worldTypes: ALL,
    layer: LayerKind.PIT,
    category: BlockCategory.TERRAIN,
    collisionFlags: FLAGS.PIT,
    biome: 'dungeon',
    visual: { pattern: 'solid', colors: ['#0d0f14', '#151821'], accent: '#1e2330', detail: 0.15 },
    tags: ['foso', 'vacio'],
  },
  {
    key: 'stairs',
    name: 'Escalones',
    description: 'Cambio de altura logica entre dos niveles de suelo.',
    worldTypes: ALL,
    layer: LayerKind.PIT,
    category: BlockCategory.TERRAIN,
    collisionFlags: FLAGS.STAIRS,
    biome: 'dungeon',
    visual: { pattern: 'stripes', colors: ['#6b6f79', '#7d818c'], accent: '#8e93a0', detail: 0.4 },
    tags: ['escalera', 'desnivel'],
  },
  {
    key: 'stairs_wood',
    name: 'Escalones de madera',
    worldTypes: ALL,
    layer: LayerKind.PIT,
    category: BlockCategory.TERRAIN,
    collisionFlags: FLAGS.STAIRS,
    biome: 'village',
    visual: { pattern: 'stripes', colors: ['#7a5330', '#8a5f38'], accent: '#a3743f', detail: 0.4 },
    tags: ['escalera', 'madera', 'desnivel'],
  },
  {
    key: 'ledge_high',
    name: 'Borde de nivel superior',
    description: 'Marca un suelo elevado respecto al contiguo; combinar con escalones.',
    worldTypes: TOP_DOWN,
    layer: LayerKind.WALL,
    category: BlockCategory.TERRAIN,
    collisionFlags: FLAGS.SOLID,
    biome: 'mountain',
    visual: { pattern: 'slab', colors: ['#575a62', '#666a73'], accent: '#787d87', detail: 0.35 },
    tags: ['desnivel', 'altura'],
    ySortOffset: -6,
  },
  {
    key: 'ramp',
    name: 'Rampa',
    worldTypes: ALL,
    layer: LayerKind.PIT,
    category: BlockCategory.TERRAIN,
    collisionFlags: FLAGS.STAIRS,
    biome: 'city',
    visual: { pattern: 'stripes', colors: ['#8b8f95', '#9aa0a6'], accent: '#aab0b6', detail: 0.3 },
    tags: ['rampa', 'desnivel'],
  },
];

export const TERRAIN_BLOCKS: BlockSeed[] = [
  ...floorBlocks(),
  ...sideTerrainBlocks(),
  ...GRASS_TOPPERS,
  ...PITS_AND_STEPS,
];
