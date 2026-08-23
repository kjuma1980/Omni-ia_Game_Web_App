/**
 * Cliente de OmniDeploy: GPU remota del proveedor.
 *
 * Mismo modelo mental que ComfyDeploy —Deployment ID + API Key, encolar y
 * consultar—, pero contra el relay propio en `omni-api.fenixdev.cloud`. Ver
 * `auth-server/omnideploy/` y `omnideploy.md`.
 *
 * TODO PASA POR `proxy_request`: las credenciales viajan por el proceso de Rust
 * y no por `fetch`, de modo que no aparecen en las herramientas de desarrollo
 * del navegador ni en el trafico visible desde la interfaz.
 *
 * Aditivo: no toca ni un solo camino de los proveedores existentes.
 */

/**
 * Relay por defecto.
 *
 * Subdominio dedicado, y no `fenixdev.cloud` entero, aunque hoy sirvan el mismo
 * proceso: asi la lista blanca de Rust —donde tambien esta— no le abre de paso
 * el servidor de licencias si el relay tuviera un fallo de redireccion. Y el
 * dia que el relay se mude a un VPS, cambia una linea y no un dominio.
 */
export const OMNIDEPLOY_BASE = 'https://omni-api.fenixdev.cloud';

export interface OmniDeployCreds {
  deploymentId: string;
  apiKey: string;
}

export interface OmniDeployEstado {
  online: boolean;
  /** Esta generando ahora mismo. Ocupada NO es lo mismo que apagada. */
  busy: boolean;
  queueDepth: number;
  friendlyName?: string;
}

/** Fichero devuelto por el relay, ya en base64. */
export interface OmniDeploySalida {
  name: string;
  data: string;
  /** Que es: imagen, animacion, video, audio, modelo3d o texto. Lo dice el agente. */
  kind?: string | null;
  /** Tipo MIME declarado por el agente. Mejor que deducirlo de la extension. */
  mime?: string | null;
}

function invoke(): ((cmd: string, args?: any) => Promise<any>) | null {
  const w = window as any;
  return w.__TAURI__?.invoke || w.__TAURI_INTERNALS__?.invoke || null;
}

/**
 * Llama al relay a traves del proxy de Rust.
 *
 * Sin Tauri no hay proveedor: se lanza un error claro en vez de intentar un
 * `fetch` que la lista blanca no cubriria y que ademas dejaria la clave a la
 * vista.
 */
