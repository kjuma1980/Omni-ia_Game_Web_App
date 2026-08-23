import React, { useState } from 'react';
import { Eye, EyeOff, ImageIcon, Loader2, Sparkles, Wand2 } from 'lucide-react';
import {
  useGenerateParallax,
  useParallaxGeneratorStatus,
  usePreviewParallaxPrompt,
  useUpdateParallaxLayer,
} from '../api/hooks';
import { useEditorStore } from '../state/editorStore';
import { invalidateLayer } from '../core/parallax';
import type { ParallaxLayer } from '../core/parallax';
import { safeImageSrc } from '../../../services/localService';

interface Props {
  worldId: string;
  layers: ParallaxLayer[];
}

const KIND_LABEL: Record<string, string> = {
  SKY: 'Cielo y nubes',
  FAR: 'Fondo lejano',
  MID: 'Fondo medio',
  NEAR: 'Primer plano',
};

const KIND_HINT: Record<string, string> = {
  SKY: 'Solo cielo y nubes. Es la capa que menos se desplaza.',
  FAR: 'Montanas y siluetas a lo lejos, desaturadas y tenidas hacia el cielo.',
  MID: 'Arboleda y relieve intermedio, con el borde inferior tapado por el suelo.',
  NEAR: 'Elementos que pasan por delante del jugador; centro despejado.',
};

/**
 * Fondos de parallax.
 *
 * La generacion usa el ComfyUI que Omni IA Game ya tiene levantado: no requiere
 * ninguna clave y nada sale de la maquina. Si ComfyUI esta apagado, el panel lo
 * dice y el resto del editor sigue funcionando con fondos procedurales.
 */
export const ParallaxPanel: React.FC<Props> = ({ worldId, layers }) => {
  const status = useParallaxGeneratorStatus(worldId);
  const generate = useGenerateParallax(worldId);
  const updateLayer = useUpdateParallaxLayer(worldId);
  const previewPrompt = usePreviewParallaxPrompt(worldId);
  const pushToast = useEditorStore((state) => state.pushToast);

  const [hint, setHint] = useState('');
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [shownPrompt, setShownPrompt] = useState<{ text: string; rationale: string } | null>(null);

  const available = status.data?.available ?? false;

  const run = async (layer: ParallaxLayer) => {
    setActiveLayerId(layer.id);
    try {
      const result = await generate.mutateAsync({ layerId: layer.id, hint: hint.trim() || undefined });
      // La imagen cambio: hay que rehacer el tile sin costura.
      invalidateLayer(layer.id);
      pushToast(
        'success',
        `${KIND_LABEL[layer.kind]} generado en ${(result.elapsedMs / 1000).toFixed(0)}s (seed ${result.seed})`,
      );
    } catch (error) {
      pushToast('error', (error as Error).message);
    } finally {
      setActiveLayerId(null);
    }
  };

  const showPrompt = async (layer: ParallaxLayer) => {
    try {
      const result = await previewPrompt.mutateAsync({
        kind: layer.kind,
        hint: hint.trim() || undefined,
      });
      setShownPrompt({ text: result.positive, rationale: result.rationale });
    } catch (error) {
      pushToast('error', (error as Error).message);
    }
  };

  const toggleVisible = async (layer: ParallaxLayer) => {
    try {
      await updateLayer.mutateAsync({ layerId: layer.id, data: { visible: !layer.visible } });
    } catch (error) {
      pushToast('error', (error as Error).message);
    }
  };

  return (
    <div className="border-t border-slate-800">
      <h4 className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5 px-3 py-2 border-b border-slate-800/60">
        <ImageIcon className="w-3.5 h-3.5" /> Fondos y parallax
      </h4>

      <div className="p-3 space-y-2.5">
        {status.isLoading ? (
          <p className="text-[10px] font-mono text-slate-500 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Comprobando ComfyUI...
          </p>
        ) : available ? (
          <p className="text-[9px] font-mono text-emerald-500/80 leading-snug">
            ComfyUI disponible · {status.data?.checkpoint?.replace('.safetensors', '')}
          </p>
        ) : (
          <p className="text-[9px] font-mono text-amber-500/80 leading-snug">
            ComfyUI apagado. Levantelo desde Omni IA Game (Ajustes ▸ Motores locales) para generar
            fondos. El editor funciona igual sin ellos.
          </p>
        )}

        <textarea
          value={hint}
          onChange={(event) => setHint(event.target.value)}
          rows={2}
          placeholder="Indicacion opcional: 'colinas suaves al atardecer'"
          className="w-full bg-black/40 border border-slate-800 text-slate-200 p-2 rounded outline-none text-[11px] font-mono focus:border-sky-600 resize-none"
        />

        <div className="space-y-1.5">
          {layers.length === 0 && (
            <p className="text-[10px] font-mono text-slate-500">
              Este mundo no tiene capas de fondo.
            </p>
          )}

          {layers.map((layer) => {
            const busy = generate.isPending && activeLayerId === layer.id;

            return (
              <div
                key={layer.id}
                className="bg-slate-950/50 border border-slate-800 rounded p-2 space-y-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleVisible(layer)}
                    title={layer.visible ? 'Ocultar capa' : 'Mostrar capa'}
                    className={`shrink-0 transition ${
                      layer.visible ? 'text-sky-400' : 'text-slate-700 hover:text-slate-500'
                    }`}
                  >
                    {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-slate-200 truncate">
                      {KIND_LABEL[layer.kind] ?? layer.kind}
                    </p>
                    <p className="text-[9px] font-mono text-slate-600">
                      parallax {layer.speedX.toFixed(2)}
                      {layer.imageUrl ? ' · imagen lista' : ' · sin imagen'}
                    </p>
                  </div>

                  {layer.imageUrl && (
                    <img
                      src={safeImageSrc(layer.imageUrl)}
                      alt={layer.name}
                      className="w-14 h-8 object-cover rounded border border-slate-700 shrink-0"
                    />
                  )}
                </div>

                <p className="text-[9px] font-mono text-slate-600 leading-snug">
                  {KIND_HINT[layer.kind]}
                </p>

                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => run(layer)}
                    disabled={!available || generate.isPending}
                    className="flex-1 flex items-center justify-center gap-1 bg-sky-800/60 hover:bg-sky-700/70 disabled:bg-slate-900 disabled:text-slate-600 text-sky-100 text-[10px] font-bold uppercase py-1.5 rounded transition"
                  >
                    {busy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    {busy ? 'Generando...' : 'Generar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => showPrompt(layer)}
                    title="Ver el prompt que se usaria, sin gastar GPU"
                    className="px-2 rounded border border-slate-800 text-slate-500 hover:text-sky-300 transition"
                  >
                    <Wand2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {shownPrompt && (
          <div className="bg-slate-950/70 border border-sky-900/50 rounded p-2 space-y-1.5">
            <p className="text-[9px] font-mono text-sky-300 leading-snug">{shownPrompt.rationale}</p>
            <p className="text-[9px] font-mono text-slate-500 leading-snug max-h-28 overflow-y-auto">
              {shownPrompt.text}
            </p>
            <button
              type="button"
              onClick={() => setShownPrompt(null)}
              className="w-full text-[9px] font-mono uppercase text-slate-500 hover:text-slate-300 transition"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
