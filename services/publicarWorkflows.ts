/**
 * Publica los workflows de ESTA maquina para el agente de OmniDeploy.
 *
 * Es la pieza que hace que el PC del cliente no necesite tener nada cargado:
 * quien pone los modelos, la GPU y los grafos es el equipo del proveedor, y los
 * grafos que pone son los que su dueno tiene configurados en su propia
 * aplicacion.
 *
 * Se publican LAS SIETE SECCIONES, no solo la de imagen, porque en Omni IA Game
 * cada pestana tiene su propia configuracion de ComfyUI —su proveedor, su URL y
 * su workflow— y ninguna lee de otra:
 *
 *   imagen  1 general + una ranura por accion de sprite
 *   mundos  1 general + una ranura por perspectiva
 *   video   1
 *   voz     1
 *   musica  1
 *   sfx     1
 *   3d      1
 *
 * Separar por tipo no es orden: es lo que impide que un trabajo de voz acabe
 * ejecutando un grafo de imagen y devuelva un PNG donde se espera un wav.
 */

import type { ProjectData } from '../types';
import { ensureLibrary, loadSlots } from './workflowLibrary';

/** Lo que se manda a Rust: tipo -> (ranura -> grafo en JSON). */
export type WorkflowsPublicados = Record<string, Record<string, string>>;

/** Prefijo de ranura -> carpeta de tipo. Los demas tipos no tienen ranuras. */
const TIPO_DE_PREFIJO: Record<string, string> = {
  sprite: 'imagen',
  world: 'mundos',
};

/**
 * Arma el mapa a publicar a partir de lo que el dueno tiene configurado.
 *
 * Exportada aparte de `publicarWorkflows` para poder comprobarla sin Tauri.
 */
export async function armarWorkflows(
  settings: ProjectData['apiSettings'] | undefined,
): Promise<WorkflowsPublicados> {
  const salida: WorkflowsPublicados = {};

  const poner = (tipo: string, clave: string, json: string | null | undefined) => {
    if (!json || !json.trim()) return;
    (salida[tipo] ||= {})[clave] = json;
  };

  // 1. Los generales de cada seccion, tal cual estan en Ajustes.
  poner('imagen', 'general', settings?.image?.customWorkflow);
  poner('video', 'general', settings?.video?.customWorkflow);
  poner('voz', 'general', settings?.audio?.ttsCustomWorkflow);
  poner('musica', 'general', settings?.audio?.musicCustomWorkflow);
  poner('sfx', 'general', settings?.audio?.sfxCustomWorkflow);
  poner('3d', 'general', settings?.threeD?.customWorkflow);

  // Mundos ya no tiene tuberias de escenario: su workflow sale de la ranura
  // de la perspectiva y, si esta en blanco, del general de Imagen -el mismo de
  // Sprites-. Se publica ese general tambien como general de Mundos para que el
  // proveedor pueda cargar uno distinto si algun dia quiere.
  poner('mundos', 'general', settings?.image?.customWorkflow);

  // 2. Las ranuras: solo imagen y mundos las tienen.
  const ranuras = loadSlots();
  for (const [clave, slotVal] of Object.entries(ranuras)) {
    if (!slotVal?.jsonStr) continue;
    const tipo = TIPO_DE_PREFIJO[clave.split(':')[0]];
    if (!tipo) continue;
    poner(tipo, clave, slotVal.jsonStr);
  }

  return salida;
}

/**
 * Vuelca los workflows a disco. Sin Tauri no hace nada.
 *
 * Publicar es un extra para quien presta su GPU: si falla, no puede estorbar a
 * quien solo esta generando en local, asi que nunca lanza.
 */
export async function publicarWorkflows(
  settings: ProjectData['apiSettings'] | undefined,
): Promise<number> {
  const invocar =
    (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  if (!invocar) return 0;
  try {
    const workflows = await armarWorkflows(settings);
    if (Object.keys(workflows).length === 0) return 0;
    return (await invocar('publicar_workflows_omnideploy', { workflows })) as number;
  } catch {
    return 0;
  }
}
