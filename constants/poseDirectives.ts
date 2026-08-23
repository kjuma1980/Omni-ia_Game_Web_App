/**
 * ---------------------------------------------------------------------------
 *  Poses de sprite
 * ---------------------------------------------------------------------------
 *  De las siete acciones del desplegable, el refinador solo contemplaba cuatro.
 *  T-Pose, Model Sheet y Static Object caian en la rama por defecto y recibian
 *  una sola frase generica -"Focus on character/object design, T-Pose pose,
 *  proportions"- sin una instruccion anatomica. Por eso un T-Rex en T-Pose
 *  salia de frente y centrado, que si estaba pedido, pero con los brazos
 *  pegados al cuerpo: nadie le habia dicho lo contrario.
 *
 *  Dos decisiones que atraviesan todo este archivo:
 *
 *  1. TODO SE ESCRIBE EN POSITIVO. El KSampler de este equipo corre a cfg 1, y
 *     con cfg 1 la formula de guidance `uncond + cfg*(cond - uncond)` se reduce
 *     a `cond`: la rama negativa se cancela entera. Los negativos existen para
 *     otros workflows, pero no se puede depender de ellos. Donde antes ponia
 *     "no bent arms" ahora pone "arms locked straight and horizontal".
 *
 *  2. NADA DE SINTAXIS DE PESOS. ComfyUI desactiva el ponderado por termino en
 *     todos los codificadores basados en LLM (`disable_weights=True`), y el de
 *     este equipo lo es. Un "(strict T-pose:2.5)" no se aplica como peso, y
 *     encima los parentesis y el numero viajan como texto literal hasta el
 *     modelo, que espera prosa. Se escribe en lenguaje natural.
 * ---------------------------------------------------------------------------
 */

export interface PoseDirective {
  /** Instruccion para el refinador. */
  directive: string;
  /** Negativos propios de la pose; sirven en workflows con cfg > 1. */
  negative: string;
}

/**
 * Anatomia por tipo de sujeto. Una T-Pose no se describe igual para un humano
 * que para un T-Rex: el terapodo tiene brazos cortos y una cola larga que hace
 * de contrapeso, y pedirle "brazos extendidos horizontalmente" sin mas produce
 * o bien un lagarto con brazos humanos o bien la pose ignorada.
 */
const TPOSE_ANATOMY = `Adapt the T-pose to the subject's real anatomy, and say which case applies:
   - HUMANS / HUMANOIDS / BIPEDS: both arms held out perfectly straight and
     horizontal, level with the shoulders, elbows locked, palms facing down,
     legs straight and slightly apart, forming a clean capital T silhouette.
   - THEROPODS AND SHORT-ARMED CREATURES (T-Rex, raptors): the small forelimbs
     are still lifted and extended sideways as far as their anatomy allows,
     held out from the ribcage rather than tucked against it, the body upright
     and squared to the camera, the tail straight back and centred so it does
     not break the symmetry. The reference pose is readable even though the
     arms are short.
   - QUADRUPEDS (dogs, horses, big cats): standing square, all four legs
     straight and vertical, evenly spaced, body side-on to nothing — squared to
     the camera, head facing forward, tail straight out.
   - WINGED CREATURES: wings folded flat against the back, NOT spread. The
     spread limbs are the arms or forelimbs, never the wings.`;

