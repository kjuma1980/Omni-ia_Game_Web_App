import { BlockCategory, LayerKind, PlacementMode, WorldType } from '../../src/enums';
import { ALL, FLAGS, type BlockSeed } from './types';

/**
 * ---------------------------------------------------------------------------
 *  Contenido de runner
 * ---------------------------------------------------------------------------
 *  Como funciona el genero (Subway Surfers, Temple Run 2, Sonic Dash, Minion
 *  Rush) y que consecuencias tiene para el editor:
 *
 *  1. El personaje NO se desplaza por el mundo: corre en el sitio, centrado en
 *     pantalla, y es el escenario el que viene hacia el. Por eso el mundo se
 *     construye como una TIRA VERTICAL que se recorre de abajo hacia arriba, y
 *     no como un mapa libre.
 *
 *  2. Hay CARRILES discretos (3 en Subway Surfers, 3 en Minion Rush, 3 en
 *     Temple Run 2). El jugador no se mueve en continuo: salta de carril a
 *     carril. De ahi que `World.laneCount` y `World.laneWidth` sean parte del
 *     mundo y las calles se dimensionen a partir de ellos.
 *
 *  3. Los obstaculos se clasifican por la accion que obligan a hacer, y esa es
 *     la unica taxonomia que importa al disenar un tramo:
 *       - BAJO   -> saltar        (valla, cono, tocon)
 *       - ALTO   -> deslizarse    (andamio, portico, barrera de tunel)
 *       - TOTAL  -> cambiar de carril (tren, autobus, muro)
 *       - MOVIL  -> anticipar     (tren en marcha)
 *     Se marcan con etiquetas (`saltar`, `deslizar`, `esquivar`) para que el
 *     generador de tramos y los plugins puedan razonar sobre ellas.
 *
 *  4. Las MONEDAS no se esparcen al azar: se disponen en hileras dentro de un
 *     carril, y muchas veces trazan el camino seguro o, al contrario, tientan
 *     hacia el carril peligroso. Por eso la moneda es un bloque de rejilla: se
 *     pinta en linea con el mismo gesto con el que se pinta suelo.
 *
 *  5. Los POTENCIADORES son escasos y de efecto temporal (iman, escudo,
 *     multiplicador, impulso). Se colocan de uno en uno.
 *
 *  Nada de esto simula la fisica: el editor coloca y exporta, y es el motor
 *  quien corre. Lo que si garantiza es que la informacion que necesita el
 *  motor (carril, accion obligada, tipo de recompensa) viaje en el bloque.
 * ---------------------------------------------------------------------------
 */

const RUNNER: WorldType[] = [WorldType.COUNTRYSIDE_RUNNER];

/** Superficies de calzada. Un runner de campo no corre sobre asfalto. */
interface SurfaceSpec {
  suffix: string;
  label: string;
  biome: string;
  colors: string[];
  accent: string;
  /** Color de la marca vial; nulo en las superficies que no llevan marcas. */
  marking: string | null;
  pattern: 'slab' | 'noise' | 'cobble' | 'organic';
  /**
   * Capa de detalle superpuesta. `snow` y `wet` son overlays, no patrones: se
   * pintan ENCIMA del material para que una calzada nevada siga siendo calzada
   * y no un bloque de nieve.
   */
  overlay?: 'snow' | 'wet';
}

const SURFACES: SurfaceSpec[] = [
  {
    suffix: 'asphalt',
    label: 'pavimento',
    biome: 'city',
    colors: ['#3d4046', '#33363b'],
    accent: '#4b4f56',
    marking: '#e8e2d0',
    pattern: 'slab',
  },
  {
    suffix: 'dirt',
    label: 'tierra',
    biome: 'countryside',
    colors: ['#9a8a6a', '#7d6f52'],
    accent: '#b0a184',
    marking: null,
    pattern: 'noise',
  },
  {
    suffix: 'grass',
    label: 'pasto',
    biome: 'grassland',
    colors: ['#5f8a45', '#4a6f36'],
    accent: '#7aa85c',
    marking: null,
    pattern: 'organic',
  },
  {
    suffix: 'snow',
    label: 'nieve',
    biome: 'snow',
    colors: ['#dfe8f0', '#c3d0dc'],
    accent: '#f2f7fb',
    marking: '#9fb4c7',
    pattern: 'noise',
    overlay: 'snow',
  },
  {
    suffix: 'sand',
    label: 'arena',
    biome: 'desert',
    colors: ['#d9c28a', '#c2a96f'],
    accent: '#e8d6a4',
    marking: null,
    pattern: 'noise',
  },
  {
    suffix: 'stone',
    label: 'piedra',
    biome: 'village',
    colors: ['#8a8e98', '#6b6f79'],
    accent: '#a2a6b0',
    marking: null,
    pattern: 'cobble',
  },
];

