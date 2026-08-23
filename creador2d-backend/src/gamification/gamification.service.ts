import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PlayerProfile } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

/** Experiencia maxima concedida por una unica peticion de edicion. */
const MAX_XP_PER_REQUEST = 200;

export interface EditingReward {
  points: number;
  experience: number;
  level: number;
  levelUp: boolean;
  drops: Record<string, number>;
  unlocked: string[];
}

interface RecipeIngredient {
  key: string;
  qty: number;
}

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Curva de nivel: cada nivel cuesta progresivamente mas experiencia.
   * nivel = floor(sqrt(xp / 100)) + 1  =>  100 xp para el 2, 400 para el 3...
   */
  static levelFor(experience: number): number {
    return Math.floor(Math.sqrt(Math.max(0, experience) / 100)) + 1;
  }

  async getProfile(userId: string) {
    const profile = await this.ensureProfile(userId);

    const [inventory, achievements] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: { profileId: profile.id, quantity: { gt: 0 } },
        include: { blockDef: { select: { key: true, name: true, layer: true, visual: true } } },
        orderBy: { blockKey: 'asc' },
      }),
      this.prisma.unlockedAchievement.findMany({
        where: { profileId: profile.id },
        include: { achievement: true },
        orderBy: { unlockedAt: 'desc' },
      }),
    ]);

    const nextLevelAt = Math.pow(GamificationService.levelFor(profile.experience), 2) * 100;

    return {
      points: profile.points,
      experience: profile.experience,
      level: profile.level,
      nextLevelAt,
      inventory: inventory.map((item) => ({
        blockKey: item.blockKey,
        name: item.blockDef.name,
        layer: item.blockDef.layer,
        visual: item.blockDef.visual,
        quantity: item.quantity,
      })),
      achievements: achievements.map((entry) => ({
        key: entry.achievement.key,
        name: entry.achievement.name,
        description: entry.achievement.description,
        points: entry.achievement.points,
        unlockedAt: entry.unlockedAt,
      })),
    };
  }

  /**
   * Recompensa por editar. Se invoca UNICAMENTE desde `ChunksService` con el
   * numero de celdas realmente escritas en la base de datos: el cliente no
   * puede reclamar progresion por su cuenta.
   */
  async rewardEditing(
    userId: string,
    cellsChanged: number,
    drops: Record<string, number>,
  ): Promise<EditingReward> {
    const profile = await this.ensureProfile(userId);

    const experience = Math.min(cellsChanged, MAX_XP_PER_REQUEST);
    const points = Math.floor(cellsChanged / 10);
    const nextExperience = profile.experience + experience;
    const nextLevel = GamificationService.levelFor(nextExperience);

    const updated = await this.prisma.playerProfile.update({
      where: { id: profile.id },
      data: {
        experience: nextExperience,
        points: profile.points + points,
        level: nextLevel,
      },
    });

    for (const [blockKey, quantity] of Object.entries(drops)) {
      if (quantity <= 0) {
        continue;
      }
      await this.prisma.inventoryItem.upsert({
        where: { profileId_blockKey: { profileId: profile.id, blockKey } },
        create: { profileId: profile.id, blockKey, quantity },
        update: { quantity: { increment: quantity } },
      });
    }

    const unlocked = await this.evaluateAchievements(updated);

    return {
      points: updated.points,
      experience: updated.experience,
      level: updated.level,
      levelUp: nextLevel > profile.level,
      drops,
      unlocked,
    };
  }

  /**
   * Fabricacion de un bloque. Toda la validacion (existencia de la receta,
   * disponibilidad de ingredientes y descuento) ocurre en el servidor dentro
   * de una transaccion.
   */
  async craft(userId: string, blockKey: string, times = 1) {
    if (times < 1 || times > 64) {
      throw new BadRequestException('La cantidad a fabricar debe estar entre 1 y 64');
    }

    const profile = await this.ensureProfile(userId);
    const block = await this.prisma.blockDefinition.findUnique({ where: { key: blockKey } });

    if (!block) {
      throw new BadRequestException(`Bloque desconocido: ${blockKey}`);
    }

    if (!block.craftable || !block.recipe) {
      throw new BadRequestException(`El bloque "${blockKey}" no es fabricable`);
    }

    const ingredients = block.recipe as unknown as RecipeIngredient[];

    return this.prisma.$transaction(async (tx) => {
      for (const ingredient of ingredients) {
        const required = ingredient.qty * times;
        const owned = await tx.inventoryItem.findUnique({
          where: { profileId_blockKey: { profileId: profile.id, blockKey: ingredient.key } },
        });

        if (!owned || owned.quantity < required) {
          throw new BadRequestException(
            `Faltan ingredientes: se necesitan ${required} de "${ingredient.key}" y hay ${owned?.quantity ?? 0}`,
          );
        }
      }

      for (const ingredient of ingredients) {
        await tx.inventoryItem.update({
          where: { profileId_blockKey: { profileId: profile.id, blockKey: ingredient.key } },
          data: { quantity: { decrement: ingredient.qty * times } },
        });
      }

      const crafted = await tx.inventoryItem.upsert({
        where: { profileId_blockKey: { profileId: profile.id, blockKey } },
        create: { profileId: profile.id, blockKey, quantity: times },
        update: { quantity: { increment: times } },
      });

      await tx.auditLog.create({
        data: {
          actorType: 'USER',
          actorId: userId,
          action: 'CRAFT',
          entity: 'InventoryItem',
          entityId: crafted.id,
          payload: { blockKey, times },
        },
      });

      return { blockKey, quantity: crafted.quantity, crafted: times };
    });
  }

  /** Concede un bloque base al inventario cuando el usuario lo necesita. */
  async grantStarterKit(userId: string): Promise<{ granted: number }> {
    const profile = await this.ensureProfile(userId);
    const basics = await this.prisma.blockDefinition.findMany({
      where: { craftable: false, isSystem: true },
      select: { key: true },
      take: 24,
    });

    for (const block of basics) {
      await this.prisma.inventoryItem.upsert({
        where: { profileId_blockKey: { profileId: profile.id, blockKey: block.key } },
        create: { profileId: profile.id, blockKey: block.key, quantity: 64 },
        update: {},
      });
    }

    return { granted: basics.length };
  }

  private async evaluateAchievements(profile: PlayerProfile): Promise<string[]> {
    const [achievements, alreadyUnlocked, distinctItems] = await Promise.all([
      this.prisma.achievement.findMany(),
      this.prisma.unlockedAchievement.findMany({
        where: { profileId: profile.id },
        select: { achievementId: true },
      }),
      this.prisma.inventoryItem.count({ where: { profileId: profile.id, quantity: { gt: 0 } } }),
    ]);

    const unlockedIds = new Set(alreadyUnlocked.map((entry) => entry.achievementId));
    const newlyUnlocked: string[] = [];

    for (const achievement of achievements) {
      if (unlockedIds.has(achievement.id)) {
        continue;
      }

      const criteria = achievement.criteria as { type?: string; threshold?: number } | null;
      if (!criteria?.type || typeof criteria.threshold !== 'number') {
        continue;
      }

      const value =
        criteria.type === 'TOTAL_EXPERIENCE'
          ? profile.experience
          : criteria.type === 'TOTAL_POINTS'
            ? profile.points
            : criteria.type === 'LEVEL'
              ? profile.level
              : criteria.type === 'INVENTORY_DISTINCT'
                ? distinctItems
                : null;

      if (value === null || value < criteria.threshold) {
        continue;
      }

      await this.prisma.unlockedAchievement.create({
        data: { profileId: profile.id, achievementId: achievement.id },
      });
      await this.prisma.playerProfile.update({
        where: { id: profile.id },
        data: { points: { increment: achievement.points } },
      });

      newlyUnlocked.push(achievement.key);
      this.logger.log(`Logro desbloqueado: ${achievement.key} (perfil ${profile.id})`);
    }

    return newlyUnlocked;
  }

  private async ensureProfile(userId: string): Promise<PlayerProfile> {
    return this.prisma.playerProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }
}
