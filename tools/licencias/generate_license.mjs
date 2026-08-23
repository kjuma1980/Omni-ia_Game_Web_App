#!/usr/bin/env node
// Generador de licencias Omni-Shield v2 (Ed25519 asimétrico).
// Uso: node generate_license.mjs <HWID> <duración 1-5> <cap: full|dev_portal>
//                                [--mods creador2d] [--out archivo] [--register [email]]
// La clave privada se lee de ed25519_private.pem (junto a este script).
// La app verifica con la clave PÚBLICA embebida en el binario Rust.
//
// LA FIRMA NO SE IMPLEMENTA AQUÍ. Se reutiliza `auth-server/license.js`, que es
// la que usa el servidor de verdad. Antes había dos copias de la misma lógica y
// pasó lo previsible: al añadir los módulos premium al servidor, este script se
// quedó atrás y seguía emitiendo licencias sin ellos, en silencio. Con una sola
// implementación, lo que emite el panel y lo que emite la línea de comandos no
// pueden volver a divergir.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIVATE_KEY_PATH = process.env.OMNI_PRIVATE_KEY || path.join(__dirname, 'ed25519_private.pem');

// `license.js` busca la clave en LICENSE_PRIVATE_KEY_PATH. Este script siempre
// la ha leído de `scratch/ed25519_private.pem` (fuera de git), así que se tiende el puente sin
// pisar la variable si ya viene puesta desde fuera.
if (!process.env.LICENSE_PRIVATE_KEY && !process.env.LICENSE_PRIVATE_KEY_PATH) {
  process.env.LICENSE_PRIVATE_KEY_PATH = PRIVATE_KEY_PATH;
}

const require = createRequire(import.meta.url);
const { DURATIONS, MODULES, generateLicense } = require('../../auth-server/license.js');

// El MISMO servidor que consulta la app. `components/AuthScreen.tsx` usa
// `https://fenixdev.cloud` por defecto, y si aqui apuntaramos a otro sitio se
// emitirian licencias que la app declararia desconocidas.
const AUTH_SERVER_URL = process.env.AUTH_SERVER_URL || 'https://fenixdev.cloud';
const LICENSE_REGISTER_KEY = process.env.LICENSE_REGISTER_KEY || '';
const OMNI_ADMIN_EMAIL = process.env.OMNI_ADMIN_EMAIL || '';
const OMNI_ADMIN_PASSWORD = process.env.OMNI_ADMIN_PASSWORD || '';

