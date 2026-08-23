import type { ChunkPayload, LayerName } from './core/grid';

export type WorldType =
  | 'TOP_DOWN_CENITAL'
  | 'TOP_DOWN_THREE_QUARTER'
  | 'COUNTRYSIDE_RUNNER'
  | 'SIDE_PLATFORMER';

export const WORLD_TYPE_LABEL: Record<WorldType, string> = {
  TOP_DOWN_CENITAL: 'Cenital pura (90 grados)',
  TOP_DOWN_THREE_QUARTER: 'Cenital 3/4 (RPG)',
  COUNTRYSIDE_RUNNER: 'Countryside (runner lateral)',
  SIDE_PLATFORMER: 'Plataformas laterales',
};

export const WORLD_TYPE_HINT: Record<WorldType, string> = {
  TOP_DOWN_CENITAL: 'Camara perpendicular al suelo. Sin ordenacion por profundidad.',
  TOP_DOWN_THREE_QUARTER: 'Perspectiva clasica de RPG. Activa el Y-sort 2.5D.',
  COUNTRYSIDE_RUNNER: 'Vista lateral con desplazamiento continuo y capas de parallax.',
  SIDE_PLATFORMER: 'Vista lateral con gravedad, plataformas de un sentido y escaleras.',
};

/**
 * Biomas del catalogo. El bioma NO es texto libre: filtra que bloques ofrece la
 * paleta y que estilo usan los fondos generados, asi que debe coincidir con las
 * claves con las que estan etiquetados los bloques en la base de datos.
 */
export const BIOMES = [
  { key: 'grassland', label: 'Pradera', hint: 'Hierba, tierra, senderos y agua dulce.' },
  { key: 'forest', label: 'Bosque', hint: 'Arboles densos, follaje, troncos y enredaderas.' },
  { key: 'jungle', label: 'Selva', hint: 'Palmeras, platanos, cafetales y vegetacion tupida.' },
  { key: 'desert', label: 'Desierto', hint: 'Arena, roca seca, ruinas y duna.' },
  { key: 'tundra', label: 'Tundra', hint: 'Nieve, hielo y roca helada.' },
  { key: 'volcanic', label: 'Volcanico', hint: 'Lava, obsidiana, ceniza y grietas.' },
  { key: 'mountain', label: 'Montana', hint: 'Roca, riscos y pasos de piedra.' },
  { key: 'swamp', label: 'Pantano', hint: 'Agua turbia, lodo y raices.' },
  { key: 'cave', label: 'Cueva', hint: 'Interiores de roca, estalactitas y minerales.' },
  { key: 'dungeon', label: 'Mazmorra', hint: 'Losa de piedra, muros, columnas y ruinas.' },
  { key: 'castle', label: 'Castillo', hint: 'Sillar, almenas, banderas y salones.' },
  { key: 'village', label: 'Aldea', hint: 'Casas, tejados, vallas y pozos.' },
  { key: 'city', label: 'Ciudad', hint: 'Cemento, andenes, senales y mobiliario urbano.' },
  { key: 'countryside', label: 'Campina', hint: 'Caminos, pajares, carretas y campos.' },
  { key: 'industrial', label: 'Industrial', hint: 'Metal, conductos, rejillas y maquinaria.' },
  { key: 'interior', label: 'Interior', hint: 'Suelos de madera, mobiliario y decoracion.' },
] as const;

export type BiomeKey = (typeof BIOMES)[number]['key'];

export type VisualPattern =
  | 'solid'
  | 'noise'
  | 'bricks'
  | 'planks'
  | 'checker'
  | 'stripes'
  | 'dots'
  | 'organic'
  | 'liquid'
  | 'spikes'
  | 'ladder'
  | 'canopy'
  | 'slab'
  | 'cracked'
  | 'rubble'
  | 'column'
  | 'grassTuft'
  | 'grassEdge'
  | 'vine'
  | 'cobble'
  | 'thatch'
  | 'metal'
  | 'glass'
  | 'fabric'
  | 'wood'
  | 'roofTile'
  | 'window'
  | 'flame'
  | 'statue'
  | 'railing'
  | 'wheel'
  | 'signpost'
  // Siluetas de objeto (`core/shapes.ts`). A diferencia de los patrones, no
  // rellenan la celda: dibujan la forma del objeto sobre fondo transparente.
  | 'barrel'
  | 'crate'
  | 'bed'
  | 'table'
  | 'roundTable'
  | 'chair'
  | 'stool'
  | 'chest'
  | 'wardrobe'
  | 'shelf'
  | 'bookshelf'
  | 'painting'
  | 'mirror'
  | 'rug'
  | 'tv'
  | 'radio'
  | 'deskLamp'
  | 'cauldron'
  | 'torch'
  | 'streetLamp'
  | 'candle'
  | 'bucket'
  | 'wellStone'
  | 'signArrow'
  | 'cone'
  | 'barrier'
  | 'scaffold'
  | 'car'
  | 'bus'
  | 'train'
  | 'cart'
  | 'coin'
  | 'gem'
  | 'trap';

