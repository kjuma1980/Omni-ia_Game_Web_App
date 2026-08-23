/**
 * ---------------------------------------------------------------------------
 *  Capacidades del workflow cargado
 * ---------------------------------------------------------------------------
 *  Omni IA Game no esta casado con un modelo. Cada usuario trae su workflow y
 *  su checkpoint favorito, y dos capacidades del prompt cambian por completo
 *  segun cual sea:
 *
 *  1. PESOS POR TERMINO — "(termino:1.4)". Funcionan en los codificadores tipo
 *     CLIP (SD 1.5, SDXL, SD3 con CLIP). NO funcionan en los basados en LLM:
 *     ComfyUI los desactiva explicitamente con `disable_weights=True` en flux,
 *     qwen, gemma, lumina2, hidream, ovis, ernie, gpt_oss, pixeldit y otros.
 *     Y no es que se ignoren sin mas: los parentesis y el numero siguen dentro
 *     del texto y llegan al modelo como caracteres literales, ensuciando una
 *     descripcion que esos modelos esperan en prosa.
 *
 *  2. PROMPT NEGATIVO. Depende de la guidance, no de que exista el nodo. Con
 *     cfg 1 la formula `uncond + cfg*(cond - uncond)` se reduce a `cond` y la
 *     rama negativa se cancela entera. Los modelos destilados -Turbo, Lightning,
 *     LCM, Z-Image Turbo- corren a cfg 1 por diseno, asi que en ellos el
 *     negativo no hace nada por muy bien cableado que este.
 *
 *  En vez de escribir el prompt para un modelo concreto, se INSPECCIONA el
 *  workflow y se adapta la salida. Asi el mismo codigo sirve para el Z-Image
 *  Turbo de este equipo y para el SDXL que traiga otro usuario.
 * ---------------------------------------------------------------------------
 */

/**
 * Dialecto que entiende el codificador del workflow.
 *
 * No basta con saber si los pesos se aplican: cambia la forma de escribir
 * entera. Un codificador CLIP se entrena con listas de etiquetas y trocea el
 * texto cada 77 tokens, asi que quiere frases cortas y densas con enfasis
 * explicito. Uno basado en un modelo de lenguaje lee el prompt como prosa -y en
 * el caso de Z-Image, literalmente como un mensaje de chat- y admite miles de
 * tokens, asi que quiere descripcion bien redactada y sin repeticiones.
 *
 * Escribir para uno y mandarselo al otro funciona, pero rinde la mitad.
 */
export interface PromptProfile {
  /** Como se redacta. */
  syntax: 'weighted-tags' | 'plain-prose';
  /** Con que se da importancia a una idea. */
  emphasis: 'weights' | 'ordering';
  /** Tokens que el codificador aprovecha antes de trocear o diluir. */
  usefulTokens: number;
  /** Explicacion para la interfaz. */
  label: string;
}

const PROFILE_TAGS: PromptProfile = {
  syntax: 'weighted-tags',
  emphasis: 'weights',
  // CLIP trocea cada 77 tokens; ComfyUI concatena los trozos, pero el enfasis
  // se diluye entre ellos. Dos bloques es el limite practico.
  usefulTokens: 150,
  label: 'CLIP: etiquetas cortas con pesos',
};

const PROFILE_PROSE: PromptProfile = {
  syntax: 'plain-prose',
  emphasis: 'ordering',
  // Los codificadores LLM admiten miles, pero pasado cierto punto el modelo
  // deja de atender al final. Es el limite que se vigila, no el tecnico.
  usefulTokens: 500,
  label: 'LLM: prosa, el orden da la importancia',
};

export interface WorkflowCapabilities {
  /** Los pesos `(termino:1.4)` se aplican de verdad. */
  supportsPromptWeights: boolean;
  /** El prompt negativo influye en el resultado. */
  supportsNegativePrompt: boolean;
  /** Guidance detectada, o null si no se encontro un muestreador. */
  cfg: number | null;
  /** Codificador detectado, para poder explicarlo en la interfaz. */
  encoder: string | null;
  /** Dialecto que hay que hablarle a este codificador. */
  profile: PromptProfile;
  /** Explicacion legible de por que se decidio asi. */
  notes: string[];
}

