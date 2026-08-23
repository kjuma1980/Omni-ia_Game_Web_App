/**
 * ---------------------------------------------------------------------------
 *  Orquestador Inteligente de Memoria VRAM / RAM (Local Memory Orchestrator)
 * ---------------------------------------------------------------------------
 *  Gestiona la memoria de la GPU y del sistema evitando saturación y desbordes.
 *  - Si se trabaja de forma continuada con el MISMO modelo/proveedor (ej. chat de
 *    NPCs, iteraciones de código, variantes de sprites con Z-Image), el modelo
 *    se MANTIENE CALIENTE en VRAM para máxima velocidad (1-2s).
 *  - Si se detecta un CAMBIO DE CONTEXTO (ej. pasar de Ollama a ComfyUI, o de
 *    difusión a video/música), se liberan de forma atómica y limpia los modelos
 *    del proveedor anterior antes de cargar el nuevo.
 * ---------------------------------------------------------------------------
 */

export interface ActiveContextState {
  provider: string | null;
  model: string | null;
  category: string | null;
  lastUsedTimestamp: number;
}

// Estado singleton en memoria de la sesión activa
const activeContext: ActiveContextState = {
  provider: null,
  model: null,
  category: null,
  lastUsedTimestamp: 0,
};

/**
 * Libera de forma atómica la VRAM de ComfyUI descargando los modelos de la GPU
 */
