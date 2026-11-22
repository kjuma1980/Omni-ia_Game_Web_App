/**
 * ---------------------------------------------------------------------------
 *  Ventana Flotante del Agente Fénix (components/FenixAgentWindow.tsx)
 * ---------------------------------------------------------------------------
 *  Ventana interactiva arrastrable (draggable), minimizable y reactiva:
 *  - Avatar animado con halo de emociones y sincronización labial (lip-sync).
 *  - Chat bimodal: texto y voz (STT micrófono y TTS altavoz).
 *  - Tarjetas interactivas de herramientas MCP (prompts, scripts, planes).
 *  - Soporte de modo Co-Piloto Multi-Agente simultáneo.
 * ---------------------------------------------------------------------------
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Send, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Square,
  Minus, 
  X, 
  Settings, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Check, 
  Bot, 
  User, 
  Cpu, 
  Wrench, 
  Gamepad2, 
  Palette, 
  Code2, 
  Music,
  Headphones,
  FileText,
  Radio,
  Download,
  FolderDown
} from 'lucide-react';
import { FenixAgentConfig, FenixChatMessage, FenixEmotion, GeneratedAsset } from '../types';
import { 
  getFenixMessages, 
  saveFenixMessage, 
  clearFenixMessages, 
  saveFenixConfig,
  getFenixConfig
} from '../services/fenixDb';
import { generateFenixResponse } from '../services/fenixBrain';
import { enviarJsonLocal } from '../services/localService';
import { isTtsServerAlive, ensureTtsServerRunning } from '../services/ttsService';

interface FenixAgentWindowProps {
  config: FenixAgentConfig;
  onUpdateConfig: (updated: Partial<FenixAgentConfig>) => void;
  onOpenSettings: (initialTab?: string) => void;
  onClose: () => void;
  projectContext: {
    projectName?: string;
    projectId?: string;
    assetCount?: number;
    currentTab?: string;
    apiSettings?: any;
    assetState?: any;
    animationState?: any;
  };
  apiSettings?: any;
  onSendPromptToStudio?: (
    prompt: string,
    negativePrompt?: string,
    style?: string,
    action?: string,
    autoRemoveBackground?: boolean,
    spriteName?: string,
    spriteBgMode?: 'white' | 'chromakey' | 'transparent'
  ) => void;
  onSaveAsset?: (asset: GeneratedAsset) => void;
}

/**
 * Sanitizador exhaustivo para TTS:
 * - Elimina emojis y pictogramas Unicode (evita que Edge TTS y Piper lean "cara sonriente", "cohete", etc.)
 * - Elimina acotaciones teatrales de IA (*sonríe*, *pensativo*, (pausa), etc.)
 * - Elimina tags de emoción ([EMOTION: happy]) y bloques de código o tool_calls
 * - Limpia símbolos markdown (*, #, `, ~, >, |, etc.) para dejar un lenguaje hablado natural
 */
