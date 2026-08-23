import React, { useState } from 'react';
import { DoorOpen, Loader2, LogIn, Plus } from 'lucide-react';
import { useCreateInterior, useInteriors, useWorld } from '../api/hooks';
import { useEditorStore } from '../state/editorStore';
import { BIOMES } from '../types';
import { Help } from './Help';

interface Props {
  worldId: string;
  onOpen: (worldId: string) => void;
}

/**
 * Interiores: cuevas, casas y castillos por dentro.
 *
 * Un interior ES un mundo, enlazado al exterior por la celda de su entrada. Eso
 * permite editarlo con exactamente las mismas herramientas y exportarlo igual,
 * en lugar de inventar un segundo tipo de contenido con su propia maquinaria.
 */
export const InteriorsPanel: React.FC<Props> = ({ worldId, onOpen }) => {
  const worldQuery = useWorld(worldId);
  const interiorsQuery = useInteriors(worldId);
  const createInterior = useCreateInterior(worldId);
  const pushToast = useEditorStore((state) => state.pushToast);
  const hover = useEditorStore((state) => state.hover);

  const [name, setName] = useState('');
  const [biome, setBiome] = useState('cave');
  const [open, setOpen] = useState(false);

  const world = worldQuery.data;
  const isInterior = Boolean(world?.isInterior);

  const create = async () => {
    if (!hover) {
      pushToast('error', 'Situe el cursor sobre la celda de la entrada antes de crear el interior');
      return;
    }

    if (name.trim().length < 3) {
      pushToast('error', 'El interior necesita un nombre de al menos 3 caracteres');
      return;
    }

    try {
      const created = await createInterior.mutateAsync({
        name: name.trim(),
        biome,
        entranceTileX: hover.tileX,
        entranceTileY: hover.tileY,
      });

      pushToast('success', `Interior "${created.name}" creado en ${hover.tileX}, ${hover.tileY}`);
      setName('');
      setOpen(false);
    } catch (error) {
      pushToast('error', (error as Error).message);
    }
  };

  return (
    <div className="border-t border-slate-800">
      <h4 className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5 px-3 py-2 border-b border-slate-800/60">
        <DoorOpen className="w-3.5 h-3.5" /> Interiores
      </h4>

      <div className="p-3 space-y-2">
        {isInterior ? (
          <div className="space-y-2">
            <p className="text-[10px] font-mono text-amber-300/80 leading-snug">
              Esta editando un interior. Vuelva al exterior desde la lista de mundos.
            </p>
          </div>
        ) : (
          <>
            {interiorsQuery.isLoading && (
              <p className="text-[10px] font-mono text-slate-500 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Cargando...
              </p>
            )}

            {interiorsQuery.data?.length === 0 && (
              <p className="text-[9px] font-mono text-slate-600 leading-snug">
                Sin interiores. Coloque una puerta, boca de cueva o pozo, situe el cursor sobre esa
                celda y cree el interior.
              </p>
            )}

            <div className="space-y-1">
              {interiorsQuery.data?.map((interior) => (
                <button
                  key={interior.id}
                  type="button"
                  onClick={() => onOpen(interior.id)}
                  className="w-full flex items-center gap-2 bg-slate-950/50 border border-slate-800 hover:border-amber-600/60 rounded px-2 py-1.5 transition text-left"
                >
                  <LogIn className="w-3 h-3 text-amber-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-slate-200 truncate">{interior.name}</p>
                    <p className="text-[9px] font-mono text-slate-600">
                      entrada {interior.entranceTileX}, {interior.entranceTileY} ·{' '}
                      {interior._count?.chunks ?? 0} chunks
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {open ? (
              <div className="space-y-1.5 bg-slate-950/60 border border-slate-800 rounded p-2">
                <Help id="c2dInteriorCreate"><input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Nombre del interior"
                  className="w-full bg-black/40 border border-slate-800 text-slate-200 px-2 py-1 rounded outline-none text-[11px] font-mono focus:border-amber-600"
                /></Help>
                <Help id="c2dBiome"><select
                  value={biome}
                  onChange={(event) => setBiome(event.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 px-2 py-1 rounded outline-none text-[11px]"
                >
                  {BIOMES.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select></Help>
                <p className="text-[9px] font-mono text-slate-600">
                  Entrada:{' '}
                  {hover ? (
                    <span className="text-amber-400">
                      {hover.tileX}, {hover.tileY}
                    </span>
                  ) : (
                    <span className="text-red-400">situe el cursor en el lienzo</span>
                  )}
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={create}
                    disabled={createInterior.isPending}
                    className="flex-1 bg-amber-800/60 hover:bg-amber-700/70 disabled:bg-slate-900 text-amber-100 text-[10px] font-bold uppercase py-1.5 rounded transition"
                  >
                    Crear
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="px-2 text-[10px] font-mono uppercase text-slate-500 hover:text-slate-300"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 bg-slate-800/60 hover:bg-slate-700/70 text-slate-300 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded transition"
              >
                <Plus className="w-3 h-3" /> Nuevo interior
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
