/**
 * ---------------------------------------------------------------------------
 *  Hoja de modelo por composicion
 * ---------------------------------------------------------------------------
 *  Pedirle al modelo las cuatro vistas EN UNA SOLA IMAGEN fallo cinco veces
 *  seguidas, y cada vez de una forma distinta: tres figuras con dos repetidas,
 *  cinco con una cortada, seis con una corrupta. El numero de figuras no es
 *  algo que un modelo de difusion controle, porque llena el ancho disponible.
 *
 *  Pero hay un problema mayor que el conteo, y es de aritmetica: cuatro
 *  personajes en un lienzo de 2048 px reciben ~512 px cada uno. Las imagenes
 *  buenas de este proyecto son de UNA figura ocupando ~1900 px. Son dieciseis
 *  veces menos superficie por personaje, y ningun prompt arregla eso.
 *
 *  Asi que se generan CUATRO IMAGENES, cada una con una sola figura a
 *  resolucion completa, y se componen aqui. Cuatro pasadas de 8 pasos son unos
 *  20 segundos en una RTX 3090.
 *
 *  El coste es el tiempo. La ganancia es que cada vista tiene el detalle de un
 *  retrato individual, que siempre son exactamente cuatro, y que ninguna sale
 *  cortada.
 * ---------------------------------------------------------------------------
 */

/**
 * Limpia el texto del sujeto para una pasada de UNA sola vista.
 *
 * Este fue el fallo que produjo dieciseis dinosaurios: cada pasada recibia el
 * sujeto tal cual, y ese sujeto dice `Action: Model Sheet` y arrastra los
 * detalles que escribio el refinador, que describen "cuatro figuras en una
 * fila horizontal, misma escala, linea de suelo comun".
 *
 * Es decir: se pedian cuatro hojas de modelo y luego se componian. El
 * resultado eran cuatro paneles con cuatro dinosaurios cada uno.
 *
 * Aqui se quita del sujeto todo lo que hable de la MAQUETACION de la hoja,
 * conservando intacto lo que describe AL PERSONAJE, que es lo unico que debe
 * repetirse en las cuatro pasadas.
 */
const SHEET_LAYOUT_PHRASES: RegExp[] = [
  /character\s+model\s+sheet[^.]*/gi,
  /model\s+sheet[^.]*/gi,
  /turnaround[^.]*/gi,
  /(exactly\s+)?(four|three|five|4|3|5)\s+(separate\s+)?(figures|views|poses|characters)[^.]*/gi,
  /in\s+one\s+horizontal\s+row[^.]*/gi,
  /lined\s+up\s+side\s+by\s+side[^.]*/gi,
  /shared\s+ground\s+line[^.]*/gi,
  /common\s+ground\s+line[^.]*/gi,
  /evenly\s+spaced[^.]*/gi,
  /same\s+scale[^.]*/gi,
  /(front|rear|back|side|profile)\s+view\s+(then|and)[^.]*/gi,
  /at\s+(0|90|180|270)\s+degrees[^.]*/gi,
  /action:\s*model\s+sheet\s*,?/gi,
  /every\s+(view|figure)[^.]*/gi,
  /in\s+(all|every)\s+four[^.]*/gi,
  /\b(all|every)\s+four\b[^.]*/gi,
  // Etiqueta que se queda huerfana al retirar su valor.
  // Referencias de angulo y de vista que deja el refinador: si sobreviven,
  // el prompt de la vista de 90 grados tambien dice 0 y se contradice.
  /\b(at|in|from)\s+(a\s+)?(0|90|180|270)[- ]?(degree|degrees|deg)\b[^.]*/gi,
  /\b(0|90|180|270)[- ]?(degree|degrees|deg)\b[^.]*/gi,
  /\b(front|rear|back|side|profile|three[- ]quarter)\s+view\b[^.]*/gi,
  /\bseen\s+from\b[^.]*/gi,
  /\bfacing\s+the\s+(camera|viewer)\b[^.]*/gi,
  // Etiqueta que queda sin valor detras.
  /\b(action|style|details):\s*(?=[.,]|$)/gi,
];

