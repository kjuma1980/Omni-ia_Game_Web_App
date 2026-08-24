import { z } from 'zod';
import {
  aiStatusSchema,
  aiSuggestionSchema,
  authSessionSchema,
  blockDefinitionSchema,
  healthSchema,
  fluidSettingSchema,
  interiorSchema,
  mutationResultSchema,
  parallaxLayerSchema,
  placedObjectSchema,
  profileSchema,
  weatherSchema,
  viewportSchema,
  worldDetailSchema,
  worldSummarySchema,
} from '../schemas';
import { CATALOG } from '../../../creador2d-backend/prisma/catalog';
import type {
  AiStatus,
  AiSuggestion,
  AuthSession,
  BlockDefinition,
  EditOperation,
  FluidSetting,
  Interior,
  MutationResult,
  PlacedObject,
  PlayerProfile,
  WeatherSetting,
  WorldDetail,
  WorldSummary,
  WorldType,
} from '../types';
import type { ChunkPayload } from '../core/grid';
import type { ParallaxLayer } from '../core/parallax';

/**
 * URL de la API. Se puede sobreescribir con VITE_CREADOR2D_API sin recompilar
 * nada mas. El puerto 3000 esta reservado en esta maquina y no debe usarse.
 */
export const API_BASE_URL: string =
  (import.meta.env?.VITE_CREADOR2D_API as string | undefined) ?? 'http://127.0.0.1:4310';

const REFRESH_STORAGE_KEY = 'creador2d.refresh';

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Cliente REST del Creador 2D.
 *
 * Custodia de credenciales: el token de acceso vive SOLO en memoria; el de
 * refresco se guarda en `localStorage` para sobrevivir a un recargado de la
 * ventana. Ninguna clave de proveedor cloud pasa por aqui: esas viven
 * exclusivamente en el proceso del backend.
 */
