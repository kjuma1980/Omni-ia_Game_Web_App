import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BlockDefinition } from '@prisma/client';
import { WorldType } from '../enums';
import { hydrateBlock, listIncludes, writeList } from '../json-list';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import type { CreateCustomBlockDto } from './dto/custom-block.schemas';

@Injectable()
export class BlocksService {
  /** Cache en memoria del catalogo: se consulta en cada escritura de chunk. */
  private cache: Map<string, BlockDefinition> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Catalogo filtrado.
   *
   * El filtro por `worldType` se hace EN MEMORIA y no en la consulta. En
   * PostgreSQL `worldTypes` era una lista y bastaba `{ has: worldType }`; en
   * SQLite es un JSON en una columna de texto, y Prisma no sabe mirar dentro.
   *
   * Es asumible porque el catalogo son unos cientos de bloques y ya se cachea
   * entero en `getCatalog()`. Si algun dia creciera hasta doler, el sitio a
   * cambiar es este -una columna indexada o una tabla de union-, no las decenas
   * de llamadas que dependen de el.
   */
  async findAll(worldType?: WorldType, biome?: string): Promise<BlockDefinition[]> {
    const filas = await this.prisma.blockDefinition.findMany({
      where: { ...(biome ? { biome } : {}) },
      orderBy: [{ layer: 'asc' }, { key: 'asc' }],
    });

    const visibles = worldType ? filas.filter((b) => listIncludes(b.worldTypes, worldType)) : filas;
    return visibles.map(hydrateBlock);
  }

  async findByKey(key: string): Promise<BlockDefinition> {
    const block = (await this.getCatalog()).get(key);
    if (!block) {
      throw new NotFoundException(`Bloque desconocido: ${key}`);
    }
    return hydrateBlock(block);
  }

  /** Catalogo indexado por clave, cargado una sola vez por proceso. */
  async getCatalog(): Promise<Map<string, BlockDefinition>> {
    if (!this.cache) {
      const blocks = await this.prisma.blockDefinition.findMany();
      this.cache = new Map(blocks.map((block) => [block.key, block]));
    }
    return this.cache;
  }

  /** Invalida la cache tras crear o modificar bloques fabricados. */
  invalidateCache(): void {
    this.cache = null;
  }

  /**
   * Comprueba que todas las claves existan y sean legales para el tipo de
   * mundo. Devuelve el mapa validado para que el llamador no repita consultas.
   */
  async validateKeys(keys: Iterable<string>, worldType: WorldType): Promise<Map<string, BlockDefinition>> {
    const catalog = await this.getCatalog();
    const resolved = new Map<string, BlockDefinition>();
    const unknown: string[] = [];
    const incompatible: string[] = [];

    for (const key of keys) {
      const block = catalog.get(key);
      if (!block) {
        unknown.push(key);
        continue;
      }
      // `listIncludes` y no `.includes()`: `worldTypes` es ahora un JSON en una
      // cadena, y `.includes()` compararia SUBCADENAS. Un bloque marcado solo
      // para SIDE_PLATFORMER pasaria como valido para un tipo cuyo nombre fuera
      // prefijo de otro, y el fallo seria silencioso.
      if (!listIncludes(block.worldTypes, worldType)) {
        incompatible.push(key);
        continue;
      }
      resolved.set(key, block);
    }

    if (unknown.length > 0) {
      throw new NotFoundException(`Bloques inexistentes: ${unknown.join(', ')}`);
    }

    if (incompatible.length > 0) {
      throw new NotFoundException(
        `Bloques no permitidos en mundos ${worldType}: ${incompatible.join(', ')}`,
      );
    }

    return resolved;
  }

  /**
   * Alta de un bloque con sprite propio, desde el generador de Omni IA Game.
   *
   * Lo que NO hace, y es deliberado: no toca inventarios, puntos, experiencia,
   * logros, roles ni calificaciones. Anade una entrada al catalogo y nada mas.
   * Tampoco lo marca como `isSystem`, de modo que la semilla no lo pisara ni
   * lo tratara como parte del catalogo base.
   */
  async createCustom(
    user: AuthenticatedUser,
    dto: CreateCustomBlockDto,
  ): Promise<BlockDefinition> {
    // Solo quien edita mundos puede ampliar el catalogo. Un espectador que
    // pudiera sembrar bloques afectaria a los mundos de todos los demas.
    if (user.role === 'VIEWER') {
      throw new ForbiddenException('Su rol no permite anadir bloques al catalogo');
    }

    const existing = await this.prisma.blockDefinition.findUnique({
      where: { key: dto.key },
      select: { key: true, isSystem: true },
    });

    if (existing) {
      if (Boolean(existing.isSystem)) {
        throw new ConflictException(`"${dto.key}" pertenece al catálogo base del sistema y no se puede sobrescribir; elija otro nombre.`);
      }

      // Reemplazo / Sobrescritura de un bloque personalizado existente del usuario
      const updated = await this.prisma.blockDefinition.update({
        where: { key: dto.key },
        data: {
          name: dto.name,
          description: dto.description,
          worldTypes: writeList(dto.worldTypes),
          layer: dto.layer,
          category: dto.category,
          placement: dto.placement,
          biome: dto.biome,
          tags: writeList(dto.tags),
          collisionFlags: dto.collisionFlags,
          heightInTiles: dto.heightInTiles,
          ySortOffset: dto.ySortOffset,
          defaultScale: dto.defaultScale,
          origin: dto.origin,
          imageData: dto.imageData,
        },
      });

      this.invalidateCache();
      return hydrateBlock(updated);
    }

    const block = await this.prisma.blockDefinition.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description,
        worldTypes: writeList(dto.worldTypes),
        layer: dto.layer,
        category: dto.category,
        placement: dto.placement,
        biome: dto.biome,
        tags: writeList(dto.tags),
        collisionFlags: dto.collisionFlags,
        heightInTiles: dto.heightInTiles,
        ySortOffset: dto.ySortOffset,
        defaultScale: dto.defaultScale,
        origin: dto.origin,
        imageData: dto.imageData,
        visual: {
          pattern: 'solid',
          colors: ['#334155', '#1e293b'],
          accent: '#64748b',
          detail: 0.2,
        },
        isSystem: false,
        breakable: true,
        craftable: false,
      },
    });

    this.invalidateCache();
    return hydrateBlock(block);
  }

  /** Borra un bloque personalizado. El catalogo base es intocable. */
  async removeCustom(user: AuthenticatedUser, key: string): Promise<{ deleted: true }> {
    const block = await this.prisma.blockDefinition.findUnique({ where: { key } });

    if (!block) {
      throw new NotFoundException(`Bloque desconocido: ${key}`);
    }

    if (block.isSystem) {
      throw new ForbiddenException(
        `"${key}" pertenece al catalogo base y no se puede borrar`,
      );
    }

    if (user.role === 'VIEWER') {
      throw new ForbiddenException('Su rol no permite borrar bloques del catalogo');
    }

    // El borrado arrastra los objetos libres que lo usaban (cascada en el
    // esquema). Las celdas de chunk que lo referencien quedan con una clave
    // huerfana, que el editor ya sabe ignorar sin romperse.
    await this.prisma.blockDefinition.delete({ where: { key } });
    this.invalidateCache();

    return { deleted: true as const };
  }
}