export function subjectForSingleView(subject: string): string {
  let limpio = subject;
  for (const re of SHEET_LAYOUT_PHRASES) {
    limpio = limpio.replace(re, ' ');
  }
  return limpio
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/([,.])(?=[A-Za-z])/g, '$1 ')
    // Al retirar una frase, la puntuacion queda pegada a la siguiente
    // palabra: se restituye el espacio.
    .replace(/([,.])(?=[A-Za-z])/g, '$1 ')
    .replace(/([,.])[\s,.]*/g, '$1')
    .replace(/,\s*\./g, '.')
    .replace(/^[\s,.]+/, '')
    .trim();
}

/**
 * Neutraliza la agresividad del texto del personaje.
 *
 * El refinador describe "un T-Rex agresivo con las fauces abiertas y mirada
 * feroz", que es perfecto para una pose de ataque y contradictorio para una
 * hoja de rotacion: en un turnaround el personaje esta quieto y neutro, para
 * que se lea su anatomia y no su actitud.
 *
 * No se borran esos rasgos, se DESACTIVAN: las cicatrices y la sangre son
 * disenio del personaje y deben quedarse; lo que se quita es la accion.
 */
const AGGRESSION_PHRASES: RegExp[] = [
  /(aggressive|fierce|ferocious|menacing|furious|enraged|snarling|roaring|attacking|lunging|charging|hunting)/gi,
  /(jaws?|mouth)\s+(wide\s+)?open/gi,
  /open\s+(jaws?|mouth|maw)/gi,
  /baring\s+(its\s+)?teeth/gi,
  /(aggressive|menacing|fierce|predatory)\s+(gaze|stare|expression|pose|stance)/gi,
  /mid[- ](attack|strike|roar|lunge)/gi,
];

export function neutraliseForTurnaround(subject: string): string {
  let limpio = subject;
  for (const re of AGGRESSION_PHRASES) {
    limpio = limpio.replace(re, ' ');
  }
  return (
    limpio
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.])/g, '$1')
    .replace(/([,.])(?=[A-Za-z])/g, '$1 ')
      .replace(/,\s*\./g, '.')
      .trim() +
    ' The creature stands completely still in a calm neutral resting stance with its mouth closed and a relaxed expression.'
  );
}

/**
 * Prompt para la hoja completa en UNA sola generacion.
 *
 * Solo tiene sentido con un workflow que traiga un LoRA de giro: el giro lo
 * aporta el LoRA, no el texto.
 *
 * El SUJETO VA PRIMERO, y no es un detalle de estilo. Se probo al reves -la
 * maquetacion de la hoja delante y el sujeto al final- y el resultado fue una
 * hoja de giro perfecta de un personaje EQUIVOCADO: el LoRA impuso su propio
 * sesgo (esta entrenado con humanoides) y el sujeto pedido se perdio entero.
 * Es el mismo fallo que se corrigio en `promptAssembly.ts`, que aqui vuelve a
 * aparecer porque la maquetacion compite con el sujeto por la atencion.
 *
 * Tampoco se piden angulos concretos: el LoRA decide cuantas vistas caben y en
 * que orden, y enumerarlas por encima suele dar figuras repetidas.
 */
export function singlePassSheetPrompt(subject: string): string {
  const limpio = subject.trim().replace(/[,.\s]+$/, '');

  return (
    `${limpio}. ` +
    'Character turnaround sheet: the same character repeated in a single horizontal row, ' +
    'each figure seen from a different angle, front view and side view and back view, ' +
    'identical design, identical colours and identical proportions in every figure, ' +
    'standing still in a calm neutral resting stance, ' +
    'even flat lighting with no cast shadows, plain white background.'
  );
}

/**
 * Negativo para la pasada unica.
 *
 * `human` y `humanoid` estan aqui porque los LoRAs de giro se entrenan casi
 * siempre con personajes humanos y arrastran esa anatomia a cualquier sujeto.
 * Solo se anaden si el sujeto NO es humano, cosa que decide quien llama.
 */
