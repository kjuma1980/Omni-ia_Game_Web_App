/**
 * Instalacion de Ollama y del modelo de lenguaje.
 *
 * Componente APARTE del de ComfyUI y no una pestana mas dentro de el, porque
 * la eleccion es independiente: se puede querer generar imagenes en la nube y
 * escribir los dialogos en local, o al reves.
 *
 * Dos pasos separados, y el segundo se puede aplazar:
 *   1. Ollama    -> 1,5 GB
 *   2. El modelo -> 7 GB, y "Despues" es una respuesta perfectamente valida
 *
 * Obligar a esperar 8,5 GB antes de ver la aplicacion funcionando es la forma
 * mas rapida de que alguien la desinstale.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, BrainCircuit, CheckCircle2, Download, Loader2, X } from 'lucide-react';
import {
  MODELO_POR_DEFECTO,
  MODELO_TAMANO,
  descargarModelo,
  descargarOllama,
  escucharProgresoModelo,
  instalarOllama,
  leerPreferenciaOllama,
  marcarOllamaResuelto,
  resolverPaqueteOllama,
  type PaqueteOllama,
} from '../services/ollamaInstaller';
import { escucharProgreso } from '../services/comfyuiInstaller';

type Fase =
  | 'comprobando'
  | 'oculto'
  | 'listo'
  | 'descargando'
  | 'instalando'
  | 'ofrecer-modelo'
  | 'bajando-modelo'
  | 'hecho'
  | 'error';

interface Props {
  /** Se llama con el nombre del modelo cuando queda descargado y usable. */
  onModeloListo: (modelo: string) => void;
}

