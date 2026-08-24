const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const PROD_PERSISTENT_DIR = '/home/u670620190/omni_data';
const PROD_PERSISTENT_DB = '/home/u670620190/omni_data/data.db';

const DB_PATH = process.env.DB_PATH || (fs.existsSync(PROD_PERSISTENT_DIR) ? PROD_PERSISTENT_DB : path.join(__dirname, 'data.db'));

const dbDir = path.dirname(DB_PATH);
if (dbDir && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    role          TEXT NOT NULL DEFAULT 'user',
    code_hash     TEXT,
    code_expires_at INTEGER,
    code_attempts INTEGER NOT NULL DEFAULT 0,
    first_name    TEXT,
    last_name     TEXT,
    personal_email TEXT,
    edu_email     TEXT,
    phone         TEXT,
    address       TEXT,
    city          TEXT,
    state         TEXT,
    country       TEXT,
    birth_date    TEXT,
    interests     TEXT,
    completed_registration INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id   INTEGER,
    admin_email TEXT,
    action     TEXT NOT NULL,
    details    TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at);

  CREATE TABLE IF NOT EXISTS licenses (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key    TEXT UNIQUE NOT NULL,
    hwid           TEXT NOT NULL,
    capability     TEXT NOT NULL DEFAULT 'dev_portal',
    duration_days  INTEGER,
    expires_at     TEXT NOT NULL,
    uptime_limit   INTEGER NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'active',
    contact_email  TEXT,
    notes          TEXT,
    last_reminded_at INTEGER,
    registered_at  INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses (status);
  CREATE INDEX IF NOT EXISTS idx_licenses_hwid ON licenses (hwid);

  CREATE TABLE IF NOT EXISTS reminders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key  TEXT NOT NULL,
    type         TEXT NOT NULL DEFAULT 'expiry',
    status       TEXT NOT NULL DEFAULT 'pending',
    days_left    INTEGER,
    pct_left     REAL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT,
    created_at   INTEGER NOT NULL,
    sent_at      INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_reminders_license ON reminders (license_key, type);
  CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders (status);
`);

// Migración idempotente: agrega columnas faltantes en BD creadas con el esquema anterior.
function ensureColumn(table, name, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl};`);
  }
}

[
  ["role", "role TEXT NOT NULL DEFAULT 'user'"],
  ["first_name", "first_name TEXT"],
  ["last_name", "last_name TEXT"],
  ["personal_email", "personal_email TEXT"],
  ["edu_email", "edu_email TEXT"],
  ["phone", "phone TEXT"],
  ["address", "address TEXT"],
  ["city", "city TEXT"],
  ["state", "state TEXT"],
  ["country", "country TEXT"],
  ["birth_date", "birth_date TEXT"],
  ["interests", "interests TEXT"],
  ["completed_registration", "completed_registration INTEGER NOT NULL DEFAULT 0"],
].forEach(([name, ddl]) => ensureColumn('users', name, ddl));

/**
 * Vinculo licencia <-> cuenta y control de equipos.
 *
 * Hasta ahora `licenses` solo tenia `contact_email`, texto libre que se usaba
 * para los avisos de caducidad: no habia forma de saber de QUE usuario era una
 * licencia, asi que al entrar en un equipo nuevo habia que pegarla a mano.
 *
 * Reglas acordadas:
 *   - 2 equipos ACTIVOS a la vez.
 *   - 2 cambios de por vida. El contador NO se recupera al liberar un equipo:
 *     si se recuperase, el limite se rodearia rotando entre equipos
 *     indefinidamente y no protegeria de nada.
 *   - Liberar un equipo lo pueden hacer el usuario y el administrador.
 *   - Resetear el contador de por vida, SOLO el administrador.
 */
[
  ["user_id", "user_id INTEGER REFERENCES users(id) ON DELETE SET NULL"],
  ["max_devices", "max_devices INTEGER NOT NULL DEFAULT 2"],
  ["max_changes", "max_changes INTEGER NOT NULL DEFAULT 2"],
  ["changes_used", "changes_used INTEGER NOT NULL DEFAULT 0"],
].forEach(([name, ddl]) => ensureColumn('licenses', name, ddl));

