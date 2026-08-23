'use strict';

/**
 * Base de datos de OmniDeploy.
 *
 * SEPARADA DE `data.db` A PROPOSITO. En hosting compartido solo hay un proceso
 * Node, asi que el aislamiento total no es posible; lo que si se puede es que
 * los trabajos de GPU no compartan fichero con las cuentas y las licencias. Un
 * fichero que crece sin control, se corrompe o hay que borrar para desatascar
 * el relay no puede llevarse por delante el negocio.
 *
 * Vive en OMNI_DATA_DIR, FUERA de la carpeta de la aplicacion: cada despliegue
 * reemplaza esa carpeta. El 2026-08-04 se aprendio por las malas.
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

/** Raiz de datos persistentes. La misma que usa el resto del servidor. */
const DATA_DIR =
  process.env.OMNI_DATA_DIR ||
  (process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(__dirname, '..'));

const OMNIDEPLOY_DIR = path.join(DATA_DIR, 'omnideploy');
const JOBS_DIR = path.join(OMNIDEPLOY_DIR, 'jobs');
const DB_PATH = path.join(OMNIDEPLOY_DIR, 'omnideploy.db');

for (const dir of [OMNIDEPLOY_DIR, JOBS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
// `busy_timeout` importa aqui mas que en `data.db`: el agente sondea cada pocos
// segundos y la aplicacion consulta el estado en paralelo. Sin esto, dos
// escrituras simultaneas devuelven SQLITE_BUSY en vez de esperar su turno.
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
  CREATE TABLE IF NOT EXISTS omnideploy_devices (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id         TEXT UNIQUE NOT NULL,
    device_token_hash TEXT NOT NULL,
    deployment_id     TEXT UNIQUE,
    api_key_hash      TEXT,
    friendly_name     TEXT,
    -- pending: registrado y esperando que el dueno lo apruebe.
    -- active:  aprobado, con deployment_id y api_key emitidos.
    -- revoked: retirado; ni sondea ni acepta trabajos.
    status            TEXT NOT NULL DEFAULT 'pending',
    last_seen_at      INTEGER,
    created_at        INTEGER NOT NULL,
    authorized_at     INTEGER
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS omnideploy_jobs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id         TEXT UNIQUE NOT NULL,
    deployment_id  TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending',
    inputs         TEXT NOT NULL,
    outputs        TEXT,
    error          TEXT,
    created_at     INTEGER NOT NULL,
    started_at     INTEGER,
    finished_at    INTEGER,
    expires_at     INTEGER NOT NULL
  );
`);

/**
 * Clientes autorizados a usar un despliegue.
 *
 * UNA CLAVE POR CLIENTE, no una para todos. Con una sola compartida, retirar el
 * acceso a uno obliga a cambiarsela a todos, y no hay forma de saber quien
 * genero que. Aqui cada cliente tiene la suya, se revoca por separado y sus
 * trabajos quedan atribuidos.
 *
 * `deployment_id` dice a que maquina va: varios clientes comparten la GPU y por
 * tanto la cola, que es lo que hay con una sola tarjeta.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS omnideploy_clients (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id      TEXT UNIQUE NOT NULL,
    deployment_id  TEXT NOT NULL,
    api_key_hash   TEXT NOT NULL,
    label          TEXT,
    contact_email  TEXT,
    status         TEXT NOT NULL DEFAULT 'active',
    notes          TEXT,
    jobs_count     INTEGER NOT NULL DEFAULT 0,
    last_used_at   INTEGER,
    created_at     INTEGER NOT NULL,
    revoked_at     INTEGER
  );
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_clients_despliegue ON omnideploy_clients (deployment_id, status);');
db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_cola ON omnideploy_jobs (deployment_id, status, created_at);');
db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_caducidad ON omnideploy_jobs (expires_at);');

/**
 * Columna para atribuir cada trabajo a su cliente.
 *
 * Se anade con ALTER y no en el CREATE porque las bases ya creadas -la de
 * pruebas incluida- no la tienen, y `CREATE TABLE IF NOT EXISTS` no las
 * actualiza. Ignorar el error de "duplicate column" es la forma sencilla de
 * hacerlo idempotente sin llevar un registro de migraciones.
 */
try {
  db.exec('ALTER TABLE omnideploy_jobs ADD COLUMN client_id TEXT;');
} catch {
  // Ya existia.
}

/**
 * QUE SERVICIO uso cada trabajo.
 *
 * `inputs.tipo` no basta: distingue imagen de audio, pero mete en un mismo saco
 * -"texto"- la narrativa, los NPCs, los scripts, los dialogos y el refinador de
 * prompts. Para un control de uso de verdad hace falta saber cual de ellos fue.
 *
 * Se guarda en columna propia y no dentro del JSON de `inputs` para poder
 * agrupar y contar sin abrir cada trabajo.
 */
try {
  db.exec('ALTER TABLE omnideploy_jobs ADD COLUMN servicio TEXT;');
} catch {
  // Ya existia.
}

/**
 * VIGENCIA DE LAS CLAVES DE OMNIDEPLOY.
 *
 * Una clave de OmniDeploy da acceso a la GPU de otra persona, asi que caduca
 * como caduca una licencia. Es un sistema propio y no una variante del de
 * `licenses`: viven en bases distintas y no comparten tabla.
 *
 * Misma regla, eso si, porque es la que ya se acordo y la que el panel sabe
 * explicar: se emite con una duracion en dias, el reloj arranca EN EL PRIMER
 * USO -no al emitirla, para que una clave entregada tarde no nazca gastada- y
 * `duration_days` nulo significa sin caducidad.
 *
 * `issued_at` existe aparte de `created_at` porque el listado tiene que poder
 * decir cuando se emitio la clave aunque la fila se haya tocado despues.
 */
[
  ['duration_days', 'duration_days INTEGER'],
  ['issued_at', 'issued_at INTEGER'],
  ['activated_at', 'activated_at INTEGER'],
  ['expires_at', 'expires_at TEXT'],
  ['last_reminded_at', 'last_reminded_at INTEGER'],
].forEach(([nombre, ddl]) => {
  try {
    db.exec(`ALTER TABLE omnideploy_clients ADD COLUMN ${ddl};`);
  } catch {
    // Ya existia.
  }
  void nombre;
});

// A las claves que ya existian se les pone como emision su fecha de alta: sin
// esto el listado mostraria "sin fecha" para todas las anteriores al cambio.
db.exec('UPDATE omnideploy_clients SET issued_at = created_at WHERE issued_at IS NULL;');

/** Suma dias a un instante y devuelve YYYY-MM-DD. */
function sumarDias(desdeMs, dias) {
  const d = new Date(desdeMs);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Sella el primer uso de una clave y dice si sigue vigente.
 *
 * Devuelve `{ vigente, expires_at, days_left }`. Una clave sin `duration_days`
 * no caduca nunca, que es lo que se quiere para el propio dueno y para quien
 * pague sin plazo.
 */
function vigenciaCliente(cliente) {
  if (!cliente) return { vigente: false, motivo: 'not_found' };
  if (cliente.status !== 'active') return { vigente: false, motivo: cliente.status };
  if (!cliente.duration_days) {
    return { vigente: true, expires_at: null, days_left: null };
  }

  const ahora = Date.now();
  let fin = cliente.expires_at;
  if (!cliente.activated_at) {
    fin = sumarDias(ahora, cliente.duration_days);
    db.prepare(
      'UPDATE omnideploy_clients SET activated_at = ?, expires_at = ? WHERE client_id = ?',
    ).run(ahora, fin, cliente.client_id);
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const dias = Math.max(
    0,
    Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000),
  );
  return { vigente: hoy <= fin, motivo: hoy <= fin ? null : 'expired', expires_at: fin, days_left: dias };
}

module.exports = { db, DB_PATH, OMNIDEPLOY_DIR, JOBS_DIR, vigenciaCliente };
