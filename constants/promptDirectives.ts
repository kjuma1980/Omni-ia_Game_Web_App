/**
 * ---------------------------------------------------------------------------
 *  Descriptores de prompt: fuente unica
 * ---------------------------------------------------------------------------
 *  Los desplegables de la interfaz guardan CLAVES (`topdown_34`, `organic`).
 *  Una clave no significa nada para un modelo de imagen ni para el refinador:
 *  si se le pasa cruda, la repite tal cual y el prompt acaba diciendo
 *  "topdown_34 perspective, organic composition", que no describe nada.
 *
 *  Aqui vive la traduccion de cada clave a lenguaje que el modelo entiende.
 *  Estaba duplicada dentro de `AssetGenerator.tsx` y solo la usaba el boton de
 *  generar; el refinador recibia las claves sin traducir. Al separarse, los dos
 *  caminos dejaron de coincidir: se generaba una cosa y se refinaba otra.
 *  Con una sola fuente eso no puede volver a pasar.
 * ---------------------------------------------------------------------------
 */

/** Perspectiva de camara. Clave del desplegable -> descripcion para el modelo. */
export const PERSPECTIVE_MAP: Record<string, string> = {
  topdown_34: 'top-down oblique 3/4 perspective, 3D orthographic look, RPG scene',
  topdown_90: 'pure overhead aerial view, flat 2D top-down perspective from exactly 90 degrees above',
  platformer_2d: 'orthogonal 2D side-scroller side-view perspective, flat horizontal layout',
  platformer_parallax: '2.5D side-scroller side-view perspective with depth layers and parallax layers',
  isometric_25d: 'isometric 2.5D perspective, strict 120-degree axonometric parallel lines, no vanishing point',
  fps_3d: 'first-person view, 3D gaming perspective from character eyes',
  third_person_3d: 'third-person over the shoulder 3D game perspective, gaming environment',
  isometric_3d: 'tactical orthographic 3D camera angle, axonometric gaming perspective',
  rpg: 'top-down view, 2D RPG perspective, grid aligned',
  platformer: 'side-view, 2D platformer perspective, side scrolling layout',
  isometric: 'isometric 3D perspective, 3/4 angle view, blocky tiles',
  openworld: 'large open world environment, scenic landscape perspective',
};

/** Composicion / capa de escenario. */
export const DENSITY_MAP: Record<string, string> = {
  full_scene: 'complete illustrated level scene, full concept art, detailed environments',
  organic: 'organic natural layout, scattered paths, environmental details',
  dense: 'dense grid pattern, modular block structures, high concentration of routes',
  simple: 'simple intersection layout, clean crosswise path alignments',
  parallax_background:
    'parallax background layer, isolated far background sky and distant elements, clean backdrop, no foreground elements',
  parallax_midground:
    'parallax midground layer, landscape features, mountains, trees, structures, transparent or plain background, middle ground asset',
  parallax_foreground:
    'parallax foreground layer, close-up details, ground tiles, foliage, silhouette border, foreground assets overlay',
  topdown_terrain:
    'top-down tileset grid sheet, floor tiles, grass, dirt, stone, water terrain textures, seamless boundaries, asset sheet',
  topdown_props:
    'top-down props, trees, rocks, barrels, chests, tables, isolated assets sheet, asset collection',
  isometric_blocks: 'isometric blocks tileset, ground blocks, wall blocks, platforms, cubes, asset sheets',
  isometric_decor:
    'isometric decoration objects, structures, pillars, furniture, isolated isometric objects sheet',
  // Faltaban: habia tileset cenital e isometrico, pero ninguno de vista
  // lateral, que es justo lo que hace falta para armar un plataformas por
  // piezas. Las tres perspectivas laterales se quedaban sin hoja de recursos.
  sideview_platforms:
    'side-view platformer tileset sheet, solid ground blocks with grass or stone tops, floating platforms, left and right edge caps, inner corner pieces, wall segments, ladders and ropes, one-way thin platforms, seamlessly connecting edges so pieces butt together without a gap, arranged on a clean neutral background',
  sideview_props:
    'side-view platformer props sheet, crates, barrels, signposts, lamp posts, spikes and hazards, chests, ladders, bushes and hanging vines, each object drawn in side elevation standing on its own baseline, isolated on a clean neutral background, asset collection',
  dungeon_chamber:
    'enclosed gothic dungeon chamber, stone walls, brick floors, columns, gloomy atmosphere, underground dungeon scene, interior only',
  cave_passage:
    'subterranean cave passage, rock walls, stalactites, underground tunnel, light shafts, stone ground, cave interior only',
  house_interior:
    'cozy house interior, tavern room, wooden walls, wooden floors, fireplace, tables, indoor room scene, residential interior only',
  castle_hall:
    'grand castle hall, throne room, marble columns, arches, stone floors, royal tapestries, high ceiling interior only',
};

