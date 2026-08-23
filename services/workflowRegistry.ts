/**
 * ---------------------------------------------------------------------------
 *  Registro de workflows: el mapeo es dato, no codigo
 * ---------------------------------------------------------------------------
 *  Hasta ahora la aplicacion ADIVINABA que nodo era cada cosa mirando su
 *  `class_type`. Hay 43 comprobaciones de ese estilo repartidas en cinco
 *  ficheros:
 *
 *      services/localService.ts .......... 17
 *      services/aiProvider.ts ............ 13
 *      services/workflowCapabilities.ts ... 5
 *      services/generationMeta.ts ......... 4
 *      services/workflowRembg.ts .......... 4
 *
 *  Cada una es una apuesta sobre como esta construido el grafo. Aciertan con
 *  los workflows habituales y fallan EN SILENCIO con cualquier otro, que es
 *  justo lo que se midio esta temporada: la resolucion no se inyectaba porque
 *  nadie tocaba el nodo de latente, y el prompt negativo no llego al modelo en
 *  373 de 373 generaciones.
 *
 *  Aqui se invierte el planteamiento. Un input NO se reconoce por su clase: se
 *  identifica por su posicion en el grafo, `{nodeId}.{inputKey}`, que es una
 *  cadena opaca y funciona para cualquier nodo -incluidos los de terceros y los
 *  identificadores de subgrafo tipo "34:27"-. Que significa cada uno se decide
 *  UNA vez y se guarda.
 *
 *  Diferencia deliberada con el proyecto del que se toma la idea: alli el
 *  humano SIEMPRE tiene que mapear a mano. Eso rompe la regla de que todo
 *  funcione con un solo clic para alguien sin experiencia tecnica. Aqui las
 *  heuristicas que ya existen no desaparecen: dejan de decidir y pasan a
 *  PROPONER (`suggestMapping`). El usuario normal no ve nada; cuando la
 *  propuesta falla, el mapeo es editable en vez de ser un fallo del codigo.
 * ---------------------------------------------------------------------------
 */

import { isEmptyImageLatent } from '../constants/imageSizing';

/** Papeles que la aplicacion sabe rellenar. */
export type WorkflowRole =
  | 'prompt'
  | 'negative'
  | 'seed'
  | 'steps'
  | 'cfg'
  | 'width'
  | 'height'
  | 'model'
  | 'lora'
  | 'loraStrength'
  | 'output';

export type ParameterType = 'string' | 'number' | 'boolean' | 'json';

export interface ParameterCandidate {
  /** `{nodeId}.{inputKey}`. Identificador canonico y opaco. */
  id: string;
  nodeId: string;
  inputKey: string;
  type: ParameterType;
  /**
   * Titulo que el usuario le puso al nodo en ComfyUI.
   *
   * SOLO para que un humano se oriente en la lista. Nunca decide nada por si
   * mismo: un nodo titulado "Negative" puede estar cableado como positivo.
   */
  nodeTitle: string;
  classType: string;
  defaultValue: unknown;
}

export interface OutputCandidate {
  nodeId: string;
  classType: string;
  nodeTitle: string;
}

/** Que parametro cumple cada papel. Valores: identificadores `nodeId.inputKey`. */
export type WorkflowMapping = Partial<Record<WorkflowRole, string>>;

export interface RegisteredWorkflow {
  id: string;
  name: string;
  /** El grafo en formato API, tal cual. */
  workflow: ApiWorkflow;
  mapping: WorkflowMapping;
  /** Papeles que se propusieron solos, para poder avisar de que son una suposicion. */
  suggested: WorkflowRole[];
  createdAt: string;
  updatedAt: string;
}

type ApiNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
};
export type ApiWorkflow = Record<string, ApiNode>;

export type WorkflowFormat = 'api' | 'ui' | 'desconocido';

