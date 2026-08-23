import { BlockCategory, LayerKind, PlacementMode } from '../../src/enums';
import { ALL, FLAGS, type BlockSeed, type Pattern } from './types';

/**
 * ---------------------------------------------------------------------------
 *  Props, mobiliario, estructuras y vehiculos
 * ---------------------------------------------------------------------------
 *  El mobiliario y los adornos usan `placement: FREE`: se arrastran y se
 *  sueltan en cualquier punto, sin adherirse a la rejilla, porque una silla o
 *  un cuadro rara vez caen justo en el centro de una baldosa.
 *
 *  Las estructuras (casas, castillos, chozas) son bloques ancla de varios
 *  tiles: el editor coloca una sola pieza y el plugin la expande. Las que
 *  llevan `entrance: true` pueden enlazarse con un mundo interior.
 * ---------------------------------------------------------------------------
 */

function light(
  key: string,
  name: string,
  biome: string,
  glow: string,
  base: string[],
  variant: number,
  shape: 'torch' | 'candle' | 'streetLamp' | 'deskLamp' | 'cauldron' = 'torch',
  scale = 1,
): BlockSeed {
  return {
    key,
    name,
    worldTypes: ALL,
    layer: LayerKind.OVERLAY,
    category: BlockCategory.LIGHT,
    collisionFlags: FLAGS.NONE,
    biome,
    visual: { pattern: shape, colors: base, accent: glow, detail: 0.6 },
    tags: ['luz', 'iluminacion'],
    variant,
    // Las llamas parpadean: el motor las anima.
    animated: true,
    defaultScale: scale,
  };
}

const LIGHTS: BlockSeed[] = [
  light('torch_wall', 'Antorcha de muro', 'dungeon', '#f2a63c', ['#5c4430', '#3a2a1c'], 1, 'torch', 0.8),
  light('torch_stand', 'Antorcha de pie', 'dungeon', '#f2a63c', ['#4d473d', '#2f2b24'], 2, 'torch', 1.1),
  light('lamp_small', 'Lamparilla', 'interior', '#f6d78a', ['#c8b48a', '#4a4132'], 3, 'deskLamp', 0.7),
  light('lamp_street', 'Farola', 'city', '#ffe9a8', ['#3d424a', '#22262c'], 4, 'streetLamp', 2),
  light('lantern_hanging', 'Farol colgante', 'village', '#f2c94c', ['#4a4132', '#2b261d'], 5, 'candle', 0.8),
  light('brazier', 'Pebetero', 'castle', '#ff8a3c', ['#5a4e44', '#332c26'], 6, 'cauldron', 1.2),
  light('candle', 'Vela', 'interior', '#ffeec2', ['#e6dfcd', '#b8b09c'], 7, 'candle', 0.5),
  light('crystal_lamp', 'Lampara de cristal', 'cave', '#7fd8e8', ['#cfe3ee', '#3b4a56'], 8, 'deskLamp', 0.8),
];

function statue(key: string, name: string, biome: string, colors: string[], accent: string, variant: number): BlockSeed {
  return {
    key,
    name,
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.DECOR,
    collisionFlags: FLAGS.SOLID,
    biome,
    visual: { pattern: 'statue', colors, accent, detail: 0.4 },
    tags: ['estatua', 'adorno'],
    variant,
    heightInTiles: 2,
    ySortOffset: -2,
  };
}

const STATUES: BlockSeed[] = [
  statue('statue_warrior', 'Estatua del guerrero', 'castle', ['#8d919b', '#9ea2ac'], '#b6bac4', 1),
  statue('statue_angel', 'Estatua alada', 'castle', ['#c8ccd4', '#dde1e8'], '#f0f3f7', 2),
  statue('statue_beast', 'Estatua de bestia', 'dungeon', ['#5c5f68', '#6b6f79'], '#7d818c', 3),
  statue('statue_obelisk', 'Obelisco', 'desert', ['#b09a68', '#c2ab78'], '#d4bf90', 4),
  statue('statue_idol', 'Idolo de piedra', 'jungle', ['#5a6b52', '#6b7c60'], '#87977a', 5),
  statue('statue_broken', 'Estatua rota', 'dungeon', ['#5c5f68', '#6b6f79'], '#7d818c', 6),
];

