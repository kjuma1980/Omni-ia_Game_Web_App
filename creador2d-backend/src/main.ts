import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { AppConfig } from './common/config/configuration';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Los chunks de 32x32 con paleta pueden superar el limite por defecto.
      bodyLimit: 12 * 1024 * 1024,
      trustProxy: false,
    }),
    { bufferLogs: false },
  );

  const config = app.get(ConfigService<{ app: AppConfig }, true>).get('app', { infer: true });

  await app.register(helmet, {
    // El editor vive en otro origen (Vite/Tauri); CSP se gestiona alli.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api');
  // No se registra ValidationPipe: la validacion la hace Zod por parametro
  // (`ZodValidationPipe`), lo que evita arrastrar class-validator y mantiene
  // los DTO como tipos inferidos de un unico esquema.
  app.enableShutdownHooks();

  await app.listen(config.port, config.host);

  logger.log(`Creador 2D API escuchando en http://${config.host}:${config.port}/api`);
  logger.log(`WebSocket de edicion en ws://${config.host}:${config.port}/realtime`);
  logger.log(`Asistencia por IA: ${config.ai.enabled ? 'activada' : 'desactivada'}`);
}

void bootstrap();
