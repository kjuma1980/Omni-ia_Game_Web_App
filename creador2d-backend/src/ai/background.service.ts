import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ParallaxKind, WorldType } from '../enums';
import { randomInt } from 'node:crypto';
import { AppConfig } from '../common/config/configuration';
import { buildBackgroundPrompt, type BuiltPrompt } from './background-prompts';

/**
 * ---------------------------------------------------------------------------
 *  Generacion de fondos con la infraestructura local de Omni IA Game
 * ---------------------------------------------------------------------------
 *  Reutiliza el ComfyUI que la aplicacion base ya tiene levantado, sin acoplarse
 *  a ella: se habla con el por HTTP igual que lo haria cualquier otro cliente.
 *  Si ComfyUI no esta arriba, la generacion falla con un mensaje claro y el
 *  editor sigue funcionando con fondos procedurales.
 *
 *  La costura horizontal no se deja al azar del prompt: se parchea el modelo
 *  con padding circular SOLO en el eje X (`Model Patch Seamless`, tilingX
 *  activo y tilingY desactivado). Eso hace que el propio muestreo genere una
 *  imagen que encaja consigo misma al repetirla en horizontal, mientras que en
 *  vertical mantiene un arriba y un abajo distintos, que es justo lo que
 *  necesita una capa de parallax.
 * ---------------------------------------------------------------------------
 */

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 300_000;

export interface GeneratedBackground {
  /** PNG completo en data URL: el mundo queda autocontenido al exportarlo. */
  dataUrl: string;
  prompt: BuiltPrompt;
  seed: number;
  elapsedMs: number;
}

interface ComfyNode {
  class_type: string;
  inputs: Record<string, unknown>;
}

@Injectable()
export class BackgroundService {
  private readonly logger = new Logger(BackgroundService.name);

  constructor(private readonly configService: ConfigService<{ app: AppConfig }, true>) {}

  private get config(): AppConfig {
    return this.configService.get('app', { infer: true });
  }

  /** Estado del subsistema, para que la UI sepa si ofrecer el boton. */
  async status(): Promise<{ available: boolean; baseUrl: string; checkpoint: string; detail?: string }> {
    const { comfyBaseUrl, comfyCheckpoint } = this.config.backgrounds;

    try {
      const response = await fetch(`${comfyBaseUrl}/system_stats`, {
        signal: AbortSignal.timeout(4000),
      });

      return {
        available: response.ok,
        baseUrl: comfyBaseUrl,
        checkpoint: comfyCheckpoint,
        detail: response.ok ? undefined : `ComfyUI respondio ${response.status}`,
      };
    } catch (error) {
      return {
        available: false,
        baseUrl: comfyBaseUrl,
        checkpoint: comfyCheckpoint,
        detail: `ComfyUI no responde: ${(error as Error).message}`,
      };
    }
  }

  /** Solo construye el prompt, sin generar. Permite revisarlo antes de gastar GPU. */
  preview(kind: ParallaxKind, biome: string, worldType: WorldType, userHint?: string, style?: string): BuiltPrompt {
    return buildBackgroundPrompt({ kind, biome, worldType, userHint, style });
  }

  async generate(
    kind: ParallaxKind,
    biome: string,
    worldType: WorldType,
    options: { userHint?: string; style?: string; seed?: number } = {},
  ): Promise<GeneratedBackground> {
    const started = Date.now();
    const { comfyBaseUrl } = this.config.backgrounds;

    const health = await this.status();
    if (!health.available) {
      throw new ServiceUnavailableException(
        `No se puede generar el fondo: ${health.detail ?? 'ComfyUI no disponible'}. ` +
          'Levante ComfyUI desde Omni IA Game (Ajustes > Motores locales) e intentelo de nuevo.',
      );
    }

    const prompt = buildBackgroundPrompt({ kind, biome, worldType, ...options });
    const seed = options.seed ?? randomInt(0, 2_147_483_647);
    const workflow = this.buildWorkflow(prompt, seed);

    const clientId = `creador2d-${randomInt(100000, 999999)}`;

    const queued = await this.post(`${comfyBaseUrl}/prompt`, {
      prompt: workflow,
      client_id: clientId,
    });

    const promptId = (queued as { prompt_id?: string }).prompt_id;
    if (!promptId) {
      throw new ServiceUnavailableException('ComfyUI no devolvio un identificador de trabajo');
    }

    this.logger.log(`Fondo ${kind}/${biome} encolado en ComfyUI (${promptId}), seed ${seed}`);

    const image = await this.waitForImage(comfyBaseUrl, promptId);
    const dataUrl = `data:image/png;base64,${image.toString('base64')}`;

    return { dataUrl, prompt, seed, elapsedMs: Date.now() - started };
  }

