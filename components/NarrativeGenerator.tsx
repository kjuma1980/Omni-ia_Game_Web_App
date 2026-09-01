
import React, { useState, useRef, useEffect } from 'react';
import Tooltip from './Tooltip';
import { generateText, generateTTS, refinePrompt, stripChainOfThought } from '../services/aiProvider';
import { generateOllamaCompletion, generateLocalTTS } from '../services/localService';
import { decodeBase64ToUint8Array, decodeAudioData, audioBufferToWav as bufferToWav, applyVoiceEffects, VOICES_WITH_EFFECTS } from '../utils/audioUtils';
import { ProjectData } from '../types';
import { 
  ScrollText, 
  Volume2, 
  Sparkles, 
  Languages, 
  Play, 
  Download, 
  Loader2, 
  User, 
  Music, 
  Waves,
  Upload,
  Volume1,
  X,
  ToggleLeft,
  ToggleRight,
  Headphones,
  Zap,
  FileAudio,
  Wand2,
  Square
} from 'lucide-react';
import PencilSparkleAnimation from './PencilSparkleAnimation';


const VOICES = [
  'Heroic Male', 'Heroic Female', 'Villainous Dark',
  'Wise Elder', 'Young Adventurer', 'Mystical Entity',
  'Robot/AI', 'Normal Female', 'Normal Male',
  'Duende Male', 'Duende Female', 'Little Boy', 'Little Girl'
];

const GDD_TEMPLATES = [
  {
    name: 'Boss Battle (Epic)',
    prompt: 'Genera un GDD para una batalla contra un jefe épico en una montaña nevada. Incluye: Mecánicas de 3 fases, diálogo de entrada intimidante en español e inglés, descripción de SFX ambientales (viento gélido) y música (orquestal tensa).'
  },
  {
    name: 'Stealth Mission',
    prompt: 'Genera un GDD para una misión de infiltración en una base tecnológica. Incluye: Comportamiento de guardias, script de radio para el protagonista en ambos idiomas, efectos de sonido (pasos metálicos, alarmas lejanas) y música (synthwave minimalista).'
  },
  {
    name: 'Horror Encounter',
    prompt: 'Genera un GDD para un encuentro de terror en un bosque oscuro. Incluye: Manifestación de la entidad, gritos y susurros en el script dual, SFX de ramas rompiéndose y música (dark ambient disonante).'
  }
];



import { showToast } from '../utils/toast';

interface NarrativeGeneratorProps {
  state: ProjectData['narrativeState'];
  updateState: (updates: Partial<ProjectData['narrativeState']>) => void;
  apiSettings?: ProjectData['apiSettings'];
  showTooltips?: boolean;
}