export const SINGLE_PASS_SHEET_NEGATIVE = [
  'different characters',
  'inconsistent design',
  'colour shift between figures',
  'overlapping figures',
  'cropped figures',
  'text',
  'labels',
  'watermark',
];

export interface SheetView {
  key: string;
  /** Etiqueta para la interfaz mientras genera. */
  label: string;
  /** Frase que sustituye a la pose en el prompt de esa pasada. */
  clause: string;
}

/**
 * Las cuatro vistas, descritas por ANGULO DE ROTACION.
 *
 * Se nombran asi y no por "izquierda" o "derecha" porque los modelos de
 * difusion aterrizan mal las referencias al lienzo, y porque 0-90-180-270 es el
 * vocabulario de las hojas de rotacion reales.
 *
 * Cada frase describe lo que SE VE, no como se llama la vista: nombrar "vista
 * trasera" no basta cuando el sesgo del modelo empuja hacia la cara.
 */
export const SHEET_VIEWS: SheetView[] = [
  {
    key: 'front',
    label: 'Frente',
    clause:
      'a single solitary figure completely alone in the image, only one character and nothing else, standing still in a calm neutral resting pose seen from directly in front, facing the camera, the face and chest fully visible, both sides of the body equally visible and symmetrical',
  },
  {
    key: 'left',
    label: 'Perfil izquierdo',
    clause:
      'a single solitary figure completely alone in the image, only one character and nothing else, standing still in a calm neutral resting pose seen in full side profile, the body turned a quarter turn so only one flank faces the camera, one eye visible in profile, the tail extending away behind the body',
  },
  {
    key: 'back',
    label: 'Espalda',
    clause:
      'a single solitary figure completely alone in the image, only one character and nothing else, standing still in a calm neutral resting pose seen from directly behind, showing the back of the head, the spine and the backs of the legs, with the face completely hidden and no eyes, no mouth and no belly visible, the tail pointing toward the camera',
  },
];

/**
 * Espeja una imagen horizontalmente.
 *
 * El perfil opuesto NO se le pide al modelo: se deriva. Medido con semilla fija
 * y tres redacciones distintas -incluida una instruccion de chat directa-, este
 * modelo devuelve siempre el mismo perfil izquierdo, asi que pedirle el derecho
 * es gastar una pasada para obtener un duplicado.
 *
 * El espejo es legitimo aqui porque la hoja exige luz plana sin sombras
 * proyectadas: sin luz direccional, voltear no introduce ningun error. En un
 * personaje asimetrico -una cicatriz en una mejilla, la espada en una cadera-
 * si cambiaria de lado, y por eso se avisa en la interfaz.
 */
export async function mirrorDataUrl(src: string): Promise<string> {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  if (!ctx) {
    throw new Error('Sin contexto de canvas');
  }
  ctx.imageSmoothingEnabled = false;
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}

/**
 * Detecta si las vistas salieron practicamente iguales.
 *
 * Es la comprobacion que faltaba: si el modelo no sabe girar al personaje,
 * componer una hoja con cuatro perfiles identicos produce un documento inutil
 * sin decirlo. Mejor avisar.
 *
 * Se comparan miniaturas en escala de grises: basta para distinguir un frente
 * de un perfil, y no se deja enganar por diferencias de detalle fino.
 */
export async function viewsLookIdentical(images: string[]): Promise<boolean> {
  if (images.length < 2) {
    return false;
  }

  const N = 24;
  const firmas: number[][] = [];

  for (const src of images) {
    const img = await loadImage(src);
    const c = document.createElement('canvas');
    c.width = N;
    c.height = N;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return false;
    }
    ctx.drawImage(img, 0, 0, N, N);
    const d = ctx.getImageData(0, 0, N, N).data;
    const gris: number[] = [];
    for (let k = 0; k < d.length; k += 4) {
      gris.push(d[k + 3] < 24 ? 255 : (d[k] * 299 + d[k + 1] * 587 + d[k + 2] * 114) / 1000);
    }
    firmas.push(gris);
  }

  // Diferencia media entre cada par. Dos vistas distintas de un mismo
  // personaje difieren bastante; dos casi iguales, muy poco.
  let peor = Infinity;
  for (let a = 0; a < firmas.length; a += 1) {
    for (let b = a + 1; b < firmas.length; b += 1) {
      let suma = 0;
      for (let k = 0; k < firmas[a].length; k += 1) {
        suma += Math.abs(firmas[a][k] - firmas[b][k]);
      }
      peor = Math.min(peor, suma / firmas[a].length);
    }
  }

  // Umbral empirico: por debajo de 8 niveles de gris de diferencia media, dos
  // vistas son la misma imagen con variaciones de detalle.
  return peor < 8;
}


