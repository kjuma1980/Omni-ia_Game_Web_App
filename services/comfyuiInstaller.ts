/**
 * Resuelve qué paquete de ComfyUI hay que descargar para este equipo.
 *
 * La versión NO se fija en el código: se pregunta al repositorio oficial cada
 * vez, de modo que se instala «la que exista en el momento» sin tener que
 * tocar nada cuando publiquen una nueva.
 *
 * El repositorio publica CUATRO variantes y no son intercambiables: bajar la de
 * NVIDIA en un portátil Intel son 2 GB tirados y un ComfyUI que no arranca. Por
 * eso todo empieza por la GPU detectada.
 */

const API_RELEASES = 'https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest';

/** Lo que devuelve el comando `detectar_gpu` de Rust. */
export interface GpuDetectada {
  fabricante: 'nvidia' | 'amd' | 'intel' | 'ninguna';
  nombre: string;
  /** Sufijo del paquete. Vacío si no hay GPU aprovechable. */
  variante: string;
  todas: string[];
}

export interface PaqueteComfyUI {
  version: string;
  nombre: string;
  url: string;
  bytes: number;
  /** Para enseñárselo al usuario antes de que acepte una descarga larga. */
  tamanoLegible: string;
}

function invoke(): ((cmd: string, args?: any) => Promise<any>) | null {
  const w = window as any;
  return w.__TAURI__?.invoke || w.__TAURI_INTERNALS__?.invoke || null;
}

/** Consulta el hardware. Solo funciona en la aplicación de escritorio. */
export async function detectarGpu(): Promise<GpuDetectada> {
  const inv = invoke();
  if (!inv) {
    return { fabricante: 'ninguna', nombre: 'Modo navegador', variante: '', todas: [] };
  }
  return (await inv('detectar_gpu')) as GpuDetectada;
}

function legible(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

/**
 * Elige el paquete que corresponde a la GPU detectada.
 *
 * Devuelve `null` cuando no hay GPU aprovechable: en ese equipo la opción de
 * instalar ComfyUI **no debe ofrecerse**, porque descargaría dos gigas para
 * nada. Lanza si el repositorio no publica la variante esperada, que es mejor
 * que descargar la equivocada en silencio.
 */
export async function resolverPaquete(gpu: GpuDetectada): Promise<PaqueteComfyUI | null> {
  if (!gpu.variante) {
    return null;
  }

  const res = await fetch(API_RELEASES, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) {
    throw new Error(`No se pudo consultar la versión de ComfyUI (HTTP ${res.status}).`);
  }
  const datos = await res.json();

  // Nombre exacto publicado: `ComfyUI_windows_portable_<variante>.7z`. Se busca
  // la coincidencia exacta y no «el que contenga nvidia», porque existe también
  // `_nvidia_cu126` y elegir entre los dos por casualidad no es elegir.
  const esperado = `ComfyUI_windows_portable_${gpu.variante}.7z`;
  const activo = (datos.assets || []).find((a: any) => a.name === esperado);

  if (!activo) {
    const hay = (datos.assets || []).map((a: any) => a.name).join(', ');
    throw new Error(
      `El repositorio oficial no publica "${esperado}" en la versión ${datos.tag_name}. ` +
        `Disponibles: ${hay || 'ninguno'}.`,
    );
  }

  return {
    version: datos.tag_name,
    nombre: activo.name,
    url: activo.browser_download_url,
    bytes: activo.size,
    tamanoLegible: legible(activo.size),
  };
}

/**
 * Texto para la pantalla de elección: qué se va a descargar y por qué.
 *
 * Incluye SIEMPRE el aviso de los modelos. ComfyUI portable viene sin ningún
 * checkpoint —es la decisión tomada: se instala tal cual sale del repositorio
 * oficial—, así que sin ese aviso el primer intento de generar falla y parece
 * que la aplicación está rota.
 */
/** Respuesta dada en el instalador y rutas de trabajo, leidas de Rust. */
export interface PreferenciaComfyUI {
  quiere: boolean;
  respondida: boolean;
  destino: string;
  descarga: string;
}

/**
 * Que respondio el usuario al instalar.
 *
 * `respondida: false` significa que no hay clave en el registro —ejecucion en
 * desarrollo, o copiada a mano—, y entonces NO se pregunta nada: la pantalla
 * solo aparece cuando el usuario pidio ComfyUI de forma explicita.
 */
export async function leerPreferencia(): Promise<PreferenciaComfyUI> {
  const inv = invoke();
  if (!inv) {
    return { quiere: false, respondida: false, destino: '', descarga: '' };
  }
  return (await inv('preferencia_comfyui')) as PreferenciaComfyUI;
}

/** Deja de pedirlo en cada arranque, tanto si se instalo como si se descarto. */
export async function marcarResuelto(): Promise<void> {
  const inv = invoke();
  if (inv) await inv('marcar_comfyui_resuelto');
}

/** Progreso emitido por Rust mientras baja el paquete. */
export interface ProgresoDescarga {
  descargado: number;
  total: number;
  porcentaje: number;
}

/**
 * Se suscribe al progreso de la descarga.
 *
 * Devuelve la funcion para darse de baja. Import dinamico para que en modo
 * navegador —sin Tauri— no reviente al cargar el modulo.
 */
export async function escucharProgreso(
  alCambiar: (p: ProgresoDescarga) => void,
): Promise<() => void> {
  if (!invoke()) return () => {};
  try {
    const { listen } = await import('@tauri-apps/api/event');
    return await listen<ProgresoDescarga>('comfyui-descarga', (e) => alCambiar(e.payload));
  } catch {
    return () => {};
  }
}

/**
 * Descarga el paquete. Reanuda sola si ya habia un intento a medias, asi que
 * volver a llamarla tras un corte es la forma correcta de reintentar.
 */
export async function descargarPaquete(p: PaqueteComfyUI, carpeta: string): Promise<string> {
  const inv = invoke();
  if (!inv) throw new Error('La descarga solo funciona en la aplicacion de escritorio.');
  const destino = `${carpeta}\\${p.nombre}`;
  await inv('descargar_comfyui', { url: p.url, destino, totalEsperado: p.bytes });
  return destino;
}

/** Extrae el `.7z` y devuelve la carpeta de ComfyUI que hay dentro. */
export async function extraerPaquete(archivo: string, destino: string): Promise<string> {
  const inv = invoke();
  if (!inv) throw new Error('La extraccion solo funciona en la aplicacion de escritorio.');
  return (await inv('extraer_comfyui', { archivo, destino })) as string;
}

export function describirInstalacion(gpu: GpuDetectada, p: PaqueteComfyUI | null): string[] {
  if (!p) {
    return [
      'No se ha detectado una tarjeta gráfica compatible en este equipo.',
      `Detectado: ${gpu.nombre}.`,
      'Puedes generar igualmente con OmniDeploy o con proveedores en la nube.',
    ];
  }
  return [
    `Tarjeta detectada: ${gpu.nombre}.`,
    `Se descargará ComfyUI ${p.version} (${p.tamanoLegible}) desde el repositorio oficial.`,
    'Viene sin modelos: para poder generar tendrás que colocar al menos uno en la carpeta models/checkpoints.',
  ];
}