export const POSE_DIRECTIVES: Record<string, PoseDirective> = {
  't-pose': {
    directive: `CRITICAL REQUIREMENT — this is a T-POSE RIGGING REFERENCE, not an illustration.
   Its only purpose is to be imported into a rigging tool, so readability of the
   silhouette beats artistic appeal.
   Your positive prompt MUST contain, in plain natural language, all of these:
   "T-pose rigging reference", "limbs extended straight out to the sides",
   "perfectly symmetrical", "standing upright facing the camera",
   "arms held horizontal at shoulder height", "orthographic front view",
   "full body visible from head to feet", "neutral expression".
${TPOSE_ANATOMY}
   State explicitly that the pose is symmetrical, that the limbs are separated
   from the torso with clear open space visible between limb and body, and that
   nothing overlaps or hides another part. Write it as flowing description, not
   as a list of tags.`,
    negative:
      'idle pose, arms at sides, arms down, bent arms, relaxed arms, action pose, dynamic pose, walking, running, asymmetrical pose, three-quarter view, side view, turned body, spread wings, crossed limbs, foreshortening',
  },

  'model sheet': {
    directive: `CRITICAL REQUIREMENT — this is a CHARACTER MODEL SHEET (turnaround), a
   technical document used to build the character in 3D or to animate it.

   THE CHARACTER COMES FIRST. Before describing the sheet, describe WHO this is
   in concrete, specific detail: the exact build and proportions, the colour of
   every part, the markings and patterns, the scars, the gear, the texture of
   the skin or scales or cloth, the shape of the head and the eyes.

   THE FOUR VIEWS, described by ROTATION ANGLE:
   1. 0 DEGREES — front view, the character rotated to face the camera, face and chest fully visible.
   2. 90 DEGREES — profile view, the body rotated a quarter turn, only one flank visible, one eye in profile.
   3. 180 DEGREES — rear view, rotated half a turn. Back of head, spine, and backs of legs visible. NO face, NO eyes, NO chest.
   4. 270 DEGREES — opposite profile view facing the other way.

   COUNT: EXACTLY FOUR figures at the same scale and height on a shared ground line, evenly spaced.`,
    negative:
      'three views, five views, two views, extra figure, cropped figure at the edge, single view, one figure, solo, portrait, close-up, missing rear view, duplicate view, repeated angle, two figures facing the same way, generic design, plain undetailed character, different characters, inconsistent design, varying scale, overlapping figures, dramatic lighting, cast shadows, scenery, background environment',
  },

  'static object': {
    directive: `CRITICAL REQUIREMENT — the subject is an INANIMATE OBJECT (a sword, a barrel,
   a mirror, a candelabrum, a chair, a chest…). It has NO pose, NO anatomy, NO
   face, NO limbs and NO character. Never anthropomorphise it, never give it
   eyes or a body, and never place a person, a hand or a silhouette near it.
   Present it as a single isolated object, upright, centred, complete and entirely inside the frame.
   Use the words "single isolated inanimate object", "centred", "complete object fully in frame", "no living beings".`,
    negative:
      'person, human, humanoid, character, face, eyes, hands, limbs, silhouette of a person, creature, animal, living being, scene, environment, background props, multiple objects, cropped object',
  },

  idle: {
    directive: `CRITICAL REQUIREMENT: your positive prompt MUST state that the subject stands in a relaxed neutral resting pose facing the camera directly, body front-facing, head and face looking straight forward, with arms or forelimbs resting naturally near the torso in a relaxed V-pose stance. Include the phrases "standing resting pose", "relaxed V-pose", and "arms resting naturally near the torso". Do NOT describe limbs spread out horizontally to the sides.`,
    negative:
      'action pose, walking, running, attack pose, jumping, dynamic strike, swinging weapon, t-pose, horizontal arms, extra limbs',
  },

  walk: {
    directive: `CRITICAL REQUIREMENT: your positive prompt MUST describe active walking momentum:
   - HUMANS / HUMANOIDS / BIPEDS: mid-stride, one leg bent and swinging forward while the other extends back, weight carried over the leading foot, arms swinging in opposition to the legs.
   - QUADRUPEDS AND CREATURES: coordinated walking gait with limbs alternating, paws/claws clearly mid-step.
   Include the phrases "natural walking pose", "in mid-stride", and "legs in motion". Describe ONLY character motion. Do NOT add camera perspective tags or world background terms.`,
    negative:
      'front view, standing static, standing still, legs straight down, T-pose, V-pose, rigid posture, frozen posture',
  },

  attack: {
    directive: `CRITICAL REQUIREMENT: your positive prompt MUST describe the character caught mid-attack in a dynamic striking stance: weight committed forward, striking limb or weapon extended along its arc, supporting leg braced, body twisted into the blow, with a fierce, intense, focused facial expression. Include the phrases "dynamic attack pose" and "performing an attack strike". Do NOT add camera perspective keywords like "3/4 side perspective", "three-quarter side perspective", or "world perspective", and NEVER describe a "neutral relaxed expression" or "symmetrical composition".`,
    negative:
      'idle, standing still, peaceful, relaxed, neutral expression, relaxed face, symmetrical pose, t-pose, v-pose, front facing idle',
  },

  jump: {
    directive: `CRITICAL REQUIREMENT: your positive prompt MUST describe a character mid-jump in the air:
   - HUMANS / HUMANOIDS: knees drawn up and bent, feet clearly off the ground with visible air beneath them, body arcing upward.
   - ANIMALS / CREATURES: hind legs flexed and thrust back from push-off, forelimbs tucked or reaching, body suspended in mid-air.
   Include the phrases "dynamic jumping pose", "mid-air jump", "feet off the ground", and "legs bent". Do NOT add camera perspective tags or world background terms.`,
    negative:
      'standing, flat-footed, touching the ground, straight legs, static standing posture, ground contact, legs straight down',
  },
};

