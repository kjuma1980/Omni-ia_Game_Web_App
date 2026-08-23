import {
  COLLISION_COLOR,
  COLLISION_FLAGS,
  chunkKey,
  describeCollision,
  localIndex,
  tileToPixel,
  type CollisionFlagName,
  type LayerName,
} from './grid';
import type { ChunkStore } from './chunkStore';
import type { DrawItem } from './chunkWorker';
import { getBlockTile } from './procedural';
import { drawParallax, type ParallaxLayer } from './parallax';
import type { BlockDefinition, PlacedObject, Presence } from '../types';

export interface Camera {
  /** Centro de la camara, en pixeles del mundo. */
  x: number;
  y: number;
  zoom: number;
}

export interface RenderOptions {
  camera: Camera;
  tileSize: number;
  chunkSize: number;
  background: string;
  ySort: boolean;
  showGrid: boolean;
  showChunkBorders: boolean;
  showCollision: boolean;
  activeLayer: LayerName;
  layerVisibility: Record<LayerName, boolean>;
  hover: { tileX: number; tileY: number } | null;
  /** Rectangulo en curso de la herramienta de relleno. */
  selection: { tileX: number; tileY: number; width: number; height: number } | null;
  ghost: BlockDefinition | null;
  presences: Presence[];
  /** Atenua las capas que no son la activa para no estorbar al editar. */
  dimInactiveLayers: boolean;
  /**
   * Region actualmente residente, en tiles. Se dibuja su contorno para que
   * siempre se vea donde termina lo editable sin tener que alejar la camara.
   */
  residentBounds: { minTileX: number; minTileY: number; maxTileX: number; maxTileY: number } | null;
  /** Capas de fondo, de la mas lejana a la mas cercana. */
  parallaxLayers: ParallaxLayer[];
  /** Se invoca cuando una imagen de fondo termina de prepararse. */
  onParallaxReady: () => void;
  /** Mobiliario y adornos en posicion continua, fuera de la rejilla. */
  placedObjects: PlacedObject[];
  /** Objeto sobre el que esta el cursor o que se esta arrastrando. */
  hoveredObjectId: string | null;
  /** Fantasma del objeto que se va a soltar, en pixeles del mundo. */
  objectGhost: { blockKey: string; x: number; y: number } | null;
  /**
   * Guias del carril de runner. Solo se dibujan en mundos
   * COUNTRYSIDE_RUNNER, donde el recorrido es un pasillo vertical.
   */
  runnerTrack: { lanes: number; laneWidthTiles: number; centerTileX: number } | null;
  /**
   * Inclinacion de la rejilla en grados. Un countryside visto desde arriba no
   * es plano: la carretera se aleja en diagonal. Se aplica como rotacion del
   * plano del mundo alrededor del centro de la vista, de modo que rejilla,
   * bloques, objetos y guias giran juntos y el snapping sigue siendo exacto:
   * el puntero se desgira antes de convertirlo a baldosa.
   *
   * Es una inclinacion, no una perspectiva: no hay punto de fuga ni escorzo,
   * porque eso exigiria una proyeccion proyectiva que romperia la equivalencia
   * entre lo que se edita y lo que exporta el backend.
   */
  gridAngle: number;
}

const LAYER_DIM_ALPHA = 0.38;

/**
 * ---------------------------------------------------------------------------
 *  Renderizador Canvas 2D
 * ---------------------------------------------------------------------------
 *  Se eligio la API Canvas 2D en lugar de PixiJS por dos razones concretas de
 *  este proyecto: el modulo se acopla dentro de una aplicacion Tauri que ya
 *  ejecuta `<model-viewer>` (WebGL) en otras pestanas, y anadir un segundo
 *  contexto WebGL persistente compite por recursos de GPU; y ademas evita
 *  sumar una dependencia pesada a la aplicacion base.
 *
 *  El coste se compensa con tres optimizaciones: baldosas prerasterizadas
 *  (`procedural.ts`), culling por rectangulo visible, y listas de dibujo ya
 *  ordenadas por el Web Worker.
 * ---------------------------------------------------------------------------
 */
export class WorldRenderer {
  private wallCache: Array<DrawItem & { cx: number; cy: number }> | null = null;

  constructor(private readonly store: ChunkStore) {}

  /** Invalida la lista global de muros ordenada por Y. */
  invalidate(): void {
    this.wallCache = null;
  }