/**
 * Mobiliario de interior: colocacion libre.
 *
 * Cada mueble declara su SILUETA (`shape`), no un material. Un barril con
 * patron `wood` se dibujaba como una baldosa de veta de madera: reconocible
 * como madera, irreconocible como barril. Las formas viven en
 * `modules/creador2d/core/shapes.ts` y se pintan sobre fondo transparente.
 *
 * `defaultScale` es el tamano con el que aparece al soltarlo, en fracciones de
 * baldosa. Una cama no mide lo mismo que una vela, y obligar al usuario a
 * redimensionar cada pieza tras colocarla seria trabajo inutil.
 */
function furniture(
  key: string,
  name: string,
  biome: string,
  shape: Pattern,
  colors: string[],
  accent: string,
  variant: number,
  solid = false,
  defaultScale = 1,
): BlockSeed {
  return {
    key,
    name,
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.FURNITURE,
    placement: PlacementMode.FREE,
    collisionFlags: solid ? FLAGS.SOLID : FLAGS.NONE,
    biome,
    visual: { pattern: shape, colors, accent, detail: 0.4 },
    tags: ['mobiliario', 'interior'],
    variant,
    ySortOffset: -2,
    defaultScale,
  };
}

const FURNITURE: BlockSeed[] = [
  furniture('chest_wood', 'Baul de madera', 'interior', 'chest', ['#7a5330', '#5d3d22'], '#c9a227', 1, true),
  furniture('chest_iron', 'Baul reforzado', 'dungeon', 'chest', ['#4a4f59', '#33373f'], '#c9a227', 2, true),
  furniture('bed_simple', 'Cama sencilla', 'interior', 'bed', ['#c8b48a', '#6b4a2f'], '#5f7f9c', 3, true, 2),
  furniture('bed_royal', 'Cama con dosel', 'castle', 'bed', ['#d8d0bc', '#4a2b33'], '#8c2f3f', 4, true, 2.4),
  furniture('table_wood', 'Mesa de madera', 'interior', 'table', ['#8a5f38', '#5d3d22'], '#a3743f', 5, true, 1.6),
  furniture('table_round', 'Mesa redonda', 'interior', 'roundTable', ['#7d5836', '#54371f'], '#8d6640', 6, true, 1.5),
  furniture('chair_wood', 'Silla', 'interior', 'chair', ['#8a5f38', '#5d3d22'], '#a3743f', 7, false, 0.9),
  furniture('stool', 'Taburete', 'interior', 'stool', ['#7d5836', '#54371f'], '#8d6640', 8, false, 0.7),
  furniture('shelf', 'Estanteria', 'interior', 'shelf', ['#7d5836', '#54371f'], '#a3743f', 9, true, 1.4),
  furniture('barrel', 'Barril', 'village', 'barrel', ['#8a5f38', '#5d3d22'], '#6b6f79', 10, true, 0.9),
  furniture('crate', 'Caja de madera', 'village', 'crate', ['#9c6d40', '#6b4a2f'], '#b8834f', 11, true, 0.9),
  furniture('painting', 'Cuadro', 'interior', 'painting', ['#e8dcc0', '#6b4d38'], '#7a9c5f', 12),
  furniture('mirror', 'Espejo', 'interior', 'mirror', ['#6b4d38', '#4a3428'], '#a8c8dc', 13, false, 1.3),
  furniture('rug', 'Alfombra', 'interior', 'rug', ['#7f3a47', '#5a2731'], '#e0c86a', 14, false, 1.8),
  furniture('bookshelf', 'Libreria', 'interior', 'bookshelf', ['#6b4d38', '#472f22'], '#8c4a4a', 15, true, 1.6),
  furniture('tv_set', 'Televisor', 'city', 'tv', ['#383c44', '#1c1f24'], '#6fb3d9', 16, true, 1.1),
  furniture('radio_set', 'Radio', 'city', 'radio', ['#8a6a4a', '#4a3728'], '#c9a227', 17, false, 0.8),
  furniture('lamp_table', 'Lampara de mesa', 'interior', 'deskLamp', ['#c8b48a', '#5a5040'], '#f6d78a', 18, false, 0.8),
  furniture('wardrobe', 'Armario', 'interior', 'wardrobe', ['#6b4d38', '#472f22'], '#c9a227', 19, true, 1.8),
  furniture('cauldron', 'Caldero', 'dungeon', 'cauldron', ['#3a3a42', '#22222a'], '#5fa03a', 20, true, 1.1),
];

