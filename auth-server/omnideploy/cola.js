'use strict';

/**
 * Cola de trabajos de OmniDeploy.
 *
 * AQUI NO SE SABE COMO SE ENTERA EL AGENTE. Hoy el agente pregunta -sondeo
 * largo-; el dia que haya VPS podra ademas empujarse por WebSocket. Ese cambio
 * se hace anadiendo un aviso en `encolar` y una espera distinta en
 * `esperarTrabajo`, sin tocar rutas, almacen ni cliente.
 *
 * Si al migrar hay que tocar un quinto fichero, el aislamiento estaba mal hecho.
 */

const { randomUUID } = require('crypto');
const { db } = require('./db');
const almacen = require('./almacen');

/** Trabajos pendientes por despliegue. El sexto se rechaza con su posicion. */
const MAX_COLA = 5;

/** Cuanto aguanta una peticion de sondeo antes de responder 204. */
const ESPERA_SONDEO_MS = 25_000;
/**
 * 25 segundos y no 30: los proxies intermedios suelen cortar en 30, y una
 * peticion cortada por el proxy es indistinguible de un agente caido.
 */

/** Cada cuanto se mira si entro trabajo mientras se espera. */
const LATIDO_MS = 500;

function ahora() {
  return Date.now();
}

/** Trabajos pendientes de un despliegue, el mas viejo primero. */
function pendientes(deploymentId) {
  return db
    .prepare(
      "SELECT * FROM omnideploy_jobs WHERE deployment_id = ? AND status = 'pending' ORDER BY created_at",
    )
    .all(deploymentId);
}

/**
 * Encola un trabajo.
 * @returns {{jobId: string, posicion: number} | {error: string, posicion: number}}
 */