export interface VisualDescriptor {
  pattern: VisualPattern;
  colors: string[];
  accent?: string;
  detail?: number;
  /** Detalle superpuesto: grietas, musgo, escombros. */
  overlay?: 'cracks' | 'moss' | 'rubble' | 'snow' | 'wet' | 'soot' | null;
}

export type BlockCategory =
  | 'TERRAIN'
  | 'WALL'
  | 'COLUMN'
  | 'RUIN'
  | 'VEGETATION'
  | 'FLUID'
  | 'PROP'
  | 'FURNITURE'
  | 'STRUCTURE'
  | 'VEHICLE'
  | 'SIGN'
  | 'LIGHT'
  | 'DECOR'
  | 'ENTRANCE';

export const CATEGORY_LABEL: Record<BlockCategory, string> = {
  TERRAIN: 'Terreno',
  WALL: 'Muros',
  COLUMN: 'Columnas',
  RUIN: 'Ruinas',
  VEGETATION: 'Vegetacion',
  FLUID: 'Fluidos',
  PROP: 'Props',
  FURNITURE: 'Mobiliario',
  STRUCTURE: 'Estructuras',
  VEHICLE: 'Vehiculos',
  SIGN: 'Senales',
  LIGHT: 'Luces',
  DECOR: 'Decoracion',
  ENTRANCE: 'Entradas',
};

export type PlacementMode = 'GRID' | 'FREE';

export interface BlockDefinition {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  worldTypes: WorldType[];
  layer: LayerName;
  category: BlockCategory;
  placement: PlacementMode;
  tags: string[];
  variant: number;
  animated: boolean;
  entrance: boolean;
  collisionFlags: number;
  biome: string;
  visual: VisualDescriptor;
  ySortOffset: number;
  heightInTiles: number;
  breakable: boolean;
  craftable: boolean;
  recipe?: Array<{ key: string; qty: number }> | null;
  dropQuantity: number;
  /** Tamano al soltarlo, en fracciones de baldosa. */
  defaultScale: number;
  /** PROCEDURAL dibuja `visual`; el resto usa `imageData`. */
  origin: AssetOrigin;
  /** Si pertenece al catalogo base del sistema intocable. */
  isSystem?: boolean;
  /** Sprite propio en data URL para los bloques creados con la IA. */
  imageData?: string | null;
}

export type AssetOrigin = 'PROCEDURAL' | 'AI_LOCAL' | 'AI_CLOUD' | 'UPLOAD';

export interface WorldSummary {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  type: WorldType;
  tileSize: number;
  chunkSize: number;
  biome: string;
  seed: number;
  background: string;
  gravity: number;
  /** Inclinacion de la rejilla en grados; 0 = ortogonal. */
  gridAngle: number;
  /** Carriles del runner y ancho de cada uno en baldosas. */
  laneCount: number;
  laneWidth: number;
  version: number;
  ownerId: string;
  updatedAt: string;
  /** Un interior es un mundo enlazado a la celda de entrada de su exterior. */
  isInterior: boolean;
  parentWorldId?: string | null;
  entranceTileX?: number | null;
  entranceTileY?: number | null;
  _count?: { chunks: number };
  owner?: { id: string; username: string };
}

export interface WorldDetail extends WorldSummary {
  stats: {
    chunkCount: number;
    bounds: { minCx: number; minCy: number; maxCx: number; maxCy: number };
  };
}

export type EditOperation =
  | { op: 'PLACE'; layer: LayerName; tileX: number; tileY: number; blockKey: string }
  | { op: 'BREAK'; layer: LayerName; tileX: number; tileY: number }
  | {
      op: 'FILL';
      layer: LayerName;
      tileX: number;
      tileY: number;
      width: number;
      height: number;
      blockKey: string;
    }
  | {
      op: 'CLEAR';
      layer: LayerName;
      tileX: number;
      tileY: number;
      width: number;
      height: number;
    };

export interface MutationResult {
  worldId: string;
  chunks: ChunkPayload[];
  cellsChanged: number;
  rewards: {
    points: number;
    experience: number;
    level: number;
    levelUp: boolean;
    drops: Record<string, number>;
    unlocked: string[];
  };
}

