import React, { useState } from 'react';
import { Globe2, Loader2, Plus, Trash2 } from 'lucide-react';
import { useCreateWorld, useDeleteWorld, useWorlds } from '../api/hooks';
import { createWorldFormSchema, type CreateWorldForm } from '../schemas';
import { useEditorStore } from '../state/editorStore';
import { BIOMES, WORLD_TYPE_HINT, WORLD_TYPE_LABEL, type WorldType } from '../types';
import { Help } from './Help';

interface Props {
  onOpen: (worldId: string) => void;
}

const WORLD_TYPES: WorldType[] = [
  'TOP_DOWN_THREE_QUARTER',
  'TOP_DOWN_CENITAL',
  'COUNTRYSIDE_RUNNER',
  'SIDE_PLATFORMER',
];

const DEFAULT_FORM: CreateWorldForm = {
  name: '',
  description: '',
  type: 'TOP_DOWN_THREE_QUARTER',
  tileSize: 32,
  chunkSize: 16,
  biome: 'grassland',
  background: '#0b1120',
};

export const WorldBrowser: React.FC<Props> = ({ onOpen }) => {
  const worlds = useWorlds(true);
  const createWorld = useCreateWorld();
  const deleteWorld = useDeleteWorld();
  const pushToast = useEditorStore((state) => state.pushToast);

  const [form, setForm] = useState<CreateWorldForm>(DEFAULT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = <K extends keyof CreateWorldForm>(key: K, value: CreateWorldForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const parsed = createWorldFormSchema.safeParse(form);
    if (!parsed.success) {
      const collected: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        collected[String(issue.path[0])] = issue.message;
      }
      setErrors(collected);
      return;
    }

    setErrors({});

    try {
      const created = await createWorld.mutateAsync(parsed.data);
      pushToast('success', `Mundo "${created.name}" creado`);
      setForm(DEFAULT_FORM);
      onOpen(created.id);
    } catch (error) {
      pushToast('error', (error as Error).message);
    }
  };

  const [confirmWorldId, setConfirmWorldId] = useState<string | null>(null);

  const remove = async (worldId: string, name: string) => {
    if (confirmWorldId !== worldId) {
      setConfirmWorldId(worldId);
      setTimeout(() => setConfirmWorldId(null), 3000);
      return;
    }
    setConfirmWorldId(null);

    try {
      await deleteWorld.mutateAsync(worldId);
      pushToast('success', `Mundo "${name}" eliminado`);
    } catch (error) {
      pushToast('error', (error as Error).message);
    }
  };

  return (
    <div className="flex h-full gap-6 p-6 overflow-hidden">
      {/* Lista de mundos */}
      <div className="flex-1 flex flex-col gap-3 overflow-hidden">
        <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
          <Globe2 className="w-4 h-4" /> Mundos disponibles
        </h3>

        {worlds.isLoading && (
          <p className="text-xs text-slate-500 font-mono flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Cargando mundos...
          </p>
        )}

        {worlds.isError && (
          <p className="text-xs text-red-400 font-mono">
            No se pudo consultar la lista: {(worlds.error as Error).message}
          </p>
        )}

        {worlds.data?.length === 0 && (
          <p className="text-xs text-slate-500 font-mono">
            Todavia no hay mundos. Cree el primero con el formulario de la derecha.
          </p>
        )}

        <div className="flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-thin">
          {worlds.data?.map((world) => (
            <div
              key={world.id}
              className="group bg-slate-900/50 border border-slate-800 hover:border-cyan-600/60 rounded-lg p-3 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onOpen(world.id)}
                  className="flex-1 text-left"
                >
                  <p className="text-sm font-bold text-slate-100">{world.name}</p>
                  <p className="text-[10px] text-cyan-400 font-mono uppercase tracking-wider mt-0.5">
                    {WORLD_TYPE_LABEL[world.type]}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">
                    tile {world.tileSize}px · chunk {world.chunkSize}x{world.chunkSize} · bioma{' '}
                    {world.biome} · {world._count?.chunks ?? 0} chunks
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => remove(world.id, world.name)}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition"
                  title="Eliminar mundo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Creacion */}
      <form
        onSubmit={submit}
        className="w-96 shrink-0 bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4 overflow-y-auto scrollbar-thin"
      >
        <Help id="c2dNewWorldHeader">
          <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2 cursor-help">
            <Plus className="w-4 h-4" /> Nuevo mundo
          </h3>
        </Help>

        <div>
          <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">
            Nombre
          </label>
          <Help id="c2dWorldName">
            <input
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="Valle del Este"
              className="w-full bg-black/50 border border-slate-700 text-slate-100 p-2 rounded outline-none text-sm font-mono focus:border-cyan-500"
            />
          </Help>
          {errors.name && <p className="text-[10px] text-red-400 mt-1 font-mono">{errors.name}</p>}
        </div>

        <div>
          <Help id="c2dWorldType">
            <label className="block text-slate-400 text-xs mb-2 font-mono uppercase tracking-wider cursor-help">
              Tipo de mundo
            </label>
          </Help>
          <div className="space-y-1.5">
            {WORLD_TYPES.map((type) => {
              const helpId =
                type === 'TOP_DOWN_CENITAL'
                  ? 'c2dTypeCenital'
                  : type === 'TOP_DOWN_THREE_QUARTER'
                  ? 'c2dTypeRPG'
                  : type === 'COUNTRYSIDE_RUNNER'
                  ? 'c2dTypeRunner'
                  : 'c2dTypePlatformer';

              return (
                <Help key={type} id={helpId}>
                  <button
                    type="button"
                    onClick={() => update('type', type)}
                    className={`w-full text-left px-3 py-2 rounded border transition-all ${
                      form.type === type
                        ? 'bg-cyan-900/40 border-cyan-500/60'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <p
                      className={`text-xs font-bold ${
                        form.type === type ? 'text-cyan-300' : 'text-slate-300'
                      }`}
                    >
                      {WORLD_TYPE_LABEL[type]}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono leading-snug mt-0.5">
                      {WORLD_TYPE_HINT[type]}
                    </p>
                  </button>
                </Help>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">
              Tile (px)
            </label>
            <Help id="c2dTileSize">
              <select
                value={form.tileSize}
                onChange={(event) => update('tileSize', Number(event.target.value))}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded outline-none text-sm"
              >
                {[16, 24, 32, 48, 64].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </Help>
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">
              Chunk
            </label>
            <Help id="c2dChunkSize">
              <select
                value={form.chunkSize}
                onChange={(event) => update('chunkSize', Number(event.target.value) as 16 | 32)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded outline-none text-sm"
              >
                <option value={16}>16 x 16</option>
                <option value={32}>32 x 32</option>
              </select>
            </Help>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">
              Bioma
            </label>
            <Help id="c2dBiome">
              <select
                value={form.biome}
                onChange={(event) => update('biome', event.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded outline-none text-sm"
              >
                {BIOMES.map((biome) => (
                  <option key={biome.key} value={biome.key}>
                    {biome.label}
                  </option>
                ))}
              </select>
            </Help>
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">
              Fondo
            </label>
            <Help id="c2dBackground">
              <input
                type="color"
                value={form.background}
                onChange={(event) => update('background', event.target.value)}
                className="w-full h-[38px] bg-black/50 border border-slate-700 rounded cursor-pointer"
              />
            </Help>
          </div>
        </div>

        <p className="text-[10px] font-mono text-slate-500 leading-snug -mt-1">
          {BIOMES.find((biome) => biome.key === form.biome)?.hint}
          {' '}El bioma filtra que bloques ofrece la paleta y que estilo usan los fondos.
        </p>

        <div>
          <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">
            Descripcion
          </label>
          <Help id="c2dWorldDescription">
            <textarea
              value={form.description ?? ''}
              onChange={(event) => update('description', event.target.value)}
              rows={2}
              className="w-full bg-black/50 border border-slate-700 text-slate-100 p-2 rounded outline-none text-sm font-mono focus:border-cyan-500 resize-none"
            />
          </Help>
        </div>

        <Help id="worldBrowserNewBtn">
          <button
            type="submit"
            disabled={createWorld.isPending}
            className="w-full flex items-center justify-center gap-2 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold uppercase tracking-wider py-2.5 rounded transition-all"
          >
            {createWorld.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Crear mundo
          </button>
        </Help>
      </form>
    </div>
  );
};