export const freeComfyuiVram = async (comfyUrl: string = 'http://127.0.0.1:8188'): Promise<boolean> => {
  const cleanUrl = comfyUrl.trim().replace(/\/$/, '');
  try {
    console.log(`[Memory Orchestrator] 🧹 Liberando VRAM de ComfyUI en ${cleanUrl}/free...`);
    const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
    if (invokeFn) {
      await invokeFn('proxy_request', {
        url: `${cleanUrl}/free`,
        method: 'POST',
        payload: { unload_models: true, free_memory: true }
      });
    } else {
      await fetch(`${cleanUrl}/free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unload_models: true, free_memory: true })
      });
    }
    console.log(`[Memory Orchestrator] ✅ VRAM de ComfyUI liberada exitosamente.`);
    return true;
  } catch (error) {
    console.warn(`[Memory Orchestrator] Aviso: No se pudo contactar a ComfyUI para liberar VRAM:`, error);
    return false;
  }
};

/**
 * Descarga todos los modelos activos de Ollama de la VRAM/RAM
 */
export const freeOllamaModels = async (ollamaUrl: string = 'http://localhost:11434', specificModel?: string): Promise<boolean> => {
  const cleanUrl = ollamaUrl.trim().replace(/\/$/, '');
  try {
    console.log(`[Memory Orchestrator] 🧹 Verificando y descargando modelos de Ollama en ${cleanUrl}...`);
    const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
    
    if (specificModel) {
      if (invokeFn) {
        await invokeFn('proxy_request', {
          url: `${cleanUrl}/api/generate`,
          method: 'POST',
          payload: { model: specificModel, keep_alive: 0 }
        }).catch(() => {});
      } else {
        await fetch(`${cleanUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: specificModel, keep_alive: 0 })
        }).catch(() => {});
      }
    }

    let psResponseStr: string | null = null;
    if (invokeFn) {
      psResponseStr = await invokeFn('proxy_request', {
        url: `${cleanUrl}/api/ps`,
        method: 'GET'
      }).catch(() => null);
    } else {
      const res = await fetch(`${cleanUrl}/api/ps`).catch(() => null);
      if (res && res.ok) {
        psResponseStr = await res.text();
      }
    }

    if (psResponseStr) {
      try {
        const data = JSON.parse(psResponseStr);
        const models = Array.isArray(data?.models) ? data.models : [];
        for (const m of models) {
          const modelName = m.name || m.model;
          if (modelName) {
            console.log(`[Memory Orchestrator] Descargando modelo de Ollama: ${modelName}`);
            if (invokeFn) {
              await invokeFn('proxy_request', {
                url: `${cleanUrl}/api/generate`,
                method: 'POST',
                payload: { model: modelName, keep_alive: 0 }
              }).catch(() => {});
            } else {
              await fetch(`${cleanUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelName, keep_alive: 0 })
              }).catch(() => {});
            }
          }
        }
      } catch (e) {
        // Ignore parse error
      }
    }
    console.log(`[Memory Orchestrator] ✅ Modelos de Ollama descargados de memoria.`);
    return true;
  } catch (error) {
    console.warn(`[Memory Orchestrator] Aviso: No se pudo liberar memoria de Ollama:`, error);
    return false;
  }
};

/**
 * Detiene el proceso llama-server si se estaba ejecutando
 */
export const freeLlamaServer = async (): Promise<boolean> => {
  try {
    const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
    if (invokeFn) {
      console.log(`[Memory Orchestrator] 🧹 Deteniendo proceso llama-server.exe para liberar recursos...`);
      await invokeFn('stop_llama_server').catch(() => {});
      console.log(`[Memory Orchestrator] ✅ llama-server detenido y memoria liberada.`);
      return true;
    }
  } catch (e) {
    console.warn(`[Memory Orchestrator] Aviso al detener llama-server:`, e);
  }
  return false;
};

/**
 * Libera toda la memoria VRAM y RAM de los motores locales excepto el proveedor indicado
 */
export const flushOtherLocalProviders = async (options: {
  excludeProvider?: string;
  comfyUrl?: string;
  ollamaUrl?: string;
}): Promise<void> => {
  const { excludeProvider, comfyUrl, ollamaUrl } = options;
  const promises: Promise<any>[] = [];

  if (excludeProvider !== 'comfyui') {
    promises.push(freeComfyuiVram(comfyUrl));
  }
  if (excludeProvider !== 'ollama') {
    promises.push(freeOllamaModels(ollamaUrl));
  }
  if (excludeProvider !== 'llama-server') {
    promises.push(freeLlamaServer());
  }

  await Promise.allSettled(promises);
  // Pequeña pausa para permitir que el controlador de CUDA y el SO reclamen las páginas
  await new Promise(r => setTimeout(r, 150));
};

/**
 * Asegura contexto exclusivo de memoria antes de ejecutar una inferencia.
 * - Si el contexto coincide (mismo proveedor y mismo modelo), no se libera nada y se mantiene caliente.
 * - Si hay cambio de proveedor o modelo, se liberan los otros motores para dejar 100% de VRAM libre.
 */
export const ensureExclusiveMemoryContext = async (
  targetProvider: string,
  targetModel?: string,
  category: string = 'general',
  settings?: any
): Promise<{ switched: boolean }> => {
  const normalizedProvider = (targetProvider || '').toLowerCase().trim();
  const normalizedModel = (targetModel || '').toLowerCase().trim();

  const isManagedProvider = ['comfyui', 'ollama', 'llama-server', 'lm-studio', 'local', 'omnideploy'].includes(normalizedProvider);

  // Si no es un proveedor gestionado (ej. Gemini, OpenAI, Claude), no compite por VRAM
  if (!isManagedProvider) {
    activeContext.provider = normalizedProvider;
    activeContext.model = normalizedModel;
    activeContext.category = category;
    activeContext.lastUsedTimestamp = Date.now();
    return { switched: false };
  }

  const isSameContext =
    activeContext.provider === normalizedProvider &&
    activeContext.model === normalizedModel;

  if (isSameContext) {
    // Mismo contexto: el modelo ya está cargado en VRAM/RAM.
    // Lo conservamos caliente para inferencia rápida inmediata.
    activeContext.lastUsedTimestamp = Date.now();
    console.log(`[Memory Orchestrator] ⚡ Manteniendo sesión caliente para ${normalizedProvider} (${normalizedModel || 'default'}) [${category}]`);
    return { switched: false };
  }

  // Cambio de contexto detectado: limpiar la memoria de los otros proveedores locales
  console.log(`[Memory Orchestrator] 🔄 Cambio de contexto detectado: [${activeContext.provider || 'none'} -> ${normalizedProvider}] [${activeContext.model || 'none'} -> ${normalizedModel || 'none'}]. Liberando VRAM/RAM previa...`);

  // Extraer URLs de cualquier pestaña activa (Creador 2D, Suite 3D, Animación, Audio, NPCs, Código, Narrativa)
  const comfyUrl = settings?.image?.baseUrl || settings?.video?.baseUrl || settings?.threeD?.baseUrl || settings?.audio?.musicUrl || settings?.audio?.sfxUrl || 'http://127.0.0.1:8188';
  const ollamaUrl = settings?.text?.baseUrl || settings?.code?.baseUrl || settings?.npcs?.baseUrl || settings?.promptEngineer?.baseUrl || settings?.ollama?.baseUrl || 'http://localhost:11434';

  await flushOtherLocalProviders({
    excludeProvider: normalizedProvider,
    comfyUrl,
    ollamaUrl
  });

  // Actualizar el estado de sesión activa
  activeContext.provider = normalizedProvider;
  activeContext.model = normalizedModel;
  activeContext.category = category;
  activeContext.lastUsedTimestamp = Date.now();

  console.log(`[Memory Orchestrator] 🚀 Contexto listo para ${normalizedProvider} (${normalizedModel || 'default'}) [${category}]`);
  return { switched: true };
};

/**
 * Obtiene el estado actual de la sesión en memoria
 */
export const getActiveMemoryContext = (): ActiveContextState => {
  return { ...activeContext };
};

/**
 * Libera la memoria VRAM/RAM tras completar una generación individual.
 * - Si `autoFreeMemoryAfterGeneration` está desactivado (por defecto), mantiene la sesión en caliente.
 * - Si `autoFreeMemoryAfterGeneration` está activado, descarga inmediatamente el modelo y libera VRAM/RAM.
 */
export const releasePostGenerationMemory = async (
  provider: string,
  settings?: any,
  model?: string
): Promise<void> => {
  const normalizedProvider = (provider || '').toLowerCase().trim();
  const isManaged = ['ollama', 'comfyui', 'llama-server', 'lm-studio', 'local'].includes(normalizedProvider);
  if (!isManaged) return;

  const autoFree = Boolean(settings?.autoFreeMemoryAfterGeneration);

  if (!autoFree) {
    console.log(`[Memory Orchestrator] ⚡ Modo Caliente activo para ${normalizedProvider} (${model || 'default'}): Conservando modelo en VRAM/RAM para generaciones rápidas consecutivas.`);
    return;
  }

  console.log(`[Memory Orchestrator] 🧹 [Auto-Free Activado] Liberando VRAM/RAM inmediatamente tras generación con ${normalizedProvider}...`);

  const comfyUrl = settings?.image?.baseUrl || settings?.video?.baseUrl || settings?.threeD?.baseUrl || settings?.audio?.musicUrl || settings?.audio?.sfxUrl || 'http://127.0.0.1:8188';
  const ollamaUrl = settings?.text?.baseUrl || settings?.code?.baseUrl || settings?.npcs?.baseUrl || settings?.promptEngineer?.baseUrl || settings?.ollama?.baseUrl || 'http://localhost:11434';

  try {
    if (normalizedProvider === 'ollama') {
      const targetModel = model || activeContext.model || settings?.ollama?.model || settings?.text?.model;
      await freeOllamaModels(ollamaUrl, targetModel);
      console.log(`[Memory Orchestrator] ✅ Modelo de Ollama (${targetModel || 'todos'}) descargado y VRAM/RAM liberada.`);
    } else if (normalizedProvider === 'comfyui') {
      await freeComfyuiVram(comfyUrl);
      console.log(`[Memory Orchestrator] ✅ Modelos y memoria de ComfyUI liberados de VRAM.`);
    } else if (normalizedProvider === 'llama-server') {
      await freeLlamaServer();
      console.log(`[Memory Orchestrator] ✅ Proceso llama-server detenido y VRAM/RAM liberada.`);
    }
    // Reiniciar contexto activo si se liberó la memoria
    if (activeContext.provider === normalizedProvider) {
      activeContext.provider = null;
      activeContext.model = null;
    }
  } catch (err) {
    console.warn(`[Memory Orchestrator] Aviso al liberar memoria post-generación para ${normalizedProvider}:`, err);
  }
};
