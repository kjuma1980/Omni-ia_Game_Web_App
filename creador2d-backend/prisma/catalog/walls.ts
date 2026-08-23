import { BlockCategory, LayerKind } from '../../src/enums';
import { ALL, FLAGS, type BlockSeed } from './types';

/**
 * ---------------------------------------------------------------------------
 *  Muros, columnas y ruinas
 * ---------------------------------------------------------------------------
 *  Cinco materiales, y cada uno en tres estados: intacto, agrietado y en
 *  ruinas. Las ruinas son medio bloque con escombros y NO son solidas, para
 *  poder atravesarlas: un muro derruido que sigue bloqueando el paso no sirve
 *  de nada como recurso narrativo.
 * ---------------------------------------------------------------------------
 */

interface WallMaterial {
  key: string;
  name: string;
  biome: string;
  colors: string[];
  accent: string;
  pattern: 'bricks' | 'slab' | 'planks' | 'metal' | 'cobble';
  tags: string[];
}

const WALL_MATERIALS: WallMaterial[] = [
  {
    key: 'stone',
    name: 'piedra',
    biome: 'dungeon',
    colors: ['#4c4f57', '#5c606a'],
    accent: '#71767f',
    pattern: 'bricks',
    tags: ['piedra'],
  },
  {
    key: 'brick',
    name: 'ladrillo',
    biome: 'castle',
    colors: ['#8a4a32', '#9c563a'],
    accent: '#b06646',
    pattern: 'bricks',
    tags: ['ladrillo'],
  },
  {
    key: 'wood',
    name: 'madera',
    biome: 'village',
    colors: ['#7a5330', '#8a5f38'],
    accent: '#a3743f',
    pattern: 'planks',
    tags: ['madera'],
  },
  {
    key: 'sandstone',
    name: 'arenisca',
    biome: 'desert',
    colors: ['#b09a68', '#c2ab78'],
    accent: '#d4bf90',
    pattern: 'slab',
    tags: ['arenisca'],
  },
  {
    key: 'marble',
    name: 'marmol',
    biome: 'castle',
    colors: ['#c8ccd4', '#dde1e8'],
    accent: '#f0f3f7',
    pattern: 'slab',
    tags: ['marmol', 'noble'],
  },
  {
    key: 'obsidian',
    name: 'obsidiana',
    biome: 'volcanic',
    colors: ['#22242b', '#2f323b'],
    accent: '#464a57',
    pattern: 'bricks',
    tags: ['obsidiana', 'volcanico'],
  },
  {
    key: 'metal',
    name: 'metal',
    biome: 'industrial',
    colors: ['#4a4f59', '#586070'],
    accent: '#79839a',
    pattern: 'metal',
    tags: ['metal', 'industrial'],
  },
];

