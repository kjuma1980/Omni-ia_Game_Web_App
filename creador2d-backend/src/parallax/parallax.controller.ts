import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ParallaxService } from './parallax.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CreateLayerDto,
  GenerateLayerDto,
  UpdateLayerDto,
  createLayerSchema,
  generateLayerSchema,
  updateLayerSchema,
} from './dto/parallax.schemas';

@Controller('worlds/:worldId/parallax')
export class ParallaxController {
  constructor(private readonly parallaxService: ParallaxService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('worldId') worldId: string) {
    return this.parallaxService.list(user, worldId);
  }

  /** Disponibilidad del generador local; no expone ninguna clave. */
  @Get('generator/status')
  status() {
    return this.parallaxService.status();
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Body(new ZodValidationPipe(createLayerSchema)) dto: CreateLayerDto,
  ) {
    return this.parallaxService.create(user, worldId, dto);
  }

  /** Prompt que se usaria, con su justificacion. No consume GPU. */
  @Post('prompt-preview')
  previewPrompt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Body(new ZodValidationPipe(generateLayerSchema)) dto: GenerateLayerDto,
  ) {
    return this.parallaxService.previewPrompt(user, worldId, dto);
  }

  @Patch(':layerId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Param('layerId') layerId: string,
    @Body(new ZodValidationPipe(updateLayerSchema)) dto: UpdateLayerDto,
  ) {
    return this.parallaxService.update(user, worldId, layerId, dto);
  }

  @Delete(':layerId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Param('layerId') layerId: string,
  ) {
    return this.parallaxService.remove(user, worldId, layerId);
  }

  /** Generacion real. Limitada: cada peticion ocupa la GPU varios segundos. */
  @Post(':layerId/generate')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Param('layerId') layerId: string,
    @Body(new ZodValidationPipe(generateLayerSchema)) dto: GenerateLayerDto,
  ) {
    return this.parallaxService.generate(user, worldId, layerId, dto);
  }
}
