import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AiSuggestionStatus , asWorldType } from '../enums';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppConfig } from '../common/config/configuration';
import { BlocksService } from '../blocks/blocks.service';
import { WorldsService } from '../worlds/worlds.service';
import { ChunksService } from '../chunks/chunks.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { EditOperation } from '../chunks/dto/chunk.schemas';
import { createProvider } from './ai.providers';
import { AiPlan, SuggestDto, aiPlanSchema } from './ai.schemas';

/** Techo duro de operaciones que una sugerencia puede contener. */
const MAX_AI_OPERATIONS = 1024;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<{ app: AppConfig }, true>,
    private readonly blocksService: BlocksService,
    private readonly worldsService: WorldsService,
    private readonly chunksService: ChunksService,
  ) {}

  private get config(): AppConfig {
    return this.configService.get('app', { infer: true });
  }

  /** Estado del subsistema de IA para que la UI pueda ocultarlo si esta apagado. */
  status() {
    const config = this.config;
    return {
      enabled: config.ai.enabled,
      defaultProvider: config.ai.defaultProvider,
      providers: {
        ollama: true,
        gemini: Boolean(config.ai.keys.gemini),
        openai: Boolean(config.ai.keys.openai),
        anthropic: Boolean(config.ai.keys.anthropic),
      },
    };
  }

  /**
   * Genera una PROPUESTA de construccion.
   *
   * La IA no toca la base de datos: su salida se valida contra el catalogo de
   * bloques y contra el area autorizada, y se guarda como sugerencia inerte.
   * Nada se escribe en el mundo hasta que una persona la acepta.
   */
  async suggest(user: AuthenticatedUser, worldId: string, dto: SuggestDto) {
    const config = this.config;

    if (!config.ai.enabled) {
      throw new ServiceUnavailableException(
        'La asistencia por IA esta desactivada. El editor funciona igualmente sin ella.',
      );
    }

    const world = await this.worldsService.assertAccess(worldId, user, 'write');
    const catalog = await this.blocksService.findAll(asWorldType(world.type), world.biome);

    if (catalog.length === 0) {
      throw new BadRequestException('No hay bloques disponibles para este tipo de mundo');
    }

    const provider = createProvider(config, dto.provider);

    const system = this.buildSystemPrompt(world.type, world.biome, catalog, dto);
    const raw = await provider.generatePlan({ system, user: dto.prompt });

    let plan: AiPlan;
    try {
      plan = aiPlanSchema.parse(JSON.parse(this.extractJson(raw)));
    } catch (error) {
      this.logger.warn(`Respuesta de IA no parseable: ${(error as Error).message}`);

      const failed = await this.prisma.aiSuggestion.create({
        data: {
          worldId,
          userId: user.id,
          provider: provider.name,
          prompt: dto.prompt,
          operations: [],
          status: AiSuggestionStatus.FAILED,
          error: 'La respuesta del proveedor no cumple el esquema esperado',
        },
      });

      return { ...failed, operations: [] as EditOperation[] };
    }

    const operations = this.sanitize(plan, dto, new Set(catalog.map((block) => block.key)), catalog);

    if (operations.length === 0) {
      throw new BadRequestException(
        'La propuesta no contenia ninguna operacion valida dentro del area indicada',
      );
    }

    const suggestion = await this.prisma.aiSuggestion.create({
      data: {
        worldId,
        userId: user.id,
        provider: provider.name,
        prompt: dto.prompt,
        operations: operations as unknown as Prisma.InputJsonValue,
        status: AiSuggestionStatus.PENDING,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'AI',
        actorId: provider.name,
        action: 'AI_SUGGESTION_CREATED',
        entity: 'AiSuggestion',
        entityId: suggestion.id,
        payload: { worldId, operations: operations.length, summary: plan.summary },
      },
    });

    return { ...suggestion, summary: plan.summary, operations };
  }

  async listSuggestions(user: AuthenticatedUser, worldId: string) {
    await this.worldsService.assertAccess(worldId, user, 'read');

    return this.prisma.aiSuggestion.findMany({
      where: { worldId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  /**
   * Aplica una sugerencia aceptada. Se ejecuta CON LA IDENTIDAD DEL USUARIO:
   * pasa por el mismo control de permisos y las mismas validaciones que una
   * edicion manual, y otorga la progresion al usuario, no a la IA.
   */
  async accept(user: AuthenticatedUser, worldId: string, suggestionId: string) {
    await this.worldsService.assertAccess(worldId, user, 'write');

    const suggestion = await this.prisma.aiSuggestion.findUnique({ where: { id: suggestionId } });

    if (!suggestion || suggestion.worldId !== worldId) {
      throw new NotFoundException('Sugerencia no encontrada');
    }

    if (suggestion.status !== AiSuggestionStatus.PENDING) {
      throw new BadRequestException(`La sugerencia ya fue resuelta (${suggestion.status})`);
    }

    const operations = suggestion.operations as unknown as EditOperation[];
    const result = await this.chunksService.applyOperations(user, worldId, operations);

    await this.prisma.aiSuggestion.update({
      where: { id: suggestionId },
      data: { status: AiSuggestionStatus.ACCEPTED, resolvedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: user.id,
        action: 'AI_SUGGESTION_ACCEPTED',
        entity: 'AiSuggestion',
        entityId: suggestionId,
        payload: { cellsChanged: result.cellsChanged },
      },
    });

    return result;
  }

  async reject(user: AuthenticatedUser, worldId: string, suggestionId: string) {
    await this.worldsService.assertAccess(worldId, user, 'write');

    const suggestion = await this.prisma.aiSuggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion || suggestion.worldId !== worldId) {
      throw new NotFoundException('Sugerencia no encontrada');
    }

    return this.prisma.aiSuggestion.update({
      where: { id: suggestionId },
      data: { status: AiSuggestionStatus.REJECTED, resolvedAt: new Date() },
    });
  }

  /**
   * Filtro de seguridad. Descarta cualquier operacion que:
   *   - use un bloque inexistente o no permitido en este mundo,
   *   - coloque el bloque en una capa distinta a la suya,
   *   - caiga fuera del rectangulo que el usuario autorizo,
   *   - exceda el techo de operaciones.
   */
  private sanitize(
    plan: AiPlan,
    dto: SuggestDto,
    allowedKeys: Set<string>,
    catalog: Array<{ key: string; layer: string }>,
  ): EditOperation[] {
    const layerByKey = new Map(catalog.map((block) => [block.key, block.layer]));
    const minX = dto.area.tileX;
    const minY = dto.area.tileY;
    const maxX = dto.area.tileX + dto.area.width - 1;
    const maxY = dto.area.tileY + dto.area.height - 1;

    const result: EditOperation[] = [];

    for (const operation of plan.operations) {
      if (result.length >= MAX_AI_OPERATIONS) {
        break;
      }

      if (
        operation.tileX < minX ||
        operation.tileX > maxX ||
        operation.tileY < minY ||
        operation.tileY > maxY
      ) {
        continue;
      }

      if (operation.op === 'BREAK') {
        result.push({
          op: 'BREAK',
          layer: operation.layer,
          tileX: operation.tileX,
          tileY: operation.tileY,
        });
        continue;
      }

      const blockKey = operation.blockKey;
      if (!blockKey || !allowedKeys.has(blockKey)) {
        continue;
      }

      if (layerByKey.get(blockKey) !== operation.layer) {
        continue;
      }

      result.push({
        op: 'PLACE',
        layer: operation.layer,
        tileX: operation.tileX,
        tileY: operation.tileY,
        blockKey,
      });
    }

    return result;
  }

  private buildSystemPrompt(
    worldType: string,
    biome: string,
    catalog: Array<{ key: string; name: string; layer: string }>,
    dto: SuggestDto,
  ): string {
    const blockList = catalog
      .map((block) => `- ${block.key} (capa ${block.layer}): ${block.name}`)
      .join('\n');

    return [
      'Eres el asistente de construccion de un editor de mundos 2D/2.5D.',
      'Tu unica salida es un objeto JSON con las claves "summary" y "operations".',
      '',
      `Tipo de mundo: ${worldType}. Bioma: ${biome}.`,
      '',
      'Bloques disponibles (usa EXCLUSIVAMENTE estas claves y respeta su capa):',
      blockList,
      '',
      'Area de trabajo permitida, en coordenadas de tile:',
      `  desde (${dto.area.tileX}, ${dto.area.tileY})`,
      `  hasta (${dto.area.tileX + dto.area.width - 1}, ${dto.area.tileY + dto.area.height - 1})`,
      '',
      'Reglas estrictas:',
      '1. Toda operacion debe caer dentro del area indicada.',
      '2. "op" solo puede ser "PLACE" o "BREAK".',
      '3. El eje Y crece hacia abajo.',
      '4. No inventes claves de bloque: cualquier clave fuera de la lista se descarta.',
      '5. Maximo 1024 operaciones.',
    ].join('\n');
  }

  /** Extrae el primer objeto JSON del texto, tolerando vallas de markdown. */
  private extractJson(raw: string): string {
    const trimmed = raw.trim();
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
    const candidate = fenced ? fenced[1] : trimmed;

    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      throw new Error('La respuesta no contiene un objeto JSON');
    }

    return candidate.slice(start, end + 1);
  }
}
