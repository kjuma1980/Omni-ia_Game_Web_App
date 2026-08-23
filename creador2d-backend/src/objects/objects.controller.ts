import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  MoveObjectDto,
  ObjectsService,
  PlaceObjectDto,
  moveObjectSchema,
  placeObjectSchema,
} from './objects.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('worlds/:worldId/objects')
export class ObjectsController {
  constructor(private readonly objectsService: ObjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('worldId') worldId: string) {
    return this.objectsService.list(user, worldId);
  }

  @Post()
  place(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Body(new ZodValidationPipe(placeObjectSchema)) dto: PlaceObjectDto,
  ) {
    return this.objectsService.place(user, worldId, dto);
  }

  @Patch(':objectId')
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Param('objectId') objectId: string,
    @Body(new ZodValidationPipe(moveObjectSchema)) dto: MoveObjectDto,
  ) {
    return this.objectsService.move(user, worldId, objectId, dto);
  }

  @Delete(':objectId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('worldId') worldId: string,
    @Param('objectId') objectId: string,
  ) {
    return this.objectsService.remove(user, worldId, objectId);
  }

  @Delete()
  clear(@CurrentUser() user: AuthenticatedUser, @Param('worldId') worldId: string) {
    return this.objectsService.clear(user, worldId);
  }
}
