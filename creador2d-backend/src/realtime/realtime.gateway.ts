import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { AppConfig } from '../common/config/configuration';
import { AccessTokenPayload, AuthenticatedUser } from '../auth/auth.types';
import { ChunksService } from '../chunks/chunks.service';
import { WorldsService } from '../worlds/worlds.service';
import { ChunkPayload } from '../common/domain/tiles';
import { applyOperationsSchema, viewportQuerySchema } from '../chunks/dto/chunk.schemas';

/** Mensaje `chunk:subscribe`: la ventana HTTP mas el mundo destino. */
const subscribeChunksSchema = viewportQuerySchema.extend({
  worldId: z.uuid('worldId debe ser un UUID'),
});

interface SocketState {
  user: AuthenticatedUser;
  worlds: Set<string>;
}

/** Sala de socket de un mundo. */
const worldRoom = (worldId: string) => `world:${worldId}`;

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly states = new Map<string, SocketState>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<{ app: AppConfig }, true>,
    private readonly chunksService: ChunksService,
    private readonly worldsService: WorldsService,
  ) {}

  /**
   * El handshake exige un token de acceso valido. Un socket sin identidad se
   * desconecta de inmediato: no existe modo anonimo en el canal de edicion.
   */
  async handleConnection(client: Socket): Promise<void> {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers.authorization?.replace('Bearer ', '') as string | undefined);

    if (!token) {
      client.emit('auth:error', { message: 'Falta el token de acceso' });
      client.disconnect(true);
      return;
    }

    try {
      const config = this.configService.get('app', { infer: true });
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: config.jwt.accessSecret,
      });

      this.states.set(client.id, {
        user: {
          id: payload.sub,
          email: payload.email,
          username: payload.username,
          role: payload.role,
        },
        worlds: new Set(),
      });

      client.emit('auth:ok', { userId: payload.sub, username: payload.username });
    } catch {
      client.emit('auth:error', { message: 'Token invalido o expirado' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const state = this.states.get(client.id);
    if (state) {
      for (const worldId of state.worlds) {
        client.to(worldRoom(worldId)).emit('presence:left', {
          socketId: client.id,
          userId: state.user.id,
          username: state.user.username,
        });
      }
    }
    this.states.delete(client.id);
  }

  @SubscribeMessage('world:join')
  async joinWorld(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { worldId?: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const state = this.requireState(client);
    if (!state || !body?.worldId) {
      return { ok: false, error: 'Peticion invalida' };
    }

    try {
      await this.worldsService.assertAccess(body.worldId, state.user, 'read');
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }

    await client.join(worldRoom(body.worldId));
    state.worlds.add(body.worldId);

    client.to(worldRoom(body.worldId)).emit('presence:joined', {
      socketId: client.id,
      userId: state.user.id,
      username: state.user.username,
    });

    return { ok: true };
  }

  @SubscribeMessage('world:leave')
  async leaveWorld(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { worldId?: string },
  ): Promise<{ ok: boolean }> {
    const state = this.requireState(client);
    if (!state || !body?.worldId) {
      return { ok: false };
    }

    await client.leave(worldRoom(body.worldId));
    state.worlds.delete(body.worldId);
    client.to(worldRoom(body.worldId)).emit('presence:left', {
      socketId: client.id,
      userId: state.user.id,
      username: state.user.username,
    });

    return { ok: true };
  }

  /** Descarga de la ventana 3x3 de chunks sin pasar por HTTP. */
  @SubscribeMessage('chunk:subscribe')
  async subscribeChunks(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<{ ok: boolean; chunks?: ChunkPayload[]; error?: string }> {
    const state = this.requireState(client);
    if (!state) {
      return { ok: false, error: 'No autenticado' };
    }

    const parsed = subscribeChunksSchema.safeParse(body);

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Parametros invalidos' };
    }

    try {
      const { chunks } = await this.chunksService.getViewport(
        state.user,
        parsed.data.worldId,
        parsed.data.cx,
        parsed.data.cy,
        parsed.data.radius,
      );
      return { ok: true, chunks };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  /** Aplica ediciones y las replica al resto de colaboradores del mundo. */
  @SubscribeMessage('edit:apply')
  async applyEdit(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<{ ok: boolean; revisionByChunk?: Record<string, number>; error?: string }> {
    const state = this.requireState(client);
    if (!state) {
      return { ok: false, error: 'No autenticado' };
    }

    const worldId = (body as { worldId?: string })?.worldId;
    const parsed = applyOperationsSchema.safeParse(body);

    if (!parsed.success || !worldId) {
      return {
        ok: false,
        error: parsed.success ? 'Falta worldId' : parsed.error.issues[0]?.message,
      };
    }

    try {
      const result = await this.chunksService.applyOperations(
        state.user,
        worldId,
        parsed.data.operations,
      );

      this.broadcastChunks(worldId, result.chunks, client.id);

      return {
        ok: true,
        revisionByChunk: Object.fromEntries(
          result.chunks.map((chunk) => [`${chunk.cx}:${chunk.cy}`, chunk.revision]),
        ),
      };
    } catch (error) {
      this.logger.warn(`edit:apply rechazado — ${(error as Error).message}`);
      return { ok: false, error: (error as Error).message };
    }
  }

  /** Posicion de la mano virtual de cada colaborador. */
  @SubscribeMessage('cursor:move')
  cursorMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { worldId?: string; tileX?: number; tileY?: number },
  ): void {
    const state = this.requireState(client);
    if (!state || !body?.worldId || !state.worlds.has(body.worldId)) {
      return;
    }

    client.to(worldRoom(body.worldId)).emit('presence:cursor', {
      socketId: client.id,
      userId: state.user.id,
      username: state.user.username,
      tileX: Math.trunc(body.tileX ?? 0),
      tileY: Math.trunc(body.tileY ?? 0),
    });
  }

  /**
   * Punto unico de difusion de chunks. Lo usa tanto el gateway como el
   * controlador HTTP, de modo que una edicion por REST llega igualmente a los
   * clientes conectados por socket.
   */
  broadcastChunks(worldId: string, chunks: ChunkPayload[], exceptSocketId?: string): void {
    const payload = { worldId, chunks };
    const room = this.server?.to(worldRoom(worldId));

    if (!room) {
      return;
    }

    if (exceptSocketId) {
      this.server.to(worldRoom(worldId)).except(exceptSocketId).emit('chunk:updated', payload);
    } else {
      room.emit('chunk:updated', payload);
    }
  }

  /** Avisa de que el mundo se ha vaciado por completo. */
  broadcastWorldCleared(worldId: string): void {
    this.server?.to(worldRoom(worldId)).emit('world:cleared', { worldId });
  }

  private requireState(client: Socket): SocketState | null {
    const state = this.states.get(client.id);
    if (!state) {
      client.emit('auth:error', { message: 'Sesion no inicializada' });
      client.disconnect(true);
      return null;
    }
    return state;
  }
}