/**
 * Guia por estilo artistico.
 *
 * `positive` son los rasgos tecnicos que definen el estilo; `negative` es lo que
 * lo destruye. Importa que el negativo sea del estilo CONCRETO y no generico:
 * el tramado (dithering) arruina un Pixel Art HD pero es una tecnica central del
 * 8-bit, donde la paleta es tan corta que es la unica forma de simular tonos
 * intermedios. Excluirlo en 8-bit es pedirle al modelo que no haga 8-bit.
 */
export const STYLE_DIRECTIVES: Record<string, { positive: string; negative: string }> = {
  'Pixel Art (8-bit)': {
    positive:
      '8-bit pixel art, NES era aesthetic, very low resolution sprite grid, hard chunky pixels, strict limited palette of roughly 4 to 16 colors per element, flat color fills, ordered dithering used for gradients and shading, 1px dark outlines, no anti-aliasing',
    negative:
      'anti-aliased, smooth gradients, soft shading, blurry, high resolution detail, 3D render, photorealistic, painterly brush strokes, subpixel detail, hundreds of colors',
  },
  'Pixel Art (16-bit)': {
    // "tile-aligned grid structure" decia el descriptor anterior, y el modelo lo
    // leia como instruccion de COMPOSICION: arboles en rejilla y caminos en
    // angulo recto. La disciplina de rejilla del pixel art es de PIXELES, no de
    // disposicion de los elementos.
    positive:
      '16-bit pixel art, SNES and Mega Drive era aesthetic, every pixel snapped to a consistent pixel grid with no stray half-pixels, rich but limited retro palette, selective dithering for shading, clean 1px outlines, crisp readable silhouettes, no anti-aliasing',
    negative:
      'anti-aliased, smooth gradients, blurry, 3D render, photorealistic, painterly brush strokes, modern HD detail',
  },
  'Pixel Art (HD)': {
    positive:
      'high definition pixel art, dense pixel grid with fine detail, broad modern palette, subtle hand-placed shading and highlights, crisp pixel edges, clean outlines',
    negative: 'anti-aliased, blurry, 3D render, photorealistic, heavy dithering, chunky low-res pixels',
  },
  'Low Poly 3D': {
    positive:
      'low poly 3D render, faceted flat-shaded polygons, visible triangular geometry, clean hard edges, simple untextured or gradient materials, soft ambient lighting',
    negative: 'pixelated, 2D flat illustration, high-poly detail, photorealistic textures, smooth organic subdivision',
  },
  'Realistic 3D (PBR)': {
    positive:
      'realistic 3D render, physically based rendering, 4k PBR materials with albedo, roughness, metallic and normal detail, accurate global illumination, believable surface wear',
    negative: 'pixelated, flat shading, cartoon, cel shaded, 2D illustration, low-poly, toy-like plastic',
  },
  '2.5D Style': {
    positive:
      '2.5D game art, layered depth with parallax separation, hand-painted textures over simple geometry, soft volumetric lighting, clean readable silhouettes',
    negative: 'flat 2D with no depth, pixelated, harsh flat lighting, photorealistic',
  },
  'Flat Vector': {
    positive:
      'flat vector illustration, clean geometric shapes, solid uniform color fills, no gradients, no texture, crisp scalable edges, minimal palette',
    negative: 'texture, noise, grain, gradients, photorealistic, 3D render, pixelated, sketchy lines, shading',
  },
  'Cartoon / Cel Shaded': {
    positive:
      'cel shaded cartoon art, bold clean ink outlines, flat blocks of color with hard-edged shadow steps, expressive exaggerated shapes, vivid saturated palette',
    negative: 'photorealistic, soft airbrush gradients, pixelated, gritty texture, muted desaturated colors',
  },
  'Digital Painting': {
    positive:
      'digital painting, visible confident brush strokes, rich value structure, atmospheric perspective, painterly color blending, concept art quality',
    negative: 'pixelated, flat vector, hard cel shading, 3D render, sterile clean edges',
  },
  Watercolor: {
    positive:
      'watercolor painting, translucent pigment washes, soft bleeding edges, visible paper grain, granulation and blooms, delicate light palette',
    negative: 'sharp vector edges, 3D render, pixelated, heavy black outlines, digital gradients, photorealistic',
  },
  'Hand-drawn / Line Art': {
    positive:
      'hand-drawn line art, expressive varying line weight, visible pencil or ink texture, cross-hatching for shadow, sketchbook character',
    negative: 'photorealistic, 3D render, pixelated, flat vector, airbrushed gradients',
  },
  'Voxel Art': {
    positive:
      'voxel art, everything built from uniform cubic blocks, blocky stepped edges, isometric-friendly forms, flat per-voxel color, MagicaVoxel look',
    negative: 'smooth curves, organic subdivision, photorealistic, 2D pixel art, high-poly mesh, rounded surfaces',
  },
  'Retro Low-Res 3D (PS1)': {
    positive:
      'retro low-res 3D, PS1 era aesthetic, low-poly untextured-looking geometry, affine texture warping, vertex snapping jitter, low resolution dithered textures, limited color depth',
    negative: 'modern high-poly detail, 4k textures, smooth anti-aliased edges, photorealistic PBR, ray tracing',
  },
  'Minimalist UI/UX': {
    positive:
      'minimalist design, generous negative space, strict geometric alignment, restrained two or three color palette, clean sans-serif proportions, functional clarity',
    negative: 'clutter, ornate decoration, texture, noise, photorealistic, busy detail, heavy shadows',
  },
  'Gothic / Dark Fantasy': {
    positive:
      'gothic dark fantasy art, heavy chiaroscuro lighting, deep crushed shadows, muted desaturated palette with cold highlights, ornate weathered stone and iron, oppressive brooding atmosphere',
    negative: 'bright cheerful colors, cute chibi proportions, flat even lighting, pastel palette, comedic',
  },
  'Colorful Fantasy': {
    positive:
      'vibrant colorful fantasy art, luminous saturated palette, magical glowing accents, lush whimsical detail, warm inviting lighting',
    negative: 'desaturated, grim dark, muddy colors, horror, gritty realism, monochrome',
  },
  'Top-down': {
    positive:
      'top-down game art, readable from directly above, clear silhouette separation between floor and objects, consistent overhead lighting',
    negative: 'side view, front-facing portrait, dramatic perspective distortion, vanishing point',
  },
  'Chibi / SD': {
    positive:
      'chibi super-deformed style, oversized head with small compact body, large expressive eyes, rounded soft shapes, cute charming proportions',
    negative: 'realistic proportions, gritty realism, photorealistic, elongated anatomy, horror',
  },
  'Stylized Realism': {
    positive:
      'stylized realism, believable anatomy and materials with slight artistic exaggeration, rich but controlled palette, cinematic lighting, AAA concept art quality',
    negative: 'pixelated, flat vector, chibi proportions, cartoon outlines, photograph',
  },
  'Pre-rendered Sprites': {
    positive:
      'pre-rendered 3D sprite baked to 2D, crisp baked lighting and shadow, Donkey Kong Country era look, rich shaded volumes on a fixed camera angle',
    negative: 'hand-drawn line art, flat vector, live 3D render, photorealistic, unshaded flat color',
  },
  'Silhouette Art': {
    positive:
      'silhouette art, strong solid dark shapes read against a luminous background, minimal interior detail, dramatic rim light, high contrast layered depth',
    negative: 'detailed interior texture, flat even lighting, busy midtones, photorealistic, visible facial detail',
  },
  'Stylized / Soft Shading': {
    positive:
      'stylized art with soft shading, gentle gradient transitions, warm bounce light, rounded appealing forms, cozy polished finish',
    negative: 'harsh hard-edged cel shading, pixelated, gritty realism, flat unshaded color, photorealistic',
  },
};

