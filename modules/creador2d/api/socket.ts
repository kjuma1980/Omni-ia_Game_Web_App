import { io, type Socket } from 'socket.io-client';
import { chunkPayloadSchema } from '../schemas';
import type { ChunkPayload } from '../core/grid';
import type { EditOperation, Presence } from '../types';
import { API_BASE_URL } from './client';

export interface RealtimeHandlers {
  onChunks: (chunks: ChunkPayload[]) => void;
  /** Otro editor vacio el mundo entero. */
  onWorldCleared: () => void;
  onPresence: (presence: Presence) => void;
  onPresenceLeft: (socketId: string) => void;
  onStatus: (status: 'connecting' | 'online' | 'offline' | 'error', detail?: string) => void;
}

/**
 * Canal de edicion en tiempo real.
 *
 * La conexion es opcional por diseno: si el socket no levanta, el editor sigue
 * funcionando contra la API REST. Lo que se pierde es la colaboracion, no la
 * capacidad de editar.
 */
export class RealtimeClient {
  private socket: Socket | null = null;
  private worldId: string | null = null;
  private cursorThrottle = 0;

  constructor(
    private readonly handlers: RealtimeHandlers,
    private readonly baseUrl: string = API_BASE_URL,
  ) {}

  connect(accessToken: string, worldId: string): void {
    this.disconnect();
    this.worldId = worldId;
    this.handlers.onStatus('connecting');

    const isWeb = typeof window !== 'undefined' && ((window as any).__OMNI_IS_WEB__ === true || !((window as any).__TAURI_INTERNALS__?.invoke));
    if (isWeb) {
      this.handlers.onStatus('online');
      return;
    }

    this.socket = io(`${this.baseUrl}/realtime`, {
      transports: ['websocket'],
      auth: { token: accessToken },
      reconnectionAttempts: 5,
      reconnectionDelay: 1500,
      timeout: 8000,
    });

    this.socket.on('connect', () => {
      this.socket?.emit('world:join', { worldId }, (response: { ok: boolean; error?: string }) => {
        if (response?.ok) {
          this.handlers.onStatus('online');
        } else {
          this.handlers.onStatus('error', response?.error ?? 'No se pudo unir al mundo');
        }
      });
    });

    this.socket.on('auth:error', (payload: { message?: string }) => {
      this.handlers.onStatus('error', payload?.message ?? 'Autenticacion rechazada');
    });

    this.socket.on('disconnect', () => this.handlers.onStatus('offline'));
    this.socket.on('connect_error', (error: Error) =>
      this.handlers.onStatus('offline', error.message),
    );

    this.socket.on('chunk:updated', (payload: { worldId: string; chunks: unknown[] }) => {
      if (payload?.worldId !== this.worldId || !Array.isArray(payload.chunks)) {
        return;
      }

      // Un evento malformado no debe llegar nunca al renderizador.
      const chunks: ChunkPayload[] = [];
      for (const raw of payload.chunks) {
        const parsed = chunkPayloadSchema.safeParse(raw);
        if (parsed.success) {
          chunks.push(parsed.data as ChunkPayload);
        }
      }

      if (chunks.length > 0) {
        this.handlers.onChunks(chunks);
      }
    });

    this.socket.on('world:cleared', (payload: { worldId: string }) => {
      if (payload?.worldId === this.worldId) {
        this.handlers.onWorldCleared();
      }
    });

    this.socket.on(
      'presence:cursor',
      (payload: { socketId: string; userId: string; username: string; tileX: number; tileY: number }) => {
        if (!payload?.socketId) {
          return;
        }
        this.handlers.onPresence({ ...payload, updatedAt: Date.now() });
      },
    );

    this.socket.on('presence:left', (payload: { socketId: string }) => {
      if (payload?.socketId) {
        this.handlers.onPresenceLeft(payload.socketId);
      }
    });
  }

  /**
   * Envia un lote por socket. Devuelve `false` si no hay canal, para que el
   * llamador use la ruta REST en su lugar.
   */
  applyEdit(
    operations: EditOperation[],
    ack?: (result: { ok: boolean; revisionByChunk?: Record<string, number>; error?: string }) => void,
  ): boolean {
    if (!this.socket?.connected || !this.worldId) {
      return false;
    }

    this.socket.emit(
      'edit:apply',
      { worldId: this.worldId, operations },
      (response: { ok: boolean; revisionByChunk?: Record<string, number>; error?: string }) => {
        ack?.(response ?? { ok: false, error: 'Sin respuesta del servidor' });
      },
    );

    return true;
  }

  /** Posicion de la mano virtual; limitada a ~20 envios por segundo. */
  sendCursor(tileX: number, tileY: number): void {
    if (!this.socket?.connected || !this.worldId) {
      return;
    }

    const now = Date.now();
    if (now - this.cursorThrottle < 50) {
      return;
    }
    this.cursorThrottle = now;

    this.socket.emit('cursor:move', { worldId: this.worldId, tileX, tileY });
  }

  disconnect(): void {
    if (this.socket) {
      if (this.worldId) {
        this.socket.emit('world:leave', { worldId: this.worldId });
      }
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.worldId = null;
  }

  get connected(): boolean {
    return Boolean(this.socket?.connected);
  }
}
