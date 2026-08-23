import React, { useState } from 'react';
import { Bot, Check, Loader2, Sparkles, X } from 'lucide-react';
import { useAiAccept, useAiReject, useAiStatus, useAiSuggest } from '../api/hooks';
import { useEditorStore } from '../state/editorStore';
import { getServices } from '../state/services';
import type { AiSuggestion, EditOperation } from '../types';
import { Help } from './Help';

interface Props {
  worldId: string;
  onApplied: () => void;
}

/**
 * Asistente de construccion.
 *
 * Regla de seguridad visible en la interfaz: la IA NUNCA escribe en el mundo.
 * Solo produce una propuesta que el backend valida contra el catalogo de
 * bloques y contra el area autorizada; aplicarla es siempre una accion humana
 * explicita. El panel completo desaparece si la IA esta desactivada.
 */
export const AiPanel: React.FC<Props> = ({ worldId, onApplied }) => {
  const status = useAiStatus(worldId);
  const suggest = useAiSuggest(worldId);
  const accept = useAiAccept(worldId);
  const reject = useAiReject(worldId);

  const pushToast = useEditorStore((state) => state.pushToast);
  const selection = useEditorStore((state) => state.selection);
  const hover = useEditorStore((state) => state.hover);

  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState<string>('');
  const [pending, setPending] = useState<AiSuggestion | null>(null);

  if (status.isLoading) {
    return (
      <div className="px-3 py-3 text-[10px] font-mono text-slate-500 flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin" /> Consultando estado de la IA...
      </div>
    );
  }

  if (!status.data?.enabled) {
    return (
      <div className="px-3 py-3 border-t border-slate-800">
        <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
          <Bot className="w-3 h-3 inline mr-1 text-slate-600" />
          Asistencia por IA desactivada. El editor funciona al 100% sin ella; active
          <span className="text-slate-400"> AI_ENABLED=true</span> en el backend para habilitarla.
        </p>
      </div>
    );
  }

  const available = Object.entries(status.data.providers)
    .filter(([, ready]) => ready)
    .map(([name]) => name);

  // El area de trabajo es la seleccion activa o, en su defecto, un cuadro de
  // 16x16 centrado en el cursor: la IA nunca puede escribir fuera de ahi.
  const area = selection
    ? {
        tileX: selection.tileX,
        tileY: selection.tileY,
        width: Math.min(64, selection.width),
        height: Math.min(64, selection.height),
      }
    : hover
      ? { tileX: hover.tileX - 8, tileY: hover.tileY - 8, width: 16, height: 16 }
      : { tileX: 0, tileY: 0, width: 16, height: 16 };

  const run = async () => {
    if (prompt.trim().length < 4) {
      pushToast('error', 'Describa que quiere construir (minimo 4 caracteres)');
      return;
    }

    try {
      const suggestion = await suggest.mutateAsync({
        prompt: prompt.trim(),
        provider: provider || undefined,
        area,
      });

      if (suggestion.status === 'FAILED') {
        pushToast('error', suggestion.error ?? 'El proveedor devolvio una respuesta invalida');
        return;
      }

      setPending(suggestion);
      pushToast(
        'info',
        `Propuesta lista: ${suggestion.operations?.length ?? 0} operaciones. Revisela antes de aplicar.`,
      );
    } catch (error) {
      pushToast('error', (error as Error).message);
    }
  };

  const applySuggestion = async () => {
    if (!pending) {
      return;
    }

    try {
      const result = await accept.mutateAsync(pending.id);
      getServices().chunkStore.ingest(result.chunks);
      getServices().renderer.invalidate();
      pushToast('success', `Propuesta aplicada: ${result.cellsChanged} celdas`);
      setPending(null);
      onApplied();
    } catch (error) {
      pushToast('error', (error as Error).message);
    }
  };

  const discard = async () => {
    if (!pending) {
      return;
    }
    await reject.mutateAsync(pending.id).catch(() => undefined);
    setPending(null);
  };

  return (
    <div className="border-t border-slate-800">
      <h4 className="text-[11px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5 px-3 py-2 border-b border-slate-800/60">
        <Sparkles className="w-3.5 h-3.5" /> Asistente de construccion
      </h4>

      <div className="p-3 space-y-2">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={3}
          placeholder="Ej: una plaza empedrada con un estanque en el centro"
          className="w-full bg-black/40 border border-slate-800 text-slate-200 p-2 rounded outline-none text-[11px] font-mono focus:border-purple-600 resize-none"
        />

        {available.length > 1 && (
          <Help id="c2dAiToggle"><select
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-1.5 rounded outline-none text-[11px]"
          >
            <option value="">Proveedor por defecto ({status.data.defaultProvider})</option>
            {available.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select></Help>
        )}

        <p className="text-[9px] font-mono text-slate-600 leading-snug">
          Area autorizada: ({area.tileX}, {area.tileY}) — {area.width}x{area.height} tiles.
          {selection ? ' Tomada de la seleccion actual.' : ' Seleccione un rectangulo para acotarla.'}
        </p>

        <button
          type="button"
          onClick={run}
          disabled={suggest.isPending}
          className="w-full flex items-center justify-center gap-1.5 bg-purple-800/70 hover:bg-purple-700/70 disabled:bg-slate-900 disabled:text-slate-600 text-purple-100 text-[10px] font-bold uppercase tracking-wider py-2 rounded transition-all"
        >
          {suggest.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          Proponer construccion
        </button>

        {pending && (
          <div className="bg-purple-950/30 border border-purple-800/50 rounded p-2 space-y-2">
            <p className="text-[10px] font-mono text-purple-200 leading-snug">
              {pending.summary ?? 'Propuesta generada'}
            </p>
            <p className="text-[9px] font-mono text-slate-500">
              {(pending.operations as EditOperation[] | undefined)?.length ?? 0} operaciones
              validadas · proveedor {pending.provider}
            </p>

            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={applySuggestion}
                disabled={accept.isPending}
                className="flex-1 flex items-center justify-center gap-1 bg-emerald-800/70 hover:bg-emerald-700/70 disabled:bg-slate-900 text-emerald-100 text-[10px] font-bold uppercase py-1.5 rounded transition"
              >
                {accept.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                Aplicar
              </button>
              <button
                type="button"
                onClick={discard}
                className="flex-1 flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold uppercase py-1.5 rounded transition"
              >
                <X className="w-3 h-3" /> Descartar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
