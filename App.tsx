
import React, { useState, useEffect, useRef, useCallback } from 'react';
import './services/webBridge';
import { TabView, ProjectData, GeneratedAsset, ChatMessage } from './types';
import { saveProjectToDB, saveAssetsToDB, loadProjectFromDB } from './services/db';
import AssetGenerator from './components/AssetGenerator';
import CodeAssistant from './components/CodeAssistant';
import AudioDesigner from './components/AudioDesigner';
import NarrativeGenerator from './components/NarrativeGenerator';
import AnimationStudio from './components/AnimationStudio';
import NPCStudio from './components/NPCStudio';
import ThreeDStudio from './components/ThreeDStudio';
import SettingsModal from './components/SettingsModal';
import ComfyUIInstaller from './components/ComfyUIInstaller';
import OllamaInstaller from './components/OllamaInstaller';
import LlamaModelInstaller from './components/LlamaModelInstaller';
import Tooltip from './components/Tooltip';
import AuthScreen, { clearStoredAuth, getAuthServerUrl, readStoredEmail, readStoredToken } from './components/AuthScreen';
import { Box, Code, Music, Globe, ScrollText, Activity, Save, FolderOpen, Trash2, Plus, Settings, Power, Zap, Terminal, X, HelpCircle, Users, Sparkles, Loader2 } from 'lucide-react';
import { publicarWorkflows } from './services/publicarWorkflows';
import { getServices } from './modules/creador2d/state/services';
import { processAssetsBase64, ensureAssetBase64 } from './utils/imageUtils';
import { checkForUpdates, UpdateManifest, CURRENT_VERSION } from './services/updateService';
import UpdateModal from './components/UpdateModal';
import { getLlamaServerState, stopLlamaServer } from './services/llamaServerService';
import { comfyWS } from './services/comfyWebSocket';
import { exportarProyectoOmni, importarProyectoOmni, esArchivoOmni } from './services/omniCrypto';

// Conectar WebSocket directo a la URL de ComfyUI para recibir logs en tiempo real sin latencia ni pasar por OmniDeploy



/**
 * Hay ventana de Tauri, es decir, se puede llamar a `invoke`.
 *
 * Falso en `npm run dev`, que sirve la interfaz en un navegador normal. No es
 * un error: alli no hay proceso nativo, y por tanto tampoco hay licencia, ni
 * HWID, ni servicios que arrancar.
 */
const hayEntornoTauri = (): boolean =>
  Boolean((window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke);

// Define invoke as a global fallback to avoid ESM resolution issues
const invoke = <T = any>(name: string, args?: any): Promise<T> => {
  const rawInvoke = (window as any).__TAURI__?.invoke ||
                    (window as any).__TAURI_INTERNALS__?.invoke;
  if (rawInvoke) {
    return rawInvoke(name, args);
  }
  console.warn(`Tauri invoke fallback: ${name} not available`);
  return Promise.resolve(false as any);
};

const STORAGE_KEY = 'devasset_ai_project_v1';
const DEFAULT_PROJECT: ProjectData = {
  id: 'default',
  name: 'Nuevo Proyecto',
  showTooltips: true,
  initialized: true,
  assets: [],
  assetState: {
    mode: 'sprite',
    spriteName: '',
    worldName: '',
    selectedStyle: 'Pixel Art (16-bit)',
    selectedAction: 'Idle',
    spriteDetails: '',
    worldDetails: '',
    negativePrompt: 'text, ui, watermark, blurry, low quality, distorted',
    // Un sprite se recorta sobre fondo plano: no debe llevar sombra de
    // contacto, ni borde de pegatina, ni quedar descentrado.
    spriteNegativePrompt:
      'text, ui, watermark, blurry, low quality, distorted, shadow, drop shadow, ground shadow, ambient occlusion, off-center, sticker, white border, framing',
    // Un escenario necesita justo lo contrario: sombras que le den volumen y
    // hora del dia, y llenar el encuadre en vez de centrarse.
    worldNegativePrompt:
      'text, ui, watermark, blurry, low quality, distorted, characters, people, NPCs, close-up face',
    useConsistency: true,
    uploadedRef: null,
    customWorkflow: null,
    autoRemoveBackground: false,
    autoSlice: false,
    isActionSpriteSheet: false,
    useProceduralWorld: false,
    gameGenre: 'rpg',
    worldDensity: 'organic',
    emptySceneOnly: true,
    // Un mapa completo a 512 px no admite acercamiento. 1536 es el equilibrio
    // en una RTX 3090: cabe holgado en VRAM con SDXL o Flux y da margen de zoom.
    worldResolution: 1536,
    worldAspect: '1:1',
    // Los sprites tambien salian al tamano del workflow sin opcion. Una hoja de
    // modelo de cuatro vistas a 1024 de ancho deja 256 px por vista.
    spriteResolution: 1024,
    spriteAspect: '1:1',
    lockedSeed: null,
    loraTriggerWords: '',
    loraOwnsStyle: false,
    removeBgInWorkflow: false,
    rembgModel: 'BiRefNet_toonout',
    useChromaKeyGreen: false,
    spriteBgMode: 'white',
    useBasicBackgrounds: true,
  },

  animationState: {
    selectedType: 'Walk Cycle',
    selectedStyle: 'Pixel Art (16-bit)',
    activePrinciples: ['Timing', 'Arcs'],
    characterDesc: '',
    negativePrompt: 'text, ui, watermark, blurry, low quality, distorted, bad proportions, bad anatomy',
    resultImage: null,
    videoUrl: null,
    gifUrl: null,
    guideText: null,
    useConsistency: true,
    uploadedRef: null,
    customWorkflow: null,
    apiProvider: 'google',
    customApiKey: '',
    frames: null,
    activeStep: 1,
    variants: [],
    selectedVariantIdx: null,
    directionalPoses: { front: null, right: null, left: null, back: null },
    extractedFrames: [],
    isDefringed: false,
    useRandomSeed: true,
    customSeed: 798635,
  },
  narrativeState: {
    idea: '',
    useAIExpansion: true,
    scriptES: '',
    scriptEN: '',
    selectedVoice: 'Heroic Male',
    voiceEnthusiasm: 50,
    useSpainSpanish: false,
    voiceSpeed: 1.0,
    sfxDesc: 'Viento sibilante, crujido de hojas',
    musicDesc: 'Flauta andina lúgubre, percusión tribal lenta',
    monsterLevel: 0,
    audioUrlES: null,
    audioUrlEN: null,
    useRandomSeed: true,
    customSeed: 798635,
  },
  audioState: {
    category: 'sfx',
    sfx: {
      title: '',
      prompt: '',
      lyrics: '',
      language: 'ES',
      isInstrumental: true,
      genre: '',
      style: '',
      singerGender: null,
      duration: 2,
      injectDuration: true,
      bpm: 110,
      audioUrl: null,
      isSoundscape: false,
      useRandomSeed: true,
      customSeed: 798635,
    },
    music: {
      title: '',
      prompt: '',
      lyrics: '',
      language: 'ES',
      isInstrumental: true,
      genre: '',
      style: '',
      singerGender: null,
      duration: 60,
      injectDuration: true,
      bpm: 110,
      audioUrl: null,
      isSoundscape: false,
      useRandomSeed: true,
      customSeed: 798635,
    }
  },
  apiSettings: {
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'gemma4:12b',
      apiKey: '',
    },
    text: {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'gemma4:12b',
      apiKeys: {},
    },
    npcs: {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'gemma4:12b',
      apiKeys: {},
    },
    image: {
      provider: 'comfyui',
      baseUrl: 'http://127.0.0.1:8188',
      model: 'sd_xl_base_1.0.safetensors',
      apiKeys: {},
    },
    video: {
      provider: 'comfyui',
      baseUrl: 'http://127.0.0.1:8188',
      workflowId: 'animatediff',
      promptNode: 'CLIPTextEncode',
      negativeNode: 'CLIPTextEncode',
      imageNode: 'LoadImage',
      useAdvancedPipeline: false,
      apiKeys: {},
    },
    audio: {
      ttsProvider: 'local',
      ttsUrl: 'http://localhost:5000',
      ttsModel: 'edge-tts',
      ttsWorkflowId: '',
      musicProvider: 'local',
      musicUrl: 'http://localhost:7860',
      musicModel: 'musicgen-small',
      musicWorkflowId: '',
      sfxUrl: 'http://127.0.0.1:8188',
      sfxModel: 'sfx-generator',
      sfxWorkflowId: '',
      apiKeys: {},
    },
    threeD: {
      provider: 'tripo',
      baseUrl: 'http://127.0.0.1:8188',
      apiKey: '',
      model: 'tripo-v2.0',
      customWorkflow: '',
      promptNode: 'CLIPTextEncode',
      negativeNode: 'CLIPTextEncode',
      imageNode: 'LoadImage',
      apiKeys: {},
    },
    code: {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'gemma4:12b',
      apiKeys: {},
    },
    promptEngineer: {
      enabled: true,
      useTextProvider: false,
      provider: 'gemini',
      baseUrl: '',
      model: '',
      apiKey: '',
    },
    worldWorkflows: {
      a: {
        provider: 'comfyui',
        baseUrl: 'http://127.0.0.1:8188',
        workflowId: '',
        customWorkflow: '',
        comfyDeployApiKey: '',
        comfyDeployDeploymentId: '',
        omniDeployApiKey: '',
        omniDeployDeploymentId: '',
      },
      b: {
        provider: 'comfyui',
        baseUrl: 'http://127.0.0.1:8188',
        workflowId: '',
        customWorkflow: '',
        comfyDeployApiKey: '',
        comfyDeployDeploymentId: '',
        omniDeployApiKey: '',
        omniDeployDeploymentId: '',
      },
      c: {
        provider: 'comfyui',
        baseUrl: 'http://127.0.0.1:8188',
        workflowId: '',
        customWorkflow: '',
        comfyDeployApiKey: '',
        comfyDeployDeploymentId: '',
        omniDeployApiKey: '',
        omniDeployDeploymentId: '',
      }
    },
    enabledTabs: {
      animation: true,
      npcs: true,
      threeD: true,
    },
    comfyuiPath: 'G:\\apps\\all_comfyui_installer\\ComfyUI',
    autoFreeMemoryAfterGeneration: false,
  },
  codeState: {
    messages: [
      {
        id: 'init',
        role: 'model',
        content: "DevAsset AI System Online. Ready to script behavior for your game. \n\nWaiting for input on: \n- Character Controllers\n- AI Behavior\n- Shader Logic",
        type: 'text'
      }
    ],
    input: '',
  },
  npcsState: {
    npcs: [],
    activeNpcId: null,
    chatInput: '',
    isGenerating: false
  },
  threeDState: {
    activeSubTab: '3d_gen_texturizing',
    nestedTab: '3d_gen',
    prompt: '',
    negativePrompt: '',
    referenceImage: null,
    useConsistency: true,
    resultModelUrl: null,
    resultModelType: null,
    isGenerating: false,
    progressText: '',
    useRandomSeed: true,
    customSeed: 798635,
  }
};


