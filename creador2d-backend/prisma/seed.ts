/**
 * ---------------------------------------------------------------------------
 *  Semilla de la base de datos Creador_2d
 * ---------------------------------------------------------------------------
 *  Todos los graficos son DESCRIPTORES PROCEDURALES ORIGINALES: una paleta de
 *  color y un patron que el renderizador dibuja en tiempo real. No se importa
 *  ni se distribuye ningun recurso grafico de terceros.
 *
 *  El catalogo vive en `prisma/catalog/`, dividido por familias para que
 *  ampliarlo no signifique tocar un unico archivo de miles de lineas.
 *
 *  El seed es idempotente: puede ejecutarse tantas veces como se quiera.
 * ---------------------------------------------------------------------------
 */
import { writeList } from '../src/json-list';
import { PrismaClient } from '@prisma/client';
import { FluidFlow, LayerKind, ParallaxKind, Role, WeatherType, WindDirection, WorldType } from '../src/enums';
import { hash } from '@node-rs/argon2';
import { CATALOG, FLAGS, RENAMED_KEYS, assertUniqueKeys, summarize } from './catalog';

const prisma = new PrismaClient();

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const ACHIEVEMENTS = [
  {
    key: 'first_block',
    name: 'Primera piedra',
    description: 'Coloca tu primer bloque en un mundo.',
    points: 10,
    criteria: { type: 'TOTAL_EXPERIENCE', threshold: 1 },
  },
  {
    key: 'apprentice_builder',
    name: 'Aprendiz de constructor',
    description: 'Acumula 100 puntos de experiencia editando.',
    points: 25,
    criteria: { type: 'TOTAL_EXPERIENCE', threshold: 100 },
  },
  {
    key: 'level_five',
    name: 'Cartografo',
    description: 'Alcanza el nivel 5.',
    points: 50,
    criteria: { type: 'LEVEL', threshold: 5 },
  },
  {
    key: 'collector',
    name: 'Coleccionista',
    description: 'Ten 8 tipos distintos de bloque en el inventario.',
    points: 40,
    criteria: { type: 'INVENTORY_DISTINCT', threshold: 8 },
  },
  {
    key: 'master_architect',
    name: 'Arquitecto maestro',
    description: 'Acumula 200 puntos.',
    points: 100,
    criteria: { type: 'TOTAL_POINTS', threshold: 200 },
  },
];

/** Vista de bytes respaldada por un ArrayBuffer, que es lo que tipa Prisma. */
function toBytes(values: number[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(values.length));
  bytes.set(values);
  return bytes;
}

async function seedUsers() {
  const definitions = [
    {
      email: (process.env.SEED_ADMIN_EMAIL ?? 'admin@creador2d.local').toLowerCase(),
      username: 'admin',
      password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin.Creador2D.2026',
      role: Role.ADMIN,
    },
    {
      email: (process.env.SEED_CREATOR_EMAIL ?? 'creador@creador2d.local').toLowerCase(),
      username: 'creador',
      password: process.env.SEED_CREATOR_PASSWORD ?? 'Creador.2D.2026',
      role: Role.CREATOR,
    },
  ];

  for (const definition of definitions) {
    const passwordHash = await hash(definition.password, ARGON2_OPTIONS);

    await prisma.user.upsert({
      where: { email: definition.email },
      create: {
        email: definition.email,
        username: definition.username,
        passwordHash,
        role: definition.role,
        profile: { create: {} },
      },
      // La clave se re-hashea en cada seed para que el entorno local siempre
      // coincida con lo documentado.
      update: { passwordHash, role: definition.role },
    });

    console.log(`  usuario: ${definition.username} <${definition.email}>`);
  }
}

