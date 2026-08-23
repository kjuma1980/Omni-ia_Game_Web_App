import { z } from 'zod';
import { LAYER_ORDER } from './core/grid';

/**
 * Validacion de todo lo que entra desde la red.
 *
 * El editor nunca confia en la forma de una respuesta: un backend en otra
 * version, un proxy que recorta campos o un evento de socket manipulado
 * romperian el renderizador en mitad de un frame. Aqui se corta antes.
 */

export const layerSchema = z.enum(LAYER_ORDER);

export const worldTypeSchema = z.enum([
  'TOP_DOWN_CENITAL',
  'TOP_DOWN_THREE_QUARTER',
  'COUNTRYSIDE_RUNNER',
  'SIDE_PLATFORMER',
]);

export const patternSchema = z.enum([
  'solid',
  'noise',
  'bricks',
  'planks',
  'checker',
  'stripes',
  'dots',
  'organic',
  'liquid',
  'spikes',
  'ladder',
  'canopy',
  'slab',
  // Ampliaciones del catalogo extendido
  'cracked',
  'rubble',
  'column',
  'grassTuft',
  'grassEdge',
  'vine',
  'cobble',
  'thatch',
  'metal',
  'glass',
  'fabric',
  'wood',
  'roofTile',
  'window',
  'flame',
  'statue',
  'railing',
  'wheel',
  'signpost',
]);

export const visualSchema = z.object({
  // `catch` evita que un patron desconocido (backend mas nuevo que el editor)
  // rompa toda la paleta: ese bloque se dibuja liso y el resto sigue vivo.
  pattern: patternSchema.catch('solid'),
  colors: z.array(z.string()).min(1),
  accent: z.string().optional(),
  detail: z.number().min(0).max(1).optional(),
  overlay: z.enum(['cracks', 'moss', 'rubble', 'snow', 'wet', 'soot']).optional().nullable(),
});

export const blockCategorySchema = z.enum([
  'TERRAIN',
  'WALL',
  'COLUMN',
  'RUIN',
  'VEGETATION',
  'FLUID',
  'PROP',
  'FURNITURE',
  'STRUCTURE',
  'VEHICLE',
  'SIGN',
  'LIGHT',
  'DECOR',
  'ENTRANCE',
]);

export const placementSchema = z.enum(['GRID', 'FREE']);

export const blockDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  worldTypes: z.array(worldTypeSchema),
  layer: layerSchema,
  category: blockCategorySchema.catch('TERRAIN'),
  placement: placementSchema.catch('GRID'),
  tags: z.array(z.string()).default([]),
  variant: z.number().int().default(1),
  animated: z.boolean().default(false),
  entrance: z.boolean().default(false),
  collisionFlags: z.number().int().min(0).max(255),
  biome: z.string(),
  visual: visualSchema,
  ySortOffset: z.number().int(),
  heightInTiles: z.number().int().min(1).max(8),
  breakable: z.boolean(),
  craftable: z.boolean(),
  recipe: z
    .array(z.object({ key: z.string(), qty: z.number().int().min(1) }))
    .nullable()
    .optional(),
  dropQuantity: z.number().int().min(0),
  // `default` en vez de exigirlos: un backend anterior a estos campos sigue
  // sirviendo bloques perfectamente utiles, y rechazarlos por eso vaciaria la
  // paleta otra vez.
  defaultScale: z.number().positive().default(1),
  origin: z.enum(['PROCEDURAL', 'AI_LOCAL', 'AI_CLOUD', 'UPLOAD']).catch('PROCEDURAL'),
  imageData: z.string().nullable().optional(),
});

export const worldSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  type: worldTypeSchema,
  tileSize: z.number().int(),
  chunkSize: z.number().int(),
  biome: z.string(),
  seed: z.number().int(),
  background: z.string(),
  gravity: z.number(),
  gridAngle: z.number().default(0),
  laneCount: z.number().int().default(3),
  laneWidth: z.number().int().default(2),
  version: z.number().int(),
  ownerId: z.string(),
  updatedAt: z.string(),
  isInterior: z.boolean().default(false),
  parentWorldId: z.string().nullable().optional(),
  entranceTileX: z.number().int().nullable().optional(),
  entranceTileY: z.number().int().nullable().optional(),
  _count: z.object({ chunks: z.number().int() }).optional(),
  owner: z.object({ id: z.string(), username: z.string() }).optional(),
});

export const worldDetailSchema = worldSummarySchema.extend({
  stats: z.object({
    chunkCount: z.number().int(),
    bounds: z.object({
      minCx: z.number().int(),
      minCy: z.number().int(),
      maxCx: z.number().int(),
      maxCy: z.number().int(),
    }),
  }),
});