/**
 * Piezas de calle. Cada superficie genera el juego completo para que una calle
 * se arme sin mezclar materiales:
 *
 *   arcen | borde izq | carril | linea | carril | borde der | arcen
 *
 * `lane` es la pieza que se repite tantas veces como carriles tenga el mundo,
 * y `divider` la marca discontinua que los separa. La calle "doble" que el
 * usuario vio era esta pieza divisoria usada como si fuera calzada.
 */
type RoadPiece = 'lane' | 'divider' | 'edge' | 'shoulder' | 'crossing' | 'repair';

const PIECE_LABEL: Record<RoadPiece, string> = {
  lane: 'Carril',
  divider: 'Linea divisoria',
  edge: 'Borde de calzada',
  shoulder: 'Arcen',
  crossing: 'Paso de peatones',
  repair: 'Tramo en obras',
};

function road(surface: SurfaceSpec, piece: RoadPiece, variant: number): BlockSeed {
  const marking = surface.marking ?? surface.accent;

  // La linea divisoria y el paso de peatones son marcas, no materiales: se
  // dibujan con franjas sobre el color de la calzada.
  const pattern =
    piece === 'divider' || piece === 'crossing' ? 'stripes' : surface.pattern;

  const colors =
    piece === 'divider' || piece === 'crossing'
      ? [surface.colors[0], marking]
      : piece === 'shoulder'
        ? [surface.colors[1], surface.colors[0]]
        : surface.colors;

  return {
    key: `road_${surface.suffix}_${piece}`,
    name: `${PIECE_LABEL[piece]} de ${surface.label}`,
    description:
      piece === 'lane'
        ? `Calzada de ${surface.label}. Se repite tantas veces como carriles tenga el mundo.`
        : undefined,
    worldTypes: piece === 'crossing' || piece === 'repair' ? ALL : ALL,
    layer: LayerKind.GROUND,
    category: BlockCategory.TERRAIN,
    collisionFlags: FLAGS.NONE,
    biome: surface.biome,
    visual: {
      pattern,
      colors,
      accent: marking,
      detail: piece === 'repair' ? 0.6 : 0.3,
      // Un tramo en obras se lee por sus grietas; una calzada nevada, por la
      // nieve encima. Las grietas ganan porque son lo que hace de obstaculo.
      overlay: piece === 'repair' ? 'cracks' : surface.overlay,
    },
    tags: ['calle', 'carretera', 'runner', surface.label, piece],
    variant,
  };
}

const ROADS: BlockSeed[] = SURFACES.flatMap((surface, index) =>
  (['lane', 'divider', 'edge', 'shoulder', 'crossing', 'repair'] as RoadPiece[]).map((piece, p) =>
    road(surface, piece, index * 10 + p + 1),
  ),
);

/**
 * Obstaculos. `action` documenta que obliga a hacer al jugador y viaja como
 * etiqueta para que motor y generador de tramos puedan usarla.
 */
function obstacle(
  key: string,
  name: string,
  shape: string,
  colors: string[],
  accent: string,
  action: 'saltar' | 'deslizar' | 'esquivar',
  variant: number,
  options: { biome?: string; scale?: number; height?: number; free?: boolean } = {},
): BlockSeed {
  return {
    key,
    name,
    description: `Obstaculo de runner. Obliga a ${action}.`,
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.PROP,
    placement: options.free ? PlacementMode.FREE : PlacementMode.GRID,
    // Los porticos bajo los que uno se desliza NO son solidos: si lo fueran, el
    // motor bloquearia al jugador en lugar de dejarle pasar agachado.
    collisionFlags: action === 'deslizar' ? FLAGS.TRIGGER : FLAGS.SOLID,
    biome: options.biome ?? 'city',
    visual: { pattern: shape as never, colors, accent, detail: 0.4 },
    tags: ['obstaculo', 'runner', action],
    variant,
    heightInTiles: options.height ?? 1,
    ySortOffset: -2,
    breakable: false,
    defaultScale: options.scale ?? 1,
  };
}