const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabView>(TabView.ASSETS);
  const [project, setProject] = useState<ProjectData>(DEFAULT_PROJECT);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  interface LicenseDetails {
    is_licensed: boolean;
    license_key: string;
    expiration: string;
    uptime_limit: number;
    uptime_used: number;
    hardware_id: string;
    cap: string;
    email?: string | null;
    /**
     * Modulos premium sueltos que concede la licencia, ademas de lo que abra
     * `cap`. Rust lo devuelve siempre, vacio si la licencia no lo trae: las
     * emitidas antes de que existiera este campo siguen siendo validas.
     */
    mods: string[];
  }

  const [licenseDetails, setLicenseDetails] = useState<LicenseDetails | null>(null);
  const [licenseChecked, setLicenseChecked] = useState(false);
  const [updateManifest, setUpdateManifest] = useState<UpdateManifest | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    const sessionDismissed = sessionStorage.getItem('omni_update_dismissed');
    if (!sessionDismissed) {
      checkForUpdates().then((manifest) => {
        if (manifest.hasUpdate) {
          setUpdateManifest(manifest);
          setIsUpdateModalOpen(true);
        }
      });
    } else {
      // Cargar manifest en segundo plano para el badge del navbar sin abrir el modal
      checkForUpdates().then((manifest) => {
        if (manifest.hasUpdate) {
          setUpdateManifest(manifest);
        }
      });
    }
  }, [isAuthenticated]);
  /**
   * `estado` es lo que responde el servidor: dias y minutos que de verdad
   * quedan. La aplicacion lo PINTA, no lo calcula, porque el reloj vive alli.
   */
  const [licenseOnline, setLicenseOnline] = useState<{
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
  }>({ checked: false, valid: true });

  const licenseOnlineRef = React.useRef(licenseOnline);
  useEffect(() => {
    licenseOnlineRef.current = licenseOnline;
  }, [licenseOnline]);

  const premiumUnlocked =
    !!licenseDetails?.is_licensed &&
    licenseDetails.cap === 'full' &&
    licenseOnline.valid;

  /**
   * El Creador de Mundos 2D es un modulo aparte: no lo abre `cap`, lo abre un
   * modulo nombrado en la licencia. Asi se puede vender suelto sin tener que
   * conceder Animacion, NPCs y 3D con el.
   *
   * Tres condiciones, y las tres tienen que darse:
   *   1. hay licencia instalada y su firma Ed25519 es valida (lo comprueba Rust),
   *   2. esa firma nombra el modulo `creador2d`,
   *   3. el servidor de licencias no la ha rechazado.
   *
   * La tercera usa `licenseOnline.valid`, que es el mismo criterio que ya rige
   * para Animacion, NPCs y 3D: solo se pone a `false` cuando el servidor
   * responde y RECHAZA. Si no hay internet, el modulo sigue abierto — la app
   * tiene que funcionar sin conexion, y una licencia firmada ya es prueba
   * suficiente mientras el servidor no diga lo contrario.
   */
  const creador2dLicensed =
    !!licenseDetails?.is_licensed &&
    (licenseDetails.mods ?? []).includes('creador2d') &&
    licenseOnline.valid;

  /** Lo anterior, ademas del interruptor del Portal Dev. */
  const creador2dUnlocked =
    creador2dLicensed && project.apiSettings.enabledTabs?.creador2d !== false;

  const getRemainingTimeString = (details: LicenseDetails | null): string => {
    if (!details || !details.is_licensed) return 'SIN LICENCIA';

    // LO QUE DICE EL SERVIDOR MANDA, igual que en Ajustes.
    //
    // Esta funcion es una SEGUNDA COPIA de la de SettingsModal, y al arreglar
    // aquella esta se quedo atras: seguia leyendo `details.expiration`, que es
    // el `exp` FIRMADO al generar la licencia, no la fecha que el servidor sella
    // al activarla. Por eso la pantalla principal decia "11h" -las que quedaban
    // hasta el final del dia de emision- mientras Ajustes decia "3 dias", que es
    // lo correcto. Dos funciones, dos fuentes, dos cifras.
    const s = licenseOnline.estado;
    if (s) {
      if (s.expires_at === 'UNLIMITED') return 'PERPETUA (ILIMITADA)';
      const partes: string[] = [];
      if (typeof s.days_left === 'number') {
        partes.push(s.days_left === 0 ? 'ÚLTIMO DÍA' : `${s.days_left} DÍAS`);
      }
      if (typeof s.minutes_left === 'number') {
        if (s.minutes_left <= 0) return 'USO AGOTADO';
        partes.push(`USO: ${Math.floor(s.minutes_left / 60)}h ${s.minutes_left % 60}m`);
      }
      if (partes.length) return partes.join(' · ');
    }

    // Sin respuesta del servidor -sin internet- se calcula en local, que es el
    // respaldo y no la fuente.
    if (details.expiration === 'UNLIMITED') return 'PERPETUA (ILIMITADA)';
    
    const expDate = new Date(details.expiration + 'T23:59:59');
    const now = new Date();
    const diffTime = expDate.getTime() - now.getTime();
    
    if (diffTime <= 0) {
      return 'EXPIRADA';
    }
    
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 2) {
      const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
      return `${diffHours}h RESTANTES`;
    }
    
    if (details.uptime_limit > 0) {
      const minutesLeft = details.uptime_limit - details.uptime_used;
      if (minutesLeft <= 0) return 'CPU AGOTADO';
      
      const hours = Math.floor(minutesLeft / 60);
      const mins = minutesLeft % 60;
      return `${diffDays} DÍAS (CPU: ${hours}h ${mins}m)`;
    }
    
    return `${diffDays} DÍAS`;
  };

  useEffect(() => {
    let cancelled = false;
    const token = readStoredToken();
    if (!token) {
      setAuthChecked(true);
      return;
    }
    fetch(`${getAuthServerUrl()}/api/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.ok !== false) {
          setIsAuthenticated(true);
          const serverLicense = data?.user?.license;
          if (hayEntornoTauri()) {
            if (serverLicense) {
              invoke('save_license_key', { licenseKey: serverLicense }).catch(() => {});
            } else {
              invoke('save_license_key', { licenseKey: '' }).catch(() => {});
            }
          }
        } else {
          clearStoredAuth();
        }
      })
      .catch(() => {
        if (cancelled) return;
        clearStoredAuth();
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const knownWebInstancesRef = useRef<Set<string>>(new Set());
  const knownDesktopInstancesRef = useRef<Set<string>>(new Set());
  const currentInstanceIdRef = useRef<string>(Math.random().toString(36).substring(2, 9));

  // Monitor de Instancias Concurrentes (Control Estricto: Regular 1 / Premium 2 = 1 Escritorio + 1 Web)
  useEffect(() => {
    const isDesktopEnv = hayEntornoTauri();
    const currentInstanceId = currentInstanceIdRef.current;
    const token = readStoredToken();

    // 1. Monitor Local (Mismo Navegador / Mismo Origen via BroadcastChannel)
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('omni_instance_channel') : null;

    const checkLocalConcurrencyRules = () => {
      const isPremium = premiumUnlocked;
      const webCount = knownWebInstancesRef.current.size;
      const desktopCount = knownDesktopInstancesRef.current.size;

      if (!isPremium) {
        if ((isDesktopEnv && webCount > 0) || (!isDesktopEnv && (webCount > 0 || desktopCount > 0))) {
          alert('⚠️ Límite de Instancias Alcanzado: Tu cuenta Regular solo permite 1 aplicación activa a la vez. Se ha cerrado la sesión en esta aplicación para proteger tu cuenta.');
          clearStoredAuth();
          window.location.reload();
        }
      } else {
        if (!isDesktopEnv && webCount > 0) {
          alert('⚠️ Límite de Instancias Alcanzado: Tu cuenta Premium permite máximo 1 App de Escritorio y 1 App Web activa simultáneamente. Se ha cerrado la sesión en esta ventana porque ya tienes una instancia activa en ese entorno.');
          clearStoredAuth();
          window.location.reload();
        }
      }
    };

    if (channel) {
      channel.onmessage = (ev) => {
        if (!ev.data) return;
        const { instanceId, isDesktop, action } = ev.data;
        if (action === 'ping' && instanceId !== currentInstanceId) {
          if (isDesktop) knownDesktopInstancesRef.current.add(instanceId);
          else knownWebInstancesRef.current.add(instanceId);
          channel.postMessage({ type: 'omni_instance_ping', instanceId: currentInstanceId, isDesktop: isDesktopEnv, action: 'pong' });
          checkLocalConcurrencyRules();
        } else if (action === 'pong' && instanceId !== currentInstanceId) {
          if (isDesktop) knownDesktopInstancesRef.current.add(instanceId);
          else knownWebInstancesRef.current.add(instanceId);
          checkLocalConcurrencyRules();
        }
      };
      channel.postMessage({ type: 'omni_instance_ping', instanceId: currentInstanceId, isDesktop: isDesktopEnv, action: 'ping' });
    }

    // 2. Monitor Remoto Universal (Heartbeat al Servidor Hostinger - Funciona entre cualquier navegador Chrome/Comet/Edge/Escritorio)
    const sendServerHeartbeat = async () => {
      const activeEmail = readStoredEmail() || localStorage.getItem('omni_auth_email') || 'jaimearangoia@gmail.com';
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(`${getAuthServerUrl()}/api/session/heartbeat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            instanceId: currentInstanceId,
            isDesktop: isDesktopEnv,
            email: activeEmail
          })
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 || data.code === 'CONCURRENCY_LIMIT_EXCEEDED') {
          alert(data.message || '⚠️ Límite de Instancias Alcanzado: Se ha cerrado la sesión porque existe otra instancia activa en este entorno.');
          clearStoredAuth();
          window.location.reload();
        }
      } catch (err) {
        // Ignorar fallos temporales de red
      }
    };

    sendServerHeartbeat();
    const interval = setInterval(() => {
      if (channel) channel.postMessage({ type: 'omni_instance_ping', instanceId: currentInstanceId, isDesktop: isDesktopEnv, action: 'ping' });
      sendServerHeartbeat();
    }, 4000);

    return () => {
      clearInterval(interval);
      if (channel) channel.close();
    };
  }, [isAuthenticated, premiumUnlocked]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      stopLlamaServer().catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  /**
   * Minutos de uso consumidos desde el ultimo aviso al servidor.
   *
   * Se mide con el reloj de la sesion y se conserva el resto: el sondeo es de
   * 30 s, asi que redondear a minutos enteros en cada vuelta daria siempre cero
   * y una demo por uso no se gastaria jamas. La primera llamada no cuenta nada,
   * porque no hay intervalo anterior con el que comparar.
   */
  const ultimoAviso = useRef<number | null>(null);
  const restoMs = useRef(0);
  const consumirMinutos = () => {
    const ahora = Date.now();
    if (ultimoAviso.current === null) {
      ultimoAviso.current = ahora;
      return 0;
    }
    const transcurrido = ahora - ultimoAviso.current + restoMs.current;
    ultimoAviso.current = ahora;
    // Un salto enorme -equipo suspendido, reloj cambiado- no se cobra: se
    // descarta el intervalo en vez de vaciar la demo de golpe.
    if (transcurrido < 0 || transcurrido > 30 * 60 * 1000) {
      restoMs.current = 0;
      return 0;
    }
    const minutos = Math.floor(transcurrido / 60000);
    restoMs.current = transcurrido - minutos * 60000;
    return minutos;
  };

  useEffect(() => {
    const fetchLicense = () => {
      // Ver `hayEntornoTauri`: en `npm run dev` no hay licencia que leer y el
      // fallo no es tal. Se marca comprobada -sin licencia- y se sale, para no
      // repetir un TypeError cada 30 segundos en la consola.
      if (!hayEntornoTauri()) {
        setLicenseChecked(true);
        setLicenseOnline({ checked: true, valid: true });
        return;
      }
      invoke<LicenseDetails>('get_license_info')
        .then(details => {
          const currentEmail = (readStoredEmail() || '').trim().toLowerCase();
          const licenseEmail = (details.email || '').trim().toLowerCase();

          // Si la licencia física en disco contiene un email y NO coincide con la cuenta activa:
          if (licenseEmail && currentEmail && licenseEmail !== currentEmail) {
            invoke('save_license_key', { licenseKey: '' }).catch(() => {});
            setLicenseDetails(prev => (prev ? { ...prev, is_licensed: false, license_key: '', cap: '', mods: [] } : null));
            setLicenseChecked(true);
            setLicenseOnline({ checked: true, valid: false, reason: 'Licencia vinculada a otra cuenta' });
            return;
          }

          if (licenseOnlineRef.current && licenseOnlineRef.current.checked && !licenseOnlineRef.current.valid) {
            setLicenseDetails(prev => (prev ? { ...details, is_licensed: false } : { ...details, is_licensed: false }));
          } else {
            setLicenseDetails(details);
          }
          setLicenseChecked(true);
          if (details.is_licensed && details.license_key) {
            const validateRemoteLicense = async () => {
              const url = `${getAuthServerUrl()}/api/licenses/validate`;
              const payload = {
                license_key: details.license_key,
                hwid: details.hardware_id,
                email: readStoredEmail() || '',
                minutes_used: consumirMinutos(),
                is_web_client: !hayEntornoTauri(),
              };

              try {
                let data: any = {};
                if (hayEntornoTauri()) {
                  const resText = await invoke<string>('proxy_request', {
                    url,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                  data = JSON.parse(resText || '{}');
                } else {
                  const ctrl = new AbortController();
                  const timer = setTimeout(() => ctrl.abort(), 5000);
                  const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: ctrl.signal,
                  });
                  clearTimeout(timer);
                  data = await res.json().catch(() => ({}));
                }

                if (data && data.valid === false) {
                  invoke('save_license_key', { licenseKey: '' }).catch(() => {});
                  localStorage.removeItem('omnideploy_relay_key');
                  localStorage.removeItem('omnideploy_credentials');
                  setLicenseDetails(prev => (prev ? { ...prev, is_licensed: false, license_key: '', cap: '', mods: [] } : prev));
                  setLicenseOnline({ checked: true, valid: false, reason: data.reason || data.status || 'Rechazada por el servidor', estado: data.estado });
                } else {
                  const serverKey = data?.license?.license_key || data?.token || data?.new_license_key;
                  if (serverKey && serverKey !== details.license_key) {
                    invoke('save_license_key', { licenseKey: serverKey }).catch(() => {});
                  }
                  setLicenseOnline({ checked: true, valid: true, estado: data?.estado });
                }
              } catch {
                // Si el servidor de licencias no responde o cierra la conexión, se mantiene la sesión local válida sin errores
                setLicenseOnline({ checked: true, valid: true });
              }
            };

            validateRemoteLicense();
          } else {
            setLicenseOnline({ checked: true, valid: true });
          }
        })
        .catch(err => {
          console.error("Error al obtener detalles de licencia en footer:", err);
          setLicenseChecked(true);
        });
    };

    fetchLicense();
    const interval = setInterval(fetchLicense, 30000);
    return () => clearInterval(interval);
  }, [isSettingsOpen]); // Refrescar al cerrar/guardar configuraciones y cada 30 segundos

  const [services, setServices] = useState<{
    textProvider: string;
    textStatus: 'ready' | 'loading' | 'offline' | 'configured' | 'missing_key';
    textModelName?: string;
    comfyui: boolean;
    edgetts: boolean;
  }>({
    textProvider: 'gemini',
    textStatus: 'offline',
    comfyui: false,
    edgetts: false
  });
  const [isLaunching, setIsLaunching] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  // El autoinstalador de Ollama no se pinta hasta que el de ComfyUI se aparta.
  const [comfyResuelto, setComfyResuelto] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState("");



  // Redirect to ASSETS tab if the active tab gets disabled in settings
  useEffect(() => {
    const tabs = project.apiSettings.enabledTabs;
    if (!tabs) return;
    if (currentTab === TabView.ANIMATION && (tabs.animation === false || (licenseChecked && !premiumUnlocked))) {
      setCurrentTab(TabView.ASSETS);
    } else if (currentTab === TabView.NPCS && (tabs.npcs === false || (licenseChecked && !premiumUnlocked))) {
      setCurrentTab(TabView.ASSETS);
    } else if (currentTab === TabView.THREE_D && (tabs.threeD === false || (licenseChecked && !premiumUnlocked))) {
      setCurrentTab(TabView.ASSETS);
    }
  }, [project.apiSettings.enabledTabs, currentTab, licenseChecked, premiumUnlocked]);

  /**
   * Esta maquina publica sus workflows para el agente de OmniDeploy.
   *
   * Va en App y no en una pestana concreta porque hay que publicar LAS SIETE
   * secciones -imagen, mundos, video, voz, musica, sfx y 3D-, cada una con su
   * propia configuracion de ComfyUI. Si esto viviera en ASSETS, las otras cinco
   * pestanas no se publicarian nunca y el cliente seguiria teniendo que cargar
   * sus propios grafos, que es justo lo que OmniDeploy evita.
   *
   * Sin Tauri no hace nada, y si falla no lanza: prestar la GPU es un extra que
   * no puede estorbar a quien solo genera en local.
   */
  useEffect(() => {
    publicarWorkflows(project.apiSettings);
  }, [project.apiSettings]);

  // Conexión WebSocket nativa directa a ComfyUI (0ms latencia)
  useEffect(() => {
    const comfyUrl = project.apiSettings?.image?.baseUrl || 'http://127.0.0.1:8188';
    comfyWS.connect(comfyUrl);

    const unsubscribe = comfyWS.subscribe((log) => {
      const timestamp = new Date().toLocaleTimeString();
      setConsoleLogs((prev) => {
        const lines = prev ? prev.split('\n') : [];
        if (lines.length > 300) lines.shift();
        return [...lines, `[${timestamp}] ${log.message}`].join('\n');
      });
    });

    return () => {
      unsubscribe();
    };
  }, [project.apiSettings?.image?.baseUrl]);

  // Check service status every 4 seconds
  useEffect(() => {
    const checkServices = async () => {
      try {
        if (!invoke) return;

        const provider = project.apiSettings.text.provider || 'gemini';
        let textStatus: 'ready' | 'loading' | 'offline' | 'configured' | 'missing_key' = 'offline';
        let textModelName: string | undefined = project.apiSettings.text.model;

        if (provider === 'llama-server') {
          const baseUrl = project.apiSettings.text.baseUrl || 'http://localhost:8088/v1';
          const llamaState = await getLlamaServerState(baseUrl);
          if (llamaState.alive) {
            textStatus = llamaState.loading ? 'loading' : 'ready';
            const rawName = llamaState.models[0] || project.apiSettings.llamaCpp?.modelPath || project.apiSettings.text.model;
            textModelName = rawName ? rawName.split(/[\/\\]/).pop() : undefined;
          } else {
            textStatus = 'offline';
            const mPath = project.apiSettings.llamaCpp?.modelPath;
            if (mPath && (mPath.endsWith('.gguf') || mPath.endsWith('.bin'))) {
              textModelName = mPath.split(/[\/\\]/).pop();
            } else {
              textModelName = undefined;
            }
          }
        } else if (provider === 'ollama') {
          const ollamaUrl = project.apiSettings.text.baseUrl || 'http://localhost:11434';
          const ollamaActive = await invoke('check_service_status', { url: ollamaUrl }).catch(() => false);
          textStatus = ollamaActive ? 'ready' : 'offline';
        } else if (provider === 'lm-studio') {
          const lmUrl = project.apiSettings.text.baseUrl || 'http://localhost:1234/v1';
          const cleanUrl = lmUrl.replace(/\/$/, '');
          const endpoint = cleanUrl.includes('/v1') ? `${cleanUrl}/models` : `${cleanUrl}/v1/models`;
          const lmActive = await invoke('check_service_status', { url: endpoint }).catch(() => false);
          textStatus = lmActive ? 'ready' : 'offline';
        } else if ((provider as string) === 'omnideploy') {
          const s = project.apiSettings;
          const odKey =
            (s.text as any)?.omniDeployApiKey ||
            s.image?.omniDeployApiKey ||
            (s.npcs as any)?.omniDeployApiKey ||
            (s.code as any)?.omniDeployApiKey ||
            s.video?.omniDeployApiKey ||
            s.audio?.ttsOmniDeployApiKey ||
            s.audio?.musicOmniDeployApiKey ||
            s.threeD?.omniDeployApiKey ||
            s.text?.apiKeys?.['omnideploy'];
          textStatus = odKey && String(odKey).trim() ? 'configured' : 'missing_key';
        } else {
          // Proveedores Cloud (Gemini, OpenAI, Anthropic, DeepSeek, Qwen, Kimi, etc.)
          const key = project.apiSettings.text.apiKeys?.[provider] || project.apiSettings.text.apiKey;
          textStatus = key && key.trim() ? 'configured' : 'missing_key';
        }

        const comfyActive = await invoke('check_service_status', {
          url: project.apiSettings.image.baseUrl
        }).catch(() => false);
        const edgeActive = await invoke('check_service_status', {
          url: 'http://localhost:5000/api/voices'
        }).catch(() => false);

        setServices({
          textProvider: provider,
          textStatus,
          textModelName,
          comfyui: !!comfyActive,
          edgetts: !!edgeActive
        });

        if (comfyActive) {
          setIsLaunching(false);
        }
      } catch (e) {
        console.error("Status check failed", e);
      }
    };

    checkServices();
    const isWeb = typeof window !== 'undefined' && ((window as any).__OMNI_IS_WEB__ === true || !((window as any).__TAURI_INTERNALS__?.invoke));
    const interval = setInterval(checkServices, isWeb ? 20000 : 4000);
    return () => clearInterval(interval);
  }, [project.apiSettings]);

  // Polling para los logs de la consola
  useEffect(() => {
    if (!showConsole && !isSettingsOpen) return;

    const fetchLogs = async () => {
      try {
        const isWebMode = (window as any).__OMNI_IS_WEB__ || !(window as any).__TAURI_INTERNALS__;
        if (!isWebMode && (window as any).__TAURI__ && typeof invoke === 'function') {
          const comfyuiPath = project.apiSettings.comfyuiPath || 'G:\\apps\\all_comfyui_installer\\ComfyUI';
          const logs = await invoke('get_comfyui_logs', { comfyuiPath }) as string;
          setConsoleLogs(logs);
        } else {
          // Modo Web App: Consultar logs al servidor Node.js vía OmniDeploy API
          const deploymentId = project.apiSettings.image?.deploymentId || project.apiSettings.video?.deploymentId || '65dc5aaf-6eda-4867-86e0-0d25f864d036';
          if (!deploymentId) {
            setConsoleLogs("Pestaña Web activa. Para monitorear logs remotos, asegúrate de configurar el deploymentId en la pestaña de Ajustes.");
            return;
          }
          const res = await fetch(`https://omni-api.fenixdev.cloud/api/omnideploy/control/logs?deploymentId=${encodeURIComponent(deploymentId)}`);
          const data = await res.json();
          if (data.ok) {
            setConsoleLogs(data.logs || "(Sin registros de log aún en el servidor...)");
            if (data.status === 'running') {
              setIsLaunching(false);
            }
          }
        }
      } catch (e) {
        setConsoleLogs(`Error leyendo logs: ${e}`);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 1000);
    return () => clearInterval(interval);
  }, [showConsole, isSettingsOpen, project.apiSettings]);

  const handleLaunchComfyUI = async () => {
    try {
      setShowConsole(true);
      setIsLaunching(true);
      const isWebMode = (window as any).__OMNI_IS_WEB__ || !(window as any).__TAURI_INTERNALS__;
      if (!isWebMode && (window as any).__TAURI__ && typeof invoke === 'function') {
        const comfyuiPath = project.apiSettings.comfyuiPath || 'F:\\Comfyui_362\\App\\OMNI-IA_START - Copy.bat';
        await invoke('launch_comfyui', { comfyuiPath });
      } else {
        // Modo Web App: Enviar orden de inicio al servidor Node.js vía OmniDeploy
        const deploymentId = project.apiSettings.image?.deploymentId || project.apiSettings.video?.deploymentId || '65dc5aaf-6eda-4867-86e0-0d25f864d036';
        const apiKey = project.apiSettings.image?.apiKey || project.apiSettings.video?.apiKey || 'master';
        const res = await fetch('https://omni-api.fenixdev.cloud/api/omnideploy/control/launch-comfy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deploymentId, apiKey }),
        });
        const data = await res.json();
        if (!data.ok) {
          setIsLaunching(false);
          alert(`Error enviando orden de inicio: ${data.error}`);
        } else {
          setConsoleLogs(prev => (prev || '') + "\n[OmniDeploy] 🚀 Orden enviada: Lanzando ComfyUI en el agente remoto...");
        }
      }
    } catch (e) {
      setIsLaunching(false);
      alert(`Error al lanzar ComfyUI: ${e}`);
    }
  };

  const handleStopComfyUI = async () => {
    try {
      setIsLaunching(false);
      const isWebMode = (window as any).__OMNI_IS_WEB__ || !(window as any).__TAURI_INTERNALS__;
      if (!isWebMode && (window as any).__TAURI__ && typeof invoke === 'function') {
        const comfyuiPath = project.apiSettings.comfyuiPath || 'G:\\apps\\all_comfyui_installer\\ComfyUI';
        const result = await invoke('stop_comfyui', { comfyuiPath });
        alert(result);
      } else {
        // Modo Web App: Enviar orden de detención al servidor Node.js
        const deploymentId = project.apiSettings.image?.deploymentId || project.apiSettings.video?.deploymentId || '65dc5aaf-6eda-4867-86e0-0d25f864d036';
        const apiKey = project.apiSettings.image?.apiKey || project.apiSettings.video?.apiKey || 'master';
        const res = await fetch('https://omni-api.fenixdev.cloud/api/omnideploy/control/stop-comfy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deploymentId, apiKey }),
        });
        const data = await res.json();
        if (!data.ok) {
          alert(`Error enviando orden de detención: ${data.error}`);
        } else {
          alert("Orden de detención enviada a ComfyUI.");
        }
      }
    } catch (e) {
      alert(`Error al detener ComfyUI: ${e}`);
    }
  };

  const handleClearLogs = async () => {
    setConsoleLogs("");
    try {
      if ((window as any).__TAURI__ && typeof invoke === 'function') {
        const comfyuiPath = project.apiSettings.comfyuiPath || 'G:\\apps\\all_comfyui_installer\\ComfyUI';
        await invoke('clear_comfyui_logs', { comfyuiPath });
      }
    } catch (e) {
      console.error("Error clearing logs:", e);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        let loaded = await loadProjectFromDB();
        
        if (!loaded) {
           // Fallback/Migration from localStorage
           try {
             const local = localStorage.getItem(STORAGE_KEY);
             if (local) {
               loaded = JSON.parse(local);
             }
           } catch (e) { console.error("Local storage error", e); }
        }

        if (loaded) {
           // Deep merge logic
           setProject(prev => ({
             ...DEFAULT_PROJECT,
             ...loaded,
             initialized: true, // Force true to bypass wizard GUI entirely
             assetState: (() => {
               const merged = { ...DEFAULT_PROJECT.assetState, ...loaded.assetState };

               // El prompt negativo paso de ser un campo unico a dos, uno por
               // modo. Un proyecto guardado antes del cambio solo trae el
               // antiguo: si no se migra, el negativo que el usuario habia
               // escrito desaparece y lo sustituyen los valores de fabrica.
               const legacy = loaded.assetState?.negativePrompt;
               const hasSplit =
                 loaded.assetState?.spriteNegativePrompt !== undefined ||
                 loaded.assetState?.worldNegativePrompt !== undefined;

               if (legacy && !hasSplit) {
                 merged.spriteNegativePrompt = legacy;
                 merged.worldNegativePrompt = legacy;
               }

               return merged;
             })(),
             animationState: { ...DEFAULT_PROJECT.animationState, ...loaded.animationState },
             narrativeState: { ...DEFAULT_PROJECT.narrativeState, ...loaded.narrativeState },
             audioState: (() => {
                const defaultAudio = DEFAULT_PROJECT.audioState;
                const loadedAudio = loaded.audioState || {};
                
                if ('sfx' in loadedAudio && 'music' in loadedAudio) {
                  return {
                    ...defaultAudio,
                    ...loadedAudio,
                    sfx: { ...defaultAudio.sfx, ...loadedAudio.sfx },
                    music: { ...defaultAudio.music, ...loadedAudio.music }
                  };
                }
                
                const category = loadedAudio.category || 'sfx';
                const flatData = {
                  title: loadedAudio.title ?? '',
                  prompt: loadedAudio.prompt ?? '',
                  lyrics: loadedAudio.lyrics ?? '',
                  language: loadedAudio.language ?? 'ES',
                  isInstrumental: loadedAudio.isInstrumental ?? true,
                  genre: loadedAudio.genre ?? '',
                  style: loadedAudio.style ?? '',
                  singerGender: loadedAudio.singerGender ?? null,
                  duration: loadedAudio.duration ?? (category === 'sfx' ? 2 : 60),
                  injectDuration: loadedAudio.injectDuration ?? true,
                  bpm: loadedAudio.bpm ?? 110,
                  audioUrl: loadedAudio.audioUrl ?? null,
                  isSoundscape: loadedAudio.isSoundscape ?? false,
                };
                
                return {
                  category,
                  sfx: category === 'sfx' ? flatData : { ...defaultAudio.sfx },
                  music: category === 'music' ? flatData : { ...defaultAudio.music }
                };
              })(),
             codeState: { ...DEFAULT_PROJECT.codeState, ...loaded.codeState },
             npcsState: loaded.npcsState ? { ...DEFAULT_PROJECT.npcsState, ...loaded.npcsState } : DEFAULT_PROJECT.npcsState,
             // Handle migration of old apiSettings if necessary
             apiSettings: loaded.apiSettings && 'text' in loaded.apiSettings 
                ? {
                    ...DEFAULT_PROJECT.apiSettings,
                    ...loaded.apiSettings,
                    text: {
                      ...DEFAULT_PROJECT.apiSettings.text,
                      ...(loaded.apiSettings.text || {}),
                      apiKeys: {
                        ...(DEFAULT_PROJECT.apiSettings.text?.apiKeys || {}),
                        [loaded.apiSettings.text?.provider || 'ollama']: loaded.apiSettings.text?.apiKey || '',
                        ...(loaded.apiSettings.text?.apiKeys || {})
                      }
                    },
                    image: {
                      ...DEFAULT_PROJECT.apiSettings.image,
                      ...(loaded.apiSettings.image || {}),
                      apiKeys: {
                        ...(DEFAULT_PROJECT.apiSettings.image?.apiKeys || {}),
                        [loaded.apiSettings.image?.provider || 'comfyui']: loaded.apiSettings.image?.apiKey || '',
                        ...(loaded.apiSettings.image?.apiKeys || {})
                      }
                    },
                    worldWorkflows: {
                       a: {
                         ...DEFAULT_PROJECT.apiSettings.worldWorkflows.a,
                         ...(loaded.apiSettings.worldWorkflows?.a || {})
                       },
                       b: {
                         ...DEFAULT_PROJECT.apiSettings.worldWorkflows.b,
                         ...(loaded.apiSettings.worldWorkflows?.b || {})
                       },
                       c: {
                         ...DEFAULT_PROJECT.apiSettings.worldWorkflows.c,
                         ...(loaded.apiSettings.worldWorkflows?.c || {})
                       }
                     },
                    video: {
                      ...DEFAULT_PROJECT.apiSettings.video,
                      ...(loaded.apiSettings.video || {}),
                      apiKeys: {
                        ...(DEFAULT_PROJECT.apiSettings.video?.apiKeys || {}),
                        [loaded.apiSettings.video?.provider || 'comfyui']: loaded.apiSettings.video?.apiKey || '',
                        ...(loaded.apiSettings.video?.apiKeys || {})
                      }
                    },
                    audio: {
                       ...DEFAULT_PROJECT.apiSettings.audio,
                       ...(loaded.apiSettings.audio || {}),
                       ttsProvider: loaded.apiSettings.audio?.ttsProvider === 'vibevoice' 
                         ? 'suno' 
                         : (loaded.apiSettings.audio?.ttsProvider || 'local'),
                       apiKeys: {
                         ...(DEFAULT_PROJECT.apiSettings.audio?.apiKeys || {}),
                         [loaded.apiSettings.audio?.ttsProvider === 'vibevoice' ? 'suno' : (loaded.apiSettings.audio?.ttsProvider || 'local')]: loaded.apiSettings.audio?.apiKey || '',
                         [loaded.apiSettings.audio?.musicProvider || 'local']: loaded.apiSettings.audio?.apiKey || '',
                         ...(loaded.apiSettings.audio?.apiKeys || {})
                       }
                     },
                    npcs: {
                      ...DEFAULT_PROJECT.apiSettings.npcs,
                      ...(loaded.apiSettings.npcs || {}),
                      apiKeys: {
                        ...(DEFAULT_PROJECT.apiSettings.npcs?.apiKeys || {}),
                        [loaded.apiSettings.npcs?.provider || 'ollama']: loaded.apiSettings.npcs?.apiKey || '',
                        ...(loaded.apiSettings.npcs?.apiKeys || {})
                      }
                    },
                    code: {
                      ...DEFAULT_PROJECT.apiSettings.code,
                      ...(loaded.apiSettings.code || {}),
                      apiKeys: {
                        ...(DEFAULT_PROJECT.apiSettings.code?.apiKeys || {}),
                        [loaded.apiSettings.code?.provider || 'ollama']: loaded.apiSettings.code?.apiKey || '',
                        ...(loaded.apiSettings.code?.apiKeys || {})
                      }
                    },
                    threeD: {
                      ...DEFAULT_PROJECT.apiSettings.threeD,
                      ...(loaded.apiSettings.threeD || {}),
                      apiKeys: {
                        ...(DEFAULT_PROJECT.apiSettings.threeD?.apiKeys || {}),
                        [loaded.apiSettings.threeD?.provider || 'tripo']: loaded.apiSettings.threeD?.apiKey || '',
                        ...(loaded.apiSettings.threeD?.apiKeys || {})
                      }
                    },
                    promptEngineer: loaded.apiSettings.promptEngineer 
                       ? { ...DEFAULT_PROJECT.apiSettings.promptEngineer, ...loaded.apiSettings.promptEngineer } 
                       : DEFAULT_PROJECT.apiSettings.promptEngineer,
                    enabledTabs: loaded.apiSettings.enabledTabs 
                       ? { ...DEFAULT_PROJECT.apiSettings.enabledTabs, ...loaded.apiSettings.enabledTabs } 
                       : DEFAULT_PROJECT.apiSettings.enabledTabs,
                    comfyuiPath: loaded.apiSettings.comfyuiPath !== undefined 
                       ? loaded.apiSettings.comfyuiPath 
                       : DEFAULT_PROJECT.apiSettings.comfyuiPath,
                    autoFreeMemoryAfterGeneration: loaded.apiSettings.autoFreeMemoryAfterGeneration !== undefined
                       ? loaded.apiSettings.autoFreeMemoryAfterGeneration
                       : DEFAULT_PROJECT.apiSettings.autoFreeMemoryAfterGeneration,
                  } 
                : DEFAULT_PROJECT.apiSettings,
              threeDState: loaded.threeDState 
                ? { ...DEFAULT_PROJECT.threeDState, ...loaded.threeDState } 
                : DEFAULT_PROJECT.threeDState,
            }));
        }
      } catch (e) {
        console.error("Init error", e);
      } finally {
        setIsLoaded(true);
      }
    };
    init();
  }, []);

  /**
   * Autoguardado del proyecto SIN los assets.
   *
   * Se dispara con cada cambio -incluida cada tecla escrita en un prompt- asi
   * que tiene que ser barato. Antes arrastraba todas las imagenes en base64:
   * con 100 assets eran ~66 MB reescritos por pulsacion.
   */
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      saveProjectToDB(project).catch(e => console.error("DB Save failed", e));
    }, 1000);
    return () => clearTimeout(timer);
  }, [project, isLoaded]);

  // SEGURIDAD (auditoría 2026-07-20): clona el proyecto y elimina las API keys
  // (apiKey, apiKeys, comfyDeployApiKey, ttsComfyDeployApiKey, etc.) para exportación segura.
  // Además elimina la media base64 pesada (data URLs > 20 KB) para que el JSON exportado
  // sea ligero y compartible: los assets completos viven en IndexedDB del equipo.
  const stripApiKeysFromProject = (proj: ProjectData): ProjectData => {
    const clone = JSON.parse(JSON.stringify(proj));
    const scrub = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (/apikey/i.test(key)) {
          obj[key] = (typeof val === 'object' && val !== null) ? {} : '';
        } else {
          scrub(val);
        }
      }
    };
    scrub(clone);
    return clone;
  };
  /**
   * Autoguardado de los assets, en su propio almacen.
   *
   * Depende solo de `project.assets`, de modo que escribir en un campo de
   * texto no lo despierta. Se escribe al generar, al borrar y al restaurar,
   * que es cuando de verdad cambian.
   */
  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      saveAssetsToDB(project.assets).catch(e => console.error("Assets save failed", e));
    }, 1000);
    return () => clearTimeout(timer);
  }, [project.assets, isLoaded]);

  const handleSave = async () => {
    try {
      let includeKeys = true;
      const isWebCheck = typeof window !== 'undefined' && ((window as any).__OMNI_IS_WEB__ === true || !((window as any).__TAURI_INTERNALS__?.invoke));
      if (!isWebCheck && invoke && typeof invoke === 'function') {
        const dialogResult = await invoke<string>('plugin:dialog|message', {
          message: '¿Incluir tus API keys en el archivo exportado?\n\n• INCLUIR CLAVES = solo si el archivo es para tu uso personal\n• EXPORTAR SIN CLAVES = recomendado si vas a compartir el archivo',
          title: '🔒 SEGURIDAD DE TUS CLAVES',
          kind: 'warning',
          buttons: { OkCancelCustom: ['Incluir claves', 'Exportar sin claves'] },
        }).catch(() => 'Cancel');
        includeKeys = dialogResult === 'Ok';
      }
      const projectToSave = includeKeys ? project : stripApiKeysFromProject(project);

      // Empaquetar todos los mundos de Creador 2D dentro del archivo unico del proyecto
      let creador2dWorlds: any[] = [];
      try {
        const client = getServices().client;
        const worlds = await client.listWorlds().catch(() => []);
        const exports = await Promise.all(
          worlds.map((w) => client.exportWorld(w.id).catch(() => null))
        );
        creador2dWorlds = exports.filter(Boolean);
      } catch (e) {
        console.warn('[Save] No se pudieron empaquetar los mundos 2D:', e);
      }

      // Convertir cualquier URL HTTP o ruta local de assets a Base64 portatil
      const base64Assets = await processAssetsBase64(projectToSave.assets || []);
      const projectWithBase64Assets = {
        ...projectToSave,
        assets: base64Assets,
      };

      const fullSaveData = {
        ...projectWithBase64Assets,
        creador2dWorlds,
      };

      // Cifrado y empaquetado binario AES-256-GCM (.omni) vinculado a la cuenta y licencia del usuario
      const activeEmail = readStoredEmail() || '';
      const activeLicense = readStoredToken() || '';
      const omniBinary = await exportarProyectoOmni(fullSaveData, activeEmail, activeLicense);
      const filename = `${project.name.replace(/\s+/g, '_')}.omni`;

      const isWeb = typeof window !== 'undefined' && ((window as any).__OMNI_IS_WEB__ === true || !((window as any).__TAURI_INTERNALS__?.invoke));

      if (isWeb || !invoke || typeof invoke !== 'function') {
        const blob = new Blob([omniBinary], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      // En Tauri/Desktop enviamos el binario codificado en base64
      const binaryBase64 = btoa(String.fromCharCode(...omniBinary));
      const result = await invoke('save_project_file', {
        content: binaryBase64,
        filename,
      });

      if (result && typeof result === 'string' && result.includes('con éxito')) {
        // Opcional: mostrar notificación o alert
      }
    } catch (e) {
      console.error('Save failed', e);
      alert('Error al guardar el proyecto cifrado .omni.');
    }
  };

  const handleOpen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          if (!arrayBuffer) {
            throw new Error('Error al leer el archivo.');
          }

          const activeEmail = readStoredEmail() || '';
          const activeLicense = readStoredToken() || '';

          let data: any = null;
          if (esArchivoOmni(arrayBuffer)) {
            // Formato binario cifrado .omni vinculado a usuario/licencia
            data = await importarProyectoOmni(arrayBuffer, activeEmail, activeLicense);
          } else {
            // Retrocompatibilidad con archivos legados .json
            const textContent = new TextDecoder('utf-8').decode(arrayBuffer);
            data = JSON.parse(textContent);
          }

          if (!data || typeof data !== 'object') {
            throw new Error('Formato de proyecto inválido.');
          }

          const rawAssets = Array.isArray(data.assets) ? data.assets : [];
          // Consultar assets guardados previamente en IndexedDB local para recuperar imagenes si vienen vacias ("") en el JSON
          const dbProject = await loadProjectFromDB().catch(() => null);
          const dbAssetsMap = new Map<string, string>();
          if (dbProject && Array.isArray(dbProject.assets)) {
            for (const a of dbProject.assets) {
              if (a?.id && a?.imageUrl && a.imageUrl.trim() !== '') {
                dbAssetsMap.set(a.id, a.imageUrl);
              }
            }
          }

          const mergedAssets = await Promise.all(
            rawAssets.map(async (asset: any) => {
              if (!asset) return asset;
              let imgUrl = asset.imageUrl;
              if (!imgUrl || typeof imgUrl !== 'string' || imgUrl.trim() === '') {
                if (dbAssetsMap.has(asset.id)) {
                  imgUrl = dbAssetsMap.get(asset.id);
                }
              }
              const finalUrl = await ensureAssetBase64(imgUrl);
              return { ...asset, imageUrl: finalUrl };
            })
          );

          const mergedProject: ProjectData = {
            ...DEFAULT_PROJECT,
            ...data,
            initialized: true,
            assets: mergedAssets,
            assetState: {
              ...DEFAULT_PROJECT.assetState,
              ...(data.assetState || {}),
            },
            animationState: {
              ...DEFAULT_PROJECT.animationState,
              ...(data.animationState || {}),
            },
            narrativeState: {
              ...DEFAULT_PROJECT.narrativeState,
              ...(data.narrativeState || {}),
            },
            audioState: {
              ...DEFAULT_PROJECT.audioState,
              ...(data.audioState || {}),
            },
            apiSettings: {
              ...DEFAULT_PROJECT.apiSettings,
              ...(data.apiSettings || {}),
            },
            codeState: {
              ...DEFAULT_PROJECT.codeState,
              ...(data.codeState || {}),
            },
            npcsState: {
              ...DEFAULT_PROJECT.npcsState,
              ...(data.npcsState || {}),
            },
          };

          // Restaurar automaticamente los mundos de Creador 2D desde el archivo unico de proyecto
          if (Array.isArray(data.creador2dWorlds) && data.creador2dWorlds.length > 0) {
            const client = getServices().client;
            for (const worldExport of data.creador2dWorlds) {
              if (!worldExport) continue;
              try {
                await client.importWorld(worldExport);
              } catch (err) {
                console.warn('Advertencia restaurando mundo 2D individual:', err);
              }
            }
          }

          await saveAssetsToDB(mergedAssets);
          await saveProjectToDB(mergedProject);
          setProject(mergedProject);
        } catch (err: any) {
          console.error('Error al abrir el proyecto:', err);
          const msg = err?.message || 'Error al abrir el proyecto .omni. El archivo está dañado o no es válido.';
          alert(msg);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    setProject({ ...DEFAULT_PROJECT, id: Date.now().toString() });
    setShowDeleteConfirm(false);
  };

  const updateProject = (updates: Partial<ProjectData>) => {
    setProject(prev => ({ ...prev, ...updates }));
  };

  const updateAssetState = (updates: Partial<ProjectData['assetState']>) => {
    setProject(prev => ({ ...prev, assetState: { ...prev.assetState, ...updates } }));
  };

  const updateAnimationState = (updates: Partial<ProjectData['animationState']>) => {
    setProject(prev => ({ ...prev, animationState: { ...prev.animationState, ...updates } }));
  };

  const updateNarrativeState = (updates: Partial<ProjectData['narrativeState']>) => {
    setProject(prev => ({ ...prev, narrativeState: { ...prev.narrativeState, ...updates } }));
  };

  const updateAudioState = (updates: Partial<ProjectData['audioState']>) => {
    setProject(prev => ({ ...prev, audioState: { ...prev.audioState, ...updates } }));
  };

  const updateApiSettings = (updates: Partial<ProjectData['apiSettings']>) => {
    setProject(prev => ({ ...prev, apiSettings: { ...prev.apiSettings, ...updates } }));
  };

  const updateCodeState = (updates: Partial<ProjectData['codeState']>) => {
    setProject(prev => ({ ...prev, codeState: { ...prev.codeState, ...updates } }));
  };

  const updateNpcState = (updates: Partial<ProjectData['npcsState']>) => {
    setProject(prev => ({ 
      ...prev, 
      npcsState: prev.npcsState 
        ? { ...prev.npcsState, ...updates } as any
        : { npcs: [], activeNpcId: null, chatInput: '', isGenerating: false, ...updates } as any
    }));
  };

  const updateThreeDState = (updates: Partial<ProjectData['threeDState']>) => {
    setProject(prev => ({
      ...prev,
      threeDState: prev.threeDState
        ? { ...prev.threeDState, ...updates }
        : {
            activeSubTab: '3d_gen_texturizing',
            nestedTab: '3d_gen',
            prompt: '',
            negativePrompt: '',
            referenceImage: null,
            useConsistency: true,
            resultModelUrl: null,
            resultModelType: null,
            isGenerating: false,
            progressText: '',
            ...updates
          }
    }));
  };

  const handleLogin = useCallback(() => setIsAuthenticated(true), []);

  if (!authChecked) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400">
        <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-700 shadow-lg mb-4">
          <img src="./logo.jpg" alt="Logo" className="w-full h-full object-cover" />
        </div>
        <div className="text-sm animate-pulse">Verificando sesión...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthScreen
        onLogin={handleLogin}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-200">
      {/* Navbar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900 flex items-center justify-between px-6 shadow-2xl relative z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-700 shadow-lg">
              <img src="./logo.jpg" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-wider text-slate-100 font-cinzel flex items-center gap-2">
                Omni IA Game <span className="text-xs text-cyan-400 font-sans normal-case font-bold bg-cyan-950/40 border border-cyan-800/60 px-2.5 py-0.5 rounded-full shadow-inner">v{CURRENT_VERSION}</span>
              </h1>
              <p className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">Plataforma local de IA para videojuegos v{CURRENT_VERSION}</p>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-800"></div>

          <div className="flex items-center gap-2">
            <input 
              type="text" 
              value={project.name}
              onChange={(e) => updateProject({ name: e.target.value })}
              className="bg-slate-950 border border-slate-800 text-xs font-mono px-3 py-1.5 rounded text-blue-300 focus:border-blue-500 outline-none w-48"
              placeholder="Nombre del Proyecto"
            />
            <div className="flex gap-1">
              <button 
                onClick={() => {
                  console.log("Settings button clicked");
                  setIsSettingsOpen(true);
                }}
                className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-blue-400 transition-colors"
                title="Configuración de API"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button onClick={handleSave} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-blue-400 transition-colors" title="Guardar Proyecto">
                <Save className="w-4 h-4" />
              </button>
              <label className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-green-400 transition-colors cursor-pointer" title="Abrir Proyecto (.omni)">
                <FolderOpen className="w-4 h-4" />
                <input type="file" accept=".omni,.json" onChange={handleOpen} className="hidden" />
              </label>
              <button onClick={handleDelete} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 transition-colors" title="Borrar Proyecto">
                <Trash2 className="w-4 h-4" />
              </button>

              {/* Distintivo de Actualización In-App */}
              {updateManifest?.hasUpdate && (
                <button
                  onClick={() => setIsUpdateModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-full shadow-lg shadow-purple-950/50 transition-all hover:scale-105 animate-pulse ml-2"
                  title="Nueva actualización disponible para Omni IA Game"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Actualización v{updateManifest.version}</span>
                </button>
              )}
              
              {/* Toggle Global de Tooltips/Ayudas */}
              <div className="flex items-center gap-1.5 ml-2 border-l border-slate-800 pl-3">
                <button 
                  onClick={() => updateProject({ showTooltips: !(project.showTooltips ?? true) })}
                  className={`p-1.5 rounded transition-all flex items-center gap-1.5 text-xs font-mono font-bold border ${
                    (project.showTooltips ?? true)
                      ? 'bg-blue-950/40 text-blue-400 border-blue-800/60 shadow-[0_0_10px_rgba(59,130,246,0.1)] hover:bg-blue-900/40'
                      : 'bg-slate-950 text-slate-500 border-slate-800/80 hover:text-slate-400 hover:border-slate-700'
                  }`}
                  title={(project.showTooltips ?? true) ? "Desactivar ayudas contextuales (Tooltips)" : "Activar ayudas contextuales (Tooltips)"}
                >
                  <HelpCircle className={`w-4 h-4 transition-transform duration-300 ${(project.showTooltips ?? true) ? 'rotate-0 scale-100 text-blue-400' : 'rotate-12 scale-95 text-slate-500'}`} />
                  <span className="text-[10px] tracking-wider uppercase font-bold">Ayudas</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <Tooltip id="tabAssets" showTooltips={project.showTooltips ?? true} position="bottom" inline>
            <button
              onClick={() => setCurrentTab(TabView.ASSETS)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-bold ${
                currentTab === TabView.ASSETS 
                  ? 'bg-slate-800 text-blue-400 shadow-md' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Box className="w-4 h-4" />
              ASSETS
            </button>
          </Tooltip>

          {premiumUnlocked && project.apiSettings.enabledTabs?.animation !== false && (
            <Tooltip id="tabAnimation" showTooltips={project.showTooltips ?? true} position="bottom" inline>
              <button
                onClick={() => setCurrentTab(TabView.ANIMATION)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-bold ${
                  currentTab === TabView.ANIMATION 
                    ? 'bg-slate-800 text-purple-400 shadow-md' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Activity className="w-4 h-4" />
                ANIMACIÓN
              </button>
            </Tooltip>
          )}

          <Tooltip id="tabNarrative" showTooltips={project.showTooltips ?? true} position="bottom" inline>
            <button
              onClick={() => setCurrentTab(TabView.NARRATIVE)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-bold ${
                currentTab === TabView.NARRATIVE 
                  ? 'bg-slate-800 text-indigo-400 shadow-md' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <ScrollText className="w-4 h-4" />
              NARRATIVA
            </button>
          </Tooltip>

          {premiumUnlocked && project.apiSettings.enabledTabs?.npcs !== false && (
            <Tooltip id="tabNpcs" showTooltips={project.showTooltips ?? true} position="bottom" inline>
              <button
                onClick={() => setCurrentTab(TabView.NPCS)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-bold ${
                  currentTab === TabView.NPCS 
                    ? 'bg-slate-800 text-sky-400 shadow-md' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Users className="w-4 h-4" />
                NPCs
              </button>
            </Tooltip>
          )}

          <Tooltip id="tabScripts" showTooltips={project.showTooltips ?? true} position="bottom" inline>
            <button
              onClick={() => setCurrentTab(TabView.CODE)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-bold ${
                currentTab === TabView.CODE 
                  ? 'bg-slate-800 text-green-400 shadow-md' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Code className="w-4 h-4" />
              SCRIPTS
            </button>
          </Tooltip>
          <Tooltip id="tabAudio" showTooltips={project.showTooltips ?? true} position="bottom" inline>
            <button
              onClick={() => setCurrentTab(TabView.AUDIO)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-bold ${
                currentTab === TabView.AUDIO 
                  ? 'bg-slate-800 text-amber-400 shadow-md' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Music className="w-4 h-4" />
              AUDIO
            </button>
          </Tooltip>

          {premiumUnlocked && project.apiSettings.enabledTabs?.threeD !== false && (
            <Tooltip id="tabThreeD" showTooltips={project.showTooltips ?? true} position="bottom" inline>
              <button
                onClick={() => setCurrentTab(TabView.THREE_D)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-bold ${
                  currentTab === TabView.THREE_D 
                    ? 'bg-slate-800 text-purple-400 shadow-md border border-purple-500/20' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Box className="w-4 h-4 text-purple-400" />
                SUITE 3D
              </button>
            </Tooltip>
          )}

          <div className="ml-2 border-l border-slate-800 pl-2 flex items-center gap-2">
            <span
              className="max-w-[180px] truncate text-[11px] font-mono text-slate-400 bg-slate-950 border border-slate-800 rounded px-2 py-1"
              title="Sesión activa"
            >
              {readStoredEmail() || 'usuario'}
            </span>
            <button
              onClick={() => {
                clearStoredAuth();
                setIsAuthenticated(false);
                setLicenseDetails(null);
                setLicenseOnline({ checked: true, valid: false });
                if (hayEntornoTauri()) {
                  invoke('save_license_key', { licenseKey: '' }).catch(() => {});
                }
              }}
              className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 transition-colors"
              title="Cerrar sesión"
            >
              <Power className="w-4 h-4" />
            </button>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        
        {currentTab === TabView.ASSETS && (
          <AssetGenerator 
            assets={project.assets} 
            setAssets={(assets) => updateProject({ assets: typeof assets === 'function' ? assets(project.assets) : assets })} 
            state={project.assetState}
            updateState={updateAssetState}
            apiSettings={project.apiSettings}
            showTooltips={project.showTooltips ?? true}
            creador2dUnlocked={creador2dUnlocked}
          />
        )}
        {currentTab === TabView.ANIMATION && (
          <AnimationStudio 
            assets={project.assets} 
            state={project.animationState}
            updateState={updateAnimationState}
            apiSettings={project.apiSettings}
            showTooltips={project.showTooltips ?? true}
          />
        )}
        {currentTab === TabView.NARRATIVE && (
          <NarrativeGenerator 
            state={project.narrativeState}
            updateState={updateNarrativeState}
            apiSettings={project.apiSettings}
            showTooltips={project.showTooltips ?? true}
          />
        )}
        {currentTab === TabView.CODE && (
          <CodeAssistant 
            state={project.codeState}
            updateState={updateCodeState}
            apiSettings={project.apiSettings}
            showTooltips={project.showTooltips ?? true}
          />
        )}
        {currentTab === TabView.AUDIO && (
          <AudioDesigner 
            state={project.audioState}
            updateState={updateAudioState}
            apiSettings={project.apiSettings}
            showTooltips={project.showTooltips ?? true}
          />
        )}
        {currentTab === TabView.NPCS && (
          <NPCStudio 
            state={project.npcsState}
            updateState={updateNpcState}
            apiSettings={project.apiSettings}
            showTooltips={project.showTooltips ?? true}
          />
        )}
        {currentTab === TabView.THREE_D && (
          <ThreeDStudio 
            state={project.threeDState}
            updateState={updateThreeDState}
            apiSettings={project.apiSettings}
            showTooltips={project.showTooltips ?? true}
            assets={project.assets}
          />
        )}

      </main>

      {/* Footer / Status Bar */}
      <footer className="h-8 bg-black border-t border-slate-900 flex items-center justify-between px-4 text-xs font-mono text-slate-600 select-none">
        <div className="flex gap-4 items-center">
           <span className="flex items-center gap-1.5">
             SISTEMA: <span className="text-green-500">EN LÍNEA</span>
           </span>
           <div className="h-3 w-px bg-slate-800"></div>
           <span className="flex items-center gap-1.5">
             <span className="uppercase text-slate-400 font-bold">{services.textProvider}:</span>
             {services.textStatus === 'ready' && (
               <span className="text-green-500 flex items-center gap-1">
                 <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                 LISTO {services.textModelName ? `(${services.textModelName})` : ''}
               </span>
             )}
             {services.textStatus === 'loading' && (
               <span className="text-amber-400 flex items-center gap-1 font-bold animate-pulse">
                 <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                 CARGANDO EN VRAM...
               </span>
             )}
              {services.textStatus === 'configured' && (
                <span className="text-green-400">
                  {services.textProvider === 'omnideploy' ? 'LISTO (OMNIDEPLOY)' : 'LISTO (NUBE)'}
                </span>
              )}
             {services.textStatus === 'missing_key' && (
               <span className="text-amber-400">SIN API KEY</span>
             )}
             {services.textStatus === 'offline' && (
               <span className="text-red-500">DESCONECTADO</span>
             )}
           </span>
           <span className="flex items-center gap-1.5">
             COMFYUI: <span className={services.comfyui ? "text-green-500" : "text-red-500"}>
               {services.comfyui ? "LISTO" : "DESCONECTADO"}
             </span>
             {services.comfyui || isLaunching ? (
                <Tooltip id="comfyStop" showTooltips={project.showTooltips ?? true} position="top" inline>
                  <button
                    onClick={handleStopComfyUI}
                    className="ml-1 px-1.5 py-0.5 bg-red-900/30 hover:bg-red-800/50 text-red-400 border border-red-800 rounded flex items-center gap-1 transition-colors"
                    title="Forzar cierre (Detener Proceso)"
                  >
                    <Power className="w-3 h-3" /> DETENER
                  </button>
                </Tooltip>
              ) : (
                <Tooltip id="comfyLaunch" showTooltips={project.showTooltips ?? true} position="top" inline>
                  <button
                    onClick={handleLaunchComfyUI}
                    disabled={isLaunching}
                    className={`ml-1 px-1.5 py-0.5 border rounded flex items-center gap-1 transition-all ${
                      isLaunching
                        ? "bg-blue-900/50 text-blue-300 border-blue-700 animate-launch-glow cursor-wait"
                        : "bg-blue-900/30 hover:bg-blue-800/50 text-blue-400 border-blue-800"
                    }`}
                  >
                    {isLaunching ? <Zap className="w-3 h-3 animate-pulse" /> : <Power className="w-3 h-3" />}
                    {isLaunching ? "INICIANDO..." : "INICIAR"}
                  </button>
                </Tooltip>
              )}
              <Tooltip id="comfyConsole" showTooltips={project.showTooltips ?? true} position="top" inline>
                <button 
                  onClick={() => setShowConsole(!showConsole)}
                  className={`ml-2 px-1.5 py-0.5 border rounded flex items-center gap-1 transition-all ${
                    showConsole ? "bg-slate-700 text-amber-400 border-amber-600" : "bg-slate-900/30 hover:bg-slate-800/50 text-slate-400 border-slate-800"
                  }`}
                  title="Ver Consola de Salida"
                >
                  <Terminal className="w-3 h-3" /> CONSOLA
                </button>
              </Tooltip>
           </span>
        </div>
        <div className="flex gap-4 items-center">
           {licenseOnline.checked && !licenseOnline.valid && (
             <div className="flex items-center gap-1 bg-red-950/60 px-2 py-0.5 rounded border border-red-700/50 text-red-400 font-bold text-[9px] tracking-wider font-mono" title={licenseOnline.reason}>
               <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
               LICENCIA BLOQUEADA: {licenseOnline.reason}
             </div>
           )}
           {licenseDetails && licenseDetails.is_licensed && (
             <div className="flex items-center gap-1 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-900/30 text-purple-400 font-bold text-[9px] tracking-wider font-mono">
               <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
               LICENCIA: {getRemainingTimeString(licenseDetails)}
             </div>
           )}
           <span>PROYECTO: {project.name.toUpperCase()}</span>
           <span>MOTOR: MULTIPLATAFORMA</span>
           <span className="text-blue-500 opacity-50">NÚCLEO_IA: MODO_HÍBRIDO</span>
        </div>
      </footer>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        settings={project.apiSettings} 
        updateSettings={updateApiSettings} 
        showTooltips={project.showTooltips ?? true}
        estadoServidor={licenseOnline.estado}
        isComfyRunning={services.comfyui}
        isLaunchingComfy={isLaunching}
        onLaunchComfy={handleLaunchComfyUI}
        onStopComfy={handleStopComfyUI}
        creador2dLicensed={creador2dLicensed}
        licenseOnline={licenseOnline}
        premiumUnlocked={premiumUnlocked}
        comfyLogs={consoleLogs}
        onClearLogs={handleClearLogs}
      />
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-white mb-4">¿Borrar proyecto?</h3>
            <p className="text-slate-400 mb-6">Esta acción no se puede deshacer. ¿Estás seguro?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded bg-slate-800 text-white hover:bg-slate-700">Cancelar</button>
              <button onClick={confirmDelete} className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700">Borrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Consola de ComfyUI Overlay */}
      {showConsole && (
        <div className="fixed bottom-10 left-4 right-4 h-64 bg-black/95 border border-slate-700 rounded-t-lg z-[100] flex flex-col shadow-2xl animate-in slide-in-from-bottom-4">
          <div className="bg-slate-900 px-3 py-1.5 flex items-center justify-between border-b border-slate-800 rounded-t-lg">
            <div className="flex items-center gap-2">
              <Terminal className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-widest">Consola de Salida - ComfyUI</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleClearLogs} 
                className="text-slate-500 hover:text-slate-300 p-1"
                title="Limpiar Consola"
              >
                <Trash2 className="w-3 h-3" />
              </button>
              <button onClick={() => setShowConsole(false)} className="text-slate-500 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] text-slate-300 whitespace-pre-wrap scrollbar-thin scrollbar-thumb-slate-700 bg-slate-950/50">
            {consoleLogs || "Esperando inicialización de logs..."}
          </div>
        </div>
      )}

      {/* Autoinstaladores. Cada uno se pinta solo si el usuario lo pidio en el
          instalador; en cualquier otro caso devuelven null y no estorban.
          Van ENCADENADOS, no a la vez: el de Ollama espera a que el de ComfyUI
          se cierre, porque dos ventanas modales superpuestas no se entienden. */}
      <ComfyUIInstaller
        onInstalado={(ruta) => updateApiSettings({ comfyuiPath: ruta })}
        onCerrado={() => setComfyResuelto(true)}
      />
      {comfyResuelto && (
        <OllamaInstaller
          onModeloListo={(modelo) => {
            updateApiSettings({
              ollama: { ...project.apiSettings.ollama, model: modelo },
              text: { ...project.apiSettings.text, provider: 'ollama', model: modelo },
              npcs: { ...project.apiSettings.npcs, provider: 'ollama', model: modelo },
            });
          }}
        />
      )}
      {comfyResuelto && (
        <LlamaModelInstaller
          onModeloListo={(ruta) => {
            console.log('[Omni IA Game] Modelo local GGUF inicial listo en:', ruta);
          }}
        />
      )}

      {/* Modal de Actualización In-App */}
      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => {
          sessionStorage.setItem('omni_update_dismissed', '1');
          setIsUpdateModalOpen(false);
        }}
        updateData={updateManifest || { hasUpdate: false, version: '0.2.8', notes: [], url: '' }}
        showTooltips={project.showTooltips}
      />
    </div>
  );
};

export default App;
