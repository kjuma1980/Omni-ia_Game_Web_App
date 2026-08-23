const DB_NAME = 'DevAssetAIDB';
const STORE_NAME = 'projects';
const ASSETS_STORE = 'assets';
const WORKFLOWS_STORE = 'workflows';
/**
 * Version 4 y no 3: la 3 llego a existir en algunas instalaciones SIN el
 * almacen `workflows`, porque la version se subio en un cambio y el almacen se
 * anadio en el siguiente, y una recarga en caliente entremedias dejo la base
 * de datos actualizada a medias. Como `onupgradeneeded` no vuelve a dispararse
 * si la version ya coincide, ese almacen no se habria creado nunca y cualquier
 * operacion sobre el fallaba con "object stores was not found".
 *
 * Subir la version lo arregla porque el manejador es idempotente: crea solo lo
 * que falta y no toca lo que ya existe, asi que ni los proyectos ni los assets
 * guardados se ven afectados.
 */
const DB_VERSION = 4;

/**
 * ---------------------------------------------------------------------------
 *  Almacenamiento local
 * ---------------------------------------------------------------------------
 *  Antes todo vivia en UN SOLO registro llamado `autosave` con el proyecto
 *  entero, incluidas todas las imagenes generadas en base64. Y el autoguardado
 *  se dispara con cada cambio del proyecto: cada tecla escrita en un prompt
 *  reescribia todas las imagenes.
 *
 *  Con un PNG de 1024 rondando los 300-800 KB, mas el 33% que anade base64:
 *
 *      20 assets  ->  ~13 MB reescritos por tecla
 *     100 assets  ->  ~66 MB
 *     500 assets  ->  ~330 MB
 *
 *  Al probar modelos y LoRAs se acumulan cientos de imagenes, asi que el
 *  problema aparece justo cuando mas se usa la aplicacion.
 *
 *  Ahora los assets viven en su propio almacen, uno por registro, y solo se
 *  escriben cuando cambian. Escribir en un campo de texto pasa a mover unos
 *  kilobytes.
 *
 *  Se conserva IndexedDB a proposito: sacar las imagenes a ficheros en disco y
 *  los metadatos a SQLite es mejor todavia, pero exige anadir un plugin de
 *  Tauri y recompilar el binario. Esto no toca nada de eso y ya resuelve el
 *  problema de rendimiento.
 * ---------------------------------------------------------------------------
 */

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    /**
     * Subida de version bloqueada por otra conexion abierta.
     *
     * Sin esto la promesa NO se resuelve ni se rechaza: se queda colgada para
     * siempre. Y como quien la espera suele tener un `catch` que solo avisa por
     * consola, el sintoma es que una parte de la interfaz no aparece y no hay
     * ni un error donde mirar. Paso de verdad al subir de la version 2 a la 3.
     *
     * Se rechaza con un mensaje que dice que hacer, porque el navegador no
     * puede cerrar la otra pestana por su cuenta.
     */
    request.onblocked = () =>
      reject(
        new Error(
          'La base de datos local no se puede actualizar porque hay otra pestana de Omni IA Game abierta. ' +
            'Cierra las demas pestanas y recarga.',
        ),
      );

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      // Almacen nuevo. El traslado de los assets que ya estaban dentro del
      // proyecto se hace al cargar y no aqui: en `onupgradeneeded` no se puede
      // leer y reescribir con seguridad.
      if (!db.objectStoreNames.contains(ASSETS_STORE)) {
        db.createObjectStore(ASSETS_STORE, { keyPath: 'id' });
      }
      // Workflows registrados con su mapeo de papeles. Van en su propio
      // almacen y no dentro del proyecto porque un workflow sirve para todos
      // los proyectos: es configuracion del equipo, no contenido.
      if (!db.objectStoreNames.contains(WORKFLOWS_STORE)) {
        db.createObjectStore(WORKFLOWS_STORE, { keyPath: 'id' });
      }
    };
  });
};

/**
 * Guarda el proyecto SIN los assets.
 *
 * Es lo que se llama en cada pulsacion de tecla, asi que tiene que ser barato.
 */
export const saveProjectToDB = async (project: any): Promise<void> => {
  const db = await initDB();
  const { assets, ...resto } = project ?? {};

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ ...resto, id: 'autosave' });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Guarda los assets, uno por registro.
 *
 * Se llama solo cuando cambian: al generar, al borrar o al restaurar. Los que
 * ya no estan se eliminan, de modo que borrar un asset lo borra de verdad y no
 * deja huerfanos ocupando espacio.
 */
