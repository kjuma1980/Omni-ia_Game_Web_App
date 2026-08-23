import { ParallaxKind, WorldType } from '../enums';

/**
 * ---------------------------------------------------------------------------
 *  Diseno de prompts para fondos de parallax
 * ---------------------------------------------------------------------------
 *  Un fondo de parallax no es "una imagen bonita del bioma": es una textura con
 *  tres restricciones duras que, si se incumplen, hacen el fondo inservible.
 *
 *  1. TIENE QUE REPETIRSE EN HORIZONTAL SIN COSTURA.
 *     El bucle lo garantiza el muestreo (padding circular en X, ver
 *     `background.service.ts`), pero el prompt tambien ayuda: se pide
 *     explicitamente una distribucion uniforme y sin protagonista, porque un
 *     elemento unico y llamativo delata el punto de repeticion aunque la
 *     costura sea matematicamente perfecta.
 *
 *  2. CADA CAPA TIENE QUE LEERSE A SU DISTANCIA.
 *     La profundidad en 2D se comunica con perspectiva atmosferica: cuanto mas
 *     lejos, menos saturacion, menos contraste y mas mezcla con el color del
 *     cielo. Si la capa lejana tiene el mismo contraste que la media, el
 *     parallax se percibe como un error de renderizado, no como profundidad.
 *
 *  3. NO PUEDE COMPETIR CON EL JUEGO.
 *     Sin personajes, sin objetos que parezcan recogibles, sin texto y sin
 *     marcos. El centro de la capa cercana debe quedar despejado o taparia la
 *     accion.
 *
 *  Ademas, la referencia de los runners (Subway Surfers, Temple Run) marca una
 *  diferencia de composicion: en esos juegos la camara mira al horizonte con
 *  punto de fuga central, asi que el fondo se coloca alto y debe ser simetrico;
 *  en un plataformas lateral el horizonte va bajo y la composicion es libre.
 * ---------------------------------------------------------------------------
 */

export interface BiomePalette {
  /** Nombres de color en ingles: los modelos responden mejor que a hexadecimales. */
  sky: string;
  distant: string;
  mid: string;
  accent: string;
  /** Rasgos caracteristicos del bioma, del mas lejano al mas cercano. */
  farFeatures: string;
  midFeatures: string;
  nearFeatures: string;
  /** Momento del dia / atmosfera dominante. */
  mood: string;
}

/**
 * Paleta por bioma. Es la traduccion del bioma que el usuario elige en el
 * editor al lenguaje que entiende un modelo de imagen.
 */
