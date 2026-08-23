/**
 * ---------------------------------------------------------------------------
 *  Ensamblado del prompt de sprite
 * ---------------------------------------------------------------------------
 *  El prompt se montaba en TRES sitios distintos que se pisaban entre si, y el
 *  resultado medido sobre una generacion real eran 2810 caracteres que
 *  empezaban asi:
 *
 *    "dead center composition, perfectly centered isolated subject,
 *     symmetrical placement, centered in frame, flat solid colors, unlit
 *     texture, diffuse studio flash, even ambient illumination, vector flat
 *     art, 2D video game asset, isolated on pure solid white background,
 *     flat plain white backdrop, no split background, entity: ..."
 *
 *  Cuatro formas de decir "centrado" y tres de decir "fondo blanco" antes de
 *  llegar al personaje. Es herencia de la epoca de los pesos, cuando repetir un
 *  concepto era la manera de subirle la importancia.
 *
 *  Ese razonamiento ya no aplica aqui, y se comprobo de dos formas
 *  independientes:
 *
 *  1. `comfy/text_encoders/z_image.py` llama a `tokenize_with_weights` con
 *     `disable_weights=True`, asi que "(termino:1.4)" no pondera nada.
 *  2. Medido con semilla fija: "a blue apple" da B=198 y "a (blue:0.1) apple"
 *     da B=198 tambien. Si el peso se aplicara, el 0,1 habria borrado el azul.
 *     El control con "a red apple" da R=186, luego el metodo detecta cambios.
 *
 *  Y hay un tercer dato que decide el ESTILO de redaccion. En el mismo fichero:
 *
 *    llama_template = "<|im_start|>user\\n{}<|im_end|>\\n<|im_start|>assistant\\n"
 *
 *  El prompt viaja envuelto en una plantilla de CHAT: llega a Qwen3 como un
 *  mensaje de un usuario a un asistente. Por eso funciona la prosa bien
 *  formada y falla la sopa de etiquetas; y por eso repetirse es peor que
 *  inutil, porque en una conversacion suena a alguien que no se aclara.
 *
 *  Aqui se ensambla UNA vez, en orden, y cada idea se dice UNA vez.
 * ---------------------------------------------------------------------------
 */

export type SpriteBackground = 'white' | 'chromakey' | 'transparent' | 'custom';

export interface SpritePromptInput {
  /**
   * Palabra de activacion del LoRA cargado.
   *
   * Va la PRIMERA y LITERAL, sin tocar. Muchos LoRAs solo se activan si su
   * palabra aparece tal cual: reescribirla, traducirla o envolverla en pesos
   * puede impedir que el LoRA haga efecto, y entonces el usuario ve que su
   * LoRA "no funciona" sin saber por que.
   */
  triggerWords?: string;
  /** Sujeto y detalles: lo que el usuario pidio. Va primero siempre. */
  subject: string;
  /** Pose o accion, en prosa. Null si la accion no esta catalogada. */
  pose: string | null;
  /** Rasgos tecnicos del estilo artistico elegido. */
  styleTraits: string;
  background: SpriteBackground;
  is3DStyle?: boolean;
  /** Negativos heredados: del usuario, del estilo y de la pose. */
  negatives: string[];
}

/** Una frase por idea. Sin sinonimos apilados. */
const BACKGROUND_CLAUSE: Record<SpriteBackground, string> = {
  white: 'isolated on a plain solid white background',
  chromakey: 'isolated on a uniform flat neon green background, hex #00FF00',
  transparent: 'isolated on a plain solid white background',
  custom: 'naturally situated within the surrounding environment and background scenery',
};

/**
 * Encuadre y acabado, dicho una sola vez.
 *
 * `symmetrical` se omite en las poses de accion: un ataque o una caminata son
 * asimetricos por definicion, y pedir simetria ahi congela la pose.
 */
function framingClause(isAction: boolean, background: SpriteBackground, is3DStyle?: boolean): string {
  if (background === 'custom') {
    return isAction
      ? 'The subject is dynamically integrated into the described environment and scenery with realistic ground contact and environmental lighting.'
      : 'The subject is naturally integrated into the described environment and scenery with realistic ground contact, environmental lighting, and rich atmospheric depth.';
  }

  const centring = isAction
    ? 'The subject is centred in the frame with even margins on all sides and the whole body inside the image'
    : 'The subject is centred in the frame, symmetrical, with even margins on all sides and the whole body inside the image';

  const styleFinish = is3DStyle
    ? 'clean studio illumination, neutral environment, isolated 3D character asset under even diffuse light with no cast shadows and no ground plane'
    : 'drawn as a flat unlit 2D game asset under even diffuse light with no cast shadows and no ground plane';

  return `${centring}, ${styleFinish}, ${BACKGROUND_CLAUSE[background]}.`;
}

/** Negativos comunes a cualquier sprite recortado en estudio. */
const SPRITE_BASE_NEGATIVE = [
  'shadow',
  'drop shadow',
  'ground shadow',
  'cast shadow',
  'ambient occlusion',
  'ground',
  'floor',
  'directional lighting',
  'spotlight',
  'off-center',
  'cropped',
  'out of frame',
  'cut off',
  'split background',
  'gradient background',
  'sticker',
  'white border',
  'capsule background',
  'badge',
  'watermark',
  'text',
  'signature',
  'blurry',
  'low quality',
];

