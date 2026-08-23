/**
 * ---------------------------------------------------------------------------
 *  Recorte de fondo dentro del workflow
 * ---------------------------------------------------------------------------
 *  Un checkbox NO puede "mutear" un nodo. Se comprobo contra el ComfyUI de este
 *  equipo sobre un workflow realmente ejecutado: cada nodo del formato API tiene
 *  exactamente tres campos, `_meta`, `class_type` e `inputs`. No hay campo
 *  `mode`. Mutear (2) y puentear (4) son conceptos del formato de INTERFAZ; al
 *  exportar a formato API el frontend ya elimino esos nodos y recableo.
 *
 *  Asi que activar y desactivar se hace INSERTANDO o QUITANDO el nodo, no
 *  alternando una bandera. Insertar en vez de exigir que el nodo ya exista
 *  tiene una ventaja concreta: funciona con el workflow de Z-Image tal cual
 *  esta, sin pedirle al usuario que lo edite en ComfyUI.
 *
 *  Se eligio `BiRefNetRMBG` de ComfyUI-RMBG, presente en este equipo, con la
 *  variante `BiRefNet_toonout` por defecto: esta entrenada para ilustracion y
 *  dibujo, que es lo que se genera aqui, y resuelve bordes suavizados y detalles
 *  finos mucho mejor que el relleno por inundacion que hace la aplicacion en
 *  JavaScript despues de recibir la imagen.
 * ---------------------------------------------------------------------------
 */

export const REMBG_NODE_CLASS = 'BiRefNetRMBG';
export const REMBG_NODE_ID = 'omni_rembg';

/** Variantes útiles del modelo, tal y como las declara el nodo. */
export const REMBG_MODELS = [
  { key: 'BiRefNet_toonout', label: 'Ilustración / dibujo (recomendado)' },
  { key: 'BiRefNet-general', label: 'General' },
  { key: 'BiRefNet-matting', label: 'Bordes finos / pelo' },
  { key: 'BiRefNet-HR', label: 'Alta resolución' },
  { key: 'BiRefNet_lite', label: 'Ligero / rápido' },
];

type ApiNode = { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } };
type ApiWorkflow = Record<string, ApiNode>;

/** ¿Es un enlace del formato API, `[idDeNodo, indiceDeSalida]`? */
function isLink(value: unknown): value is [string, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string';
}

/** Comprueba si la clase del nodo corresponde a cualquier tipo de remoción de fondo (BiRefNet, RemBG, etc.) */
export function isRembgNodeClass(classType: string): boolean {
  if (!classType) return false;
  return (
    classType === 'BiRefNetRMBG' ||
    classType === 'Image Rembg (Remove Background)' ||
    classType.includes('Rembg') ||
    classType.includes('BiRefNet')
  );
}

/** Devuelve los IDs de todos los nodos de remoción de fondo presentes en el workflow. */
export function findRembgNodes(workflow: ApiWorkflow): string[] {
  return Object.keys(workflow).filter((id) => {
    const node = workflow[id];
    return node && isRembgNodeClass(node.class_type || '');
  });
}

/**
 * Inserta o configura el recorte entre el decodificador de imagen y quien la consume.
 *
 * Evita estrictamente el encadenamiento de múltiples nodos de RemBG (que causa
 * errores de tensores 4-canales vs 3-canales en PyTorch/BiRefNet).
 */
