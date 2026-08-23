import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SuggestDto, suggestSchema } from './ai.schemas';

@Controller('worlds/:worldId/ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Get('status')
  status() {
    return this.aiService.status();
  }

  @Get('suggestions')
  list(@CurrentUser() user: AuthenticatedUser, @Param('worldId') worldId: string) {
    return this.aiService.listSuggestions(user, worldId);
  }

  @Post('suggest')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  suggest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Body(new ZodValidationPipe(suggestSchema)) dto: SuggestDto,
  ) {
    return this.aiService.suggest(user, worldId, dto);
  }

  /** La aplicacion real la ejecuta el usuario, nunca el proveedor de IA. */
  @Post('suggestions/:suggestionId/accept')
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Param('suggestionId') suggestionId: string,
  ) {
    const result = await this.aiService.accept(user, worldId, suggestionId);
    this.realtime.broadcastChunks(worldId, result.chunks);
    return result;
  }

  @Post('suggestions/:suggestionId/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Param('suggestionId') suggestionId: string,
  ) {
    return this.aiService.reject(user, worldId, suggestionId);
  }
}
