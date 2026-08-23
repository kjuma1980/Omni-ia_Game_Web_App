import { z } from 'zod';

export const weatherTypeSchema = z.enum([
  'NONE',
  'RAIN',
  'SNOW',
  'DUST',
  'ASH',
  'LAVA_RAIN',
  'FOG',
  'MIST',
  'STORM',
]);

export const windDirectionSchema = z.enum([
  'NONE',
  'DOWN',
  'LEFT',
  'RIGHT',
  'DOWN_LEFT',
  'DOWN_RIGHT',
  'UP',
]);

export const fluidFlowSchema = z.enum(['STILL', 'LEFT', 'RIGHT', 'UP', 'DOWN']);

export const updateWeatherSchema = z.object({
  type: weatherTypeSchema.optional(),
  intensity: z.number().min(0).max(1).optional(),
  windDirection: windDirectionSchema.optional(),
  windStrength: z.number().min(0).max(1).optional(),
  fogDensity: z.number().min(0).max(1).optional(),
  tint: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal invalido')
    .optional(),
  emissionRate: z.number().int().min(0).max(5000).optional(),
  lightning: z.boolean().optional(),
  // Un destello cada medio segundo ya no es una tormenta, es un estroboscopio;
  // por encima de dos minutos deja de percibirse como clima.
  lightningEvery: z.number().min(1).max(120).optional(),
  lightningTint: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal invalido')
    .optional(),
  enabled: z.boolean().optional(),
});

export const upsertFluidSchema = z.object({
  blockKey: z.string().min(1).max(64),
  flow: fluidFlowSchema.optional(),
  speed: z.number().min(0).max(5).optional(),
  waveHeight: z.number().min(0).max(1).optional(),
  bubbles: z.boolean().optional(),
  bubbleRate: z.number().int().min(0).max(60).optional(),
});

export type UpdateWeatherDto = z.infer<typeof updateWeatherSchema>;
export type UpsertFluidDto = z.infer<typeof upsertFluidSchema>;
