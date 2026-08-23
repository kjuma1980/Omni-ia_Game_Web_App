import { z } from 'zod';
import { LAYER_ORDER } from '../../common/domain/tiles';

export const layerSchema = z.enum(LAYER_ORDER);

/** Limite duro de celdas afectadas por una peticion de edicion. */
export const MAX_CELLS_PER_REQUEST = 4096;

const tileCoord = z.number().int().min(-1_000_000).max(1_000_000);

const placeOperation = z.object({
  op: z.literal('PLACE'),
  layer: layerSchema,
  tileX: tileCoord,
  tileY: tileCoord,
  blockKey: z.string().min(1).max(64),
});

const breakOperation = z.object({
  op: z.literal('BREAK'),
  layer: layerSchema,
  tileX: tileCoord,
  tileY: tileCoord,
});

const fillOperation = z.object({
  op: z.literal('FILL'),
  layer: layerSchema,
  tileX: tileCoord,
  tileY: tileCoord,
  width: z.number().int().min(1).max(64),
  height: z.number().int().min(1).max(64),
  blockKey: z.string().min(1).max(64),
});

const clearOperation = z.object({
  op: z.literal('CLEAR'),
  layer: layerSchema,
  tileX: tileCoord,
  tileY: tileCoord,
  width: z.number().int().min(1).max(64),
  height: z.number().int().min(1).max(64),
});

export const editOperationSchema = z.discriminatedUnion('op', [
  placeOperation,
  breakOperation,
  fillOperation,
  clearOperation,
]);

export const applyOperationsSchema = z.object({
  operations: z.array(editOperationSchema).min(1).max(MAX_CELLS_PER_REQUEST),
  /** Identificador del cliente para no reenviarle su propio eco por socket. */
  clientId: z.string().max(64).optional(),
});

export const chunkQuerySchema = z.object({
  cx: z.coerce.number().int(),
  cy: z.coerce.number().int(),
});

/** Peticion de la ventana 3x3 de chunks alrededor de la camara de edicion. */
export const viewportQuerySchema = z.object({
  cx: z.coerce.number().int(),
  cy: z.coerce.number().int(),
  /** Radio en chunks. 1 => la matriz 3x3 exigida por el editor. */
  radius: z.coerce.number().int().min(0).max(3).default(1),
});

export type EditOperation = z.infer<typeof editOperationSchema>;
export type ApplyOperationsDto = z.infer<typeof applyOperationsSchema>;
export type ViewportQueryDto = z.infer<typeof viewportQuerySchema>;
