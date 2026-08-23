/**
 * Bloquea la edicion de los ficheros criticos de Omni IA Game.
 *
 * POR QUE EXISTE. La regla "no tocar lo que ya funciona" esta escrita en
 * CLAUDE.md desde hace tiempo, y aun asi se incumplio: el 2026-08-07 se rompio
 * la tabla de usuarios del panel con un reemplazo de texto que aparecia dos
 * veces, y antes se rompio la voz local cambiando el selector de interprete.
 *
 * Una regla escrita depende del criterio de quien la lee. Esto no: lo ejecuta
 * el programa antes de cada edicion y devuelve un rechazo que no se puede
 * ignorar.
 *
 * COMO DESBLOQUEAR. Crear el fichero `.claude/DESBLOQUEO`. Mientras exista, las
 * ediciones pasan. Al borrarlo vuelve la proteccion. La idea es que abrirlo sea
 * un acto deliberado del propietario, no algo que ocurra de paso.
 *
 *   Desbloquear:  echo > .claude/DESBLOQUEO
 *   Volver a proteger:  rm .claude/DESBLOQUEO
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Lo que no se toca sin permiso explicito. */
const PROTEGIDOS = [
  'services/aiProvider.ts',
  'services/localService.ts',
  'src-tauri/src/lib.rs',
  'auth-server/',
];

const RAIZ = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const LLAVE = join(RAIZ, '.claude', 'DESBLOQUEO');

let crudo = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (crudo += c));
process.stdin.on('end', () => {
  let ruta = '';
  try {
    const datos = JSON.parse(crudo || '{}');
    ruta = String(datos?.tool_input?.file_path || '');
  } catch {
    process.exit(0); // Un payload ilegible no debe bloquear el trabajo normal.
  }

  // Windows manda barras invertidas; se normaliza para poder comparar.
  const normalizada = ruta.replace(/\\/g, '/');
  const tocado = PROTEGIDOS.find((p) => normalizada.includes(p));

  if (!tocado) process.exit(0);

  // Salida de emergencia: el propietario ha abierto la puerta a proposito.
  if (existsSync(LLAVE)) {
    console.log(
      JSON.stringify({
        systemMessage: `Aviso: editando ruta protegida (${tocado}). El desbloqueo esta activo.`,
      }),
    );
    process.exit(0);
  }

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `RUTA PROTEGIDA: ${tocado}\n\n` +
          'Este fichero sostiene funciones que ya estan operativas y no se toca ' +
          'sin permiso del propietario.\n\n' +
          'Explica QUE vas a cambiar, POR QUE no hay alternativa y COMO se ' +
          'comprobara que lo demas sigue funcionando. Si el propietario lo ' +
          'aprueba, creara `.claude/DESBLOQUEO` y podras editar.',
      },
    }),
  );
  process.exit(0);
});
