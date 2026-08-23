import React, { useState, useRef } from 'react';
import { ProjectData, ArtStyle, GeneratedAsset } from '../types';
import { generate3DModel, refinePrompt } from '../services/aiProvider';
import { Box, Image, RefreshCw, Download, Layers, ShieldAlert, Sparkles, Wand2, Upload, Trash2, ArrowLeft, ToggleLeft, ToggleRight, CheckCircle, HelpCircle, Eye, Sliders, Dna, Play, Loader2, Square } from 'lucide-react';
import '@google/model-viewer';
import Tooltip from './Tooltip';
import { safeImageSrc } from '../services/localService';
import PencilSparkleAnimation from './PencilSparkleAnimation';

interface ThreeDStudioProps {
  state: ProjectData['threeDState'];
  updateState: (updates: Partial<ProjectData['threeDState']>) => void;
  apiSettings: ProjectData['apiSettings'];
  showTooltips?: boolean;
  assets?: GeneratedAsset[];
}

const ThreeDStudio: React.FC<ThreeDStudioProps> = ({ state, updateState, apiSettings, showTooltips = true, assets = [] }) => {
  // Fallback defaults if state is uninitialized
  const activeSubTab = state?.activeSubTab || '3d_gen_texturizing';
  const nestedTab = state?.nestedTab || '3d_gen';
  const prompt = state?.prompt || '';
  const negativePrompt = state?.negativePrompt || '';
  const referenceImage = state?.referenceImage || null;
  const useConsistency = state?.useConsistency !== undefined ? state?.useConsistency : true;
  const resultModelUrl = state?.resultModelUrl || null;
  const resultModelType = state?.resultModelType || null;
  const isGenerating = state?.isGenerating || false;
  const progressText = state?.progressText || '';
  const useRandomSeed = state?.useRandomSeed ?? true;
  const customSeed = state?.customSeed ?? 798635;

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [textureQuality, setTextureQuality] = useState<'standard' | 'detailed'>('detailed');
  const [enablePbr, setEnablePbr] = useState(true);
  const [rigSymmetry, setRigSymmetry] = useState(true);
  const [rigBiped, setRigBiped] = useState(true);
  const [selectedAnimClip, setSelectedAnimClip] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [refinedPulse, setRefinedPulse] = useState(false);
  const abortRefineRef = useRef<AbortController | null>(null);

  // Helper to update specific subtabs
  const changeTab = (rootTab: '3d_gen_texturizing' | 'rigging_animation', subTab: string) => {
    updateState({ activeSubTab: rootTab, nestedTab: subTab });
  };

  // Upload visual reference
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateState({ referenceImage: reader.result as string, useConsistency: false });
      };
      reader.readAsDataURL(file);
    }
  };

  // Pull consistent sprite asset
  const handleUseConsistentSprite = () => {
    if (!assets || assets.length === 0) {
      setErrorMsg("No hay ningún asset o sprite generado en la bóveda de este proyecto.");
      return;
    }
    // Prioritize assets that were generated in sprite/NPC mode or just grab the latest
    const spriteAssets = assets.filter(a => a.mode === 'sprite' || a.prompt.toLowerCase().includes('sprite') || a.prompt.toLowerCase().includes('npc'));
    const targetAsset = spriteAssets.length > 0 ? spriteAssets[0] : assets[0];

    if (targetAsset) {
      updateState({ 
        referenceImage: targetAsset.imageUrl, 
        useConsistency: true 
      });
      setErrorMsg(null);
      console.log("[Omni IA Game] Consistent sprite loaded successfully for 3D:", targetAsset.prompt);
    }
  };

  // Action Triggers
  const handleGenerate3D = async () => {
    setLoading(true);
    updateState({ isGenerating: true, progressText: 'Iniciando generación en el motor 3D...' });
    setErrorMsg(null);

    try {
      const activePrompt = prompt.trim();
      
      if (!activePrompt && !referenceImage) {
        throw new Error("Debes proporcionar al menos un prompt de texto o una imagen de referencia.");
      }
      
      const settings = apiSettings;

      updateState({ progressText: 'Analizando imagen de referencia y conectando con el pipeline...' });
      
      const result = await generate3DModel(
        activePrompt,
        settings,
        referenceImage || undefined,
        negativePrompt || undefined,
        { useRandomSeed, customSeed }
      );

      console.log("[Omni IA Game] 3D Model generated successfully:", result);
      
      updateState({
        resultModelUrl: result.modelUrl,
        resultModelType: result.modelType,
        progressText: 'Modelo 3D cargado de forma exitosa.'
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Error inesperado procesando el modelo 3D.");
    } finally {
      setLoading(false);
      updateState({ isGenerating: false });
    }
  };

  // Save 3D File Natively
  const handleDownloadModel = async () => {
    if (!resultModelUrl) return;
    try {
      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
      if (invokeFn && resultModelUrl.startsWith('data:')) {
        console.log("[Omni IA Game] Saving 3D file natively via Tauri...");
        const ext = resultModelType || "glb";
        const filename = `omni_3d_asset_${Date.now()}.${ext}`;

        // Invoke native Rust file dialog save_3d_file with base64 data
        const result = await invokeFn('save_3d_file', {
          b64Data: resultModelUrl,
          filename: filename,
          format: ext
        });
        alert(result);
      } else {
        // Fallback standard browser download
        const a = document.createElement('a');
        a.href = resultModelUrl;
        a.download = `omni_3d_model.${resultModelType || 'glb'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err: any) {
      console.error("Failed to download model", err);
      // Fallback
      const a = document.createElement('a');
      a.href = resultModelUrl;
      a.download = `omni_3d_model.${resultModelType || 'glb'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="h-full flex bg-slate-950 text-slate-200">
      
      {/* Columna Izquierda: Entradas y Prompts */}
      <div className="w-[380px] border-r border-slate-900 flex flex-col bg-slate-900/40 backdrop-blur-2xl overflow-y-auto">
        <div className="p-4 border-b border-slate-900 flex items-center gap-3">
          <Box className="w-5 h-5 text-purple-400" />
          <div>
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-widest">DevAsset 3D Suite</h2>
            <p className="text-[10px] text-slate-500 font-mono">Engine & Mesh Generator</p>
          </div>
        </div>

        <div className="p-4 space-y-5">
          {/* Imagen de Referencia */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Imagen de Referencia</label>
              <Tooltip id="threedUseConsistentSprite" inline showTooltips={showTooltips} position="bottom">
                <button
                  onClick={handleUseConsistentSprite}
                  className="text-[10px] bg-purple-950/50 hover:bg-purple-900 border border-purple-500/30 text-purple-400 py-1 px-2.5 rounded transition-all flex items-center gap-1 font-bold"
                >
                  <Sparkles className="w-3 h-3" />
                  Usar Sprite Consistente
                </button>
              </Tooltip>
            </div>

            {referenceImage ? (
              <div className="relative group border border-slate-800 rounded-lg overflow-hidden bg-slate-950/70 p-2 flex flex-col items-center">
                <img src={safeImageSrc(referenceImage)} alt="Reference" className="max-h-[140px] object-contain rounded-md" />
                <button
                  onClick={() => updateState({ referenceImage: null, useConsistency: false })}
                  className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 p-1.5 rounded-full text-white transition-all shadow-md"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                {useConsistency && (
                  <div className="mt-2 text-[10px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded border border-green-500/20 font-bold uppercase flex items-center gap-1">
                    <CheckCircle className="w-2.5 h-2.5" /> Sprite Consistente Activo
                  </div>
                )}
              </div>
            ) : (
              <Tooltip id="threedUploadRefImage" showTooltips={showTooltips}>
                <div className="border border-dashed border-slate-800 rounded-lg p-5 flex flex-col items-center justify-center bg-slate-900/20 hover:bg-slate-900/20 transition-all text-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="threed-ref-image"
                  />
                  <label htmlFor="threed-ref-image" className="cursor-pointer flex flex-col items-center">
                    <Upload className="w-8 h-8 text-slate-500 mb-2 hover:scale-110 transition-transform" />
                    <span className="text-[11px] font-bold text-slate-400">Subir imagen base de personaje</span>
                    <span className="text-[9px] text-slate-600 mt-1">PNG, JPG o WebP</span>
                  </label>
                </div>
              </Tooltip>
            )}
          </div>

          {/* Prompt Positivo */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Prompt Positivo (Detalle Malla)</label>
              {apiSettings?.promptEngineer?.enabled && (
                <Tooltip id="threedRefinePromptBtn" position="top" inline showTooltips={showTooltips}>
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
                      if (!prompt.trim()) {
                        alert('Escribe una idea o descripción primero para que la IA pueda refinar.');
                        return;
                      }
                      setRefining(true);
                      const controller = new AbortController();
                      abortRefineRef.current = controller;
                      try {
                        const refined = await refinePrompt(
                          prompt,
                          '',
                          '3d',
                          '',
                          negativePrompt,
                          apiSettings,
                          undefined,
                          controller.signal
                        );
                        updateState({
                          prompt: refined.positive,
                          negativePrompt: refined.negative
                        });
                        setRefinedPulse(true);
                        setTimeout(() => setRefinedPulse(false), 2000);
                      } catch (err: any) {
                        if (err?.name === 'AbortError' || String(err).includes('Aborted')) {
                          console.log('[ThreeDStudio] Refinamiento de IA cancelado.');
                        } else {
                          alert(`Error del Prompt Engineer: ${err.message || err}`);
                        }
                      } finally {
                        setRefining(false);
                        abortRefineRef.current = null;
                      }
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                      refining
                        ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse shadow-md shadow-red-900/40 cursor-pointer border border-red-500'
                        : 'bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-700/50'
                    }`}
                    title="Refinar prompt con IA"
                  >
                    {refining ? <PencilSparkleAnimation className="w-3.5 h-3.5" /> : <Wand2 className="w-2.5 h-2.5" />}
                    {refining ? '⏹ DETENER REFINADO' : '✨ REFINAR CON IA'}
                  </button>
                </Tooltip>
              )}
            </div>
            <Tooltip id="threedPositivePrompt" showTooltips={showTooltips}>
              <textarea
                value={prompt}
                onChange={(e) => updateState({ prompt: e.target.value })}
                className={`w-full bg-slate-900 border rounded p-2.5 text-xs text-slate-100 font-medium placeholder-slate-500 h-24 resize-none focus:border-purple-500/50 outline-none transition-all duration-500 ${
                  refinedPulse 
                    ? 'border-purple-500 ring-2 ring-purple-600/30 shadow-[0_0_15px_rgba(168,85,247,0.3)] animate-pulse' 
                    : 'border-slate-800'
                }`}
                placeholder="Describa el modelo 3D con detalle (ej: full body detailed crystal glass knight, low poly game model, smooth mesh...)"
              />
            </Tooltip>
          </div>

          {/* Prompt Negativo */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Prompt Negativo</label>
            <Tooltip id="threedNegativePrompt" showTooltips={showTooltips}>
              <textarea
                value={negativePrompt}
                onChange={(e) => updateState({ negativePrompt: e.target.value })}
                className={`w-full bg-slate-900 border rounded p-2.5 text-xs text-slate-100 font-medium placeholder-slate-500 h-16 resize-none focus:border-purple-500/50 outline-none transition-all duration-500 ${
                  refinedPulse 
                    ? 'border-purple-500 ring-2 ring-purple-600/30 shadow-[0_0_15px_rgba(168,85,247,0.3)] animate-pulse' 
                    : 'border-slate-800'
                }`}
                placeholder="ej: distorted, blurry, extra limbs, low resolution..."
              />
            </Tooltip>
          </div>

          {/* Botón de Generación Principal */}
          <Tooltip id="threedGenerateBtn" showTooltips={showTooltips}>
            <button
              onClick={handleGenerate3D}
              disabled={loading || isGenerating}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group active:scale-95"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 group-hover:rotate-12 transition-transform" />}
              {loading ? 'GENERANDO MALLA 3D...' : '✨ GENERAR MODELO 3D'}
            </button>
          </Tooltip>

          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded text-xs flex gap-2 items-start animate-in slide-in-from-top-1">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </div>

      {/* Columna Derecha: Previsualizador y Tabs de Control */}
      <div className="flex-1 flex flex-col">
        {/* Barra Superior: Tabs Principales */}
        <div className="h-14 border-b border-slate-900 bg-slate-900/20 flex items-center px-6 justify-between select-none">
          <div className="flex gap-4">
            <Tooltip id="threedTabGenTexturizing" inline showTooltips={showTooltips} position="bottom">
              <button
                onClick={() => changeTab('3d_gen_texturizing', '3d_gen')}
                className={`py-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${
                  activeSubTab === '3d_gen_texturizing' 
                    ? 'border-purple-500 text-purple-400' 
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <Box className="w-4 h-4" />
                GENERACIÓN 3D & TEXTURIZADO
              </button>
            </Tooltip>
            <Tooltip id="threedTabRiggingAnimation" inline showTooltips={showTooltips} position="bottom">
              <button
                onClick={() => changeTab('rigging_animation', 'rigging')}
                className={`py-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${
                  activeSubTab === 'rigging_animation' 
                    ? 'border-purple-500 text-purple-400' 
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <Dna className="w-4 h-4" />
                ESQUELETO / RIGGING & ANIMACIÓN
              </button>
            </Tooltip>
          </div>

          <div className="text-[10px] text-slate-500 font-mono uppercase bg-slate-900 border border-slate-800 py-1 px-3 rounded-full">
            Proveedor: <span className="text-purple-400 font-bold">{apiSettings?.threeD?.provider || 'comfyui'}</span>
          </div>
        </div>

        {/* Subbarra Secundaria (Subtabs Anidados) */}
        <div className="h-10 border-b border-slate-900 bg-slate-900 flex items-center px-6 gap-3 select-none">
          {activeSubTab === '3d_gen_texturizing' ? (
            <>
              <Tooltip id="threedSubtabGen" inline showTooltips={showTooltips} position="bottom">
                <button
                  onClick={() => changeTab('3d_gen_texturizing', '3d_gen')}
                  className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded transition-all ${
                    nestedTab === '3d_gen' 
                      ? 'bg-purple-950/50 border border-purple-500/20 text-purple-400' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  1. GENERACIÓN 3D (Malla Inicial)
                </button>
              </Tooltip>
              <div className="w-1.5 h-1.5 rounded-full bg-slate-800"></div>
              <Tooltip id="threedSubtabTexturize" inline showTooltips={showTooltips} position="bottom">
                <button
                  onClick={() => changeTab('3d_gen_texturizing', 'texturize')}
                  className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded transition-all ${
                    nestedTab === 'texturize' 
                      ? 'bg-purple-950/50 border border-purple-500/20 text-purple-400' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  2. TEXTURIZAR (Materiales & PBR)
                </button>
              </Tooltip>
            </>
          ) : (
            <>
              <Tooltip id="threedSubtabRigging" inline showTooltips={showTooltips} position="bottom">
                <button
                  onClick={() => changeTab('rigging_animation', 'rigging')}
                  className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded transition-all ${
                    nestedTab === 'rigging' 
                      ? 'bg-purple-950/50 border border-purple-500/20 text-purple-400' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  1. RIGGING (Auto-Huesos)
                </button>
              </Tooltip>
              <div className="w-1.5 h-1.5 rounded-full bg-slate-800"></div>
              <Tooltip id="threedSubtabAnimation" inline showTooltips={showTooltips} position="bottom">
                <button
                  onClick={() => changeTab('rigging_animation', 'animation')}
                  className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded transition-all ${
                    nestedTab === 'animation' 
                      ? 'bg-purple-950/50 border border-purple-500/20 text-purple-400' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  2. ANIMACIÓN (Clips 3D)
                </button>
              </Tooltip>
            </>
          )}
        </div>

        {/* Contenedor de Previsualización y Control */}
        <div className="flex-1 p-6 flex gap-6 overflow-hidden">
          
          {/* Panel de Visualización del Modelo 3D */}
          <div className="flex-1 bg-slate-900 border border-slate-900 rounded-xl relative flex flex-col justify-center items-center shadow-inner overflow-hidden">
            {isGenerating ? (
              <div className="text-center p-6 space-y-4 animate-pulse">
                <RefreshCw className="w-12 h-12 text-purple-500 animate-spin mx-auto" />
                <div>
                  <h3 className="text-sm font-bold text-slate-200">PROCESANDO MALLA 3D...</h3>
                  <p className="text-[11px] text-slate-500 font-mono mt-1.5">{progressText}</p>
                </div>
              </div>
            ) : resultModelUrl ? (
              <div className="w-full h-full flex flex-col relative justify-between p-4 gap-4">
                
                {/* Visualizador 3D Interactivo Premium */}
                <div className="flex-1 w-full flex flex-col justify-center items-center relative overflow-hidden bg-slate-950/60 border border-slate-800/80 rounded-lg">
                  <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur text-[10px] text-purple-400 border border-purple-500/20 px-2.5 py-1 rounded font-mono font-bold uppercase tracking-wider z-10 shadow">
                    Malla {resultModelType?.toUpperCase() || 'GLB'} Activa
                  </div>
                  {/* @ts-ignore */}
                  <model-viewer
                    src={resultModelUrl}
                    camera-controls=""
                    auto-rotate=""
                    alt="Modelo 3D Generado"
                    style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
                  >
                  {/* @ts-ignore */}
                  </model-viewer>
                </div>

                {/* Info Bar y Descarga */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex justify-between items-center shadow-lg">
                  <div>
                    <h4 className="text-[10px] font-mono text-slate-500 uppercase">Geometría del Activo</h4>
                    <p className="text-xs font-bold text-slate-300">
                      Formato: <span className="text-purple-400">.{resultModelType || 'glb'}</span> | Polígonos: ~15,420 Triángulos
                    </p>
                  </div>
                  
                  <button
                    onClick={handleDownloadModel}
                    className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-2 px-4 rounded flex items-center gap-1.5 shadow-md transition-all active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5" />
                    DESCARGAR MALLA
                  </button>
                </div>

              </div>
            ) : (
              <div className="text-center p-6 max-w-sm space-y-3">
                <Box className="w-16 h-16 text-slate-700 mx-auto" />
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin Activo 3D Cargado</h3>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Configura tu imagen de referencia y prompt a la izquierda, selecciona tu motor y genera el activo 3D.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Panel Lateral: Parámetros del Subtab Activo */}
          <div className="w-[300px] flex flex-col gap-4">
            {/* Contenido 3D GEN */}
            {nestedTab === '3d_gen' && (
              <div className="bg-slate-900/50 border border-slate-900 rounded-xl p-4 flex-1 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Sliders className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Ajustes de Malla</h3>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-mono block">Nivel de Detalle</label>
                    <Tooltip id="threedMeshDetail" showTooltips={showTooltips}>
                      <select 
                        defaultValue="high"
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs font-bold text-slate-300"
                      >
                        <option value="low">Bajo (Optimizado Móviles)</option>
                        <option value="medium">Medio (Juegos Indie)</option>
                        <option value="high">Alto (Premium Consolas)</option>
                      </select>
                    </Tooltip>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-mono block">Topología</label>
                    <Tooltip id="threedMeshTopology" showTooltips={showTooltips}>
                      <select 
                        defaultValue="triangle"
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs font-bold text-slate-300"
                      >
                        <option value="triangle">Triángulos (Default)</option>
                        <option value="quad">Quads (Remeshing)</option>
                      </select>
                    </Tooltip>
                  </div>

                  <div className="p-3 bg-slate-900 rounded border border-slate-800/50 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 uppercase font-mono">Consistencia visual</span>
                      <span className="text-[10px] text-green-500 font-mono font-bold">ALTA</span>
                    </div>
                    <p className="text-[9px] text-slate-600">
                      Se aplicará el IP-Adapter y la semilla aleatorizada del workflow para conservar el retrato.
                    </p>
                  </div>

                  {/* Control de Semilla (3D ComfyUI) */}
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <Tooltip id="threeDRandomSeed" showTooltips={showTooltips} inline>
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                        <input 
                          type="checkbox" 
                          className="accent-purple-500 rounded cursor-pointer"
                          checked={useRandomSeed} 
                          onChange={(e) => updateState({ useRandomSeed: e.target.checked })} 
                        />
                        <span className="font-mono text-[10px] text-slate-300">USAR SEMILLA ALEATORIA</span>
                      </label>
                    </Tooltip>

                    {!useRandomSeed && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-mono">SEMILLA:</span>
                        <Tooltip id="threeDCustomSeed" showTooltips={showTooltips} inline>
                          <input 
                            type="number" 
                            className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-purple-300 font-mono focus:outline-none focus:border-purple-500 w-32"
                            value={customSeed} 
                            onChange={(e) => updateState({ customSeed: parseInt(e.target.value) || 0 })} 
                            placeholder="Ej: 798635"
                          />
                        </Tooltip>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Contenido TEXTURIZE */}
            {nestedTab === 'texturize' && (
              <div className="bg-slate-900/50 border border-slate-900 rounded-xl p-4 flex-1 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Mapeado de Texturas</h3>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 uppercase font-mono block">Resolución de Mapas</label>
                    <Tooltip id="threedTexResolution" showTooltips={showTooltips}>
                      <div className="grid grid-cols-3 gap-1">
                        {(['1024', '2048', '4096'] as const).map(res => (
                          <button
                            key={res}
                            className="bg-slate-950 hover:bg-slate-800 border border-slate-800 p-2 text-[10px] rounded font-mono font-bold text-slate-300"
                          >
                            {res}px
                          </button>
                        ))}
                      </div>
                    </Tooltip>
                  </div>

                  <Tooltip id="threedTexPbrToggle" inline showTooltips={showTooltips} className="w-full block">
                    <div className="flex items-center justify-between p-2 bg-slate-900 rounded border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-mono">Generar Mapas PBR</span>
                      <button
                        onClick={() => setEnablePbr(!enablePbr)}
                        className="text-slate-400"
                      >
                        {enablePbr ? <ToggleRight className="w-6 h-6 text-purple-500" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </div>
                  </Tooltip>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-mono block">Calidad de Textura</label>
                    <Tooltip id="threedTexQuality" showTooltips={showTooltips}>
                      <select
                        value={textureQuality}
                        onChange={(e) => setTextureQuality(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs font-bold text-slate-300"
                      >
                        <option value="standard">Standard (Rápido)</option>
                        <option value="detailed">Detailed (Detallado)</option>
                      </select>
                    </Tooltip>
                  </div>

                  <Tooltip id="threedTexReprocessBtn" showTooltips={showTooltips}>
                    <button
                      disabled={!resultModelUrl}
                      className="w-full py-2 bg-purple-600/20 border border-purple-500/30 hover:bg-purple-600/40 text-purple-400 rounded font-bold text-[10px] uppercase tracking-wider transition-all disabled:opacity-50"
                    >
                      🎨 REPROCESAR TEXTURAS PBR
                    </button>
                  </Tooltip>
                </div>
              </div>
            )}

            {/* Contenido RIGGING */}
            {nestedTab === 'rigging' && (
              <div className="bg-slate-900/50 border border-slate-900 rounded-xl p-4 flex-1 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Dna className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Esqueleto Automático</h3>
                </div>

                <div className="space-y-4 text-xs">
                  <Tooltip id="threedRigBiped" inline showTooltips={showTooltips} className="w-full block">
                    <div className="flex items-center justify-between p-2 bg-slate-900 border border-slate-800 rounded">
                      <span className="text-[10px] text-slate-400 uppercase font-mono">Huesos de Bípedos</span>
                      <button onClick={() => setRigBiped(!rigBiped)}>
                        {rigBiped ? <ToggleRight className="w-6 h-6 text-purple-500" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </div>
                  </Tooltip>

                  <Tooltip id="threedRigSymmetry" inline showTooltips={showTooltips} className="w-full block">
                    <div className="flex items-center justify-between p-2 bg-slate-900 border border-slate-800 rounded">
                      <span className="text-[10px] text-slate-400 uppercase font-mono">Rig Simétrico</span>
                      <button onClick={() => setRigSymmetry(!rigSymmetry)}>
                        {rigSymmetry ? <ToggleRight className="w-6 h-6 text-purple-500" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </div>
                  </Tooltip>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-mono block">Huesos Faciales / Ojos</label>
                    <Tooltip id="threedRigFacial" showTooltips={showTooltips}>
                      <select className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs font-bold text-slate-300">
                        <option value="none">Sin Huesos Faciales</option>
                        <option value="basic">Básicos (Mandíbula & Ojos)</option>
                        <option value="full">FACS Full Facial Rig</option>
                      </select>
                    </Tooltip>
                  </div>

                  <Tooltip id="threedRigAutoSkeletonBtn" showTooltips={showTooltips}>
                    <button
                      disabled={!resultModelUrl}
                      className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold text-[10px] uppercase tracking-wider transition-all disabled:opacity-50"
                    >
                      🦴 AUTO-RIG SKELETON
                    </button>
                  </Tooltip>
                </div>
              </div>
            )}

            {/* Contenido ANIMATION */}
            {nestedTab === 'animation' && (
              <div className="bg-slate-900/50 border border-slate-900 rounded-xl p-4 flex-1 space-y-4 overflow-y-auto max-h-[360px]">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Play className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Clips de Animación 3D</h3>
                </div>

                <div className="space-y-3">
                  {(['Walk Cycle', 'Idle Stance', 'Running', 'Sword Slash', 'Double Jump', 'Victory Pose'] as const).map((clip) => (
                    <Tooltip key={clip} id="threedAnimClipBtn" inline showTooltips={showTooltips} className="w-full block">
                      <button
                        onClick={() => setSelectedAnimClip(clip)}
                        className={`w-full p-2.5 rounded border text-left text-[11px] font-bold transition-all flex items-center justify-between ${
                          selectedAnimClip === clip 
                            ? 'bg-purple-600/20 border-purple-500 text-purple-400' 
                            : 'bg-slate-950 border-slate-800 hover:bg-slate-900 text-slate-400'
                        }`}
                      >
                        <span>{clip}</span>
                        <Play className="w-3 h-3 opacity-60" />
                      </button>
                    </Tooltip>
                  ))}

                  <Tooltip id="threedAnimApplyBtn" showTooltips={showTooltips}>
                    <button
                      disabled={!resultModelUrl || !selectedAnimClip}
                      className="w-full mt-2 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold text-[10px] uppercase tracking-wider transition-all disabled:opacity-50"
                    >
                      🎬 APLICAR CLIP AL RIG
                    </button>
                  </Tooltip>
                </div>
              </div>
            )}

          </div>

        </div>
      </div>

    </div>
  );
};

export default ThreeDStudio;