export class Creador2DClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(private readonly baseUrl: string = API_BASE_URL) {
    try {
      this.refreshToken = window.localStorage.getItem(REFRESH_STORAGE_KEY);
    } catch {
      this.refreshToken = null;
    }
  }

  get isAuthenticated(): boolean {
    return Boolean(this.accessToken);
  }

  get hasStoredSession(): boolean {
    return Boolean(this.refreshToken);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  private persistSession(session: AuthSession): AuthSession {
    this.accessToken = session.accessToken;
    this.refreshToken = session.refreshToken;

    try {
      window.localStorage.setItem(REFRESH_STORAGE_KEY, session.refreshToken);
    } catch {
      // Modo privado o almacenamiento lleno: la sesion sigue viva en memoria.
    }

    return session;
  }

  private clearSession(): void {
    this.accessToken = null;
    this.refreshToken = null;
    try {
      window.localStorage.removeItem(REFRESH_STORAGE_KEY);
    } catch {
      // Nada que limpiar.
    }
  }

  // ----------------------------- transporte -------------------------------

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
    retryOnUnauthorized = true,
  ): Promise<T> {
    const isWeb = typeof window !== 'undefined' && ((window as any).__OMNI_IS_WEB__ === true || !((window as any).__TAURI_INTERNALS__?.invoke));
    if (isWeb) {
      return this.handleWebMockRequest(path, init, schema);
    }

    const headers: Record<string, string> = {
      ...((init.headers as Record<string, string>) ?? {}),
    };

    if (init.body !== undefined && init.body !== null) {
      headers['content-type'] = 'application/json';
    }

    if (this.accessToken) {
      headers.authorization = `Bearer ${this.accessToken}`;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api${path}`, { ...init, headers });
    } catch (fetchErr: any) {
      if (isWeb) {
        return this.handleWebMockRequest(path, init, schema);
      }
      throw fetchErr;
    }

    if (response.status === 401 && retryOnUnauthorized) {
      if (this.refreshToken) {
        const refreshed = await this.ensureRefreshed();
        if (refreshed) {
          return this.request(path, schema, init, false);
        }
      }

      try {
        const invoke = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
        const correo =
          localStorage.getItem('omni_auth_email') ||
          localStorage.getItem('omni_user_email') ||
          sessionStorage.getItem('omni_auth_email') ||
          sessionStorage.getItem('omni_user_email');
        if (invoke && correo) {
          const secreto = await invoke('creador2d_link_secret');
          if (secreto) {
            await this.cloudSession(correo, secreto);
            return this.request(path, schema, init, false);
          }
        }
      } catch {
        // Ignorar y dejar caer al manejo comun de error 401
      }
    }

    if (!response.ok) {
      let details: unknown;
      let message = `Error ${response.status}`;

      try {
        details = await response.json();
        const body = details as { message?: unknown };
        if (typeof body?.message === 'string') {
          message = body.message;
        }
      } catch {
        message = `${message}: ${response.statusText}`;
      }

      throw new ApiError(message, response.status, details);
    }

    if (response.status === 204) {
      return schema.parse(undefined);
    }

    const payload = await response.json();
    const parsed = schema.safeParse(payload);

    if (!parsed.success) {
      throw new ApiError(
        `Respuesta inesperada del servidor en ${path}: ${parsed.error.issues[0]?.message ?? ''}`,
        response.status,
        parsed.error.issues,
      );
    }

    return parsed.data;
  }

  private handleWebMockRequest<T>(path: string, init: RequestInit, schema: z.ZodType<T>): T {
    const method = (init.method || 'GET').toUpperCase();
    const cleanPath = path.split('?')[0];

    if (cleanPath === '/health') {
      return schema.parse({
        service: 'creador2d',
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      } as any);
    }

    if (cleanPath.startsWith('/auth/cloud-session') || cleanPath.startsWith('/auth/login') || cleanPath.startsWith('/auth/register') || cleanPath.startsWith('/auth/refresh')) {
      const session = {
        accessToken: 'web-access-token-' + Date.now(),
        refreshToken: 'web-refresh-token-' + Date.now(),
        expiresIn: '86400s',
        user: { id: 'web-user-1', email: 'usuario@omni.web', username: 'Creador Web', role: 'admin' }
      };
      this.persistSession(session as any);
      return schema.parse(session as any);
    }

    if (cleanPath.startsWith('/auth/engine-token')) {
      return schema.parse({ token: 'web-engine-token-mock', fingerprint: 'web-fp-mock' } as any);
    }

    if (cleanPath === '/profile') {
      return schema.parse({
        id: 'web-user-1',
        email: 'usuario@omni.web',
        username: 'Creador Web',
        createdWorldsCount: 1,
        placedBlocksCount: 100,
      } as any);
    }

    if (cleanPath === '/worlds/import' && method === 'POST') {
      const STORAGE_KEY = 'omni_web_creador2d_worlds';
      let worlds: any[] = [];
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        worlds = raw ? JSON.parse(raw) : [];
      } catch {
        worlds = [];
      }

      let payload: any = {};
      try {
        payload = init.body ? JSON.parse(init.body as string) : {};
      } catch {
        payload = {};
      }

      const worldData = payload.world || payload;
      const importedId = worldData.id || ('world-imported-' + Date.now());
      const newWorld = {
        id: importedId,
        slug: worldData.slug || 'mundo-' + importedId,
        name: worldData.name || 'Mundo Importado 2D',
        description: worldData.description || '',
        type: worldData.type || 'TOP_DOWN_CENITAL',
        tileSize: worldData.tileSize || 32,
        chunkSize: worldData.chunkSize || 16,
        biome: worldData.biome || 'grassy_plains',
        seed: worldData.seed || 12345,
        background: worldData.background || '#1a1e29',
        gravity: worldData.gravity || 9.8,
        gridAngle: worldData.gridAngle || 0,
        laneCount: worldData.laneCount || 3,
        laneWidth: worldData.laneWidth || 2,
        version: worldData.version || 1,
        ownerId: worldData.ownerId || 'web-user-1',
        createdAt: worldData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isInterior: worldData.isInterior || false,
        _count: { chunks: Array.isArray(worldData.chunks) ? worldData.chunks.length : 0 },
        stats: worldData.stats || {
          chunkCount: Array.isArray(worldData.chunks) ? worldData.chunks.length : 0,
          bounds: { minCx: 0, minCy: 0, maxCx: 0, maxCy: 0 }
        }
      };

      const existingIdx = worlds.findIndex((w: any) => w.id === importedId);
      if (existingIdx >= 0) {
        worlds[existingIdx] = newWorld;
      } else {
        worlds.push(newWorld);
      }

      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(worlds)); } catch {}
      return schema.parse({ id: importedId } as any);
    }

    if (cleanPath === '/worlds') {
      const STORAGE_KEY = 'omni_web_creador2d_worlds';
      let worlds: any[] = [];
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        worlds = raw ? JSON.parse(raw) : [];
      } catch {
        worlds = [];
      }

      if (worlds.length === 0) {
        worlds = [
          {
            id: 'world-web-demo',
            slug: 'mundo-web-demo',
            name: 'Mundo Demo 2D (Web)',
            description: 'Mundo interactivo 2D creado en la versión Web Universal',
            type: 'TOP_DOWN_CENITAL',
            tileSize: 32,
            chunkSize: 16,
            biome: 'grassy_plains',
            seed: 12345,
            background: '#1a1e29',
            gravity: 9.8,
            gridAngle: 0,
            laneCount: 3,
            laneWidth: 2,
            version: 1,
            ownerId: 'web-user-1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isInterior: false,
            _count: { chunks: 1 },
            stats: {
              chunkCount: 1,
              bounds: { minCx: 0, minCy: 0, maxCx: 0, maxCy: 0 }
            }
          }
        ];
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(worlds)); } catch {}
      }

      if (method === 'GET') {
        const sanitized = worlds.map((w: any) => ({
          ...w,
          stats: w.stats || { chunkCount: w._count?.chunks || 0, bounds: { minCx: 0, minCy: 0, maxCx: 0, maxCy: 0 } }
        }));
        return schema.parse(sanitized as any);
      }

      if (method === 'POST') {
        const body = init.body ? JSON.parse(init.body as string) : {};
        const newWorld = {
          id: 'world-web-' + Date.now(),
          slug: body.slug || 'mundo-web-' + Date.now(),
          name: body.name || 'Nuevo Mundo Web',
          description: body.description || '',
          type: body.type || 'TOP_DOWN_CENITAL',
          tileSize: body.tileSize || 32,
          chunkSize: body.chunkSize || 16,
          biome: body.biome || 'grassy_plains',
          seed: body.seed || 12345,
          background: body.background || '#1a1e29',
          gravity: body.gravity || 9.8,
          gridAngle: body.gridAngle || 0,
          laneCount: body.laneCount || 3,
          laneWidth: body.laneWidth || 2,
          version: 1,
          ownerId: 'web-user-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isInterior: false,
          _count: { chunks: 0 },
          stats: {
            chunkCount: 0,
            bounds: { minCx: 0, minCy: 0, maxCx: 0, maxCy: 0 }
          }
        };
        worlds.push(newWorld);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(worlds)); } catch {}
        return schema.parse(newWorld as any);
      }
    }

    if (cleanPath.startsWith('/worlds/')) {
      const parts = cleanPath.split('/');
      const worldId = parts[2];
      const STORAGE_KEY = 'omni_web_creador2d_worlds';
      let worlds: any[] = [];
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        worlds = raw ? JSON.parse(raw) : [];
      } catch {
        worlds = [];
      }
      const rawWorld = worlds.find((w: any) => w.id === worldId) || {
        id: worldId,
        slug: 'mundo-' + worldId,
        name: 'Mundo 2D Web',
        description: 'Mundo 2D Web',
        type: 'TOP_DOWN_CENITAL',
        tileSize: 32,
        chunkSize: 16,
        biome: 'grassy_plains',
        seed: 12345,
        background: '#1a1e29',
        gravity: 9.8,
        gridAngle: 0,
        laneCount: 3,
        laneWidth: 2,
        version: 1,
        ownerId: 'web-user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isInterior: false,
        _count: { chunks: 0 },
        stats: {
          chunkCount: 0,
          bounds: { minCx: 0, minCy: 0, maxCx: 0, maxCy: 0 }
        }
      };

      const existingWorld = {
        ...rawWorld,
        stats: rawWorld.stats || {
          chunkCount: rawWorld._count?.chunks || 0,
          bounds: { minCx: 0, minCy: 0, maxCx: 0, maxCy: 0 }
        }
      };

      if (cleanPath.endsWith('/export')) {
        return schema.parse({
          world: existingWorld,
          chunks: []
        } as any);
      }

      if (cleanPath.endsWith('/chunks/viewport')) {
        return schema.parse({
          world: existingWorld,
          chunks: []
        } as any);
      }

      if (cleanPath.endsWith('/chunks')) {
        if (method === 'DELETE') {
          return schema.parse({ chunksDeleted: 0 } as any);
        }
        return schema.parse({ applied: 1, errors: [] } as any);
      }

      if (method === 'GET') {
        return schema.parse(existingWorld as any);
      }

      if (method === 'PATCH') {
        const body = init.body ? JSON.parse(init.body as string) : {};
        Object.assign(existingWorld, body, { updatedAt: new Date().toISOString() });
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(worlds)); } catch {}
        return schema.parse(existingWorld as any);
      }

      if (cleanPath.endsWith('/weather')) {
        if (method === 'PATCH' || method === 'POST') {
          const body = init.body ? JSON.parse(init.body as string) : {};
          return schema.parse({
            id: 'weather-' + worldId,
            worldId,
            type: body.type || 'NONE',
            intensity: body.intensity ?? 0.5,
            windDirection: body.windDirection || 'NONE',
            windStrength: body.windStrength ?? 0,
            fogDensity: body.fogDensity ?? 0,
            tint: body.tint || '#9fb4c7',
            emissionRate: body.emissionRate ?? 10,
            lightning: body.lightning ?? false,
            lightningEvery: body.lightningEvery ?? 7,
            lightningTint: body.lightningTint || '#dbe9ff',
            enabled: body.enabled ?? (body.type && body.type !== 'NONE'),
          } as any);
        }
        return schema.parse({
          id: 'weather-' + worldId,
          worldId,
          type: 'NONE',
          intensity: 0.5,
          windDirection: 'NONE',
          windStrength: 0,
          fogDensity: 0,
          tint: '#9fb4c7',
          emissionRate: 10,
          lightning: false,
          lightningEvery: 7,
          lightningTint: '#dbe9ff',
          enabled: false,
        } as any);
      }

      if (cleanPath.endsWith('/fluids')) {
        if (method === 'POST' || method === 'PUT') {
          const body = init.body ? JSON.parse(init.body as string) : {};
          return schema.parse({
            id: 'fluid-' + Date.now(),
            worldId,
            blockKey: body.blockKey || 'water',
            flow: body.flow || 'STILL',
            speed: body.speed ?? 1,
            waveHeight: body.waveHeight ?? 0.2,
            bubbles: body.bubbles ?? false,
            bubbleRate: body.bubbleRate ?? 5,
          } as any);
        }
        return schema.parse({
          inUse: [],
          settings: []
        } as any);
      }

      if (method === 'DELETE') {
        worlds = worlds.filter((w: any) => w.id !== worldId);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(worlds)); } catch {}
        return schema.parse({ deleted: true } as any);
      }
    }

    if (cleanPath.startsWith('/blocks')) {
      if (cleanPath.endsWith('/custom') && method === 'POST') {
        const body = init.body ? JSON.parse(init.body as string) : {};
        const customBlock = {
          id: 'custom_block_' + Date.now(),
          key: body.key || 'custom_block_' + Date.now(),
          name: body.name || 'Bloque Personalizado',
          description: body.description || 'Creado con IA',
          worldTypes: body.worldTypes || ['TOP_DOWN_CENITAL', 'TOP_DOWN_THREE_QUARTER', 'COUNTRYSIDE_RUNNER', 'SIDE_PLATFORMER'],
          layer: body.layer || 'GROUND',
          category: body.category || 'TERRAIN',
          placement: body.placement || 'GRID',
          tags: body.tags || ['custom', 'ai'],
          variant: 1,
          animated: false,
          entrance: false,
          collisionFlags: body.collisionFlags ?? 0,
          biome: body.biome || 'all',
          visual: body.visual || { pattern: 'solid', colors: ['#4a5568'] },
          ySortOffset: 0,
          heightInTiles: body.heightInTiles || 1,
          breakable: true,
          craftable: false,
          recipe: null,
          dropQuantity: 1,
          defaultScale: 1,
          origin: body.origin || 'AI_LOCAL',
          isSystem: false,
          imageData: body.imageData || null,
        };

        const CUSTOM_KEY = 'omni_web_creador2d_custom_blocks';
        let customBlocks: any[] = [];
        try {
          const raw = localStorage.getItem(CUSTOM_KEY);
          customBlocks = raw ? JSON.parse(raw) : [];
        } catch {
          customBlocks = [];
        }
        customBlocks.push(customBlock);
        try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customBlocks)); } catch {}

        return schema.parse(customBlock as any);
      }

      const systemBlocks = CATALOG.map((b: any) => ({
        id: b.id || `sys_${b.key}`,
        key: b.key,
        name: b.name,
        description: b.description || '',
        worldTypes: b.worldTypes || ['TOP_DOWN_CENITAL', 'TOP_DOWN_THREE_QUARTER', 'COUNTRYSIDE_RUNNER', 'SIDE_PLATFORMER'],
        layer: b.layer || 'GROUND',
        category: b.category || 'TERRAIN',
        placement: b.placement || 'GRID',
        tags: b.tags || [],
        variant: b.variant || 1,
        animated: b.animated || false,
        entrance: b.entrance || false,
        collisionFlags: b.collisionFlags ?? 0,
        biome: b.biome || 'all',
        visual: b.visual,
        ySortOffset: b.ySortOffset || 0,
        heightInTiles: b.heightInTiles || 1,
        breakable: b.breakable || false,
        craftable: b.craftable || false,
        recipe: b.recipe || null,
        dropQuantity: b.dropQuantity || 1,
        defaultScale: b.defaultScale || 1,
        origin: b.origin || 'PROCEDURAL',
        isSystem: true,
        imageData: b.imageData || null,
      }));

      const CUSTOM_KEY = 'omni_web_creador2d_custom_blocks';
      let customBlocks: any[] = [];
      try {
        const raw = localStorage.getItem(CUSTOM_KEY);
        customBlocks = raw ? JSON.parse(raw) : [];
      } catch {
        customBlocks = [];
      }

      return schema.parse([...systemBlocks, ...customBlocks] as any);
    }

    try {
      return schema.parse({} as any);
    } catch {
      return schema.parse([] as any);
    }
  }

  /**
   * Igual que `request`, pero validando la lista ELEMENTO A ELEMENTO.
   *
   * Con `z.array(schema)` basta que un solo elemento no encaje para que falle
   * la respuesta entera. Eso ya rompio el editor una vez: al ampliar el
   * catalogo, los bloques con un patron de dibujo nuevo invalidaban toda la
   * lista y la paleta aparecia vacia en las cuatro perspectivas, como si no
   * hubiera ningun bloque. Un backend mas nuevo que el editor es una situacion
   * normal, no un error: se conserva lo que se entiende y se descarta el resto.
   */
  private async requestList<T>(
    path: string,
    itemSchema: z.ZodType<T>,
    label: string,
  ): Promise<T[]> {
    const raw = await this.request(path, z.array(z.unknown()), { method: 'GET' });

    const items: T[] = [];
    const rejected: string[] = [];

    for (const entry of raw) {
      const parsed = itemSchema.safeParse(entry);
      if (parsed.success) {
        items.push(parsed.data);
      } else {
        const key =
          (entry as { key?: string; id?: string })?.key ??
          (entry as { id?: string })?.id ??
          '(sin identificar)';
        rejected.push(`${key}: ${parsed.error.issues[0]?.message ?? 'forma inesperada'}`);
      }
    }

    if (rejected.length > 0) {
      console.warn(
        `[Creador2D] ${rejected.length} de ${raw.length} ${label} se descartaron por no encajar ` +
          `con el esquema del editor. Probablemente el backend es mas nuevo que esta ventana; ` +
          `recargue. Ejemplos: ${rejected.slice(0, 3).join(' | ')}`,
      );
    }

    return items;
  }

  /** Una unica rotacion en vuelo, aunque varias peticiones fallen a la vez. */
  private ensureRefreshed(): Promise<boolean> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = (async () => {
      try {
        const session = await this.request(
          '/auth/refresh',
          authSessionSchema,
          { method: 'POST', body: JSON.stringify({ refreshToken: this.refreshToken }) },
          false,
        );
        this.persistSession(session);
        return true;
      } catch {
        this.clearSession();
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  // ------------------------------ sesion ----------------------------------

  async health() {
    return this.request('/health', healthSchema, { method: 'GET' });
  }

  async login(identifier: string, password: string): Promise<AuthSession> {
    const session = await this.request(
      '/auth/login',
      authSessionSchema,
      { method: 'POST', body: JSON.stringify({ identifier, password }) },
      false,
    );
    return this.persistSession(session);
  }

  async register(email: string, username: string, password: string): Promise<AuthSession> {
    const session = await this.request(
      '/auth/register',
      authSessionSchema,
      { method: 'POST', body: JSON.stringify({ email, username, password }) },
      false,
    );
    return this.persistSession(session);
  }

  /**
   * Sesion a partir de la cuenta de Omni IA Game, sin segundo login.
   *
   * Devuelve exactamente lo mismo que `login`, y la sesion se guarda por el
   * mismo camino: a partir de aqui nada distingue una de otra.
   */
  async cloudSession(email: string, secret: string): Promise<AuthSession> {
    const session = await this.request(
      '/auth/cloud-session',
      authSessionSchema,
      { method: 'POST', body: JSON.stringify({ email, secret }) },
      false,
    );
    return this.persistSession(session);
  }

  /** Restaura la sesion al abrir la pestana usando el refresh persistido. */
  async restore(): Promise<boolean> {
    if (!this.refreshToken) {
      return false;
    }
    return this.ensureRefreshed();
  }

  async logout(): Promise<void> {
    if (this.accessToken) {
      await this.request('/auth/logout', z.unknown(), {
        method: 'POST',
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      }).catch(() => undefined);
    }
    this.clearSession();
  }

  /** Token de servicio de 12 h para pegar en el plugin del motor. */
  async engineToken(worldId: string) {
    return this.request(
      `/auth/engine-token/${worldId}`,
      z.object({ token: z.string(), fingerprint: z.string() }),
      { method: 'POST' },
    );
  }

  // ------------------------------ catalogo --------------------------------

  async listBlocks(worldType?: WorldType, biome?: string): Promise<BlockDefinition[]> {
    const params = new URLSearchParams();
    if (worldType) params.set('worldType', worldType);
    if (biome) params.set('biome', biome);
    const query = params.toString();

    // Elemento a elemento: un bloque con un campo inesperado no puede dejar la
    // paleta entera vacia.
    return this.requestList(
      `/blocks${query ? `?${query}` : ''}`,
      blockDefinitionSchema,
      'bloques',
    ) as Promise<BlockDefinition[]>;
  }

  // ------------------------------- mundos ---------------------------------

  async listWorlds(): Promise<WorldSummary[]> {
    return this.requestList('/worlds', worldSummarySchema, 'mundos') as Promise<WorldSummary[]>;
  }

  async getWorld(worldId: string): Promise<WorldDetail> {
    return this.request(`/worlds/${worldId}`, worldDetailSchema, {
      method: 'GET',
    }) as Promise<WorldDetail>;
  }

  async createWorld(payload: Record<string, unknown>): Promise<WorldSummary> {
    return this.request('/worlds', worldSummarySchema, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<WorldSummary>;
  }

  async updateWorld(worldId: string, payload: Record<string, unknown>): Promise<WorldSummary> {
    return this.request(`/worlds/${worldId}`, worldSummarySchema, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<WorldSummary>;
  }

  async deleteWorld(worldId: string) {
    return this.request(`/worlds/${worldId}`, z.object({ deleted: z.literal(true) }), {
      method: 'DELETE',
    });
  }

  /**
   * Alta de un bloque con sprite propio. Es la puerta de entrada de lo que se
   * genera en el tab de sprites de Omni IA Game.
   */
  async createCustomBlock(payload: Record<string, unknown>): Promise<BlockDefinition> {
    return this.request('/blocks/custom', blockDefinitionSchema, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<BlockDefinition>;
  }

  async deleteCustomBlock(key: string) {
    return this.request(`/blocks/custom/${key}`, z.object({ deleted: z.literal(true) }), {
      method: 'DELETE',
    });
  }

  // ------------------------------- chunks ---------------------------------

  /** Ventana 3x3 alrededor del chunk de la camara. */
  async getViewport(
    worldId: string,
    cx: number,
    cy: number,
    radius = 1,
  ): Promise<{ world: WorldSummary; chunks: ChunkPayload[] }> {
    return this.request(
      `/worlds/${worldId}/chunks/viewport?cx=${cx}&cy=${cy}&radius=${radius}`,
      viewportSchema,
      { method: 'GET' },
    ) as Promise<{ world: WorldSummary; chunks: ChunkPayload[] }>;
  }

  /** Vacia el mundo entero conservando el mundo en si. */
  async clearWorld(worldId: string): Promise<{ chunksDeleted: number }> {
    return this.request(
      `/worlds/${worldId}/chunks`,
      z.object({ chunksDeleted: z.number().int() }),
      { method: 'DELETE' },
    );
  }

  async applyOperations(worldId: string, operations: EditOperation[]): Promise<MutationResult> {
    return this.request(`/worlds/${worldId}/chunks`, mutationResultSchema, {
      method: 'POST',
      body: JSON.stringify({ operations }),
    }) as Promise<MutationResult>;
  }

  // ---------------------------- gamificacion ------------------------------

  async getProfile(): Promise<PlayerProfile> {
    return this.request('/profile', profileSchema, { method: 'GET' }) as Promise<PlayerProfile>;
  }

  async craft(blockKey: string, times = 1) {
    return this.request(
      '/profile/craft',
      z.object({ blockKey: z.string(), quantity: z.number(), crafted: z.number() }),
      { method: 'POST', body: JSON.stringify({ blockKey, times }) },
    );
  }

  async grantStarterKit() {
    return this.request('/profile/starter-kit', z.object({ granted: z.number() }), {
      method: 'POST',
    });
  }

  // --------------------------------- IA -----------------------------------

  async aiStatus(worldId: string): Promise<AiStatus> {
    return this.request(`/worlds/${worldId}/ai/status`, aiStatusSchema, {
      method: 'GET',
    }) as Promise<AiStatus>;
  }

  async aiSuggest(
    worldId: string,
    payload: {
      prompt: string;
      provider?: string;
      area: { tileX: number; tileY: number; width: number; height: number };
    },
  ): Promise<AiSuggestion> {
    return this.request(`/worlds/${worldId}/ai/suggest`, aiSuggestionSchema, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<AiSuggestion>;
  }

  async aiAccept(worldId: string, suggestionId: string): Promise<MutationResult> {
    return this.request(
      `/worlds/${worldId}/ai/suggestions/${suggestionId}/accept`,
      mutationResultSchema,
      { method: 'POST' },
    ) as Promise<MutationResult>;
  }

  async aiReject(worldId: string, suggestionId: string): Promise<AiSuggestion> {
    return this.request(
      `/worlds/${worldId}/ai/suggestions/${suggestionId}/reject`,
      aiSuggestionSchema,
      { method: 'POST' },
    ) as Promise<AiSuggestion>;
  }

  // ------------------------------- parallax -------------------------------

  async listParallax(worldId: string): Promise<ParallaxLayer[]> {
    return this.requestList(
      `/worlds/${worldId}/parallax`,
      parallaxLayerSchema,
      'capas de parallax',
    ) as Promise<ParallaxLayer[]>;
  }

  /** Disponibilidad del generador local de fondos (ComfyUI). */
  async parallaxGeneratorStatus(worldId: string) {
    return this.request(
      `/worlds/${worldId}/parallax/generator/status`,
      z.object({
        available: z.boolean(),
        baseUrl: z.string(),
        checkpoint: z.string(),
        detail: z.string().optional(),
      }),
      { method: 'GET' },
    );
  }

  async createParallaxLayer(
    worldId: string,
    payload: { kind: string; name: string },
  ): Promise<ParallaxLayer> {
    return this.request(`/worlds/${worldId}/parallax`, parallaxLayerSchema, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<ParallaxLayer>;
  }

  async updateParallaxLayer(
    worldId: string,
    layerId: string,
    payload: Record<string, unknown>,
  ): Promise<ParallaxLayer> {
    return this.request(`/worlds/${worldId}/parallax/${layerId}`, parallaxLayerSchema, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<ParallaxLayer>;
  }

  async deleteParallaxLayer(worldId: string, layerId: string) {
    return this.request(
      `/worlds/${worldId}/parallax/${layerId}`,
      z.object({ deleted: z.literal(true) }),
      { method: 'DELETE' },
    );
  }

  /** Prompt que se usaria, con su justificacion. No consume GPU. */
  async previewParallaxPrompt(worldId: string, payload: Record<string, unknown>) {
    return this.request(
      `/worlds/${worldId}/parallax/prompt-preview`,
      z.object({
        positive: z.string(),
        negative: z.string(),
        width: z.number(),
        height: z.number(),
        rationale: z.string(),
      }),
      { method: 'POST', body: JSON.stringify(payload) },
    );
  }

  async generateParallaxLayer(
    worldId: string,
    layerId: string,
    payload: Record<string, unknown>,
  ) {
    return this.request(
      `/worlds/${worldId}/parallax/${layerId}/generate`,
      z.object({
        layer: parallaxLayerSchema,
        seed: z.number(),
        elapsedMs: z.number(),
        rationale: z.string(),
      }),
      { method: 'POST', body: JSON.stringify(payload) },
    );
  }

  // --------------------------- clima y fluidos ----------------------------

  async getWeather(worldId: string): Promise<WeatherSetting> {
    return this.request(`/worlds/${worldId}/weather`, weatherSchema, {
      method: 'GET',
    }) as Promise<WeatherSetting>;
  }

  async updateWeather(worldId: string, payload: Record<string, unknown>): Promise<WeatherSetting> {
    return this.request(`/worlds/${worldId}/weather`, weatherSchema, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<WeatherSetting>;
  }

  async listFluids(worldId: string): Promise<FluidSetting[]> {
    return this.requestList(
      `/worlds/${worldId}/fluids`,
      fluidSettingSchema,
      'fluidos',
    ) as Promise<FluidSetting[]>;
  }

  /** Fluidos realmente colocados en el mundo; solo esos merece configurar. */
  async fluidsInUse(worldId: string): Promise<string[]> {
    return this.request(`/worlds/${worldId}/fluids/in-use`, z.array(z.string()), {
      method: 'GET',
    });
  }

  async upsertFluid(worldId: string, payload: Record<string, unknown>): Promise<FluidSetting> {
    return this.request(`/worlds/${worldId}/fluids`, fluidSettingSchema, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<FluidSetting>;
  }

  // -------------------------- objetos libres ------------------------------

  async listObjects(worldId: string): Promise<PlacedObject[]> {
    return this.requestList(
      `/worlds/${worldId}/objects`,
      placedObjectSchema,
      'objetos',
    ) as Promise<PlacedObject[]>;
  }

  async placeObject(worldId: string, payload: Record<string, unknown>): Promise<PlacedObject> {
    return this.request(`/worlds/${worldId}/objects`, placedObjectSchema, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<PlacedObject>;
  }

  async moveObject(
    worldId: string,
    objectId: string,
    payload: Record<string, unknown>,
  ): Promise<PlacedObject> {
    return this.request(`/worlds/${worldId}/objects/${objectId}`, placedObjectSchema, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<PlacedObject>;
  }

  async deleteObject(worldId: string, objectId: string) {
    return this.request(
      `/worlds/${worldId}/objects/${objectId}`,
      z.object({ deleted: z.literal(true) }),
      { method: 'DELETE' },
    );
  }

  // ------------------------------ interiores ------------------------------

  async listInteriors(worldId: string): Promise<Interior[]> {
    return this.requestList(
      `/worlds/${worldId}/interiors`,
      interiorSchema,
      'interiores',
    ) as Promise<Interior[]>;
  }

  async createInterior(worldId: string, payload: Record<string, unknown>): Promise<WorldSummary> {
    return this.request(`/worlds/${worldId}/interiors`, worldSummarySchema, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<WorldSummary>;
  }

  // ----------------------------- exportacion ------------------------------

  /** Descarga cruda para exportar a fichero; el motor usa el mismo endpoint. */
  async exportWorld(worldId: string, format?: 'chunks' | 'matrix' | 'collision'): Promise<unknown> {
    const suffix = format && format !== 'chunks' ? `/${format}` : '';
    return this.request(`/worlds/${worldId}/export${suffix}`, z.unknown(), { method: 'GET' });
  }

  /** Importa una exportacion completa en el backend de Creador 2D. */
  async importWorld(worldExport: unknown): Promise<{ id: string }> {
    return this.request<{ id: string }>('/worlds/import', z.object({ id: z.string() }), {
      method: 'POST',
      body: JSON.stringify(worldExport),
    });
  }
}

export { ApiError };
