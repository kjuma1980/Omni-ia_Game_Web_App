/**
 * La pantalla que ata las cinco piezas del autoinstalador.
 *
 * Solo aparece si el usuario dijo que SI en el instalador. Encadena:
 *
 *   registro -> GPU -> paquete -> descarga -> extraccion -> ruta en Ajustes
 *
 * No pregunta rutas ni ofrece opciones: el usuario final es un profesor sin
 * conocimientos tecnicos, asi que hay un boton y ya. La carpeta de destino sale
 * de LOCALAPPDATA y no se negocia.
 *
 * El aviso de los modelos es OBLIGATORIO y no se puede saltar: ComfyUI portable
 * viene sin ningun checkpoint, y sin ese aviso el primer intento de generar
 * falla y parece que la aplicacion esta rota.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, Download, HardDrive, Loader2, PackageOpen, X } from 'lucide-react';
import {
  descargarPaquete,
  describirInstalacion,
  detectarGpu,
  escucharProgreso,
  extraerPaquete,
  leerPreferencia,
  marcarResuelto,
  resolverPaquete,
  type GpuDetectada,
  type PaqueteComfyUI,
} from '../services/comfyuiInstaller';

type Fase =
  | 'comprobando'
  | 'oculto'
  | 'sin-gpu'
  | 'listo'
  | 'descargando'
  | 'extrayendo'
  | 'hecho'
  | 'error';

interface Props {
  /** Se llama con la carpeta de ComfyUI ya extraida, para guardarla en Ajustes. */
  onInstalado: (ruta: string) => void;
  /**
   * Se llama cuando esta pantalla deja de pintarse, tanto si instalo como si
   * no habia nada que hacer. Sirve para encadenar la de Ollama detras en vez
   * de solapar dos ventanas modales.
   */
  onCerrado?: () => void;
}