export interface PlayerProfile {
  points: number;
  experience: number;
  level: number;
  nextLevelAt: number;
  inventory: Array<{
    blockKey: string;
    name: string;
    layer: LayerName;
    visual: VisualDescriptor;
    quantity: number;
  }>;
  achievements: Array<{
    key: string;
    name: string;
    description: string;
    points: number;
    unlockedAt: string;
  }>;
}

export interface AiSuggestion {
  id: string;
  worldId: string;
  provider: string;
  prompt: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'FAILED';
  error?: string | null;
  createdAt: string;
  summary?: string;
  operations?: EditOperation[];
}

export interface AiStatus {
  enabled: boolean;
  defaultProvider: string;
  providers: Record<string, boolean>;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  user: { id: string; email: string; username: string; role: string };
}

export type WeatherType =
  | 'NONE'
  | 'RAIN'
  | 'SNOW'
  | 'DUST'
  | 'ASH'
  | 'LAVA_RAIN'
  | 'FOG'
  | 'MIST'
  | 'STORM';
export type WindDirection =
  | 'NONE'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'DOWN_LEFT'
  | 'DOWN_RIGHT'
  | 'UP';
export type FluidFlow = 'STILL' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';

export const WEATHER_LABEL: Record<WeatherType, string> = {
  NONE: 'Despejado',
  RAIN: 'Lluvia',
  SNOW: 'Nieve',
  DUST: 'Polvo',
  ASH: 'Ceniza',
  LAVA_RAIN: 'Lluvia de lava',
  FOG: 'Niebla',
  MIST: 'Neblina',
  STORM: 'Tormenta electrica',
};

/** Etiqueta y flecha de cada direccion de viento. */
export const WIND_LABEL: Record<WindDirection, { label: string; arrow: string }> = {
  NONE: { label: 'Sin viento', arrow: '•' },
  DOWN: { label: 'Abajo', arrow: '↓' },
  LEFT: { label: 'Izquierda', arrow: '←' },
  RIGHT: { label: 'Derecha', arrow: '→' },
  DOWN_LEFT: { label: 'Abajo-izquierda', arrow: '↙' },
  DOWN_RIGHT: { label: 'Abajo-derecha', arrow: '↘' },
  UP: { label: 'Arriba', arrow: '↑' },
};

export const FLOW_LABEL: Record<FluidFlow, { label: string; arrow: string }> = {
  STILL: { label: 'Quieto', arrow: '•' },
  LEFT: { label: 'Izquierda', arrow: '←' },
  RIGHT: { label: 'Derecha', arrow: '→' },
  UP: { label: 'Arriba', arrow: '↑' },
  DOWN: { label: 'Abajo', arrow: '↓' },
};

export interface WeatherSetting {
  id: string;
  worldId: string;
  type: WeatherType;
  intensity: number;
  windDirection: WindDirection;
  windStrength: number;
  fogDensity: number;
  tint: string;
  emissionRate: number;
  /** Relampagos, independientes del tipo: se pueden anadir a una ventisca. */
  lightning: boolean;
  /** Segundos medios entre destellos. */
  lightningEvery: number;
  lightningTint: string;
  enabled: boolean;
}

export interface FluidSetting {
  id: string;
  worldId: string;
  blockKey: string;
  flow: FluidFlow;
  speed: number;
  waveHeight: number;
  bubbles: boolean;
  bubbleRate: number;
}

export interface PlacedObject {
  id: string;
  worldId: string;
  blockKey: string;
  /** Posicion en pixeles del mundo: continua, no ajustada a la rejilla. */
  x: number;
  y: number;
  rotation: number;
  scale: number;
  flipX: boolean;
  layer: LayerName;
  zOffset: number;
}

export interface Interior {
  id: string;
  slug: string;
  name: string;
  biome?: string;
  entranceTileX: number | null;
  entranceTileY: number | null;
  _count?: { chunks: number };
}

/** Herramienta activa de la mano virtual. */
export type EditorTool = 'HAND' | 'PLACE' | 'BREAK' | 'RECT' | 'PICK' | 'PAN' | 'OBJECT';

export const TOOL_LABEL: Record<EditorTool, string> = {
  HAND: 'Mano',
  PLACE: 'Colocar',
  BREAK: 'Romper',
  RECT: 'Rectangulo',
  PICK: 'Cuentagotas',
  PAN: 'Desplazar',
  OBJECT: 'Mobiliario',
};

export interface Presence {
  socketId: string;
  userId: string;
  username: string;
  tileX: number;
  tileY: number;
  updatedAt: number;
}
