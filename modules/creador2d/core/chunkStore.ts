import {
  EMPTY_CELL,
  LAYER_ORDER,
  chunkKey,
  createEmptyChunk,
  internBlockKey,
  localIndex,
  neighbourChunks,
  parseChunkKey,
  tileToChunk,
  tileToLocal,
  type ChunkPayload,
  type LayerName,
} from './grid';
import type { BlockMeta, ChunkDrawPlan, PrepareRequest, PrepareResponse } from './chunkWorker';
import type { BlockDefinition, EditOperation } from '../types';

export interface ChunkStoreConfig {
  chunkSize: number;
  tileSize: number;
  /** Solo las perspectivas 3/4 y laterales necesitan ordenacion por Y. */
  ySort: boolean;
}

/** Radio maximo de residencia (7x7 chunks). Techo de seguridad de memoria. */
export const MAX_RESIDENCY_RADIUS = 3;

/**
 * ---------------------------------------------------------------------------
 *  Residencia de chunks
 * ---------------------------------------------------------------------------
 *  El lienzo es infinito, la memoria no. Esta clase garantiza la regla del
 *  editor: en cualquier instante hay EXACTAMENTE los 9 chunks que rodean a la
 *  camara (la matriz 3x3 centrada en el chunk actual). Todo lo que sale de esa
 *  ventana se descarta; todo lo que entra se pide al backend y se prepara en un
 *  Web Worker antes de llegar al renderizador.
 * ---------------------------------------------------------------------------
 */
export class ChunkStore {
  private config: ChunkStoreConfig = { chunkSize: 16, tileSize: 32, ySort: true };
  private blockMeta: Record<string, BlockMeta> = {};

  private readonly chunks = new Map<string, ChunkPayload>();
  private readonly plans = new Map<string, ChunkDrawPlan>();
  private readonly pending = new Map<number, string>();

  private worker: Worker | null = null;
  private requestCounter = 0;
  private cameraChunk: { cx: number; cy: number } | null = null;
  private planListener: (() => void) | null = null;

  /**
   * Radio de la ventana residente, en chunks. 1 = la matriz 3x3 del enunciado.
   * Se amplia automaticamente cuando el viewport es mayor que esa ventana: con
   * radio fijo 1 y la camara alejada, el usuario ve el borde de lo cargado y
   * el mundo parece "reiniciarse" al desplazarse.
   */
  private radius = 1;

  constructor() {
    this.spawnWorker();
  }

  private spawnWorker(): void {
    if (typeof Worker === 'undefined') {
      return;
    }

    try {
      this.worker = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
      this.worker.addEventListener('message', (event: MessageEvent<PrepareResponse>) => {
        const response = event.data;
        if (!response || response.type !== 'PREPARED') {
          return;
        }

        const key = this.pending.get(response.requestId);
        this.pending.delete(response.requestId);

        // Si el chunk dejo de ser residente mientras el worker trabajaba, el
        // plan ya no sirve: se descarta en lugar de resucitar el chunk.
        if (!key || !this.chunks.has(key)) {
          return;
        }

        this.plans.set(key, response.plan);
        this.planListener?.();
      });
    } catch {
      // Sin worker el editor sigue funcionando: el plan se calcula en linea.
      this.worker = null;
    }
  }

  configure(config: ChunkStoreConfig, blocks: BlockDefinition[]): void {
    this.config = config;
    this.blockMeta = Object.fromEntries(
      blocks.map((block) => [
        block.key,
        {
          layer: block.layer,
          heightInTiles: block.heightInTiles,
          ySortOffset: block.ySortOffset,
        } satisfies BlockMeta,
      ]),
    );

    // Los planes existentes se calcularon con otra configuracion.
    this.plans.clear();
    for (const [key, chunk] of this.chunks) {
      this.prepare(key, chunk);
    }
  }

  onPlanReady(listener: () => void): void {
    this.planListener = listener;
  }