/**
 * Distingue el formato API del formato de interfaz.
 *
 * Importa porque son incompatibles y se parecen: los dos son JSON de ComfyUI.
 * El de interfaz tiene `nodes` como array y guarda los valores en
 * `widgets_values`, sin el nombre del input; el de API es un mapa
 * `{nodeId: {class_type, inputs}}` y es el unico que acepta `/prompt`.
 *
 * Se comprueba de forma explicita porque, sin esto, pasar un grafo de interfaz
 * a `extractCandidates` devolveria una lista VACIA sin decir nada -las claves
 * `nodes`, `links` y `version` no tienen `class_type`, asi que se saltarian
 * todas- y el usuario veria un workflow "sin parametros" sin entender por que.
 */
export function detectFormat(json: unknown): WorkflowFormat {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return 'desconocido';
  }

  const obj = json as Record<string, unknown>;

  if (Array.isArray(obj.nodes)) {
    return 'ui';
  }

  const valores = Object.values(obj);
  if (valores.length > 0 && valores.every((n) => isValidNode(n))) {
    return 'api';
  }

  return 'desconocido';
}

export class FormatError extends Error {}

/**
 * Exige formato API y explica que hacer si no lo es.
 *
 * El mensaje importa: es lo unico que el usuario va a leer cuando su workflow
 * no entre.
 */
export function requireApiFormat(json: unknown): ApiWorkflow {
  const formato = detectFormat(json);

  if (formato === 'api') {
    return json as ApiWorkflow;
  }

  if (formato === 'ui') {
    throw new FormatError(
      'Este workflow esta guardado en formato de interfaz. ComfyUI solo ejecuta el formato API: ' +
        'abrelo en ComfyUI y usa "Workflow > Export (API)", o activa "Dev mode" en los ajustes ' +
        'para que aparezca "Save (API Format)".',
    );
  }

  throw new FormatError('El fichero no parece un workflow de ComfyUI.');
}

/** Una referencia a otro nodo en formato API es `[nodeId, indiceDeSalida]`. */
function isNodeReference(value: unknown): value is [string, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    (typeof value[0] === 'string' || typeof value[0] === 'number')
  );
}

function inferType(value: unknown): ParameterType | null {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value && typeof value === 'object') return 'json';
  return null;
}

function nodeLabel(nodeId: string, node: ApiNode): string {
  return node._meta?.title?.trim() || node.class_type || `Nodo ${nodeId}`;
}

function isValidNode(value: unknown): value is ApiNode {
  return Boolean(value) && typeof value === 'object' && 'class_type' in (value as object);
}

/**
 * Saca todos los inputs que se pueden rellenar, sin mirar de que clase es el
 * nodo.
 *
 * El criterio es puramente estructural: un input es candidato si su valor es un
 * LITERAL. Si es una referencia `[nodeId, slot]` significa que ya viene cableado
 * desde otro nodo, y sobrescribirlo romperia el grafo.
 */
export function extractCandidates(workflow: ApiWorkflow | null | undefined): ParameterCandidate[] {
  if (!workflow || typeof workflow !== 'object') {
    return [];
  }

  const salida: ParameterCandidate[] = [];

  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!isValidNode(node) || !node.inputs) {
      continue;
    }

    for (const [inputKey, value] of Object.entries(node.inputs)) {
      if (isNodeReference(value) || value === null || value === undefined) {
        continue;
      }

      const type = inferType(value);
      if (!type) {
        continue;
      }

      salida.push({
        id: `${nodeId}.${inputKey}`,
        nodeId,
        inputKey,
        type,
        nodeTitle: nodeLabel(nodeId, node),
        classType: node.class_type,
        defaultValue: value,
      });
    }
  }

  return salida;
}

/**
 * Nodos terminales: los que nadie usa como entrada.
 *
 * Es donde acaba el grafo, asi que es donde esta el resultado. Tampoco hace
 * falta reconocer `SaveImage` por su nombre.
 */
