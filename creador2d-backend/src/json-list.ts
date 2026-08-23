/**
 * ---------------------------------------------------------------------------
 *  Listas guardadas como JSON
 * ---------------------------------------------------------------------------
 *  SQLite no admite listas escalares, asi que los dos campos que en PostgreSQL
 *  eran `String[]` y `WorldType[]` pasan a ser una columna `String` con un JSON
 *  dentro: `BlockDefinition.worldTypes` y `BlockDefinition.tags`.
 *
 *  Todo el codigo que los lea o los escriba debe pasar por aqui. Si cada sitio
 *  hiciera su propio `JSON.parse`, bastaria un fichero corrupto o un valor
 *  antiguo para tumbar una peticion entera, y el fallo apareceria lejos de su
 *  causa. Aqui se decide una vez: ante cualquier problema, lista vacia.
 * ---------------------------------------------------------------------------
 */

/**
 * Lee una lista guardada como JSON.
 *
 * Tolera `null`, cadena vacia, JSON invalido y un JSON valido que no sea un
 * array. Devuelve siempre un array, porque quien llama espera poder recorrerlo
 * sin comprobar nada.
 */
export function readList<T extends string = string>(
  raw: string | readonly string[] | null | undefined,
): T[] {
  if (!raw) {
    return [];
  }
  // Acepta tambien un array ya deserializado: los objetos que salen hacia el
  // cliente se hidratan (`hydrateBlock`), y quien los reciba no tiene por que
  // saber si le llega la fila cruda de la base o la version ya hidratada.
  if (Array.isArray(raw)) {
    return raw.filter((v) => typeof v === 'string') as T[];
  }
  try {
    const parsed = JSON.parse(raw as string);
    return Array.isArray(parsed) ? (parsed.filter((v) => typeof v === 'string') as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Serializa una lista para guardarla.
 *
 * Descarta lo que no sea una cadena y quita duplicados: en `tags` y en
 * `worldTypes` un valor repetido no significa nada y solo ensucia las busquedas.
 */
export function writeList(values: readonly string[] | null | undefined): string {
  if (!values || values.length === 0) {
    return '[]';
  }
  const limpias = Array.from(new Set(values.filter((v) => typeof v === 'string' && v.length > 0)));
  return JSON.stringify(limpias);
}

/**
 * Comprueba si una lista serializada contiene un valor.
 *
 * Existe porque en SQLite no se puede filtrar dentro del JSON con Prisma, asi
 * que este filtrado ocurre en memoria despues de traer las filas. Para el
 * catalogo -unos cientos de bloques- es irrelevante; si algun dia creciera,
 * el sitio a cambiar es este y no las decenas de llamadas.
 */
export function listIncludes(
  raw: string | readonly string[] | null | undefined,
  value: string,
): boolean {
  return readList(raw).includes(value);
}

/**
 * Devuelve el bloque con sus listas ya deserializadas, para enviarlo al cliente.
 *
 * En la base son JSON dentro de una columna de texto, pero el editor y los
 * plugins esperan arrays -lo eran en PostgreSQL- y su validacion DESCARTA en
 * silencio cualquier bloque que no cumpla. El sintoma fue exactamente ese: los
 * 290 bloques llegaban al cliente y este los tiraba todos, mostrando "El
 * catalogo llego vacio".
 *
 * La conversion se hace SOLO al salir. Por dentro se sigue trabajando con la
 * fila cruda, que es lo que Prisma devuelve y lo que se escribe.
 */
export function hydrateBlock<T extends { worldTypes: unknown; tags: unknown }>(block: T): T {
  return {
    ...block,
    worldTypes: readList(block.worldTypes as string),
    tags: readList(block.tags as string),
  };
}
