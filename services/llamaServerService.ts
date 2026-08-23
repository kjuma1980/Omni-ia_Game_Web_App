/**
 * ---------------------------------------------------------------------------
 *  Servicio de Integración con LLama.cpp (llama-server)
 * ---------------------------------------------------------------------------
 *  Proporciona soporte directo para inferencia local mediante `llama-server`,
 *  carga directa de archivos `.gguf`, selector nativo de modelos, control de
 *  capas en GPU (-ngl), contexto (-c), hilos (-t) y arranque/parada bajo demanda.
 * ---------------------------------------------------------------------------
 */

export interface LlamaModel {
  id: string;
  object: string;
  owned_by?: string;
}

export interface LlamaServerOptions {
  modelPath?: string;
  hfToken?: string;
  port?: number;
  gpuLayers?: number;
  contextSize?: number;
  threads?: number;
  binaryPath?: string;
  customArgs?: string;
}

/**
 * Abre el diálogo nativo de Windows/OS para seleccionar un archivo .gguf
 */
export const selectGgufFile = async (): Promise<string | null> => {
  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  if (!invokeFn) {
    console.warn('[LLama.cpp] El diálogo nativo solo está disponible en la app de escritorio Tauri.');
    return null;
  }
  try {
    const res = await invokeFn('select_gguf_file');
    return typeof res === 'string' && res.trim() ? res : null;
  } catch (error) {
    console.warn('[LLama.cpp] Cancelado o error al seleccionar archivo .gguf:', error);
    return null;
  }
};

/**
 * Detiene cualquier instancia de llama-server.exe en ejecución.
 */
export const stopLlamaServer = async (): Promise<boolean> => {
  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  if (!invokeFn) return true;
  try {
    await invokeFn('stop_llama_server');
    return true;
  } catch (error) {
    console.warn('[LLama.cpp] Error al detener llama-server:', error);
    return false;
  }
};

/**
 * Inicia el proceso nativo llama-server.exe con los parámetros configurados.
 */
export const startLlamaServer = async (options: LlamaServerOptions): Promise<boolean> => {
  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  if (!invokeFn) return true;

  try {
    console.log('[LLama.cpp] 🚀 Iniciando llama-server.exe con opciones:', options);
    await invokeFn('start_llama_server', {
      modelPath: options.modelPath || '',
      hfToken: options.hfToken || null,
      port: options.port || 8088,
      gpuLayers: options.gpuLayers ?? 33,
      contextSize: options.contextSize || 4096,
      threads: options.threads || 4,
      binaryPath: options.binaryPath || null,
      customArgs: options.customArgs || null
    });
    return true;
  } catch (error) {
    console.error('[LLama.cpp] Error al iniciar llama-server:', error);
    throw error;
  }
};

export interface GgufModelInfo {
  name: string;
  path: string;
  size_bytes: number;
  size_formatted: string;
}

export interface LlamaServerState {
  alive: boolean;
  loading: boolean;
  models: string[];
}

/**
 * Escanea y devuelve los archivos .gguf y .bin en la carpeta especificada.
 */
export const listGgufModels = async (directory: string): Promise<GgufModelInfo[]> => {
  if (!directory || directory.trim() === '') return [];
  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  if (!invokeFn) return [];
  try {
    const list = await invokeFn('list_gguf_models', { directory: directory.trim() });
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn('[LLama.cpp Service] Error al listar modelos GGUF:', e);
    return [];
  }
};

/**
 * Comprueba si llama-server está activo y respondiendo HTTP en el endpoint.
 * Considera como activo si responde 200 OK o si devuelve 503 ("Loading model").
 */
