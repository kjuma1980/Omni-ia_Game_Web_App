import React from 'react';
import { Eye, EyeOff, Layers3 } from 'lucide-react';
import { useEditorStore } from '../state/editorStore';
import { LAYER_LABEL, LAYER_ORDER, type LayerName } from '../core/grid';

const LAYER_HINT: Record<LayerName, string> = {
  GROUND: 'Terreno base. Se dibuja primero y nunca tapa a nadie.',
  PIT: 'Agua, lava y huecos. Sobre el suelo, bajo los muros.',
  WALL: 'Muros y props solidos. Participa del orden por Y en 2.5D.',
  OVERLAY: 'Techos y copas. Siempre por encima de los personajes.',
};

export const LayerPanel: React.FC = () => {
  const activeLayer = useEditorStore((state) => state.activeLayer);
  const setActiveLayer = useEditorStore((state) => state.setActiveLayer);
  const layerVisibility = useEditorStore((state) => state.layerVisibility);
  const toggleLayer = useEditorStore((state) => state.toggleLayer);

  return (
    <div className="border-b border-slate-800">
      <h4 className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5 px-3 py-2 border-b border-slate-800/60">
        <Layers3 className="w-3.5 h-3.5" /> Capas
      </h4>

      <div className="p-2 space-y-1">
        {/* Se listan de arriba abajo en orden de dibujado inverso, como en
            cualquier editor de capas: lo ultimo dibujado aparece arriba. */}
        {[...LAYER_ORDER].reverse().map((layer) => {
          const isActive = activeLayer === layer;
          const isVisible = layerVisibility[layer];

          return (
            <div
              key={layer}
              className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-all ${
                isActive
                  ? 'bg-cyan-950/40 border-cyan-600/50'
                  : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleLayer(layer)}
                title={isVisible ? 'Ocultar capa' : 'Mostrar capa'}
                className={`shrink-0 transition ${
                  isVisible ? 'text-cyan-400' : 'text-slate-700 hover:text-slate-500'
                }`}
              >
                {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setActiveLayer(layer)}
                className="flex-1 text-left min-w-0"
                title={LAYER_HINT[layer]}
              >
                <p
                  className={`text-[11px] font-bold ${
                    isActive ? 'text-cyan-300' : 'text-slate-300'
                  }`}
                >
                  {LAYER_LABEL[layer]}
                </p>
                <p className="text-[9px] font-mono text-slate-600 truncate">{layer}</p>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
