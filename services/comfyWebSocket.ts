/**
 * Cliente WebSocket Nativo Directo para ComfyUI.
 *
 * Se conecta DIRECTAMENTE a la URL de ComfyUI (ej: ws://127.0.0.1:8188/ws)
 * sin pasar por intermediarios, servidores de licencias ni por el agente OmniDeploy.
 * 
 * Proporciona eventos instantáneos en tiempo real (0ms latencia):
 * - Progreso de KSampler (paso a paso, ej: Step 8/20)
 * - Nodo en ejecución activo
 * - Errores de ejecución de nodos
 * - Estado del sistema y cola
 */

export interface ComfyProgressEvent {
  value: number;
  max: number;
  promptId?: string;
  nodeId?: string;
}

export interface ComfyExecutingEvent {
  nodeId: string | null;
  promptId?: string;
}

export interface ComfyErrorEvent {
  promptId?: string;
  nodeId?: string;
  nodeType?: string;
  exceptionMessage: string;
  exceptionType?: string;
}

export type ComfyLogListener = (log: { type: 'info' | 'progress' | 'executing' | 'error' | 'status'; message: string; data?: any }) => void;

class ComfyWebSocketClient {
  private ws: WebSocket | null = null;
  private clientId: string = 'omni_web_' + Math.random().toString(36).substring(2, 9);
  private listeners: Set<ComfyLogListener> = new Set();
  private currentUrl: string = '';
  private reconnectTimer: any = null;

  /**
   * Conecta al WebSocket nativo de ComfyUI usando la URL directa.
   */
  public connect(baseUrl: string) {
    if (!baseUrl) return;
    const cleanUrl = baseUrl.trim().replace(/\/$/, '');
    const wsProto = cleanUrl.startsWith('https') ? 'wss:' : 'ws:';
    const host = cleanUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProto}//${host}/ws?clientId=${this.clientId}`;

    if (this.ws && this.currentUrl === wsUrl && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.disconnect();
    this.currentUrl = wsUrl;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.emit({ type: 'info', message: `⚡ Conectado directamente a ComfyUI nativo (${cleanUrl})` });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch {
          // Ignorar mensajes no-JSON
        }
      };

      this.ws.onerror = () => {
        // Fallo silencioso si la URL aún no está lista
      };

      this.ws.onclose = () => {
        this.ws = null;
      };
    } catch (e: any) {
      console.warn('[ComfyUI WS] No se pudo abrir WebSocket directo:', e?.message || e);
    }
  }

  /**
   * Desconecta el WebSocket actual de ComfyUI.
   */
  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }

  /**
   * Suscribe un listener para recibir logs y progresos en tiempo real.
   */
  public subscribe(listener: ComfyLogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getClientId(): string {
    return this.clientId;
  }

  private emit(payload: { type: 'info' | 'progress' | 'executing' | 'error' | 'status'; message: string; data?: any }) {
    this.listeners.forEach((l) => {
      try {
        l(payload);
      } catch {}
    });
  }

  private handleMessage(msg: { type: string; data: any }) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'status':
        if (msg.data?.status?.exec_info) {
          const queue = msg.data.status.exec_info.queue_remaining;
          this.emit({
            type: 'status',
            message: `Cola de ComfyUI: ${queue} pendiente(s)`,
            data: msg.data.status,
          });
        }
        break;

      case 'execution_start':
        this.emit({
          type: 'info',
          message: `🚀 Iniciada generación en ComfyUI (ID: ${msg.data?.prompt_id || 'activo'})`,
          data: msg.data,
        });
        break;

      case 'executing':
        if (msg.data?.node === null) {
          this.emit({
            type: 'info',
            message: `✅ Generación finalizada en ComfyUI`,
            data: msg.data,
          });
        } else if (msg.data?.node) {
          this.emit({
            type: 'executing',
            message: `🔄 Ejecutando Nodo #${msg.data.node}...`,
            data: msg.data,
          });
        }
        break;

      case 'progress':
        if (typeof msg.data?.value === 'number' && typeof msg.data?.max === 'number') {
          const pct = Math.round((msg.data.value / msg.data.max) * 100);
          this.emit({
            type: 'progress',
            message: `⏳ Muestreo KSampler: ${msg.data.value}/${msg.data.max} (${pct}%)`,
            data: msg.data,
          });
        }
        break;

      case 'execution_error':
        const errMsg = msg.data?.exception_message || 'Error desconocido en ejecutor de nodos';
        this.emit({
          type: 'error',
          message: `❌ Error en ComfyUI (Nodo #${msg.data?.node_id || '?'}, ${msg.data?.node_type || ''}): ${errMsg}`,
          data: msg.data,
        });
        break;
    }
  }
}

export const comfyWS = new ComfyWebSocketClient();

/**
 * Consulta el estado del sistema directamente a la URL de ComfyUI sin intermediarios.
 */
export async function getComfySystemStatsDirect(comfyUrl: string): Promise<{ online: boolean; devices?: any[] }> {
  if (!comfyUrl) return { online: false };
  const cleanUrl = comfyUrl.trim().replace(/\/$/, '');
  try {
    const res = await fetch(`${cleanUrl}/system_stats`, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      return { online: true, devices: data.devices || [] };
    }
  } catch {
    // Si la llamada directa por fetch falla (ej. por CORS en navegador puro), devolver false
  }
  return { online: false };
}