// ---------------------------------------------------------------------------
//  Reglas de composicion de mundo
// ---------------------------------------------------------------------------

/**
 * Composiciones que son HOJAS DE RECURSOS, no escenas: un tileset se dibuja en
 * rejilla a proposito, y las reglas de irregularidad organica lo arruinarian.
 */
const SHEET_LAYOUTS = new Set([
  'topdown_terrain',
  'topdown_props',
  'isometric_blocks',
  'isometric_decor',
  'sideview_platforms',
  'sideview_props',
]);

/** Capas de parallax: son tiras que se repiten, no mapas cerrados. */
const STRIP_LAYOUTS = new Set([
  'parallax_background',
  'parallax_midground',
  'parallax_foreground',
]);

/**
 * Familias de camara. "Mundo completo" no significa lo mismo en las tres, y
 * tratarlas igual era un fallo: la regla de encuadre solo miraba la composicion
 * elegida e ignoraba la perspectiva.
 *
 * - MAP: la camara ve el terreno desde arriba. Un mundo completo es una region
 *   cerrada con sus cuatro bordes dentro del encuadre.
 * - SIDE: vista lateral. Un nivel de plataformas no es una region cerrada sino
 *   una TIRA que se recorre de izquierda a derecha; pedirle "los cuatro bordes
 *   del terreno" no tiene sentido, y lo que hay que exigir es que el tramo
 *   entre entero de extremo a extremo con sus planos de profundidad separados.
 * - VIEW: primera y tercera persona. Es una VISTA, no un mapa. Aqui "mundo
 *   completo" no significa nada, y exigirlo produciria una maqueta vista desde
 *   arriba en lugar de la vista subjetiva pedida.
 */