const OBSTACLES: BlockSeed[] = [
  obstacle('obstacle_cone', 'Cono de trafico', 'cone', ['#e8762f', '#b84f18'], '#f0e6d2', 'saltar', 1, { scale: 0.7, free: true }),
  obstacle('obstacle_barrier', 'Valla de obra', 'barrier', ['#e8762f', '#f0e6d2'], '#2a2d33', 'saltar', 2),
  obstacle('obstacle_barrier_police', 'Reten policial', 'barrier', ['#2f5f8a', '#f0e6d2'], '#1c1f24', 'saltar', 3),
  obstacle('obstacle_scaffold', 'Andamio', 'scaffold', ['#c9a227', '#8a6f18'], '#e8762f', 'deslizar', 4, { height: 2 }),
  obstacle('obstacle_gantry', 'Portico de senalizacion', 'scaffold', ['#8b939c', '#4e555c'], '#2f6b45', 'deslizar', 5, { height: 2 }),
  obstacle('obstacle_sign_road', 'Senal de obras', 'signArrow', ['#e8b634', '#8a6f18'], '#2a2d33', 'saltar', 6, { scale: 0.9, free: true }),
  obstacle('obstacle_log', 'Tronco caido', 'barrel', ['#7d5836', '#4d3520'], '#9c7c50', 'saltar', 7, { biome: 'countryside', scale: 1.2 }),
  obstacle('obstacle_rock', 'Roca', 'statue', ['#7a7e88', '#4e525a'], '#9aa0a6', 'esquivar', 8, { biome: 'countryside' }),
  obstacle('obstacle_haybale', 'Bala de heno', 'barrel', ['#d9c07a', '#a8924a'], '#8a7530', 'saltar', 9, { biome: 'countryside' }),
  obstacle('obstacle_hole', 'Socavon', 'solid', ['#15171c', '#0b0d10'], '#2a2d33', 'esquivar', 10),
];

// El socavon es un foso, no un muro: corrige capa y bandera tras el generador.
const HOLE = OBSTACLES[OBSTACLES.length - 1];
HOLE.layer = LayerKind.PIT;
HOLE.collisionFlags = FLAGS.PIT;
HOLE.ySortOffset = 0;

/** Trampas: danan al contacto en lugar de frenar. */
function trap(key: string, name: string, colors: string[], accent: string, variant: number, biome = 'dungeon'): BlockSeed {
  return {
    key,
    name,
    description: 'Trampa: inflige dano al contacto.',
    worldTypes: ALL,
    layer: LayerKind.GROUND,
    category: BlockCategory.PROP,
    collisionFlags: FLAGS.DAMAGE | FLAGS.TRIGGER,
    biome,
    visual: { pattern: 'trap', colors, accent, detail: 0.5 },
    tags: ['trampa', 'runner', 'dano'],
    variant,
    animated: true,
    breakable: false,
  };
}

const TRAPS: BlockSeed[] = [
  trap('trap_spikes', 'Trampa de pinchos', ['#b9bec7', '#33373f'], '#8c2f2f', 1),
  trap('trap_bear', 'Cepo', ['#8b939c', '#3a3e45'], '#6b2f2f', 2, 'countryside'),
  trap('trap_saw', 'Sierra', ['#cfd6de', '#5a6068'], '#c4470d', 3),
  trap('trap_fire', 'Surtidor de fuego', ['#e8762f', '#8a3a0c'], '#ffd08a', 4),
  trap('trap_electric', 'Descarga electrica', ['#7fc4e8', '#2f6b8a'], '#e8f4ff', 5, 'city'),
];

/**
 * Coleccionables. Se colocan en rejilla porque su valor esta en la HILERA: una
 * fila de monedas guia la mirada y marca la ruta segura o la tentacion.
 */
function pickup(
  key: string,
  name: string,
  shape: 'coin' | 'gem',
  colors: string[],
  accent: string,
  variant: number,
  description: string,
): BlockSeed {
  return {
    key,
    name,
    description,
    worldTypes: ALL,
    layer: LayerKind.OVERLAY,
    category: BlockCategory.DECOR,
    collisionFlags: FLAGS.TRIGGER,
    biome: 'generic',
    visual: { pattern: shape, colors, accent, detail: 0.5 },
    tags: ['coleccionable', 'runner', shape === 'coin' ? 'moneda' : 'premio'],
    variant,
    animated: true,
    breakable: false,
    defaultScale: 0.7,
  };
}

