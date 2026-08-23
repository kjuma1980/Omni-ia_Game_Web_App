import React, { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertTriangle, Boxes, LogOut, RefreshCw } from 'lucide-react';
import { LoginPanel } from './components/LoginPanel';
import { WorldBrowser } from './components/WorldBrowser';
import { EditorShell } from './components/EditorShell';
import { Toasts } from './components/Toasts';
import { useHealth } from './api/hooks';
import { getServices } from './state/services';
import { useEditorStore } from './state/editorStore';
import { API_BASE_URL } from './api/client';

/**
 * ---------------------------------------------------------------------------
 *  Creador de Mundos 2D / 2.5D  —  submodulo de Omni IA Game
 * ---------------------------------------------------------------------------
 *  Punto de entrada unico. Se monta dentro de la pestana ASSETS, subpestana
 *  MUNDOS, y es completamente autonomo: su propio cliente de datos, su propia
 *  sesion y su propia base de datos. No lee ni escribe el estado de la
 *  aplicacion base.
 * ---------------------------------------------------------------------------
 */

/** Cliente de datos aislado: no se comparte con el resto de la aplicacion. */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 10_000,
      },
    },
  });
}

/**
 * Clave donde `AuthScreen` deja el correo de la cuenta ya validada.
 *
 * Se IMPORTA en vez de repetir la cadena. Es la unica dependencia del modulo
 * hacia la aplicacion base, y es deliberada: sin ella habria dos literales que
 * tendrian que coincidir para siempre, y el dia que uno cambiase el enlace
 * dejaria de funcionar en silencio, cayendo al formulario sin explicar por que.
 */
import { OMNI_AUTH_EMAIL_KEY as CLAVE_CORREO } from '../../components/AuthScreen';

/**
 * Acuna una sesion del Creador 2D con la cuenta de Omni IA Game.
 *
 * UN SOLO INICIO DE SESION. `App.tsx` no pinta nada hasta haber validado la
 * cuenta contra el servidor en la nube, asi que cuando se llega hasta aqui el
 * correo ya esta comprobado y guardado. Pedir un segundo usuario y contrasena
 * no anadia seguridad: anadia una credencial mas que recordar.
 *
 * Devuelve `false` -y entonces se cae al formulario de siempre- cuando no hay
 * Tauri (modo navegador), cuando no hay correo guardado, o cuando el servicio
 * local rechaza el secreto. Ninguno de esos casos deja al usuario tirado: el
 * formulario sigue existiendo como salida.
 */
/** Por que no se pudo enlazar. `null` cuando si se pudo. */
type MotivoFallo = string | null;