const OllamaInstaller: React.FC<Props> = ({ onModeloListo }) => {
  const [fase, setFase] = useState<Fase>('comprobando');
  const [paquete, setPaquete] = useState<PaqueteOllama | null>(null);
  const [carpeta, setCarpeta] = useState('');
  // Eligio ejecutar el modelo en su equipo. Si no, se instala Ollama para
  // hablar con los modelos en la nube y NO se descargan 7 GB.
  const [modeloLocal, setModeloLocal] = useState(false);
  const [pct, setPct] = useState(0);
  const [detalle, setDetalle] = useState('');
  const [error, setError] = useState('');
  const bajaRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const pref = await leerPreferenciaOllama();
        if (!pref.respondida || !pref.quiere) {
          if (vivo) setFase('oculto');
          return;
        }
        if (vivo) {
          setCarpeta(pref.descarga);
          setModeloLocal(pref.modeloLocal);
        }

        // Ya lo tenia de antes: no se vuelven a bajar 1,5 GB.
        if (pref.yaInstalado) {
          // Y si ademas eligio la nube, no hay nada que hacer en este equipo.
          if (vivo) {
            if (!pref.modeloLocal) {
              void marcarOllamaResuelto();
              setFase('oculto');
            } else {
              setFase('ofrecer-modelo');
            }
          }
          return;
        }

        const p = await resolverPaqueteOllama();
        if (!vivo) return;
        setPaquete(p);
        setFase('listo');
      } catch (e) {
        if (vivo) {
          setError(e instanceof Error ? e.message : String(e));
          setFase('error');
        }
      }
    })();
    return () => {
      vivo = false;
      bajaRef.current?.();
    };
  }, []);

  const instalar = useCallback(async () => {
    if (!paquete) return;
    setError('');
    setFase('descargando');
    try {
      bajaRef.current = await escucharProgreso((p) => setPct(p.porcentaje));
      const archivo = await descargarOllama(paquete, carpeta);
      bajaRef.current?.();
      bajaRef.current = null;

      setFase('instalando');
      await instalarOllama(archivo);

      // Quien eligio la nube ya ha terminado: tiene Ollama, que es lo que
      // necesita para hablar con los modelos remotos, y no se le ofrecen 7 GB
      // que dijo explicitamente que no queria.
      if (!modeloLocal) {
        await marcarOllamaResuelto();
        setFase('hecho');
        return;
      }
      setFase('ofrecer-modelo');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFase('error');
    } finally {
      bajaRef.current?.();
      bajaRef.current = null;
    }
  }, [paquete, carpeta]);

  const bajarModelo = useCallback(async () => {
    setError('');
    setPct(0);
    setFase('bajando-modelo');
    try {
      bajaRef.current = await escucharProgresoModelo((p) => {
        setPct(p.porcentaje);
        setDetalle(p.linea);
      });
      await descargarModelo();
      onModeloListo(MODELO_POR_DEFECTO);
      await marcarOllamaResuelto();
      setFase('hecho');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFase('error');
    } finally {
      bajaRef.current?.();
      bajaRef.current = null;
    }
  }, [onModeloListo]);

  const descartar = useCallback(async () => {
    await marcarOllamaResuelto();
    setFase('oculto');
  }, []);

  if (fase === 'oculto' || fase === 'comprobando') return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl text-slate-200">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800">
          <BrainCircuit className="w-5 h-5 text-emerald-400" />
          <h2 className="font-bold tracking-wide">Textos y diálogos sin conexión</h2>
          {(fase === 'listo' || fase === 'ofrecer-modelo' || fase === 'error') && (
            <button onClick={descartar} className="ml-auto text-slate-500 hover:text-slate-300" title="Ahora no">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-6 py-5 space-y-4">
          {fase === 'listo' && paquete && (
            <>
              <p className="text-sm">
                Se instalará <span className="font-medium">Ollama {paquete.version}</span> desde el
                repositorio oficial. Es el motor que escribe diálogos, guiones y NPCs en tu propio
                equipo, sin cuenta ni pagos.
              </p>
              <p className="text-xs text-slate-500">
                El modelo de lenguaje se descarga después, y puedes dejarlo para más tarde.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={instalar}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Instalar Ollama ({paquete.tamanoLegible})
                </button>
                <button
                  onClick={descartar}
                  className="px-4 rounded-lg border border-slate-700 hover:bg-slate-800 text-sm text-slate-400"
                >
                  Ahora no
                </button>
              </div>
            </>
          )}

          {fase === 'descargando' && (
            <>
              <p className="text-sm font-medium">Descargando Ollama…</p>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-slate-400">{pct}% — si se corta, se reanuda donde se quedó.</p>
            </>
          )}

          {fase === 'instalando' && (
            <div className="flex items-center gap-3 py-2">
              <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
              <p className="text-sm">Instalando Ollama en segundo plano…</p>
            </div>
          )}

          {fase === 'ofrecer-modelo' && (
            <>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-sm">Ollama está listo. Falta el modelo de lenguaje.</p>
              </div>
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 text-xs space-y-1">
                <p>
                  <span className="text-slate-400">Modelo:</span>{' '}
                  <span className="font-mono">{MODELO_POR_DEFECTO}</span>
                </p>
                <p>
                  <span className="text-slate-400">Tamaño:</span> {MODELO_TAMANO}
                </p>
              </div>
              <p className="text-xs text-slate-500">
                Puedes dejarlo para después: hasta entonces los textos irán por Gemini, OpenAI o el
                servicio que tengas configurado.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={bajarModelo}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Descargar el modelo ({MODELO_TAMANO})
                </button>
                <button
                  onClick={descartar}
                  className="px-4 rounded-lg border border-slate-700 hover:bg-slate-800 text-sm text-slate-400"
                >
                  Después
                </button>
              </div>
            </>
          )}

          {fase === 'bajando-modelo' && (
            <>
              <p className="text-sm font-medium">
                Descargando <span className="font-mono">{MODELO_POR_DEFECTO}</span>…
              </p>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-slate-400 font-mono truncate">{detalle || `${pct}%`}</p>
              <p className="text-xs text-slate-500">
                Son {MODELO_TAMANO}. Ollama reanuda por su cuenta si se corta la conexión.
              </p>
            </>
          )}

          {fase === 'hecho' && (
            <>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium">Todo listo.</p>
                  <p className="text-slate-400 text-xs">
                    {modeloLocal ? (
                      <>
                        Ya puedes escribir diálogos y guiones sin conexión con{' '}
                        <span className="font-mono">{MODELO_POR_DEFECTO}</span>.
                      </>
                    ) : (
                      <>
                        Ollama está instalado y listo para usar modelos en la nube. Inicia sesión
                        con <span className="font-mono">ollama signin</span> o elige un modelo en
                        Ajustes. No se ha descargado ningún modelo a este equipo.
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setFase('oculto')}
                className="w-full bg-emerald-600 hover:bg-emerald-500 rounded-lg py-2.5 text-sm font-medium"
              >
                Continuar
              </button>
            </>
          )}

          {fase === 'error' && (
            <>
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">No se pudo completar.</p>
                  <p className="text-xs text-slate-400 break-words">{error}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={paquete ? instalar : bajarModelo}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg py-2.5 text-sm font-medium"
                >
                  Reintentar
                </button>
                <button
                  onClick={descartar}
                  className="px-4 rounded-lg border border-slate-700 hover:bg-slate-800 text-sm text-slate-400"
                >
                  Usar la nube
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default OllamaInstaller;