export function enableRembg(
  workflow: ApiWorkflow,
  model = 'BiRefNet_toonout',
): { ok: boolean; reason?: string } {
  const decoder = Object.entries(workflow).find(
    ([, node]) => node.class_type === 'VAEDecode' || node.class_type === 'VAEDecodeTiled',
  );

  if (!decoder) {
    return {
      ok: false,
      reason:
        'El workflow no tiene un nodo VAEDecode, así que no hay un punto claro donde recortar el fondo. Se usará el recorte de la aplicación.',
    };
  }

  const [decoderId] = decoder;
  const existingNodes = findRembgNodes(workflow);

  // Si ya existen nodos RemBG (por ejemplo omni_rembg o un nodo preexistente en el workflow como el nodo 15):
  // Eliminamos cualquier nodo de RemBG redundante para garantizar que SOLO EXISTA UNO.
  if (existingNodes.length > 0) {
    const mainRembgId = existingNodes.includes(REMBG_NODE_ID) ? REMBG_NODE_ID : existingNodes[0];

    // Purgar nodos RemBG secundarios/duplicados si existiera más de uno
    for (const rembgId of existingNodes) {
      if (rembgId !== mainRembgId) {
        const redundantNode = workflow[rembgId];
        const rawSource = redundantNode?.inputs?.image || redundantNode?.inputs?.images;
        const sourceLink = isLink(rawSource) ? rawSource : [decoderId, 0];

        for (const [nodeId, candidate] of Object.entries(workflow)) {
          if (nodeId === rembgId) continue;
          for (const [inputName, val] of Object.entries(candidate.inputs)) {
            if (isLink(val) && val[0] === rembgId) {
              candidate.inputs[inputName] = sourceLink;
            }
          }
        }
        delete workflow[rembgId];
      }
    }

    // Configurar el nodo RemBG principal seleccionado
    const targetNode = workflow[mainRembgId];
    if (targetNode) {
      if ('model' in targetNode.inputs) {
        if (targetNode.class_type === 'Image Rembg (Remove Background)' && !['u2net', 'u2netp', 'u2net_human_seg', 'silueta', 'isnet-general-use', 'isnet-anime'].includes(model)) {
          targetNode.inputs.model = 'u2net';
        } else {
          targetNode.inputs.model = model;
        }
      }
      if ('background' in targetNode.inputs) {
        targetNode.inputs.background = 'Alpha';
      }
      // Garantizar que la entrada del RemBG viene directamente del decoder (3 canales RGB)
      if (targetNode.class_type === 'Image Rembg (Remove Background)') {
        delete targetNode.inputs.image;
        targetNode.inputs.images = [decoderId, 0];
      } else {
        delete targetNode.inputs.images;
        targetNode.inputs.image = [decoderId, 0];
      }

      // Asegurar que los consumidores del decoder (excepto el propio RemBG) consuman la salida del RemBG
      for (const [nodeId, node] of Object.entries(workflow)) {
        if (nodeId === decoderId || nodeId === mainRembgId) continue;
        for (const [inputName, value] of Object.entries(node.inputs)) {
          if (isLink(value) && value[0] === decoderId) {
            node.inputs[inputName] = [mainRembgId, 0];
          }
        }
      }
      return { ok: true };
    }
  }

  // 1. Quien consumía la imagen del decodificador pasa a consumir la recortada.
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (nodeId === decoderId) {
      continue;
    }
    for (const [inputName, value] of Object.entries(node.inputs)) {
      if (isLink(value) && value[0] === decoderId) {
        node.inputs[inputName] = [REMBG_NODE_ID, 0];
      }
    }
  }

  // 2. Insertar el nodo omni_rembg alimentado por el decodificador (RGB 3 canales).
  workflow[REMBG_NODE_ID] = {
    class_type: REMBG_NODE_CLASS,
    _meta: { title: 'Omni IA — Quitar fondo' },
    inputs: {
      image: [decoderId, 0],
      model,
      background: 'Alpha',
      mask_offset: -1,
      mask_blur: 0,
      refine_foreground: true,
      invert_output: false,
    },
  };

  return { ok: true };
}

/**
 * Quita TODOS los nodos de recorte (omni_rembg, 999_omni_rembg o nodos RemBG de usuario)
 * y devuelve el cableado a su sitio original.
 */
export function disableRembg(workflow: ApiWorkflow): void {
  const rembgNodes = findRembgNodes(workflow);
  if (rembgNodes.length === 0) return;

  for (const rembgId of rembgNodes) {
    const node = workflow[rembgId];
    if (!node) continue;

    const source = node.inputs.image || node.inputs.images;
    const sourceLink: [string, number] = isLink(source) ? source : ['10', 0];

    for (const [nodeId, candidate] of Object.entries(workflow)) {
      if (rembgNodes.includes(nodeId)) continue;
      for (const [inputName, value] of Object.entries(candidate.inputs)) {
        if (isLink(value) && value[0] === rembgId) {
          candidate.inputs[inputName] = sourceLink;
        }
      }
    }

    delete workflow[rembgId];
  }
}

/**
 * Aplica el estado del checkbox de remoción de fondo.
 */
export function applyRembg(
  workflow: ApiWorkflow,
  enabled: boolean,
  model?: string,
): { ok: boolean; reason?: string } {
  if (enabled) {
    return enableRembg(workflow, model);
  }
  disableRembg(workflow);
  return { ok: true };
}