  render(ctx: CanvasRenderingContext2D, catalog: Map<string, BlockDefinition>, options: RenderOptions): void {
    const { width, height } = ctx.canvas;
    const { camera, tileSize, chunkSize } = options;
    const scaled = tileSize * camera.zoom;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, width, height);

    // Las capas de fondo van antes que nada: son lo mas lejano de la escena.
    if (options.parallaxLayers.length > 0) {
      drawParallax(ctx, options.parallaxLayers, camera, options.onParallaxReady);
    }

    // Rectangulo del mundo realmente visible: fuera de aqui no se dibuja nada.
    const halfW = width / (2 * camera.zoom);
    const halfH = height / (2 * camera.zoom);
    const view = {
      left: camera.x - halfW,
      top: camera.y - halfH,
      right: camera.x + halfW,
      bottom: camera.y + halfH,
    };

    const toScreenX = (worldX: number) => (worldX - camera.x) * camera.zoom + width / 2;
    const toScreenY = (worldY: number) => (worldY - camera.y) * camera.zoom + height / 2;

    // El plano del mundo se gira entero alrededor del centro de la vista. Todo
    // lo que se dibuja a partir de aqui hereda el giro; el fondo de parallax se
    // quedo fuera a proposito, porque el horizonte no se inclina con el suelo.
    const tilted = Math.abs(options.gridAngle) > 0.01;
    if (tilted) {
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate((options.gridAngle * Math.PI) / 180);
      ctx.translate(-width / 2, -height / 2);
    }

    const drawItem = (item: DrawItem, cx: number, cy: number, alpha: number) => {
      const block = catalog.get(item.key);
      if (!block) {
        return;
      }

      const worldX = tileToPixel(cx * chunkSize + item.lx, tileSize);
      const worldTopY = tileToPixel(cy * chunkSize + item.ly, tileSize);
      const drawHeight = tileSize * item.heightInTiles;
      // Los props altos crecen hacia arriba desde su celda base.
      const worldY = worldTopY - (item.heightInTiles - 1) * tileSize;

      if (
        worldX + tileSize < view.left ||
        worldX > view.right ||
        worldY + drawHeight < view.top ||
        worldY > view.bottom
      ) {
        return;
      }

      const tile = getBlockTile(block, tileSize, options.onParallaxReady);

      ctx.globalAlpha = alpha;
      ctx.drawImage(
        tile,
        toScreenX(worldX),
        toScreenY(worldY),
        scaled,
        scaled * item.heightInTiles,
      );
      ctx.globalAlpha = 1;
    };

    const alphaFor = (layer: LayerName) =>
      options.dimInactiveLayers && layer !== options.activeLayer ? LAYER_DIM_ALPHA : 1;

    const residentKeys = this.store.getResidentKeys();

    // --- 1. Suelo -----------------------------------------------------------
    if (options.layerVisibility.GROUND) {
      for (const key of residentKeys) {
        const plan = this.store.getPlan(key);
        if (!plan) continue;
        for (const item of plan.ground) {
          drawItem(item, plan.cx, plan.cy, alphaFor('GROUND'));
        }
      }
    }

    // --- 2. Fosos -----------------------------------------------------------
    if (options.layerVisibility.PIT) {
      for (const key of residentKeys) {
        const plan = this.store.getPlan(key);
        if (!plan) continue;
        for (const item of plan.pit) {
          drawItem(item, plan.cx, plan.cy, alphaFor('PIT'));
        }
      }
    }

    // --- 3. Muros dinamicos, ordenados por Y en 2.5D ------------------------
    if (options.layerVisibility.WALL) {
      const walls = this.collectWalls(residentKeys, options.ySort);
      for (const item of walls) {
        drawItem(item, item.cx, item.cy, alphaFor('WALL'));
      }
    }

    // --- 4. Capas superiores ------------------------------------------------
    if (options.layerVisibility.OVERLAY) {
      for (const key of residentKeys) {
        const plan = this.store.getPlan(key);
        if (!plan) continue;
        for (const item of plan.overlay) {
          drawItem(item, plan.cx, plan.cy, alphaFor('OVERLAY'));
        }
      }
    }

    // Los objetos libres se dibujan tras las capas de rejilla: su posicion es
    // continua, asi que no encajan en el recorrido por celdas.
    this.drawPlacedObjects(ctx, catalog, options, toScreenX, toScreenY, camera.zoom);

