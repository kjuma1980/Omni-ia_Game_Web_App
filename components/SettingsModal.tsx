import React, { useState, useEffect } from 'react';
import { ProjectData } from '../types';
import { Settings, Server, Cpu, Music, Download, RefreshCw, X, AlertTriangle, Image, Video, Mic, CheckCircle, Loader2, Cloud, ToggleLeft, ToggleRight, Upload, Trash2, Box, Users, Code2, Folder, File, Terminal, Lock, AlertCircle, Layers, Boxes, Play, Check } from 'lucide-react';
import { getOllamaModels, pedirJsonLocal, pullOllamaModel, testProviderConnection } from '../services/localService';
import { getLlamaServerModels, selectGgufFile, startLlamaServer, stopLlamaServer, isLlamaServerAlive, listGgufModels, GgufModelInfo, getLlamaServerState } from '../services/llamaServerService';
import { flushOtherLocalProviders } from '../services/memoryOrchestrator';
import { SpriteWorkflowAssignments, WorldWorkflowAssignments, AnimationWorkflowAssignments } from './WorkflowAssignments';
import Tooltip from './Tooltip';

const invoke = <T = any>(name: string, args?: any): Promise<T> => {
  const rawInvoke = (window as any).__TAURI__?.invoke ||
                    (window as any).__TAURI_INTERNALS__?.invoke;
  if (rawInvoke) {
    return rawInvoke(name, args);
  }
  console.warn(`[SettingsModal] Tauri invoke fallback: ${name} not available`);
  return Promise.resolve(null as any);
};


interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ProjectData['apiSettings'];
  updateSettings: (updates: Partial<ProjectData['apiSettings']>) => void;
  showTooltips?: boolean;
  /**
   * Vida de la licencia segun el SERVIDOR. Es la fuente buena: sobrevive a
   * desinstalar la aplicacion, que es lo que reiniciaba el contador local.
   */
  estadoServidor?: {
    billing_mode?: string;
    expires_at?: string;
    days_left?: number | null;
    minutes_left?: number | null;
    activated_at?: number | null;
  } | null;
  isComfyRunning?: boolean;
  isLaunchingComfy?: boolean;
  onLaunchComfy?: () => Promise<void>;
  onStopComfy?: () => Promise<void>;
  comfyLogs?: string;
  onClearLogs?: () => Promise<void> | void;
  /**
   * La licencia incluye el Creador de Mundos 2D y el servidor no la ha
   * rechazado. Lo calcula `App` -que es quien hace la validacion en linea- y
   * baja como prop para no repetir aqui ni la logica ni la peticion.
   *
   * Por defecto `false`: si el dato no llega, el interruptor no se pinta.
   */
  creador2dLicensed?: boolean;
  licenseOnline?: {
    checked: boolean;
    valid: boolean;
    reason?: string;
    estado?: {
      billing_mode?: string;
      expires_at?: string;
      days_left?: number | null;
      minutes_left?: number | null;
      activated_at?: number | null;
    } | null;
  };
  premiumUnlocked?: boolean;
}

/**
 * Hay ventana de Tauri, es decir, se puede llamar a `invoke`.
 *
 * `@tauri-apps/api/core` no comprueba nada: va directo a
 * `window.__TAURI_INTERNALS__.invoke`, que en un navegador normal no existe.
 * Se mira aqui la misma pareja de globales que ya usa el resto del codigo
 * -`__TAURI__` cuando la app expone la API global, `__TAURI_INTERNALS__`
 * cuando no-, para no depender de cual de las dos este puesta.
 */
