import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { ExportService } from './export.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Engine } from './script-templates';

const scriptsQuerySchema = z.object({
  engine: z.enum(['unity', 'godot', 'unreal']).default('unity'),
});

/**
 * Superficie que consumen los plugins de Unity, Godot y Unreal.
 */
@Controller('worlds/:worldId/export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  /** Formato nativo por chunks: el mas compacto para mundos grandes. */
  @Get()
  exportWorld(@CurrentUser() user: AuthenticatedUser, @Param('worldId') worldId: string) {
    return this.exportService.exportWorld(user, worldId);
  }

  /** Matriz absoluta ya ensamblada: la usan los plugins por defecto. */
  @Get('matrix')
  exportMatrix(@CurrentUser() user: AuthenticatedUser, @Param('worldId') worldId: string) {
    return this.exportService.exportMatrix(user, worldId);
  }

  /** Solo banderas de colision, sin datos visuales. */
  @Get('collision')
  exportCollision(@CurrentUser() user: AuthenticatedUser, @Param('worldId') worldId: string) {
    return this.exportService.exportCollision(user, worldId);
  }

  /**
   * Scripts de runtime (clima y fluidos) para el motor indicado. Se generan a
   * partir de la configuracion del mundo, con los valores ya incrustados.
   */
  @Get('scripts')
  exportScripts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Query(new ZodValidationPipe(scriptsQuerySchema)) query: { engine: Engine },
  ) {
    return this.exportService.exportScripts(user, worldId, query.engine);
  }
}
