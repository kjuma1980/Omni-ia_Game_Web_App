import React, { useMemo, useState } from 'react';
import { Boxes, Hammer, Search, Trash2 } from 'lucide-react';
import { BlockSwatch } from './BlockSwatch';
import { useEditorStore } from '../state/editorStore';
import { getServices } from '../state/services';
import { LAYER_LABEL, describeCollision, type LayerName } from '../core/grid';
import { CATEGORY_LABEL, type BlockCategory, type BlockDefinition } from '../types';
import { Help } from './Help';

interface Props {
  onCraft: (blockKey: string) => void;
  inventory: Record<string, number>;
}

/**
 * Paleta de bloques. Filtra por la capa activa porque un bloque solo puede
 * vivir en su propia capa: mostrar muros mientras se edita el suelo solo
 * llevaria a rechazos del backend.
 */
export const BlockPalette: React.FC<Props> = ({ onCraft, inventory }) => {
  const blocks = useEditorStore((state) => state.blocks);
  const activeLayer = useEditorStore((state) => state.activeLayer);
  const selectedBlockKey = useEditorStore((state) => state.selectedBlockKey);
  const selectBlock = useEditorStore((state) => state.selectBlock);
  const setTool = useEditorStore((state) => state.setTool);

  const [query, setQuery] = useState('');
  const [onlyLayer, setOnlyLayer] = useState(true);
  const [category, setCategory] = useState<BlockCategory | 'ALL'>('ALL');

  /** Categorias presentes en la seleccion actual, con su recuento. */
  const categories = useMemo(() => {
    const counts = new Map<BlockCategory, number>();
    for (const block of blocks) {
      if (onlyLayer && block.layer !== activeLayer) {
        continue;
      }
      counts.set(block.category, (counts.get(block.category) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) =>
      CATEGORY_LABEL[a[0]].localeCompare(CATEGORY_LABEL[b[0]]),
    );
  }, [blocks, activeLayer, onlyLayer]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return blocks.filter((block) => {
      if (onlyLayer && block.layer !== activeLayer) {
        return false;
      }
      if (category !== 'ALL' && block.category !== category) {
        return false;
      }
      if (!needle) {
        return true;
      }
      // La busqueda tambien mira las etiquetas: "agrietado", "ruina", "madera".
      return (
        block.name.toLowerCase().includes(needle) ||
        block.key.toLowerCase().includes(needle) ||
        block.biome.toLowerCase().includes(needle) ||
        block.tags.some((tag) => tag.toLowerCase().includes(needle))
      );
    });
  }, [blocks, activeLayer, onlyLayer, category, query]);

  const grouped = useMemo(() => {
    const map = new Map<LayerName, BlockDefinition[]>();
    for (const block of visible) {
      const bucket = map.get(block.layer) ?? [];
      bucket.push(block);
      map.set(block.layer, bucket);
    }
    return map;
  }, [visible]);

  const pick = (block: BlockDefinition) => {
    selectBlock(block.key);
    setTool('PLACE');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <h4 className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
          <Boxes className="w-3.5 h-3.5" /> Paleta
        </h4>
        <button
          type="button"
          onClick={() => setOnlyLayer((current) => !current)}
          className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border transition ${
            onlyLayer
              ? 'text-cyan-300 border-cyan-700 bg-cyan-950/40'
              : 'text-slate-500 border-slate-800'
          }`}
          title="Mostrar solo los bloques de la capa activa"
        >
          {onlyLayer ? LAYER_LABEL[activeLayer] : 'Todas'}
        </button>
      </div>

      <div className="px-3 py-2 space-y-1.5">
        <div className="relative">
          <Search className="w-3 h-3 text-slate-600 absolute left-2 top-1/2 -translate-y-1/2" />
          <Help id="c2dBlockSearch"><input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, bioma o etiqueta..."
            className="w-full bg-black/40 border border-slate-800 text-slate-200 pl-7 pr-2 py-1.5 rounded outline-none text-[11px] font-mono focus:border-cyan-600"
          /></Help>
        </div>

        <Help id="c2dBlockCategory"><select
          value={category}
          onChange={(event) => setCategory(event.target.value as BlockCategory | 'ALL')}
          className="w-full bg-slate-800 border border-slate-700 text-slate-200 px-2 py-1.5 rounded outline-none text-[11px]"
        >
          <option value="ALL">Todas las categorias ({visible.length})</option>
          {categories.map(([key, count]) => (
            <option key={key} value={key}>
              {CATEGORY_LABEL[key]} ({count})
            </option>
          ))}
        </select></Help>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
        {/* Se distingue "el filtro no encuentra nada" de "no llego ningun
            bloque", que son dos problemas muy distintos para el usuario. */}
        {blocks.length === 0 ? (
          <div className="px-2 py-4 space-y-1.5">
            <p className="text-[10px] text-amber-400 font-mono text-center">
              El catalogo llego vacio.
            </p>
            <p className="text-[9px] text-slate-500 font-mono leading-snug">
              Suele significar que esta ventana tiene una version anterior del editor. Recargue
              (Ctrl+R). Si persiste, revise la consola: el cliente informa de los bloques que
              descarta y por que.
            </p>
          </div>
        ) : (
          visible.length === 0 && (
            <p className="text-[10px] text-slate-500 font-mono px-2 py-4 text-center">
              Ningun bloque coincide con el filtro.
            </p>
          )
        )}

        {Array.from(grouped.entries()).map(([layer, items]) => (
          <div key={layer} className="mb-3">
            {!onlyLayer && (
              <p className="text-[9px] text-slate-500 font-mono uppercase tracking-wider px-1 mb-1">
                {LAYER_LABEL[layer]}
              </p>
            )}

            <div className="grid grid-cols-4 gap-1.5">
              {items.map((block) => {
                const owned = inventory[block.key] ?? 0;
                const isSelected = selectedBlockKey === block.key;
                const flags = describeCollision(block.collisionFlags);

                return (
                  <button
                    key={block.key}
                    type="button"
                    onClick={() => pick(block)}
                    title={`${block.name}${flags.length ? ` — ${flags.join(', ')}` : ''}`}
                    className={`relative group flex flex-col items-center gap-1 p-1.5 rounded border transition-all ${
                      isSelected
                        ? 'border-cyan-400 bg-cyan-950/50'
                        : 'border-slate-800 bg-slate-950/50 hover:border-slate-600'
                    }`}
                  >
                    <BlockSwatch
                      blockKey={block.key}
                      visual={block.visual}
                      origin={block.origin}
                      imageData={block.imageData}
                      size={28}
                      className="rounded-sm"
                    />
                    <span className="text-[8px] font-mono text-slate-400 truncate w-full text-center leading-tight">
                      {block.name}
                    </span>

                    {block.craftable && (
                      <span
                        className="absolute top-0.5 right-0.5 text-amber-400"
                        title="Bloque fabricable"
                      >
                        <Hammer className="w-2.5 h-2.5" />
                      </span>
                    )}

                    {owned > 0 && (
                      <span className="absolute bottom-0.5 right-0.5 text-[8px] font-mono text-emerald-400 bg-slate-950/80 px-0.5 rounded">
                        {owned}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedBlockKey && (
        <SelectedBlockDetail
          block={blocks.find((item) => item.key === selectedBlockKey) ?? null}
          onCraft={onCraft}
          inventory={inventory}
        />
      )}
    </div>
  );
};

const SelectedBlockDetail: React.FC<{
  block: BlockDefinition | null;
  onCraft: (blockKey: string) => void;
  inventory: Record<string, number>;
}> = ({ block, onCraft, inventory }) => {
  if (!block) {
    return null;
  }

  const flags = describeCollision(block.collisionFlags);
  const canCraft =
    block.craftable &&
    (block.recipe ?? []).every((ingredient) => (inventory[ingredient.key] ?? 0) >= ingredient.qty);

  const isCustomBlock = !block.isSystem && block.origin !== 'PROCEDURAL';

  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDeleteCustomBlock = async () => {
    if (!block || !isCustomBlock) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setConfirmDelete(false);
    try {
        const client = getServices().client;
        await client.deleteCustomBlock(block.key);
        const currentBlocks = useEditorStore.getState().blocks;
        useEditorStore.getState().setBlocks(currentBlocks.filter((b) => b.key !== block.key));
        useEditorStore.getState().selectBlock(null);
        useEditorStore.getState().pushToast('success', `Bloque "${block.name}" eliminado del catálogo.`);
      } catch (err: any) {
        useEditorStore.getState().pushToast('error', err.message || 'No se pudo eliminar el bloque.');
      }
  };

  return (
    <div className="border-t border-slate-800 px-3 py-2 bg-slate-950/60 space-y-1.5">
      <div className="flex items-center gap-2">
        <BlockSwatch
          blockKey={block.key}
          visual={block.visual}
          origin={block.origin}
          imageData={block.imageData}
          size={24}
          className="rounded-sm"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-slate-100 truncate">{block.name}</p>
          <p className="text-[9px] font-mono text-slate-500 truncate">
            {LAYER_LABEL[block.layer]} · {block.biome}
          </p>
        </div>
      </div>

      {block.description && (
        <p className="text-[9px] text-slate-500 font-mono leading-snug">{block.description}</p>
      )}

      <p className="text-[9px] font-mono text-slate-400">
        Colision:{' '}
        {flags.length === 0 ? (
          <span className="text-slate-600">ninguna</span>
        ) : (
          <span className="text-amber-400">{flags.join(' + ')}</span>
        )}
      </p>

      {block.craftable && block.recipe && (
        <div className="pt-1 border-t border-slate-800/70">
          <p className="text-[9px] font-mono text-slate-500 mb-1">
            Receta: {block.recipe.map((item) => `${item.qty}x ${item.key}`).join(' + ')}
          </p>
          <button
            type="button"
            disabled={!canCraft}
            onClick={() => onCraft(block.key)}
            className="w-full flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded transition-all bg-amber-800/60 hover:bg-amber-700/70 disabled:bg-slate-900 disabled:text-slate-600 text-amber-100"
          >
            <Hammer className="w-3 h-3" /> Fabricar
          </button>
        </div>
      )}

      {isCustomBlock && (
        <div className="pt-1.5 border-t border-slate-800/70">
          <button
            type="button"
            onClick={handleDeleteCustomBlock}
            className="w-full flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-wider py-1 rounded transition-all bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-300"
            title="Borrar bloque personalizado del catálogo"
          >
            <Trash2 className="w-3 h-3" /> Eliminar Bloque Personalizado
          </button>
        </div>
      )}
    </div>
  );
};