/** Estructuras completas: se colocan como una pieza y el motor las expande. */
function structure(
  key: string,
  name: string,
  biome: string,
  colors: string[],
  accent: string,
  variant: number,
  size: number,
  options: { ruined?: boolean; entrance?: boolean } = {},
): BlockSeed {
  const { ruined = false, entrance = true } = options;

  return {
    key,
    name,
    description: ruined
      ? 'Estructura derruida; parcialmente transitable.'
      : 'Estructura completa. Puede enlazarse con un mundo interior propio.',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: ruined ? BlockCategory.RUIN : BlockCategory.STRUCTURE,
    collisionFlags: entrance ? FLAGS.SOLID | FLAGS.TRIGGER : FLAGS.SOLID,
    biome,
    visual: {
      pattern: ruined ? 'rubble' : 'roofTile',
      colors,
      accent,
      detail: ruined ? 0.7 : 0.4,
      overlay: ruined ? 'rubble' : undefined,
    },
    tags: ruined ? ['estructura', 'ruina'] : ['estructura', 'edificio'],
    variant,
    heightInTiles: size,
    ySortOffset: -4,
    entrance,
    breakable: false,
  };
}

const HOUSE_STYLES: Array<[string, string, string[], string, string]> = [
  ['house_cottage', 'Casa de campo', ['#8a5f38', '#9c6d40'], '#7d3b2c', 'countryside'],
  ['house_stone', 'Casa de piedra', ['#6a6d76', '#7a7e88'], '#7d3b2c', 'village'],
  ['house_timber', 'Casa entramada', ['#d8cdb4', '#e6dcc6'], '#5a4130', 'village'],
  ['house_adobe', 'Casa de adobe', ['#c2a271', '#d2b482'], '#8a5f38', 'desert'],
  ['house_thatch', 'Casa con techo de paja', ['#8a5f38', '#9c6d40'], '#c4a75a', 'countryside'],
  ['house_wooden', 'Cabana de madera', ['#7a5330', '#8a5f38'], '#5a3d24', 'forest'],
  ['house_urban', 'Casa urbana', ['#8b8f95', '#9aa0a6'], '#4a4f59', 'city'],
  ['house_shop', 'Tienda', ['#a3743f', '#b58450'], '#2f6b45', 'village'],
  ['house_tavern', 'Taberna', ['#7a5330', '#8a5f38'], '#c9a227', 'village'],
  ['house_snow', 'Casa nevada', ['#c9d4dc', '#dbe4ea'], '#5c6b78', 'tundra'],
];

const CASTLE_STYLES: Array<[string, string, string[], string, string]> = [
  ['castle_keep', 'Torre del homenaje', ['#6a6d76', '#7a7e88'], '#3f5f8a', 'castle'],
  ['castle_gate', 'Puerta fortificada', ['#5c5f68', '#6b6f79'], '#8a4a32', 'castle'],
  ['castle_tower', 'Torreon', ['#7a7e88', '#8a8e98'], '#6b2f3a', 'castle'],
  ['castle_wall_section', 'Lienzo de muralla', ['#5c5f68', '#6b6f79'], '#7d818c', 'castle'],
  ['castle_barracks', 'Cuartel', ['#6a6d76', '#7a7e88'], '#4a4f59', 'castle'],
  ['castle_chapel', 'Capilla', ['#c8ccd4', '#dde1e8'], '#3f5f8a', 'castle'],
  ['castle_hall', 'Gran salon', ['#7a7e88', '#8a8e98'], '#c9a227', 'castle'],
  ['castle_dungeon', 'Mazmorra', ['#4c4f57', '#5c606a'], '#2f333a', 'dungeon'],
  ['castle_sand', 'Fortaleza del desierto', ['#b09a68', '#c2ab78'], '#8a6a3a', 'desert'],
  ['castle_dark', 'Fortaleza oscura', ['#2f323b', '#3d414c'], '#8c2f2f', 'volcanic'],
];