const SIDE_PERSPECTIVES = new Set(['platformer_2d', 'platformer_parallax', 'platformer']);
const VIEW_PERSPECTIVES = new Set(['fps_3d', 'third_person_3d']);

export type CameraFamily = 'map' | 'side' | 'view';

export function cameraFamily(perspectiveKey: string): CameraFamily {
  if (SIDE_PERSPECTIVES.has(perspectiveKey)) return 'side';
  if (VIEW_PERSPECTIVES.has(perspectiveKey)) return 'view';
  return 'map';
}

/**
 * Alineacion del lienzo. Se aplica SIEMPRE, en las tres familias y en las
 * quince composiciones.
 *
 * RECTO no habla de la proyeccion sino del LIENZO. Una vista cenital 3/4 sigue
 * siendo 3/4 aunque la imagen este derecha; lo que se prohibe es el angulo
 * holandes, que la camara se incline unos grados y el mapa salga girado. Un
 * mapa girado 7 grados no se puede usar en un motor 2D: la rejilla logica del
 * juego es ortogonal y no hay forma de casarla.
 */
const ALIGNMENT_RULE = `- The image must be PERFECTLY AXIS-ALIGNED at exactly 0 degrees of rotation.
  Horizontals run parallel to the top and bottom edges of the image, verticals
  parallel to the left and right edges. NO dutch angle, NO tilted camera, NO
  rotated canvas, NO skew, not even one degree in either direction. This is
  about the CANVAS, not the projection: the chosen camera projection stays
  exactly as specified, it is simply photographed straight.`;

/**
 * Integridad del escenario, redactada segun la familia de camara.
 *
 * En los tres casos el motivo es el mismo: si el modelo recorta, lo que falta
 * no se puede generar despues. Una segunda imagen no continua a la primera ni
 * en relieve, ni en caminos, ni en paleta.
 */
const COMPLETENESS_RULE: Record<CameraFamily, string> = {
  map: `- The ENTIRE world must fit INSIDE the frame. All four outer edges of the
  landmass are visible, with a margin of open ground, water or empty terrain
  between the content and the image border. Nothing is cropped or running out
  of frame.
- This is ONE single self-contained map, complete in this one image. It is NOT
  a tile, NOT a fragment, NOT a section of a larger map, and NOT part of a set
  meant to be stitched to other images later.`,

  side: `- This is a COMPLETE side-view level, shown end to end in this one image:
  its left starting edge and its right finishing edge are both visible inside
  the frame, with the ground line continuous and unbroken all the way across.
  It is NOT a fragment, NOT a repeating tile, and NOT a section meant to be
  stitched to other images later.
- Compose it in READABLE DEPTH PLANES within this single image: a distant
  background at the horizon, a middle plane of scenery, and the playable
  ground plane at the front where the character would run and jump. Keep the
  playable band clearly separated from the scenery so platforms and hazards
  read at a glance.
- The vertical extent is the level's full playable height: the ground and the
  highest reachable platform both fit inside the frame with headroom.`,

  view: `- This is a first- or third-person VIEW of a place, not a map. Do not flatten
  it into an overhead plan and do not try to show the whole world at once.
- Compose a complete, coherent shot: a clear foreground, a middle ground and a
  distant background, with nothing important clipped awkwardly at the frame
  edges. The viewer must be able to read where they could walk.`,
};

/** Reglas de encuadre completas para una familia de camara. */
export function framingRules(family: CameraFamily): string {
  return `FRAMING — NON-NEGOTIABLE:
${ALIGNMENT_RULE}
${COMPLETENESS_RULE[family]}`;
}

/** Compatibilidad: encuadre de mapa, que es el caso por defecto. */
export const FRAMING_RULES = framingRules('map');

/**
 * Naturalidad.
 *
 * Sin esto los modelos producen mundos de maqueta: arboles equiespaciados en
 * fila, caminos en angulo recto, lagos elipticos, casas identicas alineadas.
 * Cada regla ataca un automatismo concreto del modelo, y por eso estan escritas
 * como prohibiciones acompanadas de la alternativa: decir solo "que sea
 * natural" no cambia nada, hay que nombrar el vicio.
 */