const NarrativeGenerator: React.FC<NarrativeGeneratorProps> = ({ state, updateState, apiSettings, showTooltips }) => {
  const { idea, useAIExpansion, scriptES, scriptEN, selectedVoice, voiceEnthusiasm = 50, useSpainSpanish = false, voiceSpeed = 1.0, sfxDesc, musicDesc, monsterLevel, audioUrlES, audioUrlEN } = state;
  const useRandomSeed = state.useRandomSeed ?? true;
  const customSeed = state.customSeed ?? 798635;

  // Narrative Logic
  const [loadingText, setLoadingText] = useState(false);
  const [refining, setRefining] = useState(false);
  
  // Voice & Mixer Logic
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'WAV' | 'MP3'>('WAV');
  const [isProcessingDownload, setIsProcessingDownload] = useState(false);
  
  // Buffers for Playback
  const [voiceBufferES, setVoiceBufferES] = useState<AudioBuffer | null>(null);
  const [voiceBufferEN, setVoiceBufferEN] = useState<AudioBuffer | null>(null);
  const [sfxBuffer, setSfxBuffer] = useState<AudioBuffer | null>(null);
  const [musicBuffer, setMusicBuffer] = useState<AudioBuffer | null>(null);

  // Files & Volumes
  const [sfxFile, setSfxFile] = useState<File | null>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [volVoice, setVolVoice] = useState(1.0);
  const [volSfx, setVolSfx] = useState(0.6);
  const [volMusic, setVolMusic] = useState(0.4);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSources = useRef<AudioBufferSourceNode[]>([]);
  const sfxInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const abortRefineControllerRef = useRef<AbortController | null>(null);

  const [confirmClear, setConfirmClear] = useState(false);

  // Auto-decoding saved audio URLs on mount/load
  useEffect(() => {
    const decodeSavedAudios = async () => {
      if (!audioUrlES && !audioUrlEN) return;
      const ctx = initAudioCtx();
      
      if (audioUrlES && audioUrlES.startsWith('data:') && !voiceBufferES) {
        try {
          console.log("[Audio Debug] Auto-decoding saved ES audio on tab switch...");
          const base64 = audioUrlES.split(',')[1];
          if (base64) {
            const decoded = await decodeAudioData(decodeBase64ToUint8Array(base64), ctx);
            setVoiceBufferES(decoded);
          }
        } catch (e) {
          console.error("Error auto-decoding ES audio:", e);
        }
      }
      
      if (audioUrlEN && audioUrlEN.startsWith('data:') && !voiceBufferEN) {
        try {
          console.log("[Audio Debug] Auto-decoding saved EN audio on tab switch...");
          const base64 = audioUrlEN.split(',')[1];
          if (base64) {
            const decoded = await decodeAudioData(decodeBase64ToUint8Array(base64), ctx);
            setVoiceBufferEN(decoded);
          }
        } catch (e) {
          console.error("Error auto-decoding EN audio:", e);
        }
      }
    };
    decodeSavedAudios();
  }, [audioUrlES, audioUrlEN]);

  const initAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const handleFileUpload = async (type: 'sfx' | 'music', file: File | null) => {
    if (!file) return;
    const ctx = initAudioCtx();
    const arrayBuffer = await file.arrayBuffer();
    try {
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      if (type === 'sfx') {
        setSfxFile(file);
        setSfxBuffer(decoded);
      } else {
        setMusicFile(file);
        setMusicBuffer(decoded);
      }
    } catch (e) {
      alert("Formato de audio no soportado para el mezclador.");
    }
  };

  // Utility to clean any markdown/formatting artifacts and AI reasoning from output
  const cleanScriptText = (text: string, lang: 'ES' | 'EN' = 'ES'): string => {
    if (!text) return '';
    let cleaned = stripChainOfThought(text);

    // Si hay un esquema o preludio preliminar antes de la sección 1, recortar limpiamente desde la sección 1
    const firstSecRegex = lang === 'EN'
      ? /(?:^|\n)\s*1\.\s*(?:Title|Game|Logline|Lore|Characters|Story|Script|Overview|Mechanics|World)/i
      : /(?:^|\n)\s*1\.\s*(?:T[ií]tulo|Juego|Logline|Nombre|Lore|Escena|Guion|Mecanicas|Personajes|Mundo)/i;

    const firstSecIdx = cleaned.search(firstSecRegex);
    if (firstSecIdx > 0) {
      cleaned = cleaned.substring(firstSecIdx);
    }

    return cleaned
      .replace(/\*\*([^*]+)\*\*/g, '$1')      // **bold** → bold
      .replace(/\*([^*]+)\*/g, '$1')           // *italic* → italic
      .replace(/^#{1,6}\s+/gm, '')             // # headings → remove
      .replace(/^[\-\*]\s+/gm, '')             // - bullet or * bullet → remove prefix
      .replace(/`([^`]+)`/g, '$1')             // `code` → code
      .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')   // __underline__ → text
      .replace(/^\s*Spanish Version:?\s*$/gim, '')
      .replace(/^\s*English Version:?\s*$/gim, '')
      .replace(/^\s*Version in English:?\s*$/gim, '')
      .replace(/^\s*Versión en Español:?\s*$/gim, '')
      .replace(/^\s*Inglés Técnico:?\s*$/gim, '')
      .replace(/^\s*Technical English:?\s*$/gim, '')
      .replace(/^\s*Here is the (?:technical |English )?(?:translation|GDD|script):?\s*$/gim, '')
      .replace(/\n{3,}/g, '\n\n')              // Collapse excessive newlines
      .trim();
  };

  const handleGenerateText = async () => {
    if (!idea.trim()) return;

    setLoadingText(true);
    try {
      let esRaw = '';
      let enRawFromExpansion = '';
      if (!useAIExpansion) {
        esRaw = idea;
      } else {
        const expansionResult = await generateText(idea, apiSettings, true);
        const partes = expansionResult.split(/===\s*ENGLISH_VERSION\s*===|\n\s*Version in English:\s*\n|\n\s*Inglés Técnico:\s*\n/i);
        esRaw = partes[0] || expansionResult;
        if (partes.length > 1 && partes[1].trim().length > 50) {
          enRawFromExpansion = partes[1].trim();
        }
      }

      const cleanES = cleanScriptText(esRaw, 'ES');
      updateState({ scriptES: cleanES });

      let cleanEN = '';
      if (enRawFromExpansion.length > 50) {
        cleanEN = cleanScriptText(enRawFromExpansion, 'EN');
      }

      // Si no vino versión en inglés en la expansión o si no se usó expansión, hacer pasada dedicada 1:1
      if (!cleanEN || cleanEN.length < 30) {
        const translatePrompt = 
          'You are an expert video game creative director and technical translator. ' +
          'Translate the following complete video game GDD / script document from Spanish into Technical English. ' +
          'Translate EVERY SINGLE section from 1 to 7, paragraph, character dialogue line, and detail without leaving out any text or sentence. ' +
          'Return ONLY plain text with simple numbering (1. 2. 3.), no markdown formatting, no asterisks, no internal commentary:\n\n' +
          cleanES;

        const rawEN = await generateText(translatePrompt, apiSettings, false);
        cleanEN = cleanScriptText(rawEN, 'EN');
      }

      updateState({ scriptEN: cleanEN });

    } catch (error: any) {
      console.error("Narrative Generation Error:", error);
      const msg = error?.message || String(error);
      if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota exceeded")) {
        alert("Límite de peticiones excedido (API de Gemini).\n\nEstás usando la capa gratuita que permite pocos request por minuto.\nPor favor, espera unos 35 segundos e intenta de nuevo, o cambia a un modelo local (Ollama) en la Configuración Global.");
      } else {
        alert("Error en la conexión con el servicio de IA.\n" + msg.substring(0, 100));
      }
    } finally {
      setLoadingText(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!scriptES.trim()) return;
    setLoadingAudio(true);
    const ctx = initAudioCtx();

    try {
      setVoiceBufferES(null);
      setVoiceBufferEN(null);
      updateState({ audioUrlES: null, audioUrlEN: null });

      // Generate ES Audio
      const resES = await generateTTS(scriptES, selectedVoice, apiSettings, 'ES', voiceEnthusiasm, useSpainSpanish, { useRandomSeed, customSeed });
      console.log("[Audio Debug] Response from TTS:", {
        dataLength: resES.data?.length,
        mimeType: resES.mimeType,
        firstChars: resES.data?.substring(0, 100)
      });

      if (!resES.data || resES.data.length === 0) {
        throw new Error("El servicio de TTS devolvió datos vacíos. Verifica tu API Key de Gemini.");
      }

      const bufferES = await decodeAudioData(decodeBase64ToUint8Array(resES.data), ctx);
      setVoiceBufferES(bufferES);

      let dataUrlES = `data:${resES.mimeType || 'audio/wav'};base64,${resES.data}`;
      let dataUrlEN: string | null = null;

      // Generate EN Audio with Anti-Rate-Limit Delay (1.5s)
      if (scriptEN && scriptEN.length > 5 && scriptEN !== "Script localization generated.") {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const resEN = await generateTTS(scriptEN, selectedVoice, apiSettings, 'EN', voiceEnthusiasm, useSpainSpanish, { useRandomSeed, customSeed });
        if (resEN.data) {
          const bufferEN = await decodeAudioData(decodeBase64ToUint8Array(resEN.data), ctx);
          setVoiceBufferEN(bufferEN);
          dataUrlEN = `data:${resEN.mimeType || 'audio/wav'};base64,${resEN.data}`;
        }
      }

      updateState({
        audioUrlES: dataUrlES,
        audioUrlEN: dataUrlEN
      });
    } catch (error) {
      console.error(error);
      alert("Las voces se han desvanecido en la niebla.");
    } finally {
      setLoadingAudio(false);
    }
  };

  const playMix = (lang: 'ES' | 'EN') => {
    const ctx = initAudioCtx();
    stopAll();

    const voiceBuffer = lang === 'ES' ? voiceBufferES : voiceBufferEN;
    if (!voiceBuffer) return;

    const voiceSource = ctx.createBufferSource();
    voiceSource.buffer = voiceBuffer;
    
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = volVoice;

    let lastNode: AudioNode = applyVoiceEffects(ctx, voiceSource, selectedVoice, monsterLevel, activeSources.current, voiceSpeed);

    lastNode.connect(voiceGain).connect(ctx.destination);
    activeSources.current.push(voiceSource);
    voiceSource.start(0);

    if (sfxBuffer) {
      const sfxSource = ctx.createBufferSource();
      sfxSource.buffer = sfxBuffer;
      sfxSource.loop = true;
      const sfxGain = ctx.createGain();
      sfxGain.gain.value = volSfx;
      sfxSource.connect(sfxGain).connect(ctx.destination);
      activeSources.current.push(sfxSource);
      sfxSource.start(0);
    }

    if (musicBuffer) {
      const musicSource = ctx.createBufferSource();
      musicSource.buffer = musicBuffer;
      musicSource.loop = true;
      const musicGain = ctx.createGain();
      musicGain.gain.value = volMusic;
      musicSource.connect(musicGain).connect(ctx.destination);
      activeSources.current.push(musicSource);
      musicSource.start(0);
    }

    voiceSource.onended = () => stopAll();
  };

  const stopAll = () => {
    activeSources.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    activeSources.current = [];
  };

  const downloadFile = async (lang: 'ES' | 'EN') => {
    const originalBuffer = lang === 'ES' ? voiceBufferES : voiceBufferEN;
    if (!originalBuffer) return;
    
    setIsProcessingDownload(true);

    let bufferToExport = originalBuffer;

    // Si hay nivel de monstruo o voces con efectos especiales, renderizar offline
    const needsEffects = monsterLevel > 0.05 || VOICES_WITH_EFFECTS.includes(selectedVoice);
    if (needsEffects) {
      try {
        // Usamos voiceSpeed directamente para el cálculo del buffer offline.
        // Los efectos específicos de voz se aplican dentro de applyVoiceEffects.
        const rate = voiceSpeed;
        const newLength = (originalBuffer.length / rate) + (originalBuffer.sampleRate * 2.0);
        
        const offlineCtx = new OfflineAudioContext(
          originalBuffer.numberOfChannels,
          newLength,
          originalBuffer.sampleRate
        );

        const source = offlineCtx.createBufferSource();
        source.buffer = originalBuffer;

        let tempSources: AudioScheduledSourceNode[] = [];
        let lastNode = applyVoiceEffects(offlineCtx, source, selectedVoice, monsterLevel, tempSources, voiceSpeed);

        lastNode.connect(offlineCtx.destination);
        source.start(0);

        bufferToExport = await offlineCtx.startRendering();
      } catch (e) {
        console.error("Error rendering offline audio", e);
      }
    }

    const blob = bufferToWav(bufferToExport);
    
    // Formatear el nombre del archivo: Omni_Voz_Es.wav o Omni_Voz_En.mp3
    const voiceFormatted = selectedVoice.replace(/\s+/g, '_');
    const langSuffix = lang.toUpperCase() === 'ES' ? 'Es' : 'En';
    const filename = `Omni_${voiceFormatted}_${langSuffix}.${downloadFormat.toLowerCase()}`;

    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64data = reader.result as string;
      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
      
      if (invokeFn) {
        try {
          const res = await invokeFn('save_audio_file', {
            b64Data: base64data,
            filename: filename,
            format: downloadFormat.toLowerCase()
          });
          if (res && typeof res === 'string') {
            showToast(res);
          } else {
            showToast(`Audio de narrativa guardado con éxito`);
          }
        } catch (e: any) {
          if (e !== "Operación cancelada por el usuario" && e !== "Operation cancelled by user") {
            showToast("Error al guardar: " + e, 'error');
          }
        }
      } else {
        // Web fallback
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      }
      setIsProcessingDownload(false);
    };
  };

  return (
    <div className="flex h-full gap-6 p-6 overflow-hidden">
      {/* Narrative Panel */}
      <div className="w-1/2 flex flex-col gap-4 bg-slate-900/40 p-6 rounded-xl border border-slate-800 shadow-xl overflow-y-auto">

        <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
          <div className="flex items-center gap-2 text-indigo-400">
            <ScrollText className="w-5 h-5" />
            <h2 className="text-xl font-bold font-cinzel tracking-wider uppercase">Narrative Forge</h2>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip id="narrativeClearBtn" inline showTooltips={showTooltips}>
              <button
                onClick={() => {
                  if (!confirmClear) {
                    setConfirmClear(true);
                    setTimeout(() => setConfirmClear(false), 4000);
                    return;
                  }
                  setConfirmClear(false);
                  updateState({
                    idea: '',
                    scriptES: '',
                    scriptEN: '',
                    audioUrlES: null,
                    audioUrlEN: null
                  });
                  setVoiceBufferES(null);
                  setVoiceBufferEN(null);
                  stopAll();
                }}
                className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-mono transition-all font-bold rounded border ${
                  confirmClear 
                    ? 'bg-red-600 text-white border-red-500 animate-pulse' 
                    : 'bg-red-950/40 hover:bg-red-900/40 text-red-400 border-red-800/40 hover:border-red-600/60'
                }`}
              >
                <X className="w-3 h-3" />
                {confirmClear ? '¿CONFIRMAR LIMPIAR?' : 'LIMPIAR TAB'}
              </button>
            </Tooltip>
            <Tooltip id="narrativeAIExpansion" inline showTooltips={showTooltips}>
              <button 
                onClick={() => updateState({ useAIExpansion: !useAIExpansion })}
                className={`flex items-center gap-2 px-3 py-1 rounded text-[10px] font-mono transition-all ${useAIExpansion ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-500' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}
              >
                {useAIExpansion ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                EXPANSIÓN IA
              </button>
            </Tooltip>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1 flex justify-between items-center">
              <span>Semilla de Idea / Guión Directo</span>
              <div className="flex gap-2">
                {apiSettings?.promptEngineer?.enabled && (
                  <Tooltip id="narrativeRefineAi" showTooltips={showTooltips} inline>
                    <button
                      type="button"
                      onClick={async () => {
                        if (refining) {
                          if (abortRefineControllerRef.current) {
                            abortRefineControllerRef.current.abort();
                            abortRefineControllerRef.current = null;
                          }
                          setRefining(false);
                          return;
                        }
                        if (!idea.trim()) {
                          alert('Escribe una semilla o idea primero para que la IA pueda refinar.');
                          return;
                        }
                        setRefining(true);
                        const controller = new AbortController();
                        abortRefineControllerRef.current = controller;
                        try {
                          const refined = await refinePrompt(idea, '', 'narrative', selectedVoice, '', apiSettings, undefined, controller.signal);
                          updateState({ idea: refined.positive });
                        } catch (err: any) {
                          if (err?.name === 'AbortError' || String(err).includes('Aborted')) {
                            console.log('[Narrative] Refinamiento de IA cancelado por el usuario.');
                          } else {
                            alert(`Error del Prompt Engineer: ${err.message || err}`);
                          }
                        } finally {
                          setRefining(false);
                          abortRefineControllerRef.current = null;
                        }
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                        refining
                          ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse shadow-md shadow-red-900/40 cursor-pointer border border-red-500'
                          : 'bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-700/50'
                      }`}
                    >
                      {refining ? <PencilSparkleAnimation className="w-3.5 h-3.5" /> : <Wand2 className="w-3 h-3" />}
                      {refining ? '⏹ DETENER REFINADO' : '✨ REFINAR CON IA'}
                    </button>
                  </Tooltip>
                )}
                {GDD_TEMPLATES.map((tmpl, i) => (
                  <button
                    key={i}
                    onClick={() => updateState({ idea: tmpl.prompt })}
                    className="text-[9px] bg-slate-800 hover:bg-slate-700 text-indigo-400 px-2 py-0.5 rounded border border-slate-700 transition-colors"
                    title={tmpl.prompt}
                  >
                    {tmpl.name}
                  </button>
                ))}
              </div>
            </label>
            <Tooltip id="narrativeIdea" showTooltips={showTooltips}>
              <textarea
                value={idea}
                onChange={(e) => updateState({ idea: e.target.value })}
                placeholder={useAIExpansion ? "Ej: Un guerrero encuentra una espada antigua..." : "Escribe directamente el guión. Se traducirá automáticamente al inglés técnico."}
                className="w-full h-24 bg-black/40 border border-slate-700 rounded p-3 text-sm text-slate-200 focus:border-indigo-500 outline-none resize-none font-mono"
              />
            </Tooltip>
          </div>

          <Tooltip id="narrativeComposeBtn" showTooltips={showTooltips}>
            <button
              onClick={handleGenerateText}
              disabled={loadingText}
              className="w-full py-2.5 bg-indigo-700 hover:bg-indigo-600 text-white font-bold rounded flex items-center justify-center gap-2 transition-all shadow-lg"
            >
              {loadingText ? <Loader2 className="animate-spin w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
              {loadingText ? 'PROCESANDO...' : 'FIJAR GUIÓN DUAL'}
            </button>
          </Tooltip>

          {(scriptES || scriptEN) && (
            <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
              <div className="p-3 bg-slate-950/80 border-l-4 border-indigo-500 rounded text-[12px] text-indigo-100 font-mono whitespace-pre-wrap leading-relaxed">
                <div className="text-indigo-400 font-bold mb-1 flex items-center gap-2 border-b border-indigo-900/30 pb-1 uppercase tracking-tighter">
                   <Languages className="w-3 h-3" /> Español Andino
                </div>
                {scriptES}
              </div>
              <div className="p-3 bg-slate-950/80 border-l-4 border-slate-600 rounded text-[11px] text-slate-400 font-mono whitespace-pre-wrap leading-relaxed">
                <div className="text-slate-500 font-bold mb-1 flex items-center gap-2 border-b border-slate-800 pb-1 uppercase tracking-tighter">
                   <Languages className="w-3 h-3" /> Technical English
                </div>
                {scriptEN}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Voice & Mixing Panel */}
      <div className="w-1/2 flex flex-col gap-4 bg-slate-900/40 p-6 rounded-xl border border-slate-800 shadow-xl overflow-y-auto">
        <div className="flex items-center gap-2 text-rose-400 border-b border-slate-700 pb-2 mb-2">
          <Volume2 className="w-5 h-5" />
          <h2 className="text-xl font-bold font-cinzel tracking-wider uppercase">Audio Mixer</h2>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Entidad de Voz</label>
              <Tooltip id="narrativeVoice" showTooltips={showTooltips}>
                <select 
                  value={selectedVoice}
                  onChange={(e) => updateState({ selectedVoice: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded text-xs focus:border-rose-500 outline-none"
                >
                  {VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </Tooltip>
              <Tooltip id="narrativeVoiceAccent" showTooltips={showTooltips}>
                <button 
                  onClick={() => updateState({ useSpainSpanish: !useSpainSpanish })}
                  className={`mt-2 flex items-center gap-2 px-2 py-1 rounded text-[9px] font-mono transition-all border ${useSpainSpanish ? 'bg-indigo-900/40 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500'}`}
                >
                  {useSpainSpanish ? <ToggleRight className="w-3 h-3 text-indigo-400" /> : <ToggleLeft className="w-3 h-3" />}
                  {useSpainSpanish ? 'Acento: ESPAÑA (es-ES)' : 'Acento: MÉXICO (es-MX)'}
                </button>
              </Tooltip>
            </div>
            <Tooltip id="narrativeEnthusiasm" showTooltips={showTooltips}>
              <div className="bg-rose-950/20 p-2 rounded border border-rose-900/30">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-rose-400 font-mono uppercase tracking-widest">Entusiasmo/Ánimo</label>
                  <span className="text-[10px] text-rose-500 font-mono">{voiceEnthusiasm}%</span>
                </div>
                <input 
                  type="range" min="0" max="100" step="1" 
                  value={voiceEnthusiasm} 
                  onChange={(e) => updateState({ voiceEnthusiasm: parseInt(e.target.value) })} 
                  className="w-full accent-rose-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" 
                />
              </div>
            </Tooltip>
            <Tooltip id="narrativeSpeed" showTooltips={showTooltips}>
              <div className="bg-slate-950/40 p-2 rounded border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">Velocidad Locución</label>
                  <span className="text-[10px] text-slate-300 font-mono">{voiceSpeed.toFixed(1)}x</span>
                </div>
                <input 
                  type="range" min="0.5" max="1.5" step="0.1" 
                  value={voiceSpeed} 
                  onChange={(e) => updateState({ voiceSpeed: parseFloat(e.target.value) })} 
                  className="w-full accent-slate-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" 
                />
              </div>
            </Tooltip>
            <Tooltip id="narrativeVolume" showTooltips={showTooltips}>
              <div>
                <label className="block text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1 flex items-center justify-between">
                  <span><Volume1 className="w-3 h-3 inline mr-1" /> Vol. IA</span>
                  <span className="text-rose-400">{Math.round(volVoice * 100)}%</span>
                </label>
                <input type="range" min="0" max="1" step="0.05" value={volVoice} onChange={(e) => setVolVoice(parseFloat(e.target.value))} className="w-full accent-rose-600 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
              </div>
            </Tooltip>
          </div>

          {/* MONSTERIZE SLIDER */}
          <Tooltip id="narrativeMonsterize" showTooltips={showTooltips}>
            <div className="bg-rose-950/20 p-3 rounded border border-rose-900/30 shadow-[inset_0_0_10px_rgba(225,29,72,0.1)]">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] text-rose-400 font-mono uppercase flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Efecto de Voz (Global)
                </label>
                <span className="text-[10px] text-rose-500 font-mono font-bold">{Math.round(monsterLevel * 100)}%</span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.01" 
                value={monsterLevel} 
                onChange={(e) => updateState({ monsterLevel: parseFloat(e.target.value) })} 
                className="w-full accent-rose-500 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer" 
              />
            </div>
          </Tooltip>

          {/* Control de Semilla (Voz / TTS ComfyUI) */}
          <div className="p-3 bg-slate-950/40 rounded border border-slate-800 space-y-2">
            <Tooltip id="narrativeRandomSeed" showTooltips={showTooltips} inline>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                <input 
                  type="checkbox" 
                  className="accent-rose-500 rounded cursor-pointer"
                  checked={useRandomSeed} 
                  onChange={(e) => updateState({ useRandomSeed: e.target.checked })} 
                />
                <span className="font-mono text-[10px] text-slate-300">USAR SEMILLA ALEATORIA (RANDOM SEED)</span>
              </label>
            </Tooltip>

            {!useRandomSeed && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-mono">SEMILLA FIJA:</span>
                <Tooltip id="narrativeCustomSeed" showTooltips={showTooltips} inline>
                  <input 
                    type="number" 
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-rose-300 font-mono focus:outline-none focus:border-rose-500 w-36"
                    value={customSeed} 
                    onChange={(e) => updateState({ customSeed: parseInt(e.target.value) || 0 })} 
                    placeholder="Ej: 798635"
                  />
                </Tooltip>
              </div>
            )}
          </div>

          {/* SFX Mix */}
          <div className="p-3 bg-slate-950/40 rounded border border-slate-800">
            <Tooltip id="narrativeSfxChannel" showTooltips={showTooltips}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] text-slate-400 font-mono uppercase flex items-center gap-1">
                  <Waves className="w-3 h-3" /> Canal SFX
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-cyan-400 font-mono">{Math.round(volSfx * 100)}%</span>
                  <Tooltip id="narrativeSfxVol" inline showTooltips={showTooltips}>
                    <input type="range" min="0" max="1" step="0.05" value={volSfx} onChange={(e) => setVolSfx(parseFloat(e.target.value))} className="w-20 accent-cyan-600 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                  </Tooltip>
                </div>
              </div>
            </Tooltip>
            <div className="flex gap-2">
              <input value={sfxDesc} onChange={(e) => updateState({ sfxDesc: e.target.value })} className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded text-[10px] outline-none" placeholder="Tono para la IA..." />
              <Tooltip id="narrativeSfxFile" inline showTooltips={showTooltips}>
                <button onClick={() => sfxInputRef.current?.click()} className={`p-2 rounded border ${sfxFile ? 'bg-cyan-900 border-cyan-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400 hover:text-white'}`}><Upload className="w-3 h-3" /></button>
              </Tooltip>
              <input type="file" ref={sfxInputRef} hidden accept="audio/*" onChange={(e) => handleFileUpload('sfx', e.target.files?.[0] || null)} />
            </div>
          </div>

          {/* Music Mix */}
          <div className="p-3 bg-slate-950/40 rounded border border-slate-800">
            <Tooltip id="narrativeMusicChannel" showTooltips={showTooltips}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] text-slate-400 font-mono uppercase flex items-center gap-1">
                  <Music className="w-3 h-3" /> Canal Música
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-amber-400 font-mono">{Math.round(volMusic * 100)}%</span>
                  <Tooltip id="narrativeMusicVol" inline showTooltips={showTooltips}>
                    <input type="range" min="0" max="1" step="0.05" value={volMusic} onChange={(e) => setVolMusic(parseFloat(e.target.value))} className="w-20 accent-amber-600 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                  </Tooltip>
                </div>
              </div>
            </Tooltip>
            <div className="flex gap-2">
              <input value={musicDesc} onChange={(e) => updateState({ musicDesc: e.target.value })} className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded text-[10px] outline-none" placeholder="Tono para la IA..." />
              <Tooltip id="narrativeMusicFile" inline showTooltips={showTooltips}>
                <button onClick={() => musicInputRef.current?.click()} className={`p-2 rounded border ${musicFile ? 'bg-amber-900 border-amber-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400 hover:text-white'}`}><Upload className="w-3 h-3" /></button>
              </Tooltip>
              <input type="file" ref={musicInputRef} hidden accept="audio/*" onChange={(e) => handleFileUpload('music', e.target.files?.[0] || null)} />
            </div>
          </div>

          <Tooltip id="narrativeGenerateAudioBtn" showTooltips={showTooltips}>
            <button
              onClick={handleGenerateAudio}
              disabled={loadingAudio || !scriptES}
              className="w-full py-3 bg-rose-700 hover:bg-rose-600 text-white font-bold rounded flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-50"
            >
              {loadingAudio ? <Loader2 className="animate-spin w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
              {loadingAudio ? 'SINTETIZANDO ENTIDADES...' : 'GENERAR AUDIO DUAL (ES + EN)'}
            </button>
          </Tooltip>

          <div className="flex flex-col items-center justify-center min-h-[180px] border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/20 p-4">
             {loadingAudio ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex gap-1 h-8 items-end">
                    {[1,2,3,4,5,6,7,8].map(i => (
                      <div key={i} className="w-1 bg-rose-500 animate-bounce" style={{ height: `${Math.random()*100}%`, animationDelay: `${i*0.1}s` }}></div>
                    ))}
                  </div>
                  <p className="text-[10px] text-rose-400 font-mono animate-pulse uppercase">Manifestando Voces...</p>
                </div>
             ) : voiceBufferES ? (
               <div className="flex flex-col items-center gap-4 w-full">
                  <div className="flex gap-3 w-full">
                    <Tooltip id="narrativePlayEs" inline showTooltips={showTooltips} className="flex-1">
                      <button onClick={() => playMix('ES')} className="w-full py-3 bg-rose-800 hover:bg-rose-700 text-[10px] font-bold rounded border border-rose-600 flex flex-col items-center gap-1 transition-all">
                        <Play className="w-4 h-4" /> REPRODUCIR (ES)
                      </button>
                    </Tooltip>
                    <Tooltip id="narrativePlayEn" inline showTooltips={showTooltips} className="flex-1">
                      <button onClick={() => playMix('EN')} disabled={!voiceBufferEN} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-[10px] font-bold rounded border border-slate-600 flex flex-col items-center gap-1 transition-all">
                        <Play className="w-4 h-4" /> PLAY (EN)
                      </button>
                    </Tooltip>
                  </div>
                  
                  {/* Download Controls */}
                  <div className="w-full bg-black/40 p-3 rounded border border-slate-800 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                       <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">Descargas Espectrales</span>
                       <Tooltip id="narrativeDownloadFormat" inline showTooltips={showTooltips}>
                         <div className="flex bg-slate-900 p-0.5 rounded border border-slate-800">
                            {['WAV', 'MP3'].map(fmt => (
                              <button 
                                key={fmt} 
                                onClick={() => setDownloadFormat(fmt as any)}
                                className={`px-2 py-0.5 text-[8px] rounded font-bold transition-all ${downloadFormat === fmt ? 'bg-rose-900 text-white' : 'text-slate-600'}`}
                              >
                                {fmt}
                              </button>
                            ))}
                         </div>
                       </Tooltip>
                    </div>
                    <div className="flex gap-2">
                       <Tooltip id="narrativeDownloadEs" inline showTooltips={showTooltips} className="flex-1">
                         <button onClick={() => downloadFile('ES')} disabled={isProcessingDownload} className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-[9px] font-mono rounded flex items-center justify-center gap-2 border border-slate-700">
                            {isProcessingDownload ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            VERSIÓN ES
                         </button>
                       </Tooltip>
                       <Tooltip id="narrativeDownloadEn" inline showTooltips={showTooltips} className="flex-1">
                         <button onClick={() => downloadFile('EN')} disabled={!voiceBufferEN || isProcessingDownload} className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-[9px] font-mono rounded flex items-center justify-center gap-2 border border-slate-700 disabled:opacity-30">
                            {isProcessingDownload ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            VERSIÓN EN
                         </button>
                       </Tooltip>
                    </div>
                  </div>

                  <button onClick={stopAll} className="w-full py-1 text-[9px] text-slate-600 hover:text-rose-400 font-mono uppercase transition-colors">Disipar Manifestación</button>
               </div>
             ) : (
               <div className="flex flex-col items-center gap-2 opacity-20">
                 <Headphones className="w-10 h-10" />
                 <p className="text-[10px] font-mono uppercase tracking-widest">Silencio en la Niebla</p>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NarrativeGenerator;
