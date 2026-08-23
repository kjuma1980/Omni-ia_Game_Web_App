/**
 * ---------------------------------------------------------------------------
 *  Enumerados del dominio
 * ---------------------------------------------------------------------------
 *  Antes los generaba Prisma desde `schema.prisma`. SQLite NO soporta enums,
 *  asi que las columnas pasan a `String` y los valores viven aqui.
 *
 *  El patron `const X = {...} as const` mas `type X = typeof X[keyof typeof X]`
 *  reproduce EXACTAMENTE lo que emitia Prisma: un valor utilizable en tiempo de
 *  ejecucion (`Role.ADMIN`) y un tipo con el mismo nombre. Por eso los 23
 *  ficheros que los importaban solo cambian de donde vienen, no como se usan.
 *
 *  Contrapartida de SQLite, y conviene tenerla presente: la base ya NO valida
 *  el conjunto de valores. Por eso cada enum expone tambien `XValues`, para
 *  poder validarlo en el DTO, que pasa a ser la unica linea de defensa.
 * ---------------------------------------------------------------------------
 */

/**
 * Estrecha una cadena de la base al tipo del enum.
 *
 * Hace falta porque en SQLite estas columnas son `String` y Prisma devuelve
 * `string` a secas. La tentacion es un `as WorldType` y seguir, pero eso miente:
 * la base ya NO valida el conjunto de valores, asi que un dato corrupto -o
 * escrito por una version anterior- entraria como si fuera legitimo y el fallo
 * aparecerian mucho mas lejos de su causa.
 *
 * Aqui se decide una sola vez: si el valor no pertenece al enum, se usa el
 * respaldo que indique quien llama, que es quien sabe cual es el seguro.
 */
export function parseEnum<T extends string>(
  valores: readonly T[],
  raw: string | null | undefined,
  respaldo: T,
): T {
  return raw != null && (valores as readonly string[]).includes(raw) ? (raw as T) : respaldo;
}