export const NATURALISM_RULES = `NATURAL IRREGULARITY — the world must feel grown, not laid out:
- VEGETATION: trees never form straight lines, rows, or evenly spaced grids.
  They gather in groves of uneven density, thin out at the edges, and leave
  lone stragglers standing apart. Trunk sizes, canopy widths and heights all
  vary. Undergrowth and bushes spill irregularly around them.
- PATHS AND ROADS: they curve, wander and bend around obstacles instead of
  running straight or meeting at right angles. Their width breathes, wider
  where traffic passes and narrower where it thins. They fork, they braid, and
  their edges are ragged where the ground has worn away.
- WATER: shorelines are lobed and irregular with inlets, spits and shallows.
  Never a circle, never an ellipse, never a smooth rounded pond. Rivers meander
  and change width; they never run as a straight channel.
- BUILDINGS: each one sits at its own slight angle, none perfectly parallel to
  its neighbour. Sizes, roof pitches, materials and states of repair differ.
  They cluster where it makes sense — around a crossroads, along a shore — and
  leave uneven gaps elsewhere.
- TERRAIN: elevation is uneven, with rises, hollows and rocky outcrops breaking
  up flat ground. Ground texture varies: worn dirt near use, thicker grass
  further out, patches of stone and mud.
- WEAR AND AGE: some things are new and some are old. Broken fence posts,
  a leaning sign, a patched roof, moss on the north side of a wall.
- COMPOSITION: density varies across the map. Busy areas and quiet empty ones,
  not uniform coverage edge to edge. Avoid mirror symmetry entirely.`;

/**
 * Fidelidad a lo pedido.
 *
 * El fallo tipico no es inventar de mas sino OMITIR: se piden nueve elementos y
 * el modelo pinta cuatro, porque su idea previa de "aldea de fantasia" pesa mas
 * que la lista. Por eso se le obliga a recorrerla explicitamente y se insiste
 * en la relacion espacial, que es lo primero que se pierde: "un puente en medio
 * del lago" acaba siendo un puente en la orilla.
 */
export const FIDELITY_RULES = `FIDELITY TO THE REQUEST:
- Every single element the user names must appear in the scene, individually
  recognisable. Do not omit any of them, do not merge two into one, and do not
  silently substitute a similar thing.
- Respect the SPATIAL RELATIONSHIPS the user states. If they say a bridge in
  the middle of the lake, the bridge spans open water away from the shore, not
  at the water's edge. If they say signs along the paths, the signs stand
  beside the paths, not scattered in open field.
- You may add supporting detail that makes the scene believable, but never at
  the cost of the requested elements and never changing the described relations.
- Name the requested elements explicitly in the positive prompt, each with its
  own descriptive clause, so none of them can be lost.`;

/**
 * Legibilidad como escenario jugable: el mundo se dibuja para jugar en el, no
 * para verlo enmarcado. De ahi que se prohiban vineteado, marco y firma, que un
 * modelo de ilustracion anade por costumbre y que en un juego estorban.
 */
export const PLAYABILITY_RULES = `PLAYABLE MAP LEGIBILITY:
- Clear lighting consistent with the scene's mood and atmosphere (whether bright daylight, moonlit night, or dark eerie dungeon), maintaining readability of walkable terrain and obstacles.
- Walkable ground reads clearly as walkable, and obstacles read clearly as obstacles, at a glance.
- No frame, no border, no vignette, no painted edges, no signature, no watermark, no title text, no UI, no compass rose, no map legend.
- Crisp detail sustained across the whole image so the map holds up when zoomed into during play.`;

/** Negativos que refuerzan las reglas de encuadre y naturalidad. */
export const WORLD_NEGATIVES = {
  framing:
    'tilted, dutch angle, rotated canvas, skewed, diagonal framing, crooked horizon, cropped, cut off at the edge, partial map, fragment, zoomed in on a detail',
  naturalism:
    'trees in a straight line, evenly spaced trees, grid layout, orderly rows, perfectly straight roads, right-angle intersections, circular lake, elliptical pond, perfectly symmetrical, mirrored composition, identical repeated buildings, artificial regularity',
  playability: 'vignette, frame, border, watermark, signature, text, UI overlay, map legend, compass rose',
};

// ---------------------------------------------------------------------------
//  Coherencia entre capas de parallax
// ---------------------------------------------------------------------------

/**
 * Cada capa de parallax se genera en una pasada distinta, con su propia semilla
 * y su propio prompt. Sin nada que las ate, el cielo sale de un atardecer, las
 * montanas de un mediodia y la arboleda de otro bioma: tres imagenes que no
 * pegan y que apiladas no forman un fondo.
 *
 * La solucion no es fijar la aleatoriedad -eso daria tres capas identicas y
 * aburridas- sino acotar DONDE puede variar. Se deriva un contrato de direccion
 * artistica del nombre del mundo: misma localizacion, mismo contrato. Dentro de
 * el, el modelo sigue siendo libre de inventar formas y detalle.
 */
const LIGHT_DIRECTIONS = [
  'low warm light from the left, long shadows cast to the right',
  'low warm light from the right, long shadows cast to the left',
  'high neutral midday light from slightly left, short shadows',
  'high neutral midday light from slightly right, short shadows',
  'overcast diffuse light with no strong shadow direction',
  'cool low light from the left, long soft shadows to the right',
];

