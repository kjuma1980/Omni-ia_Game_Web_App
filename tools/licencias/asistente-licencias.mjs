#!/usr/bin/env node
/**
 * Asistente de emisión de licencias — Omni IA Game.
 *
 * Herramienta de administración, no de usuario final. Hace UNA cosa: preguntar
 * lo mínimo y emitir una licencia que quede registrada y atada a la cuenta del
 * cliente, para que la aplicación la valide.
 *
 * TODO EL FLUJO VIVE AQUÍ, EN NODE, y no en el .cmd. El .cmd fue un intento de
 * mantener el doble clic del antiguo GENERAR_LICENCIA.exe y produjo dos fallos
 * de parseo en un día: finales de línea LF que cmd.exe no admite, y saltos
 * fuera de bloques entre paréntesis que hacían reejecutar trozos del menú. La
 * lógica interactiva en batch es frágil por naturaleza; aquí no lo es. El .cmd
 * queda reducido a una línea que invoca esto.
 *
 * No firma nada por su cuenta: todo pasa por `/api/admin/licenses/generate`,
 * el MISMO endpoint que usa el panel web. Así lo que emite la línea de comandos
 * y lo que emite el panel no pueden divergir.
 */
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { encolar, pendientes, vaciar, reintentarHasta } from './cola-licencias.mjs';

const SERVIDOR = process.env.AUTH_SERVER_URL || 'https://fenixdev.cloud';

const rl = createInterface({ input: stdin, output: stdout });

const preguntar = (texto) => new Promise((res) => rl.question(texto, (r) => res(r.trim())));

/**
 * Lee sin mostrar lo tecleado.
 *
 * `readline` corriente dejaría la contraseña escrita en pantalla y en el
 * historial de la ventana. Se silencia la salida mientras se escribe y se pinta
 * un asterisco por tecla, para que se vea que el teclado responde.
 */
function preguntarOculto(texto) {
  return new Promise((res) => {
    const alEscribir = (char) => {
      if (['\n', '\r', ''].includes(char.toString())) {
        return;
      }
      stdout.write('*');
    };
    stdout.write(texto);
    const eraRaw = stdin.isRaw;
    stdin.on('data', alEscribir);
    rl.question('', (valor) => {
      stdin.removeListener('data', alEscribir);
      if (eraRaw !== undefined && stdin.setRawMode) stdin.setRawMode(Boolean(eraRaw));
      stdout.write('\n');
      res(valor.trim());
    });
  });
}

const linea = (c = '-') => console.log(c.repeat(64));

function abortar(mensaje) {
  console.log('');
  linea('=');
  console.log(`  PROCESO CANCELADO: ${mensaje}`);
  linea('=');
  rl.close();
  process.exit(1);
}