const STRUCTURES: BlockSeed[] = [
  ...HOUSE_STYLES.map(([key, name, colors, accent, biome], index) =>
    structure(key, name, biome, colors, accent, index + 1, 3),
  ),
  ...CASTLE_STYLES.map(([key, name, colors, accent, biome], index) =>
    structure(key, name, biome, colors, accent, index + 1, 4),
  ),
  // Cinco chozas en ruinas
  ...[1, 2, 3, 4, 5].map((n) =>
    structure(
      `hut_ruin_${n}`,
      `Choza en ruinas ${n}`,
      'countryside',
      ['#6b5a45', '#7a6952'],
      '#8a7a62',
      n,
      2,
      { ruined: true, entrance: n <= 2 },
    ),
  ),
  // Cinco castillos en ruinas
  ...[1, 2, 3, 4, 5].map((n) =>
    structure(
      `castle_ruin_${n}`,
      `Castillo en ruinas ${n}`,
      'castle',
      ['#5c5f68', '#6b6f79'],
      '#7d818c',
      n,
      4,
      { ruined: true, entrance: n <= 2 },
    ),
  ),
];

/**
 * Vehiculos y transportes.
 *
 * Van orientados en VERTICAL y vistos desde arriba. En un runner el trafico
 * ocupa el carril y avanza hacia el jugador: un coche dibujado de perfil se ve
 * atravesado en la calzada, que es justo lo que no hace un coche.
 *
 * `heightInTiles` es la longitud real del vehiculo en baldosas, y de ella
 * depende que un autobus tape dos carriles de largo y un tren cinco.
 */
function vehicle(
  key: string,
  name: string,
  biome: string,
  shape: 'car' | 'bus' | 'train' | 'cart',
  colors: string[],
  accent: string,
  variant: number,
  lengthInTiles = 2,
): BlockSeed {
  return {
    key,
    name,
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.VEHICLE,
    placement: PlacementMode.FREE,
    collisionFlags: FLAGS.SOLID,
    biome,
    visual: { pattern: shape, colors, accent, detail: 0.45 },
    tags: ['vehiculo', shape === 'cart' ? 'carreta' : 'trafico'],
    variant,
    heightInTiles: lengthInTiles,
    ySortOffset: -3,
    breakable: false,
    defaultScale: lengthInTiles,
  };
}

const VEHICLES: BlockSeed[] = [
  vehicle('cart_wood', 'Carreta de madera', 'countryside', 'cart', ['#8a5f38', '#5d3d22'], '#c4a75a', 1),
  vehicle('cart_hay', 'Carreta de heno', 'countryside', 'cart', ['#9c6d40', '#6b4a2f'], '#d9c07a', 2),
  vehicle('cart_merchant', 'Carreta de mercader', 'village', 'cart', ['#7d5836', '#54371f'], '#8c2f2f', 3),
  vehicle('carriage', 'Carruaje', 'village', 'cart', ['#4a3a2c', '#2d231a'], '#c9a227', 4),
  vehicle('wagon_covered', 'Carromato entoldado', 'countryside', 'cart', ['#8a5f38', '#5d3d22'], '#d8d0bc', 5),
  vehicle('car_sedan', 'Automovil', 'city', 'car', ['#3a72a5', '#1f4058'], '#9fd0ea', 6),
  vehicle('car_van', 'Furgoneta', 'city', 'car', ['#9aa0a6', '#5f6469'], '#cfe3ee', 7, 2.4),
  vehicle('car_taxi', 'Taxi', 'city', 'car', ['#e8b634', '#a97f1a'], '#2a2d33', 8),
  vehicle('car_wreck', 'Vehiculo abandonado', 'city', 'car', ['#6a6256', '#3f3a32'], '#8c4a3a', 9),
  vehicle('bus_city', 'Autobus urbano', 'city', 'bus', ['#c4470d', '#7d2c07'], '#cfe3ee', 10, 4),
  vehicle('bus_school', 'Autobus escolar', 'city', 'bus', ['#e0b020', '#9c7712'], '#2a2d33', 11, 4),
  vehicle('truck_cargo', 'Camion de carga', 'city', 'bus', ['#7f3a47', '#4d222a'], '#cfe3ee', 12, 4.5),
  vehicle('train_metro', 'Vagon de metro', 'city', 'train', ['#8b939c', '#4e555c'], '#7fc4e8', 13, 6),
  vehicle('train_freight', 'Vagon de mercancias', 'city', 'train', ['#4a5a4a', '#26302a'], '#8d919b', 14, 6),
];

