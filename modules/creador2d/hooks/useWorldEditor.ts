import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  chunkKey,
  pixelToTile,
  tileToChunk,
  type LayerName,
} from '../core/grid';
import { EditHistory } from '../core/history';
import { MAX_RESIDENCY_RADIUS } from '../core/chunkStore';
import { clearTileCache } from '../core/procedural';
import type { ParallaxLayer } from '../core/parallax';
import { WorldRenderer } from '../core/renderer';
import { WeatherOverlay } from '../core/weather';
import type { PlacedObject, WeatherSetting } from '../types';
import { RealtimeClient } from '../api/socket';
import { queryKeys } from '../api/hooks';
import { getServices } from '../state/services';
import { useEditorStore } from '../state/editorStore';
import type { BlockDefinition, EditOperation, WorldDetail } from '../types';

/** Limite de celdas por lote, alineado con el maximo que acepta el backend. */
const MAX_CELLS_PER_BATCH = 4096;

interface StrokeState {
  active: boolean;
  pointerId: number | null;
  mode: 'paint' | 'erase' | 'rect' | 'pan' | 'object' | null;
  forward: EditOperation[];
  backward: EditOperation[];
  visited: Set<string>;
  anchor: { tileX: number; tileY: number } | null;
  panOrigin: { screenX: number; screenY: number; camX: number; camY: number } | null;
  /** Objeto libre que se esta arrastrando y su desfase respecto al cursor. */
  dragObject: { id: string; offsetX: number; offsetY: number } | null;
}

function emptyStroke(): StrokeState {
  return {
    active: false,
    pointerId: null,
    mode: null,
    forward: [],
    backward: [],
    visited: new Set(),
    anchor: null,
    panOrigin: null,
    dragObject: null,
  };
}

/**
 * ---------------------------------------------------------------------------
 *  Orquestador del editor
 * ---------------------------------------------------------------------------
 *  Conecta lienzo, camara, herramientas, residencia de chunks, historial y
 *  canal en tiempo real. Todo lo que se repite por frame o por pixel de arrastre
 *  vive en refs; al store reactivo solo llega lo que la interfaz necesita
 *  redibujar.
 * ---------------------------------------------------------------------------
 */
