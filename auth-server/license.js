// Módulo de generación de licencias Omni-Shield v2 (Ed25519) para el auth-server.
// Misma lógica exacta que scratch/generate_license.mjs (formato base64(payload).hex(firma)).
// La clave privada se configura con:
//   LICENSE_PRIVATE_KEY (env, contenido PEM con \n) o LICENSE_PRIVATE_KEY_PATH (ruta al .pem)
'use strict';

const fs = require('fs');
const crypto = require('crypto');

const DURATIONS = {
  '1': { days: 1, ut: 1440, label: '1 día (1,440 min uptime)' },
  '2': { days: 90, ut: 129600, label: '3 meses (129,600 min uptime)' },
  '3': { days: 180, ut: 259200, label: '6 meses (259,200 min uptime)' },
  '4': { days: 365, ut: 518400, label: '12 meses (518,400 min uptime)' },
  '5': { days: null, ut: 0, label: 'Perpetua (ilimitada)' },
};

function loadPrivateKey() {
  const fromEnv = process.env.LICENSE_PRIVATE_KEY || '';
  if (fromEnv) {
    return crypto.createPrivateKey(fromEnv.replace(/\\n/g, '\n'));
  }
  const fromPath = process.env.LICENSE_PRIVATE_KEY_PATH || '';
  if (fromPath && fs.existsSync(fromPath)) {
    return crypto.createPrivateKey(fs.readFileSync(fromPath));
  }
  throw new Error('LICENSE_PRIVATE_KEY (o LICENSE_PRIVATE_KEY_PATH) no configurada en el servidor.');
}

/** Modulos premium que se venden por separado. */
const MODULES = ['creador2d'];

/**
 * Niveles de acceso. DEBEN COINCIDIR con la lista de `src-tauri/src/lib.rs`:
 * cualquier valor que no este alli hace que la aplicacion rechace la licencia
 * entera, no solo que conceda menos.
 *
 *   full       Animacion + NPCs + Suite 3D
 *   dev_portal sin esos tres modulos
 *   none       ninguno: para licencias que solo venden un modulo suelto
 */
const CAPS = ['full', 'dev_portal', 'none'];

/** Minutos de uso por dia que se conceden. 1440 = el dia entero. */
const MINUTOS_POR_DIA = 1440;

/**
 * Resuelve la duracion pedida.
 *
 * Admite las cinco de siempre -'1' a '5'- y ademas CUALQUIER NUMERO DE DIAS,
 * para licencias a medida: un curso de 45 dias, una prueba de 10, lo que haga
 * falta. Antes solo existian los cinco escalones y para vender un periodo
 * distinto habia que redondear al alza o al a la baja.
 *
 * El limite de uso se deriva de los dias con la misma regla que usan los
 * escalones fijos (1440 min/dia), de modo que una duracion a medida se
 * comporta igual que una predefinida del mismo largo.
 */
function resolveDuration(key) {
  const texto = String(key).trim();

  // Forma explicita `d45`. Existe porque los escalones ocupan del '1' al '5' y
  // sin ella una licencia de 2, 3, 4 o 5 DIAS seria imposible de pedir: '2' se
  // interpretaria siempre como el escalon trimestral.
  const explicito = /^d(\d+)$/i.exec(texto);
  if (explicito) {
    return diasAMedida(Number.parseInt(explicito[1], 10));
  }

  const fija = DURATIONS[texto];
  if (fija) return fija;

  // Numero suelto: solo por encima de los escalones, donde no hay ambiguedad.
  return diasAMedida(Number.parseInt(texto, 10));
}

function diasAMedida(dias) {
  if (!Number.isInteger(dias) || dias < 1 || dias > 36500) {
    return null;
  }
  return { days: dias, ut: dias * MINUTOS_POR_DIA, label: `${dias} días (a medida)` };
}

/**
 * Emite una licencia firmada.
 *
 * `mods` son los modulos premium sueltos, ademas de lo que conceda `cap`. Es
 * OPCIONAL y solo se incluye en el payload cuando trae algo: asi una licencia
 * sin modulos genera exactamente los mismos bytes que antes de existir este
 * campo, y las firmas ya emitidas siguen siendo reproducibles.
 */
function generateLicense(hwId, durationKey, cap, mods = [], email = null) {
  const duration = resolveDuration(durationKey);
  if (!duration) throw new Error(`Duración inválida: ${durationKey} (usa 1-5, o un número de días)`);
  // `none`: licencia valida que NO concede pestanas premium ni Portal Dev. Es
  // lo que se emite cuando solo se vende un modulo suelto, como el Creador 2D.
  if (!CAPS.includes(cap)) throw new Error(`Cap inválida: ${cap} (usa ${CAPS.join(', ')})`);

  const modulos = Array.from(new Set(mods || [])).filter(Boolean);
  const invalidos = modulos.filter((m) => !MODULES.includes(m));
  if (invalidos.length) {
    throw new Error(`Módulo desconocido: ${invalidos.join(', ')} (disponibles: ${MODULES.join(', ')})`);
  }

  let expiration = 'UNLIMITED';
  if (duration.days) {
    const d = new Date();
    d.setDate(d.getDate() + duration.days);
    expiration = d.toISOString().slice(0, 10);
  }

  const payload = { hw: String(hwId).trim().toUpperCase(), exp: expiration, cap, ut: duration.ut };
  if (email && typeof email === 'string' && email.trim()) {
    payload.email = email.trim().toLowerCase();
  }
  // Solo se anade si hay modulos: sin esto, toda licencia llevaria `mods: []` y
  // dejaria de coincidir byte a byte con las emitidas antes de este cambio.
  if (modulos.length) {
    payload.mods = modulos;
  }
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr, 'utf-8').toString('base64');

  const signature = crypto.sign(null, Buffer.from(payloadStr, 'utf-8'), loadPrivateKey());
  const token = `${payloadB64}.${signature.toString('hex')}`;
  return { token, payload, durationDays: duration.days ?? null, uptimeLimit: duration.ut };
}

module.exports = { DURATIONS, MODULES, CAPS, resolveDuration, generateLicense, loadPrivateKey };