export const saveAssetsToDB = async (assets: any[]): Promise<void> => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ASSETS_STORE, 'readwrite');
    const store = transaction.objectStore(ASSETS_STORE);
    const vivos = new Set((assets ?? []).map((a) => a?.id).filter(Boolean));

    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => {
      const mapaPrevio = new Map<string, any>();
      for (const item of getAllReq.result ?? []) {
        if (item?.id) {
          mapaPrevio.set(item.id, item);
        }
      }

      const claves = store.getAllKeys();
      claves.onsuccess = () => {
        for (const clave of claves.result) {
          if (!vivos.has(clave as string)) {
            store.delete(clave);
          }
        }
        for (const asset of assets ?? []) {
          if (asset?.id) {
            const previo = mapaPrevio.get(asset.id);
            // Si el asset entrante no tiene imagen o esta vacia, pero en DB ya teniamos una imagen valida, la preservamos
            if ((!asset.imageUrl || asset.imageUrl.trim() === '') && previo?.imageUrl && previo.imageUrl.trim() !== '') {
              store.put({ ...asset, imageUrl: previo.imageUrl });
            } else {
              store.put(asset);
            }
          }
        }
      };
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

/**
 * Carga el proyecto y le vuelve a pegar sus assets.
 *
 * Si encuentra un proyecto en el formato antiguo -con los assets dentro del
 * mismo registro- los traslada al almacen nuevo. El traslado solo ocurre
 * cuando el almacen de assets esta vacio, asi que no puede pisar datos ya
 * migrados, y los assets se devuelven igualmente aunque el traslado fallara.
 */
export const loadProjectFromDB = async (): Promise<any | null> => {
  const db = await initDB();

  const proyecto = await new Promise<any | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get('autosave');
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });

  if (!proyecto) {
    return null;
  }

  const guardados = await new Promise<any[]>((resolve, reject) => {
    const transaction = db.transaction(ASSETS_STORE, 'readonly');
    const request = transaction.objectStore(ASSETS_STORE).getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });

  const heredados = Array.isArray(proyecto.assets) ? proyecto.assets : [];

  if (guardados.length === 0 && heredados.length > 0) {
    try {
      await saveAssetsToDB(heredados);
      await saveProjectToDB(proyecto);
      console.log(`[Omni IA Game] ${heredados.length} assets trasladados a su propio almacen.`);
    } catch (e) {
      // Si el traslado falla, el proyecto antiguo sigue intacto y los assets
      // se devuelven igual: no se pierde nada, solo se reintentara la proxima.
      console.warn('[Omni IA Game] No se pudieron trasladar los assets:', e);
    }
    return { ...proyecto, assets: heredados };
  }

  return {
    ...proyecto,
    // Mas recientes primero, que es el orden que espera la interfaz.
    assets: guardados.sort((a, b) => (b?.timestamp ?? 0) - (a?.timestamp ?? 0)),
  };
};

/**
 * ---------------------------------------------------------------------------
 *  Workflows registrados
 * ---------------------------------------------------------------------------
 *  Uno por registro, con su mapeo de papeles dentro. Se leen al arrancar y se
 *  escriben solo al registrar, editar o borrar uno: no participan del
 *  autoguardado, asi que escribir en un prompt no los toca.
 * ---------------------------------------------------------------------------
 */

/**
 * Comprueba que el almacen existe antes de abrir una transaccion.
 *
 * El error nativo -"One of the specified object stores was not found"- no dice
 * cual falta ni por que, y la causa real siempre es la misma: la base de datos
 * quedo en una version que no llego a crear ese almacen. Aqui se dice.
 */
function exigirAlmacen(db: IDBDatabase, nombre: string): void {
  if (!db.objectStoreNames.contains(nombre)) {
    throw new Error(
      `La base de datos local no tiene el almacen "${nombre}" (version ${db.version}). ` +
        'Cierra las demas pestanas de Omni IA Game y recarga para que se cree.',
    );
  }
}

/** Guarda o actualiza un workflow registrado. */
export const saveWorkflowToDB = async (workflow: any): Promise<void> => {
  if (!workflow?.id) {
    throw new Error('Un workflow registrado necesita un id.');
  }

  const db = await initDB();
  exigirAlmacen(db, WORKFLOWS_STORE);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(WORKFLOWS_STORE, 'readwrite');
    transaction.objectStore(WORKFLOWS_STORE).put(workflow);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

/** Devuelve todos los workflows registrados, el mas reciente primero. */
export const loadWorkflowsFromDB = async (): Promise<any[]> => {
  const db = await initDB();
  exigirAlmacen(db, WORKFLOWS_STORE);

  const guardados = await new Promise<any[]>((resolve, reject) => {
    const transaction = db.transaction(WORKFLOWS_STORE, 'readonly');
    const request = transaction.objectStore(WORKFLOWS_STORE).getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });

  return guardados.sort((a, b) => String(b?.updatedAt ?? '').localeCompare(String(a?.updatedAt ?? '')));
};

/** Borra un workflow registrado. El grafo original en disco no se toca. */
export const deleteWorkflowFromDB = async (id: string): Promise<void> => {
  const db = await initDB();
  exigirAlmacen(db, WORKFLOWS_STORE);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(WORKFLOWS_STORE, 'readwrite');
    transaction.objectStore(WORKFLOWS_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};
