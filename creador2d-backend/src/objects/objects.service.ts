import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { listIncludes } from '../json-list';
import { PrismaService } from '../common/prisma/prisma.service';
import { WorldsService } from '../worlds/worlds.service';
import { BlocksService } from '../blocks/blocks.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { LAYER_ORDER } from '../common/domain/tiles';

export const placeObjectSchema = z.object({
  blockKey: z.string().min(1).max(64),
  /** Posicion en pixeles del mundo: colocacion continua, no por celdas. */
  x: z.number().min(-1_000_000).max(1_000_000),
  y: z.number().min(-1_000_000).max(1_000_000),
  rotation: z.number().min(-360).max(360).optional(),
  scale: z.number().min(0.1).max(8).optional(),
  flipX: z.boolean().optional(),
  layer: z.enum(LAYER_ORDER).optional(),
  zOffset: z.number().int().min(-500).max(500).optional(),
});

export const moveObjectSchema = placeObjectSchema.partial().omit({ blockKey: true });

export type PlaceObjectDto = z.infer<typeof placeObjectSchema>;
export type MoveObjectDto = z.infer<typeof moveObjectSchema>;

/** Techo por mundo: evita que un arrastre accidental genere miles de objetos. */
const MAX_OBJECTS_PER_WORLD = 2000;

/**
 * Objetos de colocacion libre.
 *
 * Viven aparte de los chunks porque su posicion es continua (pixeles) y no
 * discreta (celdas), y porque no participan de la matriz de colisiones: una
 * silla o un cuadro adornan, no bloquean. Eso permite arrastrarlos y soltarlos
 * en cualquier punto sin romper la geometria del mundo.
 */
@Injectable()
export class ObjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worldsService: WorldsService,
    private readonly blocksService: BlocksService,
  ) {}

  async list(user: AuthenticatedUser, worldId: string) {
    await this.worldsService.assertAccess(worldId, user, 'read');

    return this.prisma.placedObject.findMany({
      where: { worldId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async place(user: AuthenticatedUser, worldId: string, dto: PlaceObjectDto) {
    const world = await this.worldsService.assertAccess(worldId, user, 'write');
    const block = await this.blocksService.findByKey(dto.blockKey);

    if (block.placement !== 'FREE') {
      throw new BadRequestException(
        `"${dto.blockKey}" se coloca en la rejilla, no libremente. Use la herramienta de bloques.`,
      );
    }

    // listIncludes y no .includes():  es un JSON en una cadena y
    // .includes() compararia subcadenas. Ver src/json-list.ts.
    if (!listIncludes(block.worldTypes, world.type)) {
      throw new BadRequestException(
        `"${dto.blockKey}" no esta permitido en mundos ${world.type}`,
      );
    }

    const count = await this.prisma.placedObject.count({ where: { worldId } });
    if (count >= MAX_OBJECTS_PER_WORLD) {
      throw new BadRequestException(
        `Este mundo ya tiene ${MAX_OBJECTS_PER_WORLD} objetos, el maximo permitido`,
      );
    }

    return this.prisma.placedObject.create({
      data: {
        worldId,
        blockKey: dto.blockKey,
        x: dto.x,
        y: dto.y,
        rotation: dto.rotation ?? 0,
        // El tamano por defecto es el del bloque, no 1: una cama y una vela no
        // ocupan lo mismo, y salir siempre a una baldosa obligaria a
        // redimensionar cada pieza nada mas soltarla.
        scale: dto.scale ?? block.defaultScale,
        flipX: dto.flipX ?? false,
        // Por defecto se sitan en la capa natural del bloque.
        layer: dto.layer ?? block.layer,
        zOffset: dto.zOffset ?? 0,
      },
    });
  }

  async move(user: AuthenticatedUser, worldId: string, objectId: string, dto: MoveObjectDto) {
    await this.worldsService.assertAccess(worldId, user, 'write');
    await this.assertObject(worldId, objectId);

    return this.prisma.placedObject.update({ where: { id: objectId }, data: dto });
  }

  async remove(user: AuthenticatedUser, worldId: string, objectId: string) {
    await this.worldsService.assertAccess(worldId, user, 'write');
    await this.assertObject(worldId, objectId);

    await this.prisma.placedObject.delete({ where: { id: objectId } });
    return { deleted: true as const };
  }

  async clear(user: AuthenticatedUser, worldId: string) {
    await this.worldsService.assertAccess(worldId, user, 'write');

    const result = await this.prisma.placedObject.deleteMany({ where: { worldId } });
    return { deleted: result.count };
  }

  private async assertObject(worldId: string, objectId: string) {
    const object = await this.prisma.placedObject.findUnique({ where: { id: objectId } });

    if (!object || object.worldId !== worldId) {
      throw new NotFoundException('Objeto no encontrado en este mundo');
    }

    return object;
  }
}