export const BIOME_PALETTES: Record<string, BiomePalette> = {
  grassland: {
    sky: 'clear cyan-blue sky',
    distant: 'hazy blue-grey',
    mid: 'fresh spring green',
    accent: 'warm golden sunlight',
    farFeatures: 'rolling distant hills and soft mountain ridges',
    midFeatures: 'clusters of round leafy trees and grassy slopes',
    nearFeatures: 'tall grass blades and leafy branches',
    mood: 'bright cheerful midday',
  },
  forest: {
    sky: 'pale teal sky filtered through canopy',
    distant: 'deep blue-green haze',
    mid: 'rich forest green',
    accent: 'dappled amber light shafts',
    farFeatures: 'layered forest ridges fading into mist',
    midFeatures: 'dense tree trunks and thick foliage masses',
    nearFeatures: 'overhanging branches and fern fronds',
    mood: 'calm shaded woodland',
  },
  jungle: {
    sky: 'humid pale turquoise sky',
    distant: 'misty jade green',
    mid: 'vivid tropical green',
    accent: 'bright lime and orange flowers',
    farFeatures: 'steep jungle mountains and distant stone ruins',
    midFeatures: 'palm trees, banana leaves and hanging vines',
    nearFeatures: 'large tropical leaves and dangling lianas',
    mood: 'lush humid adventure',
  },
  desert: {
    sky: 'pale hot sand-yellow sky',
    distant: 'faded dusty ochre',
    mid: 'warm sandstone orange',
    accent: 'burnt sienna shadows',
    farFeatures: 'distant mesas, dunes and eroded rock spires',
    midFeatures: 'sand dunes, dry rock outcrops and sparse cacti',
    nearFeatures: 'dry shrubs and wind-blown sand wisps',
    mood: 'arid sunbaked afternoon',
  },
  tundra: {
    sky: 'cold pale blue-white sky',
    distant: 'icy pale lavender',
    mid: 'cool snow white with blue shadows',
    accent: 'crisp cyan ice highlights',
    farFeatures: 'snow-capped mountain peaks and glacial ridges',
    midFeatures: 'snow-laden pine trees and drifts',
    nearFeatures: 'frosted branches and falling snow specks',
    mood: 'still frozen daylight',
  },
  volcanic: {
    sky: 'dark smoky orange-red sky',
    distant: 'ash grey silhouettes',
    mid: 'charred basalt black',
    accent: 'glowing molten orange',
    farFeatures: 'erupting volcano cones and drifting ash clouds',
    midFeatures: 'jagged obsidian rock and lava fissures',
    nearFeatures: 'charred rock edges and floating embers',
    mood: 'ominous volcanic dusk',
  },
  mountain: {
    sky: 'high altitude deep blue sky',
    distant: 'cold slate blue',
    mid: 'grey granite with green patches',
    accent: 'bright snow white',
    farFeatures: 'towering jagged mountain ranges',
    midFeatures: 'rocky cliffs, boulders and hardy pines',
    nearFeatures: 'rock ledges and alpine shrubs',
    mood: 'crisp thin mountain air',
  },
  swamp: {
    sky: 'murky pale olive sky',
    distant: 'foggy grey-green',
    mid: 'dark moss green and brown',
    accent: 'sickly yellow-green glow',
    farFeatures: 'dead tree silhouettes in thick fog',
    midFeatures: 'twisted mangroves, hanging moss and still water',
    nearFeatures: 'drooping vines and reeds',
    mood: 'damp misty gloom',
  },
  cave: {
    sky: 'no sky, dark cavern ceiling',
    distant: 'deep charcoal blue darkness',
    mid: 'wet grey stone',
    accent: 'glowing cyan crystal light',
    farFeatures: 'vast dark cavern depths and distant stalactites',
    midFeatures: 'rock columns, stalagmites and mineral veins',
    nearFeatures: 'foreground rock edges and hanging stalactites',
    mood: 'cold underground darkness',
  },
  dungeon: {
    sky: 'no sky, dark vaulted ceiling',
    distant: 'deep shadow black',
    mid: 'cold grey masonry',
    accent: 'warm torch orange glow',
    farFeatures: 'receding stone arches vanishing into darkness',
    midFeatures: 'carved stone pillars and worn brick walls',
    nearFeatures: 'foreground pillars and iron sconces',
    mood: 'grim torchlit stone corridor',
  },
  castle: {
    sky: 'dramatic blue sky with heavy clouds',
    distant: 'cool stone grey-blue',
    mid: 'weathered pale limestone',
    accent: 'deep crimson banners',
    farFeatures: 'distant castle towers and battlements on hills',
    midFeatures: 'fortress walls, turrets and pennants',
    nearFeatures: 'stone merlons and hanging banners',
    mood: 'stately medieval grandeur',
  },
  village: {
    sky: 'warm afternoon blue sky',
    distant: 'soft hazy blue hills',
    mid: 'terracotta roofs and cream plaster',
    accent: 'warm amber window light',
    farFeatures: 'gentle hills with scattered farmhouses',
    midFeatures: 'timbered cottages, tiled roofs and chimneys',
    nearFeatures: 'fence posts and flowering bushes',
    mood: 'peaceful rural afternoon',
  },
  city: {
    sky: 'bright blue sky with light haze',
    distant: 'pale blue-grey skyline',
    mid: 'clean concrete and glass',
    accent: 'saturated signage colours',
    farFeatures: 'distant skyscraper skyline fading into haze',
    midFeatures: 'mid-rise buildings, billboards and street trees',
    nearFeatures: 'lamp posts and street furniture edges',
    mood: 'busy sunny urban day',
  },
  countryside: {
    sky: 'wide open bright blue sky',
    distant: 'soft blue-green rolling hills',
    mid: 'golden wheat and meadow green',
    accent: 'warm straw yellow',
    farFeatures: 'rolling farmland hills and distant windmills',
    midFeatures: 'hedgerows, haystacks and scattered oak trees',
    nearFeatures: 'wheat stalks and wooden fence rails',
    mood: 'warm open countryside',
  },
  industrial: {
    sky: 'overcast grey-yellow sky',
    distant: 'smoggy steel grey',
    mid: 'rusted metal and concrete',
    accent: 'hazard yellow and rust orange',
    farFeatures: 'distant smokestacks and gantry cranes',
    midFeatures: 'pipework, containers and corrugated sheds',
    nearFeatures: 'pipe runs and chain-link edges',
    mood: 'grimy overcast industrial',
  },
  interior: {
    sky: 'no sky, plain interior wall',
    distant: 'soft shadowed depth',
    mid: 'warm plaster and wood',
    accent: 'warm lamp glow',
    farFeatures: 'distant room depth and doorways',
    midFeatures: 'wall panelling, shelves and windows',
    nearFeatures: 'foreground beams and curtain edges',
    mood: 'cosy warm indoor light',
  },
};