export const isLlamaServerAlive = async (baseUrl: string = 'http://localhost:8088/v1'): Promise<boolean> => {
  try {
    const cleanBase = baseUrl.replace(/\/$/, '');
    const urlCheck = cleanBase.endsWith('/v1') ? `${cleanBase}/models` : `${cleanBase}/v1/models`;
    const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;

    if (invokeFn) {
      const resStr = await invokeFn('proxy_request', { url: urlCheck, method: 'GET' }).catch((err: any) => {
        const errStr = String(err?.message || err);
        if (errStr.includes('503') && errStr.toLowerCase().includes('loading model')) {
          return '{"status":"loading"}';
        }
        return null;
      });
      if (!resStr || typeof resStr !== 'string') return false;
      const trimmed = resStr.trim();
      if (trimmed.startsWith('<')) return false; // Es una página HTML ajena (como SearXNG), no llama-server
      if (trimmed.toLowerCase().includes('loading model') || trimmed.includes('"status":"loading"')) return true;
      try {
        const json = JSON.parse(trimmed);
        return Array.isArray(json.data) || Array.isArray(json.models) || json.status === 'loading';
      } catch {
        return false;
      }
    } else {
      const res = await fetch(urlCheck, { method: 'GET', signal: AbortSignal.timeout(1500) }).catch(() => null);
      if (!res) return false;
      if (res.status === 503) {
        const text = await res.text();
        return text.toLowerCase().includes('loading model');
      }
      if (!res.ok) return false;
      const text = await res.text();
      return text.includes('"data"') || text.includes('"models"');
    }
  } catch {
    return false;
  }
};

/**
 * Consulta el estado detallado de llama-server (si está encendido, cargando modelo o listo).
 */
export const getLlamaServerState = async (baseUrl: string = 'http://localhost:8088/v1'): Promise<LlamaServerState> => {
  try {
    const cleanBase = baseUrl.replace(/\/$/, '');
    const urlCheck = cleanBase.endsWith('/v1') ? `${cleanBase}/models` : `${cleanBase}/v1/models`;
    const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;

    if (invokeFn) {
      try {
        const resStr = await invokeFn('proxy_request', { url: urlCheck, method: 'GET' });
        if (typeof resStr === 'string') {
          const trimmed = resStr.trim();
          if (trimmed.startsWith('<')) return { alive: false, loading: false, models: [] };
          const json = JSON.parse(trimmed);
          const models = Array.isArray(json.data) ? json.data.map((m: any) => m.id || m.name).filter(Boolean) : [];
          return { alive: true, loading: false, models };
        }
      } catch (err: any) {
        const errStr = String(err?.message || err);
        if (errStr.includes('503') && errStr.toLowerCase().includes('loading model')) {
          return { alive: true, loading: true, models: [] };
        }
        return { alive: false, loading: false, models: [] };
      }
    } else {
      const res = await fetch(urlCheck, { method: 'GET' }).catch(() => null);
      if (!res) return { alive: false, loading: false, models: [] };
      if (res.status === 503) {
        const text = await res.text();
        if (text.toLowerCase().includes('loading model')) {
          return { alive: true, loading: true, models: [] };
        }
      }
      if (res.ok) {
        const json = await res.json();
        const models = Array.isArray(json.data) ? json.data.map((m: any) => m.id || m.name).filter(Boolean) : [];
        return { alive: true, loading: false, models };
      }
    }
    return { alive: false, loading: false, models: [] };
  } catch {
    return { alive: false, loading: false, models: [] };
  }
};

/**
 * Consulta los modelos cargados/disponibles en el servidor `llama-server`.
 */
export const getLlamaServerModels = async (baseUrl: string = 'http://localhost:8088/v1'): Promise<LlamaModel[]> => {
  try {
    const cleanBase = baseUrl.replace(/\/$/, '');
    const url = cleanBase.endsWith('/v1') ? `${cleanBase}/models` : `${cleanBase}/v1/models`;

    const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;

    let jsonRes: any = null;
    if (invokeFn) {
      const resStr = await invokeFn('proxy_request', {
        url,
        method: 'GET'
      }).catch((err: any) => {
        const errStr = String(err?.message || err);
        if (errStr.includes('503') && errStr.toLowerCase().includes('loading model')) {
          return '{"data":[{"id":"Cargando modelo en VRAM...","object":"model","owned_by":"llama.cpp"}]}';
        }
        return null;
      });
      if (typeof resStr === 'string') {
        const trimmed = resStr.trim();
        if (trimmed.startsWith('<')) {
          return [];
        }
        jsonRes = JSON.parse(trimmed);
      } else {
        jsonRes = resStr;
      }
    } else {
      const res = await fetch(url, { method: 'GET' }).catch(() => null);
      if (!res || !res.ok) {
        if (res && res.status === 503) {
          const text = await res.text();
          if (text.toLowerCase().includes('loading model')) {
            return [{ id: 'Cargando modelo en VRAM...', object: 'model', owned_by: 'llama.cpp' }];
          }
        }
        return [];
      }
      const text = await res.text();
      if (text.trim().startsWith('<')) return [];
      jsonRes = JSON.parse(text);
    }

    if (jsonRes && Array.isArray(jsonRes.data)) {
      return jsonRes.data.map((m: any) => ({
        id: m.id || m.name || 'local-model',
        object: m.object || 'model',
        owned_by: m.owned_by || 'llama.cpp'
      }));
    }
    return [];
  } catch {
    return [];
  }
};