export function extractOutputs(workflow: ApiWorkflow | null | undefined): OutputCandidate[] {
  if (!workflow || typeof workflow !== 'object') {
    return [];
  }

  const referenciados = new Set<string>();
  for (const node of Object.values(workflow)) {
    if (!isValidNode(node) || !node.inputs) {
      continue;
    }
    for (const value of Object.values(node.inputs)) {
      if (isNodeReference(value)) {
        referenciados.add(String(value[0]));
      }
    }
  }

  return Object.entries(workflow)
    .filter(([nodeId, node]) => isValidNode(node) && !referenciados.has(nodeId))
    .map(([nodeId, node]) => ({
      nodeId,
      classType: node.class_type,
      nodeTitle: nodeLabel(nodeId, node),
    }));
}

/** Localiza el muestreador, que es de donde cuelga casi toda la configuracion. */
function findSampler(workflow: ApiWorkflow): [string, ApiNode] | null {
  const entradas = Object.entries(workflow).filter(([, n]) => isValidNode(n));

  // Primero uno que tenga las dos ramas de condicionado: es el que decide.
  const conRamas = entradas.find(
    ([, n]) => 'positive' in (n.inputs ?? {}) && 'negative' in (n.inputs ?? {}),
  );
  if (conRamas) {
    return conRamas;
  }

  return entradas.find(([, n]) => /KSampler|SamplerCustom|Guider/i.test(n.class_type)) ?? null;
}

/**
 * Sigue un cable hacia atras hasta encontrar un nodo que tenga el input pedido.
 *
 * Hace falta porque entre el muestreador y el nodo de texto puede haber
 * intermediarios -`ConditioningZeroOut`, `ConditioningCombine`, `FluxGuidance`-
 * y el texto esta mas arriba en la cadena.
 */
function traceBack(
  workflow: ApiWorkflow,
  desde: unknown,
  inputBuscado: string,
  profundidad = 0,
): string | null {
  if (!isNodeReference(desde) || profundidad > 12) {
    return null;
  }

  const nodeId = String(desde[0]);
  const node = workflow[nodeId];
  if (!isValidNode(node) || !node.inputs) {
    return null;
  }

  if (typeof node.inputs[inputBuscado] === 'string') {
    return nodeId;
  }

  for (const value of Object.values(node.inputs)) {
    const encontrado = traceBack(workflow, value, inputBuscado, profundidad + 1);
    if (encontrado) {
      return encontrado;
    }
  }

  return null;
}

/**
 * Propone que parametro cumple cada papel.
 *
 * Es una PROPUESTA, no una verdad: se guarda para que el usuario la corrija si
 * hace falta. Se prefiere siempre la senal estructural -que nodo alimenta la
 * entrada `negative` del muestreador- sobre el nombre de la clase o el titulo,
 * porque la estructura no miente y el titulo si: un nodo puede llamarse
 * "Negative Prompt" y estar cableado al positivo.
 */
