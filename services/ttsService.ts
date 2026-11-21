/**
 * ---------------------------------------------------------------------------
 *  Servicio de Gestión de Servidores TTS Locales (services/ttsService.ts)
 * ---------------------------------------------------------------------------
 *  Controla el arranque, apagado y estado de los servidores locales en el puerto 5000:
 *  - Microsoft Edge TTS (edge-tts-server.py)
 *  - Piper TTS (piper-tts-server.py)
 * ---------------------------------------------------------------------------
 */

export interface TtsServerStatus {
  alive: boolean;
  engine?: 'edge-tts' | 'piper' | string;
}

/**
 * Consulta el estado y tipo de motor activo en el puerto 5000.
 */
export const getTtsServerStatus = async (): Promise<TtsServerStatus> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch('http://127.0.0.1:5000/api/status', {
      method: 'GET',
      signal: controller.signal
    }).catch(() => null);
    clearTimeout(timeout);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.status === 'ok') {
        return { alive: true, engine: data.engine };
      }
    }

    // Fallback: si responde /api/voices pero el servidor no tenía /api/status todavía
    const resVoices = await fetch('http://127.0.0.1:5000/api/voices', {
      method: 'GET'
    }).catch(() => null);
    if (resVoices && resVoices.ok) {
      return { alive: true, engine: 'edge-tts' };
    }
    return { alive: false };
  } catch {
    return { alive: false };
  }
};

/**
 * Comprueba si el servidor local de TTS en el puerto 5000 está activo.
 * Si se especifica `expectedEngine`, comprueba además que corresponda a ese motor.
 */
export const isTtsServerAlive = async (expectedEngine?: 'edge-tts' | 'piper'): Promise<boolean> => {
  const status = await getTtsServerStatus();
  if (!status.alive) return false;
  if (!expectedEngine) return true;
  return status.engine === expectedEngine;
};

/**
 * Asegura que el servidor TTS local requerido esté en marcha.
 * Si hay otro motor ocupando el puerto 5000, lo apaga primero y arranca el solicitado.
 * Compatible con la app de escritorio (Tauri) y con el entorno de desarrollo web (Vite dev).
 */
export const ensureTtsServerRunning = async (
  engine: 'edge-tts' | 'piper',
  onProgress?: (msg: string) => void
): Promise<boolean> => {
  // 1. Si el motor correcto ya está activo, retorno inmediato
  const currentStatus = await getTtsServerStatus();
  if (currentStatus.alive && currentStatus.engine === engine) {
    return true;
  }

  // 2. Si otro motor ocupa el puerto 5000, detenerlo primero
  if (currentStatus.alive && currentStatus.engine !== engine) {
    onProgress?.(`Deteniendo motor anterior (${currentStatus.engine})...`);
    await stopTtsServer();
    await new Promise((r) => setTimeout(r, 600));
  }

  onProgress?.(`Iniciando servidor local ${engine === 'piper' ? 'Piper TTS (Ligero CPU)' : 'Edge TTS'} en segundo plano...`);

  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  let launched = false;

  // Intento A: Invocar comando nativo de Tauri (app de escritorio)
  if (invokeFn) {
    try {
      if (engine === 'piper') {
        await invokeFn('launch_piper_tts');
      } else {
        await invokeFn('launch_edge_tts');
      }
      launched = true;
    } catch (err: any) {
      console.warn(`[TTS Service] Fallo al invocar comando de inicio en Tauri para ${engine}:`, err);
    }
  }

  // Intento B: Invocar plugin de desarrollo de Vite (navegador web dev)
  if (!launched) {
    try {
      const res = await fetch(`/__dev/launch_tts?engine=${engine}`, { method: 'POST' }).catch(() => null);
      if (res && res.ok) {
        launched = true;
      }
    } catch {
      // Ignorar si no está en entorno Vite
    }
  }

  // 3. Esperar hasta 15 segundos a que el motor solicitado esté listo en el puerto 5000
  for (let i = 0; i < 15; i++) {
    onProgress?.(`Esperando servidor de voz ${engine} (${i + 1}s)...`);
    await new Promise((r) => setTimeout(r, 1000));
    const ready = await isTtsServerAlive(engine);
    if (ready) {
      onProgress?.('¡Servidor de voz listo!');
      return true;
    }
  }

  return false;
};

/**
 * Detiene el servidor TTS local activo en el puerto 5000.
 */
export const stopTtsServer = async (): Promise<boolean> => {
  const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
  if (invokeFn) {
    try {
      await invokeFn('stop_edge_tts');
    } catch (err) {
      console.warn('[TTS Service] Error al detener servidor TTS vía Tauri:', err);
    }
  }

  // Notificar también al dev server de Vite si corresponde
  try {
    await fetch('/__dev/stop_tts', { method: 'POST' }).catch(() => null);
  } catch {
    // Ignorar
  }

  // Esperar a que el puerto 5000 quede libre
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const status = await getTtsServerStatus();
    if (!status.alive) return true;
  }
  return true;
};