async function pedir<T>(ruta: string, cuerpo: Record<string, unknown>): Promise<T> {
  const inv = invoke();
  if (!inv) {
    throw new Error('OmniDeploy solo esta disponible en la aplicacion de escritorio.');
  }

  const maskedCuerpo = { ...cuerpo };
  if (maskedCuerpo.apiKey) maskedCuerpo.apiKey = '***' + String(maskedCuerpo.apiKey).slice(-4);
  console.log(`[OmniDeploy] 🌐 Solicitud a ${OMNIDEPLOY_BASE}${ruta}`, maskedCuerpo);

  const crudo = await inv('proxy_request', {
    url: `${OMNIDEPLOY_BASE}${ruta}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    payload: cuerpo,
  }).catch((err) => {
    console.error(`[OmniDeploy] ❌ Error en proxy_request hacia ${ruta}:`, err);
    throw err;
  });

  let datos: any;
  let texto = typeof crudo === 'string' ? crudo : '';

  if (texto.startsWith('data:')) {
    const coma = texto.indexOf(',');
    const carga = coma >= 0 ? texto.slice(coma + 1) : '';
    try {
      const bin = atob(carga);
      texto = new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    } catch {
      texto = '';
    }
    if (!texto.trim()) {
      throw new Error(
        'El relay devolvio una respuesta vacia. Suele significar que el servidor web ' +
          'intercepto la peticion antes de que llegara al relay.',
      );
    }
  }

  try {
    datos = texto ? JSON.parse(texto) : crudo;
  } catch {
    throw new Error(`El relay devolvio una respuesta ilegible: ${String(texto).slice(0, 160)}`);
  }
  if (datos?.ok === false) {
    console.error(`[OmniDeploy] ❌ El relay rechazó la petición en ${ruta}:`, datos.error);
    throw new Error(datos.error || 'El relay rechazo la peticion.');
  }
  return datos as T;
}

/**
 * Estado del proveedor.
 */
export async function omniDeployEstado(c: OmniDeployCreds): Promise<OmniDeployEstado> {
  console.log(`[OmniDeploy] 🔍 Consultando estado del host (Deployment: ${c.deploymentId})...`);
  const r = await pedir<{
    online: boolean;
    busy?: boolean;
    queue_depth: number;
    friendly_name?: string;
  }>('/api/omnideploy/status', { deploymentId: c.deploymentId, apiKey: c.apiKey });
  console.log(`[OmniDeploy] 📡 Estado del host:`, { online: r.online, busy: r.busy, cola: r.queue_depth, nombre: r.friendly_name });
  return {
    online: r.online,
    busy: Boolean(r.busy),
    queueDepth: r.queue_depth,
    friendlyName: r.friendly_name,
  };
}

/** Encola un trabajo. Devuelve su identificador y la posicion en cola. */
export async function omniDeployEncolar(
  c: OmniDeployCreds,
  inputs: Record<string, unknown>,
): Promise<{ jobId: string; posicion: number }> {
  console.log(`[OmniDeploy] 🚀 Encolando tarea [Tipo: ${inputs.tipo || 'desconocido'}, Servicio: ${inputs.servicio || 'general'}, Acción: ${inputs.accion || 'ninguna'}]...`);
  const r = await pedir<{ job_id: string; position: number }>('/api/omnideploy/queue', {
    deploymentId: c.deploymentId,
    apiKey: c.apiKey,
    inputs,
  });
  console.log(`[OmniDeploy] 📋 Trabajo encolado con éxito. Job ID: ${r.job_id} | Posición en cola: ${r.position}`);
  return { jobId: r.job_id, posicion: r.position };
}

/**
 * Espera a que termine un trabajo.
 */
export async function pollOmniDeployRun(
  c: OmniDeployCreds,
  jobId: string,
  intentos = 1800,
  alProgresar?: (estado: string, posicion: number) => void,
  signal?: AbortSignal,
): Promise<OmniDeploySalida[]> {
  console.log(`[OmniDeploy] ⏳ Iniciando seguimiento de Job ID: ${jobId} (intervalo 2s)...`);
  for (let i = 0; i < intentos; i += 1) {
    if (signal?.aborted) {
      console.warn(`[OmniDeploy] 🛑 Cancelación detectada por el usuario en Job ID: ${jobId}. Notificando al relay...`);
      await pedir(`/api/omnideploy/jobs/${jobId}/cancel`, {
        deploymentId: c.deploymentId,
        apiKey: c.apiKey,
      }).catch((e) => console.warn(`[OmniDeploy] Aviso cancelando trabajo:`, e));
      throw new Error('Operación cancelada por el usuario.');
    }

    const r = await pedir<{
      status: string;
      outputs: Array<{ name: string }>;
      error?: string;
      position: number;
    }>(`/api/omnideploy/jobs/${jobId}`, { deploymentId: c.deploymentId, apiKey: c.apiKey });

    if (i % 5 === 0 || r.status === 'success' || r.status === 'failed') {
      console.log(`[OmniDeploy] ⏱️ Polling #${i + 1} -> Estado: ${r.status} | Cola: ${r.position}`);
    }

    alProgresar?.(r.status, r.position);

    if (r.status === 'success') {
      console.log(`[OmniDeploy] 🎉 ¡Trabajo ${jobId} completado con éxito! Descargando ${r.outputs?.length || 0} archivo(s)...`);
      const salidas: OmniDeploySalida[] = [];
      for (const f of r.outputs || []) {
        console.log(`[OmniDeploy] 📥 Descargando archivo de salida: ${f.name}...`);
        const d = await pedir<{ name: string; data: string; kind?: string; mime?: string }>(
          `/api/omnideploy/jobs/${jobId}/file`,
          { deploymentId: c.deploymentId, apiKey: c.apiKey, name: f.name },
        );
        console.log(`[OmniDeploy] ✅ Archivo recibido: ${d.name} (${d.kind || d.mime || 'binario'})`);
        salidas.push({ name: d.name, data: d.data, kind: d.kind ?? null, mime: d.mime ?? null });
      }
      return salidas;
    }

    if (r.status === 'failed') {
      console.error(`[OmniDeploy] ❌ El trabajo ${jobId} falló en el host:`, r.error);
      throw new Error(r.error || 'El trabajo fallo en la GPU del proveedor.');
    }

    await new Promise((res) => setTimeout(res, 2000));
  }

  console.error(`[OmniDeploy] ⏰ Timeout: El trabajo ${jobId} no terminó en el tiempo límite.`);
  throw new Error(
    'El trabajo no termino a tiempo. Puede que haya mucha cola en la GPU del proveedor.',
  );
}