export function suggestMapping(workflow: ApiWorkflow | null | undefined): {
  mapping: WorkflowMapping;
  suggested: WorkflowRole[];
} {
  const mapping: WorkflowMapping = {};

  if (!workflow || typeof workflow !== 'object') {
    return { mapping, suggested: [] };
  }

  const nodes = Object.entries(workflow).filter(([, n]) => isValidNode(n));

  // --- Prompt positivo y negativo, por cableado ------------------------------
  const sampler = findSampler(workflow);
  if (sampler) {
    const [, nodoSampler] = sampler;

    const idPositivo = traceBack(workflow, nodoSampler.inputs?.positive, 'text');
    const idNegativo = traceBack(workflow, nodoSampler.inputs?.negative, 'text');

    if (idPositivo) mapping.prompt = `${idPositivo}.text`;
    // Si ambas ramas llegan al MISMO nodo de texto, el grafo no tiene negativo
    // de verdad (suele ser un ConditioningZeroOut compartido). Mapearlo haria
    // que escribir en el negativo cambiase el positivo.
    if (idNegativo && idNegativo !== idPositivo) mapping.negative = `${idNegativo}.text`;

    // --- Muestreo ------------------------------------------------------------
    const i = nodoSampler.inputs ?? {};
    const idSampler = sampler[0];
    if (typeof i.seed === 'number') mapping.seed = `${idSampler}.seed`;
    else if (typeof i.noise_seed === 'number') mapping.seed = `${idSampler}.noise_seed`;
    if (typeof i.steps === 'number') mapping.steps = `${idSampler}.steps`;
    if (typeof i.cfg === 'number') mapping.cfg = `${idSampler}.cfg`;
  }

  // Si no hubo muestreador o no llevaba semilla, se busca en cualquier nodo:
  // los grafos con guider la sacan a un `RandomNoise` aparte.
  if (!mapping.seed) {
    for (const [nodeId, node] of nodes) {
      if (typeof node.inputs?.seed === 'number') {
        mapping.seed = `${nodeId}.seed`;
        break;
      }
      if (typeof node.inputs?.noise_seed === 'number') {
        mapping.seed = `${nodeId}.noise_seed`;
        break;
      }
    }
  }

  // Sin muestreador tampoco hay texto localizado por cableado. Se cae al
  // criterio antiguo -el primer nodo con `text`- para no quedarse sin nada.
  if (!mapping.prompt) {
    const conTexto = nodes.filter(([, n]) => typeof n.inputs?.text === 'string');
    if (conTexto[0]) mapping.prompt = `${conTexto[0][0]}.text`;
    if (conTexto[1]) mapping.negative = `${conTexto[1][0]}.text`;
  }

  // --- Tamano: solo latentes de imagen vacios --------------------------------
  // Se reutiliza `isEmptyImageLatent`, ya comprobada contra los 60 nodos con
  // width+height del ComfyUI del usuario: deja fuera LatentUpscale, LatentCrop
  // y todos los Empty*Video*.
  const latente = nodes.find(
    ([, n]) => isEmptyImageLatent(n.class_type) && typeof n.inputs?.width === 'number',
  );
  if (latente) {
    mapping.width = `${latente[0]}.width`;
    mapping.height = `${latente[0]}.height`;
  }

  // --- Modelo ----------------------------------------------------------------
  for (const [nodeId, node] of nodes) {
    if (mapping.model) break;
    if (typeof node.inputs?.unet_name === 'string') mapping.model = `${nodeId}.unet_name`;
    else if (typeof node.inputs?.ckpt_name === 'string') mapping.model = `${nodeId}.ckpt_name`;
  }

  // --- LoRA ------------------------------------------------------------------
  const lora = nodes.find(([, n]) => typeof n.inputs?.lora_name === 'string');
  if (lora) {
    mapping.lora = `${lora[0]}.lora_name`;
    if (typeof lora[1].inputs?.strength_model === 'number') {
      mapping.loraStrength = `${lora[0]}.strength_model`;
    }
  }

  // --- Salida ----------------------------------------------------------------
  const salidas = extractOutputs(workflow);
  const imagen = salidas.find((s) => /save|preview|image/i.test(s.classType));
  if (imagen ?? salidas[0]) {
    mapping.output = (imagen ?? salidas[0]).nodeId;
  }

  return { mapping, suggested: Object.keys(mapping) as WorkflowRole[] };
}

function coerce(type: ParameterType, valor: unknown, porDefecto: unknown): unknown {
  switch (type) {
    case 'number': {
      const n = Number(valor);
      return Number.isFinite(n) ? n : Number(porDefecto ?? 0);
    }
    case 'boolean':
      if (typeof valor === 'boolean') return valor;
      if (typeof valor === 'string') return valor.toLowerCase() === 'true';
      return Boolean(valor);
    case 'json':
      if (typeof valor === 'string') {
        try {
          return JSON.parse(valor);
        } catch {
          return porDefecto;
        }
      }
      return valor;
    case 'string':
    default:
      return String(valor);
  }
}

export class MappingError extends Error {}

/**
 * Aplica los valores sobre una COPIA del grafo.
 *
 * Si el nodo o el input mapeado ya no existe -porque el usuario edito el
 * workflow por fuera- se lanza un error con nombre y sitio. Fallar aqui de
 * forma ruidosa es justo lo contrario de lo que pasaba antes, cuando una
 * heuristica que no encontraba su nodo seguia adelante y la generacion salia
 * con el tamano por defecto o sin negativo, sin decir nada.
 */
