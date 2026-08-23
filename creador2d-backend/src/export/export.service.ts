import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ChunksService } from '../chunks/chunks.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { WorldsService } from '../worlds/worlds.service';
import {
  EMPTY_CELL,
  LAYER_ORDER,
  LayerName,
  localIndex,
} from '../common/domain/tiles';
import {
  type Engine,
  type GeneratedScript,
  fluidScript,
  weatherScript,
} from './script-templates';

export interface WorldExport {
  format: 'creador2d.world.v1';
  generatedAt: string;
  world: {
    id: string;
    slug: string;
    name: string;
    type: string;
    tileSize: number;
    chunkSize: number;
    biome: string;
    seed: number;
    background: string;
    gravity: number;
    version: number;
  };
  blocks: Array<{
    key: string;
    name: string;
    layer: string;
    collisionFlags: number;
    heightInTiles: number;
    ySortOffset: number;
    visual: unknown;
  }>;
  bounds: { minTileX: number; minTileY: number; maxTileX: number; maxTileY: number };
  chunks: Array<{
    cx: number;
    cy: number;
    revision: number;
    palette: string[];
    layers: Record<LayerName, number[]>;
    collision: number[];
  }>;
  /** Capas de fondo con su imagen incrustada y su factor de desplazamiento. */
  parallax: Array<{
    kind: string;
    order: number;
    name: string;
    imageUrl: string | null;
    speedX: number;
    speedY: number;
    opacity: number;
    tint: string;
    repeatX: boolean;
    repeatY: boolean;
    offsetY: number;
    visible: boolean;
  }>;
  /** Mobiliario y adornos en posicion continua, fuera de la rejilla. */
  objects: Array<{
    blockKey: string;
    x: number;
    y: number;
    rotation: number;
    scale: number;
    flipX: boolean;
    layer: string;
    zOffset: number;
  }>;
  /** Clima activo; null si el mundo no lo usa. */
  weather: {
    type: string;
    intensity: number;
    windDirection: string;
    windStrength: number;
    fogDensity: number;
    tint: string;
    emissionRate: number;
  } | null;
  /** Fluidos animados configurados en este mundo. */
  fluids: Array<{
    blockKey: string;
    flow: string;
    speed: number;
    waveHeight: number;
    bubbles: boolean;
    bubbleRate: number;
  }>;
  /** Interiores enlazados y la celda por la que se entra a cada uno. */
  interiors: Array<{
    id: string;
    slug: string;
    name: string;
    entranceTileX: number | null;
    entranceTileY: number | null;
  }>;
}

/**
 * Matriz absoluta ya "aplanada". Es el formato mas comodo para los motores que
 * prefieren un unico array rectangular en lugar de reensamblar chunks.
 */
