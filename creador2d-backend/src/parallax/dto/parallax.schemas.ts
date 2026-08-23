import { z } from 'zod';

export const parallaxKindSchema = z.enum(['SKY', 'FAR', 'MID', 'NEAR']);

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal invalido');

export const createLayerSchema = z.object({
  kind: parallaxKindSchema,
  name: z.string().min(2).max(80),
  order: z.number().int().min(0).max(20).optional(),
  // Un factor mayor que 1 es legitimo: la capa NEAR se mueve mas rapido que el
  // mundo porque esta por delante de la camara.
  speedX: z.number().min(0).max(3).optional(),
  speedY: z.number().min(0).max(3).optional(),
  offsetY: z.number().int().min(-2000).max(2000).optional(),
  tint: hexColor.optional(),
  opacity: z.number().min(0).max(1).optional(),
  repeatX: z.boolean().optional(),
  repeatY: z.boolean().optional(),
});

export const updateLayerSchema = createLayerSchema.partial().extend({
  visible: z.boolean().optional(),
  imageUrl: z.string().nullable().optional(),
});

export const generateLayerSchema = z.object({
  kind: parallaxKindSchema.optional(),
  /** Por defecto se toma el bioma del mundo. */
  biome: z.string().min(2).max(40).optional(),
  /** Indicacion libre del usuario, se anade al final del prompt. */
  hint: z.string().max(400).optional(),
  /** Estilo artistico; por defecto arte de juego pintado a mano. */
  style: z.string().max(200).optional(),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
});

export type CreateLayerDto = z.infer<typeof createLayerSchema>;
export type UpdateLayerDto = z.infer<typeof updateLayerSchema>;
export type GenerateLayerDto = z.infer<typeof generateLayerSchema>;