/** Negativos cuando el usuario pide un entorno / fondo personalizado (no excluye suelo ni sombras naturales) */
const CUSTOM_SCENE_BASE_NEGATIVE = [
  'cropped',
  'out of frame',
  'cut off',
  'sticker',
  'white border',
  'capsule background',
  'badge',
  'watermark',
  'text',
  'signature',
  'blurry',
  'low quality',
  'distorted',
  'duplicate'
];

/** Quita duplicados conservando el orden de aparicion. */
function dedupe(terms: string[]): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];

  for (const bruto of terms) {
    for (const t of bruto.split(',')) {
      const limpio = t.trim();
      const clave = limpio.toLowerCase();
      if (limpio && !vistos.has(clave)) {
        vistos.add(clave);
        salida.push(limpio);
      }
    }
  }

  return salida;
}

/**
 * Ensambla el prompt final en un orden fijo: QUIEN, QUE HACE, COMO SE DIBUJA,
 * COMO SE ENCUADRA. El sujeto primero porque es lo que no puede perderse; el
 * encuadre al final porque es una restriccion, no el tema.
 */
export interface AssembledPrompt {
  positive: string;
  negative: string;
  /** Cada idea por separado, para poder reescribirla en otro dialecto. */
  parts: { trigger: string; subject: string; pose: string; style: string; framing: string };
}

export function assembleSpritePrompt(input: SpritePromptInput): AssembledPrompt {
  const isAction = /attack|walk|jump|running|mid-stride|mid-air/i.test(input.pose ?? '');

  const partes = [
    // La palabra de activacion abre el prompt y no se toca.
    input.triggerWords?.trim() ? input.triggerWords.trim().replace(/[,.\s]+$/, '') + '.' : '',
    input.subject.trim().replace(/[,.\s]+$/, '') + '.',
    input.pose ? input.pose.trim().replace(/[,.\s]+$/, '') + '.' : '',
    input.styleTraits ? `Rendered in ${input.styleTraits.trim().replace(/[,.\s]+$/, '')}.` : '',
    framingClause(isAction, input.background, input.is3DStyle),
  ].filter(Boolean);

  const baseNegs = input.background === 'custom' ? CUSTOM_SCENE_BASE_NEGATIVE : SPRITE_BASE_NEGATIVE;

  return {
    positive: partes.join(' '),
    negative: dedupe([...input.negatives, baseNegs.join(', ')]).join(', '),
    // Las partes se devuelven por separado para poder reescribirlas en otro
    // dialecto sin volver a montarlas: el contenido es el mismo, cambia la
    // forma de decirlo. Ver `toWeightedTags`.
    parts: {
      trigger: input.triggerWords?.trim() ?? '',
      subject: input.subject.trim().replace(/[,.\s]+$/, ''),
      pose: input.pose?.trim() ?? '',
      style: input.styleTraits?.trim() ?? '',
      framing: framingClause(isAction, input.background, input.is3DStyle),
    },
  };
}

/**
 * Reescribe el prompt en el dialecto de un codificador CLIP.
 *
 * Un CLIP se entrena con listas de etiquetas, trocea el texto cada 77 tokens y
 * responde a los pesos. Mandarle la misma prosa que a un modelo de lenguaje
 * funciona, pero llega sin enfasis y repartida en cuatro bloques donde lo
 * importante se diluye.
 *
 * No se atomiza la prosa en etiquetas sueltas -eso perderia matices que si
 * aportan- sino que se pondera POR BLOQUE, que es sintaxis valida de ComfyUI y
 * marca la jerarquia: quien es pesa mas que como se encuadra.
 *
 * Los pesos no son arbitrarios: la pose es lo que mas falla cuando se ignora,
 * de ahi que lleve el mayor; el encuadre va sin peso porque es una restriccion
 * que el modelo respeta sin insistir.
 */
export function toWeightedTags(parts: {
  trigger: string;
  subject: string;
  pose: string;
  style: string;
  framing: string;
}): string {
  const bloques: string[] = [];
  const limpio = (t: string) => t.trim().replace(/[.\s]+$/, '');

  // La palabra de activacion va primera y SIN ponderar: envolverla en
  // parentesis es arriesgado y no hace falta, porque ya ocupa la posicion de
  // maximo peso por si sola.
  if (parts.trigger) bloques.push(limpio(parts.trigger));
  if (parts.subject) bloques.push(`(${limpio(parts.subject)}:1.2)`);
  if (parts.pose) bloques.push(`(${limpio(parts.pose)}:1.4)`);
  if (parts.style) bloques.push(`(${limpio(parts.style)}:1.3)`);
  if (parts.framing) bloques.push(limpio(parts.framing));

  return bloques.join(', ');
}

/** Tokens aproximados. Suficiente para avisar, no para contar exacto. */
export function approximateTokens(text: string): number {
  return Math.ceil(text.trim().length / 3.5);
}