async function seedBlocks() {
  assertUniqueKeys(CATALOG);

  for (const block of CATALOG) {
    const data = {
      name: block.name,
      description: block.description,
      // El catalogo sigue declarando arrays, que es como se lee bien; la
      // serializacion a JSON ocurre solo aqui, al escribir en SQLite.
      worldTypes: writeList(block.worldTypes),
      layer: block.layer,
      category: block.category,
      placement: block.placement ?? 'GRID',
      tags: writeList(block.tags ?? []),
      variant: block.variant ?? 1,
      animated: block.animated ?? false,
      entrance: block.entrance ?? false,
      collisionFlags: block.collisionFlags,
      biome: block.biome,
      visual: block.visual as unknown as object,
      ySortOffset: block.ySortOffset ?? 0,
      heightInTiles: block.heightInTiles ?? 1,
      breakable: block.breakable ?? true,
      craftable: block.craftable ?? false,
      recipe: (block.recipe ?? undefined) as unknown as object | undefined,
      dropQuantity: block.dropQuantity ?? 1,
      defaultScale: block.defaultScale ?? 1,
      // La semilla solo siembra arte procedural. Los bloques con imagen propia
      // los crea el usuario desde el generador de Omni IA Game, y no deben
      // perder su sprite si alguien vuelve a sembrar.
      origin: 'PROCEDURAL' as const,
    };

    await prisma.blockDefinition.upsert({
      where: { key: block.key },
      create: { key: block.key, isSystem: true, ...data },
      update: data,
    });
  }

  console.log(`  bloques: ${CATALOG.length}`);
  for (const [category, count] of Object.entries(summarize(CATALOG)).sort()) {
    console.log(`    ${category.padEnd(12)} ${count}`);
  }
}

/**
 * Reescribe en las paletas de los chunks las claves que cambiaron de nombre al
 * reorganizar el catalogo. Sin esto, un mundo creado antes de la ampliacion
 * conservaria referencias a bloques inexistentes: se dibujarian vacios y
 * dejarian de aportar colision, en silencio.
 */
async function migrateRenamedKeys() {
  const entries = Object.entries(RENAMED_KEYS);
  if (entries.length === 0) {
    return;
  }

  const chunks = await prisma.chunk.findMany({ select: { id: true, palette: true } });
  let migrated = 0;

  for (const chunk of chunks) {
    const palette = chunk.palette as string[];
    let changed = false;

    const next = palette.map((key) => {
      const replacement = RENAMED_KEYS[key];
      if (replacement) {
        changed = true;
        return replacement;
      }
      return key;
    });

    if (changed) {
      await prisma.chunk.update({ where: { id: chunk.id }, data: { palette: next } });
      migrated += 1;
    }
  }

  if (migrated > 0) {
    console.log(`  paletas migradas: ${migrated} chunk(s)`);
  }
}

async function seedAchievements() {
  for (const achievement of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { key: achievement.key },
      create: { ...achievement, criteria: achievement.criteria as unknown as object },
      update: {
        name: achievement.name,
        description: achievement.description,
        points: achievement.points,
        criteria: achievement.criteria as unknown as object,
      },
    });
  }

  console.log(`  logros: ${ACHIEVEMENTS.length}`);
}

/** Capas de parallax por defecto de un mundo, segun su perspectiva. */
async function seedParallax(worldId: string) {
  const layers = [
    {
      kind: ParallaxKind.SKY,
      order: 0,
      name: 'Cielo y nubes',
      speedX: 0.05,
      speedY: 0.02,
      tint: '#cfe3f2',
      offsetY: -220,
    },
    {
      kind: ParallaxKind.FAR,
      order: 1,
      name: 'Montanas lejanas',
      speedX: 0.15,
      speedY: 0.05,
      tint: '#8fa8bf',
      offsetY: -120,
    },
    {
      kind: ParallaxKind.MID,
      order: 2,
      name: 'Arboleda y relieve',
      speedX: 0.4,
      speedY: 0.15,
      tint: '#6f8f6a',
      offsetY: -40,
    },
  ];

  for (const layer of layers) {
    const existing = await prisma.parallaxLayer.findFirst({
      where: { worldId, kind: layer.kind, order: layer.order },
    });

    if (existing) {
      continue;
    }

    await prisma.parallaxLayer.create({ data: { worldId, ...layer } });
  }
}