/**
 * Asegura que llama-server esté arrancado y haya terminado de cargar el modelo en memoria.
 */
export const ensureLlamaServerRunning = async (
  baseUrl: string,
  options?: LlamaServerOptions
): Promise<boolean> => {
  const state = await getLlamaServerState(baseUrl);
  if (state.alive && !state.loading) return true;

  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  if (!invokeFn) return true;

  // SEGURIDAD: Auto-arrancar en segundo plano con archivo .gguf especificado o el predeterminado en models/
  let mPath = options?.modelPath;
  if (!mPath || (!mPath.endsWith('.gguf') && !mPath.endsWith('.bin')) || (!mPath.includes('\\') && !mPath.includes(':/') && !mPath.includes('/'))) {
    const status = await checkDefaultModelStatus();
    if (status.exists && status.path) {
      mPath = status.path;
    } else {
      return false;
    }
  }

  try {
    if (!state.alive) {
      console.log('[LLama.cpp Service] ⚡ Servidor no detectado. Intentando arranque bajo demanda con archivo local...');
      await startLlamaServer({ ...(options || {}), modelPath: mPath, port: options?.port || 8088 });
    }

    // Esperar hasta 40 segundos a que el modelo se cargue completamente en VRAM
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const curState = await getLlamaServerState(baseUrl);
      if (curState.alive && !curState.loading) {
        console.log('[LLama.cpp Service] ✅ llama-server iniciado y listo para recibir peticiones.');
        return true;
      }
      if (curState.loading) {
        console.log(`[LLama.cpp Service] ⏳ Cargando modelo en VRAM... (${i + 1}s)`);
      }
    }
  } catch (e) {
    console.warn('[LLama.cpp Service] Advertencia al arrancar bajo demanda llama-server:', e);
  }
  return false;
};

/**
 * Genera completado de texto con llama-server (OpenAI API standard).
 */
