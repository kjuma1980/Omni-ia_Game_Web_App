import React, { useState, useEffect } from 'react';
import { X, Sparkles, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { UpdateManifest } from '../services/updateService';
import Tooltip from './Tooltip';

const invoke = <T = any>(name: string, args?: any): Promise<T> => {
  const rawInvoke = (window as any).__TAURI__?.invoke ||
                    (window as any).__TAURI_INTERNALS__?.invoke;
  if (rawInvoke) {
    return rawInvoke(name, args);
  }
  console.warn(`[UpdateModal] Tauri invoke fallback: ${name} not available`);
  return Promise.resolve(null as any);
};

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateData: UpdateManifest;
  showTooltips?: boolean;
}

const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  updateData,
  showTooltips = false,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [imgError, setImgError] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const downloadUrl =
    updateData.url ||
    `https://fenixdev.cloud/downloads/Omni-IA-Game-Setup-${updateData.version}.exe`;

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    if (isOpen) {
      import('@tauri-apps/api/event')
        .then(({ listen }) => {
          listen<number>('update-download-progress', (event) => {
            const pct = Math.min(100, Math.max(0, Math.round(event.payload)));
            setProgress(pct);
            if (pct >= 100) {
              setStatusText('¡Descarga completada! Ejecutando instalador oficial...');
            } else {
              setStatusText(`Descargando instalador oficial: ${pct}%`);
            }
          }).then((fn) => {
            unlisten = fn;
          });
        })
        .catch(() => {});
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !downloading) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (unlisten) unlisten();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, downloading, onClose]);

  if (!isOpen) return null;

  const handleStartUpdate = async () => {
    setDownloading(true);
    setErrorMsg(null);
    setProgress(1);
    setStatusText('Iniciando descarga del instalador oficial...');

    try {
      // Descarga 100% nativa en segundo plano con lanzamiento automático al completar
      await invoke('download_and_run_installer', { url: downloadUrl });
      setProgress(100);
      setStatusText('Instalador ejecutado. La aplicación se cerrará en breve...');
    } catch (err: any) {
      console.error('[UpdateModal] Error en la descarga e instalación:', err);
      setErrorMsg(
        err?.message ||
          (typeof err === 'string' ? err : 'Error al conectar con el servidor de descargas. Verifica tu conexión.')
      );
      setDownloading(false);
      setProgress(0);
      setStatusText('');
    }
  };

  const notesList = Array.isArray(updateData.notes)
    ? updateData.notes
    : typeof updateData.notes === 'string'
    ? (updateData.notes as string).split('\n').filter(Boolean)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-purple-500/40 rounded-2xl shadow-2xl shadow-purple-950/50 overflow-hidden flex flex-col">
        {/* Banner Superior */}
        <div className="relative h-40 bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900 overflow-hidden flex items-center justify-center border-b border-purple-500/20">
          {!imgError ? (
            <img
              src={updateData.releaseLogoUrl || 'https://fenixdev.cloud/omni_ia_logo.jpg'}
              alt="Omni IA Game"
              className="w-full h-full object-cover opacity-90 hover:scale-105 transition-transform duration-700"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-6 space-y-2">
              <div className="p-3 bg-purple-600/30 rounded-2xl border border-purple-400/40 shadow-inner">
                <Sparkles className="w-8 h-8 text-purple-300" />
              </div>
              <h2 className="text-xl font-extrabold text-white tracking-wide">
                OMNI IA <span className="text-purple-400">GAME</span>
              </h2>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-black/40 pointer-events-none" />

          {/* Botón Cerrar (Siempre activo) */}
          <button
            onClick={() => {
              setDownloading(false);
              onClose();
            }}
            className="absolute top-3 right-3 p-1.5 bg-slate-950/70 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full border border-slate-700/60 transition shadow-md z-10"
            title="Cerrar ventana"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Badge de Versión */}
          <div className="absolute bottom-3 left-4 flex items-center gap-2 z-10">
            <span className="px-3 py-1 bg-purple-600 text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1.5 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              Nueva Versión {updateData.version}
            </span>
          </div>
        </div>

        {/* Contenido Principal */}
        <div className="p-6 space-y-4 flex-1">
          <div>
            <h3 className="text-base font-bold text-slate-100 mb-1">
              {updateData.title || '¡Nueva actualización disponible!'}
            </h3>
            <p className="text-xs text-slate-400">
              {updateData.subtitle || `Descubre las mejoras y optimizaciones de la versión ${updateData.version}.`}
            </p>
          </div>

          {/* Novedades */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Novedades de la versión {updateData.version}
            </h4>
            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-300 space-y-2 max-h-44 overflow-y-auto leading-relaxed">
              {notesList.length > 0 ? (
                notesList.map((line, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-slate-300 text-xs py-0.5">
                    <span className="text-purple-400 font-bold mt-0.5">•</span>
                    <span>{line.replace(/^[•\-\*]\s*/, '')}</span>
                  </div>
                ))
              ) : (
                <p className="text-slate-400 text-xs">
                  • Mejoras de rendimiento y optimizaciones del sistema.
                </p>
              )}
            </div>
          </div>

          {/* Barra de Progreso Real */}
          {downloading && (
            <div className="space-y-2 p-3.5 bg-purple-950/30 border border-purple-500/30 rounded-xl animate-in fade-in">
              <div className="flex justify-between items-center text-xs font-mono text-purple-200">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                  {statusText || 'Descargando paquete de actualización...'}
                </span>
                <span className="font-bold text-purple-300">{progress}%</span>
              </div>
              <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-purple-600 to-indigo-400 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Mensaje de Error si ocurre */}
          {errorMsg && (
            <div className="p-3 bg-red-950/50 border border-red-500/40 rounded-xl text-xs text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="flex-1">{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              setDownloading(false);
              onClose();
            }}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
          >
            Más tarde
          </button>

          <Tooltip id="updateNowBtn" showTooltips={showTooltips} inline>
            <button
              onClick={handleStartUpdate}
              disabled={downloading}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-900/30 flex items-center gap-2 transition-all hover:scale-105"
            >
              {downloading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  DESCARGANDO ({progress}%)
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  ACTUALIZAR AHORA
                </>
              )}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;