/**
 * EL SERVIDOR LLEVA LA CUENTA DE LA VIDA DE LA LICENCIA.
 *
 * Hasta ahora la llevaba el equipo del cliente: `expires_at` se clavaba al
 * GENERAR -de modo que una licencia de 1 dia nacia medio consumida si se
 * activaba al dia siguiente- y el credito de uso se contaba en un fichero local
 * que desaparecia al desinstalar. Reinstalar reiniciaba el contador, que es
 * justo lo que haria un cliente para no pagar.
 *
 * Dos formas de contar, segun lo que se vendio:
 *
 *   calendar  3 dias, 1/3/6/12 meses, perpetua. Corre desde la ACTIVACION, en
 *             dias naturales, se use la aplicacion o no.
 *   usage     demos. Se descuenta el tiempo REALMENTE usado: una demo de 1 dia
 *             son 24 horas de uso, no 24 horas de reloj.
 *
 *   activated_at   cuando se activo por primera vez. Nulo hasta entonces: una
 *                  licencia emitida y no entregada no consume nada.
 *   effective_expires_at  fecha real de fin, sellada al activar.
 *   uptime_used    minutos consumidos, acumulados AQUI. Reinstalar ya no los
 *                  borra porque no viven en el disco del cliente.
 */
[
  ["billing_mode", "billing_mode TEXT NOT NULL DEFAULT 'calendar'"],
  ["activated_at", "activated_at INTEGER"],
  ["effective_expires_at", "effective_expires_at TEXT"],
  ["uptime_used", "uptime_used INTEGER NOT NULL DEFAULT 0"],
  ["last_seen_at", "last_seen_at INTEGER"],
].forEach(([name, ddl]) => ensureColumn('licenses', name, ddl));

/**
 * CORRECCION DE UNA SOLA VEZ: las licencias anteriores al reloj del servidor.
 *
 * `activated_at` no existia hasta el 2026-08-07. Las licencias emitidas antes
 * llevaban tiempo en uso, pero el servidor no tenia constancia, asi que la
 * primera validacion tras el cambio las sellaba como si empezaran ESE momento
 * y les regalaba su duracion entera otra vez.
 *
 * Se sellan con su fecha de EMISION, que es el dato real que si existe. Una
 * licencia de 3 dias emitida hace cuatro queda vencida, que es lo correcto:
 * ya se disfruto.
 *
 * Corre UNA vez, marcada con `user_version`. Sin la marca volveria a aplicarse
 * en cada arranque y machacaria activaciones legitimas posteriores.
 */