    if (options.showCollision) {
      this.drawCollision(ctx, options, view, toScreenX, toScreenY, scaled);
    }

    if (options.showGrid && scaled >= 6) {
      this.drawGrid(ctx, options, view, toScreenX, toScreenY, scaled);
    }

    if (options.showChunkBorders) {
      this.drawChunkBorders(ctx, options, residentKeys, toScreenX, toScreenY, scaled);
    }

    this.drawRunnerTrack(ctx, options, toScreenX);
    this.drawResidentBounds(ctx, options, toScreenX, toScreenY);

    this.drawSelection(ctx, options, toScreenX, toScreenY, scaled);
    this.drawHover(ctx, catalog, options, toScreenX, toScreenY, scaled);
    this.drawPresences(ctx, options, toScreenX, toScreenY, scaled);

    if (tilted) {
      ctx.restore();
    }
  }

  /** Une los muros de los 9 chunks y los ordena una sola vez por cambio. */
  private collectWalls(
    residentKeys: string[],
    ySort: boolean,
  ): Array<DrawItem & { cx: number; cy: number }> {
    if (this.wallCache) {
      return this.wallCache;
    }

    const merged: Array<DrawItem & { cx: number; cy: number }> = [];

    for (const key of residentKeys) {
      const plan = this.store.getPlan(key);
      if (!plan) {
        continue;
      }
      for (const item of plan.wall) {
        merged.push({ ...item, cx: plan.cx, cy: plan.cy });
      }
    }

    if (ySort) {
      merged.sort((a, b) => a.sortY - b.sortY);
    }

    this.wallCache = merged;
    return merged;
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    options: RenderOptions,
    view: { left: number; top: number; right: number; bottom: number },
    toScreenX: (v: number) => number,
    toScreenY: (v: number) => number,
    scaled: number,
  ): void {
    const { tileSize } = options;

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    const firstX = Math.floor(view.left / tileSize) * tileSize;
    for (let worldX = firstX; worldX <= view.right; worldX += tileSize) {
      const screenX = Math.round(toScreenX(worldX)) + 0.5;
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, ctx.canvas.height);
    }

    const firstY = Math.floor(view.top / tileSize) * tileSize;
    for (let worldY = firstY; worldY <= view.bottom; worldY += tileSize) {
      const screenY = Math.round(toScreenY(worldY)) + 0.5;
      ctx.moveTo(0, screenY);
      ctx.lineTo(ctx.canvas.width, screenY);
    }

    ctx.stroke();

    // Ejes del origen del mundo, para no perder la referencia (0,0).
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.beginPath();
    const originX = Math.round(toScreenX(0)) + 0.5;
    const originY = Math.round(toScreenY(0)) + 0.5;
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, ctx.canvas.height);
    ctx.moveTo(0, originY);
    ctx.lineTo(ctx.canvas.width, originY);
    ctx.stroke();

    void scaled;
  }

  private drawChunkBorders(
    ctx: CanvasRenderingContext2D,
    options: RenderOptions,
    residentKeys: string[],
    toScreenX: (v: number) => number,
    toScreenY: (v: number) => number,
    scaled: number,
  ): void {
    const side = options.chunkSize * scaled;

    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.font = '10px "Share Tech Mono", monospace';

    for (const key of residentKeys) {
      const plan = this.store.getPlan(key);
      const [cxRaw, cyRaw] = key.split(':');
      const cx = plan ? plan.cx : Number(cxRaw);
      const cy = plan ? plan.cy : Number(cyRaw);

      const x = toScreenX(cx * options.chunkSize * options.tileSize);
      const y = toScreenY(cy * options.chunkSize * options.tileSize);

      ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
      ctx.strokeRect(x, y, side, side);

      ctx.fillStyle = 'rgba(34, 211, 238, 0.8)';
      ctx.fillText(`${cx}:${cy}`, x + 4, y + 12);
    }

    ctx.restore();
  }

  private drawCollision(
    ctx: CanvasRenderingContext2D,
    options: RenderOptions,
    view: { left: number; top: number; right: number; bottom: number },
    toScreenX: (v: number) => number,
    toScreenY: (v: number) => number,
    scaled: number,
  ): void {
    const { tileSize, chunkSize } = options;

    for (const key of this.store.getResidentKeys()) {
      const chunk = this.store.getChunk(key);
      if (!chunk) {
        continue;
      }

      const baseTileX = chunk.cx * chunkSize;
      const baseTileY = chunk.cy * chunkSize;

      for (let ly = 0; ly < chunkSize; ly += 1) {
        for (let lx = 0; lx < chunkSize; lx += 1) {
          const mask = chunk.collision[localIndex(lx, ly, chunkSize)] ?? 0;
          if (mask === COLLISION_FLAGS.NONE) {
            continue;
          }

          const worldX = tileToPixel(baseTileX + lx, tileSize);
          const worldY = tileToPixel(baseTileY + ly, tileSize);

          if (
            worldX + tileSize < view.left ||
            worldX > view.right ||
            worldY + tileSize < view.top ||
            worldY > view.bottom
          ) {
            continue;
          }

          const flags = describeCollision(mask);
          const primary: CollisionFlagName = flags[0] ?? 'SOLID';

          ctx.fillStyle = COLLISION_COLOR[primary];
          ctx.fillRect(toScreenX(worldX), toScreenY(worldY), scaled, scaled);
        }
      }
    }
  }

  /**
   * Guias del carril en un mundo de tipo runner.
   *
   * En Subway Surfers o Temple Run el jugador no recorre un plano libre: baja
   * por un pasillo de dos o tres carriles y todo lo demas es decorado lateral.
   * Sin esta referencia es facil construir la carretera descentrada o con un
   * ancho que el jugador no puede recorrer.
   *
   * El pasillo se dibuja en vertical porque el contenido avanza del horizonte
   * hacia la camara, es decir, de arriba abajo en el lienzo de edicion.
   */
  private drawRunnerTrack(
    ctx: CanvasRenderingContext2D,
    options: RenderOptions,
    toScreenX: (v: number) => number,
  ): void {
    const track = options.runnerTrack;
    if (!track) {
      return;
    }

    const { tileSize } = options;
    const { height } = ctx.canvas;

    const totalTiles = track.lanes * track.laneWidthTiles;
    const firstTileX = track.centerTileX - Math.floor(totalTiles / 2);

    const left = toScreenX(tileToPixel(firstTileX, tileSize));
    const right = toScreenX(tileToPixel(firstTileX + totalTiles, tileSize));

    ctx.save();

    // Calzada.
    ctx.fillStyle = 'rgba(56, 189, 248, 0.07)';
    ctx.fillRect(left, 0, right - left, height);

    // Separadores entre carriles.
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 10]);

    for (let lane = 1; lane < track.lanes; lane += 1) {
      const x = Math.round(toScreenX(tileToPixel(firstTileX + lane * track.laneWidthTiles, tileSize))) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // Bordes de la calzada: fuera de aqui empieza el decorado lateral.
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.round(left) + 0.5, 0);
    ctx.lineTo(Math.round(left) + 0.5, height);
    ctx.moveTo(Math.round(right) - 0.5, 0);
    ctx.lineTo(Math.round(right) - 0.5, height);
    ctx.stroke();

    ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.fillText(`${track.lanes} carriles`, left + 6, 14);

    ctx.restore();
  }

  /**
   * Contorno de la region residente y velo sobre lo que queda fuera.
   *
   * Sin esta referencia el usuario no sabe hasta donde puede pintar sin que la
   * camara descargue lo que acaba de hacer: tenia que alejar el zoom al minimo
   * para intuir los limites, que es justo lo que hacia inviable trabajar.
   */
  private drawResidentBounds(
    ctx: CanvasRenderingContext2D,
    options: RenderOptions,
    toScreenX: (v: number) => number,
    toScreenY: (v: number) => number,
  ): void {
    const bounds = options.residentBounds;
    if (!bounds) {
      return;
    }

    const { tileSize } = options;
    const left = toScreenX(tileToPixel(bounds.minTileX, tileSize));
    const top = toScreenY(tileToPixel(bounds.minTileY, tileSize));
    const right = toScreenX(tileToPixel(bounds.maxTileX + 1, tileSize));
    const bottom = toScreenY(tileToPixel(bounds.maxTileY + 1, tileSize));

    // Con la rejilla inclinada este dibujo va dentro del giro, asi que "la
    // pantalla" ya no coincide con el rectangulo del lienzo: se extiende hasta
    // la diagonal para que al rotar no queden cunas sin velar en las esquinas.
    const reach = Math.hypot(ctx.canvas.width, ctx.canvas.height);
    const originX = (ctx.canvas.width - reach) / 2;
    const originY = (ctx.canvas.height - reach) / 2;
    const width = reach;
    const height = reach;

    ctx.save();

    // Velo sobre el exterior: se ve de un vistazo que ahi no se puede editar.
    ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
    const veilTop = top - originY;
    const veilBottom = bottom - originY;
    const veilLeft = left - originX;
    const veilRight = right - originX;

    ctx.translate(originX, originY);
    if (veilTop > 0) ctx.fillRect(0, 0, width, Math.min(veilTop, height));
    if (veilBottom < height) {
      ctx.fillRect(0, Math.max(0, veilBottom), width, height - Math.max(0, veilBottom));
    }
    const clampedTop = Math.max(0, veilTop);
    const clampedBottom = Math.min(height, veilBottom);
    if (clampedBottom > clampedTop) {
      if (veilLeft > 0) {
        ctx.fillRect(0, clampedTop, Math.min(veilLeft, width), clampedBottom - clampedTop);
      }
      if (veilRight < width) {
        ctx.fillRect(
          Math.max(0, veilRight),
          clampedTop,
          width - Math.max(0, veilRight),
          clampedBottom - clampedTop,
        );
      }
    }
    ctx.translate(-originX, -originY);

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.setLineDash([]);

    ctx.restore();
  }

  /**
   * Mobiliario y adornos de colocacion libre.
   *
   * A diferencia de los bloques, su posicion es continua: se dibujan
   * exactamente donde se soltaron, sin ajustar a la rejilla. El ancla es el
   * borde inferior, igual que en el Y-sort, para que un objeto apoyado en el
   * suelo se ordene con el resto de la escena.
   */
  private drawPlacedObjects(
    ctx: CanvasRenderingContext2D,
    catalog: Map<string, BlockDefinition>,
    options: RenderOptions,
    toScreenX: (v: number) => number,
    toScreenY: (v: number) => number,
    zoom: number,
  ): void {
    if (options.placedObjects.length === 0 && !options.objectGhost) {
      return;
    }

    const { tileSize } = options;
    const scaled = tileSize * zoom;

    // Se ordenan por Y para que los de delante tapen a los de detras.
    const sorted = [...options.placedObjects].sort((a, b) => a.y - b.y || a.x - b.x);

    for (const object of sorted) {
      const block = catalog.get(object.blockKey);
      if (!block) {
        continue;
      }

      const tile = getBlockTile(block, tileSize, options.onParallaxReady);
      const drawW = scaled * object.scale;
      const drawH = scaled * object.scale * block.heightInTiles;

      const x = toScreenX(object.x);
      const y = toScreenY(object.y);

      ctx.save();
      ctx.translate(x, y);

      if (object.rotation !== 0) {
        ctx.rotate((object.rotation * Math.PI) / 180);
      }
      if (object.flipX) {
        ctx.scale(-1, 1);
      }

      // El objeto se centra en X y se apoya en Y sobre el punto guardado.
      ctx.drawImage(tile, -drawW / 2, -drawH, drawW, drawH);
      ctx.restore();

      if (options.hoveredObjectId === object.id) {
        ctx.save();
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - drawW / 2, y - drawH, drawW, drawH);

        // Tirador de tamano y lectura de la escala: sin esto el usuario no
        // tiene forma de saber que la rueda sobre el objeto lo redimensiona.
        ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';
        ctx.fillRect(x + drawW / 2 - 5, y - drawH - 5, 10, 10);

        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';
        ctx.textAlign = 'center';
        ctx.fillText(`${object.scale.toFixed(2)}x  ·  rueda`, x, y + 14);
        ctx.restore();
      }
    }

    // Fantasma de lo que se va a soltar.
    if (options.objectGhost) {
      const block = catalog.get(options.objectGhost.blockKey);
      if (block) {
        const tile = getBlockTile(block, tileSize, options.onParallaxReady);
        // El fantasma se ve ya al tamano con el que va a caer: si una cama se
        // previsualiza del tamano de una vela, la colocacion es a ciegas.
        const drawW = scaled * block.defaultScale;
        const drawH = scaled * block.defaultScale * block.heightInTiles;
        const x = toScreenX(options.objectGhost.x);
        const y = toScreenY(options.objectGhost.y);

        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.drawImage(tile, x - drawW / 2, y - drawH, drawW, drawH);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - drawW / 2, y - drawH, drawW, drawH);
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }

  /** Objeto cuyo rectangulo contiene el punto dado, el mas cercano primero. */
  static hitTestObject(
    objects: PlacedObject[],
    catalog: Map<string, BlockDefinition>,
    worldX: number,
    worldY: number,
    tileSize: number,
  ): PlacedObject | null {
    // De delante hacia atras: gana el que esta encima.
    const sorted = [...objects].sort((a, b) => b.y - a.y || b.x - a.x);

    for (const object of sorted) {
      const block = catalog.get(object.blockKey);
      if (!block) {
        continue;
      }

      const w = tileSize * object.scale;
      const h = tileSize * object.scale * block.heightInTiles;

      if (
        worldX >= object.x - w / 2 &&
        worldX <= object.x + w / 2 &&
        worldY >= object.y - h &&
        worldY <= object.y
      ) {
        return object;
      }
    }

    return null;
  }

  private drawSelection(
    ctx: CanvasRenderingContext2D,
    options: RenderOptions,
    toScreenX: (v: number) => number,
    toScreenY: (v: number) => number,
    scaled: number,
  ): void {
    if (!options.selection) {
      return;
    }

    const { tileX, tileY, width, height } = options.selection;

    ctx.save();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.lineWidth = 2;

    const x = toScreenX(tileToPixel(tileX, options.tileSize));
    const y = toScreenY(tileToPixel(tileY, options.tileSize));

    ctx.fillRect(x, y, width * scaled, height * scaled);
    ctx.strokeRect(x, y, width * scaled, height * scaled);

    ctx.fillStyle = 'rgba(226, 232, 240, 0.95)';
    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.fillText(`${width} x ${height}`, x + 4, y - 6);
    ctx.restore();
  }

  /**
   * Mano virtual: el bloque seleccionado se previsualiza YA ajustado a la
   * cuadricula. La celda destino nunca depende del pixel exacto del cursor,
   * de modo que el usuario ve exactamente donde va a caer el bloque.
   */
  private drawHover(
    ctx: CanvasRenderingContext2D,
    catalog: Map<string, BlockDefinition>,
    options: RenderOptions,
    toScreenX: (v: number) => number,
    toScreenY: (v: number) => number,
    scaled: number,
  ): void {
    if (!options.hover) {
      return;
    }

    const x = toScreenX(tileToPixel(options.hover.tileX, options.tileSize));
    const y = toScreenY(tileToPixel(options.hover.tileY, options.tileSize));

    ctx.save();

    if (options.ghost) {
      const block = catalog.get(options.ghost.key) ?? options.ghost;
      const tile = getBlockTile(block, options.tileSize, options.onParallaxReady);
      const drawH = scaled * block.heightInTiles;

      ctx.globalAlpha = 0.55;
      ctx.drawImage(tile, x, y - (block.heightInTiles - 1) * scaled, scaled, drawH);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = 'rgba(250, 250, 250, 0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, scaled - 2, scaled - 2);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 1;
    const notch = Math.min(8, scaled / 3);
    ctx.beginPath();
    ctx.moveTo(x, y + notch);
    ctx.lineTo(x, y);
    ctx.lineTo(x + notch, y);
    ctx.moveTo(x + scaled - notch, y);
    ctx.lineTo(x + scaled, y);
    ctx.lineTo(x + scaled, y + notch);
    ctx.moveTo(x + scaled, y + scaled - notch);
    ctx.lineTo(x + scaled, y + scaled);
    ctx.lineTo(x + scaled - notch, y + scaled);
    ctx.moveTo(x + notch, y + scaled);
    ctx.lineTo(x, y + scaled);
    ctx.lineTo(x, y + scaled - notch);
    ctx.stroke();

    ctx.restore();
  }

  private drawPresences(
    ctx: CanvasRenderingContext2D,
    options: RenderOptions,
    toScreenX: (v: number) => number,
    toScreenY: (v: number) => number,
    scaled: number,
  ): void {
    if (options.presences.length === 0) {
      return;
    }

    ctx.save();
    ctx.font = '11px "Share Tech Mono", monospace';

    for (const presence of options.presences) {
      const x = toScreenX(tileToPixel(presence.tileX, options.tileSize));
      const y = toScreenY(tileToPixel(presence.tileY, options.tileSize));

      ctx.strokeStyle = 'rgba(244, 114, 182, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, scaled - 4, scaled - 4);

      ctx.fillStyle = 'rgba(244, 114, 182, 0.95)';
      ctx.fillText(presence.username, x + 2, y - 4);
    }

    ctx.restore();
  }
}

export { chunkKey };