export const generateLlamaServerCompletion = async (
  baseUrl: string,
  model: string,
  prompt: string,
  system?: string,
  apiKey?: string,
  options?: LlamaServerOptions,
  signal?: AbortSignal
): Promise<string> => {
  if (!baseUrl || baseUrl.trim() === '') {
    throw new Error(`La URL base de llama-server es requerida. Se recibió: '${baseUrl}'`);
  }

  if (signal?.aborted) {
    stopLlamaServer().catch(() => {});
    throw new DOMException('Aborted by user', 'AbortError');
  }

  await ensureLlamaServerRunning(baseUrl, options);

  const cleanBase = baseUrl.replace(/\/$/, '');
  const url = cleanBase.endsWith('/v1') 
    ? `${cleanBase}/chat/completions` 
    : cleanBase.endsWith('/chat/completions') 
      ? cleanBase 
      : `${cleanBase}/v1/chat/completions`;

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (system && system.trim()) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({ role: 'user', content: prompt });

  const payload: Record<string, any> = {
    model: model?.trim() || 'local-model',
    messages,
    stream: false,
    temperature: 0.7,
    max_tokens: 8192,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;

  let jsonRes: any = null;

  if (invokeFn) {
    console.log(`[LLama.cpp Service] 🚀 Enviando petición (Tauri Proxy) a llama-server -> ${url}`);
    const invokePromise = invokeFn('proxy_request', {
      url,
      method: 'POST',
      payload,
      headers
    });
    if (!signal) {
      const resStr = await invokePromise;
      jsonRes = typeof resStr === 'string' ? JSON.parse(resStr) : resStr;
    } else {
      const abortPromise = new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => {
          stopLlamaServer().catch(() => {});
          reject(new DOMException('Aborted by user', 'AbortError'));
        }, { once: true });
      });
      const resStr = await Promise.race([invokePromise, abortPromise]);
      jsonRes = typeof resStr === 'string' ? JSON.parse(resStr) : resStr;
    }
  } else {
    console.log(`[LLama.cpp Service] 🚀 Enviando petición (Fetch directo) a llama-server -> ${url}`);
    if (signal) {
      signal.addEventListener('abort', () => {
        stopLlamaServer().catch(() => {});
      }, { once: true });
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error HTTP ${res.status} desde llama-server: ${errText}`);
    }

    jsonRes = await res.json();
  }

  const choice = jsonRes?.choices?.[0];
  let textOutput = '';
  if (choice?.message?.content && typeof choice.message.content === 'string' && choice.message.content.trim() !== '') {
    textOutput = choice.message.content;
  } else if (choice?.message?.reasoning_content && typeof choice.message.reasoning_content === 'string' && choice.message.reasoning_content.trim() !== '') {
    textOutput = choice.message.reasoning_content;
  } else if (choice?.text && typeof choice.text === 'string' && choice.text.trim() !== '') {
    textOutput = choice.text;
  } else if (jsonRes?.content && typeof jsonRes.content === 'string' && jsonRes.content.trim() !== '') {
    textOutput = jsonRes.content;
  }

  if (!textOutput || textOutput.trim() === '') {
    throw new Error('La respuesta recibida de llama-server no contiene texto de salida.');
  }

  return textOutput;
};

/**
 * Obtiene la ruta predeterminada de la carpeta models en disco.
 */
export const getDefaultModelsDir = async (): Promise<string> => {
  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  if (!invokeFn) return 'models';
  try {
    return await invokeFn('get_default_models_dir');
  } catch (error) {
    console.warn('[LLama.cpp Service] Error al obtener ruta de modelos:', error);
    return 'models';
  }
};

export interface DefaultModelStatus {
  exists: boolean;
  path: string;
  filename: string;
  size_bytes: number;
  default_url: string;
  models_dir: string;
}

/**
 * Consulta si el modelo local predeterminado ya está descargado y listo en models/
 */
export const checkDefaultModelStatus = async (filename?: string): Promise<DefaultModelStatus> => {
  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  if (!invokeFn) {
    return {
      exists: false,
      path: '',
      filename: filename || 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
      size_bytes: 0,
      default_url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
      models_dir: 'models'
    };
  }
  try {
    return await invokeFn('check_default_model_status', { filename: filename || null });
  } catch (error) {
    console.warn('[LLama.cpp Service] Error consultando estado del modelo:', error);
    return {
      exists: false,
      path: '',
      filename: filename || 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
      size_bytes: 0,
      default_url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
      models_dir: 'models'
    };
  }
};

/**
 * Descarga el modelo GGUF predeterminado en la carpeta models/ sin requerir token ni cuenta HF.
 */
export const downloadDefaultGgufModel = async (
  url?: string,
  filename?: string
): Promise<string> => {
  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  if (!invokeFn) {
    throw new Error('La descarga automática de modelos solo está disponible en la app nativa.');
  }
  return await invokeFn('download_default_gguf_model', {
    url: url || null,
    filename: filename || null
  });
};

export interface ProgresoLlamaModel {
  percent: number;
  downloaded: number;
  total: number;
  status: string;
}

/**
 * Se suscribe a los eventos de progreso de descarga del modelo GGUF en segundo plano.
 */
export async function escucharProgresoLlamaModel(
  alCambiar: (p: ProgresoLlamaModel) => void
): Promise<() => void> {
  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  if (!invokeFn) return () => {};
  try {
    const { listen } = await import('@tauri-apps/api/event');
    return await listen<ProgresoLlamaModel>('llama-model-download-progress', (e) => alCambiar(e.payload));
  } catch {
    return () => {};
  }
}


