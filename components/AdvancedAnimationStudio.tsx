import React, { useState, useRef, useEffect } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Layers,
  Palette,
  Link as LinkIcon,
  Upload,
  X,
  Video,
  Download,
  Image as ImageIcon,
  Server,
  ArrowLeft,
  Wand2,
  Grid,
  RefreshCw,
  Scissors,
  Check,
  Eye
} from 'lucide-react';

const PRINCIPLES = [
  'Squash and Stretch', 'Anticipation', 'Staging', 'Straight Ahead & Pose to Pose',
  'Follow Through & Overlapping', 'Slow In and Slow Out', 'Arcs', 'Secondary Action',
  'Timing', 'Exaggeration', 'Solid Drawing', 'Appeal'
];

const ANIMATION_BUTTON_LABELS: Record<string, string> = {
  'Walk Cycle': 'GENERAR CICLO DE CAMINATA',
  'Melee Attack': 'GENERAR ATAQUE CUERPO A CUERPO',
  'Firearm Attack': 'GENERAR DISPARO',
  'Sword Attack': 'GENERAR ATAQUE CON ESPADA',
  'Blunt Weapon Attack': 'GENERAR ATAQUE CON MAZO',
  'Magic Attack': 'GENERAR ATAQUE MÁGICO',
  'Jump (Flip Forward)': 'GENERAR SALTO ADELANTE',
  'Jump (Flip Backward)': 'GENERAR SALTO ATRÁS',
  'Jump (Forward Displacement)': 'GENERAR SALTO CON DESPLAZAMIENTO',
  'Jump (Backward Displacement)': 'GENERAR SALTO CON RETROCESO',
  'Jump (Vertical Low)': 'GENERAR SALTO BAJO',
  'Jump (Vertical Mid)': 'GENERAR SALTO MEDIO',
  'Jump (Vertical High)': 'GENERAR SALTO ALTO',
  'Jump (Over Character)': 'GENERAR SALTO SOBRE ENEMIGO',
  'Jump (Away from Character)': 'GENERAR SALTO DE RETIRADA',
  'Crouch': 'GENERAR AGACHADO',
  'Prone (Face Down)': 'GENERAR CUERPO A TIERRA',
  'Supine (Face Up)': 'GENERAR CAÍDO DE ESPALDAS',
  'Ground Roll (Right)': 'GENERAR RODADA A LA DERECHA',
  'Ground Roll (Left)': 'GENERAR RODADA A LA IZQUIERDA',
  'Direct Hit': 'GENERAR RECIBIR IMPACTO',
  'Body Shot': 'GENERAR RECIBIR DISPARO',
  'Injured': 'GENERAR ANIMACIÓN DE HERIDO',
  'Death': 'GENERAR ANIMACIÓN DE MUERTE',
  'Getting Up': 'GENERAR ANIMACIÓN DE LEVANTARSE'
};

interface AnimationStudioProps {
  assets: GeneratedAsset[];
  state: ProjectData['animationState'];
  updateState: (updates: Partial<ProjectData['animationState']>) => void;
  apiSettings?: ProjectData['apiSettings'];
  showTooltips?: boolean;
}

