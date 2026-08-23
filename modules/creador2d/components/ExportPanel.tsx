import React, { useState } from 'react';
import { Copy, Download, KeyRound, Loader2, Plug } from 'lucide-react';
import { useEngineToken } from '../api/hooks';
import { useEditorStore } from '../state/editorStore';
import { getServices } from '../state/services';
import { API_BASE_URL } from '../api/client';
import { Help } from './Help';

interface Props {
  worldId: string;
  worldSlug: string;
}

const FORMATS = [
  {
    id: 'matrix' as const,
    label: 'Matriz absoluta',
    hint: 'Rejilla rectangular ya ensamblada. Es lo que leen los plugins.',
  },
  {
    id: 'chunks' as const,
    label: 'Por chunks',
    hint: 'Formato nativo, el mas compacto para mundos grandes.',
  },
  {
    id: 'collision' as const,
    label: 'Solo colisiones',
    hint: 'Matriz logica de banderas, sin datos visuales.',
  },
];

/**
 * Puente hacia los motores de juego. Genera el token de servicio que se pega en
 * el plugin y permite descargar el mundo en los tres formatos que expone la API.
 */
export const ExportPanel: React.FC<Props> = ({ worldId, worldSlug }) => {
  const engineToken = useEngineToken(worldId);
  const pushToast = useEditorStore((state) => state.pushToast);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (format: 'matrix' | 'chunks' | 'collision') => {
    setBusy(format);
    try {
      const payload = await getServices().client.exportWorld(worldId, format);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${worldSlug}.${format}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      pushToast('success', `Exportado ${worldSlug}.${format}.json`);
    } catch (error) {
      pushToast('error', (error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const generateToken = async () => {
    try {
      const result = await engineToken.mutateAsync();
      setToken(result.token);
      pushToast('success', `Token de motor generado (huella ${result.fingerprint})`);
    } catch (error) {
      pushToast('error', (error as Error).message);
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      pushToast('success', `${label} copiado al portapapeles`);
    } catch {
      pushToast('error', 'El portapapeles no esta disponible');
    }
  };

  return (
    <div className="border-t border-slate-800">
      <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 px-3 py-2 border-b border-slate-800/60">
        <Plug className="w-3.5 h-3.5" /> Motores y exportacion
      </h4>

      <div className="p-3 space-y-3">
        <div className="space-y-1.5">
          {FORMATS.map((format) => (
            <button
              key={format.id}
              type="button"
              onClick={() => download(format.id)}
              disabled={busy !== null}
              className="w-full text-left px-2.5 py-2 rounded border border-slate-800 bg-slate-950/50 hover:border-emerald-700/60 disabled:opacity-50 transition-all"
            >
              <p className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                {busy === format.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3 text-emerald-500" />
                )}
                {format.label}
              </p>
              <p className="text-[9px] font-mono text-slate-500 leading-snug mt-0.5">
                {format.hint}
              </p>
            </button>
          ))}
        </div>

        <div className="border-t border-slate-800/70 pt-2.5 space-y-2">
          <p className="text-[9px] font-mono text-slate-500 leading-snug">
            Los plugins de Unity, Godot y Unreal se conectan a la misma API. Necesitan la URL, el
            identificador del mundo y un token de servicio de 12 horas con permisos de solo lectura.
          </p>

          <FieldRow label="API" value={`${API_BASE_URL}/api`} onCopy={copy} />
          <FieldRow label="World ID" value={worldId} onCopy={copy} />

          {token ? (
            <div className="space-y-1">
              <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                Token de motor
              </p>
              <div className="flex gap-1">
                <Help id="c2dEngineToken"><input
                  readOnly
                  value={token}
                  className="flex-1 bg-black/50 border border-slate-800 text-[9px] font-mono text-emerald-300 px-2 py-1 rounded outline-none truncate"
                /></Help>
                <button
                  type="button"
                  onClick={() => copy(token, 'Token')}
                  className="px-2 rounded border border-slate-800 text-slate-400 hover:text-emerald-300 transition"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              <p className="text-[9px] font-mono text-amber-500/80 leading-snug">
                Caduca en 12 horas. No lo comparta: da acceso de lectura a sus mundos.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={generateToken}
              disabled={engineToken.isPending}
              className="w-full flex items-center justify-center gap-1.5 bg-emerald-800/60 hover:bg-emerald-700/70 disabled:bg-slate-900 text-emerald-100 text-[10px] font-bold uppercase tracking-wider py-2 rounded transition-all"
            >
              {engineToken.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <KeyRound className="w-3 h-3" />
              )}
              Generar token de motor
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const FieldRow: React.FC<{
  label: string;
  value: string;
  onCopy: (value: string, label: string) => void;
}> = ({ label, value, onCopy }) => (
  <div className="flex items-center gap-1">
    <span className="text-[9px] font-mono text-slate-500 uppercase w-14 shrink-0">{label}</span>
    <input
      readOnly
      value={value}
      className="flex-1 bg-black/40 border border-slate-800 text-[9px] font-mono text-slate-300 px-2 py-1 rounded outline-none truncate"
    />
    <button
      type="button"
      onClick={() => onCopy(value, label)}
      className="px-1.5 rounded border border-slate-800 text-slate-500 hover:text-slate-200 transition"
    >
      <Copy className="w-3 h-3" />
    </button>
  </div>
);
