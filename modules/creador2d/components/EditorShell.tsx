import React, { useEffect, useMemo } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Toolbar } from './Toolbar';
import { LayerPanel } from './LayerPanel';
import { BlockPalette } from './BlockPalette';
import { VirtualHand } from './VirtualHand';
import { StatusBar } from './StatusBar';
import { AiPanel } from './AiPanel';
import { ExportPanel } from './ExportPanel';
import { ProfilePanel } from './ProfilePanel';
import { useWorldEditor } from '../hooks/useWorldEditor';
import { ParallaxPanel } from './ParallaxPanel';
import { WeatherPanel } from './WeatherPanel';
import { InteriorsPanel } from './InteriorsPanel';
import { GeometryPanel } from './GeometryPanel';
import { getServices } from '../state/services';
import {
  useBlocks,
  useCraft,
  useObjects,
  useParallaxLayers,
  useProfile,
  useWeather,
  useWorld,
} from '../api/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useEditorStore } from '../state/editorStore';
import { WORLD_TYPE_LABEL, type PlacedObject } from '../types';

interface Props {
  worldId: string;
  onBack: () => void;
  /** Abre otro mundo sin salir del editor: se usa para entrar en un interior. */
  onOpenWorld: (worldId: string) => void;
}

export const EditorShell: React.FC<Props> = ({ worldId, onBack, onOpenWorld }) => {
  const worldQuery = useWorld(worldId);
  const world = worldQuery.data ?? null;

  const blocksQuery = useBlocks(world?.type, world?.biome, Boolean(world));
  const profileQuery = useProfile(true);
  const craft = useCraft();

  const setWorld = useEditorStore((state) => state.setWorld);
  const setBlocks = useEditorStore((state) => state.setBlocks);
  const selectBlock = useEditorStore((state) => state.selectBlock);
  const selectedBlockKey = useEditorStore((state) => state.selectedBlockKey);
  const activeLayer = useEditorStore((state) => state.activeLayer);
  const resetWorldState = useEditorStore((state) => state.resetWorldState);
  const pushToast = useEditorStore((state) => state.pushToast);

  useEffect(() => {
    setWorld(world);
    return () => resetWorldState();
  }, [world, setWorld, resetWorldState]);

  useEffect(() => {
    if (blocksQuery.data) {
      setBlocks(blocksQuery.data);
    }
  }, [blocksQuery.data, setBlocks]);

  // Al cambiar de capa se preselecciona un bloque valido para esa capa, de modo
  // que la herramienta de colocar siempre tenga algo que poner.
  useEffect(() => {
    const blocks = blocksQuery.data;
    if (!blocks || blocks.length === 0) {
      return;
    }

    const current = blocks.find((block) => block.key === selectedBlockKey);
    if (current && current.layer === activeLayer) {
      return;
    }

    const candidate = blocks.find((block) => block.layer === activeLayer);
    selectBlock(candidate?.key ?? null);
  }, [blocksQuery.data, activeLayer, selectedBlockKey, selectBlock]);

  const parallaxQuery = useParallaxLayers(worldId);
  const parallaxLayers = useMemo(() => parallaxQuery.data ?? [], [parallaxQuery.data]);

  const objectsQuery = useObjects(worldId);
  const placedObjects = useMemo(() => objectsQuery.data ?? [], [objectsQuery.data]);

  /**
   * Acciones sobre el mobiliario. Se refrescan tras cada cambio en lugar de
   * mantener una copia optimista: son operaciones puntuales, no un trazo
   * continuo, y la latencia local es inapreciable.
   */
  const objectActions = useMemo(
    () => ({
      place: async (payload: { blockKey: string; x: number; y: number }) => {
        const created = await getServices().client.placeObject(worldId, payload);
        await objectsQuery.refetch();
        return created;
      },
      move: async (payload: { objectId: string; x: number; y: number }) => {
        const moved = await getServices().client.moveObject(worldId, payload.objectId, {
          x: payload.x,
          y: payload.y,
        });
        await objectsQuery.refetch();
        return moved;
      },
      resize: async (payload: { objectId: string; scale: number }) => {
        const resized = await getServices().client.moveObject(worldId, payload.objectId, {
          scale: payload.scale,
        });
        await objectsQuery.refetch();
        return resized;
      },
      remove: async (objectId: string) => {
        const removed = await getServices().client.deleteObject(worldId, objectId);
        await objectsQuery.refetch();
        return removed;
      },
    }),
    [worldId, objectsQuery],
  );

  // El clima llega al editor para poder dibujarlo; el panel es quien lo edita.
  const weatherQuery = useWeather(worldId);

  const editor = useWorldEditor(
    world,
    parallaxLayers,
    placedObjects,
    objectActions,
    weatherQuery.data ?? null,
  );

  const inventory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of profileQuery.data?.inventory ?? []) {
      map[item.blockKey] = item.quantity;
    }
    return map;
  }, [profileQuery.data]);

  const runCraft = async (blockKey: string) => {
    try {
      const result = await craft.mutateAsync({ blockKey, times: 1 });
      pushToast('success', `Fabricado ${blockKey} (total ${result.quantity})`);
    } catch (error) {
      pushToast('error', (error as Error).message);
    }
  };

  const queryClient = useQueryClient();

  const handleClearWorld = async () => {
    await editor.clearWorld();
    queryClient.setQueryData<PlacedObject[]>(['objects', worldId], []);
  };

  if (worldQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-xs font-mono gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Abriendo mundo...
      </div>
    );
  }

  if (worldQuery.isError || !world) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-xs font-mono text-red-400">
          No se pudo abrir el mundo: {(worldQuery.error as Error | undefined)?.message}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:text-cyan-300 border border-slate-800 rounded px-3 py-1.5"
        >
          Volver a la lista
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2 bg-slate-950/80 border-b border-slate-800">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:text-cyan-300 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Mundos
        </button>

        <div className="h-4 w-px bg-slate-800" />

        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-100 truncate">{world.name}</p>
          <p className="text-[9px] font-mono text-cyan-500 uppercase tracking-wider">
            {WORLD_TYPE_LABEL[world.type]} · tile {world.tileSize}px · chunk {world.chunkSize}
          </p>
        </div>
      </div>

      <Toolbar
        onUndo={editor.undo}
        onRedo={editor.redo}
        onFrameWorld={editor.frameWorld}
        onFrameChunk={editor.frameCurrentChunk}
        onClearWorld={() => void handleClearWorld()}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Panel izquierdo: capas y paleta */}
        <aside className="w-64 shrink-0 flex flex-col bg-slate-900/50 border-r border-slate-800 overflow-hidden">
          <LayerPanel />
          <div className="flex-1 overflow-hidden">
            <BlockPalette onCraft={runCraft} inventory={inventory} />
          </div>
        </aside>

        {/* Lienzo */}
        <div className="flex-1 relative overflow-hidden bg-black">
          <canvas
            ref={editor.canvasRef}
            className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
            {...editor.handlers}
          />
          <VirtualHand />
        </div>

        {/* Panel derecho: IA, progresion y exportacion */}
        <aside className="w-72 shrink-0 flex flex-col bg-slate-900/50 border-l border-slate-800 overflow-y-auto scrollbar-thin">
          <GeometryPanel world={world} />
          <ParallaxPanel worldId={worldId} layers={parallaxLayers} />
          <WeatherPanel worldId={worldId} />
          <InteriorsPanel worldId={worldId} onOpen={onOpenWorld} />
          <AiPanel worldId={worldId} onApplied={() => void editor.refreshChunks()} />
          <ProfilePanel
            profile={profileQuery.data}
            isLoading={profileQuery.isLoading}
            onRefresh={() => void profileQuery.refetch()}
          />
          <ExportPanel worldId={worldId} worldSlug={world.slug} />
        </aside>
      </div>

      <StatusBar />
    </div>
  );
};
