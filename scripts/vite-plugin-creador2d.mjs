/**
 * Arranca el backend del Creador 2D junto con el servidor de desarrollo.
 *
 * Hasta ahora `npm run dev` solo levantaba Vite, asi que el editor de mundos
 * solo funcionaba si alguien habia dejado el backend corriendo a mano en otra
 * ventana. Cuando ese proceso moria -al reiniciar, al cerrar la consola- el
 * Creador 2D dejaba de responder con ERR_CONNECTION_REFUSED y la unica pista
 * era un cartel pidiendo cuatro comandos manuales.
 *
 * Eso incumple la regla de que todo funcione de un tiron: quien usa la
 * aplicacion no tiene por que saber que hay un segundo servidor detras.
 *
 * No se anade ninguna dependencia: es `child_process` de Node.
 */
import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const PUERTO = 4310;
const HEALTH = `http://127.0.0.1:${PUERTO}/api/health`;

/**
 * Secreto que autoriza a la aplicacion a acunar una sesion con la cuenta de la
 * nube, sin pedir un segundo usuario y contrasena.
 *
 * SE LEE DEL MISMO SITIO QUE EN PRODUCCION. Lo genera el arrancador del backend
 * empotrado (`launcher.cjs`) y lo guarda en `%APPDATA%`, pero en desarrollo ese
 * arrancador no interviene: aqui el backend lo lanza este plugin. Sin esta
 * lectura, el servicio arrancaba con el secreto vacio -que significa enlace
 * desactivado- y respondia "Enlace con Omni IA Game no autorizado", de modo que
 * el Creador 2D pedia credenciales en `npm run dev` y no en la app instalada.
 *
 * Dos comportamientos distintos entre desarrollo y produccion es justo lo que
 * hace perder horas persiguiendo un fallo que solo existe en un lado.
 */
function secretoDeEnlace() {
  const base = process.env.APPDATA;
  if (!base) {
    return '';
  }
  const fichero = join(base, 'Omni IA Game', 'creador2d', 'secrets.json');
  if (!existsSync(fichero)) {
    return '';
  }
  try {
    return JSON.parse(readFileSync(fichero, 'utf-8')).enlace || '';
  } catch {
    return '';
  }
}

async function yaEstaVivo() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(HEALTH, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * @param {{ raiz: string }} opciones
 * @returns {import('vite').Plugin}
 */
export function creador2dBackend({ raiz }) {
  let proceso = null;

  return {
    name: 'omni-creador2d-backend',
    apply: 'serve',

    async configureServer(server) {
      const dir = join(raiz, 'creador2d-backend');
      const log = (msg) => server.config.logger.info(`  [Creador 2D] ${msg}`);

      if (!existsSync(dir)) {
        return;
      }

      // Si ya hay uno escuchando -por ejemplo el usuario lo lanzo aparte- no
      // se arranca un segundo: el puerto es fijo y el duplicado moriria con un
      // EADDRINUSE confuso.
      if (await yaEstaVivo()) {
        log(`ya estaba corriendo en el puerto ${PUERTO}`);
        return;
      }

      // Se prefiere el compilado: arranca en un segundo, frente a los ~15 que
      // tarda `nest start` recompilando en cada arranque del dev server.
      const compilado = join(dir, 'dist', 'main.js');
      const hayDeps = existsSync(join(dir, 'node_modules'));

      if (!hayDeps) {
        server.config.logger.warn(
          `  [Creador 2D] Falta instalar sus dependencias. Ejecuta una vez:\n` +
            `      cd creador2d-backend && npm install && npm run setup`,
        );
        return;
      }

      const [cmd, args] = existsSync(compilado)
        ? ['node', ['dist/main.js']]
        : ['npm', ['run', 'start']];

      const enlace = secretoDeEnlace();
      if (!enlace) {
        server.config.logger.warn(
          '  [Creador 2D] Sin secreto de enlace: el modulo pedira credenciales.\n' +
            '      Lo genera la aplicacion instalada al abrir el Creador 2D una vez.',
        );
      }

      proceso = spawn(cmd, args, {
        cwd: dir,
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Sin esto el enlace queda desactivado y el modulo pide login solo en
          // desarrollo. Ver `secretoDeEnlace`.
          OMNI_LINK_SECRET: enlace,
        },
      });

      let anunciado = false;
      const mirar = (buf) => {
        const texto = buf.toString();
        // Se anuncia cuando de verdad escucha, no cuando se lanza el proceso:
        // entre una cosa y otra hay conexion a PostgreSQL y carga de modulos.
        if (!anunciado && /Nest application successfully started|listening|4310/i.test(texto)) {
          anunciado = true;
          log(`listo en http://127.0.0.1:${PUERTO}`);
        }
        // Los errores si se muestran enteros: son la unica pista si PostgreSQL
        // no esta levantado o falta la migracion.
        if (/error|Error|ECONNREFUSED|P1001/.test(texto)) {
          server.config.logger.error(`  [Creador 2D] ${texto.trim().split('\n').slice(0, 4).join('\n  ')}`);
        }
      };

      proceso.stdout?.on('data', mirar);
      proceso.stderr?.on('data', mirar);

      proceso.on('error', (e) => {
        server.config.logger.error(`  [Creador 2D] no se pudo arrancar: ${e.message}`);
        proceso = null;
      });

      proceso.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          server.config.logger.error(
            `  [Creador 2D] termino con codigo ${code}. Si es la primera vez, ejecuta:\n` +
              `      cd creador2d-backend && npm run setup`,
          );
        }
        proceso = null;
      });

      log('arrancando...');
    },

    // Que no quede un backend huerfano ocupando el puerto tras parar Vite.
    closeBundle() {
      proceso?.kill();
      proceso = null;
    },
  };
}