/**
 * Tipos de CLIP de ComfyUI que corresponden a codificadores basados en LLM.
 * Tomado de los modulos que pasan `disable_weights=True` en
 * `comfy/text_encoders/`. Si aparece uno nuevo, lo peor que ocurre es que se
 * asuma que soporta pesos, que es el comportamiento historico.
 */
const LLM_ENCODER_TYPES = new Set([
  'lumina2',
  'flux',
  'flux2',
  'qwen_image',
  'qwen35',
  'gemma4',
  'hidream',
  'hidream_o1',
  'ovis',
  'ernie',
  'gpt_oss',
  'pixeldit',
  'longcat_image',
  'ideogram4',
  'ace',
  'ace15',
  'lt',
  'ltxv',
  'mochi',
  'cosmos',
  'wan',
  'hunyuan_video',
  'chroma_radiance',
]);

/** Nombres de fichero que delatan un codificador LLM aunque falte el tipo. */
const LLM_ENCODER_FILES = [
  'qwen', 'gemma', 't5', 'umt5', 'llama', 'mistral', 'lumina', 'pile-t5', 'byt5',
];

type ApiNode = { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } };
type ApiWorkflow = Record<string, ApiNode>;

function isLink(value: unknown): value is [string, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string';
}

/**
 * Inspecciona el workflow en formato API y decide que puede y que no.
 *
 * Ante la duda se asume que SI soporta, que es el comportamiento historico de
 * la aplicacion: es preferible emitir un peso que se ignore a suprimir un
 * enfasis que si habria funcionado.
 */
export function detectCapabilities(workflow: ApiWorkflow | null | undefined): WorkflowCapabilities {
  const caps: WorkflowCapabilities = {
    supportsPromptWeights: true,
    supportsNegativePrompt: true,
    cfg: null,
    encoder: null,
    profile: PROFILE_TAGS,
    notes: [],
  };

  if (!workflow || typeof workflow !== 'object') {
    caps.notes.push('Sin workflow que inspeccionar: se asumen las capacidades completas.');
    return caps;
  }

  const entries = Object.entries(workflow);

  // --- 1. Guidance: decide si el negativo influye -----------------------------
  const sampler = entries.find(
    ([, node]) => typeof node?.inputs?.cfg === 'number' && /sampler|guider/i.test(node.class_type),
  );

  if (sampler) {
    const cfg = sampler[1].inputs.cfg as number;
    caps.cfg = cfg;

    if (cfg <= 1.05) {
      caps.supportsNegativePrompt = false;
      caps.notes.push(
        `El muestreador corre a cfg ${cfg}. Con guidance 1 la rama negativa se cancela matematicamente, asi que el prompt negativo no influye: todo lo importante debe ir en el positivo.`,
      );
    }
  }

  // Aunque la cfg lo permita, el negativo puede estar anulado en el grafo.
  if (caps.supportsNegativePrompt && sampler) {
    const negative = sampler[1].inputs.negative;
    if (isLink(negative)) {
      const target = workflow[negative[0]];
      if (target && /ConditioningZeroOut|ZeroOut/i.test(target.class_type)) {
        caps.supportsNegativePrompt = false;
        caps.notes.push(
          'La entrada negativa del muestreador esta conectada a un ConditioningZeroOut: el workflow anula el negativo a proposito.',
        );
      }
    }
  }

  // --- 2. Codificador: decide si los pesos se aplican -------------------------
  const clipLoader = entries.find(([, node]) =>
    /CLIPLoader|DualCLIPLoader|TripleCLIPLoader|QuadrupleCLIPLoader/i.test(node.class_type),
  );

  if (clipLoader) {
    const inputs = clipLoader[1].inputs;
    const tipo = typeof inputs.type === 'string' ? inputs.type.toLowerCase() : '';
    const ficheros = Object.entries(inputs)
      .filter(([key, value]) => /clip_name/i.test(key) && typeof value === 'string')
      .map(([, value]) => String(value).toLowerCase());

    caps.encoder = tipo || ficheros.join(' + ') || null;

    const porTipo = tipo && LLM_ENCODER_TYPES.has(tipo);
    const porFichero = ficheros.some((f) => LLM_ENCODER_FILES.some((hint) => f.includes(hint)));

    if (porTipo || porFichero) {
      caps.supportsPromptWeights = false;
      caps.notes.push(
        `El codificador de texto (${caps.encoder}) esta basado en un modelo de lenguaje. ComfyUI desactiva el ponderado por termino en estos, y los parentesis quedarian dentro del texto: se escribe en prosa.`,
      );
    }
  } else {
    // Un checkpoint clasico trae CLIP dentro y si admite pesos.
    const checkpoint = entries.find(([, node]) => /CheckpointLoader/i.test(node.class_type));
    if (checkpoint) {
      caps.encoder = 'checkpoint (CLIP incorporado)';
    }
  }

  // El dialecto se deriva de lo ya detectado: si el codificador no aplica
  // pesos es porque esta basado en un modelo de lenguaje, y entonces quiere
  // prosa. Es la misma senal leida para otra decision.
  caps.profile = caps.supportsPromptWeights ? PROFILE_TAGS : PROFILE_PROSE;

  return caps;
}

