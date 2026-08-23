/**
 * ---------------------------------------------------------------------------
 *  Metadatos de generacion
 * ---------------------------------------------------------------------------
 *  Hasta ahora un asset guardaba `{ id, imageUrl, prompt, timestamp, mode }` y
 *  nada mas. Es decir: al generar cientos de imagenes probando modelos, LoRAs y
 *  ajustes, cuando salia una excelente NO habia forma de saber que la produjo
 *  ni de reproducirla. La experimentacion no acumulaba: cada prueba se perdia
 *  en cuanto empezaba la siguiente.
 *
 *  Estos datos se leen del workflow YA INYECTADO, es decir del que realmente se
 *  envio a ComfyUI, no de la configuracion de la interfaz. Esa distincion
 *  importa: si un dia una inyeccion falla en silencio, el registro dira lo que
 *  de verdad ocurrio y no lo que se pretendia.
 * ---------------------------------------------------------------------------
 */

export interface LoraRef {
  name: string;
  /** Peso sobre el modelo. */
  strengthModel: number;
  /** Peso sobre el codificador de texto. */
  strengthClip: number;
}

export interface GenerationMeta {
  /** Semilla efectiva. Es lo primero que hace falta para reproducir. */
  seed?: number;
  /** Nombre del fichero del modelo de difusion o del checkpoint. */
  model?: string;
  /** LoRAs aplicados, en el orden de la cadena. */
  loras: LoraRef[];
  /** Codificadores de texto cargados. */
  clip: string[];
  vae?: string;
  sampler?: string;
  scheduler?: string;
  steps?: number;
  cfg?: number;
  denoise?: number;
  width?: number;
  height?: number;
  /** Proveedor que atendio la peticion: comfyui, openai, gemini... */
  provider?: string;
  /** Prompts tal y como se enviaron, ya adaptados al workflow. */
  positivePrompt?: string;
  negativePrompt?: string;
  /** Momento de la generacion, en ISO. */
  createdAt: string;
  /**
   * Aviso cuando el workflow no permitia aprovechar algo. Se guarda con el
   * asset porque explica por que una imagen salio como salio.
   */
  notes: string[];
}

type ApiNode = { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } };
type ApiWorkflow = Record<string, ApiNode>;

function primerValor(nodes: ApiNode[], ...claves: string[]): string | undefined {
  for (const n of nodes) {
    for (const k of claves) {
      const v = n.inputs?.[k];
      if (typeof v === 'string' && v.trim()) {
        return v;
      }
    }
  }
  return undefined;
}

/**
 * Extrae del workflow enviado todo lo necesario para repetir la generacion.
 *
 * Se busca por CLASE de nodo y no por identificador, porque cada usuario monta
 * su grafo a su manera y los identificadores no significan nada entre
 * workflows distintos.
 */
export function extractMeta(
  workflow: ApiWorkflow | null | undefined,
  extras: Partial<GenerationMeta> = {},
): GenerationMeta {
  const meta: GenerationMeta = {
    loras: [],
    clip: [],
    createdAt: new Date().toISOString(),
    notes: [],
    ...extras,
  };

  if (!workflow || typeof workflow !== 'object') {
    return meta;
  }

  const nodes = Object.values(workflow).filter(
    (n): n is ApiNode => Boolean(n) && typeof n === 'object' && 'class_type' in n,
  );
  const de = (re: RegExp) => nodes.filter((n) => re.test(n.class_type));

  // --- Modelo -------------------------------------------------------------
  meta.model =
    primerValor(de(/^UNETLoader$/), 'unet_name') ??
    primerValor(de(/CheckpointLoader/), 'ckpt_name') ??
    primerValor(de(/^DiffusionModelLoader|UnetLoaderGGUF/), 'unet_name', 'model_name') ??
    meta.model;

  meta.vae = primerValor(de(/^VAELoader$/), 'vae_name') ?? meta.vae;

  // --- Codificadores de texto ---------------------------------------------
  for (const n of de(/CLIPLoader|DualCLIPLoader|TripleCLIPLoader|QuadrupleCLIPLoader/)) {
    for (const [k, v] of Object.entries(n.inputs)) {
      if (/clip_name/i.test(k) && typeof v === 'string' && v.trim()) {
        meta.clip.push(v);
      }
    }
  }

  // --- LoRAs --------------------------------------------------------------
  // Se recorren todos: una cadena puede apilar varios y el orden importa.
  for (const n of de(/Lora/i)) {
    const nombre = typeof n.inputs.lora_name === 'string' ? n.inputs.lora_name : null;
    if (!nombre) {
      continue;
    }
    const sm = n.inputs.strength_model;
    const sc = n.inputs.strength_clip;
    meta.loras.push({
      name: nombre,
      strengthModel: typeof sm === 'number' ? sm : 1,
      strengthClip: typeof sc === 'number' ? sc : typeof sm === 'number' ? sm : 1,
    });
  }

  // --- Muestreo -----------------------------------------------------------
  const sampler = de(/KSampler|SamplerCustom/)[0];
  if (sampler) {
    const i = sampler.inputs;
    if (typeof i.seed === 'number') meta.seed = i.seed;
    else if (typeof i.noise_seed === 'number') meta.seed = i.noise_seed;
    if (typeof i.steps === 'number') meta.steps = i.steps;
    if (typeof i.cfg === 'number') meta.cfg = i.cfg;
    if (typeof i.denoise === 'number') meta.denoise = i.denoise;
    if (typeof i.sampler_name === 'string') meta.sampler = i.sampler_name;
    if (typeof i.scheduler === 'string') meta.scheduler = i.scheduler;
  }

  // La semilla puede vivir en un nodo aparte si el grafo usa un guider.
  if (meta.seed === undefined) {
    for (const n of nodes) {
      const s = n.inputs?.seed ?? n.inputs?.noise_seed;
      if (typeof s === 'number') {
        meta.seed = s;
        break;
      }
    }
  }

  // --- Tamano -------------------------------------------------------------
  const latente = nodes.find(
    (n) => /Empty.*Latent/i.test(n.class_type) && typeof n.inputs.width === 'number',
  );
  if (latente) {
    meta.width = latente.inputs.width as number;
    meta.height = latente.inputs.height as number;
  }

  return meta;
}

/** Resumen de una linea para la interfaz. */
export function summarizeMeta(meta: GenerationMeta): string {
  const partes: string[] = [];
  if (meta.model) partes.push(meta.model.replace(/\.(safetensors|ckpt|gguf)$/i, ''));
  if (meta.loras.length > 0) {
    partes.push(
      meta.loras.map((l) => `${l.name.replace(/\.safetensors$/i, '')} @${l.strengthModel}`).join(' + '),
    );
  }
  if (meta.seed !== undefined) partes.push(`seed ${meta.seed}`);
  if (meta.steps !== undefined) partes.push(`${meta.steps} pasos`);
  if (meta.cfg !== undefined) partes.push(`cfg ${meta.cfg}`);
  if (meta.width && meta.height) partes.push(`${meta.width}x${meta.height}`);
  return partes.join(' · ') || 'sin metadatos';
}
