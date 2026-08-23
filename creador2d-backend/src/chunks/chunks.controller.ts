import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ChunksService } from './chunks.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  ApplyOperationsDto,
  ViewportQueryDto,
  applyOperationsSchema,
  chunkQuerySchema,
  viewportQuerySchema,
} from './dto/chunk.schemas';
import { z } from 'zod';

type ChunkQueryDto = z.infer<typeof chunkQuerySchema>;

@Controller('worlds/:worldId/chunks')
export class ChunksController {
  constructor(
    private readonly chunksService: ChunksService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Ventana 3x3 (radius = 1) alrededor de la camara de edicion. */
  @Get('viewport')
  viewport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Query(new ZodValidationPipe(viewportQuerySchema)) query: ViewportQueryDto,
  ) {
    return this.chunksService.getViewport(user, worldId, query.cx, query.cy, query.radius);
  }

  @Get('single')
  single(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Query(new ZodValidationPipe(chunkQuerySchema)) query: ChunkQueryDto,
  ) {
    return this.chunksService.getChunk(user, worldId, query.cx, query.cy);
  }

  /**
   * Aplica un lote de operaciones. La respuesta devuelve los chunks completos
   * ya reconciliados y, en paralelo, se difunden por WebSocket al resto de
   * colaboradores conectados al mundo.
   */
  /**
   * Vacia el mundo completo. Devuelve cuantos chunks se borraron y avisa por
   * socket para que los demas editores limpien su vista.
   */
  @Delete()
  async clear(@CurrentUser() user: AuthenticatedUser, @Param('worldId') worldId: string) {
    const result = await this.chunksService.clearWorld(user, worldId);
    this.realtime.broadcastWorldCleared(worldId);
    return result;
  }

  @Post()
  async apply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Body(new ZodValidationPipe(applyOperationsSchema)) dto: ApplyOperationsDto,
  ) {
    const result = await this.chunksService.applyOperations(user, worldId, dto.operations);
    this.realtime.broadcastChunks(worldId, result.chunks);
    return result;
  }
}
