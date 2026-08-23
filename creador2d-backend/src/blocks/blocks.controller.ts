import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { WorldType } from '../enums';
import { BlocksService } from './blocks.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CreateCustomBlockDto,
  createCustomBlockSchema,
} from './dto/custom-block.schemas';

@Controller('blocks')
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  @Get()
  findAll(@Query('worldType') worldType?: WorldType, @Query('biome') biome?: string) {
    return this.blocksService.findAll(worldType, biome);
  }

  /**
   * Alta de un bloque con sprite propio. Es la puerta por la que entra al
   * catalogo lo que se genera en el tab de sprites de Omni IA Game.
   */
  @Post('custom')
  createCustom(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCustomBlockSchema)) dto: CreateCustomBlockDto,
  ) {
    return this.blocksService.createCustom(user, dto);
  }

  @Delete('custom/:key')
  removeCustom(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string) {
    return this.blocksService.removeCustom(user, key);
  }

  // Va al final: si estuviera antes, "custom" se interpretaria como una clave
  // de bloque y capturaria las rutas de arriba.
  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.blocksService.findByKey(key);
  }
}
