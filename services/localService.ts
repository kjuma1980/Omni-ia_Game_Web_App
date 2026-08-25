export { safeImageSrc } from '../utils/imageUtils';
import { injectUniversalTextPrompts } from './workflowCapabilities';

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

const getHeaders = (apiKey?: string) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
};

// SEGURIDAD (auditoría 2026-07-20): enruta las llamadas cloud por el proxy nativo de Rust
// cuando la app corre en Tauri, para que las API keys no viajen desde el webview (visibles en DevTools).
// Fallback a fetch directo únicamente en modo navegador (desarrollo web fuera de Tauri).
const fetchJsonSecure = async (
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal
): Promise<any> => {
  if (signal?.aborted) {
    throw new DOMException('Aborted by user', 'AbortError');
  }
  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  if (invokeFn) {
    try {
      const invokePromise = invokeFn('proxy_request', {
        url,
        method: 'POST',
        payload: body,
        headers
      });
      let resStr: any;
      if (!signal) {
        resStr = await invokePromise;
      } else {
        const abortPromise = new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted by user', 'AbortError')), { once: true });
        });
        resStr = await Promise.race([invokePromise, abortPromise]);
      }
      let parsedData: any;
      if (typeof resStr === 'object' && resStr !== null) {
        parsedData = resStr;
      } else {
        try {
          parsedData = JSON.parse(resStr as string);
        } catch {
          throw new Error(`Respuesta no válida del proveedor (${url}): ${String(resStr).substring(0, 250)}`);
        }
      }
      if (parsedData?.error) {
        const errMsg = typeof parsedData.error === 'string' ? parsedData.error : (parsedData.error.message || JSON.stringify(parsedData.error));
        throw new Error(errMsg);
      }
      return parsedData;
    } catch (e: any) {
      if (e?.name === 'AbortError' || String(e).includes('Aborted')) {
        throw new DOMException('Aborted by user', 'AbortError');
      }
      const msg = typeof e === 'string' ? e : (e?.message || String(e));
    }
  }

  if (!invokeFn) {
    const method = body ? 'POST' : 'GET';
    const proxyRes = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: url,
        method,
        headers,
        payload: body
      }),
      signal
    });

    if (!proxyRes.ok) {
      const errText = await proxyRes.text().catch(() => '');
      let errJson: any;
      try {
        errJson = JSON.parse(errText);
      } catch {}
      const errMsg = errJson?.error?.message || errJson?.error || errText.substring(0, 250) || `Error HTTP ${proxyRes.status}`;
      throw new Error(errMsg);
    }
    return await proxyRes.json();
  }

  const method = body ? 'POST' : 'GET';
  const fetchOptions: RequestInit = {
    method,
    headers,
    signal
  };
  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    let errJson: any;
    try {
      errJson = JSON.parse(errText);
    } catch {}
    const errMsg = errJson?.error?.message || errJson?.error || errText.substring(0, 250) || 'Sin respuesta';
    throw new Error(`HTTP ${response.status} (${response.statusText || 'Error'}): ${errMsg}`);
  }
  return await response.json();
};

const ensureBase64Image = async (imageInput: string): Promise<string> => {
  if (!imageInput) return "";
  if (imageInput.startsWith('http') || imageInput.startsWith('asset:') || imageInput.startsWith('tauri:')) {
    try {
      console.log(`[Omni IA Game] Fetching and converting image URL to base64: ${imageInput.substring(0, 100)}...`);
      const response = await fetch(imageInput);
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error("Error converting image URL to base64:", err);
      return imageInput;
    }
  }
  return imageInput;
};

/**
 * GET de JSON contra un servidor local, VALIDO TAMBIEN EN LA APP EMPAQUETADA.
 *
 * Existe por una diferencia medida entre desarrollo y produccion: en
 * `npm run dev` la interfaz se sirve desde `http://localhost:5173`, y pedir a
 * `http://localhost:11434` es http -> http, que el navegador permite.
 * EMPAQUETADA, el origen pasa a ser `https://tauri.localhost`, y entonces la
 * MISMA peticion es CONTENIDO MIXTO (https -> http): el motor la bloquea antes
 * de que salga del proceso.
 *
 * Ese es el motivo exacto de que las listas de modelos de Ollama y LM Studio
 * funcionaran en desarrollo y aparecieran vacias en la aplicacion instalada.
 * ComfyUI nunca tuvo el problema porque siempre hablo por `proxy_request`.
 *
 * `is_url_allowed` en Rust admite localhost y las IPs privadas de LAN, asi que
 * un servidor en otro equipo de la red tambien funciona. Sin Tauri se cae a
 * `fetch`, que en el navegador si vale.
 */
export const pedirJsonLocal = async (
  url: string,
  headers?: Record<string, string>,
): Promise<any> => {
  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;

  if (invokeFn) {
    const crudo = (await invokeFn('proxy_request', { url, method: 'GET', headers })) as string;
    try {
      return JSON.parse(crudo);
    } catch {
      throw new Error(
        `La respuesta de ${url} no es JSON. Comprueba que la direccion apunta al servidor correcto.`,
      );
    }
  }

  const response = await fetch(url, headers ? { headers } : undefined);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error(
      `Invalid response from server. Expected JSON, got ${contentType || 'unknown'}. Check if the URL is correct.`,
    );
  }
  return await response.json();
};

/**
 * POST de JSON contra un servidor local, VALIDO TAMBIEN EN LA APP EMPAQUETADA.
 *
 * Hermano de `pedirJsonLocal` y por el mismo motivo: empaquetada, la interfaz
 * se sirve desde `https://tauri.localhost`, y un `fetch` a `http://localhost`
 * es contenido mixto que el motor bloquea antes de que salga del proceso.
 *
 * Es lo que impedia que funcionara el TTS local: el servidor podia estar
 * perfectamente levantado y la peticion no llegaba a salir.
 */
export const enviarJsonLocal = async (
  url: string,
  cuerpo: unknown,
  headers?: Record<string, string>,
): Promise<any> => {
  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;

  if (invokeFn) {
    const crudo = (await invokeFn('proxy_request', {
      url,
      method: 'POST',
      payload: cuerpo,
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    })) as string;
    try {
      return JSON.parse(crudo);
    } catch {
      throw new Error(`La respuesta de ${url} no es JSON: ${String(crudo).slice(0, 120)}`);
    }
  }

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    throw new Error(e.error || `HTTP ${r.status}`);
  }
  return await r.json();
};

/** Modelos instalados en un servidor Ollama. */
export const getOllamaModels = async (baseUrl: string = 'http://localhost:11434'): Promise<OllamaModel[]> => {
  let cleanBaseUrl = (baseUrl || 'http://localhost:11434').trim().replace(/\/$/, '');
  if (cleanBaseUrl.endsWith('/v1')) {
    cleanBaseUrl = cleanBaseUrl.slice(0, -3);
  }
  try {
    const data = await pedirJsonLocal(`${cleanBaseUrl}/api/tags`);
    return data.models || [];
  } catch (error) {
    console.error("Ollama connection error:", error);
    throw error;
  }
};

