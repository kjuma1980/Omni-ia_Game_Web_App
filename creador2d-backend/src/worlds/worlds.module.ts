import { Global, Module } from '@nestjs/common';
import { WorldsController } from './worlds.controller';
import { WorldsService } from './worlds.service';

@Global()
@Module({
  controllers: [WorldsController],
  providers: [WorldsService],
  exports: [WorldsService],
})
export class WorldsModule {}