export function useWorldEditor(
  world: WorldDetail | null,
  parallaxLayers: ParallaxLayer[] = [],
  placedObjects: PlacedObject[] = [],
  objectActions?: {
    place: (payload: { blockKey: string; x: number; y: number }) => Promise<unknown>;
    move: (payload: { objectId: string; x: number; y: number }) => Promise<unknown>;
    resize: (payload: { objectId: string; scale: number }) => Promise<unknown>;
    remove: (objectId: string) => Promise<unknown>;
  },
  weather: WeatherSetting | null = null,
) {
  const services = getServices();
  const queryClient = useQueryClient();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokeRef = useRef<StrokeState>(emptyStroke());
  const realtimeRef = useRef<RealtimeClient | null>(null);
  const dirtyRef = useRef(true);
  const loadedChunksRef = useRef(new Set<string>());
  const frameRef = useRef<number | null>(null);
  /**
   * `syncChunks` cambia en cada movimiento de camara. Guardarlo en una ref
   * permite invocarlo desde el efecto del socket sin meterlo en sus
   * dependencias, que reconectaria el WebSocket al desplazar la vista.
   */
  const syncChunksRef = useRef<(() => Promise<void>) | null>(null);
  /**
   * El clima se dibuja encima de la escena y se anima solo. Vive en una ref
   * porque conserva el estado de sus particulas entre fotogramas y no debe
   * reiniciarse cada vez que React vuelve a renderizar el componente.
   */
  const weatherRef = useRef(new WeatherOverlay());
  const weatherSettingRef = useRef<WeatherSetting | null>(weather);
  weatherSettingRef.current = weather;

  /** Objeto libre resaltado (bajo el cursor o en arrastre). */
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);
  const [draggingObjectId, setDraggingObjectId] = useState<string | null>(null);
  /** Posicion provisional del objeto arrastrado, para verlo moverse. */
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);

  const {
    blocks,
    camera,
    tool,
    activeLayer,
    selectedBlockKey,
    layerVisibility,
    showGrid,
    showChunkBorders,
    showCollision,
    dimInactiveLayers,
    strictResidency,
    residentBounds,
    hover,
    selection,
    presences,
    setCamera,
    setResidentBounds,
    setHover,
    setSelection,
    setHistoryDepth,
    setConnection,
    upsertPresence,
    removePresence,
    incrementPending,
    pushToast,
    selectBlock,
  } = useEditorStore();

  const catalog = useMemo(
    () => new Map<string, BlockDefinition>(blocks.map((block) => [block.key, block])),
    [blocks],
  );

  /**
   * Escalas provisionales mientras se gira la rueda. La rueda genera decenas de
   * eventos por segundo y esperar la respuesta del servidor en cada uno haria
   * que el objeto creciera a tirones; aqui se pinta ya y el backend confirma
   * despues.
   */
  const [scalePreview, setScalePreview] = useState<Record<string, number>>({});

  const setLocalObjectScale = useCallback((objectId: string, scale: number) => {
    setScalePreview((current) => ({ ...current, [objectId]: scale }));
  }, []);

  /**
   * Objetos tal y como se dibujan: el que se esta arrastrando lleva su posicion
   * provisional para que siga al cursor sin esperar al servidor, y el que se
   * esta redimensionando su escala provisional.
   */
  const renderedObjects = useMemo(() => {
    const hasScalePreview = Object.keys(scalePreview).length > 0;
    if (!hasScalePreview && (!draggingObjectId || !dragPreview)) {
      return placedObjects;
    }

    return placedObjects.map((object) => {
      const scale = scalePreview[object.id];
      const dragging = object.id === draggingObjectId && dragPreview;

      if (!dragging && scale === undefined) {
        return object;
      }

      return {
        ...object,
        ...(dragging ? { x: dragPreview.x, y: dragPreview.y } : {}),
        ...(scale === undefined ? {} : { scale }),
      };
    });
  }, [placedObjects, draggingObjectId, dragPreview, scalePreview]);

  // Cuando el servidor devuelve la escala definitiva, la provisional sobra.
  useEffect(() => {
    setScalePreview((current) => {
      const pending = Object.entries(current).filter(([id, scale]) => {
        const stored = placedObjects.find((object) => object.id === id);
        return stored !== undefined && Math.abs(stored.scale - scale) > 0.001;
      });

      return pending.length === Object.keys(current).length
        ? current
        : Object.fromEntries(pending);
    });
  }, [placedObjects]);

  const ySort = world
    ? world.type === 'TOP_DOWN_THREE_QUARTER' ||
      world.type === 'SIDE_PLATFORMER' ||
      world.type === 'COUNTRYSIDE_RUNNER'
    : false;

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  // ----------------------------- configuracion -----------------------------

  useEffect(() => {
    if (!world || blocks.length === 0) {
      return;
    }

    services.chunkStore.configure(
      { chunkSize: world.chunkSize, tileSize: world.tileSize, ySort },
      blocks,
    );
    services.renderer.invalidate();
    clearTileCache();
    markDirty();
  }, [world, blocks, ySort, services, markDirty]);

  useEffect(() => {
    services.chunkStore.onPlanReady(() => {
      services.renderer.invalidate();
      markDirty();
    });
  }, [services, markDirty]);

  /**
   * Encuadra la camara sobre una region de tiles. Se usa al abrir un mundo y
   * desde el boton "Encuadrar": sin esto la camara arrancaba en un punto fijo
   * que podia no tener nada, dando la sensacion de mundo vacio.
   */
  const frameTiles = useCallback(
    (minTileX: number, minTileY: number, maxTileX: number, maxTileY: number) => {
      if (!world) {
        return;
      }

      const canvas = canvasRef.current;
      const widthTiles = Math.max(1, maxTileX - minTileX + 1);
      const heightTiles = Math.max(1, maxTileY - minTileY + 1);

      const centerX = ((minTileX + maxTileX + 1) / 2) * world.tileSize;
      const centerY = ((minTileY + maxTileY + 1) / 2) * world.tileSize;

      let zoom = 1;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        // 0.9 deja un margen para que el borde de la region no quede pegado.
        zoom = Math.min(
          rect.width / (widthTiles * world.tileSize),
          rect.height / (heightTiles * world.tileSize),
        ) * 0.9;
      }

      setCamera({ x: centerX, y: centerY, zoom });
      markDirty();
    },
    [world, setCamera, markDirty],
  );

  /** Encuadra el chunk que hay bajo la camara: la unidad natural de trabajo. */
  const frameCurrentChunk = useCallback(() => {
    if (!world) {
      return;
    }

    const cx = tileToChunk(pixelToTile(camera.x, world.tileSize), world.chunkSize);
    const cy = tileToChunk(pixelToTile(camera.y, world.tileSize), world.chunkSize);

    frameTiles(
      cx * world.chunkSize,
      cy * world.chunkSize,
      (cx + 1) * world.chunkSize - 1,
      (cy + 1) * world.chunkSize - 1,
    );
  }, [world, camera.x, camera.y, frameTiles]);

  /** Encuadra todo el contenido ya existente del mundo. */
  const frameWorld = useCallback(() => {
    if (!world) {
      return;
    }

    const { bounds, chunkCount } = world.stats;

    if (chunkCount === 0) {
      frameCurrentChunk();
      return;
    }

    frameTiles(
      bounds.minCx * world.chunkSize,
      bounds.minCy * world.chunkSize,
      (bounds.maxCx + 1) * world.chunkSize - 1,
      (bounds.maxCy + 1) * world.chunkSize - 1,
    );
  }, [world, frameTiles, frameCurrentChunk]);

  // Al abrir un mundo, la camara se coloca sobre su contenido real.
  const framedWorldRef = useRef<string | null>(null);
  useEffect(() => {
    if (!world || framedWorldRef.current === world.id) {
      return;
    }
    framedWorldRef.current = world.id;
    frameWorld();
  }, [world, frameWorld]);

  // ------------------------- residencia de 9 chunks ------------------------

  /**
   * Radio de residencia necesario para que la ventana cargada cubra por
   * completo lo que se ve. Con el radio fijo de 1 y la camara alejada, el
   * usuario alcanzaba el borde de lo cargado y el mundo parecia reiniciarse.
   */
  const computeRadius = useCallback((): number => {
    if (!world || strictResidency) {
      return 1;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return 1;
    }

    const rect = canvas.getBoundingClientRect();
    const chunkPx = world.chunkSize * world.tileSize;
    const halfW = rect.width / (2 * camera.zoom);
    const halfH = rect.height / (2 * camera.zoom);

    // +0.5 de margen para que al desplazarse el borde nunca entre en pantalla.
    const needed = Math.ceil(Math.max(halfW, halfH) / chunkPx + 0.5);
    return Math.min(MAX_RESIDENCY_RADIUS, Math.max(1, needed));
  }, [world, camera.zoom, strictResidency]);

  const syncChunks = useCallback(async () => {
    if (!world) {
      return;
    }

    const cx = tileToChunk(pixelToTile(camera.x, world.tileSize), world.chunkSize);
    const cy = tileToChunk(pixelToTile(camera.y, world.tileSize), world.chunkSize);
    const radius = computeRadius();

    const { missing, evicted } = services.chunkStore.setCamera(cx, cy, radius);

    for (const key of evicted) {
      loadedChunksRef.current.delete(key);
    }

    setResidentBounds(services.chunkStore.getResidentBounds());

    // Desalojar tambien cambia la escena: si no se invalida aqui, la lista
    // global de muros conserva los de los chunks que ya no estan residentes.
    if (evicted.length > 0) {
      services.renderer.invalidate();
      markDirty();
    }

    if (missing.length === 0) {
      return;
    }

    // Una unica peticion trae la ventana completa.
    try {
      const { chunks } = await services.client.getViewport(world.id, cx, cy, radius);
      services.chunkStore.ingest(chunks);
      for (const chunk of chunks) {
        loadedChunksRef.current.add(chunkKey(chunk.cx, chunk.cy));
      }
      services.renderer.invalidate();
      markDirty();
    } catch (error) {
      pushToast('error', `No se pudieron cargar los chunks: ${(error as Error).message}`);
    }
  }, [
    world,
    camera.x,
    camera.y,
    computeRadius,
    services,
    markDirty,
    pushToast,
    setResidentBounds,
  ]);

  useEffect(() => {
    syncChunksRef.current = syncChunks;
    void syncChunks();
  }, [syncChunks]);

  // ------------------------------ tiempo real ------------------------------

  useEffect(() => {
    if (!world) {
      return;
    }

    const token = services.client.getAccessToken();
    if (!token) {
      return;
    }

    const realtime = new RealtimeClient({
      onChunks: (chunks) => {
        services.chunkStore.ingest(chunks);
        services.renderer.invalidate();
        markDirty();
      },
      onWorldCleared: () => {
        // Lo vacio otro editor: se recarga la ventana en lugar de conservar
        // en pantalla chunks que ya no existen en la base de datos.
        services.history.clear();
        void syncChunksRef.current?.();
        pushToast('info', 'Otro editor vacio este mundo');
      },
      onPresence: (presence) => upsertPresence(presence),
      onPresenceLeft: (socketId) => removePresence(socketId),
      onStatus: (status, detail) => setConnection(status, detail),
    });

    realtime.connect(token, world.id);
    realtimeRef.current = realtime;

    return () => {
      realtime.disconnect();
      realtimeRef.current = null;
      setConnection('offline');
    };
  }, [world, services, markDirty, upsertPresence, removePresence, setConnection]);

  // ------------------------------ bucle de dibujo --------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !world) {
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      return;
    }

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width * ratio));
      const height = Math.max(1, Math.floor(rect.height * ratio));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        markDirty();
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const loop = (now: number) => {
      // El clima es lo unico que se mueve por si solo. Mientras este encendido
      // hay que repintar cada fotograma; en cuanto se apaga se vuelve al
      // repintado por cambio.
      const activeWeather = weatherSettingRef.current;
      const animating = Boolean(
        activeWeather && activeWeather.enabled && activeWeather.type !== 'NONE',
      );

      // Solo se repinta cuando algo cambio: con la escena quieta el editor no
      // consume CPU, algo que importa en un portatil ejecutando ademas ComfyUI.
      if (dirtyRef.current || animating) {
        dirtyRef.current = false;
        const ratio = window.devicePixelRatio || 1;

        services.renderer.render(ctx, catalog, {
          camera: { x: camera.x, y: camera.y, zoom: camera.zoom * ratio },
          tileSize: world.tileSize,
          chunkSize: world.chunkSize,
          background: world.background,
          ySort,
          showGrid,
          showChunkBorders,
          showCollision,
          activeLayer,
          layerVisibility,
          hover,
          selection,
          ghost: tool === 'PLACE' && selectedBlockKey ? (catalog.get(selectedBlockKey) ?? null) : null,
          presences: Object.values(presences),
          dimInactiveLayers,
          residentBounds,
          parallaxLayers,
          onParallaxReady: markDirty,
          // Durante el arrastre se pinta la posicion provisional; el servidor
          // solo se entera al soltar.
          // El pasillo de carriles solo tiene sentido en un runner, y su
          // anchura es la que el mundo declara: un recorrido de 3 carriles de
          // 2 baldosas no se edita igual que uno de 5 de 3.
          runnerTrack:
            world.type === 'COUNTRYSIDE_RUNNER'
              ? {
                  lanes: world.laneCount,
                  laneWidthTiles: world.laneWidth,
                  centerTileX: 0,
                }
              : null,
          gridAngle: world.gridAngle,
          placedObjects: renderedObjects,
          hoveredObjectId: draggingObjectId ?? hoveredObjectId,
          objectGhost:
            tool === 'OBJECT' && selectedBlockKey && hover && !draggingObjectId
              ? {
                  blockKey: selectedBlockKey,
                  x: hover.tileX * world.tileSize + world.tileSize / 2,
                  y: hover.tileY * world.tileSize + world.tileSize,
                }
              : null,
        });

        // El clima va por encima de todo, incluida la rejilla y las guias: es
        // atmosfera, no contenido del mundo.
        weatherRef.current.draw(ctx, activeWeather, now);
      }

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => {
      observer.disconnect();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [
    world,
    catalog,
    camera,
    ySort,
    showGrid,
    showChunkBorders,
    showCollision,
    activeLayer,
    layerVisibility,
    hover,
    selection,
    tool,
    selectedBlockKey,
    presences,
    dimInactiveLayers,
    residentBounds,
    parallaxLayers,
    renderedObjects,
    hoveredObjectId,
    draggingObjectId,
    services,
    markDirty,
  ]);

  useEffect(() => {
    markDirty();
  }, [
    camera,
    hover,
    selection,
    showGrid,
    showChunkBorders,
    showCollision,
    layerVisibility,
    activeLayer,
    dimInactiveLayers,
    residentBounds,
    presences,
    markDirty,
  ]);

  // --------------------------- conversion de pixeles -----------------------

  /**
   * Pantalla -> tile. Este es el punto donde actua el iman: la coordenada del
   * cursor se fuerza a la rejilla con division entera hacia abajo, de modo que
   * el bloque siempre encaja exactamente con sus vecinos y no quedan fisuras.
   */
  const pointerToTile = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const canvas = canvasRef.current;
      if (!canvas || !world) {
        return null;
      }

      const rect = canvas.getBoundingClientRect();
      let offsetX = event.clientX - rect.left - rect.width / 2;
      let offsetY = event.clientY - rect.top - rect.height / 2;

      // Si la rejilla esta inclinada hay que DESGIRAR el puntero antes de
      // convertirlo a baldosa. Sin esto el cursor y el bloque colocado se
      // separarian mas cuanto mayor fuera el angulo, y el iman apuntaria a una
      // celda que no es la que esta debajo del raton.
      if (Math.abs(world.gridAngle) > 0.01) {
        const radians = (-world.gridAngle * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const rotatedX = offsetX * cos - offsetY * sin;
        const rotatedY = offsetX * sin + offsetY * cos;
        offsetX = rotatedX;
        offsetY = rotatedY;
      }

      const worldX = offsetX / camera.zoom + camera.x;
      const worldY = offsetY / camera.zoom + camera.y;

      return {
        tileX: pixelToTile(worldX, world.tileSize),
        tileY: pixelToTile(worldY, world.tileSize),
        worldX,
        worldY,
      };
    },
    [world, camera],
  );

  // ------------------------------ envio de lotes ---------------------------

  const dispatch = useCallback(
    async (operations: EditOperation[]) => {
      if (!world || operations.length === 0) {
        return;
      }

      incrementPending(1);

      try {
        const viaSocket = realtimeRef.current?.applyEdit(operations, (response) => {
          if (response.ok && response.revisionByChunk) {
            services.chunkStore.bumpRevisions(response.revisionByChunk);
          } else if (!response.ok) {
            pushToast('error', response.error ?? 'El servidor rechazo la edicion');
            void syncChunks();
          }
        });

        if (!viaSocket) {
          // Sin socket, la ruta REST devuelve los chunks ya reconciliados.
          const result = await services.client.applyOperations(world.id, operations);
          services.chunkStore.ingest(result.chunks);
          services.renderer.invalidate();
          markDirty();
        }

        void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      } catch (error) {
        pushToast('error', `Edicion rechazada: ${(error as Error).message}`);
        void syncChunks();
      } finally {
        incrementPending(-1);
      }
    },
    [world, services, incrementPending, pushToast, syncChunks, markDirty, queryClient],
  );

  /** Aplica en local, registra en el historial y envia al backend. */
  const commit = useCallback(
    (label: string, forward: EditOperation[], backward: EditOperation[]) => {
      if (forward.length === 0) {
        return;
      }

      services.chunkStore.applyOptimistic(forward, catalog);
      services.renderer.invalidate();
      markDirty();

      services.history.push({ label, forward, backward });
      setHistoryDepth(services.history.depth);

      void dispatch(forward);
    },
    [services, catalog, markDirty, setHistoryDepth, dispatch],
  );

  // ------------------------------- herramientas ----------------------------

  const paintCell = useCallback(
    (tileX: number, tileY: number, erase: boolean) => {
      if (!world) {
        return;
      }

      const stroke = strokeRef.current;
      const layer: LayerName = activeLayer;
      const cellKey = `${layer}:${tileX}:${tileY}`;

      if (stroke.visited.has(cellKey) || stroke.forward.length >= MAX_CELLS_PER_BATCH) {
        return;
      }
      stroke.visited.add(cellKey);

      // El inverso se captura ANTES de mutar: es la unica forma de que deshacer
      // devuelva el bloque que realmente habia en la celda.
      const previous = services.chunkStore.blockAt(tileX, tileY, layer);

      if (erase) {
        if (!previous) {
          return;
        }
        stroke.forward.push({ op: 'BREAK', layer, tileX, tileY });
        stroke.backward.push({ op: 'PLACE', layer, tileX, tileY, blockKey: previous });
      } else {
        if (!selectedBlockKey) {
          return;
        }
        const block = catalog.get(selectedBlockKey);
        if (!block || block.layer !== layer) {
          return;
        }
        if (previous === selectedBlockKey) {
          return;
        }

        stroke.forward.push({ op: 'PLACE', layer, tileX, tileY, blockKey: selectedBlockKey });
        stroke.backward.push(
          previous
            ? { op: 'PLACE', layer, tileX, tileY, blockKey: previous }
            : { op: 'BREAK', layer, tileX, tileY },
        );
      }

      // Retroalimentacion inmediata: se pinta ya, sin esperar al servidor.
      const last = stroke.forward[stroke.forward.length - 1];
      services.chunkStore.applyOptimistic([last], catalog);
      services.renderer.invalidate();
      markDirty();
    },
    [world, activeLayer, selectedBlockKey, catalog, services, markDirty],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!world) {
        return;
      }

      const position = pointerToTile(event);
      if (!position) {
        return;
      }

      const stroke = emptyStroke();
      stroke.active = true;
      stroke.pointerId = event.pointerId;
      strokeRef.current = stroke;

      event.currentTarget.setPointerCapture(event.pointerId);

      // --- Mobiliario de colocacion libre ---------------------------------
      if (tool === 'OBJECT' && objectActions) {
        const hit = WorldRenderer.hitTestObject(
          placedObjects,
          catalog,
          position.worldX,
          position.worldY,
          world.tileSize,
        );

        if (event.button === 2) {
          // Boton derecho: retirar el objeto que haya bajo el cursor.
          if (hit) {
            void objectActions.remove(hit.id).catch((error) => {
              pushToast('error', (error as Error).message);
            });
          }
          stroke.active = false;
          return;
        }

        if (hit) {
          // Se arrastra el existente conservando el punto de agarre.
          stroke.mode = 'object';
          stroke.dragObject = {
            id: hit.id,
            offsetX: hit.x - position.worldX,
            offsetY: hit.y - position.worldY,
          };
          setDraggingObjectId(hit.id);
          return;
        }

        if (!selectedBlockKey) {
          pushToast('error', 'Seleccione un mueble o adorno en la paleta');
          stroke.active = false;
          return;
        }

        const block = catalog.get(selectedBlockKey);
        if (!block || block.placement !== 'FREE') {
          pushToast(
            'error',
            'Ese bloque se coloca en la rejilla. Elija uno de Mobiliario, Vehiculos o Senales.',
          );
          stroke.active = false;
          return;
        }

        const snap = useEditorStore.getState().showSnapToGrid;
        let placeX = position.worldX;
        let placeY = position.worldY;
        if (snap) {
          placeX = (position.tileX + 0.5) * 32;
          placeY = (position.tileY + 1) * 32;
        }

        void objectActions
          .place({ blockKey: selectedBlockKey, x: placeX, y: placeY })
          .catch((error) => pushToast('error', (error as Error).message));

        stroke.active = false;
        return;
      }

      const wantsPan = tool === 'PAN' || event.button === 1 || event.shiftKey;

      if (wantsPan) {
        stroke.mode = 'pan';
        stroke.panOrigin = {
          screenX: event.clientX,
          screenY: event.clientY,
          camX: camera.x,
          camY: camera.y,
        };
        return;
      }

      if (tool === 'PICK') {
        const key = services.chunkStore.blockAt(position.tileX, position.tileY, activeLayer);
        if (key) {
          selectBlock(key);
          pushToast('info', `Bloque seleccionado: ${catalog.get(key)?.name ?? key}`);
        }
        stroke.active = false;
        return;
      }

      if (tool === 'RECT') {
        stroke.mode = 'rect';
        stroke.anchor = { tileX: position.tileX, tileY: position.tileY };
        setSelection({ tileX: position.tileX, tileY: position.tileY, width: 1, height: 1 });
        return;
      }

      const erase = tool === 'BREAK' || event.button === 2;
      stroke.mode = erase ? 'erase' : 'paint';
      paintCell(position.tileX, position.tileY, erase);

      if (erase && objectActions && world) {
        const hit = WorldRenderer.hitTestObject(
          placedObjects,
          catalog,
          position.worldX,
          position.worldY,
          world.tileSize,
        );
        if (hit) {
          void objectActions.remove(hit.id).catch((error) => {
            pushToast('error', (error as Error).message);
          });
        }
      }
    },
    [
      world,
      pointerToTile,
      tool,
      camera,
      activeLayer,
      services,
      selectBlock,
      pushToast,
      catalog,
      setSelection,
      paintCell,
      objectActions,
      placedObjects,
    ],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const position = pointerToTile(event);
      if (!position) {
        return;
      }

      const stroke = strokeRef.current;

      if (!hover || hover.tileX !== position.tileX || hover.tileY !== position.tileY) {
        setHover({ tileX: position.tileX, tileY: position.tileY });
        realtimeRef.current?.sendCursor(position.tileX, position.tileY);
      }

      // Resalta el mueble bajo el cursor para que se vea que es agarrable.
      if (tool === 'OBJECT' && !stroke.active && world) {
        const hit = WorldRenderer.hitTestObject(
          placedObjects,
          catalog,
          position.worldX,
          position.worldY,
          world.tileSize,
        );
        if (hit?.id !== hoveredObjectId) {
          setHoveredObjectId(hit?.id ?? null);
        }
      }

      if (!stroke.active) {
        return;
      }

      if (stroke.mode === 'object' && stroke.dragObject) {
        const snap = useEditorStore.getState().showSnapToGrid;
        let dragX = position.worldX + stroke.dragObject.offsetX;
        let dragY = position.worldY + stroke.dragObject.offsetY;
        if (snap) {
          dragX = (position.tileX + 0.5) * 32;
          dragY = (position.tileY + 1) * 32;
        }
        setDragPreview({ x: dragX, y: dragY });
        markDirty();
        return;
      }

      if (stroke.mode === 'pan' && stroke.panOrigin) {
        const dx = (event.clientX - stroke.panOrigin.screenX) / camera.zoom;
        const dy = (event.clientY - stroke.panOrigin.screenY) / camera.zoom;
        setCamera({ x: stroke.panOrigin.camX - dx, y: stroke.panOrigin.camY - dy });
        return;
      }

      if (stroke.mode === 'rect' && stroke.anchor) {
        setSelection({
          tileX: Math.min(stroke.anchor.tileX, position.tileX),
          tileY: Math.min(stroke.anchor.tileY, position.tileY),
          width: Math.abs(position.tileX - stroke.anchor.tileX) + 1,
          height: Math.abs(position.tileY - stroke.anchor.tileY) + 1,
        });
        return;
      }

      if (stroke.mode === 'paint' || stroke.mode === 'erase') {
        const isErase = stroke.mode === 'erase';
        paintCell(position.tileX, position.tileY, isErase);

        if (isErase && objectActions && world) {
          const hit = WorldRenderer.hitTestObject(
            placedObjects,
            catalog,
            position.worldX,
            position.worldY,
            world.tileSize,
          );
          if (hit) {
            void objectActions.remove(hit.id).catch((error) => {
              pushToast('error', (error as Error).message);
            });
          }
        }
      }
    },
    [
      pointerToTile,
      hover,
      setHover,
      camera.zoom,
      setCamera,
      setSelection,
      paintCell,
      tool,
      world,
      placedObjects,
      catalog,
      hoveredObjectId,
      markDirty,
      objectActions,
      pushToast,
    ],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const stroke = strokeRef.current;
      if (!stroke.active) {
        return;
      }

      if (stroke.pointerId !== null && event.currentTarget.hasPointerCapture(stroke.pointerId)) {
        event.currentTarget.releasePointerCapture(stroke.pointerId);
      }

      // Se confirma el arrastre del mueble en su posicion final.
      if (stroke.mode === 'object' && stroke.dragObject && objectActions) {
        const target = dragPreview;
        setDraggingObjectId(null);
        setDragPreview(null);

        if (target) {
          void objectActions
            .move({ objectId: stroke.dragObject.id, x: target.x, y: target.y })
            .catch((error) => pushToast('error', (error as Error).message));
        }

        strokeRef.current = emptyStroke();
        return;
      }

      if (stroke.mode === 'rect' && stroke.anchor && selection) {
        const cells = selection.width * selection.height;

        if (cells > MAX_CELLS_PER_BATCH) {
          pushToast('error', `El rectangulo tiene ${cells} celdas y el maximo es ${MAX_CELLS_PER_BATCH}`);
        } else {
          const erase = !selectedBlockKey;
          const operation: EditOperation = erase
            ? {
                op: 'CLEAR',
                layer: activeLayer,
                tileX: selection.tileX,
                tileY: selection.tileY,
                width: selection.width,
                height: selection.height,
              }
            : {
                op: 'FILL',
                layer: activeLayer,
                tileX: selection.tileX,
                tileY: selection.tileY,
                width: selection.width,
                height: selection.height,
                blockKey: selectedBlockKey,
              };

          const backward = EditHistory.buildInverse(services.chunkStore, [operation]);
          commit(erase ? 'Vaciar rectangulo' : 'Rellenar rectangulo', [operation], backward);
        }

        setSelection(null);
      } else if (stroke.forward.length > 0) {
        // El trazo ya se pinto celda a celda; aqui solo se registra y se envia.
        services.history.push({
          label: stroke.mode === 'erase' ? 'Romper bloques' : 'Colocar bloques',
          forward: stroke.forward,
          backward: [...stroke.backward].reverse(),
        });
        setHistoryDepth(services.history.depth);
        void dispatch(stroke.forward);
      }

      strokeRef.current = emptyStroke();
    },
    [
      selection,
      selectedBlockKey,
      activeLayer,
      services,
      commit,
      setSelection,
      setHistoryDepth,
      dispatch,
      pushToast,
      objectActions,
      dragPreview,
    ],
  );

  const handlePointerLeave = useCallback(() => {
    setHover(null);
  }, [setHover]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const onWheelNative = (event: WheelEvent) => {
      event.preventDefault();

      const currentTool = useEditorStore.getState().tool;
      const targetId = hoveredObjectId;

      if (currentTool === 'OBJECT' && targetId && objectActions?.resize) {
        const object = placedObjects.find((item) => item.id === targetId);
        if (object) {
          const factor = event.deltaY > 0 ? 1 / 1.12 : 1.12;
          const scale = Math.min(8, Math.max(0.1, object.scale * factor));
          setLocalObjectScale(targetId, scale);
          void objectActions.resize({ objectId: targetId, scale }).catch(() => undefined);
          markDirty();
          return;
        }
      }

      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      const currentCam = useEditorStore.getState().camera;
      setCamera({ zoom: currentCam.zoom * factor });
    };

    canvas.addEventListener('wheel', onWheelNative, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheelNative);
    };
  }, [hoveredObjectId, objectActions, placedObjects, setLocalObjectScale, markDirty, setCamera]);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    // El boton derecho borra; no debe abrir el menu del navegador.
    event.preventDefault();
  }, []);

  // ------------------------------ deshacer / rehacer -----------------------

  const undo = useCallback(() => {
    const entry = services.history.undo();
    if (!entry) {
      return;
    }

    services.chunkStore.applyOptimistic(entry.backward, catalog);
    services.renderer.invalidate();
    markDirty();
    setHistoryDepth(services.history.depth);
    void dispatch(entry.backward);
  }, [services, catalog, markDirty, setHistoryDepth, dispatch]);

  const redo = useCallback(() => {
    const entry = services.history.redo();
    if (!entry) {
      return;
    }

    services.chunkStore.applyOptimistic(entry.forward, catalog);
    services.renderer.invalidate();
    markDirty();
    setHistoryDepth(services.history.depth);
    void dispatch(entry.forward);
  }, [services, catalog, markDirty, setHistoryDepth, dispatch]);

  // ------------------------------- atajos ----------------------------------

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }

      const store = useEditorStore.getState();
      const step = (world?.tileSize ?? 32) * 2;

      switch (event.key) {
        case 'b':
        case 'B':
          store.setTool('PLACE');
          break;
        case 'e':
        case 'E':
          store.setTool('BREAK');
          break;
        case 'r':
        case 'R':
          store.setTool('RECT');
          break;
        case 'i':
        case 'I':
          store.setTool('PICK');
          break;
        case 'o':
        case 'O':
          store.setTool('OBJECT');
          break;
        case 'h':
        case 'H':
          store.setTool('PAN');
          break;
        case 'g':
        case 'G':
          store.toggleFlag('showGrid');
          break;
        case 'c':
        case 'C':
          store.toggleFlag('showCollision');
          break;
        case 'ArrowUp':
          store.panCamera(0, -step);
          break;
        case 'ArrowDown':
          store.panCamera(0, step);
          break;
        case 'ArrowLeft':
          store.panCamera(-step, 0);
          break;
        case 'ArrowRight':
          store.panCamera(step, 0);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, world]);

  // ------------------------------ limpieza ---------------------------------

  useEffect(() => {
    return () => {
      services.history.clear();
      loadedChunksRef.current.clear();
    };
  }, [services, world?.id]);

  /**
   * Vacia el mundo entero. Es destructivo y no entra en el historial: el
   * borrado ocurre en el servidor de una vez y deshacerlo exigiria haber
   * guardado una copia completa del mundo en el cliente.
   */
  const clearWorld = useCallback(async () => {
    if (!world) {
      return;
    }

    try {
      const result = await services.client.clearWorld(world.id);
      services.chunkStore.reset();
      loadedChunksRef.current.clear();
      services.history.clear();
      setHistoryDepth(services.history.depth);
      await syncChunks();
      services.renderer.invalidate();
      markDirty();
      pushToast('success', `Mundo vaciado: ${result.chunksDeleted} chunk(s) eliminados`);
    } catch (error) {
      pushToast('error', `No se pudo vaciar el mundo: ${(error as Error).message}`);
    }
  }, [world, services, syncChunks, setHistoryDepth, markDirty, pushToast]);

  return {
    canvasRef,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
      onPointerLeave: handlePointerLeave,
      onContextMenu: handleContextMenu,
    },
    undo,
    redo,
    refreshChunks: syncChunks,
    commit,
    clearWorld,
    frameWorld,
    frameCurrentChunk,
    residentBounds,
  };
}