export interface WorldMatrixExport {
  format: 'creador2d.matrix.v1';
  generatedAt: string;
  world: WorldExport['world'];
  /**
   * Definicion de cada bloque referenciado. Los plugins la necesitan para
   * resolver altura (props de 2 tiles), origen de Y-sort y color de respaldo
   * cuando el proyecto no tiene un sprite asignado a esa clave.
   */
  blocks: WorldExport['blocks'];
  parallax: WorldExport['parallax'];
  objects: WorldExport['objects'];
  weather: WorldExport['weather'];
  fluids: WorldExport['fluids'];
  interiors: WorldExport['interiors'];
  origin: { tileX: number; tileY: number };
  width: number;
  height: number;
  /** Claves de bloque por capa; cadena vacia = celda vacia. */
  layers: Record<LayerName, string[]>;
  /** Matriz logica de colisiones, un entero 0-255 por celda. */
  collision: number[];
}

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chunksService: ChunksService,
    private readonly worldsService: WorldsService,
  ) {}

  async exportWorld(user: AuthenticatedUser, worldId: string): Promise<WorldExport> {
    const { world, chunks } = await this.chunksService.getAllChunks(user, worldId);

    const usedKeys = new Set<string>();
    for (const chunk of chunks) {
      for (const key of chunk.palette) {
        usedKeys.add(key);
      }
    }

    // Los objetos libres tambien referencian bloques que deben viajar en el
    // catalogo, aunque no aparezcan en ninguna paleta de chunk.
    const objects = await this.prisma.placedObject.findMany({
      where: { worldId },
      orderBy: { createdAt: 'asc' },
    });

    for (const object of objects) {
      usedKeys.add(object.blockKey);
    }

    const [blocks, parallax, weather, fluids, interiors] = await Promise.all([
      this.prisma.blockDefinition.findMany({
        where: { key: { in: Array.from(usedKeys) } },
        orderBy: { key: 'asc' },
      }),
      this.prisma.parallaxLayer.findMany({
        where: { worldId },
        orderBy: [{ kind: 'asc' }, { order: 'asc' }],
      }),
      this.prisma.weatherSetting.findUnique({ where: { worldId } }),
      this.prisma.fluidSetting.findMany({ where: { worldId }, orderBy: { blockKey: 'asc' } }),
      this.prisma.world.findMany({
        where: { parentWorldId: worldId },
        select: { id: true, slug: true, name: true, entranceTileX: true, entranceTileY: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const bounds = this.computeBounds(chunks, world.chunkSize);

    return {
      format: 'creador2d.world.v1',
      generatedAt: new Date().toISOString(),
      world: {
        id: world.id,
        slug: world.slug,
        name: world.name,
        type: world.type,
        tileSize: world.tileSize,
        chunkSize: world.chunkSize,
        biome: world.biome,
        seed: world.seed,
        background: world.background,
        gravity: world.gravity,
        version: world.version,
      },
      blocks: blocks.map((block) => ({
        key: block.key,
        name: block.name,
        layer: block.layer,
        collisionFlags: block.collisionFlags,
        heightInTiles: block.heightInTiles,
        ySortOffset: block.ySortOffset,
        visual: block.visual,
      })),
      bounds,
      chunks,
      parallax: parallax.map((layer) => ({
        kind: layer.kind,
        order: layer.order,
        name: layer.name,
        imageUrl: layer.imageUrl,
        speedX: layer.speedX,
        speedY: layer.speedY,
        opacity: layer.opacity,
        tint: layer.tint,
        repeatX: layer.repeatX,
        repeatY: layer.repeatY,
        offsetY: layer.offsetY,
        visible: layer.visible,
      })),
      objects: objects.map((object) => ({
        blockKey: object.blockKey,
        x: object.x,
        y: object.y,
        rotation: object.rotation,
        scale: object.scale,
        flipX: object.flipX,
        layer: object.layer,
        zOffset: object.zOffset,
      })),
      // Un clima desactivado se exporta como null: el motor no crea el emisor.
      weather:
        weather && weather.enabled && weather.type !== 'NONE'
          ? {
              type: weather.type,
              intensity: weather.intensity,
              windDirection: weather.windDirection,
              windStrength: weather.windStrength,
              fogDensity: weather.fogDensity,
              tint: weather.tint,
              emissionRate: weather.emissionRate,
            }
          : null,
      fluids: fluids.map((fluid) => ({
        blockKey: fluid.blockKey,
        flow: fluid.flow,
        speed: fluid.speed,
        waveHeight: fluid.waveHeight,
        bubbles: fluid.bubbles,
        bubbleRate: fluid.bubbleRate,
      })),
      interiors,
    };
  }

  async exportMatrix(user: AuthenticatedUser, worldId: string): Promise<WorldMatrixExport> {
    const full = await this.exportWorld(user, worldId);
    const { bounds, world } = full;

    const width = Math.max(0, bounds.maxTileX - bounds.minTileX + 1);
    const height = Math.max(0, bounds.maxTileY - bounds.minTileY + 1);
    const cells = width * height;

    const layers = {} as Record<LayerName, string[]>;
    for (const layer of LAYER_ORDER) {
      layers[layer] = new Array<string>(cells).fill('');
    }
    const collision = new Array<number>(cells).fill(0);

    for (const chunk of full.chunks) {
      const baseTileX = chunk.cx * world.chunkSize;
      const baseTileY = chunk.cy * world.chunkSize;

      for (let ly = 0; ly < world.chunkSize; ly += 1) {
        for (let lx = 0; lx < world.chunkSize; lx += 1) {
          const source = localIndex(lx, ly, world.chunkSize);
          const absX = baseTileX + lx - bounds.minTileX;
          const absY = baseTileY + ly - bounds.minTileY;

          if (absX < 0 || absY < 0 || absX >= width || absY >= height) {
            continue;
          }

          const target = absY * width + absX;
          collision[target] = chunk.collision[source] ?? 0;

          for (const layer of LAYER_ORDER) {
            const paletteIndex = chunk.layers[layer][source];
            if (paletteIndex !== EMPTY_CELL) {
              layers[layer][target] = chunk.palette[paletteIndex] ?? '';
            }
          }
        }
      }
    }

    return {
      format: 'creador2d.matrix.v1',
      generatedAt: full.generatedAt,
      world,
      blocks: full.blocks,
      parallax: full.parallax,
      objects: full.objects,
      weather: full.weather,
      fluids: full.fluids,
      interiors: full.interiors,
      origin: { tileX: bounds.minTileX, tileY: bounds.minTileY },
      width,
      height,
      layers,
      collision,
    };
  }

  /**
   * Solo la matriz de colisiones. Es la carga util minima que un motor de
   * juego necesita para resolver fisicas, sin descargar nada visual.
   */
  async exportCollision(user: AuthenticatedUser, worldId: string) {
    const matrix = await this.exportMatrix(user, worldId);

    return {
      format: 'creador2d.collision.v1',
      generatedAt: matrix.generatedAt,
      worldId: matrix.world.id,
      tileSize: matrix.world.tileSize,
      origin: matrix.origin,
      width: matrix.width,
      height: matrix.height,
      collision: matrix.collision,
    };
  }

  /**
   * Scripts de runtime del mundo para un motor concreto.
   *
   * Devuelve solo lo que el mundo realmente usa: si no hay clima activo no se
   * emite el script de clima, y si no hay fluidos configurados tampoco el suyo.
   */
  async exportScripts(user: AuthenticatedUser, worldId: string, engine: Engine) {
    const world = await this.worldsService.assertAccess(worldId, user, 'read');

    const [weather, fluids] = await Promise.all([
      this.prisma.weatherSetting.findUnique({ where: { worldId } }),
      this.prisma.fluidSetting.findMany({ where: { worldId }, orderBy: { blockKey: 'asc' } }),
    ]);

    const scripts: GeneratedScript[] = [];

    if (weather) {
      const script = weatherScript(engine, world, weather);
      if (script) {
        scripts.push(script);
      }
    }

    const fluidsScript = fluidScript(engine, world, fluids);
    if (fluidsScript) {
      scripts.push(fluidsScript);
    }

    return {
      format: 'creador2d.scripts.v1',
      generatedAt: new Date().toISOString(),
      engine,
      world: { id: world.id, slug: world.slug, name: world.name },
      scripts,
      notes:
        scripts.length === 0
          ? 'Este mundo no tiene clima activo ni fluidos animados configurados.'
          : undefined,
    };
  }

  private computeBounds(
    chunks: Array<{ cx: number; cy: number }>,
    chunkSize: number,
  ): { minTileX: number; minTileY: number; maxTileX: number; maxTileY: number } {
    if (chunks.length === 0) {
      return { minTileX: 0, minTileY: 0, maxTileX: 0, maxTileY: 0 };
    }

    let minCx = Infinity;
    let minCy = Infinity;
    let maxCx = -Infinity;
    let maxCy = -Infinity;

    for (const chunk of chunks) {
      minCx = Math.min(minCx, chunk.cx);
      minCy = Math.min(minCy, chunk.cy);
      maxCx = Math.max(maxCx, chunk.cx);
      maxCy = Math.max(maxCy, chunk.cy);
    }

    return {
      minTileX: minCx * chunkSize,
      minTileY: minCy * chunkSize,
      maxTileX: (maxCx + 1) * chunkSize - 1,
      maxTileY: (maxCy + 1) * chunkSize - 1,
    };
  }
}
