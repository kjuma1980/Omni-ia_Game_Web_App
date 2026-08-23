/**
 * ---------------------------------------------------------------------------
 *  Empaquetado autonomo del backend del Creador 2D
 * ---------------------------------------------------------------------------
 *  Produce una carpeta que Tauri incluye como recurso y arranca al abrir el
 *  modulo, igual que ya hace con ComfyUI. El usuario final no instala Node, ni
 *  PostgreSQL, ni ejecuta `npm install`.
 *
 *  Que hay dentro y por que:
 *
 *    creador2d-server.exe   Node con el codigo del servidor incrustado (SEA).
 *    *.node                 Los binarios NATIVOS. No se pueden meter dentro del
 *                           ejecutable -ni SEA ni pkg los embeben-, asi que van
 *                           al lado: el motor de Prisma y argon2.
 *    prisma/               Esquema y migraciones, que Prisma lee en runtime.
 *
 *  El bundle deja fuera (`external`) todo lo que tenga binario nativo o se
 *  resuelva de forma dinamica: meterlo dentro produce un ejecutable que compila
 *  y luego falla al arrancar, que es el peor resultado posible.
 * ---------------------------------------------------------------------------
 */
import { build } from 'esbuild';
import { execFileSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const SALIDA = join(RAIZ, 'standalone');

/** Todo lo que NO debe entrar en el bundle. */
const EXTERNOS = [
  '@prisma/client', '.prisma', '@node-rs/argon2',
  // Opcionales de NestJS que se resuelven con `require` dinamico. Si se
  // empaquetan, esbuild falla; si se marcan externos, Nest los ignora solo.
  '@nestjs/websockets/socket-module', '@nestjs/microservices',
  '@nestjs/microservices/microservices-module', '@nestjs/platform-express',
  'class-transformer', 'class-validator', 'cache-manager',
  '@fastify/view', '@fastify/static', 'point-of-view',
];

function mb(p) {
  let t = 0;
  const rec = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name);
      if (e.isDirectory()) rec(f);
      else t += statSync(f).size;
    }
  };
  rec(p);
  return (t / 1024 / 1024).toFixed(1);
}

console.log('\n  Empaquetando el backend del Creador 2D\n');
rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });

// --- 1. Bundle del codigo -------------------------------------------------
await build({
  entryPoints: [join(RAIZ, 'dist', 'main.js')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: join(SALIDA, 'server.cjs'),
  external: EXTERNOS,
  logLevel: 'error',
  legalComments: 'none',
});
// La semilla se empaqueta aparte y se ejecuta UNA vez, tras crear la base. Sin
// esto el esquema queda creado pero vacio, y el usuario abre el editor con una
// paleta sin un solo bloque: parece roto sin estarlo.
await build({
  entryPoints: [join(RAIZ, 'prisma', 'seed.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: join(SALIDA, 'seed.cjs'),
  external: EXTERNOS,
  logLevel: 'error',
  legalComments: 'none',
});

console.log(`  bundle:            ${mb(SALIDA)} MB`);

// --- 2. Los nativos y lo que Prisma lee en runtime ------------------------
const NM = join(RAIZ, 'node_modules');
const destNM = join(SALIDA, 'node_modules');

for (const paquete of ['@prisma/client', '.prisma/client', '@node-rs/argon2']) {
  const origen = join(NM, paquete);
  if (existsSync(origen)) {
    cpSync(origen, join(destNM, paquete), { recursive: true });
  }
}
// Las variantes de argon2 por plataforma van en paquetes hermanos.
for (const dir of readdirSync(join(NM, '@node-rs'), { withFileTypes: true })) {
  if (dir.isDirectory() && dir.name.startsWith('argon2-')) {
    cpSync(join(NM, '@node-rs', dir.name), join(destNM, '@node-rs', dir.name), { recursive: true });
  }
}
cpSync(join(RAIZ, 'prisma'), join(SALIDA, 'prisma'), {
  recursive: true,
  filter: (src) => !src.endsWith('.db') && !src.includes('.postgres.bak'),
});
console.log(`  + nativos y prisma: ${mb(SALIDA)} MB`);

// --- 3. El runtime de Node, renombrado ------------------------------------
//
// NO se usa Node SEA, y es una decision medida: dentro de un ejecutable SEA
// `require()` solo resuelve modulos INTERNOS de Node, no busca en
// `node_modules`. Como el motor de Prisma y argon2 son nativos y tienen que ir
// fuera del bundle por narices, el ejecutable compilaba y luego moria al
// arrancar con `ERR_UNKNOWN_BUILTIN_MODULE: No such built-in module
// '@prisma/client'`. Se puede sortear con `createRequire(process.execPath)`,
// pero eso es anadir un truco fragil justo en el camino critico.
//
// Copiar el binario de Node y ejecutarlo con un fichero .cjs normal es mas
// aburrido y funciona siempre: `require` se comporta como en cualquier proceso
// de Node, Prisma encuentra su motor donde lo espera, y si algo falla se puede
// reproducir a mano con un comando.
cpSync(join(RAIZ, 'launcher.cjs'), join(SALIDA, 'launcher.cjs'));
cpSync(process.execPath, join(SALIDA, 'creador2d-server.exe'));

// Arranque para poder probarlo a mano sin recordar los parametros.
writeFileSync(
  join(SALIDA, 'arrancar.cmd'),
  '@echo off\r\n' +
    'REM Arranque manual para diagnostico. En la app lo lanza Tauri.\r\n' +
    'set DATABASE_URL=file:%~dp0prisma\\creador2d.db\r\n' +
    'set PORT=4310\r\n' +
    'set HOST=127.0.0.1\r\n' +
    '"%~dp0creador2d-server.exe" "%~dp0launcher.cjs"\r\n',
);

console.log(`\n  TOTAL: ${mb(SALIDA)} MB en ${SALIDA}`);
console.log('  arranque: creador2d-server.exe launcher.cjs\n');