const ComfyUIInstaller: React.FC<Props> = ({ onInstalado, onCerrado }) => {
  const [fase, setFase] = useState<Fase>('comprobando');
  const [gpu, setGpu] = useState<GpuDetectada | null>(null);
  const [paquete, setPaquete] = useState<PaqueteComfyUI | null>(null);
  const [rutas, setRutas] = useState({ destino: '', descarga: '' });
  const [pct, setPct] = useState(0);
  const [bajado, setBajado] = useState({ hecho: 0, total: 0 });
  const [rutaFinal, setRutaFinal] = useState('');
  const [error, setError] = useState('');

  // Se guarda para poder darse de baja al desmontar: sin esto, cerrar la
  // pantalla a mitad de descarga deja el oyente vivo emitiendo a un componente
  // que ya no existe.
  const bajaRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const pref = await leerPreferencia();
        // Sin respuesta en el registro no se molesta a nadie.
        if (!pref.respondida || !pref.quiere) {
          if (vivo) setFase('oculto');
          return;
        }
        if (vivo) setRutas({ destino: pref.destino, descarga: pref.descarga });

        const g = await detectarGpu();
        if (!vivo) return;
        setGpu(g);

        const p = await resolverPaquete(g);
        if (!vivo) return;
        setPaquete(p);
        setFase(p ? 'listo' : 'sin-gpu');
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
      bajaRef.current = await escucharProgreso((p) => {
        setPct(p.porcentaje);
        setBajado({ hecho: p.descargado, total: p.total });
      });

      const archivo = await descargarPaquete(paquete, rutas.descarga);

      setFase('extrayendo');
      const carpeta = await extraerPaquete(archivo, rutas.destino);

      setRutaFinal(carpeta);
      onInstalado(carpeta);
      await marcarResuelto();
      setFase('hecho');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFase('error');
    } finally {
      bajaRef.current?.();
      bajaRef.current = null;
    }
  }, [paquete, rutas, onInstalado]);

  /** Descartar: no se vuelve a preguntar, pero se puede instalar desde Ajustes. */
  const descartar = useCallback(async () => {
    await marcarResuelto();
    setFase('oculto');
  }, []);

  // Avisa a quien encadena detras. Va en un efecto y no dentro de `descartar`
  // porque a 'oculto' se llega por tres caminos: descartar, terminar, y no
  // haber nada que hacer.
  useEffect(() => {
    if (fase === 'oculto') onCerrado?.();
  }, [fase, onCerrado]);

  if (fase === 'oculto' || fase === 'comprobando') return null;

  const gb = (b: number) => `${(b / 1024 / 1024).toFixed(0)} MB`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl text-slate-200">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800">
          <PackageOpen className="w-5 h-5 text-purple-400" />
          <h2 className="font-bold tracking-wide">Instalación de ComfyUI</h2>
          {(fase === 'listo' || fase === 'sin-gpu' || fase === 'error') && (
            <button
              onClick={descartar}
              className="ml-auto text-slate-500 hover:text-slate-300"
              title="Ahora no"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-6 py-5 space-y-4">
          {fase === 'sin-gpu' && gpu && (
            <>
              <div className="flex items-start gap-3">
                <Cloud className="w-5 h-5 text-sky-400 mt-0.5 shrink-0" />
                <div className="space-y-1 text-sm">
                  {describirInstalacion(gpu, null).map((l, i) => (
                    <p key={i} className={i === 0 ? 'font-medium' : 'text-slate-400'}>
                      {l}
                    </p>
                  ))}
                </div>
              </div>
              <button
                onClick={descartar}
                className="w-full bg-purple-600 hover:bg-purple-500 rounded-lg py-2.5 text-sm font-medium"
              >
                Entendido, usaré la nube
              </button>
            </>
          )}

          {fase === 'listo' && gpu && paquete && (
            <>
              <div className="flex items-start gap-3">
                <HardDrive className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                <div className="space-y-1 text-sm">
                  {describirInstalacion(gpu, paquete).map((l, i) => (
                    <p key={i} className={i === 0 ? 'font-medium' : 'text-slate-400'}>
                      {l}
                    </p>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500 break-all">Se instalará en {rutas.destino}</p>
              <div className="flex gap-2">
                <button
                  onClick={instalar}
                  className="flex-1 bg-purple-600 hover:bg-purple-500 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Instalar ComfyUI ({paquete.tamanoLegible})
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
              <p className="text-sm font-medium">Descargando ComfyUI…</p>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>
                  {gb(bajado.hecho)} de {gb(bajado.total)}
                </span>
                <span>{pct}%</span>
              </div>
              <p className="text-xs text-slate-500">
                Si se corta la conexión, la descarga se reanuda donde se quedó. Puedes seguir usando
                la aplicación mientras tanto.
              </p>
            </>
          )}

          {fase === 'extrayendo' && (
            <div className="flex items-center gap-3 py-2">
              <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
              <p className="text-sm">Descomprimiendo el paquete… esto tarda un par de minutos.</p>
            </div>
          )}

          {fase === 'hecho' && (
            <>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium">ComfyUI instalado y configurado.</p>
                  <p className="text-slate-400 break-all text-xs">{rutaFinal}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-200/90">
                  Viene sin modelos. Para poder generar tienes que colocar al menos un modelo en la
                  carpeta <span className="font-mono">models/checkpoints</span> de esa ruta. Hasta
                  entonces, genera con OmniDeploy o con un proveedor en la nube.
                </p>
              </div>
              <button
                onClick={() => setFase('oculto')}
                className="w-full bg-purple-600 hover:bg-purple-500 rounded-lg py-2.5 text-sm font-medium"
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
                  <p className="text-sm font-medium">No se pudo completar la instalación.</p>
                  <p className="text-xs text-slate-400 break-words">{error}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {paquete && (
                  <button
                    onClick={instalar}
                    className="flex-1 bg-purple-600 hover:bg-purple-500 rounded-lg py-2.5 text-sm font-medium"
                  >
                    Reintentar
                  </button>
                )}
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

export default ComfyUIInstaller;
