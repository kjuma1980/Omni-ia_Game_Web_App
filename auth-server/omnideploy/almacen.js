'use strict';

/**
 * Almacen de resultados de OmniDeploy.
 *
 * Los binarios pasan por el relay porque el PC del dueno no tiene IP publica.
 * En hosting compartido eso es una cuota que se agota sola, asi que aqui esta
 * toda la contencion: topes de tamano, caducidad corta y purga.
 *
 * ES EL UNICO FICHERO QUE SABE DONDE VIVEN LOS BYTES. Al migrar a VPS -o a S3-
 * se sustituye este modulo y nada mas.
 */

const fs = require('fs');
const path = require('path');
const { JOBS_DIR } = require('./db');

/** Tope por fichero. Una imagen de 2048 px ronda los 5 MB; 25 deja margen. */
const MAX_FICHERO = 25 * 1024 * 1024;
/** Tope por trabajo, sumando todos sus ficheros. */
const MAX_TRABAJO = 100 * 1024 * 1024;
/**
 * Caducidad. CUATRO HORAS, no veinticuatro: un resultado que nadie recoge en
 * ese plazo no lo va a recoger, y mientras tanto ocupa cuota compartida.
 *
 * Eran dos, y se subieron al ampliar el tope de un trabajo a una hora: la
 * caducidad se cuenta desde que se ENCOLA, no desde que termina, asi que con
 * trabajos largos uno que espere turno detras de otro se quedaba sin plazo
 * antes de llegar a ejecutarse. Cuatro horas cubren tres encadenados y su
 * recogida.
 */
const TTL_MS = 4 * 60 * 60 * 1000;

function carpetaDe(jobId) {
  // `jobId` lo genera el relay (uuid), nunca el cliente, pero se sanea igual:
  // un `..` aqui seria escritura arbitraria en el disco del hosting.
  const limpio = String(jobId).replace(/[^a-zA-Z0-9-]/g, '');
  if (!limpio) {
    throw new Error('Identificador de trabajo invalido');
  }
  return path.join(JOBS_DIR, limpio);
}

/**
 * Guarda los ficheros de un trabajo.
 * @param {string} jobId
 * @param {Array<{name: string, data: string}>} ficheros datos en base64
 * @returns {Array<{name: string, size: number}>}
 */
function guardar(jobId, ficheros) {
  const dir = carpetaDe(jobId);
  fs.mkdirSync(dir, { recursive: true });

  let total = 0;
  const guardados = [];

  for (const f of ficheros || []) {
    const nombre = path.basename(String(f.name || 'salida.bin'));
    const bytes = Buffer.from(String(f.data || ''), 'base64');

    if (bytes.length > MAX_FICHERO) {
      throw new Error(`El fichero ${nombre} supera el limite de ${MAX_FICHERO / 1024 / 1024} MB`);
    }
    total += bytes.length;
    if (total > MAX_TRABAJO) {
      throw new Error(`El trabajo supera el limite de ${MAX_TRABAJO / 1024 / 1024} MB`);
    }

    fs.writeFileSync(path.join(dir, nombre), bytes);
    // La clase y el tipo los declara el agente, que SABE de donde salio cada
    // fichero: ComfyUI agrupa sus salidas en images, videos, audio o mallas. Se
    // conservan para que el cliente no tenga que deducirlos de la extension.
    guardados.push({
      name: nombre,
      size: bytes.length,
      kind: typeof f.kind === 'string' ? f.kind : undefined,
      mime: typeof f.mime === 'string' ? f.mime : undefined,
    });
  }

  return guardados;
}

/** Lee un fichero de un trabajo. Devuelve `null` si no esta. */
function leer(jobId, nombre) {
  const limpio = path.basename(String(nombre || ''));
  const ruta = path.join(carpetaDe(jobId), limpio);
  if (!fs.existsSync(ruta)) {
    return null;
  }
  return fs.readFileSync(ruta);
}

/** Borra la carpeta de un trabajo. Silencioso si ya no esta. */
function borrar(jobId) {
  try {
    fs.rmSync(carpetaDe(jobId), { recursive: true, force: true });
  } catch {
    // Que no se pueda borrar no debe tumbar la peticion en curso.
  }
}

/**
 * Borra las carpetas de trabajos que ya no existen en la base.
 *
 * Se llama desde el sondeo del agente, que ocurre cada pocos segundos: no hace
 * falta un cron, y en hosting compartido un cron menos es una cosa menos que
 * puede fallar.
 *
 * @param {(jobId: string) => boolean} sigueVivo
 */
function purgar(sigueVivo) {
  let borrados = 0;
  let entradas;
  try {
    entradas = fs.readdirSync(JOBS_DIR, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entradas) {
    if (!e.isDirectory()) continue;
    if (!sigueVivo(e.name)) {
      borrar(e.name);
      borrados += 1;
    }
  }
  return borrados;
}

module.exports = { guardar, leer, borrar, purgar, MAX_FICHERO, MAX_TRABAJO, TTL_MS };
