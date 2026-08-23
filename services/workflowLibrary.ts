/**
 * ---------------------------------------------------------------------------
 *  Biblioteca de workflows
 * ---------------------------------------------------------------------------
 *  Carga los workflows de `public/workflows/`, los registra con su mapeo
 *  propuesto y decide cual se usa para cada tipo de generacion.
 *
 *  Dos decisiones que conviene dejar escritas:
 *
 *  1. Se sirven desde `public/` y se piden con `fetch`. Es lo unico que
 *     funciona IGUAL en escritorio y en navegador sin plugins ni permisos: en
 *     modo navegador no hay sistema de ficheros, y anadir un plugin de Tauri
 *     obligaria a recompilar el binario y a mantener dos caminos.
 *
 *  2. El mapeo que el usuario haya corregido NO se pisa al recargar. La
 *     propuesta automatica solo se aplica la primera vez que se ve un
 *     workflow, o cuando su grafo ha cambiado de verdad. Si se regenerase en
 *     cada arranque, cada correccion duraria hasta el siguiente reinicio.
 * ---------------------------------------------------------------------------
 */

import {
  registerWorkflow,
  requireApiFormat,
  suggestMapping,
  validateMapping,
  detectFormat,
  type RegisteredWorkflow,
  type ApiWorkflow,
} from './workflowRegistry';
import { loadWorkflowsFromDB, saveWorkflowToDB } from './db';

/** Tipos de generacion que pueden tener workflow propio. */
export type GenerationKind = 'sprite' | 'modelSheet' | 'world' | 'tileset';

export const GENERATION_KIND_LABELS: Record<GenerationKind, string> = {
  sprite: 'Sprites y objetos',
  modelSheet: 'Hoja de modelo (giro)',
  world: 'Mundos y fondos',
  tileset: 'Tilesets',
};

export const SLOTS_KEY = 'omni-workflow-slots';

export type WorkflowSlotValue = {
  fileName: string;
  jsonStr: string;
} | null;

export type WorkflowSlots = Record<string, WorkflowSlotValue>;

export interface WorkflowIndexEntry {
  file: string;
  name: string;
  nodes: number;
  model: string | null;
  loras: string[];
  hasNegativeBranch: boolean;
}

/**
 * LoRAs que saben dar varias vistas del mismo personaje en UNA generacion.
 *
 * No es una lista cerrada de modelos: es un patron sobre el NOMBRE del fichero,
 * que se comprueba en tiempo de ejecucion contra lo que el usuario tenga
 * cargado. Un LoRA nuevo que se llame "xyz-turnaround" entra solo.
 *
 * Existe porque se midio que el giro no se consigue por prompt: con semilla
 * fija y tres redacciones distintas, Z-Image Turbo devuelve siempre el mismo
 * perfil. Quien gira es el LoRA, no el texto.
 */
const TURNAROUND_LORA_HINTS = [
  // `charturn` a proposito, y no `charturner`: el fichero real de este equipo
  // se llama `charTurnBetaLora.safetensors`, donde "Turn" y "er" no van
  // seguidos. Con el prefijo entran tanto CharTurner como CharTurnBeta.
  'charturn',
  'turnaround',
  'turn_around',
  'character sheet',
  'charactersheet',
  'multiview',
  'multi_view',
  'model sheet',
  'modelsheet',
  '360',
];

/** Comprueba si un grafo trae un LoRA capaz de girar al sujeto. */
export function hasTurnaroundLora(workflow: ApiWorkflow): { yes: boolean; lora: string | null } {
  for (const node of Object.values(workflow)) {
    const nombre = (node as any)?.inputs?.lora_name;
    if (typeof nombre !== 'string') {
      continue;
    }
    const limpio = nombre.toLowerCase().replace(/[-\s]+/g, '_');
    if (TURNAROUND_LORA_HINTS.some((h) => limpio.includes(h.replace(/[-\s]+/g, '_')))) {
      return { yes: true, lora: nombre };
    }
  }
  return { yes: false, lora: null };
}

/** Lee el manifiesto. Devuelve lista vacia si aun no se ha generado. */
export async function loadWorkflowIndex(): Promise<WorkflowIndexEntry[]> {
  try {
    const res = await fetch('workflows/index.json', { cache: 'no-cache' });
    if (!res.ok) {
      return [];
    }
    const json = await res.json();
    return Array.isArray(json?.workflows) ? json.workflows : [];
  } catch {
    // Sin indice la aplicacion sigue funcionando con el workflow de siempre.
    return [];
  }
}

