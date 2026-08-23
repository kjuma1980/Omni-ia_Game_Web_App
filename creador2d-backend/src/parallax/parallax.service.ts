import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ParallaxKind , asParallaxKind, asWorldType } from '../enums';
import { PrismaService } from '../common/prisma/prisma.service';
import { WorldsService } from '../worlds/worlds.service';
import { BackgroundService } from '../ai/background.service';
import { AuthenticatedUser } from '../auth/auth.types';
import type { CreateLayerDto, GenerateLayerDto, UpdateLayerDto } from './dto/parallax.schemas';

/** Velocidad de parallax por defecto de cada capa (0 = fija, 1 = con el mundo). */
const DEFAULT_SPEED: Record<ParallaxKind, { x: number; y: number; offsetY: number }> = {
  SKY: { x: 0.05, y: 0.02, offsetY: -220 },
  FAR: { x: 0.15, y: 0.05, offsetY: -120 },
  MID: { x: 0.4, y: 0.15, offsetY: -40 },
  NEAR: { x: 1.25, y: 0.4, offsetY: 0 },
};

@Injectable()
export class ParallaxService {
  private readonly logger = new Logger(ParallaxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly worldsService: WorldsService,
    private readonly backgrounds: BackgroundService,
  ) {}

  async list(user: AuthenticatedUser, worldId: string) {
    await this.worldsService.assertAccess(worldId, user, 'read');

    return this.prisma.parallaxLayer.findMany({
      where: { worldId },
      orderBy: [{ kind: 'asc' }, { order: 'asc' }],
    });
  }

  async create(user: AuthenticatedUser, worldId: string, dto: CreateLayerDto) {
    await this.worldsService.assertAccess(worldId, user, 'write');

    const defaults = DEFAULT_SPEED[dto.kind];
    const count = await this.prisma.parallaxLayer.count({ where: { worldId } });

    if (count >= 12) {
      throw new BadRequestException('Un mundo admite como maximo 12 capas de parallax');
    }

    return this.prisma.parallaxLayer.create({
      data: {
        worldId,
        kind: dto.kind,
        name: dto.name,
        order: dto.order ?? count,
        speedX: dto.speedX ?? defaults.x,
        speedY: dto.speedY ?? defaults.y,
        offsetY: dto.offsetY ?? defaults.offsetY,
        tint: dto.tint ?? '#ffffff',
        opacity: dto.opacity ?? 1,
        repeatX: dto.repeatX ?? true,
        repeatY: dto.repeatY ?? false,
      },
    });
  }

  async update(user: AuthenticatedUser, worldId: string, layerId: string, dto: UpdateLayerDto) {
    await this.worldsService.assertAccess(worldId, user, 'write');
    await this.assertLayer(worldId, layerId);

    return this.prisma.parallaxLayer.update({ where: { id: layerId }, data: dto });
  }

  async remove(user: AuthenticatedUser, worldId: string, layerId: string) {
    await this.worldsService.assertAccess(worldId, user, 'write');
    await this.assertLayer(worldId, layerId);

    await this.prisma.parallaxLayer.delete({ where: { id: layerId } });
    return { deleted: true as const };
  }

  /** Estado del generador; la UI oculta el boton si ComfyUI no esta arriba. */
  status() {
    return this.backgrounds.status();
  }

  /**
   * Devuelve el prompt que se usaria, sin generar nada. Permite revisarlo (y
   * entender por que es asi) antes de ocupar la GPU.
   */
  async previewPrompt(user: AuthenticatedUser, worldId: string, dto: GenerateLayerDto) {
    const world = await this.worldsService.assertAccess(worldId, user, 'read');

    return this.backgrounds.preview(
      dto.kind ?? ParallaxKind.FAR,
      dto.biome ?? world.biome,
      asWorldType(world.type),
      dto.hint,
      dto.style,
    );
  }

  /**
   * Genera la imagen de una capa con ComfyUI y la guarda en la capa.
   *
   * La imagen se almacena como data URL para que el mundo quede autocontenido:
   * al exportarlo, los plugins reciben el fondo incrustado sin depender de que
   * ComfyUI siga levantado.
   */
  async generate(user: AuthenticatedUser, worldId: string, layerId: string, dto: GenerateLayerDto) {
    const world = await this.worldsService.assertAccess(worldId, user, 'write');
    const layer = await this.assertLayer(worldId, layerId);

    const kind = dto.kind ?? layer.kind;
    const biome = dto.biome ?? world.biome;

    const result = await this.backgrounds.generate(asParallaxKind(kind), biome, asWorldType(world.type), {
      userHint: dto.hint,
      style: dto.style,
      seed: dto.seed,
    });

    const updated = await this.prisma.parallaxLayer.update({
      where: { id: layerId },
      data: {
        imageUrl: result.dataUrl,
        prompt: result.prompt.positive,
        origin: 'AI_LOCAL',
        kind,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: user.id,
        action: 'PARALLAX_GENERATED',
        entity: 'ParallaxLayer',
        entityId: layerId,
        payload: { kind, biome, seed: result.seed, elapsedMs: result.elapsedMs },
      },
    });

    this.logger.log(
      `Fondo ${kind} generado para el mundo ${world.slug} en ${(result.elapsedMs / 1000).toFixed(1)}s`,
    );

    return {
      layer: updated,
      seed: result.seed,
      elapsedMs: result.elapsedMs,
      rationale: result.prompt.rationale,
    };
  }

  private async assertLayer(worldId: string, layerId: string) {
    const layer = await this.prisma.parallaxLayer.findUnique({ where: { id: layerId } });

    if (!layer || layer.worldId !== worldId) {
      throw new NotFoundException('Capa de parallax no encontrada en este mundo');
    }

    return layer;
  }
}