const PICKUPS: BlockSeed[] = [
  pickup('pickup_coin', 'Moneda', 'coin', ['#f2c94c', '#b8890f'], '#fff0b8', 1, 'Recompensa base. Se pinta en hilera dentro de un carril.'),
  pickup('pickup_coin_big', 'Moneda grande', 'coin', ['#f2a63c', '#a86a0c'], '#ffe0a0', 2, 'Vale mas. Se usa como remate de una hilera.'),
  pickup('pickup_gem_blue', 'Gema azul', 'gem', ['#4fa8dc', '#1f5f8a'], '#bfe8ff', 3, 'Premio escaso.'),
  pickup('pickup_gem_red', 'Gema roja', 'gem', ['#dc5a5a', '#8a2020'], '#ffc4c4', 4, 'Premio escaso.'),
  pickup('pickup_gem_green', 'Gema verde', 'gem', ['#5fc47a', '#207f3a'], '#c4ffd4', 5, 'Premio escaso.'),
  pickup('powerup_magnet', 'Iman', 'gem', ['#c44a4a', '#7f2020'], '#e8e8e8', 6, 'Potenciador: atrae las monedas cercanas durante unos segundos.'),
  pickup('powerup_shield', 'Escudo', 'gem', ['#4a90c4', '#20507f'], '#d0f0ff', 7, 'Potenciador: absorbe un impacto.'),
  pickup('powerup_boost', 'Impulso', 'gem', ['#e8a02f', '#a35f0c'], '#fff0c0', 8, 'Potenciador: acelera y hace invulnerable un tramo.'),
  pickup('powerup_multiplier', 'Multiplicador', 'gem', ['#9a5fc4', '#5a2080'], '#e8d0ff', 9, 'Potenciador: dobla la puntuacion temporalmente.'),
];

/** Mobiliario urbano que flanquea la calle sin entrar en el carril. */
const STREET_FURNITURE: BlockSeed[] = [
  {
    key: 'sidewalk',
    name: 'Anden',
    description: 'Acera elevada que flanquea la calzada. No es carril.',
    worldTypes: ALL,
    layer: LayerKind.GROUND,
    category: BlockCategory.TERRAIN,
    collisionFlags: FLAGS.NONE,
    biome: 'city',
    visual: { pattern: 'slab', colors: ['#9aa0a6', '#7f858b'], accent: '#b4bac0', detail: 0.25 },
    tags: ['anden', 'acera', 'urbano', 'runner'],
  },
  {
    key: 'sidewalk_kerb',
    name: 'Bordillo',
    worldTypes: ALL,
    layer: LayerKind.GROUND,
    category: BlockCategory.TERRAIN,
    collisionFlags: FLAGS.NONE,
    biome: 'city',
    visual: { pattern: 'stripes', colors: ['#b4bac0', '#7f858b'], accent: '#e8e2d0', detail: 0.2 },
    tags: ['bordillo', 'acera', 'urbano', 'runner'],
  },
  {
    key: 'runner_start',
    name: 'Linea de salida',
    description: 'Marca donde arranca el tramo. El motor la usa de referencia.',
    worldTypes: RUNNER,
    layer: LayerKind.GROUND,
    category: BlockCategory.SIGN,
    collisionFlags: FLAGS.TRIGGER,
    biome: 'city',
    visual: { pattern: 'checker', colors: ['#f0e6d2', '#22262c'], accent: '#c4470d', detail: 0.5 },
    tags: ['runner', 'salida', 'meta'],
    breakable: false,
  },
  {
    key: 'runner_checkpoint',
    name: 'Punto de control',
    description: 'Divide el recorrido en tramos y marca donde reaparecer.',
    worldTypes: RUNNER,
    layer: LayerKind.GROUND,
    category: BlockCategory.SIGN,
    collisionFlags: FLAGS.TRIGGER,
    biome: 'city',
    visual: { pattern: 'stripes', colors: ['#2f6b45', '#f0e6d2'], accent: '#c9a227', detail: 0.4 },
    tags: ['runner', 'control', 'checkpoint'],
    breakable: false,
  },
];

export const RUNNER_BLOCKS: BlockSeed[] = [
  ...ROADS,
  ...OBSTACLES,
  ...TRAPS,
  ...PICKUPS,
  ...STREET_FURNITURE,
];