export const Role = {
  ADMIN: 'ADMIN',
  CREATOR: 'CREATOR',
  VIEWER: 'VIEWER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const RoleValues = Object.values(Role) as Role[];

/** Tipos de mundo soportados por el editor. */
export const WorldType = {
  /** Vista cenital pura (camara a 90 grados sobre el suelo). */
  TOP_DOWN_CENITAL: 'TOP_DOWN_CENITAL',
  /** Vista cenital 3/4 (RPG clasico tipo Zelda) — habilita el Y-sort 2.5D. */
  TOP_DOWN_THREE_QUARTER: 'TOP_DOWN_THREE_QUARTER',
  /** Vista lateral con scroll continuo para runners (countryside). */
  COUNTRYSIDE_RUNNER: 'COUNTRYSIDE_RUNNER',
  /** Plataformas laterales (Mario / Contra / Castlevania). */
  SIDE_PLATFORMER: 'SIDE_PLATFORMER',
} as const;
export type WorldType = (typeof WorldType)[keyof typeof WorldType];
export const WorldTypeValues = Object.values(WorldType) as WorldType[];

/**
 * Capas de la cuadricula principal. El orden de las claves es el orden de
 * dibujado, igual que lo era el orden del enum en Prisma.
 */
export const LayerKind = {
  /** Suelo / terreno base. Nunca proyecta sombra ni participa del Y-sort. */
  GROUND: 'GROUND',
  /** Fosos, agua, lava, huecos. Se dibuja sobre el suelo y bajo los muros. */
  PIT: 'PIT',
  /** Muros dinamicos y props solidos. Participa del Y-sort 2.5D. */
  WALL: 'WALL',
  /** Techos, copas de arboles, follaje superior. Siempre por encima del actor. */
  OVERLAY: 'OVERLAY',
} as const;
export type LayerKind = (typeof LayerKind)[keyof typeof LayerKind];
export const LayerKindValues = Object.values(LayerKind) as LayerKind[];

export const WorldMemberRole = {
  OWNER: 'OWNER',
  EDITOR: 'EDITOR',
  VIEWER: 'VIEWER',
} as const;
export type WorldMemberRole = (typeof WorldMemberRole)[keyof typeof WorldMemberRole];
export const WorldMemberRoleValues = Object.values(WorldMemberRole) as WorldMemberRole[];

/**
 * Familia funcional de un bloque. Ordena la paleta y permite a los plugins
 * decidir que hacer con el (un PROP no necesita collider, una ENTRANCE si).
 */
export const BlockCategory = {
  TERRAIN: 'TERRAIN',
  WALL: 'WALL',
  COLUMN: 'COLUMN',
  RUIN: 'RUIN',
  VEGETATION: 'VEGETATION',
  FLUID: 'FLUID',
  PROP: 'PROP',
  FURNITURE: 'FURNITURE',
  STRUCTURE: 'STRUCTURE',
  VEHICLE: 'VEHICLE',
  SIGN: 'SIGN',
  LIGHT: 'LIGHT',
  DECOR: 'DECOR',
  /** Puerta, boca de cueva o pozo: puede enlazar con un interior. */
  ENTRANCE: 'ENTRANCE',
} as const;
export type BlockCategory = (typeof BlockCategory)[keyof typeof BlockCategory];
export const BlockCategoryValues = Object.values(BlockCategory) as BlockCategory[];

/** Como se coloca el elemento en el lienzo. */
export const PlacementMode = {
  /** Se adhiere a la rejilla (comportamiento por defecto). */
  GRID: 'GRID',
  /** Se arrastra y se suelta en cualquier punto: mobiliario y adornos. */
  FREE: 'FREE',
} as const;
export type PlacementMode = (typeof PlacementMode)[keyof typeof PlacementMode];
export const PlacementModeValues = Object.values(PlacementMode) as PlacementMode[];

/** Capas de parallax, de la mas lejana a la mas cercana. */
export const ParallaxKind = {
  /** Cielo y nubes. */
  SKY: 'SKY',
  /** Montanas y siluetas a lo lejos. */
  FAR: 'FAR',
  /** Arboles, follaje y relieve intermedio. */
  MID: 'MID',
  /** Vegetacion o elementos que pasan por delante del jugador. */
  NEAR: 'NEAR',
} as const;
export type ParallaxKind = (typeof ParallaxKind)[keyof typeof ParallaxKind];
export const ParallaxKindValues = Object.values(ParallaxKind) as ParallaxKind[];

export const WeatherType = {
  NONE: 'NONE',
  RAIN: 'RAIN',
  SNOW: 'SNOW',
  DUST: 'DUST',
  ASH: 'ASH',
  LAVA_RAIN: 'LAVA_RAIN',
  FOG: 'FOG',
  MIST: 'MIST',
  /**
   * Lluvia con relampagos: el destello ilumina toda la escena, no es una
   * particula mas. Se modela como tipo propio porque cambia la iluminacion.
   */
  STORM: 'STORM',
} as const;
export type WeatherType = (typeof WeatherType)[keyof typeof WeatherType];
export const WeatherTypeValues = Object.values(WeatherType) as WeatherType[];

/** Direccion del viento; gobierna la caida de la lluvia, la nieve o la lava. */
export const WindDirection = {
  NONE: 'NONE',
  DOWN: 'DOWN',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  DOWN_LEFT: 'DOWN_LEFT',
  DOWN_RIGHT: 'DOWN_RIGHT',
  UP: 'UP',
} as const;
export type WindDirection = (typeof WindDirection)[keyof typeof WindDirection];
export const WindDirectionValues = Object.values(WindDirection) as WindDirection[];

/** Sentido de desplazamiento de un fluido animado. */
export const FluidFlow = {
  STILL: 'STILL',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  UP: 'UP',
  DOWN: 'DOWN',
} as const;
export type FluidFlow = (typeof FluidFlow)[keyof typeof FluidFlow];
export const FluidFlowValues = Object.values(FluidFlow) as FluidFlow[];

/** Quien produjo una imagen de fondo. */
export const AssetOrigin = {
  PROCEDURAL: 'PROCEDURAL',
  AI_LOCAL: 'AI_LOCAL',
  AI_CLOUD: 'AI_CLOUD',
  UPLOAD: 'UPLOAD',
} as const;
export type AssetOrigin = (typeof AssetOrigin)[keyof typeof AssetOrigin];
export const AssetOriginValues = Object.values(AssetOrigin) as AssetOrigin[];

export const AiSuggestionStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
} as const;
export type AiSuggestionStatus = (typeof AiSuggestionStatus)[keyof typeof AiSuggestionStatus];
export const AiSuggestionStatusValues = Object.values(AiSuggestionStatus) as AiSuggestionStatus[];

export const AuditActor = {
  USER: 'USER',
  AI: 'AI',
  SYSTEM: 'SYSTEM',
} as const;
export type AuditActor = (typeof AuditActor)[keyof typeof AuditActor];
export const AuditActorValues = Object.values(AuditActor) as AuditActor[];

// ---------------------------------------------------------------------------
//  Estrechadores para lo que viene de la base
// ---------------------------------------------------------------------------
//  Cada uno fija su respaldo aqui, en un solo sitio, en vez de repetirlo en
//  cada llamada. El respaldo no es un detalle: es lo que ocurre cuando el dato
//  esta corrupto, y conviene que sea una decision consciente.
// ---------------------------------------------------------------------------

/**
 * Rol de un usuario.
 *
 * El respaldo es VIEWER, el de MENOR privilegio. Un rol ilegible no puede
 * acabar concediendo permisos: ante la duda, el minimo.
 */
export const asRole = (raw: string | null | undefined): Role =>
  parseEnum(RoleValues, raw, Role.VIEWER);

/**
 * Tipo de un mundo.
 *
 * El respaldo es la cenital 3/4, que es el tipo por defecto del editor y el
 * unico que no asume nada raro sobre la escena.
 */
export const asWorldType = (raw: string | null | undefined): WorldType =>
  parseEnum(WorldTypeValues, raw, WorldType.TOP_DOWN_THREE_QUARTER);

/** Capa de parallax. El respaldo es FAR, la intermedia y menos llamativa. */
export const asParallaxKind = (raw: string | null | undefined): ParallaxKind =>
  parseEnum(ParallaxKindValues, raw, ParallaxKind.FAR);

/** Capa de la rejilla. El respaldo es GROUND, la que no participa del Y-sort. */
export const asLayerKind = (raw: string | null | undefined): LayerKind =>
  parseEnum(LayerKindValues, raw, LayerKind.GROUND);