export const cleanSpeechForTTS = (text: string): string => {
  if (!text) return '';

  let clean = text;

  // 1. Quitar etiquetas de emoción y bloques de código/herramientas
  clean = clean.replace(/\[EMOTION:\s*[a-zA-Z_-]+\]/gi, '');
  clean = clean.replace(/```tool_call[\s\S]*?```/gi, '');
  clean = clean.replace(/```[\s\S]*?```/g, '');

  // 2. Conservar el texto dentro de negritas y cursivas antes de limpiar símbolos
  clean = clean.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  clean = clean.replace(/\*\*([^*]+)\*\*/g, '$1');
  clean = clean.replace(/___([^_]+)___/g, '$1');
  clean = clean.replace(/__([^_]+)__/g, '$1');

  // 3. Eliminar acotaciones teatrales y roleplay (*sonríe*, *mira la pantalla*, (pausa), etc.)
  clean = clean.replace(/\*[^*\n]{1,50}\*/g, '');
  clean = clean.replace(/\(([a-zA-ZáéíóúñÁÉÍÓÚÑ\s,]{2,35})\)/g, '');

  // 4. Eliminar EMOJIS y pictogramas Unicode
  clean = clean.replace(/\p{Extended_Pictographic}/gu, '');
  clean = clean.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '');

  // 5. Emoticones ASCII comunes
  clean = clean.replace(/(?::\)|:\(|;\)|:-D|:D|xD|XD|:P|:-P|<3)/g, '');

  // 6. Limpiar formateo markdown y caracteres especiales
  clean = clean.replace(/^#{1,6}\s+/gm, '');
  clean = clean.replace(/^[\s*+-]+(?=\S)/gm, '');
  clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  clean = clean.replace(/[`*_#~>|\\^{}[\]]/g, ' ');
  clean = clean.replace(/[-=]{2,}/g, ' ');

  // 7. Normalizar espacios
  return clean.replace(/\s+/g, ' ').trim();
};

export const FenixAgentWindow: React.FC<FenixAgentWindowProps> = ({
  config,
  onUpdateConfig,
  onOpenSettings,
  onClose,
  projectContext,
  apiSettings,
  onSendPromptToStudio,
  onSaveAsset,
}) => {
  const [messages, setMessages] = useState<FenixChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<FenixEmotion>('happy');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [continuousChat, setContinuousChat] = useState<boolean>(false);
  const [dictationOnly, setDictationOnly] = useState<boolean>(false);
  const [savedAssetIds, setSavedAssetIds] = useState<Set<string>>(new Set());
  const continuousChatRef = useRef(false);
  const dictationOnlyRef = useRef(false);
  const transcriptBufferRef = useRef('');

  const handleDownloadPng = async (base64Data: string, filename: string) => {
    const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
    if (invokeFn) {
      try {
        await invokeFn('save_image', {
          imageData: base64Data,
          defaultPath: `${filename}.png`
        });
        return;
      } catch (e) {
        console.warn('[FenixAgent] Error con save_image nativo, usando descarga web:', e);
      }
    }
    const a = document.createElement('a');
    a.href = base64Data;
    a.download = `${filename}.png`;
    a.click();
  };

  useEffect(() => {
    continuousChatRef.current = continuousChat;
  }, [continuousChat]);

  useEffect(() => {
    dictationOnlyRef.current = dictationOnly;
  }, [dictationOnly]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(config.windowPosition?.isMinimized || false);

  // Posición de la ventana flotante
  const [position, setPosition] = useState({
    x: config.windowPosition?.x ?? 80,
    y: config.windowPosition?.y ?? 80,
  });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioPlayTokenRef = useRef(0);

  // Cargar mensajes previos desde FenixAgentDB
  useEffect(() => {
    getFenixMessages().then((stored) => {
      if (stored.length > 0) {
        setMessages(stored);
      } else {
        // Mensaje inicial de bienvenida
        const welcomeMsg: FenixChatMessage = {
          id: `welcome_${Date.now()}`,
          role: 'assistant',
          content: `¡Hola! Soy **${config.name || 'Fénix'}**, tu copiloto y asesor oficial para crear videojuegos en Omni-IA Game.\n\nPuedo ayudarte a diseñar el arte de tus personajes, hojas de animación, música, efectos de sonido, documentos de diseño (GDD) o código listo para tu motor favorito. ¿En qué asset o idea de juego te gustaría que trabajemos hoy?`,
          timestamp: Date.now(),
          emotion: 'excited',
        };
        setMessages([welcomeMsg]);
        saveFenixMessage(welcomeMsg);
      }
    });
  }, [config.name]);

  // Scroll automático al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Manejo de Arrastre (Drag and Drop)
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    const maxX = Math.max(10, window.innerWidth - 420);
    const maxY = Math.max(10, window.innerHeight - 120);
    const nextX = Math.min(Math.max(10, e.clientX - dragStartRef.current.x), maxX);
    const nextY = Math.min(Math.max(10, e.clientY - dragStartRef.current.y), maxY);
    setPosition({ x: nextX, y: nextY });
  };

  const handleMouseUp = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    // Guardar posición
    onUpdateConfig({
      windowPosition: {
        ...config.windowPosition,
        x: position.x,
        y: position.y,
      },
    });
  };

  // Detener cualquier audio o síntesis de voz en curso inmediatamente
  const stopSpeaking = () => {
    // Incrementar token para invalidar cualquier petición TTS en vuelo
    audioPlayTokenRef.current++;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current.src = '';
      } catch {}
      currentAudioRef.current = null;
    }
    setIsSpeaking(false);
  };

  // Alternar y mutear voz al instante
  const handleToggleVoice = () => {
    const nextVal = !config.voiceEnabled;
    if (!nextVal) {
      stopSpeaking();
    }
    onUpdateConfig({ voiceEnabled: nextVal });
    saveFenixConfig({ voiceEnabled: nextVal });
  };

  // Síntesis de voz Web Speech (Navegador - Cero GPU)
  const fallbackBrowserSpeech = (cleanSpeech: string, activeConfig: FenixAgentConfig, token?: number) => {
    if (token !== undefined && audioPlayTokenRef.current !== token) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setIsSpeaking(false);
      return;
    }
    try {
      window.speechSynthesis.cancel();
    } catch {}

    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.lang = 'es-ES';
    utterance.rate = activeConfig.voiceSpeed || 1.0;
    utterance.pitch = activeConfig.voicePitch || 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (activeConfig.browserVoice) {
      const match = voices.find((v) => v.name === activeConfig.browserVoice);
      if (match) utterance.voice = match;
    } else {
      // Buscar mejor voz en español (priorizando naturales)
      const esVoice = voices.find(
        (v) => v.lang.startsWith('es') && (v.name.includes('Natural') || v.name.includes('Online'))
      ) || voices.find((v) => v.lang.startsWith('es'));
      if (esVoice) utterance.voice = esVoice;
    }

    utterance.onstart = () => {
      if (token !== undefined && audioPlayTokenRef.current !== token) {
        try { window.speechSynthesis.cancel(); } catch {}
        setIsSpeaking(false);
        return;
      }
      setIsSpeaking(true);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      onSpeechFinished();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      onSpeechFinished();
    };

    window.speechSynthesis.speak(utterance);
  };

  const onSpeechFinished = () => {
    setIsSpeaking(false);
    currentAudioRef.current = null;
    if (continuousChatRef.current) {
      setTimeout(() => {
        startListening();
      }, 500);
    }
  };

  // Text-To-Speech (TTS) Multimodal
  const speakText = async (text: string, overrideConfig?: FenixAgentConfig) => {
    const activeConfig = overrideConfig || config;
    if (!activeConfig.voiceEnabled) return;

    stopSpeaking();

    const currentToken = ++audioPlayTokenRef.current;
    let cleanSpeech = cleanSpeechForTTS(text);

    if (!cleanSpeech) return;

    // Protección anti-desbordamiento: Si el texto excede 750 caracteres, truncar en la última frase completa
    if (cleanSpeech.length > 750) {
      const truncated = cleanSpeech.slice(0, 750);
      const lastDot = Math.max(truncated.lastIndexOf('.'), truncated.lastIndexOf('?'), truncated.lastIndexOf('!'));
      cleanSpeech = lastDot > 200 ? truncated.slice(0, lastDot + 1) : truncated + '...';
    }

    const engine = activeConfig.ttsEngine || 'browser';

    // Motor Edge TTS o Piper TTS (puerto 5000 local)
    if (engine === 'edge-tts' || engine === 'piper') {
      try {
        const alive = await isTtsServerAlive(engine);
        if (audioPlayTokenRef.current !== currentToken) return;

        if (!alive) {
          const started = await ensureTtsServerRunning(engine);
          if (audioPlayTokenRef.current !== currentToken) return;
          if (!started) {
            fallbackBrowserSpeech(cleanSpeech, activeConfig, currentToken);
            return;
          }
        }

        const payload: Record<string, any> = {
          text: cleanSpeech,
          voice: activeConfig.edgeVoice || 'es-ES-AlvaroNeural'
        };
        const res = await enviarJsonLocal('http://127.0.0.1:5000/api/tts', payload);
        if (audioPlayTokenRef.current !== currentToken) return;

        if (res && res.audio) {
          const mime = res.format === 'wav' ? 'audio/wav' : 'audio/mp3';
          const audio = new Audio(`data:${mime};base64,${res.audio}`);
          currentAudioRef.current = audio;
          audio.playbackRate = activeConfig.voiceSpeed || 1.0;
          audio.onplay = () => {
            if (audioPlayTokenRef.current !== currentToken) {
              try { audio.pause(); } catch {}
              return;
            }
            setIsSpeaking(true);
          };
          audio.onended = () => {
            onSpeechFinished();
          };
          audio.onerror = () => {
            currentAudioRef.current = null;
            if (audioPlayTokenRef.current === currentToken) {
              fallbackBrowserSpeech(cleanSpeech, activeConfig, currentToken);
            }
          };
          await audio.play();
          return;
        }
      } catch (err) {
        console.warn(`[Fénix TTS] Servidor ${engine} en 5000 no disponible, usando voz del sistema:`, err);
        // Fallback inmediato a voz del navegador
      }
    }

    // Por defecto o Fallback: Voz del Navegador / Sistema
    if (audioPlayTokenRef.current === currentToken) {
      fallbackBrowserSpeech(cleanSpeech, activeConfig, currentToken);
    }
  };

  // Speech-To-Text (STT) y Conversación por Voz
  const startListening = () => {
    if (isLoading) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Tu navegador o entorno webview no tiene soporte para la API de reconocimiento de voz.');
      return;
    }

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
      stopSpeaking();

      const recognition = new SpeechRecognition();
      recognition.lang = 'es-ES';
      recognition.continuous = false;
      recognition.interimResults = false;
      transcriptBufferRef.current = '';

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (!transcript && event.results[0]?.[0]?.transcript) {
          transcript = event.results[0][0].transcript;
        }
        transcriptBufferRef.current = transcript.trim();
      };
      recognition.onerror = (err: any) => {
        console.warn('[FenixAgent] Error reconocimiento voz:', err?.error);
        setIsListening(false);
      };
      recognition.onend = () => {
        setIsListening(false);
        const spoken = transcriptBufferRef.current.trim();
        transcriptBufferRef.current = '';

        if (spoken) {
          if (dictationOnlyRef.current) {
            setInputValue((prev) => (prev ? `${prev} ${spoken}` : spoken));
          } else {
            handleSendMessage(spoken);
          }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('[FenixAgent] Error al iniciar reconocimiento de voz:', err);
      setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      try { recognitionRef.current?.abort(); } catch {}
      setIsListening(false);
      return;
    }
    startListening();
  };

  // Enviar Mensaje
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isLoading) return;

    stopSpeaking();
    setInputValue('');

    const userMsg: FenixChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    await saveFenixMessage(userMsg);

    setIsLoading(true);
    setCurrentEmotion('thinking');

    try {
      // Re-sincronizar siempre con la base de datos para garantizar que se usa el motor y modelo más reciente
      const freshDbConfig = await getFenixConfig();
      const effectiveConfig = { ...config, ...freshDbConfig };
      const effectiveContext = {
        ...projectContext,
        apiSettings: apiSettings || projectContext.apiSettings,
      };

      const response = await generateFenixResponse(newHistory, effectiveConfig, effectiveContext);

      setCurrentEmotion(response.emotion);

      const assistantMsg: FenixChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
        emotion: response.emotion,
        toolCalls: response.toolCalls,
      };

      const updatedHistory = [...newHistory, assistantMsg];

      // Si hubo respuesta de co-piloto secundaria
      if (response.secondaryContent) {
        const secMsg: FenixChatMessage = {
          id: `sec_${Date.now() + 1}`,
          role: 'assistant',
          content: `🛠️ **[Co-Piloto Técnico]:**\n${response.secondaryContent}`,
          timestamp: Date.now() + 1,
          emotion: 'focused',
          collaborator: 'secondary',
        };
        updatedHistory.push(secMsg);
        await saveFenixMessage(secMsg);
      }

      setMessages(updatedHistory);
      await saveFenixMessage(assistantMsg);

      // Reproducir por voz si está activado
      if (effectiveConfig.voiceEnabled) {
        speakText(response.content, effectiveConfig);
      }
    } catch (err: any) {
      console.error('[FenixAgent] Error generando respuesta:', err);
      setCurrentEmotion('sad');
    } finally {
      setIsLoading(false);
    }
  };

  // Limpiar chat
  const handleClearChat = async () => {
    stopSpeaking();
    await clearFenixMessages();
    setMessages([]);
    setCurrentEmotion('happy');
  };

  // Copiar al portapapeles
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Estilo de aura emocional para el avatar
  const getEmotionAura = (emotion: FenixEmotion) => {
    switch (emotion) {
      case 'excited':
        return 'ring-4 ring-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.8)] animate-pulse';
      case 'thinking':
        return 'ring-4 ring-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.6)]';
      case 'focused':
        return 'ring-4 ring-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.6)]';
      case 'sad':
        return 'ring-4 ring-slate-500 shadow-[0_0_15px_rgba(100,116,139,0.5)]';
      case 'celebrating':
        return 'ring-4 ring-purple-400 shadow-[0_0_30px_rgba(192,132,252,0.9)] animate-bounce';
      case 'happy':
      default:
        return 'ring-4 ring-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.6)]';
    }
  };

  // VISTA MINIMIZADA (Píldora Flotante)
  if (isMinimized) {
    return (
      <div
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        className="fixed z-50 select-none cursor-pointer flex items-center gap-3 bg-slate-900/95 border-2 border-amber-500/80 rounded-full pl-2 pr-4 py-2 shadow-[0_0_25px_rgba(245,158,11,0.4)] backdrop-blur-md transition-all hover:scale-105"
        onClick={() => {
          setIsMinimized(false);
          onUpdateConfig({ windowPosition: { ...config.windowPosition, isMinimized: false } });
        }}
        onMouseDown={handleMouseDown}
      >
        <div className={`relative w-10 h-10 rounded-full overflow-hidden ${getEmotionAura(currentEmotion)}`}>
          <img
            src={config.avatar || '/fenix_avatar_default.jpg'}
            alt="Fénix Avatar"
            className="w-full h-full object-cover"
          />
          {isSpeaking && (
            <div className="absolute inset-0 bg-amber-500/30 flex items-center justify-center animate-ping"></div>
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> {config.name || 'Fénix'}
          </span>
          <span className="text-[10px] text-slate-400">Clic para abrir</span>
        </div>
      </div>
    );
  }

  // VISTA EXPANDIDA COMPLETA
  return (
    <div
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className="fixed z-50 w-96 sm:w-[420px] h-[600px] flex flex-col bg-slate-950/95 border border-amber-500/50 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8),0_0_25px_rgba(245,158,11,0.25)] backdrop-blur-xl overflow-hidden font-sans"
    >
      {/* HEADER ARRASTRABLE */}
      <div
        onMouseDown={handleMouseDown}
        className="px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-900/90 to-amber-950/40 border-b border-amber-500/30 flex items-center justify-between cursor-move select-none"
      >
        <div className="flex items-center gap-3">
          {/* AVATAR ANIMADO CON EMOCIONES Y LIP-SYNC */}
          <div className="relative">
            <div className={`w-11 h-11 rounded-full overflow-hidden bg-slate-900 border-2 border-amber-400/80 ${getEmotionAura(currentEmotion)} transition-all duration-300`}>
              <img
                src={config.avatar || '/fenix_avatar_default.jpg'}
                alt="Fénix Avatar"
                className="w-full h-full object-cover"
              />
            </div>
            {/* Animación Lip Sync (Onda de voz) y botón rápido para callar */}
            {isSpeaking && (
              <button
                type="button"
                onClick={stopSpeaking}
                className="absolute -bottom-1 -right-1 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full animate-bounce shadow-md cursor-pointer transition-transform hover:scale-110"
                title="Voz activa (clic para silenciar / parar)"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
              </button>
            )}
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-amber-300 tracking-wide flex items-center gap-1">
                {config.name || 'Fénix'}
              </h3>
              <select
                value={config.provider}
                onChange={(e) => {
                  const newProvider = e.target.value as any;
                  onUpdateConfig({ provider: newProvider });
                  saveFenixConfig({ provider: newProvider });
                }}
                className="text-[9px] font-mono px-1.5 py-0.5 bg-slate-900 text-amber-300 rounded border border-amber-500/40 outline-none cursor-pointer hover:border-amber-400 focus:ring-1 focus:ring-amber-500 truncate max-w-[130px]"
                title="Cambiar motor de IA de Fénix"
              >
                <option value="hyperqwen-ollama">🦙 Ollama: {config.ollamaModel ? config.ollamaModel.split(':')[0] : 'hyperqwen'}</option>
                <option value="hyperqwen-llama">⚙️ llama-server (GGUF)</option>
                <option value="gemini">✨ Gemini</option>
                <option value="anthropic">🧠 Claude</option>
                <option value="openai">🤖 OpenAI</option>
                <option value="openrouter">🌐 OpenRouter</option>
                <option value="nvidia">⚡ NVIDIA NIM</option>
              </select>
            </div>
            <p className="text-[10px] text-slate-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Asesor de Videojuegos & UX
            </p>
          </div>
        </div>

        {/* CONTROLES SUPERIORES */}
        <div className="flex items-center gap-1.5">
          {/* Toggle Modo Paso a Paso / Modo Rápido */}
          <button
            type="button"
            onClick={() => {
              const nextVal = config.wizardMode === false;
              onUpdateConfig({ wizardMode: nextVal });
              saveFenixConfig({ wizardMode: nextVal });
            }}
            className={`px-2 py-0.5 text-[10px] font-bold rounded-md flex items-center gap-1 transition-all ${
              config.wizardMode !== false
                ? 'bg-amber-500/25 text-amber-300 border border-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.25)] hover:bg-amber-500/35'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200 hover:bg-slate-700'
            }`}
            title={
              config.wizardMode !== false
                ? 'Modo Paso a Paso Activo (Fénix guía 1 pregunta a la vez). Clic para cambiar a Modo Rápido.'
                : 'Modo Rápido Activo (Genera directo en 1 turno). Clic para activar Paso a Paso.'
            }
          >
            {config.wizardMode !== false ? '🧙 Paso a Paso' : '⚡ Rápido'}
          </button>

          {/* Botón de Parar Voz de emergencia (Visible mientras habla) */}
          {isSpeaking && (
            <button
              type="button"
              onClick={stopSpeaking}
              className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold rounded-md shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse flex items-center gap-1 transition-all"
              title="Detener voz del agente inmediatamente"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              <span>PARAR</span>
            </button>
          )}

          {/* Control de voz rápido (Mute / Activar con parada instantánea) */}
          <button
            onClick={handleToggleVoice}
            className={`p-1.5 rounded-lg transition-colors ${
              config.voiceEnabled 
                ? 'text-amber-400 hover:bg-amber-950/50' 
                : 'text-red-400 bg-red-950/30 border border-red-500/30 hover:bg-red-900/40'
            }`}
            title={config.voiceEnabled ? 'Silenciar voz del agente (Mute)' : 'Activar voz del agente'}
          >
            {config.voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Ajustes */}
          <button
            onClick={() => onOpenSettings('fenix')}
            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors"
            title="Configuración de Fénix"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Minimizar */}
          <button
            onClick={() => {
              setIsMinimized(true);
              onUpdateConfig({ windowPosition: { ...config.windowPosition, isMinimized: true } });
            }}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Minimizar"
          >
            <Minus className="w-4 h-4" />
          </button>

          {/* Cerrar / Ocultar */}
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
            title="Ocultar ventana"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* BANNER RÁPIDO DE CONTEXTO */}
      <div className="px-3 py-1 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <span className="truncate max-w-[200px]">🎮 {projectContext.projectName || 'Proyecto Actual'}</span>
        <span className="text-amber-400/90 font-bold uppercase">{projectContext.currentTab || 'ASSETS'}</span>
      </div>

      {/* FEED DE MENSAJES */}
      <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 text-xs text-slate-200">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isSecondary = msg.collaborator === 'secondary';

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
            >
              <div
                className={`max-w-[88%] rounded-2xl p-3 shadow-md ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : isSecondary
                    ? 'bg-purple-950/80 border border-purple-500/40 text-purple-200 rounded-bl-none'
                    : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-bl-none'
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                {/* TARJETAS DE RESULTADOS DE HERRAMIENTAS MCP */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-2">
                    {msg.toolCalls.map((call, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-2.5 text-[11px]"
                      >
                        <div className="flex items-center justify-between text-amber-400 font-bold mb-1">
                          <span className="flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5" /> {call.name}
                          </span>
                          <button
                            onClick={() => handleCopy(JSON.stringify(call.result || call.args, null, 2), call.id)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                            title="Copiar resultado"
                          >
                            {copiedId === call.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        {call.result?.message && (
                          <p className="text-slate-300 mb-1.5">{call.result.message}</p>
                        )}
                        {/* PREVISUALIZACIÓN DE SPRITE GENERADO DIRECTAMENTE (omni_create_sprite / omni_generate_sprite) */}
                        {call.result?.result?.imageBase64 && (
                          <div className="my-2 p-2 bg-slate-900/90 border border-purple-500/30 rounded-xl flex flex-col items-center gap-2">
                            <div className="relative group max-w-[180px] max-h-[180px] overflow-hidden rounded-lg border border-purple-500/40 bg-black/70 flex items-center justify-center p-1 shadow-inner">
                              <img
                                src={call.result.result.imageBase64}
                                alt={call.result.result.suggestedName || 'Sprite generado'}
                                className="max-h-40 object-contain pixelated"
                              />
                            </div>
                            <div className="flex items-center gap-2 w-full justify-center">
                              {onSaveAsset && (
                                <button
                                  onClick={() => {
                                    if (call.result?.result?.imageBase64) {
                                      const newAsset: GeneratedAsset = {
                                        id: `fenix_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                        imageUrl: call.result.result.imageBase64,
                                        prompt: call.result.result.prompt || call.result.result.positivePrompt || 'Sprite generado por Fénix',
                                        timestamp: Date.now(),
                                        mode: 'sprite',
                                        action: 'Idle'
                                      };
                                      onSaveAsset(newAsset);
                                      setSavedAssetIds(prev => new Set(prev).add(call.id));
                                    }
                                  }}
                                  disabled={savedAssetIds.has(call.id)}
                                  className={`py-1.5 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
                                    savedAssetIds.has(call.id)
                                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 cursor-default'
                                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50 active:scale-95'
                                  }`}
                                >
                                  {savedAssetIds.has(call.id) ? (
                                    <>
                                      <Check className="w-3.5 h-3.5" /> Guardado en Assets
                                    </>
                                  ) : (
                                    <>
                                      <Download className="w-3.5 h-3.5" /> Guardar en Assets
                                    </>
                                  )}
                                </button>
                              )}
                              <button
                                onClick={() => handleDownloadPng(call.result.result.imageBase64, call.result.result.suggestedName || 'sprite')}
                                className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 transition-colors"
                                title="Descargar archivo PNG"
                              >
                                <FolderDown className="w-3.5 h-3.5" /> PNG
                              </button>
                            </div>
                          </div>
                        )}

                        {/* PROMPT GENERADO (omni_craft_sprite_prompt) CON BOTÓN DE ACCIÓN 1-CLIC */}
                        {call.result?.result?.positivePrompt && (
                          <div className="space-y-2 mt-1.5">
                            <div className="bg-slate-900 p-2 rounded text-[10px] font-mono text-cyan-300 overflow-x-auto select-all">
                              {call.result.result.positivePrompt}
                            </div>
                            {onSendPromptToStudio && (
                              <button
                                onClick={() => onSendPromptToStudio(
                                  call.result.result.positivePrompt,
                                  call.result.result.negativePrompt,
                                  call.result.result.style,
                                  call.result.result.action || 'Idle',
                                  call.result.result.autoRemoveBackground !== false,
                                  call.result.result.characterName || call.result.result.suggestedName,
                                  call.result.result.spriteBgMode || 'white'
                                )}
                                className="w-full py-2 px-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-lg shadow-md shadow-purple-950/50 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                              >
                                <Palette className="w-4 h-4" />
                                🎨 GENERAR EN EL ESTUDIO
                              </button>
                            )}
                          </div>
                        )}
                        {call.result?.result?.code && (
                          <pre className="bg-slate-900 p-2 rounded text-[10px] font-mono text-emerald-300 overflow-x-auto max-h-36">
                            {call.result.result.code}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <span className="text-[9px] text-slate-500 px-1 font-mono">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          );
        })}

        {/* LOADING INDICATOR */}
        {isLoading && (
          <div className="flex items-center gap-2 p-3 bg-slate-900/80 border border-amber-500/30 rounded-2xl w-fit rounded-bl-none text-amber-400 text-xs animate-pulse">
            <Sparkles className="w-4 h-4 animate-spin-slow" />
            <span>{config.name || 'Fénix'} está analizando...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ACCIONES RÁPIDAS (PILLS) */}
      <div className="px-3 py-1.5 bg-slate-900/40 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => handleSendMessage('¿Cómo planificamos la creación de un nuevo videojuego completo en Omni-IA Game?')}
          className="whitespace-nowrap px-2.5 py-1 bg-slate-800/80 hover:bg-amber-950/40 hover:text-amber-300 text-slate-300 text-[10px] font-medium rounded-full border border-slate-700/60 transition-colors flex items-center gap-1"
        >
          <Gamepad2 className="w-3 h-3" /> Guía de Videojuego
        </button>
        <button
          onClick={() => handleSendMessage('Recomiéndame un concepto y prompt optimizado para el personaje principal de mi juego.')}
          className="whitespace-nowrap px-2.5 py-1 bg-slate-800/80 hover:bg-amber-950/40 hover:text-amber-300 text-slate-300 text-[10px] font-medium rounded-full border border-slate-700/60 transition-colors flex items-center gap-1"
        >
          <Palette className="w-3 h-3" /> Diseñar Sprite
        </button>
        <button
          onClick={() => handleSendMessage('¿Cómo armo un controlador de movimiento en Godot para mi personaje?')}
          className="whitespace-nowrap px-2.5 py-1 bg-slate-800/80 hover:bg-amber-950/40 hover:text-amber-300 text-slate-300 text-[10px] font-medium rounded-full border border-slate-700/60 transition-colors flex items-center gap-1"
        >
          <Code2 className="w-3 h-3" /> Generar Script
        </button>
        <button
          onClick={() => handleSendMessage('Sugiere la atmósfera y estilo musical adecuado para este juego.')}
          className="whitespace-nowrap px-2.5 py-1 bg-slate-800/80 hover:bg-amber-950/40 hover:text-amber-300 text-slate-300 text-[10px] font-medium rounded-full border border-slate-700/60 transition-colors flex items-center gap-1"
        >
          <Music className="w-3 h-3" /> Diseñar Audio
        </button>
      </div>

      {/* SUB-BARRA DE CONTROL DE VOZ Y CONVERSACIÓN CONTINUA */}
      {config.speechToTextEnabled && (
        <div className="px-3 py-1 bg-slate-950/80 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
          {/* Alternador de Diálogo Continuo (Manos Libres) */}
          <button
            type="button"
            onClick={() => {
              const next = !continuousChat;
              setContinuousChat(next);
              if (next && !isListening && !isSpeaking && !isLoading) {
                startListening();
              }
            }}
            className={`px-2 py-0.5 rounded font-medium transition-all flex items-center gap-1.5 ${
              continuousChat
                ? 'bg-purple-950 text-purple-300 border border-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.3)] animate-pulse'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Modo Conversación Continua: Hablas, Fénix responde por voz y al terminar abre el micrófono de nuevo automáticamente para que sigan dialogando sin tocar el ratón"
          >
            <Headphones className="w-3 h-3 flex-shrink-0" />
            <span>{continuousChat ? 'Conversación Continua: ACTIVA' : 'Conversación Continua: OFF'}</span>
          </button>

          {/* Alternador de Auto-Envío vs Solo Dictado */}
          <button
            type="button"
            onClick={() => setDictationOnly(!dictationOnly)}
            className={`px-2 py-0.5 rounded font-medium transition-colors flex items-center gap-1 ${
              dictationOnly
                ? 'bg-amber-950/70 text-amber-300 border border-amber-600/50'
                : 'text-emerald-400 hover:text-emerald-300'
            }`}
            title={dictationOnly ? 'Modo Dictado: transcribe tu voz a texto sin enviar automáticamente' : 'Modo Conversación: envía tu mensaje en cuanto terminas de hablar'}
          >
            {dictationOnly ? <FileText className="w-3 h-3 flex-shrink-0" /> : <Send className="w-2.5 h-2.5 flex-shrink-0" />}
            <span>{dictationOnly ? 'Modo: Solo Dictado' : 'Auto-Envío: ON'}</span>
          </button>
        </div>
      )}

      {/* INPUT Y CONTROLES INFERIORES */}
      <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex items-center gap-2">
        {/* Botón de micrófono STT */}
        {config.speechToTextEnabled && (
          <button
            onClick={toggleListening}
            className={`p-2 rounded-xl transition-all ${
              isListening
                ? 'bg-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.8)]'
                : 'bg-slate-800 text-slate-400 hover:text-amber-400'
            }`}
            title={
              isListening
                ? 'Escuchando tu voz... (clic para detener)'
                : dictationOnly
                ? 'Dictar voz (escribir sin enviar)'
                : 'Conversar por voz (envía automáticamente al hablar)'
            }
          >
            {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>
        )}

        {/* Botón de Parar Voz en barra inferior */}
        {isSpeaking && (
          <button
            type="button"
            onClick={stopSpeaking}
            className="px-2.5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-red-950/60 animate-pulse transition-all flex-shrink-0"
            title="Parar voz del agente inmediatamente"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">PARAR</span>
          </button>
        )}

        {/* Input de texto */}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendMessage();
          }}
          placeholder={
            isListening
              ? (dictationOnly ? 'Dictando voz en texto...' : '🎙️ Escuchando... se enviará al callar')
              : `Pregunta a ${config.name || 'Fénix'}...`
          }
          className="flex-1 bg-slate-950 border border-slate-800 text-xs px-3 py-2 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
        />

        {/* Botón de enviar */}
        <button
          onClick={() => handleSendMessage()}
          disabled={!inputValue.trim() || isLoading}
          className="p-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 text-slate-950 rounded-xl font-bold transition-all shadow-md"
          title="Enviar mensaje"
        >
          <Send className="w-4 h-4" />
        </button>

        {/* Limpiar chat */}
        <button
          onClick={handleClearChat}
          className="p-2 text-slate-500 hover:text-red-400 rounded-xl transition-colors"
          title="Limpiar conversación"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
