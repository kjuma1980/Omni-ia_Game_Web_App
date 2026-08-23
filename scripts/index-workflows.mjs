/**
 * Regenera public/workflows/index.json a partir de los ficheros de la carpeta.
 *
 * Hace falta un manifiesto porque un navegador no puede listar un directorio:
 * la aplicacion solo puede pedir ficheros por su nombre. Y hace falta que sea
 * automatico porque, si el usuario tuviera que editar el JSON a mano cada vez
 * que anade un workflow, la mitad de las veces se le olvidaria y el workflow
 * no aparecerian sin explicacion.
 *
 *     npm run workflows:index
 *
 * Se ejecuta tambien antes de `build`, para que un workflow anadido y no
 * indexado no se quede fuera del instalador.
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'workflows');
const INDEX = join(DIR, 'index.json');

/** Mismo criterio que `detectFormat` en services/workflowRegistry.ts. */
function esFormatoApi(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return false;
  if (Array.isArray(json.nodes)) return false;
  const valores = Object.values(json);
  return valores.length > 0 && valores.every((n) => n && typeof n === 'object' && 'class_type' in n);
}

const entradas = [];
const rechazados = [];

for (const fichero of readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'index.json').sort()) {
  let json;
  try {
    json = JSON.parse(readFileSync(join(DIR, fichero), 'utf-8'));
  } catch (e) {
    rechazados.push([fichero, 'no es JSON valido: ' + e.message]);
    continue;
  }

  if (!esFormatoApi(json)) {
    rechazados.push([
      fichero,
      Array.isArray(json.nodes)
        ? 'esta en formato de interfaz; exportalo con "Export (API)"'
        : 'no parece un workflow de ComfyUI',
    ]);
    continue;
  }

  const clases = Object.values(json).map((n) => n.class_type);
  entradas.push({
    file: fichero,
    // Nombre legible a partir del fichero: "turnaround-charturner" -> "Turnaround charturner".
    name: fichero
      .replace(/\.json$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/^./, (c) => c.toUpperCase()),
    nodes: Object.keys(json).length,
    // Pista util para elegir sin abrir el fichero.
    model:
      Object.values(json).find((n) => typeof n.inputs?.unet_name === 'string')?.inputs.unet_name ??
      Object.values(json).find((n) => typeof n.inputs?.ckpt_name === 'string')?.inputs.ckpt_name ??
      null,
    loras: Object.values(json)
      .filter((n) => typeof n.inputs?.lora_name === 'string')
      .map((n) => n.inputs.lora_name),
    hasNegativeBranch: clases.filter((c) => /CLIPTextEncode|TextEncode/i.test(c)).length > 1,
  });
}

// Sin sello de tiempo A PROPOSITO. Lo llevaba, no lo leia nadie, y hacia que
// el fichero cambiara en cada arranque: `git status` salia sucio siempre y
// cualquier vigilante de la carpeta veia un cambio que no lo era. Con el mismo
// contenido, el indice sale byte a byte identico.
writeFileSync(INDEX, JSON.stringify({ workflows: entradas }, null, 2) + '\n');

console.log(`public/workflows/index.json -> ${entradas.length} workflow(s)`);
for (const e of entradas) {
  console.log(`  ${e.file.padEnd(32)} ${e.nodes} nodos  ${e.model ?? '(modelo no detectado)'}`);
}
for (const [f, motivo] of rechazados) {
  console.log(`  OMITIDO  ${f.padEnd(30)} ${motivo}`);
}
if (entradas.length === 0) {
  console.log('\n  No hay ningun workflow en formato API. Ver public/workflows/README.md');
}