  /**
   * Actualiza el chunk de la camara y devuelve que hace falta cargar y que se
   * ha descargado. El llamador pide al backend unicamente los que faltan.
   */
  setCamera(
    cx: number,
    cy: number,
    radius = this.radius,
  ): { missing: Array<{ cx: number; cy: number }>; evicted: string[] } {
    const nextRadius = Math.min(MAX_RESIDENCY_RADIUS, Math.max(1, Math.round(radius)));
    const sameChunk = this.cameraChunk?.cx === cx && this.cameraChunk?.cy === cy;

    if (sameChunk && nextRadius === this.radius) {
      return { missing: [], evicted: [] };
    }

    this.cameraChunk = { cx, cy };
    this.radius = nextRadius;

    const required = new Set(
      this.windowCoords(cx, cy, nextRadius).map((coord) => chunkKey(coord.cx, coord.cy)),
    );
    const evicted: string[] = [];

    for (const key of Array.from(this.chunks.keys())) {
      if (!required.has(key)) {
        this.chunks.delete(key);
        this.plans.delete(key);
        evicted.push(key);
      }
    }

    const missing = Array.from(required)
      .filter((key) => !this.chunks.has(key))
      .map((key) => parseChunkKey(key));

    return { missing, evicted };
  }

  /**
   * Ventana residente actual. Con radio 1 devuelve exactamente los 9 chunks
   * vecinos; con radio mayor, la matriz cuadrada equivalente.
   */
  private windowCoords(cx: number, cy: number, radius: number): Array<{ cx: number; cy: number }> {
    if (radius === 1) {
      return neighbourChunks(cx, cy);
    }

    const coords: Array<{ cx: number; cy: number }> = [];
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        coords.push({ cx: cx + dx, cy: cy + dy });
      }
    }
    return coords;
  }

  getRadius(): number {
    return this.radius;
  }

  /** Limites en tiles de la region actualmente editable. */
  getResidentBounds(): { minTileX: number; minTileY: number; maxTileX: number; maxTileY: number } | null {
    if (!this.cameraChunk) {
      return null;
    }

    const { chunkSize } = this.config;
    const { cx, cy } = this.cameraChunk;

    return {
      minTileX: (cx - this.radius) * chunkSize,
      minTileY: (cy - this.radius) * chunkSize,
      maxTileX: (cx + this.radius + 1) * chunkSize - 1,
      maxTileY: (cy + this.radius + 1) * chunkSize - 1,
    };
  }

  /** Incorpora chunks recibidos del backend o por WebSocket. */
  ingest(chunks: ChunkPayload[]): void {
    if (!this.cameraChunk) {
      return;
    }

    const required = new Set(
      this.windowCoords(this.cameraChunk.cx, this.cameraChunk.cy, this.radius).map((coord) =>
        chunkKey(coord.cx, coord.cy),
      ),
    );

    for (const chunk of chunks) {
      const key = chunkKey(chunk.cx, chunk.cy);

      // Nunca se guarda un chunk fuera de la ventana 3x3.
      if (!required.has(key)) {
        continue;
      }

      const current = this.chunks.get(key);

      // Los eventos de socket pueden llegar desordenados: solo avanza revision.
      if (current && chunk.revision < current.revision) {
        continue;
      }

      this.chunks.set(key, chunk);
      this.prepare(key, chunk);
    }
  }

  getResidentKeys(): string[] {
    return Array.from(this.chunks.keys());
  }

  /**
   * Sincroniza la revision local con la que confirma el servidor tras aplicar
   * una edicion optimista. Sin esto, el chunk local conservaria una revision
   * antigua y el siguiente evento de socket lo sobreescribiria innecesariamente.
   */
  bumpRevisions(revisionByChunk: Record<string, number>): void {
    for (const [key, revision] of Object.entries(revisionByChunk)) {
      const chunk = this.chunks.get(key);
      if (chunk && revision > chunk.revision) {
        chunk.revision = revision;
        const plan = this.plans.get(key);
        if (plan) {
          plan.revision = revision;
        }
      }
    }
  }

  getPlan(key: string): ChunkDrawPlan | undefined {
    return this.plans.get(key);
  }

  getChunk(key: string): ChunkPayload | undefined {
    return this.chunks.get(key);
  }

  /** Mascara de colision de un tile absoluto, o 0 si el chunk no es residente. */
  collisionAt(tileX: number, tileY: number): number {
    const { chunkSize } = this.config;
    const chunk = this.chunks.get(
      chunkKey(tileToChunk(tileX, chunkSize), tileToChunk(tileY, chunkSize)),
    );

    if (!chunk) {
      return 0;
    }

    const index = localIndex(
      tileToLocal(tileX, chunkSize),
      tileToLocal(tileY, chunkSize),
      chunkSize,
    );

    return chunk.collision[index] ?? 0;
  }

  /** Clave del bloque presente en una celda, o null. */
  blockAt(tileX: number, tileY: number, layer: LayerName): string | null {
    const { chunkSize } = this.config;
    const chunk = this.chunks.get(
      chunkKey(tileToChunk(tileX, chunkSize), tileToChunk(tileY, chunkSize)),
    );

    if (!chunk) {
      return null;
    }

    const index = localIndex(
      tileToLocal(tileX, chunkSize),
      tileToLocal(tileY, chunkSize),
      chunkSize,
    );

    const paletteIndex = chunk.layers[layer]?.[index];
    if (paletteIndex === undefined || paletteIndex === EMPTY_CELL) {
      return null;
    }

    return chunk.palette[paletteIndex] ?? null;
  }

  /**
   * Aplica operaciones localmente para que el trazo se vea al instante.
   * El backend sigue siendo la autoridad: cuando responde, su version del
   * chunk (con revision mayor) sustituye a esta.
   */
  applyOptimistic(operations: EditOperation[], catalog: Map<string, BlockDefinition>): void {
    const { chunkSize } = this.config;
    const touched = new Set<string>();

    for (const operation of this.expand(operations)) {
      const key = chunkKey(
        tileToChunk(operation.tileX, chunkSize),
        tileToChunk(operation.tileY, chunkSize),
      );

      const chunk = this.chunks.get(key);
      if (!chunk) {
        continue;
      }

      const index = localIndex(
        tileToLocal(operation.tileX, chunkSize),
        tileToLocal(operation.tileY, chunkSize),
        chunkSize,
      );

      if (operation.kind === 'clear') {
        if (chunk.layers[operation.layer][index] === EMPTY_CELL) {
          continue;
        }
        chunk.layers[operation.layer][index] = EMPTY_CELL;
      } else {
        const block = catalog.get(operation.blockKey);
        if (!block || block.layer !== operation.layer) {
          continue;
        }
        chunk.layers[operation.layer][index] = internBlockKey(chunk.palette, operation.blockKey);
      }

      // La colision se deriva del contenido visual, igual que en el backend.
      chunk.collision[index] = this.deriveCollision(chunk, index, catalog);
      touched.add(key);
    }

    for (const key of touched) {
      const chunk = this.chunks.get(key);
      if (chunk) {
        this.prepare(key, chunk);
      }
    }
  }

  reset(): void {
    this.chunks.clear();
    this.plans.clear();
    this.pending.clear();
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.chunks.clear();
    this.plans.clear();
    this.pending.clear();
    this.planListener = null;
  }

  private deriveCollision(
    chunk: ChunkPayload,
    index: number,
    catalog: Map<string, BlockDefinition>,
  ): number {
    let mask = 0;

    for (const layer of LAYER_ORDER) {
      const paletteIndex = chunk.layers[layer][index];
      if (paletteIndex === EMPTY_CELL) {
        continue;
      }
      const block = catalog.get(chunk.palette[paletteIndex]);
      if (block) {
        mask |= block.collisionFlags;
      }
    }

    return mask & 0xff;
  }

  private expand(
    operations: EditOperation[],
  ): Array<
    | { kind: 'set'; layer: LayerName; tileX: number; tileY: number; blockKey: string }
    | { kind: 'clear'; layer: LayerName; tileX: number; tileY: number }
  > {
    const result: Array<
      | { kind: 'set'; layer: LayerName; tileX: number; tileY: number; blockKey: string }
      | { kind: 'clear'; layer: LayerName; tileX: number; tileY: number }
    > = [];

    for (const operation of operations) {
      switch (operation.op) {
        case 'PLACE':
          result.push({
            kind: 'set',
            layer: operation.layer,
            tileX: operation.tileX,
            tileY: operation.tileY,
            blockKey: operation.blockKey,
          });
          break;

        case 'BREAK':
          result.push({
            kind: 'clear',
            layer: operation.layer,
            tileX: operation.tileX,
            tileY: operation.tileY,
          });
          break;

        case 'FILL':
        case 'CLEAR': {
          const isFill = operation.op === 'FILL';
          for (let dy = 0; dy < operation.height; dy += 1) {
            for (let dx = 0; dx < operation.width; dx += 1) {
              if (isFill) {
                result.push({
                  kind: 'set',
                  layer: operation.layer,
                  tileX: operation.tileX + dx,
                  tileY: operation.tileY + dy,
                  blockKey: operation.blockKey,
                });
              } else {
                result.push({
                  kind: 'clear',
                  layer: operation.layer,
                  tileX: operation.tileX + dx,
                  tileY: operation.tileY + dy,
                });
              }
            }
          }
          break;
        }
      }
    }

    return result;
  }

  private prepare(key: string, chunk: ChunkPayload): void {
    const request: PrepareRequest = {
      type: 'PREPARE',
      requestId: (this.requestCounter += 1),
      chunk,
      chunkSize: this.config.chunkSize,
      tileSize: this.config.tileSize,
      blockMeta: this.blockMeta,
      ySort: this.config.ySort,
    };

    if (!this.worker) {
      this.plans.set(key, buildPlanInline(request));
      this.planListener?.();
      return;
    }

    this.pending.set(request.requestId, key);
    this.worker.postMessage(request);
  }
}