const DEFAULT_PALETTE: BiomePalette = BIOME_PALETTES.grassland;

export function paletteFor(biome: string): BiomePalette {
  return BIOME_PALETTES[biome] ?? DEFAULT_PALETTE;
}

/** Dimensiones recomendadas por capa. Anchas y multiplo de 64 para SDXL. */
export const LAYER_SIZE: Record<ParallaxKind, { width: number; height: number }> = {
  // El cielo es la capa que menos se desplaza, asi que puede ser mas corta en
  // ancho sin que se note la repeticion.
  SKY: { width: 1536, height: 768 },
  FAR: { width: 1536, height: 512 },
  MID: { width: 1536, height: 512 },
  NEAR: { width: 1536, height: 512 },
};

/**
 * Negativo comun. Lo que mas dano hace a un fondo de juego no es que sea feo,
 * sino que contenga cosas que el jugador interprete como jugables: personajes,
 * objetos recogibles, iconos. Por eso el negativo es largo y explicito.
 */
const NEGATIVE_BASE = [
  'character, person, people, human, figure, silhouette of a person, animal, creature',
  'text, letters, words, watermark, signature, logo, ui, hud, interface, icons, buttons',
  'frame, border, vignette, dark corners, rounded corners, canvas edge, torn paper edge',
  'collage, split image, diptych, grid of images, multiple panels',
  'visible seam, mismatched edges, abrupt cut, hard vertical line at edge',
  'photorealistic photo, 3d render, cgi, depth of field blur, lens flare, bokeh',
  'blurry, low quality, jpeg artifacts, noise, oversharpened',
  'foreground objects blocking the center, clutter in the middle',
].join(', ');

/** Reglas de composicion por capa: lo que define que la capa cumpla su papel. */
const LAYER_RULES: Record<ParallaxKind, string[]> = {
  SKY: [
    'ONLY sky and clouds, absolutely no ground, no horizon line, no mountains, no trees',
    'soft evenly spaced clouds spread across the whole width, no single dominant cloud',
    'very low contrast, high brightness, gentle vertical gradient',
    'the image must read as empty and calm; it sits behind everything else',
  ],
  FAR: [
    'distant background silhouettes only, seen from very far away',
    'strong atmospheric perspective: heavily desaturated, low contrast, tinted toward the sky colour',
    'almost flat silhouette shapes with minimal interior detail',
    'the bottom quarter fades softly into the sky colour so it blends over the sky layer',
    'no individually readable objects, no small props',
  ],
  MID: [
    'middle distance scenery: more saturated and more contrasted than the far layer, but still simplified',
    'shapes read as masses, not as individual detailed objects',
    'the bottom edge is cut flat and solid; it will be covered by the ground tiles',
    'keep the upper half relatively open so the far layer stays visible behind it',
  ],
  NEAR: [
    'foreground framing elements only, near-silhouette, dark and high contrast',
    'elements ONLY along the top edge and the extreme left and right; the entire centre must be empty',
    'transparent-looking empty space in the middle, as this layer passes in front of the player',
    'strongly out of scale compared to the mid layer, as it is very close to the camera',
  ],
};

/**
 * Instruccion de composicion segun la perspectiva del mundo.
 *
 * En un runner con punto de fuga (Subway Surfers, Temple Run) la camara mira al
 * horizonte y el fondo queda alto y centrado; en un plataformas lateral el
 * horizonte cae bajo y la lectura es de izquierda a derecha.
 */
function perspectiveRule(worldType: WorldType, kind: ParallaxKind): string {
  const isRunner = worldType === 'COUNTRYSIDE_RUNNER';
  const isSide = worldType === 'SIDE_PLATFORMER' || isRunner;

  if (!isSide) {
    // Cenital: el fondo apenas se ve; funciona como cielo o vista lejana.
    return 'viewed from a high angle, the horizon sits very high in the frame or is absent';
  }

  if (isRunner) {
    return kind === 'SKY'
      ? 'wide open sky seen looking straight ahead toward the horizon, horizon line near the bottom of the frame'
      : 'symmetrical composition seen head-on looking down a road toward a central vanishing point, horizon line placed high in the frame around 70% height, scenery receding evenly to both left and right';
  }

  return kind === 'SKY'
    ? 'wide sky seen from a side-scrolling camera, horizon line low in the frame'
    : 'flat side-on view as in a 2D side-scrolling platformer, no perspective vanishing point, horizon line low around 30% height';
}

