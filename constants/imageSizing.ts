/**
 * ---------------------------------------------------------------------------
 *  Tamano y proporcion de la imagen generada
 * ---------------------------------------------------------------------------
 *  Ni el prompt ni el refinador pueden cambiar el tamano de salida: eso lo
 *  decide el nodo de latente vacio del workflow. Hasta ahora nunca se inyectaba,
 *  de modo que un mapa completo salia al tamano por defecto del workflow -512 o
 *  1024 px- y no admitia acercamiento.
 *
 *  Dos decisiones que conviene dejar escritas:
 *
 *  1. La proporcion NO se consigue estirando el lado largo, sino repartiendo un
 *     PRESUPUESTO DE PIXELES. Cada modelo se entrena a un area concreta -SDXL y
 *     Flux rondan 1 megapixel- y pasarse de ahi no da mas detalle: da
 *     duplicaciones, personajes con dos cabezas y paisajes con dos horizontes.
 *     Por eso 16:9 a partir de 1536 no es 2731x1536, sino 2048x1152: la misma
 *     area, otra forma.
 *
 *  2. Ambos lados se ajustan a multiplos de 8. El VAE trabaja en bloques de
 *     8 px y un valor suelto se redondea en silencio, descuadrando la imagen
 *     respecto a lo que el usuario pidio.
 * ---------------------------------------------------------------------------
 */

export interface AspectOption {
  key: string;
  label: string;
  /** Ancho / alto. */
  ratio: number;
  /** Como describirlo en el prompt, para que la composicion encaje. */
  description: string;
}

export const ASPECT_OPTIONS: AspectOption[] = [
  {
    key: '1:1',
    label: 'Cuadrado 1:1',
    ratio: 1,
    description: 'square composition, the map spreads equally in both directions',
  },
  {
    key: '4:3',
    label: 'Horizontal 4:3',
    ratio: 4 / 3,
    description: 'slightly wide landscape composition',
  },
  {
    key: '3:2',
    label: 'Horizontal 3:2',
    ratio: 3 / 2,
    description: 'wide landscape composition',
  },
  {
    key: '16:9',
    label: 'Panorámico 16:9',
    ratio: 16 / 9,
    description:
      'wide panoramic composition, the map extends further horizontally than vertically',
  },
  {
    key: '3:4',
    label: 'Vertical 3:4',
    ratio: 3 / 4,
    description: 'slightly tall portrait composition',
  },
  {
    key: '9:16',
    label: 'Vertical 9:16',
    ratio: 9 / 16,
    description:
      'tall vertical composition, the map extends further vertically than horizontally, suited to a runner track seen from above',
  },
];

export function findAspect(key: string): AspectOption {
  return ASPECT_OPTIONS.find((option) => option.key === key) ?? ASPECT_OPTIONS[0];
}

/** Redondea al multiplo de 8 mas cercano, nunca por debajo de 256. */
function snap8(value: number): number {
  return Math.max(256, Math.round(value / 8) * 8);
}

/**
 * Calcula ancho y alto conservando el area de `side x side`.
 *
 * `side` es el lado que tendria la imagen en formato cuadrado, y funciona como
 * indicador de calidad: 1024 rapido, 1536 recomendado, 2048 maximo detalle.
 */
export function computeDimensions(side: number, aspectKey: string): { width: number; height: number } {
  const ratio = findAspect(aspectKey).ratio;
  const area = side * side;

  const width = Math.sqrt(area * ratio);
  const height = area / width;

  return { width: snap8(width), height: snap8(height) };
}

/**
 * Nodos que CREAN un latente de imagen vacio, que es lo unico que debe
 * redimensionarse.
 *
 * La lista se comprobo contra el ComfyUI del usuario: hay 60 nodos con `width`
 * y `height` que devuelven LATENT, y la mayoria no se pueden tocar.
 * `LatentUpscale` y `LatentCrop` transforman un latente que ya existe -
 * reescribirlos descuadraria la cadena - y los `Empty*Video*` definen fotogramas
 * de video, no una imagen.
 */
const IMAGE_LATENT_CLASSES = [
  'EmptyLatentImage',
  'EmptySD3LatentImage',
  'EmptyFlux2LatentImage',
  'EmptyHunyuanImageLatent',
  'EmptyQwenImageLayeredLatentImage',
  'EmptyChromaRadianceLatentImage',
  'EmptyHiDreamO1LatentImage',
  'StableCascade_EmptyLatentImage',
];

/**
 * Decide si un nodo es un latente de imagen vacio.
 *
 * Ademas de la lista, se acepta cualquier clase que empiece por `Empty`,
 * mencione `Latent` y no mencione `Video`: asi un nodo de un modelo futuro
 * funciona sin tener que actualizar la lista, y los de video siguen fuera.
 */
export function isEmptyImageLatent(classType: string): boolean {
  if (IMAGE_LATENT_CLASSES.includes(classType)) {
    return true;
  }

  const lower = classType.toLowerCase();
  return lower.startsWith('empty') && lower.includes('latent') && !lower.includes('video');
}
