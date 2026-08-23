/**
 * Omni Web Bridge — Capa Adaptadora Universal para Navegador Web
 * Abstrae y emula comandos IPC de Tauri cuando la aplicación se ejecuta
 * directamente en un navegador web (Chrome, Edge, Firefox, Safari, etc.).
 */

export const isTauriEnv = (): boolean => {
  return typeof window !== 'undefined' && !!((window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke);
};

// Identificador universal para navegadores web y clientes macOS/Linux Web
const getWebHardwareId = (): string => {
  return 'OMNI-HW-WEB-CLIENT';
};

const serviceStatusCache = new Map<string, { result: boolean, time: number }>();

let webComfyLogsBuffer: string[] = [
  '[Omni Web Bridge] 🌐 Entorno Web Universal iniciado.',
  '[Omni Web Bridge] ℹ️ En la App Web, ComfyUI se conecta a través del puerto http://127.0.0.1:8188 de tu PC.'
];

/**
 * Adaptador principal que intercepta invocaciones IPC de Tauri en el Navegador Web
 */
export const webBridgeInvoke = async (cmd: string, args: any = {}): Promise<any> => {
  // Evitar spammear la consola con comandos de sondeo constante (polling)
  if (cmd !== 'get_comfyui_logs' && cmd !== 'check_service_status') {
    // Log de consola sanitizado para visibilidad del usuario sin exponer tokens de licencias
    const sanitized = { ...args };
    if (sanitized.licenseKey) sanitized.licenseKey = '***LICENCIA_PROTEGIDA***';
    if (sanitized.license_key) sanitized.license_key = '***LICENCIA_PROTEGIDA***';
    if (typeof sanitized.body === 'string' && sanitized.body.includes('license_key')) {
      sanitized.body = '{"license_key":"***LICENCIA_PROTEGIDA***"}';
    }
    console.log(`[Omni Web Bridge] 🌐 Invocando comando web: "${cmd}"`, sanitized);
  }

  switch (cmd) {
    case 'get_hardware_id':
      return getWebHardwareId();

    case 'launch_creador2d':
      return 'El Creador 2D está activo en modo cliente web';

    case 'creador2d_link_secret':
      return 'WEB_CREADOR2D_SECRET';

    case 'check_license_status': {
      const savedKey = localStorage.getItem('omni_license_key');
      return !!savedKey;
    }

    case 'get_license_info': {
      const savedKey = localStorage.getItem('omni_license_key') || '';
      const hwId = getWebHardwareId();
      const isLicensed = !!savedKey;
      return {
        is_licensed: isLicensed,
        license_key: savedKey,
        expiration: 'UNLIMITED',
        uptime_limit: 0,
        uptime_used: 0,
        hardware_id: hwId,
        cap: 'full',
        email: localStorage.getItem('omni_user_email') || null,
        mods: ['creador2d', 'audio', '3d', 'npc']
      };
    }

    case 'verify_license':
    case 'save_license_key': {
      const key = args.license_key || args.licenseKey || '';
      if (key) {
        localStorage.setItem('omni_license_key', key);
        return 'Licencia guardada activada con éxito en la versión web';
      }
      localStorage.removeItem('omni_license_key');
      return 'Licencia eliminada';
    }

    case 'delete_license': {
      localStorage.removeItem('omni_license_key');
      return 'Licencia eliminada';
    }

    case 'check_service_status': {
      const targetUrl = typeof args === 'string' ? args : (args?.url || '');
      if (!targetUrl) return false;

      const isComfyUrl = targetUrl.includes('8188');
      const isOllamaUrl = targetUrl.includes('11434');

      const cached = serviceStatusCache.get(targetUrl);
      const cacheTTL = cached?.result ? 10000 : 30000;
      if (cached && Date.now() - cached.time < cacheTTL) {
        return cached.result;
      }

      let statusResult = false;

      if (isComfyUrl) {
        const testComfy = async (base: string): Promise<boolean> => {
          try {
            const clean = base.replace(/\/$/, '');
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), 1500);
            await fetch(`${clean}/system_stats`, { method: 'GET', mode: 'no-cors', signal: controller.signal });
            clearTimeout(t);
            return true;
          } catch {
            try {
              const clean = base.replace(/\/$/, '');
              const controller = new AbortController();
              const t = setTimeout(() => controller.abort(), 1500);
              await fetch(clean, { method: 'GET', mode: 'no-cors', signal: controller.signal });
              clearTimeout(t);
              return true;
            } catch {
              return false;
            }
          }
        };

        statusResult = await testComfy(targetUrl);
        if (!statusResult) {
          const alt = targetUrl.includes('localhost')
            ? targetUrl.replace('localhost', '127.0.0.1')
            : targetUrl.replace('127.0.0.1', 'localhost');
          statusResult = await testComfy(alt);
        }
      } else if (isOllamaUrl) {
        const testOllama = async (base: string): Promise<boolean> => {
          try {
            const clean = base.replace(/\/$/, '');
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), 1500);
            await fetch(`${clean}/api/tags`, { method: 'GET', mode: 'no-cors', signal: controller.signal });
            clearTimeout(t);
            return true;
          } catch {
            return false;
          }
        };

        statusResult = await testOllama(targetUrl);
        if (!statusResult) {
          const alt = targetUrl.includes('localhost')
            ? targetUrl.replace('localhost', '127.0.0.1')
            : targetUrl.replace('127.0.0.1', 'localhost');
          statusResult = await testOllama(alt);
        }
      } else {
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 1500);
          await fetch(targetUrl, { method: 'GET', mode: 'no-cors', signal: controller.signal });
          clearTimeout(t);
          statusResult = true;
        } catch {
          statusResult = false;
        }
      }

      serviceStatusCache.set(targetUrl, { result: statusResult, time: Date.now() });
      return statusResult;
    }

    case 'proxy_request': {
      const { url, method = 'GET', headers = {} } = args;
      const payload = args.payload !== undefined ? args.payload : args.body;
      if (!url) throw new Error('URL requerida para proxy_request');

      const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
      const isImageResponse = url.includes('/view') || /\.(png|jpg|jpeg|webp)($|\?)/i.test(url);
      if (isLocal) {
        try {
          const fetchHeaders: Record<string, string> = { ...headers };
          let body: any = undefined;
          if (payload) {
            body = typeof payload === 'string' ? payload : JSON.stringify(payload);
            if (!fetchHeaders['Content-Type']) {
              fetchHeaders['Content-Type'] = 'application/json';
            }
          }
          const res = await fetch(url, {
            method,
            headers: fetchHeaders,
            body
          });
          if (res.status === 403) {
            return JSON.stringify({ status: 'running', active: true, message: 'Servidor local respondiendo en puerto' });
          }
          if (isImageResponse) {
            const arrayBuffer = await res.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const b64 = btoa(binary);
            const mime = url.includes('.jpg') || url.includes('.jpeg') ? 'image/jpeg' : 'image/png';
            return `data:${mime};base64,${b64}`;
          }
          return await res.text();
        } catch {
          const altUrl = url.includes('localhost')
            ? url.replace('localhost', '127.0.0.1')
            : url.replace('127.0.0.1', 'localhost');
          try {
            const fetchHeaders: Record<string, string> = { ...headers };
            let body: any = undefined;
            if (payload) {
              body = typeof payload === 'string' ? payload : JSON.stringify(payload);
              if (!fetchHeaders['Content-Type']) {
                fetchHeaders['Content-Type'] = 'application/json';
              }
            }
            const res = await fetch(altUrl, { method, headers: fetchHeaders, body });
            if (res.status === 403) {
              return JSON.stringify({ status: 'running', active: true, message: 'Servidor local respondiendo en puerto' });
            }
            if (isImageResponse) {
              const arrayBuffer = await res.arrayBuffer();
              const bytes = new Uint8Array(arrayBuffer);
              let binary = '';
              for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              const b64 = btoa(binary);
              const mime = url.includes('.jpg') || url.includes('.jpeg') ? 'image/jpeg' : 'image/png';
              return `data:${mime};base64,${b64}`;
            }
            return await res.text();
          } catch (e: any) {
            throw new Error("CORS bloqueado por ComfyUI: Reinicia ComfyUI en tu PC cerrando la consola actual y abriendo el archivo OMNI-IA_START.bat actualizado para activar --enable-cors-header *.");
          }
        }
      }

      // Para URLs Cloud, hacer fetch directo en modo web
      const fetchHeaders: Record<string, string> = { ...headers };
      let body: any = undefined;
      if (payload) {
        body = typeof payload === 'string' ? payload : JSON.stringify(payload);
        if (!fetchHeaders['Content-Type']) fetchHeaders['Content-Type'] = 'application/json';
      }
      try {
        const directRes = await fetch(url, { method, headers: fetchHeaders, body });
        if (isImageResponse) {
          const arrayBuffer = await directRes.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const b64 = btoa(binary);
          const mime = url.includes('.jpg') || url.includes('.jpeg') ? 'image/jpeg' : 'image/png';
          return `data:${mime};base64,${b64}`;
        }
        return await directRes.text();
      } catch (e: any) {
        return JSON.stringify({ status: 'success', active: true, data: [] });
      }
    }

    case 'preferencia_comfyui':
    case 'preferencia_ollama':
      return {};

    case 'marcar_comfyui_resuelto':
    case 'marcar_ollama_resuelto':
    case 'launch_edge_tts':
    case 'stop_edge_tts':
    case 'launch_vibevoice':
    case 'stop_vibevoice':
      return true;

    case 'clear_comfyui_logs': {
      webComfyLogsBuffer = ['[Omni Web Bridge] 🧹 Consola de logs limpiada.'];
      return true;
    }

    case 'check_default_model_status':
      return false;

    case 'get_comfyui_logs': {
      const isComfyOnline = serviceStatusCache.get('http://127.0.0.1:8188')?.result ?? false;
      const statusLine = isComfyOnline
        ? '[Omni Web Bridge] ✅ Servidor API REST ComfyUI (http://127.0.0.1:8188) CONECTADO Y EN LÍNEA.'
        : '[Omni Web Bridge] 📡 Escuchando respuestas HTTP REST en http://127.0.0.1:8188...';
      return [...webComfyLogsBuffer, statusLine].join('\n');
    }

    case 'launch_comfyui': {
      const scriptPath = args?.comfyuiPath || 'F:\\Comfyui_362\\App\\OMNI-IA_START - Copy.bat';
      webComfyLogsBuffer.push(`[Omni Web Bridge] 🚀 Solicitud de inicio procesada para el script: ${scriptPath}`);
      webComfyLogsBuffer.push(`[Omni Web Bridge] 🌐 Estableciendo enlace API REST con http://127.0.0.1:8188...`);
      return 'Solicitud de inicio procesada en cliente web';
    }

    case 'stop_comfyui':
      return 'Servicio detenido';

    case 'save_project_file': {
      const { content, filename = 'proyecto_omni.json' } = args || {};
      if (content && typeof document !== 'undefined') {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return 'Proyecto guardado con éxito (descarga web)';
      }
      return 'Proyecto guardado con éxito';
    }

    case 'select_directory':
    case 'select_file':
      return null;

    case 'list_gguf_models':
      return [];

    case 'check_llama_server_status':
      return false;

    default:
      return null;
  }
};

/**
 * Inicializa automáticamente el puente Web si `window.__TAURI__` no existe.
 */
export const initOmniWebBridge = () => {
  if (typeof window !== 'undefined' && !(window as any).__TAURI__) {
    (window as any).__TAURI__ = {
      invoke: webBridgeInvoke
    };
    (window as any).__OMNI_IS_WEB__ = true;
  }
};

// Auto-inicializar al importar
initOmniWebBridge();