function hayEntornoTauri(): boolean {
  return Boolean(
    (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke,
  );
}

const PREDEFINED_CODE_MODELS: Record<string, string[]> = {
  gemini: ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  anthropic: ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  openai: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'o4-mini', 'o3-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  deepseek: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-coder'],
  qwen: ['qwen3.7-max', 'qwen3.7-plus', 'qwen3-coder-plus', 'qwen-max', 'qwen-plus', 'qwen-coder-plus'],
  kimi: ['kimi-k2.6', 'kimi-k2.5', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  openrouter: ['openrouter/auto', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-r1', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001', 'openai/gpt-4o-mini'],
  cometapi: ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022', 'deepseek-chat', 'deepseek-reasoner']
};

const PREDEFINED_NPC_MODELS: Record<string, string[]> = {
  gemini: ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  anthropic: ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
  openai: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'o4-mini', 'o3-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  deepseek: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat'],
  qwen: ['qwen3.7-max', 'qwen3.7-plus', 'qwen-max', 'qwen-plus'],
  kimi: ['kimi-k2.6', 'kimi-k2.5', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  openrouter: ['openrouter/auto', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-r1', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001', 'openai/gpt-4o-mini'],
  cometapi: ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022', 'deepseek-chat', 'deepseek-reasoner'],
  nvidia: ['meta/llama-3.3-70b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct', 'deepseek-ai/deepseek-r1', 'qwen/qwen2.5-72b-instruct']
};

const PREDEFINED_TEXT_MODELS: Record<string, string[]> = {
  gemini: ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  anthropic: ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  openai: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'o4-mini', 'o3-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  deepseek: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat'],
  qwen: ['qwen3.7-max', 'qwen3.7-plus', 'qwen-max', 'qwen-plus'],
  kimi: ['kimi-k2.6', 'kimi-k2.5', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  openrouter: ['openrouter/auto', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-r1', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001', 'openai/gpt-4o-mini'],
  cometapi: ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022', 'deepseek-chat', 'deepseek-reasoner'],
  nvidia: ['meta/llama-3.3-70b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct', 'deepseek-ai/deepseek-r1', 'qwen/qwen2.5-72b-instruct']
};

const PREDEFINED_IMAGE_MODELS: Record<string, string[]> = {
  gemini: ['imagen-3.0-generate-002', 'imagen-2.5-flash', 'imagen-2.0-pro'],
  openai: ['dall-e-3', 'dall-e-2', 'openai/dall-e-3'],
  'midjourney-api': ['midjourney-v6', 'midjourney-v5.2', 'midjourney-v5.1'],
  comfydeploy: ['sdxl-base-1.0', 'flux-1-schnell', 'flux-1-dev', 'sd-3.5-large'],

  // La GPU del proveedor corre ComfyUI, asi que ofrece lo mismo.

  omnideploy: ['sdxl-base-1.0', 'flux-1-schnell', 'flux-1-dev', 'sd-3.5-large'],
  comfyui: ['flux-1-schnell', 'flux-1-dev', 'sdxl-base-1.0', 'revAnimated_v2Rebirth'],
  a1111: ['sdxl-base-1.0', 'sd-v1-5', 'revAnimated_v2Rebirth'],
  ollama: ['llava', 'bakllava'],
  'lm-studio': ['local-vision-model']
};

const PREDEFINED_VIDEO_MODELS: Record<string, string[]> = {
  gemini: ['veo-3.1-generate-001', 'veo-3.0-pro', 'veo-2.0-flash'],
  seedance: ['seedance-video-v2', 'seedance-video-v1'],
  kling: ['kling-v2-pro', 'kling-v1.5-standard', 'kling-v1.0-speed'],
  openart: ['openart-video-flux', 'openart-video-sdxl'],
  youart: ['youart-video-v2', 'youart-video-v1'],
  comfydeploy: ['svd-xt-1.1', 'animate-diff-v3', 'hunyuan-video', 'cogvideo-x-5b'],

  // La GPU del proveedor corre ComfyUI, asi que ofrece lo mismo.

  omnideploy: ['svd-xt-1.1', 'animate-diff-v3', 'hunyuan-video', 'cogvideo-x-5b'],
  comfyui: ['svd-xt-1.1', 'animate-diff-v3', 'hunyuan-video'],
  a1111: ['deforum-diffusion', 'animate-diff-webui'],
  ollama: ['animate-diff-ollama'],
  'lm-studio': ['animate-diff-lms']
};

const PREDEFINED_TTS_MODELS: Record<string, string[]> = {
  gemini: ['gemini-tts-v1', 'gemini-speech-v1'],
  elevenlabs: ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_monolingual_v1'],
  suno: ['bark-v2', 'bark-standard', 'suno-tts-v1'],
  comfydeploy: ['f5-tts', 'chat-tts', 'xtts-v2'],

  // La GPU del proveedor corre ComfyUI, asi que ofrece lo mismo.

  omnideploy: ['f5-tts', 'chat-tts', 'xtts-v2'],
  comfyui: ['VibeVoiceInput', 'tts-comfyui-node'],
  ollama: ['llama3-speech', 'mistral-tts'],
  'lm-studio': ['tts-local-compatible'],
  local: ['es-MX-DaliaNeural', 'es-MX-JorgeNeural', 'es-ES-AlvaroNeural', 'en-US-AriaNeural', 'en-US-GuyNeural']
};

const PREDEFINED_MUSIC_MODELS: Record<string, string[]> = {
  gemini: ['music-lm-v2', 'audiocraft-gemini'],
  suno: ['chirp-v3-5', 'chirp-v3', 'chirp-v2'],
  udio: ['udio-v1.5', 'udio-v1.0'],
  'meta-audiocraft': ['musicgen-large', 'musicgen-medium', 'musicgen-melody', 'audiogen-medium'],
  comfydeploy: ['musicgen-comfy', 'audiocraft-node'],

  // La GPU del proveedor corre ComfyUI, asi que ofrece lo mismo.

  omnideploy: ['musicgen-comfy', 'audiocraft-node'],
  comfyui: ['musicgen-comfy', 'audiocraft-node'],
  a1111: ['audiocraft-webui'],
  ollama: ['audiocraft-ollama'],
  'lm-studio': ['audiocraft-lms'],
  local: ['audiocraft-local']
};

const PREDEFINED_SFX_MODELS: Record<string, string[]> = {
  gemini: ['sfx-gemini-v1'],
  suno: ['sfx-suno-v1'],
  udio: ['sfx-udio-v1'],
  'meta-audiocraft': ['audiogen-medium'],
  comfydeploy: ['sfx-comfy-v1'],

  // La GPU del proveedor corre ComfyUI, asi que ofrece lo mismo.

  omnideploy: ['sfx-comfy-v1'],
  comfyui: ['sfx-comfy-v1'],
  a1111: ['sfx-webui-v1'],
  ollama: ['sfx-ollama-v1'],
  'lm-studio': ['sfx-lms-v1'],
  local: ['sfx-local-v1']
};

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  settings, 
  updateSettings, 
  showTooltips,
  estadoServidor,
  isComfyRunning = false,
  isLaunchingComfy = false,
  onLaunchComfy,
  onStopComfy,
  comfyLogs = '',
  onClearLogs,
  creador2dLicensed = false,
  licenseOnline,
  premiumUnlocked: premiumUnlockedProp
}) => {
  if (!settings) return null;

  // Safe initialization fallbacks to prevent crashes on older projects in IndexedDB
  if (!settings.threeD) {
    settings.threeD = {
      provider: 'tripo',
      baseUrl: 'http://127.0.0.1:8188',
      apiKey: '',
      model: 'tripo-v2.0',
      workflowId: '',
      customWorkflow: '',
      promptNode: 'CLIPTextEncode',
      negativeNode: 'CLIPTextEncode',
      imageNode: 'LoadImage',
      apiKeys: {}
    };
  } else if (settings.threeD.workflowId === undefined) {
    settings.threeD.workflowId = '';
  }
  if (!settings.npcs) {
    settings.npcs = {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'gemma4:12b',
      apiKeys: {},
    };
  }
  if (!settings.code) {
    settings.code = {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'gemma4:12b',
      apiKeys: {},
    };
  }
  if (!settings.promptEngineer) {
    settings.promptEngineer = {
      enabled: true,
      useTextProvider: false,
      provider: 'gemini',
      baseUrl: '',
      model: '',
      apiKey: '',
    };
  }
  if (settings.audio) {
    if (settings.audio.ttsWorkflowId === undefined) settings.audio.ttsWorkflowId = '';
    if (settings.audio.sfxUrl === undefined) settings.audio.sfxUrl = 'http://127.0.0.1:8188';
    if (settings.audio.sfxWorkflowId === undefined) settings.audio.sfxWorkflowId = '';
  }
  if (!settings.llamaCpp) {
    settings.llamaCpp = {
      modelPath: '',
      gpuLayers: 999,
      contextSize: 16384,
      threads: 4,
      port: 8088,
    };
  }

  if (!settings.enabledTabs) {
    settings.enabledTabs = {
      animation: true,
      npcs: true,
      threeD: true,
      creador2d: true,
    };
  } else {
    if (settings.enabledTabs.animation === undefined) settings.enabledTabs.animation = true;
    if (settings.enabledTabs.npcs === undefined) settings.enabledTabs.npcs = true;
    if (settings.enabledTabs.threeD === undefined) settings.enabledTabs.threeD = true;
    // Encendido por defecto igual que los otros tres: aqui el interruptor solo
    // decide la VISIBILIDAD. Quien decide el DERECHO es la licencia, y sin ella
    // el modulo no se pinta aunque esto valga `true`.
    if (settings.enabledTabs.creador2d === undefined) settings.enabledTabs.creador2d = true;
  }

  if (!settings.worldWorkflows) {
    settings.worldWorkflows = {
      a: { provider: 'comfyui', baseUrl: 'http://127.0.0.1:8188', workflowId: '', customWorkflow: '', comfyDeployApiKey: '', comfyDeployDeploymentId: '', omniDeployApiKey: '', omniDeployDeploymentId: '' },
      b: { provider: 'comfyui', baseUrl: 'http://127.0.0.1:8188', workflowId: '', customWorkflow: '', comfyDeployApiKey: '', comfyDeployDeploymentId: '', omniDeployApiKey: '', omniDeployDeploymentId: '' },
      c: { provider: 'comfyui', baseUrl: 'http://127.0.0.1:8188', workflowId: '', customWorkflow: '', comfyDeployApiKey: '', comfyDeployDeploymentId: '', omniDeployApiKey: '', omniDeployDeploymentId: '' }
    };
  }

  const [activeTab, setActiveTab] = useState<'text' | 'image' | 'video' | 'audio' | 'threeD' | 'npcs' | 'code' | 'dev' | 'local'>('text');
  const [showDevMenu, setShowDevMenu] = useState(false);
  const [activeWorldPipeline, setActiveWorldPipeline] = useState<'a' | 'b' | 'c' | null>(null);
  interface LicenseDetails {
    is_licensed: boolean;
    expiration: string;
    uptime_limit: number;
    uptime_used: number;
    hardware_id: string;
    cap: string;
    email?: string | null;
    /** Modulos premium sueltos. Vacio en las licencias emitidas antes de existir. */
    mods: string[];
  }

  const [isLicensed, setIsLicensed] = useState<boolean>(false);
  const [hardwareId, setHardwareId] = useState<string>('');
  const [licenseInput, setLicenseInput] = useState<string>('');
  const [licenseError, setLicenseError] = useState<string>('');
  const [licenseSuccess, setLicenseSuccess] = useState<string>('');
  const [licenseDetails, setLicenseDetails] = useState<LicenseDetails | null>(null);

  const effectiveIsLicensed = Boolean(isLicensed && (licenseOnline ? licenseOnline.valid : true));
  const premiumUnlocked = Boolean((premiumUnlockedProp ?? (isLicensed && licenseDetails?.cap === 'full')) && (licenseOnline ? licenseOnline.valid : true));
  const [isFreeingVram, setIsFreeingVram] = useState(false);
  const [vramStatusMsg, setVramStatusMsg] = useState('');

  const handleFreeVram = async () => {
    setIsFreeingVram(true);
    setVramStatusMsg('');
    try {
      const comfyUrl = settings.image?.baseUrl || 'http://127.0.0.1:8188';
      const ollamaUrl = settings.text?.baseUrl || 'http://localhost:11434';

      console.log(`[Omni IA Game] User requested manual VRAM/RAM cleanup for all local engines...`);
      await flushOtherLocalProviders({
        comfyUrl,
        ollamaUrl
      });
      setVramStatusMsg('VRAM y RAM liberadas con éxito');
      setTimeout(() => setVramStatusMsg(''), 3000);
    } catch (err: any) {
      setVramStatusMsg('Memoria liberada');
      setTimeout(() => setVramStatusMsg(''), 3000);
    } finally {
      setIsFreeingVram(false);
    }
  };

  const getRemainingTimeString = (details: LicenseDetails | null): string => {
    if (!details || !details.is_licensed) return 'SIN LICENCIA';

    // LO QUE DICE EL SERVIDOR MANDA.
    //
    // El reloj de la licencia vive en el servidor desde que se activa alli: es
    // el unico sitio que sobrevive a desinstalar la aplicacion. Si ha
    // respondido, se pinta su cifra y no se calcula nada aqui; lo de abajo
    // queda para cuando no hay internet.
    const s = estadoServidor;
    if (s) {
      if (s.expires_at === 'UNLIMITED') return 'PERPETUA (ILIMITADA)';
      const partes: string[] = [];
      if (typeof s.days_left === 'number') {
        partes.push(s.days_left === 0 ? 'ULTIMO DIA' : `${s.days_left} DIAS`);
      }
      if (typeof s.minutes_left === 'number') {
        if (s.minutes_left <= 0) return 'TIEMPO DE USO AGOTADO';
        partes.push(`USO: ${Math.floor(s.minutes_left / 60)}h ${s.minutes_left % 60}m`);
      }
      if (partes.length) return partes.join(' · ');
    }

    if (details.expiration === 'UNLIMITED') return 'PERPETUA (ILIMITADA)';
    
    // Parsear fecha calendario de expiración
    const expDate = new Date(details.expiration + 'T23:59:59');
    const now = new Date();
    const diffTime = expDate.getTime() - now.getTime();
    
    if (diffTime <= 0) {
      return 'LICENCIA EXPIRADA';
    }
    
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // EL CREDITO DE CPU SE MIRA PRIMERO.
    //
    // Una licencia tiene DOS topes -la fecha de calendario y un credito de
    // minutos de uso- y basta con que se agote uno para que la aplicacion se
    // bloquee. Esto estaba despues del atajo de "quedan pocos dias", asi que con
    // 2 dias o menos se devolvian las horas de calendario y el credito no se
    // miraba nunca: la pantalla principal decia "licencia expirada" -por credito
    // agotado- mientras aqui se leia "24h RESTANTES" -de calendario-. Las dos
    // cifras eran ciertas y ninguna explicaba nada.
    if (details.uptime_limit > 0) {
      const minutesLeft = details.uptime_limit - details.uptime_used;
      if (minutesLeft <= 0) return 'TIEMPO DE CPU AGOTADO';

      const hours = Math.floor(minutesLeft / 60);
      const mins = minutesLeft % 60;
      if (diffDays <= 2) {
        const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
        return `${diffHours}h DE CALENDARIO · CPU: ${hours}h ${mins}m`;
      }
      return `${diffDays} DÍAS (CPU: ${hours}h ${mins}m RESTANTES)`;
    }

    // Sin credito de CPU, manda el calendario.
    if (diffDays <= 2) {
      const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
      return `${diffHours}h RESTANTES`;
    }

    return `${diffDays} DÍAS RESTANTES`;
  };

  useEffect(() => {
    if (!isOpen) {
      setShowDevMenu(false);
      setActiveTab('text');
      setLicenseError('');
      setLicenseSuccess('');
      return;
    }
    
    const fetchLicenseDetails = () => {
      // Sin Tauri no hay licencia que leer, y no es un error: pasa siempre en
      // `npm run dev`, que sirve la interfaz en un navegador normal. Llamar a
      // `invoke` alli lanza un TypeError opaco -"cannot read 'invoke' of
      // undefined"- que parece una averia de la validacion y no lo es. Se
      // comprueba antes y se trata como "sin licencia", que es la verdad.
      if (!hayEntornoTauri()) {
        setIsLicensed(false);
        return;
      }
      invoke<LicenseDetails>('get_license_info')
        .then(details => {
          setLicenseDetails(details);
          setIsLicensed(details.is_licensed);
          setHardwareId(details.hardware_id);
        })
        .catch(err => {
          console.error("Error al obtener detalles de licencia:", err);
          setIsLicensed(false);
        });
    };

    fetchLicenseDetails();
    // Refrescar en tiempo real cada 30 segundos
    const interval = setInterval(fetchLicenseDetails, 30000);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setShowDevMenu(prev => {
          const next = !prev;
          if (next) {
            setActiveTab('dev');
          } else {
            setActiveTab('text');
          }
          return next;
        });
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearInterval(interval);
    };
  }, [isOpen]);

  const terminalLogsRef = React.useRef<HTMLPreElement>(null);
  
  useEffect(() => {
    if (terminalLogsRef.current) {
      terminalLogsRef.current.scrollTop = terminalLogsRef.current.scrollHeight;
    }
  }, [comfyLogs, activeTab]);

  const isWebClient = typeof window !== 'undefined' && ((window as any).__OMNI_IS_WEB__ === true || !((window as any).__TAURI_INTERNALS__?.invoke));
  const comfyDirInputRef = React.useRef<HTMLInputElement>(null);
  const comfyFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSelectComfyDirectory = async () => {
    if (isWebClient) {
      const current = settings.comfyuiPath || '';
      const input = prompt("📁 Ingresa o pega la ruta de la carpeta donde está instalado ComfyUI en tu PC:\n\nEjemplo: G:\\apps\\all_comfyui_installer\\ComfyUI", current);
      if (input !== null && input.trim()) {
        updateSettings({ comfyuiPath: input.trim() });
      }
      return;
    }
    try {
      const selected = await invoke('select_directory') as string;
      if (selected) {
        updateSettings({ comfyuiPath: selected });
      }
    } catch (err) {
      if (err !== "Operación cancelada") {
        console.error("Error al seleccionar carpeta:", err);
      }
    }
  };

  const handleSelectComfyBat = async () => {
    if (isWebClient) {
      const current = settings.comfyuiPath || '';
      const input = prompt("📄 Ingresa o pega la ruta completa de tu archivo .bat de inicio de ComfyUI:\n\nEjemplo: G:\\apps\\all_comfyui_installer\\ComfyUI\\run_nvidia_gpu.bat", current);
      if (input !== null && input.trim()) {
        updateSettings({ comfyuiPath: input.trim() });
      }
      return;
    }
    try {
      const selected = await invoke('select_file', { 
        title: "Seleccionar Script de Inicio de ComfyUI", 
        extensions: ["bat", "cmd", "exe"] 
      }) as string;
      if (selected) {
        updateSettings({ comfyuiPath: selected });
      }
    } catch (err) {
      if (err !== "Operación cancelada") {
        console.error("Error al seleccionar archivo:", err);
      }
    }
  };

  const toggleTab = (tabName: 'animation' | 'npcs' | 'threeD' | 'creador2d') => {
    const currentTabs = settings.enabledTabs || { animation: true, npcs: true, threeD: true };
    const updatedTabs = {
      ...currentTabs,
      // `!== false` y no `!`: los proyectos guardados antes de existir el
      // Creador 2D no traen la clave, y `!undefined` la encenderia justo cuando
      // el usuario acaba de pulsar para apagarla.
      [tabName]: currentTabs[tabName] === false
    };
    updateSettings({ enabledTabs: updatedTabs });
    
    // Redirect if activeTab gets disabled
    if (tabName === 'animation' && currentTabs.animation && activeTab === 'video') {
      setActiveTab('text');
    } else if (tabName === 'threeD' && currentTabs.threeD && activeTab === 'threeD') {
      setActiveTab('text');
    } else if (tabName === 'npcs' && currentTabs.npcs && activeTab === 'npcs') {
      setActiveTab('text');
    }
  };
  const [npcOllamaCloudMode, setNpcOllamaCloudMode] = useState<boolean>(!!(settings.ollama?.apiKey && (settings.npcs?.provider === 'ollama' || settings.npcs?.provider === 'lm-studio')));
  const [npcModels, setNpcModels] = useState<string[]>([]);
  const [npcModelsError, setNpcModelsError] = useState('');
  const [loadingNpcModels, setLoadingNpcModels] = useState(false);
  const [pullingNpcModel, setPullingNpcModel] = useState(false);
  const [newNpcModelName, setNewNpcModelName] = useState('');

  const fetchNpcModels = async () => {
    const isLlama = settings.npcs?.provider === 'llama-server';
    const isOllama = settings.npcs?.provider === 'ollama';
    let url = settings.npcs?.baseUrl?.trim();
    if (isOllama) {
      if (!url || url.includes(':8080') || url.includes(':8088') || url.includes(':1234')) {
        url = 'http://localhost:11434';
      }
    } else if (isLlama) {
      if (!url || url.includes(':11434') || url.includes(':8080') || url.includes(':1234')) {
        url = 'http://localhost:8088/v1';
      }
    }
    setLoadingNpcModels(true);
    setNpcModelsError('');
    try {
      if (isLlama) {
        const data = await getLlamaServerModels(url || 'http://localhost:8088/v1');
        setNpcModels(data.map((m: any) => m.id));
        if (data.length === 0) {
          setNpcModelsError(`llama-server responde en ${url} pero no tiene ningún modelo cargado.`);
        }
      } else if (isOllama) {
        const data = await getOllamaModels(url || 'http://localhost:11434');
        const names = data.map((m: any) => m.name);
        setNpcModels(names);
        if (names.length > 0 && (!settings.npcs?.model || !names.includes(settings.npcs?.model))) {
          updateNpcSettings({ model: names[0] });
        }
        if (data.length === 0) {
          setNpcModelsError(`Ollama responde en ${url || 'http://localhost:11434'} pero no tiene ningún modelo descargado.`);
        }
      } else if (settings.npcs?.provider === 'lm-studio' || settings.npcs?.provider === 'other') {
        const cleanUrl = (url || 'http://localhost:1234/v1').replace(/\/$/, '');
        const endpoint = cleanUrl.includes('/v1') ? `${cleanUrl}/models` : `${cleanUrl}/v1/models`;
        const data = await pedirJsonLocal(endpoint);
        const ids: string[] = (data.data || data.models || []).map((m: any) => m.id || m.name).filter(Boolean);
        setNpcModels(ids);
      }
    } catch (e: any) {
      console.error("Error fetching NPC models:", e);
      setNpcModels([]);
      setNpcModelsError(`No se pudo leer la lista de modelos en ${url || (isOllama ? 'http://localhost:11434' : 'http://localhost:8088/v1')}. ¿Está el servidor encendido?`);
    } finally {
      setLoadingNpcModels(false);
    }
  };

  const handlePullNpcModel = async () => {
    if (!settings.npcs?.baseUrl || settings.npcs.baseUrl.trim() === '') {
      alert("La URL del servidor es necesaria para conectar con Ollama.");
      return;
    }
    if (!newNpcModelName) return;
    setPullingNpcModel(true);
    try {
      await pullOllamaModel(settings.npcs.baseUrl, newNpcModelName);
      alert(`Modelo ${newNpcModelName} descargado exitosamente.`);
      fetchNpcModels();
      setNewNpcModelName('');
    } catch (e: any) {
      alert(`Error al descargar el modelo: ${e.message || "Verifica el nombre y la conexión."}`);
    } finally {
      setPullingNpcModel(false);
    }
  };

  const [codeOllamaCloudMode, setCodeOllamaCloudMode] = useState<boolean>(!!(settings.ollama?.apiKey && (settings.code?.provider === 'ollama' || settings.code?.provider === 'lm-studio')));
  const [codeModels, setCodeModels] = useState<string[]>([]);
  const [codeModelsError, setCodeModelsError] = useState('');
  const [loadingCodeModels, setLoadingCodeModels] = useState(false);
  const [pullingCodeModel, setPullingCodeModel] = useState(false);
  const [newCodeModelName, setNewCodeModelName] = useState('');

  const fetchCodeModels = async () => {
    const isLlama = settings.code?.provider === 'llama-server';
    const isOllama = settings.code?.provider === 'ollama';
    let url = settings.code?.baseUrl?.trim();
    if (isOllama) {
      if (!url || url.includes(':8080') || url.includes(':8088') || url.includes(':1234')) {
        url = 'http://localhost:11434';
      }
    } else if (isLlama) {
      if (!url || url.includes(':11434') || url.includes(':8080') || url.includes(':1234')) {
        url = 'http://localhost:8088/v1';
      }
    }
    setLoadingCodeModels(true);
    setCodeModelsError('');
    try {
      if (isLlama) {
        const data = await getLlamaServerModels(url || 'http://localhost:8088/v1');
        setCodeModels(data.map((m: any) => m.id));
        if (data.length === 0) {
          setCodeModelsError(`llama-server responde en ${url} pero no tiene ningún modelo cargado.`);
        }
      } else if (isOllama) {
        const data = await getOllamaModels(url || 'http://localhost:11434');
        const names = data.map((m: any) => m.name);
        setCodeModels(names);
        if (names.length > 0 && (!settings.code?.model || !names.includes(settings.code?.model))) {
          updateCodeSettings({ model: names[0] });
        }
        if (data.length === 0) {
          setCodeModelsError(`Ollama responde en ${url || 'http://localhost:11434'} pero no tiene ningún modelo descargado.`);
        }
      } else if (settings.code?.provider === 'lm-studio' || settings.code?.provider === 'other') {
        const cleanUrl = (url || 'http://localhost:1234/v1').replace(/\/$/, '');
        const endpoint = cleanUrl.includes('/v1') ? `${cleanUrl}/models` : `${cleanUrl}/v1/models`;
        const data = await pedirJsonLocal(endpoint);
        const ids: string[] = (data.data || data.models || []).map((m: any) => m.id || m.name).filter(Boolean);
        setCodeModels(ids);
      }
    } catch (e: any) {
      console.error("Error fetching Code models:", e);
      setCodeModels([]);
      setCodeModelsError(`No se pudo leer la lista de modelos en ${url || (isOllama ? 'http://localhost:11434' : 'http://localhost:8088/v1')}. ¿Está el servidor encendido?`);
    } finally {
      setLoadingCodeModels(false);
    }
  };

  const handlePullCodeModel = async () => {
    if (!settings.code?.baseUrl || settings.code.baseUrl.trim() === '') {
      alert("La URL del servidor es necesaria para conectar con Ollama.");
      return;
    }
    if (!newCodeModelName) return;
    setPullingCodeModel(true);
    try {
      await pullOllamaModel(settings.code.baseUrl, newCodeModelName);
      alert(`Modelo ${newCodeModelName} descargado exitosamente.`);
      fetchCodeModels();
      setNewCodeModelName('');
    } catch (e: any) {
      alert(`Error al descargar el modelo: ${e.message || "Verifica el nombre y la conexión."}`);
    } finally {
      setPullingCodeModel(false);
    }
  };

  const [models, setModels] = useState<string[]>([]);
  const [ttsModels, setTtsModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  /** Por que no hay lista. Antes el fallo solo iba a la consola. */
  const [modelsError, setModelsError] = useState('');
  const [loadingTtsModels, setLoadingTtsModels] = useState(false);
  const [pullingModel, setPullingModel] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ 
    ollama: boolean; 
    comfyui: boolean; 
    comfydeploy?: boolean;
    omnideploy?: boolean;
    showOllama?: boolean;
    showComfy?: boolean;
    showComfyDeploy?: boolean;
    showOmniDeploy?: boolean;
    /** Motivo del resultado: distingue credenciales mal de GPU apagada. */
    omnideployMensaje?: string;
  } | null>(null);
  // Toggle para Ollama/LM-Studio: true = usar API Cloud, false = servidor local
  // Se basa en el objeto global ollama, no en text.apiKey para evitar colisiones
  const [ollamaCloudMode, setOllamaCloudMode] = useState<boolean>(!!(settings.ollama?.apiKey && (settings.text.provider === 'ollama' || settings.text.provider === 'lm-studio')));
  // Modelos cloud: estado local ÚNICAMENTE, nunca se sincroniza automáticamente al padre
  const [cloudModels, setCloudModels] = useState<string[]>([]);
  const [loadingCloudModels, setLoadingCloudModels] = useState(false);
  const [cloudModelError, setCloudModelError] = useState<string | null>(null);

  const [peModels, setPeModels] = useState<string[]>([]);
  const [loadingPEModels, setLoadingPEModels] = useState(false);

  const [videoModels, setVideoModels] = useState<string[]>([]);
  const [loadingVideoModels, setLoadingVideoModels] = useState(false);
  const [newVideoModelName, setNewVideoModelName] = useState('');
  const [pullingVideoModel, setPullingVideoModel] = useState(false);

  // Estados para modelos de código cloud
  const [fetchedCodeCloudModels, setFetchedCodeCloudModels] = useState<Record<string, string[]>>({});
  const [loadingCodeCloudModels, setLoadingCodeCloudModels] = useState<boolean>(false);
  const [codeCloudModelError, setCodeCloudModelError] = useState<string | null>(null);

  // Estados para modelos de NPC cloud
  const [fetchedNpcCloudModels, setFetchedNpcCloudModels] = useState<Record<string, string[]>>({});
  const [loadingNpcCloudModels, setLoadingNpcCloudModels] = useState<boolean>(false);
  const [npcCloudModelError, setNpcCloudModelError] = useState<string | null>(null);

  // Estados para servidores locales
  const [edgeTtsStatus, setEdgeTtsStatus] = useState<boolean>(false);
  const [vibevoiceStatus, setVibevoiceStatus] = useState<boolean>(false);
  const [loadingVibevoice, setLoadingVibevoice] = useState<boolean>(false);
  const [loadingEdge, setLoadingEdge] = useState<boolean>(false);
  /** Motivo visible cuando la voz local no arranca. Antes solo iba a la consola. */
  const [edgeMsg, setEdgeMsg] = useState<string>('');

  // Estados para pruebas de conexión individuales
  const [testStates, setTestStates] = useState<Record<string, {
    loading: boolean;
    success: boolean | null;
    message: string;
  }>>({});

  const handleTestConnection = async (section: string, provider: string, url: string, apiKey?: string) => {
    setTestStates(prev => ({
      ...prev,
      [section]: { loading: true, success: null, message: 'Probando conexión...' }
    }));
    try {
      const result = await testProviderConnection(provider, url, apiKey);
      setTestStates(prev => ({
        ...prev,
        [section]: { loading: false, success: result.success, message: result.message }
      }));
    } catch (e: any) {
      setTestStates(prev => ({
        ...prev,
        [section]: { loading: false, success: false, message: e.message || String(e) }
      }));
    }
  };

  /**
   * Credenciales de OmniDeploy de una seccion.
   *
   * Se resuelven AQUI y no en cada llamada del verificador porque los ternarios
   * de quien lo pinta se escribieron para ComfyDeploy y a OmniDeploy no lo
   * contemplaba ninguno de los cinco: caia al `else` y recibia la baseUrl como
   * Deployment ID y una apiKey vacia. De ahi el "faltan el Deployment ID o la
   * API Key" con los campos rellenos. Centralizado, no hay un sexto sitio donde
   * olvidarlo.
   */
  const credencialesOmniDeploy = (section: string): { id: string; clave: string } => {
    // Los pipelines de Mundos llevan un identificador dinamico, `world-pipe-a`,
    // asi que no caben en el switch por igualdad.
    if (section.startsWith('world-pipe-')) {
      const id = section.slice('world-pipe-'.length) as 'a' | 'b' | 'c';
      const w = settings.worldWorkflows?.[id];
      return { id: w?.omniDeployDeploymentId || '', clave: w?.omniDeployApiKey || '' };
    }
    switch (section) {
      case 'image':
        return {
          id: settings.image.omniDeployDeploymentId || '',
          clave: settings.image.omniDeployApiKey || '',
        };
      case 'video':
        return {
          id: settings.video.omniDeployDeploymentId || '',
          clave: settings.video.omniDeployApiKey || '',
        };
      case 'audio-tts':
        return {
          id: settings.audio.ttsOmniDeployDeploymentId || '',
          clave: settings.audio.ttsOmniDeployApiKey || '',
        };
      case 'audio-music':
        return {
          id: settings.audio.musicOmniDeployDeploymentId || '',
          clave: settings.audio.musicOmniDeployApiKey || '',
        };
      case 'threeD':
        return {
          id: settings.threeD.omniDeployDeploymentId || '',
          clave: settings.threeD.omniDeployApiKey || '',
        };
      // Textos: van al Ollama del proveedor, no a ComfyUI, pero el relay y las
      // credenciales son los mismos.
      case 'text':
        return {
          id: settings.text.omniDeployDeploymentId || '',
          clave: settings.text.omniDeployApiKey || '',
        };
      case 'npcs':
        return {
          id: settings.npcs?.omniDeployDeploymentId || '',
          clave: settings.npcs?.omniDeployApiKey || '',
        };
      case 'code':
        return {
          id: settings.code?.omniDeployDeploymentId || '',
          clave: settings.code?.omniDeployApiKey || '',
        };
      default:
        return { id: '', clave: '' };
    }
  };

  const renderTestConnectionWidget = (section: string, provider: string, url: string, apiKey?: string) => {
    const state = testStates[section] || { loading: false, success: null, message: '' };
    if (provider === 'omnideploy') {
      const c = credencialesOmniDeploy(section);
      url = c.id;
      apiKey = c.clave;
    }
    return (
      <div className="mt-3 p-3 bg-slate-900/60 border border-slate-800 rounded-lg flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-[10px] uppercase font-bold text-slate-400">Verificador del Canal</span>
          <button
            type="button"
            disabled={state.loading}
            onClick={() => handleTestConnection(section, provider, url, apiKey)}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-[11px] font-bold text-slate-300 rounded border border-slate-700 flex items-center gap-1.5 transition-all"
          >
            {state.loading ? <Loader2 className="w-3 h-3 animate-spin text-blue-400" /> : <RefreshCw className="w-3 h-3 text-slate-400" />}
            {state.loading ? 'PROBANDO...' : 'PROBAR CONEXIÓN'}
          </button>
        </div>
        {state.message && (
          <div className={`text-xs p-2 rounded flex items-start gap-2 animate-in fade-in slide-in-from-top-1 ${
            state.success === true 
              ? 'bg-green-950/40 border border-green-800/40 text-green-300' 
              : state.success === false
                ? 'bg-red-950/40 border border-red-800/40 text-red-300'
                : 'bg-slate-900 border border-slate-800 text-slate-300'
          }`}>
            {state.success === true && <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />}
            {state.success === false && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
            <span className="whitespace-pre-wrap leading-relaxed">{state.message}</span>
          </div>
        )}
      </div>
    );
  };

  const ttsWorkflowInputRef = React.useRef<HTMLInputElement>(null);
  const videoWorkflowInputRef = React.useRef<HTMLInputElement>(null);
  const imageWorkflowInputRef = React.useRef<HTMLInputElement>(null);
  const worldWorkflowInputRefA = React.useRef<HTMLInputElement>(null);
  const worldWorkflowInputRefB = React.useRef<HTMLInputElement>(null);
  const worldWorkflowInputRefC = React.useRef<HTMLInputElement>(null);

  const handleTtsWorkflowUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        updateSettings({ audio: { ...settings.audio, ttsCustomWorkflow: content } });
      };
      reader.readAsText(file);
    }
  };

  const handleVideoWorkflowUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        updateVideoSettings({ customWorkflow: content });
      };
      reader.readAsText(file);
    }
  };

  const handleImageWorkflowUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        updateImageSettings({ customWorkflow: content });
      };
      reader.readAsText(file);
    }
  };

  const handleWorldWorkflowUpload = (pipeline: 'a' | 'b' | 'c') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        updateWorldWorkflow(pipeline, { customWorkflow: content });
      };
      reader.readAsText(file);
    }
  };

  const audioServiceStatus = settings.audio.ttsProvider === 'local' ? edgeTtsStatus : false;

  // La lista se pedia SOLO al abrir el modal. Si ya estabas dentro y cambiabas
  // el proveedor a Ollama -que es justo lo que hace cualquiera- no se pedia
  // nunca, y el desplegable se quedaba con el unico valor que ya tenia guardado.
  // Tambien se reintenta al corregir la URL del servidor.
  useEffect(() => {
    if (!isOpen) return;
    if ((settings.text.provider === 'ollama' && !ollamaCloudMode) || settings.text.provider === 'llama-server') {
      fetchModels();
    } else {
      setModels([]);
      setModelsError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, settings.text.provider, settings.text.baseUrl, ollamaCloudMode]);

  useEffect(() => {
    if (!isOpen) return;
    if ((settings.npcs?.provider === 'ollama' && !npcOllamaCloudMode) || settings.npcs?.provider === 'llama-server') fetchNpcModels();
    else { setNpcModels([]); setNpcModelsError(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, settings.npcs?.provider, settings.npcs?.baseUrl, npcOllamaCloudMode]);

  useEffect(() => {
    if (!isOpen) return;
    if ((settings.code?.provider === 'ollama' && !codeOllamaCloudMode) || settings.code?.provider === 'llama-server') fetchCodeModels();
    else { setCodeModels([]); setCodeModelsError(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, settings.code?.provider, settings.code?.baseUrl, codeOllamaCloudMode]);

  useEffect(() => {
    if (isOpen) {
      setTestResult(null);
      if ((settings.text.provider === 'ollama' && !ollamaCloudMode) || settings.text.provider === 'llama-server') {
        fetchModels();
      }
      if ((settings.npcs?.provider === 'ollama' && !npcOllamaCloudMode) || settings.npcs?.provider === 'llama-server') {
        fetchNpcModels();
      }
      if ((settings.code?.provider === 'ollama' && !codeOllamaCloudMode) || settings.code?.provider === 'llama-server') {
        fetchCodeModels();
      }
      if (settings.audio.ttsProvider === 'ollama' || settings.audio.ttsProvider === 'lm-studio' || settings.audio.ttsProvider === 'llama-server') {
        fetchTtsModels();
      }
      if (settings.promptEngineer?.enabled && !settings.promptEngineer?.useTextProvider && (settings.promptEngineer?.provider === 'ollama' || settings.promptEngineer?.provider === 'llama-server' || settings.promptEngineer?.provider === 'lm-studio' || settings.promptEngineer?.provider === 'other')) {
        fetchPEModels();
      }
      if (settings.video.provider === 'ollama' || settings.video.provider === 'lm-studio') {
        fetchVideoModels();
      }
      checkLocalServices();
    }
  }, [isOpen, settings.text.provider, settings.text.baseUrl, settings.npcs?.provider, settings.npcs?.baseUrl, settings.code?.provider, settings.code?.baseUrl, settings.audio.ttsProvider, settings.audio.ttsUrl, settings.promptEngineer?.provider, settings.promptEngineer?.baseUrl, settings.promptEngineer?.useTextProvider, settings.promptEngineer?.enabled, settings.video.provider, settings.video.baseUrl, npcOllamaCloudMode, codeOllamaCloudMode]);

  const checkLocalServices = async () => {
    try {
      const llamaPort = settings.llamaCpp?.port || 8088;
      const edge = await invoke<boolean>('check_service_status', { url: 'http://localhost:5000/api/voices' }).catch(() => false);
      const vibe = await invoke<boolean>('check_service_status', { url: 'http://localhost:5001/api/status' }).catch(() => false);
      const llama = await invoke<boolean>('check_service_status', { url: `http://127.0.0.1:${llamaPort}/v1/models` }).catch(() => false);
      setEdgeTtsStatus(edge);
      setVibevoiceStatus(vibe);
      setLlamaServerRunning(llama);
    } catch (e) {
      console.error("Error checking services:", e);
    }
  };

  const [llamaServerRunning, setLlamaServerRunning] = useState<boolean>(false);
  const [llamaServerLoading, setLlamaServerLoading] = useState<boolean>(false);
  const [llamaStarting, setLlamaStarting] = useState<boolean>(false);
  const [hfModelInput, setHfModelInput] = useState<string>('ggml-org/gemma-4-12B-it-GGUF:Q4_K_M');
  const [localGgufModels, setLocalGgufModels] = useState<GgufModelInfo[]>([]);
  const [loadingGgufModels, setLoadingGgufModels] = useState<boolean>(false);

  const scanGgufFolder = async (folderPath?: string) => {
    const dir = folderPath || settings.llamaCpp?.modelsDir;
    if (!dir || dir.trim() === '') {
      setLocalGgufModels([]);
      return;
    }
    setLoadingGgufModels(true);
    try {
      const models = await listGgufModels(dir);
      setLocalGgufModels(models);
      // Si el modelo actual está vacío, es un tag de Hugging Face o no existe como archivo local:
      const currentIsLocal = models.some(m => m.path === settings.llamaCpp?.modelPath);
      const isExternalValidFile = settings.llamaCpp?.modelPath && 
        (settings.llamaCpp.modelPath.endsWith('.gguf') || settings.llamaCpp.modelPath.endsWith('.bin')) && 
        (settings.llamaCpp.modelPath.includes('\\') || settings.llamaCpp.modelPath.includes(':/'));
      
      if (models.length > 0 && !currentIsLocal && !isExternalValidFile) {
        updateSettings({
          llamaCpp: {
            ...settings.llamaCpp,
            modelPath: models[0].path
          }
        });
        const filename = models[0].name;
        updateTextSettings({ model: filename });
      }
    } catch (e) {
      console.warn('[LLama.cpp] Error escaneando carpeta GGUF:', e);
    } finally {
      setLoadingGgufModels(false);
    }
  };

  const handleSelectModelsDir = async () => {
    try {
      const selected = await invoke<string>('select_directory');
      if (selected && selected.trim()) {
        updateSettings({
          llamaCpp: {
            ...settings.llamaCpp,
            modelsDir: selected
          }
        });
        await scanGgufFolder(selected);
      }
    } catch (e: any) {
      if (e !== 'Operación cancelada') {
        console.warn('[LLama.cpp] Error seleccionando directorio:', e);
      }
    }
  };

  const checkLlamaStatus = async () => {
    const llamaPort = settings.llamaCpp?.port || 8088;
    const state = await getLlamaServerState(settings.text.baseUrl || `http://localhost:${llamaPort}/v1`);
    setLlamaServerRunning(state.alive);
    setLlamaServerLoading(state.loading);
  };

  useEffect(() => {
    if (isOpen && settings.llamaCpp?.modelsDir) {
      scanGgufFolder(settings.llamaCpp.modelsDir);
    }
  }, [isOpen, settings.llamaCpp?.modelsDir]);

  const handleSelectGguf = async (targetTab: 'text' | 'npcs' | 'code' | 'pe' | 'video' | 'tts') => {
    const path = await selectGgufFile();
    if (path) {
      updateSettings({
        llamaCpp: {
          ...settings.llamaCpp,
          modelPath: path
        }
      });
      const filename = path.split(/[\/\\]/).pop() || path;
      if (targetTab === 'text') updateTextSettings({ model: filename });
      else if (targetTab === 'npcs') updateNpcSettings({ model: filename });
      else if (targetTab === 'code') updateCodeSettings({ model: filename });
      else if (targetTab === 'pe') updateSettings({ promptEngineer: { ...settings.promptEngineer, model: filename } });
      else if (targetTab === 'video') updateVideoSettings({ model: filename });
      else if (targetTab === 'tts') updateAudioSettings({ ttsModel: filename }, 'tts');

      // Iniciar automáticamente llama-server.exe con el nuevo modelo seleccionado
      handleStartLlamaServer(path).catch(() => {});
    }
  };

  const handleStartLlamaServer = async (customModel?: string) => {
    setLlamaStarting(true);
    try {
      const modelToRun = customModel || settings.llamaCpp?.modelPath || hfModelInput || 'ggml-org/gemma-4-12B-it-GGUF:Q4_K_M';
      const portToUse = settings.llamaCpp?.port || 8088;
      await startLlamaServer({
        modelPath: modelToRun,
        hfToken: settings.llamaCpp?.hfToken || undefined,
        gpuLayers: settings.llamaCpp?.gpuLayers ?? 999,
        contextSize: settings.llamaCpp?.contextSize || 16384,
        threads: settings.llamaCpp?.threads || 4,
        port: portToUse,
      });
      updateSettings({
        llamaCpp: {
          ...settings.llamaCpp,
          modelPath: modelToRun
        }
      });
      const modelName = modelToRun.split(/[\/\\]/).pop() || modelToRun;
      updateTextSettings({ model: modelName });
      
      // Esperar hasta que responda el servidor (puede estar en estado Loading 503)
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const state = await getLlamaServerState(`http://localhost:${portToUse}/v1`);
        if (state.alive) {
          setLlamaServerRunning(true);
          setLlamaServerLoading(state.loading);
          if (!state.loading) {
            await fetchModels();
            break;
          }
        }
      }
      await checkLlamaStatus();
    } catch (e: any) {
      alert(`Error al iniciar llama-server: ${e?.message || e}`);
    } finally {
      setLlamaStarting(false);
    }
  };

  const handleStopLlamaServer = async () => {
    await stopLlamaServer();
    await new Promise(r => setTimeout(r, 600));
    await checkLlamaStatus();
  };

  const renderLlamaCppPanel = (targetTab: 'text' | 'npcs' | 'code' | 'pe' | 'video' | 'tts') => {
    const popularHfModels = [
      'ggml-org/gemma-4-12B-it-GGUF:Q4_K_M',
      'unsloth/gemma-3-12b-it-GGUF:Q4_K_M',
      'Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M',
      'bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M',
      'bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF:Q4_K_M'
    ];
    const currentPort = settings.llamaCpp?.port || 8088;

    return (
      <div className="space-y-4 p-4 bg-slate-950 border border-amber-500/40 rounded-xl animate-in fade-in slide-in-from-top-2 shadow-lg">
        {/* Cabecera con Estado del Servidor */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-amber-400" />
            <div>
              <h4 className="text-xs font-bold uppercase text-amber-300 font-mono tracking-wider">MOTOR NATIVO LLAMA.CPP (llama-server)</h4>
              <p className="text-[10px] text-slate-400">Inferencia local C++/CUDA sin intermediarios con soporte GGUF y Hugging Face.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {llamaServerRunning ? (
              llamaServerLoading ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-600 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  CARGANDO EN VRAM... (:{currentPort})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  ACTIVO : {currentPort}
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-rose-950/60 text-rose-300 border border-rose-800">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                DETENIDO
              </span>
            )}

            {llamaServerRunning ? (
              <button
                type="button"
                onClick={handleStopLlamaServer}
                className="px-2.5 py-1 bg-rose-900/80 hover:bg-rose-800 text-rose-100 border border-rose-600 rounded text-[10px] font-bold transition-all"
              >
                Detener
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleStartLlamaServer()}
                disabled={llamaStarting}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-bold flex items-center gap-1.5 transition-all shadow-md disabled:opacity-50"
              >
                {llamaStarting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Iniciar Servidor
              </button>
            )}
          </div>
        </div>

        {/* 1. CARPETA DE MODELOS GGUF & SELECTOR BOX */}
        <div className="bg-slate-900/80 border border-amber-500/30 rounded-lg p-3 space-y-3">
          <div>
            <label className="block text-xs font-bold text-amber-300 uppercase mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-amber-400" />
                Carpeta de Modelos GGUF
              </span>
              {settings.llamaCpp?.modelsDir && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {localGgufModels.length} modelo(s) encontrado(s)
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.llamaCpp?.modelsDir || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  updateSettings({ llamaCpp: { ...settings.llamaCpp, modelsDir: val } });
                }}
                placeholder="ej: F:\LLAMA.CPP o C:\Modelos"
                className="flex-1 bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 font-mono focus:border-amber-400 outline-none"
              />
              <button
                type="button"
                onClick={handleSelectModelsDir}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <Folder className="w-3.5 h-3.5 text-amber-400" />
                Examinar Carpeta
              </button>
              <button
                type="button"
                onClick={() => scanGgufFolder()}
                disabled={loadingGgufModels || !settings.llamaCpp?.modelsDir}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded disabled:opacity-50"
                title="Recargar modelos de la carpeta"
              >
                <RefreshCw className={`w-4 h-4 ${loadingGgufModels ? 'animate-spin text-amber-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* BOX DE SELECCIÓN DE MODELO GGUF */}
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1 flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-amber-400" />
              Seleccionar Modelo GGUF para Llama.cpp
            </label>
            <div className="flex gap-2">
              <select
                value={
                  localGgufModels.some(m => m.path === settings.llamaCpp?.modelPath)
                    ? settings.llamaCpp?.modelPath
                    : (localGgufModels.length > 0 && (!settings.llamaCpp?.modelPath || !settings.llamaCpp?.modelPath.includes('\\')) ? localGgufModels[0].path : (settings.llamaCpp?.modelPath || ''))
                }
                onChange={(e) => {
                  const val = e.target.value;
                  updateSettings({ llamaCpp: { ...settings.llamaCpp, modelPath: val } });
                  const filename = val.split(/[\/\\]/).pop() || val;
                  if (targetTab === 'text') updateTextSettings({ model: filename });
                  else if (targetTab === 'npcs') updateNpcSettings({ model: filename });
                  else if (targetTab === 'code') updateCodeSettings({ model: filename });
                  else if (targetTab === 'pe') updateSettings({ promptEngineer: { ...settings.promptEngineer, model: filename } });
                  else if (targetTab === 'video') updateVideoSettings({ model: filename });
                  else if (targetTab === 'tts') updateAudioSettings({ ttsModel: filename }, 'tts');
                }}
                className="flex-1 bg-slate-950 border border-amber-500/40 rounded p-2 text-xs text-amber-200 font-mono focus:border-amber-400 outline-none"
              >
                {localGgufModels.length > 0 ? (
                  localGgufModels.map((m) => (
                    <option key={m.path} value={m.path}>
                      {m.name} ({m.size_formatted})
                    </option>
                  ))
                ) : (
                  <option value={settings.llamaCpp?.modelPath && (settings.llamaCpp.modelPath.endsWith('.gguf') || settings.llamaCpp.modelPath.endsWith('.bin')) ? settings.llamaCpp.modelPath : ''}>
                    {settings.llamaCpp?.modelPath && (settings.llamaCpp.modelPath.endsWith('.gguf') || settings.llamaCpp.modelPath.endsWith('.bin'))
                      ? settings.llamaCpp.modelPath.split(/[\/\\]/).pop()
                      : 'Ningún modelo GGUF detectado en la carpeta'}
                  </option>
                )}
              </select>
              <button
                type="button"
                onClick={() => {
                  const activeModel = (localGgufModels.length > 0 && (!settings.llamaCpp?.modelPath || !localGgufModels.some(m => m.path === settings.llamaCpp?.modelPath)))
                    ? localGgufModels[0].path
                    : settings.llamaCpp?.modelPath;
                  if (activeModel) {
                    handleStartLlamaServer(activeModel);
                  }
                }}
                disabled={llamaStarting || (!settings.llamaCpp?.modelPath && localGgufModels.length === 0)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded text-xs font-bold flex items-center gap-1.5 transition-all shadow"
              >
                {llamaStarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                CARGAR ESTE MODELO
              </button>
            </div>
            {settings.llamaCpp?.modelPath && (
              <p className="text-[10px] text-slate-400 font-mono mt-1 truncate">
                <span className="text-amber-400 font-bold">Modelo activo: </span>
                {settings.llamaCpp.modelPath.split(/[\/\\]/).pop()}
              </p>
            )}
          </div>
        </div>

        {/* 2. BOX DE DESCARGA DIRECTA DESDE HUGGING FACE (-hf) */}
        <div className="bg-amber-950/20 border border-amber-500/30 rounded-lg p-3 space-y-2">
          <label className="block text-xs font-bold text-amber-300 uppercase flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5 text-amber-400" />
            Descarga Directa desde Hugging Face (-hf)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={hfModelInput}
              onChange={(e) => setHfModelInput(e.target.value)}
              placeholder="ggml-org/gemma-4-12B-it-GGUF:Q4_K_M"
              className="flex-1 bg-slate-900 border border-amber-500/40 rounded p-2 text-xs text-amber-200 font-mono focus:border-amber-400 outline-none"
            />
            <button
              type="button"
              onClick={() => handleStartLlamaServer(hfModelInput)}
              disabled={llamaStarting || !hfModelInput.trim()}
              className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded text-xs font-bold flex items-center gap-1.5 transition-all shadow-md disabled:opacity-50"
            >
              {llamaStarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              DESCARGAR E INICIAR
            </button>
          </div>

          {/* TOKEN DE HUGGING FACE (OPCIONAL/GATED) */}
          <div className="pt-1">
            <label className="block text-[10px] text-amber-400/90 font-semibold uppercase mb-0.5">
              Hugging Face Access Token (Requerido para modelos protegidos como Gemma o Llama):
            </label>
            <input
              type="password"
              value={settings.llamaCpp?.hfToken || ''}
              onChange={(e) => updateSettings({ llamaCpp: { ...settings.llamaCpp, hfToken: e.target.value } })}
              placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-slate-900 border border-amber-500/30 rounded p-1.5 text-xs text-amber-200 font-mono focus:border-amber-400 outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] text-slate-400 font-semibold">Modelos sugeridos:</span>
            {popularHfModels.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setHfModelInput(m)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-all ${hfModelInput === m ? 'bg-amber-600 text-white border-amber-400' : 'bg-slate-900/80 text-amber-300/80 border-slate-700 hover:bg-slate-800 hover:text-amber-200'}`}
              >
                {m.split('/')[1] || m}
              </button>
            ))}
          </div>
        </div>

        {/* 3. O SELECCIONAR ARCHIVO SUELTO FUERA DE LA CARPETA */}
        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase mb-1 flex items-center gap-1.5">
            <File className="w-3.5 h-3.5 text-slate-400" />
            O Seleccionar Archivo .GGUF Individual en Disco (Fuera de la carpeta)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={
                settings.llamaCpp?.modelPath && 
                !localGgufModels.some(m => m.path === settings.llamaCpp?.modelPath) &&
                (settings.llamaCpp.modelPath.endsWith('.gguf') || settings.llamaCpp.modelPath.endsWith('.bin') || settings.llamaCpp.modelPath.includes('\\') || settings.llamaCpp.modelPath.includes(':/'))
                  ? settings.llamaCpp.modelPath
                  : ''
              }
              onChange={(e) => {
                const val = e.target.value;
                updateSettings({ llamaCpp: { ...settings.llamaCpp, modelPath: val } });
                const filename = val.split(/[\/\\]/).pop() || val;
                if (targetTab === 'text') updateTextSettings({ model: filename });
                else if (targetTab === 'npcs') updateNpcSettings({ model: filename });
                else if (targetTab === 'code') updateCodeSettings({ model: filename });
              }}
              placeholder="C:\Modelos\mi-modelo-individual.gguf"
              className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 font-mono focus:border-slate-500 outline-none"
            />
            <button
              type="button"
              onClick={() => handleSelectGguf(targetTab)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <Folder className="w-3.5 h-3.5 text-amber-400" />
              Examinar .GGUF
            </button>
          </div>
        </div>

        {/* 4. PARÁMETROS DE HARDWARE (-ngl, -c, -t, puerto) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
          <Tooltip id="settingsLlamaGpuLayers" showTooltips={showTooltips} className="block">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
                <Cpu className="w-3 h-3 text-amber-400" /> Capas GPU (-ngl)
              </label>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={settings.llamaCpp?.gpuLayers ?? 999}
                  onChange={(e) => updateSettings({ llamaCpp: { ...settings.llamaCpp, gpuLayers: parseInt(e.target.value) || 0 } })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 font-mono text-center"
                />
                <button
                  type="button"
                  onClick={() => updateSettings({ llamaCpp: { ...settings.llamaCpp, gpuLayers: 999 } })}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] rounded font-bold text-amber-400"
                  title="Cargar todas las capas en la VRAM de la GPU"
                >
                  MAX
                </button>
              </div>
              <span className="text-[9px] text-slate-500">999 = Offload GPU</span>
            </div>
          </Tooltip>

          <Tooltip id="settingsLlamaContext" showTooltips={showTooltips} className="block">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                Contexto (-c)
              </label>
              <select
                value={settings.llamaCpp?.contextSize || 16384}
                onChange={(e) => updateSettings({ llamaCpp: { ...settings.llamaCpp, contextSize: parseInt(e.target.value) || 16384 } })}
                className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 font-mono"
              >
                <option value={2048}>2048 tokens</option>
                <option value={4096}>4096 tokens</option>
                <option value={8192}>8192 tokens</option>
                <option value={16384}>16384 tokens (Recomendado)</option>
                <option value={32768}>32768 tokens</option>
              </select>
              <span className="text-[9px] text-slate-500">Ventana tokens</span>
            </div>
          </Tooltip>

          <Tooltip id="settingsLlamaThreads" showTooltips={showTooltips} className="block">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                Hilos CPU (-t)
              </label>
              <input
                type="number"
                min={1}
                max={64}
                value={settings.llamaCpp?.threads || 4}
                onChange={(e) => updateSettings({ llamaCpp: { ...settings.llamaCpp, threads: parseInt(e.target.value) || 4 } })}
                className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 font-mono text-center"
              />
              <span className="text-[9px] text-slate-500">Hilos CPU</span>
            </div>
          </Tooltip>

          <Tooltip id="settingsLlamaPort" showTooltips={showTooltips} className="block">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                Puerto (--port)
              </label>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={currentPort}
                  onChange={(e) => {
                    const p = parseInt(e.target.value) || 8088;
                    updateSettings({ llamaCpp: { ...settings.llamaCpp, port: p } });
                    const newUrl = `http://localhost:${p}/v1`;
                    if (targetTab === 'text') updateTextSettings({ baseUrl: newUrl });
                    else if (targetTab === 'npcs') updateNpcSettings({ baseUrl: newUrl });
                    else if (targetTab === 'code') updateCodeSettings({ baseUrl: newUrl });
                    else if (targetTab === 'pe') updateSettings({ promptEngineer: { ...settings.promptEngineer, baseUrl: newUrl } });
                    else if (targetTab === 'video') updateVideoSettings({ baseUrl: newUrl });
                    else if (targetTab === 'tts') updateAudioSettings({ ttsUrl: newUrl }, 'tts');
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 font-mono text-center"
                />
                <button
                  type="button"
                  onClick={() => {
                    updateSettings({ llamaCpp: { ...settings.llamaCpp, port: 8088 } });
                    const newUrl = `http://localhost:8088/v1`;
                    if (targetTab === 'text') updateTextSettings({ baseUrl: newUrl });
                    else if (targetTab === 'npcs') updateNpcSettings({ baseUrl: newUrl });
                    else if (targetTab === 'code') updateCodeSettings({ baseUrl: newUrl });
                    else if (targetTab === 'pe') updateSettings({ promptEngineer: { ...settings.promptEngineer, baseUrl: newUrl } });
                    else if (targetTab === 'video') updateVideoSettings({ baseUrl: newUrl });
                    else if (targetTab === 'tts') updateAudioSettings({ ttsUrl: newUrl }, 'tts');
                  }}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] rounded font-bold text-amber-300"
                  title="Usar puerto 8088 (evita 8080 de SearXNG)"
                >
                  :8088
                </button>
              </div>
              <span className="text-[9px] text-slate-500">Puerto servidor</span>
            </div>
          </Tooltip>
        </div>

        {/* URL / Endpoint y Recarga */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
          <div className="flex-1 mr-3">
            <label className="block text-[10px] text-slate-500 uppercase mb-0.5">Endpoint API OpenAI-Compatible</label>
            <input
              type="text"
              value={
                targetTab === 'text' ? settings.text.baseUrl :
                targetTab === 'npcs' ? (settings.npcs?.baseUrl || '') :
                targetTab === 'code' ? (settings.code?.baseUrl || '') :
                targetTab === 'pe' ? (settings.promptEngineer?.baseUrl || '') :
                targetTab === 'video' ? (settings.video?.baseUrl || '') :
                (settings.audio?.ttsUrl || '')
              }
              onChange={(e) => {
                const val = e.target.value;
                if (targetTab === 'text') updateTextSettings({ baseUrl: val });
                else if (targetTab === 'npcs') updateNpcSettings({ baseUrl: val });
                else if (targetTab === 'code') updateCodeSettings({ baseUrl: val });
                else if (targetTab === 'pe') updateSettings({ promptEngineer: { ...settings.promptEngineer, baseUrl: val } });
                else if (targetTab === 'video') updateVideoSettings({ baseUrl: val });
                else if (targetTab === 'tts') updateAudioSettings({ ttsUrl: val }, 'tts');
              }}
              placeholder={`http://localhost:${currentPort}/v1`}
              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-300 font-mono"
            />
          </div>
          <button
            type="button"
            onClick={async () => {
              await checkLlamaStatus();
              await fetchModels();
            }}
            className="mt-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1.5 font-bold"
          >
            <RefreshCw className={`w-3 h-3 ${loadingModels ? 'animate-spin' : ''}`} />
            Probar Conexión
          </button>
        </div>
      </div>
    );
  };

  const handleToggleVibevoice = async () => {
    setLoadingVibevoice(true);
    try {
      if (vibevoiceStatus) {
        await invoke('stop_vibevoice');
        setVibevoiceStatus(false);
      } else {
        await invoke('launch_vibevoice');
        // Esperar un poco a que arranque
        setTimeout(checkLocalServices, 3000);
      }
    } catch (e) {
      console.error("Vibevoice error:", e);
    } finally {
      setLoadingVibevoice(false);
    }
  };

  const handleToggleEdge = async () => {
    setLoadingEdge(true);
    try {
      if (edgeTtsStatus) {
        await invoke('stop_edge_tts');
        setEdgeTtsStatus(false);
      } else {
        // El instalador ya dejo Python y edge-tts listos, asi que esto arranca
        // en segundos. Solo si aquello fallo hay que preparar nada, y entonces
        // el mensaje de abajo lo dira.
        setEdgeMsg('Iniciando el servidor de voz…');
        await invoke('launch_edge_tts');

        // LA PRIMERA VEZ NO TARDA 2 SEGUNDOS.
        //
        // Se comprobaba una sola vez a los 2 s, pero en un equipo sin Python hay
        // que extraerlo e instalar 24 paquetes. Daba "apagado" y parecia que el
        // boton no hacia nada. Ahora se sondea hasta 90 s.
        let vivo = false;
        for (let i = 0; i < 30 && !vivo; i += 1) {
          await new Promise((r) => setTimeout(r, 3000));
          vivo = await invoke<boolean>('check_service_status', { url: 'http://127.0.0.1:5000' }).catch(() => false);
        }
        setEdgeTtsStatus(vivo);
        setEdgeMsg(
          vivo
            ? ''
            : 'El servidor de voz no respondió. Mira si un antivirus bloqueó la instalación de Python en %LOCALAPPDATA%\\Omni IA Game\\python.',
        );
        checkLocalServices();
      }
    } catch (e: any) {
      // EL ERROR SE VE. Iba a `console.error`, que en la aplicacion empaquetada
      // no existe para el usuario: fallara lo que fallara, el boton parecia no
      // hacer nada.
      const motivo = typeof e === 'string' ? e : e?.message || String(e);
      console.error('Edge error:', e);
      setEdgeMsg(`No se pudo iniciar la voz local: ${motivo}`);
    } finally {
      setLoadingEdge(false);
    }
  };

  const handleMusicWorkflowUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        updateAudioSettings({ musicCustomWorkflow: content });
      };
      reader.readAsText(file);
    }
  };

  const handleThreeDWorkflowUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        updateThreeDSettings({ customWorkflow: content });
      };
      reader.readAsText(file);
    }
  };

  const updateThreeDSettings = (updates: Partial<ProjectData['apiSettings']['threeD']>) => {
    const currentProvider = updates.provider || settings.threeD.provider;
    const newApiKeys = { ...settings.threeD.apiKeys };
    if (updates.apiKey !== undefined) {
      newApiKeys[currentProvider] = updates.apiKey;
    } else if (updates.provider !== undefined) {
      updates.apiKey = newApiKeys[updates.provider] || '';
    }

    updateSettings({
      threeD: {
        ...settings.threeD,
        ...updates,
        apiKeys: newApiKeys
      }
    });
  };

  const handleSfxWorkflowUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        updateAudioSettings({ sfxCustomWorkflow: content });
      };
      reader.readAsText(file);
    }
  };

  const handleSaveAndTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
      if (!invokeFn) {
        throw new Error("API de Tauri no disponible");
      }

      // 1. Determinar de forma dinámica qué servicios verificar según la pestaña ACTIVA en el modal
      const isTextTab = activeTab === 'text';
      const isImageTab = activeTab === 'image';
      const isVideoTab = activeTab === 'video';
      const isAudioTab = activeTab === 'audio';
      const isThreeDTab = activeTab === 'threeD';

      const usesLocalOllama = (isTextTab && settings.text.provider === 'ollama') || settings.promptEngineer.provider === 'ollama';
      
      const usesLocalComfy = 
        (isImageTab && settings.image.provider === 'comfyui') ||
        (isVideoTab && settings.video.provider === 'comfyui') ||
        (isThreeDTab && settings.threeD.provider === 'comfyui') ||
        (isAudioTab && (settings.audio.ttsProvider === 'comfyui' || settings.audio.musicProvider === 'comfyui'));

      const usesComfyDeploy = 
        (isImageTab && settings.image.provider === 'comfydeploy') ||
        (isVideoTab && settings.video.provider === 'comfydeploy') ||
        (isThreeDTab && settings.threeD.provider === 'comfydeploy') ||
        (isAudioTab && (settings.audio.ttsProvider === 'comfydeploy' || settings.audio.musicProvider === 'comfydeploy'));

      // OmniDeploy: la GPU del proveedor, a traves del relay propio.
      const usesOmniDeploy =
        (isImageTab && settings.image.provider === 'omnideploy') ||
        (isVideoTab && settings.video.provider === 'omnideploy') ||
        (isThreeDTab && settings.threeD.provider === 'omnideploy') ||
        (isAudioTab && (settings.audio.ttsProvider === 'omnideploy' || settings.audio.musicProvider === 'omnideploy'));

      // Intentar conexión con Ollama
      let ollamaActive = true;
      if (usesLocalOllama) {
        ollamaActive = await invokeFn('check_service_status', {
          url: settings.text.baseUrl
        }).catch(() => false);
      }

      // Intentar conexión con ComfyUI
      let comfyActive = true;
      if (usesLocalComfy) {
        const comfyUrl = isThreeDTab ? settings.threeD.baseUrl : settings.image.baseUrl;
        comfyActive = await invokeFn('check_service_status', {
          url: comfyUrl
        }).catch(() => false);
      }

      // Intentar conexión con ComfyDeploy
      let comfydeployActive = true;
      if (usesComfyDeploy) {
        if (isImageTab && settings.image.provider === 'comfydeploy') {
          const res = await testProviderConnection('comfydeploy', settings.image.comfyDeployDeploymentId || '', settings.image.comfyDeployApiKey);
          if (!res.success) comfydeployActive = false;
        }
        if (isVideoTab && settings.video.provider === 'comfydeploy') {
          const res = await testProviderConnection('comfydeploy', settings.video.comfyDeployDeploymentId || '', settings.video.comfyDeployApiKey);
          if (!res.success) comfydeployActive = false;
        }
        if (isAudioTab && settings.audio.ttsProvider === 'comfydeploy') {
          const res = await testProviderConnection('comfydeploy', settings.audio.ttsComfyDeployDeploymentId || '', settings.audio.ttsComfyDeployApiKey);
          if (!res.success) comfydeployActive = false;
        }
        if (isAudioTab && settings.audio.musicProvider === 'comfydeploy') {
          const res = await testProviderConnection('comfydeploy', settings.audio.musicComfyDeployDeploymentId || '', settings.audio.musicComfyDeployApiKey);
          if (!res.success) comfydeployActive = false;
        }
        if (isThreeDTab && settings.threeD.provider === 'comfydeploy') {
          const res = await testProviderConnection('comfydeploy', settings.threeD.baseUrl || '', settings.threeD.apiKey);
          if (!res.success) comfydeployActive = false;
        }
      }

      // Intentar conexión con OmniDeploy. La prueba dice ademas si la GPU del
      // proveedor esta encendida: unas credenciales correctas con el PC apagado
      // no sirven de nada, y es mejor saberlo aqui que al generar.
      let omnideployActive = true;
      let omnideployMensaje = '';
      if (usesOmniDeploy) {
        // El nombre de la seccion viaja con la comprobacion: cada pestana tiene
        // SU propio par de credenciales, y un "faltan el Deployment ID o la API
        // Key" a secas no dice donde hay que pegarlos.
        const comprobar = async (donde: string, id?: string, clave?: string) => {
          if (!id?.trim() || !clave?.trim()) {
            omnideployMensaje = `Pega el Deployment ID y la API Key en ${donde}. Cada seccion tiene los suyos.`;
            omnideployActive = false;
            return;
          }
          const res = await testProviderConnection('omnideploy', id, clave);
          // Se guarda SIEMPRE el mensaje, no solo cuando falla: "conectado, 0
          // trabajos en cola" tambien es informacion util.
          omnideployMensaje = res.message;
          if (!res.success) omnideployActive = false;
        };
        if (isImageTab && settings.image.provider === 'omnideploy') {
          await comprobar('Imagen', settings.image.omniDeployDeploymentId, settings.image.omniDeployApiKey);
        }
        if (isVideoTab && settings.video.provider === 'omnideploy') {
          await comprobar('Animación', settings.video.omniDeployDeploymentId, settings.video.omniDeployApiKey);
        }
        if (isAudioTab && settings.audio.ttsProvider === 'omnideploy') {
          await comprobar('Voz', settings.audio.ttsOmniDeployDeploymentId, settings.audio.ttsOmniDeployApiKey);
        }
        if (isAudioTab && settings.audio.musicProvider === 'omnideploy') {
          await comprobar('Música', settings.audio.musicOmniDeployDeploymentId, settings.audio.musicOmniDeployApiKey);
        }
        if (isThreeDTab && settings.threeD.provider === 'omnideploy') {
          await comprobar(
            'Suite 3D',
            settings.threeD.omniDeployDeploymentId,
            settings.threeD.omniDeployApiKey,
          );
        }
      }

      setTestResult({ 
        ollama: !!ollamaActive, 
        comfyui: !!comfyActive, 
        comfydeploy: !!comfydeployActive,
        omnideploy: !!omnideployActive,
        showOllama: usesLocalOllama,
        showComfy: usesLocalComfy,
        showComfyDeploy: usesComfyDeploy,
        showOmniDeploy: usesOmniDeploy,
        omnideployMensaje
      });

      // ¡SIEMPRE GUARDAMOS Y CERRAMOS EL MODAL! No bloqueamos al usuario si algún test da X roja.
      // Así el usuario puede guardar sus configuraciones a pesar de que el servidor local esté temporalmente apagado.
      // Con OmniDeploy se da mas tiempo: su mensaje explica POR QUE fallo
      // -credenciales, GPU apagada, cola- y 1,5 s no dan para leerlo.
      setTimeout(() => {
        onClose();
      }, usesOmniDeploy ? 6000 : 1500);

    } catch (e) {
      console.error("Test failed", e);
      // En caso de excepción, igual permitimos cerrar el modal
      onClose();
    } finally {
      setTesting(false);
    }
  };

  const fetchModels = async () => {
    const isLlama = settings.text.provider === 'llama-server';
    const isOllama = settings.text.provider === 'ollama';
    let url = settings.text.baseUrl?.trim();
    if (isOllama) {
      if (!url || url.includes(':8080') || url.includes(':8088') || url.includes(':1234')) {
        url = 'http://localhost:11434';
      }
    } else if (isLlama) {
      if (!url || url.includes(':11434') || url.includes(':8080') || url.includes(':1234')) {
        url = 'http://localhost:8088/v1';
      }
    }
    setLoadingModels(true);
    setModelsError('');
    try {
      if (isLlama) {
        const data = await getLlamaServerModels(url || 'http://localhost:8088/v1');
        setModels(data.map((m: any) => m.id));
        if (data.length === 0) {
          setModelsError(`llama-server responde en ${url} pero no tiene ningún modelo cargado.`);
        }
      } else if (isOllama) {
        const data = await getOllamaModels(url || 'http://localhost:11434');
        const names = data.map((m: any) => m.name);
        setModels(names);
        if (names.length > 0 && (!settings.text.model || !names.includes(settings.text.model))) {
          updateTextSettings({ model: names[0] });
        }
        if (data.length === 0) {
          setModelsError(`Ollama responde en ${url || 'http://localhost:11434'} pero no tiene ningún modelo descargado.`);
        }
      } else if (settings.text.provider === 'lm-studio' || settings.text.provider === 'other') {
        const cleanUrl = (url || 'http://localhost:1234/v1').replace(/\/$/, '');
        const endpoint = cleanUrl.includes('/v1') ? `${cleanUrl}/models` : `${cleanUrl}/v1/models`;
        const data = await pedirJsonLocal(endpoint);
        const ids: string[] = (data.data || data.models || []).map((m: any) => m.id || m.name).filter(Boolean);
        setModels(ids);
      }
    } catch (e: any) {
      console.error('Error fetching text models:', e);
      setModels([]);
      setModelsError(`No se pudo leer la lista de modelos en ${url || (isOllama ? 'http://localhost:11434' : 'http://localhost:8088/v1')}. ¿Está el servidor encendido?`);
    } finally {
      setLoadingModels(false);
    }
  };

  const fetchTtsModels = async () => {
    const isLlama = settings.audio.ttsProvider === 'llama-server';
    const isOllama = settings.audio.ttsProvider === 'ollama';
    let url = settings.audio.ttsUrl?.trim();
    if (isOllama) {
      if (!url || url.includes(':8080') || url.includes(':8088') || url.includes(':1234')) {
        url = 'http://localhost:11434';
      }
    } else if (isLlama) {
      if (!url || url.includes(':11434') || url.includes(':8080') || url.includes(':1234')) {
        url = 'http://localhost:8088/v1';
      }
    }
    setLoadingTtsModels(true);
    try {
      if (isLlama) {
        const data = await getLlamaServerModels(url || 'http://localhost:8088/v1');
        setTtsModels(data.map((m: any) => m.id));
      } else if (isOllama) {
        const data = await getOllamaModels(url || 'http://localhost:11434');
        const names = data.map((m: any) => m.name);
        setTtsModels(names);
        if (names.length > 0 && !settings.audio.ttsModel) {
          updateAudioSettings({ ttsModel: names[0] }, 'tts');
        }
      } else if (settings.audio.ttsProvider === 'lm-studio') {
        const cleanUrl = (url || 'http://localhost:1234/v1').replace(/\/$/, '');
        const endpoint = cleanUrl.includes('/v1') ? `${cleanUrl}/models` : `${cleanUrl}/v1/models`;
        const data = await pedirJsonLocal(endpoint);
        const ids: string[] = (data.data || data.models || []).map((m: any) => m.id || m.name).filter(Boolean);
        setTtsModels(ids);
      }
    } catch (e: any) {
      console.error("Error fetching TTS models:", e);
      setTtsModels([]);
    } finally {
      setLoadingTtsModels(false);
    }
  };

  const fetchPEModels = async () => {
    const isLlama = settings.promptEngineer?.provider === 'llama-server';
    const isOllama = settings.promptEngineer?.provider === 'ollama';
    let baseUrl = settings.promptEngineer?.baseUrl?.trim();
    if (isOllama) {
      if (!baseUrl || baseUrl.includes(':8080') || baseUrl.includes(':8088') || baseUrl.includes(':1234')) {
        baseUrl = 'http://localhost:11434';
      }
    } else if (isLlama) {
      if (!baseUrl || baseUrl.includes(':11434') || baseUrl.includes(':8080') || baseUrl.includes(':1234')) {
        baseUrl = 'http://localhost:8088/v1';
      }
    } else if (settings.promptEngineer?.provider === 'lm-studio') {
      if (!baseUrl || baseUrl.includes(':11434') || baseUrl.includes(':8080') || baseUrl.includes(':8088')) {
        baseUrl = 'http://localhost:1234/v1';
      }
    }
    if (!baseUrl) return;
    setLoadingPEModels(true);
    try {
      if (isOllama) {
        const data = await getOllamaModels(baseUrl);
        const names = data.map((m: any) => m.name);
        setPeModels(names);
        if (names.length > 0 && (!settings.promptEngineer?.model || !names.includes(settings.promptEngineer?.model))) {
          updateSettings({ promptEngineer: { ...settings.promptEngineer, model: names[0] } });
        }
      } else if (isLlama) {
        const data = await getLlamaServerModels(baseUrl);
        setPeModels(data.map((m: any) => m.id));
      } else if (settings.promptEngineer?.provider === 'lm-studio' || settings.promptEngineer?.provider === 'other') {
        const cleanUrl = baseUrl.replace(/\/$/, '');
        const endpoint = cleanUrl.includes('/v1') ? `${cleanUrl}/models` : `${cleanUrl}/v1/models`;
        const data = await pedirJsonLocal(endpoint);
        const ids: string[] = (data.data || data.models || []).map((m: any) => m.id || m.name).filter(Boolean);
        setPeModels(ids);
      }
    } catch (e: any) {
      console.error("Error fetching PE models:", e);
    } finally {
      setLoadingPEModels(false);
    }
  };

  const fetchVideoModels = async () => {
    const isLlama = settings.video.provider === 'llama-server';
    const isOllama = settings.video.provider === 'ollama';
    let baseUrl = settings.video.baseUrl?.trim();
    if (isOllama) {
      if (!baseUrl || baseUrl.includes(':8080') || baseUrl.includes(':8088') || baseUrl.includes(':1234')) {
        baseUrl = 'http://localhost:11434';
      }
    } else if (isLlama) {
      if (!baseUrl || baseUrl.includes(':11434') || baseUrl.includes(':8080') || baseUrl.includes(':1234')) {
        baseUrl = 'http://localhost:8088/v1';
      }
    } else if (settings.video.provider === 'lm-studio') {
      if (!baseUrl || baseUrl.includes(':11434') || baseUrl.includes(':8080') || baseUrl.includes(':8088')) {
        baseUrl = 'http://localhost:1234/v1';
      }
    }
    if (!baseUrl) return;
    setLoadingVideoModels(true);
    try {
      if (isOllama) {
        const data = await getOllamaModels(baseUrl);
        const mapped = data.map((m: any) => m.name);
        setVideoModels(mapped);
        if (mapped.length > 0 && !settings.video.model) {
          updateVideoSettings({ model: mapped[0] });
        }
      } else if (isLlama) {
        const data = await getLlamaServerModels(baseUrl);
        const mapped = data.map((m: any) => m.id);
        setVideoModels(mapped);
        if (mapped.length > 0 && !settings.video.model) {
          updateVideoSettings({ model: mapped[0] });
        }
      } else if (settings.video.provider === 'lm-studio' || settings.video.provider === 'other') {
        const cleanUrl = baseUrl.replace(/\/$/, '');
        const endpoint = cleanUrl.includes('/v1') ? `${cleanUrl}/models` : `${cleanUrl}/v1/models`;
        const data = await pedirJsonLocal(endpoint);
        const ids: string[] = (data.data || data.models || []).map((m: any) => m.id || m.name).filter(Boolean);
        setVideoModels(ids);
        if (ids.length > 0 && !settings.video.model) {
          updateVideoSettings({ model: ids[0] });
        }
      }
    } catch (e: any) {
      console.error("Error fetching video models:", e);
    } finally {
      setLoadingVideoModels(false);
    }
  };

  const handlePullVideoModel = async () => {
    if (!settings.video.baseUrl || settings.video.baseUrl.trim() === '') {
      alert("La URL del servidor es necesaria para conectar con Ollama.");
      return;
    }
    if (!newVideoModelName) return;
    setPullingVideoModel(true);
    try {
      await pullOllamaModel(settings.video.baseUrl, newVideoModelName);
      alert(`Modelo ${newVideoModelName} descargado exitosamente.`);
      fetchVideoModels();
      setNewVideoModelName('');
    } catch (e: any) {
      alert(`Error al descargar el modelo: ${e.message || "Verifica el nombre y la conexión."}`);
    } finally {
      setPullingVideoModel(false);
    }
  };

  // Carga modelos desde la API Cloud — SOLO modifica estado local, NUNCA el padre
  const fetchCloudModels = async (apiKey: string, baseUrl: string) => {
    if (!apiKey || !baseUrl) {
      setCloudModelError('Ingresa tu API Key primero.');
      return;
    }
    setLoadingCloudModels(true);
    setCloudModelError(null);
    setCloudModels([]);
    try {
      const cleanUrl = baseUrl.replace(/\/$/, '');
      const endpoint = cleanUrl.includes('/v1') ? `${cleanUrl}/models` : `${cleanUrl}/v1/models`;
      const data = await pedirJsonLocal(endpoint, {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      });
      // OpenAI-compatible: { data: [{ id }] }  o  Ollama: { models: [{ name }] }
      const ids: string[] = (data.data || data.models || [])
        .map((m: any) => m.id || m.name)
        .filter(Boolean);
      if (ids.length === 0) throw new Error('No se encontraron modelos disponibles en esta cuenta.');
      setCloudModels(ids);
    } catch (e: any) {
      setCloudModelError(e.message || 'Error desconocido');
    } finally {
      setLoadingCloudModels(false);
    }
  };

  const fetchCodeCloudModels = async (provider: string, apiKey: string) => {
    if (!apiKey) {
      setCodeCloudModelError('Ingresa tu API Key primero.');
      return;
    }
    setLoadingCodeCloudModels(true);
    setCodeCloudModelError(null);
    try {
      let url = "";
      let headers: Record<string, string> = {};

      if (provider === 'openai') {
        url = "https://api.openai.com/v1/models";
        headers = { "Authorization": `Bearer ${apiKey}` };
      } else if (provider === 'gemini') {
        url = "https://generativelanguage.googleapis.com/v1beta/models";
        headers = { "x-goog-api-key": apiKey };
      } else if (provider === 'deepseek') {
        url = "https://api.deepseek.com/v1/models";
        headers = { "Authorization": `Bearer ${apiKey}` };
      } else if (provider === 'kimi') {
        url = "https://api.moonshot.cn/v1/models";
        headers = { "Authorization": `Bearer ${apiKey}` };
      } else if (provider === 'qwen') {
        url = "https://dashscope.aliyuncs.com/compatible-mode/v1/models";
        headers = { "Authorization": `Bearer ${apiKey}` };
      } else {
        throw new Error(`El proveedor ${provider} no soporta consulta dinámica de modelos.`);
      }

      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
      if (!invokeFn) throw new Error("Tauri API no disponible para proxy_request.");

      console.log(`[Omni IA Game] Fetching code models from ${provider} via Tauri proxy_request...`);
      const responseStr = await invokeFn('proxy_request', {
        url,
        method: 'GET',
        headers
      });

      const data = JSON.parse(responseStr);
      let ids: string[] = [];

      if (provider === 'gemini') {
        if (data.models && Array.isArray(data.models)) {
          ids = data.models
            .map((m: any) => m.name.replace(/^models\//, ""))
            .filter((m: string) => m.includes("gemini") && !m.includes("tuning"));
        }
      } else {
        if (data.data && Array.isArray(data.data)) {
          ids = data.data.map((m: any) => m.id);
        }
      }

      if (ids.length === 0) {
        throw new Error('No se encontraron modelos disponibles.');
      }

      setFetchedCodeCloudModels(prev => ({
        ...prev,
        [provider]: ids
      }));
    } catch (e: any) {
      console.error("Error fetching code models:", e);
      setCodeCloudModelError(e.message || String(e));
    } finally {
      setLoadingCodeCloudModels(false);
    }
  };

  const fetchNpcCloudModels = async (provider: string, apiKey: string) => {
    if (!apiKey) {
      setNpcCloudModelError('Ingresa tu API Key primero.');
      return;
    }
    setLoadingNpcCloudModels(true);
    setNpcCloudModelError(null);
    try {
      let url = "";
      let headers: Record<string, string> = {};

      if (provider === 'openai') {
        url = "https://api.openai.com/v1/models";
        headers = { "Authorization": `Bearer ${apiKey}` };
      } else if (provider === 'gemini') {
        url = "https://generativelanguage.googleapis.com/v1beta/models";
        headers = { "x-goog-api-key": apiKey };
      } else if (provider === 'deepseek') {
        url = "https://api.deepseek.com/v1/models";
        headers = { "Authorization": `Bearer ${apiKey}` };
      } else if (provider === 'kimi') {
        url = "https://api.moonshot.cn/v1/models";
        headers = { "Authorization": `Bearer ${apiKey}` };
      } else if (provider === 'qwen') {
        url = "https://dashscope.aliyuncs.com/compatible-mode/v1/models";
        headers = { "Authorization": `Bearer ${apiKey}` };
      } else {
        throw new Error(`El proveedor ${provider} no soporta consulta dinámica de modelos.`);
      }

      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
      if (!invokeFn) throw new Error("Tauri API no disponible para proxy_request.");

      console.log(`[Omni IA Game] Fetching NPC models from ${provider} via Tauri proxy_request...`);
      const responseStr = await invokeFn('proxy_request', {
        url,
        method: 'GET',
        headers
      });

      const data = JSON.parse(responseStr);
      let ids: string[] = [];

      if (provider === 'gemini') {
        if (data.models && Array.isArray(data.models)) {
          ids = data.models
            .map((m: any) => m.name.replace(/^models\//, ""))
            .filter((m: string) => m.includes("gemini") && !m.includes("tuning"));
        }
      } else {
        if (data.data && Array.isArray(data.data)) {
          ids = data.data.map((m: any) => m.id);
        }
      }

      if (ids.length === 0) {
        throw new Error('No se encontraron modelos disponibles.');
      }

      setFetchedNpcCloudModels(prev => ({
        ...prev,
        [provider]: ids
      }));
    } catch (e: any) {
      console.error("Error fetching NPC models:", e);
      setNpcCloudModelError(e.message || String(e));
    } finally {
      setLoadingNpcCloudModels(false);
    }
  };

  const handlePullModel = async () => {
    if (!settings.text.baseUrl || settings.text.baseUrl.trim() === '') {
      alert("La URL del servidor es necesaria para conectar con Ollama.");
      return;
    }
    if (!newModelName) return;
    setPullingModel(true);
    try {
      await pullOllamaModel(settings.text.baseUrl, newModelName);
      alert(`Modelo ${newModelName} descargado exitosamente.`);
      fetchModels();
      setNewModelName('');
    } catch (e: any) {
      alert(`Error al descargar el modelo: ${e.message || "Verifica el nombre y la conexión."}`);
    } finally {
      setPullingModel(false);
    }
  };

  const updateOllamaSettings = (updates: Partial<typeof settings.ollama>) => {
    updateSettings({ ollama: { ...settings.ollama, ...updates } });
  };

  const updateTextSettings = (updates: Partial<typeof settings.text>) => {
    const currentProvider = updates.provider || settings.text.provider;
    const newApiKeys = { ...settings.text.apiKeys };
    const newModels = { ...settings.text.models };
    const newBaseUrls = { ...settings.text.baseUrls };

    if (updates.apiKey !== undefined) {
      newApiKeys[currentProvider] = updates.apiKey;
    } else if (updates.provider !== undefined) {
      updates.apiKey = newApiKeys[updates.provider] || '';
    }

    if (updates.model !== undefined) {
      newModels[currentProvider] = updates.model;
    } else if (updates.provider !== undefined) {
      updates.model = newModels[updates.provider] || PREDEFINED_TEXT_MODELS[updates.provider]?.[0] || '';
    }

    if (updates.baseUrl !== undefined) {
      newBaseUrls[currentProvider] = updates.baseUrl;
    } else if (updates.provider !== undefined) {
      const defaultUrl = updates.provider === 'ollama' ? 'http://localhost:11434' : updates.provider === 'llama-server' ? 'http://localhost:8088/v1' : updates.provider === 'lm-studio' ? 'http://localhost:1234/v1' : '';
      updates.baseUrl = newBaseUrls[updates.provider] || defaultUrl;
    }

    updateSettings({
      text: {
        ...settings.text,
        ...updates,
        apiKeys: newApiKeys,
        models: newModels,
        baseUrls: newBaseUrls
      }
    });
  };

  const updateNpcSettings = (updates: Partial<typeof settings.npcs>) => {
    const currentProvider = updates.provider || settings.npcs.provider;
    const newApiKeys = { ...settings.npcs.apiKeys };
    const newModels = { ...settings.npcs.models };
    const newBaseUrls = { ...settings.npcs.baseUrls };

    if (updates.apiKey !== undefined) {
      newApiKeys[currentProvider] = updates.apiKey;
    } else if (updates.provider !== undefined) {
      updates.apiKey = newApiKeys[updates.provider] || '';
    }

    if (updates.model !== undefined) {
      newModels[currentProvider] = updates.model;
    } else if (updates.provider !== undefined) {
      updates.model = newModels[updates.provider] || PREDEFINED_NPC_MODELS[updates.provider]?.[0] || '';
    }

    if (updates.baseUrl !== undefined) {
      newBaseUrls[currentProvider] = updates.baseUrl;
    } else if (updates.provider !== undefined) {
      const defaultUrl = updates.provider === 'ollama' ? 'http://localhost:11434' : updates.provider === 'llama-server' ? 'http://localhost:8088/v1' : updates.provider === 'lm-studio' ? 'http://localhost:1234/v1' : '';
      updates.baseUrl = newBaseUrls[updates.provider] || defaultUrl;
    }

    updateSettings({
      npcs: {
        ...settings.npcs,
        ...updates,
        apiKeys: newApiKeys,
        models: newModels,
        baseUrls: newBaseUrls
      }
    });
  };

  const updateCodeSettings = (updates: Partial<typeof settings.code>) => {
    const currentProvider = updates.provider || settings.code.provider;
    const newApiKeys = { ...settings.code.apiKeys };
    const newModels = { ...settings.code.models };
    const newBaseUrls = { ...settings.code.baseUrls };

    if (updates.apiKey !== undefined) {
      newApiKeys[currentProvider] = updates.apiKey;
    } else if (updates.provider !== undefined) {
      updates.apiKey = newApiKeys[updates.provider] || '';
    }

    if (updates.model !== undefined) {
      newModels[currentProvider] = updates.model;
    } else if (updates.provider !== undefined) {
      updates.model = newModels[updates.provider] || PREDEFINED_CODE_MODELS[updates.provider]?.[0] || '';
    }

    if (updates.baseUrl !== undefined) {
      newBaseUrls[currentProvider] = updates.baseUrl;
    } else if (updates.provider !== undefined) {
      const defaultUrl = updates.provider === 'ollama' ? 'http://localhost:11434' : updates.provider === 'llama-server' ? 'http://localhost:8088/v1' : updates.provider === 'lm-studio' ? 'http://localhost:1234/v1' : '';
      updates.baseUrl = newBaseUrls[updates.provider] || defaultUrl;
    }

    updateSettings({
      code: {
        ...settings.code,
        ...updates,
        apiKeys: newApiKeys,
        models: newModels,
        baseUrls: newBaseUrls
      }
    });
  };

  const updateImageSettings = (updates: Partial<typeof settings.image>) => {
    const currentProvider = updates.provider || settings.image.provider;
    const newApiKeys = { ...settings.image.apiKeys };
    const newModels = { ...settings.image.models };

    if (updates.apiKey !== undefined) {
      newApiKeys[currentProvider] = updates.apiKey;
    } else if (updates.provider !== undefined) {
      updates.apiKey = newApiKeys[updates.provider] || '';
    }

    if (updates.model !== undefined) {
      newModels[currentProvider] = updates.model;
    } else if (updates.provider !== undefined) {
      updates.model = newModels[updates.provider] || PREDEFINED_IMAGE_MODELS[updates.provider]?.[0] || '';
    }

    updateSettings({
      image: {
        ...settings.image,
        ...updates,
        apiKeys: newApiKeys,
        models: newModels
      }
    });
  };

  const updateWorldWorkflow = (pipeline: 'a' | 'b' | 'c', updates: Partial<NonNullable<typeof settings.worldWorkflows>['a']>) => {
    const currentWorkflows = settings.worldWorkflows || {
      a: { provider: 'comfyui', baseUrl: 'http://127.0.0.1:8188', workflowId: '', customWorkflow: '', comfyDeployApiKey: '', comfyDeployDeploymentId: '', omniDeployApiKey: '', omniDeployDeploymentId: '' },
      b: { provider: 'comfyui', baseUrl: 'http://127.0.0.1:8188', workflowId: '', customWorkflow: '', comfyDeployApiKey: '', comfyDeployDeploymentId: '', omniDeployApiKey: '', omniDeployDeploymentId: '' },
      c: { provider: 'comfyui', baseUrl: 'http://127.0.0.1:8188', workflowId: '', customWorkflow: '', comfyDeployApiKey: '', comfyDeployDeploymentId: '', omniDeployApiKey: '', omniDeployDeploymentId: '' }
    };
    updateSettings({
      worldWorkflows: {
        ...currentWorkflows,
        [pipeline]: {
          ...currentWorkflows[pipeline],
          ...updates
        }
      }
    });
  };

  const updateVideoSettings = (updates: Partial<typeof settings.video>) => {
    const currentProvider = updates.provider || settings.video.provider;
    const newApiKeys = { ...settings.video.apiKeys };
    const newModels = { ...settings.video.models };
    const newBaseUrls = { ...settings.video.baseUrls };

    if (updates.apiKey !== undefined) {
      newApiKeys[currentProvider] = updates.apiKey;
    } else if (updates.provider !== undefined) {
      updates.apiKey = newApiKeys[updates.provider] || '';
    }

    if (updates.model !== undefined) {
      newModels[currentProvider] = updates.model;
    } else if (updates.provider !== undefined) {
      updates.model = newModels[updates.provider] || PREDEFINED_VIDEO_MODELS[updates.provider]?.[0] || '';
    }

    if (updates.baseUrl !== undefined) {
      newBaseUrls[currentProvider] = updates.baseUrl;
    } else if (updates.provider !== undefined) {
      const defaultUrl = updates.provider === 'ollama' ? 'http://localhost:11434' : updates.provider === 'llama-server' ? 'http://localhost:8088/v1' : updates.provider === 'lm-studio' ? 'http://localhost:1234/v1' : updates.provider === 'comfyui' ? 'http://127.0.0.1:8188' : updates.provider === 'a1111' ? 'http://127.0.0.1:7860' : '';
      updates.baseUrl = newBaseUrls[updates.provider] || defaultUrl;
    }

    updateSettings({
      video: {
        ...settings.video,
        ...updates,
        apiKeys: newApiKeys,
        models: newModels,
        baseUrls: newBaseUrls
      }
    });
  };

  const updateAudioSettings = (updates: Partial<typeof settings.audio>, target?: 'tts' | 'music') => {
    const newApiKeys = { ...settings.audio.apiKeys };
    const newTtsModels = { ...settings.audio.ttsModels || {} };
    const newMusicModels = { ...settings.audio.musicModels || {} };
    const newSfxModels = { ...settings.audio.sfxModels || {} };
    const newTtsUrls = { ...settings.audio.ttsUrls || {} };
    const newMusicUrls = { ...settings.audio.musicUrls || {} };

    const currentTtsProvider = updates.ttsProvider || settings.audio.ttsProvider;
    const currentMusicProvider = updates.musicProvider || settings.audio.musicProvider;

    if (updates.apiKey !== undefined) {
      if (target === 'tts') {
        newApiKeys[currentTtsProvider] = updates.apiKey;
      } else if (target === 'music') {
        newApiKeys[currentMusicProvider] = updates.apiKey;
      } else {
        newApiKeys[currentTtsProvider] = updates.apiKey;
      }
    }

    if (updates.ttsProvider !== undefined) {
      updates.apiKey = newApiKeys[updates.ttsProvider] || '';
    } else if (updates.musicProvider !== undefined) {
      updates.apiKey = newApiKeys[updates.musicProvider] || '';
    }

    if (updates.ttsModel !== undefined) {
      newTtsModels[currentTtsProvider] = updates.ttsModel;
    } else if (updates.ttsProvider !== undefined) {
      updates.ttsModel = newTtsModels[updates.ttsProvider] || PREDEFINED_TTS_MODELS[updates.ttsProvider]?.[0] || '';
    }

    if (updates.ttsUrl !== undefined) {
      newTtsUrls[currentTtsProvider] = updates.ttsUrl;
    } else if (updates.ttsProvider !== undefined) {
      const defaultUrl = updates.ttsProvider === 'ollama' ? 'http://localhost:11434' : updates.ttsProvider === 'llama-server' ? 'http://localhost:8088/v1' : updates.ttsProvider === 'lm-studio' ? 'http://localhost:1234/v1' : '';
      updates.ttsUrl = newTtsUrls[updates.ttsProvider] || defaultUrl;
    }

    if (updates.musicModel !== undefined) {
      newMusicModels[currentMusicProvider] = updates.musicModel;
    } else if (updates.musicProvider !== undefined) {
      updates.musicModel = newMusicModels[updates.musicProvider] || PREDEFINED_MUSIC_MODELS[updates.musicProvider]?.[0] || '';
    }

    if (updates.musicUrl !== undefined) {
      newMusicUrls[currentMusicProvider] = updates.musicUrl;
    } else if (updates.musicProvider !== undefined) {
      const defaultUrl = updates.musicProvider === 'ollama' ? 'http://localhost:11434' : updates.musicProvider === 'llama-server' ? 'http://localhost:8088/v1' : updates.musicProvider === 'lm-studio' ? 'http://localhost:1234/v1' : '';
      updates.musicUrl = newMusicUrls[updates.musicProvider] || defaultUrl;
    }

    if (updates.sfxModel !== undefined) {
      newSfxModels[currentMusicProvider] = updates.sfxModel;
    }

    updateSettings({
      audio: {
        ...settings.audio,
        ...updates,
        apiKeys: newApiKeys,
        ttsModels: newTtsModels,
        musicModels: newMusicModels,
        sfxModels: newSfxModels,
        ttsUrls: newTtsUrls,
        musicUrls: newMusicUrls
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-6xl shadow-2xl flex flex-col h-[85vh] max-h-[85vh] transition-all duration-300">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3 text-slate-100">
            <Settings className="w-6 h-6 text-blue-400 animate-pulse" />
            <div>
              <h2 className="text-xl font-bold font-cinzel leading-none">Configuración Global de APIs</h2>
              {isLicensed && licenseDetails && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                  <span className="text-[9px] text-purple-400 font-mono tracking-wider font-bold uppercase bg-purple-950/30 px-2 py-0.5 rounded border border-purple-900/30">
                    LICENCIA: {getRemainingTimeString(licenseDetails)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 overflow-x-auto">
          <button
            onClick={() => setActiveTab('text')}
            className={`flex-1 min-w-[120px] py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'text' ? 'bg-slate-800 text-green-400 border-b-2 border-green-500' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Cpu className="w-4 h-4" /> Texto (LLM)
          </button>
          <button
            onClick={() => setActiveTab('image')}
            className={`flex-1 min-w-[120px] py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'image' ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Image className="w-4 h-4" /> Imagen
          </button>
          {premiumUnlocked && settings.enabledTabs?.animation !== false && (
            <button
              onClick={() => setActiveTab('video')}
              className={`flex-1 min-w-[120px] py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'video' ? 'bg-slate-800 text-purple-400 border-b-2 border-purple-500' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Video className="w-4 h-4" /> ANIMATION
            </button>
          )}
          <button
            onClick={() => setActiveTab('audio')}
            className={`flex-1 min-w-[120px] py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'audio' ? 'bg-slate-800 text-amber-400 border-b-2 border-amber-500' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Music className="w-4 h-4" /> Audio & Voz
          </button>
          {premiumUnlocked && settings.enabledTabs?.threeD !== false && (
            <button
              onClick={() => setActiveTab('threeD')}
              className={`flex-1 min-w-[120px] py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'threeD' ? 'bg-slate-800 text-purple-400 border-b-2 border-purple-500' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Box className="w-4 h-4" /> Suite 3D
            </button>
          )}
          {premiumUnlocked && settings.enabledTabs?.npcs !== false && (
            <button
              onClick={() => setActiveTab('npcs')}
              className={`flex-1 min-w-[120px] py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'npcs' ? 'bg-slate-800 text-sky-400 border-b-2 border-sky-500' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Users className="w-4 h-4" /> NPCs
            </button>
          )}
          <button
            onClick={() => setActiveTab('code')}
            className={`flex-1 min-w-[120px] py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'code' ? 'bg-slate-800 text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Code2 className="w-4 h-4" /> Scripts
          </button>
          <button
            onClick={() => setActiveTab('local')}
            className={`flex-1 min-w-[120px] py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'local' ? 'bg-slate-800 text-orange-400 border-b-2 border-orange-500' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Server className="w-4 h-4 text-orange-400" /> Motores Locales
          </button>
          {/* `cap: none` es una licencia valida que solo concede modulos
              sueltos -por ejemplo el Creador 2D-, y no debe abrir el Portal
              Dev. Hasta ahora el atajo Ctrl+Shift+D lo abria con cualquier
              licencia, de modo que `dev_portal` y `full` daban lo mismo aqui. */}
          {showDevMenu && licenseDetails?.cap !== 'none' && (
            <Tooltip id="devPortalTab" showTooltips={showTooltips} inline className="flex-1 min-w-[120px]" position="bottom">
            <button
              onClick={() => setActiveTab('dev')}
              className={`flex-1 min-w-[120px] py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'dev' ? 'bg-purple-950/40 text-purple-400 border-b-2 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.15)] animate-pulse' : 'text-slate-500 hover:text-purple-300'}`}
            >
              <Settings className="w-4 h-4 text-purple-400 animate-spin-slow" /> Dev Portal
            </button>
            </Tooltip>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* TEXT TAB */}
          {activeTab === 'text' && (
            <div className="space-y-6">
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <Tooltip id="settingsTextProvider" showTooltips={showTooltips}>
                  <label className="flex items-center justify-between mb-4 cursor-pointer">
                    <span className="font-bold text-slate-200">Proveedor de Texto & Lógica</span>
                    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 flex-wrap gap-1">
                      {['gemini', 'anthropic', 'openai', 'deepseek', 'qwen', 'kimi', 'openrouter', 'cometapi', 'nvidia', 'ollama', 'omnideploy', 'lm-studio', 'llama-server', 'other'].map((p) => (
                        <button
                          key={p}
                          onClick={() => {
                            const updates: any = { provider: p as any };
                            if (p === 'ollama') {
                              updates.baseUrl = (!settings.text.baseUrl || settings.text.baseUrl.includes(':8080') || settings.text.baseUrl.includes(':8088') || settings.text.baseUrl.includes(':1234')) ? 'http://localhost:11434' : settings.text.baseUrl;
                            } else if (p === 'llama-server') {
                              updates.baseUrl = (!settings.text.baseUrl || settings.text.baseUrl.includes(':11434') || settings.text.baseUrl.includes(':8080') || settings.text.baseUrl.includes(':1234')) ? 'http://localhost:8088/v1' : settings.text.baseUrl;
                            } else if (p === 'lm-studio') {
                              updates.baseUrl = (!settings.text.baseUrl || settings.text.baseUrl.includes(':11434') || settings.text.baseUrl.includes(':8080') || settings.text.baseUrl.includes(':8088')) ? 'http://localhost:1234/v1' : settings.text.baseUrl;
                            }
                            updateTextSettings(updates);
                          }}
                          className={`px-3 py-1 text-xs rounded font-bold transition-all uppercase ${settings.text.provider === p ? 'bg-green-600 text-white' : 'text-slate-500'}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </label>
                </Tooltip>

                {/* OmniDeploy: el texto lo escribe el Ollama del proveedor.
                    Pensado para equipos que no pueden con un modelo grande: un
                    portatil de aula no sostiene 12B, pero la GPU del estudio si. */}
                {(settings.text.provider as string) === 'omnideploy' && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 mb-4">
                    <div className="p-3 bg-cyan-900/20 border border-cyan-500/30 rounded text-xs text-cyan-200">
                      <p className="font-bold mb-1 flex items-center gap-2">
                        <Server className="w-3 h-3 text-cyan-400" /> TEXTOS EN LA GPU DEL PROVEEDOR
                      </p>
                      No necesitas Ollama ni un modelo descargado en este equipo. El proveedor elige
                      con qué modelo responde.
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">API Key de OmniDeploy</label>
                        <input
                          type="password"
                          value={settings.text.omniDeployApiKey || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTextSettings({ omniDeployApiKey: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="La que te dio el proveedor"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">Deployment ID</label>
                        <input
                          type="text"
                          value={settings.text.omniDeployDeploymentId || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTextSettings({ omniDeployDeploymentId: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="omni_..."
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  {/* API Key global — oculta para Ollama/LM-Studio/LLama-Server (tienen su propio campo o no requieren) */}
                  {settings.text.provider !== 'ollama' && settings.text.provider !== 'lm-studio' && settings.text.provider !== 'llama-server' && (settings.text.provider as string) !== 'omnideploy' && (
                    <Tooltip id="settingsTextApiKey" showTooltips={showTooltips} className="block">
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">API Key (Opcional)</label>
                        <input
                          type="password"
                          value={settings.text.apiKeys?.[settings.text.provider] || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            updateTextSettings({
                              apiKey: e.target.value
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="sk-..."
                        />
                        <p className="text-[10px] text-slate-600 mt-1">Si usas Gemini, deja esto vacío para usar la clave del sistema, o ingresa una propia.</p>
                      </div>
                    </Tooltip>
                  )}

                  {/* Cloud providers (Gemini/Anthropic/OpenAI/DeepSeek/Qwen/Kimi/OpenRouter/CometAPI/NVIDIA): selector de modelos */}
                  {['gemini', 'anthropic', 'openai', 'deepseek', 'qwen', 'kimi', 'openrouter', 'cometapi', 'nvidia'].includes(settings.text.provider) && (() => {
                    const provider = settings.text.provider;
                    const predefined = PREDEFINED_TEXT_MODELS[provider] || [];
                    const currentModel = settings.text.model || '';
                    const isCustomModel = currentModel !== '' && !predefined.includes(currentModel);

                    return (
                      <Tooltip id="settingsTextModelSelect" showTooltips={showTooltips} className="block">
                        <div className="space-y-2 mt-2">
                          <label className="block text-xs text-slate-500 uppercase mb-1">Modelo de Texto ({provider.toUpperCase()})</label>
                          <select
                            value={isCustomModel ? 'custom' : (currentModel || predefined[0] || '')}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                updateTextSettings({ model: 'custom' });
                              } else {
                                updateTextSettings({ model: val });
                              }
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-green-500 outline-none"
                          >
                            {predefined.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                            <option value="custom">Otro (Escribir modelo personalizado...)</option>
                          </select>

                          {(isCustomModel || (settings.text.model === 'custom')) && (
                            <div className="pt-2">
                              <input
                                type="text"
                                value={currentModel === 'custom' ? '' : currentModel}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTextSettings({ model: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-green-500 outline-none"
                                placeholder="Escribe el modelo personalizado..."
                              />
                            </div>
                          )}
                        </div>
                      </Tooltip>
                    );
                  })()}

                  {/* Other: URL + API Key */}
                  {settings.text.provider === 'other' && (
                    <div>
                      <label className="block text-xs text-slate-500 uppercase mb-1">URL del Servidor (OpenAI-compatible)</label>
                      <input
                        type="text"
                        value={settings.text.baseUrl}
                        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateTextSettings({ baseUrl: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                        placeholder="https://mi-servidor.com/v1/chat/completions"
                      />
                      <p className="text-[10px] text-slate-600 mt-1">Debe ser un endpoint compatible con la API de OpenAI (chat/completions).</p>
                    </div>
                  )}

                  {/* LLAMA-SERVER (LLAMA.CPP NATIVO) */}
                  {settings.text.provider === 'llama-server' && renderLlamaCppPanel('text')}

                  {/* Ollama / LM-Studio: Servidor Local */}
                  {(settings.text.provider === 'ollama' || settings.text.provider === 'lm-studio') && (
                    <>
                      {/* Toggle LOCAL / CLOUD */}
                      <Tooltip id="settingsTextServerToggle" showTooltips={showTooltips} className="block">
                        <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-700 rounded-lg">
                          <div>
                            <p className="text-xs font-bold text-slate-200">{ollamaCloudMode ? 'Modo: API Cloud' : 'Modo: Servidor Local'}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {ollamaCloudMode
                                ? `Conectado a ${settings.text.provider === 'ollama' ? 'api.ollama.com' : 'los servidores cloud de LM-Studio'}`
                                : 'Usando servidor local en tu máquina'}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const next = !ollamaCloudMode;
                              setOllamaCloudMode(next);
                              if (!next) {
                                updateOllamaSettings({
                                  apiKey: '',
                                  baseUrl: settings.text.provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1'
                                });
                              } else {
                                updateOllamaSettings({
                                  baseUrl: settings.text.provider === 'ollama' ? 'https://api.ollama.com' : 'https://api.lmstudio.ai',
                                  model: settings.text.model || '',
                                  apiKey: settings.ollama?.apiKey || ''
                                });
                              }
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${ollamaCloudMode ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                          >
                            {ollamaCloudMode ? <Cloud className="w-3 h-3" /> : <Server className="w-3 h-3" />}
                            {ollamaCloudMode ? 'CLOUD' : 'LOCAL'}
                          </button>
                        </div>
                      </Tooltip>

                      {/* MODO LOCAL */}
                      {!ollamaCloudMode && (
                        <>
                          <Tooltip id="settingsTextServerUrl" showTooltips={showTooltips} className="block">
                            <div>
                              <label className="block text-xs text-slate-500 uppercase mb-1">URL del Servidor Local</label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={settings.text.baseUrl}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateTextSettings({ baseUrl: e.target.value })}
                                  className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                                  placeholder={settings.text.provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1'}
                                />
                                {settings.text.provider === 'ollama' && (
                                  <button onClick={fetchModels} className="p-2 bg-slate-800 border border-slate-700 rounded hover:bg-slate-700 text-slate-400" title="Recargar modelos locales">
                                    <RefreshCw className={`w-4 h-4 ${loadingModels ? 'animate-spin' : ''}`} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </Tooltip>

                          <Tooltip id="settingsTextModel" showTooltips={showTooltips} className="block">
                            <div>
                              <label className="block text-xs text-slate-500 uppercase mb-1">Modelo Local</label>
                              {settings.text.provider === 'ollama' ? (
                                <select
                                  value={settings.text.model}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateTextSettings({ model: e.target.value })}
                                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                                >
                                  {models.length > 0 ? (
                                    <>
                                      {settings.text.model && !models.includes(settings.text.model) && (
                                        <option value={settings.text.model}>
                                          {settings.text.model} (no detectado)
                                        </option>
                                      )}
                                      {models.map(m => <option key={m} value={m}>{m}</option>)}
                                    </>
                                  ) : (
                                    <option value={settings.text.model}>{settings.text.model || 'Recargar modelos...'}</option>
                                  )}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={settings.text.model}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateTextSettings({ model: e.target.value })}
                                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                                  placeholder="ej: local-model-v1"
                                />
                              )}
                              {settings.text.provider === 'ollama' && (loadingModels || modelsError || models.length > 0) && (
                                <p className={`mt-1 text-[10px] ${modelsError ? 'text-amber-400' : 'text-slate-500'}`}>
                                  {loadingModels
                                    ? 'Leyendo los modelos instalados…'
                                    : modelsError || `${models.length} modelo(s) detectado(s) en este servidor.`}
                                </p>
                              )}
                            </div>
                          </Tooltip>

                          {settings.text.provider === 'ollama' && (
                            <div className="pt-4 border-t border-slate-800">
                              <label className="block text-xs text-slate-500 uppercase mb-1">Descargar Nuevo Modelo</label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={newModelName}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewModelName(e.target.value)}
                                  className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                                  placeholder="ej: llama3, mistral, gemma"
                                />
                                <button
                                  onClick={handlePullModel}
                                  disabled={pullingModel || !newModelName}
                                  className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-bold rounded flex items-center gap-2"
                                >
                                  {pullingModel ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                  PULL
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* MODO CLOUD */}
                      {ollamaCloudMode && (
                        <>
                          <Tooltip id="settingsTextApiKey" showTooltips={showTooltips} className="block">
                            <div>
                              <label className="block text-xs text-slate-500 uppercase mb-1">API Key Cloud (Ollama/LMS)</label>
                              <input
                                type="password"
                                value={settings.ollama?.apiKey || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateOllamaSettings({ apiKey: e.target.value })}
                                className="w-full bg-slate-900 border border-blue-700 rounded p-2 text-sm text-slate-300 font-mono"
                                placeholder={settings.text.provider === 'ollama' ? 'ollama_...' : 'lms-...'}
                              />
                              <p className="text-[10px] text-slate-500 mt-1">
                                {settings.text.provider === 'ollama'
                                  ? 'Obtén tu clave en: https://ollama.com/settings/keys'
                                  : 'Obtén tu clave en el portal de LM-Studio Cloud.'}
                              </p>
                            </div>
                          </Tooltip>

                          <Tooltip id="settingsTextModel" showTooltips={showTooltips} className="block">
                            <div>
                              <label className="block text-xs text-slate-500 uppercase mb-1">Modelo Cloud</label>
                              {settings.text.provider === 'ollama' ? (
                                <>
                                  <div className="flex gap-2">
                                    <select
                                      value={settings.text.model}
                                      onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateTextSettings({ model: e.target.value })}
                                      className="flex-1 bg-slate-900 border border-blue-700 rounded p-2 text-sm text-slate-300 font-mono"
                                    >
                                      {cloudModels.length > 0 ? (
                                        cloudModels.map(m => <option key={m} value={m}>{m}</option>)
                                      ) : (
                                        <option value={settings.text.model}>{settings.text.model || '— Sin modelos cargados —'}</option>
                                      )}
                                    </select>
                                    <button
                                      onClick={() => fetchCloudModels(settings.text.apiKey || '', settings.text.baseUrl)}
                                      disabled={!settings.text.apiKey || loadingCloudModels}
                                      className="p-2 bg-slate-800 border border-blue-700 rounded hover:bg-slate-700 text-blue-400 disabled:opacity-40"
                                      title="Cargar modelos desde la API Cloud"
                                    >
                                      <RefreshCw className={`w-4 h-4 ${loadingCloudModels ? 'animate-spin' : ''}`} />
                                    </button>
                                  </div>
                                  {cloudModelError && (
                                    <p className="text-[10px] text-red-400 mt-1"><AlertTriangle className="inline w-3 h-3 mr-1" />{cloudModelError}</p>
                                  )}
                                  {cloudModels.length === 0 && !cloudModelError && (
                                    <p className="text-[10px] text-slate-500 mt-1">Ingresa tu API Key y presiona ↻ para cargar los modelos de tu cuenta.</p>
                                  )}
                                </>
                              ) : (
                                <input
                                  type="text"
                                  value={settings.ollama?.model || settings.text.model}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateOllamaSettings({ model: e.target.value })}
                                  className="w-full bg-slate-900 border border-blue-700 rounded p-2 text-sm text-slate-300 font-mono"
                                  placeholder="ej: lmstudio-community/Meta-Llama-3-8B"
                                />
                              )}
                            </div>
                          </Tooltip>

                          <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded text-xs text-blue-200">
                            <p className="font-bold mb-1 flex items-center gap-2"><Cloud className="w-3 h-3" /> Endpoint Cloud</p>
                            <p className="font-mono text-[10px] text-blue-300">{settings.text.baseUrl}</p>
                            <p className="mt-1 text-[10px] text-slate-400">El modelo seleccionado se enviará a este endpoint usando tu API Key.</p>
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {/* Test Connection Widget for Text Provider */}
                  {renderTestConnectionWidget(
                    'text', 
                    settings.text.provider, 
                    settings.text.provider === 'ollama' && ollamaCloudMode ? (settings.ollama?.baseUrl || 'https://api.ollama.com') : settings.text.baseUrl, 
                    settings.text.provider === 'ollama' && ollamaCloudMode ? settings.ollama?.apiKey : settings.text.apiKey
                  )}
                </div>
              </div>

              {/* Prompt Engineer Pro Section */}
              <div className="bg-gradient-to-r from-amber-950/30 to-orange-950/30 p-4 rounded-lg border border-amber-800/40">
                <Tooltip id="settingsPromptEngineerToggle" showTooltips={showTooltips} className="block">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🧠</span>
                      <span className="font-bold text-amber-200">Prompt Engineer Pro</span>
                      <span className="text-[9px] bg-amber-600/30 text-amber-300 px-1.5 py-0.5 rounded-full font-bold uppercase">AI</span>
                    </div>
                    <button
                      onClick={() => updateSettings({ promptEngineer: { ...(settings.promptEngineer || { enabled: false, useTextProvider: false, provider: 'gemini' as const, baseUrl: '', model: '', apiKey: '' }), enabled: !settings.promptEngineer?.enabled } })}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                        settings.promptEngineer?.enabled
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {settings.promptEngineer?.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      {settings.promptEngineer?.enabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </Tooltip>

                {settings.promptEngineer?.enabled && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <p className="text-[10px] text-slate-400">
                      Transforma ideas simples en prompts profesionales usando IA. Aparecerá un botón ✨ en el generador de Assets.
                    </p>

                    {/* Toggle: usar mismo LLM o dedicado */}
                    <div className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-700 rounded-lg">
                      <div>
                        <p className="text-xs font-bold text-slate-200">
                          {settings.promptEngineer?.useTextProvider ? 'Usando mismo LLM de Texto' : 'Proveedor Dedicado'}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {settings.promptEngineer?.useTextProvider
                            ? `Actualmente: ${settings.text.provider.toUpperCase()}`
                            : 'Configura un proveedor específico para el Prompt Engineer'}
                        </p>
                      </div>
                      <button
                        onClick={() => updateSettings({ promptEngineer: { ...settings.promptEngineer, useTextProvider: !settings.promptEngineer?.useTextProvider } })}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                          settings.promptEngineer?.useTextProvider
                            ? 'bg-green-600/80 text-white'
                            : 'bg-amber-600 text-white'
                        }`}
                      >
                        {settings.promptEngineer?.useTextProvider ? 'COMPARTIDO' : 'DEDICADO'}
                      </button>
                    </div>

                    {/* Campos dedicados */}
                    {!settings.promptEngineer?.useTextProvider && (
                      <div className="space-y-3 pl-2 border-l-2 border-amber-700/50">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-2">Proveedor</label>
                          <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 flex-wrap gap-1">
                            {['gemini', 'anthropic', 'openai', 'deepseek', 'qwen', 'kimi', 'openrouter', 'cometapi', 'ollama', 'omnideploy', 'lm-studio', 'llama-server', 'other'].map((p) => (
                              <button
                                key={p}
                                onClick={() => {
                                  const updates: any = { ...settings.promptEngineer, provider: p as any };
                                  if (p === 'ollama') {
                                    updates.baseUrl = (!settings.promptEngineer?.baseUrl || settings.promptEngineer?.baseUrl.includes(':8080') || settings.promptEngineer?.baseUrl.includes(':8088') || settings.promptEngineer?.baseUrl.includes(':1234')) ? 'http://localhost:11434' : settings.promptEngineer?.baseUrl;
                                  } else if (p === 'llama-server') {
                                    updates.baseUrl = (!settings.promptEngineer?.baseUrl || settings.promptEngineer?.baseUrl.includes(':11434') || settings.promptEngineer?.baseUrl.includes(':8080') || settings.promptEngineer?.baseUrl.includes(':1234')) ? 'http://localhost:8088/v1' : settings.promptEngineer?.baseUrl;
                                  } else if (p === 'lm-studio') {
                                    updates.baseUrl = (!settings.promptEngineer?.baseUrl || settings.promptEngineer?.baseUrl.includes(':11434') || settings.promptEngineer?.baseUrl.includes(':8080') || settings.promptEngineer?.baseUrl.includes(':8088')) ? 'http://localhost:1234/v1' : settings.promptEngineer?.baseUrl;
                                  }
                                  updateSettings({ promptEngineer: updates });
                                }}
                                className={`px-3 py-1 text-xs rounded font-bold transition-all uppercase ${
                                  settings.promptEngineer?.provider === p ? 'bg-amber-600 text-white' : 'text-slate-500'
                                }`}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* LLAMA-SERVER (LLAMA.CPP NATIVO) */}
                        {settings.promptEngineer?.provider === 'llama-server' && renderLlamaCppPanel('pe')}

                        {settings.promptEngineer?.provider !== 'ollama' && settings.promptEngineer?.provider !== 'lm-studio' && settings.promptEngineer?.provider !== 'llama-server' && (settings.promptEngineer?.provider as string) !== 'omnideploy' && (
                          <div>
                            <label className="block text-xs text-slate-500 uppercase mb-1">API Key</label>
                            <input
                              type="password"
                              value={settings.promptEngineer?.apiKey || ''}
                              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateSettings({ promptEngineer: { ...settings.promptEngineer, apiKey: e.target.value } })}
                              className="w-full bg-slate-900 border border-amber-700/50 rounded p-2 text-sm text-slate-300 font-mono"
                              placeholder="sk-..."
                            />
                          </div>
                        )}

                        {(['ollama', 'lm-studio', 'other'].includes(settings.promptEngineer?.provider || '')) && (
                          <>
                            <div>
                              <label className="block text-xs text-slate-500 uppercase mb-1">URL del Servidor</label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={settings.promptEngineer?.baseUrl || ''}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateSettings({ promptEngineer: { ...settings.promptEngineer, baseUrl: e.target.value } })}
                                  className="flex-1 bg-slate-900 border border-amber-700/50 rounded p-2 text-sm text-slate-300 font-mono"
                                  placeholder={settings.promptEngineer?.provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1'}
                                />
                                <button onClick={fetchPEModels} className="p-2 bg-slate-800 border border-slate-700 rounded hover:bg-slate-700 text-slate-400" title="Recargar modelos locales">
                                  <RefreshCw className={`w-4 h-4 ${loadingPEModels ? 'animate-spin' : ''}`} />
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 uppercase mb-1">Modelo</label>
                              {settings.promptEngineer?.provider === 'ollama' || settings.promptEngineer?.provider === 'lm-studio' || settings.promptEngineer?.provider === 'other' ? (
                                <select
                                  value={settings.promptEngineer?.model || ''}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateSettings({ promptEngineer: { ...settings.promptEngineer, model: e.target.value } })}
                                  className="w-full bg-slate-900 border border-amber-700/50 rounded p-2 text-sm text-slate-300 font-mono"
                                >
                                  <option value="">Selecciona un modelo...</option>
                                  {peModels.map(m => <option key={m} value={m}>{m}</option>)}
                                  {settings.promptEngineer?.model && !peModels.includes(settings.promptEngineer?.model) && (
                                    <option value={settings.promptEngineer?.model}>{settings.promptEngineer?.model}</option>
                                  )}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={settings.promptEngineer?.model || ''}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateSettings({ promptEngineer: { ...settings.promptEngineer, model: e.target.value } })}
                                  className="w-full bg-slate-900 border border-amber-700/50 rounded p-2 text-sm text-slate-300 font-mono"
                                  placeholder="ej: llama3, mistral, gemma2"
                                />
                              )}
                            </div>
                          </>
                        )}

                        {(['anthropic', 'openai', 'deepseek', 'qwen', 'kimi', 'openrouter', 'cometapi'].includes(settings.promptEngineer?.provider || '')) && (
                          <div className="p-3 bg-amber-900/20 border border-amber-500/30 rounded text-xs text-amber-200">
                            <p className="font-bold mb-1 flex items-center gap-2"><Cloud className="w-3 h-3" /> {(settings.promptEngineer?.provider || '').toUpperCase()} Cloud</p>
                            <p className="text-[10px] text-slate-400">Solo necesitas la API Key. Se usará el modelo por defecto del proveedor.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NPCS TAB */}
          {activeTab === 'npcs' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <Tooltip id="settingsNpcsProvider" showTooltips={showTooltips}>
                  <label className="flex items-center justify-between mb-4 cursor-pointer">
                    <span className="font-bold text-slate-200">Proveedor de Inteligencia NPCs (LLM)</span>
                    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 flex-wrap gap-1">
                      {['gemini', 'anthropic', 'openai', 'deepseek', 'qwen', 'kimi', 'openrouter', 'cometapi', 'ollama', 'omnideploy', 'lm-studio', 'llama-server', 'other'].map((p) => (
                        <button
                          key={p}
                          onClick={() => {
                            const updates: any = { provider: p as any };
                            if (p === 'ollama') {
                              updates.baseUrl = (!settings.npcs?.baseUrl || settings.npcs?.baseUrl.includes(':8080') || settings.npcs?.baseUrl.includes(':8088') || settings.npcs?.baseUrl.includes(':1234')) ? 'http://localhost:11434' : settings.npcs?.baseUrl;
                            } else if (p === 'llama-server') {
                              updates.baseUrl = (!settings.npcs?.baseUrl || settings.npcs?.baseUrl.includes(':11434') || settings.npcs?.baseUrl.includes(':8080') || settings.npcs?.baseUrl.includes(':1234')) ? 'http://localhost:8088/v1' : settings.npcs?.baseUrl;
                            } else if (p === 'lm-studio') {
                              updates.baseUrl = (!settings.npcs?.baseUrl || settings.npcs?.baseUrl.includes(':11434') || settings.npcs?.baseUrl.includes(':8080') || settings.npcs?.baseUrl.includes(':8088')) ? 'http://localhost:1234/v1' : settings.npcs?.baseUrl;
                            }
                            updateNpcSettings(updates);
                          }}
                          className={`px-3 py-1 text-xs rounded font-bold transition-all uppercase ${settings.npcs?.provider === p ? 'bg-sky-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </label>
                </Tooltip>

                {(settings.npcs?.provider as string) === 'omnideploy' && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 mb-4">
                    <div className="p-3 bg-cyan-900/20 border border-cyan-500/30 rounded text-xs text-cyan-200">
                      <p className="font-bold mb-1 flex items-center gap-2">
                        <Server className="w-3 h-3 text-cyan-400" /> DIÁLOGOS EN LA GPU DEL PROVEEDOR
                      </p>
                      No necesitas Ollama ni un modelo descargado en este equipo.
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">API Key de OmniDeploy</label>
                        <input
                          type="password"
                          value={settings.npcs?.omniDeployApiKey || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateNpcSettings({ omniDeployApiKey: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="La que te dio el proveedor"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">Deployment ID</label>
                        <input
                          type="text"
                          value={settings.npcs?.omniDeployDeploymentId || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateNpcSettings({ omniDeployDeploymentId: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="omni_..."
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  {/* API Key global — oculta para Ollama/LM-Studio/LLama-Server/OmniDeploy */}
                  {settings.npcs?.provider !== 'ollama' && settings.npcs?.provider !== 'lm-studio' && settings.npcs?.provider !== 'llama-server' && (settings.npcs?.provider as string) !== 'omnideploy' && (
                    <Tooltip id="settingsNpcsApiKey" showTooltips={showTooltips} className="block">
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">API Key (Opcional)</label>
                        <input
                          type="password"
                          value={settings.npcs?.apiKeys?.[settings.npcs.provider] || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            updateNpcSettings({
                              apiKey: e.target.value
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-sky-500 outline-none"
                          placeholder="sk-..."
                        />
                        <p className="text-[10px] text-slate-600 mt-1">Si usas Gemini, deja esto vacío para usar la clave del sistema, o ingresa una propia.</p>
                      </div>
                    </Tooltip>
                  )}

                  {/* Cloud providers (Gemini/Anthropic/OpenAI/DeepSeek/Qwen/Kimi/OpenRouter/CometAPI): model selection */}
                  {['gemini', 'anthropic', 'openai', 'deepseek', 'qwen', 'kimi', 'openrouter', 'cometapi'].includes(settings.npcs?.provider || '') && (() => {
                    const provider = settings.npcs?.provider || 'gemini';
                    const predefined = PREDEFINED_NPC_MODELS[provider] || [];
                    const fetched = fetchedNpcCloudModels[provider] || [];
                    
                    const allModels = Array.from(new Set([...predefined, ...fetched]));
                    const currentModel = settings.npcs?.model || '';
                    const isCustomModel = currentModel !== '' && !allModels.includes(currentModel);
                    
                    return (
                      <Tooltip id="settingsNpcModelSelect" showTooltips={showTooltips} className="block">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="block text-xs text-slate-500 uppercase mb-1">Modelo de NPC (Cloud)</label>
                            {provider !== 'anthropic' && (
                              <button
                                onClick={() => {
                                  const apiKey = settings.npcs?.apiKeys?.[provider] || settings.npcs?.apiKey;
                                  fetchNpcCloudModels(provider, apiKey || '');
                                }}
                                disabled={loadingNpcCloudModels || !(settings.npcs?.apiKeys?.[provider] || settings.npcs?.apiKey)}
                                className="text-[10px] text-sky-400 hover:text-sky-300 disabled:opacity-40 flex items-center gap-1 transition-all"
                                title="Cargar modelos desde el API del proveedor"
                              >
                                <RefreshCw className={`w-3 h-3 ${loadingNpcCloudModels ? 'animate-spin' : ''}`} />
                                {loadingNpcCloudModels ? 'CARGANDO...' : 'CARGAR DESDE PROVEEDOR'}
                              </button>
                            )}
                          </div>
                          
                          <select
                            value={isCustomModel ? 'custom' : (currentModel || allModels[0] || '')}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                updateNpcSettings({ model: 'custom' });
                              } else {
                                updateNpcSettings({ model: val });
                              }
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-sky-500 outline-none"
                          >
                            {allModels.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                            <option value="custom">Otro (Escribir modelo personalizado...)</option>
                          </select>

                          {(isCustomModel || (settings.npcs?.model === 'custom')) && (
                            <div className="pt-2">
                              <input
                                type="text"
                                value={currentModel === 'custom' ? '' : currentModel}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateNpcSettings({ model: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-sky-500 outline-none"
                                placeholder="Escribe el modelo personalizado..."
                              />
                            </div>
                          )}

                          {npcCloudModelError && (
                            <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 animate-pulse" /> {npcCloudModelError}
                            </p>
                          )}
                          {!npcCloudModelError && provider !== 'anthropic' && fetched.length === 0 && (
                            <p className="text-[10px] text-slate-500">
                              Selecciona un modelo de la lista o presiona ↻ para cargar los modelos activos de tu cuenta.
                            </p>
                          )}
                        </div>
                      </Tooltip>
                    );
                  })()}

                  {/* Other: URL + Model + API Key */}
                  {settings.npcs?.provider === 'other' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">URL del Servidor (OpenAI-compatible)</label>
                        <input
                          type="text"
                          value={settings.npcs?.baseUrl || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateNpcSettings({ baseUrl: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-sky-500 outline-none"
                          placeholder="https://mi-servidor.com/v1/chat/completions"
                        />
                        <p className="text-[10px] text-slate-600 mt-1">Debe ser un endpoint compatible con la API de OpenAI (chat/completions).</p>
                      </div>
                      <Tooltip id="settingsNpcsOtherModel" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">Nombre del Modelo</label>
                          <input
                            type="text"
                            value={settings.npcs?.model || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateNpcSettings({ model: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-sky-500 outline-none"
                            placeholder="gpt-3.5-turbo"
                          />
                        </div>
                      </Tooltip>
                    </div>
                  )}

                  {/* LLAMA-SERVER (LLAMA.CPP NATIVO) */}
                  {settings.npcs?.provider === 'llama-server' && renderLlamaCppPanel('npcs')}

                  {/* Ollama / LM-Studio: Servidor Local */}
                  {(settings.npcs?.provider === 'ollama' || settings.npcs?.provider === 'lm-studio') && (
                    <>
                      {/* Toggle LOCAL / CLOUD */}
                      <Tooltip id="settingsNpcsServerToggle" showTooltips={showTooltips} className="block">
                        <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-700 rounded-lg">
                          <div>
                            <p className="text-xs font-bold text-slate-200">{npcOllamaCloudMode ? 'Modo: API Cloud' : 'Modo: Servidor Local'}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {npcOllamaCloudMode
                                ? `Conectado a ${settings.npcs?.provider === 'ollama' ? 'api.ollama.com' : 'los servidores cloud de LM-Studio'}`
                                : 'Usando servidor local en tu máquina'}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const next = !npcOllamaCloudMode;
                              setNpcOllamaCloudMode(next);
                              if (!next) {
                                updateNpcSettings({
                                  baseUrl: settings.npcs?.provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1'
                                });
                              } else {
                                updateNpcSettings({
                                  baseUrl: settings.npcs?.provider === 'ollama' ? 'https://api.ollama.com' : 'https://api.lmstudio.ai',
                                  model: settings.npcs?.model || ''
                                });
                              }
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${npcOllamaCloudMode ? 'bg-sky-600 text-white shadow-md shadow-sky-900/10' : 'bg-slate-700 text-slate-300'}`}
                          >
                            {npcOllamaCloudMode ? <Cloud className="w-3 h-3" /> : <Server className="w-3 h-3" />}
                            {npcOllamaCloudMode ? 'CLOUD' : 'LOCAL'}
                          </button>
                        </div>
                      </Tooltip>

                      {/* MODO LOCAL */}
                      {!npcOllamaCloudMode && (
                        <>
                          <Tooltip id="settingsNpcsServerUrl" showTooltips={showTooltips} className="block">
                            <div>
                              <label className="block text-xs text-slate-500 uppercase mb-1">URL del Servidor Local</label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={settings.npcs?.baseUrl || ''}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateNpcSettings({ baseUrl: e.target.value })}
                                  className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-sky-500 outline-none"
                                  placeholder={settings.npcs?.provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1'}
                                />
                                {settings.npcs?.provider === 'ollama' && (
                                  <button onClick={fetchNpcModels} className="p-2 bg-slate-800 border border-slate-700 rounded hover:bg-slate-700 text-slate-400" title="Recargar modelos locales">
                                    <RefreshCw className={`w-4 h-4 ${loadingNpcModels ? 'animate-spin' : ''}`} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </Tooltip>

                          {settings.npcs?.provider === 'ollama' && (
                            <Tooltip id="settingsNpcsModelPull" showTooltips={showTooltips} className="block">
                              <div className="border border-slate-850 bg-slate-900/30 p-3 rounded-lg">
                                <label className="block text-[10px] text-slate-500 uppercase mb-1 font-bold font-mono">Descargar Nuevo Modelo desde Biblioteca Ollama</label>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={newNpcModelName}
                                    onChange={(e) => setNewNpcModelName(e.target.value)}
                                    placeholder="ej: gemma2:2b, phi3, mistral"
                                    className="flex-1 bg-slate-900 border border-slate-800 rounded p-2 text-xs font-mono text-slate-300 focus:border-sky-500 outline-none"
                                  />
                                  <button
                                    onClick={handlePullNpcModel}
                                    disabled={pullingNpcModel || !newNpcModelName}
                                    className="px-4 bg-sky-950/40 hover:bg-sky-900/30 text-sky-400 border border-sky-800/60 rounded text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
                                  >
                                    {pullingNpcModel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                    DESCARGAR
                                  </button>
                                </div>
                                <p className="text-[9px] text-slate-600 mt-1">Conecta con ollama.com para descargar modelos ligeros y rápidos directamente a tu PC.</p>
                              </div>
                            </Tooltip>
                          )}
                        </>
                      )}

                      {/* Selector de Modelos para Ollama/LM-Studio/LLama-Server */}
                      <Tooltip id="settingsNpcsModelSelect" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">Modelo Seleccionado</label>
                          <input
                            type="text"
                            value={settings.npcs?.model || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateNpcSettings({ model: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-sky-500 outline-none mb-2"
                            placeholder="Nombre del modelo (ej: llama3, gemma, local-model)"
                          />
                          {!npcOllamaCloudMode && settings.npcs?.provider === 'ollama' && npcModels.length > 0 && (
                            <div className="flex flex-wrap gap-1 bg-slate-900/50 p-2 border border-slate-800 rounded-lg">
                              <span className="text-[9px] text-slate-500 uppercase font-mono w-full mb-1">Modelos Locales Detectados:</span>
                              {npcModels.map((m) => (
                                <button
                                  key={m}
                                  onClick={() => updateNpcSettings({ model: m })}
                                  className={`px-2 py-0.5 text-[10px] rounded font-mono transition-all border ${settings.npcs?.model === m ? 'bg-sky-950 text-sky-400 border-sky-800' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'}`}
                                >
                                  {m}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </Tooltip>
                    </>
                  )}
                </div>
                {renderTestConnectionWidget(
                  'npcs',
                  settings.npcs?.provider || 'gemini',
                  settings.npcs?.provider === 'ollama' || settings.npcs?.provider === 'lm-studio' || settings.npcs?.provider === 'other'
                    ? (settings.npcs?.baseUrl || '')
                    : '',
                  settings.npcs?.apiKeys?.[settings.npcs?.provider || 'gemini'] || settings.npcs?.apiKey
                )}
              </div>
            </div>
          )}

          {/* SCRIPTS (CODE) TAB */}
          {activeTab === 'code' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <Tooltip id="settingsCodeProvider" showTooltips={showTooltips}>
                  <label className="flex items-center justify-between mb-4 cursor-pointer">
                    <span className="font-bold text-slate-200">Proveedor de IA para Scripts (Código)</span>
                    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 flex-wrap gap-1">
                      {['gemini', 'anthropic', 'openai', 'deepseek', 'qwen', 'kimi', 'openrouter', 'cometapi', 'ollama', 'omnideploy', 'lm-studio', 'llama-server', 'other'].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => {
                            const updates: any = { provider: p as any };
                            if (p === 'ollama') {
                              updates.baseUrl = (!settings.code?.baseUrl || settings.code?.baseUrl.includes(':8080') || settings.code?.baseUrl.includes(':8088') || settings.code?.baseUrl.includes(':1234')) ? 'http://localhost:11434' : settings.code?.baseUrl;
                            } else if (p === 'llama-server') {
                              updates.baseUrl = (!settings.code?.baseUrl || settings.code?.baseUrl.includes(':11434') || settings.code?.baseUrl.includes(':8080') || settings.code?.baseUrl.includes(':1234')) ? 'http://localhost:8088/v1' : settings.code?.baseUrl;
                            } else if (p === 'lm-studio') {
                              updates.baseUrl = (!settings.code?.baseUrl || settings.code?.baseUrl.includes(':11434') || settings.code?.baseUrl.includes(':8080') || settings.code?.baseUrl.includes(':8088')) ? 'http://localhost:1234/v1' : settings.code?.baseUrl;
                            }
                            updateCodeSettings(updates);
                          }}
                          className={`px-3 py-1 text-xs rounded font-bold transition-all uppercase ${settings.code?.provider === p ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </label>
                </Tooltip>

                {(settings.code?.provider as string) === 'omnideploy' && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 mb-4">
                    <div className="p-3 bg-cyan-900/20 border border-cyan-500/30 rounded text-xs text-cyan-200">
                      <p className="font-bold mb-1 flex items-center gap-2">
                        <Server className="w-3 h-3 text-cyan-400" /> SCRIPTS EN LA GPU DEL PROVEEDOR
                      </p>
                      No necesitas Ollama ni un modelo descargado en este equipo.
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">API Key de OmniDeploy</label>
                        <input
                          type="password"
                          value={settings.code?.omniDeployApiKey || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCodeSettings({ omniDeployApiKey: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="La que te dio el proveedor"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">Deployment ID</label>
                        <input
                          type="text"
                          value={settings.code?.omniDeployDeploymentId || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCodeSettings({ omniDeployDeploymentId: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="omni_..."
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  {/* API Key global — oculta para Ollama/LM-Studio/LLama-Server/OmniDeploy */}
                  {settings.code?.provider !== 'ollama' && settings.code?.provider !== 'lm-studio' && settings.code?.provider !== 'llama-server' && (settings.code?.provider as string) !== 'omnideploy' && (
                    <Tooltip id="settingsCodeApiKey" showTooltips={showTooltips} className="block">
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">API Key (Opcional)</label>
                        <input
                          type="password"
                          value={settings.code?.apiKeys?.[settings.code.provider] || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            updateCodeSettings({
                              apiKey: e.target.value
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-emerald-500 outline-none"
                          placeholder="Ingresa tu API Key..."
                        />
                        <p className="text-[10px] text-slate-600 mt-1">Si usas Gemini, deja esto vacío para usar la clave del sistema, o ingresa una propia.</p>
                      </div>
                    </Tooltip>
                  )}

                  {/* Cloud providers: model configuration */}
                  {['gemini', 'anthropic', 'openai', 'deepseek', 'qwen', 'kimi', 'openrouter', 'cometapi'].includes(settings.code?.provider || '') && (() => {
                    const provider = settings.code?.provider || 'gemini';
                    const predefined = PREDEFINED_CODE_MODELS[provider] || [];
                    const fetched = fetchedCodeCloudModels[provider] || [];
                    
                    const allModels = Array.from(new Set([...predefined, ...fetched]));
                    const currentModel = settings.code?.model || '';
                    const isCustomModel = currentModel !== '' && !allModels.includes(currentModel);
                    
                    return (
                      <Tooltip id="settingsCodeModelSelect" showTooltips={showTooltips} className="block">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="block text-xs text-slate-500 uppercase mb-1">Modelo de Código (Cloud)</label>
                            {provider !== 'anthropic' && (
                              <button
                                onClick={() => {
                                  const apiKey = settings.code?.apiKeys?.[provider] || settings.code?.apiKey;
                                  fetchCodeCloudModels(provider, apiKey || '');
                                }}
                                disabled={loadingCodeCloudModels || !(settings.code?.apiKeys?.[provider] || settings.code?.apiKey)}
                                className="text-[10px] text-emerald-400 hover:text-emerald-300 disabled:opacity-40 flex items-center gap-1 transition-all"
                                title="Cargar modelos desde el API del proveedor"
                              >
                                <RefreshCw className={`w-3 h-3 ${loadingCodeCloudModels ? 'animate-spin' : ''}`} />
                                {loadingCodeCloudModels ? 'CARGANDO...' : 'CARGAR DESDE PROVEEDOR'}
                              </button>
                            )}
                          </div>
                          
                          <select
                            value={isCustomModel ? 'custom' : (currentModel || allModels[0] || '')}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                updateCodeSettings({ model: 'custom' });
                              } else {
                                updateCodeSettings({ model: val });
                              }
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-emerald-500 outline-none"
                          >
                            {allModels.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                            <option value="custom">Otro (Escribir modelo personalizado...)</option>
                          </select>

                          {(isCustomModel || (settings.code?.model === 'custom')) && (
                            <div className="pt-2">
                              <input
                                type="text"
                                value={currentModel === 'custom' ? '' : currentModel}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCodeSettings({ model: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-emerald-500 outline-none"
                                placeholder="Escribe el modelo personalizado..."
                              />
                            </div>
                          )}

                          {codeCloudModelError && (
                            <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 animate-pulse" /> {codeCloudModelError}
                            </p>
                          )}
                          {!codeCloudModelError && provider !== 'anthropic' && fetched.length === 0 && (
                            <p className="text-[10px] text-slate-500">
                              Selecciona un modelo de la lista o presiona ↻ para cargar los modelos activos de tu cuenta.
                            </p>
                          )}
                        </div>
                      </Tooltip>
                    );
                  })()}

                  {/* Other: URL + Model + API Key */}
                  {settings.code?.provider === 'other' && (
                    <div className="space-y-4">
                      <Tooltip id="settingsCodeServerUrl" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">URL del Servidor (OpenAI-compatible)</label>
                          <input
                            type="text"
                            value={settings.code?.baseUrl || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCodeSettings({ baseUrl: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-emerald-500 outline-none"
                            placeholder="https://mi-servidor.com/v1"
                          />
                          <p className="text-[10px] text-slate-600 mt-1">Debe ser un endpoint compatible con la API de OpenAI (chat/completions).</p>
                        </div>
                      </Tooltip>

                      <Tooltip id="settingsCodeModelSelect" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">Nombre del Modelo</label>
                          <input
                            type="text"
                            value={settings.code?.model || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCodeSettings({ model: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-emerald-500 outline-none"
                            placeholder="Nombre del modelo custom"
                          />
                        </div>
                      </Tooltip>
                    </div>
                  )}

                  {/* LLAMA-SERVER (LLAMA.CPP NATIVO) */}
                  {settings.code?.provider === 'llama-server' && renderLlamaCppPanel('code')}

                  {/* Ollama / LM-Studio: Servidor Local */}
                  {(settings.code?.provider === 'ollama' || settings.code?.provider === 'lm-studio') && (
                    <>
                      {/* Toggle LOCAL / CLOUD */}
                      <Tooltip id="settingsCodeServerToggle" showTooltips={showTooltips} className="block">
                        <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-700 rounded-lg">
                          <div>
                            <p className="text-xs font-bold text-slate-200">{codeOllamaCloudMode ? 'Modo: API Cloud' : 'Modo: Servidor Local'}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {codeOllamaCloudMode
                                ? `Conectado a ${settings.code?.provider === 'ollama' ? 'api.ollama.com' : 'los servidores cloud de LM-Studio'}`
                                : 'Usando servidor local en tu máquina'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const next = !codeOllamaCloudMode;
                              setCodeOllamaCloudMode(next);
                              if (!next) {
                                updateCodeSettings({
                                  baseUrl: settings.code?.provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1'
                                });
                              } else {
                                updateCodeSettings({
                                  baseUrl: settings.code?.provider === 'ollama' ? 'https://api.ollama.com' : 'https://api.lmstudio.ai',
                                  model: settings.code?.model || ''
                                });
                              }
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${codeOllamaCloudMode ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/10' : 'bg-slate-700 text-slate-300'}`}
                          >
                            {codeOllamaCloudMode ? <Cloud className="w-3 h-3" /> : <Server className="w-3 h-3" />}
                            {codeOllamaCloudMode ? 'CLOUD' : 'LOCAL'}
                          </button>
                        </div>
                      </Tooltip>

                      {/* MODO LOCAL */}
                      {!codeOllamaCloudMode && (
                        <>
                          <Tooltip id="settingsCodeServerUrl" showTooltips={showTooltips} className="block">
                            <div>
                              <label className="block text-xs text-slate-500 uppercase mb-1">URL del Servidor Local</label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={settings.code?.baseUrl || ''}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCodeSettings({ baseUrl: e.target.value })}
                                  className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-emerald-500 outline-none"
                                  placeholder={settings.code?.provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1'}
                                />
                                {settings.code?.provider === 'ollama' && (
                                  <button type="button" onClick={fetchCodeModels} className="p-2 bg-slate-800 border border-slate-700 rounded hover:bg-slate-700 text-slate-400" title="Recargar modelos locales">
                                    <RefreshCw className={`w-4 h-4 ${loadingCodeModels ? 'animate-spin' : ''}`} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </Tooltip>

                          {settings.code?.provider === 'ollama' && (
                            <Tooltip id="settingsCodeModelPull" showTooltips={showTooltips} className="block">
                              <div className="border border-slate-850 bg-slate-900/30 p-3 rounded-lg">
                                <label className="block text-[10px] text-slate-500 uppercase mb-1 font-bold font-mono">Descargar Nuevo Modelo desde Biblioteca Ollama</label>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={newCodeModelName}
                                    onChange={(e) => setNewCodeModelName(e.target.value)}
                                    placeholder="ej: qwen:coder, codellama, codegemma"
                                    className="flex-1 bg-slate-900 border border-slate-850 rounded p-2 text-xs font-mono text-slate-300 focus:border-emerald-500 outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={handlePullCodeModel}
                                    disabled={pullingCodeModel || !newCodeModelName}
                                    className="px-4 bg-emerald-950/40 hover:bg-emerald-900/30 text-emerald-400 border border-emerald-800/60 rounded text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
                                  >
                                    {pullingCodeModel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                    DESCARGAR
                                  </button>
                                </div>
                                <p className="text-[9px] text-slate-600 mt-1">Conecta con ollama.com para descargar modelos de código específicos y ejecutarlos localmente.</p>
                              </div>
                            </Tooltip>
                          )}
                        </>
                      )}

                      {/* Selector de Modelos para Ollama/LM-Studio/LLama-Server */}
                      <Tooltip id="settingsCodeModelSelect" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">Modelo Seleccionado</label>
                          <input
                            type="text"
                            value={settings.code?.model || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCodeSettings({ model: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-emerald-500 outline-none mb-2"
                            placeholder="Nombre del modelo (ej: llama3, qwen:coder, local-model)"
                          />
                          {!codeOllamaCloudMode && settings.code?.provider === 'ollama' && codeModels.length > 0 && (
                            <div className="flex flex-wrap gap-1 bg-slate-900/50 p-2 border border-slate-800 rounded-lg">
                              <span className="text-[9px] text-slate-500 uppercase font-mono w-full mb-1">Modelos Locales Detectados:</span>
                              {codeModels.map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => updateCodeSettings({ model: m })}
                                  className={`px-2 py-0.5 text-[10px] rounded font-mono transition-all border ${settings.code?.model === m ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'}`}
                                >
                                  {m}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </Tooltip>
                    </>
                  )}
                </div>
                {renderTestConnectionWidget(
                  'code',
                  settings.code?.provider || 'gemini',
                  settings.code?.provider === 'ollama' || settings.code?.provider === 'lm-studio' || settings.code?.provider === 'other'
                    ? (settings.code?.baseUrl || '')
                    : '',
                  settings.code?.apiKeys?.[settings.code?.provider || 'gemini'] || settings.code?.apiKey
                )}
              </div>
            </div>
          )}

          {/* LOCAL ENGINES TAB */}
          {activeTab === 'local' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="bg-slate-950 p-6 rounded-lg border border-slate-800 space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
                  <Server className="w-6 h-6 text-orange-500" />
                  <div>
                    <h3 className="text-md font-bold text-slate-200">Configuración de ComfyUI y Motores Locales</h3>
                    <p className="text-xs text-slate-500">Configura la ruta local de tu instalación para permitir la ejecución directa de ComfyUI.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <input
                    type="file"
                    ref={comfyDirInputRef}
                    className="hidden"
                    // @ts-ignore
                    webkitdirectory=""
                    directory=""
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files && files.length > 0) {
                        const folderName = files[0].webkitRelativePath?.split('/')[0] || files[0].name;
                        updateSettings({ comfyuiPath: folderName });
                      }
                    }}
                  />
                  <input
                    type="file"
                    ref={comfyFileInputRef}
                    className="hidden"
                    accept=".bat,.cmd,.exe"
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files && files.length > 0) {
                        updateSettings({ comfyuiPath: files[0].name });
                      }
                    }}
                  />
                  <Tooltip id="comfyuiPathSelector" showTooltips={showTooltips} className="block">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Ruta de Instalación de ComfyUI (Carpeta, .bat o URL)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly={!isWebClient}
                          value={settings.comfyuiPath || ''}
                          onChange={(e) => updateSettings({ comfyuiPath: e.target.value })}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded p-2.5 text-xs text-slate-300 font-mono outline-none focus:border-orange-500 transition-colors"
                          placeholder={isWebClient ? "Escribe/pega la ruta (ej: G:\\apps\\ComfyUI o http://127.0.0.1:8188)..." : "Ninguna ruta seleccionada. Haz clic en los botones para buscar..."}
                        />
                        <button
                          type="button"
                          onClick={handleSelectComfyDirectory}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs font-bold text-slate-300 flex items-center gap-1.5 transition-colors"
                          title="Seleccionar directorio raíz"
                        >
                          <Folder className="w-3.5 h-3.5 text-orange-400" />
                          CARPETA
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectComfyBat}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs font-bold text-slate-300 flex items-center gap-1.5 transition-colors"
                          title="Seleccionar script .bat personalizado"
                        >
                          <File className="w-3.5 h-3.5 text-orange-400" />
                          SCRIPT .BAT
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2">
                        <strong>Detección inteligente activa:</strong> Puedes buscar con los botones o escribir/pegar directamente cualquier ruta o dirección URL (ej: `G:\apps\ComfyUI` o `http://127.0.0.1:8188`).
                      </p>
                    </div>
                  </Tooltip>
                </div>

                {/* Control en Vivo y Logs */}
                <div className="border-t border-slate-800 pt-6 space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500 uppercase tracking-widest font-mono">Estado del Servicio</p>
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${isComfyRunning ? 'bg-green-500 animate-ping-slow' : 'bg-red-500'}`} />
                        <span className={`text-sm font-bold font-mono ${isComfyRunning ? 'text-green-400' : 'text-red-400'}`}>
                          COMFYUI: {isComfyRunning ? 'READY (ONLINE)' : 'OFFLINE'}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      {vramStatusMsg && (
                        <span className="text-[10px] text-blue-400 font-mono animate-pulse">
                          {vramStatusMsg}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleFreeVram}
                        disabled={isFreeingVram}
                        className="px-5 py-2.5 bg-blue-950/40 hover:bg-blue-800 border border-blue-800 text-blue-400 font-bold rounded-lg text-xs tracking-wider transition-all flex items-center gap-2 disabled:opacity-50"
                        title="Libera la memoria VRAM retenida por los modelos cargados en ComfyUI"
                      >
                        {isFreeingVram ? (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                        ) : (
                          <Cpu className="w-4 h-4 text-blue-400" />
                        )}
                        LIBERAR VRAM
                      </button>
                      {isComfyRunning || isLaunchingComfy ? (
                        <button
                          type="button"
                          onClick={onStopComfy}
                          className="px-5 py-2.5 bg-red-950/40 hover:bg-red-800 border border-red-800 text-red-400 font-bold rounded-lg text-xs tracking-wider transition-all flex items-center gap-2"
                        >
                          <X className="w-4 h-4" />
                          DETENER COMFYUI
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onLaunchComfy}
                          disabled={isLaunchingComfy || !settings.comfyuiPath}
                          className="px-5 py-2.5 bg-orange-950/40 hover:bg-orange-900/30 text-orange-400 border border-orange-800/60 font-bold rounded-lg text-xs tracking-wider transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isLaunchingComfy ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                              LANZANDO...
                            </>
                          ) : (
                            <>
                              <Server className="w-4 h-4 text-orange-400" />
                              LANZAR COMFYUI
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Toggle: Liberación Automática de VRAM/RAM tras cada generación */}
                  <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wide">
                          LIBERAR VRAM/RAM TRAS CADA GENERACIÓN
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                          settings.autoFreeMemoryAfterGeneration
                            ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                            : 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                        }`}>
                          {settings.autoFreeMemoryAfterGeneration ? 'LIBERACIÓN INMEDIATA' : 'MODO CALIENTE'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {settings.autoFreeMemoryAfterGeneration
                          ? 'Descarga los modelos de Ollama, ComfyUI y Llama-Server inmediatamente al terminar cada tarea, dejando 100% de memoria libre.'
                          : 'Mantiene los modelos cargados en GPU/RAM para que las generaciones consecutivas con el mismo motor respondan al instante.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSettings({ autoFreeMemoryAfterGeneration: !settings.autoFreeMemoryAfterGeneration })}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings.autoFreeMemoryAfterGeneration ? 'bg-amber-600' : 'bg-slate-700'
                      }`}
                      title={settings.autoFreeMemoryAfterGeneration ? 'Desactivar liberación automática' : 'Activar liberación automática'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          settings.autoFreeMemoryAfterGeneration ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Consola de logs integrada */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400 uppercase font-mono">
                      <span className="flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5 text-slate-500" /> Consola de Salida - logs</span>
                      <div className="flex items-center gap-2">
                        {onClearLogs && (
                          <button
                            type="button"
                            onClick={onClearLogs}
                            className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-800 transition-colors"
                            title="Limpiar Consola"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-slate-500 hover:text-red-400" />
                          </button>
                        )}
                        {isComfyRunning && <span className="text-[10px] text-green-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Escuchando...</span>}
                      </div>
                    </div>
                    <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-black">
                      <pre 
                        ref={terminalLogsRef}
                        className="p-4 text-[10px] text-slate-300 font-mono overflow-y-auto max-h-48 leading-relaxed scrollbar-thin select-text text-left whitespace-pre-wrap"
                        style={{ scrollBehavior: 'smooth' }}
                      >
                        {comfyLogs || 'Consola inactiva. Lanza ComfyUI para ver logs de salida.'}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* IMAGE TAB */}
          {activeTab === 'image' && (
            <div className="space-y-6">
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <Tooltip id="settingsImageProvider" showTooltips={showTooltips}>
                  <label className="flex items-center justify-between mb-4 cursor-pointer">
                    <span className="font-bold text-slate-200">Generación de Imágenes</span>
                    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 flex-wrap gap-1">
                      {['gemini', 'openai', 'midjourney-api', 'comfydeploy', 'omnideploy', 'comfyui', 'a1111', 'ollama', 'lm-studio', 'other'].map((p) => (
                        <button
                          key={p}
                          onClick={() => updateImageSettings({ provider: p as any })}
                          className={`px-3 py-1 text-xs rounded font-bold transition-all uppercase ${settings.image.provider === p ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </label>
                </Tooltip>

                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  {/* API Key (Cloud Providers) */}
                  {(['gemini', 'openai', 'midjourney-api', 'other'].includes(settings.image.provider)) && (
                    <Tooltip id="settingsTextApiKey" showTooltips={showTooltips} className="block">
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">API Key (Opcional)</label>
                        <input
                          type="password"
                          value={settings.image.apiKeys?.[settings.image.provider] || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            updateImageSettings({
                              apiKey: e.target.value
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="sk-..."
                        />
                      </div>
                    </Tooltip>
                  )}

                  {/* ComfyDeploy Image Settings */}
                  {settings.image.provider === 'comfydeploy' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                      <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded text-xs text-purple-200">
                        <p className="font-bold mb-1 flex items-center gap-2">
                          <Server className="w-3 h-3 text-purple-400" /> API Cloud: COMFYDEPLOY
                        </p>
                        Ejecuta tu workflow de ComfyUI hospedado en la nube con GPUs dedicadas de alta velocidad.
                      </div>

                      <Tooltip id="settingsImageComfyDeployApiKey" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">ComfyDeploy API Key</label>
                          <input
                            type="password"
                            value={settings.image.comfyDeployApiKey || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateImageSettings({ comfyDeployApiKey: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                            placeholder="cd_live_..."
                          />
                        </div>
                      </Tooltip>

                      <Tooltip id="settingsImageComfyDeployDeploymentId" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">ComfyDeploy Deployment ID</label>
                          <input
                            type="text"
                            value={settings.image.comfyDeployDeploymentId || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateImageSettings({ comfyDeployDeploymentId: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                            placeholder="12345678-abcd-..."
                          />
                        </div>
                      </Tooltip>
                    </div>
                  )}

                  {/* OmniDeploy Image Settings.
                      Bloque AÑADIDO junto al de ComfyDeploy, con el mismo
                      patron. Nada de lo anterior se toca: ComfyUI, ComfyDeploy
                      y A1111 conservan sus bloques intactos. */}
                  {settings.image.provider === 'omnideploy' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                      <div className="p-3 bg-cyan-900/20 border border-cyan-500/30 rounded text-xs text-cyan-200">
                        <p className="font-bold mb-1 flex items-center gap-2">
                          <Server className="w-3 h-3 text-cyan-400" /> GPU REMOTA: OMNIDEPLOY
                        </p>
                        Genera en la GPU del proveedor. No necesitas ComfyUI instalado ni una tarjeta
                        potente: el trabajo se encola y se ejecuta en el equipo del proveedor.
                      </div>

                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">OmniDeploy API Key</label>
                        <input
                          type="password"
                          value={settings.image.omniDeployApiKey || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateImageSettings({ omniDeployApiKey: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="La que te entrego el proveedor"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">OmniDeploy Deployment ID</label>
                        <input
                          type="text"
                          value={settings.image.omniDeployDeploymentId || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateImageSettings({ omniDeployDeploymentId: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="omni_..."
                        />
                      </div>

                      <p className="text-[10px] text-slate-500 font-mono leading-relaxed">
                        Pulsa PROBAR CONEXIÓN para saber si la GPU del proveedor está encendida:
                        unas credenciales correctas con el equipo apagado no generan nada.
                      </p>
                    </div>
                  )}

                  {/* Universal Image Model Selector */}
                  {['gemini', 'openai', 'midjourney-api', 'a1111', 'ollama', 'lm-studio', 'other'].includes(settings.image.provider) && (() => {
                    const provider = settings.image.provider;
                    const predefined = PREDEFINED_IMAGE_MODELS[provider] || [];
                    const currentModel = settings.image.model || '';
                    const isCustomModel = currentModel !== '' && !predefined.includes(currentModel);

                    return (
                      <Tooltip id="settingsImageModelSelect" showTooltips={showTooltips} className="block animate-in fade-in slide-in-from-top-1">
                        <div className="space-y-2 mt-2 bg-slate-900/40 p-3 rounded border border-slate-800">
                          <div className="flex items-center justify-between">
                            <label className="block text-xs text-slate-500 uppercase mb-1 font-bold">Modelo de Imagen ({provider.toUpperCase()})</label>
                            {provider === 'openai' && (
                              <span className="text-[10px] text-blue-400">DALL-E Cloud</span>
                            )}
                          </div>
                          <select
                            value={isCustomModel ? 'custom' : (currentModel || predefined[0] || '')}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                updateImageSettings({ model: 'custom' });
                              } else {
                                updateImageSettings({ model: val });
                              }
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-blue-500 outline-none"
                          >
                            {predefined.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                            <option value="custom">Otro (Escribir modelo personalizado...)</option>
                          </select>

                          {(isCustomModel || (settings.image.model === 'custom')) && (
                            <div className="pt-2">
                              <input
                                type="text"
                                value={currentModel === 'custom' ? '' : currentModel}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateImageSettings({ model: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-blue-500 outline-none"
                                placeholder="Escribe el modelo personalizado..."
                              />
                            </div>
                          )}
                        </div>
                      </Tooltip>
                    );
                  })()}

                  {/* Próximamente (Not Implemented Yet) */}
                  {(['midjourney-api', 'ollama', 'lm-studio'].includes(settings.image.provider)) && (
                    <div className="p-3 bg-orange-900/20 border border-orange-500/30 rounded text-xs text-orange-200">
                      <p className="font-bold mb-1 flex items-center gap-2"><AlertTriangle className="w-3 h-3" /> Próximamente</p>
                      Este proveedor no está implementado de forma nativa para generación de imágenes en esta versión de Omni IA Game.
                    </div>
                  )}

                  {/* Local Providers */}
                  {(['comfyui', 'a1111', 'other'].includes(settings.image.provider)) && (
                    <>
                      <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded text-xs text-blue-200 mb-4">
                        <p className="font-bold mb-1 flex items-center gap-2"><Server className="w-3 h-3" /> Configuración Local</p>
                        Conecta tu instancia de {settings.image.provider.toUpperCase()}. Asegúrate de habilitar CORS y permitir conexiones externas.
                      </div>

                      <Tooltip id="settingsImageUrl" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">URL del Servidor</label>
                          <input
                            type="text"
                            value={settings.image.baseUrl}
                            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateImageSettings({ baseUrl: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                            placeholder={settings.image.provider === 'comfyui' ? "http://127.0.0.1:8188" : "http://127.0.0.1:7860"}
                          />
                        </div>
                      </Tooltip>

                      {(settings.image.provider === 'comfyui' || settings.image.provider === 'a1111') && (
                        <div className="space-y-4 mt-2">
                          <Tooltip id="settingsImageWorkflowId" showTooltips={showTooltips} className="block">
                            <div>
                              <label className="block text-xs text-slate-500 uppercase mb-1">
                                {settings.image.provider === 'comfyui' ? 'Workflow ID por Defecto' : 'Nombre del Workflow para A1111'}
                              </label>
                              <input
                                type="text"
                                value={settings.image.workflowId || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateImageSettings({ workflowId: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                                placeholder=""
                              />
                              <p className="text-[10px] text-slate-600 mt-1">
                                ID del flujo de trabajo si no se carga un archivo .json manual.
                              </p>
                            </div>
                          </Tooltip>

                          <Tooltip id="settingsImageCustomWorkflow" showTooltips={showTooltips} className="block">
                            <div className="mt-4">
                              <label className="block text-xs text-slate-500 uppercase mb-1">
                                {settings.image.provider === 'comfyui' ? 'Workflow ComfyUI (.json)' : 'Workflow A1111 (.json)'}
                              </label>
                              <div className="flex gap-2 items-center">
                                <input
                                  type="file"
                                  accept=".json"
                                  className="hidden"
                                  ref={imageWorkflowInputRef}
                                  onChange={handleImageWorkflowUpload}
                                />
                                <button
                                  onClick={() => imageWorkflowInputRef.current?.click()}
                                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] text-slate-300 font-bold tracking-wider transition-colors"
                                >
                                  {settings.image.customWorkflow ? 'CAMBIAR WORKFLOW' : 'CARGAR WORKFLOW JSON'}
                                </button>
                                {settings.image.customWorkflow && (
                                  <button
                                    onClick={() => updateImageSettings({ customWorkflow: undefined })}
                                    className="p-2 bg-red-950/40 hover:bg-red-800 border border-red-800 rounded text-red-400 transition-colors"
                                    title="Remover Workflow"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                              {settings.image.customWorkflow && (
                                <p className="text-[10px] text-blue-400 mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Workflow JSON cargado en memoria</p>
                              )}
                            </div>
                          </Tooltip>

                          {/* Un workflow por accion, debajo del que se sube a
                              mano y antes de la integracion. Vive dentro de
                              este bloque -que ya es compartido por ComfyUI y
                              A1111- para que aparezca identico en los dos y
                              solo cuando uno de ellos es el proveedor: con
                              Gemini o OpenAI un workflow no significa nada. */}
                          <div className="pt-3 border-t border-slate-800">
                            <Tooltip id="workflowByAction" showTooltips={showTooltips} inline><p className="text-xs text-slate-400 uppercase font-bold mb-2">Workflow por acción</p></Tooltip>
                            <SpriteWorkflowAssignments showTooltips={showTooltips} />
                          </div>

                          <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded text-xs text-blue-200 mt-2">
                            <p className="font-bold mb-1 flex items-center gap-2">
                              <Server className="w-3 h-3" /> Integración {settings.image.provider === 'comfyui' ? 'ComfyUI' : 'A1111'} (Assets)
                            </p>
                            Carga tu archivo de flujo de trabajo JSON. El sistema inyectará automáticamente los prompts positivo y negativo, la semilla aleatoria, y la imagen de consistencia si está activada en la pestaña principal.
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {/* Test Connection Widget for Image Provider */}
                  {renderTestConnectionWidget(
                    'image', 
                    settings.image.provider, 
                    settings.image.provider === 'comfydeploy'
                      ? (settings.image.comfyDeployDeploymentId || '')
                      : settings.image.baseUrl, 
                    settings.image.provider === 'comfydeploy'
                      ? settings.image.comfyDeployApiKey
                      : settings.image.apiKey
                  )}
                </div>
              </div>

              {/* WORLD WORKFLOWS SECTION
                  Solo con ComfyUI o A1111: son los unicos proveedores donde un
                  workflow significa algo. Antes se veia con cualquiera. */}
              {(settings.image.provider === 'comfyui' || settings.image.provider === 'a1111') && (
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Workflows de Mundos por Perspectiva
                </h3>
                <p className="text-[11px] text-slate-400">
                  La perspectiva es lo que de verdad cambia el tipo de imagen, y es lo que se elige en el generador. Deja una en blanco para que use el Workflow General, el mismo de Sprites.
                </p>

                {/* Aqui vivian tres "tuberias" de escenario (A, B y C) con su
                    proveedor, su URL, sus credenciales y su workflow. Se
                    retiraron por peticion del propietario: sus workflows eran
                    los mismos que ya estan en las ranuras por perspectiva, y
                    tener dos sitios donde definir lo mismo hacia que se
                    generase con un grafo distinto del que se veia elegido. */}
                <div className="pt-3 border-t border-slate-800">
                  <Tooltip id="workflowByPerspective" showTooltips={showTooltips} inline><p className="text-xs text-slate-400 uppercase font-bold mb-2">Workflow por perspectiva</p></Tooltip>
                  <WorldWorkflowAssignments showTooltips={showTooltips} />

                  {/* Mundos usa el canal de la seccion Imagen desde que se
                      retiraron las tuberias, asi que se prueba ESE. Reutiliza
                      el mismo verificador: uno nuevo por su cuenta se quedaria
                      atras el dia que cambie la forma de comprobar. */}
                  {renderTestConnectionWidget(
                    'image',
                    settings.image.provider,
                    settings.image.baseUrl,
                    settings.image.apiKey,
                  )}
                </div>
              </div>
              )}
            </div>
          )}

          {/* VIDEO TAB */}
          {activeTab === 'video' && (
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <Tooltip id="settingsVideoProvider" showTooltips={showTooltips}>
                  <label className="flex items-center justify-between mb-4 cursor-pointer">
                    <span className="font-bold text-slate-200">Generación de Animación (Video)</span>
                    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 flex-wrap gap-1">
                      {['gemini', 'seedance', 'kling', 'openart', 'youart', 'comfydeploy', 'omnideploy', 'comfyui', 'a1111', 'ollama', 'llama-server', 'lm-studio', 'other'].map((p) => (
                        <button
                          key={p}
                          onClick={() => {
                            const updates: Partial<typeof settings.video> = { provider: p as any };
                            if (p === 'ollama') {
                              updates.baseUrl = (!settings.video.baseUrl || settings.video.baseUrl.includes(':8080') || settings.video.baseUrl.includes(':8088') || settings.video.baseUrl.includes(':1234') || settings.video.baseUrl.includes(':8188') || settings.video.baseUrl.includes(':7860')) ? 'http://localhost:11434' : settings.video.baseUrl;
                            } else if (p === 'llama-server') {
                              updates.baseUrl = (!settings.video.baseUrl || settings.video.baseUrl.includes(':11434') || settings.video.baseUrl.includes(':8080') || settings.video.baseUrl.includes(':1234') || settings.video.baseUrl.includes(':8188') || settings.video.baseUrl.includes(':7860')) ? 'http://localhost:8088/v1' : settings.video.baseUrl;
                            } else if (p === 'lm-studio') {
                              updates.baseUrl = (!settings.video.baseUrl || settings.video.baseUrl.includes(':11434') || settings.video.baseUrl.includes(':8080') || settings.video.baseUrl.includes(':8088') || settings.video.baseUrl.includes(':8188') || settings.video.baseUrl.includes(':7860')) ? 'http://localhost:1234/v1' : settings.video.baseUrl;
                            } else if (p === 'comfyui' && (!settings.video.baseUrl || settings.video.baseUrl.trim() === '')) {
                              updates.baseUrl = 'http://127.0.0.1:8188';
                            } else if (p === 'a1111' && (!settings.video.baseUrl || settings.video.baseUrl.trim() === '')) {
                              updates.baseUrl = 'http://127.0.0.1:7860';
                            }
                            updateVideoSettings(updates);
                          }}
                          className={`px-3 py-1 text-xs rounded font-bold transition-all uppercase ${settings.video.provider === p ? 'bg-purple-600 text-white' : 'text-slate-500'}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </label>
                </Tooltip>

                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  {/* API Key (Cloud Providers) */}
                  {(['gemini', 'seedance', 'kling', 'openart', 'youart', 'other'].includes(settings.video.provider)) && (
                    <Tooltip id="settingsTextApiKey" showTooltips={showTooltips} className="block">
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">API Key (Opcional)</label>
                        <input
                          type="password"
                          value={settings.video.apiKeys?.[settings.video.provider] || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            updateVideoSettings({
                              apiKey: e.target.value
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="sk-..."
                        />
                      </div>
                    </Tooltip>
                  )}

                  {/* ComfyDeploy Video Settings */}
                  {settings.video.provider === 'comfydeploy' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                      <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded text-xs text-purple-200">
                        <p className="font-bold mb-1 flex items-center gap-2">
                          <Server className="w-3 h-3 text-purple-400" /> API Cloud: COMFYDEPLOY (Video)
                        </p>
                        Ejecuta tu workflow de video (como SVD o AnimateDiff) de ComfyUI hospedado en la nube.
                      </div>

                      <Tooltip id="settingsVideoComfyDeployApiKey" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">ComfyDeploy API Key</label>
                          <input
                            type="password"
                            value={settings.video.comfyDeployApiKey || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateVideoSettings({ comfyDeployApiKey: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                            placeholder="cd_live_..."
                          />
                        </div>
                      </Tooltip>

                      <Tooltip id="settingsVideoComfyDeployDeploymentId" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">ComfyDeploy Deployment ID</label>
                          <input
                            type="text"
                            value={settings.video.comfyDeployDeploymentId || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateVideoSettings({ comfyDeployDeploymentId: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                            placeholder="12345678-abcd-..."
                          />
                        </div>
                      </Tooltip>
                    </div>
                  )}

                  {/* OmniDeploy Video Settings — anadido junto al de ComfyDeploy. */}
                  {settings.video.provider === 'omnideploy' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                      <div className="p-3 bg-cyan-900/20 border border-cyan-500/30 rounded text-xs text-cyan-200">
                        <p className="font-bold mb-1 flex items-center gap-2">
                          <Server className="w-3 h-3 text-cyan-400" /> GPU REMOTA: OMNIDEPLOY (Video)
                        </p>
                        La animación se genera en la GPU del proveedor. Un vídeo tarda bastante más que
                        una imagen: si hay cola, se te indicará la posición.
                      </div>

                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">OmniDeploy API Key</label>
                        <input
                          type="password"
                          value={settings.video.omniDeployApiKey || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateVideoSettings({ omniDeployApiKey: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="La que te entrego el proveedor"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">OmniDeploy Deployment ID</label>
                        <input
                          type="text"
                          value={settings.video.omniDeployDeploymentId || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateVideoSettings({ omniDeployDeploymentId: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="omni_..."
                        />
                      </div>
                    </div>
                  )}

                  {/* OpenArt & YouArt Integration Info */}
                  {(['openart', 'youart'].includes(settings.video.provider)) && (
                    <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded text-xs text-purple-200">
                      <p className="font-bold mb-1 flex items-center gap-2"><Server className="w-3 h-3 text-purple-400" /> API Cloud: {settings.video.provider.toUpperCase()}</p>
                      <p>Llamada directa al endpoint oficial:</p>
                      <span className="font-mono block mt-1 text-[10px] text-purple-400">
                        {settings.video.provider === 'openart' ? 'https://openart.ai/api/v1/generate' : 'https://api.youart.ai/v1/video'}
                      </span>
                      <p className="mt-1 text-[10px] text-slate-400">Asegúrate de ingresar una API Key válida arriba para poder autenticar tus solicitudes.</p>
                    </div>
                  )}

                  {/* Stubs (Implemented but limited) */}
                  {(['seedance', 'kling'].includes(settings.video.provider)) && (
                    <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded text-xs text-purple-200">
                      <p className="font-bold mb-1">API Cloud: {settings.video.provider.toUpperCase()}</p>
                      Requiere una API Key válida. Actualmente implementado como stub de prueba en el backend.
                    </div>
                  )}

                  {/* LLAMA-SERVER (LLAMA.CPP NATIVO) */}
                  {settings.video.provider === 'llama-server' && renderLlamaCppPanel('video')}

                  {/* Ollama / LM-Studio Local Config for Video */}
                  {(settings.video.provider === 'ollama' || settings.video.provider === 'lm-studio') && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 border border-slate-800 p-4 rounded bg-slate-950/40">
                      <p className="font-bold text-xs text-slate-200 flex items-center gap-2">
                        <Server className="w-3 h-3 text-purple-400" /> Servidor Local: {settings.video.provider.toUpperCase()}
                      </p>
                      <Tooltip id="settingsVideoServerUrl" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">URL del Servidor Local</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={settings.video.baseUrl || ''}
                              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateVideoSettings({ baseUrl: e.target.value })}
                              className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                              placeholder={settings.video.provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1'}
                            />
                            {settings.video.provider === 'ollama' && (
                              <button onClick={fetchVideoModels} className="p-2 bg-slate-800 border border-slate-700 rounded hover:bg-slate-700 text-slate-400" title="Recargar modelos locales">
                                <RefreshCw className={`w-4 h-4 ${loadingVideoModels ? 'animate-spin' : ''}`} />
                              </button>
                            )}
                          </div>
                        </div>
                      </Tooltip>

                      <Tooltip id="settingsVideoModel" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">Modelo Local de Video/Lógica</label>
                          <select
                            value={settings.video.model || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateVideoSettings({ model: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          >
                            {videoModels.length > 0 ? (
                              videoModels.map(m => <option key={m} value={m}>{m}</option>)
                            ) : (
                              <option value={settings.video.model || ''}>{settings.video.model || 'Seleccionar o recargar modelos...'}</option>
                            )}
                          </select>
                        </div>
                      </Tooltip>

                      {settings.video.provider === 'ollama' && (
                        <div className="pt-4 border-t border-slate-800">
                          <label className="block text-xs text-slate-500 uppercase mb-1">Descargar Nuevo Modelo</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newVideoModelName}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewVideoModelName(e.target.value)}
                              className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                              placeholder="ej: llama3, mistral, gemma"
                            />
                            <button
                              onClick={handlePullVideoModel}
                              disabled={pullingVideoModel || !newVideoModelName}
                              className="px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-xs font-bold rounded flex items-center gap-2"
                            >
                              {pullingVideoModel ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                              {pullingVideoModel ? 'DESCARGANDO...' : 'DESCARGAR'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Local Providers */}
                  {(['comfyui', 'a1111', 'other'].includes(settings.video.provider)) && (
                    <>
                      <Tooltip id="settingsVideoUrl" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">URL del Endpoint</label>
                          <input
                            type="text"
                            value={settings.video.baseUrl}
                            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateVideoSettings({ baseUrl: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                            placeholder={settings.video.provider === 'comfyui' ? "http://127.0.0.1:8188" : "http://127.0.0.1:7860"}
                          />
                        </div>
                      </Tooltip>
                      {(settings.video.provider === 'comfyui' || settings.video.provider === 'a1111') && (
                        <div className="space-y-4">
                          <Tooltip id="settingsVideoWorkflowId" showTooltips={showTooltips} className="block">
                            <div>
                              <label className="block text-xs text-slate-500 uppercase mb-1">
                                {settings.video.provider === 'comfyui' ? 'Workflow ID para Video' : 'Nombre del Workflow para A1111'}
                              </label>
                              <input
                                type="text"
                                value={settings.video.workflowId || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateVideoSettings({ workflowId: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                                placeholder=""
                              />
                            </div>
                          </Tooltip>

                          <Tooltip id="settingsVideoCustomWorkflow" showTooltips={showTooltips} className="block">
                            <div className="mt-4">
                              <label className="block text-xs text-slate-500 uppercase mb-1">
                                {settings.video.provider === 'comfyui' ? 'Workflow ComfyUI (.json)' : 'Workflow A1111 (.json)'}
                              </label>
                              <div className="flex gap-2 items-center">
                                <input
                                  type="file"
                                  accept=".json"
                                  className="hidden"
                                  ref={videoWorkflowInputRef}
                                  onChange={handleVideoWorkflowUpload}
                                />
                                <button
                                  onClick={() => videoWorkflowInputRef.current?.click()}
                                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] text-slate-300 font-bold tracking-wider transition-colors"
                                >
                                  {settings.video.customWorkflow ? 'CAMBIAR WORKFLOW' : 'CARGAR WORKFLOW JSON'}
                                </button>
                                {settings.video.customWorkflow && (
                                  <button
                                    onClick={() => updateVideoSettings({ customWorkflow: undefined })}
                                    className="p-2 bg-red-900/40 hover:bg-red-800 border border-red-800 rounded text-red-400 transition-colors"
                                    title="Remover Workflow"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                              {settings.video.customWorkflow && (
                                <p className="text-[10px] text-blue-400 mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Workflow JSON cargado en memoria</p>
                              )}
                            </div>
                          </Tooltip>

                          <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded text-xs text-blue-200 mt-2">
                            <p className="font-bold mb-1 flex items-center gap-2">
                              <Server className="w-3 h-3" /> Integración {settings.video.provider === 'comfyui' ? 'ComfyUI' : 'A1111'} (Animación)
                            </p>
                            Carga tu archivo de flujo de trabajo JSON. El sistema inyectará automáticamente los prompts positivo y negativo, la imagen de consistencia visual, y la semilla aleatoria en los campos correspondientes del motor seleccionado.
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {/* Universal Video Model Selector */}
                  {['gemini', 'seedance', 'kling', 'openart', 'youart', 'a1111', 'other'].includes(settings.video.provider) && (() => {
                    const provider = settings.video.provider;
                    const predefined = PREDEFINED_VIDEO_MODELS[provider] || [];
                    const currentModel = settings.video.model || '';
                    const isCustomModel = currentModel !== '' && !predefined.includes(currentModel);

                    return (
                      <Tooltip id="settingsVideoModelSelect" showTooltips={showTooltips} className="block animate-in fade-in slide-in-from-top-1">
                        <div className="space-y-2 mt-2 bg-slate-900/40 p-3 rounded border border-slate-800">
                          <label className="block text-xs text-slate-500 uppercase mb-1 font-bold">Modelo de Video ({provider.toUpperCase()})</label>
                          <select
                            value={isCustomModel ? 'custom' : (currentModel || predefined[0] || '')}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                updateVideoSettings({ model: 'custom' });
                              } else {
                                updateVideoSettings({ model: val });
                              }
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-purple-500 outline-none"
                          >
                            {predefined.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                            <option value="custom">Otro (Escribir modelo personalizado...)</option>
                          </select>

                          {(isCustomModel || (settings.video.model === 'custom')) && (
                            <div className="pt-2">
                              <input
                                type="text"
                                value={currentModel === 'custom' ? '' : currentModel}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateVideoSettings({ model: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-purple-500 outline-none"
                                placeholder="Escribe el modelo personalizado..."
                              />
                            </div>
                          )}
                        </div>
                      </Tooltip>
                    );
                  })()}

                  {/* Pipeline Toggle Switch */}
                  <div className="mt-5 p-4 bg-slate-950 border border-slate-800/80 rounded-lg flex items-center justify-between">
                    <div className="pr-3">
                      <p className="text-xs font-bold text-slate-200 uppercase tracking-wide">Pipeline de Animación de 5 Pasos</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-1 leading-normal">
                        Habilitar para probar el flujo de OMNI_TWIN con variantes de T-Pose y poses direccionales consistentemente.
                        Deshabilitar para el flujo Clásico ultra-estable (Generación directa de Keyframes y Videos sin T-pose forzadas).
                      </p>
                    </div>
                    <Tooltip id="settingsVideoPipeline" showTooltips={showTooltips} inline>
                      <input
                        type="checkbox"
                        checked={settings.video.useAdvancedPipeline ?? false}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateVideoSettings({ useAdvancedPipeline: e.target.checked })}
                        className="accent-purple-600 w-4.5 h-4.5 cursor-pointer shrink-0"
                      />
                    </Tooltip>
                  </div>

                  {/* Test Connection Widget for Video Provider */}
                  {renderTestConnectionWidget(
                    'video', 
                    settings.video.provider, 
                    settings.video.provider === 'comfydeploy'
                      ? (settings.video.comfyDeployDeploymentId || '')
                      : settings.video.baseUrl, 
                    settings.video.provider === 'comfydeploy'
                      ? settings.video.comfyDeployApiKey
                      : settings.video.apiKey
                  )}

                  {/* Workflows por acción de animación */}
                  {(['comfyui', 'a1111', 'omnideploy'].includes(settings.video.provider)) && (
                    <div className="mt-6 pt-6 border-t border-slate-800">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Video className="w-4 h-4 text-purple-400" />
                        Workflows por Acción de Animación
                      </h4>
                      <AnimationWorkflowAssignments showTooltips={showTooltips} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* AUDIO TAB */}
          {activeTab === 'audio' && (
            <div className="space-y-6">
              {/* TTS Section */}
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <h3 className="text-sm font-bold text-amber-500 mb-4 flex items-center gap-2">
                  <Mic className="w-4 h-4" /> Text-to-Speech (Voces)
                </h3>

                <Tooltip id="settingsAudioTtsProvider" showTooltips={showTooltips}>
                  <div className="mb-4">
                    <label className="block text-xs text-slate-500 uppercase mb-2">Proveedor TTS</label>
                    <div className="flex flex-wrap gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
                      {['gemini', 'elevenlabs', 'suno', 'comfydeploy', 'omnideploy', 'comfyui', 'ollama', 'llama-server', 'lm-studio', 'local', 'other'].map((p) => (
                        <button
                          key={p}
                          onClick={() => {
                            const updates: any = { ttsProvider: p as any };
                            if (p === 'ollama') {
                              updates.ttsUrl = (!settings.audio.ttsUrl || settings.audio.ttsUrl.includes(':8080') || settings.audio.ttsUrl.includes(':8088') || settings.audio.ttsUrl.includes(':1234')) ? 'http://localhost:11434' : settings.audio.ttsUrl;
                            } else if (p === 'llama-server') {
                              updates.ttsUrl = (!settings.audio.ttsUrl || settings.audio.ttsUrl.includes(':11434') || settings.audio.ttsUrl.includes(':8080') || settings.audio.ttsUrl.includes(':1234')) ? 'http://localhost:8088/v1' : settings.audio.ttsUrl;
                            } else if (p === 'lm-studio') {
                              updates.ttsUrl = (!settings.audio.ttsUrl || settings.audio.ttsUrl.includes(':11434') || settings.audio.ttsUrl.includes(':8080') || settings.audio.ttsUrl.includes(':8088')) ? 'http://localhost:1234/v1' : settings.audio.ttsUrl;
                            }
                            updateAudioSettings(updates, 'tts');
                          }}
                          className={`px-3 py-1 text-xs rounded font-bold transition-all uppercase ${settings.audio.ttsProvider === p ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </Tooltip>

                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  {/* GEMINI, ELEVENLABS & SUNO */}
                  {(settings.audio.ttsProvider === 'gemini' || settings.audio.ttsProvider === 'elevenlabs' || settings.audio.ttsProvider === 'suno') && (
                    <Tooltip id="settingsTextApiKey" showTooltips={showTooltips} className="block">
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">API Key</label>
                        <input
                          type="password"
                          value={settings.audio.apiKeys?.[settings.audio.ttsProvider] || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ apiKey: e.target.value }, 'tts')}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="sk-..."
                        />
                      </div>
                    </Tooltip>
                  )}

                  {/* ComfyDeploy TTS Settings */}
                  {settings.audio.ttsProvider === 'comfydeploy' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                      <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded text-xs text-purple-200">
                        <p className="font-bold mb-1 flex items-center gap-2">
                          <Server className="w-3 h-3 text-purple-400" /> API Cloud: COMFYDEPLOY (TTS / Voces)
                        </p>
                        Ejecuta tu workflow de síntesis de voz en la nube.
                      </div>

                      <Tooltip id="settingsTtsComfyDeployApiKey" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">ComfyDeploy API Key (TTS)</label>
                          <input
                            type="password"
                            value={settings.audio.ttsComfyDeployApiKey || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ ttsComfyDeployApiKey: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                            placeholder="cd_live_..."
                          />
                        </div>
                      </Tooltip>

                      <Tooltip id="settingsTtsComfyDeployDeploymentId" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">ComfyDeploy Deployment ID (TTS)</label>
                          <input
                            type="text"
                            value={settings.audio.ttsComfyDeployDeploymentId || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ ttsComfyDeployDeploymentId: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                            placeholder="12345678-abcd-..."
                          />
                        </div>
                      </Tooltip>
                    </div>
                  )}

                  {/* OmniDeploy TTS — anadido junto al de ComfyDeploy. */}
                  {settings.audio.ttsProvider === 'omnideploy' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                      <div className="p-3 bg-cyan-900/20 border border-cyan-500/30 rounded text-xs text-cyan-200">
                        <p className="font-bold mb-1 flex items-center gap-2">
                          <Server className="w-3 h-3 text-cyan-400" /> GPU REMOTA: OMNIDEPLOY (Voz)
                        </p>
                        La síntesis de voz se ejecuta en la GPU del proveedor.
                      </div>

                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">OmniDeploy API Key (Voz)</label>
                        <input
                          type="password"
                          value={settings.audio.ttsOmniDeployApiKey || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ ttsOmniDeployApiKey: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="La que te entrego el proveedor"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">OmniDeploy Deployment ID (Voz)</label>
                        <input
                          type="text"
                          value={settings.audio.ttsOmniDeployDeploymentId || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ ttsOmniDeployDeploymentId: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="omni_..."
                        />
                      </div>
                    </div>
                  )}

                  {/* COMFYUI */}
                  {settings.audio.ttsProvider === 'comfyui' && (
                    <div className="space-y-4">
                      <Tooltip id="settingsAudioTtsUrl" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">URL del Endpoint</label>
                          <input
                            type="text"
                            value={settings.audio.ttsUrl}
                            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateAudioSettings({ ttsUrl: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                            placeholder="http://127.0.0.1:8188"
                          />
                        </div>
                      </Tooltip>
                      <Tooltip id="settingsAudioTtsWorkflowId" showTooltips={showTooltips} className="block">
                        <div className="mt-2">
                          <label className="block text-xs text-slate-500 uppercase mb-1">Workflow ID de TTS (Opcional)</label>
                          <input
                            type="text"
                            value={settings.audio.ttsWorkflowId || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ ttsWorkflowId: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                            placeholder="Ej. tts_workflow"
                          />
                        </div>
                      </Tooltip>
                      <Tooltip id="settingsAudioTtsWorkflow" showTooltips={showTooltips} className="block">
                        <div className="mt-4">
                          <label className="block text-xs text-slate-500 uppercase mb-1">Workflow ComfyUI (.json)</label>
                          <div className="flex gap-2 items-center">
                            <input
                              type="file"
                              accept=".json"
                              className="hidden"
                              ref={ttsWorkflowInputRef}
                              onChange={handleTtsWorkflowUpload}
                            />
                            <button
                              onClick={() => ttsWorkflowInputRef.current?.click()}
                              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] text-slate-300 font-bold tracking-wider transition-colors"
                            >
                              {settings.audio.ttsCustomWorkflow ? 'CAMBIAR WORKFLOW' : 'CARGAR WORKFLOW JSON'}
                            </button>
                            {settings.audio.ttsCustomWorkflow && (
                              <button
                                onClick={() => updateAudioSettings({ ttsCustomWorkflow: undefined })}
                                className="p-2 bg-red-900/40 hover:bg-red-800 border border-red-800 rounded text-red-400 transition-colors"
                                title="Remover Workflow"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          {settings.audio.ttsCustomWorkflow && (
                            <p className="text-[10px] text-blue-400 mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Workflow JSON cargado en memoria</p>
                          )}
                        </div>
                      </Tooltip>
                      <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded text-xs text-blue-200 mt-2">
                        <p className="font-bold mb-1 flex items-center gap-2"><Server className="w-3 h-3" /> Integración ComfyUI</p>
                        Asegúrate de cargar tu .json. El sistema buscará el nodo cuyo Título o Class coincida con "{settings.audio.ttsModel || '?'}" para inyectar el guión.
                      </div>
                    </div>
                  )}

                  {/* OTHER */}
                  {settings.audio.ttsProvider === 'other' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">API Key</label>
                        <input
                          type="password"
                          value={settings.audio.apiKeys?.[settings.audio.ttsProvider] || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ apiKey: e.target.value }, 'tts')}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="sk-..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">URL del Servidor (OpenAI-compatible)</label>
                        <input
                          type="text"
                          value={settings.audio.ttsUrl}
                          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateAudioSettings({ ttsUrl: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                          placeholder="https://mi-servidor.com/v1/audio/speech"
                        />
                      </div>
                    </div>
                  )}

                  {/* OLLAMA, LM-STUDIO & LLAMA-SERVER */}
                  {(settings.audio.ttsProvider === 'ollama' || settings.audio.ttsProvider === 'lm-studio' || settings.audio.ttsProvider === 'llama-server') && (
                    <div className="space-y-4">
                      {settings.audio.ttsProvider !== 'llama-server' && (
                        <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-700 rounded-lg">
                          <div>
                            <p className="text-xs font-bold text-slate-200">{ollamaCloudMode ? 'Modo: API Cloud' : 'Modo: Servidor Local'}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {ollamaCloudMode
                                ? `Conectado a ${settings.audio.ttsProvider === 'ollama' ? 'api.ollama.com' : 'los servidores cloud de LM-Studio'}`
                                : 'Usando servidor local en tu máquina'}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const next = !ollamaCloudMode;
                              setOllamaCloudMode(next);
                              if (!next) {
                                updateOllamaSettings({
                                  apiKey: '',
                                  baseUrl: settings.audio.ttsProvider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1'
                                });
                              } else {
                                updateOllamaSettings({
                                  baseUrl: settings.audio.ttsProvider === 'ollama' ? 'https://api.ollama.com' : 'https://api.lmstudio.ai',
                                  model: settings.audio.ttsModel || '',
                                  apiKey: settings.ollama?.apiKey || ''
                                });
                              }
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${ollamaCloudMode ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                          >
                            {ollamaCloudMode ? <Cloud className="w-3 h-3" /> : <Server className="w-3 h-3" />}
                            {ollamaCloudMode ? 'CLOUD' : 'LOCAL'}
                          </button>
                        </div>
                      )}

                      {/* LLAMA-SERVER (LLAMA.CPP NATIVO) */}
                      {settings.audio.ttsProvider === 'llama-server' && renderLlamaCppPanel('tts')}

                      {settings.audio.ttsProvider !== 'llama-server' && !ollamaCloudMode && (
                        <>
                          <div>
                            <label className="block text-xs text-slate-500 uppercase mb-1">URL del Servidor Local</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={settings.audio.ttsUrl}
                                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateAudioSettings({ ttsUrl: e.target.value })}
                                className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                                placeholder={settings.audio.ttsProvider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1'}
                              />
                              {settings.audio.ttsProvider === 'ollama' && (
                                <button onClick={fetchTtsModels} className="p-2 bg-slate-800 border border-slate-700 rounded hover:bg-slate-700 text-slate-400">
                                  <RefreshCw className={`w-4 h-4 ${loadingTtsModels ? 'animate-spin' : ''}`} />
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 uppercase mb-1">Modelo Local</label>
                            {settings.audio.ttsProvider === 'ollama' ? (
                              <select
                                value={settings.audio.ttsModel}
                                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateAudioSettings({ ttsModel: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                              >
                                {ttsModels.length > 0 ? (
                                  ttsModels.map(m => <option key={m} value={m}>{m}</option>)
                                ) : (
                                  <option value={settings.audio.ttsModel}>{settings.audio.ttsModel || "Cargar modelos..."}</option>
                                )}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={settings.audio.ttsModel}
                                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateAudioSettings({ ttsModel: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                              />
                            )}
                          </div>
                        </>
                      )}

                      {ollamaCloudMode && (
                        <>
                          <div>
                            <label className="block text-xs text-slate-500 uppercase mb-1">API Key Cloud</label>
                            <input
                              type="password"
                              value={settings.ollama?.apiKey || ''}
                              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateOllamaSettings({ apiKey: e.target.value })}
                              className="w-full bg-slate-900 border border-blue-700 rounded p-2 text-sm text-slate-300 font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 uppercase mb-1">Modelo Cloud</label>
                            <input
                              type="text"
                              value={settings.audio.ttsModel}
                              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateAudioSettings({ ttsModel: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* LOCAL (Edge TTS) */}
                  {settings.audio.ttsProvider === 'local' && (
                    <div className="space-y-4">
                      <Tooltip id="settingsAudioTtsUrl" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">URL TTS</label>
                          <input
                            type="text"
                            value={settings.audio.ttsUrl}
                            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateAudioSettings({ ttsUrl: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                            placeholder="http://localhost:5000"
                          />
                        </div>
                      </Tooltip>
                    </div>
                  )}

                  {/* LOCAL (Edge TTS) Server Control UI */}
                  {settings.audio.ttsProvider === 'local' && (
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-3 mt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-200">Motor: Edge TTS Standard</p>
                          <p className="text-[10px] text-slate-500">
                            Rápido, voces estándar Microsoft.
                          </p>
                        </div>
                        <Tooltip id="settingsAudioTtsEdgeControl" showTooltips={showTooltips}>
                          <button
                            onClick={handleToggleEdge}
                            disabled={loadingEdge}
                            className={`px-4 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-2 transition-all ${edgeTtsStatus
                              ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                              : 'bg-red-500/20 text-red-400 border border-red-500/50'
                              }`}
                          >
                            {loadingEdge ? <Loader2 className="w-3 h-3 animate-spin" /> : <Server className="w-3 h-3" />}
                            {edgeTtsStatus ? 'ACTIVO' : 'APAGADO'}
                          </button>
                        </Tooltip>
                      </div>
                      {/* El motivo, a la vista. Antes solo iba a la consola, que
                          en la aplicacion empaquetada el usuario no puede abrir:
                          fallara lo que fallara, el boton parecia no hacer nada. */}
                      {edgeMsg && (
                        <p className={`text-[10px] mt-2 leading-snug ${edgeTtsStatus ? 'text-slate-500' : 'text-amber-400'}`}>
                          {edgeMsg}
                        </p>
                      )}
                    </div>
                  )}
                  {/* Universal TTS Model Selector */}
                  {['gemini', 'elevenlabs', 'suno', 'lm-studio', 'local', 'other'].includes(settings.audio.ttsProvider) && (() => {
                    const provider = settings.audio.ttsProvider;
                    const predefined = PREDEFINED_TTS_MODELS[provider] || [];
                    const currentModel = settings.audio.ttsModel || '';
                    const isCustomModel = currentModel !== '' && !predefined.includes(currentModel);

                    return (
                      <Tooltip id="settingsAudioTtsModelSelect" showTooltips={showTooltips} className="block animate-in fade-in slide-in-from-top-1">
                        <div className="space-y-2 mt-2 bg-slate-900/40 p-3 rounded border border-slate-800">
                          <label className="block text-xs text-slate-500 uppercase mb-1 font-bold">Modelo de Voz / TTS ({provider.toUpperCase()})</label>
                          <select
                            value={isCustomModel ? 'custom' : (currentModel || predefined[0] || '')}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                updateAudioSettings({ ttsModel: 'custom' });
                              } else {
                                updateAudioSettings({ ttsModel: val });
                              }
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-blue-500 outline-none"
                          >
                            {predefined.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                            <option value="custom">Otro (Escribir modelo personalizado...)</option>
                          </select>

                          {(isCustomModel || (settings.audio.ttsModel === 'custom')) && (
                            <div className="pt-2">
                              <input
                                type="text"
                                value={currentModel === 'custom' ? '' : currentModel}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ ttsModel: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-blue-500 outline-none"
                                placeholder="Escribe el modelo personalizado..."
                              />
                            </div>
                          )}
                        </div>
                      </Tooltip>
                    );
                  })()}

                  {/* Test Connection Widget for TTS Provider */}
                  {renderTestConnectionWidget(
                    'audio-tts', 
                    settings.audio.ttsProvider, 
                    settings.audio.ttsProvider === 'comfydeploy'
                      ? (settings.audio.ttsComfyDeployDeploymentId || '')
                      : (settings.audio.ttsProvider === 'local' ? 'http://localhost:5000' : settings.audio.ttsUrl), 
                    settings.audio.ttsProvider === 'comfydeploy'
                      ? settings.audio.ttsComfyDeployApiKey
                      : settings.audio.apiKey
                  )}
                </div>
              </div>

              {/* Music/SFX Section */}
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <h3 className="text-sm font-bold text-amber-500 mb-4 flex items-center gap-2">
                  <Music className="w-4 h-4" /> Música & SFX
                </h3>

                <Tooltip id="settingsAudioMusicProvider" showTooltips={showTooltips}>
                  <div className="mb-4">
                    <label className="block text-xs text-slate-500 uppercase mb-2">Proveedor Música</label>
                    <div className="flex flex-wrap gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
                      {['gemini', 'suno', 'udio', 'meta-audiocraft', 'comfydeploy', 'omnideploy', 'comfyui', 'a1111', 'ollama', 'lm-studio', 'llama-server', 'local', 'other'].map((p) => (
                        <button
                          key={p}
                          onClick={() => updateAudioSettings({ musicProvider: p as any })}
                          className={`px-3 py-1 text-xs rounded font-bold transition-all uppercase ${settings.audio.musicProvider === p ? 'bg-amber-600 text-white' : 'text-slate-500'}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </Tooltip>

                {/* ComfyDeploy Music & SFX Settings */}
                {settings.audio.musicProvider === 'comfydeploy' && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    {/* Canal Música */}
                    <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-lg space-y-3">
                      <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">Canal Música</h4>
                      <div className="p-2 bg-purple-900/10 border border-purple-500/20 rounded text-[11px] text-purple-200">
                        Ejecuta tu workflow de generación de música en ComfyDeploy.
                      </div>

                      <Tooltip id="settingsMusicComfyDeployApiKey" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase mb-1">ComfyDeploy API Key (Música)</label>
                          <input
                            type="password"
                            value={settings.audio.musicComfyDeployApiKey || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ musicComfyDeployApiKey: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
                            placeholder="cd_live_..."
                          />
                        </div>
                      </Tooltip>

                      <Tooltip id="settingsMusicComfyDeployDeploymentId" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase mb-1">ComfyDeploy Deployment ID (Música)</label>
                          <input
                            type="text"
                            value={settings.audio.musicComfyDeployDeploymentId || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ musicComfyDeployDeploymentId: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
                            placeholder="12345678-abcd-..."
                          />
                        </div>
                      </Tooltip>
                    </div>

                    {/* Canal SFX */}
                    <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-lg space-y-3">
                      <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">Canal SFX</h4>
                      <div className="p-2 bg-purple-900/10 border border-purple-500/20 rounded text-[11px] text-purple-200">
                        Ejecuta tu workflow de efectos de sonido (SFX) en ComfyDeploy.
                      </div>

                      <Tooltip id="settingsSfxComfyDeployApiKey" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase mb-1">ComfyDeploy API Key (SFX)</label>
                          <input
                            type="password"
                            value={settings.audio.sfxComfyDeployApiKey || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ sfxComfyDeployApiKey: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
                            placeholder="cd_live_..."
                          />
                        </div>
                      </Tooltip>

                      <Tooltip id="settingsSfxComfyDeployDeploymentId" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase mb-1">ComfyDeploy Deployment ID (SFX)</label>
                          <input
                            type="text"
                            value={settings.audio.sfxComfyDeployDeploymentId || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ sfxComfyDeployDeploymentId: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
                            placeholder="12345678-abcd-..."
                          />
                        </div>
                      </Tooltip>
                    </div>
                  </div>
                )}

                {settings.audio.musicProvider === 'gemini' && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <Tooltip id="settingsAudioMusicGeminiApiKey" showTooltips={showTooltips} className="block">
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">API Key de Gemini (Música/SFX)</label>
                        <input
                          type="password"
                          value={settings.audio.apiKeys?.['gemini'] || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ apiKey: e.target.value }, 'music')}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-amber-500 outline-none"
                          placeholder="sk-..."
                        />
                      </div>
                    </Tooltip>
                  </div>
                )}

                {/* OmniDeploy: canales de Música y SFX en la GPU del proveedor.
                    Hermano del bloque de ComfyDeploy, no anidado dentro: van en
                    ramas excluyentes del mismo selector. */}
                {settings.audio.musicProvider === 'omnideploy' && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="p-3 bg-cyan-900/20 border border-cyan-500/30 rounded text-xs text-cyan-200">
                      <p className="font-bold mb-1 flex items-center gap-2">
                        <Server className="w-3 h-3 text-cyan-400" /> GPU REMOTA: OMNIDEPLOY (Música y SFX)
                      </p>
                      La música y los efectos se generan en la GPU del proveedor.
                    </div>

                    <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-lg space-y-3">
                      <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Canal Música</h4>
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase mb-1">OmniDeploy API Key (Música)</label>
                        <input
                          type="password"
                          value={settings.audio.musicOmniDeployApiKey || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ musicOmniDeployApiKey: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
                          placeholder="La que te entrego el proveedor"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase mb-1">OmniDeploy Deployment ID (Música)</label>
                        <input
                          type="text"
                          value={settings.audio.musicOmniDeployDeploymentId || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ musicOmniDeployDeploymentId: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
                          placeholder="omni_..."
                        />
                      </div>
                    </div>

                    <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-lg space-y-3">
                      <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">Canal SFX</h4>
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase mb-1">OmniDeploy API Key (SFX)</label>
                        <input
                          type="password"
                          value={settings.audio.sfxOmniDeployApiKey || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ sfxOmniDeployApiKey: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
                          placeholder="La que te entrego el proveedor"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase mb-1">OmniDeploy Deployment ID (SFX)</label>
                        <input
                          type="text"
                          value={settings.audio.sfxOmniDeployDeploymentId || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ sfxOmniDeployDeploymentId: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
                          placeholder="omni_..."
                        />
                      </div>
                    </div>
                  </div>
                )}

                {settings.audio.musicProvider !== 'gemini' && settings.audio.musicProvider !== 'comfydeploy' && settings.audio.musicProvider !== 'omnideploy' && settings.audio.musicProvider !== 'comfyui' && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    {(settings.audio.musicProvider === 'suno' || settings.audio.musicProvider === 'udio') ? (
                      <Tooltip id="settingsAudioMusicApiKey" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">
                            API Key de {settings.audio.musicProvider === 'suno' ? 'Suno' : 'Udio'}
                          </label>
                          <input
                            type="password"
                            value={settings.audio.apiKeys?.[settings.audio.musicProvider] || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ apiKey: e.target.value }, 'music')}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono focus:border-amber-500 outline-none"
                            placeholder="sk-..."
                          />
                        </div>
                      </Tooltip>
                    ) : (
                      <Tooltip id="settingsAudioMusicUrl" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">URL Generación</label>
                          <input
                            type="text"
                            value={settings.audio.musicUrl}
                            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateAudioSettings({ musicUrl: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                            placeholder="http://localhost:7860/generate"
                          />
                        </div>
                      </Tooltip>
                    )}

                    {settings.audio.musicProvider === 'a1111' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/50">
                        {/* Canal Música */}
                        <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-lg space-y-3">
                          {(() => {
                            const provider = settings.audio.musicProvider;
                            const predefined = PREDEFINED_MUSIC_MODELS[provider] || [];
                            const currentModel = settings.audio.musicModel || '';
                            const isCustomModel = currentModel !== '' && !predefined.includes(currentModel);

                            return (
                              <Tooltip id="settingsAudioMusicModelSelect" showTooltips={showTooltips} className="block">
                                <div className="space-y-1">
                                  <label className="block text-[10px] text-slate-500 uppercase mb-1 font-bold">
                                    Nombre del Workflow / ID Música A1111
                                  </label>
                                  <select
                                    value={isCustomModel ? 'custom' : (currentModel || predefined[0] || '')}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                      const val = e.target.value;
                                      if (val === 'custom') {
                                        updateAudioSettings({ musicModel: 'custom' });
                                      } else {
                                        updateAudioSettings({ musicModel: val });
                                      }
                                    }}
                                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono focus:border-amber-500 outline-none"
                                  >
                                    {predefined.map(m => (
                                      <option key={m} value={m}>{m}</option>
                                    ))}
                                    <option value="custom">Otro (Escribir modelo personalizado...)</option>
                                  </select>

                                  {(isCustomModel || (settings.audio.musicModel === 'custom')) && (
                                    <div className="pt-2 animate-in fade-in slide-in-from-top-1">
                                      <input
                                        type="text"
                                        value={currentModel === 'custom' ? '' : currentModel}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ musicModel: e.target.value })}
                                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono focus:border-amber-500 outline-none"
                                        placeholder="Escribe el modelo personalizado..."
                                      />
                                    </div>
                                  )}
                                </div>
                              </Tooltip>
                            );
                          })()}

                          <Tooltip id="settingsAudioMusicWorkflow" showTooltips={showTooltips} className="block">
                            <div>
                              <label className="block text-[10px] text-slate-500 uppercase mb-1">
                                Workflow A1111 Música (.json)
                              </label>
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="file"
                                  accept=".json"
                                  onChange={handleMusicWorkflowUpload}
                                  className="hidden"
                                  id="music-workflow-upload"
                                />
                                <label
                                  htmlFor="music-workflow-upload"
                                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-slate-950 border border-slate-800 border-dashed rounded text-[11px] text-slate-400 hover:text-amber-400 hover:border-amber-500/50 transition-all cursor-pointer"
                                >
                                  {settings.audio.musicCustomWorkflow ? (
                                    <>
                                      <CheckCircle className="w-3 h-3 text-green-500" />
                                      Cargado ({Math.round(settings.audio.musicCustomWorkflow.length / 1024)} KB)
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="w-3 h-3" />
                                      Subir JSON Música A1111
                                    </>
                                  )}
                                </label>
                                {settings.audio.musicCustomWorkflow && (
                                  <button
                                    onClick={() => updateAudioSettings({ musicCustomWorkflow: undefined })}
                                    className="p-2 text-red-500 hover:bg-red-500/10 rounded transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="text-[9px] text-slate-600 mt-1">
                                Se identificará con el nombre "{settings.audio.musicModel || '?'}" para A1111
                              </p>
                            </div>
                          </Tooltip>
                        </div>
 
                        {/* Canal SFX */}
                        <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-lg space-y-3">
                          {(() => {
                            const provider = settings.audio.musicProvider;
                            const predefined = PREDEFINED_SFX_MODELS[provider] || [];
                            const currentModel = settings.audio.sfxModel || '';
                            const isCustomModel = currentModel !== '' && !predefined.includes(currentModel);

                            return (
                              <Tooltip id="settingsAudioSfxModelSelect" showTooltips={showTooltips} className="block">
                                <div className="space-y-1">
                                  <label className="block text-[10px] text-slate-500 uppercase mb-1 font-bold">
                                    Nombre del Workflow / ID SFX A1111
                                  </label>
                                  <select
                                    value={isCustomModel ? 'custom' : (currentModel || predefined[0] || '')}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                      const val = e.target.value;
                                      if (val === 'custom') {
                                        updateAudioSettings({ sfxModel: 'custom' });
                                      } else {
                                        updateAudioSettings({ sfxModel: val });
                                      }
                                    }}
                                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono focus:border-amber-500 outline-none"
                                  >
                                    {predefined.map(m => (
                                      <option key={m} value={m}>{m}</option>
                                    ))}
                                    <option value="custom">Otro (Escribir modelo personalizado...)</option>
                                  </select>

                                  {(isCustomModel || (settings.audio.sfxModel === 'custom')) && (
                                    <div className="pt-2 animate-in fade-in slide-in-from-top-1">
                                      <input
                                        type="text"
                                        value={currentModel === 'custom' ? '' : currentModel}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ sfxModel: e.target.value })}
                                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono focus:border-amber-500 outline-none"
                                        placeholder="Escribe el modelo personalizado..."
                                      />
                                    </div>
                                  )}
                                </div>
                              </Tooltip>
                            );
                          })()}

                          <Tooltip id="settingsAudioSfxWorkflow" showTooltips={showTooltips} className="block">
                            <div>
                              <label className="block text-[10px] text-slate-500 uppercase mb-1">
                                Workflow A1111 SFX (.json)
                              </label>
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="file"
                                  accept=".json"
                                  onChange={handleSfxWorkflowUpload}
                                  className="hidden"
                                  id="sfx-workflow-upload"
                                />
                                <label
                                  htmlFor="sfx-workflow-upload"
                                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-slate-950 border border-slate-800 border-dashed rounded text-[11px] text-slate-400 hover:text-amber-400 hover:border-amber-500/50 transition-all cursor-pointer"
                                >
                                  {settings.audio.sfxCustomWorkflow ? (
                                    <>
                                      <CheckCircle className="w-3 h-3 text-green-500" />
                                      Cargado ({Math.round(settings.audio.sfxCustomWorkflow.length / 1024)} KB)
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="w-3 h-3" />
                                      Subir JSON SFX A1111
                                    </>
                                  )}
                                </label>
                                {settings.audio.sfxCustomWorkflow && (
                                  <button
                                    onClick={() => updateAudioSettings({ sfxCustomWorkflow: undefined })}
                                    className="p-2 text-red-500 hover:bg-red-500/10 rounded transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="text-[9px] text-slate-600 mt-1">
                                Se identificará con el nombre "{settings.audio.sfxModel || '?'}" para A1111
                              </p>
                            </div>
                          </Tooltip>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ComfyUI Local (Música y SFX desacoplados) */}
                {settings.audio.musicProvider === 'comfyui' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 animate-in fade-in slide-in-from-top-1">
                    {/* Canal Música */}
                    <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-lg space-y-4">
                      <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">ComfyUI Música</h4>
                      
                      <Tooltip id="settingsAudioMusicUrlComfyUI" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase mb-1 font-bold">URL Servidor Música</label>
                          <input
                            type="text"
                            value={settings.audio.musicUrl || ''}
                            onChange={(e) => updateAudioSettings({ musicUrl: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono focus:border-amber-500 outline-none"
                            placeholder="http://127.0.0.1:8188"
                          />
                        </div>
                      </Tooltip>

                      <Tooltip id="settingsAudioMusicWorkflowIdComfyUI" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase mb-1 font-bold">Workflow ID Música</label>
                          <input
                            type="text"
                            value={settings.audio.musicWorkflowId || ''}
                            onChange={(e) => updateAudioSettings({ musicWorkflowId: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono focus:border-amber-500 outline-none"
                            placeholder="Ej. music_gen_workflow"
                          />
                        </div>
                      </Tooltip>

                      <Tooltip id="settingsAudioMusicWorkflowComfyUI" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase mb-1 font-bold">Workflow JSON Música</label>
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="file"
                              accept=".json"
                              onChange={handleMusicWorkflowUpload}
                              className="hidden"
                              id="music-workflow-upload-comfyui"
                            />
                            <label
                              htmlFor="music-workflow-upload-comfyui"
                              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-slate-950 border border-slate-800 border-dashed rounded text-[11px] text-slate-400 hover:text-amber-400 hover:border-amber-500/50 transition-all cursor-pointer"
                            >
                              {settings.audio.musicCustomWorkflow ? (
                                <>
                                  <CheckCircle className="w-3 h-3 text-green-500" />
                                  Cargado ({Math.round(settings.audio.musicCustomWorkflow.length / 1024)} KB)
                                </>
                              ) : (
                                <>
                                  <Upload className="w-3 h-3" />
                                  Subir JSON Música
                                </>
                              )}
                            </label>
                            {settings.audio.musicCustomWorkflow && (
                              <button
                                onClick={() => updateAudioSettings({ musicCustomWorkflow: undefined })}
                                className="p-2 text-red-500 hover:bg-red-500/10 rounded transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </Tooltip>

                      {renderTestConnectionWidget(
                        'audio-music-local',
                        'comfyui',
                        settings.audio.musicUrl
                      )}
                    </div>

                    {/* Canal SFX */}
                    <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-lg space-y-4">
                      <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">ComfyUI SFX</h4>
                      
                      <Tooltip id="settingsAudioSfxUrlComfyUI" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase mb-1 font-bold">URL Servidor SFX</label>
                          <input
                            type="text"
                            value={settings.audio.sfxUrl || ''}
                            onChange={(e) => updateAudioSettings({ sfxUrl: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono focus:border-amber-500 outline-none"
                            placeholder="http://127.0.0.1:8188"
                          />
                        </div>
                      </Tooltip>

                      <Tooltip id="settingsAudioSfxWorkflowIdComfyUI" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase mb-1 font-bold">Workflow ID SFX</label>
                          <input
                            type="text"
                            value={settings.audio.sfxWorkflowId || ''}
                            onChange={(e) => updateAudioSettings({ sfxWorkflowId: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono focus:border-amber-500 outline-none"
                            placeholder="Ej. sfx_gen_workflow"
                          />
                        </div>
                      </Tooltip>

                      <Tooltip id="settingsAudioSfxWorkflowComfyUI" showTooltips={showTooltips} className="block">
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase mb-1 font-bold">Workflow JSON SFX</label>
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="file"
                              accept=".json"
                              onChange={handleSfxWorkflowUpload}
                              className="hidden"
                              id="sfx-workflow-upload-comfyui"
                            />
                            <label
                              htmlFor="sfx-workflow-upload-comfyui"
                              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-slate-950 border border-slate-800 border-dashed rounded text-[11px] text-slate-400 hover:text-amber-400 hover:border-amber-500/50 transition-all cursor-pointer"
                            >
                              {settings.audio.sfxCustomWorkflow ? (
                                <>
                                  <CheckCircle className="w-3 h-3 text-green-500" />
                                  Cargado ({Math.round(settings.audio.sfxCustomWorkflow.length / 1024)} KB)
                                </>
                              ) : (
                                <>
                                  <Upload className="w-3 h-3" />
                                  Subir JSON SFX
                                </>
                              )}
                            </label>
                            {settings.audio.sfxCustomWorkflow && (
                              <button
                                onClick={() => updateAudioSettings({ sfxCustomWorkflow: undefined })}
                                className="p-2 text-red-500 hover:bg-red-500/10 rounded transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </Tooltip>

                      {renderTestConnectionWidget(
                        'audio-sfx-local',
                        'comfyui',
                        settings.audio.sfxUrl
                      )}
                    </div>
                  </div>
                )}

                {/* Universal Music/SFX Model Selector for Cloud and Other Providers */}
                {settings.audio.musicProvider !== 'comfyui' && settings.audio.musicProvider !== 'a1111' && settings.audio.musicProvider !== 'comfydeploy' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 animate-in fade-in slide-in-from-top-1">
                    {/* Canal Música */}
                    <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-lg space-y-3">
                      {(() => {
                        const provider = settings.audio.musicProvider;
                        const predefined = PREDEFINED_MUSIC_MODELS[provider] || [];
                        const currentModel = settings.audio.musicModel || '';
                        const isCustomModel = currentModel !== '' && !predefined.includes(currentModel);

                        return (
                          <Tooltip id="settingsAudioMusicModelSelectCloud" showTooltips={showTooltips} className="block">
                            <div className="space-y-1">
                              <label className="block text-[10px] text-slate-500 uppercase mb-1 font-bold">
                                Modelo de Música ({provider.toUpperCase()})
                              </label>
                              <select
                                value={isCustomModel ? 'custom' : (currentModel || predefined[0] || '')}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                  const val = e.target.value;
                                  if (val === 'custom') {
                                    updateAudioSettings({ musicModel: 'custom' });
                                  } else {
                                    updateAudioSettings({ musicModel: val });
                                  }
                                }}
                                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono focus:border-amber-500 outline-none"
                              >
                                {predefined.map(m => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                                <option value="custom">Otro (Escribir modelo personalizado...)</option>
                              </select>

                              {(isCustomModel || (settings.audio.musicModel === 'custom')) && (
                                <div className="pt-2 animate-in fade-in slide-in-from-top-1">
                                  <input
                                    type="text"
                                    value={currentModel === 'custom' ? '' : currentModel}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ musicModel: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono focus:border-amber-500 outline-none"
                                  />
                                </div>
                              )}
                            </div>
                          </Tooltip>
                        );
                      })()}
                    </div>

                    {/* Canal SFX */}
                    <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-lg space-y-3">
                      {(() => {
                        const provider = settings.audio.musicProvider;
                        const predefined = PREDEFINED_SFX_MODELS[provider] || [];
                        const currentModel = settings.audio.sfxModel || '';
                        const isCustomModel = currentModel !== '' && !predefined.includes(currentModel);

                        return (
                          <Tooltip id="settingsAudioSfxModelSelectCloud" showTooltips={showTooltips} className="block">
                            <div className="space-y-1">
                              <label className="block text-[10px] text-slate-500 uppercase mb-1 font-bold">
                                Modelo de SFX ({provider.toUpperCase()})
                              </label>
                              <select
                                value={isCustomModel ? 'custom' : (currentModel || predefined[0] || '')}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                  const val = e.target.value;
                                  if (val === 'custom') {
                                    updateAudioSettings({ sfxModel: 'custom' });
                                  } else {
                                    updateAudioSettings({ sfxModel: val });
                                  }
                                }}
                                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono focus:border-amber-500 outline-none"
                              >
                                {predefined.map(m => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                                <option value="custom">Otro (Escribir modelo personalizado...)</option>
                              </select>

                              {(isCustomModel || (settings.audio.sfxModel === 'custom')) && (
                                <div className="pt-2 animate-in fade-in slide-in-from-top-1">
                                  <input
                                    type="text"
                                    value={currentModel === 'custom' ? '' : currentModel}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAudioSettings({ sfxModel: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono focus:border-amber-500 outline-none"
                                    placeholder="Escribe el modelo personalizado..."
                                  />
                                </div>
                              )}
                            </div>
                          </Tooltip>
                        );
                      })()}
                    </div>
                  </div>
                )}
                {/* Test Connection Widget for Music/SFX Provider */}
                {settings.audio.musicProvider !== 'comfyui' && renderTestConnectionWidget(
                  'audio-music', 
                  settings.audio.musicProvider, 
                  settings.audio.musicProvider === 'comfydeploy'
                    ? (settings.audio.musicComfyDeployDeploymentId || '')
                    : (settings.audio.musicProvider === 'suno' 
                        ? 'https://api.sunoapi.org/api/v1/generate' 
                        : settings.audio.musicProvider === 'udio' 
                          ? 'https://api.udio.com/v1/generate' 
                          : (settings.audio.musicProvider === 'gemini' ? '' : settings.audio.musicUrl)), 
                  settings.audio.musicProvider === 'comfydeploy'
                    ? settings.audio.musicComfyDeployApiKey
                    : (settings.audio.apiKeys?.[settings.audio.musicProvider] || settings.audio.apiKey)
                )}
              </div>
            </div>
          )}

          {/* THREE_D TAB */}
          {activeTab === 'threeD' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <Tooltip id="settingsThreeDProvider" showTooltips={showTooltips}>
                  <label className="flex items-center justify-between mb-4 cursor-pointer">
                    <span className="font-bold text-slate-200">Proveedor del Modelador 3D</span>
                    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 flex-wrap gap-1 font-bold">
                      {(['tripo', 'meshy', 'comfydeploy', 'omnideploy', 'comfyui', 'a1111'] as const).map((prov) => (
                        <button
                          key={prov}
                          onClick={() => updateThreeDSettings({ provider: prov })}
                          className={`px-3 py-1 text-xs rounded font-bold uppercase transition-all ${settings.threeD.provider === prov ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          {prov === 'tripo' ? 'Tripo 3D' : prov === 'meshy' ? 'Meshy' : prov === 'comfydeploy' ? 'ComfyDeploy' : prov === 'omnideploy' ? 'OmniDeploy (GPU remota)' : prov === 'comfyui' ? 'ComfyUI (Local)' : 'A1111 (Local)'}
                        </button>
                      ))}
                    </div>
                  </label>
                </Tooltip>

                {/* Cloud Providers: Tripo 3D & Meshy */}
                {(settings.threeD.provider === 'tripo' || settings.threeD.provider === 'meshy') && (
                  <div className="space-y-4 pt-2 border-t border-slate-900">
                    <div className="grid grid-cols-2 gap-4">
                      <Tooltip id="settingsThreeDApiKey" showTooltips={showTooltips}>
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase mb-1">
                            API Key de {settings.threeD.provider === 'tripo' ? 'Tripo 3D' : 'Meshy'}
                          </label>
                          <input
                            type="password"
                            value={settings.threeD.apiKey || ''}
                            onChange={(e) => updateThreeDSettings({ apiKey: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
                            placeholder={settings.threeD.provider === 'meshy' ? "ej: msy_..." : "ej: tripo_..."}
                          />
                        </div>
                      </Tooltip>

                      <Tooltip id="settingsThreeDModel" showTooltips={showTooltips}>
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase mb-1">
                            Versión del Modelo / Calidad
                          </label>
                          <select
                            value={settings.threeD.model}
                            onChange={(e) => updateThreeDSettings({ model: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-300 font-bold"
                          >
                            {settings.threeD.provider === 'tripo' ? (
                              <>
                                <option value="tripo-v2.0">Tripo v2.0 (Recomendado)</option>
                                <option value="tripo-v1.5">Tripo v1.5</option>
                              </>
                            ) : (
                              <>
                                <option value="meshy-4">Meshy-4 (Malla Rápida)</option>
                                <option value="meshy-6">Meshy-6 (Recomendado - Detallado)</option>
                              </>
                            )}
                          </select>
                        </div>
                      </Tooltip>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      * Las peticiones se enrutan mediante el backend seguro en Rust para eludir restricciones de CORS en Tauri.
                    </p>
                  </div>
                )}

                {/* OmniDeploy. Bloque PROPIO con campos propios: ComfyDeploy
                    reutiliza aqui baseUrl y apiKey, y compartirlos hacia que
                    cambiar de proveedor pisara las credenciales del anterior.
                    Antes solo existia el verificador de conexion, sin ningun
                    sitio donde pegar el Deployment ID. */}
                {settings.threeD.provider === 'omnideploy' && (
                  <div className="space-y-4 pt-2 border-t border-slate-900">
                    <div className="p-3 bg-cyan-900/20 border border-cyan-500/30 rounded text-xs text-cyan-200">
                      <p className="font-bold mb-1 flex items-center gap-2">
                        <Server className="w-3 h-3 text-cyan-400" /> GPU REMOTA: OMNIDEPLOY (3D)
                      </p>
                      La malla se genera en la GPU del proveedor. Carga abajo tu Workflow JSON de
                      3D: el proveedor ejecuta ComfyUI y sin el grafo no sabe qué producir.
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase mb-1">
                          API Key de OmniDeploy
                        </label>
                        <input
                          type="password"
                          value={settings.threeD.omniDeployApiKey || ''}
                          onChange={(e) => updateThreeDSettings({ omniDeployApiKey: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
                          placeholder="La que te dio el proveedor"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase mb-1">
                          Deployment ID de OmniDeploy
                        </label>
                        <input
                          type="text"
                          value={settings.threeD.omniDeployDeploymentId || ''}
                          onChange={(e) => updateThreeDSettings({ omniDeployDeploymentId: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
                          placeholder="omni_..."
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ComfyDeploy */}
                {settings.threeD.provider === 'comfydeploy' && (
                  <div className="space-y-4 pt-2 border-t border-slate-900">
                    <div className="grid grid-cols-2 gap-4">
                      <Tooltip id="settingsThreeDCDApiKey" showTooltips={showTooltips}>
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase mb-1">
                            API Key de ComfyDeploy
                          </label>
                          <input
                            type="password"
                            value={settings.threeD.apiKey || ''}
                            onChange={(e) => updateThreeDSettings({ apiKey: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
                            placeholder="cd_..."
                          />
                        </div>
                      </Tooltip>

                      <Tooltip id="settingsThreeDCDDeploymentId" showTooltips={showTooltips}>
                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase mb-1">
                            Deployment ID de 3D
                          </label>
                          <input
                            type="text"
                            value={settings.threeD.baseUrl || ''}
                            onChange={(e) => updateThreeDSettings({ baseUrl: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-300 font-mono"
                            placeholder="ej: a1b2c3d4-..."
                          />
                        </div>
                      </Tooltip>
                    </div>
                  </div>
                )}

                {/* Local: ComfyUI / A1111 */}
                {(settings.threeD.provider === 'comfyui' || settings.threeD.provider === 'a1111') && (
                  <div className="space-y-4 pt-2 border-t border-slate-900">
                    <div className="grid grid-cols-2 gap-4">
                      <Tooltip id="settingsThreeDBaseUrl" showTooltips={showTooltips}>
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">
                            URL del Servidor {settings.threeD.provider === 'comfyui' ? 'ComfyUI' : 'A1111'}
                          </label>
                          <input
                            type="text"
                            value={settings.threeD.baseUrl}
                            onChange={(e) => updateThreeDSettings({ baseUrl: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                            placeholder={settings.threeD.provider === 'comfyui' ? "http://127.0.0.1:8188" : "http://127.0.0.1:7860"}
                          />
                        </div>
                      </Tooltip>

                      <Tooltip id="settingsThreeDWorkflowId" showTooltips={showTooltips}>
                        <div>
                          <label className="block text-xs text-slate-500 uppercase mb-1">
                            {settings.threeD.provider === 'comfyui' ? 'Workflow ID por Defecto' : 'Nombre del Workflow para A1111'}
                          </label>
                          <input
                            type="text"
                            value={settings.threeD.workflowId || ''}
                            onChange={(e) => updateThreeDSettings({ workflowId: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-300 font-mono"
                            placeholder={settings.threeD.provider === 'comfyui' ? "ej: 3d-generator" : "ej: a1111-3d"}
                          />
                        </div>
                      </Tooltip>
                    </div>

                    <Tooltip id="settingsThreeDWorkflow" showTooltips={showTooltips} className="block">
                      <div>
                        <label className="block text-xs text-slate-500 uppercase mb-1">
                          {settings.threeD.provider === 'comfyui' ? 'Workflow ComfyUI (.json)' : 'Workflow A1111 (.json)'}
                        </label>
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="file"
                            accept=".json"
                            onChange={handleThreeDWorkflowUpload}
                            className="hidden"
                            id="threeD-workflow-upload"
                          />
                          <button
                            onClick={() => document.getElementById('threeD-workflow-upload')?.click()}
                            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] text-slate-300 font-bold tracking-wider transition-colors"
                          >
                            {settings.threeD.customWorkflow ? 'CAMBIAR WORKFLOW' : 'CARGAR WORKFLOW JSON'}
                          </button>
                          {settings.threeD.customWorkflow && (
                            <button
                              onClick={() => updateThreeDSettings({ customWorkflow: undefined })}
                              className="p-2 bg-red-950/40 hover:bg-red-800 border border-red-800 rounded text-red-400 transition-colors"
                              title="Remover Workflow"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {settings.threeD.customWorkflow && (
                          <p className="text-[10px] text-blue-400 mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Workflow JSON cargado en memoria</p>
                        )}
                      </div>
                    </Tooltip>
                  </div>
                )}


                
                {renderTestConnectionWidget(
                  'threeD',
                  settings.threeD.provider,
                  settings.threeD.provider === 'comfydeploy'
                    ? (settings.threeD.baseUrl || '')
                    : settings.threeD.baseUrl,
                  settings.threeD.apiKey
                )}
              </div>
            </div>
          )}

          {/* PORTAL DEV TAB */}
          {activeTab === 'dev' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {!isLicensed ? (
                /* VISTA DE ACTIVACIÓN DE LICENCIA (BLOQUEADO) */
                <div className="bg-slate-950 p-6 rounded-lg border border-purple-950/40 shadow-[0_0_30px_rgba(147,51,234,0.05)] relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
                  
                  <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-900">
                    <div className="w-12 h-12 rounded-lg bg-purple-950/30 border border-purple-900/30 flex items-center justify-center text-purple-400 animate-pulse">
                      <Lock className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-purple-400 font-mono tracking-wider">🔐 ACTIVACIÓN DE PORTAL DEV</h3>
                      <p className="text-[10px] text-slate-500 font-sans mt-0.5">Se requiere una licencia criptográfica activa atada a este dispositivo.</p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    {/* HARDWARE ID BOX */}
                    <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800/80">
                      <label className="block text-[10px] font-bold text-slate-400 font-mono tracking-wider mb-2">TU IDENTIFICADOR DE HARDWARE:</label>
                      <div className="flex items-center gap-2 bg-slate-950 p-3 rounded border border-slate-900 font-mono text-xs text-purple-300 select-all justify-between">
                        <span>{hardwareId || "Generando identificador..."}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(hardwareId);
                            setLicenseSuccess("¡ID de Hardware copiado!");
                            setTimeout(() => setLicenseSuccess(''), 3000);
                          }}
                          className="px-2.5 py-1 rounded bg-purple-950/40 border border-purple-800/40 hover:bg-purple-900/30 text-[9px] font-bold text-purple-400 uppercase tracking-wider transition-all"
                        >
                          Copiar
                        </button>
                      </div>
                      <span className="block text-[9px] text-slate-500 mt-2 leading-relaxed">
                        Envía este identificador al creador para obtener tu código de licencia (Ed25519/HMAC).
                      </span>
                    </div>

                    {/* LICENSE INPUT BOX */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-400 font-mono tracking-wider">CÓDIGO DE LICENCIA ACTIVACIÓN:</label>
                      <textarea
                        value={licenseInput}
                        onChange={(e) => setLicenseInput(e.target.value)}
                        placeholder="Pega tu código de licencia criptográfica aquí..."
                        className="w-full h-24 bg-slate-900/50 border border-slate-800 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 rounded p-3 font-mono text-[10px] text-slate-300 placeholder-slate-600 transition-all outline-none resize-none"
                      />
                    </div>

                    {/* FEEDBACK STATUS */}
                    {licenseError && (
                      <div className="p-3 rounded bg-red-950/20 border border-red-900/30 text-[10px] text-red-400 font-mono flex gap-2 items-center">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{licenseError}</span>
                      </div>
                    )}

                    {licenseSuccess && (
                      <div className="p-3 rounded bg-emerald-950/20 border border-emerald-900/30 text-[10px] text-emerald-400 font-mono flex gap-2 items-center">
                        <CheckCircle className="w-4 h-4 flex-shrink-0 animate-bounce" />
                        <span>{licenseSuccess}</span>
                      </div>
                    )}

                    {/* ACTIVATE BUTTON */}
                    <button
                      onClick={async () => {
                        try {
                          setLicenseError('');
                          setLicenseSuccess('');
                          if (!licenseInput.trim()) {
                            setLicenseError('Por favor ingresa un código de licencia.');
                            return;
                          }
                          const msg = await invoke<string>('save_license_key', { licenseKey: licenseInput });
                          setLicenseSuccess(msg);
                          setTimeout(() => {
                            setIsLicensed(true);
                          }, 1500);
                        } catch (err) {
                          setLicenseError(String(err));
                        }
                      }}
                      className="w-full py-3 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-widest transition-all duration-300 shadow-lg shadow-purple-900/20 hover:shadow-purple-500/20 active:scale-[0.99] border border-purple-500/30"
                    >
                      Validar & Activar Licencia
                    </button>
                  </div>
                </div>
              ) : (
                /* VISTA DEL PORTAL DEV (DESBLOQUEADO) */
                <div className="bg-slate-950 p-6 rounded-lg border border-slate-800 shadow-[0_0_20px_rgba(147,51,234,0.07)]">
                  <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-900">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-purple-950/50 border border-purple-800/40 flex items-center justify-center text-purple-400">
                        <Settings className="w-6 h-6 animate-spin" style={{ animationDuration: '8s' }} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-purple-400 font-mono tracking-wider flex items-center gap-2">
                          PORTAL DE DESARROLLADOR / ADMIN <span className="text-[9px] bg-purple-950 border border-purple-800 text-purple-400 px-2 py-0.5 rounded font-mono">OMNI-SHIELD OK</span>
                        </h3>
                        <p className="text-[10px] text-slate-500 font-sans mt-0.5">Control global de visibilidad de módulos principales de Omni IA Game.</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* ANIMATION TOGGLE */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-slate-900/60 border border-slate-800/60 hover:border-purple-900/30 transition-all duration-300">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded bg-slate-950 border ${settings.enabledTabs?.animation !== false ? 'text-purple-400 border-purple-950' : 'text-slate-600 border-slate-800'}`}>
                          <Video className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="block text-xs font-bold text-slate-200 font-mono tracking-wider">MÓDULO DE ANIMACIÓN (VIDEO/SPRITES)</span>
                          <span className="block text-[10px] text-slate-500 font-sans mt-0.5">Habilita/deshabilita el tab AnimationStudio, keyframes y workflows de video.</span>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleTab('animation')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold text-[10px] tracking-wider uppercase transition-all duration-300 border ${
                          settings.enabledTabs?.animation !== false
                            ? 'bg-purple-950/40 text-purple-400 border-purple-800/60 hover:bg-purple-900/30 shadow-[0_0_10px_rgba(168,85,247,0.1)]'
                            : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {settings.enabledTabs?.animation !== false ? (
                          <>
                            <ToggleRight className="w-4 h-4 text-purple-400" /> ACTIVO
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-4 h-4 text-slate-600" /> INACTIVO
                          </>
                        )}
                      </button>
                    </div>

                    {/* NPCS TOGGLE */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-slate-900/60 border border-slate-800/60 hover:border-sky-900/30 transition-all duration-300">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded bg-slate-950 border ${settings.enabledTabs?.npcs !== false ? 'text-sky-400 border-sky-950' : 'text-slate-600 border-slate-800'}`}>
                          <Cpu className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="block text-xs font-bold text-slate-200 font-mono tracking-wider">MÓDULO DE NPCs INTELIGENTES</span>
                          <span className="block text-[10px] text-slate-500 font-sans mt-0.5">Habilita/deshabilita el tab de diseño de NPCStudio y diálogos dinámicos.</span>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleTab('npcs')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold text-[10px] tracking-wider uppercase transition-all duration-300 border ${
                          settings.enabledTabs?.npcs !== false
                            ? 'bg-sky-950/40 text-sky-400 border-sky-800/60 hover:bg-sky-900/30 shadow-[0_0_10px_rgba(56,189,248,0.1)]'
                            : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {settings.enabledTabs?.npcs !== false ? (
                          <>
                            <ToggleRight className="w-4 h-4 text-sky-400" /> ACTIVO
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-4 h-4 text-slate-600" /> INACTIVO
                          </>
                        )}
                      </button>
                    </div>

                    {/* 3D TOGGLE */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-slate-900/60 border border-slate-800/60 hover:border-purple-900/30 transition-all duration-300">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded bg-slate-950 border ${settings.enabledTabs?.threeD !== false ? 'text-purple-400 border-purple-950' : 'text-slate-600 border-slate-800'}`}>
                          <Box className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="block text-xs font-bold text-slate-200 font-mono tracking-wider">MÓDULO DE SUITE 3D (TRI-PO/MESHY)</span>
                          <span className="block text-[10px] text-slate-500 font-sans mt-1">Habilita/deshabilita el modelador 3D interactivo y texturizador.</span>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleTab('threeD')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold text-[10px] tracking-wider uppercase transition-all duration-300 border ${
                          settings.enabledTabs?.threeD !== false
                            ? 'bg-purple-950/40 text-purple-400 border-purple-800/60 hover:bg-purple-900/30 shadow-[0_0_10px_rgba(168,85,247,0.1)]'
                            : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {settings.enabledTabs?.threeD !== false ? (
                          <>
                            <ToggleRight className="w-4 h-4 text-purple-400" /> ACTIVO
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-4 h-4 text-slate-600" /> INACTIVO
                          </>
                        )}
                      </button>
                    </div>

                    {/* CREADOR 2D TOGGLE.
                        A diferencia de los tres de arriba, este interruptor NO
                        se pinta siempre: solo existe si la licencia instalada
                        nombra el modulo y el servidor no la ha rechazado. Sin
                        eso no hay control que tocar, y por tanto tampoco hay
                        nada que senale que el modulo esta ahi. */}
                    {creador2dLicensed && (
                      <div className="flex items-center justify-between p-4 rounded-lg bg-slate-900/60 border border-slate-800/60 hover:border-cyan-900/30 transition-all duration-300">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded bg-slate-950 border ${settings.enabledTabs?.creador2d !== false ? 'text-cyan-400 border-cyan-950' : 'text-slate-600 border-slate-800'}`}>
                            <Boxes className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="block text-xs font-bold text-slate-200 font-mono tracking-wider">MÓDULO CREADOR DE MUNDOS 2D / 2.5D</span>
                            <span className="block text-[10px] text-slate-500 font-sans mt-1">Habilita/deshabilita el editor de escenarios por bloques en ASSETS ▸ Mundos.</span>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleTab('creador2d')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold text-[10px] tracking-wider uppercase transition-all duration-300 border ${
                            settings.enabledTabs?.creador2d !== false
                              ? 'bg-cyan-950/40 text-cyan-400 border-cyan-800/60 hover:bg-cyan-900/30 shadow-[0_0_10px_rgba(34,211,238,0.1)]'
                              : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          {settings.enabledTabs?.creador2d !== false ? (
                            <>
                              <ToggleRight className="w-4 h-4 text-cyan-400" /> ACTIVO
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-4 h-4 text-slate-600" /> INACTIVO
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 p-4 rounded-lg bg-slate-900/30 border border-slate-850/80 flex gap-3 items-start animate-pulse">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="block text-xs font-bold text-slate-300 font-mono tracking-wide">NOTA SOBRE NAVEGACIÓN Y PERSISTENCIA</span>
                      <span className="block text-[10px] text-slate-500 font-sans mt-1 leading-relaxed">
                        Al deshabilitar un tab, éste se ocultará de la barra superior y de la configuración al guardar los cambios. Si te encuentras en un tab que acaba de ser ocultado, la app te reconducirá automáticamente al panel de ASSETS de forma segura.
                      </span>
                    </div>
                  </div>

                  {/* LICENCIA ACTUAL (GESTIÓN) */}
                  <div className="mt-6 p-4 rounded-lg bg-slate-900/40 border border-purple-950/50">
                    <div className="flex items-center gap-2 mb-3">
                      <Lock className="w-4 h-4 text-purple-400" />
                      <span className="block text-xs font-bold text-purple-400 font-mono tracking-wider">GESTIÓN DE LICENCIA ACTUAL</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      <div className="p-3 rounded bg-slate-950 border border-slate-800">
                        <span className="block text-[9px] font-bold text-slate-500 font-mono tracking-wider mb-1">ESTADO</span>
                        <span className={`block text-xs font-bold font-mono ${effectiveIsLicensed ? 'text-emerald-400' : 'text-red-500'}`}>
                          {effectiveIsLicensed
                            ? getRemainingTimeString(licenseDetails)
                            : licenseOnline?.reason
                            ? `EXPIRADA: ${licenseOnline.reason.toUpperCase()}`
                            : 'SIN LICENCIA / EXPIRADA'}
                        </span>
                      </div>
                      <div className="p-3 rounded bg-slate-950 border border-slate-800">
                        <span className="block text-[9px] font-bold text-slate-500 font-mono tracking-wider mb-1">HARDWARE ID</span>
                        <span className="block text-[10px] font-mono text-purple-300 select-all break-all">
                          {hardwareId || "Generando identificador..."}
                        </span>
                      </div>
                      <div className="p-3 rounded bg-slate-950 border border-slate-800">
                        <span className="block text-[9px] font-bold text-slate-500 font-mono tracking-wider mb-1">NIVEL DE ACCESO</span>
                        <span className={`block text-xs font-bold font-mono ${effectiveIsLicensed && licenseDetails?.cap === 'full' ? 'text-emerald-400' : 'text-red-500'}`}>
                          {effectiveIsLicensed && licenseDetails?.cap === 'full'
                            ? 'FULL (todas las pestañas)'
                            : effectiveIsLicensed && licenseDetails?.is_licensed
                            ? 'DEV PORTAL (pestañas premium bloqueadas)'
                            : 'INACTIVA / EXPIRADA'}
                        </span>
                      </div>
                      {/* Modulos sueltos. Solo se pinta si la licencia esta ACTIVA y trae alguno */}
                      {effectiveIsLicensed && !!(licenseDetails?.mods ?? []).length && (
                        <div className="p-3 rounded bg-slate-950 border border-slate-800 sm:col-span-2">
                          <span className="block text-[9px] font-bold text-slate-500 font-mono tracking-wider mb-1">
                            MÓDULOS ADICIONALES
                          </span>
                          <span className="block text-xs font-bold font-mono text-emerald-400">
                            {(licenseDetails?.mods ?? []).includes('creador2d')
                              ? 'CREADOR DE MUNDOS 2D'
                              : (licenseDetails?.mods ?? []).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-500 font-sans mb-4 leading-relaxed">
                      Al pegar y activar un código nuevo, este <span className="text-slate-300 font-semibold">reemplaza</span> la licencia actual
                      (por ejemplo: 1 día → 3 meses → perpetua). Eliminar la licencia libera el Portal Dev y
                      <span className="text-slate-300 font-semibold"> reinicia el contador de tiempo de CPU</span>, permitiendo activar una clave nueva desde cero.
                    </p>

                    <button
                      onClick={async () => {
                        const isTauri = typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';
                        let confirmed = false;

                        if (isTauri) {
                          try {
                            const dialogResult = await invoke<string>('plugin:dialog|message', {
                              message: '¿Eliminar la licencia actual de tu cuenta?\n\nEsta acción no se puede deshacer.',
                              title: 'ELIMINAR LICENCIA',
                              kind: 'warning',
                              buttons: { OkCancelCustom: ['Eliminar licencia', 'Cancelar'] },
                            });
                            confirmed = Boolean(dialogResult && dialogResult !== 'Cancel' && dialogResult !== 'Cancelar');
                          } catch (_) {
                            confirmed = window.confirm('¿Eliminar la licencia actual de tu cuenta?\n\nEsta acción no se puede deshacer.');
                          }
                        } else {
                          confirmed = window.confirm('¿Eliminar la licencia actual de tu cuenta?\n\nEsta acción no se puede deshacer.');
                        }

                        if (!confirmed) return;

                        try {
                          setLicenseError('');
                          setLicenseSuccess('');

                          if (isTauri) {
                            try {
                              await invoke<string>('delete_license');
                            } catch (_) {}
                          }

                          // Desvincular/eliminar la licencia en el servidor Web (auth-server)
                          const authServerUrl = localStorage.getItem('omni_auth_server_url') || 'https://fenixdev.cloud';
                          const authToken = localStorage.getItem('omni_auth_token') || sessionStorage.getItem('omni_auth_token') || '';

                          if (authToken) {
                            let res = await fetch(`${authServerUrl.replace(/\/$/, '')}/api/me/license`, {
                              method: 'DELETE',
                              headers: {
                                'Authorization': `Bearer ${authToken}`,
                                'Content-Type': 'application/json'
                              }
                            });
                            if (!res.ok) {
                              res = await fetch(`${authServerUrl.replace(/\/$/, '')}/api/me/license/delete`, {
                                method: 'POST',
                                headers: {
                                  'Authorization': `Bearer ${authToken}`,
                                  'Content-Type': 'application/json'
                                }
                              });
                            }
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              throw new Error(data.error || 'Error al eliminar la licencia en el servidor');
                            }
                          }

                          if (isTauri) {
                            try {
                              const details = await invoke<LicenseDetails>('get_license_info');
                              setLicenseDetails(details);
                              setIsLicensed(details.is_licensed);
                              setHardwareId(details.hardware_id);
                            } catch (_) {}
                          } else {
                            setIsLicensed(false);
                            setLicenseDetails(null);
                          }

                          setLicenseSuccess('Licencia eliminada y desvinculada exitosamente.');
                          setTimeout(() => {
                            window.location.reload();
                          }, 800);
                        } catch (err: any) {
                          setLicenseError(err.message || String(err));
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded bg-red-950/40 hover:bg-red-900/40 border border-red-900/50 hover:border-red-700/60 text-red-400 font-bold text-[10px] uppercase tracking-widest transition-all duration-300"
                    >
                      <Trash2 className="w-4 h-4" />
                      ELIMINAR LICENCIA ACTUAL
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-between items-center">
          <div className="flex gap-4">
            {testResult && (
              <div className="flex items-center gap-4 animate-in fade-in slide-in-from-left-2">
                {testResult.showOllama && (
                  <span className="flex items-center gap-1.5 text-[10px] font-mono">
                    OLLAMA: {testResult.ollama ? <CheckCircle className="w-3 h-3 text-green-500" /> : <X className="w-3 h-3 text-red-500" />}
                  </span>
                )}
                {testResult.showComfy && (
                  <span className="flex items-center gap-1.5 text-[10px] font-mono">
                    COMFYUI: {testResult.comfyui ? <CheckCircle className="w-3 h-3 text-green-500" /> : <X className="w-3 h-3 text-red-500" />}
                  </span>
                )}
                {testResult.showComfyDeploy && (
                  <span className="flex items-center gap-1.5 text-[10px] font-mono">
                    COMFYDEPLOY: {testResult.comfydeploy ? <CheckCircle className="w-3 h-3 text-green-500" /> : <X className="w-3 h-3 text-red-500" />}
                  </span>
                )}
                {/* Faltaba. `showOmniDeploy` se calculaba y se guardaba, pero no
                    se pintaba en ningun sitio: la prueba se ejecutaba y el
                    resultado se tiraba, de modo que pulsar "probar conexion"
                    parecia no hacer nada. */}
                {testResult.showOmniDeploy && (
                  <span className="flex items-center gap-1.5 text-[10px] font-mono">
                    OMNIDEPLOY: {testResult.omnideploy ? <CheckCircle className="w-3 h-3 text-green-500" /> : <X className="w-3 h-3 text-red-500" />}
                  </span>
                )}
              </div>
            )}
            {/* El motivo, en texto. Un aspa roja no distingue "credenciales mal"
                de "la GPU del proveedor esta apagada", que es la diferencia
                entre un error del usuario y una espera. */}
            {testResult && testResult.showOmniDeploy && testResult.omnideployMensaje && (
              <p className={`mt-1.5 text-[10px] ${testResult.omnideploy ? 'text-emerald-400' : 'text-amber-400'}`}>
                {testResult.omnideployMensaje}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold text-sm transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSaveAndTest}
              disabled={testing}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold text-sm transition-all flex items-center gap-2 shadow-lg shadow-blue-900/20 disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {testing ? 'VERIFICANDO...' : 'GUARDAR Y PROBAR'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;