/** Descarga un workflow suelto de la carpeta. */
export async function loadWorkflowFile(file: string): Promise<ApiWorkflow | null> {
  try {
    const res = await fetch(`workflows/${file}`, { cache: 'no-cache' });
    if (!res.ok) {
      return null;
    }
    const json = await res.json();
    return detectFormat(json) === 'api' ? (json as ApiWorkflow) : null;
  } catch {
    return null;
  }
}

/** Huella del grafo, para saber si cambio sin comparar el JSON entero. */
function fingerprint(workflow: ApiWorkflow): string {
  return Object.entries(workflow)
    .map(([id, n]) => `${id}:${(n as any).class_type}:${Object.keys((n as any).inputs ?? {}).join(',')}`)
    .sort()
    .join('|');
}

export interface LibraryEntry extends RegisteredWorkflow {
  /** Fichero del que salio, o null si lo importo el usuario a mano. */
  file: string | null;
  /** Huella del grafo cuando se propuso el mapeo. */
  fingerprint: string;
  /** El mapeo lo corrigio una persona: no volver a proponerlo. */
  mappingEdited?: boolean;
}

/**
 * Sincroniza la carpeta con lo guardado y devuelve la biblioteca completa.
 *
 * Es idempotente: llamarla dos veces no duplica nada ni pierde correcciones.
 */
export async function ensureLibrary(): Promise<LibraryEntry[]> {
  const guardados = (await loadWorkflowsFromDB()) as LibraryEntry[];
  return guardados;
}

/** Guarda un mapeo corregido por una persona, marcandolo para no pisarlo. */
export async function saveEditedMapping(entry: LibraryEntry, mapping: LibraryEntry['mapping']): Promise<LibraryEntry> {
  const actualizado: LibraryEntry = {
    ...entry,
    mapping,
    mappingEdited: true,
    updatedAt: new Date().toISOString(),
  };
  await saveWorkflowToDB(actualizado);
  return actualizado;
}

/**
 * Que workflow usa cada cosa.
 *
 * La clave es UNA POR ACCION, no por familia. Al principio se agruparon Idle,
 * Walk, Attack, Jump, T-Pose y Static Object en una sola ranura "sprite", y era
 * justo lo contrario de lo que hace falta: el objetivo es poder probar que
 * modelo hace mejor CADA accion y quedarse con el que gano. Un modelo que borda
 * un Idle puede hacer un Attack pesimo.
 *
 * La app NO decide cual funciono mejor: eso es un juicio que solo hace una
 * persona. Lo que hace es recordar con que se genero cada imagen -ver
 * `generationMeta.ts`- para que esa persona pueda decidir con datos.
 *


/** Clave de ranura para una accion de sprite. */
export function slotKeyForAction(action: string): string {
  return `sprite:${action}`;
}

/** Clave de ranura para una accion de animacion. */
export function slotKeyForAnimation(action: string): string {
  return `animation:${action}`;
}

/**
 * Clave de ranura para una perspectiva de mundo.
 *
 * Se usa la perspectiva y no la "tuberia A/B/C" del codigo porque las tuberias
 * son nomenclatura interna: quien usa la aplicacion elige "Vista Lateral 2.5D",
 * no "tuberia B". Y es la eleccion que de verdad cambia el tipo de imagen, asi
 * que es la que merece un workflow propio.
 */
export function slotKeyForPerspective(genre: string): string {
  return `world:${genre}`;
}

/** @deprecated Se conserva para leer ranuras guardadas con el formato de tuberias. */
export function slotKeyForWorld(pipeline: string): string {
  return `world:${pipeline}`;
}

/**
 * Registra un workflow subido a mano o reutiliza uno existente sin duplicar.
 */
export async function importUploadedWorkflow(name: string, json: unknown): Promise<LibraryEntry> {
  const grafo = requireApiFormat(json);
  const huella = fingerprint(grafo);
  const guardados = (await loadWorkflowsFromDB()) as LibraryEntry[];

  const existente = guardados.find(
    (w) => w.fingerprint === huella || w.name.trim().toLowerCase() === name.trim().toLowerCase()
  );

  if (existente) {
    const actualizado: LibraryEntry = {
      ...existente,
      name,
      workflow: grafo,
      fingerprint: huella,
      updatedAt: new Date().toISOString(),
    };
    await saveWorkflowToDB(actualizado);
    return actualizado;
  }

  const entrada: LibraryEntry = {
    ...registerWorkflow(name, grafo),
    file: null,
    fingerprint: huella,
  };
  await saveWorkflowToDB(entrada);
  return entrada;
}



