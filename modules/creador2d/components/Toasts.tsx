import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useEditorStore } from '../state/editorStore';

const ICONS = {
  info: Info,
  success: CheckCircle2,
  error: AlertTriangle,
} as const;

const STYLES = {
  info: 'border-cyan-500/40 bg-cyan-950/70 text-cyan-100',
  success: 'border-emerald-500/40 bg-emerald-950/70 text-emerald-100',
  error: 'border-red-500/40 bg-red-950/70 text-red-100',
} as const;

export const Toasts: React.FC = () => {
  const toasts = useEditorStore((state) => state.toasts);
  const dismissToast = useEditorStore((state) => state.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    // Los avisos se retiran solos: el usuario no deberia tener que cerrarlos.
    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismissToast(toast.id), toast.kind === 'error' ? 8000 : 4000),
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts, dismissToast]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-4 right-4 z-30 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2 rounded border px-3 py-2 text-xs font-mono shadow-lg backdrop-blur-sm max-w-sm ${STYLES[toast.kind]}`}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="opacity-60 hover:opacity-100 transition"
              aria-label="Cerrar aviso"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