export interface PromptInput {
  kind: ParallaxKind;
  biome: string;
  worldType: WorldType;
  /** Indicacion libre del usuario, opcional. */
  userHint?: string;
  /** Estilo artistico global del mundo. */
  style?: string;
}

export interface BuiltPrompt {
  positive: string;
  negative: string;
  width: number;
  height: number;
  /** Resumen legible de por que el prompt es asi; se muestra en el editor. */
  rationale: string;
}

/**
 * Construye el prompt final de una capa.
 *
 * El orden importa: los modelos de difusion pesan mas lo que va al principio,
 * asi que va primero QUE es la imagen (capa y contenido), luego COMO se ve
 * (paleta y atmosfera), y al final las restricciones tecnicas.
 */
export function buildBackgroundPrompt(input: PromptInput): BuiltPrompt {
  const palette = paletteFor(input.biome);
  const size = LAYER_SIZE[input.kind];
  const style = input.style?.trim() || 'stylised hand-painted game art, clean shapes, flat lighting';

  const features: Record<ParallaxKind, string> = {
    SKY: `${palette.sky} with soft clouds`,
    FAR: palette.farFeatures,
    MID: palette.midFeatures,
    NEAR: palette.nearFeatures,
  };

  const colours: Record<ParallaxKind, string> = {
    SKY: palette.sky,
    FAR: `${palette.distant} tinted toward ${palette.sky}`,
    MID: `${palette.mid} with ${palette.accent}`,
    NEAR: `dark ${palette.mid} silhouettes`,
  };

  const positive = [
    // 1. Que es
    `seamless horizontally tileable parallax background layer for a 2D game`,
    `${input.kind.toLowerCase()} layer: ${features[input.kind]}`,
    // 2. Como se ve
    `colour palette: ${colours[input.kind]}`,
    `atmosphere: ${palette.mood}`,
    `art style: ${style}`,
    // 3. Composicion
    perspectiveRule(input.worldType, input.kind),
    ...LAYER_RULES[input.kind],
    // 4. Restriccion tecnica del tileado
    'the left and right edges must continue into each other perfectly when repeated side by side',
    'keep the far left and far right edges visually quiet, with no landmark or focal point touching them',
    'evenly distributed content across the full width, no single hero element',
    input.userHint?.trim() ? `additional direction: ${input.userHint.trim()}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  // Refuerzos negativos especificos de cada capa.
  const negativeExtra: Record<ParallaxKind, string> = {
    SKY: 'ground, terrain, mountains, trees, buildings, horizon line, water',
    FAR: 'sharp detail, high saturation, dark shadows, foreground objects, individual leaves',
    MID: 'empty flat colour, sky-only image, tiny unreadable details',
    NEAR: 'content in the centre of the image, full background scene, distant landscape',
  };

  const negative = `${NEGATIVE_BASE}, ${negativeExtra[input.kind]}`;

  const rationale = [
    `Capa ${input.kind} del bioma "${input.biome}".`,
    input.kind === 'SKY'
      ? 'Solo cielo y nubes: es la capa que menos se desplaza, cualquier elemento reconocible delataria la repeticion.'
      : input.kind === 'FAR'
        ? 'Perspectiva atmosferica fuerte (desaturado y tenido hacia el cielo) para que se lea como lejano.'
        : input.kind === 'MID'
          ? 'Mas saturacion y contraste que la capa lejana, con el borde inferior cortado plano porque lo tapa el tilemap.'
          : 'Elementos solo en los bordes y el centro despejado: esta capa pasa por delante del jugador.',
    input.worldType === 'COUNTRYSIDE_RUNNER'
      ? 'Composicion simetrica con punto de fuga central y horizonte alto, como en los runners de referencia.'
      : input.worldType === 'SIDE_PLATFORMER'
        ? 'Vista lateral plana sin punto de fuga, con el horizonte bajo.'
        : 'Vista cenital: el horizonte queda muy alto o no existe.',
  ].join(' ');

  return { positive, negative, width: size.width, height: size.height, rationale };
}
