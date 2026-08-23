import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { loadConfiguration } from './common/config/configuration';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { BlocksModule } from './blocks/blocks.module';
import { WorldsModule } from './worlds/worlds.module';
import { ChunksModule } from './chunks/chunks.module';
import { GamificationModule } from './gamification/gamification.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ExportModule } from './export/export.module';
import { AiModule } from './ai/ai.module';
import { ParallaxModule } from './parallax/parallax.module';
import { AmbienceModule } from './ambience/ambience.module';
import { ObjectsModule } from './objects/objects.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // `app` agrupa toda la configuracion tipada; si algo falta, el proceso
      // no arranca en lugar de servir peticiones a medio configurar.
      load: [() => ({ app: loadConfiguration() })],
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuthModule,
    BlocksModule,
    WorldsModule,
    GamificationModule,
    RealtimeModule,
    ChunksModule,
    ExportModule,
    AiModule,
    ParallaxModule,
    AmbienceModule,
    ObjectsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