const TIMES_OF_DAY = [
  'clear morning',
  'bright midday',
  'golden late afternoon',
  'blue overcast day',
  'warm sunset',
  'cool dusk',
];

/** Hash estable: la misma localizacion produce siempre el mismo contrato. */
function hashText(text: string): number {
  let hash = 2166136261;
  const normalised = text.trim().toLowerCase();
  for (let i = 0; i < normalised.length; i += 1) {
    hash ^= normalised.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Profundidad de cada capa: es lo que la separa visualmente de las demas. */
const LAYER_DEPTH: Record<string, string> = {
  parallax_background: `This is the FARTHEST layer. Atmospheric perspective is at its strongest:
  colours washed out and heavily desaturated, values compressed towards the sky
  tone, contrast low, edges soft, almost no fine detail. Only large silhouettes
  read — distant ranges, cloud banks, faraway skyline. It sits behind
  everything and must never compete for attention.`,

  parallax_midground: `This is the MIDDLE layer. Moderate atmospheric perspective: colours partly
  desaturated but still recognisable, medium contrast, readable shapes with
  some interior detail. Treelines, hills, buildings and structures live here.
  It must read as clearly nearer than the far layer and clearly further than
  the near layer.`,

  parallax_foreground: `This is the NEAREST layer. Almost no atmospheric perspective: full saturation,
  strongest contrast, darkest values, crisp edges, close-up detail. Often
  near-silhouette. The CENTRE MUST STAY EMPTY — leave a clear open corridor
  through the middle of the frame where gameplay happens — with the content
  gathered at the left and right edges and along the bottom.`,
};

export interface LayerContract {
  /** Texto que se inyecta en el prompt de la capa. */
  directive: string;
  /** Resumen legible para la interfaz. */
  summary: string;
}

/**
 * Contrato de direccion artistica compartido por todas las capas de una misma
 * localizacion, mas las reglas de profundidad propias de la capa pedida.
 */
export function parallaxLayerContract(worldName: string, densityKey: string): LayerContract | null {
  if (!STRIP_LAYOUTS.has(densityKey)) {
    return null;
  }

  const seed = hashText(worldName || 'world');
  const light = LIGHT_DIRECTIONS[seed % LIGHT_DIRECTIONS.length];
  const time = TIMES_OF_DAY[(seed >>> 8) % TIMES_OF_DAY.length];
  // El horizonte alto o bajo cambia por completo el reparto de cielo y suelo, y
  // debe ser el mismo en las tres capas o no se alinearan al apilarlas.
  const horizon = 38 + ((seed >>> 16) % 5) * 6;

  return {
    summary: `${time}, ${light.split(',')[0]}, horizonte al ${horizon}%`,
    directive: `SHARED ART DIRECTION — every parallax layer of this same location must
match these EXACTLY, or the layers will not stack into one believable scene:
- Time of day: ${time}.
- Lighting: ${light}. The same light direction in every layer, with no
  exceptions.
- Horizon line at approximately ${horizon}% of the image height, measured from
  the top. Identical in all layers so they align when stacked.
- One consistent colour palette and colour temperature across all layers; only
  the amount of atmospheric haze changes between them.

LAYER DEPTH:
${LAYER_DEPTH[densityKey]}

WHAT MAY VARY between layers: the specific shapes, the vegetation, the rock
formations, the buildings and the amount of detail. What may NOT vary: time of
day, light direction, horizon height, palette and colour temperature.`,
  };
}

/**
 * Bloque completo de reglas de mundo, ajustado a la PERSPECTIVA y a la
 * composicion elegidas.
 *
 * Antes solo miraba la composicion, y eso hacia que un nivel de plataformas
 * recibiera la regla de "mapa cerrado con sus cuatro bordes visibles", que en
 * una vista lateral no significa nada: un nivel es una tira que se recorre, no
 * una region cerrada. Y una vista en primera persona recibia esa misma regla,
 * que la empujaba hacia una maqueta vista desde arriba.
 */
export function worldCompositionRules(
  densityKey: string,
  perspectiveKey = '',
): {
  directives: string;
  negatives: string;
} {
  const isSheet = SHEET_LAYOUTS.has(densityKey);
  const isStrip = STRIP_LAYOUTS.has(densityKey);
  const family = cameraFamily(perspectiveKey);

  if (isSheet) {
    // En una hoja de recursos la rejilla es el objetivo, no el defecto.
    return {
      directives: `FRAMING — NON-NEGOTIABLE:
${ALIGNMENT_RULE}
- All tiles fit inside the frame, evenly spaced on a clean neutral background,
  each one separated and complete, none cropped at the edges.
${PLAYABILITY_RULES}`,
      negatives: `${WORLD_NEGATIVES.framing}, ${WORLD_NEGATIVES.playability}`,
    };
  }

  if (isStrip) {
    // Una capa de parallax se repite en horizontal: exigirle un mapa cerrado
    // seria contradictorio.
    return {
      directives: `FRAMING — NON-NEGOTIABLE:
${ALIGNMENT_RULE}
- Continuous horizontal band that will be tiled left to right. No single
  dominant focal element that would betray the repetition point, and the left
  and right edges must be able to meet without a visible seam.
${NATURALISM_RULES}
${PLAYABILITY_RULES}`,
      negatives: `${WORLD_NEGATIVES.framing}, ${WORLD_NEGATIVES.naturalism}, ${WORLD_NEGATIVES.playability}`,
    };
  }

  // Escena completa: el encuadre depende de la familia de camara.
  return {
    directives: `${framingRules(family)}
${NATURALISM_RULES}
${FIDELITY_RULES}
${PLAYABILITY_RULES}`,
    negatives: `${WORLD_NEGATIVES.framing}, ${WORLD_NEGATIVES.naturalism}, ${WORLD_NEGATIVES.playability}`,
  };
}

// ---------------------------------------------------------------------------
//  Afinidad entre perspectiva y composicion
// ---------------------------------------------------------------------------

/**
 * Perspectivas cenitales e isometricas, para saber a que familia pertenece cada
 * hoja de recursos. Una baldosa dibujada en cenital no encaja en un mundo
 * isometrico ni al reves: el angulo esta horneado en el dibujo.
 */
const TOPDOWN_PERSPECTIVES = new Set(['topdown_34', 'topdown_90', 'rpg']);
const ISOMETRIC_PERSPECTIVES = new Set(['isometric_25d', 'isometric_3d', 'isometric']);

/**
 * Que composiciones encajan de forma natural con cada perspectiva.
 *
 * Se decidio NO ocultar las que no encajan. Tres motivos:
 *
 * 1. Desde que las reglas de encuadre distinguen familia de camara, ningun par
 *    esta roto: los 180 producen algo coherente. Son raros, no incorrectos.
 * 2. Ocultar opciones obliga a reasignar la seleccion cuando el usuario cambia
 *    de perspectiva, cambiandole en silencio algo que el habia elegido. Es el
 *    fallo clasico de los desplegables encadenados.
 * 3. Un proyecto guardado con un par ahora invalido se reescribiria solo al
 *    cargarlo, que es justo la perdida de datos que se acaba de corregir en los
 *    prompts negativos.
 *
 * Asi que se ORDENAN y se explican, en vez de desaparecer.
 */
export function isRecommendedComposition(perspectiveKey: string, densityKey: string): boolean {
  const family = cameraFamily(perspectiveKey);

  // Escenas e interiores valen en cualquier camara.
  if (!SHEET_LAYOUTS.has(densityKey) && !STRIP_LAYOUTS.has(densityKey)) {
    return true;
  }

  // El parallax es un recurso de scroll lateral.
  if (STRIP_LAYOUTS.has(densityKey)) {
    return family === 'side';
  }

  // Hojas de recursos: cada una pertenece a su proyeccion.
  if (densityKey.startsWith('topdown_')) {
    return TOPDOWN_PERSPECTIVES.has(perspectiveKey);
  }
  if (densityKey.startsWith('isometric_')) {
    return ISOMETRIC_PERSPECTIVES.has(perspectiveKey);
  }
  if (densityKey.startsWith('sideview_')) {
    return family === 'side';
  }

  return true;
}

/**
 * Explica que va a pasar con un par poco habitual, para que el usuario decida
 * con informacion en vez de a ciegas. Devuelve null cuando el par es natural.
 */
export function explainComposition(perspectiveKey: string, densityKey: string): string | null {
  if (isRecommendedComposition(perspectiveKey, densityKey)) {
    return null;
  }

  const family = cameraFamily(perspectiveKey);

  if (STRIP_LAYOUTS.has(densityKey)) {
    return family === 'view'
      ? 'Las capas de parallax son para scroll lateral. Con una cámara en primera o tercera persona saldrá una tira de fondo, no la vista subjetiva.'
      : 'Las capas de parallax son para scroll lateral. Con una cámara cenital saldrá una tira de horizonte, útil como fondo lejano pero no como suelo jugable.';
  }

  if (densityKey.startsWith('topdown_')) {
    return 'Es una hoja de baldosas dibujadas en cenital. Con esta perspectiva las piezas no encajarán con el resto del escenario: el ángulo va horneado en el dibujo.';
  }
  if (densityKey.startsWith('isometric_')) {
    return 'Es una hoja de bloques dibujados en isométrico. Con esta perspectiva las piezas no encajarán con el resto del escenario: el ángulo va horneado en el dibujo.';
  }
  if (densityKey.startsWith('sideview_')) {
    return 'Es una hoja de plataformas dibujadas de perfil. Con esta perspectiva las piezas no encajarán con el resto del escenario: el ángulo va horneado en el dibujo.';
  }

  return null;
}

/**
 * Etiquetas de las perspectivas para la interfaz. Viven aqui, junto a las
 * descripciones que se mandan al modelo, para que anadir una perspectiva sea un
 * solo sitio y no dos que se desincronizan.
 */
export const PERSPECTIVE_LABEL: Record<string, string> = {
  topdown_34: 'Cenital Oblicuo 3/4',
  topdown_90: 'Cenital Pura 90°',
  platformer_2d: 'Vista Lateral 2D',
  platformer_parallax: 'Vista Lateral 2.5D',
  isometric_25d: 'Isométrica 2.5D',
  fps_3d: 'Primera Persona 3D',
  third_person_3d: 'Tercera Persona 3D',
  isometric_3d: 'Táctica 3D',
  rpg: 'RPG Estándar',
  platformer: 'Plataformas Estándar',
  isometric: 'Isométrico Estándar',
  openworld: 'Mundo Abierto',
};

/** Composiciones con su etiqueta, en el orden en que se ofrecen. */
export const COMPOSITION_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'full_scene', label: 'Escena Completa Ilustrada' },
  { key: 'organic', label: 'Orgánico / Natural' },
  { key: 'dense', label: 'Alta Densidad / Ciudad' },
  { key: 'simple', label: 'Intersección Simple' },
  { key: 'parallax_background', label: 'Parallax: Capa de Fondo (lejana)' },
  { key: 'parallax_midground', label: 'Parallax: Capa Media' },
  { key: 'parallax_foreground', label: 'Parallax: Capa de Frente' },
  { key: 'topdown_terrain', label: 'Tileset: Terreno / Suelos (cenital)' },
  { key: 'topdown_props', label: 'Tileset: Props / Objetos (cenital)' },
  { key: 'isometric_blocks', label: 'Tileset: Bloques de Terreno (isométrico)' },
  { key: 'isometric_decor', label: 'Tileset: Decoración / Props (isométrico)' },
  { key: 'sideview_platforms', label: 'Tileset: Plataformas y Suelos (lateral)' },
  { key: 'sideview_props', label: 'Tileset: Props y Peligros (lateral)' },
  { key: 'dungeon_chamber', label: 'Interior: Mazmorra / Catacumbas' },
  { key: 'cave_passage', label: 'Interior: Cueva / Pasadizo' },
  { key: 'house_interior', label: 'Interior: Habitación / Taberna' },
  { key: 'castle_hall', label: 'Interior: Salón de Castillo / Trono' },
];

