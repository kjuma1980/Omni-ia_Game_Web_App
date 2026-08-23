import React, { useEffect, useRef, useState } from 'react';
import { Bot, CheckCircle2, Download, HardDrive, Loader2, Sparkles, X } from 'lucide-react';
import {
  checkDefaultModelStatus,
  downloadDefaultGgufModel,
  escucharProgresoLlamaModel,
  type DefaultModelStatus,
  type ProgresoLlamaModel,
} from '../services/llamaServerService';

type Fase = 'comprobando' | 'oculto' | 'ofrecer' | 'descargando' | 'hecho' | 'error';

interface Props {
  onModeloListo?: (rutaModelo: string) => void;
  onCerrado?: () => void;
}

export const LlamaModelInstaller: React.FC<Props> = ({ onModeloListo, onCerrado }) => {
  const [fase, setFase] = useState<Fase>('comprobando');
  const [status, setStatus] = useState<DefaultModelStatus | null>(null);
  const [progreso, setProgreso] = useState<ProgresoLlamaModel>({
    percent: 0,
    downloaded: 0,
    total: 0,
    status: 'idle',
  });
  const [error, setError] = useState('');
  const unsubRef = useRef<(() => void) | null>(null);

  const cerrar = () => {
    try {
      localStorage.setItem('omni_llama_initial_offered', '1');
    } catch {}
    setFase('oculto');
    onCerrado?.();
  };

  useEffect(() => {
    let cancelado = false;

    const verificar = async () => {
      const isTauri = !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
      if (!isTauri) {
        setFase('oculto');
        return;
      }

      try {
        const st = await checkDefaultModelStatus();
        if (cancelado) return;
        setStatus(st);

        if (st.exists) {
          setFase('oculto');
          onModeloListo?.(st.path);
          return;
        }

        const offered = localStorage.getItem('omni_llama_initial_offered');
        if (offered === '1') {
          setFase('oculto');
          return;
        }

        setFase('ofrecer');
      } catch (err) {
        if (!cancelado) setFase('oculto');
      }
    };

    verificar();

    return () => {
      cancelado = true;
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, []);

  const iniciarDescarga = async () => {
    setFase('descargando');
    setError('');

    try {
      unsubRef.current = await escucharProgresoLlamaModel((p) => {
        setProgreso(p);
      });

      const rutaFinal = await downloadDefaultGgufModel();
      setFase('hecho');
      try {
        localStorage.setItem('omni_llama_initial_offered', '1');
      } catch {}

      onModeloListo?.(rutaFinal);

      setTimeout(() => {
        setFase('oculto');
        onCerrado?.();
      }, 2500);
    } catch (err: any) {
      console.error('[LlamaModelInstaller] Error al descargar modelo:', err);
      setError(err?.message || 'No se pudo completar la descarga del modelo.');
      setFase('error');
    } finally {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    }
  };

  if (fase === 'oculto' || fase === 'comprobando') {
    return null;
  }

  const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden p-6 text-slate-200">
        <button
          onClick={cerrar}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
          title="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        {fase === 'ofrecer' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>Modelo Local de IA (Llama.cpp)</span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Sin Conexión
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Para guiones, diálogos de NPCs y generación de código local</p>
              </div>
            </div>

            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-2 text-xs text-slate-300">
              <p>
                Omni IA Game incluye el motor nativo de inferencia local <strong>llama-server</strong>. Para usarlo sin internet y sin gastar tokens de APIs externas, puedes descargar el modelo inicial recomendado:
              </p>
              <div className="mt-2 p-2.5 rounded-lg bg-purple-950/30 border border-purple-900/40 flex items-center justify-between text-[11px] font-mono text-purple-200">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-purple-400" />
                  <span>Qwen2.5-Coder-1.5B (GGUF Q4_K_M)</span>
                </div>
                <span className="text-purple-300 font-semibold">~0.98 GB</span>
              </div>
              <p className="text-[11px] text-slate-400">
                * Se guarda en la carpeta <code className="text-purple-300">models/</code> de Omni IA Game. Cero configuración y sin requerir cuentas ni tokens.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={cerrar}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Más tarde
              </button>
              <button
                type="button"
                onClick={iniciarDescarga}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/40 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>DESCARGAR MODELO (1-CLIC)</span>
              </button>
            </div>
          </div>
        )}

        {fase === 'descargando' && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 animate-pulse">
                <Download className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Descargando Modelo Local...</h3>
                <p className="text-xs text-slate-400">Guardando en la carpeta de modelos de Omni IA Game</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono text-slate-300">
                <span>Progreso: {progreso.percent}%</span>
                <span>
                  {progreso.total > 0
                    ? `${formatMB(progreso.downloaded)} MB / ${formatMB(progreso.total)} MB`
                    : `${formatMB(progreso.downloaded)} MB`}
                </span>
              </div>
              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300"
                  style={{ width: `${Math.max(3, progreso.percent)}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 text-center">
                Puedes continuar usando la aplicación mientras se completa la descarga en segundo plano.
              </p>
            </div>
          </div>
        )}

        {fase === 'hecho' && (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-100">¡Modelo Descargado y Listo!</h3>
            <p className="text-xs text-slate-300">
              El modelo local ya está disponible en <code className="text-emerald-400">models/</code> para ser ejecutado con llama-server.
            </p>
          </div>
        )}

        {fase === 'error' && (
          <div className="space-y-3 py-2">
            <div className="p-3 bg-red-950/40 border border-red-800 rounded-xl text-xs text-red-300">
              <p className="font-bold mb-1">Error en la descarga:</p>
              <p>{error}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cerrar}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={iniciarDescarga}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white"
              >
                Reintentar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LlamaModelInstaller;