  /**
   * Workflow en formato API de ComfyUI.
   *
   * Se construye en codigo en lugar de cargar un JSON de disco porque la
   * topologia es fija y corta: lo unico que cambia entre capas son el prompt y
   * las dimensiones. Un JSON externo solo anadiria un archivo que mantener
   * sincronizado.
   */
  private buildWorkflow(prompt: BuiltPrompt, seed: number): Record<string, ComfyNode> {
    const { comfyCheckpoint, steps, cfg, sampler, scheduler } = this.config.backgrounds;

    return {
      '1': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: comfyCheckpoint },
      },
      // Padding circular en X y NO en Y: bucle horizontal, sin bucle vertical.
      '2': {
        class_type: 'Model Patch Seamless (mtb)',
        inputs: {
          model: ['1', 0],
          startStep: 0,
          stopStep: 999,
          tilingX: true,
          tilingY: false,
        },
      },
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: { text: prompt.positive, clip: ['1', 1] },
      },
      '4': {
        class_type: 'CLIPTextEncode',
        inputs: { text: prompt.negative, clip: ['1', 1] },
      },
      '5': {
        class_type: 'EmptyLatentImage',
        inputs: { width: prompt.width, height: prompt.height, batch_size: 1 },
      },
      '6': {
        class_type: 'KSampler',
        inputs: {
          model: ['2', 0],
          positive: ['3', 0],
          negative: ['4', 0],
          latent_image: ['5', 0],
          seed,
          steps,
          cfg,
          sampler_name: sampler,
          scheduler,
          denoise: 1,
        },
      },
      '7': {
        class_type: 'VAEDecode',
        inputs: { samples: ['6', 0], vae: ['1', 2] },
      },
      '8': {
        class_type: 'SaveImage',
        inputs: { images: ['7', 0], filename_prefix: 'creador2d_parallax' },
      },
    };
  }

  /** Sondea el historial hasta que el trabajo termina y descarga la imagen. */
  private async waitForImage(baseUrl: string, promptId: string): Promise<Buffer> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const history = (await this.get(`${baseUrl}/history/${promptId}`)) as Record<
        string,
        {
          status?: { completed?: boolean; status_str?: string; messages?: unknown[] };
          outputs?: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>;
        }
      >;

      const entry = history[promptId];
      if (!entry) {
        continue;
      }

      if (entry.status?.status_str === 'error') {
        throw new ServiceUnavailableException(
          `ComfyUI fallo al generar el fondo. Revise su consola: ${JSON.stringify(entry.status.messages ?? []).slice(0, 400)}`,
        );
      }

      const images = Object.values(entry.outputs ?? {}).flatMap((output) => output.images ?? []);
      if (images.length === 0) {
        continue;
      }

      const image = images[0];
      const query = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder ?? '',
        type: image.type ?? 'output',
      });

      const response = await fetch(`${baseUrl}/view?${query.toString()}`, {
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        throw new ServiceUnavailableException(`No se pudo descargar la imagen (${response.status})`);
      }

      return Buffer.from(await response.arrayBuffer());
    }

    throw new ServiceUnavailableException(
      'ComfyUI no devolvio la imagen dentro del tiempo maximo. Puede seguir generandose en segundo plano.',
    );
  }

  private async post(url: string, body: unknown): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      // ComfyUI devuelve 400 con el detalle de que nodo falta: es la pista mas
      // util cuando el usuario no tiene instalado el paquete de nodos.
      throw new BadRequestException(
        `ComfyUI rechazo el workflow (${response.status}): ${detail.slice(0, 500)}`,
      );
    }

    return response.json();
  }

  private async get(url: string): Promise<unknown> {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });

    if (!response.ok) {
      throw new ServiceUnavailableException(`ComfyUI respondio ${response.status} en ${url}`);
    }

    return response.json();
  }
}