const VERSION_ESQUEMA = 1;
if (db.prepare('PRAGMA user_version').get().user_version < VERSION_ESQUEMA) {
  const filas = db
    .prepare('SELECT license_key, duration_days, registered_at FROM licenses WHERE activated_at IS NOT NULL')
    .all();
  const sellar = db.prepare(
    'UPDATE licenses SET activated_at = ?, effective_expires_at = ? WHERE license_key = ?',
  );
  for (const l of filas) {
    let fin = 'UNLIMITED';
    if (l.duration_days) {
      const d = new Date(l.registered_at);
      d.setDate(d.getDate() + l.duration_days);
      fin = d.toISOString().slice(0, 10);
    }
    sellar.run(l.registered_at, fin, l.license_key);
  }
  if (filas.length) {
    console.log(`[db] ${filas.length} licencia(s) resellada(s) con su fecha de emision.`);
  }
  db.exec(`PRAGMA user_version = ${VERSION_ESQUEMA}`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS license_devices (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key  TEXT NOT NULL,
    hwid         TEXT NOT NULL,
    label        TEXT,
    signed_key   TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'active',
    first_seen   INTEGER NOT NULL,
    last_seen    INTEGER NOT NULL,
    released_at  INTEGER,
    UNIQUE (license_key, hwid)
  );
  CREATE INDEX IF NOT EXISTS idx_license_devices_key ON license_devices (license_key);
  CREATE INDEX IF NOT EXISTS idx_license_devices_hwid ON license_devices (hwid);
`);

const findStmt = db.prepare('SELECT * FROM users WHERE email = ?');
const findByIdStmt = db.prepare('SELECT * FROM users WHERE id = ?');

function findUserByEmail(email) {
  if (!email) return null;
  return findStmt.get(String(email).trim().toLowerCase());
}

function findUserById(id) {
  if (id === undefined || id === null) return null;
  return findByIdStmt.get(id);
}

function createUser({ email, passwordHash, profile }) {
  const now = Date.now();
  const p = profile || {};
  const completed = p.first_name && p.personal_email ? 1 : 0;
  const info = db.prepare(`
    INSERT INTO users (
      email, password_hash, status, role,
      first_name, last_name, personal_email, edu_email, phone,
      address, city, state, country, birth_date, interests,
      completed_registration, created_at, updated_at
    ) VALUES (?, ?, 'pending', 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    email, passwordHash,
    p.first_name || null, p.last_name || null, p.personal_email || null,
    p.edu_email || null, p.phone || null, p.address || null,
    p.city || null, p.state || null, p.country || null, p.birth_date || null,
    JSON.stringify(p.interests || []),
    completed, now, now
  );
  return findUserById(info.lastInsertRowid);
}

function createAdmin({ email, passwordHash }) {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO users (email, password_hash, status, role, completed_registration, created_at, updated_at)
    VALUES (?, ?, 'active', 'admin', 1, ?, ?)
  `).run(email, passwordHash, now, now);
  return findUserById(info.lastInsertRowid);
}

function promoteToAdmin(email) {
  db.prepare(`
    UPDATE users SET role = 'admin', status = 'active', updated_at = ? WHERE email = ?
  `).run(Date.now(), email);
}

function setUserRole(id, role) {
  db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, Date.now(), id);
}

function setUserPassword(id, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, Date.now(), id);
}

function setUserCode({ email, codeHash, expiresAt }) {
  db.prepare(`
    UPDATE users SET code_hash = ?, code_expires_at = ?, code_attempts = 0, updated_at = ?
    WHERE email = ?
  `).run(codeHash, expiresAt, Date.now(), email);
}

function setUserActive(email) {
  db.prepare(`
    UPDATE users SET status = 'active', code_hash = NULL, code_expires_at = NULL, updated_at = ?
    WHERE email = ?
  `).run(Date.now(), email);
}

function registerFailedAttempt(email) {
  db.prepare('UPDATE users SET code_attempts = code_attempts + 1, updated_at = ? WHERE email = ?')
    .run(Date.now(), email);
}

function updateUserProfile({ email, profile }) {
  db.prepare(`
    UPDATE users SET
      first_name = ?, last_name = ?, personal_email = ?, edu_email = ?, phone = ?,
      address = ?, city = ?, state = ?, country = ?, birth_date = ?, interests = ?,
      completed_registration = 1, updated_at = ?
    WHERE email = ?
  `).run(
    profile.first_name, profile.last_name, profile.personal_email,
    profile.edu_email, profile.phone, profile.address,
    profile.city, profile.state, profile.country, profile.birth_date,
    JSON.stringify(profile.interests || []),
    Date.now(), email
  );
  return findUserByEmail(email);
}

function listUsers({ search, status, limit, offset }) {
  const where = [];
  const params = [];
  if (search) {
    where.push('(email LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR country LIKE ? OR city LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM users ${whereSql}`).get(...params).n;
  // La lista de columnas es EXPLICITA, asi que anadir campos a la tabla no
  // basta: hay que nombrarlos tambien aqui. Sin esto llegaban como undefined y
  // los avisos de caducidad se saltaban TODAS las licencias, porque ninguna
  // parecia activada.
  const rows = db.prepare(`
    SELECT id, email, role, status, first_name, last_name, country, state, city,
           completed_registration, created_at
    FROM users ${whereSql}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  return { total, rows };
}

function logAudit(adminId, adminEmail, action, details) {
  db.prepare(`
    INSERT INTO audit_log (admin_id, admin_email, action, details, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(adminId, adminEmail, action, details ? JSON.stringify(details) : null, Date.now());
}

function listAudit(limit) {
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit || 100);
}

function registerLicense({ licenseKey, hwid, capability, durationDays, expiresAt, uptimeLimit, contactEmail, notes, billingMode }) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO licenses (
      license_key, hwid, capability, duration_days, expires_at, uptime_limit,
      status, contact_email, notes, registered_at, updated_at, billing_mode
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
    ON CONFLICT(license_key) DO UPDATE SET
      hwid = excluded.hwid,
      capability = excluded.capability,
      duration_days = excluded.duration_days,
      expires_at = excluded.expires_at,
      uptime_limit = excluded.uptime_limit,
      status = 'active',
      contact_email = excluded.contact_email,
      notes = excluded.notes,
      updated_at = excluded.updated_at,
      billing_mode = excluded.billing_mode
  `).run(
    licenseKey, hwid, capability, durationDays || null, expiresAt, uptimeLimit || 0,
    contactEmail || null, notes || null, now, now,
    // 'usage' son las demos, que se cobran por tiempo REALMENTE usado. Todo lo
    // demas corre por calendario desde la activacion.
    billingMode === 'usage' ? 'usage' : 'calendar'
  );
  return findLicenseByKey(licenseKey);
}

function renewLicense({ licenseKey, newLicenseKey, hwid, capability, durationDays, expiresAt, uptimeLimit, notes, billingMode }) {
  const lic = findLicenseByKey(licenseKey);
  if (!lic) return null;

  const ahora = Date.now();
  const targetKey = newLicenseKey || licenseKey;
  const targetHwid = hwid ? String(hwid).trim().toUpperCase() : lic.hwid;
  const perpetua = !durationDays;
  const fin = perpetua ? 'UNLIMITED' : sumarDias(ahora, durationDays);
  const modoCobro = billingMode || lic.billing_mode || 'calendar';

  db.prepare(`
    UPDATE licenses SET
      license_key = ?,
      hwid = ?,
      capability = ?,
      duration_days = ?,
      expires_at = ?,
      effective_expires_at = ?,
      uptime_limit = ?,
      uptime_used = 0,
      status = 'active',
      activated_at = ?,
      billing_mode = ?,
      notes = COALESCE(?, notes),
      updated_at = ?
    WHERE license_key = ?
  `).run(
    targetKey,
    targetHwid,
    capability || lic.capability,
    durationDays || null,
    expiresAt || fin,
    fin,
    uptimeLimit || 0,
    ahora,
    modoCobro,
    notes || null,
    ahora,
    licenseKey
  );

  db.prepare('UPDATE license_devices SET hwid = ? WHERE license_key = ?').run(targetHwid, licenseKey);
  if (targetKey !== licenseKey) {
    db.prepare('UPDATE license_devices SET license_key = ? WHERE license_key = ?').run(targetKey, licenseKey);
    db.prepare('UPDATE reminders SET license_key = ? WHERE license_key = ?').run(targetKey, licenseKey);
  }

  return findLicenseByKey(targetKey);
}

function findLicenseByKey(licenseKey) {
  if (!licenseKey) return null;
  return db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(String(licenseKey).trim());
}

function findLicenseByHwid(hwid) {
  if (!hwid) return null;
  return db.prepare('SELECT * FROM licenses WHERE hwid = ? ORDER BY activated_at DESC LIMIT 1').get(hwid);
}

/** Suma dias naturales a una fecha, en formato YYYY-MM-DD. */
function sumarDias(desdeMs, dias) {
  const d = new Date(desdeMs);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Sella la activacion y devuelve cuanta vida le queda a la licencia.
 *
 * LA PRIMERA VEZ marca `activated_at` y calcula la fecha real de fin. Las
 * siguientes devuelve lo ya sellado: reinstalar, cambiar de disco o formatear
 * no reinicia nada, porque el reloj vive aqui y no en el equipo del cliente.
 *
 * `minutosUsados` es lo que la aplicacion reporta desde el ultimo aviso. Solo
 * cuenta para las licencias `usage` -las demos-, donde lo que se vende es
 * tiempo de uso y no dias de calendario. Se ignora un valor absurdo: un cliente
 * podria mandar cualquier cosa, y aunque restar de mas solo le perjudicaria a
 * el, un negativo le regalaria tiempo.
 */
function activarLicencia(licenseKey, minutosUsados) {
  const lic = findLicenseByKey(licenseKey);
  if (!lic) return null;

  const ahora = Date.now();
  const perpetua = !lic.duration_days;

  if (!lic.activated_at) {
    const fin = perpetua ? 'UNLIMITED' : sumarDias(ahora, lic.duration_days);
    db.prepare(
      'UPDATE licenses SET activated_at = ?, effective_expires_at = ?, last_seen_at = ?, updated_at = ? WHERE license_key = ?',
    ).run(ahora, fin, ahora, ahora, licenseKey);
  }

  // El consumo solo aplica a las demos. En una de 12 meses el usuario puede
  // tener la aplicacion abierta todo el dia sin gastar nada mas que el dia.
  let usados = lic.uptime_used || 0;
  if (lic.billing_mode === 'usage' && lic.uptime_limit > 0) {
    const delta = Number(minutosUsados);
    if (Number.isFinite(delta) && delta > 0 && delta < 24 * 60) {
      usados = Math.min(lic.uptime_limit, usados + Math.floor(delta));
    }
  }
  db.prepare('UPDATE licenses SET uptime_used = ?, last_seen_at = ?, updated_at = ? WHERE license_key = ?')
    .run(usados, ahora, ahora, licenseKey);

  return findLicenseByKey(licenseKey);
}

/**
 * Estado que la aplicacion debe MOSTRAR. La app no calcula: pinta esto.
 *
 * Se devuelven las dos cifras cuando existen -dias de calendario y minutos de
 * uso- porque una licencia puede tener las dos y basta con que se agote una.
 * Ocultar la que bloquea fue exactamente el fallo que hacia que una pantalla
 * dijera "24h restantes" y la otra "licencia expirada".
 */
function estadoLicencia(lic) {
  if (!lic) return { valid: false, reason: 'not_found' };
  if (lic.status !== 'active') return { valid: false, reason: lic.status };

  const fin = lic.effective_expires_at || lic.expires_at;
  const perpetua = fin === 'UNLIMITED';
  const hoy = new Date().toISOString().slice(0, 10);

  const porUso = lic.billing_mode === 'usage' && lic.uptime_limit > 0;
  const minutosRestantes = porUso ? Math.max(0, lic.uptime_limit - (lic.uptime_used || 0)) : null;

  // Se restan FECHAS, no instantes: una licencia de 90 dias activada hoy tiene
  // 90 dias por delante, no 91. Con milisegundos se colaba el resto del dia de
  // hoy como un dia entero de mas.
  let diasRestantes = null;
  if (!perpetua) {
    const ms = Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`);
    diasRestantes = Math.max(0, Math.round(ms / 86400000));
  }

  let valid = true;
  let reason = null;
  if (!perpetua && hoy > fin) {
    valid = false;
    reason = 'expired_calendar';
  } else if (porUso && minutosRestantes === 0) {
    valid = false;
    reason = 'expired_usage';
  }

  return {
    valid,
    reason,
    billing_mode: lic.billing_mode,
    activated_at: lic.activated_at,
    expires_at: fin,
    days_left: diasRestantes,
    minutes_left: minutosRestantes,
    uptime_limit: lic.uptime_limit || 0,
    uptime_used: lic.uptime_used || 0,
  };
}