function wallFamily(material: WallMaterial, variant: number): BlockSeed[] {
  return [
    // --- Muro intacto ---
    {
      key: `wall_${material.key}`,
      name: `Muro de ${material.name}`,
      worldTypes: ALL,
      layer: LayerKind.WALL,
      category: BlockCategory.WALL,
      collisionFlags: FLAGS.SOLID,
      biome: material.biome,
      visual: { pattern: material.pattern, colors: material.colors, accent: material.accent, detail: 0.4 },
      tags: [...material.tags, 'muro'],
      variant,
      ySortOffset: -4,
      dropQuantity: 1,
    },
    // --- Muro agrietado ---
    {
      key: `wall_${material.key}_cracked`,
      name: `Muro de ${material.name} agrietado`,
      description: 'Sigue bloqueando el paso, pero muestra desgaste.',
      worldTypes: ALL,
      layer: LayerKind.WALL,
      category: BlockCategory.WALL,
      collisionFlags: FLAGS.SOLID,
      biome: material.biome,
      visual: {
        pattern: 'cracked',
        colors: material.colors,
        accent: material.accent,
        detail: 0.55,
        overlay: 'cracks',
      },
      tags: [...material.tags, 'muro', 'agrietado'],
      variant,
      ySortOffset: -4,
    },
    // --- Muro en ruinas: medio derruido y atravesable ---
    {
      key: `wall_${material.key}_ruin`,
      name: `Muro de ${material.name} en ruinas`,
      description: 'Derruido a media altura. No bloquea el paso.',
      worldTypes: ALL,
      layer: LayerKind.WALL,
      category: BlockCategory.RUIN,
      collisionFlags: FLAGS.NONE,
      biome: material.biome,
      visual: {
        pattern: 'rubble',
        colors: material.colors,
        accent: material.accent,
        detail: 0.65,
        overlay: 'rubble',
      },
      tags: [...material.tags, 'muro', 'ruina'],
      variant,
      ySortOffset: -2,
    },
    // --- Columna intacta ---
    {
      key: `column_${material.key}`,
      name: `Columna de ${material.name}`,
      worldTypes: ALL,
      layer: LayerKind.WALL,
      category: BlockCategory.COLUMN,
      collisionFlags: FLAGS.SOLID,
      biome: material.biome,
      visual: { pattern: 'column', colors: material.colors, accent: material.accent, detail: 0.35 },
      tags: [...material.tags, 'columna'],
      variant,
      // Dos tiles de alto: la columna se ancla en su base para el Y-sort.
      heightInTiles: 2,
      ySortOffset: -2,
    },
    // --- Columna rota ---
    {
      key: `column_${material.key}_broken`,
      name: `Columna de ${material.name} rota`,
      description: 'Fuste partido; solo queda la base.',
      worldTypes: ALL,
      layer: LayerKind.WALL,
      category: BlockCategory.RUIN,
      collisionFlags: FLAGS.SOLID,
      biome: material.biome,
      visual: {
        pattern: 'column',
        colors: material.colors,
        accent: material.accent,
        detail: 0.6,
        overlay: 'rubble',
      },
      tags: [...material.tags, 'columna', 'ruina', 'roto'],
      variant,
      ySortOffset: -2,
    },
  ];
}

/** Elementos sueltos de ruina para vestir el suelo alrededor de un derrumbe. */
const RUBBLE: BlockSeed[] = [
  {
    key: 'rubble_pile',
    name: 'Monton de escombros',
    worldTypes: ALL,
    layer: LayerKind.PIT,
    category: BlockCategory.RUIN,
    collisionFlags: FLAGS.NONE,
    biome: 'dungeon',
    visual: { pattern: 'rubble', colors: ['#5a5d65', '#6a6e77'], accent: '#7c818b', detail: 0.7 },
    tags: ['ruina', 'escombro'],
  },
  {
    key: 'rubble_wood',
    name: 'Restos de madera',
    worldTypes: ALL,
    layer: LayerKind.PIT,
    category: BlockCategory.RUIN,
    collisionFlags: FLAGS.NONE,
    biome: 'village',
    visual: { pattern: 'rubble', colors: ['#6b4a2f', '#7d5836'], accent: '#8d6640', detail: 0.7 },
    tags: ['ruina', 'escombro', 'madera'],
  },
  {
    key: 'crack_floor',
    name: 'Grieta en el suelo',
    description: 'Fractura decorativa para colocar sobre cualquier suelo.',
    worldTypes: ALL,
    layer: LayerKind.PIT,
    category: BlockCategory.RUIN,
    collisionFlags: FLAGS.NONE,
    biome: 'dungeon',
    visual: { pattern: 'cracked', colors: ['#3a3d44', '#4a4e56'], accent: '#2b2e34', detail: 0.8, overlay: 'cracks' },
    tags: ['grieta', 'ruina'],
  },
];

