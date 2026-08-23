import { z } from 'zod';
import { LAYER_ORDER } from '../common/domain/tiles';

/**
 * Esquema del PLAN que devuelve el proveedor de IA.
 *
 * Este esquema es la frontera de confianza: cualquier cosa que el modelo
 * escriba y no encaje aqui se descarta. Ademas se envia como `json_schema` al
 * proveedor para que la respuesta llegue ya con la forma correcta.
 */
export const aiOperationSchema = z.object({
  op: z.enum(['PLACE', 'BREAK']),
  layer: z.enum(LAYER_ORDER),
  tileX: z.number().int().min(-100_000).max(100_000),
  tileY: z.number().int().min(-100_000).max(100_000),
  blockKey: z.string().max(64).optional(),
});

export const aiPlanSchema = z.object({
  summary: z.string().max(400),
  operations: z.array(aiOperationSchema).max(1024),
});

export type AiPlan = z.infer<typeof aiPlanSchema>;

export const suggestSchema = z.object({
  prompt: z.string().min(4, 'Describa que quiere construir').max(1200),
  provider: z.enum(['ollama', 'gemini', 'openai', 'anthropic']).optional(),
  /** Region de trabajo en tiles; la IA solo puede escribir dentro de ella. */
  area: z.object({
    tileX: z.number().int(),
    tileY: z.number().int(),
    width: z.number().int().min(1).max(64),
    height: z.number().int().min(1).max(64),
  }),
});

export type SuggestDto = z.infer<typeof suggestSchema>;

/** JSON Schema equivalente, para los proveedores que aceptan salida estructurada. */
export const AI_PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['PLACE', 'BREAK'] },
          layer: { type: 'string', enum: [...LAYER_ORDER] },
          tileX: { type: 'integer' },
          tileY: { type: 'integer' },
          blockKey: { type: 'string' },
        },
        required: ['op', 'layer', 'tileX', 'tileY', 'blockKey'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'operations'],
  additionalProperties: false,
} as const;