function listLicenses({ search, status, limit, offset }) {
  const where = [];
  const params = [];
  if (search) {
    where.push('(license_key LIKE ? OR hwid LIKE ? OR contact_email LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM licenses ${whereSql}`).get(...params).n;
  const rows = db.prepare(`
    SELECT id, license_key, hwid, capability, duration_days, expires_at,
           uptime_limit, status, contact_email, notes, last_reminded_at,
           registered_at, updated_at,
           user_id, billing_mode, activated_at, effective_expires_at,
           uptime_used, last_seen_at
    FROM licenses ${whereSql}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  return { total, rows };
}

function updateLicenseStatus(licenseKey, status) {
  db.prepare('UPDATE licenses SET status = ?, updated_at = ? WHERE license_key = ?')
    .run(status, Date.now(), licenseKey);
  return findLicenseByKey(licenseKey);
}

function deleteUserById(id) {
  return db.prepare('DELETE FROM users WHERE id = ?').run(id).changes;
}

function deleteAllUsers() {
  const n = db.prepare('DELETE FROM users').run().changes;
  db.prepare("DELETE FROM sqlite_sequence WHERE name = 'users'").run();
  return n;
}

function deleteLicenseByKey(licenseKey) {
  db.prepare("DELETE FROM reminders WHERE license_key = ?").run(licenseKey);
  return db.prepare('DELETE FROM licenses WHERE license_key = ?').run(licenseKey).changes;
}

function deleteAllLicenses() {
  const n = db.prepare('DELETE FROM licenses').run().changes;
  db.prepare('DELETE FROM reminders').run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name = 'licenses'").run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name = 'reminders'").run();
  return n;
}

function touchLicenseReminder(licenseKey) {
  db.prepare('UPDATE licenses SET last_reminded_at = ?, updated_at = ? WHERE license_key = ?')
    .run(Date.now(), Date.now(), licenseKey);
}

function createReminder({ licenseKey, daysLeft, pctLeft }) {
  const now = Date.now();
  const existing = db.prepare(
    "SELECT id FROM reminders WHERE license_key = ? AND type = 'expiry' AND status = 'pending'"
  ).get(licenseKey);
  if (existing) {
    db.prepare(
      'UPDATE reminders SET days_left = ?, pct_left = ?, attempt_count = 0, last_error = NULL, created_at = ? WHERE id = ?'
    ).run(daysLeft, pctLeft, now, existing.id);
    return db.prepare('SELECT * FROM reminders WHERE id = ?').get(existing.id);
  }
  const info = db.prepare(`
    INSERT INTO reminders (license_key, type, status, days_left, pct_left, created_at)
    VALUES (?, 'expiry', 'pending', ?, ?, ?)
  `).run(licenseKey, daysLeft, pctLeft, now);
  return db.prepare('SELECT * FROM reminders WHERE id = ?').get(info.lastInsertRowid);
}

function markReminderSent(id) {
  db.prepare("UPDATE reminders SET status = 'sent', sent_at = ? WHERE id = ?").run(Date.now(), id);
}

function failReminderAttempt(id, errorMsg) {
  db.prepare('UPDATE reminders SET attempt_count = attempt_count + 1, last_error = ? WHERE id = ?')
    .run(errorMsg, id);
}


// ===========================================================================
//  Equipos de una licencia
// ---------------------------------------------------------------------------
//  Dos limites distintos y a proposito:
//    max_devices  -> cuantos equipos pueden estar ACTIVOS a la vez (2)
//    max_changes  -> cuantas sustituciones se permiten EN TODA LA VIDA de la
//                    licencia (2). Liberar un equipo devuelve el cupo activo,
//                    pero NO devuelve el cambio: si lo devolviera, se podria
//                    rotar entre equipos sin limite y el tope no protegeria.
// ===========================================================================

function findLicenseByUserId(userId) {
  if (userId === undefined || userId === null) return null;
  return db.prepare(
    "SELECT * FROM licenses WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1"
  ).get(userId);
}

function findActiveLicenseForUser(userId, email) {
  if (userId !== undefined && userId !== null) {
    const lic = db.prepare("SELECT * FROM licenses WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(userId);
    if (lic) return lic;
  }
  if (email) {
    const lic = db.prepare("SELECT * FROM licenses WHERE LOWER(contact_email) = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(String(email).trim().toLowerCase());
    if (lic) return lic;
  }
  return null;
}

function linkLicenseToUser(licenseKey, userId) {
  if (!licenseKey || userId === undefined || userId === null) return;
  db.prepare('UPDATE licenses SET user_id = ?, updated_at = ? WHERE license_key = ?')
    .run(userId, Date.now(), String(licenseKey).trim());
}

function revokeUserLicense(userId, email) {
  const lic = findActiveLicenseForUser(userId, email);
  if (lic) {
    db.prepare("UPDATE licenses SET status = 'revoked', user_id = NULL, updated_at = ? WHERE id = ?")
      .run(Date.now(), lic.id);
    return lic;
  }
  return null;
}

function listDevices(licenseKey, { includeReleased = false } = {}) {
  const sql = includeReleased
    ? 'SELECT * FROM license_devices WHERE license_key = ? ORDER BY id'
    : "SELECT * FROM license_devices WHERE license_key = ? AND status = 'active' ORDER BY id";
  return db.prepare(sql).all(licenseKey);
}

function findDevice(licenseKey, hwid) {
  return db.prepare('SELECT * FROM license_devices WHERE license_key = ? AND hwid = ?')
    .get(licenseKey, String(hwid).toUpperCase());
}

/** Marca que el equipo se ha visto ahora. Sirve para que el panel muestre uso real. */
function touchDevice(licenseKey, hwid) {
  db.prepare("UPDATE license_devices SET last_seen = ? WHERE license_key = ? AND hwid = ?")
    .run(Date.now(), licenseKey, String(hwid).toUpperCase());
}

/**
 * Registra un equipo. `consumesChange` lo decide quien llama: el primer alta
 * hasta completar `max_devices` es gratis; a partir de ahi cada alta gasta un
 * cambio de por vida.
 */
function registerDevice({ licenseKey, hwid, signedKey, label, consumesChange }) {
  const now = Date.now();
  const up = String(hwid).toUpperCase();
  db.prepare(`
    INSERT INTO license_devices (license_key, hwid, label, signed_key, status, first_seen, last_seen)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(license_key, hwid) DO UPDATE SET
      status = 'active', signed_key = excluded.signed_key,
      label = COALESCE(excluded.label, license_devices.label),
      last_seen = excluded.last_seen, released_at = NULL
  `).run(licenseKey, up, label || null, signedKey, now, now);

  if (consumesChange) {
    db.prepare('UPDATE licenses SET changes_used = changes_used + 1, updated_at = ? WHERE license_key = ?')
      .run(now, licenseKey);
  }
  return findDevice(licenseKey, up);
}

/** Libera un equipo: devuelve el cupo activo, NUNCA el cambio de por vida. */
function releaseDevice(licenseKey, hwid) {
  const r = db.prepare(`
    UPDATE license_devices SET status = 'released', released_at = ?
    WHERE license_key = ? AND hwid = ? AND status = 'active'
  `).run(Date.now(), licenseKey, String(hwid).toUpperCase());
  return r.changes > 0;
}

/** Solo administrador. Devuelve los cambios de por vida a cero. */
function resetLicenseChanges(licenseKey) {
  db.prepare('UPDATE licenses SET changes_used = 0, updated_at = ? WHERE license_key = ?')
    .run(Date.now(), licenseKey);
}

/** Estado completo para decidir y para enseñarselo al usuario. */
function licenseDeviceStatus(license) {
  const activos = listDevices(license.license_key);
  const maxDev = license.max_devices ?? 2;
  const maxCh = license.max_changes ?? 2;
  const usados = license.changes_used ?? 0;
  return {
    devices: activos,
    activeCount: activos.length,
    maxDevices: maxDev,
    freeSlots: Math.max(0, maxDev - activos.length),
    changesUsed: usados,
    maxChanges: maxCh,
    changesLeft: Math.max(0, maxCh - usados),
  };
}

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  createAdmin,
  promoteToAdmin,
  setUserRole,
  setUserPassword,
  setUserCode,
  setUserActive,
  registerFailedAttempt,
  updateUserProfile,
  listUsers,
  logAudit,
  listAudit,
  registerLicense,
  renewLicense,
  activarLicencia,
  estadoLicencia,
  findLicenseByKey,
  listLicenses,
  updateLicenseStatus,
  deleteUserById,
  deleteAllUsers,
  findLicenseByKey,
  findLicenseByHwid,
  deleteLicenseByKey,
  deleteAllLicenses,
  findLicenseByUserId,
  findActiveLicenseForUser,
  linkLicenseToUser,
  revokeUserLicense,
  listDevices,
  findDevice,
  touchDevice,
  registerDevice,
  releaseDevice,
  resetLicenseChanges,
  licenseDeviceStatus,
  touchLicenseReminder,
  createReminder,
  markReminderSent,
  failReminderAttempt,
};
