import { z } from 'zod';
import { ALLOWED_CHUNK_SIZES } from '../../common/domain/tiles';

export const worldTypeSchema = z.enum([
  'TOP_DOWN_CENITAL',
  'TOP_DOWN_THREE_QUARTER',
  'COUNTRYSIDE_RUNNER',
  'SIDE_PLATFORMER',
]);

export const createWorldSchema = z.object({
  name: z.string().min(3, 'El nombre necesita al menos 3 caracteres').max(80),
  description: z.string().max(500).optional(),
  type: worldTypeSchema,
  tileSize: z
    .number()
    .int()
    .min(8, 'El tile minimo es de 8 px')
    .max(128, 'El tile maximo es de 128 px')
    .refine((value) => value % 8 === 0, 'El tamano de tile debe ser multiplo de 8')
    .default(32),
  chunkSize: z
    .union([z.literal(16), z.literal(32)])
    .default(16)
    .refine(
      (value) => (ALLOWED_CHUNK_SIZES as readonly number[]).includes(value),
      'El chunk debe ser de 16 o 32 tiles',
    ),
  biome: z.string().min(2).max(40).default('grassland'),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
  background: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color de fondo invalido')
    .default('#0b1120'),
  gravity: z.number().min(0).max(100).default(9.8),
  /**
   * Inclinacion de la rejilla en grados. Se acota a +-45: mas alla el eje
   * inclinado pasa a leerse como el otro eje y la edicion se vuelve confusa,
   * ademas de que la region residente rectangular dejaria de encajar con el
   * viewport.
   */
  gridAngle: z.number().min(-45).max(45).default(0),
  /** Carriles del runner. Menos de 2 no es un runner; mas de 7 no se lee. */
  laneCount: z.number().int().min(2).max(7).default(3),
  laneWidth: z.number().int().min(1).max(6).default(2),
});

export const updateWorldSchema = createWorldSchema
  .partial()
  .omit({ type: true, chunkSize: true, tileSize: true });

export const addMemberSchema = z.object({
  username: z.string().min(3).max(32),
  role: z.enum(['EDITOR', 'VIEWER']).default('EDITOR'),
});

export const createInteriorSchema = z.object({
  name: z.string().min(3, 'El nombre necesita al menos 3 caracteres').max(80),
  description: z.string().max(500).optional(),
  /** Celda del mundo exterior por la que se entra. */
  entranceTileX: z.number().int().min(-1_000_000).max(1_000_000),
  entranceTileY: z.number().int().min(-1_000_000).max(1_000_000),
  biome: z.string().min(2).max(40).optional(),
  background: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color de fondo invalido')
    .optional(),
});

export type CreateInteriorDto = z.infer<typeof createInteriorSchema>;
export type CreateWorldDto = z.infer<typeof createWorldSchema>;
export type UpdateWorldDto = z.infer<typeof updateWorldSchema>;
export type AddMemberDto = z.infer<typeof addMemberSchema>;
