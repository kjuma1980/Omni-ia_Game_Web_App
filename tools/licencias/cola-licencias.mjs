/**
 * Cola de licencias pendientes de subir al servidor.
 *
 * EL PROBLEMA QUE RESUELVE. El asistente hablaba con el servidor para todo, y
 * ante un fallo de red llamaba a `abortar()`: sin internet no se emitia nada.
 * No es que la licencia se quedara sin subir, es que no llegaba a existir, y el
 * cliente se quedaba esperando.
 *
 * COMO FUNCIONA AHORA. Si el servidor no responde y este equipo tiene la clave
 * privada, la licencia se FIRMA AQUI y su registro queda en cola. Cada intento
 * posterior -al arrancar el asistente, o con `--subir`- vacia lo que pueda.
 *
 * Si no hay clave privada no se puede firmar, y entonces lo que se encola es la
 * PETICION: al volver la conexion el servidor la emite y la manda al cliente.
 * Es peor que lo anterior, pero sigue siendo mejor que perder el encargo.
 *
 * Los reintentos van con espera creciente y un margen aleatorio. Lo aleatorio no
 * es adorno: si se cae la red con varias pendientes, sin margen todas
 * reintentarian a la vez y volverian a fallar juntas.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const DIR_COLA = join(AQUI, 'licencias_pendientes');

/** Espera del intento `n`, en milisegundos: 5 s, 15 s, 45 s... hasta 15 min. */
export function esperaDelIntento(n) {
  const base = Math.min(5000 * 3 ** n, 15 * 60 * 1000);
  // +-30 % de margen aleatorio, para que varias pendientes no reintenten a la vez.
  return Math.round(base * (0.7 + Math.random() * 0.6));
}

function asegurarDir() {
  if (!existsSync(DIR_COLA)) mkdirSync(DIR_COLA, { recursive: true });
}

/**
 * Guarda una licencia o una peticion pendiente.
 *
 * @param tipo  'registro' si ya esta firmada y solo falta registrarla;
 *              'emision' si hace falta que la firme el servidor.
 */
export function encolar(tipo, datos) {
  asegurarDir();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fichero = join(DIR_COLA, `${id}.json`);
  writeFileSync(
    fichero,
    JSON.stringify({ id, tipo, datos, creada: new Date().toISOString(), intentos: 0 }, null, 2),
    'utf-8',
  );
  return fichero;
}

/** Lo que hay pendiente, de lo mas antiguo a lo mas nuevo. */
export function pendientes() {
  asegurarDir();
  return readdirSync(DIR_COLA)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const ruta = join(DIR_COLA, f);
      try {
        return { ruta, ...JSON.parse(readFileSync(ruta, 'utf-8')) };
      } catch {
        return null; // Un fichero corrupto no debe bloquear a los demas.
      }
    })
    .filter(Boolean);
}

function anotarIntento(entrada, error) {
  try {
    writeFileSync(
      entrada.ruta,
      JSON.stringify(
        {
          id: entrada.id,
          tipo: entrada.tipo,
          datos: entrada.datos,
          creada: entrada.creada,
          intentos: (entrada.intentos || 0) + 1,
          ultimo_error: String(error).slice(0, 300),
          ultimo_intento: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf-8',
    );
  } catch {
    // Si no se puede anotar, el elemento sigue en cola igualmente.
  }
}

/**
 * Intenta subir todo lo pendiente.
 *
 * `subir(entrada)` debe lanzar si falla. Lo que sube bien se borra de la cola;
 * lo que falla se queda con su contador de intentos.
 */
export async function vaciar(subir, registrar = () => {}) {
  const cola = pendientes();
  if (!cola.length) return { subidas: 0, pendientes: 0 };

  let subidas = 0;
  for (const entrada of cola) {
    try {
      await subir(entrada);
      unlinkSync(entrada.ruta);
      subidas += 1;
      registrar(`subida ${entrada.tipo} ${entrada.id}`);
    } catch (e) {
      anotarIntento(entrada, e.message || e);
      registrar(`sigue pendiente ${entrada.id}: ${e.message || e}`);
    }
  }
  return { subidas, pendientes: pendientes().length };
}

/**
 * Reintenta en segundo plano hasta vaciar la cola.
 *
 * No tiene tope de intentos a proposito: lo que falta subir es una licencia que
 * el cliente YA tiene en la mano, y el servidor debe acabar sabiendolo. Se para
 * solo cuando no queda nada.
 */
export async function reintentarHasta(subir, registrar = () => {}, maxIntentos = Infinity) {
  for (let n = 0; n < maxIntentos; n += 1) {
    const { pendientes: quedan } = await vaciar(subir, registrar);
    if (!quedan) return true;
    const espera = esperaDelIntento(n);
    registrar(`quedan ${quedan}; reintento en ${Math.round(espera / 1000)} s`);
    await new Promise((r) => setTimeout(r, espera));
  }
  return false;
}