/**
 * Genera CUALQUIER COSA en la GPU del proveedor.
 *
 * El agente ejecuta ComfyUI, asi que puede producir lo mismo que ComfyUI:
 * imagenes, animaciones, video, musica, efectos y voces.
 *
 * SE MANDAN PARAMETROS Y UN TIPO, NUNCA EL GRAFO. Medido en produccion: al
 * enviar el workflow del cliente, el host lo rechazo con
 * `ckpt_name: 'z_image_turbo_bf16.safetensors' not in (list of length 29)`.
 * Es la consecuencia inevitable de mandar un grafo que nombra los modelos de
 * OTRA maquina: el cliente no sabe —ni tiene por que saber— que hay instalado
 * en el equipo del proveedor.
 *
 * Quien elige el grafo es el HOST, por tipo de trabajo, en su `agent.env`. Asi
 * el proveedor decide con que modelos trabaja su GPU y el cliente no puede
 * romperle nada.
 */
/**
 * Trae el workflow que el PROVEEDOR tiene cargado para este trabajo.
 *
 * Es la pieza que hace que OmniDeploy sea ComfyUI en otra maquina y no una
 * reimplementacion parecida. El cliente no tiene grafo -ni falta que le hace-,
 * asi que se lo pide al proveedor, y a partir de ahi TODO sigue el camino de
 * siempre: las mismas inyecciones que se aplicarian a un ComfyUI local, con las
 * opciones que el usuario haya marcado en su pestana, y el grafo terminado se
 * manda a generar.
 *
 * Ninguna logica de inyeccion se duplica al otro lado, que es la unica forma de
 * garantizar que lo remoto se comporte igual que lo local.
 */
export async function pedirWorkflowDelProveedor(
  creds: OmniDeployCreds,
  tipo: 'imagen' | 'mundos' | 'video' | 'voz' | 'musica' | 'sfx' | '3d',
  accion?: string,
): Promise<Record<string, any>> {
  const inputs: Record<string, unknown> = { tipo, pedir_workflow: true };
  if (accion) inputs.accion = accion;

  const { jobId } = await omniDeployEncolar(creds, inputs);
  const salidas = await pollOmniDeployRun(creds, jobId);
  const wf = salidas.find((s) => s.name === 'workflow.json') ?? salidas[0];
  if (!wf?.data) {
    throw new Error(
      'El proveedor no devolvio ningun workflow. Que abra Omni IA Game en su equipo ' +
        'y cargue el suyo en Ajustes.',
    );
  }

  // `atob` da bytes, no caracteres: un grafo con acentos o comillas tipograficas
  // se rompe si se lee como texto directamente.
  const bytes = Uint8Array.from(atob(wf.data), (c) => c.charCodeAt(0));
  const texto = new TextDecoder('utf-8').decode(bytes);
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error('El workflow que devolvio el proveedor no es un JSON valido.');
  }
}