/** Directiva de la accion pedida, o null si no esta catalogada. */
export function describePose(action: string): PoseDirective | null {
  return POSE_DIRECTIVES[(action || '').trim().toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
//  Prosa para la generacion directa
// ---------------------------------------------------------------------------

/**
 * Palabras que delatan que el sujeto no es un bipedo humano. La deteccion
 * estaba escrita dos veces en `aiProvider.ts` -una para saltar y otra para
 * caminar- con la misma lista copiada; aqui vive una sola vez.
 */
const CREATURE_HINTS = [
  'dinosaur', 'dino', 'rex', 'raptor', 'beast', 'creature', 'animal', 'dog', 'cat',
  'dragon', 'monster', 'wolf', 'lion', 'tiger', 'horse', 'bear', 'reptile', 'bird',
  'prehistoric', 'lizard', 'serpent', 'snake', 'spider', 'insect', 'quadruped',
  'dinosaurio', 'bestia', 'criatura', 'animal', 'perro', 'gato', 'dragon', 'lobo',
  'caballo', 'oso', 'reptil', 'pajaro', 'ave', 'serpiente', 'arana',
];

export function looksLikeCreature(text: string): boolean {
  const lower = (text || '').toLowerCase();
  return CREATURE_HINTS.some((hint) => lower.includes(hint));
}

/**
 * Encabezado comun de un sprite de personaje. `solo` se queda porque para una
 * pose de un unico personaje es correcto; solo estorbaba en la hoja de modelo,
 * que necesita cuatro figuras.
 */
const SPRITE_HEAD = 'game character sprite';

/**
 * Texto listo para inyectar en el workflow, en prosa y sin sintaxis de pesos.
 *
 * Va aparte de `directive` porque son cosas distintas: `directive` son
 * INSTRUCCIONES PARA UN LLM que va a escribir el prompt, y esto es el PROMPT
 * FINAL que recibe el modelo de imagen. Comparten el conocimiento anatomico,
 * que es lo que no debe duplicarse.
 */
export function directPosePrompt(action: string, subject: string): string | null {
  const key = (action || '').trim().toLowerCase();
  const creature = looksLikeCreature(subject);

  switch (key) {
    case 'idle':
      return `${SPRITE_HEAD}, standing resting pose, relaxed neutral stance, ${
        creature
          ? 'the creature stands squarely on all its legs, body facing the camera, head looking straight forward, forelimbs held slightly away from the body'
          : 'body completely front-facing, head and face looking straight forward, arms held slightly away from the torso in a relaxed V-shaped stance with visible space between arms and body'
      }, weight settled evenly, calm neutral expression, orthographic front view`;

    case 'walk':
      return `${SPRITE_HEAD}, natural walking pose in mid-stride, legs in motion, side profile view, ${
        creature
          ? 'coordinated four-legged walking gait with the limbs alternating, front and hind legs at opposite phases of the step, paws or claws clearly lifted mid-step, body held level and moving forward'
          : 'bipedal walking stride with one leg bent and swinging forward while the other extends back, weight carried over the leading foot, arms swinging in opposition to the legs'
      }, clear forward momentum, the body seen from the side so the full stride reads`;

    case 'attack':
      return `${SPRITE_HEAD}, dynamic attack pose caught mid-strike, three-quarter side perspective, ${
        creature
          ? 'the creature lunges forward with its jaws open or its claws swiping, head thrust toward the target, hind legs braced and pushing, tail counterbalancing the lunge'
          : 'weight committed forward onto the front foot, the striking arm or weapon extended along its arc, the other arm counterbalancing, torso twisted into the blow'
      }, aggressive combat energy, motion clearly readable in the silhouette`;

    case 'jump':
      return `${SPRITE_HEAD}, dynamic jumping pose in mid-air, feet off the ground with clear open air beneath the subject, no ground and no floor visible, side profile view, ${
        creature
          ? 'hind legs flexed and thrust back from the push-off, forelimbs tucked in or reaching forward, body stretched and suspended mid-pounce, tail extended for balance'
          : 'knees drawn up and bent, both feet clearly elevated, arms raised or spread for balance, body arcing upward'
      }, airborne and weightless at the peak of the leap`;

    case 't-pose':
      return `T-pose rigging reference, ${SPRITE_HEAD}, standing upright and facing the camera in a perfectly symmetrical T-pose, limbs extended straight out to the sides at shoulder height with clear open space between each limb and the torso, elbows locked and limbs horizontal, ${
        creature
          ? 'short forelimbs still lifted and held out away from the ribcage rather than tucked against it, wings folded flat against the back if it has any, tail straight back and centred so it does not break the symmetry, legs straight and evenly spaced'
          : 'palms facing down, legs straight and slightly apart, forming a clean capital T silhouette'
      }, orthographic front view, nothing overlapping or hiding another part`;

    case 'model sheet':
      // Las vistas se nombran por ANGULO DE ROTACION y no por "borde izquierdo
      // de la imagen": los modelos de difusion aterrizan mal las referencias
      // espaciales del lienzo, y "frente / izquierda / derecha / espalda"
      // producia dos perfiles mirando al mismo lado. 0-90-180-270 es ademas el
      // vocabulario de las hojas de rotacion reales.
      return `character model sheet turnaround of the same character rotated, exactly four figures in one horizontal row and no more than four, generous empty margin at the far left and far right so no extra figure appears and none is cut off, first the front view at 0 degrees facing the camera with the face visible, second the profile view at 90 degrees showing one flank with the tail behind, third the rear view at 180 degrees from directly behind showing the back of the head and the spine with no face and no eyes and no belly visible, fourth the opposite profile at 270 degrees facing the other way to the second, every figure a different rotation with no repeated angle, all four at the same scale and the same height standing on a shared ground line, evenly spaced with clear separation so no two figures touch, identical colours markings gear and proportions in every view, same neutral standing pose, orthographic, every figure showing the full body from head to feet`;

    case 'static object':
      return `single isolated inanimate object, front elevation view, upright, clean readable silhouette, material and surface detail with visible wear where it would be handled, resting as it naturally would, no living beings and no people anywhere in the image`;

    default:
      return null;
  }
}

/**
 * Un model sheet necesita lienzo apaisado: cuatro vistas en una fila dentro de
 * un cuadrado dejan cada una en un cuarto del ancho, y a 1024 px eso son 256 px
 * por vista, insuficiente para trabajar.
 */
export function suggestedAspectForPose(action: string): string {
  return (action || '').trim().toLowerCase() === 'model sheet' ? '16:9' : '1:1';
}
