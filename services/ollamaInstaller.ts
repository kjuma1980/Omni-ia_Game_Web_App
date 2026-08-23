/**
 * Instalacion de Ollama y del modelo de lenguaje que usa la aplicacion.
 *
 * Misma filosofia que `comfyuiInstaller.ts`: la version NO se fija en el
 * codigo, se pregunta al repositorio oficial cada vez. Y el usuario decide,
 * porque son 8,5 GB entre las dos piezas.
 *
 * Son DOS pasos separados a proposito:
 *   1. Ollama    -> 1,5 GB, instalador oficial silencioso.
 *   2. El modelo -> 7 GB, `ollama pull`, y se puede dejar para despues.
 *
 * Quien solo quiere probar la aplicacion no deberia esperar 8,5 GB antes de
 * ver nada.
 */

const API_RELEASES = 'https://api.github.com/repos/ollama/ollama/releases/latest';

/**
 * Modelo por defecto.
 *
 * Un solo sitio: el instalador y los ajustes de la aplicacion tienen que pedir
 * EL MISMO. Si divergen, se descargan 7 GB y la aplicacion sigue reclamando un
 * modelo que no existe.
 */
export const MODELO_POR_DEFECTO = 'gemma4:12b';

/** Peso aproximado, para poder avisar antes de empezar. */
export const MODELO_TAMANO = '7 GB';

export interface PreferenciaOllama {
  quiere: boolean;
  respondida: boolean;
  /** Quiere el modelo en su equipo. Falso = usara los modelos en la nube. */
  modeloLocal: boolean;
  yaInstalado: boolean;
  descarga: string;
}

export interface PaqueteOllama {
  version: string;
  nombre: string;
  url: string;
  bytes: number;
  tamanoLegible: string;
}

function invoke(): ((cmd: string, args?: any) => Promise<any>) | null {
  const w = window as any;
  return w.__TAURI__?.invoke || w.__TAURI_INTERNALS__?.invoke || null;
}

/** Que respondio el usuario, y si Ollama ya estaba en el equipo. */
export async function leerPreferenciaOllama(): Promise<PreferenciaOllama> {
  const inv = invoke();
  if (!inv) {
    return { quiere: false, respondida: false, modeloLocal: false, yaInstalado: false, descarga: '' };
  }
  const r = (await inv('preferencia_ollama')) as Record<string, any>;
  return {
    quiere: !!r.quiere,
    respondida: !!r.respondida,
    // Rust serializa en snake_case; se acepta tambien camelCase por si algun
    // dia cambia la convencion de serializacion.
    modeloLocal: r.modelo_local ?? r.modeloLocal ?? false,
    yaInstalado: r.ya_instalado ?? r.yaInstalado ?? false,
    descarga: r.descarga ?? '',
  };
}

/** Deja de pedirlo en cada arranque. */
export async function marcarOllamaResuelto(): Promise<void> {
  const inv = invoke();
  if (inv) await inv('marcar_ollama_resuelto');
}

/**
 * Resuelve el instalador oficial de Windows.
 *
 * Coincidencia exacta con `OllamaSetup.exe`: el repositorio publica tambien
 * varios `.zip` -amd64, rocm, arm64, mlx- y buscar "el que contenga windows"
 * elegiria uno de ellos, que no instala nada.
 */
export async function resolverPaqueteOllama(): Promise<PaqueteOllama> {
  const res = await fetch(API_RELEASES, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) {
    throw new Error(`No se pudo consultar la version de Ollama (HTTP ${res.status}).`);
  }
  const datos = await res.json();
  const activo = (datos.assets || []).find((a: any) => a.name === 'OllamaSetup.exe');
  if (!activo) {
    throw new Error(
      `El repositorio oficial no publica "OllamaSetup.exe" en la version ${datos.tag_name}.`,
    );
  }
  return {
    version: datos.tag_name,
    nombre: activo.name,
    url: activo.browser_download_url,
    bytes: activo.size,
    tamanoLegible: `${(activo.size / 1024 / 1024).toFixed(0)} MB`,
  };
}

/**
 * Descarga el instalador.
 *
 * Reutiliza `descargar_comfyui`, que pese al nombre es un descargador generico
 * de ficheros grandes con reanudacion. Se prefiere reutilizarlo a duplicar
 * noventa lineas de Rust que ya estan probadas contra cortes de red.
 */
export async function descargarOllama(p: PaqueteOllama, carpeta: string): Promise<string> {
  const inv = invoke();
  if (!inv) throw new Error('La descarga solo funciona en la aplicacion de escritorio.');
  const destino = `${carpeta}\\${p.nombre}`;
  await inv('descargar_comfyui', { url: p.url, destino, totalEsperado: p.bytes });
  return destino;
}

/** Ejecuta el instalador sin ventanas. Devuelve la ruta de `ollama.exe`. */
export async function instalarOllama(archivo: string): Promise<string> {
  const inv = invoke();
  if (!inv) throw new Error('La instalacion solo funciona en la aplicacion de escritorio.');
  return (await inv('instalar_ollama', { archivo })) as string;
}

/** Progreso de `ollama pull`. */
export interface ProgresoModelo {
  linea: string;
  porcentaje: number;
}

/** Se suscribe al progreso del modelo. Devuelve la funcion para darse de baja. */
export async function escucharProgresoModelo(
  alCambiar: (p: ProgresoModelo) => void,
): Promise<() => void> {
  if (!invoke()) return () => {};
  try {
    const { listen } = await import('@tauri-apps/api/event');
    return await listen<ProgresoModelo>('ollama-descarga', (e) => alCambiar(e.payload));
  } catch {
    return () => {};
  }
}

/** Descarga el modelo. Ollama reanuda por su cuenta si se corta. */
export async function descargarModelo(modelo = MODELO_POR_DEFECTO): Promise<string> {
  const inv = invoke();
  if (!inv) throw new Error('La descarga solo funciona en la aplicacion de escritorio.');
  return (await inv('descargar_modelo_ollama', { modelo })) as string;
}