export const chunkPayloadSchema = z.object({
  cx: z.number().int(),
  cy: z.number().int(),
  revision: z.number().int(),
  palette: z.array(z.string()),
  layers: z.object({
    GROUND: z.array(z.number().int()),
    PIT: z.array(z.number().int()),
    WALL: z.array(z.number().int()),
    OVERLAY: z.array(z.number().int()),
  }),
  collision: z.array(z.number().int().min(0).max(255)),
});

export const viewportSchema = z.object({
  world: worldSummarySchema,
  chunks: z.array(chunkPayloadSchema),
});

export const mutationResultSchema = z.object({
  worldId: z.string(),
  chunks: z.array(chunkPayloadSchema),
  cellsChanged: z.number().int(),
  rewards: z.object({
    points: z.number().int(),
    experience: z.number().int(),
    level: z.number().int(),
    levelUp: z.boolean(),
    drops: z.record(z.string(), z.number()),
    unlocked: z.array(z.string()),
  }),
});

export const profileSchema = z.object({
  points: z.number().int(),
  experience: z.number().int(),
  level: z.number().int(),
  nextLevelAt: z.number(),
  inventory: z.array(
    z.object({
      blockKey: z.string(),
      name: z.string(),
      layer: layerSchema,
      visual: visualSchema,
      quantity: z.number().int(),
    }),
  ),
  achievements: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      description: z.string(),
      points: z.number().int(),
      unlockedAt: z.string(),
    }),
  ),
});

export const authSessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    username: z.string(),
    role: z.string(),
  }),
});

export const aiStatusSchema = z.object({
  enabled: z.boolean(),
  defaultProvider: z.string(),
  providers: z.record(z.string(), z.boolean()),
});

export const aiSuggestionSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  provider: z.string(),
  prompt: z.string(),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'FAILED']),
  error: z.string().nullable().optional(),
  createdAt: z.string(),
  summary: z.string().optional(),
  operations: z.array(z.unknown()).optional(),
});

export const parallaxKindSchema = z.enum(['SKY', 'FAR', 'MID', 'NEAR']);

export const parallaxLayerSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  kind: parallaxKindSchema,
  order: z.number().int(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  prompt: z.string().nullable().optional(),
  origin: z.string(),
  speedX: z.number(),
  speedY: z.number(),
  opacity: z.number(),
  tint: z.string(),
  repeatX: z.boolean(),
  repeatY: z.boolean(),
  offsetY: z.number().int(),
  visible: z.boolean(),
});

export const weatherSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  type: z.enum(['NONE', 'RAIN', 'SNOW', 'DUST', 'ASH', 'LAVA_RAIN', 'FOG', 'MIST', 'STORM']),
  intensity: z.number(),
  windDirection: z.enum(['NONE', 'DOWN', 'LEFT', 'RIGHT', 'DOWN_LEFT', 'DOWN_RIGHT', 'UP']),
  windStrength: z.number(),
  fogDensity: z.number(),
  tint: z.string(),
  emissionRate: z.number().int(),
  lightning: z.boolean().default(false),
  lightningEvery: z.number().default(7),
  lightningTint: z.string().default('#dbe9ff'),
  enabled: z.boolean(),
});

export const fluidSettingSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  blockKey: z.string(),
  flow: z.enum(['STILL', 'LEFT', 'RIGHT', 'UP', 'DOWN']),
  speed: z.number(),
  waveHeight: z.number(),
  bubbles: z.boolean(),
  bubbleRate: z.number().int(),
});

export const placedObjectSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  blockKey: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  scale: z.number(),
  flipX: z.boolean(),
  layer: layerSchema,
  zOffset: z.number().int(),
});

export const interiorSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  biome: z.string().optional(),
  entranceTileX: z.number().int().nullable(),
  entranceTileY: z.number().int().nullable(),
  _count: z.object({ chunks: z.number().int() }).optional(),
});

export const healthSchema = z.object({
  service: z.string(),
  status: z.string(),
  database: z.string(),
  timestamp: z.string(),
});

/** Formulario de creacion de mundo, validado antes de tocar la red. */
export const createWorldFormSchema = z.object({
  name: z.string().min(3, 'Minimo 3 caracteres').max(80),
  description: z.string().max(500).optional(),
  type: worldTypeSchema,
  tileSize: z
    .number()
    .int()
    .min(8)
    .max(128)
    .refine((value) => value % 8 === 0, 'Debe ser multiplo de 8'),
  chunkSize: z.union([z.literal(16), z.literal(32)]),
  biome: z.string().min(2).max(40),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal invalido'),
});

export type CreateWorldForm = z.infer<typeof createWorldFormSchema>;
