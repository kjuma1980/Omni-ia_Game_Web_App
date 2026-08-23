import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { World } from '@prisma/client';
import { WorldMemberRole } from '../enums';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  AddMemberDto,
  CreateInteriorDto,
  CreateWorldDto,
  UpdateWorldDto,
} from './dto/world.schemas';

export type AccessLevel = 'read' | 'write' | 'own';

@Injectable()
export class WorldsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedUser, dto: CreateWorldDto): Promise<World> {
    const slug = await this.buildUniqueSlug(dto.name);

    const world = await this.prisma.world.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        type: dto.type,
        tileSize: dto.tileSize,
        chunkSize: dto.chunkSize,
        biome: dto.biome,
        seed: dto.seed ?? Math.floor(Math.random() * 2_147_483_647),
        background: dto.background,
        gravity: dto.gravity,
        ownerId: user.id,
        members: { create: { userId: user.id, role: WorldMemberRole.OWNER } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: user.id,
        action: 'WORLD_CREATE',
        entity: 'World',
        entityId: world.id,
        payload: { name: world.name, type: world.type },
      },
    });

    return world;
  }

  async findAllForUser(user: AuthenticatedUser) {
    return this.prisma.world.findMany({
      where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { chunks: true } },
        owner: { select: { id: true, username: true } },
      },
    });
  }

  async findOne(user: AuthenticatedUser, worldId: string) {
    const world = await this.assertAccess(worldId, user, 'read');

    const [chunkCount, bounds] = await Promise.all([
      this.prisma.chunk.count({ where: { worldId } }),
      this.prisma.chunk.aggregate({
        where: { worldId },
        _min: { cx: true, cy: true },
        _max: { cx: true, cy: true },
      }),
    ]);

    return {
      ...world,
      stats: {
        chunkCount,
        bounds: {
          minCx: bounds._min.cx ?? 0,
          minCy: bounds._min.cy ?? 0,
          maxCx: bounds._max.cx ?? 0,
          maxCy: bounds._max.cy ?? 0,
        },
      },
    };
  }

  async update(user: AuthenticatedUser, worldId: string, dto: UpdateWorldDto): Promise<World> {
    await this.assertAccess(worldId, user, 'write');

    return this.prisma.world.update({
      where: { id: worldId },
      data: { ...dto, version: { increment: 1 } },
    });
  }

  async remove(user: AuthenticatedUser, worldId: string): Promise<{ deleted: true }> {
    await this.assertAccess(worldId, user, 'own');
    await this.prisma.world.delete({ where: { id: worldId } });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: user.id,
        action: 'WORLD_DELETE',
        entity: 'World',
        entityId: worldId,
      },
    });

    return { deleted: true };
  }

  async addMember(user: AuthenticatedUser, worldId: string, dto: AddMemberDto) {
    await this.assertAccess(worldId, user, 'own');

    const target = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!target) {
      throw new NotFoundException(`Usuario no encontrado: ${dto.username}`);
    }

    return this.prisma.worldMember.upsert({
      where: { worldId_userId: { worldId, userId: target.id } },
      create: { worldId, userId: target.id, role: dto.role },
      update: { role: dto.role },
      include: { user: { select: { id: true, username: true } } },
    });
  }

  /**
   * Crea un interior enlazado a una celda del mundo exterior.
   *
   * Un interior ES un mundo: reutiliza chunks, exportacion, permisos y
   * colisiones en lugar de duplicar toda esa maquinaria. Lo unico que lo
   * distingue es `isInterior` y la celda del padre por la que se entra.
   */
  async createInterior(
    user: AuthenticatedUser,
    parentWorldId: string,
    dto: CreateInteriorDto,
  ): Promise<World> {
    const parent = await this.assertAccess(parentWorldId, user, 'write');

    if (parent.isInterior) {
      // Un interior dentro de otro interior complicaria la navegacion sin
      // aportar nada que no resuelva ya una segunda entrada en el exterior.
      throw new BadRequestException('No se puede crear un interior dentro de otro interior');
    }

    const existing = await this.prisma.world.findFirst({
      where: {
        parentWorldId,
        entranceTileX: dto.entranceTileX,
        entranceTileY: dto.entranceTileY,
      },
      select: { id: true, name: true },
    });

    if (existing) {
      throw new ConflictException(
        `Esa entrada ya lleva al interior "${existing.name}"`,
      );
    }

    const slug = await this.buildUniqueSlug(`${parent.slug}-${dto.name}`);

    const interior = await this.prisma.world.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        // El interior hereda perspectiva y metrica del exterior para que el
        // mismo personaje encaje en ambos sin reescalar.
        type: parent.type,
        tileSize: parent.tileSize,
        chunkSize: parent.chunkSize,
        biome: dto.biome ?? 'cave',
        seed: Math.floor(Math.random() * 2_147_483_647),
        background: dto.background ?? '#07090d',
        gravity: parent.gravity,
        ownerId: user.id,
        isInterior: true,
        parentWorldId,
        entranceTileX: dto.entranceTileX,
        entranceTileY: dto.entranceTileY,
        members: { create: { userId: user.id, role: WorldMemberRole.OWNER } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: user.id,
        action: 'INTERIOR_CREATE',
        entity: 'World',
        entityId: interior.id,
        payload: { parentWorldId, entrance: [dto.entranceTileX, dto.entranceTileY] },
      },
    });

    return interior;
  }

  /** Interiores colgados de un mundo, con la celda por la que se entra. */
  async listInteriors(user: AuthenticatedUser, worldId: string) {
    await this.assertAccess(worldId, user, 'read');

    return this.prisma.world.findMany({
      where: { parentWorldId: worldId },
      select: {
        id: true,
        slug: true,
        name: true,
        biome: true,
        entranceTileX: true,
        entranceTileY: true,
        _count: { select: { chunks: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Punto unico de control de acceso a un mundo. Todos los servicios que
   * tocan chunks pasan por aqui: ninguna ruta escribe sin haber resuelto el
   * nivel de permiso primero.
   */
  async assertAccess(worldId: string, user: AuthenticatedUser, level: AccessLevel): Promise<World> {
    const world = await this.prisma.world.findUnique({
      where: { id: worldId },
      include: { members: { where: { userId: user.id }, select: { role: true } } },
    });

    if (!world) {
      throw new NotFoundException('Mundo no encontrado');
    }

    const isOwner = world.ownerId === user.id;
    const membership = world.members[0]?.role;
    const isAdmin = user.role === 'ADMIN';

    if (level === 'own' && !isOwner && !isAdmin) {
      throw new ForbiddenException('Solo el propietario puede realizar esta operacion');
    }

    if (level === 'write') {
      const canWrite =
        isOwner ||
        isAdmin ||
        membership === WorldMemberRole.OWNER ||
        membership === WorldMemberRole.EDITOR;
      if (!canWrite) {
        throw new ForbiddenException('No tiene permisos de edicion sobre este mundo');
      }
    }

    if (level === 'read' && !isOwner && !isAdmin && !membership) {
      throw new ForbiddenException('No tiene acceso a este mundo');
    }

    const { members: _members, ...plain } = world;
    return plain as World;
  }

  /**
   * Importa una exportacion estructurada del mundo. Si el mundo ya existe
   * por ID o slug, lo actualiza y reemplaza sus chunks y parallax. Si no existe, lo crea.
   */
  async importWorld(dto: any): Promise<World> {
    const raw = dto?.world ?? dto;
    if (!raw || typeof raw !== 'object' || !raw.name) {
      throw new BadRequestException('Formato de exportacion de mundo invalido');
    }

    const existingWorld = await this.prisma.world.findFirst({
      where: {
        OR: [
          ...(raw.id ? [{ id: raw.id }] : []),
          ...(raw.slug ? [{ slug: raw.slug }] : []),
        ],
      },
    });

    const defaultUser = await this.prisma.user.findFirst();
    if (!defaultUser) {
      throw new BadRequestException('No hay usuarios en la base de datos');
    }

    const slug = existingWorld ? existingWorld.slug : (raw.slug || (await this.buildUniqueSlug(raw.name)));

    if (existingWorld) {
      return this.prisma.$transaction(async (tx) => {
        await tx.chunk.deleteMany({ where: { worldId: existingWorld.id } });
        await tx.parallaxLayer.deleteMany({ where: { worldId: existingWorld.id } });
        await tx.placedObject.deleteMany({ where: { worldId: existingWorld.id } });

        await tx.world.update({
          where: { id: existingWorld.id },
          data: {
            name: raw.name,
            description: raw.description ?? null,
            tileSize: raw.tileSize ?? 32,
            chunkSize: raw.chunkSize ?? 16,
            type: raw.type ?? 'SIDE_PLATFORMER',
            biome: raw.biome ?? 'grassland',
            seed: raw.seed ?? 0,
            background: raw.background ?? '#0b1120',
            gravity: raw.gravity ?? 9.8,
          },
        });

        if (Array.isArray(dto.chunks) && dto.chunks.length > 0) {
          for (const c of dto.chunks) {
            const collisionBuffer = Buffer.isBuffer(c.collision) 
              ? c.collision 
              : Buffer.from(Array.isArray(c.collision?.data) ? c.collision.data : (c.collision || []));

            await tx.chunk.create({
              data: {
                worldId: existingWorld.id,
                cx: c.cx ?? c.chunkX ?? 0,
                cy: c.cy ?? c.chunkY ?? 0,
                palette: c.palette ?? [],
                layers: c.layers ?? [],
                collision: collisionBuffer,
              },
            });
          }
        }

        if (Array.isArray(dto.parallax) && dto.parallax.length > 0) {
          for (const p of dto.parallax) {
            await tx.parallaxLayer.create({
              data: {
                worldId: existingWorld.id,
                name: p.name ?? 'Layer',
                kind: p.kind ?? 'SKY',
                speedX: p.speedX ?? p.scrollFactorX ?? 0.2,
                speedY: p.speedY ?? p.scrollFactorY ?? 0.1,
                tint: p.tint ?? p.color ?? '#ffffff',
                order: p.order ?? 0,
              },
            });
          }
        }

        return tx.world.findUnique({ where: { id: existingWorld.id } }) as Promise<World>;
      });
    }

    return this.prisma.world.create({
      data: {
        ...(raw.id ? { id: raw.id } : {}),
        name: raw.name,
        slug,
        description: raw.description ?? null,
        tileSize: raw.tileSize ?? 32,
        chunkSize: raw.chunkSize ?? 16,
        type: raw.type ?? 'SIDE_PLATFORMER',
        biome: raw.biome ?? 'grassland',
        seed: raw.seed ?? 0,
        background: raw.background ?? '#0b1120',
        gravity: raw.gravity ?? 9.8,
        ownerId: defaultUser.id,
        chunks: {
          create: (dto.chunks ?? []).map((c: any) => ({
            cx: c.cx ?? c.chunkX ?? 0,
            cy: c.cy ?? c.chunkY ?? 0,
            palette: c.palette ?? [],
            layers: c.layers ?? [],
            collision: Buffer.isBuffer(c.collision) 
              ? c.collision 
              : Buffer.from(Array.isArray(c.collision?.data) ? c.collision.data : (c.collision || [])),
          })),
        },
        parallaxLayers: {
          create: (dto.parallax ?? []).map((p: any) => ({
            name: p.name ?? 'Layer',
            kind: p.kind ?? 'SKY',
            speedX: p.speedX ?? p.scrollFactorX ?? 0.2,
            speedY: p.speedY ?? p.scrollFactorY ?? 0.1,
            tint: p.tint ?? p.color ?? '#ffffff',
            order: p.order ?? 0,
          })),
        },
      },
    });
  }

  private async buildUniqueSlug(name: string): Promise<string> {
    // NFD separa las tildes en marcas combinantes (U+0300..U+036F) para poder
    // eliminarlas y dejar un slug ASCII estable.
    const base =
      name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'mundo';

    let candidate = base;
    let suffix = 1;

    while (await this.prisma.world.findUnique({ where: { slug: candidate }, select: { id: true } })) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }

    return candidate;
  }
}
