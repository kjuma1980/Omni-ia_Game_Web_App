import { asWorldType } from '../enums';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BlockDefinition, Chunk, Prisma, World } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { BlocksService } from '../blocks/blocks.service';
import { WorldsService } from '../worlds/worlds.service';
import { GamificationService } from '../gamification/gamification.service';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  ChunkPayload,
  EMPTY_CELL,
  LAYER_ORDER,
  LayerName,
  chunkKey,
  compactPalette,
  createEmptyChunk,
  internBlockKey,
  localIndex,
  neighbourChunks,
  tileToChunk,
  tileToLocal,
} from '../common/domain/tiles';
import { EditOperation, MAX_CELLS_PER_REQUEST } from './dto/chunk.schemas';

/** Operacion ya expandida a una unica celda concreta. */
interface CellOperation {
  kind: 'set' | 'clear';
  layer: LayerName;
  tileX: number;
  tileY: number;
  blockKey?: string;
}

export interface ChunkMutationResult {
  worldId: string;
  chunks: ChunkPayload[];
  cellsChanged: number;
  rewards: { points: number; experience: number; drops: Record<string, number> };
}

@Injectable()
export class ChunksService {
  private readonly logger = new Logger(ChunksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blocksService: BlocksService,
    private readonly worldsService: WorldsService,
    private readonly gamification: GamificationService,
  ) {}

  /** Devuelve un chunk concreto; si no existe todavia, uno vacio en memoria. */
  async getChunk(user: AuthenticatedUser, worldId: string, cx: number, cy: number): Promise<ChunkPayload> {
    const world = await this.worldsService.assertAccess(worldId, user, 'read');
    const row = await this.prisma.chunk.findUnique({
      where: { worldId_cx_cy: { worldId, cx, cy } },
    });

    return row ? this.deserialize(row) : createEmptyChunk(cx, cy, world.chunkSize);
  }

  /**
   * Ventana de chunks alrededor de la camara. Con `radius = 1` devuelve
   * exactamente los 9 chunks que el editor mantiene residentes en memoria.
   */
  async getViewport(
    user: AuthenticatedUser,
    worldId: string,
    cx: number,
    cy: number,
    radius: number,
  ): Promise<{ world: World; chunks: ChunkPayload[] }> {
    const world = await this.worldsService.assertAccess(worldId, user, 'read');

    const coords =
      radius === 1
        ? neighbourChunks(cx, cy)
        : this.rectangleCoords(cx, cy, radius);

    const rows = await this.prisma.chunk.findMany({
      where: {
        worldId,
        cx: { gte: cx - radius, lte: cx + radius },
        cy: { gte: cy - radius, lte: cy + radius },
      },
    });

    const stored = new Map(rows.map((row) => [chunkKey(row.cx, row.cy), this.deserialize(row)]));

    const chunks = coords.map(
      (coord) =>
        stored.get(chunkKey(coord.cx, coord.cy)) ??
        createEmptyChunk(coord.cx, coord.cy, world.chunkSize),
    );

    return { world, chunks };
  }

  /** Todos los chunks materializados de un mundo (usado por la exportacion). */
  async getAllChunks(user: AuthenticatedUser, worldId: string): Promise<{ world: World; chunks: ChunkPayload[] }> {
    const world = await this.worldsService.assertAccess(worldId, user, 'read');
    const rows = await this.prisma.chunk.findMany({
      where: { worldId },
      orderBy: [{ cy: 'asc' }, { cx: 'asc' }],
    });

    return { world, chunks: rows.map((row) => this.deserialize(row)) };
  }