/**
 * Quita la sintaxis de pesos dejando el texto intacto.
 *
 * `(espada oxidada:1.4)` pasa a `espada oxidada`, y `((muy importante))` a
 * `muy importante`. Se aplica solo cuando el codificador no los soporta, de
 * modo que un usuario con SDXL conserva su enfasis tal cual.
 */
export function stripPromptWeights(text: string): string {
  if (!text) {
    return text;
  }

  let salida = text;

  // Primero TODOS los pesos, de dentro hacia fuera y hasta que no quede
  // ninguno. Mezclar este paso con el de los parentesis sueltos rompia el
  // anidamiento: en "((a:1.2):1.1)" se quitaban los parentesis externos antes
  // de leer su peso, y el ":1.1" se quedaba dentro del texto.
  for (let i = 0; i < 8; i += 1) {
    const antes = salida;
    salida = salida.replace(/\(([^()]*?):\s*-?\d+(?:\.\d+)?\s*\)/g, '$1');
    if (salida === antes) {
      break;
    }
  }

  // Y despues el enfasis por parentesis desnudos: ((muy importante)).
  for (let i = 0; i < 8; i += 1) {
    const antes = salida;
    salida = salida.replace(/\(([^()]+?)\)/g, '$1');
    if (salida === antes) {
      break;
    }
  }

  // Los dos puntos sueltos que quedan de un peso mal formado se llevan por
  // delante la frase si no se limpian.
  return salida
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .trim();
}

/**
 * Adapta un par de prompts a lo que el workflow admite de verdad.
 *
 * No inventa contenido: solo retira lo que no se puede aprovechar. Si el
 * negativo no influye se conserva igualmente -no molesta, y el usuario puede
 * cambiar de workflow sin perder lo que escribio-, pero se avisa por consola
 * para que se entienda por que un termino negativo no esta surtiendo efecto.
 */
export function adaptPrompts(
  positive: string,
  negative: string,
  caps: WorkflowCapabilities,
): { positive: string; negative: string } {
  if (caps.supportsPromptWeights) {
    return { positive, negative };
  }

  return {
    positive: stripPromptWeights(positive),
    negative: stripPromptWeights(negative),
  };
}

/**
 * Inyecta universalmente los prompts positivo y negativo en cualquier workflow de ComfyUI.
 *
 * No se limita a la clase 'CLIPTextEncode' clasica: analiza dinamicamente cada nodo
 * en busca de campos directos de texto ('prompt', 'text', 'string', 'search_query', 'text_input')
 * o titulos/clases que contengan codificadores de texto modernos (Flux, SD3, Wan2.1, Z-Image, etc.).
 */