async function api(ruta, opciones = {}, token = null) {
  const cabeceras = { 'Content-Type': 'application/json' };
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${SERVIDOR}${ruta}`, { ...opciones, headers: cabeceras });
  } catch (e) {
    // SIN INTERNET NO SE ABORTA. Antes esto llamaba a `abortar()` y la
    // generacion se caia entera: no es que la licencia se quedara sin subir, es
    // que no llegaba a existir. Ahora se avisa y quien llama decide -firmar
    // aqui y encolar el registro, o encolar la peticion-.
    return { ok: false, estado: 0, sinRed: true, datos: { error: `no se pudo contactar con ${SERVIDOR} (${e.message})` } };
  }
  const datos = await res.json().catch(() => ({}));
  return { ok: res.ok, estado: res.status, datos };
}

/** Los tres productos que se venden, y en qué se traducen dentro de la licencia. */
const PRODUCTOS = {
  1: {
    nombre: 'Módulos del estudio (Animación + NPCs + Suite 3D)',
    cap: 'full',
    mods: [],
  },
  2: {
    // `none` y no `dev_portal`: esta licencia vende SOLO el Creador 2D, asi que
    // no debe abrir tampoco el Portal Dev. Es un nivel de acceso propio, no la
    // ausencia de licencia.
    nombre: 'Creador de Mundos 2D / 2.5D',
    cap: 'none',
    mods: ['creador2d'],
  },
  3: {
    nombre: 'Todo: módulos del estudio + Creador de Mundos 2D',
    cap: 'full',
    mods: ['creador2d'],
  },
};


/**
 * Firma la licencia en ESTE equipo, si tiene la clave privada.
 *
 * Solo funciona donde el operador haya configurado `LICENSE_PRIVATE_KEY` o
 * `LICENSE_PRIVATE_KEY_PATH`. No se pide ni se copia la clave a ningun sitio: si
 * no esta, se dice y se encola la peticion. Poner la clave de firma en un
 * portatil es una decision del propietario, no algo que deba pasar por defecto.
 */
async function firmarEnLocal({ hwid, duracion, producto }) {
  if (!process.env.LICENSE_PRIVATE_KEY && !process.env.LICENSE_PRIVATE_KEY_PATH) {
    return { token: null, motivo: 'este equipo no tiene LICENSE_PRIVATE_KEY configurada' };
  }
  try {
    const { generateLicense } = await import('../../auth-server/license.js');
    const g = generateLicense(hwid, duracion, producto.cap, producto.mods);
    return { token: g.token, motivo: null };
  } catch (e) {
    return { token: null, motivo: e.message };
  }
}

/**
 * Sube lo que quedo pendiente de intentos anteriores.
 *
 * Se llama al arrancar: si la red volvio, el operador no tiene que acordarse de
 * nada. `--subir` hace solo esto y termina.
 */
async function vaciarCola(token) {
  const cola = pendientes();
  if (!cola.length) return;

  console.log(`  Hay ${cola.length} licencia(s) pendiente(s) de subir. Intentando...`);
  const { subidas, pendientes: quedan } = await vaciar(
    async (entrada) => {
      const d = entrada.datos;
      const r = await api(
        entrada.tipo === 'registro' ? '/api/admin/licenses/register' : '/api/admin/licenses/generate',
        {
          method: 'POST',
          body: JSON.stringify(
            entrada.tipo === 'registro'
              ? {
                  license_key: d.token,
                  hwid: d.hwid,
                  capability: d.capability,
                  duration: d.duration,
                  client_email: d.client_email,
                  contact_email: d.contact_email,
                  billing_mode: d.billing_mode,
                  notes: d.notes,
                }
              : d,
          ),
        },
        token,
      );
      if (!r.ok) throw new Error(r.datos?.error || `el servidor respondió ${r.estado}`);
    },
    (m) => console.log(`    ${m}`),
  );
  console.log(`  Subidas: ${subidas}. Pendientes: ${quedan}.`);
}

async function main() {
  console.clear();
  linea('=');
  console.log('        GENERADOR DE LICENCIAS  ·  OMNI IA GAME');
  linea('=');
  console.log(`  Servidor: ${SERVIDOR}`);
  console.log('');

  // ---------------------------------------------------------------- admin ---
  console.log('  Entra con tu cuenta de ADMINISTRADOR.');
  const adminEmail = process.env.OMNI_ADMIN_EMAIL || (await preguntar('  Correo:     '));
  if (!adminEmail) abortar('hace falta el correo de administrador');

  const adminPass = process.env.OMNI_ADMIN_PASSWORD || (await preguntarOculto('  Contraseña: '));
  if (!adminPass) abortar('hace falta la contraseña de administrador');

  process.stdout.write('  Comprobando...');
  const acceso = await api('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email: adminEmail, password: adminPass }),
  });
  if (!acceso.ok || !acceso.datos.token) {
    console.log('');
    abortar(acceso.datos.error || 'no se pudo entrar con esas credenciales');
  }
  const token = acceso.datos.token;
  console.log(' entrado.\n');

  // ----------------------------------------------------------- operacion ---
  linea();
  console.log('  ¿Qué operación deseas realizar?');
  console.log('     [1] Emitir una NUEVA licencia');
  console.log('     [2] RENOVAR una licencia existente');
  console.log('');
  const modoOperacion = await preguntar('  Opción [1-2]: ');
  console.log('');

  if (modoOperacion === '2') {
    linea();
    console.log('  RENOVACIÓN DE LICENCIA EXISTENTE');
    console.log('');
    const busquedaTexto = await preguntar('  Introduce HWID o correo o clave de licencia: ');
    if (!busquedaTexto) abortar('hace falta un valor para buscar');

    process.stdout.write('  Buscando en el servidor...');
    const resLic = await api(`/api/admin/licenses?search=${encodeURIComponent(busquedaTexto)}`, { method: 'GET' }, token);
    console.log('');

    const licEncontrada = (resLic.datos?.licenses || [])[0];
    if (!licEncontrada) {
      abortar(`no se encontró ninguna licencia registrada con "${busquedaTexto}".`);
    }

    console.log(`  Licencia encontrada:`);
    console.log(`    - HWID:       ${licEncontrada.hwid}`);
    console.log(`    - Cap:        ${licEncontrada.capability}`);
    console.log(`    - Estado:     ${licEncontrada.status}`);
    console.log(`    - Expiración: ${licEncontrada.expires_at || licEncontrada.effective_expires_at}`);
    console.log('');

    linea();
    console.log('  Selecciona la NUEVA duración para renovar:');
    console.log('');
    console.log('     [1] Perpetua (sin caducidad)');
    console.log('     [2] Un número concreto de días (ej: 90, 365, 45)');
    console.log('');
    const tipoDur = await preguntar('  Opción [1-2]: ');
    let duracion;
    let resumenDur;
    if (tipoDur === '1') {
      duracion = '5';
      resumenDur = 'perpetua';
    } else if (tipoDur === '2') {
      const dias = Number.parseInt(await preguntar('  ¿Cuántos días? [1-36500]: '), 10);
      if (!Number.isInteger(dias) || dias < 1 || dias > 36500) {
        abortar('los días deben ser un número entero entre 1 y 36500');
      }
      duracion = `d${dias}`;
      resumenDur = `${dias} día${dias === 1 ? '' : 's'}`;
    } else {
      abortar('opción no válida');
    }

    const inc2d = await preguntar('  ¿Incluir el Módulo Creador 2D en esta renovación? [S/n]: ');
    const includeCreador2D = inc2d.trim().toLowerCase() !== 'n';

    const confirma = await preguntar(`  ¿Confirmas la renovación de ${licEncontrada.hwid} por ${resumenDur} (Creador 2D: ${includeCreador2D ? 'SÍ' : 'NO'})? [s/N]: `);
    if (confirma.toLowerCase() !== 's') abortar('cancelado por el usuario');

    process.stdout.write('  Renovando licencia en el servidor...');
    const resRenov = await api(
      `/api/admin/licenses/${encodeURIComponent(licEncontrada.license_key)}/renew`,
      {
        method: 'POST',
        body: JSON.stringify({
          duration: duracion,
          include_creador_2d: includeCreador2D,
          mods: includeCreador2D ? ['creador2d'] : [],
          notes: `Renovada desde asistente CLI por ${resumenDur}`,
        }),
      },
      token,
    );

    if (!resRenov.ok || !resRenov.datos.token) {
      console.log('');
      abortar(resRenov.datos?.error || `el servidor respondió ${resRenov.estado}`);
    }
    console.log(' ¡HECHO!\n');

    const tokenRenovado = resRenov.datos.token;
    const destino = join(__dirname, `renovacion_${licEncontrada.hwid}.txt`);
    const textoRenov = [
      '='.repeat(64),
      '         RENOVACIÓN DE LICENCIA OMNI IA GAME',
      '='.repeat(64),
      `HWID:       ${licEncontrada.hwid}`,
      `Duración:   ${resumenDur}`,
      `Estado:     ACTIVADO Y RENOVADO`,
      '-'.repeat(64),
      'NUEVO CÓDIGO FIRMADO (se sincroniza automáticamente en la app):',
      '',
      tokenRenovado,
      '='.repeat(64),
    ].join('\n');

    writeFileSync(destino, textoRenov, 'utf-8');
    console.log(textoRenov);
    linea('=');
    console.log('  RENOVACIÓN COMPLETADA Y REGISTRADA EN EL SERVIDOR.');
    console.log(`  Guardado informe en: ${destino}`);
    linea('=');
    rl.close();
    return;
  }

  // -------------------------------------------------------------- producto ---
  linea();
  console.log('  1. ¿Qué licencia vas a generar?');
  console.log('');
  for (const [k, p] of Object.entries(PRODUCTOS)) {
    console.log(`     [${k}] ${p.nombre}`);
  }
  console.log('');
  const opcion = await preguntar('  Opción [1-3]: ');
  const producto = PRODUCTOS[opcion];
  if (!producto) abortar('opción no válida');
  console.log('');

  // -------------------------------------------------------------- duracion ---
  linea();
  console.log('  2. ¿Cuánto dura?');
  console.log('');
  console.log('     [1] Perpetua (sin caducidad)');
  console.log('     [2] Un número concreto de días');
  console.log('');
  const tipoDur = await preguntar('  Opción [1-2]: ');

  let duracion;
  let resumenDur;
  if (tipoDur === '1') {
    duracion = '5';
    resumenDur = 'perpetua';
  } else if (tipoDur === '2') {
    const dias = Number.parseInt(await preguntar('  ¿Cuántos días? [1-36500]: '), 10);
    if (!Number.isInteger(dias) || dias < 1 || dias > 36500) {
      abortar('los días deben ser un número entero entre 1 y 36500');
    }
    // Prefijo `d`: sin él, un 2 se leería como el escalón trimestral.
    duracion = `d${dias}`;
    resumenDur = `${dias} día${dias === 1 ? '' : 's'}`;
  } else {
    abortar('opción no válida');
  }
  console.log('');

  // --------------------------------------------------------------- cliente ---
  linea();
  console.log('  3. ¿Para qué cliente?');
  console.log('');
  console.log('     Debe tener ya una cuenta creada en Omni IA Game.');
  console.log('');
  const clienteEmail = (await preguntar('  Correo del cliente: ')).toLowerCase();
  if (!clienteEmail) abortar('hace falta el correo del cliente');

  process.stdout.write('  Buscando la cuenta...');
  const busqueda = await api(
    `/api/admin/users?search=${encodeURIComponent(clienteEmail)}&limit=5`,
    { method: 'GET' },
    token,
  );
  console.log('');
  const encontrado = (busqueda.datos.users || []).find(
    (u) => String(u.email || '').toLowerCase() === clienteEmail,
  );
  if (!encontrado) {
    abortar(
      `no hay ninguna cuenta con ${clienteEmail}.\n` +
        '  El cliente debe registrarse en la aplicación antes de comprar.',
    );
  }
  console.log(`  Cuenta encontrada: ${encontrado.email} (id ${encontrado.id})\n`);

  // -------------------------------------------------------------- hardware ---
  linea();
  console.log('  4. ¿En qué equipo?');
  console.log('');
  const hwid = (await preguntar('  Hardware ID [OMNI-HW-....]: ')).toUpperCase();
  if (!hwid) abortar('hace falta el Hardware ID');
  console.log('');

  // --------------------------------------------------------------- resumen ---
  linea('=');
  console.log('  RESUMEN');
  linea('=');
  console.log(`  Producto:    ${producto.nombre}`);
  console.log(`  Duración:    ${resumenDur}`);
  console.log(`  Cliente:     ${encontrado.email}`);
  console.log(`  Equipo:      ${hwid}`);
  linea('=');
  console.log('');
  // -------------------------------------------------------- forma de cobro ---
  //
  // Una demo se vende por TIEMPO DE USO -24 horas de uso, no 24 de reloj- y
  // todo lo demas por dias de calendario desde la activacion. Sin preguntarlo,
  // toda demo correria por calendario y se agotaria sola en un dia.
  linea('-');
  console.log('  ¿Cómo se cuenta el tiempo?');
  console.log('    1) Días de calendario desde la activación  (lo normal)');
  console.log('    2) Tiempo de uso real                      (demos)');
  const cobro = (await preguntar('  Opción [1]: ')).trim() || '1';
  if (!['1', '2'].includes(cobro)) abortar('opción no válida');
  const modoCobro = cobro === '2' ? 'usage' : 'calendar';

  const confirma = await preguntar('  ¿Emitir esta licencia? [s/N]: ');
  if (confirma.toLowerCase() !== 's') abortar('cancelado por el usuario');
  console.log('');

  // -------------------------------------------------------------- emision ---
  process.stdout.write('  Emitiendo, registrando y vinculando...');
  const emision = await api(
    '/api/admin/licenses/generate',
    {
      method: 'POST',
      body: JSON.stringify({
        hwid,
        duration: duracion,
        capability: producto.cap,
        mods: producto.mods,
        client_email: encontrado.email,
        contact_email: encontrado.email,
        billing_mode: modoCobro,
        notes: `Emitida con el asistente: ${producto.nombre}`,
      }),
    },
    token,
  );

  if (!emision.ok || !emision.datos.token) {
    console.log('');
    abortar(emision.datos.error || `el servidor respondió ${emision.estado}`);
  }
  console.log(' hecho.\n');

  const destino = join(__dirname, `licencia_${hwid}.txt`);
  const texto = [
    '='.repeat(64),
    '            LICENCIA OMNI IA GAME',
    '='.repeat(64),
    `Producto:   ${producto.nombre}`,
    `Duración:   ${resumenDur}`,
    `Se cuenta:  ${modoCobro === 'usage' ? 'por tiempo de uso real' : 'por días de calendario'}`,
    `Cliente:    ${encontrado.email}`,
    `Equipo:     ${hwid}`,
    '-'.repeat(64),
    'CÓDIGO (copiar y pegar completo en la aplicación):',
    '',
    tokenEmitido,
    '='.repeat(64),
    '',
  ].join('\n');
  writeFileSync(destino, texto, 'utf-8');

  console.log(texto);
  linea('=');
  console.log(
    quedaPendiente
      ? '  LISTO. Firmada en este equipo. PENDIENTE de registrar en el servidor.'
      : '  LISTO. Registrada en el servidor y atada a la cuenta del cliente.',
  );
  console.log(`  Guardada en: ${destino}`);
  linea('=');

  rl.close();
}

main().catch((e) => {
  console.error(`\n  Error inesperado: ${e.message}`);
  rl.close();
  process.exit(1);
});