  /**
   * Aplica un lote de operaciones de edicion.
   *
   * El lote completo se resuelve dentro de una unica transaccion: o se escribe
   * todo o no se escribe nada. Esto evita mundos a medio pintar cuando dos
   * editores concurrentes tocan el mismo chunk.
   */
  async applyOperations(
    user: AuthenticatedUser,
    worldId: string,
    operations: EditOperation[],
  ): Promise<ChunkMutationResult> {
    const world = await this.worldsService.assertAccess(worldId, user, 'write');

    const cellOps = this.expandOperations(operations);

    if (cellOps.length === 0) {
      throw new BadRequestException('El lote no contiene operaciones aplicables');
    }

    if (cellOps.length > MAX_CELLS_PER_REQUEST) {
      throw new BadRequestException(
        `El lote afecta ${cellOps.length} celdas y el maximo por peticion es ${MAX_CELLS_PER_REQUEST}`,
      );
    }

    // Validacion del catalogo ANTES de abrir la transaccion.
    const requestedKeys = new Set(
      cellOps.map((op) => op.blockKey).filter((key): key is string => Boolean(key)),
    );
    const catalog = await this.blocksService.validateKeys(requestedKeys, asWorldType(world.type));
    const fullCatalog = await this.blocksService.getCatalog();

    // Agrupacion por chunk para minimizar lecturas y escrituras.
    const grouped = new Map<string, { cx: number; cy: number; ops: CellOperation[] }>();
    for (const op of cellOps) {
      const cx = tileToChunk(op.tileX, world.chunkSize);
      const cy = tileToChunk(op.tileY, world.chunkSize);
      const key = chunkKey(cx, cy);
      const bucket = grouped.get(key) ?? { cx, cy, ops: [] };
      bucket.ops.push(op);
      grouped.set(key, bucket);
    }

    const drops: Record<string, number> = {};
    let cellsChanged = 0;

    const updated = await this.prisma.$transaction(async (tx) => {
      const results: ChunkPayload[] = [];

      for (const { cx, cy, ops } of grouped.values()) {
        const row = await tx.chunk.findUnique({ where: { worldId_cx_cy: { worldId, cx, cy } } });
        const chunk = row ? this.deserialize(row) : createEmptyChunk(cx, cy, world.chunkSize);

        for (const op of ops) {
          const lx = tileToLocal(op.tileX, world.chunkSize);
          const ly = tileToLocal(op.tileY, world.chunkSize);
          const index = localIndex(lx, ly, world.chunkSize);
          const cells = chunk.layers[op.layer];
          const previous = cells[index];

          if (op.kind === 'clear') {
            if (previous === EMPTY_CELL) {
              continue;
            }
            const previousKey = chunk.palette[previous];
            const previousBlock = fullCatalog.get(previousKey);
            if (previousBlock && previousBlock.breakable) {
              drops[previousKey] = (drops[previousKey] ?? 0) + previousBlock.dropQuantity;
            }
            cells[index] = EMPTY_CELL;
            cellsChanged += 1;
          } else {
            const blockKey = op.blockKey as string;
            const block = catalog.get(blockKey) as BlockDefinition;

            // El bloque solo puede vivir en la capa que declara su definicion.
            if (block.layer !== op.layer) {
              throw new BadRequestException(
                `El bloque "${blockKey}" pertenece a la capa ${block.layer}, no a ${op.layer}`,
              );
            }

            const paletteIndex = internBlockKey(chunk.palette, blockKey);
            if (previous === paletteIndex) {
              continue;
            }
            cells[index] = paletteIndex;
            cellsChanged += 1;
          }

          // La matriz de colisiones se deriva siempre del contenido visual:
          // asi nunca puede desincronizarse respecto a lo que se ve.
          chunk.collision[index] = this.deriveCollision(chunk, index, fullCatalog);
        }

        compactPalette(chunk);
        chunk.revision = (row?.revision ?? 0) + 1;

        const serialized = this.serialize(chunk);

        await tx.chunk.upsert({
          where: { worldId_cx_cy: { worldId, cx, cy } },
          create: { worldId, cx, cy, ...serialized, revision: chunk.revision },
          update: { ...serialized, revision: chunk.revision },
        });

        results.push(chunk);
      }

      await tx.world.update({
        where: { id: worldId },
        data: { version: { increment: 1 } },
      });

      return results;
    });

    // La progresion se calcula EXCLUSIVAMENTE en el servidor a partir de las
    // celdas realmente escritas, nunca con cifras enviadas por el cliente.
    const rewards = await this.gamification.rewardEditing(user.id, cellsChanged, drops);

    this.logger.debug(
      `Mundo ${worldId}: ${cellsChanged} celdas modificadas en ${updated.length} chunk(s)`,
    );

    return { worldId, chunks: updated, cellsChanged, rewards };
  }