/** Camino de respaldo cuando el navegador no permite Web Workers. */
function buildPlanInline(request: PrepareRequest): ChunkDrawPlan {
  const { chunk, chunkSize, tileSize, blockMeta, ySort } = request;
  const baseTileY = chunk.cy * chunkSize;

  const plan: ChunkDrawPlan = {
    cx: chunk.cx,
    cy: chunk.cy,
    revision: chunk.revision,
    ground: [],
    pit: [],
    wall: [],
    overlay: [],
  };

  for (const layer of LAYER_ORDER) {
    const cells = chunk.layers[layer];
    if (!cells) {
      continue;
    }

    const bucket =
      layer === 'GROUND'
        ? plan.ground
        : layer === 'PIT'
          ? plan.pit
          : layer === 'WALL'
            ? plan.wall
            : plan.overlay;

    for (let index = 0; index < cells.length; index += 1) {
      const paletteIndex = cells[index];
      if (paletteIndex === EMPTY_CELL) {
        continue;
      }

      const key = chunk.palette[paletteIndex];
      if (!key) {
        continue;
      }

      const meta = blockMeta[key] ?? { layer: 'GROUND', heightInTiles: 1, ySortOffset: 0 };
      const lx = index % chunkSize;
      const ly = Math.floor(index / chunkSize);

      bucket.push({
        key,
        lx,
        ly,
        sortY: (baseTileY + ly + meta.heightInTiles) * tileSize + meta.ySortOffset,
        heightInTiles: meta.heightInTiles,
      });
    }
  }

  if (ySort) {
    plan.wall.sort((a, b) => a.sortY - b.sortY || a.lx - b.lx);
  }

  return plan;
}

export { createEmptyChunk };
