import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { WorldsService } from '../worlds/worlds.service';
import { BlocksService } from '../blocks/blocks.service';
import { AuthenticatedUser } from '../auth/auth.types';
import type { UpdateWeatherDto, UpsertFluidDto } from './dto/ambience.schemas';

/**
 * Clima y fluidos animados de un mundo.
 *
 * Ambos son configuracion de ambiente, no contenido editable: no viven en los
 * chunks ni participan de la matriz de colisiones. Su unico efecto real es el
 * script que se genera al exportar.
 */
@Injectable()
export class AmbienceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worldsService: WorldsService,
    private readonly blocksService: BlocksService,
  ) {}

  async getWeather(user: AuthenticatedUser, worldId: string) {
    await this.worldsService.assertAccess(worldId, user, 'read');

    // Se crea al vuelo con valores neutros: asi la UI siempre tiene algo que
    // mostrar sin exigir un paso previo de "activar clima".
    return this.prisma.weatherSetting.upsert({
      where: { worldId },
      create: { worldId },
      update: {},
    });
  }

  async updateWeather(user: AuthenticatedUser, worldId: string, dto: UpdateWeatherDto) {
    await this.worldsService.assertAccess(worldId, user, 'write');

    return this.prisma.weatherSetting.upsert({
      where: { worldId },
      create: { worldId, ...dto },
      update: dto,
    });
  }

  async listFluids(user: AuthenticatedUser, worldId: string) {
    await this.worldsService.assertAccess(worldId, user, 'read');

    return this.prisma.fluidSetting.findMany({
      where: { worldId },
      orderBy: { blockKey: 'asc' },
    });
  }

  async upsertFluid(user: AuthenticatedUser, worldId: string, dto: UpsertFluidDto) {
    await this.worldsService.assertAccess(worldId, user, 'write');

    const block = await this.blocksService.findByKey(dto.blockKey);

    // Solo tiene sentido animar un fluido; hacerlo sobre un muro no produciria
    // nada util y ensuciaria el script exportado.
    if (block.category !== 'FLUID') {
      throw new BadRequestException(
        `"${dto.blockKey}" no es un fluido, no puede tener animacion de corriente`,
      );
    }

    const { blockKey, ...rest } = dto;

    return this.prisma.fluidSetting.upsert({
      where: { worldId_blockKey: { worldId, blockKey } },
      create: { worldId, blockKey, ...rest },
      update: rest,
    });
  }

  async removeFluid(user: AuthenticatedUser, worldId: string, blockKey: string) {
    await this.worldsService.assertAccess(worldId, user, 'write');

    await this.prisma.fluidSetting
      .delete({ where: { worldId_blockKey: { worldId, blockKey } } })
      .catch(() => undefined);

    return { deleted: true as const };
  }

  /** Fluidos realmente usados en el mundo: lo que tiene sentido configurar. */
  async fluidsInUse(user: AuthenticatedUser, worldId: string): Promise<string[]> {
    await this.worldsService.assertAccess(worldId, user, 'read');

    const chunks = await this.prisma.chunk.findMany({
      where: { worldId },
      select: { palette: true },
    });

    const used = new Set<string>();
    for (const chunk of chunks) {
      for (const key of chunk.palette as string[]) {
        used.add(key);
      }
    }

    if (used.size === 0) {
      return [];
    }

    const fluids = await this.prisma.blockDefinition.findMany({
      where: { key: { in: Array.from(used) }, category: 'FLUID' },
      select: { key: true },
      orderBy: { key: 'asc' },
    });

    return fluids.map((fluid) => fluid.key);
  }
}