export function injectUniversalTextPrompts(
  workflow: any,
  positivePrompt?: string,
  negativePrompt?: string
) {
  if (!workflow || typeof workflow !== 'object') return;

  const validTextKeys = ['text', 'prompt', 'string', 'text_input', 'search_query'];

  // 1. Identificar nodos conectados explícitamente a las entradas de condicionamiento de cualquier Sampler
  const positiveNodeIds = new Set<string>();
  const negativeNodeIds = new Set<string>();

  Object.entries(workflow).forEach(([nodeId, n]: [string, any]) => {
    if (n && n.inputs) {
      if (Array.isArray(n.inputs.positive) && n.inputs.positive.length > 0) {
        positiveNodeIds.add(n.inputs.positive[0].toString());
      }
      if (Array.isArray(n.inputs.negative) && n.inputs.negative.length > 0) {
        negativeNodeIds.add(n.inputs.negative[0].toString());
      }
    }
  });

  // 2. Inyección de Prompt Positivo
  if (positivePrompt && positivePrompt.trim() !== '') {
    let positiveInjected = false;

    // A. Prioridad 1: Nodos trazados explícitamente desde la entrada positive del Sampler
    for (const posNodeId of positiveNodeIds) {
      const node = workflow[posNodeId];
      if (node && node.inputs) {
        for (const key of validTextKeys) {
          if (node.inputs[key] !== undefined && typeof node.inputs[key] === 'string' && !Array.isArray(node.inputs[key])) {
            node.inputs[key] = positivePrompt;
            positiveInjected = true;
            console.log(`[Omni IA Game] Inyección positiva dirigida en nodo "${posNodeId}" (${node._meta?.title || node.class_type}) campo "${key}"`);
            break;
          }
        }
      }
    }

    // B. Prioridad 2: Si no se inyectó por trazo directo, buscar nodos de codificación de texto
    if (!positiveInjected) {
      for (const [nodeId, node] of Object.entries(workflow) as [string, any][]) {
        if (negativeNodeIds.has(nodeId)) continue;
        const title = (node._meta?.title || '').toLowerCase();
        const classType = (node.class_type || '').toLowerCase();

        if (title.includes('negative') || title.includes('negativo') || title.includes('bad') || title.includes('nocivo')) {
          continue;
        }

        const isTextEncoderClass = classType.includes('cliptext') ||
                                   classType.includes('textencode') ||
                                   classType.includes('string') ||
                                   classType.includes('text');

        if (isTextEncoderClass && node.inputs) {
          for (const key of validTextKeys) {
            // REGLA FUNDAMENTAL: NUNCA sobreescribir enlaces de tipo Array [...]
            if (node.inputs[key] !== undefined && typeof node.inputs[key] === 'string' && !Array.isArray(node.inputs[key])) {
              node.inputs[key] = positivePrompt;
              positiveInjected = true;
              console.log(`[Omni IA Game] Inyección positiva universal en nodo de texto "${nodeId}" (${node._meta?.title || node.class_type}) campo "${key}"`);
              break;
            }
          }
          if (positiveInjected) break;
        }
      }
    }
  }

  // 3. Inyección de Prompt Negativo
  if (negativePrompt && negativePrompt.trim() !== '') {
    let negativeInjected = false;

    // A. Prioridad 1: Nodos trazados explícitamente desde la entrada negative del Sampler
    for (const negNodeId of negativeNodeIds) {
      const node = workflow[negNodeId];
      if (node && node.inputs) {
        for (const key of [...validTextKeys, 'negative_prompt', 'negative']) {
          if (node.inputs[key] !== undefined && typeof node.inputs[key] === 'string' && !Array.isArray(node.inputs[key])) {
            node.inputs[key] = negativePrompt;
            negativeInjected = true;
            console.log(`[Omni IA Game] Inyección negativa dirigida en nodo "${negNodeId}" (${node._meta?.title || node.class_type}) campo "${key}"`);
            break;
          }
        }
      }
    }

    // B. Prioridad 2: Nodos de codificación de texto negativos
    if (!negativeInjected) {
      for (const [nodeId, node] of Object.entries(workflow) as [string, any][]) {
        const title = (node._meta?.title || '').toLowerCase();
        const classType = (node.class_type || '').toLowerCase();

        if (negativeNodeIds.has(nodeId) || title.includes('negative') || title.includes('negativo') || title.includes('bad') || classType.includes('negative')) {
          if (node && node.inputs) {
            for (const key of [...validTextKeys, 'negative_prompt', 'negative']) {
              // REGLA FUNDAMENTAL: NUNCA sobreescribir enlaces de tipo Array [...]
              if (node.inputs[key] !== undefined && typeof node.inputs[key] === 'string' && !Array.isArray(node.inputs[key])) {
                node.inputs[key] = negativePrompt;
                negativeInjected = true;
                console.log(`[Omni IA Game] Inyección negativa universal en nodo "${nodeId}" (${node._meta?.title || node.class_type}) campo "${key}"`);
                break;
              }
            }
            if (negativeInjected) break;
          }
        }
      }
    }
  }
}