export function loadSlots(): WorkflowSlots {
  try {
    const raw = JSON.parse(localStorage.getItem(SLOTS_KEY) ?? '{}');
    const cleaned: WorkflowSlots = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v === 'object' && typeof (v as any).jsonStr === 'string' && (v as any).jsonStr.trim()) {
        cleaned[k] = v as WorkflowSlotValue;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

export function saveSlots(slots: WorkflowSlots): void {
  localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
}

/** Asigna un valor de workflow (.json) a una ranura. */
export function assignSlot(slots: WorkflowSlots, key: string, value: WorkflowSlotValue): WorkflowSlots {
  const nuevas = { ...slots };
  if (value && value.jsonStr && value.jsonStr.trim()) {
    nuevas[key] = value;
  } else {
    delete nuevas[key];
  }
  saveSlots(nuevas);
  return nuevas;
}

/** Resuelve el workflow JSON cargado en una ranura, o null. */
export function resolveSlot(
  _library: any[],
  slots: WorkflowSlots,
  key: string,
): { workflow: any; mapping?: any } | null {
  const item = slots[key];
  if (!item || !item.jsonStr) return null;
  try {
    return { workflow: JSON.parse(item.jsonStr) };
  } catch {
    return null;
  }
}

/**
 * Busca en la biblioteca el workflow con el que se genero un asset.
 *
 * Es la pieza que convierte el registro en decision: el asset guarda el modelo
 * y los LoRAs con los que salio, y con eso se localiza que entrada de la
 * biblioteca los produjo, para poder asignarla a una accion de un clic.
 *
 * Se compara por modelo Y por el conjunto de LoRAs porque el modelo solo no
 * basta: dos workflows pueden compartir checkpoint y diferir en el LoRA, que es
 * precisamente la comparacion que se quiere hacer.
 */
export function findWorkflowForAsset(
  library: LibraryEntry[],
  meta: { model?: string; loras?: { name: string }[] } | null | undefined,
): LibraryEntry | null {
  if (!meta?.model) {
    return null;
  }

  const lorasAsset = new Set((meta.loras ?? []).map((l) => l.name));

  for (const entrada of library) {
    let modelo: string | null = null;
    const lorasWf = new Set<string>();

    for (const node of Object.values(entrada.workflow)) {
      const i = (node as any)?.inputs ?? {};
      if (typeof i.unet_name === 'string') modelo = i.unet_name;
      else if (typeof i.ckpt_name === 'string') modelo = modelo ?? i.ckpt_name;
      if (typeof i.lora_name === 'string') lorasWf.add(i.lora_name);
    }

    if (modelo !== meta.model || lorasWf.size !== lorasAsset.size) {
      continue;
    }
    if ([...lorasAsset].every((l) => lorasWf.has(l))) {
      return entrada;
    }
  }

  return null;
}

/**
 * Decide como generar una hoja de modelo con el workflow elegido.
 *
 * Es la bifurcacion que evita gastar cuatro generaciones para nada: si el
 * workflow no sabe girar, se dice ANTES en vez de componer una hoja inutil y
 * descubrirlo despues con `viewsLookIdentical`.
 */
export interface SheetStrategy {
  mode: 'single-pass' | 'multi-pass';
  lora: string | null;
  reason: string;
}

export function planModelSheet(entry: LibraryEntry | null): SheetStrategy {
  if (!entry) {
    return {
      mode: 'multi-pass',
      lora: null,
      reason:
        'No hay un workflow asignado a la hoja de modelo: se generan las vistas por separado y se componen.',
    };
  }

  const { yes, lora } = hasTurnaroundLora(entry.workflow);

  return yes
    ? {
        mode: 'single-pass',
        lora,
        reason: `"${entry.name}" trae el LoRA de giro "${lora}": las vistas salen en una sola generacion.`,
      }
    : {
        mode: 'multi-pass',
        lora: null,
        reason:
          `"${entry.name}" no trae ningun LoRA de giro. Se generaran las vistas por separado, ` +
          'pero si el modelo no sabe girar al sujeto saldran todas iguales.',
      };
}