/**
 * Recorta el contenido util de una imagen.
 *
 * Cada pasada devuelve una figura centrada con mucho aire alrededor; al
 * componer, ese aire se convertiria en separaciones enormes y desiguales. Se
 * busca la caja del contenido real barriendo filas y columnas y descartando lo
 * que sea fondo.
 *
 * Se admite fondo blanco o transparente, que son los dos modos del generador.
 */
function contentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3];
      if (alpha < 24) {
        continue;
      }
      // Tolerancia amplia: el borde suavizado de un sprite sobre blanco no es
      // 255 exacto, y un umbral estricto recortaria la silueta.
      const casiBlanco = data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240;
      if (casiBlanco) {
        continue;
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null;
  }

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar una de las vistas generadas'));
    img.src = src;
  });
}

/**
 * Compone las cuatro vistas en una hoja.
 *
 * Dos decisiones de maquetacion:
 *
 * - Se escalan todas por el MISMO factor, calculado con la figura mas alta.
 *   Escalar cada una para que llene su celda las dejaria de tamanos distintos,
 *   y una hoja de modelo cuya utilidad es comparar proporciones no puede
 *   mentir sobre el tamano.
 *
 * - Se alinean por el borde INFERIOR de su contenido, no por el centro: las
 *   cuatro comparten linea de suelo, que es como se lee una hoja real y el
 *   mismo ancla que usa el Y-sort del editor 2D.
 */
export async function composeSheet(
  images: string[],
  options: { background: 'white' | 'transparent'; gap?: number } = { background: 'white' },
): Promise<string> {
  if (images.length === 0) {
    throw new Error('No hay vistas que componer');
  }

  const cargadas = await Promise.all(images.map(loadImage));

  // Se recorta cada vista a su contenido.
  const recortes = cargadas.map((img) => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Sin contexto de canvas');
    }
    ctx.drawImage(img, 0, 0);
    const datos = ctx.getImageData(0, 0, c.width, c.height);
    const caja = contentBounds(datos.data, c.width, c.height) ?? {
      x: 0,
      y: 0,
      w: c.width,
      h: c.height,
    };
    return { img, caja };
  });

  const escala = 1; // Todas vienen del mismo tamano de latente.
  const alturaMax = Math.max(...recortes.map((r) => r.caja.h));
  const gap = options.gap ?? Math.round(alturaMax * 0.12);
  const margen = Math.round(alturaMax * 0.1);

  const anchoTotal =
    recortes.reduce((suma, r) => suma + r.caja.w * escala, 0) +
    gap * (recortes.length - 1) +
    margen * 2;
  const altoTotal = alturaMax * escala + margen * 2;

  const hoja = document.createElement('canvas');
  hoja.width = Math.round(anchoTotal);
  hoja.height = Math.round(altoTotal);

  const ctx = hoja.getContext('2d');
  if (!ctx) {
    throw new Error('Sin contexto de canvas');
  }
  ctx.imageSmoothingEnabled = false;

  if (options.background === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, hoja.width, hoja.height);
  }

  // Linea de suelo comun: el borde inferior del contenido de todas.
  const suelo = hoja.height - margen;
  let x = margen;

  for (const { img, caja } of recortes) {
    const w = caja.w * escala;
    const h = caja.h * escala;
    ctx.drawImage(img, caja.x, caja.y, caja.w, caja.h, x, suelo - h, w, h);
    x += w + gap;
  }

  return hoja.toDataURL('image/png');
}
