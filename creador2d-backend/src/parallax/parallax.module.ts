import { Module } from '@nestjs/common';
import { ParallaxController } from './parallax.controller';
import { ParallaxService } from './parallax.service';
import { BackgroundService } from '../ai/background.service';

@Module({
  controllers: [ParallaxController],
  // BackgroundService se provee aqui y no en AiModule porque el unico consumidor
  // es el parallax; mantenerlo cerca evita una dependencia circular entre
  // modulos por una sola clase.
  providers: [ParallaxService, BackgroundService],
  exports: [ParallaxService, BackgroundService],
})
export class ParallaxModule {}