  /**
   * Vacia el mundo entero: borra todos sus chunks de golpe.
   *
   * Se hace en una sola sentencia en lugar de generar operaciones CLEAR porque
   * el lote esta limitado a 4.096 celdas y un mundo grande necesitaria cientos
   * de peticiones. El mundo sigue existiendo; queda como recien creado.
   */
  async clearWorld(user: AuthenticatedUser, worldId: string): Promise<{ chunksDeleted: number }> {
    await this.worldsService.assertAccess(worldId, user, 'write');

    const [deleted, objectsDeleted] = await this.prisma.$transaction([
      this.prisma.chunk.deleteMany({ where: { worldId } }),
      this.prisma.placedObject.deleteMany({ where: { worldId } }),
      this.prisma.world.update({
        where: { id: worldId },
        data: { version: { increment: 1 } },
      }),
    ]);

    await this.prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: user.id,
        action: 'WORLD_CLEAR',
        entity: 'World',
        entityId: worldId,
        payload: { chunksDeleted: deleted.count },
      },
    });

    this.logger.log(`Mundo ${worldId} vaciado: ${deleted.count} chunk(s) eliminados`);

    return { chunksDeleted: deleted.count };
  }

  /** Une las banderas de todos los bloques presentes en una celda. */
  private deriveCollision(
    chunk: ChunkPayload,
    index: number,
    catalog: Map<string, BlockDefinition>,
  ): number {
    let mask = 0;

    for (const layer of LAYER_ORDER) {
      const paletteIndex = chunk.layers[layer][index];
      if (paletteIndex === EMPTY_CELL) {
        continue;
      }
      const block = catalog.get(chunk.palette[paletteIndex]);
      if (block) {
        mask |= block.collisionFlags;
      }
    }

    return mask & 0xff;
  }

  /** Convierte FILL/CLEAR rectangulares en operaciones de celda unica. */
  private expandOperations(operations: EditOperation[]): CellOperation[] {
    const result: CellOperation[] = [];

    for (const operation of operations) {
      switch (operation.op) {
        case 'PLACE':
          result.push({
            kind: 'set',
            layer: operation.layer,
            tileX: operation.tileX,
            tileY: operation.tileY,
            blockKey: operation.blockKey,
          });
          break;

        case 'BREAK':
          result.push({
            kind: 'clear',
            layer: operation.layer,
            tileX: operation.tileX,
            tileY: operation.tileY,
          });
          break;

        case 'FILL':
        case 'CLEAR': {
          const isFill = operation.op === 'FILL';
          for (let dy = 0; dy < operation.height; dy += 1) {
            for (let dx = 0; dx < operation.width; dx += 1) {
              result.push({
                kind: isFill ? 'set' : 'clear',
                layer: operation.layer,
                tileX: operation.tileX + dx,
                tileY: operation.tileY + dy,
                blockKey: isFill ? operation.blockKey : undefined,
              });
              if (result.length > MAX_CELLS_PER_REQUEST) {
                throw new BadRequestException(
                  `El rectangulo excede el maximo de ${MAX_CELLS_PER_REQUEST} celdas por peticion`,
                );
              }
            }
          }
          break;
        }
      }
    }

    return result;
  }

  private rectangleCoords(cx: number, cy: number, radius: number) {
    const coords: Array<{ cx: number; cy: number }> = [];
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        coords.push({ cx: cx + dx, cy: cy + dy });
      }
    }
    return coords;
  }

  private deserialize(row: Chunk): ChunkPayload {
    return {
      cx: row.cx,
      cy: row.cy,
      revision: row.revision,
      palette: row.palette as string[],
      layers: row.layers as unknown as Record<LayerName, number[]>,
      collision: Array.from(row.collision),
    };
  }

  /**
   * Prisma tipa las columnas `Bytes` como `Uint8Array<ArrayBuffer>`, es decir,
   * respaldadas por un ArrayBuffer normal y no por un SharedArrayBuffer. Ni
   * `Buffer.from` ni `Uint8Array.from` garantizan ese respaldo en sus firmas,
   * asi que la vista se construye explicitamente sobre un ArrayBuffer propio.
   */
  private serialize(chunk: ChunkPayload): {
    palette: Prisma.InputJsonValue;
    layers: Prisma.InputJsonValue;
    collision: Uint8Array<ArrayBuffer>;
  } {
    const bytes = new Uint8Array(new ArrayBuffer(chunk.collision.length));
    bytes.set(chunk.collision);

    return {
      palette: chunk.palette as Prisma.InputJsonValue,
      layers: chunk.layers as unknown as Prisma.InputJsonValue,
      collision: bytes,
    };
  }
}
