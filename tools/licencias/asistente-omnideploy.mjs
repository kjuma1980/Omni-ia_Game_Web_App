#!/usr/bin/env node
/**
 * Asistente de claves de cliente para OmniDeploy.
 *
 * Hermano de `asistente-licencias.mjs` y con la misma forma: pregunta lo
 * mínimo, entra como administrador y llama al MISMO endpoint que usa el panel
 * web. No reimplementa nada, para que lo que emite la línea de comandos y lo
 * que emite el panel no puedan divergir — que es exactamente el error que se
 * cometió con el generador de licencias y costó una tarde.
 *
 * Toda la lógica en Node, no en un .cmd: batch produjo dos fallos de parseo en
 * un día y la lección ya está aprendida.
 */
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVIDOR = process.env.AUTH_SERVER_URL || 'https://fenixdev.cloud';

const rl = createInterface({ input: stdin, output: stdout });
const preguntar = (t) => new Promise((r) => rl.question(t, (v) => r(v.trim())));

function preguntarOculto(texto) {
  return new Promise((res) => {
    const alEscribir = (c) => {
      if (!['\n', '\r', ''].includes(c.toString())) stdout.write('*');
    };
    stdout.write(texto);
    stdin.on('data', alEscribir);
    rl.question('', (valor) => {
      stdin.removeListener('data', alEscribir);
      stdout.write('\n');
      res(valor.trim());
    });
  });
}

const linea = (c = '-') => console.log(c.repeat(64));

function abortar(msg) {
  console.log('');
  linea('=');
  console.log(`  CANCELADO: ${msg}`);
  linea('=');
  rl.close();
  process.exit(1);
}

async function api(ruta, opciones = {}, token = null) {
  const cab = { 'Content-Type': 'application/json' };
  if (token) cab.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${SERVIDOR}${ruta}`, { ...opciones, headers: cab });
  } catch (e) {
    abortar(`no se pudo contactar con ${SERVIDOR} (${e.message})`);
  }
  return { ok: res.ok, estado: res.status, datos: await res.json().catch(() => ({})) };
}

async function main() {
  console.clear();
  linea('=');
  console.log('     CLAVES DE CLIENTE — OMNIDEPLOY (GPU remota)');
  linea('=');
  console.log(`  Servidor: ${SERVIDOR}\n`);

  // --- administrador ------------------------------------------------------
  console.log('  Entra con tu cuenta de ADMINISTRADOR.');
  const email = process.env.OMNI_ADMIN_EMAIL || (await preguntar('  Correo:     '));
  if (!email) abortar('hace falta el correo');
  const pass = process.env.OMNI_ADMIN_PASSWORD || (await preguntarOculto('  Contraseña: '));
  if (!pass) abortar('hace falta la contraseña');

  process.stdout.write('  Comprobando...');
  const acceso = await api('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: pass }),
  });
  if (!acceso.ok || !acceso.datos.token) {
    console.log('');
    abortar(acceso.datos.error || 'no se pudo entrar con esas credenciales');
  }
  const token = acceso.datos.token;
  console.log(' entrado.\n');

  // --- equipo -------------------------------------------------------------
  const devs = await api('/api/admin/omnideploy/devices', { method: 'GET' }, token);
  const activos = (devs.datos.devices || []).filter((d) => d.status === 'active');
  if (!activos.length) {
    abortar('no hay ningún equipo aprobado. Arranca el agente y apruébalo primero.');
  }

  linea();
  console.log('  1. ¿Qué equipo va a usar el cliente?\n');
  activos.forEach((d, i) => {
    const luz = d.online ? 'en línea' : 'apagado';
    console.log(`     [${i + 1}] ${d.friendly_name}  (${luz})  ${d.deployment_id}`);
  });
  console.log('');
  const idx = Number.parseInt(await preguntar(`  Opción [1-${activos.length}]: `), 10);
  const equipo = activos[idx - 1];
  if (!equipo) abortar('opción no válida');
  console.log('');

  // --- cliente ------------------------------------------------------------
  linea();
  console.log('  2. ¿Para qué cliente?\n');
  const label = await preguntar('  Nombre (ej. "Colegio San José"): ');
  if (!label) abortar('el nombre es obligatorio: sin él los clientes no se distinguen');
  const contacto = (await preguntar('  Correo de contacto [ENTER para omitir]: ')).toLowerCase();
  const notas = await preguntar('  Notas [ENTER para omitir]: ');
  console.log('');

  // --- resumen ------------------------------------------------------------
  linea('=');
  console.log('  RESUMEN');
  linea('=');
  console.log(`  Equipo:   ${equipo.friendly_name}`);
  console.log(`  Cliente:  ${label}`);
  if (contacto) console.log(`  Contacto: ${contacto}`);
  linea('=');
  console.log('');
  if ((await preguntar('  ¿Emitir la clave? [s/N]: ')).toLowerCase() !== 's') {
    abortar('cancelado por el usuario');
  }
  console.log('');

  // --- emision ------------------------------------------------------------
  process.stdout.write('  Emitiendo...');
  const r = await api(
    '/api/admin/omnideploy/clients',
    {
      method: 'POST',
      body: JSON.stringify({
        deploymentId: equipo.deployment_id,
        label,
        contactEmail: contacto || null,
        notes: notas || null,
      }),
    },
    token,
  );
  if (!r.ok || !r.datos.apiKey) {
    console.log('');
    abortar(r.datos.error || `el servidor respondió ${r.estado}`);
  }
  console.log(' hecho.\n');

  const seguro = label.replace(/[^a-zA-Z0-9-_]/g, '_');
  const destino = join(__dirname, `omnideploy_${seguro}.txt`);
  const texto = [
    '='.repeat(64),
    '        ACCESO OMNIDEPLOY — GPU remota',
    '='.repeat(64),
    `Cliente:        ${label}`,
    `Equipo:         ${equipo.friendly_name}`,
    contacto ? `Contacto:       ${contacto}` : null,
    '-'.repeat(64),
    'Pegar en Ajustes, eligiendo el proveedor OMNIDEPLOY:',
    '',
    `  Deployment ID: ${r.datos.deploymentId}`,
    `  API Key:       ${r.datos.apiKey}`,
    '',
    '='.repeat(64),
    'La API Key no se puede volver a consultar: el servidor solo guarda su',
    'hash. Si se pierde, hay que revocar este cliente y emitirle otra.',
    '',
  ].filter(Boolean).join('\n');
  writeFileSync(destino, texto, 'utf-8');

  console.log(texto);
  linea('=');
  console.log(`  Guardado en: ${destino}`);
  console.log('  Este fichero lleva una credencial: no lo subas al repositorio.');
  linea('=');

  rl.close();
}

main().catch((e) => {
  console.error(`\n  Error inesperado: ${e.message}`);
  rl.close();
  process.exit(1);
});
