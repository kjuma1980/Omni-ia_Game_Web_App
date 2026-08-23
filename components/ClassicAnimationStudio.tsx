
import React, { useState, useRef } from 'react';
import Tooltip from './Tooltip';
import { AnimationType, ArtStyle, GeneratedAsset, ProjectData } from '../types';
import { ART_STYLES, ANIMATION_TYPES } from '../constants';
import { generateSpriteSheet } from '../services/geminiService';
import { generateImage, generateVideo, refinePrompt } from '../services/aiProvider';
import { generateLocalImage, generateLocalVideo, safeImageSrc } from '../services/localService';
import { ensureLibrary, loadSlots, resolveSlot, slotKeyForAnimation } from '../services/workflowLibrary';
import PencilSparkleAnimation from './PencilSparkleAnimation';
import {
  Activity,
  Loader2,
  Sparkles,
  Info,
  CheckCircle2,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Layers,
  Palette,
  Link as LinkIcon,
  Upload,
  X,
  Video,
  Download,
  Key,
  Image as ImageIcon,
  Server,
  ArrowLeft,
  Wand2
} from 'lucide-react';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const PRINCIPLES = [
  'Squash and Stretch', 'Anticipation', 'Staging', 'Straight Ahead & Pose to Pose',
  'Follow Through & Overlapping', 'Slow In and Slow Out', 'Arcs', 'Secondary Action',
  'Timing', 'Exaggeration', 'Solid Drawing', 'Appeal'
];

interface AnimationStudioProps {
  assets: GeneratedAsset[];
  state: ProjectData['animationState'];
  updateState: (updates: Partial<ProjectData['animationState']>) => void;
  apiSettings?: ProjectData['apiSettings'];
  showTooltips?: boolean;
}