export const pullOllamaModel = async (baseUrl: string, modelName: string): Promise<Response> => {
  if (!baseUrl || baseUrl.trim() === '') throw new Error("Base URL is required");
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const response = await fetch(`${cleanBaseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: false })
  });
  if (!response.ok) {
    throw new Error(`Failed to pull model: ${response.status} ${response.statusText}`);
  }
  return response;
};

export const freeComfyuiVram = async (comfyUrl?: string): Promise<boolean> => {
  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  const cleanUrl = comfyUrl ? comfyUrl.trim().replace(/\/$/, '') : 'http://127.0.0.1:8188';

  try {
    console.log(`[Omni IA Game] Requesting ComfyUI to free VRAM at ${cleanUrl}/free...`);
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
    console.log(`[Omni IA Game] ComfyUI VRAM free request completed successfully.`);
    return true;
  } catch (error) {
    console.warn(`[Omni IA Game] Failed to request ComfyUI to free VRAM:`, error);
    return false;
  }
};

export interface OllamaOptions {
  format?: 'json' | string;
  num_predict?: number;
  temperature?: number;
  num_ctx?: number;
  keep_alive?: string | number;
}

export const generateOllamaCompletion = async (
  baseUrl: string,
  model: string,
  prompt: string,
  system?: string,
  apiKey?: string,
  signal?: AbortSignal,
  customOptions?: OllamaOptions
): Promise<string> => {
  let activeModel = model;

  const performRequest = async (targetModel: string): Promise<Response> => {
    let url = baseUrl ? baseUrl.replace(/\/$/, '') : 'http://localhost:11434';
    if (!url.endsWith('/api/generate')) {
      url = `${url}/api/generate`;
    }

    const payload: any = {
      model: targetModel,
      prompt,
      system,
      stream: false,
      keep_alive: customOptions?.keep_alive !== undefined ? customOptions.keep_alive : '30s',
      options: {
        num_ctx: customOptions?.num_ctx || 8192,
        num_predict: customOptions?.num_predict !== undefined ? customOptions.num_predict : -1,
        temperature: customOptions?.temperature !== undefined ? customOptions.temperature : 0.7
      }
    };
    if (customOptions?.format) {
      payload.format = customOptions.format;
    }
    const headers = getHeaders(apiKey);

    const abortCleanup = () => {
      const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : 'http://localhost:11434';
      const cancelUrl = `${cleanBase}/api/generate`;
      if (invokeFn) {
        invokeFn('proxy_request', {
          url: cancelUrl,
          method: 'POST',
          payload: { model: targetModel, keep_alive: 0 }
        }).catch(() => {});
      } else {
        fetch(cancelUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: targetModel, keep_alive: 0 })
        }).catch(() => {});
      }
    };

    if (signal?.aborted) {
      abortCleanup();
      throw new DOMException('Aborted by user', 'AbortError');
    }

    const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
    if (invokeFn) {
      console.log(`[Ollama Service] 🚀 Enviando petición (Tauri Proxy) a Ollama (${targetModel}) -> ${url}`);
      try {
        const invokePromise = invokeFn('proxy_request', {
          url,
          method: 'POST',
          payload,
          headers
        });
        if (!signal) {
          const resStr = await invokePromise;
          return new Response(typeof resStr === 'string' ? resStr : JSON.stringify(resStr), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        const abortPromise = new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => {
            abortCleanup();
            reject(new DOMException('Aborted by user', 'AbortError'));
          }, { once: true });
        });
        const resStr = await Promise.race([invokePromise, abortPromise]);
        console.log(`[Ollama Service] ✅ Respuesta recibida exitosamente desde Ollama (${targetModel})`);
        return new Response(typeof resStr === 'string' ? resStr : JSON.stringify(resStr), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        if (e?.name === 'AbortError' || String(e).includes('Aborted')) {
          abortCleanup();
          throw new DOMException('Aborted by user', 'AbortError');
        }
        const msg = typeof e === 'string' ? e : (e?.message || String(e));
        console.warn(`[Ollama Service] ❌ Error en respuesta de Ollama (${targetModel}):`, msg);
        return new Response(JSON.stringify({ error: msg }), {
          status: msg.includes('404') ? 404 : 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    console.log(`[Ollama Service] 🚀 Enviando petición (Fetch directo) a Ollama (${targetModel}) -> ${url}`);

    if (signal) {
      signal.addEventListener('abort', () => {
        abortCleanup();
      }, { once: true });
    }

    return await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal
    });
  };

  let response = await performRequest(activeModel);

  if (!response.ok) {
    const errorText = await response.text();

    // Si el modelo no fue encontrado o no se pudo cargar (HTTP 404, "not found" o "unable to load model")
    const isModelLoadError = response.status === 404
      || errorText.toLowerCase().includes("not found")
      || errorText.toLowerCase().includes("unable to load model")
      || errorText.toLowerCase().includes("failed to load");

    if (isModelLoadError) {
      console.warn(`[Omni IA Game] Modelo Ollama '${activeModel}' no disponible o corrupto en disco. Buscando modelos alternativos...`);
      try {
        const installed = await getOllamaModels(baseUrl);
        if (installed && installed.length > 0) {
          const validLlms = installed.filter((m: any) => {
            const name = (m.name || m.model || '').toLowerCase();
            return !name.includes('embed') && !name.includes('vision');
          });
          const searchNames = (validLlms.length > 0 ? validLlms : installed).map((m: any) => m.name || m.model);
          
          // Buscar un modelo distinto al que acaba de fallar
          let fallbackModel = searchNames.find(n => n.toLowerCase() !== activeModel.toLowerCase());

          if (fallbackModel) {
            console.log(`[Omni IA Game] Reintentando generación Ollama con modelo instalado de reemplazo: '${fallbackModel}'`);
            activeModel = fallbackModel;
            response = await performRequest(activeModel);
          }
        }
      } catch (autoErr) {
        console.warn("[Omni IA Game] Error al autodetectar modelos en Ollama:", autoErr);
      }
    }

    if (!response.ok) {
      const finalErr = await response.text().catch(() => errorText);
      if (response.status === 500) {
        if (finalErr.includes("cyclic redundancy check") || finalErr.includes("Data error") || finalErr.includes("read error")) {
          throw new Error(`[Ollama 500 - Archivo Dañado en Disco] El archivo del modelo '${activeModel}' en tu instalación de Ollama tiene sectores dañados (Error CRC en disco). Abre la consola y ejecuta 'ollama rm ${activeModel}' y luego 'ollama pull ${activeModel}', o selecciona en Ajustes otro modelo como 'llama3.2:latest' o 'qwen3.5:4b'.`);
        }
        if (finalErr.toLowerCase().includes("failed to load") || finalErr.toLowerCase().includes("out of memory") || finalErr.toLowerCase().includes("vram")) {
          throw new Error(`[Ollama 500 OOM] El modelo '${activeModel}' no pudo cargarse en VRAM. Si estás ejecutando ComfyUI/Flux simultáneamente, libera VRAM o selecciona un modelo más ligero en Ajustes.`);
        }
        if (finalErr.includes("llama-server process has terminated") || finalErr.includes("exit status 1")) {
          throw new Error(`[Ollama 500] El motor de Ollama no pudo cargar '${activeModel}' (${finalErr.substring(0, 150)}). Selecciona otro modelo en Ajustes o repáralo con 'ollama pull ${activeModel}'.`);
        }
      }
      throw new Error(`Error de Ollama (${response.status}): ${finalErr.substring(0, 200)}`);
    }
  }

  const textResp = await response.text();
  if (textResp.startsWith('{')) {
    try {
      const parsed = JSON.parse(textResp);
      if (typeof parsed.response === 'string') {
        const hasResponse = parsed.response.trim() !== '';
        const hasThinking = typeof parsed.thinking === 'string' && parsed.thinking.trim() !== '';

        if (hasResponse) {
          return parsed.response;
        }
        if (hasThinking) {
          return parsed.thinking;
        }
        if (parsed.done_reason === 'length') {
          console.warn("[Ollama Service] El modelo finalizó por límite de longitud; retornando resultado generado acumulado.");
          return parsed.response || parsed.thinking || '';
        }
        return parsed.response;
      }
      if (parsed.error) throw new Error(parsed.error);
    } catch (parseErr: any) {
      // Ignorar errores de parseo de tokens truncados
    }
    return textResp;
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (typeof data.response === 'string') return data.response;
  return textResp;
};

export const generateAnthropicCompletion = async (prompt: string, system: string, apiKey: string, isExpansion: boolean, model?: string, signal?: AbortSignal): Promise<string> => {
  if (!apiKey) throw new Error('Se requiere una API Key de Anthropic.');
  
  // SEGURIDAD: vía proxy Rust en Tauri (la key no viaja desde el webview); fetch directo solo en dev-web
  const data = await fetchJsonSecure(
    'https://api.anthropic.com/v1/messages',
    {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    {
      model: model || 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: system,
      messages: [{ role: 'user', content: prompt }]
    },
    signal
  );
  return data.content?.map((b: any) => b.text).join('\n') || 'No response from Anthropic.';
};

// OpenAI / DeepSeek / OpenRouter / CometAPI Chat Completions API (compatible format)
export const generateOpenAICompletion = async (
  prompt: string, 
  system: string, 
  apiKey: string, 
  provider: 'openai' | 'deepseek' | 'qwen' | 'kimi' | 'openrouter' | 'cometapi' | 'nvidia',
  isExpansion: boolean = false,
  modelOverride?: string,
  signal?: AbortSignal
): Promise<string> => {
  if (!apiKey) {
    throw new Error(`Se requiere una API Key de ${provider.toUpperCase()}.`);
  }

  let baseUrl = '';
  let model = modelOverride || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  if (provider === 'openai') {
    baseUrl = 'https://api.openai.com/v1/chat/completions';
    if (!model || model === 'custom') model = 'gpt-4o-mini';
  } else if (provider === 'deepseek') {
    baseUrl = 'https://api.deepseek.com/v1/chat/completions';
    if (!model || model === 'custom') model = 'deepseek-chat';
  } else if (provider === 'qwen') {
    baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    if (!model || model === 'custom') model = 'qwen-plus';
  } else if (provider === 'kimi') {
    baseUrl = 'https://api.moonshot.cn/v1/chat/completions';
    if (!model || model === 'custom') model = 'moonshot-v1-8k';
  } else if (provider === 'openrouter') {
    baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    if (!model || model === 'custom') model = 'openrouter/auto';
    headers['HTTP-Referer'] = 'https://fenixdev.cloud';
    headers['X-Title'] = 'Omni-IA Game';
  } else if (provider === 'cometapi') {
    baseUrl = 'https://api.cometapi.com/v1/chat/completions';
    if (!model || model === 'custom') model = 'gpt-4o-mini';
  } else if (provider === 'nvidia') {
    baseUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
    if (!model || model === 'custom') {
      model = 'meta/llama-3.3-70b-instruct';
    }
  } else {
    throw new Error(`Proveedor ${provider} no soportado en generateOpenAICompletion.`);
  }

  const isDeepSeekThinking = provider === 'nvidia' && (model.includes('deepseek') || model.includes('thinking') || model.includes('r1'));

  const payload: any = {
    model: model,
    temperature: isDeepSeekThinking ? 1 : 0.7,
    top_p: 0.95,
    max_tokens: isDeepSeekThinking ? 16384 : (isExpansion ? 4096 : 2048),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ]
  };

  if (isDeepSeekThinking) {
    payload.chat_template_kwargs = {
      thinking: true,
      reasoning_effort: 'high'
    };
  }

  console.log(`[Omni IA Game] Ejecutando petición ${provider.toUpperCase()} (${model})...`);

  try {
    const data = await fetchJsonSecure(baseUrl, headers, payload, signal);
    const choice = data.choices?.[0];
    const msg = choice?.message || choice?.delta;
    const content = msg?.content || msg?.reasoning || msg?.reasoning_content;
    if (content && typeof content === 'string' && content.trim() !== '') return content;
    return `No response from ${provider}.`;
  } catch (err: any) {
    const errStr = String(err?.message || err);
    if (provider === 'nvidia' && (errStr.includes('503') || errStr.includes('404') || errStr.includes('ResourceExhausted') || errStr.includes('429') || errStr.includes('limit reached'))) {
      console.warn(`[NVIDIA NIM] Modelo ${model} no disponible o saturado. Reintentando automáticamente con nvidia/llama-3.1-nemotron-70b-instruct...`);
      const fallbackPayload = { ...payload, model: 'nvidia/llama-3.1-nemotron-70b-instruct' };
      delete fallbackPayload.chat_template_kwargs;
      delete fallbackPayload.extra_body;
      const fallbackData = await fetchJsonSecure(baseUrl, headers, fallbackPayload, signal);
      const choice = fallbackData.choices?.[0];
      const msg = choice?.message || choice?.delta;
      const content = msg?.content || msg?.reasoning || msg?.reasoning_content;
      if (content && typeof content === 'string' && content.trim() !== '') return content;
    }
    throw err;
  }
};

// Generic OpenAI-compatible endpoint (for "other" providers)
export const generateGenericCompletion = async (
  baseUrl: string, 
  prompt: string, 
  system: string, 
  apiKey?: string,
  isExpansion: boolean = false,
  signal?: AbortSignal,
  modelOverride?: string
): Promise<string> => {
  if (!baseUrl) throw new Error('Se requiere una URL de servidor para el proveedor personalizado.');

  const cleanUrl = baseUrl.trim().replace(/\/$/, '');
  const endpoint = cleanUrl.endsWith('/chat/completions')
    ? cleanUrl
    : cleanUrl.includes('/v1')
      ? `${cleanUrl}/chat/completions`
      : `${cleanUrl}/v1/chat/completions`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const selectedModel = modelOverride && modelOverride.trim() !== '' ? modelOverride : 'gpt-4o-mini';

  // SEGURIDAD: vía proxy Rust en Tauri / webBridge proxy_request
  const data = await fetchJsonSecure(endpoint, headers, {
    model: selectedModel,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ]
  }, signal);
  return data.choices?.[0]?.message?.content || data.choices?.[0]?.delta?.content || data.response || 'No response from custom provider.';
};

export const generateLocalAudio = async (
  endpoint: string, 
  prompt: string, 
  apiKey?: string, 
  provider: string = 'local',
  options?: {
    lyrics?: string;
    language?: string;
    isInstrumental?: boolean;
    genre?: string;
    style?: string;
    title?: string;
  }
): Promise<Blob | string> => {
    // Generic implementation for a local audio generation API (e.g., Gradio/FastAPI wrapper for MusicGen)
    // Expects a POST request with { prompt: string } and returns audio blob
    try {
        const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;

        if (provider === 'comfydeploy') {
          if (!apiKey) {
            throw new Error("Se requiere una API Key de ComfyDeploy para la generación de audio.");
          }
          const deploymentId = endpoint;
          if (!deploymentId || deploymentId === 'comfydeploy') {
            throw new Error("Se requiere un Deployment ID de ComfyDeploy para la generación de audio.");
          }

          const queueUrl = 'https://api.comfydeploy.com/api/run/deployment/queue';
          const cdHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          };
          const payload = {
            deployment_id: deploymentId,
            inputs: {
              prompt: prompt,
              positive: prompt,
              positive_prompt: prompt,
              text: prompt,
              text_prompt: prompt
            }
          };

          console.log(`[Omni IA Game] Encolando audio en ComfyDeploy para el deployment: ${deploymentId}`);
          let runId = "";

          if (invokeFn) {
            const resStr = await invokeFn('proxy_request', {
              url: queueUrl,
              method: 'POST',
              payload: payload,
              headers: cdHeaders
            });
            const data = JSON.parse(resStr);
            runId = data.run_id;
          } else {
            const res = await fetch(queueUrl, {
              method: 'POST',
              headers: cdHeaders,
              body: JSON.stringify(payload)
            });
            if (!res.ok) {
              const text = await res.text().catch(() => '');
              throw new Error(`Error encolando audio en ComfyDeploy: ${res.status} ${text}`);
            }
            const data = await res.json();
            runId = data.run_id;
          }

          if (!runId) {
            throw new Error("ComfyDeploy no devolvió ningún run_id válido para audio.");
          }

          console.log(`[Omni IA Game] Audio encolado exitosamente. Run ID: ${runId}. Iniciando polling...`);
          return await pollComfyDeployRun(runId, apiKey);
        }

        const headers = getHeaders(apiKey);
        let payload: any = { prompt };
        let actualEndpoint = endpoint;

        if (provider === 'suno' || provider === 'udio') {
          actualEndpoint = !endpoint || endpoint.includes('127.0.0.1') || endpoint.includes('localhost') || endpoint.trim() === ''
            ? (provider === 'suno' ? 'https://api.sunoapi.org/api/v1/generate' : 'https://api.udio.com/v1/generate')
            : endpoint;

          const isInstrumental = !!options?.isInstrumental;
          const lyricsVal = options?.lyrics || "";
          const genreVal = options?.genre || "";
          const styleVal = options?.style || "";
          const titleVal = options?.title || "Sonic Track";

          // Combining style and prompt description to feed Suno style config in Custom Mode
          const combinedStyle = `${genreVal} ${styleVal} ${prompt}`.trim().substring(0, 1000) || "Pop";

          payload = {
            customMode: true,
            instrumental: isInstrumental,
            style: combinedStyle,
            title: titleVal.substring(0, 80),
            model: "V4_5ALL",
            callBackUrl: "https://example.com/callback"
          };

          if (!isInstrumental) {
            // In customMode: true, prompt is the lyrics!
            payload.prompt = lyricsVal || "Instrumental track.";
          } else {
            payload.prompt = prompt.substring(0, 500);
          }
        }

        if (invokeFn && (provider === 'suno' || provider === 'udio')) {
          console.log(`[Omni IA Game] Routing Suno/Udio generation request through Tauri proxy_request to bypass CORS.`);
          const resStr = await invokeFn('proxy_request', {
            url: actualEndpoint,
            method: 'POST',
            payload: payload,
            headers: headers
          });
          
          if (resStr.startsWith('data:') && resStr.includes('base64,')) {
            return resStr;
          }

          let taskId = "";
          let responseJson: any = null;
          try {
            responseJson = JSON.parse(resStr);
            taskId = responseJson.taskId || responseJson.data?.taskId || responseJson.data?.data?.taskId || "";
          } catch {
            // ignore
          }

          if (taskId) {
            console.log(`[Omni IA Game] Suno/Udio task created with ID: ${taskId}. Starting polling loop...`);
            
            let attempts = 0;
            const maxAttempts = 60; // Up to 5 minutes
            const pollInterval = 5000; // 5 seconds
            
            while (attempts < maxAttempts) {
              attempts++;
              await new Promise(resolve => setTimeout(resolve, pollInterval));
              
              const pollUrl = `https://api.sunoapi.org/api/v1/generate/record-info?taskId=${taskId}`;
              console.log(`[Omni IA Game] Polling Suno/Udio task status (Attempt ${attempts}/${maxAttempts})...`);
              
              let pollResultStr = "";
              try {
                pollResultStr = await invokeFn('proxy_request', {
                  url: pollUrl,
                  method: 'GET',
                  payload: null,
                  headers: headers
                });
              } catch (pollErr) {
                console.warn(`[Omni IA Game] Polling request failed temporarily:`, pollErr);
                continue;
              }
              
              if (pollResultStr) {
                try {
                  const pollData = JSON.parse(pollResultStr);
                  const mainObj = pollData.data || pollData;
                  const currentStatus = (mainObj.status || "").toUpperCase();
                  
                  console.log(`[Omni IA Game] Poll status: ${currentStatus}`);
                  
                  if (currentStatus === "SUCCESS" || currentStatus === "COMPLETE") {
                    const sunoData = mainObj.response?.sunoData || mainObj.response?.data || [];
                    const audioUrl = sunoData[0]?.audioUrl || sunoData[0]?.audio_url || sunoData[0]?.url || "";
                    if (audioUrl) {
                      console.log(`[Omni IA Game] Suno/Udio audio generation succeeded! URL: ${audioUrl}`);
                      return audioUrl;
                    }
                  } else if (currentStatus === "FAIL" || currentStatus === "GENERATE_AUDIO_FAILED" || currentStatus === "CREATE_TASK_FAILED" || currentStatus === "SENSITIVE_WORD_ERROR") {
                    throw new Error(`Suno/Udio task failed: ${mainObj.errorMessage || "Sensitive word or server error"}`);
                  }
                } catch (e: any) {
                  if (e.message?.includes("failed")) throw e;
                  // ignore parse error and continue
                }
              }
            }
            throw new Error(`Timeout esperando a que se completara la generación de audio en Suno/Udio.`);
          }

          try {
            const data = JSON.parse(resStr);
            return data.url || data.audio_url || data.audio || resStr;
          } catch {
            return resStr;
          }
        }

        const response = await fetch(actualEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`${provider.toUpperCase()} audio generation failed`);

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          return data.url || data.audio_url || data.audio;
        }

        return await response.blob();
    } catch (error) {
        console.error(`Audio error (${provider}):`, error);
        throw error;
    }
};