async function adminToken() {
  if (!OMNI_ADMIN_EMAIL || !OMNI_ADMIN_PASSWORD) return null;
  const res = await fetch(`${AUTH_SERVER_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OMNI_ADMIN_EMAIL, password: OMNI_ADMIN_PASSWORD }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    console.error(`[WARN] No se pudo autenticar admin (${res.status}): ${data.error || ''}`);
    return null;
  }
  return data.token;
}

async function registerOnServer(token, payload, durationKey, contactEmail) {
  const body = {
    license_key: token,
    hwid: payload.hw,
    capability: payload.cap,
    uptime_limit: payload.ut,
    expires_at: payload.exp,
    contact_email: contactEmail || null,
    notes: 'Generada con generate_license.mjs',
  };
  if (durationKey) body.duration_days = DURATIONS[durationKey].days ?? null;
  const headers = { 'Content-Type': 'application/json' };
  if (LICENSE_REGISTER_KEY) headers['x-license-register-key'] = LICENSE_REGISTER_KEY;
  const admin = await adminToken();
  if (!LICENSE_REGISTER_KEY && admin) headers.Authorization = `Bearer ${admin}`;
  const res = await fetch(`${AUTH_SERVER_URL}/api/licenses/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok !== true) {
    throw new Error(`El servidor rechazó el registro: ${data.error || res.status}`);
  }
  return data.license;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('Uso: node generate_license.mjs <HWID> <duracion> <full|dev_portal> [--mods a,b] [--email correo] [--out archivo] [--sin-registrar]');
    console.log('  duracion: 1=1 dia  2=3 meses  3=6 meses  4=12 meses  5=perpetua');
    console.log('            o a medida con el prefijo d: d45 = 45 dias (1-36500).');
    console.log('            El prefijo hace falta porque d2 son DOS DIAS y 2 es el trimestral.');
    console.log(`  --mods: módulos premium sueltos, separados por comas. Disponibles: ${MODULES.join(', ')}`);
    console.log('  --email: correo de contacto del cliente, para el registro.');
    console.log(`  Se REGISTRA en ${AUTH_SERVER_URL} salvo que pases --sin-registrar.`);
    console.log('  --sin-registrar: NO la registra. La app la rechazará en cuanto tenga red.');
    console.log('  Auth: LICENSE_REGISTER_KEY (env) o login admin con OMNI_ADMIN_EMAIL + OMNI_ADMIN_PASSWORD (env).');
    process.exit(1);
  }
  const [hwId, durationKey, cap] = args;
  const outIdx = args.indexOf('--out');
  const outFile = outIdx !== -1 ? args[outIdx + 1] : null;
  const emailIdx = args.indexOf('--email');
  const contactEmail = emailIdx !== -1 ? args[emailIdx + 1] : null;
  const modsIdx = args.indexOf('--mods');
  const mods = modsIdx !== -1
    ? String(args[modsIdx + 1] || '').split(',').map((m) => m.trim()).filter(Boolean)
    : [];

  // REGISTRAR ES LO NORMAL, NO UNA OPCIÓN. Antes habia que pedirlo con
  // `--register`, y sin el salia una licencia con la firma perfecta que la app
  // anulaba sola: `POST /api/licenses/validate` devuelve `not_found` para lo
  // que el servidor no conoce, y ante un `valid: false` la aplicacion borra la
  // licencia. Es decir, funcionaba hasta que el equipo tenia internet. El panel
  // de admin siempre registro, asi que ademas emitian cosas distintas.
  const registrar = args.indexOf('--sin-registrar') === -1;

  try {
    const { token, payload } = generateLicense(hwId, durationKey, cap, mods);

    const info = [
      '============================================================',
      '      DATOS DE LICENCIA GENERADA (OMNI-SHIELD v2)',
      '============================================================',
      `Hardware ID:   ${payload.hw}`,
      `Expiración:    ${payload.exp}`,
      `Límite Uptime: ${payload.ut} minutos`,
      `Capacidades:   ${payload.cap}`,
      `Módulos:       ${payload.mods?.length ? payload.mods.join(', ') : '(ninguno)'}`,
      '------------------------------------------------------------',
      'CÓDIGO DE LICENCIA (copiar y pegar completo en la aplicación):',
      '',
      token,
      '============================================================',
      '',
    ].join('\n');

    console.log(info);

    const target = outFile || path.join(__dirname, 'omni_license.txt');
    fs.writeFileSync(target, info, 'utf-8');
    console.log(`[OK] Licencia guardada en: ${target}`);

    if (!registrar) {
      console.warn('');
      console.warn('[AVISO] NO se ha registrado en el servidor.');
      console.warn(`        La aplicacion consulta ${AUTH_SERVER_URL} y anulara esta`);
      console.warn('        licencia en cuanto el equipo tenga red. Solo sirve para');
      console.warn('        pruebas sin conexion.');
      return;
    }

    registerOnServer(token, payload, durationKey, contactEmail)
      .then((lic) => {
        console.log(`[OK] Registrada en ${AUTH_SERVER_URL}: status=${lic.status} id=${lic.id}`);
      })
      .catch((err) => {
        // Se sale con error a proposito: una licencia firmada pero no
        // registrada parece buena y no lo es. Mejor un fallo ruidoso ahora que
        // un cliente al que le deja de funcionar la app al conectarse.
        console.error(`[ERROR] Firmada, pero NO registrada: ${err.message}`);
        console.error('        Esta licencia sera rechazada por la app. Repite el');
        console.error('        registro cuando el servidor responda, o usa el panel.');
        process.exit(1);
      });
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }
}

main();
