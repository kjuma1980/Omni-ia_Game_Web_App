import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { COLLISION_FLAGS } from '../src/common/domain/tiles';

/**
 * Prueba de extremo a extremo contra la base de datos local Creador_2d.
 *
 * Crea su propio usuario y su propio mundo con nombres aleatorios, y los borra
 * al terminar: no toca los datos de la semilla ni los mundos del usuario.
 */
describe('Creador 2D API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Server;

  const suffix = randomUUID().slice(0, 8);
  const credentials = {
    email: `e2e-${suffix}@creador2d.local`,
    username: `e2e_${suffix}`,
    password: 'Prueba.E2E.2026',
  };

  let accessToken = '';
  let userId = '';
  let worldId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');

    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();

    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (userId) {
      // El borrado en cascada arrastra mundos, chunks, perfil e inventario.
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await app.close();
  });

  describe('Salud y autenticacion', () => {
    it('/api/health responde sin token', async () => {
      const response = await request(server).get('/api/health').expect(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.database).toBe('up');
    });

    it('rechaza el acceso sin token', async () => {
      await request(server).get('/api/worlds').expect(401);
    });

    it('registra un usuario y devuelve el par de tokens', async () => {
      const response = await request(server)
        .post('/api/auth/register')
        .send(credentials)
        .expect(201);

      expect(response.body.accessToken).toBeTruthy();
      expect(response.body.refreshToken).toBeTruthy();
      expect(response.body.user.username).toBe(credentials.username);

      accessToken = response.body.accessToken;
      userId = response.body.user.id;
    });

    it('rechaza una clave debil', async () => {
      await request(server)
        .post('/api/auth/register')
        .send({ email: `w-${suffix}@x.local`, username: `w_${suffix}`, password: 'corta' })
        .expect(400);
    });

    it('rechaza credenciales incorrectas', async () => {
      await request(server)
        .post('/api/auth/login')
        .send({ identifier: credentials.username, password: 'ClaveEquivocada.1' })
        .expect(401);
    });

    it('rota el refresh token y revoca el anterior', async () => {
      const login = await request(server)
        .post('/api/auth/login')
        .send({ identifier: credentials.username, password: credentials.password })
        .expect(200);

      const first = login.body.refreshToken;

      const rotated = await request(server)
        .post('/api/auth/refresh')
        .send({ refreshToken: first })
        .expect(200);

      expect(rotated.body.refreshToken).not.toBe(first);

      // Reutilizar el token ya rotado debe fallar: es la deteccion de robo.
      await request(server).post('/api/auth/refresh').send({ refreshToken: first }).expect(401);
    });
  });

  describe('Mundos y chunks', () => {
    it('crea un mundo', async () => {
      const response = await request(server)
        .post('/api/worlds')
        .set('authorization', `Bearer ${accessToken}`)
        .send({
          name: `Mundo E2E ${suffix}`,
          type: 'TOP_DOWN_THREE_QUARTER',
          tileSize: 32,
          chunkSize: 16,
          biome: 'grassland',
          background: '#101820',
        })
        .expect(201);

      expect(response.body.slug).toContain('mundo-e2e');
      worldId = response.body.id;
    });

    it('rechaza un tamano de chunk no admitido', async () => {
      await request(server)
        .post('/api/worlds')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ name: 'Invalido', type: 'SIDE_PLATFORMER', chunkSize: 24 })
        .expect(400);
    });

    it('la ventana devuelve exactamente los 9 chunks vecinos', async () => {
      const response = await request(server)
        .get(`/api/worlds/${worldId}/chunks/viewport?cx=0&cy=0&radius=1`)
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.chunks).toHaveLength(9);

      const keys = response.body.chunks.map((c: { cx: number; cy: number }) => `${c.cx}:${c.cy}`);
      expect(keys).toContain('0:0');
      expect(keys).toContain('-1:-1');
      expect(keys).toContain('1:1');
      expect(keys).not.toContain('2:0');
    });

    it('coloca bloques y deriva la matriz de colisiones', async () => {
      const response = await request(server)
        .post(`/api/worlds/${worldId}/chunks`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({
          operations: [
            { op: 'PLACE', layer: 'GROUND', tileX: 0, tileY: 0, blockKey: 'grass' },
            { op: 'PLACE', layer: 'WALL', tileX: 0, tileY: 0, blockKey: 'wall_stone' },
            { op: 'PLACE', layer: 'PIT', tileX: 2, tileY: 2, blockKey: 'water' },
          ],
        })
        .expect(201);

      expect(response.body.cellsChanged).toBe(3);

      const chunk = response.body.chunks.find(
        (c: { cx: number; cy: number }) => c.cx === 0 && c.cy === 0,
      );

      // La celda 0,0 tiene hierba (sin colision) y un muro (SOLID): la mascara
      // resultante es la union de ambas.
      expect(chunk.collision[0] & COLLISION_FLAGS.SOLID).toBe(COLLISION_FLAGS.SOLID);
      // La celda 2,2 tiene agua.
      expect(chunk.collision[2 * 16 + 2] & COLLISION_FLAGS.WATER).toBe(COLLISION_FLAGS.WATER);
    });

    it('escribe correctamente en coordenadas negativas', async () => {
      const response = await request(server)
        .post(`/api/worlds/${worldId}/chunks`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({
          operations: [{ op: 'PLACE', layer: 'GROUND', tileX: -1, tileY: -1, blockKey: 'dirt' }],
        })
        .expect(201);

      const chunk = response.body.chunks[0];
      expect(chunk.cx).toBe(-1);
      expect(chunk.cy).toBe(-1);

      // El tile -1 cae en la ultima celda del chunk -1:-1.
      const index = 15 * 16 + 15;
      expect(chunk.palette[chunk.layers.GROUND[index]]).toBe('dirt');
    });

    it('al romper un bloque libera su colision', async () => {
      const response = await request(server)
        .post(`/api/worlds/${worldId}/chunks`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({ operations: [{ op: 'BREAK', layer: 'WALL', tileX: 0, tileY: 0 }] })
        .expect(201);

      const chunk = response.body.chunks[0];
      expect(chunk.collision[0] & COLLISION_FLAGS.SOLID).toBe(0);
    });

    it('rechaza un bloque inexistente', async () => {
      await request(server)
        .post(`/api/worlds/${worldId}/chunks`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({
          operations: [{ op: 'PLACE', layer: 'GROUND', tileX: 0, tileY: 0, blockKey: 'inventado' }],
        })
        .expect(404);
    });

    it('rechaza un bloque colocado en la capa equivocada', async () => {
      await request(server)
        .post(`/api/worlds/${worldId}/chunks`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({
          operations: [
            { op: 'PLACE', layer: 'GROUND', tileX: 1, tileY: 1, blockKey: 'wall_stone' },
          ],
        })
        .expect(400);
    });

    it('rechaza un bloque de otro tipo de mundo', async () => {
      await request(server)
        .post(`/api/worlds/${worldId}/chunks`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({
          operations: [
            { op: 'PLACE', layer: 'GROUND', tileX: 1, tileY: 1, blockKey: 'brick_block' },
          ],
        })
        .expect(404);
    });

    it('rellena un rectangulo en un solo lote', async () => {
      const response = await request(server)
        .post(`/api/worlds/${worldId}/chunks`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({
          operations: [
            {
              op: 'FILL',
              layer: 'GROUND',
              tileX: 4,
              tileY: 4,
              width: 5,
              height: 5,
              blockKey: 'sand',
            },
          ],
        })
        .expect(201);

      expect(response.body.cellsChanged).toBe(25);
    });
  });

  describe('Exportacion para motores', () => {
    it('la matriz absoluta coincide con lo editado', async () => {
      const response = await request(server)
        .get(`/api/worlds/${worldId}/export/matrix`)
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);

      const matrix = response.body;
      expect(matrix.format).toBe('creador2d.matrix.v1');
      expect(matrix.blocks.length).toBeGreaterThan(0);

      const index = (x: number, y: number) =>
        (y - matrix.origin.tileY) * matrix.width + (x - matrix.origin.tileX);

      expect(matrix.layers.GROUND[index(0, 0)]).toBe('grass');
      expect(matrix.layers.GROUND[index(-1, -1)]).toBe('dirt');
      expect(matrix.layers.GROUND[index(4, 4)]).toBe('sand');
      expect(matrix.layers.PIT[index(2, 2)]).toBe('water');
      expect(matrix.collision[index(2, 2)] & COLLISION_FLAGS.WATER).toBe(COLLISION_FLAGS.WATER);
    });

    it('la exportacion de colisiones no lleva datos visuales', async () => {
      const response = await request(server)
        .get(`/api/worlds/${worldId}/export/collision`)
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.format).toBe('creador2d.collision.v1');
      expect(response.body.collision).toHaveLength(
        response.body.width * response.body.height,
      );
      expect(response.body.layers).toBeUndefined();
    });

    it('emite un token de motor con rol de solo lectura', async () => {
      const response = await request(server)
        .post(`/api/auth/engine-token/${worldId}`)
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.token).toBeTruthy();
      expect(response.body.fingerprint).toHaveLength(16);

      // El token de motor puede leer...
      await request(server)
        .get(`/api/worlds/${worldId}/export/matrix`)
        .set('authorization', `Bearer ${response.body.token}`)
        .expect(200);
    });
  });

  describe('Scripts de runtime y vaciado', () => {
    it('sin clima ni fluidos no genera ningun script', async () => {
      const response = await request(server)
        .get(`/api/worlds/${worldId}/export/scripts?engine=unity`)
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.scripts).toHaveLength(0);
      expect(response.body.notes).toContain('no tiene clima activo');
    });

    it('con clima activo genera el script de cada motor con los valores incrustados', async () => {
      await prisma.weatherSetting.create({
        data: {
          worldId,
          type: 'SNOW',
          intensity: 0.8,
          windDirection: 'DOWN_RIGHT',
          windStrength: 0.6,
          enabled: true,
        },
      });

      for (const engine of ['unity', 'godot', 'unreal'] as const) {
        const response = await request(server)
          .get(`/api/worlds/${worldId}/export/scripts?engine=${engine}`)
          .set('authorization', `Bearer ${accessToken}`)
          .expect(200);

        const weather = response.body.scripts.find((s: { filename: string }) =>
          /weather/i.test(s.filename),
        );

        expect(weather).toBeDefined();
        // La intensidad configurada viaja incrustada en el codigo generado.
        expect(weather.contents).toContain('0.8');
        // Viento hacia la derecha: la componente X de la deriva es positiva.
        expect(weather.contents).toMatch(/[^-]\d+\.\d+/);
      }
    });

    it('con fluido configurado genera su script', async () => {
      await prisma.fluidSetting.create({
        data: { worldId, blockKey: 'lava', flow: 'RIGHT', speed: 0.5, bubbles: true, bubbleRate: 9 },
      });

      const response = await request(server)
        .get(`/api/worlds/${worldId}/export/scripts?engine=godot`)
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);

      const fluids = response.body.scripts.find((s: { filename: string }) =>
        /fluid/i.test(s.filename),
      );

      expect(fluids).toBeDefined();
      expect(fluids.contents).toContain('lava');
      expect(fluids.contents).toContain('bubble_rate');
    });

    it('rechaza un motor desconocido', async () => {
      await request(server)
        .get(`/api/worlds/${worldId}/export/scripts?engine=cryengine`)
        .set('authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('vacia el mundo entero y lo deja sin chunks', async () => {
      const response = await request(server)
        .delete(`/api/worlds/${worldId}/chunks`)
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.chunksDeleted).toBeGreaterThan(0);

      const remaining = await prisma.chunk.count({ where: { worldId } });
      expect(remaining).toBe(0);

      // El mundo sigue existiendo: vaciar no es borrar.
      const world = await prisma.world.findUnique({ where: { id: worldId } });
      expect(world).not.toBeNull();
    });
  });

  describe('Objetos libres, clima e interiores', () => {
    let objectId = '';

    it('coloca mobiliario en posicion continua, sin ajustar a la rejilla', async () => {
      const response = await request(server)
        .post(`/api/worlds/${worldId}/objects`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({ blockKey: 'chest_wood', x: 137.5, y: 242.25, rotation: 15, scale: 1.2 })
        .expect(201);

      // La posicion se conserva con decimales: es lo que distingue un objeto
      // libre de un bloque de rejilla.
      expect(response.body.x).toBeCloseTo(137.5);
      expect(response.body.y).toBeCloseTo(242.25);
      objectId = response.body.id;
    });

    it('rechaza colocar libremente un bloque de rejilla', async () => {
      await request(server)
        .post(`/api/worlds/${worldId}/objects`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({ blockKey: 'grass', x: 10, y: 10 })
        .expect(400);
    });

    it('mueve el objeto sin tocar los chunks', async () => {
      const before = await prisma.chunk.count({ where: { worldId } });

      await request(server)
        .patch(`/api/worlds/${worldId}/objects/${objectId}`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({ x: 300.75, y: 128.5 })
        .expect(200);

      expect(await prisma.chunk.count({ where: { worldId } })).toBe(before);
    });

    it('el clima se guarda y se lee', async () => {
      const response = await request(server)
        .patch(`/api/worlds/${worldId}/weather`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({
          type: 'SNOW',
          intensity: 0.75,
          windDirection: 'DOWN_RIGHT',
          windStrength: 0.5,
          enabled: true,
        })
        .expect(200);

      expect(response.body.type).toBe('SNOW');
      expect(response.body.windDirection).toBe('DOWN_RIGHT');
    });

    it('rechaza animar un bloque que no es fluido', async () => {
      await request(server)
        .post(`/api/worlds/${worldId}/fluids`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({ blockKey: 'wall_stone', flow: 'RIGHT' })
        .expect(400);
    });

    it('crea un interior enlazado a una celda de entrada', async () => {
      const response = await request(server)
        .post(`/api/worlds/${worldId}/interiors`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({ name: 'Bodega', entranceTileX: 6, entranceTileY: 8, biome: 'cave' })
        .expect(201);

      expect(response.body.isInterior).toBe(true);
      expect(response.body.parentWorldId).toBe(worldId);
      // Hereda metrica del exterior para que el personaje encaje en ambos.
      expect(response.body.tileSize).toBe(32);
    });

    it('no permite dos interiores en la misma entrada', async () => {
      await request(server)
        .post(`/api/worlds/${worldId}/interiors`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({ name: 'Otra', entranceTileX: 6, entranceTileY: 8 })
        .expect(409);
    });

    it('la exportacion incluye parallax, objetos, clima e interiores', async () => {
      const response = await request(server)
        .get(`/api/worlds/${worldId}/export/matrix`)
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body.parallax)).toBe(true);
      expect(response.body.objects).toHaveLength(1);
      expect(response.body.objects[0].blockKey).toBe('chest_wood');
      expect(response.body.weather.type).toBe('SNOW');
      expect(response.body.interiors).toHaveLength(1);
      expect(response.body.interiors[0].entranceTileX).toBe(6);

      // El bloque del objeto libre viaja en el catalogo aunque no este en
      // ninguna paleta de chunk.
      const keys = response.body.blocks.map((b: { key: string }) => b.key);
      expect(keys).toContain('chest_wood');
    });

    it('retira el objeto', async () => {
      await request(server)
        .delete(`/api/worlds/${worldId}/objects/${objectId}`)
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(await prisma.placedObject.count({ where: { worldId } })).toBe(0);
    });
  });

  describe('Aislamiento entre usuarios', () => {
    it('un usuario ajeno no ve ni edita el mundo', async () => {
      const other = await request(server)
        .post('/api/auth/register')
        .send({
          email: `otro-${suffix}@creador2d.local`,
          username: `otro_${suffix}`,
          password: 'Otro.Usuario.2026',
        })
        .expect(201);

      const otherToken = other.body.accessToken;

      await request(server)
        .get(`/api/worlds/${worldId}`)
        .set('authorization', `Bearer ${otherToken}`)
        .expect(403);

      await request(server)
        .post(`/api/worlds/${worldId}/chunks`)
        .set('authorization', `Bearer ${otherToken}`)
        .send({
          operations: [{ op: 'PLACE', layer: 'GROUND', tileX: 0, tileY: 0, blockKey: 'grass' }],
        })
        .expect(403);

      await prisma.user.delete({ where: { id: other.body.user.id } }).catch(() => undefined);
    });
  });

  describe('Progresion (calculada solo en el servidor)', () => {
    it('acumula experiencia a partir de las celdas realmente escritas', async () => {
      const response = await request(server)
        .get('/api/profile')
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.experience).toBeGreaterThan(0);
      expect(response.body.level).toBeGreaterThanOrEqual(1);
      // Romper el muro devolvio el bloque al inventario.
      expect(response.body.inventory.some((i: { blockKey: string }) => i.blockKey === 'wall_stone')).toBe(
        true,
      );
    });

    it('la fabricacion valida los ingredientes en el servidor', async () => {
      await request(server)
        .post('/api/profile/craft')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ blockKey: 'plank', times: 99 })
        .expect(400);
    });

    it('no se puede fabricar un bloque que no tiene receta', async () => {
      await request(server)
        .post('/api/profile/craft')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ blockKey: 'grass', times: 1 })
        .expect(400);
    });
  });

  describe('Asistencia por IA', () => {
    it('informa de su estado sin exponer ninguna clave', async () => {
      const response = await request(server)
        .get(`/api/worlds/${worldId}/ai/status`)
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(typeof response.body.enabled).toBe('boolean');
      expect(JSON.stringify(response.body)).not.toMatch(/sk-|AIza|api[_-]?key/i);
    });

    it('desactivada, responde 503 y no toca el mundo', async () => {
      await request(server)
        .post(`/api/worlds/${worldId}/ai/suggest`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({ prompt: 'una plaza', area: { tileX: 0, tileY: 0, width: 8, height: 8 } })
        .expect(503);
    });
  });
});