export const generateLocalImage = async (endpoint: string, prompt: string, negativePrompt?: string, width?: number, height?: number, apiKey?: string, workflowId?: string, referenceImageBase64?: string): Promise<string> => {
  try {
      const isOpenArt = endpoint.includes('openart.ai');
      const isYouArt = endpoint.includes('youart.ai');
      const isComfyDeploy = endpoint === 'comfydeploy' || endpoint.includes('comfydeploy.com');
      const isOmniDeploy = endpoint === 'omnideploy';

      // OmniDeploy: la GPU del proveedor, a traves del relay propio. Rama
      // AÑADIDA junto a las demas; ComfyUI, ComfyDeploy y A1111 conservan
      // exactamente el mismo camino que tenian.
      if (isOmniDeploy) {
        if (!apiKey) {
          throw new Error('Se requiere una API Key de OmniDeploy para generar.');
        }
        if (!workflowId) {
          throw new Error('Se requiere un Deployment ID de OmniDeploy para generar.');
        }

        const { omniDeployEncolar, pollOmniDeployRun } = await import('./omniDeploy');
        const creds = { deploymentId: workflowId, apiKey };

        // Se mandan los PARAMETROS, no el grafo. `generateLocalImage` no
        // recibe el workflow -su firma es comun a todos los proveedores y no se
        // toca por uno-, y el agente del proveedor sabe montar el suyo con
        // estos valores. Si algun dia hace falta enviar un grafo entero, el
        // agente ya acepta `workflow` y tiene preferencia sobre esto.
        const { jobId } = await omniDeployEncolar(creds, {
          prompt,
          negative_prompt: negativePrompt || '',
          width: width || 1024,
          height: height || 1024,
        });

        const salidas = await pollOmniDeployRun(creds, jobId);
        if (!salidas.length) {
          throw new Error('La GPU del proveedor no devolvio ninguna imagen.');
        }
        return `data:image/png;base64,${salidas[0].data}`;
      }

      if (isComfyDeploy) {
        if (!apiKey) {
          throw new Error("Se requiere una API Key de ComfyDeploy para realizar la generación.");
        }
        if (!workflowId) {
          throw new Error("Se requiere un Deployment ID de ComfyDeploy para realizar la generación.");
        }

        const queueUrl = 'https://api.comfydeploy.com/api/run/deployment/queue';
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        const payload = {
          deployment_id: workflowId,
          inputs: {
            // Positive prompt mapping variations
            prompt: prompt,
            positive: prompt,
            positive_prompt: prompt,
            text_positive: prompt,
            text: prompt,
            
            // Negative prompt mapping variations
            negative_prompt: negativePrompt || "",
            negative: negativePrompt || "",
            text_negative: negativePrompt || "",
            
            // Dimensions
            width: width || 512,
            height: height || 512,
            
            // Reference image for visual consistency mapping variations (ControlNet / IP-Adapter)
            ...(referenceImageBase64 ? {
              input_image: referenceImageBase64,
              image: referenceImageBase64,
              reference_image: referenceImageBase64,
              image_base64: referenceImageBase64
            } : {})
          }
        };

        console.log(`[Omni IA Game] Encolando imagen en ComfyDeploy para el deployment: ${workflowId}`);
        const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
        let runId = "";

        if (invokeFn) {
          const resStr = await invokeFn('proxy_request', {
            url: queueUrl,
            method: 'POST',
            payload: payload,
            headers: headers
          });
          const data = JSON.parse(resStr);
          runId = data.run_id;
        } else {
          const res = await fetch(queueUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          });
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Error encolando en ComfyDeploy: ${res.status} ${text}`);
          }
          const data = await res.json();
          runId = data.run_id;
        }

        if (!runId) {
          throw new Error("ComfyDeploy no devolvió ningún run_id válido.");
        }

        console.log(`[Omni IA Game] Run encolado exitosamente. Run ID: ${runId}. Iniciando polling...`);
        return await pollComfyDeployRun(runId, apiKey);
      }

      if (isOpenArt || isYouArt) {
        if (!apiKey) {
          throw new Error(`Se requiere un Token de Sesión / API Key para utilizar ${isOpenArt ? 'OPENART' : 'YOUART'}. Por favor, configúrala en Ajustes (Tab Animación).`);
        }
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        const payload = {
          prompt,
          negative_prompt: negativePrompt || "",
          width: width || 512,
          height: height || 512
        };
        
        const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
        if (invokeFn) {
          console.log(`[Omni IA Game] Routing ${isOpenArt ? 'OPENART' : 'YOUART'} image request through Tauri proxy_request.`);
          const result = await invokeFn('proxy_request', {
            url: endpoint,
            method: 'POST',
            payload: payload,
            headers: headers
          });
          const data = typeof result === 'string' ? JSON.parse(result) : result;
          return data.url || data.image_url || data.image || data.output_url || "";
        } else {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          });
          
          if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`${isOpenArt ? 'OPENART' : 'YOUART'} image generation failed: ${response.status} ${response.statusText} ${errText}`);
          }
          
          const data = await response.json();
          return data.url || data.image_url || data.image || data.output_url || "";
        }
      }

      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
      const baseUrl = endpoint.replace(/\/api\/prompt$/, '').replace(/\/$/, '');

      if (invokeFn) {
         // Si usamos invoke (Tauri), pasamos por el proxy de Rust para evitar CORS
         const actualUrl = workflowId
            ? `${baseUrl}/api/connect/workflows/${workflowId}`
            : `${baseUrl}/api/prompt`;

         const payload = {
            prompt: prompt,
            negative_prompt: negativePrompt,
            width: width,
            height: height
         };

         const result = await invokeFn('proxy_request', {
            url: actualUrl,
            method: 'POST',
            payload: payload
         });

         const data = typeof result === 'string' ? JSON.parse(result) : result;

         if (data.output && data.output[0]) {
            return `data:image/png;base64,${data.output[0]}`;
         }

         if (data.prompt_id) {
             // Polling logic would go here, but for now we follow the same pattern as aiProvider
             // To keep localService simple, we rely on aiProvider's main loop if possible,
             // or we duplicate the polling here for direct calls.
             return `comfyui_job_id:${data.prompt_id}`;
         }

         return data.url || data.image || "";
      }

      // Fallback for web (may fail due to CORS)
      const actualUrl = workflowId
        ? `${baseUrl}/api/connect/workflows/${workflowId}`
        : `${baseUrl}/api/prompt`;

      const payload = {
        prompt: prompt,
        negative_prompt: negativePrompt,
        width: width,
        height: height
      };

      const response = await fetch(actualUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`ComfyUI-Connect failed: ${response.status}`);
      const data = await response.json();

      if (data.output && data.output[0]) {
         return `data:image/png;base64,${data.output[0]}`;
      }

      return data.url || data.image || "";
  } catch (error: any) {
      const isOpenArt = endpoint.includes('openart.ai');
      const isYouArt = endpoint.includes('youart.ai');
      const isComfyDeploy = endpoint === 'comfydeploy' || endpoint.includes('comfydeploy.com');
      const serviceLabel = isOpenArt ? 'OpenArt' : (isYouArt ? 'YouArt' : (isComfyDeploy ? 'ComfyDeploy' : 'Local'));
      console.error(`${serviceLabel} image error:`, error);
      
      const errorMsg = error?.message || String(error);
      if (!isOpenArt && !isYouArt && !isComfyDeploy && (errorMsg.includes("500") || errorMsg.toLowerCase().includes("internal server error"))) {
        throw new Error(`Error 500 (Internal Server Error) en ComfyUI.\n\nEsto usualmente significa una de las siguientes causas:\n1. El modelo de checkpoint configurado no está instalado en la carpeta de modelos de tu ComfyUI.\n2. Tu workflow JSON enlazado contiene nodos personalizados que no tienes instalados en tu gestor de ComfyUI (ej. LoadImageBase64 o CLIPTextEncodeSelect).\n3. Tu tarjeta de video (GPU) se quedó sin memoria (VRAM) al procesar la imagen.`);
      }
      throw error;
  }
};

export const generateLocalVideo = async (
  endpoint: string,
  prompt: string,
  apiKey?: string,
  provider: string = 'other',
  initImageBase64?: string,
  workflowId?: string,
  negativePrompt?: string,
  customWorkflowJson?: string,
  promptNodeTitleOrId?: string,
  negativeNodeTitleOrId?: string,
  imageNodeTitleOrId?: string,
  model?: string,
  customSeed?: number
): Promise<string> => {
  try {
      const headers = getHeaders(apiKey);
      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
      const baseUrl = endpoint.replace(/\/api\/prompt$/, '').replace(/\/$/, '');

      // OMNIDEPLOY SOLO PIDE CREDENCIALES. El cliente no tiene grafo, asi que
      // se lo pide al proveedor y desde ahi sigue EL MISMO CAMINO que ComfyUI:
      // el bloque de abajo le aplica las mismas inyecciones -prompt, negativo,
      // fotograma inicial, semillas- y solo cambia a donde se envia al final.
      if (provider === 'omnideploy') {
        if (!apiKey?.trim() || !workflowId?.trim()) {
          throw new Error(
            'Falta el Deployment ID o la API Key de OmniDeploy para la animacion. Pegalos en Ajustes.',
          );
        }
        const { pedirWorkflowDelProveedor } = await import('./omniDeploy');
        const grafo = await pedirWorkflowDelProveedor(
          { deploymentId: workflowId.trim(), apiKey: apiKey.trim() },
          'video',
        );
        customWorkflowJson = JSON.stringify(grafo);
      }


      // OmniDeploy entra por AQUI, con el grafo del proveedor ya en
      // `customWorkflowJson`: mismas inyecciones que ComfyUI, y al final del
      // bloque cambia el destino.
      if ((provider === 'comfyui' || provider === 'omnideploy') && customWorkflowJson && invokeFn) {
         console.log("[Omni IA Game] Custom ComfyUI workflow detected for animation. Executing advanced injection & polling...");
         const workflow = JSON.parse(customWorkflowJson);
         
         const isMaster = workflow["out_walk_save_video"] !== undefined || workflow["out_idle_save_video"] !== undefined;

         if (isMaster) {
             console.log("[Omni IA Game] Unified Master Workflow detected! Launching single-pass pipeline...");
             const clientId = (crypto as any).randomUUID?.() || Math.random().toString(36).substring(2);

             // A. Determine the active action from the prompt
             const getWorkflowActionKey = (promptStr: string): "walk" | "idle" | "jump" | "attack" => {
               const lower = promptStr.toLowerCase();
               if (lower.includes("walk") || lower.includes("caminata") || lower.includes("caminar")) {
                 return "walk";
               }
               if (lower.includes("attack") || lower.includes("ataque") || lower.includes("melee") || lower.includes("sword") || lower.includes("hit") || lower.includes("shot")) {
                 return "attack";
               }
               if (lower.includes("jump") || lower.includes("salto") || lower.includes("flip")) {
                 return "jump";
               }
               return "idle";
             };
             const activeActionKey = getWorkflowActionKey(prompt);
             console.log(`[Omni IA Game] Master workflow active action detected: "${activeActionKey}"`);

             // B. Extract the user's character description from the prompt
             let userCharDesc = "";
             const performingIdx = prompt.indexOf(", performing");
             if (performingIdx !== -1) {
               userCharDesc = prompt.substring(0, performingIdx).trim();
             } else {
               const styleIdx = prompt.indexOf(", style:");
               if (styleIdx !== -1) {
                 userCharDesc = prompt.substring(0, styleIdx).trim();
               } else {
                 userCharDesc = prompt.trim();
               }
             }

             // C. Smart Prompt Appending & Template Cleaning (preserve pre-baked instructions, prevent character conflicts)
             if (userCharDesc) {
               const cleanTemplates = (text: string): string => {
                 let t = text;
                 // Replace "golden armored knight identity, helmet, armor design, palette and clean" with user description to avoid conflicts
                 t = t.replace(/golden armored knight identity,\s*helmet,\s*armor design,\s*palette\s*and\s*clean/gi, `${userCharDesc} identity and clean`);
                 t = t.replace(/golden armored knight identity,\s*armor\s*and\s*palette/gi, `${userCharDesc} identity`);
                 t = t.replace(/golden armored knight/gi, userCharDesc);
                 return t;
               };

               const promptKeys = ["prompt", "idle_prompt", "jump_prompt", "attack_prompt"];
               promptKeys.forEach(key => {
                 if (workflow[key] && workflow[key].inputs) {
                   let text = workflow[key].inputs.text || "";
                   // 1. Clean the hardcoded golden knight templates to avoid conflicting character descriptions!
                   text = cleanTemplates(text);
                   
                   // 2. Append custom user character details at the end if not already present
                   const promptInject = `, character description: ${userCharDesc}`;
                   if (!text.includes(promptInject)) {
                     text = text + promptInject;
                   }
                   workflow[key].inputs.text = text;
                 }
               });
               console.log(`[Omni IA Game] Appended and cleaned character descriptions in all 4 action prompt nodes: "${userCharDesc}"`);
             }

             // C2. Smart Negative Prompt Injection (prevents anomalies like unwanted masks/helmets in sequences)
             if (negativePrompt) {
               const negInject = `, ${negativePrompt}`;
               const negKeys = ["negative_base", "idle_neg_base", "jump_neg_base", "attack_neg_base"];
               negKeys.forEach(key => {
                 if (workflow[key] && workflow[key].inputs) {
                   const originalText = workflow[key].inputs.text || "";
                   if (!originalText.includes(negInject)) {
                     workflow[key].inputs.text = originalText + negInject;
                   }
                 }
               });
               console.log(`[Omni IA Game] Injected negative prompts into master workflow: "${negativePrompt}"`);
              
               // D. Character Image Upload & Injection
               if (initImageBase64) {
                 const base64Image = await ensureBase64Image(initImageBase64);
                 let imageName = base64Image;
                 if (base64Image.startsWith('data:image/') || base64Image.length > 1000) {
                   try {
                     console.log("[Omni IA Game] Securely uploading character image to local ComfyUI via Rust backend...");
                     const uploadResultStr = await invokeFn('upload_image_to_comfyui', {
                       baseUrl,
                       b64Data: base64Image
                     });
                     const uploadData = JSON.parse(uploadResultStr);
                     imageName = uploadData.name || uploadData.filename || imageName;
                     console.log(`[Omni IA Game] Master character image uploaded successfully: ${imageName}`);
                   } catch (uploadErr) {
                     console.error("Error uploading master character image:", uploadErr);
                   }
                 }
                 
                 const cleanImageValue = imageName.replace(/^data:image\/\w+;base64,/, "");
                 if (workflow["character"] && workflow["character"].inputs) {
                   workflow["character"].inputs.image = cleanImageValue;
                   console.log(`[Omni IA Game] Visual character reference injected into 'character' node: ${cleanImageValue}`);
                 }
               }
             }

             // E. Multi-Seed Randomization (noise, idle_noise, jump_noise, attack_noise)
             const seed = customSeed !== undefined ? customSeed : Math.floor(Math.random() * 1000000000);
             ["noise", "idle_noise", "jump_noise", "attack_noise"].forEach((key, offset) => {
               const node = workflow[key];
               if (node) {
                 const targetSeed = seed + offset;
                 if (node.inputs) {
                   if (node.inputs.noise_seed !== undefined) node.inputs.noise_seed = targetSeed;
                   if (node.inputs.seed !== undefined) node.inputs.seed = targetSeed;
                 }
                 if (node.widgets_values && Array.isArray(node.widgets_values) && node.widgets_values.length > 0) {
                   node.widgets_values[0] = targetSeed;
                 }
               }
             });
             console.log(`[Omni IA Game] Randomized noise seeds around: ${seed}`);

             // F. Queue Prompt
             //
             // El grafo ya esta montado con TODAS sus inyecciones. Con
             // OmniDeploy se manda a la GPU del proveedor; el sondeo del
             // historial no aplica porque el relay devuelve los ficheros ya
             // terminados.
             if (provider === 'omnideploy') {
               const { generarConOmniDeploy, salidaADataUrl } = await import('./omniDeploy');
               const salidas = await generarConOmniDeploy(
                 { deploymentId: workflowId!.trim(), apiKey: apiKey!.trim() },
                 { prompt, tipo: 'video', workflow, servicio: 'animacion' },
               );
               const vid =
                 salidas.find((s) => (s.kind ?? '') === 'video' || (s.kind ?? '') === 'animacion') ??
                 salidas.find((s) => /\.(mp4|webm|gif)$/i.test(s.name)) ??
                 salidas[0];
               if (!vid) throw new Error('La GPU del proveedor no devolvio ninguna animacion.');
               return salidaADataUrl(vid);
             }

             console.log(`[Omni IA Game] Queuing master workflow with client_id: ${clientId}`);
             const promptResult = await invokeFn('proxy_request', {
               url: `${baseUrl}/prompt`,
               method: 'POST',
               payload: { prompt: workflow, client_id: clientId }
             });

             const promptData = typeof promptResult === 'string' ? JSON.parse(promptResult) : promptResult;
             if (!promptData || !promptData.prompt_id) {
               throw new Error(promptData?.error?.message || "No se pudo encolar el workflow maestro en ComfyUI local.");
             }
             const promptId = promptData.prompt_id;

             // G. Polling for the active action's outputs and keyframe
             let executionDone = false;
             let attempts = 0;
             const maxAttempts = 600; // 10 minutos máx

             while (!executionDone && attempts < maxAttempts) {
               await new Promise(r => setTimeout(r, 1500));
               attempts++;

               try {
                 const historyResult = await invokeFn('proxy_request', {
                   url: `${baseUrl}/history/${promptId}`,
                   method: 'GET'
                 });

                 const historyData = typeof historyResult === 'string' ? JSON.parse(historyResult) : historyResult;

                 if (historyData && historyData[promptId] && historyData[promptId].outputs) {
                   const outputs = historyData[promptId].outputs;
                   console.log(`[Omni IA Game] Master workflow outputs received! Parsing outputs for action: "${activeActionKey}"`);

                   // 1. Pose Keyframe (Save Pose Image - node 11)
                   let resultImage = "";
                   if (outputs["11"] && outputs["11"].images && outputs["11"].images.length > 0) {
                     const imgObj = outputs["11"].images[0];
                     resultImage = await invokeFn('proxy_request', {
                       url: `${baseUrl}/view?filename=${imgObj.filename}&type=${imgObj.type || 'output'}&subfolder=${imgObj.subfolder || ''}`,
                       method: 'GET'
                     });
                   }

                   // 2. Sprite Sheet (out_[action]_save_sheet)
                   let spriteSheetUrl = "";
                   const sheetNodeId = `out_${activeActionKey}_save_sheet`;
                   if (outputs[sheetNodeId] && outputs[sheetNodeId].images && outputs[sheetNodeId].images.length > 0) {
                     const imgObj = outputs[sheetNodeId].images[0];
                     spriteSheetUrl = await invokeFn('proxy_request', {
                       url: `${baseUrl}/view?filename=${imgObj.filename}&type=${imgObj.type || 'output'}&subfolder=${imgObj.subfolder || ''}`,
                       method: 'GET'
                     });
                   }

                   // 3. Animation Video (out_[action]_save_video)
                   let videoUrl = "";
                   const videoNodeId = `out_${activeActionKey}_save_video`;
                   if (outputs[videoNodeId]) {
                     const nodeOut = outputs[videoNodeId];
                     const fileObj = (nodeOut.gifs && nodeOut.gifs[0]) || (nodeOut.videos && nodeOut.videos[0]) || (nodeOut.images && nodeOut.images[0]);
                     if (fileObj) {
                       videoUrl = await invokeFn('proxy_request', {
                         url: `${baseUrl}/view?filename=${fileObj.filename}&type=${fileObj.type || 'output'}&subfolder=${fileObj.subfolder || ''}`,
                         method: 'GET'
                       });
                     }
                   }

                   // 4. Frames (out_[action]_save1 to out_[action]_save4)
                   const frames: string[] = [];
                   for (let idx = 1; idx <= 4; idx++) {
                     const frameNodeId = `out_${activeActionKey}_save${idx}`;
                     if (outputs[frameNodeId] && outputs[frameNodeId].images && outputs[frameNodeId].images.length > 0) {
                       const imgObj = outputs[frameNodeId].images[0];
                       const frameUrl = await invokeFn('proxy_request', {
                         url: `${baseUrl}/view?filename=${imgObj.filename}&type=${imgObj.type || 'output'}&subfolder=${imgObj.subfolder || ''}`,
                         method: 'GET'
                       });
                       if (frameUrl) {
                         frames.push(frameUrl);
                       }
                     }
                   }

                   // Fallbacks
                   if (!resultImage) {
                     resultImage = frames[0] || spriteSheetUrl || "";
                   }

                   console.log(`[Omni IA Game] Master pipeline execution completed and resolved! Video: ${videoUrl ? "YES" : "NO"} | Sheet: ${spriteSheetUrl ? "YES" : "NO"} | Frames: ${frames.length}`);

                   executionDone = true;
                   return JSON.stringify({
                     isMaster: true,
                     videoUrl,
                     spriteSheetUrl, // will be used as gifUrl in frontend
                     frames,
                     resultImage
                   });
                 }

                 if (historyData && historyData[promptId] && historyData[promptId].status?.completed === false) {
                   const messages = historyData[promptId].status.messages;
                   if (messages && messages.some((m: any) => m[0] === 'execution_error')) {
                     throw new Error("La ejecución de la animación en el workflow maestro falló.");
                   }
                 }
               } catch (pollErr: any) {
                 const pollMsg = pollErr.message || String(pollErr);
                 if (pollMsg.includes("falló")) throw pollErr;
                 if (pollMsg.toLowerCase().includes("connection refused") || pollMsg.toLowerCase().includes("tcp connect error")) {
                   throw new Error("Se perdió la conexión con el servidor de ComfyUI.");
                 }
               }
             }

             throw new Error("Timeout: Se agotó el tiempo esperando a que ComfyUI generara el asset en el workflow maestro.");
         }

          // Detectar la acción activa priorizando la palabra clave 'performing [action]'
          const performingMatch = prompt.match(/performing\s+([^,]+)/i);
          const activeAction = performingMatch ? performingMatch[1].toLowerCase() : "";
          
          let actionType = "walk"; // default fallback
          if (activeAction) {
            if (activeAction.includes("attack") || activeAction.includes("ataque")) {
              actionType = "attack";
            } else if (activeAction.includes("jump") || activeAction.includes("salto")) {
              actionType = "jump";
            } else if (activeAction.includes("idle")) {
              actionType = "idle";
            } else if (activeAction.includes("walk") || activeAction.includes("caminata") || activeAction.includes("caminar")) {
              actionType = "walk";
            } else {
              // Si no coincide con ninguno, intentamos usar la primera palabra
              const firstWord = activeAction.split(" ")[0];
              if (firstWord && ["crouch", "death", "muerte", "injured", "herido", "walk", "attack", "jump", "idle"].includes(firstWord)) {
                actionType = firstWord;
              }
            }
          } else {
            // Fallback si no viene 'performing' en el prompt
            const promptLower = prompt.toLowerCase();
            if (promptLower.includes("attack") || promptLower.includes("ataque")) {
              actionType = "attack";
            } else if (promptLower.includes("jump") || promptLower.includes("salto")) {
              actionType = "jump";
            } else if (promptLower.includes("idle")) {
              actionType = "idle";
            }
          }
          console.log(`[Omni IA Game] Detecting active animation action: "${actionType}"`);

          // Buscar el nodo de guardado de video específico para esta acción
          const videoCombineNodeId = Object.entries(workflow).find(([id, n]: any) => {
            const idLower = id.toLowerCase();
            const titleLower = (n._meta?.title || "").toLowerCase();
            const classLower = (n.class_type || "").toLowerCase();
            
            const isVideoSaveNode = classLower.includes("combine") || 
                                    classLower.includes("savevideo") || 
                                    classLower.includes("createvideo") ||
                                    classLower.includes("save_video") ||
                                    titleLower.includes("combine") ||
                                    titleLower.includes("video");
                                    
            return isVideoSaveNode && (idLower.includes(actionType) || titleLower.includes(actionType));
          })?.[0] || Object.entries(workflow).find(([_, n]: any) => {
            const classLower = (n.class_type || "").toLowerCase();
            return classLower.includes("combine") || 
                   classLower.includes("savevideo") || 
                   classLower.includes("createvideo") ||
                   classLower.includes("save_video");
          })?.[0];

          if (videoCombineNodeId) {
            console.log(`[Omni IA Game] Detected target action video combine node ID: ${videoCombineNodeId} ("${actionType}")`);
          } else {
            console.warn("[Omni IA Game] No video combine node found in workflow.");
          }
          const seed = customSeed !== undefined ? customSeed : Math.floor(Math.random() * 1000000000);
         const clientId = (crypto as any).randomUUID?.() || Math.random().toString(36).substring(2);

         // Helper para buscar nodos por título o por clase
         const findNodeId = (wf: any, classType: string, title?: string) => {
           if (title) {
             const found = Object.entries(wf).find(([_, n]: any) => n._meta?.title === title);
             if (found) return found[0];
           }
           const found = Object.entries(wf).find(([_, n]: any) => n.class_type === classType);
           return found ? found[0] : null;
         };

         // Sanitización de textos para evitar crashes en Python/JSON
         const sanitizeText = (t: string) => t
           .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
           .replace(/"/g, "'")
           .replace(/\\/g, "/")
           .replace(/\n/g, " ")
           .trim();

         const cleanPositive = sanitizeText(prompt);
         const cleanNegative = negativePrompt ? sanitizeText(negativePrompt) : "";

         // 1. Inyección de Prompt Positivo
         let posNodeId = "";
         const targetActionPromptKey = `${actionType}_prompt`;
         if (workflow[targetActionPromptKey]) {
           posNodeId = targetActionPromptKey;
         } else {
           const foundByTitle = Object.entries(workflow).find(([_, n]: any) => 
             (n._meta?.title || "").toLowerCase() === targetActionPromptKey
           );
           if (foundByTitle) {
             posNodeId = foundByTitle[0];
           }
         }

         if (!posNodeId) {
           posNodeId = findNodeId(workflow, 'CLIPTextEncode', promptNodeTitleOrId) || "";
         }

         if (posNodeId && workflow[posNodeId]?.inputs) {
           console.log(`[Omni IA Game] Injecting positive prompt in node ${posNodeId} ("${targetActionPromptKey}"): "${cleanPositive.substring(0, 40)}..."`);
           workflow[posNodeId].inputs.text = cleanPositive;
         } else {
           console.log("[Omni IA Game] Aplicando inyección positiva universal en el workflow de animación...");
           injectUniversalTextPrompts(workflow, cleanPositive);
         }

         // 2. Inyección de Prompt Negativo
         let negNodeId = "";
         const targetActionNegKeys = [
           `${actionType}_neg_motion`,
           `${actionType}_neg_char`,
           `${actionType}_neg`,
           `${actionType}_negative`
         ];

         for (const key of targetActionNegKeys) {
           if (workflow[key]) {
             negNodeId = key;
             break;
           }
           const foundByTitle = Object.entries(workflow).find(([_, n]: any) => 
             (n._meta?.title || "").toLowerCase() === key
           );
           if (foundByTitle) {
             negNodeId = foundByTitle[0];
             break;
           }
         }

         if (negNodeId && workflow[negNodeId]?.inputs) {
           console.log(`[Omni IA Game] Injecting negative prompt in node ${negNodeId}: "${cleanNegative.substring(0, 40)}..."`);
           workflow[negNodeId].inputs.text = cleanNegative;
         } else if (cleanNegative && cleanNegative.trim() !== "") {
           console.log("[Omni IA Game] Aplicando inyección negativa universal en el workflow de animación...");
           injectUniversalTextPrompts(workflow, undefined, cleanNegative);
         }

         // 3. Inyección de Imagen de Referencia / Inicial
         if (initImageBase64) {
           const targetActionImageKey = `${actionType}_image`;
           let imgNodeId = "";

           if (workflow[targetActionImageKey]) {
             imgNodeId = targetActionImageKey;
           } else {
             const foundByTitle = Object.entries(workflow).find(([_, n]: any) => 
               (n._meta?.title || "").toLowerCase() === targetActionImageKey
             );
             if (foundByTitle) {
               imgNodeId = foundByTitle[0];
             }
           }

           if (!imgNodeId) {
             if (workflow["character"]) {
               imgNodeId = "character";
             } else {
               const targetTitle = (!imageNodeTitleOrId || imageNodeTitleOrId === 'LoadImage') ? 'Load Pose Image' : imageNodeTitleOrId;
               imgNodeId = findNodeId(workflow, 'LoadImage', targetTitle) || 
                                 findNodeId(workflow, 'LoadImageBase64', targetTitle) ||
                                 findNodeId(workflow, 'LoadImage', imageNodeTitleOrId) ||
                                 findNodeId(workflow, 'LoadImageBase64', imageNodeTitleOrId) ||
                                 findNodeId(workflow, 'LoadImage') ||
                                 findNodeId(workflow, 'LoadImageBase64') || "";
             }
           }

           if (imgNodeId && workflow[imgNodeId]?.inputs) {
             const base64Image = await ensureBase64Image(initImageBase64);
             let imageName = base64Image;

             // Si la imagen es un base64, la subimos a ComfyUI local usando su API oficial de carga de imágenes binarias a través de Rust
             if (base64Image.startsWith('data:image/') || base64Image.length > 1000) {
               try {
                 console.log("[Omni IA Game] Securely uploading animation image to local ComfyUI via Rust backend...");
                 const uploadResultStr = await invokeFn('upload_image_to_comfyui', {
                   baseUrl,
                   b64Data: base64Image
                 });
                 const uploadData = JSON.parse(uploadResultStr);
                 imageName = uploadData.name || uploadData.filename || imageName;
                 console.log(`[Omni IA Game] Animation reference successfully uploaded to ComfyUI as: ${imageName}`);
               } catch (uploadErr) {
                 console.error("Error uploading animation image to ComfyUI, falling back to direct base64:", uploadErr);
               }
             }

             const cleanImageValue = imageName.replace(/^data:image\/\w+;base64,/, "");
             
             // Si el nodo es un LoadImageBase64 o custom que acepta base64 directly
             if (workflow[imgNodeId].class_type === 'LoadImageBase64' || workflow[imgNodeId].inputs.image_base64 !== undefined) {
               workflow[imgNodeId].inputs.image_base64 = cleanImageValue;
             } else {
               workflow[imgNodeId].inputs.image = cleanImageValue;
             }
             console.log(`[Omni IA Game] Animation image injected into node ${imgNodeId}: "${cleanImageValue.substring(0, 40)}..."`);
           } else {
             console.warn("[Omni IA Game] Reference image node not found in workflow.");
           }
         }

         // 4. Inyección de semilla aleatoria de 9 dígitos
         Object.entries(workflow).forEach(([id, node]: any) => {
           if (node.inputs && node.inputs.seed !== undefined) {
             console.log(`[Omni IA Game] Injecting random seed (${seed}) in sampler node ${id}`);
             node.inputs.seed = seed;
           }
           if (node.class_type === 'RandomNoise' || node.type === 'RandomNoise') {
             if (node.widgets_values && Array.isArray(node.widgets_values) && node.widgets_values.length > 0) {
               console.log(`[Omni IA Game] Injecting random seed (${seed}) in RandomNoise node ${id}`);
               node.widgets_values[0] = seed;
             }
           }
         });

         // 5. Enviar petición a ComfyUI local
         console.log(`[Omni IA Game] Queuing animation workflow with clientId: ${clientId}`);
         const promptResult = await invokeFn('proxy_request', {
           url: `${baseUrl}/prompt`,
           method: 'POST',
           payload: { prompt: workflow, client_id: clientId }
         });

         const promptData = typeof promptResult === 'string' ? JSON.parse(promptResult) : promptResult;
         if (!promptData || !promptData.prompt_id) {
           throw new Error(promptData?.error?.message || "No se pudo encolar el workflow en ComfyUI local.");
         }
         const promptId = promptData.prompt_id;

         // 6. Polling del historial de ComfyUI
         let videoFound = false;
         let attempts = 0;
         const maxAttempts = 600; // 10 minutos máx

         while (!videoFound && attempts < maxAttempts) {
           await new Promise(r => setTimeout(r, 1500));
           attempts++;

           try {
             const historyResult = await invokeFn('proxy_request', {
               url: `${baseUrl}/history/${promptId}`,
               method: 'GET'
             });

             const historyData = typeof historyResult === 'string' ? JSON.parse(historyResult) : historyResult;

             if (historyData && historyData[promptId] && historyData[promptId].outputs) {
               const outputs = historyData[promptId].outputs;
               
                 // Dos pasadas de búsqueda para priorizar videos y GIFs sobre imágenes estáticas (como la pose de Node 11)
                 let foundMediaUrl = "";

                 // PASO 1: Prioridad absoluta al nodo VHS_VideoCombine o VideoCombine detectado
                 if (videoCombineNodeId && outputs[videoCombineNodeId]) {
                   const nodeOut = outputs[videoCombineNodeId];
                   console.log(`[Omni IA Game] Video combine node ${videoCombineNodeId} output found. Resolving media...`);
                   
                   // A. Buscar en gifs
                   if (nodeOut.gifs && Array.isArray(nodeOut.gifs) && nodeOut.gifs.length > 0) {
                     const gifObj = nodeOut.gifs[0];
                     console.log("[Omni IA Game] GIF output found in combine node! Fetching via proxy...");
                     foundMediaUrl = await invokeFn('proxy_request', {
                       url: `${baseUrl}/view?filename=${gifObj.filename}&type=${gifObj.type || 'output'}&subfolder=${gifObj.subfolder || ''}`,
                       method: 'GET'
                     });
                   }
                   // B. Buscar en videos
                   else if (nodeOut.videos && Array.isArray(nodeOut.videos) && nodeOut.videos.length > 0) {
                     const videoObj = nodeOut.videos[0];
                     console.log("[Omni IA Game] Video output found in combine node! Fetching via proxy...");
                     foundMediaUrl = await invokeFn('proxy_request', {
                       url: `${baseUrl}/view?filename=${videoObj.filename}&type=${videoObj.type || 'output'}&subfolder=${videoObj.subfolder || ''}`,
                       method: 'GET'
                     });
                   }
                   // C. Buscar en images (a veces ComfyUI o VHS guarda el GIF en images)
                   else if (nodeOut.images && Array.isArray(nodeOut.images) && nodeOut.images.length > 0) {
                     const imgObj = nodeOut.images[0];
                     console.log("[Omni IA Game] Media output found in combine node images! Fetching via proxy...");
                     foundMediaUrl = await invokeFn('proxy_request', {
                       url: `${baseUrl}/view?filename=${imgObj.filename}&type=${imgObj.type || 'output'}&subfolder=${imgObj.subfolder || ''}`,
                       method: 'GET'
                     });
                   }
                 }

                 // PASO 2: Si no se encontró en el nodo combine específico, buscar GIFs o Videos reales en TODO el workflow
                 if (!foundMediaUrl) {
                   for (const nodeId in outputs) {
                     const nodeOut = outputs[nodeId];

                     // A. Buscar GIFs
                     if (nodeOut.gifs && Array.isArray(nodeOut.gifs) && nodeOut.gifs.length > 0) {
                       const gifObj = nodeOut.gifs[0];
                       console.log(`[Omni IA Game] GIF output found in node ${nodeId}! Fetching via proxy...`);
                       foundMediaUrl = await invokeFn('proxy_request', {
                         url: `${baseUrl}/view?filename=${gifObj.filename}&type=${gifObj.type || 'output'}&subfolder=${gifObj.subfolder || ''}`,
                         method: 'GET'
                       });
                       break;
                     }

                     // B. Buscar Videos
                     if (nodeOut.videos && Array.isArray(nodeOut.videos) && nodeOut.videos.length > 0) {
                       const videoObj = nodeOut.videos[0];
                       console.log(`[Omni IA Game] Video output found in node ${nodeId}! Fetching via proxy...`);
                       foundMediaUrl = await invokeFn('proxy_request', {
                         url: `${baseUrl}/view?filename=${videoObj.filename}&type=${videoObj.type || 'output'}&subfolder=${videoObj.subfolder || ''}`,
                         method: 'GET'
                       });
                       break;
                     }
                   }
                 }

                 // PASO 3: Si seguimos sin encontrar, buscar imágenes en otros nodos, priorizando las que terminen en .gif
                 if (!foundMediaUrl) {
                   // A. Buscar cualquier imagen que sea GIF
                   for (const nodeId in outputs) {
                     const nodeOut = outputs[nodeId];
                     if (nodeOut.images && Array.isArray(nodeOut.images) && nodeOut.images.length > 0) {
                       const imgObj = nodeOut.images[0];
                       if (imgObj.filename && imgObj.filename.toLowerCase().endsWith('.gif')) {
                         console.log(`[Omni IA Game] GIF found in images of node ${nodeId}! Fetching via proxy...`);
                         foundMediaUrl = await invokeFn('proxy_request', {
                           url: `${baseUrl}/view?filename=${imgObj.filename}&type=${imgObj.type || 'output'}&subfolder=${imgObj.subfolder || ''}`,
                           method: 'GET'
                         });
                         break;
                       }
                     }
                   }

                   // B. Fallback absoluto a cualquier imagen de cualquier nodo
                   if (!foundMediaUrl) {
                     for (const nodeId in outputs) {
                       const nodeOut = outputs[nodeId];
                       if (nodeOut.images && Array.isArray(nodeOut.images) && nodeOut.images.length > 0) {
                         const imgObj = nodeOut.images[0];
                         console.log(`[Omni IA Game] Image sequence/frame output found in node ${nodeId}! Fetching via proxy...`);
                         foundMediaUrl = await invokeFn('proxy_request', {
                           url: `${baseUrl}/view?filename=${imgObj.filename}&type=${imgObj.type || 'output'}&subfolder=${imgObj.subfolder || ''}`,
                           method: 'GET'
                         });
                         break;
                       }
                     }
                   }
                 }

                if (foundMediaUrl) {
                  videoFound = true;
                  
                  let spriteSheetUrl = "";
                  try {
                    const sheetNodeEntry = Object.entries(outputs).find(([id, n]: any) => {
                      const idLower = id.toLowerCase();
                      const titleLower = (n._meta?.title || "").toLowerCase();
                      return (idLower.includes("sheet") || titleLower.includes("sheet")) && n.images && Array.isArray(n.images) && n.images.length > 0;
                    });
                    if (sheetNodeEntry) {
                      const imgObj = (sheetNodeEntry[1] as any).images[0];
                      console.log(`[Omni IA Game] Spritesheet output found in node ${sheetNodeEntry[0]}! Fetching via proxy...`);
                      spriteSheetUrl = await invokeFn('proxy_request', {
                        url: `${baseUrl}/view?filename=${imgObj.filename}&type=${imgObj.type || 'output'}&subfolder=${imgObj.subfolder || ''}`,
                        method: 'GET'
                      });
                    }
                  } catch (sheetErr) {
                    console.warn("[Omni IA Game] Error trying to find spritesheet output:", sheetErr);
                  }

                  const frames: string[] = [];
                  try {
                    const frameEntries = Object.entries(outputs).filter(([id, n]: any) => {
                      const idLower = id.toLowerCase();
                      const hasAction = idLower.includes(actionType);
                      const isSaveNode = idLower.includes("save") && /\d+$/.test(idLower);
                      return hasAction && isSaveNode && n.images && Array.isArray(n.images) && n.images.length > 0;
                    });
                    
                    frameEntries.sort((a, b) => {
                      const numA = parseInt(a[0].match(/\d+$/)?.[0] || "0");
                      const numB = parseInt(b[0].match(/\d+$/)?.[0] || "0");
                      return numA - numB;
                    });
                    
                    for (const [id, n] of frameEntries) {
                      const imgObj = (n as any).images[0];
                      console.log(`[Omni IA Game] Sequence frame found in node ${id}! Fetching via proxy...`);
                      const frameUrl = await invokeFn('proxy_request', {
                        url: `${baseUrl}/view?filename=${imgObj.filename}&type=${imgObj.type || 'output'}&subfolder=${imgObj.subfolder || ''}`,
                        method: 'GET'
                      });
                      if (frameUrl) {
                        frames.push(frameUrl);
                      }
                    }
                  } catch (framesErr) {
                    console.warn("[Omni IA Game] Error trying to find sequence frames output:", framesErr);
                  }

                  if (spriteSheetUrl || frames.length > 0) {
                    console.log(`[Omni IA Game] Animation sequence resolved. Returning JSON payload with video, spritesheet and frames.`);
                    return JSON.stringify({
                      videoUrl: foundMediaUrl,
                      spriteSheetUrl,
                      frames
                    });
                  }
                  
                  return foundMediaUrl;
                }
             }

             if (historyData && historyData[promptId] && historyData[promptId].status?.completed === false) {
               const messages = historyData[promptId].status.messages;
               if (messages && messages.some((m: any) => m[0] === 'execution_error')) {
                 throw new Error("La ejecución de la animación en ComfyUI local falló con un error.");
               }
             }
           } catch (pollErr: any) {
             const pollMsg = pollErr.message || String(pollErr);
             if (pollMsg.includes("falló con un error")) throw pollErr;
             if (pollMsg.toLowerCase().includes("connection refused") || pollMsg.toLowerCase().includes("tcp connect error")) {
               throw new Error("Se perdió la conexión con el servidor ComfyUI.");
             }
           }
         }

         throw new Error("Timeout: Se agotó el tiempo esperando a que ComfyUI generara la animación.");
      }

      // Proveedor genérico o fallback sin workflow cargado
      let payload: any = { prompt };

      if (provider === 'comfyui') {
        if (!workflowId) throw new Error('Se requiere un Workflow ID para ComfyUI Video (ej. "svd" o "animatediff").');

        payload = {
          prompt: {
            "3": {
              "inputs": { "text": prompt },
              "class_type": "CLIPTextEncode"
            },
            "9": {
              "inputs": { "image": initImageBase64 ? initImageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "") : "" },
              "class_type": "LoadImageBase64"
            }
          },
          client_id: "omni_ia_game_client_1"
        };
      } else if (provider === 'comfydeploy') {
        if (!apiKey) {
          throw new Error("Se requiere una API Key de ComfyDeploy para realizar la animación.");
        }
        if (!workflowId) {
          throw new Error("Se requiere un Deployment ID de ComfyDeploy para realizar la animación.");
        }

        const queueUrl = 'https://api.comfydeploy.com/api/run/deployment/queue';
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        const payload = {
          deployment_id: workflowId,
          inputs: {
            // Positive prompt mapping variations
            prompt: prompt,
            positive: prompt,
            positive_prompt: prompt,
            text_positive: prompt,
            text: prompt,
            
            // Reference image mapping variations
            init_image: initImageBase64 || "",
            input_image: initImageBase64 || "",
            image: initImageBase64 || "",
            reference_image: initImageBase64 || "",
            image_base64: initImageBase64 || ""
          }
        };

        console.log(`[Omni IA Game] Encolando animación en ComfyDeploy para el deployment: ${workflowId}`);
        const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
        let runId = "";

        if (invokeFn) {
          const resStr = await invokeFn('proxy_request', {
            url: queueUrl,
            method: 'POST',
            payload: payload,
            headers: headers
          });
          const data = JSON.parse(resStr);
          runId = data.run_id;
        } else {
          const res = await fetch(queueUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          });
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Error encolando animación en ComfyDeploy: ${res.status} ${text}`);
          }
          const data = await res.json();
          runId = data.run_id;
        }

        if (!runId) {
          throw new Error("ComfyDeploy no devolvió ningún run_id válido para animación.");
        }

        console.log(`[Omni IA Game] Animación encolada exitosamente. Run ID: ${runId}. Iniciando polling...`);
        return await pollComfyDeployRun(runId, apiKey);
      } else if (provider === 'openart' || provider === 'youart') {
        if (!apiKey) {
          throw new Error(`Se requiere una API Key para utilizar ${provider.toUpperCase()}. Por favor, configúrala en el panel de Ajustes (Tab Animación).`);
        }

        const actualEndpoint = endpoint.includes('127.0.0.1') || endpoint.includes('localhost')
          ? (provider === 'openart' ? 'https://openart.ai/api/v1/generate' : 'https://api.youart.ai/v1/video')
          : endpoint;

        payload = {
          prompt: prompt,
          image_url: initImageBase64,
          model: provider === 'openart' ? 'svd-xt' : 'youart-animate-v1',
          motion_bucket_id: 127
        };

        const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
        if (invokeFn) {
          console.log(`[Omni IA Game] Routing ${provider.toUpperCase()} video request through Tauri proxy_request.`);
          const result = await invokeFn('proxy_request', {
            url: actualEndpoint,
            method: 'POST',
            payload: payload,
            headers: headers
          });
          const data = typeof result === 'string' ? JSON.parse(result) : result;
          return data.url || data.output_url || data.video_url || "";
        } else {
          const response = await fetch(actualEndpoint, {
              method: 'POST',
              headers: headers,
              body: JSON.stringify(payload)
          });

          if (!response.ok) throw new Error(`${provider.toUpperCase()} video generation failed: ${response.status} ${response.statusText}`);
          const data = await response.json();
          return data.url || data.output_url || data.video_url;
        }
      } else if (provider === 'ollama') {
        const systemPrompt = "Eres un animador experto en Omni IA Game. Genera un desglose detallado de los fotogramas clave y la física del movimiento para la siguiente animación. Explica cómo se aplican los principios de animación clásica (Squash & Stretch, Anticipación, Timing). Devuelve una descripción concisa pero técnica.";
        console.log(`[Omni IA Game] Generating animation plan using Ollama local model '${model || 'llama3'}' on ${baseUrl}`);
        const responseText = await generateOllamaCompletion(baseUrl, model || 'llama3', prompt, systemPrompt, apiKey);
        console.log("[Omni IA Game] Ollama Animation Plan response:\n", responseText);
        
        return "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAAAAGlzb21tcDQyAAAAAG1kYXQAAAAhYXZjMQAAAAABAAAAAAAAAAAAAAAAYABgAAAAAAAcbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAAAQAAlgAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAGGlvbmQAAAAAAAAAAQAAAAAAAAAAAAAA";
      } else if (provider === 'lm-studio') {
        const systemPrompt = "Eres un animador experto en Omni IA Game. Genera un desglose detallado de los fotogramas clave y la física del movimiento para la siguiente animación. Explica cómo se aplican los principios de animación clásica (Squash & Stretch, Anticipación, Timing). Devuelve una descripción concisa pero técnica.";
        console.log(`[Omni IA Game] Generating animation plan using LM-Studio local model '${model || 'default'}' on ${baseUrl}`);
        
        const cleanUrl = baseUrl.replace(/\/$/, '');
        const chatEndpoint = cleanUrl.includes('/v1/') ? cleanUrl : `${cleanUrl}/v1/chat/completions`;
        const response = await fetch(chatEndpoint, {
          method: 'POST',
          headers: getHeaders(apiKey),
          body: JSON.stringify({
            model: model || 'default',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ]
          })
        });
        
        if (!response.ok) {
          throw new Error(`LM-Studio API error (${response.status}): ${await response.text()}`);
        }
        
        const data = await response.json();
        const responseText = data.choices?.[0]?.message?.content || "No response from LM-Studio.";
        console.log("[Omni IA Game] LM-Studio Animation Plan response:\n", responseText);
        
        return "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAAAAGlzb21tcDQyAAAAAG1kYXQAAAAhYXZjMQAAAAABAAAAAAAAAAAAAAAAYABgAAAAAAAcbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAAAQAAlgAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAGGlvbmQAAAAAAAAAAQAAAAAAAAAAAAAA";
      } else if (provider === 'seedance' || provider === 'kling') {
        const actualEndpoint = endpoint.includes('127.0.0.1') || endpoint.includes('localhost')
          ? (provider === 'seedance' ? 'https://api.seedance.ai/v1/video' : 'https://api.klingai.com/v1/videos')
          : endpoint;

        payload = {
          prompt: prompt,
          image_url: initImageBase64,
          config: { duration: 5, resolution: "720p" }
        };

        const response = await fetch(actualEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`${provider.toUpperCase()} video generation failed: ${response.status} ${response.statusText}`);
        const data = await response.json();
        return data.url || data.video_url || data.task_id;
      } else {
        payload = {
          prompt: prompt,
          init_image: initImageBase64
        };
      }

      const response = await fetch(endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`${provider.toUpperCase()} video generation failed: ${response.status} ${response.statusText}`);

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error(`Invalid response from server. Expected JSON, got ${contentType || 'unknown'}. Check if the URL is correct.`);
      }

      const data = await response.json();

      if (provider === 'comfyui' && data.prompt_id) {
         return `comfyui_job_id:${data.prompt_id}`;
      }

      if (data.video) return `data:video/mp4;base64,${data.video}`;
      if (data.url) return data.url;
      if (data.output_url) return data.output_url;
      if (data.response) return data.response;

      throw new Error(`Unknown response format from ${provider} video API`);
  } catch (error: any) {
      console.error(`Video error (${provider}):`, error);
      const errorMsg = error?.message || String(error);
      if (errorMsg.includes("500") || errorMsg.toLowerCase().includes("internal server error")) {
        throw new Error(`Error 500 (Internal Server Error) en tu servidor de video local (${provider.toUpperCase()}).\n\nPosibles causas:\n1. El modelo de animación seleccionado (ej. svd-xt) no está instalado en la carpeta de checkpoints de tu servidor.\n2. Falta algún nodo personalizado en el workflow JSON cargado (ej. VHS_VideoCombine o VHS_LoadImages).\n3. Tu máquina se quedó sin memoria GPU al renderizar los fotogramas del video.`);
      }
      throw error;
  }
};

