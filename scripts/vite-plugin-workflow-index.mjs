/**
 * Regenera el indice de workflows en cuanto cambia la carpeta.
 *
 * Sin esto habia que ejecutar `npm run workflows:index` a mano despues de
 * dejar cada `.json`, que es justo el trabajo repetitivo que se queria quitar:
 * si el fichero esta en la carpeta pero no en el indice, no aparece en ninguna
 * lista y no hay ninguna pista de por que.
 *
 * Ahora: dejas el fichero, aparece en los desplegables. Al compilar el indice
 * se regenera igualmente, porque `build` llama al mismo script.
 *
 * Sin dependencias: `fs.watch` de Node y el indexador que ya existe.
 */
import { watch, existsSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';

/**
 * @param {{ raiz: string }} opciones
 * @returns {import('vite').Plugin}
 */
export function workflowIndex({ raiz }) {
  return {
    name: 'omni-workflow-index',
    apply: 'serve',

    configureServer(server) {
      const dir = join(raiz, 'public', 'workflows');
      const script = join(raiz, 'scripts', 'index-workflows.mjs');

      if (!existsSync(dir) || !existsSync(script)) {
        return;
      }

      let pendiente = null;
      let corriendo = false;

      const reindexar = () => {
        // Ya hay una pasada en vuelo. Sin esto, los eventos que llegan mientras
        // el indexador escribe encadenan una ejecucion tras otra.
        if (corriendo) {
          return;
        }
        // Se agrupan los cambios: copiar un fichero dispara varios eventos, y
        // sin esto el indexador correria tres o cuatro veces seguidas.
        clearTimeout(pendiente);
        pendiente = setTimeout(() => {
          corriendo = true;
          const p = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'] });
          let salida = '';
          p.stdout?.on('data', (b) => (salida += b.toString()));
          p.stderr?.on('data', (b) => (salida += b.toString()));
          p.on('exit', (code) => {
            // El propio indexador acaba de escribir `index.json`, y ese evento
            // aun no ha llegado. Se suelta el cerrojo un poco despues para que
            // la escritura no vuelva a entrar por la puerta del vigilante.
            setTimeout(() => { corriendo = false; }, 300);
            if (code === 0) {
              const linea = salida.split('\n').find((l) => l.includes('index.json'));
              server.config.logger.info(`  [Workflows] ${linea?.trim() ?? 'indice actualizado'}`);
              // Los omitidos importan: es la unica pista de que un fichero esta
              // en formato de interfaz y por eso no sale en las listas.
              for (const l of salida.split('\n').filter((l) => l.includes('OMITIDO'))) {
                server.config.logger.warn(`  [Workflows] ${l.trim()}`);
              }
            } else {
              server.config.logger.error(`  [Workflows] no se pudo indexar:\n${salida.trim()}`);
            }
          });
        }, 250);
      };

      // Se indexa al arrancar por si se anadieron ficheros con Vite parado.
      reindexar();

      try {
        watch(dir, (_evento, fichero) => {
          // EL FICHERO QUE ESCRIBE EL INDEXADOR VIVE EN LA CARPETA QUE VIGILA.
          // Reaccionar a el es un bucle infinito: indexar escribe `index.json`,
          // la escritura dispara el vigilante, y el vigilante vuelve a indexar.
          // `fs.watch` puede no dar el nombre en algunos sistemas; en ese caso
          // se deja pasar y frena el cerrojo `corriendo`.
          if (fichero && String(fichero) === 'index.json') {
            return;
          }
          reindexar();
        });
      } catch (e) {
        server.config.logger.warn(`  [Workflows] no se pudo vigilar la carpeta: ${e.message}`);
      }
    },
  };
}
