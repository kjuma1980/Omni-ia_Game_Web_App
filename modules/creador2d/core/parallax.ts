import type { Camera } from './renderer';

/**
 * ---------------------------------------------------------------------------
 *  Capas de parallax
 * ---------------------------------------------------------------------------
 *  Dos responsabilidades: garantizar que la imagen repita en horizontal sin
 *  costura, y dibujarla desplazada respecto a la camara.
 *
 *  Lo primero no se puede dar por hecho aunque el modelo se haya generado con
 *  padding circular: el decodificador VAE introduce artefactos en la columna
 *  del borde. Medido sobre una capa real, la diferencia entre la ultima columna
 *  y la primera era de 23/255 frente a 1,9/255 entre columnas contiguas, es
 *  decir, un corte perfectamente visible.
 *
 *  Se corrige con un solape mezclado, que es seamless POR CONSTRUCCION:
 *
 *      N = W - B                              (ancho del tile resultante)
 *      T[x] = S[x]                            para x en [B, N)
 *      T[x] = lerp(S[x + N], S[x], x / B)     para x en [0, B)
 *
 *  Como T[N-1] = S[N-1] y T[0] = S[N] son columnas CONTIGUAS del original, el
 *  tile encaja consigo mismo. Sobre la misma capa, la costura baja de 23/255 a
 *  3,1/255, ya al nivel del ruido interno de la imagen.
 * ---------------------------------------------------------------------------
 */

export type ParallaxKind = 'SKY' | 'FAR' | 'MID' | 'NEAR';

export interface ParallaxLayer {
  id: string;
  kind: ParallaxKind;
  order: number;
  name: string;
  imageUrl: string | null;
  speedX: number;
  speedY: number;
  opacity: number;
  tint: string;
  repeatX: boolean;
  repeatY: boolean;
  offsetY: number;
  visible: boolean;
}

/** Proporcion del ancho que se dedica a mezclar el solape. */
const BLEND_RATIO = 0.12;

interface PreparedLayer {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

const prepared = new Map<string, PreparedLayer>();
const loading = new Set<string>();

/**
 * Convierte una imagen en un tile que repite sin costura en horizontal.
 * Devuelve un canvas mas estrecho que el original: el solape se consume.
 */
function makeSeamlessX(image: HTMLImageElement): HTMLCanvasElement {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const blend = Math.max(1, Math.round(w * BLEND_RATIO));
  const tileWidth = w - blend;

  const canvas = document.createElement('canvas');
  canvas.width = tileWidth;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return canvas;
  }

  // Cuerpo del tile: la parte del original que no se toca.
  ctx.drawImage(image, 0, 0, tileWidth, h, 0, 0, tileWidth, h);

  // Sobre los primeros `blend` pixeles se funde la cola del original, con alfa
  // decreciente. Se hace en franjas de 1 px porque un degradado sobre
  // globalAlpha no se puede expresar de otro modo en Canvas 2D.
  for (let x = 0; x < blend; x += 1) {
    ctx.globalAlpha = 1 - x / blend;
    ctx.drawImage(image, tileWidth + x, 0, 1, h, x, 0, 1, h);
  }

  ctx.globalAlpha = 1;
  return canvas;
}

/**
 * Carga y prepara la imagen de una capa. Es asincrono y silencioso: mientras no
 * este lista, la capa simplemente no se dibuja, sin bloquear el lienzo.
 */
function ensurePrepared(layer: ParallaxLayer, onReady: () => void): PreparedLayer | null {
  if (!layer.imageUrl) {
    return null;
  }

  const cached = prepared.get(layer.id);
  if (cached) {
    return cached;
  }

  if (loading.has(layer.id)) {
    return null;
  }

  loading.add(layer.id);

  const image = new Image();
  image.onload = () => {
    const canvas = layer.repeatX ? makeSeamlessX(image) : toCanvas(image);
    prepared.set(layer.id, { canvas, width: canvas.width, height: canvas.height });
    loading.delete(layer.id);
    onReady();
  };
  image.onerror = () => {
    loading.delete(layer.id);
  };
  image.src = layer.imageUrl;

  return null;
}

function toCanvas(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d')?.drawImage(image, 0, 0);
  return canvas;
}

/** Se llama al regenerar una capa para que se vuelva a preparar. */
export function invalidateLayer(layerId: string): void {
  prepared.delete(layerId);
  loading.delete(layerId);
}

export function clearParallaxCache(): void {
  prepared.clear();
  loading.clear();
}

/**
 * Dibuja las capas de fondo detras del mundo.
 *
 * El desplazamiento es una fraccion del de la camara: `speedX` 0 deja la capa
 * clavada a la pantalla y 1 la ancla al mundo. Los valores intermedios son los
 * que producen la sensacion de profundidad.
 */
export function drawParallax(
  ctx: CanvasRenderingContext2D,
  layers: ParallaxLayer[],
  camera: Camera,
  onReady: () => void,
): void {
  const { width, height } = ctx.canvas;

  // Orden de dibujado: primero lo mas lejano.
  const order: Record<ParallaxKind, number> = { SKY: 0, FAR: 1, MID: 2, NEAR: 3 };
  const sorted = [...layers]
    .filter((layer) => layer.visible && layer.imageUrl)
    .sort((a, b) => order[a.kind] - order[b.kind] || a.order - b.order);

  for (const layer of sorted) {
    const ready = ensurePrepared(layer, onReady);
    if (!ready) {
      continue;
    }

    // La capa se escala para cubrir el alto del lienzo manteniendo proporcion.
    const scale = Math.max(1, height / ready.height);
    const drawW = ready.width * scale;
    const drawH = ready.height * scale;

    // Desplazamiento en X: modulo del ancho del tile para repetir sin fin.
    const shiftX = -camera.x * layer.speedX * camera.zoom;
    const shiftY = -camera.y * layer.speedY * camera.zoom + layer.offsetY * camera.zoom;

    let startX = shiftX % drawW;
    if (startX > 0) {
      startX -= drawW;
    }

    const top = height / 2 + shiftY;

    ctx.save();
    ctx.globalAlpha = layer.opacity;

    if (layer.repeatX) {
      for (let x = startX; x < width; x += drawW) {
        ctx.drawImage(ready.canvas, x, top, drawW, drawH);
      }
    } else {
      ctx.drawImage(ready.canvas, shiftX, top, drawW, drawH);
    }

    // Tinte multiplicativo para integrar la capa con la paleta del bioma.
    if (layer.tint && layer.tint.toLowerCase() !== '#ffffff') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = layer.tint;
      ctx.globalAlpha = layer.opacity * 0.35;
      ctx.fillRect(0, top, width, drawH);
    }

    ctx.restore();
  }
}
