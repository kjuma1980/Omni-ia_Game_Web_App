/**
 * ---------------------------------------------------------------------------
 *  Base de Datos Exclusiva y Aislada para el Agente Fénix (FenixAgentDB)
 * ---------------------------------------------------------------------------
 *  Almacena de forma persistente y desacoplada de DevAssetAIDB:
 *  - Configuración, avatar y personalidad del Agente Fénix.
 *  - Perfil y preferencias del usuario.
 *  - Historial de conversaciones (mensajes, emociones y llamadas a herramientas).
 *  - Memoria contextual a largo plazo de los proyectos y decisiones de diseño.
 * ---------------------------------------------------------------------------
 */

import { FenixAgentConfig, FenixChatMessage, FenixProjectMemory, DEFAULT_FENIX_CONFIG } from '../types';

const DB_NAME = 'FenixAgentDB';
const DB_VERSION = 1;

const CONFIG_STORE = 'config';
const MESSAGES_STORE = 'messages';
const MEMORIES_STORE = 'memories';
const CONFIG_KEY = 'agent_config';

/**
 * Inicializa la base de datos de Fénix de forma idempotente y segura
 */
export const initFenixDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB no está disponible en este entorno.'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onblocked = () => {
      console.warn('[FenixDB] Actualización de base de datos bloqueada por otra pestaña abierta.');
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        const msgStore = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
        msgStore.createIndex('by_timestamp', 'timestamp', { unique: false });
        msgStore.createIndex('by_role', 'role', { unique: false });
      }

      if (!db.objectStoreNames.contains(MEMORIES_STORE)) {
        const memStore = db.createObjectStore(MEMORIES_STORE, { keyPath: 'id' });
        memStore.createIndex('by_project', 'projectId', { unique: false });
        memStore.createIndex('by_category', 'category', { unique: false });
      }
    };
  });
};

/**
 * Obtiene la configuración guardada del Agente Fénix o devuelve los valores por defecto
 */
export const getFenixConfig = async (): Promise<FenixAgentConfig> => {
  try {
    const db = await initFenixDB();
    return new Promise((resolve) => {
      const tx = db.transaction(CONFIG_STORE, 'readonly');
      const store = tx.objectStore(CONFIG_STORE);
      const req = store.get(CONFIG_KEY);

      req.onsuccess = () => {
        if (req.result && req.result.value) {
          resolve({ ...DEFAULT_FENIX_CONFIG, ...req.result.value });
        } else {
          resolve({ ...DEFAULT_FENIX_CONFIG });
        }
      };

      req.onerror = () => {
        console.warn('[FenixDB] Error leyendo configuración, usando defaults:', req.error);
        resolve({ ...DEFAULT_FENIX_CONFIG });
      };
    });
  } catch (err) {
    console.warn('[FenixDB] Fallo abriendo DB para config:', err);
    return { ...DEFAULT_FENIX_CONFIG };
  }
};

/**
 * Guarda o actualiza la configuración del Agente Fénix
 */
export const saveFenixConfig = async (config: Partial<FenixAgentConfig>): Promise<void> => {
  try {
    const current = await getFenixConfig();
    const updated = { ...current, ...config };
    const db = await initFenixDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONFIG_STORE, 'readwrite');
      const store = tx.objectStore(CONFIG_STORE);
      const req = store.put({ key: CONFIG_KEY, value: updated, updatedAt: Date.now() });

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[FenixDB] Error guardando configuración:', err);
  }
};

/**
 * Obtiene la lista de mensajes del chat ordenados cronológicamente
 */
export const getFenixMessages = async (limit: number = 100): Promise<FenixChatMessage[]> => {
  try {
    const db = await initFenixDB();
    return new Promise((resolve) => {
      const tx = db.transaction(MESSAGES_STORE, 'readonly');
      const store = tx.objectStore(MESSAGES_STORE);
      const index = store.index('by_timestamp');
      const req = index.getAll();

      req.onsuccess = () => {
        const msgs: FenixChatMessage[] = req.result || [];
        msgs.sort((a, b) => a.timestamp - b.timestamp);
        if (limit && msgs.length > limit) {
          resolve(msgs.slice(-limit));
        } else {
          resolve(msgs);
        }
      };

      req.onerror = () => {
        console.warn('[FenixDB] Error obteniendo mensajes:', req.error);
        resolve([]);
      };
    });
  } catch (err) {
    console.warn('[FenixDB] Fallo abriendo DB para mensajes:', err);
    return [];
  }
};

/**
 * Guarda un mensaje en el historial del chat
 */
export const saveFenixMessage = async (msg: FenixChatMessage): Promise<void> => {
  try {
    const db = await initFenixDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MESSAGES_STORE, 'readwrite');
      const store = tx.objectStore(MESSAGES_STORE);
      const req = store.put(msg);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[FenixDB] Error guardando mensaje:', err);
  }
};

/**
 * Limpia el historial de mensajes de chat
 */
export const clearFenixMessages = async (): Promise<void> => {
  try {
    const db = await initFenixDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MESSAGES_STORE, 'readwrite');
      const store = tx.objectStore(MESSAGES_STORE);
      const req = store.clear();

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[FenixDB] Error limpiando mensajes:', err);
  }
};

/**
 * Obtiene las memorias del proyecto registradas por Fénix
 */
export const getFenixMemories = async (projectId?: string): Promise<FenixProjectMemory[]> => {
  try {
    const db = await initFenixDB();
    return new Promise((resolve) => {
      const tx = db.transaction(MEMORIES_STORE, 'readonly');
      const store = tx.objectStore(MEMORIES_STORE);

      if (projectId) {
        const index = store.index('by_project');
        const req = index.getAll(IDBKeyRange.only(projectId));
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } else {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      }
    });
  } catch (err) {
    console.warn('[FenixDB] Fallo abriendo DB para memorias:', err);
    return [];
  }
};

/**
 * Guarda o actualiza una memoria contextual del proyecto
 */
export const saveFenixMemory = async (memory: FenixProjectMemory): Promise<void> => {
  try {
    const db = await initFenixDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MEMORIES_STORE, 'readwrite');
      const store = tx.objectStore(MEMORIES_STORE);
      const req = store.put(memory);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[FenixDB] Error guardando memoria:', err);
  }
};

/**
 * Elimina una memoria por su ID
 */
export const deleteFenixMemory = async (id: string): Promise<void> => {
  try {
    const db = await initFenixDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MEMORIES_STORE, 'readwrite');
      const store = tx.objectStore(MEMORIES_STORE);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[FenixDB] Error eliminando memoria:', err);
  }
};
