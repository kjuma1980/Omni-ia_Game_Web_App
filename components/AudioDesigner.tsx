
import React, { useState, useRef, useEffect } from 'react';
import { generateAtmosphere, refinePrompt } from '../services/aiProvider';
import { ProjectData } from '../types';
import { Mic2, Music4, Volume2, Radio, Music, Zap, Play, Square, Download, Loader2, StopCircle, Wand2, X } from 'lucide-react';
import { audioBufferToWav } from '../utils/audioUtils';
import Tooltip from './Tooltip';
import PencilSparkleAnimation from './PencilSparkleAnimation';

interface AudioDesignerProps {
  state: ProjectData['audioState'];
  updateState: (updates: Partial<ProjectData['audioState']>) => void;
  apiSettings?: ProjectData['apiSettings'];
  showTooltips?: boolean;
}

const LANGUAGES = [
  { code: 'ES', label: 'ESPAÑOL' },
  { code: 'EN', label: 'ENGLISH' },
  { code: 'PT', label: 'PORTUGUÊS' },
  { code: 'FR', label: 'FRANÇAIS' },
  { code: 'JA', label: '日本語' },
  { code: 'KO', label: '한국어' },
  { code: 'ZH', label: '中文' },
];

const AudioDesigner: React.FC<AudioDesignerProps> = ({ state, updateState, apiSettings, showTooltips }) => {
  const { category } = state;
  const activeSubState = category === 'sfx' ? state.sfx : state.music;
  const { title, prompt, lyrics, language, isInstrumental, genre, style, singerGender, duration, injectDuration, bpm, audioUrl, isSoundscape, useRandomSeed: rawUseRandomSeed, customSeed: rawCustomSeed } = activeSubState;
  const useRandomSeed = rawUseRandomSeed ?? true;
  const customSeed = rawCustomSeed ?? 798635;

  const updateSubState = (updates: Partial<typeof state.sfx>) => {
    if (category === 'sfx') {
      updateState({
        sfx: { ...state.sfx, ...updates }
      });
    } else {
      updateState({
        music: { ...state.music, ...updates }
      });
    }
  };

  const isDurationActive = injectDuration ?? true;
  const currentBpm = bpm ?? 110;
  const showBpm = category === 'music' || (category === 'sfx' && !!isSoundscape);
  const [loading, setLoading] = useState(false);
  const [refiningSfxPrompt, setRefiningSfxPrompt] = useState(false);
  const [refiningMusicPrompt, setRefiningMusicPrompt] = useState(false);
  const [refiningMusicLyrics, setRefiningMusicLyrics] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<'WAV' | 'MP3'>('WAV');
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [playbackTime, setPlaybackTime] = useState(0);
  
  const genres = ['Ambient', 'Cinematic', 'Electronic', 'Rock', 'Jazz', 'Classical', 'Hip-Hop', 'Orchestral', 'Pop'];
  const styles = ['Dark', 'Upbeat', 'Minimalist', 'Epic', 'Retro', 'Futuristic', 'Calm', 'Intense', 'Balada', 'Balada Romántica'];
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSources = useRef<AudioBufferSourceNode[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);
  const playbackTimerRef = useRef<any>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const lastDecodedUrlRef = useRef<string | null>(null);

  const abortSfxRefineRef = useRef<AbortController | null>(null);
  const abortMusicRefineRef = useRef<AbortController | null>(null);
  const abortLyricsRefineRef = useRef<AbortController | null>(null);

  // Auto-decoding saved audio URL on tab switch or category switch
  useEffect(() => {
    if (!audioUrl) {
      setAudioBuffer(null);
      setIsPlaying(false);
      setPlaybackTime(0);
      lastDecodedUrlRef.current = null;
      return;
    }

    if (audioUrl === lastDecodedUrlRef.current) {
      return;
    }

    const decodeUrl = async () => {
      try {
        console.log(`[Audio Debug] Auto-decoding/fetching saved ${category.toUpperCase()} audio on mount/load...`);
        const ctx = initAudioCtx();
        let bytes: ArrayBuffer | null = null;

        if (audioUrl.startsWith('data:')) {
          const base64Data = audioUrl.split(',')[1];
          if (base64Data) {
            const binary = window.atob(base64Data);
            const len = binary.length;
            const uint8 = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              uint8[i] = binary.charCodeAt(i);
            }
            bytes = uint8.buffer;
          }
        } else {
          // Descargar audio remoto
          let audioBlob: Blob;
          const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
          if (invokeFn) {
            try {
              const base64Url = await invokeFn('proxy_request', {
                url: audioUrl,
                method: 'GET',
                payload: null,
                headers: null
              });
              
              if (base64Url && base64Url.startsWith('data:') && base64Url.includes('base64,')) {
                let mimeType = base64Url.split(';')[0].split(':')[1] || 'audio/mp3';
                if (mimeType === 'application/octet-stream') {
                  mimeType = 'audio/mp3';
                }
                const base64Content = base64Url.split(',')[1];
                const byteCharacters = atob(base64Content);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                audioBlob = new Blob([byteArray], { type: mimeType });
              } else {
                throw new Error("El proxy no devolvió un Data URI binario de audio válido.");
              }
            } catch (err) {
              console.warn(`[Audio Debug] Failed downloading remote audio through proxy, trying standard fetch fallback...`, err);
              const response = await fetch(audioUrl);
              audioBlob = await response.blob();
            }
          } else {
            const response = await fetch(audioUrl);
            audioBlob = await response.blob();
          }
          bytes = await audioBlob.arrayBuffer();
        }

        if (bytes) {
          const decoded = await ctx.decodeAudioData(bytes);
          setAudioBuffer(decoded);
          lastDecodedUrlRef.current = audioUrl;
        }
      } catch (err) {
        console.error("[Audio Debug] Failed to auto-decode/fetch audioUrl:", err);
        setAudioBuffer(null);
        lastDecodedUrlRef.current = null;
      }
    };
    decodeUrl();
  }, [audioUrl, category]);

  const formatTime = (timeInSecs: number) => {
    const mins = Math.floor(timeInSecs / 60);
    const secs = Math.floor(timeInSecs % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const initAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    if (!gainNodeRef.current) {
      gainNodeRef.current = audioCtxRef.current.createGain();
      gainNodeRef.current.gain.value = volume;
      gainNodeRef.current.connect(audioCtxRef.current.destination);
    }
    return audioCtxRef.current;
  };

  const stopAll = () => {
    activeSources.current.forEach(source => {
      try { source.stop(); } catch(_e) { /* already stopped */ }
    });
    activeSources.current = [];
    setIsPlaying(false);
    setPlaybackTime(0);
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  };

  const buildPrompt = (): string => {
    if (category === 'sfx') {
      if (isSoundscape) {
        return `[Soundscape: Environmental background noise, atmospheric textures, no instruments, no beat, no music, no vocals] [BPM: ${currentBpm}] Description: ${prompt}`;
      }
      return `[SFX] ${prompt}`;
    }

    // Music mode
    const parts: string[] = [];
    parts.push(`[Language: ${language || 'ES'}]`);
    parts.push(`[${isInstrumental ? 'Instrumental only, no vocals, no singing' : 'Vocal'}]`);
    if (genre) parts.push(`Genre: ${genre}.`);
    if (style) parts.push(`Style: ${style}.`);
    parts.push(`Description: ${prompt}`);
    if (!isInstrumental && lyrics) {
      parts.push(`Lyrics: ${lyrics}`);
    }
    if (!isInstrumental && singerGender) {
      parts.push(`Singer: ${singerGender}.`);
    }
    return parts.join(' ');
  };

  const estimateSongDuration = (lyricsVal: string, isInstrumentalVal: boolean, bpmVal: number, categoryVal: string): number => {
    if (categoryVal === 'sfx') {
      return 10;
    }
    
    const safeBpm = bpmVal > 0 ? bpmVal : 190;
    
    if (isInstrumentalVal) {
      // 64 compases (bars) estándar para pistas instrumentales
      const totalBeats = 64 * 4;
      return Math.round((totalBeats / safeBpm) * 60);
    }
    
    const cleanLyrics = lyricsVal || '';
    const words = cleanLyrics.trim().split(/\s+/).filter(w => w.length > 0).length;
    
    if (words === 0) {
      const totalBeats = 64 * 4;
      return Math.round((totalBeats / safeBpm) * 60);
    }
    
    const totalBeats = (words * 2.5) + 35;
    const estimated = Math.round((totalBeats / safeBpm) * 60);
    
    // Límites de la herramienta del usuario: mínimo 30s, máximo 600s
    return Math.max(30, Math.min(600, estimated));
  };

  const calculateEstimatedDuration = (): number => {
    if (duration && duration > 0) {
      return duration;
    }
    if (category === 'sfx') {
      return 10;
    }
    return estimateSongDuration(lyrics, isInstrumental, currentBpm, category);
  };

  const handleGenerate = async () => {
    if (!prompt) return;
    setLoading(true);
    stopAll();
    setAudioBuffer(null);
    lastDecodedUrlRef.current = null;
    
    try {
      const combinedPrompt = buildPrompt();
      const isSfx = category === 'sfx';
      const estimatedDuration = isDurationActive ? calculateEstimatedDuration() : undefined;
      const result = await generateAtmosphere(combinedPrompt, apiSettings, isSfx, estimatedDuration, {
        lyrics,
        language,
        isInstrumental,
        genre,
        style,
        singerGender,
        title: title || 'Sonic Track',
        useRandomSeed,
        customSeed: typeof customSeed === 'number' ? customSeed : Number(customSeed)
      });
      let audioBlob: Blob;
      let finalUrl = '';

      if (result instanceof Blob) {
        audioBlob = result;
        finalUrl = URL.createObjectURL(result);
      } else {
        finalUrl = result as string;
        if (!finalUrl) {
          throw new Error("El proveedor de música no devolvió una URL ni datos de audio válidos.");
        }
        if (finalUrl.startsWith('data:') && finalUrl.includes('base64,')) {
          let mimeType = finalUrl.split(';')[0].split(':')[1] || 'audio/wav';
          if (mimeType === 'application/octet-stream') {
            mimeType = 'audio/mp3';
          }
          const base64Content = finalUrl.split(',')[1];
          const byteCharacters = atob(base64Content);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          audioBlob = new Blob([byteArray], { type: mimeType });
        } else {
          const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
          if (invokeFn) {
            console.log(`[Omni IA Game] Downloading audio file through Tauri proxy to bypass CORS: ${finalUrl}`);
            try {
              const base64Url = await invokeFn('proxy_request', {
                url: finalUrl,
                method: 'GET',
                payload: null,
                headers: null
              });
              
              if (base64Url && base64Url.startsWith('data:') && base64Url.includes('base64,')) {
                let mimeType = base64Url.split(';')[0].split(':')[1] || 'audio/mp3';
                if (mimeType === 'application/octet-stream') {
                  mimeType = 'audio/mp3';
                }
                const base64Content = base64Url.split(',')[1];
                const byteCharacters = atob(base64Content);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                audioBlob = new Blob([byteArray], { type: mimeType });
              } else {
                throw new Error("El proxy no devolvió un Data URI binario de audio válido.");
              }
            } catch (err: any) {
              console.warn(`[Omni IA Game] Failed downloading audio through proxy, trying standard fetch fallback...`, err);
              const response = await fetch(finalUrl);
              audioBlob = await response.blob();
            }
          } else {
            const response = await fetch(finalUrl);
            audioBlob = await response.blob();
          }
        }
      }

      if (!audioBlob || audioBlob.size === 0) {
        throw new Error("El archivo de audio descargado está vacío o no contiene datos válidos.");
      }

      const arrayBuffer = await audioBlob.arrayBuffer();
      const ctx = initAudioCtx();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

      setAudioBuffer(decodedBuffer);
      lastDecodedUrlRef.current = finalUrl;
      updateSubState({ audioUrl: finalUrl });
    } catch (e: any) {
      console.error("Audio generation error:", e);
      alert(`Error generando audio: ${e.message || "Error desconocido"}`);
    } finally {
      setLoading(false);
    }
  };

  const playAudio = () => {
    stopAll();
    if (!audioBuffer) return;
    const ctx = initAudioCtx();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    // Connect through gain node for volume control
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
      source.connect(gainNodeRef.current);
    } else {
      source.connect(ctx.destination);
    }

    const startTime = ctx.currentTime;
    setPlaybackTime(0);

    playbackTimerRef.current = setInterval(() => {
      const elapsed = ctx.currentTime - startTime;
      if (elapsed >= audioBuffer.duration) {
        setPlaybackTime(audioBuffer.duration);
        if (playbackTimerRef.current) {
          clearInterval(playbackTimerRef.current);
          playbackTimerRef.current = null;
        }
      } else {
        setPlaybackTime(elapsed);
      }
    }, 100);

    source.onended = () => {
      setIsPlaying(false);
      setPlaybackTime(0);
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
    source.start(0);
    activeSources.current.push(source);
    setIsPlaying(true);
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = newVolume;
    }
  };

  const downloadAudio = () => {
    if (!audioBuffer) return;
    const blob = audioBufferToWav(audioBuffer);
    const ext = downloadFormat.toLowerCase();
    const catTag = category === 'sfx' ? 'sfx' : 'music';
    const filename = `${title || catTag}_${Date.now()}.${ext}`;

    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64data = reader.result as string;
      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;

      if (invokeFn) {
        try {
          await invokeFn('save_audio_file', {
            b64Data: base64data,
            filename: filename,
            format: ext
          });
          if (downloadFormat === 'MP3') {
            alert("Audio guardado. Nota: El formato real interno es WAV de alta calidad.");
          } else {
            alert("Audio guardado con éxito.");
          }
        } catch (e: any) {
          if (e !== "Operación cancelada por el usuario" && e !== "Operation cancelled by user") {
            alert("Error al guardar el audio: " + e);
          }
        }
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 250);
      }
    };
  };


  return (
    <div className="flex h-full p-6 gap-6">
      {/* Left Panel — Controls */}
      <div className="w-1/2 flex flex-col gap-6">
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
            <h2 className="text-2xl text-amber-500 font-bold flex items-center gap-2">
              <Mic2 className="w-6 h-6" />
              Sonic Forge
            </h2>
            <Tooltip id="audioClearBtn" inline showTooltips={showTooltips}>
              <button
                onClick={() => {
                  if (!confirmClear) {
                    setConfirmClear(true);
                    setTimeout(() => setConfirmClear(false), 4000);
                    return;
                  }
                  setConfirmClear(false);
                  updateSubState({
                    title: '',
                    prompt: '',
                    lyrics: '',
                    audioUrl: null
                  });
                  setAudioBuffer(null);
                  lastDecodedUrlRef.current = null;
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
          </div>
          
          {/* Category Toggle: SFX / MÚSICA */}
          <Tooltip id="audioCategory" showTooltips={showTooltips} className="mb-4">
            <div className="flex gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button 
                onClick={() => updateState({ category: 'sfx' })}
                className={`flex-1 py-2 text-[10px] rounded uppercase font-bold flex items-center justify-center gap-2 transition-all ${category === 'sfx' ? 'bg-amber-900 text-white' : 'text-slate-500'}`}
              >
                <Zap className="w-3 h-3" /> SFX
              </button>
              <button 
                onClick={() => updateState({ category: 'music' })}
                className={`flex-1 py-2 text-[10px] rounded uppercase font-bold flex items-center justify-center gap-2 transition-all ${category === 'music' ? 'bg-amber-900 text-white' : 'text-slate-500'}`}
              >
                <Music className="w-3 h-3" /> MÚSICA
              </button>
            </div>
          </Tooltip>

          <div className="space-y-4">
            {/* TÍTULO — shared */}
            <div>
              <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">TÍTULO</label>
              <Tooltip id="audioTitle" showTooltips={showTooltips}>
                <input type="text" value={title} onChange={(e) => updateSubState({ title: e.target.value })} className="w-full bg-slate-950 border border-slate-700 text-slate-200 p-2 rounded focus:border-amber-500 outline-none text-sm" />
              </Tooltip>
            </div>

            {/* === SFX MODE === */}
            {category === 'sfx' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider flex items-center justify-between">
                    <span>DESCRIPCIÓN SFX</span>
                    {apiSettings?.promptEngineer?.enabled && (
                      <Tooltip id="sfxRefinePromptBtn" position="top" inline>
                        <button
                          type="button"
                          onClick={async () => {
                            if (refiningSfxPrompt) {
                              if (abortSfxRefineRef.current) {
                                abortSfxRefineRef.current.abort();
                                abortSfxRefineRef.current = null;
                              }
                              setRefiningSfxPrompt(false);
                              return;
                            }
                            if (!prompt.trim()) {
                              alert('Escribe una descripción primero para que la IA pueda refinar.');
                              return;
                            }
                            setRefiningSfxPrompt(true);
                            const controller = new AbortController();
                            abortSfxRefineRef.current = controller;
                            try {
                              const refined = await refinePrompt(prompt, '', 'sfx', '', '', apiSettings, { isSoundscape, bpm: currentBpm }, controller.signal);
                              updateSubState({ prompt: refined.positive });
                            } catch (err: any) {
                              if (err?.name === 'AbortError' || String(err).includes('Aborted')) {
                                console.log('[Audio SFX] Refinamiento cancelado.');
                              } else {
                                alert(`Error del Prompt Engineer: ${err.message || err}`);
                              }
                            } finally {
                              setRefiningSfxPrompt(false);
                              abortSfxRefineRef.current = null;
                            }
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                            refiningSfxPrompt
                              ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse shadow-md shadow-red-900/40 cursor-pointer border border-red-500'
                              : 'bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border border-amber-700/50'
                          }`}
                          title="Refinar prompt con IA"
                        >
                          {refiningSfxPrompt ? <PencilSparkleAnimation className="w-3.5 h-3.5" /> : <Wand2 className="w-3 h-3" />}
                          {refiningSfxPrompt ? '⏹ DETENER REFINADO' : '✨ REFINAR CON IA'}
                        </button>
                      </Tooltip>
                    )}
                  </label>
                  <Tooltip id="audioPrompt" showTooltips={showTooltips}>
                    <textarea value={prompt} onChange={(e) => updateSubState({ prompt: e.target.value })} className="w-full h-28 bg-slate-950 border border-slate-700 text-slate-200 p-3 rounded focus:border-amber-500 outline-none font-mono resize-none text-sm" placeholder="Ej: Explosión de roca en caverna con eco largo..." />
                  </Tooltip>
                </div>

                {/* Switch / Toggle Ambiente / Soundscape */}
                <Tooltip id="audioSoundscapeToggle" showTooltips={showTooltips}>
                  <label className="flex items-center justify-between p-3 rounded-lg bg-amber-950/10 border border-amber-900/30 cursor-pointer transition-all hover:bg-amber-950/20 select-none">
                    <div className="flex items-center gap-2.5">
                      <Radio className={`w-4 h-4 transition-colors ${isSoundscape ? 'text-amber-500 animate-pulse' : 'text-slate-500'}`} />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-300 font-mono uppercase tracking-wide">AMBIENTE / SOUNDSCAPE</span>
                        <span className="text-[10px] text-slate-500">Activar para paisajes sonoros y texturas atmosféricas continuas</span>
                      </div>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={!!isSoundscape} 
                      onChange={(e) => {
                        const checked = e.target.checked;
                        updateSubState({ 
                          isSoundscape: checked,
                          duration: checked ? 60 : 2 
                        });
                      }} 
                      className="cursor-pointer accent-amber-500 w-4 h-4 rounded" 
                    />
                  </label>
                </Tooltip>
              </div>
            )}

            {/* === MUSIC MODE === */}
            {category === 'music' && (
              <>
                {/* Toggle Instrumental */}
                <div className="flex items-center gap-4">
                  <Tooltip id="audioInstrumental" showTooltips={showTooltips}>
                    <label className="flex items-center gap-2 text-slate-400 text-xs font-mono uppercase tracking-wider cursor-pointer">
                      <input type="checkbox" checked={isInstrumental} onChange={(e) => updateSubState({ isInstrumental: e.target.checked })} className="cursor-pointer accent-amber-500" />
                      SOLO INSTRUMENTAL
                    </label>
                  </Tooltip>
                </div>

                {/* Language Selector */}
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">IDIOMA</label>
                  <Tooltip id="audioLanguage" showTooltips={showTooltips}>
                    <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                      {LANGUAGES.map((lang) => (
                        <button
                          key={lang.code}
                          onClick={() => updateSubState({ language: lang.code })}
                          className={`px-2.5 py-1 text-[9px] rounded font-bold transition-all uppercase ${language === lang.code ? 'bg-amber-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                          {lang.code}
                        </button>
                      ))}
                    </div>
                  </Tooltip>
                </div>

                {/* DESCRIPCIÓN */}
                <div>
                  <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider flex items-center justify-between">
                    <span>DESCRIPCIÓN</span>
                    {apiSettings?.promptEngineer?.enabled && (
                      <Tooltip id="musicRefinePromptBtn" position="top" inline>
                        <button
                          type="button"
                          onClick={async () => {
                            if (refiningMusicPrompt) {
                              if (abortMusicRefineRef.current) {
                                abortMusicRefineRef.current.abort();
                                abortMusicRefineRef.current = null;
                              }
                              setRefiningMusicPrompt(false);
                              return;
                            }
                            if (!prompt.trim()) {
                              alert('Escribe una descripción primero para que la IA pueda refinar.');
                              return;
                            }
                            setRefiningMusicPrompt(true);
                            const controller = new AbortController();
                            abortMusicRefineRef.current = controller;
                            try {
                              const refined = await refinePrompt(prompt, style, 'music', '', '', apiSettings, { genre, singerGender, isInstrumental, lyrics }, controller.signal);
                              updateSubState({ prompt: refined.positive });
                            } catch (err: any) {
                              if (err?.name === 'AbortError' || String(err).includes('Aborted')) {
                                console.log('[Audio Music] Refinamiento cancelado.');
                              } else {
                                alert(`Error del Prompt Engineer: ${err.message || err}`);
                              }
                            } finally {
                              setRefiningMusicPrompt(false);
                              abortMusicRefineRef.current = null;
                            }
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                            refiningMusicPrompt
                              ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse shadow-md shadow-red-900/40 cursor-pointer border border-red-500'
                              : 'bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border border-amber-700/50'
                          }`}
                          title="Refinar prompt con IA"
                        >
                          {refiningMusicPrompt ? <PencilSparkleAnimation className="w-3.5 h-3.5" /> : <Wand2 className="w-3 h-3" />}
                          {refiningMusicPrompt ? '⏹ DETENER REFINADO' : '✨ REFINAR CON IA'}
                        </button>
                      </Tooltip>
                    )}
                  </label>
                  <Tooltip id="audioPrompt" showTooltips={showTooltips}>
                    <textarea value={prompt} onChange={(e) => updateSubState({ prompt: e.target.value })} className="w-full h-20 bg-slate-950 border border-slate-700 text-slate-200 p-3 rounded focus:border-amber-500 outline-none font-mono resize-none text-sm" placeholder="Ej: Balada épica con coros y cuerdas..." />
                  </Tooltip>
                </div>

                {/* LYRICS — only when vocal mode */}
                {!isInstrumental && (
                  <div>
                    <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider flex items-center justify-between">
                      <span>LYRICS</span>
                      {apiSettings?.promptEngineer?.enabled && (
                        <Tooltip id="musicRefineLyricsBtn" position="top" inline>
                          <button
                            type="button"
                            onClick={async () => {
                              if (refiningMusicLyrics) {
                                if (abortLyricsRefineRef.current) {
                                  abortLyricsRefineRef.current.abort();
                                  abortLyricsRefineRef.current = null;
                                }
                                setRefiningMusicLyrics(false);
                                return;
                              }
                              setRefiningMusicLyrics(true);
                              const controller = new AbortController();
                              abortLyricsRefineRef.current = controller;
                              try {
                                const refined = await refinePrompt(lyrics || '', style, 'music', '', '', apiSettings, { refineLyrics: true, language: language || 'ES', genre, singerGender, isInstrumental, musicDescription: prompt }, controller.signal);
                                updateSubState({ lyrics: refined.positive });
                              } catch (err: any) {
                                if (err?.name === 'AbortError' || String(err).includes('Aborted')) {
                                  console.log('[Audio Lyrics] Refinamiento cancelado.');
                                } else {
                                  alert(`Error del Prompt Engineer: ${err.message || err}`);
                                }
                              } finally {
                                setRefiningMusicLyrics(false);
                                abortLyricsRefineRef.current = null;
                              }
                            }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                              refiningMusicLyrics
                                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse shadow-md shadow-red-900/40 cursor-pointer border border-red-500'
                                : 'bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border border-amber-700/50'
                            }`}
                            title="Generar o Refinar Letra"
                          >
                            {refiningMusicLyrics ? <PencilSparkleAnimation className="w-3.5 h-3.5" /> : <Wand2 className="w-3 h-3" />}
                            {refiningMusicLyrics ? '⏹ DETENER LETRA' : '✨ REFINAR LETRA'}
                          </button>
                        </Tooltip>
                      )}
                    </label>
                    <Tooltip id="audioLyrics" showTooltips={showTooltips}>
                      <textarea value={lyrics} onChange={(e) => updateSubState({ lyrics: e.target.value })} className="w-full h-28 bg-slate-950 border border-slate-700 text-slate-200 p-3 rounded focus:border-amber-500 outline-none font-mono resize-none text-sm" placeholder="Escribe la letra de la canción aquí..." />
                    </Tooltip>
                  </div>
                )}

                {/* Genres & Styles */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">GÉNERO</label>
                    <Tooltip id="audioGenre" showTooltips={showTooltips}>
                      <select value={genre} onChange={(e) => updateSubState({ genre: e.target.value })} className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded focus:border-amber-500 outline-none text-sm">
                        <option value="">Seleccionar...</option>
                        {genres.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </Tooltip>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">ESTILO</label>
                    <Tooltip id="audioStyle" showTooltips={showTooltips}>
                      <select value={style} onChange={(e) => updateSubState({ style: e.target.value })} className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded focus:border-amber-500 outline-none text-sm">
                        <option value="">Seleccionar...</option>
                        {styles.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Tooltip>
                  </div>
                </div>

                {/* Singer Gender — only when vocal mode */}
                {!isInstrumental && (
                  <div>
                    <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">GÉNERO CANTANTE</label>
                    <Tooltip id="audioSingerGender" showTooltips={showTooltips}>
                      <select value={singerGender || ''} onChange={(e) => updateSubState({ singerGender: e.target.value as 'male' | 'female' | 'duet' })} className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded focus:border-amber-500 outline-none text-sm">
                        <option value="">Seleccionar...</option>
                        <option value="male">Hombre</option>
                        <option value="female">Mujer</option>
                        <option value="duet">Dúo (Hombre y Mujer)</option>
                      </select>
                    </Tooltip>
                  </div>
                )}

              </>
            )}

            {/* Duration Toggle & Input */}
            <div className="space-y-3 pt-2 border-t border-slate-800/40">
              <div className="flex items-center gap-4">
                <Tooltip id="audioInjectDuration" showTooltips={showTooltips}>
                  <label className="flex items-center gap-2 text-slate-400 text-xs font-mono uppercase tracking-wider cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={isDurationActive} 
                      onChange={(e) => updateSubState({ injectDuration: e.target.checked })} 
                      className="cursor-pointer accent-amber-500" 
                    />
                    FORZAR DURACIÓN EN EL WORKFLOW
                  </label>
                </Tooltip>
              </div>

              {isDurationActive && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-3">
                  <div className={showBpm ? "grid grid-cols-2 gap-3" : "w-full"}>
                    {/* BPM Input — only when showBpm is active */}
                    {showBpm && (
                      <div>
                        <label className="block text-slate-400 text-xs font-mono uppercase tracking-wider mb-1">TEMPO (BPM)</label>
                        <Tooltip id="audioBpm" showTooltips={showTooltips}>
                          <input 
                            type="number" 
                            min="40" 
                            max="240" 
                            value={currentBpm} 
                            onChange={(e) => {
                              const newBpm = parseInt(e.target.value) || 110;
                              updateSubState({ bpm: newBpm });
                            }} 
                            className="w-full bg-slate-950 border border-slate-700 text-slate-200 p-2 rounded focus:border-amber-500 outline-none text-sm font-mono text-center" 
                          />
                        </Tooltip>
                      </div>
                    )}

                    {/* Duration Input */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-slate-400 text-xs font-mono uppercase tracking-wider">SEGUNDOS</label>
                        {category === 'music' && !isInstrumental && lyrics && (
                          <button
                            type="button"
                            onClick={() => {
                              const estimated = estimateSongDuration(lyrics, isInstrumental, currentBpm, category);
                              updateSubState({ duration: estimated });
                            }}
                            className="text-[10px] text-amber-500 hover:text-amber-400 font-medium hover:underline focus:outline-none"
                          >
                            Estimar
                          </button>
                        )}
                      </div>
                      <Tooltip id="audioDuration" showTooltips={showTooltips}>
                        <input 
                          type="number" 
                          min={category === 'sfx' && !isSoundscape ? 1 : 30}
                          max="600" 
                          value={duration} 
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            updateSubState({ duration: isNaN(val) ? (category === 'sfx' && !isSoundscape ? 2 : 30) : val });
                          }} 
                          className="w-full bg-slate-950 border border-slate-700 text-slate-200 p-2 rounded focus:border-amber-500 outline-none text-sm font-mono text-center" 
                        />
                      </Tooltip>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Seed Control (Random vs Fixed) */}
            <div className="space-y-3 pt-2 border-t border-slate-800/40">
              <div className="flex items-center gap-4">
                <Tooltip id="audioUseRandomSeed" showTooltips={showTooltips}>
                  <label className="flex items-center gap-2 text-slate-400 text-xs font-mono uppercase tracking-wider cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={useRandomSeed} 
                      onChange={(e) => updateSubState({ useRandomSeed: e.target.checked })} 
                      className="cursor-pointer accent-amber-500" 
                    />
                    USAR SEMILLA ALEATORIA (RANDOM SEED)
                  </label>
                </Tooltip>
              </div>

              {!useRandomSeed && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="block text-slate-400 text-xs font-mono uppercase tracking-wider mb-1">SEMILLA FIJA (CUSTOM SEED)</label>
                  <Tooltip id="audioCustomSeed" showTooltips={showTooltips}>
                    <input 
                      type="number" 
                      value={customSeed} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        updateSubState({ customSeed: isNaN(val) ? 0 : val });
                      }} 
                      className="w-full bg-slate-950 border border-slate-700 text-slate-200 p-2 rounded focus:border-amber-500 outline-none text-sm font-mono text-center" 
                      placeholder="Ej: 798635597245109"
                    />
                  </Tooltip>
                </div>
              )}
            </div>
          </div>

          {/* Generate Button */}
          <Tooltip id="audioGenerateBtn" showTooltips={showTooltips}>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full mt-6 py-3 font-bold rounded flex items-center justify-center gap-2 transition-colors shadow-lg bg-amber-700 hover:bg-amber-600 text-white uppercase text-sm"
            >
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              {loading ? 'GENERANDO...' : (category === 'sfx' ? 'GENERAR SFX' : 'GENERAR MÚSICA')}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Right Panel — Player */}
      <div className="w-1/2 bg-slate-950 border-x-4 border-amber-900/30 p-8 relative overflow-y-auto rounded-lg shadow-inner flex flex-col items-center justify-center">
        {audioBuffer ? (
          <div className="flex flex-col items-center justify-center w-full space-y-6">
            {/* Audio Icon */}
            <div className={`bg-amber-900/20 p-8 rounded-full border border-amber-500/30 ${isPlaying ? 'animate-pulse' : ''}`}>
              <Music4 className="w-16 h-16 text-amber-500" />
            </div>

            {/* Title */}
            <p className="text-xs text-slate-400 font-mono uppercase tracking-widest">
              {title || (category === 'sfx' ? 'SFX GENERADO' : 'MÚSICA GENERADA')}
            </p>

            {/* Track Time */}
            <div className="text-sm font-mono text-amber-500 bg-slate-900/60 px-4 py-1.5 rounded-full border border-slate-800">
              {formatTime(playbackTime)} / {formatTime(audioBuffer.duration)}
            </div>

            {/* Playback Controls */}
            <div className="flex gap-3 w-full max-w-sm">
              <Tooltip id="audioPlayBtn" showTooltips={showTooltips} className="flex-1">
                <button
                  onClick={playAudio}
                  disabled={isPlaying}
                  className="w-full py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white font-bold rounded flex items-center justify-center gap-2 transition-all text-xs uppercase"
                >
                  <Play className="w-4 h-4" /> REPRODUCIR
                </button>
              </Tooltip>
              <Tooltip id="audioStopBtn" showTooltips={showTooltips} className="flex-1">
                <button
                  onClick={stopAll}
                  disabled={!isPlaying}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white font-bold rounded flex items-center justify-center gap-2 transition-all border border-slate-700 text-xs uppercase"
                >
                  <Square className="w-3.5 h-3.5" /> DETENER
                </button>
              </Tooltip>
            </div>

            {/* Volume Control */}
            <div className="w-full max-w-sm">
              <Tooltip id="audioVolumeControl" showTooltips={showTooltips}>
                <div className="flex items-center gap-3">
                  <Volume2 className="w-4 h-4 text-slate-500 shrink-0" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="flex-1 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-amber-500"
                  />
                  <span className="text-[10px] text-slate-500 font-mono w-8 text-right shrink-0">{Math.round(volume * 100)}%</span>
                </div>
              </Tooltip>
            </div>

            {/* Download Controls */}
            <div className="w-full max-w-sm bg-black/40 p-4 rounded-lg border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">DESCARGAS</span>
                <Tooltip id="audioFormatSelector" showTooltips={showTooltips}>
                  <div className="flex bg-slate-900 p-0.5 rounded border border-slate-800">
                    {(['WAV', 'MP3'] as const).map(fmt => (
                      <button 
                        key={fmt} 
                        onClick={() => setDownloadFormat(fmt)}
                        className={`px-3 py-0.5 text-[9px] rounded font-bold transition-all ${downloadFormat === fmt ? 'bg-amber-900 text-white' : 'text-slate-600'}`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </Tooltip>
              </div>
              <Tooltip id="audioDownloadBtn" showTooltips={showTooltips}>
                <button
                  onClick={downloadAudio}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-amber-500 font-bold rounded flex items-center justify-center gap-2 transition-all border border-slate-700 text-xs uppercase"
                >
                  <Download className="w-3.5 h-3.5" />
                  DESCARGAR {downloadFormat}
                </button>
              </Tooltip>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-700 space-y-4">
            <Radio className="w-16 h-16 opacity-20" />
            <p className="font-mono text-sm uppercase tracking-wider">Esperando entrada sónica...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioDesigner;