/** Mundo de ejemplo para poder abrir el editor con contenido desde el minuto cero. */
async function seedDemoWorld() {
  const owner = await prisma.user.findUnique({ where: { username: 'creador' } });
  if (!owner) {
    return;
  }

  const world = await prisma.world.upsert({
    where: { slug: 'valle-de-inicio' },
    create: {
      slug: 'valle-de-inicio',
      name: 'Valle de Inicio',
      description: 'Mundo de demostracion en vista cenital 3/4.',
      type: WorldType.TOP_DOWN_THREE_QUARTER,
      tileSize: 32,
      chunkSize: 16,
      biome: 'grassland',
      seed: 20260726,
      ownerId: owner.id,
      members: { create: { userId: owner.id, role: 'OWNER' } },
    },
    update: {},
  });

  const chunkSize = world.chunkSize;
  const cells = chunkSize * chunkSize;
  const palette = ['grass', 'path', 'water', 'wall_stone'];
  const layers = {
    GROUND: new Array<number>(cells).fill(0),
    PIT: new Array<number>(cells).fill(-1),
    WALL: new Array<number>(cells).fill(-1),
    OVERLAY: new Array<number>(cells).fill(-1),
  };
  const collision = new Array<number>(cells).fill(FLAGS.NONE);

  for (let y = 0; y < chunkSize; y += 1) {
    for (let x = 0; x < chunkSize; x += 1) {
      const index = y * chunkSize + x;

      // Un sendero horizontal a media altura.
      if (y === Math.floor(chunkSize / 2)) {
        layers.GROUND[index] = 1;
      }

      // Un estanque en la esquina inferior derecha.
      if (x >= chunkSize - 4 && y >= chunkSize - 4) {
        layers.PIT[index] = 2;
        collision[index] |= FLAGS.WATER;
      }

      // Muro perimetral en el borde superior.
      if (y === 0) {
        layers.WALL[index] = 3;
        collision[index] |= FLAGS.SOLID;
      }
    }
  }

  await prisma.chunk.upsert({
    where: { worldId_cx_cy: { worldId: world.id, cx: 0, cy: 0 } },
    create: {
      worldId: world.id,
      cx: 0,
      cy: 0,
      palette,
      layers,
      collision: toBytes(collision),
      revision: 1,
    },
    update: {},
  });

  await seedParallax(world.id);

  // Clima desactivado por defecto: el mundo debe verse limpio al abrirlo.
  await prisma.weatherSetting.upsert({
    where: { worldId: world.id },
    create: {
      worldId: world.id,
      type: WeatherType.RAIN,
      intensity: 0.4,
      windDirection: WindDirection.DOWN_LEFT,
      windStrength: 0.25,
      enabled: false,
    },
    update: {},
  });

  // El estanque corre suavemente hacia la derecha.
  await prisma.fluidSetting.upsert({
    where: { worldId_blockKey: { worldId: world.id, blockKey: 'water' } },
    create: {
      worldId: world.id,
      blockKey: 'water',
      flow: FluidFlow.RIGHT,
      speed: 0.35,
      waveHeight: 0.12,
      bubbles: false,
    },
    update: {},
  });

  console.log(`  mundo demo: ${world.name} (${world.slug})`);

  // --- Interior de ejemplo: una cueva enlazada al mundo exterior -----------
  const cave = await prisma.world.upsert({
    where: { slug: 'valle-de-inicio-cueva' },
    create: {
      slug: 'valle-de-inicio-cueva',
      name: 'Cueva del Valle',
      description: 'Interior enlazado a la boca de cueva del Valle de Inicio.',
      type: WorldType.TOP_DOWN_THREE_QUARTER,
      tileSize: 32,
      chunkSize: 16,
      biome: 'cave',
      seed: 20260727,
      background: '#07090d',
      ownerId: owner.id,
      isInterior: true,
      parentWorldId: world.id,
      entranceTileX: 4,
      entranceTileY: 2,
      members: { create: { userId: owner.id, role: 'OWNER' } },
    },
    update: {},
  });

  await prisma.fluidSetting.upsert({
    where: { worldId_blockKey: { worldId: cave.id, blockKey: 'lava' } },
    create: {
      worldId: cave.id,
      blockKey: 'lava',
      flow: FluidFlow.STILL,
      speed: 0.15,
      waveHeight: 0.08,
      // La lava burbujea: es lo que la distingue visualmente del agua.
      bubbles: true,
      bubbleRate: 8,
    },
    update: {},
  });

  console.log(`  interior demo: ${cave.name} (${cave.slug})`);
}

async function main() {
  console.log('Sembrando la base de datos Creador_2d...');
  await seedUsers();
  await seedBlocks();
  await migrateRenamedKeys();
  await seedAchievements();
  await seedDemoWorld();
  console.log('Semilla completada.');
}

main()
  .catch((error) => {
    console.error('Fallo la semilla:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export { LayerKind };
