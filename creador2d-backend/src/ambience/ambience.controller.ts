import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AmbienceService } from './ambience.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  UpdateWeatherDto,
  UpsertFluidDto,
  updateWeatherSchema,
  upsertFluidSchema,
} from './dto/ambience.schemas';

@Controller('worlds/:worldId')
export class AmbienceController {
  constructor(private readonly ambienceService: AmbienceService) {}

  @Get('weather')
  getWeather(@CurrentUser() user: AuthenticatedUser, @Param('worldId') worldId: string) {
    return this.ambienceService.getWeather(user, worldId);
  }

  @Patch('weather')
  updateWeather(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Body(new ZodValidationPipe(updateWeatherSchema)) dto: UpdateWeatherDto,
  ) {
    return this.ambienceService.updateWeather(user, worldId, dto);
  }

  @Get('fluids')
  listFluids(@CurrentUser() user: AuthenticatedUser, @Param('worldId') worldId: string) {
    return this.ambienceService.listFluids(user, worldId);
  }

  /** Fluidos realmente colocados en el mundo; la UI solo ofrece esos. */
  @Get('fluids/in-use')
  fluidsInUse(@CurrentUser() user: AuthenticatedUser, @Param('worldId') worldId: string) {
    return this.ambienceService.fluidsInUse(user, worldId);
  }

  @Post('fluids')
  upsertFluid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Body(new ZodValidationPipe(upsertFluidSchema)) dto: UpsertFluidDto,
  ) {
    return this.ambienceService.upsertFluid(user, worldId, dto);
  }

  @Delete('fluids/:blockKey')
  removeFluid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Param('blockKey') blockKey: string,
  ) {
    return this.ambienceService.removeFluid(user, worldId, blockKey);
  }
}
