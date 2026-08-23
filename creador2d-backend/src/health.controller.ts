import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './common/prisma/prisma.service';
import { Public } from './auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Sonda usada por el editor web y por los plugins antes de sincronizar. */
  @Public()
  @Get()
  async check() {
    let database = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      service: 'creador2d-backend',
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