export async function generarConOmniDeploy(
  creds: OmniDeployCreds,
  params: {
    prompt: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    seed?: number;
    /** Que se quiere producir. Solo se usa si no se manda grafo. */
    tipo?: 'imagen' | 'video' | 'voz' | 'musica' | 'sfx' | '3d';
    /**
     * Accion elegida en la interfaz: "Idle", "Static Object", "T-Pose"...
     *
     * Sirve para que el proveedor use el workflow que TENGA LIGADO a esa
     * accion, igual que hace la aplicacion cuando genera en local, y si no
     * tiene ninguno, su workflow general.
     */
    accion?: string;
    /** Pestana que lo pidio, para el registro de uso del proveedor. */
    servicio?: string;
    /**
     * Imagen de partida, tal como la manda la aplicacion: `data:image/...;base64,...`
     *
     * En Animacion es el fotograma que se anima y en Suite 3D la referencia de
     * la malla. Sin ella, un grafo de imagen-a-video no tiene de que partir y
     * produce cualquier cosa.
     */
    imagenInicial?: string;
    /**
     * TODO LO DEMAS QUE EL CLIENTE HAYA ELEGIDO EN SU PESTANA.
     *
     * La voz y el idioma en Voz; la duracion, la letra, el genero y si es
     * instrumental en Musica; el recorte de fondo y su modelo en Imagen. Cada
     * pestana tiene las suyas y no hay dos iguales, asi que viajan tal cual y
     * el agente aplica las que el grafo del proveedor admita.
     *
     * Los vacios no se mandan: un campo que no se eligio no debe pisar lo que
     * el workflow ya trae.
     */
    opciones?: Record<string, unknown>;
    /** Grafo de ComfyUI en formato API, tal cual esta cargado en la aplicacion. */
    workflowJson?: string | null;
    /**
     * Grafo YA MONTADO por la aplicacion, con el prompt, la resolucion, el
     * LoRA y el recorte ya inyectados: exactamente el mismo objeto que se
     * enviaria a un ComfyUI local. Es el camino normal, porque OmniDeploy ES
     * ComfyUI en otra maquina.
     */
    workflow?: Record<string, unknown> | null;
    signal?: AbortSignal;
  },
  alProgresar?: (estado: string, posicion: number) => void,
): Promise<OmniDeploySalida[]> {
  // Numeros SIEMPRE finitos. Un campo de resolucion vacio produce NaN, y
  // `JSON.stringify(NaN)` es `null`: al otro lado eso reventaba con
  // "int() argument must be ... not 'NoneType'". El `??` no lo atrapa porque
  // NaN no es ni null ni undefined.
  const num = (v: unknown, porDefecto: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : porDefecto;

  const inputs: Record<string, unknown> = {
    prompt: params.prompt,
    negative_prompt: params.negativePrompt ?? '',
    tipo: params.tipo ?? 'imagen',
  };

  if (params.accion) {
    inputs.accion = params.accion;
  }
  if (params.servicio) {
    inputs.servicio = params.servicio;
  }
  // LO QUE EL CLIENTE ELIGIO, y hasta ahora se quedaba en su equipo.
  if (params.imagenInicial) {
    inputs.imagen_inicial = params.imagenInicial;
  }
  for (const [clave, valor] of Object.entries(params.opciones ?? {})) {
    // Un campo que el usuario no toco no se manda: pisaria lo que el workflow
    // del proveedor ya trae puesto.
    if (valor === undefined || valor === null || valor === '') continue;
    if (typeof valor === 'number' && !Number.isFinite(valor)) continue;
    inputs[clave] = valor;
  }

  // Las dimensiones SOLO se mandan si quien llama las pide. Enviarlas siempre
  // con un valor por defecto hacia que el agente pisara la resolucion que el
  // grafo ya traia inyectada.
  if (typeof params.width === 'number' && Number.isFinite(params.width)) {
    inputs.width = params.width;
  }
  if (typeof params.height === 'number' && Number.isFinite(params.height)) {
    inputs.height = params.height;
  }
  if (typeof params.seed === 'number' && Number.isFinite(params.seed)) {
    inputs.seed = params.seed;
  }

  // El grafo ya montado tiene prioridad: es el camino normal, con el prompt y
  // la resolucion ya inyectados por quien llama.
  //
  // `workflow_listo` le dice al agente QUE NO LO TOQUE. Sin esa marca volveria
  // a sustituir prompt y dimensiones, pisando lo que la aplicacion acababa de
  // inyectar con cuidado.
  if (params.workflow) {
    inputs.workflow = params.workflow;
    inputs.workflow_listo = true;
  } else if (params.workflowJson) {
    try {
      inputs.workflow = JSON.parse(params.workflowJson);
    } catch {
      throw new Error(
        'El workflow cargado no es un JSON valido. Vuelve a exportarlo desde ComfyUI con ' +
          '"Save (API format)": el guardado normal tiene otra forma y ComfyUI no lo acepta.',
      );
    }
  }

  const { jobId } = await omniDeployEncolar(creds, inputs);
  // Sin numero propio: el de por defecto es una hora, y un video o un modelo
  // pesado en la GPU del proveedor pasan de largo los cinco minutos de antes.
  const salidas = await pollOmniDeployRun(creds, jobId, undefined, alProgresar, params.signal);
  if (!salidas.length) {
    throw new Error('La GPU del proveedor termino el trabajo pero no devolvio ningun fichero.');
  }
  return salidas;
}

/**
 * Genera TEXTO en el Ollama del proveedor.
 */
export async function generarTextoConOmniDeploy(
  creds: OmniDeployCreds,
  prompt: string,
  system?: string,
  alProgresar?: (estado: string, posicion: number) => void,
  servicio?: string,
  signal?: AbortSignal,
  model?: string,
): Promise<string> {
  const { jobId } = await omniDeployEncolar(creds, {
    tipo: 'texto',
    prompt,
    ...(model ? { model } : {}),
    ...(system ? { system } : {}),
    ...(servicio ? { servicio } : {}),
  });

  const salidas = await pollOmniDeployRun(creds, jobId, undefined, alProgresar, signal);
  const fichero = salidas.find((s) => s.name.toLowerCase().endsWith('.txt')) ?? salidas[0];
  if (!fichero) {
    throw new Error('El proveedor termino el trabajo pero no devolvio ningun texto.');
  }

  let text = '';
  try {
    const binario = atob(fichero.data);
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    text = new TextDecoder('utf-8').decode(bytes);
  } catch {
    text = typeof fichero.data === 'string' ? fichero.data : JSON.stringify(fichero.data);
  }
  return text;
}

/**
 * Convierte una salida del relay en data URL.
 *
 * Usa el tipo QUE DECLARO EL AGENTE, que sabe de donde salio el fichero:
 * ComfyUI agrupa sus salidas en images, gifs, videos, audio y mallas. Solo si
 * no viene declarado se recurre a deducirlo de la extension, que es adivinar.
 */
export function salidaADataUrl(s: OmniDeploySalida): string {
  if (s.data.startsWith('data:')) return s.data;
  if (s.mime) return `data:${s.mime};base64,${s.data}`;
  const n = s.name.toLowerCase();
  const tipo = n.endsWith('.jpg') || n.endsWith('.jpeg') ? 'image/jpeg'
    : n.endsWith('.webp') ? 'image/webp'
    : n.endsWith('.gif') ? 'image/gif'
    : n.endsWith('.mp4') ? 'video/mp4'
    : n.endsWith('.webm') ? 'video/webm'
    : n.endsWith('.wav') ? 'audio/wav'
    : n.endsWith('.mp3') ? 'audio/mpeg'
    : n.endsWith('.flac') ? 'audio/flac'
    : n.endsWith('.ogg') ? 'audio/ogg'
    : n.endsWith('.glb') ? 'model/gltf-binary'
    : n.endsWith('.gltf') ? 'model/gltf+json'
    : n.endsWith('.obj') ? 'model/obj'
    : 'image/png';
  return `data:${tipo};base64,${s.data}`;
}

/** Prueba de conexion para el boton de Ajustes. */
export async function probarOmniDeploy(
  deploymentId: string,
  apiKey: string,
): Promise<{ success: boolean; message: string }> {
  if (!deploymentId || !apiKey) {
    return { success: false, message: 'Faltan el Deployment ID o la API Key.' };
  }
  try {
    const e = await omniDeployEstado({ deploymentId, apiKey });
    if (!e.online) {
      return {
        success: false,
        message: `Credenciales correctas, pero la GPU de "${e.friendlyName ?? 'el proveedor'}" esta apagada ahora mismo.`,
      };
    }
    return {
      success: true,
      message: e.busy
        ? `Conectado a "${e.friendlyName ?? 'el proveedor'}". Generando ahora mismo; ${e.queueDepth} en cola.`
        : `Conectado a "${e.friendlyName ?? 'el proveedor'}". Libre, ${e.queueDepth} trabajo(s) en cola.`,
    };
  } catch (e: any) {
    // Tauri rechaza con una CADENA, no con un Error, asi que `e.message` es
    // undefined y el motivo real se perdia detras del texto generico. Con el
    // fallo de `payload` eso significaba ver "no se pudo contactar con el
    // relay" cuando el relay habia contestado perfectamente con un 401.
    return { success: false, message: motivo(e) };
  }
}

/** Saca el texto de un rechazo, venga como Error, como cadena o como objeto. */
function motivo(e: unknown): string {
  if (typeof e === 'string' && e.trim()) return e;
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === 'object') {
    const m = (e as any).message ?? (e as any).error;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return 'No se pudo contactar con el relay.';
}