const AdvancedAnimationStudio: React.FC<AnimationStudioProps> = ({ assets, state, updateState, apiSettings, showTooltips = true }) => {
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
    uploadedRef
  } = state;

  const useRandomSeed = state.useRandomSeed ?? true;
  const customSeed = state.customSeed ?? 798635;

  // Local Pipeline Steps State mapped to persistent parent state
  const activeStep = state.activeStep ?? 1;
  const variants = state.variants ?? [];
  const selectedVariantIdx = state.selectedVariantIdx ?? null;
  const directionalPoses = state.directionalPoses ?? { front: null, right: null, left: null, back: null };
  const extractedFrames = state.extractedFrames ?? [];
  const isDefringed = state.isDefringed ?? false;

  const setActiveStep = (val: number | ((prev: number) => number)) => {
    const next = typeof val === 'function' ? val(activeStep) : val;
    updateState({ activeStep: next });
  };
  const setVariants = (val: string[] | ((prev: string[]) => string[])) => {
    const next = typeof val === 'function' ? val(variants) : val;
    updateState({ variants: next });
  };
  const setSelectedVariantIdx = (val: number | null | ((prev: number | null) => number | null)) => {
    const next = typeof val === 'function' ? val(selectedVariantIdx) : val;
    updateState({ selectedVariantIdx: next });
  };
  const setDirectionalPoses = (val: typeof directionalPoses | ((prev: typeof directionalPoses) => typeof directionalPoses)) => {
    const next = typeof val === 'function' ? val(directionalPoses) : val;
    updateState({ directionalPoses: next });
  };
  const setExtractedFrames = (val: string[] | ((prev: string[]) => string[])) => {
    const next = typeof val === 'function' ? val(extractedFrames) : val;
    updateState({ extractedFrames: next });
  };
  const setIsDefringed = (val: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof val === 'function' ? val(isDefringed) : val;
    updateState({ isDefringed: next });
  };

  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refinedPulse, setRefinedPulse] = useState(false);
  const abortRefineRef = useRef<AbortController | null>(null);
  const [isGeneratingPoses, setIsGeneratingPoses] = useState(false);

  // Video and frames state
  const [videoLoading, setVideoLoading] = useState(false);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const [isProcessingDefringe, setIsProcessingDefringe] = useState(false);

  // Canvas Player loop states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [spriteSpeed, setSpriteSpeed] = useState(100); // ms per frame (10 FPS default)

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement>(null);

  // Playback timer for compiled sprite sheet or extracted frames
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying && extractedFrames.length > 0) {
      timer = setInterval(() => {
        setCurrentFrameIdx(prev => (prev + 1) % extractedFrames.length);
      }, spriteSpeed);
    }
    return () => clearInterval(timer);
  }, [isPlaying, extractedFrames, spriteSpeed]);

  // Visual Consistency references
  const getLastAssetForCharacter = (): GeneratedAsset | undefined => {
    if (!characterDesc) return assets[0];
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

  // Step 2: Generate 4 variants in parallel
  const handleGenerate4Variants = async () => {
    setLoading(true);
    setActiveStep(2);
    setVariants([]);
    setSelectedVariantIdx(null);
    try {
      const details = `Concept sheet. Character: ${characterDesc}. Style: ${selectedStyle}. T-pose character model sheet, facing forward, arms extended, front view, plain clean background.`;
      const prompt = `Entity: ${characterDesc || "Generic Character"}, Action: Model Sheet, Style: ${selectedStyle}, Details: ${details}`;
      const videoProvider = apiSettings?.video.provider || 'comfyui';

      let referenceImage: string | undefined = undefined;
      if (useConsistency) {
        if (uploadedRef) referenceImage = uploadedRef;
        else if (lastAsset) referenceImage = lastAsset.imageUrl;
      }

      // Generate 4 in parallel for selection
      const variantPromises = Array.from({ length: 4 }).map(async (_, idx) => {
        const uniqueSeed = Math.floor(Math.random() * 1000000000);
        const providerApiKey = apiSettings?.video?.apiKeys?.[videoProvider] || apiSettings?.video?.apiKey;

        const modifiedSettings = {
          ...apiSettings,
          image: {
            ...apiSettings?.image,
            provider: videoProvider as any,
            apiKey: providerApiKey,
            comfyDeployApiKey: apiSettings?.video.comfyDeployApiKey,
            comfyDeployDeploymentId: apiSettings?.video.comfyDeployDeploymentId,
            baseUrl: apiSettings?.video.baseUrl || 'http://127.0.0.1:8188'
          }
        };

        const customWf = (videoProvider === 'comfyui' || videoProvider === 'a1111') 
          ? (apiSettings?.image.customWorkflow || undefined)
          : undefined;

        return await generateImage(
          prompt,
          negativePrompt || "text, watermark, blurry",
          modifiedSettings,
          referenceImage,
          'sprite',
          customWf,
          { style: selectedStyle, action: 'T-Pose' as any, details, autoRemoveBackground: true, seed: uniqueSeed }
        );
      });

      const results = await Promise.all(variantPromises);
      setVariants(results);
    } catch (error: any) {
      console.error(error);
      alert(`Error generando variantes:\n\n${error?.message || error || "Error desconocido."}`);
      setActiveStep(1);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Generate directional consistent views
  const handleGenerateDirectionalPoses = async () => {
    if (selectedVariantIdx === null) {
      alert("Por favor selecciona una variante primero.");
      return;
    }
    const chosenVariant = variants[selectedVariantIdx];
    updateState({ resultImage: chosenVariant }); // Save selected variant as primary keyframe
    setDirectionalPoses({ front: chosenVariant, right: null, left: null, back: null });
    setIsGeneratingPoses(true);
    setActiveStep(3);

    try {
      const details = `Single isolated character standing, full body. Character: ${characterDesc}. Style: ${selectedStyle}.`;
      const directions = [
        { key: 'right' as const, label: 'Side Right View, full standing side profile facing right, 90 degree side rotation, completely turned sideways sideways view, narrow profile silhouette, single subject' },
        { key: 'left' as const, label: 'Side Left View, full standing side profile facing left, 90 degree side rotation, completely turned sideways sideways view, narrow profile silhouette, single subject' },
        { key: 'back' as const, label: 'Back View, rear view, character facing away from camera, backward view, symmetrical back outline, single subject' }
      ];

      // Generate all 4 poses in parallel using chosenVariant as consistency reference!
      const posePromises = directions.map(async (dir) => {
        const prompt = `Entity: ${characterDesc || "Generic Character"}, Action: Standing, Style: ${selectedStyle}, Details: ${details}, ${dir.label}, exact visual consistency with reference`;
        const videoProvider = apiSettings?.video.provider || 'comfyui';
        const providerApiKey = apiSettings?.video?.apiKeys?.[videoProvider] || apiSettings?.video?.apiKey;

        const modifiedSettings = {
          ...apiSettings,
          image: {
            ...apiSettings?.image,
            provider: videoProvider as any,
            apiKey: providerApiKey,
            comfyDeployApiKey: apiSettings?.video.comfyDeployApiKey,
            comfyDeployDeploymentId: apiSettings?.video.comfyDeployDeploymentId,
            baseUrl: apiSettings?.video.baseUrl || 'http://127.0.0.1:8188'
          }
        };

        const customWf = (videoProvider === 'comfyui' || videoProvider === 'a1111') 
          ? (apiSettings?.image.customWorkflow || undefined)
          : undefined;

        return {
          key: dir.key,
          url: await generateImage(
            prompt,
            negativePrompt || "text, watermark, blurry",
            modifiedSettings,
            chosenVariant,
            'sprite',
            customWf,
            { style: selectedStyle, action: 'Standing' as any, details, autoRemoveBackground: true, isDirectionalPose: true }
          )
        };
      });

      const results = await Promise.all(posePromises);
      const newPoses = { front: chosenVariant, right: null as string | null, left: null as string | null, back: null as string | null };
      results.forEach(res => {
        newPoses[res.key] = res.url;
      });
      setDirectionalPoses(newPoses);
    } catch (e: any) {
      console.error(e);
      alert("Error al generar las poses coherentes. Se usará el keyframe seleccionado como único.");
    } finally {
      setIsGeneratingPoses(false);
    }
  };

  // Step 4: Generate walk cycle video (I2V)
  const handleGenerateI2VVideo = async () => {
    const keyframe = directionalPoses.front || resultImage;
    if (!keyframe) {
      alert("Primero selecciona o genera un keyframe.");
      return;
    }

    setVideoLoading(true);
    setActiveStep(4);
    try {
      let motionDescription = "walk cycle movement, side scrolling continuous cycle";
      const typeLower = selectedType.toLowerCase();
      if (typeLower.includes("attack") || typeLower.includes("ataque")) {
        motionDescription = "performing high speed combat attack action, combat stances, sword slash swing hitting, dynamic melee movement action, hit impact combat motion";
      } else if (typeLower.includes("jump") || typeLower.includes("salto")) {
        motionDescription = "performing jump leaping forward motion, vertical jump action, physics based gravity launch and landing, loopable jump cycle";
      } else if (typeLower.includes("death") || typeLower.includes("muerte")) {
        motionDescription = "performing death defeat animation, falling to the ground, collapsing motion, lying down flat, dramatic defeat cycle";
      } else if (typeLower.includes("injured") || typeLower.includes("herido")) {
        motionDescription = "performing injured hit reaction animation, stumbling in pain, stagger back motion, hurt breathing cycle";
      } else if (typeLower.includes("crouch") || typeLower.includes("agachado")) {
        motionDescription = "crouch defense stance, lowering body posture, ducking motion, loopable crouching cycle";
      }
      
      const positivePrompt = `${characterDesc ? characterDesc + ', ' : ''}performing ${selectedType}, ${motionDescription}, style: ${selectedStyle}, smooth animation applying principles: ${activePrinciples.join(', ')}`;
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
          keyframe,
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
          alert(`Tarea enviada a ComfyUI. Job ID: ${generatedVideoUrl.split(':')[1]}. Revisa la terminal de ComfyUI para ver el progreso de la generación del video.`);
          setVideoLoading(false);
          return;
        }
      } else {
        generatedVideoUrl = await generateVideo(positivePrompt, keyframe, apiSettings, negativePrompt, selectedType);
      }

      updateState({ videoUrl: generatedVideoUrl });
    } catch (vErr: any) {
      console.error("Video generation error:", vErr);
      alert(`Error al generar la animación de video:\n\n${vErr?.message || vErr || "Error de conexión."}`);
    } finally {
      setVideoLoading(false);
    }
  };

  // Step 5: Programmatic HTML5 Canvas video frame extraction
  const handleExtractFrames = async () => {
    if (!videoUrl) {
      alert("No hay ningún video cargado para extraer frames.");
      return;
    }
    setIsExtractingFrames(true);
    setExtractedFrames([]);
    setIsDefringed(false);
    setCurrentFrameIdx(0);
    setActiveStep(5);

    try {
      if (videoUrl.startsWith('data:image/gif') || videoUrl.includes('.gif') || videoUrl.includes('format=image/gif')) {
        console.log("[Omni IA Game] GIF source detected for frame extraction. Calling native Rust decoder...");
        const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
        if (!invokeFn) {
          throw new Error("Tauri native invoke not found. GIF frame extraction requires Tauri.");
        }
        const b64Frames = await invokeFn('extract_gif_frames', { b64Gif: videoUrl }) as string[];
        if (!b64Frames || b64Frames.length === 0) {
          throw new Error("El decodificador nativo devolvió 0 frames.");
        }
        setExtractedFrames(b64Frames);
        setIsPlaying(true);
        setIsExtractingFrames(false);
        return;
      }

      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => resolve(true);
        video.onerror = () => reject("No se pudo cargar el video.");
      });

      const duration = video.duration || 1.0;
      const targetFPS = 8; // Extract at 8 FPS
      const totalFrames = Math.max(8, Math.min(16, Math.floor(duration * targetFPS)));
      const frames: string[] = [];

      for (let i = 0; i < totalFrames; i++) {
        video.currentTime = (i / totalFrames) * duration;
        await new Promise((resolve) => {
          video.onseeked = resolve;
        });

        const canvas = document.createElement('canvas');
        canvas.width = 128; // Standardized pixel size for sprites
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, 128, 128);
          frames.push(canvas.toDataURL('image/png'));
        }
      }

      setExtractedFrames(frames);
      setIsPlaying(true);
    } catch (err) {
      console.error(err);
      alert("Error al extraer frames del video en tiempo real.");
    } finally {
      setIsExtractingFrames(false);
    }
  };

  // Step 5: Call native Tauri Rust Defringing inside Tauri
  const handleApplyDefringeNative = async () => {
    if (extractedFrames.length === 0) return;
    setIsProcessingDefringe(true);

    const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
    if (!invokeFn) {
      alert("Tauri backend no detectado. El procesamiento de defringing nativo en Rust requiere ejecutar la app en Tauri.");
      setIsProcessingDefringe(false);
      return;
    }

    try {
      // Run parallel Rust defringing for each base64 frame
      const processed = await Promise.all(
        extractedFrames.map(async (frameB64) => {
          return await invokeFn('remove_background_and_defringe', { b64Input: frameB64 }) as string;
        })
      );
      setExtractedFrames(processed);
      setIsDefringed(true);
    } catch (e: any) {
      console.error(e);
      alert("Error en el procesador de defringing en Rust:\n" + (e?.message || e));
    } finally {
      setIsProcessingDefringe(false);
    }
  };

  // Compile final spritesheet PNG using canvas
  const handleCompileSpritesheet = () => {
    if (extractedFrames.length === 0) return;
    try {
      const numFrames = extractedFrames.length;
      const cols = 4;
      const rows = Math.ceil(numFrames / cols);
      
      const frameSize = 128;
      const canvas = document.createElement('canvas');
      canvas.width = frameSize * cols;
      canvas.height = frameSize * rows;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let loadedCount = 0;
      extractedFrames.forEach((frameB64, idx) => {
        const img = new Image();
        img.onload = () => {
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          ctx.drawImage(img, col * frameSize, row * frameSize, frameSize, frameSize);
          loadedCount++;

          if (loadedCount === numFrames) {
            // Trigger browser native PNG download
            canvas.toBlob((blob) => {
              if (blob) {
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = `spritesheet_${selectedType.replace(' ', '_')}_${Date.now()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 200);

                // Save to state for visual play loop representation
                updateState({ gifUrl: canvas.toDataURL('image/png') });
              }
            }, 'image/png');
          }
        };
        img.src = frameB64;
      });
    } catch (err) {
      console.error(err);
      alert("Error al compilar el spritesheet.");
    }
  };

  const handleClearResults = () => {
    updateState({
      resultImage: null,
      videoUrl: null,
      gifUrl: null,
      guideText: '',
      activeStep: 1,
      variants: [],
      selectedVariantIdx: null,
      directionalPoses: { front: null, right: null, left: null, back: null },
      extractedFrames: [],
      isDefringed: false
    });
    setIsPlaying(false);
  };

  return (
    <div className="flex h-full flex-col gap-5 p-6 bg-slate-950 text-slate-100 select-none animate-fade-in overflow-y-auto">
      {/* Top Section - Pipeline step progress bar */}
      <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 shadow-2xl">
        {[
          { step: 1, label: 'CONCEPTO', desc: 'Idea & Estilo' },
          { step: 2, label: 'VARIANTES', desc: 'Elegir 1 de 4' },
          { step: 3, label: 'POSES', desc: 'Vistas Coherentes' },
          { step: 4, label: 'ANIMA VIDEO', desc: 'Caminata I2V' },
          { step: 5, label: 'SPRITE SHEET', desc: 'Extracción & Rust' },
        ].map(({ step, label, desc }) => (
          <div key={step} className="flex items-center gap-3">
            <button
              onClick={() => step <= activeStep && setActiveStep(step)}
              disabled={step > activeStep}
              className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold border transition-all ${
                activeStep === step
                  ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_12px_rgba(147,51,234,0.4)]'
                  : activeStep > step
                    ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-400'
                    : 'bg-slate-950 border-slate-900 text-slate-600 cursor-not-allowed'
              }`}
            >
              {activeStep > step ? <Check className="w-3.5 h-3.5" /> : step}
            </button>
            <div className="text-left">
              <p className={`text-[10px] font-bold font-mono tracking-wider ${activeStep === step ? 'text-purple-400' : 'text-slate-500'}`}>{label}</p>
              <p className="text-[9px] font-mono text-slate-600 hidden sm:block">{desc}</p>
            </div>
            {step < 5 && <div className="w-6 lg:w-16 h-[1px] bg-slate-800 hidden md:block" />}
          </div>
        ))}
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
        {/* Left Column: Form / Steps Controllers */}
        <div className="w-80 lg:w-96 shrink-0 bg-slate-900/40 border border-slate-850 p-5 rounded-2xl flex flex-col justify-between overflow-y-auto scrollbar-thin">
          <div className="space-y-5">
            {activeStep === 1 && (
              <>
                <div className="border-b border-slate-850 pb-2">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <Activity className="w-4 h-4" /> 1. Concepto Creativo
                  </h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-500 text-[10px] mb-1 font-mono uppercase tracking-wider">Tipo de Animación</label>
                    <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                      {ANIMATION_TYPES.map(type => (
                        <Tooltip key={type} id="advAnimType" inline showTooltips={showTooltips} className="w-full block">
                          <button
                            onClick={() => updateState({ selectedType: type })}
                            className={`text-left w-full p-2 text-[10px] font-mono rounded border transition-all ${
                              selectedType === type
                                ? 'bg-purple-900/30 border-purple-600/80 text-purple-200'
                                : 'bg-slate-950 border-slate-900 text-slate-400 hover:bg-slate-900'
                            }`}
                          >
                            {type}
                          </button>
                        </Tooltip>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-500 text-[10px] mb-1 font-mono uppercase tracking-wider">Estilo Visual</label>
                    <Tooltip id="advAnimStyle" showTooltips={showTooltips}>
                      <select
                        value={selectedStyle}
                        onChange={(e) => updateState({ selectedStyle: e.target.value as ArtStyle })}
                        className="w-full bg-slate-950 border border-slate-900 text-slate-200 p-2 rounded focus:border-purple-500 outline-none text-xs font-mono"
                      >
                        {ART_STYLES.map(style => (
                          <option key={style} value={style}>{style}</option>
                        ))}
                      </select>
                    </Tooltip>
                  </div>

                  {/* Consistencia check */}
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-900">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <LinkIcon className="w-3 h-3 text-purple-500" /> Consistencia Visual
                      </label>
                      <Tooltip id="advAnimConsistency" inline showTooltips={showTooltips}>
                        <input
                          type="checkbox"
                          checked={useConsistency}
                          onChange={(e) => updateState({ useConsistency: e.target.checked })}
                          className="accent-purple-600 w-3.5 h-3.5 cursor-pointer"
                        />
                      </Tooltip>
                    </div>
                    {useConsistency && (
                      <div className="space-y-2 pt-1">
                        {uploadedRef ? (
                          <div className="relative bg-purple-950/20 p-2 rounded border border-purple-900/50 flex items-center justify-between">
                            <img src={safeImageSrc(uploadedRef)} alt="Upload consistency" className="w-8 h-8 object-cover rounded bg-black" />
                            <span className="text-[8px] font-mono text-purple-400">Ref. Manual</span>
                            <button
                              onClick={() => updateState({ uploadedRef: null })}
                              className="p-1 hover:bg-red-500/20 text-red-500 rounded transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : lastAsset?.imageUrl ? (
                          <div className="flex items-center gap-2 bg-slate-950 p-2 rounded border border-slate-900">
                            <img src={safeImageSrc(lastAsset.imageUrl)} alt="Asset consistency" className="w-8 h-8 object-cover rounded bg-black" />
                            <span className="text-[8px] font-mono text-slate-400 truncate max-w-[120px]">{lastAsset.prompt}</span>
                          </div>
                        ) : (
                          <p className="text-[9px] text-slate-600 italic">No hay boceto o imagen de referencia activa.</p>
                        )}
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          accept="image/*"
                          className="hidden"
                        />
                        <Tooltip id="advAnimSketchBtn" showTooltips={showTooltips}>
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] font-mono rounded border border-slate-700 flex items-center justify-center gap-1.5 transition-all"
                          >
                            <Upload className="w-3 h-3" /> CARGAR BOCETO MANUAL
                          </button>
                        </Tooltip>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-500 text-[10px] mb-1 font-mono uppercase tracking-wider flex items-center justify-between">
                      <span>Concepto / Personaje</span>
                      {apiSettings?.promptEngineer?.enabled && (
                        <Tooltip id="advAnimRefineBtn" position="top" inline showTooltips={showTooltips}>
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
                              if (!characterDesc.trim()) return;
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
                                  console.log('[AdvancedAnim] Refinamiento de IA cancelado.');
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
                                : 'bg-purple-900/30 text-purple-400 border border-purple-800'
                            }`}
                          >
                            {refining ? <PencilSparkleAnimation className="w-3.5 h-3.5" /> : <Wand2 className="w-2.5 h-2.5" />}
                            {refining ? '⏹ DETENER REFINADO' : '✨ REFINAR CON IA'}
                          </button>
                        </Tooltip>
                      )}
                    </label>
                    <Tooltip id="advAnimPositive" showTooltips={showTooltips}>
                      <textarea
                        value={characterDesc}
                        onChange={(e) => updateState({ characterDesc: e.target.value })}
                        placeholder="Describa el personaje (ej: Caballero cibernético con luces de neón)..."
                        className={`w-full h-20 bg-slate-950 border text-slate-200 p-2.5 rounded focus:border-purple-500 outline-none text-xs font-mono resize-none leading-relaxed transition-all duration-500 ${
                          refinedPulse 
                            ? 'border-purple-500 ring-2 ring-purple-600/30 shadow-[0_0_15px_rgba(168,85,247,0.3)] animate-pulse' 
                            : 'border-slate-900'
                        }`}
                      />
                    </Tooltip>
                  </div>

                  <div>
                    <label className="block text-slate-500 text-[10px] mb-1 font-mono uppercase tracking-wider">Prompt Negativo</label>
                    <Tooltip id="advAnimNegative" showTooltips={showTooltips}>
                      <textarea
                        value={negativePrompt}
                        onChange={(e) => updateState({ negativePrompt: e.target.value })}
                        placeholder="visual glitch, morphing, low quality, watermark, blurry..."
                        className={`w-full h-14 bg-slate-950 border text-slate-200 p-2.5 rounded focus:border-purple-500 outline-none text-xs font-mono resize-none transition-all duration-500 ${
                          refinedPulse 
                            ? 'border-purple-500 ring-2 ring-purple-600/30 shadow-[0_0_15px_rgba(168,85,247,0.3)] animate-pulse' 
                            : 'border-slate-900'
                        }`}
                      />
                    </Tooltip>
                  </div>

                  {/* Control de Semilla */}
                  <div className="pt-2 border-t border-slate-900 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                      <input 
                        type="checkbox" 
                        className="accent-purple-500 rounded cursor-pointer"
                        checked={useRandomSeed} 
                        onChange={(e) => updateState({ useRandomSeed: e.target.checked })} 
                      />
                      <span className="font-mono text-[11px]">USAR SEMILLA ALEATORIA (RANDOM SEED)</span>
                    </label>

                    {!useRandomSeed && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-mono">SEMILLA FIJA:</span>
                        <input 
                          type="number" 
                          className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-purple-300 font-mono focus:outline-none focus:border-purple-500 w-36"
                          value={customSeed} 
                          onChange={(e) => updateState({ customSeed: parseInt(e.target.value) || 0 })} 
                          placeholder="Ej: 798635"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {activeStep === 2 && (
              <>
                <div className="border-b border-slate-850 pb-2">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <Layers className="w-4 h-4" /> 2. Selección de Variante
                  </h3>
                </div>
                <div className="p-3 bg-slate-950/60 border border-slate-900 rounded-xl space-y-2 text-xs leading-relaxed text-slate-400 font-mono">
                  <p>
                    Hemos generado **4 variantes** basadas en su concepto inicial en pose neutral frontal (T-Pose).
                  </p>
                  <p className="text-purple-300">
                    💡 Seleccione la mejor opción a la derecha para usarla como la base geométrica para el walk cycle.
                  </p>
                </div>
              </>
            )}

            {activeStep === 3 && (
              <>
                <div className="border-b border-slate-850 pb-2">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <Grid className="w-4 h-4" /> 3. Poses Coherentes
                  </h3>
                </div>
                <div className="p-3 bg-slate-950/60 border border-slate-900 rounded-xl space-y-2.5 text-xs leading-relaxed text-slate-400 font-mono">
                  <p>
                    Usando la variante seleccionada como ancla visual, la IA creará las poses direccionales (Frente, Perfil Derecho, Perfil Izquierdo, Espalda).
                  </p>
                  <button
                    onClick={handleGenerateDirectionalPoses}
                    disabled={isGeneratingPoses}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 text-black font-bold font-mono rounded text-xs transition-all flex items-center justify-center gap-2"
                  >
                    {isGeneratingPoses ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {isGeneratingPoses ? 'GENERANDO POSES...' : 'GENERAR POSES DIRECCIONALES'}
                  </button>
                </div>
              </>
            )}

            {activeStep === 4 && (
              <>
                <div className="border-b border-slate-850 pb-2">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <Video className="w-4 h-4" /> 4. Caminata Video I2V
                  </h3>
                </div>
                <div className="p-3 bg-slate-950/60 border border-slate-900 rounded-xl space-y-3 text-xs leading-relaxed text-slate-400 font-mono">
                  <p>
                    Convertimos el keyframe frontal o de perfil estático en un clip de movimiento continuo en 3D/2D fluido.
                  </p>
                  
                  <div className="space-y-1.5 pt-1.5 border-t border-slate-900">
                    <label className="text-[10px] text-slate-500 uppercase">Fuerza de Principios</label>
                    <div className="flex flex-wrap gap-1">
                      {PRINCIPLES.slice(0, 6).map(p => (
                        <button
                          key={p}
                          onClick={() => {
                            updateState({
                              activePrinciples: activePrinciples.includes(p)
                                ? activePrinciples.filter(x => x !== p)
                                : [...activePrinciples, p]
                            });
                          }}
                          className={`px-1.5 py-0.5 text-[8px] rounded border transition-all ${
                            activePrinciples.includes(p) ? 'bg-purple-900/60 border-purple-500 text-purple-300' : 'bg-slate-950 border-slate-900 text-slate-600'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Tooltip id="advAnimGenerate" showTooltips={showTooltips}>
                    <button
                      onClick={handleGenerateI2VVideo}
                      disabled={videoLoading}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-black font-bold font-mono rounded text-xs transition-all flex items-center justify-center gap-1.5"
                    >
                      {videoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
                      {videoLoading ? 'GENERANDO ANIMACIÓN...' : (ANIMATION_BUTTON_LABELS[selectedType] || `GENERAR ${selectedType.toUpperCase()}`)}
                    </button>
                  </Tooltip>
                </div>
              </>
            )}

            {activeStep === 5 && (
              <>
                <div className="border-b border-slate-850 pb-2">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <Scissors className="w-4 h-4" /> 5. Extracción y Defringing
                  </h3>
                </div>
                <div className="p-3 bg-slate-950/60 border border-slate-900 rounded-xl space-y-3.5 text-xs leading-relaxed text-slate-400 font-mono">
                  <p>
                    Rebanamos el video en cuadros clave, aplicamos el croma de fondo y eliminamos los halos con el algoritmo de **Defringing** compilado nativamente en Rust.
                  </p>

                  <div className="flex flex-col gap-2 pt-1 border-t border-slate-900">
                    <Tooltip id="advAnimDefringe" showTooltips={showTooltips}>
                      <button
                        onClick={handleApplyDefringeNative}
                        disabled={isProcessingDefringe || extractedFrames.length === 0}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-black font-bold font-mono rounded text-[10px] transition-all flex items-center justify-center gap-1.5"
                      >
                        {isProcessingDefringe ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {isProcessingDefringe ? 'PROCESANDO DEFRINGE RUST...' : 'APLICAR DEFRINGE RUST'}
                      </button>
                    </Tooltip>

                    <Tooltip id="animDownloadSpriteBtn" showTooltips={showTooltips}>
                      <button
                        onClick={handleCompileSpritesheet}
                        disabled={extractedFrames.length === 0}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-black font-bold font-mono rounded text-[10px] transition-all flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        COMPILAR SPRITE SHEET
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="pt-4 border-t border-slate-850 flex gap-2">
            {activeStep > 1 && (
              <Tooltip id="animVolverBtn" inline showTooltips={showTooltips} className="flex-1">
                <button
                  onClick={() => setActiveStep(prev => prev - 1)}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold font-mono rounded text-xs transition-colors"
                >
                  ATRÁS
                </button>
              </Tooltip>
            )}
            {activeStep === 1 && (
              <Tooltip id="advAnimGenerate" showTooltips={showTooltips} className="w-full">
                <button
                  onClick={handleGenerate4Variants}
                  disabled={loading || (!characterDesc.trim() && !(useConsistency && uploadedRef))}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 text-black font-bold font-mono rounded text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  GENERAR VARIANTES
                </button>
              </Tooltip>
            )}
            {activeStep === 2 && selectedVariantIdx !== null && (
              <Tooltip id="advAnimGenerate" inline showTooltips={showTooltips} className="flex-1">
                <button
                  onClick={handleGenerateDirectionalPoses}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-black font-bold font-mono rounded text-xs transition-colors"
                >
                  SIGUIENTE
                </button>
              </Tooltip>
            )}
            {activeStep === 3 && (
              <Tooltip id="advAnimGenerate" inline showTooltips={showTooltips} className="flex-1">
                <button
                  onClick={() => setActiveStep(4)}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-black font-bold font-mono rounded text-xs transition-colors"
                >
                  SIGUIENTE
                </button>
              </Tooltip>
            )}
            {activeStep === 4 && videoUrl && (
              <Tooltip id="assetAutoSlice" inline showTooltips={showTooltips} className="flex-1">
                <button
                  onClick={handleExtractFrames}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-black font-bold font-mono rounded text-xs transition-colors"
                >
                  REBANAR SPRITE
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Right Column: Dynamic Preview Area according to current active step */}
        <div className="flex-1 bg-slate-950 border border-slate-850 p-6 rounded-2xl flex flex-col min-h-0 relative">
          
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            <Tooltip id="animVolverBtn" inline showTooltips={showTooltips}>
              <button
                onClick={handleClearResults}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-[10px] font-mono rounded border border-slate-800 transition-all uppercase font-bold"
              >
                <ArrowLeft className="w-3 h-3" /> Reiniciar
              </button>
            </Tooltip>
          </div>

          <div className="flex-1 flex flex-col justify-center min-h-0 overflow-y-auto pr-1">
            {activeStep === 1 && (
              <div className="text-center py-12 max-w-md mx-auto space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-purple-950/30 border border-purple-500/20 flex items-center justify-center text-purple-400 mx-auto animate-pulse">
                  <Activity className="w-8 h-8" />
                </div>
                <h4 className="text-sm font-bold font-mono tracking-wider text-slate-200">1. CONFIGURACIÓN DEL CONCEPTO</h4>
                <p className="text-xs text-slate-500 font-mono leading-relaxed">
                  Defina las propiedades creativas, elija el estilo de píxeles o 3D de Omni IA Game y describa a su héroe. En el siguiente paso generaremos 4 variantes.
                </p>
              </div>
            )}

            {activeStep === 2 && (
              <div className="space-y-4 h-full flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                  <h4 className="text-xs font-bold font-mono text-slate-400 tracking-widest uppercase">Variantes Generadas</h4>
                  {loading && <span className="text-[10px] font-mono text-purple-400 animate-pulse flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generando variantes...</span>}
                </div>

                {loading ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
                    <p className="text-xs text-purple-300 font-mono uppercase tracking-widest animate-pulse">Generando Variantes Creativas...</p>
                  </div>
                ) : variants.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-slate-600 font-mono text-xs">
                    Esperando generación de variantes.
                  </div>
                ) : (
                  <div className="flex-1 grid grid-cols-2 gap-4 items-center">
                    {variants.map((vUrl, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedVariantIdx(idx)}
                        className={`aspect-square bg-slate-900 rounded-xl overflow-hidden border cursor-pointer relative group transition-all duration-300 ${
                          selectedVariantIdx === idx
                            ? 'border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.25)] scale-[1.02]'
                            : 'border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <img src={vUrl} alt={`Variant ${idx + 1}`} className="w-full h-full object-contain" />
                        <div className="absolute top-2 left-2 bg-slate-950/80 border border-slate-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded text-slate-300">
                          Variante #{idx + 1}
                        </div>
                        {selectedVariantIdx === idx && (
                          <div className="absolute inset-0 bg-purple-600/10 flex items-center justify-center">
                            <span className="bg-purple-600 text-black text-[10px] font-bold font-mono px-3 py-1 rounded-full flex items-center gap-1 shadow-lg">
                              <Check className="w-3.5 h-3.5" /> SELECCIONADA
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeStep === 3 && (
              <div className="space-y-4 h-full flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                  <h4 className="text-xs font-bold font-mono text-slate-400 tracking-widest uppercase">Lienzo de Poses Coherentes</h4>
                  {isGeneratingPoses && <span className="text-[10px] font-mono text-purple-400 animate-pulse flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Inyectando consistencia geométrica...</span>}
                </div>

                <div className="flex-1 grid grid-cols-4 gap-4 items-center">
                  {[
                    { key: 'front', label: 'VISTA FRONTAL (DOWN)' },
                    { key: 'right', label: 'PERFIL DERECHO (RIGHT)' },
                    { key: 'left', label: 'PERFIL IZQUIERDO (LEFT)' },
                    { key: 'back', label: 'VISTA TRASERA (UP)' }
                  ].map((pose) => (
                    <div
                      key={pose.key}
                      className="aspect-[3/4] bg-slate-900 border border-slate-850 rounded-xl flex flex-col justify-between overflow-hidden relative"
                    >
                      <div className="bg-slate-950 p-2 border-b border-slate-850 text-[9px] font-mono text-slate-400 font-bold uppercase tracking-wider truncate">
                        {pose.label}
                      </div>

                      <div className="flex-1 flex items-center justify-center bg-black relative">
                        {directionalPoses[pose.key as keyof typeof directionalPoses] ? (
                          <img
                            src={directionalPoses[pose.key as keyof typeof directionalPoses]!}
                            alt={pose.label}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-center p-3 space-y-2">
                            <Loader2 className="w-6 h-6 text-purple-500 animate-spin mx-auto" />
                            <p className="text-[8px] font-mono text-slate-600 uppercase tracking-widest">Generando...</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeStep === 4 && (
              <div className="space-y-4 h-full flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                  <h4 className="text-xs font-bold font-mono text-slate-400 tracking-widest uppercase">
                    {selectedType === 'Walk Cycle' ? 'Video Walk Cycle Generado' : 'Video de Animación Generado'}
                  </h4>
                </div>

                <div className="flex-1 aspect-video bg-black border border-slate-850 rounded-xl overflow-hidden relative flex items-center justify-center">
                  {videoLoading ? (
                    <div className="text-center space-y-3">
                      <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
                      <p className="text-xs text-blue-400 font-mono uppercase tracking-widest animate-pulse">
                        {selectedType === 'Walk Cycle' ? 'Tejiendo Frames de Caminata...' : 'Tejiendo Frames de Animación...'}
                      </p>
                    </div>
                  ) : videoUrl ? (
                    videoUrl.startsWith('data:image/') || videoUrl.includes('.gif') || videoUrl.includes('format=image/gif') ? (
                      <img
                        src={videoUrl}
                        className="w-full h-full object-contain"
                        alt="Animation Loop"
                      />
                    ) : (
                      <video
                        src={videoUrl}
                        className="w-full h-full object-contain"
                        autoPlay
                        loop
                        muted
                        playsInline
                      />
                    )
                  ) : (
                    <div className="text-center text-slate-700 space-y-2">
                      <Video className="w-16 h-16 mx-auto opacity-20" />
                      <p className="text-xs font-mono uppercase tracking-wider">Esperando Generación de Video...</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeStep === 5 && (
              <div className="space-y-4 h-full flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                  <h4 className="text-xs font-bold font-mono text-slate-400 tracking-widest uppercase">Bóveda de Rebanado</h4>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-mono text-slate-500 uppercase">Extracción: {extractedFrames.length} Frames</span>
                    {isProcessingDefringe && <span className="text-[9px] font-mono text-indigo-400 animate-pulse flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Rust Defringe...</span>}
                  </div>
                </div>

                {isExtractingFrames ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                    <p className="text-xs text-indigo-300 font-mono uppercase tracking-widest animate-pulse">Extrayendo cuadros de animación...</p>
                  </div>
                ) : extractedFrames.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-700 text-center space-y-3">
                    <Scissors className="w-16 h-16 opacity-20" />
                    <p className="text-xs font-mono uppercase">Haga clic en "Rebanar Sprite" a la izquierda para extraer los frames.</p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0">
                    {/* Left side: Interactive preview play loop */}
                    <div className="w-64 bg-slate-900 border border-slate-850 rounded-xl p-4 flex flex-col justify-between shrink-0">
                      <div className="aspect-square bg-slate-950 rounded-lg overflow-hidden border border-slate-800 relative flex items-center justify-center p-4">
                        <img
                          src={extractedFrames[currentFrameIdx]}
                          alt="Anim Frame"
                          className="w-full h-full object-contain"
                          style={{ imageRendering: selectedStyle.includes('Pixel') ? 'pixelated' : 'auto' }}
                        />
                        <div className="absolute bottom-2 right-2 bg-slate-950/80 border border-slate-800 text-[8px] font-mono px-2 py-0.5 rounded text-slate-500">
                          Frame: {currentFrameIdx + 1}/{extractedFrames.length}
                        </div>
                      </div>

                      <div className="space-y-3 mt-4">
                        <div className="flex items-center justify-between w-full">
                          <Tooltip id="animVideoControls" inline showTooltips={showTooltips} className="flex-1">
                            <button
                              onClick={() => setIsPlaying(!isPlaying)}
                              className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-black font-bold font-mono rounded text-[10px] flex items-center justify-center gap-1.5 transition-colors"
                            >
                              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                              {isPlaying ? 'PAUSAR' : 'REPRODUCIR'}
                            </button>
                          </Tooltip>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-950 pt-2 text-[9px] font-mono">
                          <span className="text-slate-500 uppercase">Velocidad:</span>
                          <Tooltip id="animSpriteFps" inline showTooltips={showTooltips}>
                            <select
                              value={spriteSpeed}
                              onChange={(e) => setSpriteSpeed(Number(e.target.value))}
                              className="bg-slate-950 text-slate-300 border border-slate-800 rounded px-1 outline-none text-[9px] font-bold"
                            >
                              <option value={200}>5 FPS</option>
                              <option value={100}>10 FPS</option>
                              <option value={83}>12 FPS</option>
                              <option value={41}>24 FPS</option>
                            </select>
                          </Tooltip>
                        </div>

                        {isDefringed && (
                          <div className="bg-indigo-950/20 border border-indigo-500/20 p-2 rounded text-[8px] font-mono text-indigo-400 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                            Halos eliminados con éxito en Rust.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right side: Frames interactive grid list */}
                    <div className="flex-1 flex flex-col justify-between min-h-0 bg-slate-900 border border-slate-850 rounded-xl p-4 overflow-hidden">
                      <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-2 pr-1 scrollbar-thin scrollbar-thumb-slate-950">
                        {extractedFrames.map((frame, idx) => (
                          <div
                            key={idx}
                            className={`aspect-square bg-slate-950 border rounded-lg overflow-hidden relative group flex items-center justify-center p-1 transition-all ${
                              currentFrameIdx === idx ? 'border-indigo-500/60 shadow-lg' : 'border-slate-800/80'
                            }`}
                          >
                            <img
                              src={frame}
                              alt={`Frame ${idx}`}
                              className="w-full h-full object-contain"
                              style={{ imageRendering: selectedStyle.includes('Pixel') ? 'pixelated' : 'auto' }}
                            />
                            
                            <div className="absolute top-1 left-1 text-[8px] font-mono text-slate-600 bg-slate-950/90 px-1 py-0.2 rounded">
                              #{idx + 1}
                            </div>

                            <button
                              onClick={() => {
                                const copy = [...extractedFrames];
                                copy.splice(idx, 1);
                                setExtractedFrames(copy);
                                if (currentFrameIdx >= copy.length) setCurrentFrameIdx(0);
                              }}
                              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 bg-slate-950/80 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-all"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvancedAnimationStudio;
