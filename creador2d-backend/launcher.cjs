/**
 * ---------------------------------------------------------------------------
 *  Arranque del backend del Creador 2D en la app empaquetada
 * ---------------------------------------------------------------------------
 *  Se ejecuta ANTES del servidor y deja el entorno listo. Existe para que el
 *  usuario final no tenga que crear un `.env`, ni inventarse secretos, ni saber
 *  donde vive la base de datos.
 *
 *  Lo que resuelve, y por que cada cosa:
 *
 *  1. LOS SECRETOS SE GENERAN EN EL PRIMER ARRANQUE, no se empaquetan. Si el
 *     instalador llevara un JWT_ACCESS_SECRET fijo, TODOS los clientes
 *     compartirian la misma clave: cualquiera podria firmar un token valido
 *     para el equipo de otro. Se generan con `crypto.randomBytes` y se guardan
 *     con permisos de usuario en la carpeta de datos.
 *
 *  2. LA BASE VIVE EN LA CARPETA DE DATOS DEL USUARIO, no junto al ejecutable.
 *     El directorio de instalacion suele ser de solo lectura para un usuario
 *     sin privilegios, y ademas se reemplaza al actualizar: los mundos se
 *     perderian en cada version nueva.
 *
 *  3. LAS MIGRACIONES SE APLICAN SOLAS. La primera vez crea el esquema; en las
 *     siguientes no hace nada. Sin esto, actualizar la app dejaria una base con
 *     el esquema viejo y errores incomprensibles.
 * ---------------------------------------------------------------------------
 */
const { randomBytes } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join, dirname } = require('node:path');

/** Carpeta de datos del usuario. Se puede forzar con OMNI_C2D_DATA_DIR. */
function carpetaDeDatos() {
  if (process.env.OMNI_C2D_DATA_DIR) {
    return process.env.OMNI_C2D_DATA_DIR;
  }
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA || join(process.env.USERPROFILE || '.', 'AppData', 'Roaming')
      : process.platform === 'darwin'
        ? join(process.env.HOME || '.', 'Library', 'Application Support')
        : join(process.env.XDG_DATA_HOME || join(process.env.HOME || '.', '.local', 'share'));
  return join(base, 'Omni IA Game', 'creador2d');
}

const DATOS = carpetaDeDatos();
mkdirSync(DATOS, { recursive: true });

/**
 * Secretos persistentes.
 *
 * Se leen si existen y se generan si no. Nunca se regeneran por su cuenta:
 * cambiarlos invalidaria todas las sesiones abiertas sin motivo.
 */
function secretos() {
  const fichero = join(DATOS, 'secrets.json');

  if (existsSync(fichero)) {
    try {
      const guardados = JSON.parse(readFileSync(fichero, 'utf-8'));
      if (guardados.access && guardados.refresh) {
        // `enlace` se anadio despues de los otros dos. Se completa sin tocar
        // los que ya estan, porque regenerarlos cerraria todas las sesiones
        // abiertas de quien ya tenia el modulo instalado.
        if (!guardados.enlace) {
          guardados.enlace = randomBytes(48).toString('base64url');
          writeFileSync(fichero, JSON.stringify(guardados, null, 2), { mode: 0o600 });
        }
        return guardados;
      }
    } catch {
      // Fichero ilegible: se regenera. Perder las sesiones abiertas es
      // preferible a no arrancar.
    }
  }

  const nuevos = {
    access: randomBytes(48).toString('base64url'),
    refresh: randomBytes(48).toString('base64url'),
    // Autoriza a la aplicacion a pedir una sesion a partir de la cuenta ya
    // validada en la nube, en vez de exigir un segundo usuario y contrasena.
    // Vive junto a los otros dos, con los mismos permisos, y NUNCA viaja en el
    // instalador: cada equipo tiene el suyo.
    enlace: randomBytes(48).toString('base64url'),
    creados: new Date().toISOString(),
  };
  writeFileSync(fichero, JSON.stringify(nuevos, null, 2), { mode: 0o600 });
  return nuevos;
}

const s = secretos();
process.env.JWT_ACCESS_SECRET ||= s.access;
process.env.JWT_REFRESH_SECRET ||= s.refresh;
process.env.OMNI_LINK_SECRET ||= s.enlace;
process.env.DATABASE_URL ||= `file:${join(DATOS, 'creador2d.db')}`;
process.env.PORT ||= '4310';
process.env.HOST ||= '127.0.0.1';
process.env.NODE_ENV ||= 'production';

