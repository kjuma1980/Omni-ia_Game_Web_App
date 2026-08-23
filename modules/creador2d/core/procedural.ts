import type { VisualDescriptor } from '../types';
import { OBJECT_SHAPES, paintShape, type ObjectShape } from './shapes';

/**
 * ---------------------------------------------------------------------------
 *  Generador procedural de baldosas
 * ---------------------------------------------------------------------------
 *  Todo el arte del editor se dibuja aqui en tiempo de ejecucion a partir de un
 *  descriptor (patron + paleta). No se carga ni se distribuye ningun sprite de
 *  terceros: cada baldosa es geometria original generada con un PRNG semillado
 *  por la clave del bloque, de modo que el mismo bloque siempre se ve igual.
 *
 *  Rendimiento: cada combinacion (clave de bloque, tamano de tile) se rasteriza
 *  UNA sola vez en un canvas fuera de pantalla y despues se copia con drawImage.
 *  Repintar 9 chunks de 32x32 en 4 capas son ~36.000 blits, que el navegador
 *  resuelve sin coste apreciable; rasterizar los patrones en cada frame, no.
 * ---------------------------------------------------------------------------
 */

/** PRNG determinista (mulberry32): mismo bloque, mismo dibujo, siempre. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashKey(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const cache = new Map<string, HTMLCanvasElement>();

/** Rasteriza (o recupera de cache) la baldosa de un bloque. */
export function getTileCanvas(
  blockKey: string,
  visual: VisualDescriptor,
  size: number,
): HTMLCanvasElement {
  const cacheKey = `${blockKey}@${size}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;

    // Un objeto no es una textura. Un barril pintado con veta de madera es un
    // cuadrado con vetas; hay que dibujar su SILUETA sobre fondo transparente.
    // Por eso las formas se resuelven antes que los patrones y no comparten el
    // relleno de fondo que hace `paint`.
    if (isObjectShape(visual.pattern)) {
      const colors = visual.colors.length > 0 ? visual.colors : ['#94a3b8'];
      paintShape(ctx, visual.pattern, size, {
        base: colors[0],
        dark: colors[1] ?? shade(colors[0], -0.35),
        accent: visual.accent ?? colors[2] ?? shade(colors[0], 0.3),
      });
    } else {
      paint(ctx, visual, size, createRandom(hashKey(blockKey)));
    }
  }

  cache.set(cacheKey, canvas);
  return canvas;
}

/** Se llama al cambiar el zoom para no acumular rasterizaciones antiguas. */
export function clearTileCache(): void {
  cache.clear();
  imageTiles.clear();
  decoding.clear();
}

// --------------------------- sprites propios --------------------------------

const imageTiles = new Map<string, HTMLCanvasElement>();
const decoding = new Set<string>();

/**
 * Calcula los límites útiles del sprite descartando bordes de fondo transparente
 * o blanco puro para que el objeto ocupe todo el espacio de la baldosa.
 */
function getCroppedSourceBounds(image: HTMLImageElement): { sx: number; sy: number; sw: number; sh: number } {
  const w = image.width;
  const h = image.height;
  if (w === 0 || h === 0) return { sx: 0, sy: 0, sw: w, sh: h };

  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { sx: 0, sy: 0, sw: w, sh: h };

  ctx.drawImage(image, 0, 0);
  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(0, 0, w, h);
  } catch {
    return { sx: 0, sy: 0, sw: w, sh: h };
  }
  const data = imgData.data;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  // Escaneo rápido con salto de a 2px
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      const isTransparent = a < 15;
      const isWhiteBg = r > 240 && g > 240 && b > 240 && a > 200;

      if (!isTransparent && !isWhiteBg) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { sx: 0, sy: 0, sw: w, sh: h };
  }

  const pad = 2;
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sw = Math.min(w - sx, maxX - minX + 1 + pad * 2);
  const sh = Math.min(h - sy, maxY - minY + 1 + pad * 2);

  return { sx, sy, sw, sh };
}

/**
 * Baldosa de un bloque con sprite propio (los creados desde el generador de
 * Omni IA Game). Renderiza a alta resolución (HD 256px+) y elimina márgenes
 * vacíos para que la imagen se vea nítida, legible y detallada al hacer zoom.
 */
function getImageTile(
  blockKey: string,
  dataUrl: string,
  size: number,
  onReady: () => void,
  heightInTiles = 1,
): HTMLCanvasElement | null {
  const hTiles = Math.max(1, heightInTiles);
  // Alta resolución base (256px por baldosa) para mantener ultra nitidez y detalle al hacer zoom
  const renderScale = Math.max(256, size * 4);
  const cacheKey = `${blockKey}@${renderScale}x${hTiles}`;
  const ready = imageTiles.get(cacheKey);
  if (ready) {
    return ready;
  }

  if (decoding.has(cacheKey)) {
    return null;
  }
  decoding.add(cacheKey);

  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    const targetW = renderScale;
    const targetH = renderScale * hTiles;
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Auto-recorte de márgenes blancos o transparentes para aprovechar la superficie útil
      const bounds = getCroppedSourceBounds(image);

      const ratio = Math.min(targetW / bounds.sw, targetH / bounds.sh);
      const drawW = bounds.sw * ratio;
      const drawH = bounds.sh * ratio;
      ctx.drawImage(
        image,
        bounds.sx,
        bounds.sy,
        bounds.sw,
        bounds.sh,
        (targetW - drawW) / 2,
        targetH - drawH,
        drawW,
        drawH,
      );
    }

    imageTiles.set(cacheKey, canvas);
    decoding.delete(cacheKey);
    onReady();
  };
  image.onerror = () => {
    decoding.delete(cacheKey);
    imageTiles.set(cacheKey, fallbackTile(size));
    onReady();
  };
  image.src = dataUrl;

  return null;
}

/** Marca visible de "este bloque tiene un sprite que no se pudo cargar". */
function fallbackTile(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#3f1d1d';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.beginPath();
    ctx.moveTo(size * 0.2, size * 0.2);
    ctx.lineTo(size * 0.8, size * 0.8);
    ctx.moveTo(size * 0.8, size * 0.2);
    ctx.lineTo(size * 0.2, size * 0.8);
    ctx.stroke();
  }
  return canvas;
}

/**
 * Punto de entrada del renderizador: elige entre el sprite propio del bloque y
 * el dibujo procedural, y nunca devuelve nulo para que el llamador no tenga que
 * ramificar.
 */
export function getBlockTile(
  block: { key: string; visual: VisualDescriptor; origin?: string; imageData?: string | null; heightInTiles?: number },
  size: number,
  onReady: () => void,
): HTMLCanvasElement {
  if (block.imageData && block.origin && block.origin !== 'PROCEDURAL') {
    const tile = getImageTile(block.key, block.imageData, size, onReady, block.heightInTiles ?? 1);
    if (tile) {
      return tile;
    }
    // Mientras carga se dibuja el procedural: mejor una silueta provisional
    // que un hueco parpadeante.
  }

  return getTileCanvas(block.key, block.visual, size);
}

function isObjectShape(pattern: string): pattern is ObjectShape {
  return (OBJECT_SHAPES as readonly string[]).includes(pattern);
}

/**
 * Aclara u oscurece un color hexadecimal. Los bloques con un solo color de
 * paleta necesitan un tono de sombra y otro de realce para que la silueta se
 * lea; derivarlos es preferible a obligar al catalogo a declarar tres.
 */
function shade(hex: string, amount: number): string {
  const match = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!match) {
    return hex;
  }
  const value = parseInt(match[1], 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const shifted = amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(shifted)));
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function pick(colors: string[], random: () => number): string {
  if (colors.length === 0) {
    return '#64748b';
  }
  return colors[Math.floor(random() * colors.length) % colors.length];
}

function paint(
  ctx: CanvasRenderingContext2D,
  visual: VisualDescriptor,
  size: number,
  random: () => number,
): void {
  const colors = visual.colors.length > 0 ? visual.colors : ['#64748b'];
  const accent = visual.accent ?? colors[colors.length - 1];
  const detail = Math.min(1, Math.max(0, visual.detail ?? 0.35));

  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, size, size);

  switch (visual.pattern) {
    case 'solid':
      break;

    case 'noise': {
      const speckles = Math.floor(size * size * detail * 0.22);
      for (let i = 0; i < speckles; i += 1) {
        ctx.fillStyle = random() > 0.5 ? pick(colors, random) : accent;
        const px = Math.floor(random() * size);
        const py = Math.floor(random() * size);
        const dot = random() > 0.85 ? 2 : 1;
        ctx.fillRect(px, py, dot, dot);
      }
      break;
    }

    case 'bricks': {
      const rows = 4;
      const rowHeight = size / rows;
      ctx.fillStyle = colors[1] ?? accent;
      for (let row = 0; row < rows; row += 1) {
        const offset = row % 2 === 0 ? 0 : size / 4;
        for (let column = -1; column < 2; column += 1) {
          const x = offset + column * (size / 2);
          ctx.fillRect(x + 1, row * rowHeight + 1, size / 2 - 2, rowHeight - 2);
        }
      }
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      for (let row = 1; row < rows; row += 1) {
        ctx.beginPath();
        ctx.moveTo(0, row * rowHeight);
        ctx.lineTo(size, row * rowHeight);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }

    case 'planks': {
      const boards = 3;
      const boardHeight = size / boards;
      for (let board = 0; board < boards; board += 1) {
        ctx.fillStyle = board % 2 === 0 ? colors[0] : (colors[1] ?? accent);
        ctx.fillRect(0, board * boardHeight, size, boardHeight - 1);

        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.25 + detail * 0.3;
        const grains = 3;
        for (let g = 0; g < grains; g += 1) {
          const y = board * boardHeight + 2 + random() * (boardHeight - 4);
          ctx.fillRect(random() * size * 0.4, y, size * (0.3 + random() * 0.4), 1);
        }
        ctx.globalAlpha = 1;
      }
      break;
    }

    case 'checker': {
      const cells = 4;
      const cell = size / cells;
      for (let y = 0; y < cells; y += 1) {
        for (let x = 0; x < cells; x += 1) {
          if ((x + y) % 2 === 0) {
            continue;
          }
          ctx.fillStyle = colors[1] ?? accent;
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
      break;
    }

    case 'stripes': {
      const stripes = 4;
      const width = size / stripes;
      ctx.fillStyle = colors[1] ?? accent;
      for (let i = 0; i < stripes; i += 2) {
        ctx.fillRect(i * width, 0, width, size);
      }
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(0, 0, size, 2);
      ctx.globalAlpha = 1;
      break;
    }

    case 'dots': {
      const count = Math.floor(10 + detail * 26);
      for (let i = 0; i < count; i += 1) {
        ctx.fillStyle = random() > 0.6 ? accent : (colors[1] ?? accent);
        ctx.beginPath();
        ctx.arc(random() * size, random() * size, 0.6 + random() * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'organic': {
      const blobs = 5;
      for (let i = 0; i < blobs; i += 1) {
        ctx.fillStyle = i === 0 ? (colors[1] ?? accent) : pick(colors, random);
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.ellipse(
          size * (0.25 + random() * 0.5),
          size * (0.25 + random() * 0.5),
          size * (0.18 + random() * 0.22),
          size * (0.16 + random() * 0.24),
          random() * Math.PI,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }

    case 'liquid': {
      const waves = 4;
      const step = size / waves;
      for (let i = 0; i < waves; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? (colors[1] ?? accent) : colors[0];
        ctx.fillRect(0, i * step, size, step);
      }
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      for (let i = 0; i < waves; i += 1) {
        ctx.beginPath();
        const y = i * step + step * 0.5;
        ctx.moveTo(0, y);
        ctx.quadraticCurveTo(size * 0.25, y - step * 0.3, size * 0.5, y);
        ctx.quadraticCurveTo(size * 0.75, y + step * 0.3, size, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }

    case 'spikes': {
      ctx.clearRect(0, 0, size, size);
      const teeth = 3;
      const width = size / teeth;
      for (let i = 0; i < teeth; i += 1) {
        const gradient = ctx.createLinearGradient(0, size, 0, 0);
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(1, accent);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(i * width, size);
        ctx.lineTo(i * width + width / 2, size * 0.1);
        ctx.lineTo((i + 1) * width, size);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }

    case 'ladder': {
      ctx.clearRect(0, 0, size, size);
      const rail = Math.max(2, size * 0.12);
      ctx.fillStyle = colors[0];
      ctx.fillRect(size * 0.18, 0, rail, size);
      ctx.fillRect(size * 0.82 - rail, 0, rail, size);
      ctx.fillStyle = accent;
      const rungs = 3;
      for (let i = 0; i < rungs; i += 1) {
        const y = (i + 0.5) * (size / rungs) - rail / 2;
        ctx.fillRect(size * 0.18, y, size * 0.64, rail * 0.8);
      }
      break;
    }

    case 'canopy': {
      ctx.clearRect(0, 0, size, size);
      const leaves = 7;
      for (let i = 0; i < leaves; i += 1) {
        ctx.fillStyle = i % 3 === 0 ? accent : pick(colors, random);
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(
          size * (0.2 + random() * 0.6),
          size * (0.2 + random() * 0.6),
          size * (0.16 + random() * 0.16),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }

    case 'slab': {
      ctx.fillStyle = colors[1] ?? accent;
      ctx.fillRect(1, 1, size - 2, size - 2);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1;
      ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
      ctx.globalAlpha = 1;
      break;
    }

    // --- Ampliaciones del catalogo extendido -------------------------------

    case 'cracked': {
      // Base del material y encima una red de grietas ramificadas.
      ctx.fillStyle = colors[1] ?? colors[0];
      ctx.fillRect(0, 0, size, size);

      const speckles = Math.floor(size * size * detail * 0.1);
      for (let i = 0; i < speckles; i += 1) {
        ctx.fillStyle = pick(colors, random);
        ctx.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1, 1);
      }

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = 1;
      const cracks = 2 + Math.floor(detail * 3);
      for (let i = 0; i < cracks; i += 1) {
        let x = random() * size;
        let y = random() * size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const segments = 3 + Math.floor(random() * 3);
        for (let s = 0; s < segments; s += 1) {
          x += (random() - 0.5) * size * 0.5;
          y += (random() - 0.5) * size * 0.5;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }

    case 'rubble': {
      // Solo la mitad inferior tiene material: es un elemento derruido.
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = colors[0];
      ctx.fillRect(0, size * 0.55, size, size * 0.45);

      const chunks = 6 + Math.floor(detail * 8);
      for (let i = 0; i < chunks; i += 1) {
        ctx.fillStyle = random() > 0.5 ? (colors[1] ?? accent) : accent;
        const w = size * (0.1 + random() * 0.18);
        const h = size * (0.08 + random() * 0.14);
        ctx.fillRect(random() * (size - w), size * 0.45 + random() * size * 0.5, w, h);
      }
      break;
    }

    case 'column': {
      ctx.clearRect(0, 0, size, size);
      const shaft = size * 0.62;
      const left = (size - shaft) / 2;

      const gradient = ctx.createLinearGradient(left, 0, left + shaft, 0);
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(0.45, accent);
      gradient.addColorStop(1, colors[1] ?? colors[0]);
      ctx.fillStyle = gradient;
      ctx.fillRect(left, 0, shaft, size);

      // Capitel y basa sobresalen del fuste.
      ctx.fillStyle = colors[1] ?? accent;
      ctx.fillRect(left - size * 0.1, 0, shaft + size * 0.2, size * 0.12);
      ctx.fillRect(left - size * 0.1, size * 0.88, shaft + size * 0.2, size * 0.12);

      // Estrias verticales.
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i += 1) {
        const x = left + (shaft / 4) * i;
        ctx.beginPath();
        ctx.moveTo(x, size * 0.12);
        ctx.lineTo(x, size * 0.88);
        ctx.stroke();
      }
      break;
    }

    case 'grassEdge': {
      // Bloque base con una franja de hierba en el borde superior.
      ctx.fillStyle = colors[0];
      ctx.fillRect(0, 0, size, size);

      const band = Math.max(3, size * 0.28);
      ctx.fillStyle = colors[1] ?? accent;
      ctx.fillRect(0, 0, size, band);

      // Briznas que rompen la linea recta del borde.
      ctx.fillStyle = accent;
      for (let x = 0; x < size; x += 2) {
        const blade = band + random() * band * 0.7;
        ctx.fillRect(x, band - 1, 2, blade - band + 2);
      }
      break;
    }

    case 'grassTuft': {
      ctx.clearRect(0, 0, size, size);
      const blades = 7 + Math.floor(detail * 8);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < blades; i += 1) {
        ctx.strokeStyle = random() > 0.5 ? accent : pick(colors, random);
        const baseX = size * (0.15 + random() * 0.7);
        const height = size * (0.3 + random() * 0.45);
        ctx.beginPath();
        ctx.moveTo(baseX, size * 0.95);
        ctx.quadraticCurveTo(
          baseX + (random() - 0.5) * size * 0.3,
          size * 0.95 - height * 0.6,
          baseX + (random() - 0.5) * size * 0.4,
          size * 0.95 - height,
        );
        ctx.stroke();
      }
      break;
    }

    case 'vine': {
      ctx.clearRect(0, 0, size, size);
      const strands = 2 + Math.floor(detail * 2);
      for (let i = 0; i < strands; i += 1) {
        const x = size * (0.2 + (i / strands) * 0.6);
        ctx.strokeStyle = colors[i % colors.length];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        for (let y = 0; y <= size; y += size / 4) {
          ctx.lineTo(x + Math.sin(y / 6 + i) * size * 0.1, y);
        }
        ctx.stroke();

        // Hojas repartidas a lo largo del tallo.
        for (let leaf = 0; leaf < 3; leaf += 1) {
          const ly = size * (0.15 + leaf * 0.3 + random() * 0.1);
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.ellipse(
            x + (random() > 0.5 ? 1 : -1) * size * 0.14,
            ly,
            size * 0.1,
            size * 0.06,
            random() * Math.PI,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      break;
    }

    case 'cobble': {
      const stones = 5;
      const cell = size / stones;
      for (let y = 0; y < stones; y += 1) {
        for (let x = 0; x < stones; x += 1) {
          ctx.fillStyle = random() > 0.5 ? (colors[1] ?? accent) : colors[0];
          const inset = 0.5 + random();
          ctx.beginPath();
          ctx.ellipse(
            (x + 0.5) * cell,
            (y + 0.5) * cell,
            cell / 2 - inset,
            cell / 2 - inset,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      break;
    }

    case 'thatch': {
      const rows = 5;
      const rowHeight = size / rows;
      for (let row = 0; row < rows; row += 1) {
        ctx.fillStyle = row % 2 === 0 ? colors[0] : (colors[1] ?? accent);
        ctx.fillRect(0, row * rowHeight, size, rowHeight);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.4;
        for (let i = 0; i < 5; i += 1) {
          const x = random() * size;
          ctx.beginPath();
          ctx.moveTo(x, row * rowHeight);
          ctx.lineTo(x + random() * 3 - 1.5, (row + 1) * rowHeight);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      break;
    }

    case 'metal': {
      const gradient = ctx.createLinearGradient(0, 0, 0, size);
      gradient.addColorStop(0, colors[1] ?? accent);
      gradient.addColorStop(0.5, colors[0]);
      gradient.addColorStop(1, colors[1] ?? accent);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      // Remaches en las esquinas.
      ctx.fillStyle = accent;
      const inset = size * 0.16;
      for (const [rx, ry] of [
        [inset, inset],
        [size - inset, inset],
        [inset, size - inset],
        [size - inset, size - inset],
      ]) {
        ctx.beginPath();
        ctx.arc(rx, ry, Math.max(1, size * 0.05), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'glass': {
      ctx.fillStyle = colors[0];
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(size * 0.12, size * 0.12, size * 0.76, size * 0.76);
      ctx.globalAlpha = 0.85;
      // Reflejo diagonal.
      ctx.beginPath();
      ctx.moveTo(size * 0.15, size * 0.75);
      ctx.lineTo(size * 0.55, size * 0.15);
      ctx.lineTo(size * 0.7, size * 0.15);
      ctx.lineTo(size * 0.3, size * 0.75);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }

    case 'fabric': {
      ctx.fillStyle = colors[0];
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = colors[1] ?? accent;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      for (let i = 0; i < size; i += 3) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(size, i);
        ctx.moveTo(i, 0);
        ctx.lineTo(i, size);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Ribete.
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, size - 2, size - 2);
      break;
    }

    case 'wood': {
      ctx.fillStyle = colors[0];
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = colors[1] ?? accent;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 5; i += 1) {
        const y = (size / 5) * i + random() * 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(size * 0.3, y + 2, size * 0.6, y - 2, size, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, size - 2, size - 2);
      break;
    }

    case 'roofTile': {
      const rows = 4;
      const rowHeight = size / rows;
      for (let row = 0; row < rows; row += 1) {
        const offset = row % 2 === 0 ? 0 : size / 6;
        for (let x = -1; x < 4; x += 1) {
          ctx.fillStyle = row % 2 === 0 ? colors[0] : (colors[1] ?? accent);
          ctx.beginPath();
          ctx.moveTo(offset + x * (size / 3), (row + 1) * rowHeight);
          ctx.lineTo(offset + x * (size / 3) + size / 6, row * rowHeight);
          ctx.lineTo(offset + (x + 1) * (size / 3), (row + 1) * rowHeight);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      for (let row = 1; row < rows; row += 1) {
        ctx.beginPath();
        ctx.moveTo(0, row * rowHeight);
        ctx.lineTo(size, row * rowHeight);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }

    case 'window': {
      ctx.fillStyle = colors[0];
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = accent;
      ctx.fillRect(size * 0.15, size * 0.15, size * 0.7, size * 0.7);
      ctx.strokeStyle = colors[1] ?? colors[0];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(size * 0.5, size * 0.15);
      ctx.lineTo(size * 0.5, size * 0.85);
      ctx.moveTo(size * 0.15, size * 0.5);
      ctx.lineTo(size * 0.85, size * 0.5);
      ctx.stroke();
      break;
    }

    case 'flame': {
      ctx.clearRect(0, 0, size, size);
      // Soporte.
      ctx.fillStyle = colors[0];
      ctx.fillRect(size * 0.42, size * 0.45, size * 0.16, size * 0.5);

      // Llama con halo.
      const glow = ctx.createRadialGradient(
        size * 0.5,
        size * 0.35,
        1,
        size * 0.5,
        size * 0.35,
        size * 0.42,
      );
      glow.addColorStop(0, accent);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(size * 0.5, size * 0.1);
      ctx.quadraticCurveTo(size * 0.72, size * 0.35, size * 0.5, size * 0.5);
      ctx.quadraticCurveTo(size * 0.28, size * 0.35, size * 0.5, size * 0.1);
      ctx.fill();
      break;
    }

    case 'statue': {
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = colors[1] ?? accent;
      // Pedestal.
      ctx.fillRect(size * 0.2, size * 0.82, size * 0.6, size * 0.18);

      ctx.fillStyle = colors[0];
      // Torso y cabeza: silueta sugerida, no una figura detallada.
      ctx.beginPath();
      ctx.moveTo(size * 0.38, size * 0.82);
      ctx.lineTo(size * 0.42, size * 0.38);
      ctx.lineTo(size * 0.58, size * 0.38);
      ctx.lineTo(size * 0.62, size * 0.82);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.28, size * 0.11, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    }

    case 'railing': {
      ctx.clearRect(0, 0, size, size);
      const post = Math.max(2, size * 0.1);
      ctx.fillStyle = colors[0];
      // Pasamanos superior.
      ctx.fillRect(0, size * 0.22, size, post);
      // Balaustres.
      for (let i = 0; i < 4; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? colors[0] : (colors[1] ?? accent);
        ctx.fillRect(size * (0.12 + i * 0.25), size * 0.22, post, size * 0.6);
      }
      ctx.fillStyle = accent;
      ctx.fillRect(0, size * 0.18, size, 2);
      break;
    }

    case 'wheel': {
      ctx.clearRect(0, 0, size, size);
      // Carroceria.
      ctx.fillStyle = colors[0];
      ctx.fillRect(size * 0.1, size * 0.3, size * 0.8, size * 0.38);
      ctx.fillStyle = accent;
      ctx.fillRect(size * 0.22, size * 0.34, size * 0.3, size * 0.16);

      // Ruedas.
      ctx.fillStyle = colors[1] ?? '#1a1a1a';
      for (const wx of [size * 0.28, size * 0.72]) {
        ctx.beginPath();
        ctx.arc(wx, size * 0.74, size * 0.14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      break;
    }

    case 'signpost': {
      ctx.clearRect(0, 0, size, size);
      // Poste.
      ctx.fillStyle = colors[0];
      ctx.fillRect(size * 0.45, size * 0.3, size * 0.1, size * 0.65);

      // Tabla con punta de flecha.
      ctx.fillStyle = colors[1] ?? colors[0];
      ctx.beginPath();
      ctx.moveTo(size * 0.1, size * 0.18);
      ctx.lineTo(size * 0.78, size * 0.18);
      ctx.lineTo(size * 0.92, size * 0.31);
      ctx.lineTo(size * 0.78, size * 0.44);
      ctx.lineTo(size * 0.1, size * 0.44);
      ctx.closePath();
      ctx.fill();

      // Renglones que sugieren texto.
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(size * 0.2, size * 0.27);
      ctx.lineTo(size * 0.66, size * 0.27);
      ctx.moveTo(size * 0.2, size * 0.35);
      ctx.lineTo(size * 0.56, size * 0.35);
      ctx.stroke();
      break;
    }

    default:
      break;
  }

  paintOverlay(ctx, visual, size, random);
}

/**
 * Detalle superpuesto e independiente del patron: permite ensuciar cualquier
 * material sin duplicar su dibujo (piedra con musgo, madera mojada, suelo con
 * nieve encima).
 */
function paintOverlay(
  ctx: CanvasRenderingContext2D,
  visual: VisualDescriptor,
  size: number,
  random: () => number,
): void {
  if (!visual.overlay) {
    return;
  }

  ctx.save();

  switch (visual.overlay) {
    case 'moss':
      ctx.fillStyle = 'rgba(74, 128, 64, 0.5)';
      for (let i = 0; i < 14; i += 1) {
        ctx.beginPath();
        ctx.arc(random() * size, random() * size, 1 + random() * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'snow':
      ctx.fillStyle = 'rgba(238, 244, 248, 0.85)';
      ctx.fillRect(0, 0, size, Math.max(2, size * 0.18));
      for (let i = 0; i < 10; i += 1) {
        ctx.fillRect(random() * size, random() * size * 0.4, 1, 1);
      }
      break;

    case 'wet':
      ctx.fillStyle = 'rgba(30, 60, 90, 0.28)';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(180, 220, 240, 0.35)';
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.ellipse(random() * size, random() * size, size * 0.12, size * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'soot':
      ctx.fillStyle = 'rgba(20, 18, 18, 0.35)';
      for (let i = 0; i < 12; i += 1) {
        ctx.beginPath();
        ctx.arc(random() * size, random() * size, 1 + random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'cracks':
    case 'rubble':
      // Ya los dibuja su propio patron; el overlay no anade nada.
      break;
  }

  ctx.restore();
}