/** Descripcion de un estilo, con reserva razonable si es uno no catalogado. */
export function describeStyle(style: string): { positive: string; negative: string } {
  return (
    STYLE_DIRECTIVES[style] ?? {
      positive: `${style} art style, consistent with its defining visual conventions`,
      negative: 'low quality, blurry, distorted, inconsistent style',
    }
  );
}

export function describePerspective(key: string): string {
  return PERSPECTIVE_MAP[key] ?? key;
}

export function describeDensity(key: string): string {
  return DENSITY_MAP[key] ?? key;
}

/**
 * Terminos negativos que solo tienen sentido para un SPRITE recortado sobre
 * fondo plano (centrado, sin sombra de contacto, sin borde de pegatina).
 *
 * El campo de prompt negativo es unico y compartido por los dos modos, asi que
 * al refinar un sprite y pasar despues a Mundos, estos terminos viajaban al
 * fondo. Ahi no solo sobran: "off-center", "framing" y "white border" empujan
 * al modelo a centrar y recortar un escenario que deberia llenar el encuadre,
 * y "shadow" o "ambient occlusion" le prohiben las sombras que dan volumen y
 * hora del dia a un paisaje.
 */
export const SPRITE_ONLY_NEGATIVES = [
  'shadow',
  'drop shadow',
  'ground shadow',
  'cast shadow',
  'contact shadow',
  'ambient occlusion',
  'floor shadow',
  'green screen studio',
  'green screen',
  'studio floor',
  'green shadow',
  'chroma key',
  'chromakey',
  'off-center',
  'left aligned',
  'right aligned',
  'left side',
  'sticker',
  'white border',
  'white outline',
  'capsule background',
  'badge',
  'framing',
];

/**
 * Quita de un prompt negativo los terminos que solo aplican a sprites,
 * conservando el resto del texto del usuario tal y como lo escribio.
 */
export function stripSpriteOnlyNegatives(negative: string): string {
  if (!negative.trim()) {
    return negative;
  }

  const banned = new Set(SPRITE_ONLY_NEGATIVES.map((term) => term.toLowerCase()));

  return negative
    .split(',')
    .map((term) => term.trim())
    .filter((term) => term.length > 0 && !banned.has(term.toLowerCase()))
    .join(', ');
}