function encolar(deploymentId, inputs, clientId = null) {
  const cola = pendientes(deploymentId);
  if (cola.length >= MAX_COLA) {
    return { error: 'cola_llena', posicion: cola.length };
  }

  const jobId = randomUUID();
  const t = ahora();
  db.prepare(
    `INSERT INTO omnideploy_jobs (job_id, deployment_id, client_id, status, inputs, created_at, expires_at, servicio)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
  ).run(
    jobId, deploymentId, clientId, JSON.stringify(inputs ?? {}), t, t + almacen.TTL_MS,
    // Que servicio de la aplicacion pidio esto. Lo manda el cliente; si no lo
    // manda, se cae al tipo, que es lo unico que se sabia antes.
    String((inputs && (inputs.servicio || inputs.tipo)) || 'desconocido').slice(0, 40),
  );

  return { jobId, posicion: cola.length + 1 };
}

/**
 * Toma el trabajo mas antiguo pendiente y lo marca en curso.
 *
 * La lectura y la marca van en una transaccion para que dos sondeos simultaneos
 * -por ejemplo si el agente se reinicia y solapa- no se lleven el mismo trabajo.
 */
function tomarSiguiente(deploymentId) {
  let tomado = null;
  const tx = db.prepare('BEGIN IMMEDIATE');
  try {
    tx.run();
    const fila = db
      .prepare(
        "SELECT * FROM omnideploy_jobs WHERE deployment_id = ? AND status = 'pending' ORDER BY created_at LIMIT 1",
      )
      .get(deploymentId);
    if (fila) {
      db.prepare("UPDATE omnideploy_jobs SET status = 'running', started_at = ? WHERE job_id = ?").run(
        ahora(),
        fila.job_id,
      );
      tomado = fila;
    }
    db.prepare('COMMIT').run();
  } catch (e) {
    try { db.prepare('ROLLBACK').run(); } catch { /* ya cerrada */ }
    throw e;
  }
  return tomado;
}

/**
 * Sondeo largo: espera hasta `ESPERA_SONDEO_MS` a que haya trabajo.
 *
 * Devuelve el trabajo o `null`. Que devuelva `null` es lo normal y no es un
 * error: el agente vuelve a preguntar de inmediato.
 */
async function esperarTrabajo(deploymentId) {
  const limite = ahora() + ESPERA_SONDEO_MS;
  for (;;) {
    const trabajo = tomarSiguiente(deploymentId);
    if (trabajo) {
      return trabajo;
    }
    if (ahora() >= limite) {
      return null;
    }
    await new Promise((r) => setTimeout(r, LATIDO_MS));
  }
}

/**
 * Cuanto se considera que un trabajo puede estar legitimamente en curso.
 *
 * Mientras el agente genera NO sondea, asi que su `last_seen_at` se queda
 * quieto: una imagen tarda unos 90 s y la ventana de "caido" es de 60, de modo
 * que el dispositivo aparecia desconectado JUSTO MIENTRAS TRABAJABA.
 *
 * UNA HORA, y es el numero que manda sobre todos los demas: si aqui se agota,
 * el relay deja de dar por vivo al agente y da igual cuanto siga esperando la
 * aplicacion. Los tiempos de agente y cliente se alinean con este.
 *
 * Una hora y no mas porque el limite existe para algo: un agente que muera a
 * mitad dejaria su trabajo en `running` para siempre, y sin tope el dispositivo
 * figuraria vivo eternamente.
 */
const TRABAJO_MAX_MS = 60 * 60 * 1000;

/**
 * ¿Tiene este despliegue un trabajo realmente en curso?
 *
 * Se usa para no dar por caido a un agente ocupado. No hace falta ningun aviso
 * nuevo ni tocar el protocolo: el relay ya sabe a que despliegue entrego cada
 * trabajo y cuando.
 */
function trabajoEnCurso(deploymentId) {
  const t = ahora();
  return db
    .prepare(
      "SELECT job_id, started_at FROM omnideploy_jobs " +
        "WHERE deployment_id = ? AND status = 'running' AND started_at > ? " +
        'ORDER BY started_at DESC LIMIT 1',
    )
    .get(deploymentId, t - TRABAJO_MAX_MS);
}

/** Cierra un trabajo con su resultado. */
function terminar(jobId, { status, outputs, error }) {
  db.prepare(
    'UPDATE omnideploy_jobs SET status = ?, outputs = ?, error = ?, finished_at = ? WHERE job_id = ?',
  ).run(status, outputs ? JSON.stringify(outputs) : null, error ?? null, ahora(), jobId);
}

function obtener(jobId) {
  return db.prepare('SELECT * FROM omnideploy_jobs WHERE job_id = ?').get(jobId);
}

/**
 * Retira lo caducado: filas de la base y carpetas huerfanas del disco.
 *
 * Se invoca desde el sondeo del agente. Sin cron: en hosting compartido, una
 * pieza menos que configurar y que puede fallar.
 */
function purgarCaducados() {
  const t = ahora();
  const caducados = db.prepare('SELECT job_id FROM omnideploy_jobs WHERE expires_at < ?').all(t);
  for (const c of caducados) {
    almacen.borrar(c.job_id);
  }
  db.prepare('DELETE FROM omnideploy_jobs WHERE expires_at < ?').run(t);

  // Carpetas cuyo trabajo ya no existe en la base (resultado de un borrado a
  // medias o de un reinicio inoportuno).
  const vivos = new Set(db.prepare('SELECT job_id FROM omnideploy_jobs').all().map((f) => f.job_id));
  const huerfanas = almacen.purgar((nombre) => vivos.has(nombre));

  return { caducados: caducados.length, huerfanas };
}

/** Cancela un trabajo en curso o pendiente. */
function cancelar(jobId) {
  return db.prepare(
    "UPDATE omnideploy_jobs SET status = 'failed', error = 'Cancelado por el usuario', finished_at = ? WHERE job_id = ? AND status IN ('pending', 'running')",
  ).run(ahora(), jobId);
}

module.exports = {
  encolar,
  esperarTrabajo,
  terminar,
  cancelar,
  obtener,
  pendientes,
  purgarCaducados,
  trabajoEnCurso,
  MAX_COLA,
  ESPERA_SONDEO_MS,
  TRABAJO_MAX_MS,
};