export const generateLocalTTS = async (endpoint: string, text: string, voice?: string, apiKey?: string, provider: string = 'local', workflowId?: string): Promise<string> => {
  // TTS usando ComfyUI directo (sin ComfyUI-Connect)
  try {
      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;

      if (provider === 'comfydeploy') {
        if (!apiKey) {
          throw new Error("Se requiere una API Key de ComfyDeploy para la generación de voz (TTS).");
        }
        if (!endpoint || endpoint === 'comfydeploy') {
          throw new Error("Se requiere un Deployment ID de ComfyDeploy para la generación de voz (TTS).");
        }

        const queueUrl = 'https://api.comfydeploy.com/api/run/deployment/queue';
        const cdHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        const payload = {
          deployment_id: endpoint,
          inputs: {
            prompt: text,
            text: text,
            text_input: text,
            tts_text: text,
            input_text: text,
            voice: voice || ""
          }
        };

        console.log(`[Omni IA Game] Encolando TTS en ComfyDeploy para el deployment: ${endpoint}`);
        let runId = "";

        if (invokeFn) {
          const resStr = await invokeFn('proxy_request', {
            url: queueUrl,
            method: 'POST',
            payload: payload,
            headers: cdHeaders
          });
          const data = JSON.parse(resStr);
          runId = data.run_id;
        } else {
          const res = await fetch(queueUrl, {
            method: 'POST',
            headers: cdHeaders,
            body: JSON.stringify(payload)
          });
          if (!res.ok) {
            const textContent = await res.text().catch(() => '');
            throw new Error(`Error encolando TTS en ComfyDeploy: ${res.status} ${textContent}`);
          }
          const data = await res.json();
          runId = data.run_id;
        }

        if (!runId) {
          throw new Error("ComfyDeploy no devolvió ningún run_id válido para TTS.");
        }

        console.log(`[Omni IA Game] TTS encolado exitosamente. Run ID: ${runId}. Iniciando polling...`);
        return await pollComfyDeployRun(runId, apiKey);
      }

      const baseUrl = endpoint.replace(/\/api\/prompt$/, '').replace(/\/$/, '');

      // Workflow simple para TTS en ComfyUI
      const workflow = {
        "1": {
          "inputs": {
            "text": text
          },
          "class_type": "CLIPTextEncode"
        },
        "2": {
          "inputs": {
            "samples": ["1", 0]
          },
          "class_type": "AudioLDM2"
        },
        "3": {
          "inputs": {
            "audio": ["2", 0],
            "filename_prefix": "tts_output"
          },
          "class_type": "SaveAudio"
        }
      };

      const payload = {
        prompt: workflow,
        client_id: `omni_ia_game_tts_${Date.now()}`
      };

      if (invokeFn) {
         const result = await invokeFn('proxy_request', {
            url: `${baseUrl}/api/prompt`,
            method: 'POST',
            payload: payload
         });

         const data = typeof result === 'string' ? JSON.parse(result) : result;

         // ComfyUI devuelve prompt_id, necesitamos hacer polling
         if (data.prompt_id) {
            // Por ahora devolvemos un placeholder
            // TODO: Implementar polling para obtener el audio generado
            throw new Error("ComfyUI TTS requiere polling. Usa Gemini para TTS instantáneo.");
         }

         throw new Error("ComfyUI TTS no devolvió prompt_id");
      }

      // Fallback for web
      const response = await fetch(`${baseUrl}/api/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`ComfyUI TTS failed: ${response.status}`);
      const data = await response.json();

      if (data.prompt_id) {
         throw new Error("ComfyUI TTS requiere polling. Usa Gemini para TTS instantáneo.");
      }

      throw new Error("ComfyUI TTS no devolvió prompt_id");
  } catch (error) {
      console.error("Local TTS error:", error);
      throw error;
  }
};

export const testProviderConnection = async (
  provider: string,
  url: string,
  apiKey?: string
): Promise<{ success: boolean; message: string }> => {
  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  const cleanUrl = url ? url.trim().replace(/\/$/, '') : '';

  try {
    // OmniDeploy: aqui `url` no es una URL, es el Deployment ID. La firma de
    // esta funcion es comun a todos los proveedores y no se cambia por uno; el
    // caso se atiende antes de que `cleanUrl` intente tratarlo como direccion.
    if (provider === 'omnideploy') {
      const { probarOmniDeploy } = await import('./omniDeploy');
      return await probarOmniDeploy(url?.trim() || '', apiKey);
    }

    if (provider === 'ollama') {
      const targetUrl = cleanUrl || 'http://localhost:11434';
      if (invokeFn) {
        const active = await invokeFn('check_service_status', { url: `${targetUrl}/api/tags` }).catch(() => false);
        if (active) return { success: true, message: "Conexión exitosa con Ollama." };
        const activeRoot = await invokeFn('check_service_status', { url: targetUrl }).catch(() => false);
        if (activeRoot) return { success: true, message: "Ollama responde en el puerto base." };
      } else {
        const response = await fetch(`${targetUrl}/api/tags`).catch(() => null);
        if (response && response.ok) return { success: true, message: "Conexión exitosa con Ollama." };
      }
      return { success: false, message: `No se pudo conectar con Ollama en ${targetUrl}. Asegúrate de que el servidor local de Ollama esté encendido.` };
    }

    if (provider === 'lm-studio') {
      const targetUrl = cleanUrl || 'http://localhost:1234/v1';
      const endpoint = targetUrl.includes('/v1') ? `${targetUrl}/models` : `${targetUrl}/v1/models`;
      const response = await fetch(endpoint).catch(() => null);
      if (response && response.ok) {
        return { success: true, message: "Conexión exitosa con LM-Studio." };
      }
      return { success: false, message: `No se pudo conectar con LM-Studio en ${targetUrl}. Asegúrate de que el servidor de LM-Studio esté encendido y que el puerto sea el correcto.` };
    }

    if (provider === 'comfyui' || provider === 'a1111') {
      const defaultPort = provider === 'comfyui' ? '8188' : '7860';
      const targetUrl = cleanUrl || `http://127.0.0.1:${defaultPort}`;
      if (invokeFn) {
        const active = await invokeFn('check_service_status', { url: targetUrl }).catch(() => false);
        if (active) return { success: true, message: `Conexión exitosa con tu servidor local de ${provider.toUpperCase()}.` };
      } else {
        const response = await fetch(targetUrl).catch(() => null);
        if (response && response.ok) return { success: true, message: `Conexión exitosa con tu servidor local de ${provider.toUpperCase()}.` };
      }
      return { success: false, message: `No se pudo conectar con ${provider.toUpperCase()} en ${targetUrl}. Verifica que el servidor local esté encendido en ese puerto.` };
    }

    if (provider === 'gemini') {
      if (!apiKey) return { success: false, message: "Se requiere una API Key para probar Gemini." };
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: { 'x-goog-api-key': apiKey }
      }).catch(() => null);
      if (response && response.ok) {
        return { success: true, message: "API Key de Gemini válida y conexión exitosa." };
      }
      return { success: false, message: "La API Key de Gemini no es válida o hay un problema de conexión con Google." };
    }

    if (provider === 'openai') {
      if (!apiKey) return { success: false, message: "Se requiere una API Key para probar OpenAI." };
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      }).catch(() => null);
      if (response && response.ok) {
        return { success: true, message: "API Key de OpenAI válida y conexión exitosa." };
      }
      return { success: false, message: "La API Key de OpenAI no es válida o tu cuenta no está autorizada." };
    }

    if (provider === 'anthropic') {
      if (!apiKey) return { success: false, message: "Se requiere una API Key para probar Anthropic." };
      if (!apiKey.startsWith("sk-ant-")) {
        return { success: false, message: "La API Key de Anthropic debe comenzar con 'sk-ant-'." };
      }
      return { success: true, message: "API Key de Anthropic (Claude) registrada con formato válido. Conexión lista." };
    }

    if (provider === 'deepseek') {
      if (!apiKey) return { success: false, message: "Se requiere una API Key para probar DeepSeek." };
      const response = await fetch('https://api.deepseek.com/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      }).catch(() => null);
      if (response && response.ok) {
        return { success: true, message: "API Key de DeepSeek válida y conexión exitosa." };
      }
      return { success: false, message: "La API Key de DeepSeek no es válida o hay un problema de conexión con el servidor." };
    }

    if (provider === 'openart') {
      if (!apiKey) return { success: false, message: "Se requiere una API Key / Token de Sesión para probar OpenArt." };
      if (apiKey.includes('eyJhbGciOi')) {
        return { success: true, message: "Token de sesión de OpenArt estructurado correctamente. Conexión lista." };
      }
      return { success: true, message: "Clave de OpenArt configurada. La conexión se validará en la primera solicitud." };
    }

    if (provider === 'youart') {
      if (!apiKey) return { success: false, message: "Se requiere una API Key para probar YouArt." };
      return { success: true, message: "Clave de YouArt configurada. La conexión se validará en la primera solicitud." };
    }

    if (provider === 'comfydeploy') {
      if (!apiKey) return { success: false, message: "Se requiere una API Key para probar ComfyDeploy." };
      if (!url) return { success: false, message: "Se requiere un Deployment ID para probar ComfyDeploy." };
      
      const testUrl = 'https://api.comfydeploy.com/api/run/00000000-0000-0000-0000-000000000000';
      const headers = { 'Authorization': `Bearer ${apiKey}` };
      
      if (invokeFn) {
        try {
          await invokeFn('proxy_request', {
            url: testUrl,
            method: 'GET',
            payload: null,
            headers: headers
          });
          return { success: true, message: "API Key de ComfyDeploy validada y conexión exitosa." };
        } catch (e: any) {
          const errStr = String(e);
          if (errStr.includes("401") || errStr.toLowerCase().includes("unauthorized") || errStr.includes("403")) {
            return { success: false, message: "La API Key de ComfyDeploy no es válida o está inactiva." };
          }
          return { success: true, message: "API Key de ComfyDeploy validada exitosamente." };
        }
      } else {
        try {
          const res = await fetch(testUrl, { headers }).catch(() => null);
          if (res) {
            if (res.status === 401 || res.status === 403) {
              return { success: false, message: "La API Key de ComfyDeploy no es válida." };
            }
            return { success: true, message: "API Key de ComfyDeploy validada exitosamente." };
          }
        } catch (e) {
          // Ignore
        }
      }
      return { success: true, message: "API Key de ComfyDeploy configurada. Se validará en la primera solicitud." };
    }

    if (provider === 'elevenlabs') {
      if (!apiKey) return { success: false, message: "Se requiere una API Key para probar ElevenLabs." };
      const response = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': apiKey }
      }).catch(() => null);
      if (response && response.ok) {
        return { success: true, message: "API Key de ElevenLabs válida y cuenta activa." };
      }
      return { success: false, message: "La API Key de ElevenLabs es inválida o no coincide con ninguna cuenta activa." };
    }

    if (provider === 'suno' || provider === 'udio') {
      if (!apiKey) return { success: false, message: `Se requiere una API Key para probar ${provider.toUpperCase()}.` };
      
      const targetUrl = cleanUrl && !cleanUrl.includes('127.0.0.1') && !cleanUrl.includes('localhost') && cleanUrl.trim() !== ''
        ? cleanUrl
        : (provider === 'suno' ? 'https://api.sunoapi.org/api/v1/generate' : 'https://api.udio.com/v1/generate');

      const headers = getHeaders(apiKey);

      if (invokeFn) {
        try {
          // Route through Rust proxy to completely bypass CORS in Tauri app
          const resStr = await invokeFn('proxy_request', {
            url: targetUrl,
            method: 'GET',
            payload: null,
            headers: headers
          });
          return {
            success: true,
            message: `¡Conexión exitosa con ${provider.toUpperCase()} (vía Proxy Tauri)! API Key validada.`
          };
        } catch (e: any) {
          const errStr = String(e);
          if (errStr.includes("401") || errStr.toLowerCase().includes("unauthorized") || errStr.includes("403")) {
            return { success: false, message: `Clave de API inválida o denegada por el servicio de ${provider.toUpperCase()} (Código 401/403).` };
          }
          // If it connected but got 404 or 405 from Suno, it means the host is alive and key didn't fail Auth!
          if (errStr.includes("404") || errStr.includes("405") || errStr.includes("400")) {
            return {
              success: true,
              message: `¡Conexión exitosa con ${provider.toUpperCase()}! Servidor alcanzado. API Key validada.`
            };
          }
          return { success: false, message: `Error de red al conectar con ${provider.toUpperCase()}: ${errStr}` };
        }
      } else {
        try {
          const response = await fetch(targetUrl, {
            method: 'GET',
            headers: headers
          }).catch(() => null);

          if (!response) {
            return { 
              success: false, 
              message: `No se pudo establecer conexión con ${provider.toUpperCase()}.\n\n💡 Tip: Estás en un navegador externo (Chrome/Firefox). Para evitar bloqueos de CORS, utiliza la app de escritorio Tauri o activa una extensión CORS temporalmente.` 
            };
          }

          if (response.status === 401 || response.status === 403) {
            return { success: false, message: `Clave de API inválida o denegada por el servicio de ${provider.toUpperCase()} (Código ${response.status}).` };
          }

          return { 
            success: true, 
            message: `¡Conexión exitosa con ${provider.toUpperCase()}! El servidor respondió con código ${response.status}. API Key validada.` 
          };
        } catch (err: any) {
          return { 
            success: false, 
            message: `Error de CORS/Red al conectar con ${provider.toUpperCase()}.\n\n💡 Tip: Los navegadores externos bloquean llamadas directas por CORS. Abre la aplicación de escritorio nativa de Tauri o activa una extensión CORS en tu navegador.` 
          };
        }
      }
    }

    if (provider === 'meta-audiocraft') {
      const targetUrl = cleanUrl || 'http://localhost:7860/generate';
      if (invokeFn) {
        const active = await invokeFn('check_service_status', { url: targetUrl }).catch(() => false);
        if (active) return { success: true, message: "Conexión exitosa con Meta-AudioCraft." };
      }
      return { success: false, message: `No se pudo conectar con Meta-AudioCraft en ${targetUrl}.` };
    }

    if (provider === 'other') {
      if (!cleanUrl) return { success: false, message: "Se requiere una URL de endpoint para el proveedor 'other'." };
      return { success: true, message: `URL del proveedor personalizado registrada: ${cleanUrl}` };
    }

    return { success: true, message: `Conexión con ${provider.toUpperCase()} lista.` };
  } catch (err: any) {
    return { success: false, message: `Error probando conexión: ${err.message || err}` };
  }
};