/** Plataformas y elementos de muro propios de vista lateral. */
const SIDE_WALL_EXTRAS: BlockSeed[] = [
  {
    key: 'platform_oneway',
    name: 'Plataforma de un sentido',
    description: 'Se atraviesa desde abajo y se pisa desde arriba.',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.TERRAIN,
    collisionFlags: FLAGS.ONE_WAY,
    biome: 'generic',
    visual: { pattern: 'slab', colors: ['#7d6a45', '#8f7a50'], accent: '#a99260', detail: 0.3 },
    tags: ['plataforma'],
  },
  {
    key: 'ladder',
    name: 'Escalera de mano',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.PROP,
    collisionFlags: FLAGS.LADDER,
    biome: 'generic',
    visual: { pattern: 'ladder', colors: ['#8a5f38', '#9c6d40'], accent: '#b8834f', detail: 0.3 },
    tags: ['escalera', 'trepar'],
  },
  {
    key: 'spikes',
    name: 'Pinchos',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.PROP,
    collisionFlags: FLAGS.DAMAGE,
    biome: 'dungeon',
    visual: { pattern: 'spikes', colors: ['#6b7280', '#8b93a1'], accent: '#c3cad6', detail: 0.4 },
    tags: ['peligro', 'dano'],
  },
  {
    key: 'railing_wood',
    name: 'Baranda de madera',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.PROP,
    collisionFlags: FLAGS.SOLID,
    biome: 'village',
    visual: { pattern: 'railing', colors: ['#7a5330', '#8a5f38'], accent: '#a3743f', detail: 0.3 },
    tags: ['baranda', 'madera'],
    ySortOffset: -3,
  },
  {
    key: 'railing_stone',
    name: 'Baranda de piedra',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.PROP,
    collisionFlags: FLAGS.SOLID,
    biome: 'castle',
    visual: { pattern: 'railing', colors: ['#5c5f68', '#6b6f79'], accent: '#7d818c', detail: 0.3 },
    tags: ['baranda', 'piedra'],
    ySortOffset: -3,
  },
  {
    key: 'railing_metal',
    name: 'Baranda metalica',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.PROP,
    collisionFlags: FLAGS.SOLID,
    biome: 'city',
    visual: { pattern: 'railing', colors: ['#4a4f59', '#586070'], accent: '#79839a', detail: 0.3 },
    tags: ['baranda', 'metal', 'urbano'],
    ySortOffset: -3,
  },
  {
    key: 'fence',
    name: 'Valla',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.PROP,
    collisionFlags: FLAGS.SOLID,
    biome: 'countryside',
    visual: { pattern: 'stripes', colors: ['#7a5330', '#8d6039'], accent: '#a3743f', detail: 0.3 },
    tags: ['valla', 'campo'],
  },
  {
    key: 'bridge_wood',
    name: 'Puente de madera',
    worldTypes: ALL,
    layer: LayerKind.PIT,
    category: BlockCategory.PROP,
    collisionFlags: FLAGS.NONE,
    biome: 'village',
    visual: { pattern: 'planks', colors: ['#7a5330', '#8a5f38'], accent: '#5a3d24', detail: 0.4 },
    tags: ['puente', 'madera'],
  },
  {
    key: 'bridge_stone',
    name: 'Puente de piedra',
    worldTypes: ALL,
    layer: LayerKind.PIT,
    category: BlockCategory.PROP,
    collisionFlags: FLAGS.NONE,
    biome: 'castle',
    visual: { pattern: 'cobble', colors: ['#6a6d76', '#7a7e88'], accent: '#8d919b', detail: 0.4 },
    tags: ['puente', 'piedra'],
  },
  {
    key: 'dock_wood',
    name: 'Muelle',
    description: 'Tablado sobre el agua.',
    worldTypes: ALL,
    layer: LayerKind.PIT,
    category: BlockCategory.PROP,
    collisionFlags: FLAGS.NONE,
    biome: 'village',
    visual: { pattern: 'planks', colors: ['#6b4a2f', '#7a5330'], accent: '#8a5f38', detail: 0.45 },
    tags: ['muelle', 'agua', 'madera'],
  },
];

export const WALL_BLOCKS: BlockSeed[] = [
  ...WALL_MATERIALS.flatMap((material, index) => wallFamily(material, index + 1)),
  ...RUBBLE,
  ...SIDE_WALL_EXTRAS,
];