const ClassicAnimationStudio: React.FC<AnimationStudioProps> = ({ assets, state, updateState, apiSettings, showTooltips }) => {
  const {
    selectedType,
    selectedStyle,
    activePrinciples,
    characterDesc,
    negativePrompt,
    resultImage,
    videoUrl,
    gifUrl,
    guideText,
    useConsistency,
    uploadedRef,
    frames
  } = state;

  const useRandomSeed = state.useRandomSeed ?? true;
  const customSeed = state.customSeed ?? 798635;
  const [loading, setLoading] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refinedPulse, setRefinedPulse] = useState(false);
  const abortRefineRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [spriteFrame, setSpriteFrame] = useState(0);
  const [isSpritePlaying, setIsSpritePlaying] = useState(true);
  const [spriteSpeed, setSpriteSpeed] = useState(100); // ms per frame

  // Download handler ÔÇö zero network requests, uses canvas from already-loaded image
  const handleDownload = (imageUrl: string, defaultFilename: string) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { alert('Error: no se pudo crear el canvas.'); return; }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) { alert('Error al exportar la imagen.'); return; }
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = defaultFilename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 200);
        }, 'image/png');
      };
      img.onerror = () => alert('Error al cargar la imagen para descarga.');
      img.src = imageUrl; // Served from browser cache, no network request
    } catch (err) {
      console.error('Download failed:', err);
      alert('Error al descargar el archivo.');
    }
  };

  // Clear all results and return to initial state
  const handleClearResults = () => {
    updateState({
      resultImage: null,
      videoUrl: null,
      gifUrl: null,
      frames: null,
      guideText: ''
    });
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setSpriteFrame(0);
    setIsSpritePlaying(true);
  };

  // Sprite animation timer
  React.useEffect(() => {
    if (gifUrl && isSpritePlaying) {
      const interval = setInterval(() => {
        setSpriteFrame(prev => (prev + 1) % 16);
      }, spriteSpeed);
      return () => clearInterval(interval);
    }
  }, [gifUrl, isSpritePlaying, spriteSpeed]);

  const togglePrinciple = (p: string) => {
    updateState({
      activePrinciples: activePrinciples.includes(p)
        ? activePrinciples.filter(x => x !== p)
        : [...activePrinciples, p]
    });
  };

  const getLastAssetForCharacter = (): GeneratedAsset | undefined => {
    if (!characterDesc) return assets[0]; // Default to first if no name
    return assets.find(a => a.prompt.toLowerCase().includes(characterDesc.toLowerCase())) || assets[0];
  };

  const lastAsset = getLastAssetForCharacter();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateState({ uploadedRef: reader.result as string, useConsistency: true });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateFullAnimation = async () => {
    setLoading(true);
    try {
      let imageUrl = "";
      const details = `Character: ${characterDesc}. Animation: ${selectedType}. Principles: ${activePrinciples.join(', ')}.`;
      const prompt = `Entity: ${characterDesc || "Generic Character"}, Action: ${selectedType}, Style: ${selectedStyle}, Details: ${details}`;

      const videoProvider = apiSettings?.video.provider || 'comfyui';

      // Preparar la imagen de referencia para consistencia visual (ControlNet/IP-Adapter)
      let referenceImage: string | undefined = undefined;
      if (useConsistency) {
        if (uploadedRef) {
          referenceImage = uploadedRef;
        } else if (lastAsset) {
          referenceImage = lastAsset.imageUrl;
        }
      }

      // Check if it is the custom or unified master workflow
      const animSlotKey = slotKeyForAnimation(selectedType);
      const animSlots = loadSlots();
      const slotVal = animSlots[animSlotKey];
      const activeAnimWfJson = slotVal?.jsonStr || apiSettings?.video.customWorkflow;

      let isMasterWorkflow = false;
      if (activeAnimWfJson) {
        try {
          const parsedWorkflow = JSON.parse(activeAnimWfJson);
          isMasterWorkflow = parsedWorkflow["out_walk_save_video"] !== undefined || parsedWorkflow["out_idle_save_video"] !== undefined;
        } catch (e) {}
      }

      if (videoProvider === 'comfyui' && isMasterWorkflow && apiSettings?.video.baseUrl) {
        console.log(`[Omni IA Game] Master workflow detected in UI. Executing single-pass animation pipeline...`);
        setVideoLoading(true);
        const positivePrompt = `${characterDesc ? characterDesc + ', ' : ''}performing ${selectedType}, style: ${selectedStyle}, smooth animation applying principles: ${activePrinciples.join(', ')}`;
        
        const resultPayload = await generateLocalVideo(
          apiSettings.video.baseUrl,
          positivePrompt,
          apiSettings.video.apiKey,
          apiSettings.video.provider,
          referenceImage, // We pass the visual reference directly as the character image input!
          apiSettings.video.workflowId,
          negativePrompt,
          activeAnimWfJson,
          apiSettings.video.promptNode,
          apiSettings.video.negativeNode,
          apiSettings.video.imageNode
        );

        let finalVideo = "";
        let finalSheet = null;
        let finalFrames = null;
        let finalKeyframe = null;

        try {
          if (resultPayload.startsWith('{')) {
            const parsed = JSON.parse(resultPayload);
            finalVideo = parsed.videoUrl;
            finalSheet = parsed.spriteSheetUrl || null;
            finalFrames = parsed.frames || null;
            finalKeyframe = parsed.resultImage || null;
          }
        } catch (err) {
          console.warn("[Omni IA Game] Failed to parse master workflow result:", err);
        }

        updateState({
          resultImage: finalKeyframe || referenceImage || null,
          videoUrl: finalVideo,
          gifUrl: finalSheet,
          frames: finalFrames,
          guideText: `¡Animación del workflow maestro generada con éxito para la acción ${selectedType}!\n- Los visualizadores de la derecha muestran el video MP4, spritesheet y frames individuales.`
        });
        
        setLoading(false);
        setVideoLoading(false);
        return;
      }

      // --- FASE 1: Generación de la imagen del Keyframe base ---
      if (videoProvider === 'openart' || videoProvider === 'youart') {
        const endpoint = videoProvider === 'openart' ? 'https://openart.ai/api/v1/generate' : 'https://youart.ai/api/v1/image';
        console.log(`[Omni IA Game] Generando keyframe usando la API de ${videoProvider.toUpperCase()}.`);
        imageUrl = await generateLocalImage(
          endpoint,
          prompt,
          negativePrompt || "",
          512,
          512,
          apiSettings?.video.apiKey
        );
      } else if (videoProvider === 'gemini') {
        console.log(`[Omni IA Game] Generando keyframe usando Gemini Cloud.`);
        const modifiedSettings = {
          ...apiSettings,
          image: {
            ...apiSettings?.image,
            provider: 'gemini' as const
          }
        };

        imageUrl = await generateImage(
          prompt,
          negativePrompt || "text, watermark, blurry",
          modifiedSettings,
          referenceImage,
          'sprite',
          undefined,
          {
            style: selectedStyle,
            action: selectedType,
            details: details
          }
        );
      } else if (videoProvider === 'comfydeploy') {
        console.log(`[Omni IA Game] Generando keyframe usando ComfyDeploy.`);
        const modifiedSettings = {
          ...apiSettings,
          image: {
            ...apiSettings?.image,
            provider: 'comfydeploy' as const,
            comfyDeployApiKey: apiSettings?.video.comfyDeployApiKey,
            comfyDeployDeploymentId: apiSettings?.video.comfyDeployDeploymentId
          }
        };

        imageUrl = await generateImage(
          prompt, 
          negativePrompt || "text, watermark, blurry", 
          modifiedSettings, 
          referenceImage, 
          'sprite',
          undefined,
          {
            style: selectedStyle,
            action: selectedType,
            details: details
          }
        );
      } else {
        console.log(`[Omni IA Game] Generando keyframe usando servidor local de ${videoProvider}.`);
        const localProvider = (videoProvider === 'a1111' ? 'a1111' : 'comfyui');
        const modifiedSettings = {
          ...apiSettings,
          image: {
            ...apiSettings?.image,
            provider: localProvider as any,
            baseUrl: apiSettings?.video.baseUrl || 'http://127.0.0.1:8188',
            apiKey: apiSettings?.video.apiKey
          }
        };

        imageUrl = await generateImage(
          prompt, 
          negativePrompt || "text, watermark, blurry", 
          modifiedSettings, 
          referenceImage, 
          'sprite',
          apiSettings?.video.customWorkflow,
          {
            style: selectedStyle,
            action: selectedType,
            details: details
          }
        );
      }

      if (!imageUrl) {
        throw new Error("No se pudo obtener la imagen del keyframe inicial.");
      }

      // Guardar el Keyframe de inmediato en el estado
      updateState({
        resultImage: imageUrl,
        videoUrl: null,
        gifUrl: null,
        frames: null,
        guideText: `Keyframe base generado con éxito.\nIniciando secuencia de animación para la acción ${selectedType} en ComfyUI...`
      });

      // --- FASE 2: Generar la Animación de Video + Sprite Sheet de forma continua ---
      setVideoLoading(true);
      const positivePrompt = `${characterDesc ? characterDesc + ', ' : ''}performing ${selectedType}, style: ${selectedStyle}, smooth animation applying principles: ${activePrinciples.join(', ')}`;
      let generatedVideoUrl = "";

      const provider = apiSettings?.video.provider || 'comfyui';
      if ((provider === 'comfyui' || provider === 'a1111') && apiSettings?.video.baseUrl) {
        console.log(`[Omni IA Game] Encolando animación local en ComfyUI con la imagen del keyframe recién generado.`);
        generatedVideoUrl = await generateLocalVideo(
          apiSettings.video.baseUrl,
          positivePrompt,
          apiSettings.video.apiKey,
          apiSettings.video.provider,
          imageUrl, // ¡Inyectamos directamente el keyframe como imagen base en el nodo character!
          apiSettings.video.workflowId,
          negativePrompt,
          activeAnimWfJson,
          apiSettings.video.promptNode,
          apiSettings.video.negativeNode,
          apiSettings.video.imageNode,
          apiSettings.video.model,
          useRandomSeed === false ? customSeed : undefined
        );

        if (generatedVideoUrl.startsWith('comfyui_job_id:')) {
          alert(`Keyframe generado con éxito. Tarea de animación enviada a ComfyUI. Job ID: ${generatedVideoUrl.split(':')[1]}. Revisa tu consola de ComfyUI para ver el progreso de la generación.`);
          setVideoLoading(false);
          setLoading(false);
          return;
        }
      } else {
        console.log(`[Omni IA Game] Generando animación para el proveedor: ${provider.toUpperCase()}`);
        generatedVideoUrl = await generateVideo(positivePrompt, imageUrl, apiSettings, negativePrompt);
      }

      let finalVideo = generatedVideoUrl;
      let finalSheet = null;
      let finalFrames = null;

      try {
        if (generatedVideoUrl.startsWith('{')) {
          const parsed = JSON.parse(generatedVideoUrl);
          finalVideo = parsed.videoUrl;
          finalSheet = parsed.spriteSheetUrl || null;
          finalFrames = parsed.frames || null;
        }
      } catch (err) {
        console.warn("No se pudo parsear el resultado de video local como JSON:", err);
      }

      updateState({
        videoUrl: finalVideo,
        gifUrl: finalSheet,
        frames: finalFrames,
        guideText: `¡Animación completa generada con éxito!\n- Visualiza tu Keyframe estático, los frames individuales y el video en el panel derecho.`
      });

    } catch (error: any) {
      console.error(error);
      alert(`Error en el pipeline de animación:\n\n${error?.message || error || "Error desconocido. Revisa tu configuración o conexión local."}`);
    } finally {
      setLoading(false);
      setVideoLoading(false);
    }
  };

  const handleGenerateVideoOnly = async () => {
    if (!resultImage) {
      alert("Primero genera una animación completa para obtener el keyframe base.");
      return;
    }

    setVideoLoading(true);
    try {
      const positivePrompt = `${characterDesc ? characterDesc + ', ' : ''}performing ${selectedType}, style: ${selectedStyle}, smooth animation applying principles: ${activePrinciples.join(', ')}`;
      let generatedVideoUrl = "";

      const animSlotKey = slotKeyForAnimation(selectedType);
      const animSlots = loadSlots();
      const slotVal = animSlots[animSlotKey];
      const activeAnimWfJson = slotVal?.jsonStr || apiSettings?.video.customWorkflow;

      const provider = apiSettings?.video.provider || 'comfyui';
      if ((provider === 'comfyui' || provider === 'a1111') && apiSettings?.video.baseUrl) {
        generatedVideoUrl = await generateLocalVideo(
          apiSettings.video.baseUrl,
          positivePrompt,
          apiSettings.video.apiKey,
          apiSettings.video.provider,
          resultImage,
          apiSettings.video.workflowId,
          negativePrompt,
          activeAnimWfJson,
          apiSettings.video.promptNode,
          apiSettings.video.negativeNode,
          apiSettings.video.imageNode
        );

        if (generatedVideoUrl.startsWith('comfyui_job_id:')) {
          alert(`Tarea de animación enviada a ComfyUI. Job ID: ${generatedVideoUrl.split(':')[1]}. Revisa la consola de ComfyUI para ver el progreso.`);
          setVideoLoading(false);
          return;
        }
      } else {
        generatedVideoUrl = await generateVideo(positivePrompt, resultImage, apiSettings, negativePrompt, selectedType);
      }

      let finalVideo = generatedVideoUrl;
      let finalSheet = null;
      let finalFrames = null;

      try {
        if (generatedVideoUrl.startsWith('{')) {
          const parsed = JSON.parse(generatedVideoUrl);
          finalVideo = parsed.videoUrl;
          finalSheet = parsed.spriteSheetUrl || null;
          finalFrames = parsed.frames || null;
        }
      } catch (err) {
        console.warn("No se pudo parsear el resultado de video local como JSON:", err);
      }

      updateState({
        videoUrl: finalVideo,
        gifUrl: finalSheet,
        frames: finalFrames,
        guideText: `¡Animación de video re-generada con éxito para ${selectedType}!`
      });
    } catch (vErr: any) {
      console.error("Video generation error:", vErr);
      alert(`Error al generar la animación de video:\n\n${vErr?.message || vErr || "Error desconocido."}`);
    } finally {
      setVideoLoading(false);
    }
  };

  const handleVideoAction = (action: 'play' | 'pause' | 'stop' | 'prev' | 'next' | 'step-prev' | 'step-next') => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    switch (action) {
      case 'play':
        video.play().catch(e => console.error("Video play error:", e));
        setIsPlaying(true);
        break;
      case 'pause':
        video.pause();
        setIsPlaying(false);
        break;
      case 'stop':
        video.pause();
        video.currentTime = 0;
        setIsPlaying(false);
        break;
      case 'prev':
        video.currentTime = Math.max(0, video.currentTime - 1);
        break;
      case 'next':
        video.currentTime = Math.min(video.duration, video.currentTime + 1);
        break;
      case 'step-prev':
        video.currentTime = Math.max(0, video.currentTime - (1/30)); // Assume 30fps
        break;
      case 'step-next':
        video.currentTime = Math.min(video.duration, video.currentTime + (1/30));
        break;
    }
  };

  return (
    <div className="flex h-full gap-6 p-6 overflow-hidden">
      {/* Left: Configuration */}
      <div className="w-1/3 flex flex-col gap-6 p-6 bg-slate-900/50 border border-slate-800 rounded-xl shadow-xl overflow-y-auto scrollbar-thin">
        <div className="border-b border-slate-800 pb-2">
          <h2 className="text-2xl font-bold text-purple-400 flex items-center gap-2">
            <Activity className="w-6 h-6" />
            Estudio de Animación
          </h2>
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Diseñador de Movimiento de Personajes</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-slate-400 text-xs mb-2 font-mono uppercase tracking-wider">Tipo de Animación</label>
            <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto pr-2 scrollbar-thin">
              {ANIMATION_TYPES.map(type => (
                <Tooltip key={type} id="animType" showTooltips={showTooltips}>
                  <button
                    onClick={() => updateState({ selectedType: type })}
                    className={`text-left w-full p-2 text-xs font-mono rounded border transition-all ${
                      selectedType === type
                        ? 'bg-purple-900/40 border-purple-600 text-purple-100'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {type}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-2 font-mono uppercase tracking-wider flex items-center gap-1">
              <Palette className="w-3 h-3" /> Estilo Visual
            </label>
            <Tooltip id="animStyle" showTooltips={showTooltips}>
              <select
                value={selectedStyle}
                onChange={(e) => updateState({ selectedStyle: e.target.value as ArtStyle })}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded focus:border-purple-500 outline-none text-sm"
              >
                {ART_STYLES.map(style => (
                  <option key={style} value={style}>{style}</option>
                ))}
              </select>
            </Tooltip>
          </div>

          {/* Visual Consistency */}
          <div className="bg-slate-950 p-3 rounded border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <label className="text-slate-400 text-xs font-mono uppercase tracking-wider flex items-center gap-1">
                <LinkIcon className="w-3 h-3 text-purple-500" />
                Consistencia Visual
              </label>
              <Tooltip id="animConsistency" inline showTooltips={showTooltips}>
                <input
                  type="checkbox"
                  checked={useConsistency}
                  onChange={(e) => updateState({ useConsistency: e.target.checked })}
                  className="accent-purple-600 w-4 h-4"
                />
              </Tooltip>
            </div>

            <div className="space-y-2">
              {useConsistency ? (
                <>
                  {uploadedRef ? (
                    <div className="relative group bg-purple-900/10 p-2 rounded border border-purple-500/30 flex items-center gap-2">
                       <img src={safeImageSrc(uploadedRef)} alt="Manual Ref" className="w-10 h-10 object-cover rounded bg-black" />
                       <div className="flex-1 overflow-hidden">
                         <p className="text-[10px] text-purple-400 font-bold uppercase">Ref. Manual</p>
                         <p className="text-[9px] text-slate-500 truncate">Cargada</p>
                       </div>
                       <button
                         onClick={() => updateState({ uploadedRef: null })}
                         className="p-1 hover:bg-red-500/20 text-red-500 rounded transition-colors"
                       >
                         <X className="w-4 h-4" />
                       </button>
                    </div>
                  ) : lastAsset?.imageUrl ? (
                    <div className="flex items-center gap-2 bg-slate-900 p-2 rounded border border-slate-700/50">
                       <img src={safeImageSrc(lastAsset.imageUrl)} alt="Auto Ref" className="w-8 h-8 object-cover rounded bg-black" />
                       <div className="flex-1 overflow-hidden">
                         <p className="text-[10px] text-slate-500 font-bold uppercase">Ref. de Assets</p>
                         <p className="text-[9px] text-slate-400 truncate">{lastAsset.prompt}</p>
                       </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-600 italic px-1">Sin referencia activa.</p>
                  )}

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <Tooltip id="animUploadRef" showTooltips={showTooltips}>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded border border-slate-700 flex items-center justify-center gap-2 transition-all"
                    >
                      <Upload className="w-3 h-3" />
                      SUBIR BOCETO / REF
                    </button>
                  </Tooltip>
                </>
              ) : (
                <p className="text-[10px] text-slate-600 px-1">Consistencia desactivada.</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-2 font-mono uppercase tracking-wider">Principios de Animación</label>
            <div className="flex flex-wrap gap-2">
              {PRINCIPLES.map(p => (
                <Tooltip key={p} id="animPrinciples" inline showTooltips={showTooltips}>
                  <button
                    onClick={() => togglePrinciple(p)}
                    className={`px-2 py-1 text-[9px] rounded-full border transition-all ${
                      activePrinciples.includes(p)
                        ? 'bg-purple-600 border-purple-400 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-500'
                    }`}
                  >
                    {p}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider flex items-center justify-between">
              <span>Descripción del Personaje</span>
              {apiSettings?.promptEngineer?.enabled && (
                <Tooltip id="animRefinePromptBtn" position="top" inline>
                  <button
                    onClick={async () => {
                      if (refining) {
                        if (abortRefineRef.current) {
                          abortRefineRef.current.abort();
                          abortRefineRef.current = null;
                        }
                        setRefining(false);
                        return;
                      }
                      if (!characterDesc.trim()) {
                        alert('Escribe una descripción primero para que la IA pueda refinar.');
                        return;
                      }
                      setRefining(true);
                      const controller = new AbortController();
                      abortRefineRef.current = controller;
                      try {
                        const refined = await refinePrompt(characterDesc, selectedStyle, 'animation', selectedType, negativePrompt, apiSettings, undefined, controller.signal);
                        updateState({
                          characterDesc: refined.positive,
                          negativePrompt: refined.negative
                        });
                        setRefinedPulse(true);
                        setTimeout(() => setRefinedPulse(false), 2000);
                      } catch (err: any) {
                        if (err?.name === 'AbortError' || String(err).includes('Aborted')) {
                          console.log('[ClassicAnim] Refinamiento de IA cancelado.');
                        } else {
                          alert(`Error del Prompt Engineer: ${err.message || err}`);
                        }
                      } finally {
                        setRefining(false);
                        abortRefineRef.current = null;
                      }
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                      refining
                        ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse shadow-md shadow-red-900/40 cursor-pointer border border-red-500'
                        : 'bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-700/50'
                    }`}
                    title="Refinar prompt con IA"
                  >
                    {refining ? <PencilSparkleAnimation className="w-3.5 h-3.5" /> : <Wand2 className="w-3 h-3" />}
                    {refining ? '⏹ DETENER REFINADO' : '✨ REFINAR CON IA'}
                  </button>
                </Tooltip>
              )}
            </label>
            <Tooltip id="animCharDesc" showTooltips={showTooltips}>
              <textarea
                value={characterDesc}
                onChange={(e) => updateState({ characterDesc: e.target.value })}
                placeholder="Ej: Guerrero con capa roja, robot esbelto..."
                className={`w-full h-20 bg-slate-800 border text-slate-200 p-2 rounded focus:border-purple-500 outline-none resize-none text-sm transition-all duration-500 ${
                  refinedPulse 
                    ? 'border-purple-500 ring-2 ring-purple-600/30 shadow-[0_0_15px_rgba(168,85,247,0.3)] animate-pulse' 
                    : 'border-slate-700'
                }`}
              />
            </Tooltip>
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">Prompt Negativo</label>
            <Tooltip id="animNegativePrompt" showTooltips={showTooltips}>
              <textarea
                value={negativePrompt}
                onChange={(e) => updateState({ negativePrompt: e.target.value })}
                placeholder="Ej: text, ui, watermark, blurry, low quality, distorted..."
                className={`w-full h-16 bg-slate-800 border text-slate-200 p-2 rounded focus:border-purple-500 outline-none resize-none text-sm font-sans transition-all duration-500 ${
                  refinedPulse 
                    ? 'border-purple-500 ring-2 ring-purple-600/30 shadow-[0_0_15px_rgba(168,85,247,0.3)] animate-pulse' 
                    : 'border-slate-700'
                }`}
              />
            </Tooltip>
          </div>

          {/* Control de Semilla */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <Tooltip id="animRandomSeed" showTooltips={showTooltips} inline>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                <input 
                  type="checkbox" 
                  className="accent-purple-500 rounded cursor-pointer"
                  checked={useRandomSeed} 
                  onChange={(e) => updateState({ useRandomSeed: e.target.checked })} 
                />
                <span className="font-mono text-[11px]">USAR SEMILLA ALEATORIA (RANDOM SEED)</span>
              </label>
            </Tooltip>

            {!useRandomSeed && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono">SEMILLA FIJA:</span>
                <Tooltip id="animCustomSeed" showTooltips={showTooltips} inline>
                  <input 
                    type="number" 
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-purple-300 font-mono focus:outline-none focus:border-purple-500 w-36"
                    value={customSeed} 
                    onChange={(e) => updateState({ customSeed: parseInt(e.target.value) || 0 })} 
                    placeholder="Ej: 798635"
                  />
                </Tooltip>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Tooltip id="animGenerateFullBtn" showTooltips={showTooltips}>
              <button
                onClick={handleGenerateFullAnimation}
                disabled={loading || videoLoading}
                className="w-full py-3 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-bold rounded flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-900/20 text-xs font-mono uppercase tracking-wider"
                title="Genera el keyframe estático inicial y continúa la secuencia de animación completa automáticamente"
              >
                {loading || videoLoading ? <Loader2 className="animate-spin w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                {loading ? 'Generando Keyframe...' : videoLoading ? 'Generando Animación...' : '✨ Generar Animación Completa'}
              </button>
            </Tooltip>

            {resultImage && (
              <Tooltip id="animGenerateVideoOnlyBtn" showTooltips={showTooltips}>
                <button
                  onClick={handleGenerateVideoOnly}
                  disabled={loading || videoLoading}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-white font-semibold rounded border border-slate-700 flex items-center justify-center gap-1.5 transition-all text-[10px] font-mono uppercase tracking-wide"
                  title="Vuelve a generar o actualizar únicamente la animación de video basándote en el keyframe ya existente"
                >
                  <Video className="w-3.5 h-3.5" />
                  Re-generar Solo Video Animación
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {/* Right: Preview & Guide */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2">
        {resultImage ? (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4">
            {/* Back / Clear button */}
            <Tooltip id="animVolverBtn" inline showTooltips={showTooltips}>
              <button
                onClick={handleClearResults}
                className="self-start flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-mono rounded border border-slate-700 transition-all"
              >
                <ArrowLeft className="w-3 h-3" /> VOLVER
              </button>
            </Tooltip>

            {/* Keyframe Display */}
            <div className="bg-slate-950 p-4 rounded-xl border border-purple-500/30 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-purple-400 font-mono text-xs uppercase flex items-center gap-2">
                  <Layers className="w-4 h-4" /> Keyframe Generado
                </h3>
                <div className="flex items-center gap-2">
                  <Tooltip id="animDownloadPngBtn" inline showTooltips={showTooltips}>
                    <button
                      onClick={() => handleDownload(resultImage, `keyframe-${Date.now()}.png`)}
                      className="text-[10px] text-slate-500 hover:text-purple-400 font-mono flex items-center gap-1 transition-colors bg-transparent border-none cursor-pointer"
                      title="Descargar PNG"
                    >
                      <Download className="w-3 h-3" /> PNG
                    </button>
                  </Tooltip>
                  <button
                    onClick={() => updateState({ resultImage: null, videoUrl: null, guideText: '' })}
                    className="p-1 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    title="Borrar keyframe"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="aspect-square bg-black rounded-lg overflow-hidden border border-slate-800 relative group">
                <img src={resultImage} alt="Generated Keyframe" className="w-full h-full object-contain" />
                <div className="absolute inset-0 bg-purple-600/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </div>
            </div>

            {/* Video Animation Display */}
            <div className="bg-slate-950 p-4 rounded-xl border border-blue-500/30 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-blue-400 font-mono text-xs uppercase flex items-center gap-2">
                  <Video className="w-4 h-4" /> Animación en Movimiento (HD)
                </h3>
                {videoUrl && (
                  <div className="flex items-center gap-2">
                    <Tooltip id="animDownloadMp4Btn" inline showTooltips={showTooltips}>
                      <button
                        onClick={() => handleDownload(videoUrl, `animation-${Date.now()}.mp4`)}
                        className="text-[10px] text-slate-500 hover:text-blue-400 font-mono flex items-center gap-1 transition-colors bg-transparent border-none cursor-pointer"
                        title="Descargar MP4"
                      >
                        <Download className="w-3 h-3" /> MP4
                      </button>
                    </Tooltip>
                    <button
                      onClick={() => { updateState({ videoUrl: null }); setIsPlaying(false); setCurrentTime(0); setDuration(0); }}
                      className="p-1 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      title="Borrar video"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              <div className="aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 relative flex items-center justify-center">
                {videoLoading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-[10px] text-blue-400 font-mono animate-pulse uppercase">Generando Movimiento...</p>
                  </div>
                ) : videoUrl ? (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full h-full object-contain"
                    onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                    onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
                    onEnded={() => setIsPlaying(false)}
                    loop
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-700">
                    <Video className="w-12 h-12 opacity-20" />
                    <p className="text-[10px] font-mono uppercase">Esperando Generación...</p>
                  </div>
                )}
              </div>

              {videoUrl && (
                <div className="mt-4 space-y-3">
                  {/* Progress Bar */}
                  <div className="relative h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-100"
                      style={{ width: `${(currentTime / duration) * 100}%` }}
                    />
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-between">
                    <Tooltip id="animVideoControls" showTooltips={showTooltips}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleVideoAction('stop')}
                          className="p-2 hover:bg-slate-800 text-slate-400 rounded transition-colors"
                          title="Stop"
                        >
                          <Square className="w-4 h-4 fill-current" />
                        </button>
                        <button
                          onClick={() => handleVideoAction('step-prev')}
                          className="p-2 hover:bg-slate-800 text-slate-400 rounded transition-colors"
                          title="Previous Frame"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleVideoAction('prev')}
                          className="p-2 hover:bg-slate-800 text-slate-400 rounded transition-colors"
                          title="Rewind"
                        >
                          <SkipBack className="w-4 h-4 fill-current" />
                        </button>

                        {isPlaying ? (
                          <button
                            onClick={() => handleVideoAction('pause')}
                            className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-all shadow-lg shadow-blue-900/20"
                          >
                            <Pause className="w-5 h-5 fill-current" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleVideoAction('play')}
                            className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-all shadow-lg shadow-blue-900/20"
                          >
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          </button>
                        )}

                        <button
                          onClick={() => handleVideoAction('next')}
                          className="p-2 hover:bg-slate-800 text-slate-400 rounded transition-colors"
                          title="Fast Forward"
                        >
                          <SkipForward className="w-4 h-4 fill-current" />
                        </button>
                        <button
                          onClick={() => handleVideoAction('step-next')}
                          className="p-2 hover:bg-slate-800 text-slate-400 rounded transition-colors"
                          title="Next Frame"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </Tooltip>

                    <div className="text-[10px] font-mono text-slate-500">
                      {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sequence Frames Display */}
            {((frames && frames.length > 0) || videoLoading) && (
              <div className="bg-slate-950 p-4 rounded-xl border border-pink-500/30 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-pink-400 font-mono text-xs uppercase flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Frames de la Secuencia
                  </h3>
                  {frames && frames.length > 0 && (
                    <span className="text-[10px] font-mono text-slate-500">
                      {frames.length} IMÁGENES
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-3 bg-slate-900/60 p-4 rounded-lg border border-slate-800">
                  {videoLoading && (!frames || frames.length === 0) ? (
                    Array.from({ length: 4 }).map((_, idx) => (
                      <div key={idx} className="aspect-square bg-slate-950 rounded-md border border-slate-800 flex flex-col items-center justify-center animate-pulse">
                        <Loader2 className="w-4 h-4 text-pink-500 animate-spin mb-1" />
                        <span className="text-[8px] font-mono text-pink-400/70">POSE {idx + 1}...</span>
                      </div>
                    ))
                  ) : frames && frames.length > 0 ? (
                    frames.map((frame, idx) => (
                      <div key={idx} className="relative group aspect-square bg-slate-950 rounded-md border border-slate-800 overflow-hidden flex items-center justify-center hover:border-pink-500/50 transition-all duration-300">
                        <img src={frame} alt={`Frame ${idx + 1}`} className="w-full h-full object-contain" />
                        <div className="absolute inset-0 bg-pink-600/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <button
                            onClick={() => handleDownload(frame, `frame-${idx + 1}-${Date.now()}.png`)}
                            className="p-1 bg-slate-950/90 text-pink-400 hover:text-white rounded border border-pink-500/30 transition-all"
                            title="Descargar PNG"
                          >
                            <Download className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <span className="absolute top-1 left-1 px-1 py-0.5 bg-slate-950/80 text-[8px] text-slate-400 font-mono rounded">
                          P{idx + 1}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-4 py-6 text-center text-slate-600 font-mono text-[10px] uppercase">
                      Esperando generación de frames...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sprite Sheet Display */}
            {gifUrl && (
              <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/30 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-emerald-400 font-mono text-xs uppercase flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" /> Hoja de Sprites (Sprite Sheet)
                  </h3>
                  <div className="flex items-center gap-2">
                    <Tooltip id="animDownloadSpriteBtn" inline showTooltips={showTooltips}>
                      <button
                        onClick={() => handleDownload(gifUrl, `spritesheet-${Date.now()}.png`)}
                        className="text-[10px] text-slate-500 hover:text-emerald-400 font-mono flex items-center gap-1 transition-colors bg-transparent border-none cursor-pointer"
                        title="Descargar Sprite Sheet"
                      >
                        <Download className="w-3 h-3" /> Descargar PNG
                      </button>
                    </Tooltip>
                    <button
                      onClick={() => updateState({ gifUrl: null })}
                      className="p-1 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      title="Borrar sprite sheet"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="aspect-square bg-black rounded-lg overflow-hidden border border-slate-800 relative flex items-center justify-center p-2">
                  <img 
                    src={gifUrl} 
                    alt="Sprite Sheet" 
                    className="w-full h-full object-contain"
                    style={{ imageRendering: selectedStyle.includes('Pixel') ? 'pixelated' : 'auto' }}
                  />
                </div>
              </div>
            )}

            {guideText && (
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6">
                <h3 className="text-purple-400 font-bold mb-3 flex items-center gap-2">
                  <Info className="w-4 h-4" /> Guía Técnica de Animación
                </h3>
                <div className="space-y-4 text-sm text-slate-300 font-mono">
                  <div className="flex gap-3">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-1" />
                    <p>Para el <span className="text-purple-300 font-bold">{selectedType}</span>, asegúrate de que el ciclo sea perfecto (loopable).</p>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-1" />
                    <p>Principios aplicados: <span className="italic">{activePrinciples.join(', ')}</span>. Esto añade peso y realismo al movimiento.</p>
                  </div>
                  <div className="p-3 bg-purple-900/20 border border-purple-500/20 rounded text-xs text-purple-200">
                    TIP: Usa 12 frames por segundo para un estilo retro fluido, o 24 para animación moderna.
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
            <Activity className="w-12 h-12 opacity-20 mb-2" />
            <p className="font-mono text-sm">Configure la animación para comenzar.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassicAnimationStudio;