export function applyMapping(
  workflow: ApiWorkflow,
  mapping: WorkflowMapping,
  values: Partial<Record<WorkflowRole, unknown>>,
): ApiWorkflow {
  const copia: ApiWorkflow = JSON.parse(JSON.stringify(workflow));

  for (const [role, valor] of Object.entries(values) as [WorkflowRole, unknown][]) {
    if (valor === undefined || valor === null) {
      continue;
    }

    const destino = mapping[role];
    if (!destino) {
      // Papel sin mapear: no es un error. Un workflow sin nodo de negativo
      // simplemente no admite negativo, y ya se avisa en la interfaz.
      continue;
    }

    // El identificador es `{nodeId}.{inputKey}`, y el nodeId puede llevar dos
    // puntos si viene de un subgrafo ("34:27.text"), asi que se parte por el
    // ULTIMO punto y no por el primero.
    const corte = destino.lastIndexOf('.');
    if (corte < 1) {
      throw new MappingError(`El papel "${role}" apunta a "${destino}", que no tiene la forma nodo.entrada.`);
    }

    const nodeId = destino.slice(0, corte);
    const inputKey = destino.slice(corte + 1);
    const node = copia[nodeId];

    if (!isValidNode(node) || !node.inputs) {
      throw new MappingError(
        `El papel "${role}" apunta al nodo ${nodeId}, que ya no existe en el workflow. Vuelve a revisar el mapeo.`,
      );
    }

    if (!(inputKey in node.inputs)) {
      throw new MappingError(
        `El nodo ${nodeId} (${node.class_type}) ya no tiene la entrada "${inputKey}". Vuelve a revisar el mapeo.`,
      );
    }

    if (isNodeReference(node.inputs[inputKey])) {
      throw new MappingError(
        `La entrada "${inputKey}" del nodo ${nodeId} esta cableada desde otro nodo: sobrescribirla romperia el grafo.`,
      );
    }

    node.inputs[inputKey] = coerce(inferType(node.inputs[inputKey]) ?? 'string', valor, node.inputs[inputKey]);
  }

  return copia;
}

/**
 * Registra un workflow con su mapeo propuesto, listo para guardar.
 *
 * Rechaza el formato de interfaz con un mensaje que explica como exportarlo,
 * en vez de admitirlo y quedarse sin parametros.
 */
export function registerWorkflow(name: string, workflow: unknown, id?: string): RegisteredWorkflow {
  const grafo = requireApiFormat(workflow);
  const { mapping, suggested } = suggestMapping(grafo);
  const ahora = new Date().toISOString();

  return {
    id: id ?? `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    workflow: grafo,
    mapping,
    suggested,
    createdAt: ahora,
    updatedAt: ahora,
  };
}

/**
 * Comprueba que un mapeo guardado sigue siendo valido contra su grafo.
 *
 * Se usa antes de generar, para poder avisar en la interfaz en vez de fallar a
 * mitad de una cola.
 */
export function validateMapping(
  workflow: ApiWorkflow,
  mapping: WorkflowMapping,
): { ok: boolean; problemas: string[] } {
  const problemas: string[] = [];

  for (const [role, destino] of Object.entries(mapping) as [WorkflowRole, string][]) {
    if (!destino || role === 'output') {
      continue;
    }

    const corte = destino.lastIndexOf('.');
    const nodeId = destino.slice(0, corte);
    const inputKey = destino.slice(corte + 1);
    const node = workflow[nodeId];

    if (!isValidNode(node)) {
      problemas.push(`${role}: el nodo ${nodeId} ya no existe.`);
    } else if (!node.inputs || !(inputKey in node.inputs)) {
      problemas.push(`${role}: el nodo ${nodeId} (${node.class_type}) no tiene la entrada "${inputKey}".`);
    }
  }

  if (mapping.output && !isValidNode(workflow[mapping.output])) {
    problemas.push(`output: el nodo ${mapping.output} ya no existe.`);
  }

  return { ok: problemas.length === 0, problemas };
}