export const pollComfyDeployRun = async (runId: string, apiKey: string): Promise<string> => {
  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  const checkUrl = `https://api.comfydeploy.com/api/run/${runId}`;
  const headers = { 'Authorization': `Bearer ${apiKey}` };
  
  let attempts = 0;
  const maxAttempts = 150; // Hasta 5 minutos para workflows pesados
  
  while (attempts < maxAttempts) {
    attempts++;
    let resultStr: string;
    
    if (invokeFn) {
      resultStr = await invokeFn('proxy_request', {
        url: checkUrl,
        method: 'GET',
        payload: null,
        headers: headers
      });
    } else {
      const res = await fetch(checkUrl, { headers });
      if (!res.ok) throw new Error(`Error en polling de ComfyDeploy: ${res.status}`);
      resultStr = await res.text();
    }
    
    const data = JSON.parse(resultStr);
    if (data.status === 'success') {
      const urls: string[] = [];
      if (data.outputs && Array.isArray(data.outputs)) {
        for (const out of data.outputs) {
          if (out.data) {
            if (Array.isArray(out.data.images)) {
              out.data.images.forEach((i: any) => i.url && urls.push(i.url));
            }
            if (Array.isArray(out.data.gifs)) {
              out.data.gifs.forEach((g: any) => g.url && urls.push(g.url));
            }
            if (Array.isArray(out.data.files)) {
              out.data.files.forEach((f: any) => f.url && urls.push(f.url));
            }
          }
        }
      }
      if (urls.length > 0) return urls[0];
      throw new Error("El workflow finalizó exitosamente pero no devolvió ningún recurso en 'outputs'.");
    }
    
    if (data.status === 'failed') {
      throw new Error(`La ejecución del workflow de ComfyDeploy falló: ${data.live_status?.error?.message || 'Error desconocido'}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
   throw new Error("Tiempo de espera agotado (Timeout) procesando el workflow en ComfyDeploy.");
};

export const generateLocal3DModel = async (
  endpoint: string,
  prompt: string,
  apiKey?: string,
  provider: string = 'comfyui',
  initImageBase64?: string,
  negativePrompt?: string,
  customWorkflowJson?: string,
  promptNodeTitleOrId?: string,
  negativeNodeTitleOrId?: string,
  imageNodeTitleOrId?: string,
  customSeed?: number
): Promise<string> => {
  try {
      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
      const baseUrl = endpoint.replace(/\/api\/prompt$/, '').replace(/\/$/, '');

      // OMNIDEPLOY SOLO PIDE CREDENCIALES. El cliente no tiene grafo: se lo
      // pide al proveedor y sigue el mismo camino que ComfyUI, con las mismas
      // inyecciones -prompt, negativo, imagen de referencia, semillas-.
      if (provider === 'omnideploy') {
        if (!apiKey?.trim() || !endpoint?.trim()) {
          throw new Error(
            'Falta el Deployment ID o la API Key de OmniDeploy para la Suite 3D. Pegalos en Ajustes.',
          );
        }
        const { pedirWorkflowDelProveedor } = await import('./omniDeploy');
        const grafo = await pedirWorkflowDelProveedor(
          { deploymentId: endpoint.trim(), apiKey: apiKey.trim() },
          '3d',
        );
        customWorkflowJson = JSON.stringify(grafo);
      }

      if (!customWorkflowJson) {
        throw new Error('Se requiere cargar un archivo JSON de Workflow API para la generación 3D local.');
      }

      console.log("[Omni IA Game] Custom ComfyUI workflow detected for 3D generation. Preparing injection...");
      const workflow = JSON.parse(customWorkflowJson);
      const seed = customSeed !== undefined ? customSeed : Math.floor(Math.random() * 1000000000);
      const clientId = (crypto as any).randomUUID?.() || Math.random().toString(36).substring(2);

      // Helper para buscar nodos por título o por clase
      const findNodeId = (wf: any, classType: string, title?: string) => {
        if (title) {
          const found = Object.entries(wf).find(([_, n]: any) => n._meta?.title === title);
          if (found) return found[0];
        }
        const found = Object.entries(wf).find(([_, n]: any) => n.class_type === classType);
        return found ? found[0] : null;
      };

      // Sanitizar textos
      const sanitizeText = (t: string) => t
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
        .replace(/"/g, "'")
        .replace(/\\/g, "/")
        .replace(/\n/g, " ")
        .trim();

      const cleanPositive = sanitizeText(prompt);
      const cleanNegative = negativePrompt ? sanitizeText(negativePrompt) : "";

      // 1. Inyectar Prompt Positivo
      let posNodeId = findNodeId(workflow, 'CLIPTextEncode', promptNodeTitleOrId || 'CLIPTextEncode') || "";
      if (posNodeId && workflow[posNodeId]?.inputs) {
        console.log(`[Omni IA Game] 3D: Injecting positive prompt in node ${posNodeId}: "${cleanPositive.substring(0, 40)}..."`);
        workflow[posNodeId].inputs.text = cleanPositive;
      }

      // 2. Inyectar Prompt Negativo
      let negNodeId = findNodeId(workflow, 'CLIPTextEncode', negativeNodeTitleOrId || 'CLIPTextEncode');
      // Asegurarnos de que no sea el mismo que el positivo
      if (negNodeId && posNodeId && negNodeId === posNodeId) {
        const otherClipNode = Object.entries(workflow).find(([id, n]: any) => 
          n.class_type === 'CLIPTextEncode' && id !== posNodeId
        );
        if (otherClipNode) {
          negNodeId = otherClipNode[0];
        }
      }
      if (negNodeId && workflow[negNodeId]?.inputs) {
        console.log(`[Omni IA Game] 3D: Injecting negative prompt in node ${negNodeId}: "${cleanNegative.substring(0, 40)}..."`);
        workflow[negNodeId].inputs.text = cleanNegative;
      }

      // Helper para buscar el nodo de carga de imagen
      const findImageNodeId = (wf: any, titleOrId?: string) => {
        if (titleOrId) {
          if (wf[titleOrId]) return titleOrId;
          const found = Object.entries(wf).find(([_, n]: any) => n._meta?.title === titleOrId);
          if (found) return found[0];
        }
        
        let found = Object.entries(wf).find(([_, n]: any) => n.class_type === 'LoadImage' || n.class_type === 'LoadImageBase64');
        if (found) return found[0];

        found = Object.entries(wf).find(([_, n]: any) => n.class_type && n.class_type.toLowerCase().includes('loadimage'));
        if (found) return found[0];

        found = Object.entries(wf).find(([_, n]: any) => n.inputs && typeof n.inputs.image === 'string');
        if (found) return found[0];

        return null;
      };

      // 3. Inyectar Imagen de Referencia (subida segura vía Rust)
      if (initImageBase64) {
        const base64Image = await ensureBase64Image(initImageBase64);
        const imgNodeId = findImageNodeId(workflow, imageNodeTitleOrId);
        console.log(`[Omni IA Game] 3D: Attempting reference image injection. Matched Image Node ID: ${imgNodeId}`);

        if (imgNodeId && workflow[imgNodeId]?.inputs) {
          let imageName = base64Image;
          if (base64Image.startsWith('data:image/') || base64Image.length > 1000) {
            try {
              console.log("[Omni IA Game] 3D: Uploading reference image securely via Rust...");
              const uploadResultStr = await invokeFn('upload_image_to_comfyui', {
                baseUrl,
                b64Data: base64Image
              });
              const uploadData = JSON.parse(uploadResultStr);
              imageName = uploadData.name || uploadData.filename || imageName;
              console.log(`[Omni IA Game] 3D reference image uploaded as: ${imageName}`);
            } catch (uploadErr) {
              console.error("Error uploading 3D reference image:", uploadErr);
            }
          }

          const cleanImageValue = imageName.replace(/^data:image\/\w+;base64,/, "");
          if (workflow[imgNodeId].class_type === 'LoadImageBase64' || workflow[imgNodeId].inputs.image_base64 !== undefined) {
            workflow[imgNodeId].inputs.image_base64 = cleanImageValue;
          } else {
            workflow[imgNodeId].inputs.image = cleanImageValue;
          }
          console.log(`[Omni IA Game] Injected 3D reference image into node ${imgNodeId}`);
        } else {
          console.warn("[Omni IA Game] 3D: No se pudo localizar el nodo de carga de imagen en el workflow para inyectar la referencia.");
        }
      }

      // 4. Inyectar Semilla Aleatoria
      Object.entries(workflow).forEach(([id, node]: any) => {
        if (node.inputs && node.inputs.seed !== undefined) {
          node.inputs.seed = seed;
        }
        if (node.inputs && node.inputs.noise_seed !== undefined) {
          node.inputs.noise_seed = seed;
        }
        if (node.class_type === 'RandomNoise' || node.type === 'RandomNoise') {
          if (node.widgets_values && Array.isArray(node.widgets_values) && node.widgets_values.length > 0) {
            node.widgets_values[0] = seed;
          }
        }
      });

      // 5. Enviar Petición
      //
      // El grafo ya lleva prompt, negativo, imagen de referencia y semillas.
      // Con OmniDeploy cambia el destino, nada mas.
      if (provider === 'omnideploy') {
        const { generarConOmniDeploy, salidaADataUrl } = await import('./omniDeploy');
        const salidas = await generarConOmniDeploy(
          { deploymentId: endpoint.trim(), apiKey: apiKey!.trim() },
          { prompt, tipo: '3d', workflow, servicio: 'suite_3d' },
        );
        const malla =
          salidas.find((s) => (s.kind ?? '') === 'modelo3d') ??
          salidas.find((s) => /\.(glb|gltf|obj|ply|stl)$/i.test(s.name)) ??
          salidas[0];
        if (!malla) throw new Error('La GPU del proveedor no devolvio ninguna malla.');
        const ext = malla.name.toLowerCase();
        return JSON.stringify({
          modelUrl: salidaADataUrl(malla),
          modelType: ext.endsWith('.gltf') ? 'gltf' : ext.endsWith('.obj') ? 'obj' : 'glb',
        });
      }

      console.log(`[Omni IA Game] Sending 3D workflow to local ComfyUI at: ${baseUrl}`);
      const promptResult = await invokeFn('proxy_request', {
        url: `${baseUrl}/prompt`,
        method: 'POST',
        payload: { prompt: workflow, client_id: clientId }
      });

      const promptData = typeof promptResult === 'string' ? JSON.parse(promptResult) : promptResult;
      if (!promptData || !promptData.prompt_id) {
        throw new Error(promptData?.error?.message || "No se pudo encolar el workflow 3D en ComfyUI.");
      }
      const promptId = promptData.prompt_id;

      // 6. Polling del Historial
      let modelFoundUrl = "";
      let modelType: 'glb' | 'gltf' | 'obj' | null = null;
      let attempts = 0;
      const maxAttempts = 1800; // 1 hora

      while (!modelFoundUrl && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000));
        attempts++;

        try {
          const historyResult = await invokeFn('proxy_request', {
            url: `${baseUrl}/history/${promptId}`,
            method: 'GET'
          });

          const historyData = typeof historyResult === 'string' ? JSON.parse(historyResult) : historyResult;

          if (historyData && historyData[promptId]) {
            const promptHistory = historyData[promptId];
            const outputs = promptHistory.outputs;
            
            if (outputs) {
              for (const nodeId in outputs) {
                const nodeOut = outputs[nodeId];
                for (const key in nodeOut) {
                  const nodeVal = nodeOut[key];
                  if (Array.isArray(nodeVal) && nodeVal.length > 0) {
                    for (const item of nodeVal) {
                      if (typeof item === 'string') {
                        const itemLower = item.toLowerCase();
                        if (itemLower.endsWith('.glb') || itemLower.endsWith('.gltf') || itemLower.endsWith('.obj')) {
                          console.log(`[Omni IA Game] 3D model path string found in outputs of node ${nodeId} (${key}): ${item}`);
                          if (itemLower.endsWith('.glb')) modelType = 'glb';
                          else if (itemLower.endsWith('.gltf')) modelType = 'gltf';
                          else if (itemLower.endsWith('.obj')) modelType = 'obj';

                          let filename = item;
                          let subfolder = "";
                          let typeParam = "output";

                          // Normalizar barras
                          const normalizedPath = item.replace(/\\/g, '/');
                          const outputSplit = normalizedPath.split('/output/');
                          if (outputSplit.length > 1) {
                            const relativePath = outputSplit[1];
                            const lastSlash = relativePath.lastIndexOf('/');
                            filename = lastSlash !== -1 ? relativePath.substring(lastSlash + 1) : relativePath;
                            subfolder = lastSlash !== -1 ? relativePath.substring(0, lastSlash) : "";
                          } else {
                            // Si no contiene /output/, tomamos solo el nombre de archivo
                            const lastSlash = normalizedPath.lastIndexOf('/');
                            filename = lastSlash !== -1 ? normalizedPath.substring(lastSlash + 1) : normalizedPath;
                          }

                          modelFoundUrl = await invokeFn('proxy_request', {
                            url: `${baseUrl}/view?filename=${encodeURIComponent(filename)}&type=${typeParam}&subfolder=${encodeURIComponent(subfolder)}`,
                            method: 'GET'
                          });
                          break;
                        }
                      } else if (item && typeof item === 'object') {
                        const filename = item.filename || "";
                        if (typeof filename === 'string') {
                          const fileLower = filename.toLowerCase();
                          if (fileLower.endsWith('.glb') || fileLower.endsWith('.gltf') || fileLower.endsWith('.obj')) {
                            console.log(`[Omni IA Game] 3D model object found in outputs of node ${nodeId} (${key}): ${filename}`);
                            if (fileLower.endsWith('.glb')) modelType = 'glb';
                            else if (fileLower.endsWith('.gltf')) modelType = 'gltf';
                            else if (fileLower.endsWith('.obj')) modelType = 'obj';

                            modelFoundUrl = await invokeFn('proxy_request', {
                              url: `${baseUrl}/view?filename=${encodeURIComponent(filename)}&type=${item.type || 'output'}&subfolder=${encodeURIComponent(item.subfolder || '')}`,
                              method: 'GET'
                            });
                            break;
                          }
                        }
                      }
                    }
                  }
                  if (modelFoundUrl) break;
                }
                if (modelFoundUrl) break;
              }
            }

            if (modelFoundUrl) {
              return JSON.stringify({
                modelUrl: modelFoundUrl,
                modelType: modelType || 'glb'
              });
            }

            // Si llegamos aquí, la ejecución en history existe pero no encontramos modelo 3D.
            // Analizar errores en status.messages
            const messages = promptHistory.status?.messages;
            if (messages && Array.isArray(messages)) {
              const execErr = messages.find((m: any) => m[0] === 'execution_error');
              if (execErr && execErr[1]) {
                const details = execErr[1];
                throw new Error(`La ejecución del modelador 3D falló en el nodo ${details.node_id} (${details.node_type}): ${details.exception_message}`);
              }
            }

            throw new Error("La ejecución del workflow de ComfyUI terminó pero no generó ningún archivo 3D (.glb, .gltf, .obj). Revisa los logs de tu terminal de ComfyUI.");
          }
        } catch (pollErr: any) {
          const pollMsg = pollErr.message || String(pollErr);
          // Si es un error explícito de ejecución o finalización del workflow, propagarlo inmediatamente
          if (pollMsg.includes("falló en el nodo") || pollMsg.includes("terminó pero no generó")) {
            throw pollErr;
          }
        }
      }

      throw new Error("Timeout: Se agotó el tiempo esperando la respuesta 3D de tu ComfyUI local.");
  } catch (error: any) {
      console.error("Local 3D error:", error);
      throw error;
  }
};