/** Pozos, cubos y senalizacion. */
const UTILITY: BlockSeed[] = [
  {
    key: 'well_stone',
    name: 'Pozo de agua',
    description: 'Adorno funcional. Con interior enlazado, se puede entrar.',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.ENTRANCE,
    collisionFlags: FLAGS.SOLID | FLAGS.TRIGGER,
    biome: 'village',
    visual: { pattern: 'wellStone', colors: ['#7a7e88', '#4e525a'], accent: '#3a4a55', detail: 0.5 },
    tags: ['pozo', 'agua', 'entrada'],
    entrance: true,
    ySortOffset: -3,
    breakable: false,
    defaultScale: 1.4,
  },
  {
    key: 'well_wood',
    name: 'Pozo con techado',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.ENTRANCE,
    collisionFlags: FLAGS.SOLID | FLAGS.TRIGGER,
    biome: 'countryside',
    visual: { pattern: 'wellStone', colors: ['#8a8e98', '#5a5e66'], accent: '#8a5f38', detail: 0.45 },
    tags: ['pozo', 'agua', 'entrada', 'techado'],
    entrance: true,
    heightInTiles: 2,
    ySortOffset: -3,
    breakable: false,
    defaultScale: 1.6,
  },
  {
    key: 'bucket',
    name: 'Cubo',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.PROP,
    placement: PlacementMode.FREE,
    collisionFlags: FLAGS.NONE,
    biome: 'village',
    visual: { pattern: 'bucket', colors: ['#8d919b', '#5a5e66'], accent: '#7d5836', detail: 0.4 },
    tags: ['cubo', 'agua', 'adorno'],
    defaultScale: 0.6,
  },
  {
    key: 'door_wood',
    name: 'Puerta de madera',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.ENTRANCE,
    collisionFlags: FLAGS.TRIGGER,
    biome: 'interior',
    visual: { pattern: 'planks', colors: ['#6b4526', '#7d512d'], accent: '#c9a227', detail: 0.25 },
    tags: ['puerta', 'entrada'],
    entrance: true,
  },
  {
    key: 'door_iron',
    name: 'Puerta de hierro',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.ENTRANCE,
    collisionFlags: FLAGS.TRIGGER,
    biome: 'dungeon',
    visual: { pattern: 'metal', colors: ['#4a4f59', '#586070'], accent: '#79839a', detail: 0.3 },
    tags: ['puerta', 'entrada', 'metal'],
    entrance: true,
  },
];

function sign(key: string, name: string, biome: string, accent: string, variant: number): BlockSeed {
  return {
    key,
    name,
    description: 'Senalizacion: indica direccion o informa del camino.',
    worldTypes: ALL,
    layer: LayerKind.WALL,
    category: BlockCategory.SIGN,
    placement: PlacementMode.FREE,
    collisionFlags: FLAGS.TRIGGER,
    biome,
    visual: { pattern: 'signArrow', colors: [accent, '#5d3d22'], accent: '#2a2d33', detail: 0.4 },
    tags: ['senal', 'direccion'],
    variant,
    ySortOffset: -3,
    defaultScale: 1.1,
  };
}

const SIGNS: BlockSeed[] = [
  sign('sign_direction', 'Senal de direccion', 'countryside', '#e0d5c0', 1),
  sign('sign_village', 'Senal de aldea', 'village', '#c9a227', 2),
  sign('sign_danger', 'Senal de peligro', 'dungeon', '#c4470d', 3),
  sign('sign_info', 'Panel informativo', 'city', '#3f7fa5', 4),
  sign('sign_milestone', 'Mojon de camino', 'countryside', '#9aa0a6', 5),
  sign('sign_urban', 'Senal urbana', 'city', '#2f6b45', 6),
];

export const PROP_BLOCKS: BlockSeed[] = [
  ...LIGHTS,
  ...STATUES,
  ...FURNITURE,
  ...STRUCTURES,
  ...VEHICLES,
  ...UTILITY,
  ...SIGNS,
];
