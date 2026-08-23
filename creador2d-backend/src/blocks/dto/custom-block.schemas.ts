import { z } from 'zod';

/**
 * ---------------------------------------------------------------------------
 *  Bloques personalizados
 * ---------------------------------------------------------------------------
 *  Alta de un bloque con sprite propio, pensada para que el generador de
 *  imagenes de Omni IA Game pueda mandar directamente lo que acaba de producir.
 *
 *  Tres decisiones que conviene dejar escritas:
 *
 *  1. La imagen viaja como data URL y se guarda en la base de datos, no en
 *     disco. Un PNG de 128x128 con fondo transparente ronda los 10-25 KB en
 *     base64; a cambio, el bloque es una fila autocontenida que se exporta,
 *     se copia y se borra sin dejar huerfanos en el sistema de ficheros.
 *
 *  2. Se acota a 2 MB. Un sprite de bloque no necesita mas, y sin limite una
 *     imagen de 4K entraria en la fila y la haria inmanejable.
 *
 *  3. `isSystem: false` los distingue del catalogo sembrado: la semilla no los
 *     toca y borrarlos no deja el catalogo base incompleto.
 * ---------------------------------------------------------------------------
 */

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Solo mapas de bits con transparencia o con recorte previo. */
const DATA_URL = /^data:image\/(png|webp|gif);base64,[A-Za-z0-9+/]+=*$/;

export const createCustomBlockSchema = z.object({
  /**
   * Clave estable. Se normaliza en el servicio, pero se valida aqui para
   * rechazar cuanto antes lo que no podria referenciarse desde un chunk.
   */
  key: z
    .string()
    .min(3, 'La clave necesita al menos 3 caracteres')
    .max(64)
    .regex(/^[a-z0-9_]+$/, 'La clave solo admite minusculas, numeros y guion bajo'),
  name: z.string().min(2, 'El nombre necesita al menos 2 caracteres').max(80),
  description: z.string().max(500).optional(),
  worldTypes: z
    .array(
      z.enum([
        'TOP_DOWN_CENITAL',
        'TOP_DOWN_THREE_QUARTER',
        'COUNTRYSIDE_RUNNER',
        'SIDE_PLATFORMER',
      ]),
    )
    .min(1, 'Elija al menos un tipo de mundo'),
  layer: z.enum(['GROUND', 'PIT', 'WALL', 'OVERLAY']),
  category: z.enum([
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
  ]),
  placement: z.enum(['GRID', 'FREE']).default('FREE'),
  biome: z.string().min(2).max(40).default('generic'),
  tags: z.array(z.string().min(1).max(32)).max(12).default([]),
  collisionFlags: z.number().int().min(0).max(255).default(0),
  heightInTiles: z.number().int().min(1).max(8).default(1),
  ySortOffset: z.number().int().min(-64).max(64).default(0),
  defaultScale: z.number().min(0.1).max(8).default(1),
  origin: z.enum(['AI_LOCAL', 'AI_CLOUD', 'UPLOAD']).default('AI_LOCAL'),
  imageData: z
    .string()
    .regex(DATA_URL, 'La imagen debe ser un data URL PNG, WEBP o GIF en base64')
    .refine(
      (value) => value.length <= MAX_IMAGE_BYTES * 1.37,
      `La imagen supera los ${MAX_IMAGE_BYTES / 1024 / 1024} MB`,
    ),
});

export type CreateCustomBlockDto = z.infer<typeof createCustomBlockSchema>;