/**
 * Origenes permitidos por CORS.
 *
 * `CORS_ORIGINS` viene por defecto con `http://localhost:3142`, el servidor de
 * desarrollo: era lo unico que existia cuando se escribio. La app empaquetada
 * NO tiene ese origen -el WebView de Tauri usa `tauri://localhost` en Windows y
 * `http://tauri.localhost` en algunas versiones-, asi que el navegador recibia
 * la respuesta y la descartaba.
 *
 * El sintoma era enganoso: el backend arrancaba bien y respondia a cualquier
 * cliente sin origen -curl, PowerShell-, pero la app mostraba "Failed to fetch"
 * como si el servicio estuviera caido.
 *
 * Se anaden los origenes del WebView conservando los que ya vinieran, para no
 * romper a quien tenga uno configurado a mano.
 */
const ORIGENES_TAURI = [
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
];

const yaConfigurados = (process.env.CORS_ORIGINS || 'http://localhost:3142')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

process.env.CORS_ORIGINS = Array.from(
  new Set([...yaConfigurados, ...ORIGENES_TAURI]),
).join(',');

// Prisma busca el esquema junto al ejecutable, no en la carpeta de datos.
process.env.PRISMA_SCHEMA_PATH ||= join(__dirname, 'prisma', 'schema.prisma');

/**
 * Aplica el esquema si la base esta vacia.
 *
 * `prisma migrate deploy` no sirve aqui: exige la CLI de Prisma, que son 70 MB
 * de herramientas de desarrollo que no tienen por que viajar en el instalador.
 * Se ejecuta el SQL de las migraciones directamente, que es lo mismo que hace
 * la CLI, y se registra en `_prisma_migrations` para que una futura version con
 * la CLI a mano no intente reaplicarlas.
 *
 * Idempotente: si las tablas ya existen no hace nada, asi que actualizar la app
 * no toca los mundos del usuario.
 */
function aplicarEsquema() {
  const { DatabaseSync } = require('node:sqlite');
  const ficheroDb = process.env.DATABASE_URL.replace(/^file:/, '');
  const db = new DatabaseSync(ficheroDb);

  const yaHay = db
    .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='block_definitions'")
    .get().n;

  if (yaHay > 0) {
    db.close();
    return false;
  }

  const dirMigraciones = join(__dirname, 'prisma', 'migrations');
  const carpetas = require('node:fs')
    .readdirSync(dirMigraciones, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  db.exec(`CREATE TABLE IF NOT EXISTS _prisma_migrations (
    id TEXT PRIMARY KEY, checksum TEXT NOT NULL, finished_at DATETIME,
    migration_name TEXT NOT NULL, logs TEXT, rolled_back_at DATETIME,
    started_at DATETIME NOT NULL DEFAULT current_timestamp,
    applied_steps_count INTEGER UNSIGNED NOT NULL DEFAULT 0)`);

  for (const carpeta of carpetas) {
    const sql = readFileSync(join(dirMigraciones, carpeta, 'migration.sql'), 'utf-8');
    db.exec(sql);
    db.prepare(
      'INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count) VALUES (?, ?, current_timestamp, ?, 1)',
    ).run(randomBytes(16).toString('hex'), 'aplicada-por-el-arranque', carpeta);
    console.log(`[Creador 2D] esquema aplicado: ${carpeta}`);
  }

  db.close();
  return true;
}

console.log(`[Creador 2D] datos en ${DATOS}`);

/**
 * Siembra el catalogo la primera vez.
 *
 * Sin esto el esquema queda creado pero VACIO: el usuario abre el editor, ve
 * una paleta sin un solo bloque y da por hecho que el modulo esta roto. Son 290
 * bloques, 5 logros y un mundo de ejemplo.
 *
 * Se ejecuta solo cuando se acaba de crear la base. La semilla es idempotente
 * por si misma, pero repetirla en cada arranque anadiria varios segundos de
 * espera para no cambiar nada.
 */
async function sembrarCatalogo() {
  const seed = join(__dirname, 'seed.cjs');
  if (!existsSync(seed)) {
    console.warn('[Creador 2D] no se encontro la semilla; el catalogo quedara vacio.');
    return;
  }
  console.log('[Creador 2D] sembrando el catalogo, un momento...');
  await require(seed);
}

console.log(`[Creador 2D] datos en ${DATOS}`);

(async () => {
  let recienCreada = false;

  try {
    recienCreada = aplicarEsquema();
    if (recienCreada) {
      console.log('[Creador 2D] base de datos creada.');
    }
  } catch (e) {
    // Se avisa y se sigue: si el esquema ya estuviera puesto por otra via, el
    // servidor arrancara igual. Parar aqui dejaria el modulo inservible por
    // algo que quiza no era un problema.
    console.error('[Creador 2D] no se pudo aplicar el esquema:', e.message);
  }

  if (recienCreada) {
    try {
      await sembrarCatalogo();
    } catch (e) {
      // El catalogo vacio es molesto pero no impide arrancar, y el usuario
      // puede sembrarlo despues. Bloquear el servidor por esto seria peor.
      console.error('[Creador 2D] no se pudo sembrar el catalogo:', e.message);
    }
  }

  require('./server.cjs');
})();
