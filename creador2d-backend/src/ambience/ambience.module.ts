import { Module } from '@nestjs/common';
import { AmbienceController } from './ambience.controller';
import { AmbienceService } from './ambience.service';

@Module({
  controllers: [AmbienceController],
  providers: [AmbienceService],
  exports: [AmbienceService],
})
export class AmbienceModule {}
