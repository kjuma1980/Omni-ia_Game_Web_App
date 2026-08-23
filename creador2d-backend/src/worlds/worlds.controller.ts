import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { WorldsService } from './worlds.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  AddMemberDto,
  CreateInteriorDto,
  CreateWorldDto,
  UpdateWorldDto,
  addMemberSchema,
  createInteriorSchema,
  createWorldSchema,
  updateWorldSchema,
} from './dto/world.schemas';

@Controller('worlds')
export class WorldsController {
  constructor(private readonly worldsService: WorldsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.worldsService.findAllForUser(user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createWorldSchema)) dto: CreateWorldDto,
  ) {
    return this.worldsService.create(user, dto);
  }

  @Get(':worldId')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('worldId') worldId: string) {
    return this.worldsService.findOne(user, worldId);
  }

  @Patch(':worldId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Body(new ZodValidationPipe(updateWorldSchema)) dto: UpdateWorldDto,
  ) {
    return this.worldsService.update(user, worldId, dto);
  }

  @Delete(':worldId')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('worldId') worldId: string) {
    return this.worldsService.remove(user, worldId);
  }

  /** Interiores (cuevas, casas, castillos) colgados de este mundo. */
  @Get(':worldId/interiors')
  listInteriors(@CurrentUser() user: AuthenticatedUser, @Param('worldId') worldId: string) {
    return this.worldsService.listInteriors(user, worldId);
  }

  @Post(':worldId/interiors')
  createInterior(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Body(new ZodValidationPipe(createInteriorSchema)) dto: CreateInteriorDto,
  ) {
    return this.worldsService.createInterior(user, worldId, dto);
  }

  @Post(':worldId/members')
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Body(new ZodValidationPipe(addMemberSchema)) dto: AddMemberDto,
  ) {
    return this.worldsService.addMember(user, worldId, dto);
  }
}