async function sesionDesdeLaCuenta(): Promise<MotivoFallo> {
  // SE DEVUELVE EL MOTIVO, no un booleano. La primera version se tragaba
  // cualquier error y caia al formulario en silencio: el usuario veia un login
  // que no deberia existir y no habia forma de saber en cual de los cuatro
  // pasos habia fallado. Un fallo mudo cuesta mas de diagnosticar que el
  // problema que oculta.
  const invoke =
    (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  if (!invoke) {
    return 'No hay entorno de escritorio (modo navegador): no se puede leer el secreto de enlace.';
  }

  const correo =
    localStorage.getItem(CLAVE_CORREO) || sessionStorage.getItem(CLAVE_CORREO);
  if (!correo) {
    return `No hay correo de la cuenta guardado (clave "${CLAVE_CORREO}"). Cierra sesion y vuelve a entrar en Omni IA Game.`;
  }

  let secreto: string;
  try {
    secreto = (await invoke('creador2d_link_secret')) as string;
  } catch (e: any) {
    return `El comando creador2d_link_secret fallo: ${e?.message ?? String(e)}`;
  }
  if (!secreto) {
    return 'El secreto de enlace llego vacio. El servicio del Creador 2D aun no lo ha generado: cierra la aplicacion y vuelve a abrirla.';
  }

  try {
    await getServices().client.cloudSession(correo, secreto);
    return null;
  } catch (e: any) {
    return `El servicio rechazo la sesion para ${correo}: ${e?.message ?? String(e)}`;
  }
}

interface WorldForgeProps {
  /**
   * Cerrar el modulo. Lo aporta la aplicacion base para devolver al Generador
   * IA: el submodulo no conoce las pestanas de quien lo aloja.
   */
  onSalir?: () => void;
}

const WorldForgeInner: React.FC<WorldForgeProps> = ({ onSalir }) => {
  const health = useHealth();
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  /** Por que no se pudo entrar con la cuenta de Omni IA Game. */
  const [falloEnlace, setFalloEnlace] = useState<string | null>(null);

  const authStatus = useEditorStore((state) => state.authStatus);
  const username = useEditorStore((state) => state.username);
  const setAuth = useEditorStore((state) => state.setAuth);
  const setApiOnline = useEditorStore((state) => state.setApiOnline);
  const pushToast = useEditorStore((state) => state.pushToast);

  const apiOnline = health.data?.status === 'ok';

  useEffect(() => {
    setApiOnline(Boolean(apiOnline));
  }, [apiOnline, setApiOnline]);

  // Sesion persistida: se intenta rotar el refresh token una sola vez al montar.
  // Si no hay ninguna, se acuna a partir de la cuenta de Omni IA Game.
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const { client } = getServices();

      // LA CUENTA DE OMNI IA GAME MANDA, y se intenta SIEMPRE primero.
      //
      // La primera version restauraba antes la sesion local guardada y, si
      // valia, se daba por buena sin intentar el enlace. Consecuencia: quien
      // hubiera entrado alguna vez con las credenciales locales se quedaba
      // atado a `creador@creador2d.local` para siempre, y sus mundos no
      // colgaban de su cuenta real. El registro del backend lo dejo claro: la
      // ruta de enlace no se llamaba ni una sola vez.
      //
      // Ahora el orden es el correcto: la identidad de la aplicacion primero, y
      // la sesion guardada solo como red por si el enlace no es posible -modo
      // navegador, sin correo guardado, o servicio que rechaza-.
      const motivo = await sesionDesdeLaCuenta();
      if (cancelled) {
        return;
      }
      if (motivo === null) {
        setAuth('authenticated', null);
        setRestoring(false);
        return;
      }

      if (client.hasStoredSession) {
        const ok = await client.restore();
        if (cancelled) {
          return;
        }
        if (ok) {
          setAuth('authenticated', null);
          setRestoring(false);
          return;
        }
      }
      if (cancelled) {
        return;
      }

      if (motivo) {
        // Se deja a la vista y en la consola. Ver `MotivoFallo`.
        console.error('[Creador 2D] No se pudo enlazar con la cuenta:', motivo);
        setFalloEnlace(motivo);
      }

      setAuth(motivo === null ? 'authenticated' : 'anonymous', null);
      setRestoring(false);
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [setAuth]);

  /**
   * Cierra el modulo y devuelve al Generador IA.
   *
   * NO CIERRA LA SESION. Con un solo inicio de sesion no hay de donde salir: la
   * identidad es la de la cuenta de Omni IA Game, y revocarla aqui solo servia
   * para dejar al usuario mirando un formulario de credenciales que no deberia
   * existir. Salir del Creador 2D es salir de la herramienta, igual que se sale
   * de cualquier otra pestana.
   */
  const salir = () => {
    setActiveWorldId(null);
    onSalir?.();
  };

  if (health.isLoading || restoring) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-xs font-mono gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" /> Contactando con el servicio Creador 2D...
      </div>
    );
  }

  if (!apiOnline) {
    return <OfflineNotice onRetry={() => void health.refetch()} detail={health.error} />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 bg-slate-950/60">
        <Boxes className="w-4 h-4 text-cyan-400" />
        <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">
          Creador de Mundos 2D / 2.5D
        </h2>
        <span className="text-[9px] font-mono text-slate-600">
          {API_BASE_URL.replace(/^https?:\/\//, '')}
        </span>

        {username && (
          <span className="text-[10px] font-mono text-slate-500">{username}</span>
        )}

        <button
          type="button"
          onClick={salir}
          className="ml-auto flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-slate-500 hover:text-cyan-400 transition"
          title="Cerrar el Creador 2D y volver al Generador IA"
        >
          <LogOut className="w-3 h-3" />
          Volver al Generador IA
        </button>
      </header>

      <div className="flex-1 overflow-hidden relative">
        {authStatus !== 'authenticated' ? (
          <div className="h-full overflow-auto">
            {/* El formulario NO deberia aparecer: se entra con la cuenta de
                Omni IA Game. Si aparece es que el enlace fallo, y se dice por
                que en vez de dejar al usuario adivinando. */}
            {falloEnlace && (
              <div className="mx-auto mt-4 max-w-lg rounded-lg border border-amber-900/50 bg-amber-950/20 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  No se pudo entrar con tu cuenta de Omni IA Game
                </p>
                <p className="mt-2 text-[11px] font-mono leading-relaxed text-slate-300">
                  {falloEnlace}
                </p>
                <p className="mt-2 text-[10px] font-mono text-slate-500">
                  Puedes entrar con las credenciales de abajo mientras tanto.
                </p>
              </div>
            )}
            <LoginPanel onAuthenticated={() => setActiveWorldId(null)} />
          </div>
        ) : activeWorldId ? (
          <EditorShell
            worldId={activeWorldId}
            onBack={() => setActiveWorldId(null)}
            onOpenWorld={setActiveWorldId}
          />
        ) : (
          <WorldBrowser onOpen={setActiveWorldId} />
        )}

        <Toasts />
      </div>
    </div>
  );
};

/**
 * Arranca el backend a traves de Tauri.
 *
 * Devuelve `null` si no hay Tauri -modo navegador-, porque ahi no hay forma de
 * lanzar un proceso y hay que seguir contando con que alguien lo levante.
 */
async function arrancarBackend(): Promise<string | null> {
  const isWeb = typeof window !== 'undefined' && ((window as any).__OMNI_IS_WEB__ === true || !((window as any).__TAURI_INTERNALS__?.invoke));
  if (isWeb) return 'El Creador 2D está activo en modo cliente web';
  const invoke = (window as any).__TAURI_INTERNALS__?.invoke || (window as any).__TAURI__?.invoke;
  if (!invoke) {
    return null;
  }
  return invoke('launch_creador2d') as Promise<string>;
}

/**
 * Cartel de servicio caido.
 *
 * En la app de escritorio ofrece ARRANCARLO, porque el backend viaja dentro de
 * la instalacion con su propio Node y no hay nada que instalar. Los comandos de
 * consola solo se muestran en modo navegador, que es el unico caso en que el
 * usuario tiene de verdad que levantarlo a mano.
 */
const OfflineNotice: React.FC<{ onRetry: () => void; detail: unknown }> = ({ onRetry, detail }) => {
  const [arrancando, setArrancando] = React.useState(false);
  const [fallo, setFallo] = React.useState<string | null>(null);
  const isWeb = typeof window !== 'undefined' && ((window as any).__OMNI_IS_WEB__ === true || !((window as any).__TAURI_INTERNALS__?.invoke));
  const hayTauri = Boolean((window as any).__TAURI_INTERNALS__?.invoke) && !isWeb;

  /**
   * Arranque automatico al entrar en el modulo.
   *
   * Pedirle al usuario que pulse un boton para levantar un servicio interno es
   * pedirle que resuelva un detalle de implementacion que no deberia conocer.
   * Se intenta una sola vez -`intentado`- para no entrar en un bucle de
   * arranques si el backend no puede levantar: a partir de ahi queda el boton,
   * que pasa a ser un reintento manual y no el camino normal.
   */
  const intentado = React.useRef(false);

  React.useEffect(() => {
    if (!hayTauri || intentado.current) {
      return;
    }
    intentado.current = true;

    let vivo = true;
    setArrancando(true);
    arrancarBackend()
      .then(() => {
        if (vivo) onRetry();
      })
      .catch((e: any) => {
        if (vivo) setFallo(e?.message ?? String(e));
      })
      .finally(() => {
        if (vivo) setArrancando(false);
      });

    return () => {
      vivo = false;
    };
    // Sin dependencias a proposito: se ejecuta UNA vez al montar. `onRetry`
    // cambia en cada render del padre y meterlo aqui reiniciaria el arranque.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alArrancar = async () => {
    setArrancando(true);
    setFallo(null);
    try {
      await arrancarBackend();
      onRetry();
    } catch (e: any) {
      setFallo(e?.message ?? String(e));
    } finally {
      setArrancando(false);
    }
  };

  return (
  <div className="flex items-center justify-center h-full p-6">
    <div className="max-w-lg bg-slate-900/60 border border-amber-900/50 rounded-xl p-6 space-y-3">
      <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        {arrancando ? 'Preparando el Creador 2D' : 'Servicio Creador 2D no disponible'}
      </h3>

      <p className="text-[11px] font-mono text-slate-400 leading-relaxed">
        El editor de mundos usa su propio servicio, que se ejecuta aparte y no interfiere con
        ComfyUI, Ollama ni el TTS.
      </p>

      {hayTauri ? (
        <>
          {arrancando ? (
            <p className="text-[11px] font-mono text-cyan-400 leading-relaxed border border-cyan-900/50 bg-cyan-950/20 rounded p-3">
              Arrancando… La primera vez tarda unos segundos: crea su base de datos y siembra el
              catálogo de bloques. No hace falta instalar nada.
            </p>
          ) : (
            <button
              type="button"
              onClick={alArrancar}
              className="w-full flex items-center justify-center gap-1.5 bg-cyan-700 hover:bg-cyan-600 text-white text-[11px] font-bold uppercase tracking-wider py-2.5 rounded transition"
            >
              Reintentar el arranque
            </button>
          )}
          {fallo && (
            <p className="text-[10px] font-mono text-red-400 leading-relaxed border border-red-900/50 bg-red-950/30 rounded p-2">
              {fallo}
            </p>
          )}
        </>
      ) : (
        <div className="bg-black/50 border border-slate-800 rounded p-3 space-y-1">
          <p className="text-[10px] font-mono text-slate-500">
            En modo navegador hay que levantarlo a mano:
          </p>
          <pre className="text-[10px] font-mono text-cyan-300 whitespace-pre-wrap">{`cd creador2d-backend
npm install
npm run setup      # genera Prisma, migra y siembra
npm run start:dev  # API en http://127.0.0.1:4310`}</pre>
        </div>
      )}

      <p className="text-[10px] font-mono text-slate-600">
        Esperando en <span className="text-slate-400">{API_BASE_URL}/api/health</span>
        {detail ? ` — ${(detail as Error).message}` : ''}
      </p>

      <button
        type="button"
        onClick={onRetry}
        className="w-full flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold uppercase tracking-wider py-2 rounded transition"
      >
        <RefreshCw className="w-3 h-3" /> Reintentar
      </button>
    </div>
  </div>
  );
};

const WorldForge2D: React.FC<WorldForgeProps> = ({ onSalir }) => {
  const queryClient = useMemo(createQueryClient, []);

  return (
    <QueryClientProvider client={queryClient}>
      <WorldForgeInner onSalir={onSalir} />
    </QueryClientProvider>
  );
};

export default WorldForge2D;
